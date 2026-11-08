import { dayStart } from './fsrs';
import { StudyState, addCard, addDeck, answer, emptyStudy } from './study';
import { DRILL_STEPS, drillAnswer, drillCounts, drillLeft, drillNext, drillPool, drillReturn, startDrill } from './study-drill';

const NOW = new Date(2026, 10, 8, 20, 0);
const iso = (d: Date) => d.toISOString();
const minus = (days: number) => iso(new Date(NOW.getTime() - days * 86_400_000));
const MIN = 60_000;

/** Baralho A com a1…a4, baralho B com b1 e x1 (nos dois). */
function sample(): StudyState {
  let st = emptyStudy();
  st = addDeck(st, 'A', 'amarelo', minus(30), null, 'da').state;
  st = addDeck(st, 'B', 'azul', minus(30), null, 'db').state;
  for (let i = 1; i <= 4; i++) st = addCard(st, `a${i}`, ['da'], {}, minus(20 - i));
  st = addCard(st, 'b1', ['db'], {}, minus(9));
  st = addCard(st, 'x1', ['db', 'da'], {}, minus(25));
  return st;
}

/** a1 respondida hoje, a2 respondida há uma semana (em revisão), o resto nunca vista. */
function studied(): StudyState {
  let st = sample();
  st = answer(st, 'a1', true, new Date(NOW.getTime() - 2 * 3_600_000), 'da');
  st = {
    ...st,
    cards: st.cards.map((c) => (c.note === 'a2' ? { ...c, srs: { state: 'revisao' as const, step: 0, s: 9, d: 5, due: iso(dayStart('2026-11-20')), last: minus(7), reps: 4 } } : c)),
  };
  return st;
}

const notes = (items: readonly { note: string }[]) => items.map((i) => i.note).sort();

describe('o treino (core/study-drill.ts)', () => {
  it('os tipos: hoje, já estudados, todos, nunca vistos e escolhidos, no escopo', () => {
    const st = studied();
    expect(notes(drillPool(st, NOW, 'da', 'hoje'))).toEqual(['a1']);
    expect(notes(drillPool(st, NOW, 'da', 'vistos'))).toEqual(['a1', 'a2']);
    expect(notes(drillPool(st, NOW, 'da', 'todos'))).toEqual(['a1', 'a2', 'a3', 'a4', 'x1']);
    expect(notes(drillPool(st, NOW, 'da', 'novos'))).toEqual(['a3', 'a4', 'x1']);
    expect(notes(drillPool(st, NOW, 'da', 'escolhidos', undefined, ['a3', 'b1']))).toEqual(['a3']);
    expect(notes(drillPool(st, NOW, undefined, 'todos'))).toEqual(['a1', 'a2', 'a3', 'a4', 'b1', 'x1']);
    // a anotação apagada não entra
    expect(notes(drillPool(st, NOW, 'da', 'todos', (n) => n !== 'a4'))).not.toContain('a4');
    // a carta de dois baralhos vem pelo primeiro dos estudados
    expect(drillPool(st, NOW, undefined, 'todos').find((i) => i.note === 'x1')!.deck).toBe('da');
    expect(drillPool(st, NOW, 'db', 'todos').find((i) => i.note === 'x1')!.deck).toBe('db');
  });

  it('"hoje" segue o dia de estudo (vira às 4h): a resposta de ontem não conta', () => {
    const st = studied();
    const tomorrow = new Date(2026, 10, 9, 5, 0);
    expect(drillPool(st, tomorrow, 'da', 'hoje')).toEqual([]);
    expect(drillPool(st, new Date(2026, 10, 9, 3, 0), 'da', 'hoje').length).toBe(1);
  });

  it('as contas do menu batem com o que cada treino traria', () => {
    const st = studied();
    const c = drillCounts(st, NOW, 'da');
    expect(c).toEqual({ hoje: 1, vistos: 2, todos: 5, novos: 3, escolhidos: 5 });
    for (const k of ['hoje', 'vistos', 'todos', 'novos'] as const) expect(drillPool(st, NOW, 'da', k).length).toBe(c[k]);
  });

  it('acertou de primeira: sai da rodada; os números contam', () => {
    let d = startDrill(drillPool(sample(), NOW, 'da', 'todos'), 's');
    expect(drillLeft(d)).toBe(5);
    const first = drillNext(d, NOW.getTime())!;
    expect(drillReturn(d, first.note, true)).toBeNull();
    d = drillAnswer(d, first.note, true, NOW.getTime());
    expect(drillLeft(d)).toBe(4);
    expect(d.queue.some((i) => i.note === first.note)).toBeFalse();
    expect([d.answered, d.right, d.wrong]).toEqual([1, 1, 0]);
  });

  it('errou: volta pelos passos do estudo (1 min, 10 min, sai), passando na frente quando dá a hora', () => {
    let d = startDrill(drillPool(sample(), NOW, 'da', 'todos'), 's');
    const t = NOW.getTime();
    const miss = drillNext(d, t)!;
    expect(drillReturn(d, miss.note, false)).toBe(DRILL_STEPS[0]);
    d = drillAnswer(d, miss.note, false, t);
    expect([d.answered, d.right, d.wrong]).toEqual([1, 0, 1]);
    expect(drillLeft(d)).toBe(5);
    // antes de 1 minuto, vêm as outras
    expect(drillNext(d, t + 30_000)!.note).not.toBe(miss.note);
    // deu a hora: ela passa na frente
    expect(drillNext(d, t + MIN)!.note).toBe(miss.note);
    expect(drillReturn(d, miss.note, true)).toBe(DRILL_STEPS[1]);
    d = drillAnswer(d, miss.note, true, t + MIN);
    expect(drillNext(d, t + 2 * MIN)!.note).not.toBe(miss.note);
    // errou de novo nos passos: volta para o primeiro
    expect(drillReturn(d, miss.note, false)).toBe(DRILL_STEPS[0]);
    // acertou no último passo: sai
    d = drillAnswer(d, miss.note, true, t + 11 * MIN);
    expect(drillLeft(d)).toBe(4);
    expect(d.back.length).toBe(0);
  });

  it('sem mais nada, a que está voltando aparece na hora (o treino não espera o relógio); depois, acabou', () => {
    let d = startDrill(drillPool(sample(), NOW, 'db', 'escolhidos', undefined, ['b1']), 's');
    const t = NOW.getTime();
    d = drillAnswer(d, 'b1', false, t);
    expect(drillNext(d, t + 1000)!.note).toBe('b1');
    d = drillAnswer(d, 'b1', true, t + 2000);
    expect(drillNext(d, t + 3000)!.note).toBe('b1');
    d = drillAnswer(d, 'b1', true, t + 4000);
    expect(drillNext(d, t + 5000)).toBeNull();
    expect([d.answered, d.right, d.wrong]).toEqual([3, 2, 1]);
  });

  it('a próxima rodada embaralha de novo as mesmas cartas e continua somando', () => {
    const pool = drillPool(sample(), NOW, 'da', 'todos');
    let d = startDrill(pool, 'um');
    for (const i of pool) d = drillAnswer(d, i.note, true, NOW.getTime());
    expect(drillNext(d, NOW.getTime())).toBeNull();
    const again = startDrill(pool, 'dois', d);
    expect(drillLeft(again)).toBe(5);
    expect([again.answered, again.right, again.wrong]).toEqual([5, 5, 0]);
    // a mesma semente sorteia a mesma ordem; outra semente, em geral, outra
    expect(startDrill(pool, 'um').queue).toEqual(startDrill(pool, 'um').queue);
  });

  it('a anotação apagada no meio do treino é pulada', () => {
    const d = startDrill(drillPool(sample(), NOW, 'da', 'todos'), 's');
    const first = drillNext(d, NOW.getTime())!;
    expect(drillNext(d, NOW.getTime(), (n) => n !== first.note)!.note).not.toBe(first.note);
  });

  it('não muda nada no estado dos Estudos', () => {
    const st = studied();
    const before = JSON.stringify(st);
    let d = startDrill(drillPool(st, NOW, 'da', 'todos'), 's');
    d = drillAnswer(d, drillNext(d, NOW.getTime())!.note, false, NOW.getTime());
    expect(JSON.stringify(st)).toBe(before);
    expect(d.answered).toBe(1);
  });
});
