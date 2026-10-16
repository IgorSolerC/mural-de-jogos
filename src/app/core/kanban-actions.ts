import { Injectable, inject } from '@angular/core';
import { KanbanBoard, belongs, cardsIn, doneChange, placeCard, removeCard } from './kanban';
import { KanbanStore } from './kanban-store';
import { NoteDone } from './note-done';
import { isDone } from './review';
import { ReviewStore } from './review-store';
import { Toasts } from '../ui/toast';

/**
 * O que acontece quando uma anotação anda no quadro: o lugar novo e, se a coluna pede, a anotação
 * finalizada (ou aberta de novo), com o bilhete e o Desfazer, que devolve tudo como era (o lugar e o
 * check). Quem arrasta, o teclado e a folha da anotação passam todos por aqui.
 */
@Injectable({ providedIn: 'root' })
export class KanbanActions {
  private readonly kanban = inject(KanbanStore);
  private readonly store = inject(ReviewStore);
  private readonly noteDone = inject(NoteDone);
  private readonly toasts = inject(Toasts);

  /**
   * Leva a anotação para a coluna, na posição `index` dela (no fim, sem `index`). Só a anotação da
   * categoria do quadro entra nele: a de outra categoria (ou sem nenhuma) fica onde está.
   */
  move(boardId: string, note: string, column: string, index?: number): void {
    const board = this.kanban.get(boardId);
    const r = this.store.get(note);
    if (!board || !r || !belongs(board, r)) return;
    const before = board.cards.find((c) => c.note === note) ?? null;
    const beforeIndex = before ? cardsIn(board, before.column).findIndex((c) => c.note === note) : -1;
    this.kanban.update(boardId, (b, at) => placeCard(b, note, column, at, index));
    const change = doneChange(board, before?.column ?? null, column);
    const wasDone = isDone(r);
    if (change === 'finalizar' && !wasDone) this.noteDone.set(note, true, { quiet: true });
    else if (change === 'abrir' && wasDone) this.noteDone.set(note, false, { quiet: true });
    else return;
    const col = board.columns.find((c) => c.id === column);
    const text = change === 'finalizar' ? `“${r.game.name}” finalizada em ${col?.name ?? 'outra coluna'}` : `“${r.game.name}” aberta de novo em ${col?.name ?? 'outra coluna'}`;
    this.toasts.show(text, {
      label: 'Desfazer',
      run: () => {
        if (before) this.kanban.update(boardId, (b, at) => placeCard(b, note, before.column, at, beforeIndex));
        else this.kanban.update(boardId, (b, at) => removeCard(b, note, at));
        this.noteDone.set(note, wasDone, { quiet: true });
      },
    });
  }

  /** Tira a anotação do quadro (ela continua no mural), com Desfazer. */
  remove(board: KanbanBoard, note: string): void {
    const card = board.cards.find((c) => c.note === note);
    if (!card) return;
    const index = cardsIn(board, card.column).findIndex((c) => c.note === note);
    const name = this.store.get(note)?.game.name ?? 'A anotação';
    this.kanban.update(board.id, (b, at) => removeCard(b, note, at));
    this.toasts.show(`“${name}” saiu do quadro (continua no mural)`, {
      label: 'Desfazer',
      run: () =>
        this.kanban.update(board.id, (b, at) => {
          const back = placeCard(b, note, card.column, at, index);
          return { ...back, cards: back.cards.map((c) => (c.note === note ? { ...card } : c)) };
        }),
    });
  }
}
