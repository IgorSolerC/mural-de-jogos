import { Injectable, effect, inject, untracked } from '@angular/core';
import { CardLook, withLook } from './card-look';
import { KanbanBoard, dressBoard } from './kanban';
import { KanbanStore } from './kanban-store';
import { ReviewStore } from './review-store';
import { SharedStore } from './shared-store';

/**
 * O card padrão das colunas do Kanban, na prática: sempre que um quadro ou as anotações mudam (mover,
 * mudar o card padrão, ligar ou desligar, um Desfazer, o que chegou da nuvem), veste as anotações que
 * acabaram de chegar numa coluna com card. O visual fica delas: saindo da coluna, continuam vestidas;
 * só um Desfazer devolve o visual de antes (ver `dressBoard`). Rodar de novo sem mudança nenhuma não
 * faz nada.
 *
 * As anotações compartilhadas ficam como estão: o visual delas é de todos que dividem a anotação, e o
 * quadro é só seu.
 */
@Injectable({ providedIn: 'root' })
export class KanbanDresser {
  private readonly kanban = inject(KanbanStore);
  private readonly store = inject(ReviewStore);
  private readonly shared = inject(SharedStore);

  constructor() {
    effect(() => {
      const boards = this.kanban.boards();
      const notes = this.kanban.notesById();
      untracked(() => this.run(boards, notes));
    });
  }

  private run(boards: readonly KanbanBoard[], notes: ReturnType<KanbanStore['notesById']>): void {
    const at = new Date().toISOString();
    for (const b of boards) {
      const { board, looks } = dressBoard(b, notes, at, (id) => this.shared.role(id) !== null);
      if (board === b) continue;
      this.kanban.update(b.id, () => board);
      this.paint(looks, at);
    }
  }

  /** Grava o visual nas anotações. */
  private paint(looks: readonly { note: string; look: CardLook }[], at: string): void {
    for (const { note, look } of looks) {
      const r = this.store.get(note);
      if (!r || this.shared.role(note) !== null) continue;
      this.store.update({ ...withLook(r, look), updatedAt: at }, r);
    }
  }
}
