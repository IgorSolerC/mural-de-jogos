import { addStudyDays, dayStart, daysBetween, studyDay } from './fsrs';
import { Srs } from './fsrs';
import {
  StudyState,
  addCard,
  addDeck,
  answer,
  emptyStudy,
  frozenSince,
  keepRicher,
  liveStudy,
  mergeStudy,
  pauseDeck,
  pausedSinceLabel,
  resetDeck,
  resumeDeck,
  sanitizeStudy,
  thawSrs,
  updateDeck,
  whenLabel,
} from './study';
import { allCounts, countTotal, dayQueue, nextUp, scopeCards } from './study-queue';
import { drillPool } from './study-drill';

const NOW = new Date(2026, 10, 2, 20, 0);
const iso = (d: Date) => d.toISOString();
const at = (days: number, from = NOW) => new Date(from.getTime() + days * 86_400_000);
const everyone = () => 'Estudo';

/** Uma carta em revisão que volta daqui a `inDays` dias de estudo (respondida há 5). */
function reviewing(st: StudyState, note: string, inDays: number, now = NOW): StudyState {
  const srs: Srs = { state: 'revisao', step: 0, s: 8, d: 5, due: iso(dayStart(addStudyDays(studyDay(now), inDays))), last: iso(at(-5, now)), reps: 4 };
  return { ...st, cards: st.cards.map((c) => (c.note === note ? { ...c, srs } : c)) };
}

/** Baralho A (k1 em revisão daqui a 3 dias, k2 vencida há 2, k3 nos passos, n1 nova), B com b1 e x1 (em A e B). */
function sample(): StudyState {
  let st = emptyStudy();
  st = addDeck(st, 'A', 'amarelo', iso(at(-30)), null, 'da', 'Estudo').state;
  st = addDeck(st, 'B', 'azul', iso(at(-30)), null, 'db', 'Estudo').state;
  for (const n of ['k1', 'k2', 'k3', 'n1']) st = addCard(st, n, ['da'], {}, iso(at(-20)));
  st = addCard(st, 'b1', ['db'], {}, iso(at(-20)));
  st = addCard(st, 'x1', ['da', 'db'], {}, iso(at(-20)));
  st = reviewing(st, 'k1', 3);
  st = reviewing(st, 'k2', -2);
  st = reviewing(st, 'b1', 1);
  st = reviewing(st, 'x1', 1);
  // k3: errou agora há pouco, volta daqui a 10 minutos
  st = answer(st, 'k3', false, new Date(NOW.getTime() - 60_000), 'da');
  return st;
}

const view = (st: StudyState) => liveStudy(st, everyone);
const card = (st: StudyState, note: string) => st.cards.find((c) => c.note === note)!;

describe('pausar e retomar um baralho (core/study.ts)', () => {
  it('pausar guarda desde quando, com a hora nova; o já pausado fica com a hora da pausa de antes', () => {
    const st = pauseDeck(sample(), 'da', iso(NOW));
    expect(st.decks.find((d) => d.id === 'da')).toEqual(jasmine.objectContaining({ paused: iso(NOW), at: iso(NOW) }));
    expect(pauseDeck(st, 'da', iso(at(1)))).toBe(st);
    expect(st.decks.find((d) => d.id === 'db')!.paused).toBeUndefined();
  });

  it('o pausado sai da fila, dos números de hoje e da próxima carta; o baralho em estudo traz a carta dos dois', () => {
    const before = sample();
    expect(countTotal(dayQueue(before, NOW, 'da').counts)).toBeGreaterThan(0);
    const st = pauseDeck(before, 'da', iso(NOW));
    expect(dayQueue(st, NOW, 'da').counts).toEqual({ novas: 0, aprender: 0, revisar: 0 });
    expect(nextUp(st, at(0.01), 'da')).toEqual({ item: null, later: null });
    const all = allCounts(st, NOW);
    expect(countTotal(all.byDeck.get('da')!)).toBe(0);
    // no Estudar tudo, só o B: a b1 e a x1 (que também está no A) vêm por ele
    const items = dayQueue(st, at(1), undefined).rest;
    expect(items.map((i) => i.note).sort()).toEqual(['b1', 'x1']);
    expect(items.every((i) => i.deck === 'db')).toBeTrue();
  });

  it('o treino continua com o pausado (não guarda nada)', () => {
    const st = pauseDeck(sample(), 'da', iso(NOW));
    expect(scopeCards(st, 'da').length).toBe(5);
    expect(drillPool(st, NOW, 'da', 'todos', () => true).length).toBe(5);
  });

  it('parada é a carta com todos os baralhos pausados, desde a pausa mais recente', () => {
    let st = pauseDeck(sample(), 'da', iso(at(-10)));
    expect(frozenSince(card(st, 'k1'), st.decks)).toBe(iso(at(-10)));
    // a x1 também está no B, em estudo: não parou
    expect(frozenSince(card(st, 'x1'), st.decks)).toBeNull();
    st = pauseDeck(st, 'db', iso(at(-4)));
    expect(frozenSince(card(st, 'x1'), st.decks)).toBe(iso(at(-4)));
  });

  it('um mês pausado: ao retomar, a que faltavam 3 dias continua faltando 3, a vencida continua vencida, a dos passos continua nos minutos dela', () => {
    const paused = pauseDeck(sample(), 'da', iso(NOW));
    const later = at(31);
    const st = resumeDeck(paused, view(paused), 'da', later, iso(later));
    const before = sample();
    expect(st.decks.find((d) => d.id === 'da')!.paused).toBeUndefined();
    const left = (s: StudyState, note: string, now: Date) => daysBetween(studyDay(now), studyDay(new Date(card(s, note).srs.due)));
    expect(left(st, 'k1', later)).toBe(left(before, 'k1', NOW));
    expect(left(st, 'k1', later)).toBe(3);
    expect(left(st, 'k2', later)).toBe(-2);
    expect(whenLabel(card(st, 'k1').srs, later)).toBe('em 3 dias');
    // os 10 minutos da k3: os que faltavam
    expect(Date.parse(card(st, 'k3').srs.due) - later.getTime()).toBe(Date.parse(card(before, 'k3').srs.due) - NOW.getTime());
    // o FSRS conta o mesmo tempo desde a última resposta, e a estabilidade e a dificuldade não mudam
    const gap = (s: StudyState, note: string) => daysBetween(studyDay(new Date(card(s, note).srs.last!)), studyDay(new Date(card(s, note).srs.due)));
    expect(gap(st, 'k1')).toBe(gap(before, 'k1'));
    expect(card(st, 'k1').srs.s).toBe(card(before, 'k1').srs.s);
    // a nova fica como está, e a mudança leva a hora de agora (a junção fica com ela)
    expect(card(st, 'n1').srs).toEqual(card(before, 'n1').srs);
    expect(card(st, 'k1').at).toBe(iso(later));
    // e o que vence volta à fila como antes da pausa (mais a x1, que venceu neste mês pelo B, em estudo)
    expect(dayQueue(before, NOW, 'da').counts).toEqual({ novas: 1, aprender: 1, revisar: 1 });
    expect(dayQueue(st, later, 'da').counts).toEqual({ novas: 1, aprender: 1, revisar: 2 });
  });

  it('a carta de um baralho em estudo não anda; a respondida durante a pausa anda só desde a resposta', () => {
    let paused = pauseDeck(sample(), 'da', iso(NOW));
    // a k1 respondida por um pedido da API no meio da pausa
    const answeredAt = at(5);
    paused = answer(paused, 'k1', true, answeredAt, 'da');
    const answered = card(paused, 'k1').srs;
    const later = at(31);
    const st = resumeDeck(paused, view(paused), 'da', later, iso(later));
    expect(card(st, 'x1').srs).toEqual(card(paused, 'x1').srs);
    const left = (srs: Srs, now: Date) => daysBetween(studyDay(now), studyDay(new Date(srs.due)));
    expect(left(card(st, 'k1').srs, later)).toBe(left(answered, answeredAt));
  });

  it('dois baralhos pausados: a carta dos dois anda ao retomar o primeiro, desde a pausa mais nova, e não de novo no segundo', () => {
    let st = pauseDeck(sample(), 'db', iso(at(-3)));
    st = pauseDeck(st, 'da', iso(NOW));
    const later = at(20);
    st = resumeDeck(st, view(st), 'da', later, iso(later));
    const before = sample();
    expect(daysBetween(studyDay(new Date(card(before, 'x1').srs.due)), studyDay(new Date(card(st, 'x1').srs.due)))).toBe(20);
    const after = at(25);
    const again = resumeDeck(st, view(st), 'db', after, iso(after));
    expect(card(again, 'x1').srs).toEqual(card(st, 'x1').srs);
    // a b1, só do B, anda os 28 dias dela
    expect(daysBetween(studyDay(new Date(card(before, 'b1').srs.due)), studyDay(new Date(card(again, 'b1').srs.due)))).toBe(28);
  });

  it('a carta que dorme noutro grupo não conta como baralho em estudo', () => {
    let st = pauseDeck(sample(), 'da', iso(NOW));
    st = { ...st, decks: [...st.decks, { ...st.decks[1], id: 'dz', name: 'Z', group: 'Outro', order: 9 }] };
    st = { ...st, cards: st.cards.map((c) => (c.note === 'k1' ? { ...c, decks: ['da', 'dz'] } : c)) };
    const later = at(10);
    const out = resumeDeck(st, view(st), 'da', later, iso(later));
    expect(out.cards.find((c) => c.note === 'k1')!.srs.due).not.toBe(card(st, 'k1').srs.due);
  });

  it('retomar o que não está pausado não muda nada; editar o baralho não pausa nem retoma', () => {
    const st = sample();
    expect(resumeDeck(st, view(st), 'da', NOW, iso(NOW))).toBe(st);
    const paused = pauseDeck(st, 'da', iso(NOW));
    const edited = updateDeck(paused, 'da', { name: 'Kana', paused: undefined } as never, iso(at(1)));
    expect(edited.decks.find((d) => d.id === 'da')).toEqual(jasmine.objectContaining({ name: 'Kana', paused: iso(NOW) }));
  });

  it('a pausa vai e volta pelo guardado e pela junção: a mudança mais nova vence, e um site mais velho (sem o campo) não a apaga', () => {
    const paused = pauseDeck(sample(), 'da', iso(NOW));
    expect(sanitizeStudy(JSON.parse(JSON.stringify(paused))).decks.find((d) => d.id === 'da')!.paused).toBe(iso(NOW));
    expect(sanitizeStudy({ ...paused, decks: paused.decks.map((d) => ({ ...d, paused: 'ontem' })) }).decks[0].paused).toBeUndefined();
    // o outro aparelho, ainda sem a pausa
    expect(mergeStudy(sample(), paused).decks.find((d) => d.id === 'da')!.paused).toBe(iso(NOW));
    expect(mergeStudy(paused, sample()).decks.find((d) => d.id === 'da')!.paused).toBe(iso(NOW));
    // retomado aqui depois: a volta (e as cartas andadas) vencem a pausa de lá
    const later = at(10);
    const resumed = resumeDeck(paused, view(paused), 'da', later, iso(later));
    const merged = mergeStudy(paused, resumed);
    expect(merged.decks.find((d) => d.id === 'da')!.paused).toBeUndefined();
    expect(card(merged, 'k1').srs).toEqual(card(resumed, 'k1').srs);
    // a mesma hora, sem o campo (um site mais velho na outra aba): fica o daqui
    const old = { ...paused, decks: paused.decks.map((d) => (d.id === 'da' ? (({ paused: _, ...rest }) => rest)(d) : d)) };
    expect(keepRicher(old, paused).decks.find((d) => d.id === 'da')!.paused).toBe(iso(NOW));
    expect(mergeStudy(old, paused).decks.find((d) => d.id === 'da')!.paused).toBe(iso(NOW));
  });

  it('na junção, a pausa segue a escolha mais nova entre pausar e retomar, à parte do resto do baralho', () => {
    const paused = pauseDeck(sample(), 'da', iso(NOW));
    const later = at(10);
    const resumed = resumeDeck(paused, view(paused), 'da', later, iso(later));
    // o outro aparelho ainda não sabia da volta e mudou o nome depois: o baralho fica retomado, com o nome novo
    const renamed = updateDeck(paused, 'da', { name: 'Kana' }, iso(at(11)));
    for (const merged of [mergeStudy(resumed, renamed), mergeStudy(renamed, resumed)]) {
      const d = merged.decks.find((x) => x.id === 'da')!;
      expect(d.name).toBe('Kana');
      expect(d.paused).toBeUndefined();
      // as cartas andaram uma vez só
      expect(card(merged, 'k1').srs).toEqual(card(resumed, 'k1').srs);
    }
    // o que nunca soube da pausa mudou o nome depois: o baralho continua pausado
    const fresh = updateDeck(sample(), 'da', { name: 'Kana' }, iso(at(1)));
    for (const merged of [mergeStudy(paused, fresh), mergeStudy(fresh, paused)]) {
      expect(merged.decks.find((x) => x.id === 'da')).toEqual(jasmine.objectContaining({ name: 'Kana', paused: iso(NOW), pauseAt: iso(NOW) }));
    }
  });

  it('a carta mudada depois num aparelho que não sabia da volta fica com o progresso andado no retomar', () => {
    const paused = pauseDeck(sample(), 'da', iso(NOW));
    const later = at(30);
    const resumed = resumeDeck(paused, view(paused), 'da', later, iso(later));
    // o outro aparelho, ainda pausado, muda a frente da k1 depois
    const edited = { ...paused, cards: paused.cards.map((c) => (c.note === 'k1' ? { ...c, front: { title: 'Sol' }, at: iso(at(31)) } : c)) };
    for (const merged of [mergeStudy(resumed, edited), mergeStudy(edited, resumed)]) {
      expect(card(merged, 'k1').front.title).toBe('Sol');
      expect(card(merged, 'k1').srs).toEqual(card(resumed, 'k1').srs);
      expect(merged.decks.find((d) => d.id === 'da')!.paused).toBeUndefined();
    }
  });

  it('thawSrs: a nunca respondida fica como está; a respondida depois da pausa anda desde a resposta', () => {
    const fresh: Srs = { state: 'nova', step: 0, s: 0, d: 0, due: iso(NOW), last: null, reps: 0 };
    expect(thawSrs(fresh, iso(NOW), at(10))).toBe(fresh);
    const after: Srs = { state: 'revisao', step: 0, s: 3, d: 5, due: iso(dayStart(addStudyDays(studyDay(at(1)), 3))), last: iso(at(1)), reps: 2 };
    const out = thawSrs(after, iso(NOW), at(10));
    expect(daysBetween(studyDay(at(10)), studyDay(new Date(out.due)))).toBe(3);
    expect(thawSrs(after, iso(NOW), at(1))).toBe(after);
  });

  it('desde quando, dito como gente', () => {
    expect(pausedSinceLabel(iso(NOW), at(0.05))).toBe('hoje');
    expect(pausedSinceLabel(iso(NOW), at(1))).toBe('ontem');
    expect(pausedSinceLabel(iso(NOW), at(10))).toBe('2 de novembro');
    expect(pausedSinceLabel(iso(NOW), at(400))).toBe('2 de novembro de 2026');
  });
});

describe('recomeçar o progresso de um baralho (core/study.ts)', () => {
  it('todas as cartas com progresso voltam a novas, sem respostas; a nova fica como estava; a de dois baralhos recomeça nos dois', () => {
    const st = sample();
    const out = resetDeck(st, view(st), 'da', () => true, iso(at(1)));
    expect(out.before.map((c) => c.note).sort()).toEqual(['k1', 'k2', 'k3', 'x1']);
    for (const n of ['k1', 'k2', 'k3', 'x1']) {
      expect(card(out.state, n).srs.state).toBe('nova');
      expect(card(out.state, n).stats).toEqual({ seen: 0, right: 0, wrong: 0, marks: '' });
      expect(card(out.state, n).at).toBe(iso(at(1)));
    }
    expect(card(out.state, 'n1')).toBe(card(st, 'n1'));
    // a do B só fica como estava
    expect(card(out.state, 'b1')).toBe(card(st, 'b1'));
    // e entram de novo pelas novas por dia
    expect(dayQueue(out.state, at(1), 'da').counts.novas).toBe(5);
  });

  it('a de anotação apagada fica de fora; sem nada a recomeçar, nada muda', () => {
    const st = sample();
    const out = resetDeck(st, view(st), 'da', (n) => n !== 'k1', iso(at(1)));
    expect(card(out.state, 'k1').srs).toEqual(card(st, 'k1').srs);
    const fresh = resetDeck(out.state, view(out.state), 'da', () => true, iso(at(2)));
    expect(fresh.before.map((c) => c.note)).toEqual(['k1']);
    const none = resetDeck(fresh.state, view(fresh.state), 'da', () => true, iso(at(3)));
    expect(none.state).toBe(fresh.state);
    expect(none.before).toEqual([]);
  });
});
