import { EnvironmentInjector, createEnvironmentInjector, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, CloudAccount, SESSION_KEY } from './cloud-account';
import { readBeforeCloud } from './cloud-before';
import { Cloud } from './cloud-config';
import { BASE_KEY, CloudSync, KeyValueStore, OWNER_KEY, STATE_KEY, SYNC_AUTO, SYNC_SCHEMA, SYNC_STORAGE, fingerprint, newReviews, publicReviews, shownCard } from './cloud-sync';
import { LocalData } from './local-data';
import { Review, sanitizeDraft, sanitizeNote, sanitizeReview, sanitizeWish } from './review';
import { ReviewStore } from './review-store';
import { SETTINGS_KEY, Settings } from './settings';
import { ProfileStore } from './profile-store';
import { KanbanStore } from './kanban-store';
import { CalendarStore } from './calendar-store';
import { SpendingStore } from './spending-store';
import { placeCard, resetBoard } from './kanban';
import { defaultProfile } from './profile';
import { Choice, Confirm } from '../ui/confirm';
import { SyncConflicts } from './sync-conflicts';
import { BrowserReset, wipeBrowser } from './browser-reset';
import { ApiMirror } from './api-mirror';
import { ApiRequests, SiteRequest } from './api-requests';

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

/** A limpeza do navegador, de mentira: guarda os pedidos (a de verdade recarrega a página). */
class FakeReset {
  readonly requests: { motivo: string; keep: string[] }[] = [];
  pending: unknown = null;
  request(motivo: string, keep: string[] = []): void {
    this.requests.push({ motivo, keep });
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
  /** O mural público do último envio (o que os outros veem). */
  pub: Uint8Array | null = null;
  offline = false;
  puts = 0;
  gets = 0;
  /** Os pedidos da API das AIs, e quando cada um foi concluído (quantos envios do mural já tinham ido). */
  pedidos: SiteRequest[] = [];
  /** A conta pode usar a API das AIs? */
  api = false;
  concluded: { id: string; estado: string; puts: number; resultado: unknown }[] = [];

  async handle(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const now = { 'Mural-Agora': new Date().toISOString() };
    if (u.pathname === '/v1/eu' && method === 'GET') return json({ ...ACCOUNT, ...(this.api ? { api: true } : {}), seguidores: 0, seguindo: 0 });
    if ((u.pathname === '/v1/auth/sair' || u.pathname === '/v1/auth/sair-de-todos') && method === 'POST') return json({ ok: true });
    if (u.pathname === '/v1/eu' && method === 'PATCH') return json({ nome: JSON.parse(String(init.body)).nome });
    if (u.pathname === '/v1/eu/mural' && method === 'GET') {
      this.gets++;
      if (!this.doc) return json({ erro: 'sem-mural', mensagem: 'Ainda não há mural na nuvem.' }, 404);
      const waiting = this.pedidos.filter((p) => p.estado === 'pendente').length;
      const asks: Record<string, string> = waiting ? { 'Mural-Pedidos': String(waiting) } : {};
      if (u.searchParams.get('rev') === String(this.rev)) return new Response(null, { status: 204, headers: { 'Mural-Rev': String(this.rev), ...now, ...asks } });
      return new Response(this.doc.slice(), { status: 200, headers: { 'Mural-Rev': String(this.rev), 'Content-Type': 'application/gzip', ...now, ...asks } });
    }
    if (u.pathname === '/v1/eu/pedidos' && method === 'GET') return json({ itens: this.pedidos.filter((p) => p.estado === 'pendente') });
    if (/^\/v1\/eu\/pedidos\/[^/]+\/pegar$/.test(u.pathname) && method === 'POST') return json({ ok: true });
    if (u.pathname === '/v1/eu/pedidos/concluir' && method === 'POST') {
      const itens = JSON.parse(String(init.body)).itens as { id: string; estado: string; resultado: unknown }[];
      for (const it of itens) {
        const p = this.pedidos.find((x) => x.id === it.id);
        if (p) p.estado = it.estado as SiteRequest['estado'];
        this.concluded.push({ id: it.id, estado: it.estado, puts: this.puts, resultado: it.resultado });
      }
      return json({ itens: itens.map((i) => ({ id: i.id, ok: true })) });
    }
    if (u.pathname === '/v1/eu/mural' && method === 'PUT') {
      const base = Number(headers['Mural-Rev-Base']);
      if (base !== this.rev) return json({ erro: 'conflito', mensagem: 'Outro aparelho gravou antes.', rev: this.rev }, 409);
      const form = init.body as FormData;
      this.doc = new Uint8Array(await (form.get('privado') as Blob).arrayBuffer());
      this.pub = new Uint8Array(await (form.get('publico') as Blob).arrayBuffer());
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

  /** O mural público do último envio, aberto. */
  async readPublic(): Promise<Record<string, unknown>> {
    const stream = new Blob([this.pub!.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
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
  profiles: ProfileStore;
  kanban: KanbanStore;
  calendar: CalendarStore;
  spending: SpendingStore;
  sync: CloudSync;
  conflicts: SyncConflicts;
  kv: ReturnType<typeof memoryKv>;
  reset: FakeReset;
  account: CloudAccount;
  /** As respostas de confirm.ask, em ordem (sem nenhuma: sim). */
  askAnswers: boolean[];
  askedTitles: string[];
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

  /** Um aparelho; o mural dele é desta conta (`anonimo`: de ninguém, de antes de entrar). */
  function device(opts: { anonimo?: boolean; auto?: boolean } = {}): Device {
    const kv = memoryKv();
    if (!opts.anonimo) kv.setItem(OWNER_KEY, ACCOUNT.id);
    const reset = new FakeReset();
    const answers: Choice[] = [];
    const asked: string[] = [];
    const askAnswers: boolean[] = [];
    const askedTitles: string[] = [];
    const confirm = {
      choose: async (o: { title?: string }) => {
        asked.push(o.title ?? '');
        return answers.length ? answers.shift()! : null;
      },
      ask: async (o: { title?: string }) => {
        askedTitles.push(o.title ?? '');
        return askAnswers.length ? askAnswers.shift()! : true;
      },
    };
    const injector = createEnvironmentInjector(
      [
        { provide: LocalData, useClass: MemoryData },
        ReviewStore,
        Settings,
        ProfileStore,
        KanbanStore,
        CalendarStore,
        SpendingStore,
        CloudAccount,
        CloudSync,
        SyncConflicts,
        ApiMirror,
        ApiRequests,
        { provide: SYNC_STORAGE, useValue: kv },
        { provide: SYNC_AUTO, useValue: !!opts.auto },
        // com a sincronização sozinha ligada, a nuvem fica sem configurar: só os effects da conta rodam
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => (opts.auto ? null : { api: API, googleClientId: 'x.apps.googleusercontent.com' }) } },
        { provide: Confirm, useValue: confirm },
        { provide: BrowserReset, useValue: reset },
      ],
      parent,
    );
    injectors.push(injector);
    const store = injector.get(ReviewStore);
    return {
      store,
      settings: injector.get(Settings),
      profiles: injector.get(ProfileStore),
      kanban: injector.get(KanbanStore),
      calendar: injector.get(CalendarStore),
      spending: injector.get(SpendingStore),
      sync: injector.get(CloudSync),
      conflicts: injector.get(SyncConflicts),
      kv,
      reset,
      account: injector.get(CloudAccount),
      answers,
      asked,
      askAnswers,
      askedTitles,
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

  describe('o perfil', () => {
    it('vai para a nuvem, e o mudado por último vale no outro aparelho', async () => {
      const a = device();
      a.profiles.update((p) => ({ ...p, emoji: '🦊', tagline: 'Curadora' }));
      await a.sync.syncNow();
      localStorage.removeItem('meu-mural:perfil:v1');
      const b = device();
      expect(b.profiles.profile().emoji).toBe(defaultProfile().emoji);
      await b.sync.syncNow();
      expect(b.profiles.profile().emoji).toBe('🦊');
      expect(b.profiles.profile().tagline).toBe('Curadora');
      // o mais novo vence, dos dois lados
      b.profiles.update((p) => ({ ...p, tagline: 'Leitora' }));
      await settle(b, a);
      expect(a.profiles.profile().tagline).toBe('Leitora');
    });

    it('no mural público, as seções só levam as fichas que os outros veem', async () => {
      const a = device();
      a.store.add(review('rpub0001', 'Hades'));
      a.store.add({ ...review('rpriv001', 'Segredo'), private: true });
      a.profiles.update((p) => ({ ...p, sections: [{ ...p.sections[0], items: ['rpriv001', 'rpub0001', 'rsumiu01'] }] }));
      await a.sync.syncNow();
      const pub = await cloud.readPublic();
      const perfil = pub['perfil'] as { sections: { items: string[] }[] };
      expect(perfil.sections[0].items).toEqual(['rpub0001']);
      // no privado, a escolha fica inteira
      const priv = (await cloud.read()) as unknown as { perfil: { dados: { sections: { items: string[] }[] } } };
      expect(priv.perfil.dados.sections[0].items).toEqual(['rpriv001', 'rpub0001', 'rsumiu01']);
    });

    it('sem mexer no perfil, nada dele vai para a nuvem', async () => {
      const a = device();
      a.store.add(review('rpub0002', 'Celeste'));
      await a.sync.syncNow();
      expect((await cloud.readPublic())['perfil']).toBeUndefined();
    });
  });

  describe('as configurações do mural de anotações', () => {
    it('vão para os outros aparelhos só no mural privado, e a mudada por último vale', async () => {
      localStorage.removeItem('mural-de-jogos:config:v1');
      const a = device();
      a.settings.setCategoryPrefs('Viagens!', { audience: 'publicar' });
      a.settings.setNotesConfig({ orderBy: 'minha', order: ['viagens!', 'trabalho'] });
      await a.sync.syncNow();
      const priv = (await cloud.read()) as unknown as { muralAnotacoes?: { dados: { categories: Record<string, unknown> } } };
      expect(priv.muralAnotacoes!.dados.categories).toEqual({ 'viagens!': { audience: 'publicar' } });
      // o público não leva: é só da pessoa
      expect((await cloud.readPublic())['muralAnotacoes']).toBeUndefined();

      localStorage.removeItem('mural-de-jogos:config:v1');
      const b = device();
      await b.sync.syncNow();
      expect(b.settings.notesConfig().categories).toEqual({ 'viagens!': { audience: 'publicar' } });
      expect(b.settings.notesConfig().order).toEqual(['viagens!', 'trabalho']);

      await new Promise((r) => setTimeout(r, 5));
      b.settings.setNotesConfig({ audience: 'visivel' });
      await settle(b, a);
      expect(a.settings.notesConfig().audience).toBe('visivel');
      expect(await settle(a, b)).toBe(1);
    });
  });

  describe('os quadros Kanban', () => {
    it('vão só no mural privado, um por categoria, e mexer em quadros diferentes em dois aparelhos não perde nenhum', async () => {
      const a = device();
      const qa = a.kanban.boardFor('Trabalho').id;
      const col = a.kanban.get(qa)!.columns[1].id;
      a.kanban.update(qa, (b, at) => placeCard(b, 'rnota0001', col, at));
      await a.sync.syncNow();
      const priv = (await cloud.read()) as unknown as { kanban?: { boards: { category: string }[]; legacy?: unknown } };
      expect(priv.kanban!.boards.map((b) => b.category)).toEqual(['trabalho']);
      expect(priv.kanban!.legacy).toBeUndefined();
      expect((await cloud.readPublic())['kanban']).toBeUndefined();

      localStorage.removeItem('meu-mural:kanban:v1');
      const b = device();
      await b.sync.syncNow();
      expect(b.kanban.get(qa)!.cards).toEqual([{ note: 'rnota0001', column: col, importance: null, at: jasmine.any(String) }]);

      // cada um mexe num quadro: os dois ficam com os dois
      await new Promise((r) => setTimeout(r, 5));
      const qb = b.kanban.boardFor('Faculdade').id;
      b.kanban.update(qb, (x, at) => placeCard(x, 'rnota0002', x.columns[0].id, at));
      a.kanban.update(qa, (x, at) => placeCard(x, 'rnota0003', x.columns[0].id, at));
      await settle(a, b);
      for (const d of [a, b]) {
        expect(d.kanban.boards().map((x) => x.category).sort()).toEqual(['faculdade', 'trabalho']);
        expect(d.kanban.get(qa)!.cards.map((c) => c.note)).toEqual(['rnota0001', 'rnota0003']);
      }
      // recomeçar num recomeça no outro
      await new Promise((r) => setTimeout(r, 5));
      b.kanban.update(qb, (x, at) => resetBoard(x, at));
      await settle(b, a);
      expect(a.kanban.get(qb)!.cards).toEqual([]);
    });

    it('os quadros de antes convertidos num aparelho que ficou fechado não apagam o desenho e a cor dos grupos escolhidos depois em outro', async () => {
      const a = device();
      a.settings.setCategoryLook('Trabalho', { icon: 'maleta', color: 'azul' });
      await a.sync.syncNow();
      // o aparelho parou antes dos quadros por categoria: um quadro de antes, com a característica Urgente laranja
      localStorage.removeItem(SETTINGS_KEY);
      const at = '2026-10-10T12:00:00.000Z';
      localStorage.setItem(
        'meu-mural:kanban:v1',
        JSON.stringify({
          boards: [
            {
              id: 'qvelho',
              name: 'Meu quadro',
              at,
              columns: [{ id: 'qvelho-a', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false }],
              traits: [{ id: 't1', name: 'Urgente', color: 'laranja' }],
              cards: [{ note: 'rnota0001', column: 'qvelho-a', traits: ['t1'] }],
            },
          ],
        }),
      );
      const b = device();
      b.store.add({ ...sanitizeReview({ kind: 'anotacoes', game: { name: 'Relatório' }, category: 'Trabalho', completedAt: '2026-10-10', createdAt: at, updatedAt: at })!, id: 'rnota0001' });
      TestBed.tick();
      expect(b.kanban.state().legacy).toEqual([]);
      expect(b.settings.tagColor('Urgente')).toBe('laranja');
      await b.sync.syncNow();
      TestBed.tick();
      expect(b.settings.categoryLook('Trabalho')).toEqual({ icon: 'maleta', color: 'azul' });
      await a.sync.syncNow();
      expect(a.settings.categoryLook('Trabalho')).toEqual({ icon: 'maleta', color: 'azul' });
    });

    it('as tags que a conversão dos quadros de antes põe numa anotação não passam por cima da versão escrita depois em outro aparelho', async () => {
      const old = '2026-10-10T12:00:00.000Z';
      const note = (text: string, updatedAt: string): Review => ({
        ...sanitizeReview({ kind: 'anotacoes', game: { name: 'Relatório' }, category: 'Trabalho', text, completedAt: '2026-10-10', createdAt: old, updatedAt })!,
        id: 'rnota0001',
      });
      const a = device();
      a.store.add(note('escrito depois', '2026-10-20T12:00:00.000Z'));
      await a.sync.syncNow();
      // o aparelho parou antes dos quadros por categoria: a anotação como era, e um quadro de antes com ela
      localStorage.setItem(
        'meu-mural:kanban:v1',
        JSON.stringify({
          boards: [
            {
              id: 'qvelho',
              name: 'Meu quadro',
              at: old,
              columns: [{ id: 'qvelho-a', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false }],
              traits: [{ id: 't1', name: 'Urgente', color: 'preta' }],
              cards: [{ note: 'rnota0001', column: 'qvelho-a', traits: ['t1'] }],
            },
          ],
        }),
      );
      const b = device();
      b.store.add(note('como era', old));
      TestBed.tick();
      expect(b.store.get('rnota0001')!.tags).toEqual(['Urgente']);
      // já sincronizou com a conta antes (sem a base da junção, que veio depois)
      b.kv.setItem(OWNER_KEY, ACCOUNT.id);
      await b.sync.syncNow();
      expect(b.asked).toEqual([]);
      expect(b.store.get('rnota0001')!.text).toBe('escrito depois');
      await a.sync.syncNow();
      expect(a.store.get('rnota0001')!.text).toBe('escrito depois');
    });
  });

  describe('os lembretes do Calendário', () => {
    it('vão só no mural privado, lembrete a lembrete, e o apagado fica apagado nos dois aparelhos', async () => {
      const a = device();
      const bolo = { ...a.calendar.blank('2027-08-23'), title: 'Fazer bolo de aniversário', notes: ['rreceita1'] };
      a.calendar.save(bolo);
      await a.sync.syncNow();
      const priv = (await cloud.read()) as unknown as { calendario?: { reminders: { title: string; notes: string[] }[] } };
      expect(priv.calendario!.reminders.map((r) => [r.title, r.notes])).toEqual([['Fazer bolo de aniversário', ['rreceita1']]]);
      // o público e o mural dos outros nunca levam
      expect((await cloud.readPublic())['calendario']).toBeUndefined();

      localStorage.removeItem('meu-mural:calendario:v1');
      const b = device();
      expect(b.calendar.reminders()).toEqual([]);
      await b.sync.syncNow();
      expect(b.calendar.get(bolo.id)?.title).toBe('Fazer bolo de aniversário');

      // cada um mexe num lembrete: os dois ficam com as duas mudanças
      await new Promise((r) => setTimeout(r, 5));
      const bruna = { ...b.calendar.blank('2026-03-14'), title: 'Aniversário da Bruna', repeat: 'ano' as const };
      b.calendar.save(bruna);
      a.calendar.save({ ...a.calendar.get(bolo.id)!, title: 'Fazer o bolo da Bia' });
      await settle(a, b);
      for (const d of [a, b]) {
        expect(d.calendar.reminders().map((r) => r.title).sort()).toEqual(['Aniversário da Bruna', 'Fazer o bolo da Bia']);
      }

      // apagar num apaga no outro, e ele não volta
      await new Promise((r) => setTimeout(r, 5));
      b.calendar.remove(bolo.id);
      await settle(b, a);
      expect(a.calendar.get(bolo.id)).toBeUndefined();
      expect(await settle(a, b)).toBe(1);
      expect(b.calendar.get(bolo.id)).toBeUndefined();
    });
  });

  describe('os Gastos', () => {
    it('vão só no mural privado, lançamento a lançamento, com as categorias, e o apagado fica apagado', async () => {
      const a = device();
      const churras = { ...a.spending.blank(), title: 'Churrasco', amount: 42200, category: 'eventos', date: '2026-10-04' };
      a.spending.save(churras);
      const sushi = a.spending.addCategory('Sushi', 'saida');
      await a.sync.syncNow();
      const priv = (await cloud.read()) as unknown as { gastos?: { entries: { title: string }[]; categories: { name: string }[] } };
      expect(priv.gastos!.entries.map((e) => e.title)).toEqual(['Churrasco']);
      expect(priv.gastos!.categories.map((c) => c.name)).toContain('Sushi');
      // o público e o mural dos outros nunca levam
      expect((await cloud.readPublic())['gastos']).toBeUndefined();

      localStorage.removeItem('meu-mural:gastos:v1');
      const b = device();
      expect(b.spending.entries()).toEqual([]);
      await b.sync.syncNow();
      expect(b.spending.get(churras.id)?.amount).toBe(42200);
      expect(b.spending.category(sushi.id)?.name).toBe('Sushi');

      // cada um mexe num lançamento: os dois ficam com as duas mudanças
      await new Promise((r) => setTimeout(r, 5));
      const volta = { ...b.spending.blank('entrada'), title: 'Reembolso churras', amount: 7218, category: 'reembolso', refundOf: churras.id };
      b.spending.save(volta);
      a.spending.save({ ...a.spending.get(churras.id)!, title: 'Churrasco da firma' });
      await settle(a, b);
      for (const d of [a, b]) {
        expect(d.spending.entries().map((e) => e.title).sort()).toEqual(['Churrasco da firma', 'Reembolso churras']);
      }

      // apagar num apaga no outro, e ele não volta
      await new Promise((r) => setTimeout(r, 5));
      b.spending.remove(churras.id);
      await settle(b, a);
      expect(a.spending.get(churras.id)).toBeUndefined();
      expect(await settle(a, b)).toBe(1);
      expect(b.spending.get(churras.id)).toBeUndefined();
    });

    it('sem gastos nem categoria mudada, o mural privado não ganha a chave', async () => {
      const a = device();
      a.calendar.save({ ...a.calendar.blank('2027-08-23'), title: 'Algo' });
      await a.sync.syncNow();
      expect((await cloud.read() as unknown as Record<string, unknown>)['gastos']).toBeUndefined();
    });
  });

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

    it('as escolhas de Desempenho ficam no aparelho: nem a nuvem nem o backup levam', async () => {
      const a = fresh();
      a.store.add(review('raaaa1', 'Celeste'));
      a.settings.applyPerformancePreset('desempenho');
      a.settings.setKey('rawg', 'chave-rawg-123');
      await a.sync.syncNow();
      const sent = JSON.stringify(await cloud.read()) + JSON.stringify(await cloud.readPublic());
      const { blob } = await a.store.exportBackup('Igor');
      const backupText = await new Response(blob.stream().pipeThrough(new DecompressionStream('gzip'))).text();
      for (const key of ['cardLayers', 'noCutShadows', 'plainPencil', 'stillCards', 'fewCards']) {
        expect(sent).not.toContain(key);
        expect(backupText).not.toContain(key);
      }

      // o outro aparelho da mesma conta recebe o mural e as chaves, e fica com o Desempenho dele
      const b = fresh();
      await b.sync.syncNow();
      expect(b.settings.rawgKey()).toBe('chave-rawg-123');
      expect(b.settings.performancePreset()).toBe('equilibrio');
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
    expect((await cloud.read()).sync).toEqual(jasmine.objectContaining({ schema: SYNC_SCHEMA }));

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

  it('apagar num aparelho vence a edição que não mudou nada no outro; apagar e mudar ao mesmo tempo vira pergunta, com a mudada no mural', async () => {
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
    for (const d of [a, b]) expect(d.conflicts.pending().map((c) => c.alvo)).toEqual(['ficha:rbbbb1']);
  });

  it('sincronizar agora com uma rodada no meio espera ela e envia o que mudou depois', async () => {
    const a = device();
    a.store.add(review('rjogo1', 'Hades'));
    const first = a.sync.syncNow();
    a.store.add(review('rjogo2', 'Celeste'));
    await a.sync.syncNow();
    expect((await cloud.read()).reviews.map((r) => r.game.name).sort()).toEqual(['Celeste', 'Hades']);
    await first;
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

    it('mural de ninguém e conta com mural: pergunta; "Juntar" junta e guarda a cópia de antes', async () => {
      await cloudWith('Da nuvem');
      const a = device({ anonimo: true });
      a.store.add(review('rlocal1', 'Daqui'));
      a.answers.push('confirm');
      await a.sync.syncNow();
      expect(a.asked).toEqual(['Juntar os murais?']);
      expect(a.names()).toEqual(['Da nuvem', 'Daqui']);
      expect((await cloud.read()).reviews.length).toBe(2);
      expect(await readBeforeCloud()).not.toBeNull();
      expect(a.kv.getItem(OWNER_KEY)).toBe(ACCOUNT.id);
      expect(a.reset.requests).toEqual([]);
    });

    it('"Só o da conta": guarda a cópia, não envia nada e limpa o navegador (menos a sessão e a cópia); na volta, a conta desce', async () => {
      await cloudWith('Da nuvem');
      const a = device({ anonimo: true });
      a.store.add(review('rlocal1', 'Daqui'));
      a.spending.save({ ...a.spending.blank('saida'), title: 'Gasto daqui', amount: 1000 });
      a.answers.push('secondary');
      const puts = cloud.puts;
      await a.sync.syncNow();
      expect(a.reset.requests).toEqual([{ motivo: 'entrou', keep: ['sessao', 'copia'] }]);
      expect(cloud.puts).toBe(puts);
      expect((await cloud.read()).reviews.map((r) => r.game.name)).toEqual(['Da nuvem']);
      expect(await readBeforeCloud()).not.toBeNull();
      expect(a.kv.getItem(OWNER_KEY)).toBeNull();
      // a página recarregou limpa: o mesmo navegador, vazio
      await wipeBrowser(['sessao', 'copia']);
      const b = device({ anonimo: true });
      await b.sync.syncNow();
      expect(b.asked).toEqual([]);
      expect(b.names()).toEqual(['Da nuvem']);
      expect(b.spending.entries()).toEqual([]);
    });

    it('fechar sem escolher não mexe em nada e espera', async () => {
      await cloudWith('Da nuvem');
      const a = device({ anonimo: true });
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
      a.store.add(review('rlocal1', 'Daqui'));
      await a.sync.syncNow();
      expect(a.asked).toEqual([]);
      expect(a.names()).toEqual(['Da nuvem', 'Daqui']);
    });

    it('o mural daqui é de outra conta: nunca se junta; limpa o navegador (menos a sessão) sem perguntar nem baixar', async () => {
      await cloudWith('Da nuvem');
      const a = device();
      a.kv.setItem(OWNER_KEY, 'outra-conta');
      a.store.add(review('rlocal1', 'Da outra pessoa'));
      const gets = cloud.gets;
      const puts = cloud.puts;
      await a.sync.syncNow();
      expect(a.asked).toEqual([]);
      expect(a.reset.requests).toEqual([{ motivo: 'entrou', keep: ['sessao'] }]);
      expect(cloud.gets).toBe(gets);
      expect(cloud.puts).toBe(puts);
      expect((await cloud.read()).reviews.map((r) => r.game.name)).toEqual(['Da nuvem']);
      expect(a.kv.getItem(OWNER_KEY)).toBe('outra-conta');
      expect(a.kv.getItem(STATE_KEY)).toBeNull();
    });

    it('os Gastos e os lembretes de outra conta também não vão para esta, nem com ela vazia', async () => {
      const a = device();
      a.kv.setItem(OWNER_KEY, 'outra-conta');
      a.spending.save({ ...a.spending.blank('saida'), title: 'Jantar dele', amount: 60000 });
      a.calendar.save({ ...a.calendar.blank('2026-10-30'), title: 'Dentista dele' });
      await a.sync.syncNow();
      expect(a.reset.requests).toEqual([{ motivo: 'entrou', keep: ['sessao'] }]);
      expect(cloud.doc).toBeNull();
    });

    it('sem nada na conta e o daqui de ninguém: pergunta antes de levar; "Levar" sobe', async () => {
      const a = device({ anonimo: true });
      a.store.add(review('rlocal1', 'Daqui'));
      a.answers.push('confirm');
      await a.sync.syncNow();
      expect(a.asked).toEqual(['Levar o mural para a conta?']);
      expect((await cloud.read()).reviews.map((r) => r.game.name)).toEqual(['Daqui']);
      expect(a.kv.getItem(OWNER_KEY)).toBe(ACCOUNT.id);
    });

    it('"Começar vazia": nada sobe, e o navegador é limpo', async () => {
      const a = device({ anonimo: true });
      a.store.add(review('rlocal1', 'Daqui'));
      a.answers.push('secondary');
      await a.sync.syncNow();
      expect(a.asked).toEqual(['Levar o mural para a conta?']);
      expect(a.reset.requests).toEqual([{ motivo: 'entrou', keep: ['sessao', 'copia'] }]);
      expect(cloud.doc).toBeNull();
      expect(await readBeforeCloud()).not.toBeNull();
    });

    it('só os Gastos de ninguém já contam como mural: pergunta', async () => {
      await cloudWith('Da nuvem');
      const a = device({ anonimo: true });
      a.spending.save({ ...a.spending.blank('saida'), title: 'Gasto daqui', amount: 1000 });
      await a.sync.syncNow();
      expect(a.asked).toEqual(['Juntar os murais?']);
      expect(a.sync.status()).toBe('escolha');
      expect(a.spending.entries().map((e) => e.title)).toEqual(['Gasto daqui']);
    });

    it('aparelho vazio: o dono é gravado antes de o mural da conta descer (a sessão caindo no meio, ele sai na limpeza)', async () => {
      await cloudWith('Da nuvem');
      const a = device({ anonimo: true });
      let ownerWhenImported: string | null | undefined;
      const importJson = a.store.importJson.bind(a.store);
      spyOn(a.store, 'importJson').and.callFake((...args: Parameters<typeof importJson>) => {
        ownerWhenImported = a.kv.getItem(OWNER_KEY);
        return importJson(...args);
      });
      await a.sync.syncNow();
      expect(ownerWhenImported).toBe(ACCOUNT.id);
      expect(a.names()).toEqual(['Da nuvem']);
    });

    it('aparelho vazio, de ninguém, e conta com mural: desce sem perguntar', async () => {
      await cloudWith('Da nuvem');
      const a = device({ anonimo: true });
      await a.sync.syncNow();
      expect(a.asked).toEqual([]);
      expect(a.names()).toEqual(['Da nuvem']);
      expect(a.kv.getItem(OWNER_KEY)).toBe(ACCOUNT.id);
    });
  });

  describe('sair da conta', () => {
    it('confirma, envia o que falta e limpa o navegador inteiro', async () => {
      const a = device();
      a.store.add(review('rlocal1', 'Daqui'));
      expect(await a.sync.signOut()).toBeTrue();
      expect(a.reset.requests).toEqual([{ motivo: 'saiu', keep: [] }]);
      expect((await cloud.read()).reviews.map((r) => r.game.name)).toEqual(['Daqui']);
      expect(localStorage.getItem(SESSION_KEY)).toBeNull();
      expect(a.kv.getItem(STATE_KEY)).toBeNull();
    });

    it('desistir na pergunta não sai nem limpa', async () => {
      const a = device();
      a.askAnswers.push(false);
      expect(await a.sync.signOut()).toBeFalse();
      expect(a.account.signedIn()).toBeTrue();
      expect(a.reset.requests).toEqual([]);
    });

    it('com mudança que não subiu: avisa; "Ficar" não sai, "Sair e perder" sai e limpa', async () => {
      const a = device();
      a.store.add(review('rlocal1', 'Daqui'));
      cloud.offline = true;
      a.askAnswers.push(true, false);
      expect(await a.sync.signOut()).toBeFalse();
      expect(a.askedTitles).toEqual(['Sair da conta?', 'Ainda tem coisa só aqui']);
      expect(a.account.signedIn()).toBeTrue();
      expect(a.reset.requests).toEqual([]);
      a.askAnswers.push(true, true);
      expect(await a.sync.signOut()).toBeTrue();
      expect(a.account.signedIn()).toBeFalse();
      expect(a.reset.requests).toEqual([{ motivo: 'saiu', keep: [] }]);
    });

    it('de todos os aparelhos: sai na nuvem de todos e limpa este navegador', async () => {
      const a = device();
      const fetchSpy = window.fetch as jasmine.Spy;
      expect(await a.sync.signOut(true)).toBeTrue();
      expect(a.askedTitles[0]).toBe('Sair de todos os aparelhos?');
      expect(fetchSpy.calls.allArgs().some(([url]) => String(url).endsWith('/v1/auth/sair-de-todos'))).toBeTrue();
      expect(a.reset.requests).toEqual([{ motivo: 'saiu', keep: [] }]);
    });

    it('a conta apagada: nada dela fica neste navegador', () => {
      const a = device();
      a.sync.forgetAccount();
      expect(a.reset.requests).toEqual([{ motivo: 'apagou', keep: [] }]);
    });

    it('a sessão que acabou (ou "Sair de todos" em outro aparelho) limpa o navegador; o mural de ninguém fica', async () => {
      const owned = device({ auto: true });
      const anon = device({ auto: true, anonimo: true });
      TestBed.tick();
      owned.account.forget();
      anon.account.forget();
      TestBed.tick();
      expect(owned.reset.requests).toEqual([{ motivo: 'saiu', keep: [] }]);
      expect(anon.reset.requests).toEqual([]);
    });

    it('a sessão que acabou antes de escolher o que fazer com o mural de ninguém: o nome da conta não fica nele', () => {
      const anon = device({ auto: true, anonimo: true });
      TestBed.tick();
      // o entrar pôs o nome da conta no "Seu nome"
      anon.settings.ownerName.set(ACCOUNT.nome);
      TestBed.tick();
      anon.account.forget();
      TestBed.tick();
      expect(anon.reset.requests).toEqual([]);
      expect(anon.settings.ownerName()).toBe('');
    });

    it('um "Seu nome" diferente do da conta (escrito depois) fica no mural de ninguém', () => {
      const anon = device({ auto: true, anonimo: true });
      TestBed.tick();
      anon.settings.ownerName.set('Outro nome');
      TestBed.tick();
      anon.account.forget();
      TestBed.tick();
      expect(anon.settings.ownerName()).toBe('Outro nome');
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

  it('as músicas vão à parte (`musicas`): inteiras no privado, sem as privadas no público, e viram aviso', async () => {
    const a = device();
    const now = new Date().toISOString();
    const music = (id: string, name: string, extra: Record<string, unknown> = {}) =>
      sanitizeReview({
        id,
        kind: 'musicas',
        game: { name, coverUrl: null, source: 'manual', form: 'album' },
        category: 'Radiohead',
        scores: { envolvimento: 9, letra: 8, vocal: 8, instrumental: 8 },
        status: 'finalizado',
        completedAt: '2026-01-01',
        createdAt: now,
        updatedAt: now,
        ...extra,
      })!;
    a.store.add(music('rmus0001', 'OK Computer'));
    a.store.add(music('rmus0002', 'Segredo', { private: true }));
    a.store.add(review('rjogo001', 'Hades'));
    const fetchSpy = window.fetch as jasmine.Spy;
    await a.sync.syncNow();
    const priv = (await cloud.read()) as unknown as { reviews: Review[]; musicas: Review[] };
    expect(priv.reviews.map((r) => r.id)).toEqual(['rjogo001']);
    expect(priv.musicas.map((r) => r.id).sort()).toEqual(['rmus0001', 'rmus0002']);
    const pub = (await cloud.readPublic()) as unknown as { reviews: Review[]; musicas: Review[] };
    expect(pub.reviews.map((r) => r.id)).toEqual(['rjogo001']);
    expect(pub.musicas.map((r) => [r.id, r.category])).toEqual([['rmus0001', 'Radiohead']]);
    const put = fetchSpy.calls.all().find((c) => (c.args[1] as RequestInit | undefined)?.method === 'PUT')!;
    const form = (put.args[1] as RequestInit).body as FormData;
    expect(JSON.parse(form.get('novas') as string)).toContain({ ref: 'rmus0001', titulo: 'OK Computer', mural: 'musicas' });
    expect((form.get('novas') as string).includes('rmus0002')).toBeFalse();
    expect(JSON.parse(form.get('cartao') as string)).toEqual(jasmine.objectContaining({ fichas: 2, murais: 2 }));

    // o outro aparelho, vazio, recebe as músicas no mural delas
    const b = device();
    await b.sync.syncNow();
    expect(b.store.reviews().filter((r) => r.kind === 'musicas').map((r) => r.id).sort()).toEqual(['rmus0001', 'rmus0002']);
  });

  it('o público não leva o título de uma ficha privada colada numa pública, e a nuvem recebe a lista do que está à mostra', async () => {
    const a = device();
    a.store.add({ ...review('rpriv001', 'Presente da Ana'), private: true });
    a.store.add({ ...review('rpub0001', 'Hades'), text: ['Comprar junto:', '{{nota: #rpriv001 | Presente da Ana | pequeno}}', '{{nota: #rpub0002 | Celeste}}'].join('\n') });
    a.store.add(review('rpub0002', 'Celeste'));
    const fetchSpy = window.fetch as jasmine.Spy;
    await a.sync.syncNow();
    const pub = (await cloud.readPublic()) as unknown as { reviews: Review[] };
    const text = pub.reviews.find((r) => r.id === 'rpub0001')!.text;
    expect(text).toBe(['Comprar junto:', '{{nota: #rpriv001 | 🔒 | pequeno}}', '{{nota: #rpub0002 | Celeste}}'].join('\n'));
    expect(JSON.stringify(pub)).not.toContain('Presente da Ana');
    // o privado continua inteiro
    const priv = await cloud.read();
    expect(priv.reviews.find((r) => r.id === 'rpub0001')!.text).toContain('Presente da Ana');
    const put = fetchSpy.calls.all().find((c) => (c.args[1] as RequestInit | undefined)?.method === 'PUT')!;
    const form = (put.args[1] as RequestInit).body as FormData;
    expect(JSON.parse(form.get('fichas') as string).sort()).toEqual(['rpub0001', 'rpub0002']);
  });

  describe('as anotações só no Kanban', () => {
    /** Uma anotação pública do grupo Trabalho, posta na primeira coluna do quadro dele. */
    function onBoard(d: Device, id: string, name: string, at = new Date().toISOString()) {
      d.store.add({ ...review(id, name, at, at), kind: 'anotacoes', category: 'Trabalho', publishedAt: at });
      const q = d.kanban.boardFor('Trabalho').id;
      d.kanban.update(q, (b, when) => placeCard(b, id, b.columns[0].id, when));
    }
    const putOf = () => {
      const puts = (window.fetch as jasmine.Spy).calls.all().filter((c) => (c.args[1] as RequestInit | undefined)?.method === 'PUT');
      return (puts[puts.length - 1].args[1] as RequestInit).body as FormData;
    };

    it('ficam fora do mural público e dos avisos, à parte só para o link, e o título delas some das notas coladas', async () => {
      const a = device();
      onBoard(a, 'nkan0001', 'Corrigir o login');
      const now = new Date().toISOString();
      a.store.add({ ...review('nmur0001', 'Reunião', now, now), kind: 'anotacoes', category: 'Trabalho', publishedAt: now, text: '{{nota: #nkan0001 | Corrigir o login}}' });
      // a privada no quadro não vai nem à parte
      a.store.add({ ...review('npriv001', 'Salário', now, now), kind: 'anotacoes', category: 'Trabalho', private: true });
      a.kanban.update(a.kanban.boardFor('Trabalho').id, (b, when) => placeCard(b, 'npriv001', b.columns[0].id, when));
      expect(a.kanban.boardOnly().has('nkan0001')).toBeTrue();
      await a.sync.syncNow();
      const pub = (await cloud.readPublic()) as unknown as { notas: Review[]; soKanban: Review[] };
      expect(pub.notas.map((n) => n.id)).toEqual(['nmur0001']);
      expect(pub.notas[0].text).not.toContain('Corrigir o login');
      // à parte, para o link da ficha: o mural de quem visita não lê `soKanban`
      expect(pub.soKanban.map((n) => n.id)).toEqual(['nkan0001']);
      expect(JSON.stringify(pub)).not.toContain('Salário');
      const form = putOf();
      // as reações e os comentários valem nela (pelo link)
      expect(JSON.parse(form.get('fichas') as string).sort()).toEqual(['nkan0001', 'nmur0001']);
      expect(JSON.parse(form.get('novas') as string).map((n: { ref: string }) => n.ref)).toEqual(['nmur0001']);
      expect(JSON.parse(form.get('cartao') as string)).toEqual(jasmine.objectContaining({ fichas: 1 }));
      // o privado continua com elas
      const priv = (await cloud.read()) as unknown as { notas: Review[] };
      expect(priv.notas.map((n) => n.id).sort()).toEqual(['nkan0001', 'nmur0001', 'npriv001']);
    });

    it('a que vai para o mural também (a dela ou a do grupo) aparece para os outros, e voltar ao só Kanban tira de novo', async () => {
      const a = device();
      onBoard(a, 'nkan0001', 'Corrigir o login');
      await a.sync.syncNow();
      expect(((await cloud.readPublic()) as unknown as { notas: Review[] }).notas).toEqual([]);

      a.kanban.setOnWall('nkan0001', true);
      await a.sync.syncNow();
      expect(((await cloud.readPublic()) as unknown as { notas: Review[] }).notas.map((n) => n.id)).toEqual(['nkan0001']);

      a.kanban.setOnWall('nkan0001', false);
      await a.sync.syncNow();
      expect(((await cloud.readPublic()) as unknown as { notas: Review[] }).notas).toEqual([]);

      // o grupo inteiro no mural também
      a.settings.setCategoryPrefs('Trabalho', { kanbanOnly: false });
      a.kanban.setOnWall('nkan0001', true);
      await a.sync.syncNow();
      expect(((await cloud.readPublic()) as unknown as { notas: Review[] }).notas.map((n) => n.id)).toEqual(['nkan0001']);
    });

    it('o mural público enviado por um site de antes (com elas) é refeito ao abrir, sem a pessoa mexer em nada', async () => {
      const a = device();
      onBoard(a, 'nkan0001', 'Corrigir o login');
      await a.sync.syncNow();
      const puts = cloud.puts;
      await a.sync.syncNow();
      expect(cloud.puts).toBe(puts);
      // como o site de antes deixou o estado: sem compartilhadas, a impressão do público era vazia
      const state = JSON.parse(a.kv.getItem(STATE_KEY)!) as Record<string, unknown>;
      delete state['publicas'];
      a.kv.setItem(STATE_KEY, JSON.stringify(state));
      await a.sync.syncNow();
      expect(cloud.puts).toBe(puts + 1);
      expect(((await cloud.readPublic()) as unknown as { notas: Review[] }).notas).toEqual([]);
    });

    it('o aparelho que baixa um mural enviado por um site de antes refaz o público; um enviado agora, não', async () => {
      const a = device();
      onBoard(a, 'nkan0001', 'Corrigir o login');
      await a.sync.syncNow();
      const fresh = device();
      await fresh.sync.syncNow();
      const puts = cloud.puts;
      expect(fresh.store.reviews().map((r) => r.id)).toEqual(['nkan0001']);

      // o mesmo mural, como um site de antes o mandaria (sem a impressão do público)
      const doc = (await cloud.read()) as unknown as { sync: Record<string, unknown> };
      expect(typeof doc.sync['publico']).toBe('string');
      delete doc.sync['publico'];
      await cloud.seed(doc);
      const b = device();
      await b.sync.syncNow();
      expect(cloud.puts).toBe(puts + 1);
      expect(((await cloud.readPublic()) as unknown as { notas: Review[] }).notas).toEqual([]);
    });
  });

  describe('os pedidos da API das AIs', () => {
    it('o aparelho aplica o pedido, envia o mural e só então conclui; o outro aparelho recebe a nota', async () => {
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ ...ACCOUNT, api: true }));
      cloud.api = true;
      const a = device();
      a.store.add(review('rhades01', 'Hades'));
      await a.sync.syncNow();
      const puts = cloud.puts;
      cloud.pedidos = [
        {
          id: 'pd_aaaaaaaaaaaaaaaa',
          op: 'nota.criar',
          alvo: 'rnotaapi000000000',
          estado: 'pendente',
          dados: { titulo: 'Da AI', texto: '- [ ] Ligar' },
          criado_em: '2026-10-27T15:00:00.000Z',
          expira_em: '2026-11-26T15:00:00.000Z',
          resolvido_em: null,
          chave: { id: 'k1', nome: 'Claude' },
        },
      ];
      await a.sync.syncNow();
      expect(a.store.get('rnotaapi000000000')?.game.name).toBe('Da AI');
      expect(cloud.puts).withContext('a nota subiu numa rodada só').toBe(puts + 1);
      expect(cloud.concluded.map((c) => [c.id, c.estado, c.puts])).withContext('concluído depois do envio').toEqual([['pd_aaaaaaaaaaaaaaaa', 'aplicado', puts + 1]]);
      expect(a.sync.status()).toBe('ok');
      const b = device();
      await b.sync.syncNow();
      expect(b.store.get('rnotaapi000000000')?.text).toBe('- [ ] Ligar');
      // nada mais pendente: a próxima rodada não pergunta pelos pedidos
      const asked = cloud.gets;
      await a.sync.syncNow();
      expect(cloud.gets).toBe(asked + 1);
    });

    it('sem a API liberada na conta, o aparelho não aplica nada', async () => {
      const a = device();
      await a.sync.syncNow();
      cloud.pedidos = [
        { id: 'pd_bbbbbbbbbbbbbbbb', op: 'nota.criar', alvo: 'rnotaapi000000001', estado: 'pendente', dados: { titulo: 'X' }, criado_em: '', expira_em: '', resolvido_em: null, chave: { id: 'k1', nome: 'Claude' } },
      ];
      await a.sync.syncNow();
      expect(a.store.get('rnotaapi000000001')).toBeUndefined();
      expect(cloud.concluded).toEqual([]);
    });
  });

  describe('nada se perde quando dois aparelhos mexem na mesma ficha', () => {
    /** Os dois aparelhos com a mesma ficha, já acertados com a nuvem. */
    async function twoDevices() {
      const a = device();
      a.store.add(review('rhades01', 'Hades', '2026-03-01T00:00:00.000Z'));
      await a.sync.syncNow();
      const b = device();
      await b.sync.syncNow();
      expect(b.names()).toEqual(['Hades']);
      return { a, b };
    }
    const rename = (d: Device, name: string, updatedAt: string) => {
      const r = d.store.get('rhades01')!;
      d.store.update({ ...r, game: { ...r.game, name }, updatedAt });
    };
    const kept = (d: Device) => d.store.versions().map((v) => [v.ficha.game.name, v.motivo]);

    for (const [first, second] of [
      ['2026-03-02T00:00:00.000Z', '2026-03-03T00:00:00.000Z'],
      ['2026-03-03T00:00:00.000Z', '2026-03-02T00:00:00.000Z'],
    ]) {
      it(`o mesmo título mudado nos dois vira pergunta, mexido antes ou depois (${first.slice(5, 10)}): no mural a que chegou antes na nuvem, as duas guardadas`, async () => {
        const { a, b } = await twoDevices();
        rename(a, 'Hades (do PC de casa)', first);
        await a.sync.syncNow();
        // o outro PC, sem ter baixado, mexe na mesma ficha
        rename(b, 'Hades (do trabalho)', second);
        await settle(b, a);
        expect(a.names()).toEqual(['Hades (do PC de casa)']);
        expect(b.names()).toEqual(['Hades (do PC de casa)']);
        for (const d of [a, b]) {
          const [c] = d.conflicts.pending();
          expect(c.alvo).toBe('ficha:rhades01');
          expect(c.partes).toEqual(['titulo']);
          expect((c.a as Review).game.name).toBe('Hades (do PC de casa)');
          expect((c.b as Review).game.name).toBe('Hades (do trabalho)');
          // nada foi para as versões guardadas: as duas estão no conflito
          expect(kept(d)).toEqual([]);
        }
      });
    }

    it('mexer de um lado só, um de cada vez, não guarda versão nenhuma', async () => {
      const { a, b } = await twoDevices();
      rename(a, 'Hades II', '2026-03-02T00:00:00.000Z');
      await settle(a, b);
      rename(b, 'Hades III', '2026-03-03T00:00:00.000Z');
      await settle(b, a);
      expect(a.names()).toEqual(['Hades III']);
      expect(kept(a)).toEqual([]);
      expect(kept(b)).toEqual([]);
    });

    it('apagada num aparelho e mexida no outro: a mexida fica no mural até a escolha; "manter apagada" apaga nos dois e guarda a mexida', async () => {
      const { a, b } = await twoDevices();
      rename(b, 'Hades (com a resenha nova)', '2026-03-02T00:00:00.000Z');
      a.store.remove('rhades01');
      await a.sync.syncNow();
      await settle(b, a);
      expect(a.names()).toEqual(['Hades (com a resenha nova)']);
      expect(b.names()).toEqual(['Hades (com a resenha nova)']);
      const [c] = a.conflicts.pending();
      expect(c.a).toBeNull();
      a.conflicts.resolve(`${c.alvo}@${c.em}`, 'a');
      await settle(a, b);
      expect(a.names()).toEqual([]);
      expect(b.names()).toEqual([]);
      expect(b.conflicts.pending()).toEqual([]);
      expect(kept(b)).toEqual([['Hades (com a resenha nova)', 'conflito']]);
      // e dá para trazer de volta, em qualquer aparelho
      b.store.restoreVersion(b.store.versions()[0]);
      await settle(b, a);
      expect(a.names()).toEqual(['Hades (com a resenha nova)']);
    });

    it('sair mantendo o mural e entrar de novo junta sem guardar o que não mudou', async () => {
      const { a, b } = await twoDevices();
      rename(a, 'Hades II', '2026-03-02T00:00:00.000Z');
      await a.sync.syncNow();
      // o b esquece o estado (saiu da conta mantendo o mural), mas lembra a base
      b.kv.removeItem(STATE_KEY);
      await b.sync.syncNow();
      expect(b.names()).toEqual(['Hades II']);
      expect(kept(b)).toEqual([]);
    });

    it('sem a base (o site de antes dela), o que mudou depois da última sincronização ainda fica guardado', async () => {
      const { a, b } = await twoDevices();
      b.kv.removeItem(BASE_KEY);
      const later = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
      rename(b, 'Hades (do trabalho)', later(1));
      rename(a, 'Hades (do PC de casa)', later(2));
      await a.sync.syncNow();
      await b.sync.syncNow();
      expect(b.names()).toEqual(['Hades (do PC de casa)']);
      expect(kept(b)).toEqual([['Hades (do trabalho)', 'juntou']]);
    });

    it('as versões vão no mural privado da nuvem, nunca no público', async () => {
      const { a, b } = await twoDevices();
      // sem a base, a junção é a de sempre: a mexida antes perde e fica guardada
      b.kv.removeItem(BASE_KEY);
      const later = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
      rename(a, 'Hades (do PC de casa)', later(1));
      await a.sync.syncNow();
      rename(b, 'Hades (do trabalho)', later(2));
      await a.sync.syncNow();
      await settle(b, a);
      const priv = (await cloud.read()) as unknown as { versoes: { ficha: Review }[]; sync: { schema: number } };
      expect(priv.versoes.map((v) => v.ficha.game.name)).toEqual(['Hades (do PC de casa)']);
      expect(priv.sync.schema).toBe(SYNC_SCHEMA);
      expect('versoes' in (await cloud.readPublic())).toBeFalse();
    });
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

  it('a nota colada que é uma ficha sua fora da vista perde o título e ganha o cadeado; a à mostra e a escrita à mão ficam', () => {
    const hidden = new Set(['rsegredo']);
    const card = { id: 'rpub', text: ['Antes', '{{nota: #rsegredo | Segredo}}', '{{ficha: Segredo}}', '{{nota: #routra | Outra}}'].join('\n') };
    expect(shownCard(card, hidden).text).toBe(['Antes', '{{nota: #rsegredo | 🔒}}', '{{ficha: Segredo}}', '{{nota: #routra | Outra}}'].join('\n'));
    // sem título também ganha o cadeado; a que já tem fica como está
    expect(shownCard({ id: 'r3', text: '{{nota: #rsegredo}}' }, hidden).text).toBe('{{nota: #rsegredo | 🔒}}');
    const marked = { id: 'r4', text: '{{nota: #rsegredo | 🔒}}' };
    expect(shownCard(marked, hidden)).toBe(marked);
    // sem nada a esconder, a mesma ficha (não copia à toa)
    const plain = { id: 'r1', text: '{{nota: #routra | Outra}}' };
    expect(shownCard(plain, hidden)).toBe(plain);
    expect(shownCard({ id: 'r2' }, hidden)).toEqual({ id: 'r2' });
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
  it('a leitura das fichas é a mesma da versão 19', async () => {
    const source = [sanitizeReview, sanitizeNote, sanitizeDraft, sanitizeWish].map((f) => f.toString().replace(/\s+/g, '')).join('|');
    const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(source));
    const hex = Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
    expect({ schema: SYNC_SCHEMA, hex }).toEqual({ schema: 41, hex: '688533d5419330f952246efba25b25b2ac04b3863ab28c3fb277766a9c92a7bd' });
  });
});
