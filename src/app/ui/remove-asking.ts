import { Injectable, inject } from '@angular/core';
import { Reminder, addDays, dayAndMonth, occurrenceStart, rangeLabel, repeatShort, spanOf } from '../core/calendar';
import { CalendarStore } from '../core/calendar-store';
import { cardsIn, removeColumn } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { Entry, monthLabel, monthOfDay, shiftMonth } from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { StudyStore } from '../core/study-store';
import { Confirm } from './confirm';
import { ICON } from './icons';
import { Toasts } from './toast';

/**
 * O que tirar a coluna faz com o check das anotações que vão para a vizinha: nada (ir para lá não é
 * arrastar), e a frase diz isso quando a vizinha finaliza e esta não, ou o contrário.
 */
function keeps(from: boolean, to: boolean): string {
  if (from && !to) return ', e as finalizadas continuam finalizadas';
  if (!from && to) return ', e as abertas continuam abertas';
  return '';
}

/**
 * As perguntas de apagar, uma de cada coisa, com o Desfazer depois: as mesmas na folha dela e no menu do
 * botão direito (ui/context-menu.ts). Cada uma devolve se apagou; `before` roda depois do sim e antes de
 * apagar (a folha fecha antes, para não ler o que acabou de sair).
 */
@Injectable({ providedIn: 'root' })
export class RemoveAsking {
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  private readonly study = inject(StudyStore);
  private readonly kanban = inject(KanbanStore);
  private readonly calendar = inject(CalendarStore);
  private readonly spending = inject(SpendingStore);

  /**
   * Apaga o baralho: as cartas saem dele, e a que não está em nenhum outro sai dos Estudos (a anotação
   * continua no mural, com o progresso guardado para o Desfazer).
   */
  async deck(id: string, before?: () => void): Promise<boolean> {
    const deck = this.study.deck(id);
    if (!deck) return false;
    const live = this.study.cards().filter((c) => c.decks.includes(id) && this.study.live(c.note));
    const count = live.length;
    const only = live.filter((c) => c.decks.length === 1).length;
    const yes = await this.confirm.ask({
      title: `Apagar o baralho ${deck.name}?`,
      text: count
        ? `${count === 1 ? 'O flashcard sai' : `Os ${count} flashcards saem`} dele${only ? `; ${only === count ? (only === 1 ? 'ele não está' : 'eles não estão') : `${only} não ${only === 1 ? 'está' : 'estão'}`} em outro baralho e ${only === 1 ? 'sai' : 'saem'} dos Flashcards, com o progresso` : ''}. Nenhuma anotação é apagada.`
        : 'Ele está vazio. Nenhuma anotação é apagada.',
      confirm: 'Apagar o baralho',
      cancel: 'Deixar',
      icon: ICON.apagar,
    });
    if (!yes || !this.study.deck(id)) return false;
    before?.();
    const undo = this.study.removeDeck(id);
    if (undo) this.toasts.show(`O baralho ${deck.name} foi apagado`, { label: 'Desfazer', run: undo });
    return true;
  }

  /**
   * Tira o flashcard do baralho, com o Desfazer. No único baralho dele, ele sai dos Flashcards (a anotação
   * continua): o já visto pergunta antes, porque o progresso sai junto.
   */
  async card(note: string, deckId: string, title: string): Promise<boolean> {
    const before = this.study.state().cards.find((c) => c.note === note);
    const deck = this.study.deck(deckId);
    if (!before || !deck) return false;
    // os baralhos que ficam à vista (os do grupo dela); os de outro grupo em que ela dorme ficam guardados
    const rest = (this.study.cardOf().get(note)?.decks ?? []).filter((d) => d !== deckId);
    const sleeping = before.decks.some((d) => d !== deckId && !rest.includes(d));
    if (!rest.length && !sleeping && before.stats.seen) {
      const yes = await this.confirm.ask({
        title: 'Tirar dos Flashcards?',
        text: `${deck.name} é o único baralho dele, e ele já foi visto ${before.stats.seen === 1 ? '1 vez' : `${before.stats.seen} vezes`}: o progresso sai junto. A anotação continua.`,
        confirm: 'Tirar dos Flashcards',
        cancel: 'Deixar',
        icon: ICON.apagar,
      });
      if (!yes || !this.study.cardOf().has(note)) return false;
    }
    this.study.leaveDeck(note, deckId);
    this.toasts.show(rest.length ? `“${title}” saiu de ${deck.name}` : `“${title}” saiu dos Flashcards`, { label: 'Desfazer', run: () => this.study.restoreCard(before) });
    return true;
  }

  /** Tira a coluna: as anotações dela vão para a vizinha (a da esquerda, ou a da direita), com Desfazer. */
  async column(boardId: string, columnId: string, before?: () => void): Promise<boolean> {
    const board = this.kanban.get(boardId);
    const index = board?.columns.findIndex((c) => c.id === columnId) ?? -1;
    if (!board || index < 0 || board.columns.length <= 1) return false;
    const col = board.columns[index];
    const into = board.columns[index - 1] ?? board.columns[index + 1];
    // (só as que estão no quadro de verdade: a apagada, ou levada para outro grupo, não conta)
    const count = cardsIn({ ...board, cards: this.kanban.live(board) }, col.id).length;
    const yes = await this.confirm.ask({
      title: `Tirar a coluna ${col.name}?`,
      text: count
        ? `${count === 1 ? 'A anotação dela vai' : `As ${count} anotações dela vão`} para ${into.name}. Nenhuma anotação sai do mural${keeps(col.finishes, into.finishes)}.`
        : 'Ela está vazia. Nenhuma anotação sai do mural.',
      confirm: 'Tirar a coluna',
      cancel: 'Deixar',
      icon: ICON.apagar,
    });
    const now = this.kanban.get(boardId);
    if (!yes || !now?.columns.some((c) => c.id === columnId) || !now.columns.some((c) => c.id === into.id)) return false;
    before?.();
    this.kanban.update(boardId, (b, at) => removeColumn(b, columnId, into.id, at));
    this.toasts.show(`A coluna ${col.name} saiu do quadro`, { label: 'Desfazer', run: () => this.kanban.restore(now) });
    return true;
  }

  /**
   * Apaga o lembrete, com o Desfazer. O que se repete pergunta se é só a vez que passa por `day` (tirada
   * da repetição) ou todas.
   */
  async reminder(r: Reminder, day: string, before?: () => void): Promise<boolean> {
    const name = `“${r.title}”`;
    // a vez aberta: num de vários dias, a que passa pelo dia de onde se pediu
    const at = occurrenceStart(r, day);
    if (r.repeat && at) {
      const many = spanOf(r) > 1;
      const which = many ? `a de ${rangeLabel(at, addDays(at, spanOf(r) - 1))}` : `o de ${dayAndMonth(at)}`;
      const choice = await this.confirm.choose({
        title: 'Apagar o lembrete?',
        text: `${name} se repete (${repeatShort(r)}). Apagar só ${which}, ou ${many ? 'todas' : 'todos'}?`,
        confirm: many ? 'Apagar todas' : 'Apagar todos',
        secondary: many ? 'Só esta vez' : 'Só neste dia',
      });
      if (!choice) return false;
      if (choice === 'secondary') {
        before?.();
        this.calendar.skipDay(r.id, at);
        this.toasts.show(many ? `${name} saiu de ${rangeLabel(at, addDays(at, spanOf(r) - 1))}` : `${name} saiu de ${dayAndMonth(at)}`, {
          label: 'Desfazer',
          run: () => this.calendar.restore(r),
        });
        return true;
      }
    } else {
      const sure = await this.confirm.ask({ title: 'Apagar o lembrete?', text: `${name} sai do calendário. As anotações anexadas continuam no mural.`, confirm: 'Apagar' });
      if (!sure) return false;
    }
    before?.();
    this.calendar.remove(r.id);
    this.toasts.show(`${name} saiu do calendário`, { label: 'Desfazer', run: () => this.calendar.restore(r) });
    return true;
  }

  /**
   * Apaga um lançamento dos Gastos, visto no mês `month`. O fixo, depois do mês em que nasceu, pergunta
   * se para dali em diante ou sai só daquele mês (os meses de antes continuam com ele); o resto apaga
   * direto. Sempre com o Desfazer.
   */
  async entry(e: Entry, month: string): Promise<boolean> {
    const name = monthLabel(month).split(' de ')[0];
    if (e.monthly && month > monthOfDay(e.date)) {
      const choice = await this.confirm.choose({
        title: `Apagar “${e.title}”?`,
        text: 'Ele se repete todo mês. Os meses de antes continuam com ele.',
        confirm: `De ${name} em diante`,
        secondary: `Só em ${name}`,
      });
      if (!choice) return false;
      const before = { ...e };
      if (choice === 'confirm') this.spending.stopBefore(e.id, month);
      else this.spending.skipMonth(e.id, month);
      this.toasts.show(choice === 'confirm' ? `“${e.title}” parou em ${monthLabel(shiftMonth(month, -1)).split(' de ')[0]}` : `“${e.title}” saiu de ${name}`, {
        label: 'Desfazer',
        run: () => this.spending.restore(before),
      });
      return true;
    }
    const gone = this.spending.remove(e.id);
    if (gone) this.toasts.show(`“${e.title}” apagado`, { label: 'Desfazer', run: () => this.spending.restore(gone) });
    return true;
  }
}
