import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Mural } from './mural';
import { sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { SideBySide } from './side-by-side';

const r = (id: string, kind: string) =>
  sanitizeReview({ id, kind, game: { name: id }, scores: { historia: 5, diversao: 5, jogabilidade: 5, visual: 5, envolvimento: 5, personagens: 5, escrita: 5 } })!;

describe('SideBySide', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => localStorage.clear());

  it('a seleção de antes dos murais (uma lista só) vira a dos jogos', () => {
    localStorage.setItem('mural-de-jogos:lado-a-lado:v1', JSON.stringify(['rjogo01', 'rjogo02']));
    const store = TestBed.inject(ReviewStore);
    store.reviews.set([r('rjogo01', 'jogos'), r('rjogo02', 'jogos'), r('rlivr01', 'livros')]);
    const side = TestBed.inject(SideBySide);
    expect(side.reviews().map((x) => x.id)).toEqual(['rjogo01', 'rjogo02']);
    TestBed.inject(Mural).kind.set('livros');
    expect(side.count()).toBe(0);
  });

  it('cada mural tem a sua seleção, e limpar uma não mexe na outra', () => {
    const store = TestBed.inject(ReviewStore);
    store.reviews.set([r('rjogo01', 'jogos'), r('rlivr01', 'livros')]);
    const mural = TestBed.inject(Mural);
    const side = TestBed.inject(SideBySide);
    side.toggle('rjogo01');
    mural.kind.set('livros');
    side.toggle('rlivr01');
    side.clear();
    mural.kind.set('jogos');
    expect(side.reviews().map((x) => x.id)).toEqual(['rjogo01']);
  });
});
