import {
  DEFAULT_CATEGORIES,
  Entry,
  SpendingState,
  activeMonths,
  brl,
  dailyBalance,
  daysLeft,
  dayIn,
  fixedValue,
  installmentsAhead,
  mergeSpending,
  monthStrips,
  monthsBetween,
  openPlans,
  parseMoney,
  repeatsIn,
  rowIn,
  rowsIn,
  sanitizeSpending,
  shiftMonth,
  spendingToSync,
  spentByCategory,
  suggestions,
  titleKey,
  totals,
  usualByCategory,
  usualDelta,
} from './spending';

let seq = 0;
function entry(over: Partial<Entry>): Entry {
  seq++;
  const at = `2026-10-01T10:00:${String(seq % 60).padStart(2, '0')}.000Z`;
  return { id: `g${seq}`, title: 'Coisa', amount: 1000, flow: 'saida', category: 'outros', pay: 'avista', date: '2026-10-05', createdAt: at, at, ...over };
}

describe('Gastos: dinheiro', () => {
  it('lê o valor como se escreve no Brasil', () => {
    expect(parseMoney('44,90')).toBe(4490);
    expect(parseMoney('1.234,56')).toBe(123456);
    expect(parseMoney('R$ 4.559')).toBe(455900);
    expect(parseMoney('12.5')).toBe(1250);
    expect(parseMoney('12.50')).toBe(1250);
    expect(parseMoney('1.399')).toBe(139900);
    expect(parseMoney('44,')).toBe(4400);
    expect(parseMoney('0')).toBeNull();
    expect(parseMoney('abc')).toBeNull();
    expect(parseMoney('1,2,3')).toBeNull();
  });

  it('escreve com o R$ e o sinal na frente', () => {
    expect(brl(123456)).toBe('R$ 1.234,56');
    expect(brl(-1200)).toBe('−R$ 12,00');
  });
});

describe('Gastos: meses', () => {
  it('anda pelos meses e conta a distância', () => {
    expect(shiftMonth('2026-11', 3)).toBe('2027-02');
    expect(shiftMonth('2026-01', -1)).toBe('2025-12');
    expect(monthsBetween('2026-05', '2027-02')).toBe(9);
    expect(dayIn('2027-02', '2026-01-31')).toBe('2027-02-28');
  });
});

describe('Gastos: o mês', () => {
  it('a parcela de cada mês, com o número dela', () => {
    const violao = entry({ title: 'Violão', amount: 13990, pay: 'parcelado', installments: 10, date: '2026-04-15' });
    expect(rowIn(violao, '2026-03')).toBeNull();
    expect(rowIn(violao, '2026-10')!.part).toEqual({ n: 7, of: 10 });
    expect(rowIn(violao, '2026-10')!.day).toBe('2026-10-15');
    expect(rowIn(violao, '2027-01')!.part).toEqual({ n: 10, of: 10 });
    expect(rowIn(violao, '2027-02')).toBeNull();
  });

  it('o fixo se repete, muda de valor dali em diante, pula um mês e acaba', () => {
    const luz = entry({ title: 'Luz', amount: 14505, monthly: true, date: '2026-08-10', values: { '2026-10': 16000 }, skip: ['2026-11'], until: '2027-01' });
    expect(rowIn(luz, '2026-07')).toBeNull();
    expect(rowIn(luz, '2026-09')!.amount).toBe(14505);
    expect(rowIn(luz, '2026-10')!.amount).toBe(16000);
    expect(rowIn(luz, '2026-11')).toBeNull();
    expect(rowIn(luz, '2026-12')!.amount).toBe(16000);
    expect(rowIn(luz, '2027-02')).toBeNull();
    expect(fixedValue(luz, '2026-09')).toBe(14505);
  });

  it('os totais, o que já vinha de antes e o saldo dia a dia', () => {
    const list = [
      entry({ title: 'Salário', amount: 455900, flow: 'entrada', category: 'renda', date: '2026-10-05', pay: undefined }),
      entry({ title: 'Aluguel', amount: 219172, monthly: true, date: '2026-09-10' }),
      entry({ title: 'Violão', amount: 13990, installments: 10, pay: 'parcelado', date: '2026-04-15' }),
      entry({ title: 'Ifood', amount: 4454, date: '2026-10-02' }),
    ];
    const rows = rowsIn(list, '2026-10');
    expect(rows.map((r) => r.entry.title)).toEqual(['Violão', 'Aluguel', 'Salário', 'Ifood']);
    expect(totals(rows)).toEqual({ income: 455900, spent: 219172 + 13990 + 4454, balance: 455900 - 237616, committed: 219172 + 13990 });
    const days = dailyBalance(rows, '2026-10');
    expect(days.length).toBe(31);
    expect(days[0].balance).toBe(0);
    expect(days[1].balance).toBe(-4454);
    expect(days[4].balance).toBe(455900 - 4454);
    expect(days[30].balance).toBe(455900 - 237616);
    expect(dailyBalance(rows, '2026-10', '2026-10-03').length).toBe(3);
    expect(daysLeft('2026-10', '2026-10-26')).toBe(6);
    expect(daysLeft('2026-09', '2026-10-26')).toBe(0);
  });

  it('o reembolso ligado tira o valor da categoria do gasto', () => {
    const churras = entry({ title: 'Churrasco', amount: 42200, category: 'eventos' });
    const list = [
      churras,
      entry({ title: 'Reembolso', amount: 7218, flow: 'entrada', category: 'reembolso', refundOf: churras.id, pay: undefined }),
      entry({ title: 'Reembolso', amount: 50000, flow: 'entrada', category: 'reembolso', refundOf: churras.id, pay: undefined }),
      entry({ title: 'Show', amount: 6700, category: 'eventos' }),
    ];
    expect(spentByCategory(rowsIn(list, '2026-10'), list)).toEqual([{ id: 'eventos', amount: 0 }]);
    // nos totais também: desconta do que saiu, não conta como entrada, e o saldo é o mesmo
    const t = totals(rowsIn(list, '2026-10'), list);
    expect([t.income, t.spent, t.balance]).toEqual([0, 42200 + 6700 - 57218, -(42200 + 6700) + 57218]);
    expect(totals(rowsIn(list, '2026-10')).income).toBe(57218);
  });

  it('o costume: a média dos meses de antes que têm lançamento', () => {
    const list = [
      entry({ amount: 1000, category: 'comida', date: '2026-07-02' }),
      entry({ amount: 3000, category: 'comida', date: '2026-09-02' }),
      entry({ amount: 9000, category: 'comida', date: '2026-10-02' }),
    ];
    const usual = usualByCategory(list, '2026-10');
    expect(usual.months).toBe(2);
    expect(usual.avg.get('comida')).toBe(2000);
    expect(usual.seen.get('comida')).toBe(2);
    // a diferença só vale com costume de verdade e quando passa de 15% e de R$ 50
    expect(usualDelta(9000, 2000, 2)).toBe(3.5);
    expect(usualDelta(9000, 2000, 1)).toBeUndefined();
    expect(usualDelta(2100, 2000, 3)).toBeUndefined();
    expect(usualDelta(20000, 30000, 3)).toBeCloseTo(-1 / 3);
    expect(activeMonths(list)).toEqual(['2026-07', '2026-09', '2026-10']);
  });

  it('as faixas do mês a mês, da mais antiga à aberta', () => {
    const list = [entry({ amount: 1000, date: '2026-09-02' }), entry({ amount: 500, flow: 'entrada', category: 'renda', date: '2026-10-02', pay: undefined })];
    const strips = monthStrips(list, '2026-10', 3);
    expect(strips.map((s) => [s.month, s.spent, s.income])).toEqual([
      ['2026-08', 0, 0],
      ['2026-09', 1000, 0],
      ['2026-10', 0, 500],
    ]);
  });

  it('os carnês abertos e o que ainda vem pela frente', () => {
    const list = [
      entry({ title: 'Violão', amount: 13990, installments: 10, pay: 'parcelado', date: '2026-04-15' }),
      entry({ title: 'Steam', amount: 6096, installments: 3, pay: 'parcelado', date: '2026-08-15' }),
      entry({ title: 'Mic', amount: 14308, installments: 2, pay: 'parcelado', date: '2026-12-01' }),
    ];
    expect(openPlans(list, '2026-10').map((p) => [p.entry.title, p.current, p.of, p.left, p.last])).toEqual([
      ['Steam', 3, 3, 0, '2026-10'],
      // no mesmo último mês, o que ainda deve mais primeiro
      ['Violão', 7, 10, 3 * 13990, '2027-01'],
      ['Mic', 1, 2, 14308, '2027-01'],
    ]);
    expect(installmentsAhead(list, '2026-10')).toEqual({ total: 3 * 13990 + 2 * 14308, nextMonth: 13990, last: '2027-01' });
  });
});

describe('Gastos: semelhanças', () => {
  it('a chave do nome ignora acento, caixa e a parcela escrita à mão', () => {
    expect(titleKey('Steam 3/3')).toBe('steam');
    expect(titleKey('Violão (7/10)')).toBe('violao');
    expect(titleKey('  IFOOD ')).toBe('ifood');
  });

  it('sugere pelo começo de qualquer palavra, o mais usado primeiro, com o último valor', () => {
    const list = [
      entry({ title: 'Ifood', amount: 4939, category: 'comida', createdAt: '2026-10-01T00:00:00.000Z' }),
      entry({ title: 'iFood', amount: 4454, category: 'comida', createdAt: '2026-10-03T00:00:00.000Z' }),
      entry({ title: 'Compras Extra', amount: 8177, category: 'mercado' }),
    ];
    const s = suggestions(list, 'if');
    expect(s.map((x) => [x.title, x.amount, x.times])).toEqual([['iFood', 4454, 2]]);
    expect(suggestions(list, 'ext')[0].category).toBe('mercado');
  });

  it('o que se repetiu no mês (fixos e parcelas não contam)', () => {
    const list = [entry({ title: 'Ifood', amount: 4454 }), entry({ title: 'iFood', amount: 4939 }), entry({ title: 'Luz', monthly: true }), entry({ title: 'Luz' })];
    expect(repeatsIn(rowsIn(list, '2026-10')).map((r) => [r.times, r.total])).toEqual([[2, 9393]]);
  });
});

describe('Gastos: guardar e juntar', () => {
  it('começa com as categorias da planilha e só vai para a nuvem com algo da pessoa', () => {
    const empty = sanitizeSpending(null);
    expect(empty.categories.map((c) => c.id)).toEqual(DEFAULT_CATEGORIES.map((c) => c.id));
    expect(spendingToSync(empty)).toBeNull();
    expect(spendingToSync({ ...empty, entries: [entry({})] })).not.toBeNull();
  });

  it('confere cada peça: valor inteiro positivo, dia válido, parcelas só nas saídas', () => {
    const st = sanitizeSpending({
      entries: [
        entry({ amount: -5 }),
        entry({ amount: 10.5 }),
        entry({ date: '2026-13-01' }),
        { ...entry({ title: 'Ok', flow: 'entrada', category: 'renda' }), installments: 3, pay: 'pix' },
        { ...entry({ title: 'Parcelado sem parcelas' }), pay: 'parcelado' },
      ],
      categories: [{ id: 'sushi', name: 'Sushi', flow: 'saida', color: 'rosa', at: '2026-10-01T00:00:00.000Z', budget: 60000 }],
    });
    expect(st.entries.map((e) => [e.title, e.installments, e.pay])).toEqual([
      ['Ok', undefined, undefined],
      ['Parcelado sem parcelas', undefined, 'avista'],
    ]);
    expect(st.categories.find((c) => c.id === 'sushi')!.budget).toBe(60000);
  });

  it('junta dois aparelhos: o mudado por último vence, o apagado fica apagado, nos dois sentidos', () => {
    const a = entry({ title: 'A' });
    const b = entry({ title: 'B' });
    const here: SpendingState = sanitizeSpending({ entries: [a, b] });
    const there: SpendingState = sanitizeSpending({
      entries: [{ ...a, title: 'A mudado', at: '2026-10-02T00:00:00.000Z' }],
      removed: { [b.id]: '2026-10-02T00:00:00.000Z' },
      categories: [{ ...DEFAULT_CATEGORIES[0], name: 'Rango', at: '2026-10-02T00:00:00.000Z' }],
    });
    const ab = mergeSpending(here, there);
    const ba = mergeSpending(there, here);
    expect(ab).toEqual(ba);
    expect(ab.entries.map((e) => e.title)).toEqual(['A mudado']);
    expect(ab.categories[0].name).toBe('Rango');
  });
});
