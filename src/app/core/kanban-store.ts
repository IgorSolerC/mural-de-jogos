import { Injectable, computed, effect, signal } from '@angular/core';
import { EMPTY_KANBAN, KanbanBoard, KanbanState, MAX_BOARDS, mergeKanban, newBoard, sanitizeKanban } from './kanban';

/** Os quadros deste navegador (vão embora com "Apagar o save", como as anotações). */
export const KANBAN_KEY = 'meu-mural:kanban:v1';

function read(): KanbanState {
  try {
    return sanitizeKanban(JSON.parse(localStorage.getItem(KANBAN_KEY) ?? 'null'));
  } catch {
    return { ...EMPTY_KANBAN, removed: {} };
  }
}

/** Onde a próxima anotação nova vai cair, quando ela é criada de dentro de uma coluna. */
export interface KanbanSpot {
  board: string;
  column: string;
}

/**
 * Os quadros Kanban das anotações (ver core/kanban.ts): guardados neste navegador e, com conta, no
 * mural privado da nuvem (`kanban`, juntado quadro a quadro, ver core/cloud-sync.ts). Nunca no mural
 * público: o quadro é só seu, mesmo com as anotações públicas.
 */
@Injectable({ providedIn: 'root' })
export class KanbanStore {
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

  constructor() {
    effect(() => {
      const data = this.state();
      try {
        localStorage.setItem(KANBAN_KEY, JSON.stringify(data));
      } catch {
        /* sem armazenamento: vale só nesta sessão */
      }
    });
  }

  get(id: string): KanbanBoard | undefined {
    return this.boards().find((b) => b.id === id);
  }

  /** Troca um quadro pelo resultado de `change` (as funções de core/kanban.ts). */
  update(id: string, change: (b: KanbanBoard, at: string) => KanbanBoard): void {
    const at = new Date().toISOString();
    const st = this.state();
    let changed = false;
    const boards = st.boards.map((b) => {
      if (b.id !== id) return b;
      const next = change(b, at);
      changed ||= next !== b;
      return next;
    });
    if (!changed) return;
    this.state.set({ ...st, boards });
    this.changedAt.set(Date.now());
  }

  /** Um quadro novo no fim, com as três colunas de sempre; devolve o id ("" sem espaço). */
  create(name: string): string {
    const st = this.state();
    if (st.boards.length >= MAX_BOARDS) return '';
    const board = newBoard(name);
    this.state.set({ ...st, boards: [...st.boards, board] });
    this.changedAt.set(Date.now());
    return board.id;
  }

  /** Apaga o quadro (as anotações continuam no mural). */
  remove(id: string): void {
    const st = this.state();
    if (!st.boards.some((b) => b.id === id)) return;
    this.state.set({ boards: st.boards.filter((b) => b.id !== id), removed: { ...st.removed, [id]: new Date().toISOString() } });
    this.changedAt.set(Date.now());
  }

  /** Desfazer o apagar: o quadro volta como era, e mais novo que o apagar. */
  restore(board: KanbanBoard, index: number): void {
    const st = this.state();
    const { [board.id]: _, ...removed } = st.removed;
    const boards = st.boards.filter((b) => b.id !== board.id);
    boards.splice(Math.max(0, Math.min(index, boards.length)), 0, { ...board, at: new Date().toISOString() });
    this.state.set({ boards, removed });
    this.changedAt.set(Date.now());
  }

  /** Leva o quadro para a posição `to` (a ordem das abas). */
  move(id: string, to: number): void {
    const st = this.state();
    const from = st.boards.findIndex((b) => b.id === id);
    if (from < 0) return;
    const boards = st.boards.filter((b) => b.id !== id);
    boards.splice(Math.max(0, Math.min(to, boards.length)), 0, st.boards[from]);
    this.state.set({ ...st, boards });
    this.changedAt.set(Date.now());
  }

  /** Os quadros que vieram de outro aparelho, juntados aos daqui. */
  merge(remote: KanbanState): void {
    const next = mergeKanban(this.state(), remote);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }

  /** A anotação nova acabou de ser salva: se ela foi pedida de uma coluna, devolve onde ela cai (uma vez só). */
  claim(): KanbanSpot | null {
    const spot = this.pending();
    this.pending.set(null);
    return spot && this.get(spot.board)?.columns.some((c) => c.id === spot.column) ? spot : null;
  }
}
