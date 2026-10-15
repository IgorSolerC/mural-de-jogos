import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CardFinder } from './card-finder';
import { Colleague, ColleagueStore } from './colleague-store';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';

function card(id: string, name: string, kind = 'jogos'): Review {
  return sanitizeReview({
    id,
    kind,
    game: { name, coverUrl: null, source: 'manual' },
    scores: { diversao: 8, historia: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    text: '',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  })!;
}

function colleague(id: string, reviews: Review[]): Colleague {
  return { id, name: 'Ana', fileName: 'ana.json', loadedAt: '2026-10-01T10:00:00.000Z', reviews, categoryLooks: { viagens: { color: 'azul' } } } as unknown as Colleague;
}

describe('o achador das fichas coladas (o widget Nota)', () => {
  let finder: CardFinder;
  let store: ReviewStore;
  let colleagues: ColleagueStore;
  let settings: Settings;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    finder = TestBed.inject(CardFinder);
    store = TestBed.inject(ReviewStore);
    colleagues = TestBed.inject(ColleagueStore);
    settings = TestBed.inject(Settings);
  });

  afterEach(() => localStorage.clear());

  it('acha a sua pelo id, de qualquer mural, com as suas cores e o seu modo sem spoilers', () => {
    store.reviews.set([card('rlivro1', 'O Hobbit', 'livros'), card('rjogo1', 'Celeste')]);
    settings.noSpoilers.set(true);
    const f = finder.find('rlivro1')!;
    expect(f.review.game.name).toBe('O Hobbit');
    expect(f.mine).toBeTrue();
    expect(f.masked).toBeTrue();
    expect(finder.find('')).toBeNull();
    expect(finder.find('rnenhuma')).toBeNull();
  });

  it('a do mural de outra pessoa: as cores dela, e em segredo a obra que você ainda não resenhou', async () => {
    await colleagues.ready;
    store.reviews.set([card('rmeu', 'Celeste')]);
    colleagues.colleagues.set([colleague('c1', [card('rdela1', 'Hades'), card('rdela2', 'Celeste')])]);
    settings.friendSpoilers.set(true);
    const hades = finder.find('rdela1')!;
    expect(hades.mine).toBeFalse();
    expect(hades.looks).toEqual({ viagens: { color: 'azul' } } as never);
    expect(hades.masked).toBeTrue();
    // a que você também resenhou aparece
    expect(finder.find('rdela2')!.masked).toBeFalse();
  });

  it('a sua vem antes de um mural guardado que tem a mesma (o backup do seu próprio mural)', async () => {
    await colleagues.ready;
    store.reviews.set([card('rmesma', 'Agora')]);
    colleagues.colleagues.set([colleague('c1', [card('rmesma', 'Antes')])]);
    expect(finder.find('rmesma')!.review.game.name).toBe('Agora');
  });
});
