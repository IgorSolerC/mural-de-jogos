import { InjectionToken, Signal, computed, inject } from '@angular/core';
import { Colleague } from './colleague-store';
import { NoteLinks, notesOf, resolveNote } from './note-links';
import { OwnNoteLinks } from './own-note-links';
import { Review } from './review';
import { ReviewStore } from './review-store';
import { CardFront } from './study';
import { StudyStore } from './study-store';

/**
 * De onde as peças dos Flashcards leem uma carta (a parede do baralho, o verso e a carta maximizada: ui/study-card-wall.ts,
 * ui/study-card-back.ts, ui/study-card-focus.ts). As mesmas peças servem os seus Flashcards e os de quem você visita
 * (a regra "Visita: as mesmas peças do dono", no CLAUDE.md): só a fonte muda.
 *
 * Só leitura, de propósito: nada aqui escreve, então a parede da visita não tem como mexer em nada (nem no que é seu,
 * nem no que é da pessoa). O que só o dono faz (editar, estudar, tirar do baralho) fica na página dele.
 */
export interface StudySource {
  /** A carta da anotação, com a frente (undefined: não é carta aqui). Lida num computed, acompanha. */
  card(note: string): { front: CardFront } | undefined;
  /** A anotação da carta. */
  note(id: string): Review | undefined;
  /** Os links do texto do verso da carta `from` ("[[título]]", a ficha colada, o lembrete). */
  links(from: string): NoteLinks;
}

/** Os seus Flashcards: as suas cartas e anotações, com os links de toda anotação sua (core/own-note-links.ts). */
export const STUDY_SOURCE = new InjectionToken<StudySource>('STUDY_SOURCE', {
  providedIn: 'root',
  factory: (): StudySource => {
    const study = inject(StudyStore);
    const store = inject(ReviewStore);
    const links = inject(OwnNoteLinks);
    return { card: (note) => study.cardOf().get(note), note: (id) => store.get(id), links: (from) => links.of(from) };
  },
});

/**
 * Os Flashcards de quem se visita: as cartas públicas dela e as anotações que vieram com elas (as do mural e as só dos
 * Estudos). Os links do verso acham entre as anotações dela e abrem na leitura da visita (`open`); criar uma anotação
 * e o lembrete são do dono e não existem aqui (como na leitura de quem se visita, ui/review-reader.ts).
 */
export function colleagueStudySource(who: Signal<Colleague>, open: (note: Review) => void): StudySource {
  const cards = computed(() => new Map((who().estudos?.cards ?? []).map((c) => [c.note, c])));
  const notes = computed(() => {
    const c = who();
    return new Map([...c.reviews, ...(c.studyNotes ?? [])].map((r) => [r.id, r]));
  });
  const linkable = computed(() => notesOf([...notes().values()]));
  return {
    card: (note) => cards().get(note),
    note: (id) => notes().get(id),
    links: () => {
      const list = linkable();
      return { resolve: (title) => resolveNote(list, title), open, openCard: open };
    },
  };
}
