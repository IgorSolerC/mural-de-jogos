import { signal } from '@angular/core';
import { applySpendingRequest, spendingTitle, spendingWords, undoSpending } from './api-requests-spending';
import { DEFAULT_CATEGORIES, DEFAULT_PERSON, Entry, SpendingCategory, SpendingPerson, SpendingState } from './spending';
import type { SpendingStore } from './spending-store';

/**
 * Os pedidos dos Gastos aplicados pelo site (core/api-requests-spending.ts, rodada 6): lançar pelos
 * campos e pela frase da linha de anotar, mudar e apagar com a versão, envelopes e pessoas, o Desfazer
 * e as frases da folha dos pedidos.
 */

const AT = '2026-10-05T10:00:00.000Z';
const NOW = '2026-10-27T12:00:00.000Z';
const CTX = { now: NOW, today: '2026-10-27', stamps: new Map<string, string | null>() };

/** Um livro de mentira com as mesmas operações do SpendingStore (sem armazenamento). */
class FakeBook {
  readonly state = signal<SpendingState>({
    categories: [...DEFAULT_CATEGORIES],
    people: [{ ...DEFAULT_PERSON, name: 'Igor' }, { id: 'p-bruna', name: 'Bruna', at: AT }],
    removed: {},
    entries: [
      { id: 'merc', title: 'Mercado', amount: 23050, flow: 'saida', category: 'mercado', pay: 'pix', date: '2026-10-20', createdAt: AT, at: AT },
      { id: 'ifood', title: 'Ifood', amount: 4490, flow: 'saida', category: 'comida', pay: 'avista', date: '2026-10-10', createdAt: AT, at: AT },
    ],
  });
  private n = 0;
  private stamp = () => new Date(Date.parse(NOW) + ++this.n).toISOString();
  get = (id: string) => this.state().entries.find((e) => e.id === id);
  category = (id: string) => this.state().categories.find((c) => c.id === id);
  person = (id: string) => this.state().people.find((p) => p.id === id);
  save(e: Entry): void {
    const next = { ...e, at: this.stamp() };
    this.state.update((s) => ({ ...s, entries: s.entries.some((x) => x.id === e.id) ? s.entries.map((x) => (x.id === e.id ? next : x)) : [...s.entries, next] }));
  }
  restore(e: Entry): void {
    this.save(e);
  }
  remove(id: string): Entry | undefined {
    const gone = this.get(id);
    this.state.update((s) => ({ ...s, entries: s.entries.filter((e) => e.id !== id) }));
    return gone;
  }
  addCategory(name: string, flow: 'saida' | 'entrada'): SpendingCategory {
    const c: SpendingCategory = { id: `c-${name.toLowerCase().normalize('NFD').replace(/[^a-z]/g, '')}`, name, flow, color: 'cinza', at: this.stamp() };
    this.saveCategory(c);
    return c;
  }
  saveCategory(c: SpendingCategory): void {
    this.state.update((s) => ({ ...s, categories: s.categories.some((x) => x.id === c.id) ? s.categories.map((x) => (x.id === c.id ? c : x)) : [...s.categories, c] }));
  }
  addPerson(name: string): SpendingPerson {
    const p = { id: `p-${name.toLowerCase()}`, name, at: this.stamp() };
    this.savePerson(p);
    return p;
  }
  savePerson(p: SpendingPerson): void {
    this.state.update((s) => ({ ...s, people: s.people.some((x) => x.id === p.id) ? s.people.map((x) => (x.id === p.id ? p : x)) : [...s.people, p] }));
  }
}

const bookOf = () => {
  const fake = new FakeBook();
  return { fake, store: fake as unknown as SpendingStore };
};

describe('os pedidos dos Gastos aplicados pelo site', () => {
  it('lançar pelos campos: o envelope e as pessoas pelo nome, hoje, e o mesmo pedido de novo não duplica', () => {
    const { fake, store } = bookOf();
    const out = applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rnovo1', dados: { titulo: 'Jantar', centavos: 9000, envelope: 'comida', pessoas: ['eu', 'Bruna'], precisava: 'conforto' } }, CTX);
    expect(out.estado).toBe('aplicado');
    const e = fake.get('rnovo1')!;
    expect([e.title, e.amount, e.category, e.people, e.need, e.date, e.pay]).toEqual(['Jantar', 9000, 'comida', ['eu', 'p-bruna'], 'conforto', '2026-10-27', 'avista']);
    expect((out.resultado as { lancamento: { pessoas: string[] } }).lancamento.pessoas).toEqual(['Igor', 'Bruna']);
    expect(out.antes).toBeNull();
    applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rnovo1', dados: { titulo: 'Jantar', centavos: 9000 } }, CTX);
    expect(fake.state().entries.filter((x) => x.id === 'rnovo1').length).toBe(1);
  });

  it('parcelado, mensal, fatura de depois e reembolso viram os campos do app', () => {
    const { fake, store } = bookOf();
    applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rviol', dados: { titulo: 'Violão', centavos: 13990, envelope: 'Item', parcelas: 10, fatura: 1 } }, CTX);
    expect(fake.get('rviol')).toEqual(jasmine.objectContaining({ installments: 10, pay: 'parcelado', shift: 1, category: 'luxo' }));
    applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rsal', dados: { titulo: 'Salário', centavos: 455900, tipo: 'entrada', envelope: 'Renda', mensal: true } }, CTX);
    expect(fake.get('rsal')).toEqual(jasmine.objectContaining({ flow: 'entrada', monthly: true, category: 'renda' }));
    expect(fake.get('rsal')!.pay).toBeUndefined();
    applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rvolta', dados: { titulo: 'Bruna pagou', centavos: 2000, tipo: 'entrada', envelope: 'reembolso', reembolso_de: 'merc' } }, CTX);
    expect(fake.get('rvolta')!.refundOf).toBe('merc');
  });

  it('envelope e pessoa que não existem: não entra, com os que existem; pedindo, cria', () => {
    const { fake, store } = bookOf();
    const env = applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'r1', dados: { titulo: 'Remédio', centavos: 3000, envelope: 'Farmácia' } }, CTX);
    expect(env.estado).toBe('falhou');
    expect((env.resultado as { erro: string }).erro).toContain('Mercado');
    const made = applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'r1', dados: { titulo: 'Remédio', centavos: 3000, envelope: 'Farmácia', criar_envelope: true } }, CTX);
    expect(made.estado).toBe('aplicado');
    expect(fake.get('r1')!.category).toBe('c-farmacia');
    expect(applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'r2', dados: { titulo: 'X', centavos: 100, pessoas: ['Caio'] } }, CTX).estado).toBe('falhou');
    applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'r2', dados: { titulo: 'X', centavos: 100, pessoas: ['Caio'], criar_pessoas: true } }, CTX);
    expect(fake.get('r2')!.people).toEqual(['p-caio']);
    expect(applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'r3', dados: { titulo: 'X', centavos: 100, envelope: 'Renda' } }, CTX).estado).toBe('falhou');
  });

  it('a frase entra pela linha de anotar: o valor, o dia, o envelope do histórico, as pessoas com @', () => {
    const { fake, store } = bookOf();
    const out = applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rfrase', dados: { frase: 'ifood 39,90 ontem' } }, CTX);
    expect(out.estado).toBe('aplicado');
    expect(fake.get('rfrase')).toEqual(jasmine.objectContaining({ amount: 3990, date: '2026-10-26', category: 'comida' }));
    expect(applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rf2', dados: { frase: 'jantar 600 @caio' } }, CTX).estado).toBe('falhou');
    applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rf2', dados: { frase: 'jantar 600 @caio', criar_pessoas: true } }, CTX);
    expect(fake.get('rf2')!.people).toEqual(['eu', 'p-caio']);
    const none = applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rf3', dados: { frase: 'só um nome' } }, CTX);
    expect(none.estado).toBe('falhou');
    expect((none.resultado as { erro: string }).erro).toContain('Não entendi o valor');
  });

  it('mudar pede a versão de agora (a não ser que a mudança do meio seja de um pedido daqui); apagar guarda o de antes', () => {
    const { fake, store } = bookOf();
    const old = applySpendingRequest(store, { op: 'gasto.editar', alvo: 'merc', dados: { centavos: 25000, versao: '2026-01-01T00:00:00.000Z' } }, CTX);
    expect(old.estado).toBe('conflito');
    const ok = applySpendingRequest(store, { op: 'gasto.editar', alvo: 'merc', dados: { centavos: 25000, envelope: 'comida', versao: AT } }, CTX);
    expect(ok.estado).toBe('aplicado');
    expect([fake.get('merc')!.amount, fake.get('merc')!.category]).toEqual([25000, 'comida']);
    expect((ok.antes as Entry).amount).toBe(23050);
    // a próxima mudança da AI, com a versão que ela leu antes, passa: a do meio foi um pedido aplicado aqui
    const stamps = new Map([[`merc@${ok.carimbo}`, ok.desde ?? null]]);
    expect(applySpendingRequest(store, { op: 'gasto.editar', alvo: 'merc', dados: { titulo: 'Feira', versao: AT } }, { ...CTX, stamps }).estado).toBe('aplicado');
    const del = applySpendingRequest(store, { op: 'gasto.apagar', alvo: 'ifood', dados: { versao: AT } }, CTX);
    expect(del.estado).toBe('aplicado');
    expect(fake.get('ifood')).toBeUndefined();
    undoSpending(store, { op: 'gasto.apagar', alvo: 'ifood', antes: del.antes });
    expect(fake.get('ifood')!.amount).toBe(4490);
  });

  it('o Desfazer: o lançado sai; o mudado volta como era', () => {
    const { fake, store } = bookOf();
    const made = applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'rx', dados: { titulo: 'X', centavos: 100 } }, CTX);
    undoSpending(store, { op: 'gasto.lancar', alvo: 'rx', resultado: made.resultado });
    expect(fake.get('rx')).toBeUndefined();
    const ed = applySpendingRequest(store, { op: 'gasto.editar', alvo: 'merc', dados: { centavos: 1, versao: AT } }, CTX);
    undoSpending(store, { op: 'gasto.editar', alvo: 'merc', antes: ed.antes });
    expect(fake.get('merc')!.amount).toBe(23050);
  });

  it('envelopes e pessoas: criar (com o limite), mudar e desfazer o nome', () => {
    const { fake, store } = bookOf();
    const env = applySpendingRequest(store, { op: 'envelope.criar', alvo: 'x', dados: { nome: 'Farmácia', tipo: 'saida', limite_centavos: 20000 } }, CTX);
    expect((env.resultado as { envelope: { limite_centavos: number } }).envelope.limite_centavos).toBe(20000);
    applySpendingRequest(store, { op: 'envelope.editar', alvo: 'mercado', dados: { nome: 'Feira', limite_centavos: 90000 } }, CTX);
    expect([fake.category('mercado')!.name, fake.category('mercado')!.budget]).toEqual(['Feira', 90000]);
    const p = applySpendingRequest(store, { op: 'pessoa.editar', alvo: 'eu', dados: { nome: 'Igor S.' } }, CTX);
    expect(fake.person('eu')!.name).toBe('Igor S.');
    undoSpending(store, { op: 'pessoa.editar', alvo: 'eu', antes: p.antes });
    expect(fake.person('eu')!.name).toBe('Igor');
    expect(applySpendingRequest(store, { op: 'pessoa.criar', alvo: 'x', dados: { nome: 'Caio' } }, CTX).estado).toBe('aplicado');
    expect(applySpendingRequest(store, { op: 'envelope.editar', alvo: 'nada', dados: { nome: 'X' } }, CTX).estado).toBe('falhou');
  });

  it('o pedido que não entra não deixa envelope nem pessoa criados para trás', () => {
    const { fake, store } = bookOf();
    const before = fake.state();
    const refund = applySpendingRequest(
      store,
      { op: 'gasto.lancar', alvo: 'r1', dados: { titulo: 'Volta', centavos: 500, envelope: 'Viagem', criar_envelope: true, pessoas: ['Ana'], criar_pessoas: true, reembolso_de: 'nada' } },
      CTX,
    );
    expect(refund.estado).toBe('falhou');
    const missing = applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'r2', dados: { titulo: 'X', centavos: 100, envelope: 'Viagem', criar_envelope: true, pessoas: ['Zeca'] } }, CTX);
    expect(missing.estado).toBe('falhou');
    const phrase = applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'r3', dados: { frase: 'só um nome @caio', criar_pessoas: true } }, CTX);
    expect(phrase.estado).toBe('falhou');
    expect(fake.state().categories).withContext('nenhum envelope novo').toEqual(before.categories);
    expect(fake.state().people).withContext('nenhuma pessoa nova').toEqual(before.people);
    // o mesmo pedido que entra cria os dois, uma vez
    const ok = applySpendingRequest(store, { op: 'gasto.lancar', alvo: 'r4', dados: { titulo: 'Hotel', centavos: 500, envelope: 'Viagem', criar_envelope: true, pessoas: ['Ana'], criar_pessoas: true } }, CTX);
    expect(ok.estado).toBe('aplicado');
    expect([fake.get('r4')!.category, fake.get('r4')!.people]).toEqual(['c-viagem', ['p-ana']]);
  });

  it('desfazer a mudança de um envelope tira o limite que o pedido pôs', () => {
    const { fake, store } = bookOf();
    expect(fake.category('mercado')!.budget).toBeUndefined();
    const ed = applySpendingRequest(store, { op: 'envelope.editar', alvo: 'mercado', dados: { nome: 'Feira', limite_centavos: 50000 } }, CTX);
    expect(fake.category('mercado')!.budget).toBe(50000);
    undoSpending(store, { op: 'envelope.editar', alvo: 'mercado', antes: ed.antes });
    expect([fake.category('mercado')!.name, fake.category('mercado')!.budget]).toEqual(['Mercado', undefined]);
    // com limite antes, o de antes volta
    fake.saveCategory({ ...fake.category('mercado')!, budget: 30000 });
    const ed2 = applySpendingRequest(store, { op: 'envelope.editar', alvo: 'mercado', dados: { limite_centavos: null } }, CTX);
    expect(fake.category('mercado')!.budget).toBeUndefined();
    undoSpending(store, { op: 'envelope.editar', alvo: 'mercado', antes: ed2.antes });
    expect(fake.category('mercado')!.budget).toBe(30000);
  });

  it('uma mudança sua entre a leitura da AI e um pedido dela aplicado aqui é conflito', () => {
    const { fake, store } = bookOf();
    // você mexeu no Mercado depois que a AI leu (na versão AT)
    fake.save({ ...fake.get('merc')!, title: 'Mercado do mês' });
    const mine = fake.get('merc')!.at;
    const ok = applySpendingRequest(store, { op: 'gasto.editar', alvo: 'merc', dados: { centavos: 25000, versao: mine } }, CTX);
    expect(ok.estado).toBe('aplicado');
    const stamps = new Map([[`merc@${ok.carimbo}`, ok.desde ?? null]]);
    const stale = applySpendingRequest(store, { op: 'gasto.editar', alvo: 'merc', dados: { titulo: 'Feira', versao: AT } }, { ...CTX, stamps });
    expect(stale.estado).toBe('conflito');
    expect(fake.get('merc')!.title).toBe('Mercado do mês');
    expect(applySpendingRequest(store, { op: 'gasto.editar', alvo: 'merc', dados: { titulo: 'Feira', versao: mine } }, { ...CTX, stamps }).estado).toBe('aplicado');
  });

  it('em palavras, para a folha e o histórico, e o nome que a pessoa reconhece', () => {
    const { store } = bookOf();
    expect(spendingWords('gasto.lancar', { titulo: 'Padaria', centavos: 1850 }, 'Padaria')).toBe('Lançar “Padaria”, R$ 18,50');
    expect(spendingWords('gasto.lancar', { titulo: 'Violão', centavos: 13990, parcelas: 10 }, 'Violão', true)).toBe('lançou “Violão”, R$ 139,90 em 10x');
    expect(spendingWords('gasto.lancar', { frase: 'uber 23,90 ontem' }, 'uber')).toBe('Lançar “uber 23,90 ontem”');
    expect(spendingWords('gasto.editar', { centavos: 25000, envelope: 'comida', versao: AT }, 'Mercado')).toBe('Mudar o valor e o envelope de “Mercado” (agora R$ 250,00)');
    expect(spendingWords('gasto.apagar', { versao: AT }, 'Mercado')).toBe('Apagar o lançamento “Mercado”');
    expect(spendingWords('envelope.editar', { limite_centavos: null }, 'Mercado')).toBe('Mudar o envelope “Mercado”, sem limite');
    expect(spendingWords('pessoa.editar', { nome: 'Igor' }, 'Eu')).toBe('Mudar o nome de “Eu” para “Igor”');
    expect(spendingWords('nota.criar', {}, 'x')).toBeNull();
    expect(spendingTitle(store, { op: 'gasto.editar', alvo: 'merc', dados: {} })).toBe('Mercado');
    expect(spendingTitle(store, { op: 'gasto.lancar', alvo: 'x', dados: { frase: 'uber 23' } })).toBe('uber 23');
    expect(spendingTitle(store, { op: 'envelope.editar', alvo: 'mercado', dados: {} })).toBe('Mercado');
  });
});
