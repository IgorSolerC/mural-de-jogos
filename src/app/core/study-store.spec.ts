import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReviewStore } from './review-store';
import { Review, sanitizeReview } from './review';
import { STUDY_KEY, StudyStore } from './study-store';

/** Uma anotação de verdade, para a carta ter de onde sair. */
function note(id: string, name: string): Review {
  return sanitizeReview({ id, kind: 'anotacoes', game: { name, coverUrl: null, source: 'manual' }, scores: { final: 0 }, status: 'finalizado', difficulty: 'nenhuma', category: 'Estudos', text: '', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z' })!;
}

describe('os Estudos guardados (core/study-store.ts)', () => {
  let study: StudyStore;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([note('nsol', 'Sol'), note('nlua', 'Lua')]);
    study = TestBed.inject(StudyStore);
  });

  afterEach(() => localStorage.clear());

  it('guarda em meu-mural:estudos:v1 (a limpeza do logout leva pelo prefixo) e lê de volta', () => {
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck], { title: '日' });
    TestBed.tick();
    const saved = JSON.parse(localStorage.getItem(STUDY_KEY)!);
    expect(STUDY_KEY.startsWith('meu-mural:')).toBeTrue();
    expect(saved.cards.map((c: { note: string }) => c.note)).toEqual(['nsol']);
    expect(study.changedAt()).toBeGreaterThan(0);
  });

  it('responder e o Desfazer: a carta e o dia voltam como estavam', () => {
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck]);
    const undo = study.answer('nsol', true, deck)!;
    expect(study.cardOf().get('nsol')!.srs.state).toBe('aprendendo');
    expect(study.state().today!.news).toEqual({ [deck]: 1 });
    undo();
    expect(study.cardOf().get('nsol')!.srs.state).toBe('nova');
    expect(study.cardOf().get('nsol')!.stats.seen).toBe(0);
    expect(study.state().today).toBeNull();
    expect(study.answer('nada', true)).toBeNull();
  });

  describe('o baralho público (PLANO-BARALHOS-PUBLICOS.md)', () => {
    /** Kanjis com Sol (pública), Lua e Mar (privadas); Mar é compartilhada (quem vê muda em Compartilhar). */
    function setup(): { store: ReviewStore; deck: string } {
      const store = TestBed.inject(ReviewStore);
      store.reviews.set([note('nsol', 'Sol'), { ...note('nlua', 'Lua'), private: true }, { ...note('nmar', 'Mar'), private: true }]);
      spyOn(store, 'sharedIds').and.returnValue(new Set(['nmar']));
      const deck = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
      for (const id of ['nsol', 'nlua', 'nmar']) study.addCard(id, [deck]);
      return { store, deck };
    }

    it('conta as cartas de anotação pública: a porcentagem do aviso', () => {
      const { deck } = setup();
      expect(study.share(deck)).toEqual({ total: 3, shown: 1, percent: 33, hidden: ['nlua', 'nmar'] });
    });

    it('tornar todas públicas: fora do Feed, a compartilhada fica, e o Desfazer volta só as que mudaram', () => {
      const { store, deck } = setup();
      const out = study.publishNotes(study.share(deck).hidden);
      expect(out.changed).toBe(1);
      expect(out.skipped).toBe(1);
      const lua = store.get('nlua')!;
      expect(lua.private).toBeUndefined();
      // pública sem ir ao Feed (a setinha "Pregar sem publicar no Feed")
      expect(lua.quiet).toBeTrue();
      expect(store.get('nmar')!.private).toBeTrue();
      expect(study.share(deck).percent).toBe(67);
      out.undo();
      expect(store.get('nlua')!.private).toBeTrue();
      expect(store.get('nlua')!.quiet).toBeUndefined();
      // a que já era pública continua
      expect(store.get('nsol')!.private).toBeUndefined();
    });
  });

  it('apagar o baralho e tirar a carta devolvem o Desfazer', () => {
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck]);
    const undoDeck = study.removeDeck(deck)!;
    expect(study.cards()).toEqual([]);
    undoDeck();
    expect(study.cards().map((c) => c.note)).toEqual(['nsol']);
    const undoCard = study.removeCard('nsol')!;
    expect(study.cards()).toEqual([]);
    undoCard();
    expect(study.cardOf().has('nsol')).toBeTrue();
    expect(study.removeDeck('nada')).toBeNull();
  });

  it('o voto do mural: só a carta de anotação que existe, com baralho que existe', () => {
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck]);
    study.addCard('nlua', [deck], {}, true);
    study.addCard('napagada', [deck]);
    expect([...study.votes()]).toEqual([
      ['nsol', false],
      ['nlua', true],
    ]);
    study.updateDeck(deck, { wall: true });
    expect(study.votes().get('nsol')).toBeTrue();
    expect(study.live('napagada')).toBeFalse();
  });

  it('duas mudanças no mesmo milissegundo continuam em ordem', () => {
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck]);
    const a = study.cardOf().get('nsol')!.at;
    study.updateFront('nsol', { title: '日' });
    expect(study.cardOf().get('nsol')!.at > a).toBeTrue();
  });

  it('outra aba aberta antes da versão nova devolve o baralho sem o estilo: o daqui fica, também quando ela muda o baralho; sair da conta esvazia', () => {
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.updateDeck(deck, { look: 'selo' });
    TestBed.tick();
    const tellOtherTab = () => window.dispatchEvent(new StorageEvent('storage', { key: STUDY_KEY, storageArea: localStorage }));
    // o site mais velho joga fora o campo que não conhece e grava com a mesma hora
    const saved = JSON.parse(localStorage.getItem(STUDY_KEY)!);
    delete saved.decks[0].look;
    localStorage.setItem(STUDY_KEY, JSON.stringify(saved));
    tellOtherTab();
    TestBed.tick();
    expect(study.deck(deck)!.look).toBe('selo');
    // uma mudança de verdade da outra aba vale
    saved.decks[0].name = 'Kanjis do N5';
    saved.decks[0].at = new Date(Date.now() + 60_000).toISOString();
    localStorage.setItem(STUDY_KEY, JSON.stringify(saved));
    tellOtherTab();
    TestBed.tick();
    expect(study.deck(deck)!.name).toBe('Kanjis do N5');
    // o estilo, que a outra aba nem conhece (não o mudou), fica: as duas mudanças se juntam (core/tab-join.ts)
    expect(study.deck(deck)!.look).toBe('selo');
    // a limpeza do logout tira a chave: esta aba fica sem nada
    localStorage.removeItem(STUDY_KEY);
    tellOtherTab();
    TestBed.tick();
    expect(study.decks()).toEqual([]);
  });
});
