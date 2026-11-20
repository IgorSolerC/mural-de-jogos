import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ReviewStore } from './review-store';
import { Review, sanitizeReview } from './review';
import { DEFAULT_FSRS, review } from './fsrs';
import { thawSrs } from './study';
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

  it('a resposta de um pedido da API a uma carta parada num baralho pausado conta como se a pausa não existisse', () => {
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck]);
    const DAY = 86_400_000;
    const since = new Date(Date.now() - 10 * DAY);
    // respondida 13 dias atrás com volta em 3 dias (3 dias antes da pausa), e pausada há 10
    const srs = { state: 'revisao' as const, step: 0, s: 3, d: 5, due: new Date(since.getTime() + 3 * DAY).toISOString(), last: new Date(since.getTime() - 3 * DAY).toISOString(), reps: 3 };
    study.state.update((st) => ({ ...st, cards: st.cards.map((c) => ({ ...c, srs })), decks: st.decks.map((d) => ({ ...d, paused: since.toISOString(), pauseAt: since.toISOString() })) }));
    const shown = study.shown(study.cardOf().get('nsol')!);
    expect(Date.parse(shown.srs.last!)).toBeGreaterThan(Date.parse(srs.last));
    const when = new Date();
    study.answerAt('nsol', true, when, deck);
    const after = study.cardOf().get('nsol')!.srs;
    // a mesma conta de responder a carta andada (3 dias depois da última resposta), e não 13 dias depois
    expect(after).toEqual(review(thawSrs(srs, since.toISOString(), when), 3, when, DEFAULT_FSRS, 'nsol'));
    expect(after.s).not.toBe(review(srs, 3, when, DEFAULT_FSRS, 'nsol').s);
  });

  it('recomeçar o baralho e o Desfazer: o progresso volta como estava, sem desfazer o que mudou depois na carta', () => {
    const deck = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [deck], { title: '日' });
    study.addCard('nlua', [deck]);
    study.answer('nsol', true, deck);
    expect(study.progressIn(deck)).toEqual({ count: 1, shared: 0 });
    const before = study.cardOf().get('nsol')!;
    const out = study.resetDeck(deck)!;
    expect(out.count).toBe(1);
    expect(study.cardOf().get('nsol')!.srs.state).toBe('nova');
    expect(study.progressIn(deck)).toEqual({ count: 0, shared: 0 });
    expect(study.resetDeck(deck)).toBeNull();
    study.updateFront('nsol', { title: '太陽' });
    out.undo();
    const back = study.cardOf().get('nsol')!;
    expect(back.srs).toEqual(before.srs);
    expect(back.stats).toEqual(before.stats);
    expect(back.front.title).toBe('太陽');
    // depois de pausar (ou retomar), o Desfazer não traz o progresso de antes, que não andou o tempo da pausa
    const again = study.resetDeck(deck)!;
    study.pauseDeck(deck);
    again.undo();
    expect(study.cardOf().get('nsol')!.srs.state).toBe('nova');
  });

  it('a carta parada que entra num baralho em estudo anda o tempo em que ficou parada (não volta atrasada a pausa inteira)', () => {
    const kanji = study.addDeck('Kanjis', 'amarelo');
    const kana = study.addDeck('Kana', 'azul');
    study.addCard('nsol', [kanji]);
    const DAY = 86_400_000;
    const since = new Date(Date.now() - 20 * DAY);
    const srs = { state: 'revisao' as const, step: 0, s: 6, d: 5, due: new Date(since.getTime() + 3 * DAY).toISOString(), last: new Date(since.getTime() - 3 * DAY).toISOString(), reps: 3 };
    study.state.update((st) => ({
      ...st,
      cards: st.cards.map((c) => ({ ...c, srs })),
      decks: st.decks.map((d) => (d.id === kanji ? { ...d, paused: since.toISOString(), pauseAt: since.toISOString() } : d)),
    }));
    const shown = study.shown(study.cardOf().get('nsol')!).srs;
    study.setDecks('nsol', [kanji, kana]);
    const now = study.cardOf().get('nsol')!.srs;
    expect(now.due).toBe(shown.due);
    expect(now.due).not.toBe(srs.due);
  });

  it('tirar de um baralho só: os outros ficam, e o de outro grupo em que a carta dorme também', () => {
    const kanji = study.addDeck('Kanjis', 'amarelo', null, undefined, 'Estudos');
    const verbos = study.addDeck('Verbos', 'verde', null, undefined, 'Estudos');
    const velho = study.addDeck('Antigo', 'azul', null, undefined, 'Trabalho');
    study.addCard('nsol', [kanji, verbos]);
    // a carta dorme num baralho do grupo de antes
    study.state.update((st) => ({ ...st, cards: st.cards.map((c) => (c.note === 'nsol' ? { ...c, decks: [...c.decks, velho] } : c)) }));
    study.leaveDeck('nsol', kanji);
    expect(study.state().cards.find((c) => c.note === 'nsol')!.decks).toEqual([verbos, velho]);
    study.leaveDeck('nsol', verbos);
    // à vista em nenhum baralho, mas ainda guardada (dormindo) no do outro grupo
    expect(study.cardOf().get('nsol')?.decks ?? []).toEqual([]);
    expect(study.state().cards.find((c) => c.note === 'nsol')!.decks).toEqual([velho]);
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
