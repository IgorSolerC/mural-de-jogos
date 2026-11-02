import { DEFAULT_FSRS, dayStart, freshSrs, review, studyDay } from './fsrs';
import {
  DEFAULT_NEW_PER_DAY,
  MARKS_MAX,
  StudyState,
  addCard,
  addDeck,
  answer,
  cardDecks,
  cleanFront,
  emptyStudy,
  frontTitle,
  hitRate,
  intervalLabel,
  levelOf,
  mergeStudy,
  moveDeck,
  removeCard,
  removeDeck,
  resetCard,
  restoreCard,
  restoreDeck,
  sanitizeStudy,
  setCardWall,
  setConfig,
  setDecks,
  studyOnWall,
  studyToSync,
  updateDeck,
  updateFront,
  whenLabel,
} from './study';

const T0 = '2026-11-02T15:00:00.000Z';
const at = (min: number) => new Date(Date.parse(T0) + min * 60_000).toISOString();
const IMG = 'murall://imagem/abcdefghijklmnopqrstuv';

/** Dois baralhos (Kanjis e Verbos) e três cartas: n1 nos dois, n2 só nos Kanjis, n3 só nos Verbos. */
function sample(): StudyState {
  let st = emptyStudy();
  st = addDeck(st, 'kanjis simples', 'amarelo', T0, null, 'dkanji').state;
  st = addDeck(st, 'Verbos', 'azul', T0, 'livro', 'dverbo').state;
  st = addCard(st, 'n1', ['dkanji', 'dverbo'], { title: '日', subtitle: 'sol, dia' }, at(1));
  st = addCard(st, 'n2', ['dkanji'], {}, at(2));
  st = addCard(st, 'n3', ['dverbo'], { title: 'taberu' }, at(3), true);
  return st;
}

describe('os Estudos (core/study.ts)', () => {
  it('baralhos e cartas: o nome com a primeira maiúscula, 5 novas por dia, a frente sem mexer na caixa', () => {
    const st = sample();
    expect(st.decks.map((d) => [d.id, d.name, d.newPerDay, d.order])).toEqual([
      ['dkanji', 'Kanjis simples', DEFAULT_NEW_PER_DAY, 0],
      ['dverbo', 'Verbos', DEFAULT_NEW_PER_DAY, 1],
    ]);
    expect(DEFAULT_NEW_PER_DAY).toBe(5);
    expect(st.cards.map((c) => c.note)).toEqual(['n1', 'n2', 'n3']);
    expect(st.cards[2].front).toEqual({ title: 'taberu' });
    expect(st.cards[2].wall).toBeTrue();
    expect(st.cards[0].srs.state).toBe('nova');
    expect(cleanFront({ title: '  x²   + 1 ', subtitle: 7, image: 'http://inseguro.com/a.png' })).toEqual({ title: 'x² + 1' });
    expect(cleanFront({ image: IMG }).image).toBe(IMG);
    expect(cleanFront({ image: 'https://exemplo.com/a.png' }).image).toBe('https://exemplo.com/a.png');
    expect(cleanFront({ image: 'javascript:alert(1)' }).image).toBeUndefined();
  });

  it('o título da frente é opcional: sem ele, vale o nome da anotação (D8)', () => {
    const st = sample();
    expect(frontTitle(st.cards[0], 'Sol (日)')).toBe('日');
    expect(frontTitle(st.cards[1], 'Lua (月)')).toBe('Lua (月)');
  });

  it('a mesma anotação de novo entra nos baralhos novos, sem duplicar a carta nem perder o progresso', () => {
    let st = sample();
    st = answer(st, 'n2', true, new Date(at(10)));
    st = addCard(st, 'n2', ['dverbo'], { title: 'outro' }, at(20));
    const n2 = st.cards.filter((c) => c.note === 'n2');
    expect(n2.length).toBe(1);
    expect(n2[0].decks).toEqual(['dkanji', 'dverbo']);
    expect(n2[0].stats.seen).toBe(1);
    expect(n2[0].front).toEqual({});
  });

  it('os baralhos da carta: sem nenhum, ela sai dos Estudos; os que não existem não contam', () => {
    let st = sample();
    st = setDecks(st, 'n1', ['dverbo'], at(5));
    expect(cardDecks(st.cards[0], st.decks).map((d) => d.id)).toEqual(['dverbo']);
    st = setDecks(st, 'n1', [], at(6));
    expect(st.cards.some((c) => c.note === 'n1')).toBeFalse();
    expect(st.removed['card:n1']).toBe(at(6));
    expect(cardDecks({ decks: ['sumido'] }, st.decks)).toEqual([]);
  });

  it('o voto do mural: a escolha da carta, ou algum baralho que pede o mural; sem baralho, não vota', () => {
    let st = sample();
    const card = (n: string) => st.cards.find((c) => c.note === n)!;
    expect(studyOnWall(card('n1'), st.decks)).toBeFalse();
    expect(studyOnWall(card('n3'), st.decks)).toBeTrue();
    st = updateDeck(st, 'dverbo', { wall: true }, at(5));
    expect(studyOnWall(card('n1'), st.decks)).toBeTrue();
    expect(studyOnWall(card('n2'), st.decks)).toBeFalse();
    st = setCardWall(st, 'n1', false, at(6));
    expect(studyOnWall(card('n1'), st.decks)).toBeFalse();
    st = setCardWall(st, 'n1', undefined, at(7));
    expect('wall' in card('n1')).toBeFalse();
    st = updateDeck(st, 'dverbo', { wall: undefined }, at(8));
    expect('wall' in st.decks[1]).toBeFalse();
    expect(studyOnWall({ decks: ['sumido'] }, st.decks)).toBeNull();
  });

  it('mudar a ordem dos baralhos: só os que mudaram de lugar ganham a hora', () => {
    let st = sample();
    st = addDeck(st, 'Locais', 'verde', T0, null, 'dlocal').state;
    st = moveDeck(st, 'dlocal', 0, at(9));
    expect(st.decks.map((d) => d.id)).toEqual(['dlocal', 'dkanji', 'dverbo']);
    expect(st.decks.map((d) => d.at)).toEqual([at(9), at(9), at(9)]);
    st = moveDeck(st, 'dverbo', 1, at(10));
    expect(st.decks.map((d) => d.id)).toEqual(['dlocal', 'dverbo', 'dkanji']);
    expect(st.decks[0].at).toBe(at(9));
  });

  it('apagar um baralho tira só ele das cartas; a que não fica em nenhum sai; o Desfazer traz tudo', () => {
    const st = sample();
    const out = removeDeck(st, 'dkanji', at(10));
    expect(out.state.decks.map((d) => d.id)).toEqual(['dverbo']);
    expect(out.state.cards.map((c) => [c.note, c.decks])).toEqual([
      ['n1', ['dverbo']],
      ['n3', ['dverbo']],
    ]);
    expect(out.state.removed).toEqual({ 'deck:dkanji': at(10), 'card:n2': at(10) });
    const back = restoreDeck(out.state, out.deck!, out.cards, at(11));
    expect(back.decks.map((d) => d.id)).toEqual(['dkanji', 'dverbo']);
    expect(back.cards.map((c) => [c.note, c.decks])).toEqual([
      ['n1', ['dkanji', 'dverbo']],
      ['n2', ['dkanji']],
      ['n3', ['dverbo']],
    ]);
    expect(back.removed).toEqual({});
  });

  it('tirar a carta e o Desfazer; recomeçar o progresso; mudar a frente', () => {
    let st = answer(sample(), 'n2', false, new Date(at(10)));
    const before = st.cards.find((c) => c.note === 'n2')!;
    st = removeCard(st, 'n2', at(11));
    expect(st.cards.some((c) => c.note === 'n2')).toBeFalse();
    st = restoreCard(st, before, at(12));
    expect(st.cards.find((c) => c.note === 'n2')!.stats.wrong).toBe(1);
    st = resetCard(st, 'n2', at(13));
    expect(st.cards.find((c) => c.note === 'n2')!.srs.state).toBe('nova');
    expect(st.cards.find((c) => c.note === 'n2')!.stats).toEqual({ seen: 0, right: 0, wrong: 0, marks: '' });
    st = updateFront(st, 'n2', { title: '月', image: IMG }, at(14));
    expect(st.cards.find((c) => c.note === 'n2')!.front).toEqual({ title: '月', image: IMG });
  });

  it('responder: o FSRS decide, o boletim conta, e o dia anota a nova no baralho que a trouxe', () => {
    let st = sample();
    const now = new Date(at(10));
    st = answer(st, 'n1', true, now, 'dverbo');
    const c = st.cards.find((x) => x.note === 'n1')!;
    expect(c.srs).toEqual(review(freshSrs(at(1)), 3, now, DEFAULT_FSRS, 'n1'));
    expect(c.stats).toEqual({ seen: 1, right: 1, wrong: 0, marks: '1' });
    expect(st.today!.news).toEqual({ dverbo: 1 });
    expect(st.today!.day).toBe(studyDay(now));
    // de um baralho que não é dela: conta no primeiro dela
    st = answer(st, 'n2', false, now, 'dverbo');
    expect(st.today!.news).toEqual({ dverbo: 1, dkanji: 1 });
    // a resposta nos passos não conta como nova nem como revisão
    st = answer(st, 'n1', true, new Date(at(11)));
    expect(st.today!.news).toEqual({ dverbo: 1, dkanji: 1 });
    expect(st.today!.reviews).toBe(0);
  });

  it('as marcas guardam as 20 últimas, e a taxa de acerto', () => {
    let st = sample();
    for (let i = 0; i < 25; i++) st = answer(st, 'n2', i % 3 !== 0, new Date(at(10 + i * 20)));
    const c = st.cards.find((x) => x.note === 'n2')!;
    expect(c.stats.marks.length).toBe(MARKS_MAX);
    expect(c.stats.seen).toBe(25);
    expect(hitRate(c.stats)).toBe(Math.round((c.stats.right / 25) * 100));
    expect(hitRate({ seen: 0, right: 0, wrong: 0, marks: '' })).toBeNull();
  });

  it('o dia vira às 4h: o que entrou ontem não conta hoje', () => {
    let st = answer(sample(), 'n2', true, new Date(2026, 10, 2, 23, 0));
    st = answer(st, 'n3', true, new Date(2026, 10, 3, 3, 30));
    expect(st.today!.news).toEqual({ dkanji: 1, dverbo: 1 });
    st = answer(st, 'n1', true, new Date(2026, 10, 3, 4, 30));
    expect(st.today!.day).toBe('2026-11-03');
    expect(st.today!.news).toEqual({ dkanji: 1 });
  });

  it('os níveis: Desconhecida, Nova nos passos, Aprendendo até 21 dias, Dominada depois', () => {
    const cfg = { ...DEFAULT_FSRS, fuzz: false };
    let srs = freshSrs(T0);
    expect(levelOf(srs)).toBe('desconhecida');
    let t = new Date(2026, 10, 2, 15);
    srs = review(srs, 3, t, cfg);
    expect(levelOf(srs)).toBe('nova');
    srs = review(srs, 3, new Date(t.getTime() + 10 * 60_000), cfg);
    expect(levelOf(srs)).toBe('aprendendo');
    while (levelOf(srs) !== 'dominada') {
      t = new Date(srs.due);
      srs = review(srs, 3, t, cfg);
    }
    expect(srs.state).toBe('revisao');
    srs = review(srs, 1, new Date(srs.due), cfg);
    expect(srs.state).toBe('reaprendendo');
    expect(levelOf(srs)).toBe('aprendendo');
  });

  it('as palavras de quando volta', () => {
    const now = new Date(2026, 10, 2, 22, 0);
    expect(intervalLabel(now, new Date(now.getTime() + 60_000), false)).toBe('1 min');
    expect(intervalLabel(now, new Date(now.getTime() + 10 * 60_000), false)).toBe('10 min');
    expect(intervalLabel(now, new Date(now.getTime() + 3 * 3_600_000), false)).toBe('3 h');
    // a revisão vence às 4h do dia: de noite, "1 dia", e não "6 h"
    expect(intervalLabel(now, dayStart('2026-11-03'), true)).toBe('1 dia');
    expect(intervalLabel(now, dayStart('2026-11-14'), true)).toBe('12 dias');
    expect(intervalLabel(now, dayStart('2027-01-01'), true)).toBe('2 meses');
    expect(intervalLabel(now, dayStart('2026-12-17'), true)).toBe('1,5 mês');
    expect(intervalLabel(now, dayStart('2028-05-02'), true)).toBe('1,5 ano');
    expect(intervalLabel(now, dayStart('2030-11-02'), true)).toBe('4 anos');
    const srs = (state: 'nova' | 'aprendendo' | 'revisao', due: Date) => ({ ...freshSrs(T0), state, due: due.toISOString(), last: T0, s: 1, d: 5, reps: 1 });
    expect(whenLabel(srs('nova', now), now)).toBe('agora');
    expect(whenLabel(srs('aprendendo', new Date(now.getTime() + 8 * 60_000)), now)).toBe('daqui a 8 min');
    expect(whenLabel(srs('revisao', dayStart('2026-11-03')), now)).toBe('amanhã');
    expect(whenLabel(srs('revisao', dayStart('2026-11-05')), now)).toBe('em 3 dias');
    expect(whenLabel(srs('revisao', new Date(now.getTime() - 1000)), now)).toBe('agora');
  });

  describe('guardar e juntar', () => {
    it('sanear: o que não vale sai, a carta sem baralho sai, o apagado fica apagado, o progresso estragado recomeça', () => {
      const st = sanitizeStudy({
        decks: [
          { id: 'dok', name: 'Ok', color: 'roxo', icon: 'nao-existe', newPerDay: 99999, order: 0, at: T0 },
          { id: 'sem nome', name: 'X', at: T0 },
          { id: 'dsumido', name: 'Sumido', at: T0 },
        ],
        cards: [
          { note: 'n1', decks: ['dok', 'dok', 7], front: { title: 'a' }, srs: { state: 'revisao', s: -1, d: 5, due: T0, last: T0 }, stats: { seen: 3, marks: '1x0a1' }, at: T0 },
          { note: 'n2', decks: [], at: T0 },
          { note: 'n3', decks: ['dok'], at: T0 },
        ],
        removed: { 'deck:dsumido': at(5), 'card:n3': at(5), lixo: at(5) },
        today: { day: '2026-11-02', news: { dok: 2 }, reviews: 4, at: T0 },
        config: { retention: 0.999, maxReviews: -3, newOrder: 'qualquer', at: T0 },
      });
      expect(st.decks.map((d) => [d.id, d.color, d.icon, d.newPerDay])).toEqual([['dok', 'amarelo', null, 999]]);
      expect(st.cards.map((c) => [c.note, c.decks, c.srs.state, c.stats.marks])).toEqual([['n1', ['dok'], 'nova', '101']]);
      expect(st.removed).toEqual({ 'deck:dsumido': at(5), 'card:n3': at(5) });
      expect(st.today).toEqual({ day: '2026-11-02', news: { dok: 2 }, reviews: 4, at: T0 });
      expect(st.config).toEqual({ retention: 0.95, maxReviews: 0, newOrder: 'entrada', at: T0 });
      expect(sanitizeStudy('lixo')).toEqual(emptyStudy());
      // ida e volta sem perder nada
      const full = answer(sample(), 'n1', true, new Date(at(10)));
      expect(sanitizeStudy(JSON.parse(JSON.stringify(full)))).toEqual(full);
    });

    it('as horas do progresso ficam no mesmo formato, para a fila comparar', () => {
      const st = sanitizeStudy({
        decks: [{ id: 'dok', name: 'Ok', at: T0 }],
        cards: [{ note: 'n1', decks: ['dok'], srs: { state: 'revisao', step: 0, s: 3, d: 5, due: '2026-10-30T07:00:00-03:00', last: '2026-10-27T07:00:00-03:00', reps: 2 }, at: T0 }],
      });
      expect(st.cards[0].srs.due).toBe('2026-10-30T10:00:00.000Z');
      expect(st.cards[0].srs.last).toBe('2026-10-27T10:00:00.000Z');
    });

    it('a nova de um baralho apagado noutro aparelho conta no baralho dela que ainda existe', () => {
      const st = { ...sample(), cards: sample().cards.map((c) => (c.note === 'n2' ? { ...c, decks: ['dsumido', 'dkanji'] } : c)) };
      expect(answer(st, 'n2', true, new Date(at(10))).today!.news).toEqual({ dkanji: 1 });
    });

    it('o que vai para a nuvem: nada enquanto ninguém mexeu', () => {
      expect(studyToSync(emptyStudy())).toBeNull();
      expect(studyToSync(setConfig(emptyStudy(), { retention: 0.85 }, T0))).not.toBeNull();
      expect(studyToSync(sample())).not.toBeNull();
    });

    it('juntar dois aparelhos: a mudança mais nova vence, carta a carta; apagado não volta; o dia pelo maior', () => {
      const base = sample();
      // aqui respondeu n1; lá respondeu n2 e mudou o nome do baralho; lá apagou n3
      const here = answer(base, 'n1', true, new Date(at(10)), 'dkanji');
      let there = answer(base, 'n2', false, new Date(at(12)));
      there = updateDeck(there, 'dkanji', { name: 'Kanjis' }, at(12));
      there = removeCard(there, 'n3', at(13));
      const a = mergeStudy(here, there);
      const b = mergeStudy(there, here);
      expect(a).toEqual(b);
      expect(a.cards.map((c) => [c.note, c.stats.seen])).toEqual([
        ['n1', 1],
        ['n2', 1],
      ]);
      expect(a.decks[0].name).toBe('Kanjis');
      // no mesmo dia, o maior de cada número (somar contaria duas vezes a cada sincronização)
      expect(a.today!.news).toEqual({ dkanji: 1 });
      // o mais novo dos dois dias vence
      const tomorrow = answer(base, 'n3', true, new Date(2026, 10, 9, 12));
      expect(mergeStudy(here, tomorrow).today!.day).toBe('2026-11-09');
      // a configuração escolhida por último
      const cfg = setConfig(base, { retention: 0.85 }, at(30));
      expect(mergeStudy(here, cfg).config.retention).toBe(0.85);
      expect(mergeStudy(cfg, here).config.retention).toBe(0.85);
    });

    it('a mesma resposta em dois aparelhos ao mesmo tempo: vale a mais nova (D10)', () => {
      const base = sample();
      const here = answer(base, 'n2', true, new Date(at(10)));
      const there = answer(base, 'n2', false, new Date(at(11)));
      expect(mergeStudy(here, there).cards.find((c) => c.note === 'n2')!.stats.wrong).toBe(1);
    });
  });
});
