import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CATEGORY_NAME_MAX, ME, PERSON_NAME_MAX, mergeSpending } from './spending';
import { SPENDING_KEY, SpendingStore } from './spending-store';

/** O livro dos Gastos neste navegador (core/spending-store.ts): apagar, e criar categoria e pessoa pelo nome. */
describe('SpendingStore', () => {
  let store: SpendingStore;

  beforeEach(() => {
    localStorage.removeItem(SPENDING_KEY);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(SpendingStore);
  });

  afterEach(() => localStorage.removeItem(SPENDING_KEY));

  it('apagar marca depois da última mudança, mesmo vinda de um relógio adiantado: não volta na junção', () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const e = { ...store.blank(), title: 'Uber', amount: 2300 };
    store.save(e);
    // a versão de um aparelho com o relógio 5 minutos adiantado
    const ahead = { ...store.get(e.id)!, title: 'Uber mudado', at: future };
    store.merge({ ...store.state(), entries: [ahead] });
    const remote = store.state();
    store.remove(e.id);
    expect(store.state().removed[e.id] > future).toBeTrue();
    store.merge(remote);
    expect(store.get(e.id)).toBeUndefined();
  });

  it('apagar uma categoria ou uma pessoa também marca depois da última mudança dela', () => {
    const future = new Date(Date.now() + 5 * 60_000).toISOString();
    const c = store.addCategory('Sushi', 'saida');
    const p = store.addPerson('Bruna');
    const remote = mergeSpending(store.state(), {
      ...store.state(),
      categories: [{ ...c, name: 'Sushi bom', at: future }],
      people: [{ ...p, name: 'Bru', at: future }],
    });
    store.merge(remote);
    store.removeCategory(c.id);
    store.removePerson(p.id);
    store.merge(remote);
    expect(store.category(c.id)).toBeUndefined();
    expect(store.person(p.id)).toBeUndefined();
  });

  it('a categoria nova tem o nome que será guardado, e o mesmo nome comprido acha a mesma', () => {
    const long = 'Assinaturas de streaming e jogos online';
    const c = store.addCategory(long, 'saida');
    expect(c.name.length).toBeLessThanOrEqual(CATEGORY_NAME_MAX);
    expect(store.category(c.id)?.name).toBe(c.name);
    expect(store.addCategory(long, 'saida').id).toBe(c.id);
    expect(store.categories().filter((x) => x.name === c.name).length).toBe(1);
    // sem nome: os "Outros" da direção, sem criar nada
    const n = store.categories().length;
    expect(store.addCategory('   ', 'saida').id).toBe('outros');
    expect(store.addCategory('', 'entrada').id).toBe('outras-entradas');
    expect(store.categories().length).toBe(n);
  });

  it('a pessoa nova tem o nome que será guardado; sem nome, você', () => {
    const long = 'Maria Eduarda dos Santos Oliveira';
    const p = store.addPerson(`  ${long}  `);
    expect(p.name.length).toBeLessThanOrEqual(PERSON_NAME_MAX);
    expect(store.person(p.id)?.name).toBe(p.name);
    expect(store.addPerson(long).id).toBe(p.id);
    expect(store.addPerson('  ').id).toBe(ME);
  });
});
