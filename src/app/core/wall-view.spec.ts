import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { WallView } from './wall-view';

function r(id: string, name: string, completedAt: string | null, diversao: number, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    game: { name },
    scores: { historia: 5, diversao, jogabilidade: 5, visual: 5 },
    status: 'finalizado',
    completedAt,
    createdAt: '2024-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

describe('WallView', () => {
  let store: ReviewStore;
  let view: WallView;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    view = TestBed.inject(WallView);
    store.reviews.set([
      r('raaaa1', 'Zelda', '2024-03-10', 9, { verdict: 'masterpiece' }),
      r('rbbbb1', 'Alan Wake', '2024-03-02', 4, { status: 'incompleto' }),
      r('rcccc1', 'Hades', '2024-01-20', 7, { text: 'roguelike viciante' }),
      r('rdddd1', 'Celeste', null, 8),
    ]);
  });

  afterEach(() => localStorage.clear());

  it('por data: mais recentes primeiro, sem data sempre no fim, em seções por mês', () => {
    view.setSort('data');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda', 'Alan Wake', 'Hades', 'Celeste']);
    expect(view.groups().map((g) => g.label)).toEqual(['Março de 2024', 'Janeiro de 2024', 'Data não definida']);
    view.toggleDirection();
    expect(view.visible().map((x) => x.game.name)).toEqual(['Hades', 'Alan Wake', 'Zelda', 'Celeste']);
  });

  it('por nome, de A a Z, em seções por letra', () => {
    view.setSort('alfabetica');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Alan Wake', 'Celeste', 'Hades', 'Zelda']);
    expect(view.groups().map((g) => g.label)).toEqual(['A', 'C', 'H', 'Z']);
  });

  it('por nota: maiores primeiro, em faixas', () => {
    view.setSort('nota');
    view.scoreKey.set('diversao');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda', 'Celeste', 'Hades', 'Alan Wake']);
  });

  it('busca no nome e no texto, sem ligar para acento', () => {
    view.query.set('ROGUÉLIKE');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Hades']);
  });

  it('filtra por veredito e conta cada um', () => {
    view.verdict.set('masterpiece');
    expect(view.visible().map((x) => x.game.name)).toEqual(['Zelda']);
    expect(view.verdictCounts().sem).toBe(3);
    expect(view.isFiltered()).toBeTrue();
  });
});
