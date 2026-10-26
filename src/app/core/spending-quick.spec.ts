import { DEFAULT_CATEGORIES, Entry } from './spending';
import { QuickContext, quickToEntry, readQuick } from './spending-quick';

const old = (over: Partial<Entry>): Entry => ({
  id: 'x' + Math.random().toString(36).slice(2, 8),
  title: 'Coisa',
  amount: 1000,
  flow: 'saida',
  category: 'outros',
  pay: 'avista',
  date: '2026-09-02',
  createdAt: '2026-09-02T10:00:00.000Z',
  at: '2026-09-02T10:00:00.000Z',
  ...over,
});

const ctx = (entries: Entry[] = [], month = '2026-10'): QuickContext => ({ entries, categories: DEFAULT_CATEGORIES, today: '2026-10-26', month });

describe('Gastos: a linha de anotar', () => {
  it('nome e valor: uma saída à vista, hoje, na categoria de sempre', () => {
    expect(readQuick('pomada 77', ctx())).toEqual({ title: 'Pomada', amount: 7700, flow: 'saida', category: 'outros', pay: 'avista', date: '2026-10-26', from: 'padrao' });
  });

  it('o mesmo gasto de antes traz a categoria e o pagamento dele', () => {
    const q = readQuick('ifood 44,90', ctx([old({ title: 'iFood', category: 'comida', pay: 'pix' })]));
    expect([q.title, q.amount, q.category, q.pay, q.from]).toEqual(['Ifood', 4490, 'comida', 'pix', 'historico']);
  });

  it('parcelas: "10x de 139,90" e "7/10" (a primeira foi seis meses antes)', () => {
    const a = readQuick('violão 10x de 139,90', ctx());
    expect([a.title, a.amount, a.pay, a.installments, a.part, a.date]).toEqual(['Violão', 13990, 'parcelado', 10, 1, '2026-10-26']);
    const b = readQuick('violão aço 7/10 139,90', ctx());
    expect([b.title, b.installments, b.part, b.date]).toEqual(['Violão aço', 10, 7, '2026-04-26']);
    expect(quickToEntry(b)!.installments).toBe(10);
  });

  it('entrada pelo sinal ou pela palavra; o fixo pelo "todo mês"', () => {
    const s = readQuick('salário +4.559 todo mês', ctx());
    expect([s.title, s.amount, s.flow, s.monthly, s.pay, s.category]).toEqual(['Salário', 455900, 'entrada', true, undefined, 'outras-entradas']);
    expect(readQuick('recebi reembolso churras 72,18', ctx()).category).toBe('reembolso');
  });

  it('num gasto o pix é o pagamento; numa entrada, de onde veio o dinheiro', () => {
    const a = readQuick('uber 23 no pix', ctx());
    expect([a.title, a.pay]).toEqual(['Uber', 'pix']);
    const b = readQuick('pix da bru +100', ctx());
    expect([b.title, b.flow, b.category]).toEqual(['Pix da bru', 'entrada', 'pix']);
  });

  it('a categoria escrita (com # ou o nome) e o dia escrito', () => {
    const a = readQuick('uber 23 ontem #transporte', ctx());
    expect([a.title, a.category, a.from, a.date]).toEqual(['Uber', 'transporte', 'escrita', '2026-10-25']);
    expect(readQuick('compras mercado 81,77 dia 3', ctx()).category).toBe('mercado');
    expect(readQuick('compras mercado 81,77 dia 3', ctx()).date).toBe('2026-10-03');
    expect(readQuick('show 67 05/09/2026', ctx()).date).toBe('2026-09-05');
  });

  it('noutro mês aberto, o lançamento cai nele', () => {
    expect(readQuick('luz 145,05', ctx([], '2026-08')).date).toBe('2026-08-26');
  });

  it('sem valor ou sem nome não lança', () => {
    expect(quickToEntry(readQuick('ifood', ctx()))).toBeNull();
    expect(quickToEntry(readQuick('44,90', ctx()))).toBeNull();
  });
});
