import { EnvironmentInjector, createEnvironmentInjector, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, CloudAccount, SESSION_KEY } from './cloud-account';
import { Cloud } from './cloud-config';
import { CloudSync, KeyValueStore, OWNER_KEY, SYNC_AUTO, SYNC_STORAGE } from './cloud-sync';
import { KanbanStore } from './kanban-store';
import { placeCard } from './kanban';
import { LocalData } from './local-data';
import { ProfileStore } from './profile-store';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { SyncConflict, SyncConflicts, conflictKey } from './sync-conflicts';
import { Confirm } from '../ui/confirm';
import { BrowserReset } from './browser-reset';

/**
 * A junção de três vias da conta (ver core/sync-merge.ts e core/sync-conflicts.ts), de ponta a ponta:
 * dois aparelhos da mesma conta mexendo no mesmo mural em horas parecidas, pela nuvem de mentira.
 */

const API = 'https://api.teste';
const TOKEN = 'A'.repeat(43);
const ACCOUNT = { id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor' };

/** O banco de um aparelho, só na memória. */
class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* um aparelho por vez */
  }
  takeForeign(): null {
    return null;
  }
}

function ownedKv(): KeyValueStore {
  const kv = memoryKv();
  kv.setItem(OWNER_KEY, ACCOUNT.id);
  return kv;
}

function memoryKv(): KeyValueStore {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

/** A nuvem, com as regras da API: rev, 409 para quem envia com a rev velha, 204 sem mudança. */
class FakeCloud {
  rev = 0;
  doc: Uint8Array | null = null;
  offline = false;

  async handle(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const now = { 'Mural-Agora': new Date().toISOString() };
    if (u.pathname === '/v1/eu' && method === 'GET') return json({ ...ACCOUNT, seguidores: 0, seguindo: 0 });
    if (u.pathname === '/v1/eu/mural' && method === 'GET') {
      if (!this.doc) return json({ erro: 'sem-mural', mensagem: 'Ainda não há mural na nuvem.' }, 404);
      if (u.searchParams.get('rev') === String(this.rev)) return new Response(null, { status: 204, headers: { 'Mural-Rev': String(this.rev), ...now } });
      return new Response(this.doc.slice(), { status: 200, headers: { 'Mural-Rev': String(this.rev), 'Content-Type': 'application/gzip', ...now } });
    }
    if (u.pathname === '/v1/eu/mural' && method === 'PUT') {
      const base = Number((init.headers as Record<string, string>)['Mural-Rev-Base']);
      if (base !== this.rev) return json({ erro: 'conflito', mensagem: 'Outro aparelho gravou antes.', rev: this.rev }, 409);
      this.doc = new Uint8Array(await ((init.body as FormData).get('privado') as Blob).arrayBuffer());
      this.rev++;
      return json({ rev: this.rev, novas: 0 });
    }
    return json({ erro: 'nao-encontrado', mensagem: url }, 404);
  }

  async read(): Promise<Record<string, unknown>> {
    const stream = new Blob([this.doc!.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Mural-Agora': new Date().toISOString() } });
}

function note(id: string, name: string, text: string, updatedAt = '2026-01-01T00:00:00.000Z'): Review {
  return sanitizeReview({ id, kind: 'anotacoes', game: { name, coverUrl: null, source: 'manual' }, text, createdAt: '2026-01-01T00:00:00.000Z', updatedAt })!;
}

interface Device {
  store: ReviewStore;
  settings: Settings;
  kanban: KanbanStore;
  sync: CloudSync;
  conflicts: SyncConflicts;
  get(id: string): Review;
  /** Muda a ficha como a pessoa mudaria (agora). */
  edit(id: string, change: (r: Review) => Partial<Review>): void;
}

describe('sincronização: a junção de três vias de dois aparelhos da mesma conta', () => {
  let cloud: FakeCloud;
  let parent: EnvironmentInjector;
  const injectors: { destroy(): void }[] = [];

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ACCOUNT));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    parent = TestBed.inject(EnvironmentInjector);
    cloud = new FakeCloud();
    spyOn(window, 'fetch').and.callFake((url: RequestInfo | URL, init?: RequestInit) => cloud.handle(String(url), init));
  });

  afterEach(() => {
    for (const i of injectors.splice(0)) i.destroy();
    localStorage.clear();
  });

  function device(): Device {
    const injector = createEnvironmentInjector(
      [
        { provide: LocalData, useClass: MemoryData },
        ReviewStore,
        Settings,
        ProfileStore,
        KanbanStore,
        CloudAccount,
        CloudSync,
        SyncConflicts,
        // os dois aparelhos são desta conta (o mural de ninguém perguntaria se vai junto)
        { provide: SYNC_STORAGE, useValue: ownedKv() },
        { provide: SYNC_AUTO, useValue: false },
        { provide: BrowserReset, useValue: { pending: null, request: () => undefined } },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }) } },
        { provide: Confirm, useValue: { choose: async () => null, ask: async () => true } },
      ],
      parent,
    );
    injectors.push(injector);
    const store = injector.get(ReviewStore);
    return {
      store,
      settings: injector.get(Settings),
      kanban: injector.get(KanbanStore),
      sync: injector.get(CloudSync),
      conflicts: injector.get(SyncConflicts),
      get: (id) => store.get(id)!,
      edit: (id, change) => {
        const r = store.get(id)!;
        store.update({ ...r, ...change(r), updatedAt: new Date().toISOString() });
      },
    };
  }

  /** Um tiquinho de tempo, para as mudanças não caírem no mesmo milissegundo. */
  const tick = () => new Promise((r) => setTimeout(r, 3));

  /** Sincroniza todos até ninguém mais ter o que enviar. */
  async function settle(...devices: Device[]): Promise<void> {
    for (let round = 0; round < 5; round++) {
      const before = cloud.rev;
      for (const d of devices) await d.sync.syncNow();
      if (cloud.rev === before) return;
    }
    throw new Error('a sincronização não parou de enviar');
  }

  /** Os dois aparelhos com a mesma anotação, já acertados com a nuvem. */
  async function twoDevices(text = 'Comprar pão\nLigar para a Ana\nPagar a luz'): Promise<{ a: Device; b: Device }> {
    const a = device();
    const b = device();
    a.store.add(note('rlista01', 'Lista da semana', text));
    await a.sync.syncNow();
    await b.sync.syncNow();
    expect(b.get('rlista01').text).toBe(text);
    await tick();
    return { a, b };
  }

  it('cada aparelho mexe num campo diferente: os dois ficam com as duas mudanças, sem perguntar e sem guardar versão', async () => {
    const { a, b } = await twoDevices();
    a.edit('rlista01', (r) => ({ game: { ...r.game, name: 'Lista de outubro' } }));
    await a.sync.syncNow();
    await tick();
    b.edit('rlista01', () => ({ stock: 'azul', tags: ['casa'] }));
    await settle(b, a);
    for (const d of [a, b]) {
      expect(d.get('rlista01').game.name).toBe('Lista de outubro');
      expect(d.get('rlista01').stock).toBe('azul');
      expect(d.get('rlista01').tags).toEqual(['casa']);
      expect(d.conflicts.pending()).toEqual([]);
      expect(d.store.versions()).toEqual([]);
    }
  });

  it('o mesmo texto mudado em linhas diferentes se junta', async () => {
    const { a, b } = await twoDevices();
    a.edit('rlista01', () => ({ text: 'Comprar pão integral\nLigar para a Ana\nPagar a luz' }));
    await a.sync.syncNow();
    await tick();
    b.edit('rlista01', () => ({ text: 'Comprar pão\nLigar para a Ana\nPagar a luz e a água\nLevar o lixo' }));
    await settle(b, a);
    for (const d of [a, b]) {
      expect(d.get('rlista01').text).toBe('Comprar pão integral\nLigar para a Ana\nPagar a luz e a água\nLevar o lixo');
      expect(d.conflicts.pending()).toEqual([]);
    }
  });

  it('a mesma linha mudada nos dois vira pergunta nos dois aparelhos, com a versão de cada um guardada', async () => {
    const { a, b } = await twoDevices();
    a.edit('rlista01', () => ({ text: 'Comprar pão\nLigar para a Ana às 18h\nPagar a luz' }));
    await a.sync.syncNow();
    await tick();
    b.edit('rlista01', () => ({ text: 'Comprar pão\nLigar para a Ana amanhã\nPagar a luz', stock: 'verde' }));
    await settle(b, a);
    for (const d of [a, b]) {
      // no mural, a que chegou antes na nuvem (com o resto juntado: a cor do outro aparelho)
      expect(d.get('rlista01').text).toBe('Comprar pão\nLigar para a Ana às 18h\nPagar a luz');
      expect(d.get('rlista01').stock).toBe('verde');
      const [c] = d.conflicts.pending();
      expect(c.alvo).toBe('ficha:rlista01');
      expect(c.partes).toEqual(['texto']);
      expect((c.b as Review).text).toBe('Comprar pão\nLigar para a Ana amanhã\nPagar a luz');
      expect((c.b as Review).stock).toBe('verde');
    }
    // de onde veio cada uma: a do b é a deste aparelho para o b, e de outro para o a
    const [ca] = a.conflicts.pending();
    expect(ca.deB?.id).not.toBe(ca.deA?.id);
  });

  it('a escolha num aparelho vale no outro, que não pergunta mais; a versão que ficou de fora vai para o Backup', async () => {
    const { a, b } = await twoDevices();
    a.edit('rlista01', () => ({ text: 'Comprar pão\nLigar para a Ana às 18h\nPagar a luz' }));
    await a.sync.syncNow();
    await tick();
    b.edit('rlista01', () => ({ text: 'Comprar pão\nLigar para a Ana amanhã\nPagar a luz' }));
    await settle(b, a);
    const [c] = a.conflicts.pending();
    // no a, a pessoa fica com a versão do b
    a.conflicts.resolve(conflictKey(c), 'b');
    expect(a.get('rlista01').text).toBe('Comprar pão\nLigar para a Ana amanhã\nPagar a luz');
    await settle(a, b);
    for (const d of [a, b]) {
      expect(d.get('rlista01').text).toBe('Comprar pão\nLigar para a Ana amanhã\nPagar a luz');
      expect(d.conflicts.pending()).toEqual([]);
      expect(d.store.versions().map((v) => [v.ficha.text, v.motivo])).toEqual([['Comprar pão\nLigar para a Ana às 18h\nPagar a luz', 'conflito']]);
    }
    // e ninguém pergunta de novo, nem depois de mais uma volta
    await settle(b, a);
    expect(b.conflicts.pending()).toEqual([]);
  });

  it('escolher depois de mexer na ficha não perde o que foi mexido depois do conflito', async () => {
    const { a, b } = await twoDevices();
    a.edit('rlista01', () => ({ text: 'Comprar pão\nLigar para a Ana às 18h\nPagar a luz' }));
    await a.sync.syncNow();
    await tick();
    b.edit('rlista01', () => ({ text: 'Comprar pão\nLigar para a Ana amanhã\nPagar a luz' }));
    await settle(b, a);
    await tick();
    // antes de escolher, a pessoa acrescenta uma linha no fim
    b.edit('rlista01', (r) => ({ text: `${r.text}\nRegar as plantas` }));
    const [c] = b.conflicts.pending();
    b.conflicts.resolve(conflictKey(c), 'b');
    expect(b.get('rlista01').text).toBe('Comprar pão\nLigar para a Ana amanhã\nPagar a luz\nRegar as plantas');
  });

  it('apagada num aparelho e mudada no outro: pergunta, com a mudada no mural; manter a mudada vale nos dois', async () => {
    const { a, b } = await twoDevices();
    a.store.remove('rlista01');
    await a.sync.syncNow();
    await tick();
    b.edit('rlista01', (r) => ({ text: `${r.text}\nLevar o lixo` }));
    await settle(b, a);
    for (const d of [a, b]) {
      expect(d.get('rlista01').text).toContain('Levar o lixo');
      const [c] = d.conflicts.pending();
      expect(c.a).toBeNull();
      expect((c.b as Review).text).toContain('Levar o lixo');
    }
    const [c] = a.conflicts.pending();
    a.conflicts.resolve(conflictKey(c), 'b');
    await settle(a, b);
    for (const d of [a, b]) {
      expect(d.get('rlista01').text).toContain('Levar o lixo');
      expect(d.conflicts.pending()).toEqual([]);
    }
  });

  it('mudada num aparelho e apagada no outro (do outro lado): a de lá volta e pergunta', async () => {
    const { a, b } = await twoDevices();
    a.edit('rlista01', (r) => ({ text: `${r.text}\nLevar o lixo` }));
    await a.sync.syncNow();
    await tick();
    b.store.remove('rlista01');
    await settle(b, a);
    for (const d of [a, b]) {
      expect(d.get('rlista01').text).toContain('Levar o lixo');
      const [c] = d.conflicts.pending();
      expect(c.b).toBeNull();
    }
  });

  it('um aparelho sem rede volta depois: o que ele mudou se junta com o que o outro mudou enquanto isso', async () => {
    const { a, b } = await twoDevices();
    a.store.add(note('rlista02', 'Filmes', 'Duna'));
    await a.sync.syncNow();
    await b.sync.syncNow();
    await tick();

    // o b fica sem rede e continua mexendo
    cloud.offline = true;
    b.edit('rlista01', () => ({ text: 'Comprar pão\nLigar para a Ana\nPagar a luz\nPagar a internet' }));
    b.edit('rlista02', (r) => ({ game: { ...r.game, name: 'Filmes para ver' } }));
    b.store.add(note('rlista03', 'Livros', 'Torto Arado'));
    await b.sync.syncNow();
    expect(b.sync.status()).toBe('sem-rede');
    cloud.offline = false;

    // enquanto isso, o a mexe nas mesmas fichas, em outros pedaços, e sincroniza várias vezes
    await tick();
    a.edit('rlista01', () => ({ text: 'Comprar pão francês\nLigar para a Ana\nPagar a luz' }));
    await a.sync.syncNow();
    await tick();
    a.edit('rlista02', (r) => ({ text: `${r.text}\nO Agente Secreto` }));
    await a.sync.syncNow();

    // o b volta
    await settle(b, a);
    for (const d of [a, b]) {
      expect(d.get('rlista01').text).toBe('Comprar pão francês\nLigar para a Ana\nPagar a luz\nPagar a internet');
      expect(d.get('rlista02').game.name).toBe('Filmes para ver');
      expect(d.get('rlista02').text).toBe('Duna\nO Agente Secreto');
      expect(d.get('rlista03').game.name).toBe('Livros');
      expect(d.conflicts.pending()).toEqual([]);
      expect(d.store.versions()).toEqual([]);
    }
  });

  it('as configurações do mural mudadas em pedaços diferentes nos dois aparelhos ficam as duas', async () => {
    const { a, b } = await twoDevices();
    a.settings.setNotesConfig({ audience: 'publicar' });
    await a.sync.syncNow();
    await tick();
    b.settings.setNotesConfig({ orderBy: 'minha', order: ['casa', 'trabalho'] });
    await settle(b, a);
    for (const d of [a, b]) {
      expect(d.settings.notesConfig().audience).toBe('publicar');
      expect(d.settings.notesConfig().orderBy).toBe('minha');
      expect(d.settings.notesConfig().order).toEqual(['casa', 'trabalho']);
      expect(d.conflicts.pending()).toEqual([]);
    }
  });

  it('a mesma configuração mudada de jeitos diferentes pergunta, e a escolha vale nos dois', async () => {
    const { a, b } = await twoDevices();
    a.settings.setCategoryPrefs('Casa', { audience: 'publicar' });
    await a.sync.syncNow();
    await tick();
    b.settings.setCategoryPrefs('Casa', { audience: 'visivel' });
    b.settings.setNotesConfig({ orderBy: 'minha' });
    await settle(b, a);
    const pending = (d: Device): SyncConflict[] => d.conflicts.pending().filter((c) => c.alvo === 'ajuste:muralAnotacoes');
    for (const d of [a, b]) {
      expect(pending(d).length).toBe(1);
      // vale a que chegou antes na nuvem, e o que não brigou já está junto
      expect(d.settings.notesConfig().categories['casa']?.audience).toBe('publicar');
      expect(d.settings.notesConfig().orderBy).toBe('minha');
    }
    expect(b.conflicts.linesOf(pending(b)[0], 'b')).toContain('Grupo › casa › Toda anotação nova nasce: visível');
    b.conflicts.resolve(conflictKey(pending(b)[0]), 'b');
    await settle(b, a);
    for (const d of [a, b]) {
      expect(d.settings.notesConfig().categories['casa']?.audience).toBe('visivel');
      expect(d.settings.notesConfig().orderBy).toBe('minha');
      expect(pending(d)).toEqual([]);
    }
  });

  it('o mesmo quadro Kanban mexido nos dois aparelhos: cada anotação posta fica', async () => {
    const { a, b } = await twoDevices();
    const id = a.kanban.boardFor('Casa').id;
    a.kanban.update(id, (x, at) => placeCard(x, 'rlista01', x.columns[0].id, at));
    await settle(a, b);
    await tick();
    a.kanban.update(id, (x, at) => placeCard(x, 'rnota0002', x.columns[1].id, at));
    await a.sync.syncNow();
    await tick();
    b.kanban.update(id, (x, at) => placeCard(x, 'rnota0003', x.columns[2].id, at));
    await settle(b, a);
    for (const d of [a, b]) {
      expect(d.kanban.get(id)!.cards.map((c) => c.note).sort()).toEqual(['rlista01', 'rnota0002', 'rnota0003']);
      expect(d.conflicts.pending()).toEqual([]);
    }
  });
});
