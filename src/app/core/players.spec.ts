import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ColleagueStore } from './colleague-store';
import { Mural } from './mural';
import { Players } from './players';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';

function review(id: string, kind: string): Review {
  return sanitizeReview({
    id,
    kind,
    game: { name: id },
    scores: { final: 8 },
    createdAt: '2024-01-01T12:00:00Z',
  })!;
}

describe('Players', () => {
  let players: Players;
  let mural: Mural;

  beforeEach(() => {
    localStorage.clear();
    const colleagues = signal([{ id: 'marina', name: 'Marina', reviews: [review('rjogo01', 'jogos')] }]);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: ColleagueStore, useValue: { colleagues, loading: signal(false) } }],
    });
    TestBed.inject(ReviewStore).importJson(JSON.stringify({ reviews: [review('rmeu001', 'jogos'), review('rlivro1', 'livros')] }), 'replace');
    players = TestBed.inject(Players);
    mural = TestBed.inject(Mural);
    mural.kind.set('jogos');
  });

  afterEach(() => localStorage.clear());

  it('o colega sem nada no mural aberto dá lugar ao seu, e volta no mural em que ele tem fichas', () => {
    players.select('marina');
    expect(players.selected().id).toBe('marina');
    expect(players.setAside()).toBeNull();

    mural.kind.set('livros');
    expect(players.selected().mine).toBeTrue();
    expect(players.selected().reviews.map((r) => r.id)).toEqual(['rlivro1']);
    expect(players.setAside()?.name).toBe('Marina');

    mural.kind.set('jogos');
    expect(players.selected().id).toBe('marina');
  });
});
