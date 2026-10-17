import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { toSignal } from '@angular/core/rxjs-interop';
import { ActivatedRoute, Router, RouterLink } from '@angular/router';
import { ArrowDownWideNarrow, CheckCheck, ChevronLeft, ChevronRight, Columns3, FilePlus, List, LucideAngularModule, Pencil, Plus, Rows2, Search, Settings, X } from 'lucide-angular';
import { map } from 'rxjs';
import { kanbanPath } from '../core/areas';
import { CategoryLook, categoryColorHex } from '../core/category-looks';
import { Desk } from '../core/desk';
import { KanbanBoard, KanbanCard, KanbanColumn, MAX_COLUMNS, addColumn, belongs, boardIdFor, cardsIn, defaultColumns, resetBoard } from '../core/kanban';
import { KanbanActions } from '../core/kanban-actions';
import { sortCards, sortComparator, sortSentence, sortShort, tieRange } from '../core/kanban-sort';
import { KanbanStore } from '../core/kanban-store';
import { NOTES } from '../core/kinds';
import { Review, fold } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings as SettingsStore } from '../core/settings';
import { NO_TAG_OUTS, TagOuts, excludeTag, hiddenByTags, outByDefault, outTags, releaseTag, showAllTags } from '../core/tag-filter';
import { CardPicker } from '../ui/card-picker';
import { CategoryLabel } from '../ui/category-label';
import { KanbanBoardSheet } from '../ui/kanban-board-sheet';
import { KanbanCardSheet } from '../ui/kanban-card-sheet';
import { KanbanColumnSheet } from '../ui/kanban-column-sheet';
import { COLUMN_ICON } from '../ui/kanban-icons';
import { KanbanNote } from '../ui/kanban-note';
import { NoteSelection } from '../ui/note-selection';
import { Pin } from '../ui/pin';
import { SearchStrip } from '../ui/search-strip';
import { TagChip, TagChips } from '../ui/tag-chips';
import { Toasts } from '../ui/toast';

/** O último quadro aberto, para `/anotacoes/kanban` sem quadro abrir nele. */
const LAST_KEY = 'meu-mural:kanban-aberto:v1';
/** Os quadros vistos só pelos títulos neste aparelho (os ids); os outros, nas fichas. */
const DENSE_KEY = 'meu-mural:kanban-titulos:v1';

function readDense(): string[] {
  try {
    const raw: unknown = JSON.parse(localStorage.getItem(DENSE_KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((id): id is string => typeof id === 'string') : [];
  } catch {
    return [];
  }
}

/** Quanto o ponteiro anda antes de virar arrastar (o mouse); o dedo segura `HOLD` ms parado. */
const SLOP = 6;
const HOLD = 280;
const TOUCH_SLOP = 10;
/** A faixa perto da beirada onde o quadro (ou a página) rola sozinho enquanto se arrasta. */
const EDGE = 70;

/** Uma anotação numa coluna, como aparece: a ficha, o lugar no quadro e se é a que está sendo arrastada. */
interface Item {
  card: KanbanCard;
  note: Review;
  dragged: boolean;
}

interface ColumnView {
  col: KanbanBoard['columns'][number];
  items: Item[];
  /** Quantas anotações a coluna tem de verdade (com o filtro, mostra menos). */
  total: number;
}

/** O arrastar em andamento: qual anotação, de onde, e onde ela cairia agora. */
interface Drag {
  note: string;
  from: string;
  over: string;
  /** A posição entre as anotações à mostra da coluna `over`. */
  index: number;
  /** A posição de onde ela saiu, entre as à mostra da coluna `from` (soltar ali não muda nada). */
  start: number;
  /** A altura da ficha (ou de todas as que vão juntas), para a vaga do mesmo tamanho. */
  height: number;
  /**
   * Arrastando uma das marcadas com o Ctrl (ver ui/note-selection.ts): todas as marcadas, na ordem do
   * quadro, que saem das colunas e caem juntas. Vazio, só `note`.
   */
  group: readonly string[];
}

/**
 * O que passa das beiradas do quadro: `start`/`end` ligam o degradê daquele lado (há o que rolar
 * para lá), e `before`/`after` contam as colunas que não estão inteiras à vista daquele lado (as setas).
 */
interface Edges {
  start: boolean;
  end: boolean;
  before: number;
  after: number;
}
const NO_EDGES: Edges = { start: false, end: false, before: 0, after: 0 };

/** Uma aba de quadro: a categoria, o id do quadro dela, quantas anotações ele tem e a cor da orelha. */
interface BoardTab {
  id: string;
  key: string;
  label: string;
  n: number;
  color: string | null;
  look: CategoryLook;
}

/**
 * Kanban (`/anotacoes/kanban/:quadro`): um quadro por categoria das anotações, com colunas de etapas
 * e, nelas, as anotações daquela categoria, na ficha simples (ver core/kanban.ts). As abas dos
 * quadros são as próprias categorias, com o ícone e a cor delas, como as abas do mural. Cada coluna
 * é uma tira de papel pardo na parede, com o cabeçalho dela no alto (ícone,
 * nome, quantas, e o lápis dos ajustes); as anotações ficam pregadas nela, com as tags delas na
 * ficha e a importância colada na beirada.
 *
 * Arrastar: com o mouse, depois de andar uns pixels; com o dedo, segurando um pouco parado (antes
 * disso, o dedo rola a tela). Uma cópia da ficha vai junto com o ponteiro e, no lugar onde ela cairia,
 * fica a vaga tracejada. Esc cancela. No teclado, Shift e as setas levam a anotação focada para a
 * coluna do lado ou para cima e para baixo. Quem finaliza é `KanbanActions`.
 */
@Component({
  selector: 'app-kanban-page',
  imports: [CardPicker, CategoryLabel, KanbanBoardSheet, KanbanCardSheet, KanbanColumnSheet, KanbanNote, LucideAngularModule, Pin, RouterLink, SearchStrip, TagChips],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './kanban-page.html',
  styleUrl: './kanban-page.scss',
})
export class KanbanPage {
  protected readonly PlusIcon = Plus;
  protected readonly SettingsIcon = Settings;
  protected readonly PencilIcon = Pencil;
  protected readonly DoneIcon = CheckCheck;
  protected readonly SearchIcon = Search;
  protected readonly NewNoteIcon = FilePlus;
  protected readonly CloseIcon = X;
  protected readonly ColumnIcon = Columns3;
  protected readonly CardsIcon = Rows2;
  protected readonly TitlesIcon = List;
  protected readonly SortIcon = ArrowDownWideNarrow;
  protected readonly BackIcon = ChevronLeft;
  protected readonly NextIcon = ChevronRight;
  protected readonly sortShort = sortShort;
  protected readonly sortSentence = sortSentence;
  protected readonly iconOf = COLUMN_ICON;
  protected readonly maxColumns = MAX_COLUMNS;
  protected readonly notesKind = NOTES;
  protected readonly firstColumns = defaultColumns();

  private readonly kanban = inject(KanbanStore);
  private readonly actions = inject(KanbanActions);
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(SettingsStore);
  private readonly desk = inject(Desk);
  private readonly toasts = inject(Toasts);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly quadro = viewChild<ElementRef<HTMLElement>>('quadro');

  /** As categorias das anotações: cada uma é um quadro. */
  protected readonly categories = this.kanban.categories;
  private readonly param = toSignal(inject(ActivatedRoute).paramMap.pipe(map((p) => p.get('quadro'))), { initialValue: null });
  /** A categoria do quadro aberto (a do endereço; sem ela, ou uma que sumiu, a página leva ao último ou ao primeiro). */
  protected readonly category = computed(() => this.categories().find((c) => boardIdFor(c.key) === this.param()) ?? null);
  /** O quadro aberto: o guardado da categoria, ou o de sempre (que só é guardado quando alguém mexe). */
  protected readonly board = computed<KanbanBoard | null>(() => {
    const c = this.category();
    return c ? this.kanban.boardFor(c.key) : null;
  });

  /** As abas: uma por categoria, com o ícone e a cor dela e quantas anotações o quadro tem. */
  protected readonly tabs = computed<BoardTab[]>(() => {
    const looks = this.settings.categoryLooks();
    return this.categories().map((c) => {
      const id = boardIdFor(c.key);
      const stored = this.kanban.boards().find((b) => b.id === id);
      const look = looks[c.key] ?? {};
      return { id, key: c.key, label: c.label, n: stored ? this.kanban.live(stored).length : 0, color: categoryColorHex(look.color), look };
    });
  });

  protected readonly query = signal('');
  /** As tags ligadas no filtro (sem acento nem caixa): mostra as anotações com qualquer uma delas. */
  protected readonly tagFilter = signal<readonly string[]>([]);
  /**
   * As tags escondidas nesta visita (o clique direito no filtro) e as que o padrão esconde e a pessoa
   * mostrou de novo (ver core/tag-filter.ts). Trocar de quadro volta ao padrão.
   */
  protected readonly tagOuts = signal<TagOuts>(NO_TAG_OUTS);
  /** A anotação fica fora do quadro por uma tag escondida (no filtro, ou pelo padrão das configurações)? */
  private readonly outByTags = computed(() => {
    const outs = this.tagOuts();
    const defaults = this.settings.hiddenTagKeys();
    return (r: Review) => hiddenByTags(r, outs, defaults);
  });
  protected readonly adding = signal<string | null>(null);
  protected readonly picking = signal(false);
  private pickColumn: string | null = null;
  protected readonly cardSheet = signal<string | null>(null);
  protected readonly columnSheet = signal<{ id: string; fresh: boolean } | null>(null);
  protected readonly boardSheet = signal<string | null>(null);
  protected readonly drag = signal<Drag | null>(null);
  /** O que o leitor de tela ouve depois de mover pelo teclado. */
  protected readonly said = signal('');

  /** Os quadros vistos só pelos títulos (ver `setDense`). */
  private readonly denseBoards = signal<readonly string[]>(readDense());
  /** O quadro aberto na vista "Só os títulos": a tira com o nome e a importância, no lugar da ficha. */
  protected readonly dense = computed(() => {
    const b = this.board();
    return !!b && this.denseBoards().includes(b.id);
  });

  protected readonly filtering = computed(() => !!this.query().trim() || this.tagFilter().length > 0 || this.tagHidden() > 0);

  /**
   * As anotações do quadro que estão nele de verdade: existem e ainda são da categoria dele (uma
   * apagada, ou levada para outra categoria, some do quadro, sem apagar o lugar dela).
   */
  private readonly notes = computed(() => {
    const out = new Map<string, Review>();
    const b = this.board();
    if (!b) return out;
    for (const r of this.store.notes()) if (belongs(b, r)) out.set(r.id, r);
    return out;
  });
  /** As cartas do quadro com anotação à mostra. */
  private readonly live = computed(() => this.board()?.cards.filter((c) => this.notes().has(c.note)) ?? []);
  protected readonly liveCount = computed(() => this.live().length);
  /** Quantas anotações do quadro (que a busca acharia) as tags escondidas tiram dele. */
  private readonly tagHidden = computed(() => {
    const q = fold(this.query().trim());
    const out = this.outByTags();
    return this.live().filter((c) => {
      const n = this.notes().get(c.note)!;
      return out(n) && (!q || fold(n.game.name).includes(q));
    }).length;
  });

  /**
   * As tags das anotações do quadro para o filtro, como as do mural (ver `TagChips`): a grafia mais
   * usada, as mais usadas no quadro primeiro, e em quantas a busca de agora deixa cada uma.
   */
  protected readonly tagChips = computed<TagChip[]>(() => {
    const q = fold(this.query().trim());
    const on = new Set(this.tagFilter());
    const out = this.outByTags();
    // as escondidas: quantas anotações (que a busca acharia) cada uma tira do quadro
    const hidden = outTags(
      this.live()
        .map((c) => this.notes().get(c.note)!)
        .filter((n) => !q || fold(n.game.name).includes(q)),
      this.tagOuts(),
      this.settings.hiddenTagKeys(),
    );
    const seen = new Map<string, { spell: Map<string, number>; uses: number; n: number }>();
    for (const c of this.live()) {
      const note = this.notes().get(c.note)!;
      const found = (!q || fold(note.game.name).includes(q)) && !out(note);
      for (const k of new Set((note.tags ?? []).map(fold))) {
        const e = seen.get(k) ?? { spell: new Map<string, number>(), uses: 0, n: 0 };
        e.uses++;
        if (found) e.n++;
        seen.set(k, e);
      }
      for (const t of note.tags ?? []) {
        const m = seen.get(fold(t))!.spell;
        m.set(t, (m.get(t) ?? 0) + 1);
      }
    }
    return [...seen]
      .map(([value, e]) => {
        const label = [...e.spell].reduce((a, x) => (x[1] > a[1] ? x : a))[0];
        const h = hidden.get(value);
        return h ? { value, label, n: h.n, on: false, out: true, uses: e.uses } : { value, label, n: e.n, on: on.has(value), uses: e.uses };
      })
      .sort((a, b) => b.uses - a.uses || a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }))
      .map(({ uses: _u, ...chip }) => chip);
  });

  /** O clique numa tag do filtro: liga ou desliga; na riscada, as anotações dela voltam ao quadro. */
  protected toggleTag(value: string): void {
    if (this.tagChips().find((c) => c.value === value)?.out) {
      this.tagOuts.update((o) => releaseTag(o, value, outByDefault(value, this.boardNotes(), this.settings.hiddenTagKeys())));
      return;
    }
    this.tagFilter.update((on) => (on.includes(value) ? on.filter((t) => t !== value) : [...on, value]));
  }

  /** O clique direito: esconde as anotações da tag (sai das ligadas); na riscada, mostra de novo. */
  protected excludeTagChip(value: string): void {
    if (this.tagChips().find((c) => c.value === value)?.out) {
      this.toggleTag(value);
      return;
    }
    this.tagFilter.update((on) => on.filter((t) => t !== value));
    this.tagOuts.update((o) => excludeTag(o, value));
  }

  /** As anotações do quadro (as que estão nele de verdade). */
  private boardNotes(): Review[] {
    return this.live().map((c) => this.notes().get(c.note)!);
  }

  /** As anotações que já estão no quadro: o "Buscar nota" não as mostra. */
  protected readonly onBoard = computed(() => this.live().map((c) => c.note));
  protected readonly pickerEmpty = computed(() => {
    const c = this.category();
    return c && this.liveCount() >= c.notes ? `Todas as anotações de ${c.label} já estão neste quadro.` : 'Nenhuma anotação para mostrar.';
  });

  /** As colunas como aparecem: o filtro aplicado e, arrastando, a anotação no lugar onde cairia. */
  protected readonly view = computed<ColumnView[]>(() => {
    const b = this.board();
    if (!b) return [];
    const notes = this.notes();
    const q = fold(this.query().trim());
    const tags = this.tagFilter();
    const hidden = this.outByTags();
    const d = this.drag();
    // as que estão sendo arrastadas saem das colunas (a vaga, uma só, fica onde cairiam)
    const moving = new Set(d ? [d.note, ...d.group] : []);
    const shows = (c: KanbanCard) => {
      const n = notes.get(c.note);
      if (!n) return false;
      if (moving.has(c.note)) return true;
      return (!q || fold(n.game.name).includes(q)) && (!tags.length || (n.tags ?? []).some((t) => tags.includes(fold(t)))) && !hidden(n);
    };
    const out = b.columns.map((col) => {
      const all = this.ordered(b, col);
      const items = all.filter((c) => shows(c) && !moving.has(c.note)).map((card) => ({ card, note: notes.get(card.note)!, dragged: false }));
      return { col, items, total: all.length };
    });
    if (d) {
      const card = b.cards.find((c) => c.note === d.note);
      const target = out.find((v) => v.col.id === d.over);
      const note = notes.get(d.note);
      if (card && target && note) target.items.splice(Math.min(d.index, target.items.length), 0, { card, note, dragged: true });
    }
    return out;
  });
  /**
   * As anotações de uma coluna (as que estão no quadro de verdade) na ordem em que aparecem: a dos
   * ajustes da coluna (ver core/kanban-sort.ts), ou, à mão, a ordem em que foram arrastadas.
   */
  private ordered(b: KanbanBoard, col: KanbanColumn): KanbanCard[] {
    const notes = this.notes();
    const list = cardsIn(b, col.id).filter((c) => notes.has(c.note));
    return col.sort?.length ? sortCards(list, col.sort, (id) => notes.get(id)) : list;
  }

  protected readonly shownCount = computed(() => this.view().reduce((n, v) => n + v.items.length, 0));

  /**
   * Ctrl+clique marca anotações do quadro para copiar o texto delas, e Ctrl+C copia (ver
   * ui/note-selection.ts). Trocar de quadro, buscar ou filtrar desmarca; mover uma ficha não.
   */
  readonly selection = new NoteSelection({
    host: this.host,
    markable: '.lugar[data-nota]',
    idOf: (el) => el.getAttribute('data-nota'),
    on: () => true,
    drags: true,
    notes: this.notes,
    // (o id, e não o quadro: mexer nas fichas troca o quadro, e não deve desmarcar)
    reset: computed(() => [this.board()?.id, this.query(), this.tagFilter().join(','), this.tagOuts().out.join(','), this.tagOuts().free.join(',')].join('|')),
    layout: this.view,
  });

  constructor() {
    const destroy = inject(DestroyRef);
    // sem quadro no endereço (ou de uma categoria que sumiu): o último aberto, ou o primeiro
    effect(() => {
      const ids = this.categories().map((c) => boardIdFor(c.key));
      const id = this.param();
      if (!ids.length || (id && ids.includes(id))) return;
      untracked(() => {
        let last: string | null = null;
        try {
          last = localStorage.getItem(LAST_KEY);
        } catch {
          /* sem armazenamento: o primeiro */
        }
        const to = ids.find((x) => x === last) ?? ids[0];
        void this.router.navigate([kanbanPath(to)], { replaceUrl: true });
      });
    });
    effect(() => {
      const b = this.board();
      this.kanban.openBoard.set(b?.id ?? null);
      if (!b) return;
      try {
        localStorage.setItem(LAST_KEY, b.id);
      } catch {
        /* fica sem lembrar */
      }
    });
    // trocou de quadro: o filtro e o que estava aberto eram do outro
    effect(() => {
      this.board()?.id;
      untracked(() => {
        this.tagFilter.set([]);
        this.tagOuts.set(NO_TAG_OUTS);
        this.adding.set(null);
      });
    });
    // as beiradas: medidas de novo ao rolar, ao mudar de tamanho e a cada coluna que entra ou sai
    effect((onCleanup) => {
      const q = this.quadro()?.nativeElement;
      if (!q) return;
      const schedule = () => this.scheduleEdges();
      q.addEventListener('scroll', schedule, { passive: true });
      const ro = new ResizeObserver(schedule);
      ro.observe(q);
      onCleanup(() => {
        q.removeEventListener('scroll', schedule);
        ro.disconnect();
      });
    });
    effect(() => {
      this.view();
      this.dense();
      untracked(() => this.scheduleEdges());
    });
    destroy.onDestroy(() => {
      this.kanban.openBoard.set(null);
      this.endDrag();
      cancelAnimationFrame(this.edgeFrame);
    });
  }

  /** Troca a vista do quadro aberto, lembrada neste aparelho (sem os quadros que não existem mais). */
  protected setDense(on: boolean): void {
    const b = this.board();
    if (!b || on === this.dense()) return;
    const alive = new Set(this.categories().map((c) => boardIdFor(c.key)));
    const next = this.denseBoards().filter((id) => id !== b.id && alive.has(id));
    if (on) next.push(b.id);
    this.denseBoards.set(next);
    try {
      localStorage.setItem(DENSE_KEY, JSON.stringify(next));
    } catch {
      /* fica só nesta visita */
    }
  }

  protected pathOf(id: string): string {
    return kanbanPath(id);
  }

  /** Nenhuma categoria ainda: o editor, para a primeira anotação (com a categoria, ela ganha o quadro). */
  protected firstNote(): void {
    this.desk.newReview();
  }

  /** Recomeça o quadro (a folha já perguntou): as três colunas de sempre e nenhuma anotação, com Desfazer. */
  protected resetBoard(id: string): void {
    const b = this.kanban.get(id);
    const label = this.category()?.label ?? '';
    if (!b) return;
    this.kanban.update(id, (board, at) => resetBoard(board, at));
    this.toasts.show(`O quadro de ${label} recomeçou`, { label: 'Desfazer', run: () => this.kanban.restore(b) });
  }

  /** Uma coluna nova no fim, aberta com os ajustes para dar o nome. */
  protected newColumn(): void {
    const b = this.board();
    if (!b) return;
    let id = '';
    this.kanban.update(b.id, (board, at) => {
      const r = addColumn(board, 'Nova coluna', at);
      id = r.id;
      return r.board;
    });
    if (!id) return;
    this.columnSheet.set({ id, fresh: true });
    // a coluna nova aparece no fim do quadro: rola até ela
    requestAnimationFrame(() => this.host.querySelector(`[data-coluna="${id}"]`)?.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: 'smooth' }));
  }

  protected openAdd(column: string): void {
    this.adding.set(column);
    requestAnimationFrame(() => this.host.querySelector<HTMLElement>(`[data-coluna="${column}"] .adicionar-op`)?.focus());
  }

  protected searchNote(column: string): void {
    this.pickColumn = column;
    this.adding.set(null);
    this.picking.set(true);
  }

  protected placePicked(r: Review): void {
    const b = this.board();
    const col = this.pickColumn;
    this.pickColumn = null;
    if (!b || !col) return;
    this.actions.move(b.id, r.id, col);
    this.desk.land(r.id);
  }

  /**
   * Nova nota: o editor abre já na categoria do quadro, e a anotação salva cai no fim desta coluna
   * (ver App.onSaved).
   */
  protected createNote(column: string): void {
    const b = this.board();
    const c = this.category();
    if (!b || !c) return;
    this.adding.set(null);
    this.kanban.pending.set({ board: b.id, column });
    this.desk.newNoteIn(c.label);
  }

  protected read(id: string): void {
    this.desk.openReview(id);
  }

  /** Limpar: sem busca, sem tag ligada e nenhuma escondida nesta visita (nem pelo padrão). */
  protected clearFilters(): void {
    this.query.set('');
    this.tagFilter.set([]);
    this.tagOuts.set(showAllTags(this.boardNotes(), this.settings.hiddenTagKeys()));
  }

  // ===== Teclado: Shift e as setas =====

  protected onKey(e: KeyboardEvent, note: string, column: string): void {
    if (!e.shiftKey || e.altKey || e.ctrlKey || e.metaKey || !e.key.startsWith('Arrow')) return;
    // num campo (o texto de uma tarefa), Shift e as setas selecionam texto
    if ((e.target as HTMLElement).closest('input, textarea, select')) return;
    const b = this.board();
    if (!b) return;
    const cols = b.columns;
    const ci = cols.findIndex((c) => c.id === column);
    const here = cols[ci];
    const n = this.store.get(note)?.game.name ?? 'A anotação';
    if (here?.sort?.length && (e.key === 'ArrowUp' || e.key === 'ArrowDown')) {
      e.preventDefault();
      this.nudgeSorted(b, here, note, n, e.key === 'ArrowUp' ? -1 : 1);
      return;
    }
    const list = cardsIn(b, column);
    const at = list.findIndex((c) => c.note === note);
    let to = column;
    let index: number | undefined = at;
    if (e.key === 'ArrowLeft' || e.key === 'ArrowRight') {
      const next = cols[ci + (e.key === 'ArrowLeft' ? -1 : 1)];
      if (!next) return;
      to = next.id;
      // numa coluna em ordem, ela cai no lugar dela (no fim da ordem à mão, para o empate)
      index = next.sort?.length ? undefined : Math.min(at, cardsIn(b, to).length);
    } else if (e.key === 'ArrowUp') {
      if (at <= 0) return;
      index = at - 1;
    } else if (e.key === 'ArrowDown') {
      if (at >= list.length - 1) return;
      index = at + 1;
    } else return;
    e.preventDefault();
    this.actions.move(b.id, note, to, index);
    this.sayPlace(note, n, to);
    // a ficha foi redesenhada em outro lugar: o foco vai com ela
    requestAnimationFrame(() => this.host.querySelector<HTMLElement>(`[data-nota="${note}"] .hit`)?.focus());
  }

  /**
   * A seta da ficha: leva a anotação para a coluna seguinte (a da direita), no fim dela (ou no lugar
   * da ordem, se a coluna tem ordem), finalizando se a coluna pede. A ficha pisca o marca-texto onde
   * chegou e o quadro rola até ela; o foco vai para a seta dela lá, para avançar de novo.
   */
  protected advance(note: string, column: string): void {
    const b = this.board();
    if (!b) return;
    const next = b.columns[b.columns.findIndex((c) => c.id === column) + 1];
    if (!next) return;
    this.actions.move(b.id, note, next.id);
    this.sayPlace(note, this.store.get(note)?.game.name ?? 'A anotação', next.id);
    requestAnimationFrame(() => {
      const li = this.host.querySelector<HTMLElement>(`.lugar[data-nota="${note}"]`);
      const card = li?.querySelector<HTMLElement>('app-kanban-note');
      if (!li || !card) return;
      card.classList.remove('chegou');
      void card.offsetWidth;
      card.classList.add('chegou');
      setTimeout(() => card.classList.remove('chegou'), 950);
      const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
      li.scrollIntoView({ block: 'nearest', inline: 'nearest', behavior: still ? 'auto' : 'smooth' });
      (li.querySelector<HTMLElement>('.avancar') ?? li.querySelector<HTMLElement>('.hit'))?.focus({ preventScroll: true });
    });
  }

  /** Diz onde a anotação ficou: a coluna e a posição em que aparece nela. */
  private sayPlace(note: string, name: string, column: string): void {
    const b = this.board();
    const col = b?.columns.find((c) => c.id === column);
    if (!b || !col) return;
    const list = this.ordered(b, col);
    this.said.set(`${name}: ${col.name}, ${list.findIndex((c) => c.note === note) + 1} de ${list.length}.`);
  }

  /**
   * Shift e as setas para cima e para baixo numa coluna em ordem: só troca de lugar com a vizinha
   * empatada com ela (a ordem decide o resto); sem empate, diz por que não sai do lugar.
   */
  private nudgeSorted(b: KanbanBoard, col: KanbanColumn, note: string, name: string, by: -1 | 1): void {
    const list = this.ordered(b, col);
    const at = list.findIndex((c) => c.note === note);
    const other = list[at + by];
    const cmp = sortComparator(col.sort ?? [], (id) => this.notes().get(id));
    if (at < 0 || !other || cmp(list[at], other) !== 0) {
      this.said.set(`${name} fica no lugar: ${col.name} está em ordem ${sortShort(col.sort ?? []).toLowerCase()}.`);
      return;
    }
    // na ordem à mão (a do empate), antes ou depois da vizinha
    const stored = cardsIn(b, col.id).filter((c) => c.note !== note);
    const i = stored.findIndex((c) => c.note === other.note);
    this.actions.move(b.id, note, col.id, by < 0 ? i : i + 1);
    this.sayPlace(note, name, col.id);
    requestAnimationFrame(() => this.host.querySelector<HTMLElement>(`[data-nota="${note}"] .hit`)?.focus());
  }

  // ===== Puxar o quadro com o mouse (no papel vazio): ele rola para o lado =====

  protected readonly panning = signal(false);

  protected onBoardDown(e: PointerEvent): void {
    if (e.pointerType !== 'mouse' || e.button !== 0 || this.drag()) return;
    if ((e.target as HTMLElement).closest('.lugar, .etiqueta, .adicionar, button, a, input, select, label')) return;
    const q = this.quadro()?.nativeElement;
    if (!q || q.scrollWidth <= q.clientWidth) return;
    const x0 = e.clientX;
    const left0 = q.scrollLeft;
    e.preventDefault();
    this.panning.set(true);
    const move = (ev: PointerEvent) => (q.scrollLeft = left0 - (ev.clientX - x0));
    const up = () => {
      this.panning.set(false);
      window.removeEventListener('pointermove', move);
      window.removeEventListener('pointerup', up);
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
  }

  // ===== As beiradas: o quadro corre até a beirada da tela e some num degradê =====

  /**
   * O quadro passa da largura da pasta e vai até as beiradas da tela (a primeira coluna continua
   * alinhada com a pasta); do lado em que ainda há o que rolar, as colunas somem num degradê, e uma
   * seta na beirada diz quantas estão para lá e traz a próxima página delas.
   */
  protected readonly edges = signal<Edges>(NO_EDGES);
  private edgeFrame = 0;

  private scheduleEdges(): void {
    cancelAnimationFrame(this.edgeFrame);
    this.edgeFrame = requestAnimationFrame(() => this.measureEdges());
  }

  /**
   * A janela à mostra, no sistema do conteúdo do quadro (o das colunas, que não muda ao rolar): o que
   * o degradê de cada lado ainda deixa ler. `inset` é onde uma coluna trazida pela seta encosta: na
   * linha da pasta, ou depois do degradê, se ele for mais largo.
   */
  private windowOf(q: HTMLElement, start: boolean, end: boolean): { lo: number; hi: number; inset: number } {
    const fade = parseFloat(getComputedStyle(q).getPropertyValue('--kb-fade')) || 0;
    const sangria = Math.max(0, this.host.getBoundingClientRect().left - q.getBoundingClientRect().left);
    q.style.setProperty('--sangria', `${Math.round(sangria)}px`);
    return { lo: q.scrollLeft + (start ? fade : 0), hi: q.scrollLeft + q.clientWidth - (end ? fade : 0), inset: Math.max(sangria, fade) };
  }

  private measureEdges(): void {
    const q = this.quadro()?.nativeElement;
    let next = NO_EDGES;
    if (q) {
      const max = q.scrollWidth - q.clientWidth;
      const start = q.scrollLeft > 2;
      const end = q.scrollLeft < max - 2;
      const { lo, hi } = this.windowOf(q, start, end);
      let before = 0;
      let after = 0;
      // pela caixa de layout (offsetLeft), não pela de tela: a coluna é um pouco torta
      for (const c of Array.from(q.querySelectorAll<HTMLElement>(':scope > .coluna'))) {
        if (c.offsetLeft < lo - 4) before++;
        else if (c.offsetLeft + c.offsetWidth > hi + 4) after++;
      }
      next = { start, end, before, after };
    }
    const e = this.edges();
    if (e.start !== next.start || e.end !== next.end || e.before !== next.before || e.after !== next.after) this.edges.set(next);
  }

  /**
   * A seta da beirada: traz a página seguinte de colunas. Para a direita, a primeira que não estava
   * inteira encosta na linha da pasta; para a esquerda, a última escondida encosta na beirada de lá.
   */
  protected page(dir: -1 | 1): void {
    const q = this.quadro()?.nativeElement;
    if (!q) return;
    const max = q.scrollWidth - q.clientWidth;
    const { lo, hi, inset } = this.windowOf(q, q.scrollLeft > 2, q.scrollLeft < max - 2);
    const cols = Array.from(q.querySelectorAll<HTMLElement>(':scope > .coluna'));
    let left: number | null = null;
    if (dir > 0) {
      const c = cols.find((x) => x.offsetLeft + x.offsetWidth > hi + 4);
      if (c) left = c.offsetLeft - inset;
    } else {
      const c = cols.reverse().find((x) => x.offsetLeft < lo - 4);
      if (c) left = c.offsetLeft + c.offsetWidth - (q.clientWidth - inset);
    }
    if (left === null) return;
    const still = matchMedia('(prefers-reduced-motion: reduce)').matches;
    q.scrollTo({ left: Math.max(0, Math.min(left, max)), behavior: still ? 'auto' : 'smooth' });
  }

  // ===== Arrastar: mouse, caneta e dedo =====

  private start: { x: number; y: number; note: string; column: string; el: HTMLElement; touch: boolean; id: number } | null = null;
  private holdTimer: ReturnType<typeof setTimeout> | undefined;
  private ghost: HTMLElement | null = null;
  /** Onde o ponteiro pegou a ficha, em relação ao canto dela. */
  private grab = { x: 0, y: 0 };
  private pointer = { x: 0, y: 0 };
  private frame = 0;
  private readonly listeners: (() => void)[] = [];

  protected onPointerDown(e: PointerEvent, note: string, column: string): void {
    if (this.drag() || e.button !== 0 || !e.isPrimary) return;
    const target = e.target as HTMLElement;
    // as etiquetas, o botão delas e as caixinhas das tarefas são deles
    if (target.closest('.pe, input, label, a, select, textarea')) return;
    const el = e.currentTarget as HTMLElement;
    const touch = e.pointerType === 'touch';
    this.start = { x: e.clientX, y: e.clientY, note, column, el, touch, id: e.pointerId };
    this.pointer = { x: e.clientX, y: e.clientY };
    const move = (ev: PointerEvent) => this.onPointerMove(ev);
    const up = (ev: PointerEvent) => this.onPointerUp(ev);
    const cancel = () => this.endDrag();
    const key = (ev: KeyboardEvent) => {
      if (ev.key === 'Escape' && this.drag()) {
        ev.preventDefault();
        this.endDrag();
      }
    };
    // enquanto arrasta com o dedo, a tela não rola (o toque segue com o arrastar)
    const touchmove = (ev: TouchEvent) => {
      if (this.drag()) ev.preventDefault();
    };
    window.addEventListener('pointermove', move);
    window.addEventListener('pointerup', up);
    window.addEventListener('pointercancel', cancel);
    window.addEventListener('keydown', key, true);
    window.addEventListener('touchmove', touchmove, { passive: false });
    // segurar o dedo não abre o menu do navegador no meio do arrastar
    const menu = (ev: Event) => {
      if (this.drag()) ev.preventDefault();
    };
    window.addEventListener('contextmenu', menu);
    this.listeners.push(() => window.removeEventListener('contextmenu', menu));
    this.listeners.push(
      () => window.removeEventListener('pointermove', move),
      () => window.removeEventListener('pointerup', up),
      () => window.removeEventListener('pointercancel', cancel),
      () => window.removeEventListener('keydown', key, true),
      () => window.removeEventListener('touchmove', touchmove),
    );
    if (touch) this.holdTimer = setTimeout(() => this.begin(), HOLD);
  }

  private onPointerMove(e: PointerEvent): void {
    const s = this.start;
    if (!s || e.pointerId !== s.id) return;
    this.pointer = { x: e.clientX, y: e.clientY };
    if (!this.drag()) {
      const dist = Math.hypot(e.clientX - s.x, e.clientY - s.y);
      // o dedo andou antes de segurar: é rolar a tela, não arrastar
      if (s.touch) {
        if (dist > TOUCH_SLOP) this.endDrag();
        return;
      }
      if (dist < SLOP) return;
      this.begin();
    }
    e.preventDefault();
    this.follow();
  }

  /** Começa a arrastar: a cópia da ficha sai da coluna com o ponteiro, e a vaga fica no lugar dela. */
  private begin(): void {
    const s = this.start;
    const b = this.board();
    if (!s || !b || this.drag()) return;
    const card = s.el.querySelector<HTMLElement>('app-kanban-note');
    if (!card) return;
    const rect = card.getBoundingClientRect();
    this.grab = { x: s.x - rect.left, y: s.y - rect.top };
    const group = this.groupFor(s.note);
    const ghost = group.length ? this.pile(card, group, s.note) : (card.cloneNode(true) as HTMLElement);
    ghost.classList.add('kanban-fantasma');
    ghost.setAttribute('aria-hidden', 'true');
    ghost.removeAttribute('data-ficha');
    Object.assign(ghost.style, { width: `${rect.width}px`, left: '0px', top: '0px' });
    this.host.appendChild(ghost);
    this.ghost = ghost;
    const index = this.view()
      .find((v) => v.col.id === s.column)!
      .items.findIndex((it) => it.card.note === s.note);
    // o lugar de todas na coluna: as alturas delas e os vãos entre elas
    const height = group.length ? this.heightOf(group) : rect.height;
    this.drag.set({ note: s.note, from: s.column, over: s.column, index: Math.max(0, index), start: Math.max(0, index), height, group });
    document.documentElement.classList.add('kanban-arrastando');
    if (s.touch) navigator.vibrate?.(12);
    this.follow();
    this.scrollLoop();
  }

  /**
   * As marcadas que vão junto com a ficha pega, na ordem do quadro (coluna a coluna, de cima para
   * baixo); vazio quando ela não está marcada ou é a única.
   */
  private groupFor(note: string): string[] {
    const b = this.board();
    const marked = new Set(this.selection.ids());
    if (!b || !marked.has(note) || marked.size < 2) return [];
    return b.columns.flatMap((col) => this.ordered(b, col).filter((c) => marked.has(c.note))).map((c) => c.note);
  }

  /** A altura das fichas do grupo empilhadas na coluna, com o vão de entre elas. */
  private heightOf(group: readonly string[]): number {
    const lis = group.map((n) => this.host.querySelector<HTMLElement>(`.lugar[data-nota="${n}"]`)).filter((li) => !!li);
    const list = lis[0]?.parentElement;
    const gap = list ? parseFloat(getComputedStyle(list).rowGap) || 0 : 0;
    return lis.reduce((h, li) => h + li.getBoundingClientRect().height, 0) + gap * Math.max(0, lis.length - 1);
  }

  /**
   * A pilha que segue o ponteiro quando vão várias: a ficha pega por cima, até duas das outras
   * marcadas por baixo, saindo de lado como um maço, e o adesivo com quantas vão.
   */
  private pile(card: HTMLElement, group: readonly string[], note: string): HTMLElement {
    const pile = document.createElement('div');
    // os estilos da página valem nela como nas fichas copiadas
    const scope = Array.from(card.attributes, (a) => a.name).filter((n) => n.startsWith('_ngcontent-'));
    for (const name of scope) pile.setAttribute(name, '');
    pile.classList.add('pilha');
    const under = group.filter((n) => n !== note).slice(0, 2);
    // a mais funda primeiro, para a de cima ser pintada por último
    under.reverse().forEach((n, i) => {
      const other = this.host.querySelector<HTMLElement>(`.lugar[data-nota="${n}"] app-kanban-note`);
      if (!other) return;
      const copy = other.cloneNode(true) as HTMLElement;
      copy.removeAttribute('data-ficha');
      copy.classList.add('pilha-baixo');
      copy.style.setProperty('--k', String(under.length - i));
      pile.append(copy);
    });
    const top = card.cloneNode(true) as HTMLElement;
    top.removeAttribute('data-ficha');
    pile.append(top);
    const count = document.createElement('span');
    for (const name of scope) count.setAttribute(name, '');
    count.className = 'pilha-n';
    count.textContent = String(group.length);
    pile.append(count);
    return pile;
  }

  /** A cópia segue o ponteiro; a vaga vai para a coluna e a posição embaixo dele. */
  private follow(): void {
    const d = this.drag();
    if (!d || !this.ghost) return;
    const { x, y } = this.pointer;
    this.ghost.style.translate = `${x - this.grab.x}px ${y - this.grab.y}px`;
    const col = this.columnAt(x);
    if (!col) return;
    const id = col.dataset['coluna']!;
    // as fichas à mostra da coluna (sem a vaga): cai antes da primeira cujo meio está abaixo do ponteiro
    const lis = Array.from(col.querySelectorAll<HTMLElement>('.fichas > .lugar:not(.vaga)'));
    let index = lis.length;
    for (let i = 0; i < lis.length; i++) {
      const r = lis[i].getBoundingClientRect();
      if (y < r.top + r.height / 2) {
        index = i;
        break;
      }
    }
    index = this.clampSorted(d, id, index);
    if (d.over !== id || d.index !== index) this.drag.set({ ...d, over: id, index });
  }

  /**
   * Numa coluna em ordem, a vaga só anda entre as anotações empatadas com a que vai (a ordem decide o
   * resto): ela mostra onde a anotação vai aparecer de verdade.
   */
  private clampSorted(d: Drag, column: string, index: number): number {
    const b = this.board();
    const col = b?.columns.find((c) => c.id === column);
    const card = b?.cards.find((c) => c.note === d.note);
    if (!col?.sort?.length || !card) return index;
    const shown = this.view().find((v) => v.col.id === column)?.items.filter((it) => !it.dragged).map((it) => it.card) ?? [];
    const [lo, hi] = tieRange(shown, card, col.sort, (id) => this.notes().get(id));
    return Math.max(lo, Math.min(index, hi));
  }

  /** A coluna na altura do ponteiro (pelo x: entre duas, a mais perto). */
  private columnAt(x: number): HTMLElement | null {
    const cols = Array.from(this.host.querySelectorAll<HTMLElement>('.coluna'));
    let best: HTMLElement | null = null;
    let dist = Infinity;
    for (const c of cols) {
      const r = c.getBoundingClientRect();
      const d = x < r.left ? r.left - x : x > r.right ? x - r.right : 0;
      if (d < dist) {
        dist = d;
        best = c;
      }
    }
    return best;
  }

  /** Perto da beirada, o quadro rola para o lado e a página para cima ou para baixo. */
  private scrollLoop(): void {
    cancelAnimationFrame(this.frame);
    const tick = () => {
      if (!this.drag()) return;
      const { x, y } = this.pointer;
      const q = this.quadro()?.nativeElement;
      const speed = (d: number) => Math.round(((EDGE - d) / EDGE) * 18);
      let moved = false;
      if (q) {
        const r = q.getBoundingClientRect();
        if (x < r.left + EDGE && q.scrollLeft > 0) {
          q.scrollLeft -= speed(Math.max(0, x - r.left));
          moved = true;
        } else if (x > r.right - EDGE && q.scrollLeft < q.scrollWidth - q.clientWidth) {
          q.scrollLeft += speed(Math.max(0, r.right - x));
          moved = true;
        }
      }
      if (y < EDGE) {
        window.scrollBy(0, -speed(Math.max(0, y)));
        moved = true;
      } else if (y > innerHeight - EDGE) {
        window.scrollBy(0, speed(Math.max(0, innerHeight - y)));
        moved = true;
      }
      if (moved) this.follow();
      this.frame = requestAnimationFrame(tick);
    };
    this.frame = requestAnimationFrame(tick);
  }

  private onPointerUp(e: PointerEvent): void {
    const s = this.start;
    const d = this.drag();
    if (!s || e.pointerId !== s.id) return;
    if (d) {
      // o clique que vem depois de soltar não abre a anotação
      const swallow = (ev: Event) => {
        ev.stopPropagation();
        ev.preventDefault();
      };
      window.addEventListener('click', swallow, { capture: true, once: true });
      setTimeout(() => window.removeEventListener('click', swallow, { capture: true }), 0);
      this.drop(d);
    }
    this.endDrag();
  }

  /** Solta: a posição entre as à mostra vira a posição entre todas da coluna (o filtro esconde algumas). */
  private drop(d: Drag): void {
    const b = this.board();
    if (!b) return;
    const shown = this.view().find((v) => v.col.id === d.over)?.items.filter((it) => !it.dragged) ?? [];
    const col = b.columns.find((c) => c.id === d.over);
    let before: string | undefined = shown[d.index]?.card.note;
    if (col?.sort?.length) {
      // em ordem: soltar onde estava não mexe em nada (nem na ordem à mão guardada)
      if (d.over === d.from && d.index === d.start) return;
      // a vaga ficou entre as empatadas: antes da que vem depois dela, se também empata; senão, depois de todas
      const card = b.cards.find((c) => c.note === d.note);
      const cmp = sortComparator(col.sort, (id) => this.notes().get(id));
      if (!card || !before || cmp(shown[d.index].card, card) !== 0) before = undefined;
    }
    if (d.group.length) {
      // todas juntas, na ordem do quadro, antes da que estava no lugar da vaga
      this.actions.moveMany(b.id, d.group, d.over, before ?? null);
      this.said.set(`${d.group.length} anotações: ${col?.name ?? ''}.`);
      return;
    }
    const all = cardsIn(b, d.over).filter((c) => c.note !== d.note);
    const index = before ? all.findIndex((c) => c.note === before) : all.length;
    this.actions.move(b.id, d.note, d.over, index < 0 ? undefined : index);
    const n = this.store.get(d.note)?.game.name ?? 'A anotação';
    this.said.set(`${n}: ${col?.name ?? ''}.`);
  }

  private endDrag(): void {
    clearTimeout(this.holdTimer);
    cancelAnimationFrame(this.frame);
    for (const off of this.listeners.splice(0)) off();
    this.ghost?.remove();
    this.ghost = null;
    this.start = null;
    if (this.drag()) this.drag.set(null);
    document.documentElement.classList.remove('kanban-arrastando');
  }
}
