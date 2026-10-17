import { SHELF_ORDERS, shelfColumns, shelfCompare } from './clipping';

describe('a ordem e as colunas das colagens (Pra depois e Wishlist)', () => {
  const items = [
    { id: 'a', createdAt: '2026-10-01T10:00:00Z', game: { name: 'Zelda' } },
    { id: 'b', createdAt: '2026-10-03T10:00:00Z', game: { name: 'ação 10' } },
    { id: 'c', createdAt: '2026-10-02T10:00:00Z', game: { name: 'Ação 2' } },
  ];
  const ids = (o: Parameters<typeof shelfCompare>[0]) => [...items].sort(shelfCompare(o)).map((x) => x.id);

  it('as três ordens da aba', () => {
    expect(SHELF_ORDERS.map((o) => o.label)).toEqual(['Mais novos', 'Mais antigos', 'A–Z']);
    expect(ids('recentes')).toEqual(['b', 'c', 'a']);
    expect(ids('antigos')).toEqual(['a', 'c', 'b']);
    expect(ids('az')).toEqual(['c', 'b', 'a']);
  });

  it('as colunas: quantas peças cabem, pelo menos três; duas numa tela de celular', () => {
    if (innerWidth < 560) {
      expect(shelfColumns(1000, 168, 32)).toBe(2);
      return;
    }
    expect(shelfColumns(1000, 168, 32)).toBe(5);
    expect(shelfColumns(1000, 172, 34)).toBe(5);
    expect(shelfColumns(900, 172, 34)).toBe(4);
    expect(shelfColumns(300, 168, 32)).toBe(3);
  });
});
