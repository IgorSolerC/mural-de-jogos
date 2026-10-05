import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { LocalData, deleteDataDb } from './local-data';
import { ReviewStore } from './review-store';
import { sanitizeReview } from './review';

const KEY = 'mural-de-jogos:resenhas:v1';
const WISHES = 'mural-de-jogos:desejos:v1';

function review(id: string, name: string, updatedAt: string) {
  return {
    id,
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: 7, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2024-01-01',
    createdAt: '2024-01-01T00:00:00.000Z',
    updatedAt,
    stock: 'azul',
  };
}

/** Abre o app como no navegador: carrega o LocalData e só depois cria o ReviewStore. */
async function boot(): Promise<{ data: LocalData; store: ReviewStore }> {
  TestBed.resetTestingModule();
  TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  const data = TestBed.inject(LocalData);
  await data.load();
  const store = TestBed.inject(ReviewStore);
  TestBed.tick();
  return { data, store };
}

/** Espera as gravações do IndexedDB terminarem. */
const settle = () => new Promise((r) => setTimeout(r, 50));

describe('LocalData (IndexedDB)', () => {
  beforeEach(async () => {
    localStorage.clear();
    await deleteDataDb();
  });

  afterEach(async () => {
    TestBed.resetTestingModule();
    localStorage.clear();
    await deleteDataDb();
  });

  it('a primeira abertura copia o localStorage e não apaga nada dele', async () => {
    const saved = JSON.stringify([review('raaaa1', 'Hades', '2024-01-02T00:00:00.000Z')]);
    localStorage.setItem(KEY, saved);
    localStorage.setItem(WISHES, '[]');
    const { data, store } = await boot();
    expect(data.where).toBe('indexeddb');
    expect(store.count()).toBe(1);
    expect(store.get('raaaa1')!.game.name).toBe('Hades');
    // o original continua lá, intacto
    expect(localStorage.getItem(KEY)).toBe(saved);

    // e numa segunda abertura vem do IndexedDB, mesmo sem o localStorage
    localStorage.removeItem(KEY);
    const again = await boot();
    expect(again.store.get('raaaa1')!.game.name).toBe('Hades');
  });

  it('grava no IndexedDB e deixa a cópia no localStorage', async () => {
    const { store } = await boot();
    store.add(sanitizeReview(review('rbbbb1', 'Celeste', '2024-03-01T00:00:00.000Z'))!);
    TestBed.tick();
    await settle();
    expect(JSON.parse(localStorage.getItem(KEY)!)[0].id).toBe('rbbbb1');
    expect(store.saveError()).toBeNull();
    localStorage.clear();
    const again = await boot();
    expect(again.store.get('rbbbb1')).toBeDefined();
  });

  it('o que uma versão antiga gravou no localStorage depois da migração é juntado', async () => {
    const { store } = await boot();
    store.add(sanitizeReview(review('rcccc1', 'Hollow Knight', '2024-03-01T00:00:00.000Z'))!);
    TestBed.tick();
    await settle();
    // a versão antiga (offline, pelo cache) só conhece o localStorage
    const old = JSON.parse(localStorage.getItem(KEY)!);
    old.unshift(review('rdddd1', 'Gravada offline', '2024-04-01T00:00:00.000Z'));
    localStorage.setItem(KEY, JSON.stringify(old));
    const again = await boot();
    expect(again.store.get('rcccc1')).toBeDefined();
    expect(again.store.get('rdddd1')!.game.name).toBe('Gravada offline');
  });

  it('um espelho velho (que deixou de caber) não traz de volta o que foi apagado', async () => {
    const { store } = await boot();
    store.add(sanitizeReview(review('reeee1', 'Vai embora', '2024-03-01T00:00:00.000Z'))!);
    TestBed.tick();
    await settle();
    // daqui para frente o espelho das resenhas não cabe mais
    const real = localStorage.setItem.bind(localStorage);
    const spy = spyOn(localStorage, 'setItem').and.callFake((k: string, v: string) => {
      if (k === KEY) throw new DOMException('cheio', 'QuotaExceededError');
      real(k, v);
    });
    store.remove('reeee1');
    TestBed.tick();
    await settle();
    expect(store.saveError()).toBeNull(); // o IndexedDB guardou
    spy.and.callThrough();
    const again = await boot();
    expect(again.store.get('reeee1')).toBeUndefined();
  });
});
