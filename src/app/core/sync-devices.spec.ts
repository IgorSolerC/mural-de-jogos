import { EnvironmentInjector, createEnvironmentInjector, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, CloudAccount, SESSION_KEY } from './cloud-account';
import { Cloud } from './cloud-config';
import { CloudSync, KeyValueStore, SYNC_AUTO, SYNC_STORAGE } from './cloud-sync';
import { BASE_CONTENT_KEY } from './sync-base';
import { KANBAN_KEY, KanbanStore } from './kanban-store';
import { KanbanBoard, sanitizeKanban, addColumn, cardsIn, placeCard, removeCard, removeColumn, setImportance, updateColumn } from './kanban';
import { LabelEdits } from './label-edits';
import { LocalData } from './local-data';
import { PROFILE_KEY, ProfileStore } from './profile-store';
import { Review, sanitizeReview } from './review';
import { toggleCheck } from './rich-text';
import { ReviewStore } from './review-store';
import { SETTINGS_KEY, Settings } from './settings';
import { SHARED_AUTO, SharedStore } from './shared-store';
import { Confirm } from '../ui/confirm';
import { SyncConflicts, conflictKey } from './sync-conflicts';

/**
 * A sincronização entre aparelhos da mesma pessoa, de ponta a ponta, no que se junta por partes: os
 * quadros do Kanban (as colunas, as anotações e a ordem delas), o jeito das categorias e das tags, as
 * configurações do mural de anotações e as tags fixas. Dois (ou três) aparelhos mexem ao mesmo tempo,
 * um sem rede, em ordens diferentes; no fim todos têm de ficar iguais, sem perder nada que alguém fez.
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

function memoryKv(): KeyValueStore & { map: Map<string, string> } {
  const map = new Map<string, string>();
  return { map, getItem: (k) => map.get(k) ?? null, setItem: (k, v) => void map.set(k, v), removeItem: (k) => void map.delete(k) };
}

/** A nuvem do mural, de mentira, com as regras da API (rev, 409, 204, 404). */
class FakeCloud {
  rev = 0;
  doc: Uint8Array | null = null;
  offline = false;
  puts = 0;
  /**
   * Segura o próximo download (`GET`) ou envio (`PUT`) do mural no meio do caminho: `held` resolve
   * quando ele chega, e ele só segue com `release()` (para mexer no aparelho com o pedido a caminho).
   */
  private holds: Partial<Record<'GET' | 'PUT', { arrived: () => void; gate: Promise<void> }>> = {};

  hold(method: 'GET' | 'PUT'): { held: Promise<void>; release: () => void } {
    let arrived!: () => void;
    let release!: () => void;
    const held = new Promise<void>((r) => (arrived = r));
    const gate = new Promise<void>((r) => (release = r));
    this.holds[method] = { arrived, gate };
    return { held, release };
  }

  async handle(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const headers = (init.headers ?? {}) as Record<string, string>;
    const hold = u.pathname === '/v1/eu/mural' ? this.holds[method as 'GET' | 'PUT'] : undefined;
    if (hold) {
      delete this.holds[method as 'GET' | 'PUT'];
      hold.arrived();
      await hold.gate;
    }
    if (u.pathname === '/v1/eu' && method === 'GET') return json({ ...ACCOUNT, seguidores: 0, seguindo: 0 });
    if (u.pathname === '/v1/eu/notas' && method === 'GET') return json({ notas: [] });
    if (u.pathname === '/v1/eu/mural' && method === 'GET') {
      if (!this.doc) return json({ erro: 'sem-mural', mensagem: 'Ainda não há mural na nuvem.' }, 404);
      if (u.searchParams.get('rev') === String(this.rev)) return new Response(null, { status: 204, headers: { 'Mural-Rev': String(this.rev) } });
      return new Response(this.doc.slice(), { status: 200, headers: { 'Mural-Rev': String(this.rev), 'Content-Type': 'application/gzip' } });
    }
    if (u.pathname === '/v1/eu/mural' && method === 'PUT') {
      if (Number(headers['Mural-Rev-Base']) !== this.rev) return json({ erro: 'conflito', mensagem: 'Outro aparelho gravou antes.', rev: this.rev }, 409);
      const form = init.body as FormData;
      this.doc = new Uint8Array(await (form.get('privado') as Blob).arrayBuffer());
      this.rev++;
      this.puts++;
      return json({ rev: this.rev, novas: 0 });
    }
    return json({ erro: 'nao-encontrado', mensagem: url }, 404);
  }

  async read(): Promise<Record<string, unknown>> {
    const stream = new Blob([this.doc!.slice()]).stream().pipeThrough(new DecompressionStream('gzip'));
    return JSON.parse(await new Response(stream).text());
  }

  /** Troca o mural da nuvem (como se outro aparelho, talvez de um site antigo, tivesse enviado). */
  async write(doc: unknown): Promise<void> {
    const stream = new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('gzip'));
    this.doc = new Uint8Array(await new Response(stream).arrayBuffer());
    this.rev++;
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

function note(id: string, category: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' },
    text: '',
    category,
    completedAt: '2026-10-18',
    createdAt: '2026-10-18T10:00:00.000Z',
    updatedAt: '2026-10-18T10:00:00.000Z',
    ...extra,
  })!;
}

interface Device {
  store: ReviewStore;
  settings: Settings;
  kanban: KanbanStore;
  labels: LabelEdits;
  sync: CloudSync;
  conflicts: SyncConflicts;
  kv: ReturnType<typeof memoryKv>;
  /** O armazenamento das fichas deste aparelho (as abas do mesmo aparelho dividem). */
  data: MemoryData;
  /** O quadro da categoria (guardado ou o de sempre). */
  board(category: string): KanbanBoard;
  /** As anotações de cada coluna do quadro, pelo nome da coluna. */
  layout(category: string): Record<string, string[]>;
}

/** Um pouco depois: a hora de cada mudança é o que decide quem mexeu por último. */
const later = () => new Promise((r) => setTimeout(r, 4));

describe('sincronização entre aparelhos (Kanban, categorias e configurações)', () => {
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

  /**
   * Um aparelho novo (os ajustes, o perfil e os quadros de cada um: o localStorage do teste é um só).
   * Com `tabOf`, outra aba do mesmo aparelho: o mesmo armazenamento, o mesmo estado da sincronização.
   */
  function device(tabOf?: Device): Device {
    if (!tabOf) for (const k of [SETTINGS_KEY, PROFILE_KEY, KANBAN_KEY]) localStorage.removeItem(k);
    const kv = tabOf?.kv ?? memoryKv();
    const data = tabOf?.data ?? new MemoryData();
    const injector = createEnvironmentInjector(
      [
        { provide: LocalData, useValue: data },
        ReviewStore,
        Settings,
        ProfileStore,
        KanbanStore,
        CloudAccount,
        SharedStore,
        { provide: SHARED_AUTO, useValue: false },
        LabelEdits,
        CloudSync,
        SyncConflicts,
        { provide: SYNC_STORAGE, useValue: kv },
        { provide: SYNC_AUTO, useValue: false },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }) } },
        { provide: Confirm, useValue: { choose: async () => 'confirm', ask: async () => true } },
      ],
      parent,
    );
    injectors.push(injector);
    const kanban = injector.get(KanbanStore);
    const store = injector.get(ReviewStore);
    const board = (category: string) => kanban.boardFor(category);
    return {
      store,
      settings: injector.get(Settings),
      kanban,
      labels: injector.get(LabelEdits),
      conflicts: injector.get(SyncConflicts),
      sync: injector.get(CloudSync),
      kv,
      data,
      board,
      layout: (category) => {
        const b = board(category);
        return Object.fromEntries(b.columns.map((c) => [c.name, cardsIn(b, c.id).map((x) => x.note)]));
      },
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

  /** Muda o quadro da categoria no aparelho. */
  function edit(d: Device, category: string, change: (b: KanbanBoard, at: string) => KanbanBoard): void {
    d.kanban.update(d.board(category).id, change);
  }

  const col = (b: KanbanBoard, name: string) => b.columns.find((c) => c.name === name)!.id;

  /** Dois aparelhos já sincronizados, com o quadro do Trabalho montado: n1, n2 e n3 em A fazer. */
  async function twoDevices(): Promise<{ a: Device; b: Device }> {
    const a = device();
    for (const id of ['nt01', 'nt02', 'nt03']) a.store.add(note(id, 'Trabalho'));
    edit(a, 'Trabalho', (b, at) => ['nt01', 'nt02', 'nt03'].reduce((x, id) => placeCard(x, id, col(x, 'A fazer'), at), b));
    await a.sync.syncNow();
    const b = device();
    await b.sync.syncNow();
    expect(b.layout('Trabalho')).toEqual(a.layout('Trabalho'));
    await later();
    return { a, b };
  }

  describe('o mesmo quadro em dois aparelhos', () => {
    it('cada um move uma anotação diferente: as duas mudanças ficam nos dois', async () => {
      const { a, b } = await twoDevices();
      edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'Fazendo'), at));
      await later();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Feito'), at));
      await settle(a, b);
      const want = { 'A fazer': ['nt03'], Fazendo: ['nt01'], Feito: ['nt02'] };
      expect(a.layout('Trabalho')).toEqual(want);
      expect(b.layout('Trabalho')).toEqual(want);
    });

    it('do outro jeito (quem mexeu antes sincroniza depois): as duas mudanças ficam', async () => {
      const { a, b } = await twoDevices();
      edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'Fazendo'), at));
      await later();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Feito'), at));
      await settle(b, a);
      const want = { 'A fazer': ['nt03'], Fazendo: ['nt01'], Feito: ['nt02'] };
      expect(a.layout('Trabalho')).toEqual(want);
      expect(b.layout('Trabalho')).toEqual(want);
    });

    it('a mesma anotação movida para colunas diferentes: vale quem moveu por último, igual nos dois', async () => {
      const { a, b } = await twoDevices();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'Feito'), at));
      await later();
      edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'Fazendo'), at));
      await settle(b, a);
      expect(a.layout('Trabalho')).toEqual({ 'A fazer': ['nt02', 'nt03'], Fazendo: ['nt01'], Feito: [] });
      expect(b.layout('Trabalho')).toEqual(a.layout('Trabalho'));
    });

    it('a ordem à mão numa coluna e uma anotação nova em outra: as duas ficam', async () => {
      const { a, b } = await twoDevices();
      // A põe n3 no topo de A fazer
      edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt03', col(x, 'A fazer'), at, 0));
      await later();
      b.store.add(note('nt04', 'Trabalho'));
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt04', col(x, 'Fazendo'), at));
      await settle(a, b);
      const want = { 'A fazer': ['nt03', 'nt01', 'nt02'], Fazendo: ['nt04'], Feito: [] };
      expect(a.layout('Trabalho')).toEqual(want);
      expect(b.layout('Trabalho')).toEqual(want);
    });

    it('a ordem à mão mudada nos dois, em lugares diferentes da mesma coluna, sem perder anotação', async () => {
      const { a, b } = await twoDevices();
      edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt03', col(x, 'A fazer'), at, 0));
      await later();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'A fazer'), at));
      await settle(a, b);
      const got = a.layout('Trabalho')['A fazer'];
      expect([...got].sort()).toEqual(['nt01', 'nt02', 'nt03']);
      expect(b.layout('Trabalho')).toEqual(a.layout('Trabalho'));
    });

    it('uma coluna renomeada num e anotações movidas no outro: as duas coisas ficam', async () => {
      const { a, b } = await twoDevices();
      edit(a, 'Trabalho', (x, at) => updateColumn(x, col(x, 'Fazendo'), { name: 'Em andamento', color: 'azul' }, at));
      await later();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Fazendo'), at));
      await settle(a, b);
      const want = { 'A fazer': ['nt01', 'nt03'], 'Em andamento': ['nt02'], Feito: [] };
      expect(a.layout('Trabalho')).toEqual(want);
      expect(b.layout('Trabalho')).toEqual(want);
    });

    it('a ordem de uma coluna (por importância) num e a importância de uma anotação no outro: as duas ficam', async () => {
      const { a, b } = await twoDevices();
      edit(a, 'Trabalho', (x, at) => updateColumn(x, col(x, 'A fazer'), { sort: [{ by: 'importancia', reverse: true }] }, at));
      await later();
      edit(b, 'Trabalho', (x, at) => setImportance(x, 'nt02', 'critico', at));
      await settle(a, b);
      for (const d of [a, b]) {
        const x = d.board('Trabalho');
        expect(x.columns.find((c) => c.name === 'A fazer')!.sort).toEqual([{ by: 'importancia', reverse: true }]);
        expect(x.cards.find((c) => c.note === 'nt02')!.importance).toBe('critico');
      }
    });

    it('uma coluna nova em cada aparelho: as duas ficam, e as anotações postas nelas também', async () => {
      const { a, b } = await twoDevices();
      edit(a, 'Trabalho', (x, at) => {
        const { board, id } = addColumn(x, 'Revisão', at);
        return placeCard(board, 'nt01', id, at);
      });
      await later();
      edit(b, 'Trabalho', (x, at) => {
        const { board, id } = addColumn(x, 'Bloqueado', at);
        return placeCard(board, 'nt03', id, at);
      });
      await settle(a, b);
      for (const d of [a, b]) {
        const lay = d.layout('Trabalho');
        expect(lay['Revisão']).toEqual(['nt01']);
        expect(lay['Bloqueado']).toEqual(['nt03']);
        expect(lay['A fazer']).toEqual(['nt02']);
      }
      expect(b.board('Trabalho').columns.map((c) => c.id)).toEqual(a.board('Trabalho').columns.map((c) => c.id));
    });

    it('uma coluna tirada num, com uma anotação posta nela no outro: a anotação não some do quadro', async () => {
      const { a, b } = await twoDevices();
      edit(a, 'Trabalho', (x, at) => removeColumn(x, col(x, 'Fazendo'), col(x, 'A fazer'), at));
      await later();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Fazendo'), at));
      await settle(a, b);
      for (const d of [a, b]) {
        const lay = d.layout('Trabalho');
        expect(Object.keys(lay)).toEqual(['A fazer', 'Feito']);
        expect(Object.values(lay).flat().sort()).toEqual(['nt01', 'nt02', 'nt03']);
      }
      expect(b.layout('Trabalho')).toEqual(a.layout('Trabalho'));
    });

    it('tirada do quadro num e movida no outro antes: sai do quadro', async () => {
      const { a, b } = await twoDevices();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'Fazendo'), at));
      await later();
      edit(a, 'Trabalho', (x, at) => removeCard(x, 'nt01', at));
      await settle(b, a);
      for (const d of [a, b]) expect(d.layout('Trabalho')).toEqual({ 'A fazer': ['nt02', 'nt03'], Fazendo: [], Feito: [] });
    });

    it('o quadro de uma categoria montado pela primeira vez nos dois ao mesmo tempo: fica o de cada um', async () => {
      const a = device();
      a.store.add(note('mt01', 'Casa'));
      a.store.add(note('mt02', 'Casa'));
      await a.sync.syncNow();
      const b = device();
      await b.sync.syncNow();
      await later();
      edit(a, 'Casa', (x, at) => placeCard(x, 'mt01', col(x, 'Fazendo'), at));
      await later();
      edit(b, 'Casa', (x, at) => placeCard(x, 'mt02', col(x, 'A fazer'), at));
      await settle(a, b);
      for (const d of [a, b]) expect(d.layout('Casa')).toEqual({ 'A fazer': ['mt02'], Fazendo: ['mt01'], Feito: [] });
    });

    it('um aparelho sem rede por um tempo, com várias mudanças: junta tudo ao voltar', async () => {
      const { a, b } = await twoDevices();
      cloud.offline = true;
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt03', col(x, 'Feito'), at));
      await b.sync.syncNow();
      expect(b.sync.status()).toBe('sem-rede');
      cloud.offline = false;
      await later();
      edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'Fazendo'), at));
      await a.sync.syncNow();
      await later();
      cloud.offline = true;
      edit(b, 'Trabalho', (x, at) => setImportance(x, 'nt02', 'baixo', at));
      cloud.offline = false;
      await settle(b, a);
      for (const d of [a, b]) {
        expect(d.layout('Trabalho')).toEqual({ 'A fazer': ['nt02'], Fazendo: ['nt01'], Feito: ['nt03'] });
        expect(d.board('Trabalho').cards.find((c) => c.note === 'nt02')!.importance).toBe('baixo');
      }
    });

    it('três aparelhos mexendo no mesmo quadro: todos terminam iguais, com as três mudanças', async () => {
      const { a, b } = await twoDevices();
      const c = device();
      await c.sync.syncNow();
      await later();
      edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'Fazendo'), at));
      await later();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Feito'), at));
      await later();
      edit(c, 'Trabalho', (x, at) => updateColumn(x, col(x, 'Feito'), { name: 'Pronto' }, at));
      await settle(c, b, a);
      const want = { 'A fazer': ['nt03'], Fazendo: ['nt01'], Pronto: ['nt02'] };
      for (const d of [a, b, c]) expect(d.layout('Trabalho')).toEqual(want);
    });
  });

  describe('vários quadros', () => {
    it('quadros criados em aparelhos diferentes antes de sincronizar não ficam indo e voltando', async () => {
      const a = device();
      edit(a, 'Alfa', (x, at) => placeCard(x, 'a1', x.columns[0].id, at));
      await a.sync.syncNow();
      const b = device();
      edit(b, 'Beta', (x, at) => placeCard(x, 'b1', x.columns[0].id, at));
      await b.sync.syncNow();
      const puts = cloud.puts;
      expect(await settle(a, b)).toBeLessThanOrEqual(2);
      expect(cloud.puts - puts).toBeLessThanOrEqual(1);
      for (const d of [a, b]) expect(d.kanban.boards().map((x) => x.category).sort()).toEqual(['alfa', 'beta']);
    });
  });

  describe('renomear categorias com o Kanban aberto em outro aparelho', () => {
    async function withBoard(): Promise<{ a: Device; b: Device }> {
      const { a, b } = await twoDevices();
      return { a, b };
    }

    it('renomeada num, anotação movida no quadro de antes no outro (depois): a mudança vai para o quadro do nome novo', async () => {
      const { a, b } = await withBoard();
      expect(a.labels.renameCategory('Trabalho', 'Emprego').changed).toBe(3);
      await a.sync.syncNow();
      await later();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Fazendo'), at));
      await settle(b, a);
      for (const d of [a, b]) {
        expect(d.store.get('nt02')!.category).toBe('Emprego');
        expect(d.layout('Emprego')).toEqual({ 'A fazer': ['nt01', 'nt03'], Fazendo: ['nt02'], Feito: [] });
        expect(d.kanban.boards().map((x) => x.category)).toEqual(['emprego']);
      }
    });

    it('anotação movida num, e a categoria renomeada no outro depois, antes de receber: a mudança não se perde', async () => {
      const { a, b } = await withBoard();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Fazendo'), at));
      await later();
      a.labels.renameCategory('Trabalho', 'Emprego');
      await settle(a, b);
      for (const d of [a, b]) {
        expect(d.layout('Emprego')).toEqual({ 'A fazer': ['nt01', 'nt03'], Fazendo: ['nt02'], Feito: [] });
        expect(d.kanban.boards().map((x) => x.category)).toEqual(['emprego']);
      }
    });

    it('renomear e voltar ao nome de antes em outro aparelho: um quadro só, com as anotações', async () => {
      const { a, b } = await withBoard();
      a.labels.renameCategory('Trabalho', 'Emprego');
      await settle(a, b);
      await later();
      b.labels.renameCategory('Emprego', 'Trabalho');
      await settle(b, a);
      for (const d of [a, b]) {
        expect(d.kanban.boards().map((x) => x.category)).toEqual(['trabalho']);
        expect(d.layout('Trabalho')).toEqual({ 'A fazer': ['nt01', 'nt02', 'nt03'], Fazendo: [], Feito: [] });
      }
    });

    it('apagada num aparelho: o quadro sai dos dois, e as anotações ficam sem categoria', async () => {
      const { a, b } = await withBoard();
      a.labels.renameCategory('Trabalho', null);
      await settle(a, b);
      for (const d of [a, b]) {
        expect(d.kanban.boards()).toEqual([]);
        expect(d.store.get('nt01')!.category).toBeUndefined();
      }
    });
  });

  describe('o jeito das categorias e das tags', () => {
    it('cada aparelho pinta uma categoria diferente ao mesmo tempo: as duas cores ficam', async () => {
      const { a, b } = await twoDevices();
      a.settings.setCategoryLook('Trabalho', { color: 'azul' });
      await later();
      b.settings.setCategoryLook('Casa', { color: 'verde' });
      await settle(a, b);
      for (const d of [a, b]) {
        expect(d.settings.categoryLook('Trabalho').color).toBe('azul');
        expect(d.settings.categoryLook('Casa').color).toBe('verde');
      }
    });

    it('a mesma categoria pintada de cores diferentes nos dois: a mesma cor nos dois até a pessoa escolher, e a escolha vale nos dois', async () => {
      const { a, b } = await twoDevices();
      a.settings.setCategoryLook('Trabalho', { color: 'azul' });
      await later();
      b.settings.setCategoryLook('Trabalho', { color: 'rosa' });
      await settle(a, b);
      for (const d of [a, b]) expect(d.settings.categoryLook('Trabalho').color).toBe('azul');
      const [c] = b.conflicts.pending();
      expect(c).toBeDefined();
      b.conflicts.resolve(conflictKey(c), 'b');
      await settle(b, a);
      for (const d of [a, b]) {
        expect(d.settings.categoryLook('Trabalho').color).toBe('rosa');
        expect(d.conflicts.pending()).toEqual([]);
      }
    });

    it('renomear uma categoria num e pintar uma tag de outra no outro: as duas coisas ficam', async () => {
      const { a, b } = await twoDevices();
      b.store.add(note('ct01', 'Casa', { tags: ['Feira'] }));
      await settle(b, a);
      await later();
      a.settings.setCategoryLook('Trabalho', { color: 'azul' });
      await settle(a, b);
      await later();
      a.labels.renameCategory('Trabalho', 'Emprego');
      await later();
      b.settings.setTagColor('Feira', 'laranja', 'Casa');
      await settle(a, b);
      for (const d of [a, b]) {
        expect(d.settings.categoryLook('Emprego').color).toBe('azul');
        expect(d.settings.categoryLook('Trabalho').color).toBeUndefined();
        expect(d.settings.tagColor('Feira', 'Casa')).toBe('laranja');
      }
    });

    it('apagar a cor num aparelho e pintar outra categoria no outro: a apagada continua apagada', async () => {
      const { a, b } = await twoDevices();
      a.settings.setCategoryLook('Trabalho', { color: 'azul' });
      await settle(a, b);
      await later();
      a.settings.setCategoryLook('Trabalho', {});
      await later();
      b.settings.setCategoryLook('Casa', { color: 'verde' });
      await settle(b, a);
      for (const d of [a, b]) {
        expect(d.settings.categoryLook('Trabalho').color).toBeUndefined();
        expect(d.settings.categoryLook('Casa').color).toBe('verde');
      }
    });
  });

  describe('as configurações do mural e as tags fixas', () => {
    it('cada aparelho muda uma coisa diferente: as duas ficam', async () => {
      const { a, b } = await twoDevices();
      a.settings.setCategoryPrefs('Trabalho', { audience: 'publicar' });
      await later();
      b.settings.setTagHidden('Bug', 'Trabalho', true);
      await settle(a, b);
      for (const d of [a, b]) {
        expect(d.settings.notesConfig().categories['trabalho']).toEqual({ audience: 'publicar' });
        expect(d.settings.notesConfig().hiddenTags).toEqual(['##trabalho#bug']);
      }
    });

    it('a ordem das abas mudada num, e uma categoria escondida no outro: as duas ficam', async () => {
      const { a, b } = await twoDevices();
      a.settings.setNotesConfig({ orderBy: 'minha', order: ['casa', 'trabalho'] });
      await later();
      b.settings.setCategoryPrefs('Estudos', { hidden: true });
      await settle(b, a);
      for (const d of [a, b]) {
        expect(d.settings.notesConfig().order).toEqual(['casa', 'trabalho']);
        expect(d.settings.notesConfig().orderBy).toBe('minha');
        expect(d.settings.notesConfig().categories['estudos']).toEqual({ hidden: true });
      }
    });

    it('cada aparelho fixa uma tag: as duas ficam fixas; soltar num solta nos dois', async () => {
      const { a, b } = await twoDevices();
      a.settings.togglePinnedTag('Urgente');
      await later();
      b.settings.togglePinnedTag('Leitura');
      await settle(a, b);
      for (const d of [a, b]) expect([...d.settings.pinnedTags()].sort()).toEqual(['Leitura', 'Urgente']);
      await later();
      b.settings.togglePinnedTag('Urgente');
      await later();
      a.settings.togglePinnedTag('Ideia');
      await settle(a, b);
      for (const d of [a, b]) expect([...d.settings.pinnedTags()].sort()).toEqual(['Ideia', 'Leitura']);
    });
  });
  describe('versões do site', () => {
    it('sem a base das partes (o site de antes dela): a primeira junção fica com o mexido por último, e as seguintes já juntam por partes', async () => {
      const { a, b } = await twoDevices();
      b.kv.removeItem(BASE_CONTENT_KEY);
      edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'Fazendo'), at));
      await later();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Feito'), at));
      await settle(a, b);
      expect(b.layout('Trabalho')).toEqual(a.layout('Trabalho'));
      await later();
      edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt03', col(x, 'Fazendo'), at));
      await later();
      edit(b, 'Trabalho', (x, at) => setImportance(x, 'nt01', 'critico', at));
      await settle(a, b);
      for (const d of [a, b]) {
        expect(d.layout('Trabalho')['Fazendo']).toContain('nt03');
        expect(d.board('Trabalho').cards.find((c) => c.note === 'nt01')!.importance).toBe('critico');
      }
    });

    it('o mural enviado por um site antigo (sem para onde foi o quadro, sem a hora das anotações) é juntado sem quebrar nada', async () => {
      const { a, b } = await twoDevices();
      a.labels.renameCategory('Trabalho', 'Emprego');
      edit(a, 'Emprego', (x, at) => placeCard(x, 'nt01', col(x, 'Feito'), at));
      await a.sync.syncNow();
      // um site antigo baixou e mandou de novo, jogando fora o que não conhece
      const doc = await cloud.read();
      const k = doc['kanban'] as { boards: { cards: Record<string, unknown>[] }[]; movedTo?: unknown };
      delete k.movedTo;
      for (const board of k.boards) for (const card of board.cards) delete card['at'];
      await cloud.write({ ...doc, sync: { schema: 22 } });
      await later();
      edit(b, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Fazendo'), at));
      await settle(b, a);
      expect(b.kanban.state().boards.map((x) => x.category).sort()).toEqual(a.kanban.state().boards.map((x) => x.category).sort());
      expect(b.layout('Emprego')).toEqual(a.layout('Emprego'));
      expect(a.layout('Emprego')['Feito']).toEqual(['nt01']);
      expect(await settle(a, b)).toBe(1);
    });

    it('um mural de uma versão mais nova do site: este para e não mexe em nada (nem nos quadros)', async () => {
      const { a, b } = await twoDevices();
      const doc = await cloud.read();
      await cloud.write({ ...doc, kanban: { boards: [] }, sync: { schema: 999 } });
      const before = JSON.stringify(b.kanban.state());
      await b.sync.syncNow();
      expect(b.sync.status()).toBe('desatualizado');
      expect(JSON.stringify(b.kanban.state())).toBe(before);
      void a;
    });
  });

  describe('os quadros de antes (sem categoria) nos dois aparelhos', () => {
    const legacy = {
      id: 'qvelho01',
      name: 'Coisas',
      at: '2026-09-01T10:00:00.000Z',
      columns: [
        { id: 'qvelho01-a', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
        { id: 'qvelho01-f', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
      ],
      traits: [{ id: 'tr1', name: 'Urgente', color: 'vermelha' }],
      cards: [
        { note: 'cs01', column: 'qvelho01-a', importance: 'critico', traits: ['tr1'] },
        { note: 'cs02', column: 'qvelho01-f', importance: null, traits: [] },
      ],
    };

    it('os dois convertem o mesmo quadro de antes: um quadro só, sem repetir anotação nem tag, e a conversão não roda de novo', async () => {
      const { a, b } = await twoDevices();
      a.store.add(note('cs01', 'Casa'));
      a.store.add(note('cs02', 'Casa'));
      await settle(a, b);
      for (const d of [a, b]) d.kanban.state.set(sanitizeKanban({ ...d.kanban.state(), legacy: [legacy] }));
      TestBed.tick();
      for (const d of [a, b]) expect(d.kanban.state().legacy).toEqual([]);
      await settle(a, b);
      TestBed.tick();
      for (const d of [a, b]) {
        expect(d.kanban.state().legacy).toEqual([]);
        expect(d.kanban.boards().map((x) => x.category).sort()).toEqual(['casa', 'trabalho']);
        expect(d.layout('Casa')).toEqual({ 'A fazer': ['cs01'], Feito: ['cs02'] });
        expect(d.board('Casa').cards.find((c) => c.note === 'cs01')!.importance).toBe('critico');
        expect(d.store.get('cs01')!.tags).toEqual(['Urgente']);
        expect(d.kanban.state().removed['qvelho01']).toBeDefined();
      }
      // o quadro de antes chegando de novo (de um aparelho velho) não volta nem repete nada
      const doc = await cloud.read();
      await cloud.write({ ...doc, kanban: { ...(doc['kanban'] as object), legacy: [legacy] } });
      await settle(b, a);
      TestBed.tick();
      for (const d of [a, b]) {
        expect(d.kanban.state().legacy).toEqual([]);
        expect(d.board('Casa').cards.length).toBe(2);
        expect(d.store.get('cs01')!.tags).toEqual(['Urgente']);
      }
      expect(await settle(a, b)).toBe(1);
    });
  });

  /**
   * As mexidas pequenas, que a pessoa faz sem abrir o editor e espera que fiquem: marcar uma tarefa na
   * ficha ou na leitura, e mexer nas tags (o nome, a cor, tirar). Nenhuma pode voltar atrás sozinha,
   * nem quando o outro aparelho mexe na mesma anotação, nem com o envio ou o download no meio do caminho.
   */
  describe('as mexidas pequenas (marcar tarefas, mexer nas tags)', () => {
    const LIST = '- [ ] Pão\n- [ ] Leite\n- [ ] Café';

    /** Marca (ou desmarca) a tarefa da linha, como a ficha e a leitura fazem. */
    function tick(d: Device, id: string, line: number): void {
      const r = d.store.get(id)!;
      d.store.update({ ...r, text: toggleCheck(r.text, line), updatedAt: new Date().toISOString() });
    }
    const ticked = (d: Device, id = 'nl01') => d.store.get(id)!.text.split('\n').map((l) => l.startsWith('- [x]'));

    /** Dois aparelhos sincronizados com a lista de compras (Casa, tag Feira). */
    async function withList(): Promise<{ a: Device; b: Device }> {
      const a = device();
      a.store.add(note('nl01', 'Casa', { text: LIST, tags: ['Feira'] }));
      await a.sync.syncNow();
      const b = device();
      await b.sync.syncNow();
      expect(b.store.get('nl01')?.text).toBe(LIST);
      await later();
      return { a, b };
    }

    it('marcar uma tarefa chega no outro aparelho, e desmarcar também', async () => {
      const { a, b } = await withList();
      tick(a, 'nl01', 1);
      await settle(a, b);
      expect(ticked(b)).toEqual([false, true, false]);
      await later();
      tick(b, 'nl01', 1);
      await settle(b, a);
      for (const d of [a, b]) expect(ticked(d)).toEqual([false, false, false]);
    });

    it('cada aparelho marca uma tarefa diferente da mesma anotação ao mesmo tempo: as duas ficam marcadas', async () => {
      const { a, b } = await withList();
      tick(a, 'nl01', 0);
      await later();
      tick(b, 'nl01', 2);
      await settle(a, b);
      for (const d of [a, b]) {
        expect(ticked(d)).toEqual([true, false, true]);
        expect(d.conflicts.pending()).toEqual([]);
      }
    });

    it('tarefas vizinhas marcadas ao mesmo tempo, uma em cada aparelho: as duas ficam, sem conflito', async () => {
      const { a, b } = await withList();
      tick(a, 'nl01', 0);
      await later();
      tick(b, 'nl01', 1);
      await settle(b, a);
      for (const d of [a, b]) {
        expect(ticked(d)).toEqual([true, true, false]);
        expect(d.conflicts.pending()).toEqual([]);
      }
    });

    it('marcada sem rede: fica no aparelho e vai quando a rede volta, mesmo com o outro mexendo na mesma anotação', async () => {
      const { a, b } = await withList();
      cloud.offline = true;
      tick(a, 'nl01', 0);
      await a.sync.syncNow();
      expect(ticked(a)).toEqual([true, false, false]);
      cloud.offline = false;
      await later();
      tick(b, 'nl01', 1);
      await b.sync.syncNow();
      await settle(a, b);
      for (const d of [a, b]) expect(ticked(d)).toEqual([true, true, false]);
    });

    it('marcada com o envio a caminho: vai no envio seguinte, e nada volta atrás', async () => {
      const { a, b } = await withList();
      tick(a, 'nl01', 0);
      const put = cloud.hold('PUT');
      const run = a.sync.syncNow();
      await put.held;
      await later();
      tick(a, 'nl01', 1);
      put.release();
      await run;
      expect(ticked(a)).toEqual([true, true, false]);
      await settle(a, b);
      for (const d of [a, b]) expect(ticked(d)).toEqual([true, true, false]);
    });

    it('marcada com o download a caminho, que traz a mesma anotação mudada no outro aparelho: as duas marcas ficam', async () => {
      const { a, b } = await withList();
      tick(b, 'nl01', 2);
      await b.sync.syncNow();
      await later();
      const get = cloud.hold('GET');
      const run = a.sync.syncNow();
      await get.held;
      tick(a, 'nl01', 0);
      get.release();
      await run;
      expect(ticked(a)).toEqual([true, false, true]);
      await settle(a, b);
      for (const d of [a, b]) expect(ticked(d)).toEqual([true, false, true]);
    });

    it('marcada e desmarcada várias vezes, sincronizando no meio em ordens diferentes: fica como ficou por último', async () => {
      const { a, b } = await withList();
      const steps: [Device, number][] = [
        [a, 0],
        [b, 0],
        [a, 1],
        [b, 2],
        [a, 0],
        [b, 1],
      ];
      for (const [i, [d, line]] of steps.entries()) {
        tick(d, 'nl01', line);
        await (i % 2 ? settle(b, a) : settle(a, b));
        await later();
      }
      // 0: marcada três vezes; 1: duas; 2: uma
      for (const d of [a, b]) expect(ticked(d)).toEqual([true, false, true]);
    });

    it('renomear a tag num aparelho e marcar uma tarefa da mesma anotação no outro: as duas coisas ficam', async () => {
      const { a, b } = await withList();
      a.settings.setTagColor('Feira', 'azul', 'Casa');
      await settle(a, b);
      await later();
      a.labels.renameTag('Feira', 'Casa', 'Mercado');
      await later();
      tick(b, 'nl01', 0);
      await settle(b, a);
      for (const d of [a, b]) {
        expect(d.store.get('nl01')!.tags).toEqual(['Mercado']);
        expect(ticked(d)).toEqual([true, false, false]);
        expect(d.settings.tagColor('Mercado', 'Casa')).toBe('azul');
      }
    });

    it('tirar a tag num aparelho e marcar uma tarefa no outro: a tag não volta, e a marca fica', async () => {
      const { a, b } = await withList();
      a.labels.renameTag('Feira', 'Casa', null);
      await later();
      tick(b, 'nl01', 1);
      await settle(a, b);
      await settle(b, a);
      for (const d of [a, b]) {
        expect(d.store.get('nl01')!.tags ?? []).toEqual([]);
        expect(ticked(d)).toEqual([false, true, false]);
      }
    });

    it('a cor da tag trocada várias vezes, em aparelhos diferentes, com tarefas marcadas no meio: fica a última, nos dois', async () => {
      const { a, b } = await withList();
      a.settings.setTagColor('Feira', 'azul', 'Casa');
      await later();
      tick(b, 'nl01', 1);
      await settle(a, b);
      await later();
      b.settings.setTagColor('Feira', 'verde', 'Casa');
      await settle(b, a);
      await later();
      a.settings.setTagColor('Feira', 'rosa', 'Casa');
      await settle(a, b);
      // mais rodadas sem ninguém mexer não mudam nada
      expect(await settle(b, a)).toBe(1);
      for (const d of [a, b]) {
        expect(d.settings.tagColor('Feira', 'Casa')).toBe('rosa');
        expect(ticked(d)).toEqual([false, true, false]);
      }
    });

    /**
     * Duas abas abertas no mesmo aparelho dividem o armazenamento e o estado da sincronização (a base
     * da junção). A aba que ficou aberta desde antes não pode mandar de volta para a nuvem o que a
     * outra já mudou, nem gravar por cima no aparelho.
     */
    describe('duas abas no mesmo aparelho', () => {
      /** O que o navegador faz nas outras abas quando uma grava no localStorage (depois de gravar). */
      const otherTabsSee = async (key: string) => {
        await later();
        window.dispatchEvent(new StorageEvent('storage', { key, newValue: localStorage.getItem(key), storageArea: localStorage }));
        await later();
      };

      it('a cor da tag mudada numa aba não volta pela outra, aberta desde antes; e o que a outra muda depois soma', async () => {
        const a = device();
        a.store.add(note('nl01', 'Casa', { text: LIST, tags: ['Feira'] }));
        await a.sync.syncNow();
        const t = device(a);
        await t.sync.syncNow();
        await later();
        a.settings.setTagColor('Feira', 'azul', 'Casa');
        await otherTabsSee(SETTINGS_KEY);
        await a.sync.syncNow();
        await t.sync.syncNow();
        await later();
        t.settings.setCategoryLook('Trabalho', { color: 'verde' });
        await otherTabsSee(SETTINGS_KEY);
        await t.sync.syncNow();
        await a.sync.syncNow();
        const c = device();
        await c.sync.syncNow();
        for (const d of [a, t, c]) {
          expect(d.settings.tagColor('Feira', 'Casa')).toBe('azul');
          expect(d.settings.categoryLook('Trabalho').color).toBe('verde');
        }
      });

      it('a anotação movida no Kanban numa aba não volta pela outra; e o que a outra move depois soma', async () => {
        const a = device();
        for (const id of ['nt01', 'nt02']) a.store.add(note(id, 'Trabalho'));
        edit(a, 'Trabalho', (x, at) => ['nt01', 'nt02'].reduce((y, id) => placeCard(y, id, col(y, 'A fazer'), at), x));
        await a.sync.syncNow();
        const t = device(a);
        await t.sync.syncNow();
        await later();
        edit(a, 'Trabalho', (x, at) => placeCard(x, 'nt01', col(x, 'Feito'), at));
        await otherTabsSee(KANBAN_KEY);
        await a.sync.syncNow();
        await t.sync.syncNow();
        await later();
        edit(t, 'Trabalho', (x, at) => placeCard(x, 'nt02', col(x, 'Fazendo'), at));
        await otherTabsSee(KANBAN_KEY);
        await t.sync.syncNow();
        await a.sync.syncNow();
        const c = device();
        await c.sync.syncNow();
        for (const d of [a, t, c]) {
          expect(d.layout('Trabalho')['Feito']).toEqual(['nt01']);
          expect(d.layout('Trabalho')['Fazendo']).toEqual(['nt02']);
        }
      });
    });
  });
});
