import { EnvironmentInjector, createEnvironmentInjector, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, CloudAccount, SESSION_KEY } from './cloud-account';
import { readBeforeCloud } from './cloud-before';
import { Cloud } from './cloud-config';
import { CloudSync, KeyValueStore, OWNER_KEY, STATE_KEY, SYNC_AUTO, SYNC_SCHEMA, SYNC_STORAGE, fingerprint, newReviews, publicReviews } from './cloud-sync';
import { LocalData } from './local-data';
import { Review, sanitizeDraft, sanitizeNote, sanitizeReview, sanitizeWish } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { Choice, Confirm } from '../ui/confirm';

const API = 'https://api.teste';
const TOKEN = 'A'.repeat(43);
const ACCOUNT = { id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor' };

/** O banco de um aparelho, só na memória (cada aparelho do teste tem o seu). */
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

function memoryKv(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return {
    map,
    getItem: (k) => map.get(k) ?? null,
    setItem: (k, v) => void map.set(k, v),
    removeItem: (k) => void map.delete(k),
  };
}

/**
 * A nuvem, de mentira, com as mesmas regras da API: rev, 409 para quem envia com a rev velha, 204
 * quando nada mudou, 404 sem mural.
 */
class FakeCloud {
  rev = 0;
  doc: Uint8Array | null = null;
  offline = false;
  puts = 0;
  gets = 0;

  async handle(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const now = { 'Mural-Agora': new Date().toISOString() };
    if (u.pathname === '/v1/eu' && method === 'GET') return json({ ...ACCOUNT, seguidores: 0, seguindo: 0 });
    if (u.pathname === '/v1/eu' && method === 'PATCH') return json({ nome: JSON.parse(String(init.body)).nome });
    if (u.pathname === '/v1/eu/mural' && method === 'GET') {
      this.gets++;
      if (!this.doc) return json({ erro: 'sem-mural', mensagem: 'Ainda não há mural na nuvem.' }, 404);
      if (u.searchParams.get('rev') === String(this.rev)) return new Response(null, { status: 204, headers: { 'Mural-Rev': String(this.rev), ...now } });
      return new Response(this.doc.slice(), { status: 200, headers: { 'Mural-Rev': String(this.rev), 'Content-Type': 'application/gzip', ...now } });
    }
    if (u.pathname === '/v1/eu/mural' && method === 'PUT') {
      const base = Number(headers['Mural-Rev-Base']);
      if (base !== this.rev) return json({ erro: 'conflito', mensagem: 'Outro aparelho gravou antes.', rev: this.rev }, 409);
      const form = init.body as FormData;
      this.doc = new Uint8Array(await (form.get('privado') as Blob).arrayBuffer());
      this.rev++;
      this.puts++;
      return json({ rev: this.rev, novas: 0 });
    }
    return json({ erro: 'nao-encontrado', mensagem: url }, 404);
  }

  /** O mural da nuvem, aberto. */
  async read(): Promise<{ reviews: Review[]; sync?: { schema: number } }> {
    const stream = new Blob([this.doc!.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  /** Põe um mural pronto na nuvem (como se outro aparelho tivesse enviado). */
  async seed(doc: unknown): Promise<void> {
    const stream = new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('gzip'));
    this.doc = new Uint8Array(await new Response(stream).arrayBuffer());
    this.rev++;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Mural-Agora': new Date().toISOString() } });
}

function review(id: string, name: string, updatedAt = '2026-01-01T00:00:00.000Z', createdAt = '2026-01-01T00:00:00.000Z'): Review {
  return sanitizeReview({
    id,
    kind: 'jogos',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: 7, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2026-01-01',
    createdAt,
    updatedAt,
  })!;
}

interface Device {
  store: ReviewStore;
  settings: Settings;
  sync: CloudSync;
  kv: ReturnType<typeof memoryKv>;
  /** As respostas que a pessoa daria às perguntas, em ordem (null: fechou sem escolher). */
  answers: Choice[];
  asked: string[];
  names(): string[];
}

describe('sincronização com a nuvem', () => {
  let cloud: FakeCloud;
  let parent: EnvironmentInjector;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase('meu-mural:antes-da-nuvem');
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
    localStorage.clear();
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify(ACCOUNT));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    parent = TestBed.inject(EnvironmentInjector);
    cloud = new FakeCloud();
    spyOn(window, 'fetch').and.callFake((url: RequestInfo | URL, init?: RequestInit) => cloud.handle(String(url), init));
  });

  const injectors: { destroy(): void }[] = [];
  afterEach(() => {
    for (const i of injectors.splice(0)) i.destroy();
    localStorage.clear();
  });

  function device(): Device {
    const kv = memoryKv();
    const answers: Choice[] = [];
    const asked: string[] = [];
    const confirm = {
      choose: async (o: { title?: string }) => {
        asked.push(o.title ?? '');
        return answers.length ? answers.shift()! : null;
      },
      ask: async () => true,
    };
    const injector = createEnvironmentInjector(
      [
        { provide: LocalData, useClass: MemoryData },
        ReviewStore,
        Settings,
        CloudAccount,
        CloudSync,
        { provide: SYNC_STORAGE, useValue: kv },
        { provide: SYNC_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }) } },
        { provide: Confirm, useValue: confirm },
      ],
      parent,
    );
    injectors.push(injector);
    const store = injector.get(ReviewStore);
    return {
      store,
      settings: injector.get(Settings),
      sync: injector.get(CloudSync),
      kv,
      answers,
      asked,
      names: () => store.reviews().map((r) => r.game.name).sort(),
    };
  }

  /** Sincroniza todos até ninguém mais ter o que enviar; devolve quantas rodadas levou. */
  async function settle(...devices: Device[]): Promise<number> {
    for (let round = 1; round <= 5; round++) {
      const before = cloud.puts;
      for (const d of devices) await d.sync.syncNow();
      if (cloud.puts === before) return round;
    }
    throw new Error('a sincronização não parou de enviar');
  }

  describe('as chaves de busca', () => {
    /** Cada aparelho com os próprios ajustes (o localStorage do teste é um só). */
    function fresh(): Device {
      localStorage.removeItem('mural-de-jogos:config:v1');
      return device();
    }

    it('vão para os outros aparelhos pela nuvem, mas nunca no arquivo de backup', async () => {
      const a = fresh();
      a.store.add(review('raaaa1', 'Celeste'));
      a.settings.setKey('rawg', 'chave-rawg-123');
      await a.sync.syncNow();
      const cloudDoc = (await cloud.read()) as unknown as { chaves?: { rawg: string; tmdb: string } };
      expect(cloudDoc.chaves).toEqual(jasmine.objectContaining({ rawg: 'chave-rawg-123', tmdb: '' }));
      const { blob } = await a.store.exportBackup('Igor');
      const stream = blob.stream().pipeThrough(new DecompressionStream('gzip'));
      const backupText = await new Response(stream).text();
      expect(backupText).not.toContain('chave-rawg-123');

      const b = fresh();
      await b.sync.syncNow();
      expect(b.settings.rawgKey()).toBe('chave-rawg-123');
      expect(await settle(a, b)).toBe(1);
    });

    it('a mudança mais nova vence, inclusive apagar uma chave', async () => {
      const a = fresh();
      a.settings.setKey('rawg', 'rawg-a');
      a.settings.setKey('tmdb', 'tmdb-a');
      await a.sync.syncNow();
      const b = fresh();
      await b.sync.syncNow();
      expect(b.settings.tmdbKey()).toBe('tmdb-a');

      await new Promise((r) => setTimeout(r, 5));
      b.settings.setKey('tmdb', 'tmdb-b');
      b.settings.setKey('rawg', '');
      await settle(b, a);
      expect(a.settings.tmdbKey()).toBe('tmdb-b');
      expect(a.settings.rawgKey()).toBe('');
      expect(await settle(a, b)).toBe(1);
    });

    it('chaves de antes da sincronização (sem data) perdem para as que já estão na nuvem', async () => {
      const a = fresh();
      a.settings.setKey('rawg', 'da-nuvem');
      await a.sync.syncNow();
      const b = fresh();
      b.settings.rawgKey.set('antiga-sem-data');
      await b.sync.syncNow();
      expect(b.settings.rawgKey()).toBe('da-nuvem');
    });

    it('sem chave nenhuma, o mural vai sem o campo', async () => {
      const a = fresh();
      a.store.add(review('raaaa1', 'Celeste'));
      await a.sync.syncNow();
      expect('chaves' in (await cloud.read())).toBeFalse();
    });
  });

  it('o primeiro aparelho sobe o mural; o segundo, vazio, recebe tudo', async () => {
    const a = device();
    a.store.add(review('raaaa1', 'Celeste'));
    a.store.add(review('rbbbb1', 'Hades'));
    await a.sync.syncNow();
    expect(a.sync.status()).toBe('ok');
    expect(cloud.rev).toBe(1);
    expect((await cloud.read()).reviews.map((r) => r.game.name).sort()).toEqual(['Celeste', 'Hades']);
    expect((await cloud.read()).sync).toEqual({ schema: SYNC_SCHEMA });

    const b = device();
    await b.sync.syncNow();
    expect(b.names()).toEqual(['Celeste', 'Hades']);
    expect(b.asked).toEqual([]);
    expect(await settle(a, b)).toBe(1);
  });

  it('dois aparelhos mexendo ao mesmo tempo: ninguém perde nada', async () => {
    const a = device();
    a.store.add(review('raaaa1', 'Celeste'));
    await a.sync.syncNow();
    const b = device();
    await b.sync.syncNow();

    // offline um do outro: A edita Celeste, B prega uma ficha nova
    a.store.update({ ...a.store.get('raaaa1')!, game: { ...a.store.get('raaaa1')!.game, name: 'Celeste (editada em A)' }, updatedAt: '2026-02-01T00:00:00.000Z' });
    b.store.add(review('rcccc1', 'Hollow Knight'));
    await a.sync.syncNow();
    await b.sync.syncNow(); // recebe 409, junta e envia de novo
    await a.sync.syncNow();

    expect(a.names()).toEqual(['Celeste (editada em A)', 'Hollow Knight']);
    expect(b.names()).toEqual(['Celeste (editada em A)', 'Hollow Knight']);
    expect(await settle(a, b)).toBe(1);
    expect(await fingerprint(a.store.snapshot())).toBe(await fingerprint(b.store.snapshot()));
  });

  it('apagar num aparelho vence a edição mais antiga do outro; a edição mais nova vence o apagar', async () => {
    const a = device();
    a.store.add(review('raaaa1', 'Celeste'));
    a.store.add(review('rbbbb1', 'Hades'));
    await a.sync.syncNow();
    const b = device();
    await b.sync.syncNow();

    a.store.remove('raaaa1'); // apagada agora
    a.store.remove('rbbbb1');
    b.store.update({ ...b.store.get('raaaa1')!, updatedAt: '2026-01-02T00:00:00.000Z' }); // editada antes de apagar
    b.store.update({ ...b.store.get('rbbbb1')!, game: { ...b.store.get('rbbbb1')!.game, name: 'Hades II' }, updatedAt: new Date(Date.now() + 60_000).toISOString() });
    await settle(a, b);
    expect(a.names()).toEqual(['Hades II']);
    expect(b.names()).toEqual(['Hades II']);
  });

  it('o pra depois editado num aparelho chega no outro', async () => {
    const a = device();
    a.store.saveDraft(sanitizeDraft({ id: 'rdddd1', kind: 'jogos', game: { name: 'Silksong' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })!);
    a.store.saveWish(sanitizeWish({ id: 'rwwww1', kind: 'jogos', game: { name: 'Hades II' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })!);
    await a.sync.syncNow();
    const b = device();
    await b.sync.syncNow();
    b.store.saveDraft({ ...b.store.getDraft('rdddd1')!, game: { ...b.store.getDraft('rdddd1')!.game, name: 'Hollow Knight: Silksong' }, updatedAt: '2026-03-01T00:00:00.000Z' });
    await settle(b, a);
    expect(a.store.drafts().map((d) => d.game.name)).toEqual(['Hollow Knight: Silksong']);
    expect(a.store.wishes().map((w) => w.game.name)).toEqual(['Hades II']);
  });

  it('sem internet: nada se perde, e sobe quando a conexão volta', async () => {
    const a = device();
    a.store.add(review('raaaa1', 'Celeste'));
    await a.sync.syncNow();
    cloud.offline = true;
    a.store.add(review('rbbbb1', 'Hades'));
    await a.sync.syncNow();
    expect(a.sync.status()).toBe('sem-rede');
    expect(a.names()).toEqual(['Celeste', 'Hades']);
    expect(await a.sync.everythingSent()).toBeFalse();
    cloud.offline = false;
    await a.sync.syncNow();
    expect(a.sync.status()).toBe('ok');
    expect((await cloud.read()).reviews.map((r) => r.game.name).sort()).toEqual(['Celeste', 'Hades']);
    expect(await a.sync.everythingSent()).toBeTrue();
  });

  it('juntar o que veio da nuvem não gera reenvio', async () => {
    const a = device();
    a.store.add(review('raaaa1', 'Celeste'));
    await a.sync.syncNow();
    const b = device();
    await b.sync.syncNow();
    const puts = cloud.puts;
    a.store.add(review('rbbbb1', 'Hades'));
    await a.sync.syncNow();
    await b.sync.syncNow();
    await b.sync.syncNow();
    expect(cloud.puts).toBe(puts + 1);
    expect(b.names()).toEqual(['Celeste', 'Hades']);
  });

  describe('primeira vez num aparelho que já tem mural', () => {
    async function cloudWith(...names: string[]) {
      await cloud.seed({ app: 'meu-mural', version: 2, reviews: names.map((n, i) => review(`rnuv${i}a`, n)), drafts: [], wishes: [], deleted: {} });
    }

    it('mural sem dono e conta com mural: pergunta; "Juntar" junta e guarda a cópia de antes', async () => {
      await cloudWith('Da nuvem');
      const a = device();
      a.store.add(review('rlocal1', 'Daqui'));
      a.answers.push('confirm');
      await a.sync.syncNow();
      expect(a.asked).toEqual(['Juntar os murais?']);
      expect(a.names()).toEqual(['Da nuvem', 'Daqui']);
      expect((await cloud.read()).reviews.length).toBe(2);
      expect(await readBeforeCloud()).not.toBeNull();
      expect(a.kv.getItem(OWNER_KEY)).toBe(ACCOUNT.id);
    });

    it('"Só o da conta" troca o daqui pelo da nuvem', async () => {
      await cloudWith('Da nuvem');
      const a = device();
      a.store.add(review('rlocal1', 'Daqui'));
      a.answers.push('secondary');
      await a.sync.syncNow();
      expect(a.names()).toEqual(['Da nuvem']);
      expect((await cloud.read()).reviews.map((r) => r.game.name)).toEqual(['Da nuvem']);
    });

    it('fechar sem escolher não mexe em nada e espera', async () => {
      await cloudWith('Da nuvem');
      const a = device();
      a.store.add(review('rlocal1', 'Daqui'));
      const puts = cloud.puts;
      await a.sync.syncNow();
      expect(a.sync.status()).toBe('escolha');
      expect(a.names()).toEqual(['Daqui']);
      expect(cloud.puts).toBe(puts);
      expect(a.kv.getItem(STATE_KEY)).toBeNull();
      // depois ela escolhe
      a.answers.push('confirm');
      await a.sync.syncNow();
      expect(a.names()).toEqual(['Da nuvem', 'Daqui']);
    });

    it('o mural daqui já era desta conta: junta sem perguntar', async () => {
      await cloudWith('Da nuvem');
      const a = device();
      a.kv.setItem(OWNER_KEY, ACCOUNT.id);
      a.store.add(review('rlocal1', 'Daqui'));
      await a.sync.syncNow();
      expect(a.asked).toEqual([]);
      expect(a.names()).toEqual(['Da nuvem', 'Daqui']);
    });

    it('o mural daqui é de outra conta e esta conta está vazia: pergunta antes de levar', async () => {
      const a = device();
      a.kv.setItem(OWNER_KEY, 'outra-conta');
      a.store.add(review('rlocal1', 'Da outra pessoa'));
      a.answers.push('secondary'); // começar vazia
      await a.sync.syncNow();
      expect(a.asked).toEqual(['Este mural é de outra conta']);
      expect(a.names()).toEqual([]);
      expect((await cloud.read()).reviews).toEqual([]);
      expect(await readBeforeCloud()).not.toBeNull();
    });

    it('sem nada na conta e o daqui sem dono: sobe sem perguntar', async () => {
      const a = device();
      a.store.add(review('rlocal1', 'Daqui'));
      await a.sync.syncNow();
      expect(a.asked).toEqual([]);
      expect((await cloud.read()).reviews.map((r) => r.game.name)).toEqual(['Daqui']);
    });
  });

  it('mural salvo por uma versão mais nova do site: para, sem juntar nem enviar', async () => {
    await cloud.seed({ app: 'meu-mural', version: 2, sync: { schema: SYNC_SCHEMA + 1 }, reviews: [review('rnovo1', 'Do futuro')], drafts: [], wishes: [], deleted: {} });
    const a = device();
    a.kv.setItem(OWNER_KEY, ACCOUNT.id);
    a.store.add(review('rlocal1', 'Daqui'));
    const puts = cloud.puts;
    await a.sync.syncNow();
    expect(a.sync.status()).toBe('desatualizado');
    expect(a.names()).toEqual(['Daqui']);
    expect(cloud.puts).toBe(puts);
  });

  it('as resenhas novas (até 7 dias) vão na lista para avisar quem segue', async () => {
    const a = device();
    const now = new Date().toISOString();
    a.store.add(review('rvelha1', 'Antiga'));
    a.store.add(review('rnova01', 'Nova', now, now));
    const fetchSpy = window.fetch as jasmine.Spy;
    await a.sync.syncNow();
    const put = fetchSpy.calls.all().find((c) => (c.args[1] as RequestInit | undefined)?.method === 'PUT')!;
    const novas = JSON.parse((put.args[1] as RequestInit).body instanceof FormData ? (((put.args[1] as RequestInit).body as FormData).get('novas') as string) : '[]');
    expect(novas).toEqual([{ ref: 'rnova01', titulo: 'Nova', mural: 'jogos' }]);
  });

  it('a anotação vira aviso ao deixar de ser privada, mesmo escrita há meses; a privada não', async () => {
    const a = device();
    const now = new Date().toISOString();
    const old = '2025-12-01T00:00:00.000Z';
    a.store.add({ ...review('nota0001', 'Compras', now, old), kind: 'anotacoes', publishedAt: now });
    a.store.add({ ...review('nota0002', 'Diário', now, now), kind: 'anotacoes', private: true });
    a.store.add({ ...review('nota0003', 'Velha', old, old), kind: 'anotacoes' });
    const fetchSpy = window.fetch as jasmine.Spy;
    await a.sync.syncNow();
    const put = fetchSpy.calls.all().find((c) => (c.args[1] as RequestInit | undefined)?.method === 'PUT')!;
    expect(JSON.parse(((put.args[1] as RequestInit).body as FormData).get('novas') as string)).toEqual([{ ref: 'nota0001', titulo: 'Compras', mural: 'anotacoes' }]);
  });

  it('a ficha privada sobe para a nuvem particular, mas não vira aviso', async () => {
    const a = device();
    const now = new Date().toISOString();
    a.store.add({ ...review('rpriv01', 'Segredo', now, now), private: true });
    const fetchSpy = window.fetch as jasmine.Spy;
    await a.sync.syncNow();
    const put = fetchSpy.calls.all().find((c) => (c.args[1] as RequestInit | undefined)?.method === 'PUT')!;
    expect(JSON.parse(((put.args[1] as RequestInit).body as FormData).get('novas') as string)).toEqual([]);
    expect((await cloud.read()).reviews.map((r: Review) => [r.id, r.private])).toEqual([['rpriv01', true]]);
  });
});

describe('o que os outros veem', () => {
  const at = (iso: string, extra: Partial<Review> = {}) => ({ ...review(`r${iso.slice(5, 10).replace('-', '')}x`, iso, iso, iso), ...extra });
  const now = Date.parse('2026-03-10T12:00:00.000Z');

  it('o mural público não leva as fichas privadas', () => {
    const list = [at('2026-03-09T00:00:00.000Z'), at('2026-03-08T00:00:00.000Z', { private: true })];
    expect(publicReviews(list).map((r) => r.id)).toEqual([list[0].id]);
  });

  it('a ficha que era privada vira aviso quando passa a ser vista, mesmo escrita há meses', () => {
    const old = at('2025-12-01T00:00:00.000Z', { publishedAt: '2026-03-09T00:00:00.000Z' });
    const hidden = at('2026-03-09T10:00:00.000Z', { private: true });
    const stale = at('2025-12-02T00:00:00.000Z');
    expect(newReviews([old, hidden, stale], now).map((n) => n.ref)).toEqual([old.id]);
  });

  it('a só visível vai para o mural público, mas não vira aviso', () => {
    const quiet = at('2026-03-09T10:00:00.000Z', { quiet: true });
    const loud = at('2026-03-08T10:00:00.000Z');
    expect(publicReviews([quiet, loud]).map((r) => r.id)).toEqual([quiet.id, loud.id]);
    expect(newReviews([quiet, loud], now).map((n) => n.ref)).toEqual([loud.id]);
  });
});

describe('versão do formato (SYNC_SCHEMA)', () => {
  /**
   * Se este teste falhar, o formato das fichas mudou: aumente SYNC_SCHEMA em cloud-sync.ts e atualize
   * a impressão abaixo. Sem isso, um site antigo aberto pelo cache jogaria fora o campo novo ao
   * sincronizar. Se a mudança só tirou um campo, basta a impressão (ver SYNC_SCHEMA).
   */
  it('a leitura das fichas é a mesma da versão 9', async () => {
    const source = [sanitizeReview, sanitizeNote, sanitizeDraft, sanitizeWish].map((f) => f.toString().replace(/\s+/g, '')).join('|');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    expect({ schema: SYNC_SCHEMA, hex }).toEqual({ schema: 9, hex: 'd39b84e6bb6a8fce65475fcbd1cc9b5d45aab15938968e5c5b9f451e61d68f9e' });
  });
});
