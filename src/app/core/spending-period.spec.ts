import { Entry, rowsIn } from './spending';
import {
  addWays,
  categoryLines,
  isSpan,
  kindOf,
  periodLabel,
  periodMonths,
  periodSpends,
  periodTotals,
  previousPeriod,
  spendWays,
} from './spending-period';

let seq = 0;
function entry(over: Partial<Entry>): Entry {
  seq++;
  const at = `2026-10-01T10:00:${String(seq % 60).padStart(2, '0')}.${String(seq).padStart(3, '0')}Z`;
  return { id: `p${seq}`, title: 'Coisa', amount: 1000, flow: 'saida', category: 'outros', pay: 'avista', date: '2026-10-05', createdAt: at, at, ...over };
}

describe('Gastos: vários meses', () => {
  it('a vista ampla é de 3, 6 ou 12 meses', () => {
    expect([3, 6, 12].every(isSpan)).toBeTrue();
    expect(isSpan(1)).toBeFalse();
    expect(isSpan('6')).toBeFalse();
  });

  it('o jeito de uma saída: uma vez, parcela ou todo mês', () => {
    expect(kindOf({})).toBe('uma');
    expect(kindOf({ installments: 3 })).toBe('parcela');
    expect(kindOf({ monthly: true })).toBe('fixo');
  });

  it('os meses que acabam no aberto, o mais antigo primeiro, com o que entrou, saiu e já vinha de antes', () => {
    const entries = [
      entry({ title: 'Salário', flow: 'entrada', category: 'renda', amount: 500000, date: '2026-08-05', monthly: true, pay: undefined }),
      entry({ title: 'Aluguel', amount: 150000, category: 'aluguel', date: '2026-08-10', monthly: true }),
      entry({ title: 'Violão', amount: 10000, category: 'luxo', date: '2026-09-03', installments: 3, pay: 'parcelado' }),
      entry({ title: 'Ifood', amount: 4000, category: 'comida', date: '2026-10-02' }),
    ];
    const months = periodMonths(entries, '2026-10', 3);
    expect(months.map((m) => m.month)).toEqual(['2026-08', '2026-09', '2026-10']);
    expect(months.map((m) => m.spent)).toEqual([150000, 160000, 164000]);
    expect(months.map((m) => m.income)).toEqual([500000, 500000, 500000]);
    // a primeira parcela não "vinha de antes"; os fixos sim (e o fixo do primeiro mês também)
    expect(months.map((m) => m.committed)).toEqual([150000, 150000, 160000]);
    expect(months.map((m) => m.planned)).toEqual([150000, 160000, 160000]);
    const t = periodTotals(months);
    expect(t).toEqual(jasmine.objectContaining({ income: 1500000, spent: 474000, balance: 1026000, active: 3, avgSpent: 158000 }));
    expect(t.most!.month).toBe('2026-10');
    expect(t.least!.month).toBe('2026-08');
  });

  it('a média do que saiu conta só os meses com lançamento', () => {
    const entries = [entry({ amount: 9000, date: '2026-10-02' })];
    const t = periodTotals(periodMonths(entries, '2026-10', 6));
    expect(t.active).toBe(1);
    expect(t.avgSpent).toBe(9000);
    // um mês só com saída: sem "o que menos saiu"
    expect(t.least).toBeNull();
  });

  it('como saiu: por pagamento e por jeito, com o reembolso descontando do pedaço do gasto', () => {
    const jantar = entry({ title: 'Jantar', amount: 60000, pay: 'pix', date: '2026-10-19' });
    const entries = [
      jantar,
      entry({ title: 'Uber', amount: 2000, pay: 'avista', date: '2026-10-20' }),
      entry({ title: 'Violão', amount: 10000, pay: 'parcelado', installments: 10, date: '2026-10-03' }),
      entry({ title: 'Internet', amount: 12000, pay: 'pix', monthly: true, date: '2026-09-15' }),
      entry({ title: 'Pix da Bruna', amount: 20000, flow: 'entrada', category: 'reembolso', pay: undefined, refundOf: jantar.id, date: '2026-10-20' }),
    ];
    const w = spendWays(rowsIn(entries, '2026-10'), entries);
    expect(w.pay).toEqual({ avista: { amount: 2000, count: 1 }, pix: { amount: 52000, count: 2 }, parcelado: { amount: 10000, count: 1 } });
    expect(w.kind).toEqual({ uma: { amount: 42000, count: 2 }, parcela: { amount: 10000, count: 1 }, fixo: { amount: 12000, count: 1 } });
    expect(w.total).toBe(64000);
    const both = addWays([w, w]);
    expect(both.total).toBe(128000);
    expect(both.pay.pix).toEqual({ amount: 104000, count: 4 });
  });

  it('as categorias mês a mês: a de mais gasto primeiro, com a média dos meses com lançamento', () => {
    const entries = [
      entry({ category: 'comida', amount: 3000, date: '2026-09-02' }),
      entry({ category: 'comida', amount: 5000, date: '2026-10-02' }),
      entry({ category: 'mercado', amount: 20000, date: '2026-10-03' }),
    ];
    const lines = categoryLines(periodMonths(entries, '2026-10', 3));
    expect(lines).toEqual([
      { id: 'mercado', cells: [0, 0, 20000], total: 20000, avg: 10000 },
      { id: 'comida', cells: [0, 3000, 5000], total: 8000, avg: 4000 },
    ]);
  });

  it('os gastos do período, cada um uma vez: as parcelas e os meses do fixo somados', () => {
    const tv = entry({ title: 'TV', amount: 30000, installments: 4, pay: 'parcelado', date: '2026-08-10' });
    const entries = [
      tv,
      entry({ title: 'Aluguel', amount: 100000, monthly: true, date: '2026-09-10' }),
      entry({ title: 'Ifood', amount: 4000, date: '2026-10-02' }),
      entry({ title: 'Salário', flow: 'entrada', amount: 900000, date: '2026-10-05', pay: undefined }),
    ];
    const list = periodSpends(periodMonths(entries, '2026-10', 3), entries);
    expect(list.map((s) => [s.entry.title, s.total, s.months, s.last])).toEqual([
      ['Aluguel', 200000, 2, '2026-10'],
      ['TV', 90000, 3, '2026-10'],
      ['Ifood', 4000, 1, '2026-10'],
    ]);
  });

  it('o período de antes, para comparar, só quando lá há lançamento', () => {
    const entries = [entry({ amount: 1000, date: '2026-04-02' }), entry({ amount: 3000, date: '2026-09-02' })];
    expect(previousPeriod(entries, '2026-10', 3)).toBeNull();
    expect(previousPeriod(entries, '2026-10', 6)!.spent).toBe(1000);
  });

  it('o nome do período: no mesmo ano, ou passando de um ano para outro', () => {
    expect(periodLabel('2026-10', 6)).toBe('mai a out de 2026');
    expect(periodLabel('2026-10', 12)).toBe('nov/25 a out/26');
  });
});
