import { DEFAULT_CATEGORIES, DEFAULT_PERSON, Entry, rowsIn } from './spending';
import { FilterContext, filterChips, filterCount, filterGroups, filterRows, onlyIn, toggleFilter, withGroup } from './spending-filter';

let seq = 0;
function entry(over: Partial<Entry>): Entry {
  seq++;
  const at = `2026-10-01T10:${String(Math.floor(seq / 60) % 60).padStart(2, '0')}:${String(seq % 60).padStart(2, '0')}.000Z`;
  return { id: `f${seq}`, title: 'Coisa', amount: 1000, flow: 'saida', category: 'outros', pay: 'avista', date: '2026-10-05', createdAt: at, at, ...over };
}

const jantar = entry({ title: 'Jantar', category: 'comida', people: ['eu', 'bruna'], need: 'conforto' });
const entries = [
  jantar,
  entry({ title: 'Uber', pay: 'pix', category: 'transporte' }),
  entry({ title: 'Violão', pay: 'parcelado', installments: 10, date: '2026-08-03', category: 'luxo', need: 'luxo' }),
  entry({ title: 'Aluguel', monthly: true, date: '2026-01-10', category: 'aluguel', need: 'indispensavel' }),
  entry({ title: 'Salário', flow: 'entrada', pay: undefined, monthly: true, category: 'renda', date: '2026-01-05' }),
  entry({ title: 'Pix da Bruna', flow: 'entrada', pay: undefined, category: 'reembolso', refundOf: jantar.id }),
  entry({ title: 'Tênis', date: '2026-11-03', shift: -1, category: 'luxo' }),
];
const rows = rowsIn(entries, '2026-10');
const ctx: FilterContext = {
  categories: DEFAULT_CATEGORIES,
  people: [DEFAULT_PERSON, { id: 'bruna', name: 'Bruna', at: '2026-10-01T00:00:00.000Z' }],
  refunds: new Map([[jantar.id, 500]]),
  month: '2026-10',
};
const titles = (f: Parameters<typeof filterRows>[1]) => filterRows(rows, f, ctx).map((r) => r.entry.title).sort();

describe('Gastos: os filtros da fita', () => {
  it('dentro do grupo vale qualquer uma; entre grupos, todas', () => {
    expect(titles({ flow: ['entrada'] })).toEqual(['Pix da Bruna', 'Salário']);
    expect(titles({ kind: ['parcela'] })).toEqual(['Violão']);
    // sem as parcelas e sem os fixos
    expect(titles({ kind: ['uma'] })).toEqual(['Jantar', 'Pix da Bruna', 'Tênis', 'Uber']);
    expect(titles({ kind: ['uma', 'fixo'], flow: ['saida'] })).toEqual(['Aluguel', 'Jantar', 'Tênis', 'Uber']);
    expect(titles({ pay: ['pix'] })).toEqual(['Uber']);
    expect(titles({ need: ['sem'] })).toEqual(['Tênis', 'Uber']);
    expect(titles({ person: ['bruna'] })).toEqual(['Jantar']);
    expect(titles({ person: ['eu'], category: ['luxo'] })).toEqual(['Tênis', 'Violão']);
    expect(titles({ other: ['reembolso', 'voltou'] })).toEqual(['Jantar', 'Pix da Bruna']);
    expect(titles({ other: ['outro-mes'] })).toEqual(['Tênis']);
  });

  it('cada opção conta o que mostraria com os outros grupos como estão; a zerada fica apagada', () => {
    const f = { flow: ['saida'] };
    const groups = filterGroups(rows, f, ctx);
    const flow = groups.find((g) => g.key === 'flow')!;
    expect(flow.options.map((o) => [o.value, o.n, o.on])).toEqual([
      ['saida', 5, true],
      ['entrada', 2, false],
    ]);
    const kind = groups.find((g) => g.key === 'kind')!;
    expect(kind.options.map((o) => o.n)).toEqual([3, 1, 1]);
    // só as categorias do mês
    expect(groups.find((g) => g.key === 'category')!.options.map((o) => o.value)).toEqual(['comida', 'aluguel', 'luxo', 'transporte', 'renda', 'reembolso']);
    expect(groups.map((g) => g.key)).toEqual(['flow', 'kind', 'pay', 'need', 'category', 'person', 'other']);
  });

  it('Com quem e Marcas só aparecem quando têm o que separar', () => {
    const plain = rowsIn([entry({})], '2026-10');
    expect(filterGroups(plain, {}, ctx).map((g) => g.key)).toEqual(['flow', 'kind', 'pay', 'need', 'category']);
  });

  it('ligar, desligar, contar e os adesivos com X', () => {
    let f = toggleFilter({}, 'pay', 'pix');
    f = toggleFilter(f, 'person', 'bruna');
    expect(filterCount(f)).toBe(2);
    expect(onlyIn(f, 'person')).toBe('bruna');
    expect(filterChips(f, ctx).map((c) => c.label)).toEqual(['Pix', 'Com Bruna']);
    f = toggleFilter(f, 'pay', 'pix');
    expect(f).toEqual({ person: ['bruna'] });
    expect(withGroup(f, 'person', [])).toEqual({});
  });
});
