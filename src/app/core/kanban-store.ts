import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { EMPTY_KANBAN, Importance, KanbanBoard, KanbanCard, KanbanState, attachLegacy, boardCategories, boardIdFor, categoryKey, freshBoard, liveCards, mergeKanban, moveBoardCategory, onWall, restoredBoard, sanitizeKanban, setWall } from './kanban';
import { activeOrder, kanbanOnly } from './mural-config';
import { sanitizeTags } from './note-labels';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { onOtherTab, writeJson } from './storage';

/** Os quadros deste navegador (vão embora com "Apagar o save", como as anotações). */
export const KANBAN_KEY = 'meu-mural:kanban:v1';

function read(): KanbanState {
  try {
    return sanitizeKanban(JSON.parse(localStorage.getItem(KANBAN_KEY) ?? 'null'));
  } catch {
    return { ...EMPTY_KANBAN, removed: {}, legacy: [] };
  }
}

/**
 * Onde a próxima anotação nova vai cair: criada de dentro de uma coluna, ou com a etapa escolhida na
 * parte Quadro do editor (que pode trazer também a importância e o status).
 */
export interface KanbanSpot {
  board: string;
  column: string;
  importance?: Importance | null;
  status?: string;
  /** As dependências escolhidas no editor (ver `KanbanCard.deps`). */
  deps?: string[];
  /** Também no mural, ou só no Kanban, escolhido no editor (sem o campo: o do grupo; ver `KanbanCard.wall`). */
  wall?: boolean;
}

/**
 * Os quadros Kanban das anotações, um por categoria (ver core/kanban.ts): guardados neste navegador
 * e, com conta, no mural privado da nuvem (`kanban`, juntado quadro a quadro, ver core/cloud-sync.ts).
 * Nunca no mural público: o quadro é só seu, mesmo com as anotações públicas.
 *
 * O quadro de uma categoria em que ninguém mexeu não é guardado (`boardFor` devolve o de sempre); a
 * primeira mudança grava. Os quadros de antes (sem categoria) são convertidos assim que aparecem: ao
 * abrir o site e quando chegam da nuvem (ver `attachLegacy`), e as características deles viram tags
 * das anotações, com a cor da fita.
 */
@Injectable({ providedIn: 'root' })
export class KanbanStore {
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);

  readonly state = signal<KanbanState>(read());
  readonly boards = computed(() => this.state().boards);
  /** Quando os quadros mudaram aqui (para a sincronização enviar). */
  readonly changedAt = signal(0);
  /**
   * Uma anotação nova pedida de dentro de uma coluna ("Nova nota"): ao ser salva, ela cai lá (ver
   * `claim`). Fechar o editor sem salvar esquece.
   */
  readonly pending = signal<KanbanSpot | null>(null);
  /** O quadro aberto na página do Kanban (null fora dela): o botão Nova do topo escreve nele. */
  readonly openBoard = signal<string | null>(null);
  /** O quadro de cada categoria em que ninguém mexeu, pelo id (para `update` achar a categoria). */
  private readonly fresh = new Map<string, KanbanBoard>();
  /** As categorias das anotações, cada uma com o seu quadro, na ordem das abas do mural. */
  readonly categories = computed(() => boardCategories(this.store.notes(), activeOrder(this.settings.notesConfig())));

  /** As anotações pelo id (para ver quais do quadro ainda são da categoria dele). */
  readonly notesById = computed(() => new Map(this.store.notes().map((r) => [r.id, r])));

  /**
   * As anotações que estão só no Kanban, fora do mural (pelo id): as que estão no quadro do grupo delas
   * e, pela escolha delas ou do grupo, não aparecem no mural (ver `onWall`). Saindo do quadro (ou do
   * grupo), voltam ao mural.
   */
  readonly boardOnly = computed<ReadonlySet<string>>(() => {
    const out = new Set<string>();
    const cfg = this.settings.notesConfig();
    const byId = this.notesById();
    for (const b of this.boards()) {
      const only = kanbanOnly(cfg, b.category);
      for (const c of liveCards(b, byId)) if (!onWall(c, only)) out.add(c.note);
    }
    return out;
  });

  /** As anotações do quadro deste grupo ficam só no Kanban (a escolha do grupo)? */
  groupKanbanOnly(category: string | null | undefined): boolean {
    return !!category?.trim() && kanbanOnly(this.settings.notesConfig(), category);
  }

  /**
   * A anotação aparece também no mural (`true`) ou só no Kanban (`false`). Igual à escolha do grupo,
   * volta a seguir o grupo (e passa a mudar com ele).
   */
  setOnWall(note: string, wall: boolean): void {
    const at = this.cardOf(note);
    if (!at) return;
    const category = this.notesById().get(note)?.category;
    const value = wall === !this.groupKanbanOnly(category) ? undefined : wall;
    this.update(at.board.id, (b, when) => setWall(b, note, value, when));
  }

  /** A anotação do quadro aparece no mural (a escolha dela, ou a do grupo)? */
  isOnWall(card: Pick<KanbanCard, 'wall'>, category: string | null | undefined): boolean {
    return onWall(card, this.groupKanbanOnly(category));
  }

  /** As anotações do quadro que estão nele de verdade (existem e são da categoria dele). */
  live(board: KanbanBoard): KanbanCard[] {
    return liveCards(board, this.notesById());
  }

  /** O nome da categoria de um quadro (a grafia mais usada), ou null se ela não tem mais anotação. */
  labelOf(board: Pick<KanbanBoard, 'category'>): string | null {
    return this.categories().find((c) => c.key === board.category)?.label ?? null;
  }

  constructor() {
    effect(() => {
      const data = this.state();
      writeJson(KANBAN_KEY, data);
    });
    // outra aba mexeu nos quadros: esta acompanha (senão gravaria por cima, e a sincronização mandaria
    // de volta os quadros de antes)
    inject(DestroyRef).onDestroy(onOtherTab(KANBAN_KEY, () => this.state.set(read())));
    // os quadros de antes, assim que existem (ao abrir, ou vindos da nuvem)
    effect(() => {
      if (this.state().legacy.length) untracked(() => this.attachLegacy());
    });
  }

  /** O quadro guardado, pelo id. */
  get(id: string): KanbanBoard | undefined {
    return this.boards().find((b) => b.id === id) ?? this.fresh.get(id);
  }

  /** O quadro da categoria: o guardado, ou o de sempre (sem gravar nada). */
  boardFor(category: string): KanbanBoard {
    const key = categoryKey(category);
    const id = boardIdFor(key);
    const stored = this.boards().find((b) => b.id === id);
    if (stored) return stored;
    let f = this.fresh.get(id);
    if (!f) this.fresh.set(id, (f = freshBoard(key)));
    return f;
  }

  /**
   * O lugar da anotação no quadro do grupo dela (o quadro e a anotação nele), ou null: sem grupo, fora
   * do quadro, ou apagada.
   */
  cardOf(note: string): { board: KanbanBoard; card: KanbanCard } | null {
    const category = this.notesById().get(note)?.category;
    if (!category?.trim()) return null;
    const board = this.boardFor(category);
    const card = board.cards.find((c) => c.note === note);
    return card ? { board, card } : null;
  }

  /** Troca um quadro pelo resultado de `change` (as funções de core/kanban.ts). O de sempre passa a ser guardado. */
  update(id: string, change: (b: KanbanBoard, at: string) => KanbanBoard): void {
    const at = new Date().toISOString();
    const st = this.state();
    const i = st.boards.findIndex((b) => b.id === id);
    const before = i >= 0 ? st.boards[i] : this.fresh.get(id);
    if (!before) return;
    const next = change(before, at);
    if (next === before) return;
    const boards = [...st.boards];
    if (i >= 0) boards[i] = next;
    else boards.push(next);
    this.state.set({ ...st, boards });
    this.changedAt.set(Date.now());
  }

  /** A categoria mudou de nome ou foi apagada (as chaves; ver `moveBoardCategory`): o quadro acompanha. */
  moveCategory(from: string, to: string | null): void {
    const next = moveBoardCategory(this.state(), from, to, new Date().toISOString());
    if (next === this.state()) return;
    this.state.set(next);
    this.changedAt.set(Date.now());
  }

  /**
   * Desfazer: o quadro volta como era, e mais novo que a mudança desfeita. As anotações vestidas pelo
   * card padrão vestem ou despem de novo conforme a coluna em que voltam (ver `restoredBoard`).
   */
  restore(board: KanbanBoard): void {
    this.update(board.id, (now, at) => ({ ...restoredBoard(board, now, at), at }));
  }

  /**
   * Os quadros que vieram de outro aparelho, juntados aos daqui (os de antes são convertidos em seguida).
   * `base`: os quadros na última sincronização, só para levar o quadro de antes de uma categoria
   * renomeada para o novo (a junção por partes de um quadro mexido dos dois lados já foi feita, ver
   * `planBoards`).
   */
  merge(remote: KanbanState, base: KanbanState | null = null): void {
    const next = mergeKanban(this.state(), remote, base, false);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }

  /**
   * A anotação nova acabou de ser salva: se ela foi pedida de uma coluna, devolve onde ela cai (uma vez
   * só). Ela cai no quadro da categoria dela: se a categoria mudou no editor, na primeira coluna do
   * quadro da categoria nova; sem categoria, em nenhum.
   */
  claim(category: string | undefined): KanbanSpot | null {
    const spot = this.pending();
    this.pending.set(null);
    if (!spot || !category?.trim()) return null;
    const board = this.boardFor(category);
    if (board.id === spot.board && board.columns.some((c) => c.id === spot.column)) return spot;
    const { board: _b, column: _c, ...rest } = spot;
    return { board: board.id, column: board.columns[0].id, ...rest };
  }

  /** Converte os quadros de antes (ver `attachLegacy`): as anotações vão para os quadros das categorias delas. */
  private attachLegacy(): void {
    const at = new Date().toISOString();
    const { state, tags, colors, colorsAt } = attachLegacy(this.state(), this.store.notes(), at);
    for (const [id, names] of tags) {
      const r = this.store.get(id);
      if (!r) continue;
      const next = sanitizeTags([...(r.tags ?? []), ...names]);
      if (next.length === (r.tags ?? []).length) continue;
      // logo depois da versão daqui, não agora: no aparelho que ficou fechado desde antes dos quadros por
      // categoria, a versão escrita depois em outro aparelho vale mais que esta com as tags (e, na
      // compartilhada, o lugar dela no mural, com o grupo, também)
      this.store.update({ ...r, tags: next, updatedAt: new Date(Date.parse(r.updatedAt) + 1).toISOString() });
    }
    const paint = new Map([...colors].filter(([tag]) => !this.settings.tagColor(tag)));
    // com a hora em que as cores foram escolhidas, não a de agora: os jeitos dos grupos vão juntos para
    // a nuvem, e o mapa daqui, marcado como recém-mudado, passaria por cima do escolhido em outro aparelho
    // (sem ficar mais velho que o que já estava aqui)
    const looksAt = this.settings.categoryLooksAt();
    if (paint.size) this.settings.setTagColors(paint, undefined, colorsAt > looksAt ? colorsAt : looksAt);
    this.state.set(state);
    this.changedAt.set(Date.now());
  }
}
