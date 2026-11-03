import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KanbanBoard, boardIdFor } from './kanban';
import { KanbanStore } from './kanban-store';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { StudyStore } from './study-store';

/**
 * O voto de cada lugar sobre o mural (PLANO-ESTUDOS.md, 4.4): a anotação sai do mural só quando todo lugar
 * que a tem (o Kanban, os Estudos) diz "só aqui"; algum dizendo "no mural também", ela fica.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const TRAB = boardIdFor('trabalho');
const note = (id: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', game: { name: id }, category: 'Trabalho', completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!, id });

function board(cards: { note: string; wall?: boolean }[]): KanbanBoard {
  return {
    id: TRAB,
    category: 'trabalho',
    at: T0,
    columns: [{ id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false }],
    cards: cards.map((c) => ({ column: 'afazer', importance: null, ...c })),
  };
}

describe('o voto do mural: Kanban e Estudos', () => {
  let kanban: KanbanStore;
  let study: StudyStore;
  let deck: string;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set(['nlivre', 'nkb', 'nest', 'nambos', 'nkbmural', 'nestmural', 'napagada'].filter((n) => n !== 'napagada').map(note));
    kanban = TestBed.inject(KanbanStore);
    study = TestBed.inject(StudyStore);
    // no Kanban: só no Kanban (o padrão do grupo), nkbmural pedindo o mural também
    kanban.state.set({ boards: [board([{ note: 'nkb' }, { note: 'nambos' }, { note: 'nkbmural', wall: true }, { note: 'nestmural' }])], removed: {}, legacy: [] });
    // nos Estudos: só nos Estudos (o padrão do baralho), nestmural pedindo o mural também
    deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nest', [deck]);
    study.addCard('nambos', [deck]);
    study.addCard('nkbmural', [deck]);
    study.addCard('nestmural', [deck], {}, true);
    study.addCard('napagada', [deck]);
  });

  afterEach(() => localStorage.clear());

  it('fora do mural só quando todo lugar que a tem diz "só aqui"', () => {
    const off = kanban.boardOnly();
    // em nenhum lugar: no mural
    expect(off.has('nlivre')).toBeFalse();
    // só no Kanban / só nos Estudos / nos dois, todos dizendo "só aqui": fora
    expect(off.has('nkb')).toBeTrue();
    expect(off.has('nest')).toBeTrue();
    expect(off.has('nambos')).toBeTrue();
    // um lugar pedindo o mural basta (o Kanban, ou os Estudos)
    expect(off.has('nkbmural')).toBeFalse();
    expect(off.has('nestmural')).toBeFalse();
    // a carta de anotação apagada não vota
    expect(off.has('napagada')).toBeFalse();
  });

  it('por causa de quem: o Kanban, os Estudos ou os dois; e as só dos Estudos à parte', () => {
    expect(kanban.offBy('nkb')).toBe('kanban');
    expect(kanban.offBy('nest')).toBe('estudos');
    expect(kanban.offBy('nambos')).toBe('ambos');
    expect(kanban.offBy('nlivre')).toBeNull();
    expect([...kanban.studyOnly()]).toEqual(['nest']);
  });

  it('o baralho que pede o mural traz as cartas dele de volta; saindo dos Estudos, a anotação volta ao mural', () => {
    study.updateDeck(deck, { wall: true });
    expect(kanban.boardOnly().has('nest')).toBeFalse();
    // a do Kanban e dos Estudos: os Estudos pedem o mural, e ela volta
    expect(kanban.boardOnly().has('nambos')).toBeFalse();
    study.updateDeck(deck, { wall: undefined });
    expect(kanban.boardOnly().has('nest')).toBeTrue();
    study.removeCard('nest');
    expect(kanban.boardOnly().has('nest')).toBeFalse();
  });
});
