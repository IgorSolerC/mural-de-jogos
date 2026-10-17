import { Injectable, inject } from '@angular/core';
import { KanbanBoard, belongs, cardsIn, doneChange, placeCard, placeCards, removeCard } from './kanban';
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

  /**
   * Leva as anotações marcadas juntas para a coluna, na ordem dada, antes de `before` (ou no fim),
   * finalizando ou abrindo de novo as que a coluna pede. Um bilhete só, com um Desfazer que devolve
   * todas para onde estavam, com o check de antes.
   */
  moveMany(boardId: string, notes: readonly string[], column: string, before: string | null): void {
    const board = this.kanban.get(boardId);
    if (!board) return;
    const rs = notes.map((n) => this.store.get(n)).filter((r) => !!r && belongs(board, r));
    if (!rs.length) return;
    // onde cada uma estava, na ordem do quadro (para voltar uma a uma, cada uma no lugar dela)
    const was = rs
      .map((r) => {
        const card = board.cards.find((c) => c.note === r!.id) ?? null;
        return {
          note: r!.id,
          column: card?.column ?? null,
          index: card ? cardsIn(board, card.column).findIndex((c) => c.note === r!.id) : -1,
          order: card ? board.cards.indexOf(card) : Infinity,
          done: isDone(r!),
        };
      })
      .sort((a, b) => a.order - b.order);
    this.kanban.update(boardId, (b, at) => placeCards(b, rs.map((r) => r!.id), column, at, before));
    if (this.kanban.get(boardId) === board) return;
    let finished = 0;
    let opened = 0;
    for (const w of was) {
      const change = doneChange(board, w.column, column);
      if (change === 'finalizar' && !w.done) {
        this.noteDone.set(w.note, true, { quiet: true });
        finished++;
      } else if (change === 'abrir' && w.done) {
        this.noteDone.set(w.note, false, { quiet: true });
        opened++;
      }
    }
    const where = board.columns.find((c) => c.id === column)?.name ?? 'outra coluna';
    const n = rs.length;
    const text = finished
      ? `${finished === 1 ? '1 anotação finalizada' : `${finished} anotações finalizadas`} em ${where}`
      : opened
        ? `${opened === 1 ? '1 anotação aberta' : `${opened} anotações abertas`} de novo em ${where}`
        : `${n} anotações levadas para ${where}`;
    this.toasts.show(text, {
      label: 'Desfazer',
      run: () => {
        for (const w of was) {
          if (w.column) this.kanban.update(boardId, (b, at) => placeCard(b, w.note, w.column!, at, w.index));
          else this.kanban.update(boardId, (b, at) => removeCard(b, w.note, at));
          const r = this.store.get(w.note);
          if (r && isDone(r) !== w.done) this.noteDone.set(w.note, w.done, { quiet: true });
        }
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
