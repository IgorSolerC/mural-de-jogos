import { EnvironmentInjector, createEnvironmentInjector, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, CloudAccount, SESSION_KEY } from './cloud-account';
import { Cloud } from './cloud-config';
import { CloudSync, KeyValueStore, OWNER_KEY, STATE_KEY, SYNC_AUTO, SYNC_SCHEMA, SYNC_STORAGE } from './cloud-sync';
import { LocalData } from './local-data';
import { Review, sanitizeDraft, sanitizeReview, sanitizeWish } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { Choice, Confirm } from '../ui/confirm';

/**
 * A sincronização com a nuvem, nas bordas: respostas de erro da API (429, 503, 401, 409 em série),
 * a nuvem que perdeu o mural, o mural que veio estragado, o relógio errado, mudanças durante um
 * envio e o que vai (e o que não vai) no mural público.
 */

const API = 'https://api.teste';
const TOKEN = 'A'.repeat(43);
const ACCOUNT = { id: 'conta-igor', codigo: 'K7QF-M2XA', nome: 'Igor' };

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

function memoryKv(): KeyValueStore {
  const map = new Map<string, string>();
  return { getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

async function gunzip(blob: Blob): Promise<string> {
  return new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
}

type Override = (path: string, method: string) => Response | null | Promise<Response | null>;

/** A nuvem de mentira, com as regras da API e ganchos para respostas de erro. */
class FakeCloud {
  rev = 0;
  doc: Uint8Array | null = null;
  offline = false;
  puts = 0;
  /** Diferença do relógio da nuvem para o do aparelho (ms). */
  skew = 0;
  /** Respostas forçadas: a primeira que responde (não null) vale uma vez e sai da lista. */
  overrides: Override[] = [];
  /** Roda no meio do PUT, antes de responder (para mexer no aparelho durante o envio). */
  duringPut: (() => void | Promise<void>) | null = null;
  lastPublic: Record<string, unknown> | null = null;
  lastPrivate: Record<string, unknown> | null = null;
  lastNovas: unknown = null;

  json(body: unknown, status = 200): Response {
    return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json', 'Mural-Agora': this.agora() } });
  }

  agora(): string {
    return new Date(Date.now() + this.skew).toISOString();
  }

  async handle(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const method = init.method ?? 'GET';
    for (let i = 0; i < this.overrides.length; i++) {
      const forced = await this.overrides[i](u.pathname, method);
      if (forced) {
        this.overrides.splice(i, 1);
        return forced;
      }
    }
    const headers = (init.headers ?? {}) as Record<string, string>;
    if (u.pathname === '/v1/eu' && method === 'GET') return this.json({ ...ACCOUNT, seguidores: 0, seguindo: 0 });
    if (u.pathname === '/v1/eu/mural' && method === 'GET') {
      if (!this.doc) return this.json({ erro: 'sem-mural', mensagem: 'Ainda não há mural na nuvem.' }, 404);
      if (u.searchParams.get('rev') === String(this.rev)) {
        return new Response(null, { status: 204, headers: { 'Mural-Rev': String(this.rev), 'Mural-Agora': this.agora() } });
      }
      return new Response(this.doc.slice(), { status: 200, headers: { 'Mural-Rev': String(this.rev), 'Content-Type': 'application/gzip', 'Mural-Agora': this.agora() } });
    }
    if (u.pathname === '/v1/eu/mural' && method === 'PUT') {
      const base = Number(headers['Mural-Rev-Base']);
      if (base !== this.rev) return this.json({ erro: 'conflito', mensagem: 'Outro aparelho gravou antes.', rev: this.rev }, 409);
      const form = init.body as FormData;
      await this.duringPut?.();
      this.doc = new Uint8Array(await (form.get('privado') as Blob).arrayBuffer());
      this.lastPrivate = JSON.parse(await gunzip(form.get('privado') as Blob));
      this.lastPublic = JSON.parse(await gunzip(form.get('publico') as Blob));
      this.lastNovas = JSON.parse(form.get('novas') as string);
      this.rev++;
      this.puts++;
      return this.json({ rev: this.rev, novas: 0 });
    }
    return this.json({ erro: 'nao-encontrado', mensagem: url }, 404);
  }

  async seedRaw(bytes: Uint8Array): Promise<void> {
    this.doc = bytes;
    this.rev++;
  }
}

function review(id: string, name: string, extra: Partial<Review> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'jogos',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: 7, diversao: 8, jogabilidade: 8, visual: 8 },
    status: 'finalizado',
    difficulty: 'nenhuma',
    verdict: null,
    completedAt: '2026-01-01',
    createdAt: '2026-01-01T00:00:00.000Z',
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...extra,
  })!;
}

interface Device {
  store: ReviewStore;
  settings: Settings;
  sync: CloudSync;
  account: CloudAccount;
  kv: KeyValueStore;
  answers: Choice[];
  names(): string[];
}

describe('sincronização: bordas e bugs conhecidos', () => {
  let cloud: FakeCloud;
  let parent: EnvironmentInjector;
  const devices: Device[] = [];
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
    // destruir o injector cancela as novas tentativas que a sincronização agendou
    devices.splice(0);
    for (const i of injectors.splice(0)) i.destroy();
    localStorage.clear();
  });

  function device(confirmAsk = true): Device {
    const kv = memoryKv();
    const answers: Choice[] = [];
    const confirm = {
      choose: async () => (answers.length ? answers.shift()! : null),
      ask: async () => confirmAsk,
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
    const d: Device = {
      store,
      settings: injector.get(Settings),
      sync: injector.get(CloudSync),
      account: injector.get(CloudAccount),
      kv,
      answers,
      names: () => store.reviews().map((r) => r.game.name).sort(),
    };
    devices.push(d);
    return d;
  }

  describe('respostas de erro da nuvem', () => {
    it('429 (devagar): fica "sincronizando", não perde nada e sobe na tentativa seguinte', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      cloud.overrides.push((path, method) =>
        path === '/v1/eu/mural' && method === 'PUT' ? cloud.json({ erro: 'devagar', mensagem: 'Muitos envios seguidos.' }, 429) : null,
      );
      await a.sync.syncNow();
      expect(a.sync.status()).toBe('sincronizando');
      expect(cloud.puts).toBe(0);
      expect(await a.sync.everythingSent()).toBeFalse();
      await a.sync.syncNow();
      expect(a.sync.status()).toBe('ok');
      expect(cloud.puts).toBe(1);
      expect(await a.sync.everythingSent()).toBeTrue();
    });

    it('503 (cota do dia): pausa com a mensagem da nuvem e o mural fica aqui', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      cloud.overrides.push((path) => (path === '/v1/eu/mural' ? cloud.json({ erro: 'cota-diaria', mensagem: 'A nuvem chegou ao limite de hoje.' }, 503) : null));
      await a.sync.syncNow();
      expect(a.sync.status()).toBe('pausado');
      expect(a.sync.message()).toBe('A nuvem chegou ao limite de hoje.');
      expect(a.names()).toEqual(['Celeste']);
    });

    it('401 (sessão acabou): sai da conta neste navegador e para, sem apagar o mural daqui', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      cloud.overrides.push((path) => (path === '/v1/eu/mural' ? cloud.json({ erro: 'sessao-invalida', mensagem: 'Sua sessão acabou.' }, 401) : null));
      await a.sync.syncNow();
      expect(a.sync.status()).toBe('fora');
      expect(a.account.signedIn()).toBeFalse();
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
      expect(a.names()).toEqual(['Celeste']);
    });

    it('409 em série (outros aparelhos gravando sem parar): desiste depois de 3 envios, com aviso', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      await a.sync.syncNow();
      a.store.add(review('rbbbb1', 'Hades'));
      let conflicts = 0;
      const always409: Override = (path, method) => {
        if (path === '/v1/eu/mural' && method === 'PUT') {
          conflicts++;
          return cloud.json({ erro: 'conflito', mensagem: 'Outro aparelho gravou antes.', rev: cloud.rev }, 409);
        }
        return null;
      };
      cloud.overrides.push(...Array.from({ length: 20 }, () => always409));
      await a.sync.syncNow();
      expect(conflicts).toBe(3);
      expect(a.sync.status()).toBe('erro');
      expect(a.sync.message()).toContain('Outros aparelhos estão gravando');
      expect(a.names()).toEqual(['Celeste', 'Hades']);
    });

    it('o mural que veio da nuvem não abre: erro, sem mexer no mural daqui', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      await a.sync.syncNow();
      // outro aparelho (ou um bug) gravou algo que não é JSON
      const stream = new Blob(['isto não é json']).stream().pipeThrough(new CompressionStream('gzip'));
      await cloud.seedRaw(new Uint8Array(await new Response(stream).arrayBuffer()));
      await a.sync.syncNow();
      expect(a.sync.status()).toBe('erro');
      expect(a.sync.message()).toBe('O mural que veio da nuvem não abriu.');
      expect(a.names()).toEqual(['Celeste']);
    });

    it('a nuvem perdeu o mural (banco restaurado): sobe de novo a partir da rev 0, sem apagar nada aqui', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      await a.sync.syncNow();
      expect(cloud.rev).toBe(1);
      cloud.doc = null;
      cloud.rev = 0;
      await a.sync.syncNow();
      expect(a.sync.status()).toBe('ok');
      expect(cloud.rev).toBe(1);
      expect((cloud.lastPrivate!['reviews'] as Review[]).map((r) => r.game.name)).toEqual(['Celeste']);
      expect(JSON.parse(a.kv.getItem(STATE_KEY)!).rev).toBe(1);
    });

    it('sem rede ao sair "tirando daqui": não sai e avisa que ainda tem coisa só aqui', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      cloud.offline = true;
      a.answers.push('secondary');
      expect(await a.sync.signOut()).toBeFalse();
      expect(a.account.signedIn()).toBeTrue();
      expect(a.names()).toEqual(['Celeste']);
    });
  });

  describe('o relógio e as mudanças no meio do caminho', () => {
    it('nota o relógio errado do aparelho pela hora da nuvem', async () => {
      const a = device();
      cloud.skew = 10 * 60_000;
      await a.sync.syncNow();
      expect(a.sync.clockWrong()).toBeTrue();
      cloud.skew = 30_000;
      await a.sync.syncNow();
      expect(a.sync.clockWrong()).toBeFalse();
    });

    it('uma mudança feita durante o envio não se perde: fica para o próximo', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      cloud.duringPut = () => {
        cloud.duringPut = null;
        a.store.add(review('rbbbb1', 'Hades'));
      };
      await a.sync.syncNow();
      expect((cloud.lastPrivate!['reviews'] as Review[]).map((r) => r.game.name)).toEqual(['Celeste']);
      expect(await a.sync.everythingSent()).toBeFalse();
      await a.sync.syncNow();
      expect((cloud.lastPrivate!['reviews'] as Review[]).map((r) => r.game.name).sort()).toEqual(['Celeste', 'Hades']);
      expect(await a.sync.everythingSent()).toBeTrue();
    });

    it('sem nada novo nos dois lados, sincronizar de novo não envia', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      await a.sync.syncNow();
      await a.sync.syncNow();
      await a.sync.syncNow();
      expect(cloud.puts).toBe(1);
    });
  });

  describe('o que vai em cada mural', () => {
    it('o público leva só as resenhas públicas e o nome; o privado leva tudo, as chaves e o formato', async () => {
      const a = device();
      a.settings.setKey('rawg', 'segredo-rawg');
      a.store.add(review('rpub01', 'Pública'));
      a.store.add(review('rpriv1', 'Privada', { private: true }));
      a.store.saveDraft(sanitizeDraft({ id: 'rdraft', kind: 'jogos', game: { name: 'Rascunho' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })!);
      a.store.saveWish(sanitizeWish({ id: 'rwish1', kind: 'jogos', game: { name: 'Desejo' }, createdAt: '2026-01-01T00:00:00Z', updatedAt: '2026-01-01T00:00:00Z' })!);
      a.store.add(review('rapag1', 'Apagada'));
      a.store.remove('rapag1');
      await a.sync.syncNow();

      const pub = cloud.lastPublic!;
      expect((pub['reviews'] as Review[]).map((r) => r.game.name)).toEqual(['Pública']);
      expect(pub['owner']).toEqual({ name: 'Igor' });
      for (const k of ['drafts', 'wishes', 'deleted', 'chaves', 'sync']) expect(k in pub).withContext(k).toBeFalse();
      expect(JSON.stringify(pub)).not.toContain('segredo-rawg');
      expect(JSON.stringify(pub)).not.toContain('Privada');

      const priv = cloud.lastPrivate!;
      expect((priv['reviews'] as Review[]).map((r) => r.game.name).sort()).toEqual(['Privada', 'Pública']);
      expect((priv['drafts'] as unknown[]).length).toBe(1);
      expect((priv['wishes'] as unknown[]).length).toBe(1);
      expect(Object.keys((priv['deleted'] as { reviews: object }).reviews)).toEqual(['rapag1']);
      expect((priv['chaves'] as { rawg: string }).rawg).toBe('segredo-rawg');
      expect(priv['sync']).toEqual({ schema: SYNC_SCHEMA });
    });

    it('a ficha que vira privada sai do mural público no envio seguinte', async () => {
      const a = device();
      a.store.add(review('rpub01', 'Celeste'));
      await a.sync.syncNow();
      expect((cloud.lastPublic!['reviews'] as Review[]).length).toBe(1);
      a.store.update({ ...a.store.get('rpub01')!, private: true, updatedAt: new Date().toISOString() });
      await a.sync.syncNow();
      expect(cloud.lastPublic!['reviews']).toEqual([]);
      expect(cloud.lastNovas).toEqual([]);
    });

    it('a ficha que deixa de ser privada vira aviso (mesmo escrita há meses)', async () => {
      const a = device();
      a.store.add(review('rpriv1', 'Segredo', { private: true }));
      await a.sync.syncNow();
      expect(cloud.lastNovas).toEqual([]);
      const now = new Date().toISOString();
      // como o editor faz: tira a marca e anota quando passou a ser vista
      const { private: _, ...open } = a.store.get('rpriv1')!;
      a.store.update({ ...open, publishedAt: now, updatedAt: now });
      await a.sync.syncNow();
      expect(cloud.lastNovas).toEqual([{ ref: 'rpriv1', titulo: 'Segredo', mural: 'jogos' }]);
    });
  });

  describe('bugs corrigidos', () => {
    it('o aparelho vazio que acabou de baixar o mural não o manda de volta', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      a.store.add(review('rbbbb1', 'Hades'));
      await a.sync.syncNow();
      expect(cloud.puts).toBe(1);

      const b = device();
      await b.sync.syncNow();
      expect(b.names()).toEqual(['Celeste', 'Hades']);
      expect(cloud.puts).toBe(1);
      expect(cloud.rev).toBe(1);
      expect(await b.sync.everythingSent()).toBeTrue();
      // e o que mudar depois sobe normalmente
      b.store.add(review('rcccc1', 'Hollow Knight'));
      await b.sync.syncNow();
      expect(cloud.puts).toBe(2);
    });

    it('juntar sem perguntar um mural igual ao da nuvem não gera envio', async () => {
      const a = device();
      // com a cor dada: sem ela, cada aparelho sorteia uma cartolina e os murais não são iguais
      a.store.add(review('raaaa1', 'Celeste', { stock: 'azul' }));
      await a.sync.syncNow();
      const b = device();
      b.kv.setItem(OWNER_KEY, ACCOUNT.id); // este navegador já foi desta conta (o estado se perdeu)
      b.store.add(review('raaaa1', 'Celeste', { stock: 'azul' }));
      await b.sync.syncNow();
      expect(cloud.puts).toBe(1);
    });

    it('juntar um mural diferente ainda envia o resultado da junção', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      await a.sync.syncNow();
      const b = device();
      b.kv.setItem(OWNER_KEY, ACCOUNT.id);
      b.store.add(review('rbbbb1', 'Hades'));
      await b.sync.syncNow();
      expect(cloud.puts).toBe(2);
      expect((cloud.lastPrivate!['reviews'] as Review[]).map((r) => r.game.name).sort()).toEqual(['Celeste', 'Hades']);
    });

    it('baixar num aparelho com uma chave de busca sem data sobe a chave', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      await a.sync.syncNow();
      localStorage.removeItem('mural-de-jogos:config:v1');
      const b = device();
      b.settings.rawgKey.set('so-aqui');
      await b.sync.syncNow();
      expect(cloud.puts).toBe(2);
      expect((cloud.lastPrivate!['chaves'] as { rawg: string }).rawg).toBe('so-aqui');
    });

    it('nove mudanças em dez minutos, cada uma no seu tempo, não param a sincronização', async () => {
      const a = device();
      for (let i = 0; i < 9; i++) {
        a.store.add(review(`rjogo${i}`, `Jogo ${i}`));
        await a.sync.syncNow();
      }
      expect(a.sync.status()).toBe('ok');
      expect(cloud.puts).toBe(9);
    });

    it('o mesmo mural enviado 3 vezes em 10 minutos (a nuvem esquecendo): pausa, e volta sozinha depois', async () => {
      const a = device();
      a.store.add(review('raaaa1', 'Celeste'));
      for (let i = 0; i < 4; i++) {
        await a.sync.syncNow();
        // a nuvem "perde" o mural a cada vez: o aparelho recomeça do zero e manda o mesmo
        cloud.doc = null;
        cloud.rev = 0;
      }
      expect(cloud.puts).toBe(3);
      expect(a.sync.status()).toBe('erro');
      expect(a.sync.message()).toContain('volta sozinha');
      // ficou agendada uma nova tentativa (e não parada até recarregar)
      expect((a.sync as unknown as { timer: unknown }).timer).toBeDefined();
    });
  });
});

describe('o nome público entre aparelhos', () => {
  const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  beforeEach(() => localStorage.clear());
  afterEach(() => localStorage.clear());

  /** `storedName`: o da conta guardada aqui; `cloudName`: o da nuvem; `localName`: o "Seu nome" de Ajustes. */
  function setup(storedName: string, cloudName: string, localName = storedName) {
    localStorage.setItem(SESSION_KEY, TOKEN);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ ...ACCOUNT, nome: storedName }));
    localStorage.setItem('mural-de-jogos:config:v1', JSON.stringify({ ownerName: localName }));
    const patches: string[] = [];
    spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL, init?: RequestInit) => {
      const path = new URL(String(url)).pathname;
      if (path === '/v1/eu' && (init?.method ?? 'GET') === 'GET') return json({ ...ACCOUNT, nome: cloudName });
      if (path === '/v1/eu' && init?.method === 'PATCH') {
        const nome = JSON.parse(String(init.body)).nome as string;
        patches.push(nome);
        return json({ nome });
      }
      return json({ erro: 'nao-encontrado' }, 404);
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }) } },
      ],
    });
    const settings = TestBed.inject(Settings);
    const account = TestBed.inject(CloudAccount);
    return { settings, account, patches };
  }

  const wait = (ms: number) => new Promise((r) => setTimeout(r, ms));

  it('trocar o "Seu nome" manda um PATCH só, um instante depois de parar de digitar', async () => {
    const { settings, account, patches } = setup('Igor', 'Igor');
    await wait(0);
    TestBed.tick();
    for (const partial of ['I', 'Ig', 'Igor S', 'Igor Soler']) {
      settings.ownerName.set(partial);
      TestBed.tick();
      await wait(100);
    }
    await wait(1700);
    expect(patches).toEqual(['Igor Soler']);
    expect(account.account()!.nome).toBe('Igor Soler');
  });

  it('o nome trocado em outro aparelho vale aqui ao abrir, sem ser desfeito', async () => {
    const { settings, account, patches } = setup('Igor', 'Igor Soler');
    await wait(50);
    TestBed.tick();
    expect(account.account()!.nome).toBe('Igor Soler');
    expect(settings.ownerName()).toBe('Igor Soler');
    await wait(1700);
    TestBed.tick();
    expect(patches).toEqual([]);
  }, 5000);

  it('um nome trocado aqui sem rede (ainda não enviado) não é trocado pelo da nuvem: ele sobe', async () => {
    const { settings, account, patches } = setup('Igor', 'Igor', 'Igor S.');
    await wait(50);
    TestBed.tick();
    expect(settings.ownerName()).toBe('Igor S.');
    await wait(1700);
    TestBed.tick();
    expect(patches).toEqual(['Igor S.']);
    expect(account.account()!.nome).toBe('Igor S.');
  }, 5000);

  it('os dois mudaram (aqui sem rede e lá): o daqui, mais recente para quem está usando, sobe', async () => {
    const { settings, patches } = setup('Igor', 'Igor Soler', 'Igor S.');
    await wait(50);
    TestBed.tick();
    expect(settings.ownerName()).toBe('Igor S.');
    await wait(1700);
    expect(patches).toEqual(['Igor S.']);
  }, 5000);
});
