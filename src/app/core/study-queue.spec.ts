import { DEFAULT_FSRS, dayStart, freshSrs } from './fsrs';
import { StudyState, addCard, addDeck, answer, emptyStudy, setConfig, updateDeck } from './study';
import { LEARN_AHEAD_MS, allCounts, countTotal, dayQueue, interleave, nextUp } from './study-queue';

const NOW = new Date(2026, 10, 2, 20, 0);
const iso = (d: Date) => d.toISOString();
const minus = (days: number) => iso(new Date(NOW.getTime() - days * 86_400_000));

/** Uma carta já em revisão, vencendo no dia `dueDay` (com S e D quaisquer). */
function inReview(st: StudyState, note: string, dueDay: string): StudyState {
  return {
    ...st,
    cards: st.cards.map((c) => (c.note === note ? { ...c, srs: { state: 'revisao', step: 0, s: 5, d: 5, due: iso(dayStart(dueDay)), last: minus(5), reps: 3 } } : c)),
  };
}

/** Baralho A com 8 novas (a1…a8), baralho B com 3 novas (b1…b3) e x1, nova nos dois. */
function sample(): StudyState {
  let st = emptyStudy();
  st = addDeck(st, 'A', 'amarelo', minus(30), null, 'da').state;
  st = addDeck(st, 'B', 'azul', minus(30), null, 'db').state;
  for (let i = 1; i <= 8; i++) st = addCard(st, `a${i}`, ['da'], {}, minus(20 - i));
  for (let i = 1; i <= 3; i++) st = addCard(st, `b${i}`, ['db'], {}, minus(10 - i));
  st = addCard(st, 'x1', ['db', 'da'], {}, minus(25));
  return st;
}

describe('a fila do dia (core/study-queue.ts)', () => {
  it('as novas: até 5 por baralho, na ordem em que entraram; a de dois baralhos conta no primeiro (na ordem das abas)', () => {
    const q = dayQueue(sample(), NOW);
    const news = q.rest.filter((i) => i.kind === 'nova');
    expect(news.filter((i) => i.deck === 'da').map((i) => i.note)).toEqual(['x1', 'a1', 'a2', 'a3', 'a4']);
    expect(news.filter((i) => i.deck === 'db').map((i) => i.note)).toEqual(['b1', 'b2', 'b3']);
    expect(q.counts).toEqual({ novas: 8, aprender: 0, revisar: 0 });
  });

  it('um baralho só: as novas dele, com a de dois baralhos contando nele', () => {
    const q = dayQueue(sample(), NOW, 'db');
    expect(q.rest.map((i) => i.note)).toEqual(['x1', 'b1', 'b2', 'b3']);
    expect(q.rest.every((i) => i.deck === 'db')).toBeTrue();
  });

  it('o que já entrou hoje desconta do limite; 0 novas por dia não traz nenhuma', () => {
    let st = sample();
    st = answer(st, 'a1', true, NOW, 'da');
    st = answer(st, 'a2', true, NOW, 'da');
    expect(dayQueue(st, NOW, 'da').counts.novas).toBe(3);
    st = updateDeck(st, 'db', { newPerDay: 0 }, iso(NOW));
    expect(dayQueue(st, NOW, 'db').counts.novas).toBe(0);
    // a x1, que no B não cabe mais, ainda cabe no A
    expect(dayQueue(st, NOW).rest.some((i) => i.note === 'x1' && i.deck === 'da')).toBeTrue();
  });

  it('a carta de dois baralhos aparece uma vez no Estudar tudo e, respondida, sai da fila do outro', () => {
    let st = sample();
    expect(dayQueue(st, NOW).rest.filter((i) => i.note === 'x1').length).toBe(1);
    st = answer(st, 'x1', true, NOW, 'db');
    st = answer(st, 'x1', true, new Date(NOW.getTime() + 60_000), 'db');
    st = answer(st, 'x1', true, new Date(NOW.getTime() + 11 * 60_000), 'db');
    expect(dayQueue(st, new Date(NOW.getTime() + 12 * 60_000), 'da').rest.some((i) => i.note === 'x1')).toBeFalse();
    expect(st.today!.news).toEqual({ db: 1 });
  });

  it('a ordem das novas sorteada é a mesma em todo aparelho no mesmo dia', () => {
    const st = setConfig(sample(), { newOrder: 'sorteio' }, iso(NOW));
    const a = dayQueue(st, NOW, 'da').rest.map((i) => i.note);
    expect(dayQueue(st, NOW, 'da').rest.map((i) => i.note)).toEqual(a);
    expect(a.length).toBe(5);
  });

  it('as revisões: as vencidas (hoje ou antes), a mais atrasada primeiro, até o limite do dia', () => {
    let st = sample();
    st = inReview(st, 'a5', '2026-11-02');
    st = inReview(st, 'a6', '2026-10-25');
    st = inReview(st, 'a7', '2026-11-03');
    st = inReview(st, 'a8', '2026-10-30');
    const q = dayQueue(st, NOW, 'da');
    expect(q.rest.filter((i) => i.kind === 'revisao').map((i) => i.note)).toEqual(['a6', 'a8', 'a5']);
    expect(q.counts.revisar).toBe(3);
    st = setConfig(st, { maxReviews: 2 }, iso(NOW));
    expect(dayQueue(st, NOW, 'da').rest.filter((i) => i.kind === 'revisao').map((i) => i.note)).toEqual(['a6', 'a8']);
  });

  it('a revisão que vence amanhã não entra hoje, nem depois da meia-noite (o dia vira às 4h)', () => {
    const st = inReview(sample(), 'a5', '2026-11-03');
    expect(dayQueue(st, new Date(2026, 10, 3, 1, 0), 'da').counts.revisar).toBe(0);
    expect(dayQueue(st, new Date(2026, 10, 3, 4, 1), 'da').counts.revisar).toBe(1);
  });

  it('adiantado: as revisões até amanhã (as de hoje além do limite primeiro), sem novas e sem o limite do dia', () => {
    let st = sample();
    st = inReview(st, 'a5', '2026-11-03');
    st = inReview(st, 'a6', '2026-11-03');
    st = inReview(st, 'a7', '2026-11-04');
    st = inReview(st, 'a8', '2026-11-02');
    st = inReview(st, 'a4', '2026-11-02');
    st = setConfig(st, { maxReviews: 1 }, iso(NOW));
    // hoje, uma das duas vencidas (o limite); adiantado, as duas de hoje antes das de amanhã, e a de depois não
    expect(dayQueue(st, NOW, 'da').counts.revisar).toBe(1);
    const q = dayQueue(st, NOW, 'da', undefined, 1);
    expect(q.rest.slice(0, 2).map((i) => i.note).sort()).toEqual(['a4', 'a8']);
    expect(q.rest.slice(2).map((i) => i.note).sort()).toEqual(['a5', 'a6']);
    expect(q.counts).toEqual({ novas: 0, aprender: 0, revisar: 4 });
    expect(nextUp(st, NOW, 'da', undefined, 1).item?.kind).toBe('revisao');
    // sem adiantar, a de amanhã não entra
    expect(dayQueue(st, NOW, 'da').rest.some((i) => i.note === 'a5' || i.note === 'a6')).toBeFalse();
  });

  it('novas espalhadas entre as revisões, e não no fim', () => {
    expect(interleave(['r1', 'r2', 'r3', 'r4'], ['n1', 'n2'])).toEqual(['r1', 'n1', 'r2', 'r3', 'n2', 'r4']);
    expect(interleave([], ['n1'])).toEqual(['n1']);
    expect(interleave(['r1'], [])).toEqual(['r1']);
  });

  it('a sessão: a em aprendizado vencida primeiro; errou, volta em 1 min; sem nada, a dos próximos 20 min', () => {
    let st = updateDeck(sample(), 'da', { newPerDay: 1 }, iso(NOW));
    st = updateDeck(st, 'db', { newPerDay: 0 }, iso(NOW));
    const first = nextUp(st, NOW, 'da');
    expect(first.item).toEqual({ note: 'x1', deck: 'da', kind: 'nova' });
    st = answer(st, 'x1', false, NOW, 'da');
    // a única nova do dia já entrou: só sobra a x1, daqui a 1 min, que aparece adiantada
    const again = nextUp(st, new Date(NOW.getTime() + 5_000), 'da');
    expect(again.item).toEqual({ note: 'x1', deck: 'da', kind: 'aprender' });
    // acertou: volta em 10 min, ainda dentro dos 20
    st = answer(st, 'x1', true, new Date(NOW.getTime() + 61_000), 'da');
    expect(nextUp(st, new Date(NOW.getTime() + 62_000), 'da').item?.note).toBe('x1');
    // acertou de novo: formou, e a sessão acabou
    st = answer(st, 'x1', true, new Date(NOW.getTime() + 11 * 60_000), 'da');
    expect(nextUp(st, new Date(NOW.getTime() + 11 * 60_000 + 1000), 'da')).toEqual({ item: null, later: null });
  });

  it('a carta em aprendizado que volta depois dos 20 minutos: a sessão termina dizendo quando (amanhã não conta)', () => {
    let st = updateDeck(sample(), 'da', { newPerDay: 0 }, iso(NOW));
    st = updateDeck(st, 'db', { newPerDay: 0 }, iso(NOW));
    const learning = (due: Date) => ({ ...st, cards: st.cards.map((c) => (c.note === 'a1' ? { ...c, srs: { state: 'aprendendo' as const, step: 1, s: 2, d: 5, due: iso(due), last: iso(NOW), reps: 1 } } : c)) });
    const soon = new Date(NOW.getTime() + LEARN_AHEAD_MS + 5 * 60_000);
    expect(nextUp(learning(soon), NOW, 'da')).toEqual({ item: null, later: iso(soon) });
    expect(nextUp(learning(new Date(NOW.getTime() + LEARN_AHEAD_MS - 60_000)), NOW, 'da').item?.note).toBe('a1');
    expect(nextUp(learning(new Date(2026, 10, 3, 9)), NOW, 'da')).toEqual({ item: null, later: null });
  });

  it('a anotação que não existe não entra; baralho que não existe não tem fila', () => {
    const live = (note: string) => note !== 'x1';
    expect(dayQueue(sample(), NOW, 'db', live).rest.map((i) => i.note)).toEqual(['b1', 'b2', 'b3']);
    expect(dayQueue(sample(), NOW, 'sumido').counts).toEqual({ novas: 0, aprender: 0, revisar: 0 });
    const orphan = { ...sample(), cards: [...sample().cards, { ...sample().cards[0], note: 'solta', decks: ['sumido'] }] };
    expect(dayQueue(orphan, NOW).rest.some((i) => i.note === 'solta')).toBeFalse();
  });

  it('os números: cada baralho e o total sem contar duas vezes', () => {
    const { total, byDeck } = allCounts(sample(), NOW);
    expect(byDeck.get('da')).toEqual({ novas: 5, aprender: 0, revisar: 0 });
    expect(byDeck.get('db')).toEqual({ novas: 4, aprender: 0, revisar: 0 });
    expect(total).toEqual({ novas: 8, aprender: 0, revisar: 0 });
    expect(countTotal(total)).toBe(8);
    expect(freshSrs(iso(NOW)).state).toBe('nova');
    expect(DEFAULT_FSRS.learning).toEqual([1, 10]);
  });
});
