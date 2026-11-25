import { Injectable, effect, inject, untracked } from '@angular/core';
import { canvasNoteId } from './canvas-id';
import { FreeBoard, cleanBoardName } from './free-board';
import { FreeBoardStore } from './free-board-store';
import { FreeBoardSync } from './free-board-sync';
import { cleanCategory } from './note-labels';
import { Audience, Review, audienceFields, audienceOf, isCanvas, isPrivate, sanitizeReview, todayISO } from './review';
import { ReviewStore } from './review-store';
import { BUILD } from './build';
import { storageFrozen } from './storage';
import { localDay } from './dates';
import { CloudAccount } from './cloud-account';
import { CloudSync } from './cloud-sync';
import { MemberRole, isMemberRole } from './shared-notes';
import { normalizeCode } from './cloud-murals';
import { SharedStore } from './shared-store';

/** O título de um canvas novo. */
export const CANVAS_DEFAULT_TITLE = 'Canvas sem nome';
/** Quanto espera para tentar de novo levar as pessoas de um quadro para a anotação, depois de uma falha. */
const PEOPLE_RETRY_MS = 60_000;

/** O grupo do quadro de um canvas sem grupo: o quadro precisa de um (core/free-board.ts), e a anotação manda. */
export const CANVAS_NO_GROUP = 'Sem grupo';

/** O grupo que o quadro do canvas deve ter (o da anotação). */
export function canvasBoardGroup(note: Pick<Review, 'category'>): string {
  return cleanCategory(note.category ?? '') || CANVAS_NO_GROUP;
}

/** O que o quadro deve ter, pela anotação: o nome, o grupo e o público (a anotação manda, PLANO-CANVAS.md 4.2). */
export function canvasBoardFields(note: Review): { nome: string; grupo: string; publico: boolean } {
  return { nome: cleanBoardName(note.game.name), grupo: canvasBoardGroup(note), publico: !isPrivate(note) };
}

/** O quadro e a anotação de um canvas apagado, para o Desfazer. */
export interface RemovedCanvas {
  note: Review;
  board: FreeBoard | null;
}

/** Como nasce um canvas (o "Novo canvas aqui" do menu do nada, rodada 3). */
export interface NewCanvas {
  title?: string;
  /** O grupo aberto (null: sem grupo). */
  category: string | null;
  /** A pasta aberta, dentro do grupo. */
  folder?: string | null;
  /** Quem vê: o padrão do grupo (`newNoteAudience`), escolhido por quem cria. */
  audience: Audience;
}

/**
 * O elo entre a anotação de um canvas e o quadro dele (PLANO-CANVAS.md, 4.2): um lugar só para os dois andarem
 * juntos. **A anotação manda**: o título, o grupo e o público dela vão para o quadro, nunca o contrário.
 *
 * Criar, renomear, apagar (com o Desfazer) e duplicar passam por aqui. O resto (mudar o grupo pelo editor, pela
 * API, juntar com outro aparelho, um site antigo que mexeu no quadro) o **reconciliador** acerta: ele roda quando
 * a lista de anotações ou de quadros muda, e decide pelas datas, sem nunca apagar o que só ainda não chegou:
 *
 * 1. canvas e quadro aqui: o quadro volta ao nome, ao grupo e ao público da anotação (só o quadro que é seu);
 * 2. canvas sem o quadro: só quando se sabe que o quadro foi apagado (a lápide daqui, ou ele esteve aqui e sumiu,
 *    apagado em outro aparelho). A lápide mais nova que a anotação leva a anotação junto; a anotação mais nova (o
 *    Desfazer, uma versão posta de volta) traz o quadro de volta, pela cópia guardada (ou vazio). O quadro que
 *    nunca chegou (um aparelho novo, a lista dos quadros ainda descendo) fica esperando;
 * 3. quadro sem o canvas: a anotação apagada depois da última mexida no quadro leva o quadro junto (apagada por
 *    qualquer caminho: o mural, várias de uma vez, a API, outro aparelho). O quadro que nunca teve anotação (o da
 *    aba Quadro livre, que saiu; o pedido `criar_quadro` da API) vira canvas (rodada 5, a conversão): a anotação com
 *    o nome, o grupo e o público dele, do dia dele. Só depois de o mural da nuvem descer nesta página (com a conta):
 *    num aparelho novo, a anotação do canvas feito em outro ainda vem chegando, e a conversão a faria de novo, por
 *    cima. As pessoas chamadas só para o quadro (o Compartilhar dele, de antes) passam para a anotação.
 *
 * O canvas compartilhado (rodada 4): a anotação mora na nuvem das compartilhadas, e o acesso ao quadro vem dela (a
 * nuvem dá o quadro a quem está na anotação). O quadro seu segue a anotação como o de sempre (o nome, o grupo e o
 * público); apagar e trazer de volta são da nuvem: a anotação apagada para todos leva o quadro seu (`sharedMine`).
 * O quadro de outra pessoa é dela: aqui, nada se acerta nele.
 */
@Injectable({ providedIn: 'root' })
export class CanvasLink {
  private readonly store = inject(ReviewStore);
  private readonly boards = inject(FreeBoardStore);
  private readonly sync = inject(FreeBoardSync);
  private readonly cloud = inject(CloudSync);
  private readonly account = inject(CloudAccount);
  private readonly shared = inject(SharedStore);
  /** Quando a página subiu: a conversão espera um mural da nuvem descido depois disso. */
  private readonly startedAt = Date.now();
  /** Criando ou duplicando aqui (o quadro nasce antes da anotação): a conversão espera, para não fazer outra. */
  private making = 0;
  /** Os quadros cujas pessoas já estão passando para a anotação (uma vez por página). */
  private readonly moving = new Set<string>();
  /** Os quadros de canvas que estiveram aqui nesta página (o que some depois disso foi apagado em outro aparelho). */
  private readonly seen = new Set<string>();
  /** Os quadros apagados junto com a anotação nesta página, para voltarem com ela (o Desfazer de qualquer caminho). */
  private readonly copies = new Map<string, FreeBoard>();
  /**
   * Os canvas compartilhados com o quadro seu, vistos nesta página (o id da anotação e o do quadro): a anotação que
   * sai daqui depois disso foi apagada para todos (por você em outro aparelho, ou pelo dono do grupo), e o quadro vai
   * junto. A que nunca esteve aqui não conta (nunca apagar o que só ainda não chegou).
   */
  private readonly sharedMine = new Map<string, string>();
  private running: Promise<void> | null = null;
  private again = false;

  constructor() {
    effect(() => {
      this.store.reviews();
      this.boards.boards();
      this.cloud.lastSyncAt();
      this.shared.listedAt();
      this.sync.withPeople();
      untracked(() => void this.reconcile());
    });
  }

  // ===== ler =====

  /** O quadro do canvas (null: não é canvas, ou o quadro ainda não está aqui). */
  boardOf(note: Pick<Review, 'canvas'>): FreeBoard | null {
    return note.canvas ? this.boards.get(note.canvas) : null;
  }

  /** A anotação do canvas do quadro `boardId`. */
  noteOf(boardId: string): Review | undefined {
    const note = this.store.get(canvasNoteId(boardId));
    return note && isCanvas(note) ? note : undefined;
  }

  /** Os quadros que são de algum canvas (para o apagar do grupo não levar o quadro de quem só muda de grupo). */
  canvasBoards(): Set<string> {
    return new Set(this.store.notes().flatMap((n) => (n.canvas ? [n.canvas] : [])));
  }

  // ===== criar e mudar =====

  /**
   * Um canvas novo, num passo só: o quadro vazio e a anotação que aponta para ele (o id `cv-` e o do quadro). O
   * teto de quadros (`FB_MAX_BOARDS`) avisa pelo erro do quadro (`FreeBoardProblem`).
   */
  async create(opts: NewCanvas): Promise<Review> {
    this.making++;
    try {
      return await this.createNow(opts);
    } finally {
      this.making--;
    }
  }

  private async createNow(opts: NewCanvas): Promise<Review> {
    const group = cleanCategory(opts.category ?? '');
    const board = await this.boards.create(opts.title?.trim() || CANVAS_DEFAULT_TITLE, group || CANVAS_NO_GROUP);
    const now = new Date().toISOString();
    const note = sanitizeReview(
      {
        id: canvasNoteId(board.id),
        kind: 'anotacoes',
        game: { name: board.nome, coverUrl: null, source: 'manual' },
        text: '',
        completedAt: todayISO(),
        stock: 'cinza',
        ...(group ? { category: group } : {}),
        ...(opts.folder ? { folder: opts.folder } : {}),
        ...audienceFields(opts.audience, null, now),
        createdAt: now,
        updatedAt: now,
      },
      BUILD,
    );
    if (!note) {
      await this.boards.remove(board.id);
      throw new Error('O canvas não pôde ser criado.');
    }
    this.store.add(note);
    this.seen.add(board.id);
    await this.mirror(note);
    return this.store.get(note.id) ?? note;
  }

  /** Renomeia o canvas (o topo do canvas aberto): muda a anotação, e o elo leva ao quadro. */
  async rename(noteId: string, title: string): Promise<Review | null> {
    const note = this.store.get(noteId);
    const name = title.replace(/\s+/g, ' ').trim();
    if (!note || !isCanvas(note) || !name) return note ?? null;
    if (note.game.name !== name) this.store.update({ ...note, game: { ...note.game, name }, updatedAt: new Date().toISOString() }, note);
    const next = this.store.get(noteId) ?? note;
    await this.mirror(next);
    return next;
  }

  /**
   * Apaga o canvas: a anotação (com a lápide) e o quadro. Devolve os dois para o Desfazer. A compartilhada não sai
   * por aqui (é a regra da anotação: só o dono apaga para todos, os outros saem).
   */
  async remove(noteId: string): Promise<RemovedCanvas | null> {
    const note = this.store.get(noteId);
    if (!note || !isCanvas(note)) return null;
    const removed = this.store.remove(noteId);
    if (!removed) return null;
    const board = await this.dropBoard(note.canvas!);
    return { note, board };
  }

  /**
   * O Desfazer do `remove`: o quadro volta primeiro, depois a anotação. No meio, o quadro está aqui sem a anotação:
   * a conversão espera (`making`), senão faria outra anotação com o mesmo id antes de a de verdade voltar.
   */
  async undoRemove(removed: RemovedCanvas): Promise<void> {
    this.making++;
    try {
      await this.undoRemoveNow(removed);
    } finally {
      this.making--;
    }
  }

  private async undoRemoveNow(removed: RemovedCanvas): Promise<void> {
    const id = removed.note.canvas;
    const board = removed.board ?? (id ? this.copies.get(id) : undefined);
    if (board && !this.boards.get(board.id)) await this.boards.restore(board);
    if (id) this.copies.delete(id);
    this.store.undoRemove([removed.note]);
    const back = this.store.get(removed.note.id);
    if (back) await this.mirror(back);
  }

  /** Um canvas novo igual a este (o "Duplicar"): a cópia do quadro, e a anotação nova apontando para ela. */
  async duplicate(noteId: string): Promise<Review | null> {
    this.making++;
    try {
      return await this.duplicateNow(noteId);
    } finally {
      this.making--;
    }
  }

  private async duplicateNow(noteId: string): Promise<Review | null> {
    const note = this.store.get(noteId);
    if (!note || !isCanvas(note)) return null;
    await this.boards.ready;
    if (!this.boards.get(note.canvas!)) return null;
    const copy = await this.boards.duplicate(note.canvas!);
    if (!copy) return null;
    const now = new Date().toISOString();
    const { doneAt: _d, noteRank: _r, publishedAt: _p, private: _v, quiet: _q, sharedBy: _s, ...rest } = note;
    const next = sanitizeReview(
      {
        ...rest,
        id: canvasNoteId(copy.id),
        game: { ...note.game, name: copy.nome },
        ...audienceFields(audienceOf(note), null, now),
        createdAt: now,
        updatedAt: now,
      },
      BUILD,
    );
    if (!next) {
      await this.boards.remove(copy.id);
      return null;
    }
    this.store.add(next);
    this.seen.add(copy.id);
    await this.mirror(next);
    return this.store.get(next.id) ?? next;
  }

  // ===== o reconciliador =====

  /** Acerta os canvas e os quadros (ver o topo). Uma passada por vez; o que mudar no meio pede outra. */
  reconcile(): Promise<void> {
    if (this.running) {
      this.again = true;
      return this.running;
    }
    this.running = (async () => {
      try {
        await this.boards.ready;
        do {
          this.again = false;
          // (uma falha do banco dos quadros não derruba nada: a próxima mudança tenta de novo)
          await this.pass().catch(() => undefined);
        } while (this.again);
      } finally {
        this.running = null;
      }
    })();
    return this.running;
  }

  private async pass(): Promise<void> {
    // a página recarregando (a limpeza do Sair, a trava do site velho): nada de gravar
    if (storageFrozen()) return;
    const shared = this.store.sharedIds();
    const canvases = this.store.notes().filter(isCanvas);
    const linked = new Set<string>();
    for (const note of canvases) {
      const id = note.canvas!;
      linked.add(id);
      // o quadro de outra pessoa segue o dono dele
      if (this.sync.roleOf(id) !== 'dono') continue;
      if (shared.has(note.id)) {
        // a compartilhada: o quadro seu segue a anotação; apagar e trazer de volta são da nuvem
        if (!this.boards.get(id)) continue;
        this.seen.add(id);
        this.sharedMine.set(note.id, id);
        await this.mirror(note);
        continue;
      }
      if (this.boards.get(id)) {
        this.seen.add(id);
        await this.mirror(note);
        continue;
      }
      const rec = this.boards.record(id);
      if (this.copies.has(id)) {
        // saiu com a anotação nesta página, e a anotação voltou (o Desfazer de qualquer caminho)
        await this.bringBack(note);
      } else if (rec && rec.quadro === null) {
        // a lápide daqui: a mais nova das duas vale
        if ((rec.apagado ?? '') >= note.updatedAt) this.store.remove(note.id);
        else await this.bringBack(note);
      } else if (!rec && this.seen.has(id)) {
        const copy = this.boards.copyOf(id);
        // apagado em outro aparelho, mas mexido aqui: o que se mexeu foi para uma cópia, e o canvas vai junto
        if (copy && this.boards.get(copy) && !this.store.get(canvasNoteId(copy))) await this.movedTo(note, copy);
        // esteve aqui e sumiu: a nuvem disse que foi apagado
        else this.store.remove(note.id);
      }
      // nunca esteve aqui: ainda não chegou (o aparelho novo, a lista dos quadros descendo)
    }
    // a compartilhada com o quadro seu que saiu daqui (apagada para todos): o quadro vai junto
    for (const [noteId, boardId] of [...this.sharedMine]) {
      if (this.store.get(noteId)) continue;
      this.sharedMine.delete(noteId);
      if (this.boards.get(boardId) && this.sync.roleOf(boardId) === 'dono') await this.dropBoard(boardId);
    }
    for (const board of this.boards.boards()) {
      if (linked.has(board.id) || this.sync.roleOf(board.id) !== 'dono') continue;
      const noteId = canvasNoteId(board.id);
      if (this.store.get(noteId)) continue;
      const gone = this.store.deletedAt(noteId);
      // a anotação apagada depois da última mexida no quadro leva ele junto
      if (gone && gone >= board.em) await this.dropBoard(board.id);
      // o quadro que nunca teve anotação (ou foi mexido depois de ela sair) vira canvas
      else if (this.mayConvert()) await this.convert(board);
    }
    // as pessoas chamadas só para o quadro passam para a anotação (uma regra de acesso só, PLANO-CANVAS.md 6)
    for (const id of this.sync.withPeople()) {
      if (!this.moving.has(id) && this.store.get(canvasNoteId(id)) && this.boards.get(id)) void this.movePeople(id);
    }
  }

  /**
   * Converter agora: sem a conta, sempre; com ela, só depois de o mural da nuvem e a lista das compartilhadas
   * descerem nesta página (o canvas feito em outro aparelho, o de um grupo compartilhado, já chegou). Nem no meio
   * de um criar ou duplicar daqui.
   */
  private mayConvert(): boolean {
    if (this.making) return false;
    if (!this.cloud.active()) return true;
    return (this.cloud.lastSyncAt() ?? 0) >= this.startedAt && (this.shared.listedAt() ?? 0) >= this.startedAt;
  }

  /**
   * O quadro sem anotação vira canvas (rodada 5): o nome, o grupo e o público dele, o dia e a hora dele (`em`), a
   * cor cinza. O público entra como "visível" (como estava: à mostra na visita, sem ir para o Feed de ninguém). O id
   * é o do quadro: dois aparelhos que convertem o mesmo quadro chegam à mesma anotação.
   */
  private async convert(board: FreeBoard): Promise<void> {
    const at = board.em;
    const group = board.grupo === CANVAS_NO_GROUP ? '' : cleanCategory(board.grupo);
    const note = sanitizeReview(
      {
        id: canvasNoteId(board.id),
        kind: 'anotacoes',
        game: { name: board.nome || CANVAS_DEFAULT_TITLE, coverUrl: null, source: 'manual' },
        text: '',
        // (o dia daqui, e não o de Greenwich: o quadro mexido à noite é do dia em que foi mexido)
        completedAt: localDay(new Date(at)),
        stock: 'cinza',
        ...(group ? { category: group } : {}),
        ...audienceFields(board.publico ? 'visivel' : 'privada', null, at),
        createdAt: at,
        updatedAt: at,
      },
      BUILD,
    );
    if (!note || this.store.get(note.id)) return;
    this.store.add(note);
    this.seen.add(board.id);
  }

  /**
   * Leva as pessoas chamadas só para o quadro (o Compartilhar dele, de antes do canvas) para a anotação, com os
   * mesmos papéis, e as tira do quadro: quem vê a anotação vê o quadro, e uma regra só decide (PLANO-CANVAS.md, 6).
   * Só no seu canvas solto (a de um grupo vai com o grupo). Uma falha tenta de novo depois de um minuto.
   */
  private async movePeople(boardId: string): Promise<void> {
    this.moving.add(boardId);
    const noteId = canvasNoteId(boardId);
    try {
      const res = await this.account.request<{ membros?: { codigo?: unknown; papel?: unknown }[] }>(`/v1/eu/quadros/${boardId}/membros`);
      const people = (res?.membros ?? []).flatMap((m) =>
        typeof m.codigo === 'string' && normalizeCode(m.codigo) && isMemberRole(m.papel) ? [{ codigo: normalizeCode(m.codigo)!, papel: m.papel as MemberRole }] : [],
      );
      const entry = this.shared.get(noteId);
      if (entry && (entry.papel !== 'dono' || entry.grupo)) return;
      const note = this.store.get(noteId);
      if (!note || !people.length) return;
      if (!entry) await this.shared.share(note, people);
      else {
        const there = new Set(entry.membros.map((m) => m.codigo));
        for (const p of people) if (!there.has(p.codigo)) await this.shared.setRole(noteId, p.codigo, p.papel);
      }
      // na anotação: o quadro deixa de chamar por fora (a nuvem passa a dar o quadro pela anotação)
      for (const p of people) await this.account.request(`/v1/eu/quadros/${boardId}/membros/${encodeURIComponent(p.codigo)}`, { method: 'DELETE' });
    } catch {
      // (sem rede, a nuvem recusou: tenta de novo daqui a um minuto, na próxima passada)
      setTimeout(() => {
        this.moving.delete(boardId);
        void this.reconcile();
      }, PEOPLE_RETRY_MS);
    }
  }

  /** O quadro volta (a anotação é mais nova que a lápide dele): a cópia desta página, ou um quadro vazio. */
  private async bringBack(note: Review): Promise<void> {
    const id = note.canvas!;
    const copy = this.copies.get(id);
    const f = canvasBoardFields(note);
    if (copy) await this.boards.restore(copy);
    else await this.boards.create(f.nome || CANVAS_DEFAULT_TITLE, f.grupo, id);
    this.copies.delete(id);
    this.seen.add(id);
    const back = this.store.get(note.id);
    if (back) await this.mirror(back);
  }

  /** O canvas passa a ser o do quadro `boardId` (a cópia do `keepCopy`): a anotação nova com o id dele, a de antes sai. */
  private async movedTo(note: Review, boardId: string): Promise<void> {
    const next = sanitizeReview({ ...note, id: canvasNoteId(boardId), updatedAt: new Date().toISOString() }, BUILD);
    if (!next) return;
    this.store.add(next);
    this.store.remove(note.id);
    this.seen.add(boardId);
    await this.mirror(this.store.get(next.id) ?? next);
  }

  /** Apaga o quadro guardando a cópia (para voltar com a anotação). */
  private async dropBoard(id: string): Promise<FreeBoard | null> {
    const board = await this.boards.remove(id);
    if (board) this.copies.set(id, board);
    this.seen.delete(id);
    return board;
  }

  /** O quadro volta ao que a anotação diz: o nome, o grupo e o público. */
  private async mirror(note: Review): Promise<void> {
    const id = note.canvas;
    // (o quadro de outra pessoa: o dono dele acerta, pela anotação que também chega a ele)
    if (!id || this.sync.roleOf(id) !== 'dono') return;
    const board = this.boards.get(id);
    if (!board) return;
    const want = canvasBoardFields(note);
    if (want.nome && board.nome !== want.nome) await this.boards.rename(id, want.nome);
    if (board.grupo !== want.grupo) await this.boards.moveToGroup(id, want.grupo);
    if (!!board.publico !== want.publico) await this.boards.setPublic(id, want.publico);
  }
}
