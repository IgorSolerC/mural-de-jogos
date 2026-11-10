import { FreeBoard, sanitizeFreeBoard } from './free-board';
import { mergeFreeBoard } from './free-board-merge';

const ID = 'quadroJuntado000000001';

function board(n: unknown[], e: unknown[] = [], em = '2026-11-10T12:00:00.000Z', extra: Record<string, unknown> = {}): FreeBoard {
  return sanitizeFreeBoard({ v: 1, id: ID, nome: 'Blue Prince', grupo: 'Jogos', em, n, e, ...extra })!;
}

const t = (i: string, x = 0, y = 0, extra: Record<string, unknown> = {}) => ({ i, t: 'x', x, y, w: 100, h: 50, txt: i, ...extra });
const LATER = '2026-11-10T13:00:00.000Z';
const LATEST = '2026-11-10T14:00:00.000Z';

describe('Quadro livre: junção de dois aparelhos', () => {
  it('cada um mexeu numa peça: as duas mudanças ficam', () => {
    const o = board([t('a1'), t('b2')]);
    const a = board([t('a1', 50, 50), t('b2')], [], LATER);
    const b = board([t('a1'), t('b2', 0, 0, { c: 'rosa' })], [], LATEST);
    const m = mergeFreeBoard(o, a, b);
    expect(m.n).toEqual([jasmine.objectContaining({ i: 'a1', x: 50, y: 50 }), jasmine.objectContaining({ i: 'b2', c: 'rosa' })]);
    expect(m.em).toBe(LATEST);
  });

  it('os dois mexeram a mesma peça em campos diferentes: junta campo a campo', () => {
    const o = board([t('a1')]);
    const a = board([t('a1', 78, 0)], [], LATER);
    const b = board([t('a1', 0, 0, { txt: 'Senha?' })], [], LATEST);
    expect(mergeFreeBoard(o, a, b).n[0]).toEqual(jasmine.objectContaining({ x: 78, txt: 'Senha?' }));
  });

  it('o mesmo campo mudado diferente: vale o lado mexido por último', () => {
    const o = board([t('a1')]);
    const a = board([t('a1', 26, 0)], [], LATEST);
    const b = board([t('a1', 52, 0)], [], LATER);
    expect(mergeFreeBoard(o, a, b).n[0].x).toBe(26);
    expect(mergeFreeBoard(o, b, a).n[0].x).toBe(26);
  });

  it('apagada de um lado e parada do outro, sai; apagada de um lado e mexida do outro, fica', () => {
    const o = board([t('a1'), t('b2')]);
    const a = board([t('b2')], [], LATER);
    const b = board([t('a1'), t('b2', 9, 9)], [], LATEST);
    expect(mergeFreeBoard(o, a, b).n.map((n) => n.i)).toEqual(['b2']);
    const moved = board([t('a1', 99, 99), t('b2')], [], LATEST);
    expect(mergeFreeBoard(o, a, moved).n.map((n) => n.i).sort()).toEqual(['a1', 'b2']);
  });

  it('as peças novas dos dois lados entram, na ordem de empilhar dos dois', () => {
    const o = board([t('a1')]);
    const a = board([t('a1'), t('na')], [], LATER);
    const b = board([t('a1'), t('nb')], [], LATEST);
    const ids = mergeFreeBoard(o, a, b).n.map((n) => n.i);
    expect(ids[0]).toBe('a1');
    expect(ids.slice(1).sort()).toEqual(['na', 'nb']);
  });

  it('a seta para uma peça que saiu na junção sai também', () => {
    const o = board([t('a1'), t('b2')]);
    // um lado apagou a1; o outro ligou a1 a b2 (sem mexer em a1)
    const a = board([t('b2')], [], LATER);
    const b = board([t('a1'), t('b2')], [{ i: 'e1', a: 'a1', b: 'b2' }], LATEST);
    const m = mergeFreeBoard(o, a, b);
    expect(m.n.map((n) => n.i)).toEqual(['b2']);
    expect(m.e).toEqual([]);
  });

  it('nome e grupo do quadro juntam como campos; sem base, nada se perde', () => {
    const o = board([t('a1')]);
    const a = { ...board([t('a1')], [], LATER), nome: 'Mapa da mansão' };
    const b = { ...board([t('a1')], [], LATEST), grupo: 'Jogos de puzzle' };
    const m = mergeFreeBoard(o, a, b);
    expect([m.nome, m.grupo]).toEqual(['Mapa da mansão', 'Jogos de puzzle']);
    const noBase = mergeFreeBoard(null, board([t('a1')], [], LATER), board([t('b2')], [], LATEST));
    expect(noBase.n.map((n) => n.i).sort()).toEqual(['a1', 'b2']);
  });

  it('um lado igual à base: o outro vale inteiro; os dois iguais: um deles', () => {
    const o = board([t('a1')]);
    const b = board([t('a1', 5, 5), t('b2')], [], LATER);
    expect(mergeFreeBoard(o, o, b)).toBe(b);
    expect(mergeFreeBoard(o, b, o)).toBe(b);
    expect(mergeFreeBoard(o, b, { ...b })).toBe(b);
  });

  it('campos de um site mais novo também passam pela junção', () => {
    const o = board([t('a1')]);
    const a = board([t('a1', 0, 0, { tinta: 'azul' })], [], LATER);
    const b = board([t('a1', 26, 0)], [], LATEST, { fundo: 'cortiça' });
    const m = mergeFreeBoard(o, a, b);
    expect(m.n[0]).toEqual(jasmine.objectContaining({ x: 26, tinta: 'azul' }));
    expect(m['fundo']).toBe('cortiça');
  });
});
