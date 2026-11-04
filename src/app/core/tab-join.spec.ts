import { joinItemsWithOtherTab, joinWithOtherTab } from './tab-join';

/**
 * A junção de duas abas do Murall mexendo ao mesmo tempo (ver core/tab-join.ts): `before` é como esta
 * aba viu a chave por último, `mine` o que ela grava agora e `theirs` o que a outra gravou.
 */

const j = (v: unknown) => JSON.stringify(v);
const item = (id: string, updatedAt: string, extra: Record<string, unknown> = {}) => ({ id, updatedAt, ...extra });

describe('joinItemsWithOtherTab', () => {
  const base = [item('a', '2026-11-04T10:00:00.000Z', { t: 'A' }), item('b', '2026-11-04T10:00:00.000Z', { t: 'B' })];

  it('sem nada daqui por gravar (ou sem saber o que esta aba viu), fica o gravado', () => {
    expect(joinItemsWithOtherTab(j(base), j(base), j([base[0]]))).toBeUndefined();
    expect(joinItemsWithOtherTab(undefined, j([...base, item('c', '2026-11-04T11:00:00.000Z')]), j(base))).toBeUndefined();
    // a chave tirada (a limpeza ao sair da conta): fica sem nada
    expect(joinItemsWithOtherTab(j(base), j([item('c', '2026-11-04T11:00:00.000Z')]), null)).toBeUndefined();
  });

  it('cada aba pôs uma: ficam as duas, a daqui na frente', () => {
    const c = item('c', '2026-11-04T11:00:00.000Z');
    const d = item('d', '2026-11-04T11:00:00.000Z');
    expect(joinItemsWithOtherTab(j(base), j([c, ...base]), j([d, ...base]))).toEqual([c, d, ...base]);
    // com a chave vazia antes
    expect(joinItemsWithOtherTab(null, j([c]), j([d]))).toEqual([c, d]);
  });

  it('a que uma tirou sem a outra ter mexido sai; a que uma tirou e a outra mexeu depois fica', () => {
    const c = item('c', '2026-11-04T11:00:00.000Z');
    // lá tiraram a "b"; aqui pus a "c"
    expect(joinItemsWithOtherTab(j(base), j([c, ...base]), j([base[0]]))).toEqual([c, base[0]]);
    // aqui tirei a "a"; lá puseram a "c"
    expect(joinItemsWithOtherTab(j(base), j([base[1]]), j([c, ...base]))).toEqual([c, base[1]]);
    // lá tiraram a "b", que aqui foi mexida depois: fica a daqui
    const b2 = item('b', '2026-11-04T12:00:00.000Z', { t: 'B2' });
    expect(joinItemsWithOtherTab(j(base), j([base[0], b2]), j([base[0]]))).toEqual([b2, base[0]]);
  });

  it('uma diferença só de formato (o mesmo updatedAt) não traz de volta a que a outra tirou', () => {
    const reformatted = { updatedAt: base[1].updatedAt, t: 'B', id: 'b', extra: null };
    expect(joinItemsWithOtherTab(j(base), j([base[0], reformatted, item('c', '2026-11-04T11:00:00.000Z')]), j([base[0]]))).toEqual([
      item('c', '2026-11-04T11:00:00.000Z'),
      base[0],
    ]);
  });

  it('a mexida numa aba só fica do jeito dela; mexida nas duas, fica a mexida por último inteira', () => {
    const a2 = item('a', '2026-11-04T11:00:00.000Z', { t: 'A daqui' });
    const b2 = item('b', '2026-11-04T11:00:00.000Z', { t: 'B de lá' });
    expect(joinItemsWithOtherTab(j(base), j([a2, base[1]]), j([base[0], b2]))).toEqual([a2, b2]);
    const aThere = item('a', '2026-11-04T11:30:00.000Z', { t: 'A de lá', u: 1 });
    expect(joinItemsWithOtherTab(j(base), j([a2, base[1]]), j([aThere, base[1]]))).toEqual([aThere, base[1]]);
    const aLater = item('a', '2026-11-04T12:00:00.000Z', { t: 'A daqui depois' });
    expect(joinItemsWithOtherTab(j(base), j([aLater, base[1]]), j([aThere, base[1]]))).toEqual([aLater, base[1]]);
  });
});

describe('joinWithOtherTab', () => {
  const base = { boards: [{ id: 'q1', cards: [{ note: 'n1', col: 'a' }] }, { id: 'q2', cards: [] }], ligado: true };

  it('sem nada daqui por gravar, sem saber o que esta aba viu, ou a chave tirada: fica o gravado', () => {
    expect(joinWithOtherTab(j(base), j(base), j({ ...base, ligado: false }))).toBeUndefined();
    expect(joinWithOtherTab(null, j({ ...base, ligado: false }), j(base))).toBeUndefined();
    expect(joinWithOtherTab(j(base), j({ ...base, ligado: false }), null)).toBeUndefined();
  });

  it('as duas mexeram em coisas diferentes: ficam as duas mudanças', () => {
    const mine = { ...base, boards: [{ id: 'q1', cards: [{ note: 'n1', col: 'b' }] }, base.boards[1]] };
    const theirs = { ...base, boards: [base.boards[0], { id: 'q2', cards: [{ note: 'n2', col: 'a' }] }] };
    expect(joinWithOtherTab(j(base), j(mine), j(theirs))).toEqual({
      boards: [
        { id: 'q1', cards: [{ note: 'n1', col: 'b' }] },
        { id: 'q2', cards: [{ note: 'n2', col: 'a' }] },
      ],
      ligado: true,
    });
  });

  it('as duas mudaram a mesma coisa: vale a da outra (a gravação mais nova)', () => {
    expect(joinWithOtherTab(j({ x: 1, y: 1 }), j({ x: 2, y: 1 }), j({ x: 3, y: 1 }))).toEqual({ x: 3, y: 1 });
    // e o que ela tirou sai, mesmo mexido aqui
    expect(joinWithOtherTab(j({ l: [{ id: 'a', v: 1 }] }), j({ l: [{ id: 'a', v: 2 }] }), j({ l: [] }))).toEqual({ l: [] });
  });
});
