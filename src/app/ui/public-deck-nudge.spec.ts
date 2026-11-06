import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { StudyStore } from '../core/study-store';
import { PublicDeckNudge } from './public-deck-nudge';
import { Toasts } from './toast';

/** O aviso da carta privada que entra num baralho público. */

const T = '2026-10-20T12:00:00.000Z';
const note = (id: string, name: string, extra: Partial<Review> = {}): Review => ({
  ...sanitizeReview({ id, kind: 'anotacoes', category: 'Estudos', game: { name, coverUrl: null, source: 'manual' }, scores: { final: 0 }, status: 'finalizado', completedAt: '2026-10-20', createdAt: T, updatedAt: T })!,
  ...extra,
});

describe('O aviso da carta privada num baralho público (PublicDeckNudge)', () => {
  let study: StudyStore;
  let store: ReviewStore;
  let nudge: PublicDeckNudge;
  let toasts: Toasts;
  let open: string;
  let closed: string;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    store.reviews.set([note('nsol', 'Sol', { private: true }), note('nlua', 'Lua'), note('nmar', 'Mar', { private: true })]);
    spyOn(store, 'sharedIds').and.returnValue(new Set(['nmar']));
    study = TestBed.inject(StudyStore);
    nudge = TestBed.inject(PublicDeckNudge);
    toasts = TestBed.inject(Toasts);
    open = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    study.updateDeck(open, { public: true });
    closed = study.addDeck('Kana', 'azul', null, undefined, 'Estudos');
  });

  afterEach(() => {
    toasts.dismiss();
    localStorage.clear();
  });

  it('a privada que entra num baralho público pergunta', () => {
    study.addCard('nsol', [open]);
    expect(nudge.afterEntering('nsol', [])).toBeTrue();
    expect(toasts.current()!.text).toBe('Esta anotação é privada, mas o baralho dela é público. Quer deixá-la pública?');
    expect(toasts.current()!.action!.label).toBe('Tornar pública');
  });

  it('não pergunta: a pública, o baralho privado, e a que já estava nele', () => {
    study.addCard('nlua', [open]);
    expect(nudge.afterEntering('nlua', [])).toBeFalse();
    study.addCard('nsol', [closed]);
    expect(nudge.afterEntering('nsol', [])).toBeFalse();
    // agora entrou no público, e só por isso pergunta; salvar de novo não pergunta outra vez
    study.setDecks('nsol', [closed, open]);
    expect(nudge.afterEntering('nsol', [closed])).toBeTrue();
    expect(nudge.afterEntering('nsol', [closed, open])).toBeFalse();
  });

  it('não pergunta na compartilhada (quem vê nela muda em Compartilhar) nem sem a carta', () => {
    study.addCard('nmar', [open]);
    expect(nudge.afterEntering('nmar', [])).toBeFalse();
    expect(nudge.afterEntering('nsol', [])).toBeFalse();
    expect(toasts.current()).toBeNull();
  });

  it('Tornar pública: fora do Feed, com Desfazer', () => {
    study.addCard('nsol', [open]);
    nudge.afterEntering('nsol', []);
    toasts.current()!.action!.run();
    const pub = store.get('nsol')!;
    expect(pub.private).toBeUndefined();
    expect(pub.quiet).toBeTrue();
    expect(toasts.current()!.text).toContain('“Sol” agora é pública');
    toasts.current()!.action!.run();
    expect(store.get('nsol')!.private).toBeTrue();
  });
});
