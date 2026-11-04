import { Injectable, inject } from '@angular/core';
import { Desk } from './desk';
import { NoteLinks, resolveNote } from './note-links';
import { ReminderLinks } from './reminder-links';
import { ReviewStore } from './review-store';

/**
 * Os links do texto de uma anotação do seu mural, os mesmos em toda tela que a mostra inteira (a ficha
 * do mural, o verso da carta nos Estudos): "[[título]]" acha a anotação e abre na leitura, com a de
 * origem (`from`) no "Voltar"; o que não existe se cria; a ficha colada (o widget Nota) abre na leitura;
 * o link de lembrete mostra o dia e abre o Calendário.
 *
 * Sem os links, o texto desenha os colchetes como foram escritos (o jeito das resenhas): toda tela que
 * mostra uma anotação sua passa estes, para o texto sair igual em todo lugar.
 *
 * Lido dentro de um computed, acompanha as anotações (um link para uma apagada vira tracejado).
 */
@Injectable({ providedIn: 'root' })
export class OwnNoteLinks {
  private readonly store = inject(ReviewStore);
  private readonly desk = inject(Desk);
  private readonly reminderLinks = inject(ReminderLinks);

  of(from: string): NoteLinks {
    const notes = this.store.notes();
    return {
      resolve: (title) => resolveNote(notes, title),
      open: (n) => this.desk.openReview(n.id, from),
      create: (title) => this.desk.newNote(title, from),
      // a ficha colada no texto (o widget Nota), de qualquer mural: abre na leitura, com esta no "Voltar"
      openCard: (card) => this.desk.openReview(card.id, from),
      // o link de lembrete: o Calendário abre no dia dele, com ele em destaque
      reminder: (id) => this.reminderLinks.info(id),
      openReminder: (id) => this.reminderLinks.open(id),
    };
  }
}
