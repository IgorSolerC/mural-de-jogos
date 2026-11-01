import { Injectable, inject } from '@angular/core';
import { CardFinder } from './card-finder';
import { ReminderLinks } from './reminder-links';
import { CopyContext } from './widgets';

/**
 * O que a cópia para fora do site precisa saber (ver `CopyContext` em core/widgets.ts): a hora de agora
 * (o contador em palavras), o título de agora da ficha colada (o widget Nota) e a data do lembrete de um
 * link de lembrete. Um lugar só para o Ctrl+C das marcadas, o menu da anotação, o copiar do Visual e o
 * dos Templates: um campo novo da cópia entra aqui, e vale em todos.
 */
@Injectable({ providedIn: 'root' })
export class CopyContexts {
  private readonly cards = inject(CardFinder);
  private readonly reminders = inject(ReminderLinks);

  /** O contexto da cópia feita agora. */
  now(): CopyContext {
    return { now: Date.now(), cardTitle: (id) => this.cards.find(id)?.review.game.name ?? null, reminderDate: (id) => this.reminders.dateOf(id) };
  }
}
