import { EnvironmentInjector, createEnvironmentInjector, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, CloudAccount, SESSION_KEY } from './cloud-account';
import { Cloud } from './cloud-config';
import { LocalData } from './local-data';
import { Review, sanitizeReview, withPin } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { SHARED_AUTO, SharedStore } from './shared-store';
import { CloudSync, SYNC_AUTO, SYNC_STORAGE } from './cloud-sync';
import { ProfileStore } from './profile-store';
import { Confirm } from '../ui/confirm';
import { SyncConflicts } from './sync-conflicts';
import { SHARED_GROUP, mergeNote, sharedContent } from './shared-notes';
import { KanbanStore } from './kanban-store';
import { KanbanActions } from './kanban-actions';
import { KanbanDresser } from './kanban-dresser';
import { NoteDone } from './note-done';
import { WallView } from './wall-view';
import { WallMotion } from './wall-motion';
import { Mural } from './mural';
import { Toasts } from '../ui/toast';
import { isDone } from './review';
import { categoryIcon } from '../ui/category-label';
import { ICON, ICON_CHOICE } from '../ui/icons';

/**
 * As anotações compartilhadas de ponta a ponta, com pessoas diferentes (cada uma com o seu aparelho) e
 * uma nuvem de mentira com as regras da API (a vez de gravar, os papéis, o conflito guardado).
 */

const API = 'https://api.teste';

interface User {
  id: string;
  codigo: string;
  nome: string;
  token: string;
}

const USERS: Record<string, User> = {
  ana: { id: 'u-ana', codigo: 'AAAA-1111', nome: 'Ana', token: 'a'.repeat(43) },
  bia: { id: 'u-bia', codigo: 'BBBB-2222', nome: 'Bia', token: 'b'.repeat(43) },
  cris: { id: 'u-cris', codigo: 'CCCC-3333', nome: 'Cris', token: 'c'.repeat(43) },
};

type Role = 'gestor' | 'editor' | 'leitor';

interface FakeNote {
  id: string;
  dono: string;
  rev: number;
  versao: number;
  dados: Record<string, unknown>;
  conflito: { a: unknown; b: unknown; autorA: string; autorB: string; em: string } | null;
  por: string;
  em: string;
  membros: Map<string, Role>;
}

/** A nuvem das anotações compartilhadas, de mentira, com as regras de api/src/routes/notes.ts. */
class FakeNotes {
  readonly notes = new Map<string, FakeNote>();
  /** O último envio do mural de cada um: o público, as fichas à mostra e as novas. */
  readonly murals = new Map<string, { publico: { notas: Record<string, unknown>[] }; fichas: string[]; novas: { ref: string }[] }>();
  offline = false;
  puts = 0;
  /** O mural privado de cada um na nuvem (para os aparelhos da mesma pessoa). */
  readonly privados = new Map<string, { rev: number; doc: Uint8Array }>();
  /** Com a regra de 1 s entre duas gravações da mesma pessoa (429 devagar), como a API. */
  strict = false;
  /** Quantas vezes o grupo, o assunto, as tags ou a fixada (que são de cada um) chegaram na anotação. */
  leaks = 0;
  /** A lista das anotações volta como uma página qualquer (um wi-fi de hotel), com 200. */
  brokenList = false;

  /** A anotação como a API guarda: sem o que é de cada pessoa (ver `noteData` em api/src/domain/shared-note.ts). */
  private stored(d: Record<string, unknown>): Record<string, unknown> {
    const { category, subject, tags, noteRank, ...rest } = d;
    if (category !== undefined || subject !== undefined || tags !== undefined || noteRank !== undefined) this.leaks++;
    return rest;
  }

  private user(init: RequestInit): User | null {
    const auth = ((init.headers ?? {}) as Record<string, string>)['Authorization'] ?? '';
    return Object.values(USERS).find((u) => `Bearer ${u.token}` === auth) ?? null;
  }

  private byCode(code: string): User | undefined {
    return Object.values(USERS).find((u) => u.codigo === code);
  }

  private access(n: FakeNote, u: User): 'dono' | Role | null {
    return n.dono === u.id ? 'dono' : (n.membros.get(u.id) ?? null);
  }

  private person(id: string) {
    const u = Object.values(USERS).find((x) => x.id === id)!;
    return { codigo: u.codigo, nome: u.nome };
  }

  detail(n: FakeNote, access: string) {
    const writes = access !== 'leitor';
    return {
      id: n.id,
      dono: this.person(n.dono),
      papel: access,
      rev: n.rev,
      versao: n.versao,
      dados: n.dados,
      membros: [...n.membros].map(([id, papel]) => ({ ...this.person(id), papel, desde: '2026-10-16T00:00:00.000Z' })),
      atualizadoEm: n.em,
      atualizadoPor: this.person(n.por),
      ...(writes && n.conflito ? { conflito: { ...n.conflito, autorA: this.person(n.conflito.autorA), autorB: this.person(n.conflito.autorB) } } : {}),
    };
  }

  private structure(d: Record<string, unknown>) {
    return JSON.stringify({ p: !!d['private'], q: !!d['quiet'] });
  }

  async handle(url: string, init: RequestInit = {}): Promise<Response> {
    if (this.offline) throw new TypeError('Failed to fetch');
    const u = new URL(url);
    const method = init.method ?? 'GET';
    const me = this.user(init);
    if (!me) return json({ erro: 'sessao-invalida', mensagem: 'Sua sessão acabou.' }, 401);
    const body = init.body && typeof init.body === 'string' ? JSON.parse(init.body) : {};
    const path = u.pathname;
    if (path === '/v1/eu' && method === 'GET') return json({ id: me.id, codigo: me.codigo, nome: me.nome });
    // o mural de cada um (o que vai para quem visita, só para conferir)
    if (path === '/v1/eu/mural' && method === 'GET') {
      const mine = this.privados.get(me.id);
      if (!mine) return json({ erro: 'sem-mural', mensagem: 'Ainda não há mural.' }, 404);
      if (u.searchParams.get('rev') === String(mine.rev)) return new Response(null, { status: 204, headers: { 'Mural-Rev': String(mine.rev) } });
      return new Response(mine.doc.slice(), { status: 200, headers: { 'Mural-Rev': String(mine.rev), 'Content-Type': 'application/gzip' } });
    }
    if (path === '/v1/eu/mural' && method === 'PUT') {
      const form = init.body as FormData;
      const rev = this.privados.get(me.id)?.rev ?? 0;
      const base = Number(((init.headers ?? {}) as Record<string, string>)['Mural-Rev-Base']);
      if (base !== rev) return json({ erro: 'conflito', mensagem: 'Outro aparelho gravou antes.', rev }, 409);
      this.privados.set(me.id, { rev: rev + 1, doc: new Uint8Array(await (form.get('privado') as Blob).arrayBuffer()) });
      const stream = (form.get('publico') as Blob).stream().pipeThrough(new DecompressionStream('gzip'));
      this.murals.set(me.id, {
        publico: JSON.parse(await new Response(stream).text()),
        fichas: JSON.parse(String(form.get('fichas'))),
        novas: JSON.parse(String(form.get('novas'))),
      });
      return json({ rev: rev + 1, novas: 0 });
    }
    if (path === '/v1/eu/notas' && method === 'GET') {
      if (this.brokenList) return new Response('<html>Entre na rede</html>', { status: 200, headers: { 'Content-Type': 'text/html' } });
      const out = [...this.notes.values()].filter((n) => this.access(n, me)).map((n) => ({ id: n.id, versao: n.versao, papel: this.access(n, me) }));
      return json({ notas: out });
    }
    if (path === '/v1/eu/notas/detalhes') {
      const ids = (u.searchParams.get('ids') ?? '').split(',');
      const out = ids.map((id) => this.notes.get(id)).filter((n): n is FakeNote => !!n && !!this.access(n, me));
      return json({ notas: out.map((n) => this.detail(n, this.access(n, me)!)) });
    }
    if (path === '/v1/notas' && method === 'POST') {
      const at = new Date().toISOString();
      const n: FakeNote = { id: body.id, dono: me.id, rev: 1, versao: 1, dados: this.stored(body.dados), conflito: null, por: me.id, em: at, membros: new Map() };
      for (const m of body.membros ?? []) n.membros.set(this.byCode(m.codigo)!.id, m.papel);
      this.notes.set(n.id, n);
      return json({ nota: this.detail(n, 'dono') }, 201);
    }
    const m = /^\/v1\/notas\/([^/]+)(?:\/membros\/([^/]+))?$/.exec(path);
    const n = m ? this.notes.get(decodeURIComponent(m[1])) : undefined;
    const access = n ? this.access(n, me) : null;
    if (!n || !access) return json({ erro: 'nota-nao-encontrada', mensagem: 'Essa anotação não está mais compartilhada com você.' }, 404);
    if (m![2]) {
      const target = m![2] === 'eu' ? me : this.byCode(decodeURIComponent(m![2]))!;
      if (method === 'DELETE') {
        if (target.id !== me.id && access !== 'dono' && access !== 'gestor') return json({ erro: 'so-gestor', mensagem: 'Só o dono e os gestores.' }, 403);
        n.membros.delete(target.id);
        n.versao++;
        return json(target.id === me.id ? { ok: true } : { nota: this.detail(n, access) });
      }
      if (access !== 'dono' && access !== 'gestor') return json({ erro: 'so-gestor', mensagem: 'Só o dono e os gestores.' }, 403);
      n.membros.set(target.id, body.papel);
      n.versao++;
      return json({ nota: this.detail(n, access) });
    }
    if (method === 'DELETE') {
      if (access !== 'dono') return json({ erro: 'so-dono', mensagem: 'Só o dono.' }, 403);
      this.notes.delete(n.id);
      return json({ ok: true });
    }
    // PUT: gravar o conteúdo
    if (access === 'leitor') return json({ erro: 'so-leitura', mensagem: 'Só leitura.' }, 403);
    if (body.base !== n.rev) return json({ erro: 'conflito', mensagem: 'Outra pessoa gravou antes.', nota: this.detail(n, access) }, 409);
    if (this.strict && n.por === me.id && Date.now() - Date.parse(n.em) < 1000) return json({ erro: 'devagar', mensagem: 'Muitas gravações seguidas.' }, 429);
    if (access === 'editor') {
      const allowed = new Set([this.structure(n.dados)]);
      if (body.resolver && n.conflito) for (const v of [n.conflito.a, n.conflito.b]) allowed.add(this.structure(v as Record<string, unknown>));
      if (!allowed.has(this.structure(body.dados))) return json({ erro: 'so-gestor', mensagem: 'Só o dono e os gestores mudam a estrutura.' }, 403);
    }
    const at = new Date().toISOString();
    if (body.conflito) n.conflito = { a: this.stored(body.dados), b: this.stored(body.conflito.b), autorA: n.por, autorB: me.id, em: at };
    else if (body.resolver) n.conflito = null;
    n.dados = this.stored(body.dados);
    n.rev++;
    n.versao++;
    n.por = me.id;
    n.em = at;
    this.puts++;
    return json({ nota: this.detail(n, access) });
  }
}

function json(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

class MemoryData {
  readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {}
  takeForeign(): null {
    return null;
  }
}

function note(id: string, text: string, extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id,
    kind: 'anotacoes',
    game: { name: 'Lista do mercado', coverUrl: null, source: 'manual' },
    text,
    completedAt: '2026-10-16',
    createdAt: '2026-10-16T10:00:00.000Z',
    updatedAt: '2026-10-16T10:00:00.000Z',
    stock: 'amarelo',
    ...extra,
  })!;
}

/** O estado da sincronização do mural, um por aparelho. */
function kv() {
  const map = new Map<string, string>();
  return { getItem: (k: string) => map.get(k) ?? null, setItem: (k: string, v: string) => void map.set(k, v), removeItem: (k: string) => void map.delete(k) };
}

interface Person {
  account: CloudAccount;
  mural: CloudSync;
  store: ReviewStore;
  shared: SharedStore;
  kanban: KanbanStore;
  actions: KanbanActions;
  toasts: Toasts;
  settings: Settings;
  data: MemoryData;
  edit(id: string, change: Partial<Review>): void;
  text(id: string): string | undefined;
}

describe('anotações compartilhadas (ponta a ponta)', () => {
  let cloud: FakeNotes;
  let parent: EnvironmentInjector;
  const injectors: { destroy(): void }[] = [];
  let clock = Date.parse('2026-10-16T12:00:00.000Z');

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    parent = TestBed.inject(EnvironmentInjector);
    cloud = new FakeNotes();
    spyOn(window, 'fetch').and.callFake((url: RequestInfo | URL, init?: RequestInit) => cloud.handle(String(url), init));
    // cada edição um pouco depois da outra (a junção olha quem mexeu por último)
    clock = Date.parse('2026-10-16T12:00:00.000Z');
    jasmine.clock().install();
    jasmine.clock().mockDate(new Date(clock));
  });

  afterEach(() => {
    jasmine.clock().uninstall();
    for (const i of injectors.splice(0)) i.destroy();
    localStorage.clear();
  });

  const later = () => {
    clock += 60_000;
    jasmine.clock().mockDate(new Date(clock));
  };

  /** Um aparelho logado na conta de `who`. */
  function person(who: keyof typeof USERS, data = new MemoryData()): Person {
    const u = USERS[who];
    localStorage.setItem(SESSION_KEY, u.token);
    localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: u.id, codigo: u.codigo, nome: u.nome }));
    const injector = createEnvironmentInjector(
      [
        { provide: LocalData, useValue: data },
        ReviewStore,
        Settings,
        CloudAccount,
        SharedStore,
        { provide: SHARED_AUTO, useValue: false },
        ProfileStore,
        Mural,
        WallView,
        WallMotion,
        Toasts,
        NoteDone,
        KanbanStore,
        KanbanDresser,
        KanbanActions,
        CloudSync,
        SyncConflicts,
        { provide: SYNC_AUTO, useValue: false },
        { provide: SYNC_STORAGE, useValue: kv() },
        { provide: Confirm, useValue: { choose: async () => 'confirm', ask: async () => true } },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x.apps.googleusercontent.com' }) } },
      ],
      parent,
    );
    injectors.push(injector);
    const store = injector.get(ReviewStore);
    const shared = injector.get(SharedStore);
    TestBed.tick();
    return {
      account: injector.get(CloudAccount),
      mural: injector.get(CloudSync),
      store,
      shared,
      kanban: injector.get(KanbanStore),
      actions: injector.get(KanbanActions),
      toasts: injector.get(Toasts),
      settings: injector.get(Settings),
      data,
      edit: (id, change) => {
        later();
        const r = store.get(id)!;
        store.update({ ...r, ...change, updatedAt: new Date().toISOString() });
        TestBed.tick();
      },
      text: (id) => store.get(id)?.text,
    };
  }

  async function sync(...people: Person[]): Promise<void> {
    for (let round = 0; round < 3; round++) {
      for (const p of people) {
        await p.shared.sync();
        TestBed.tick();
      }
    }
  }

  /** Ana compartilha "n1" com Bia (editora) e Cris (leitora). */
  async function sharedNote(text = 'arroz\nfeijão', extra: Record<string, unknown> = {}) {
    const ana = person('ana');
    const bia = person('bia');
    const cris = person('cris');
    ana.store.add(note('nota-1', text, extra));
    TestBed.tick();
    await ana.shared.share(ana.store.get('nota-1')!, [
      { codigo: USERS['bia'].codigo, papel: 'editor' },
      { codigo: USERS['cris'].codigo, papel: 'leitor' },
    ]);
    TestBed.tick();
    await sync(bia, cris);
    return { ana, bia, cris };
  }

  describe('compartilhar e receber', () => {
    it('a anotação aparece no mural de quem entrou, igual à da dona', async () => {
      const { ana, bia, cris } = await sharedNote();
      expect(bia.store.get('nota-1')?.text).toBe('arroz\nfeijão');
      expect(cris.store.get('nota-1')?.game.name).toBe('Lista do mercado');
      expect(bia.shared.role('nota-1')).toBe('editor');
      expect(cris.shared.readOnly('nota-1')).toBeTrue();
      expect(ana.shared.role('nota-1')).toBe('dono');
    });

    it('sai do mural da nuvem da dona (fica na nuvem à parte), mas vai no arquivo de backup dela', async () => {
      const { ana, bia } = await sharedNote();
      expect(ana.store.snapshot().notas).toEqual([]);
      // marcada como apagada no mural: os outros aparelhos da dona tiram a cópia solta
      expect(ana.store.snapshot().deleted.reviews['nota-1']).toBeDefined();
      expect(ana.store.snapshot('', ana.shared.owned()).notas?.length).toBe(1);
      // a de outra pessoa não vai no backup de quem entrou
      expect(bia.store.snapshot('', bia.shared.owned()).notas).toEqual([]);
      expect(bia.store.hasContent()).toBeFalse();
    });

    it('não grava a compartilhada no armazenamento do mural (só no dela)', async () => {
      const { bia } = await sharedNote();
      expect(bia.data.map.get('mural-de-jogos:anotacoes:v1') ?? '[]').not.toContain('nota-1');
      expect(bia.data.map.get('meu-mural:compartilhadas:v1')).toContain('nota-1');
    });

    it('abre de novo (outro dia, sem rede) com as compartilhadas guardadas', async () => {
      const { bia } = await sharedNote();
      cloud.offline = true;
      const again = person('bia', bia.data);
      expect(again.store.get('nota-1')?.text).toBe('arroz\nfeijão');
    });
  });

  describe('editar junto', () => {
    it('a edição de uma pessoa chega na outra', async () => {
      const { ana, bia } = await sharedNote();
      bia.edit('nota-1', { text: 'arroz\nfeijão\nleite' });
      await sync(bia, ana);
      expect(ana.text('nota-1')).toBe('arroz\nfeijão\nleite');
    });

    it('as duas acrescentam ao mesmo tempo: ficam as duas linhas, nos dois murais', async () => {
      const { ana, bia } = await sharedNote();
      ana.edit('nota-1', { text: 'arroz\nfeijão\nleite' });
      bia.edit('nota-1', { text: 'arroz\nfeijão\novos' });
      await sync(ana, bia, ana);
      expect(ana.text('nota-1')).toBe('arroz\nfeijão\nleite\novos');
      expect(bia.text('nota-1')).toBe('arroz\nfeijão\nleite\novos');
      expect(ana.shared.conflicts()).toEqual([]);
    });

    it('cada uma mexe numa linha: as duas mudanças ficam', async () => {
      const { ana, bia } = await sharedNote('um\ndois\ntrês');
      ana.edit('nota-1', { text: 'UM\ndois\ntrês' });
      bia.edit('nota-1', { text: 'um\ndois\nTRÊS' });
      await sync(ana, bia, ana);
      expect(ana.text('nota-1')).toBe('UM\ndois\nTRÊS');
      expect(bia.text('nota-1')).toBe('UM\ndois\nTRÊS');
    });

    it('uma apaga uma linha e a outra mexe em outra: as duas ficam', async () => {
      const { ana, bia } = await sharedNote('a\nb\nc');
      ana.edit('nota-1', { text: 'a\nc' });
      bia.edit('nota-1', { text: 'a\nb\nC' });
      await sync(ana, bia, ana);
      expect(bia.text('nota-1')).toBe('a\nC');
    });

    it('a mesma linha mudada diferente: conflito, para quem escreve; quem lê continua lendo', async () => {
      const { ana, bia, cris } = await sharedNote('O gato preto.');
      ana.edit('nota-1', { text: 'O gato branco.' });
      bia.edit('nota-1', { text: 'O gato cinza.' });
      await sync(ana, bia, ana, cris);
      const [c] = ana.shared.conflicts();
      expect(c.id).toBe('nota-1');
      expect(c.conflito!.a.text).toBe('O gato branco.');
      expect(c.conflito!.b.text).toBe('O gato cinza.');
      expect(c.conflito!.autorA?.nome).toBe('Ana');
      expect(c.conflito!.autorB?.nome).toBe('Bia');
      expect(bia.shared.conflicts().length).toBe(1);
      expect(cris.shared.conflicts()).toEqual([]);
      expect(cris.text('nota-1')).toBe('O gato branco.');
    });

    it('escolher uma versão tira o conflito de todos', async () => {
      const { ana, bia } = await sharedNote('O gato preto.');
      ana.edit('nota-1', { text: 'O gato branco.' });
      bia.edit('nota-1', { text: 'O gato cinza.' });
      await sync(ana, bia, ana);
      later();
      ana.shared.resolve('nota-1', ana.shared.conflicts()[0].conflito!.b);
      TestBed.tick();
      await sync(ana, bia);
      expect(ana.shared.conflicts()).toEqual([]);
      expect(bia.shared.conflicts()).toEqual([]);
      expect(bia.text('nota-1')).toBe('O gato cinza.');
      expect(ana.text('nota-1')).toBe('O gato cinza.');
    });

    it('duas escolhas ao mesmo tempo: vale a primeira, e a outra pessoa fica sabendo', async () => {
      const { ana, bia } = await sharedNote('O gato preto.');
      ana.edit('nota-1', { text: 'O gato branco.' });
      bia.edit('nota-1', { text: 'O gato cinza.' });
      await sync(ana, bia, ana);
      later();
      ana.shared.resolve('nota-1', ana.shared.conflicts()[0].conflito!.a);
      bia.shared.resolve('nota-1', bia.shared.conflicts()[0].conflito!.b);
      TestBed.tick();
      await sync(ana, bia, ana);
      expect(ana.text('nota-1')).toBe('O gato branco.');
      expect(bia.text('nota-1')).toBe('O gato branco.');
      expect(bia.shared.notice()?.tipo).toBe('escolhido');
      // a escolha que perdeu não some: fica guardada
      expect(bia.store.versions().some((v) => v.ficha.text === 'O gato cinza.')).toBeTrue();
    });

    it('editar com o editor aberto numa versão velha junta com a que chegou por baixo', async () => {
      const { ana, bia } = await sharedNote('um\ndois');
      const opened = bia.store.get('nota-1')!;
      ana.edit('nota-1', { text: 'UM\ndois' });
      await sync(ana, bia);
      later();
      bia.store.update({ ...opened, text: 'um\ndois\ntrês', updatedAt: new Date().toISOString() }, opened);
      TestBed.tick();
      expect(bia.text('nota-1')).toBe('UM\ndois\ntrês');
      await sync(bia, ana);
      expect(ana.text('nota-1')).toBe('UM\ndois\ntrês');
    });

    it('sem rede, a edição espera e sobe quando a conexão volta', async () => {
      const { ana, bia } = await sharedNote();
      cloud.offline = true;
      bia.edit('nota-1', { text: 'sem rede' });
      await sync(bia);
      expect(bia.text('nota-1')).toBe('sem rede');
      cloud.offline = false;
      await sync(bia, ana);
      expect(ana.text('nota-1')).toBe('sem rede');
    });
  });

  describe('os papéis', () => {
    it('quem lê não muda o texto (nada sobe), mas fixa no próprio mural', async () => {
      const { ana, cris } = await sharedNote();
      const before = cloud.puts;
      cris.edit('nota-1', { text: 'mudei' });
      expect(cris.text('nota-1')).toBe('arroz\nfeijão');
      later();
      cris.store.update(withPin(cris.store.get('nota-1')!, true, new Date().toISOString()));
      TestBed.tick();
      await sync(cris, ana);
      expect(cloud.puts).toBe(before);
      expect(cris.store.get('nota-1')?.noteRank).toBe('fixada');
      expect(ana.store.get('nota-1')?.noteRank).toBeUndefined();
    });

    it('fixar é de cada um: não sobe para a nuvem nem fixa no mural dos outros', async () => {
      const { ana, bia } = await sharedNote();
      const before = cloud.puts;
      later();
      bia.store.update(withPin(bia.store.get('nota-1')!, true, new Date().toISOString()));
      TestBed.tick();
      await sync(bia, ana);
      expect(cloud.puts).toBe(before);
      expect(ana.store.get('nota-1')?.noteRank).toBeUndefined();
      expect(bia.store.get('nota-1')?.noteRank).toBe('fixada');
    });

    it('a editora escreve e organiza do jeito dela; quem vê fica como está, e o grupo e as tags da dona também', async () => {
      const { ana, bia } = await sharedNote('a', { category: 'Casa', tags: ['mercado'] });
      bia.edit('nota-1', { text: 'b', category: 'Trabalho', tags: ['outra'], private: true });
      await sync(bia, ana);
      const r = ana.store.get('nota-1')!;
      expect(r.text).toBe('b');
      expect(r.category).toBe('Casa');
      expect(r.tags).toEqual(['mercado']);
      expect(r.private).toBeUndefined();
      const mine = bia.store.get('nota-1')!;
      expect(mine.category).toBe('Trabalho');
      expect(mine.tags).toEqual(['outra']);
      expect(mine.private).toBeUndefined();
    });

    it('a dona muda as tags e o grupo: só no mural dela', async () => {
      const { ana, bia } = await sharedNote('a', { tags: ['mercado'] });
      ana.edit('nota-1', { tags: ['mercado', 'semana'], category: 'Casa' });
      await sync(ana, bia);
      expect(ana.store.get('nota-1')?.tags).toEqual(['mercado', 'semana']);
      expect(bia.store.get('nota-1')?.tags).toBeUndefined();
      expect(bia.store.get('nota-1')?.category).toBe(SHARED_GROUP);
    });

    it('virou leitora com uma edição esperando: a edição fica guardada, a anotação segue a da nuvem', async () => {
      const { ana, bia } = await sharedNote();
      cloud.offline = true;
      bia.edit('nota-1', { text: 'escrevi offline' });
      cloud.offline = false;
      await ana.shared.setRole('nota-1', USERS['bia'].codigo, 'leitor');
      await sync(bia);
      expect(bia.shared.role('nota-1')).toBe('leitor');
      expect(bia.text('nota-1')).toBe('arroz\nfeijão');
      expect(bia.store.versions().some((v) => v.ficha.text === 'escrevi offline')).toBeTrue();
    });
  });

  describe('sair e apagar', () => {
    it('sair tira a anotação do seu mural; quem ficou vê a lista nova', async () => {
      const { ana, bia } = await sharedNote();
      await bia.shared.leave('nota-1');
      TestBed.tick();
      expect(bia.store.get('nota-1')).toBeUndefined();
      await sync(ana);
      expect(ana.shared.get('nota-1')?.membros.map((m) => m.nome)).toEqual(['Cris']);
    });

    it('a dona apaga para todos: some do mural de todo mundo, e quem estava nela fica sabendo', async () => {
      const { ana, bia } = await sharedNote();
      await ana.shared.deleteForAll('nota-1');
      TestBed.tick();
      expect(ana.store.get('nota-1')).toBeUndefined();
      await sync(bia);
      expect(bia.store.get('nota-1')).toBeUndefined();
      expect(bia.shared.notice()?.tipo).toBe('saiu');
    });

    it('apagada com uma edição daqui esperando: a edição fica guardada', async () => {
      const { ana, bia } = await sharedNote();
      cloud.offline = true;
      bia.edit('nota-1', { text: 'quase perdi' });
      cloud.offline = false;
      await ana.shared.deleteForAll('nota-1');
      await sync(bia);
      expect(bia.store.get('nota-1')).toBeUndefined();
      expect(bia.store.versions().some((v) => v.ficha.text === 'quase perdi')).toBeTrue();
    });

    it('o remover do mural não apaga uma compartilhada (sai pela nuvem)', async () => {
      const { bia } = await sharedNote();
      expect(bia.store.remove('nota-1')).toBeUndefined();
      expect(bia.store.get('nota-1')).toBeDefined();
    });
  });

  describe('com o mural de sempre', () => {
    it('outro aparelho da dona com a cópia solta: passa a ser a compartilhada (a mais nova e diferente fica guardada)', async () => {
      const { ana } = await sharedNote('original');
      // o celular da dona ainda tinha a anotação solta, mexida depois sem rede
      const phone = person('ana');
      later();
      phone.store.add(note('nota-1', 'mexida no celular', { updatedAt: new Date().toISOString() }));
      TestBed.tick();
      await sync(phone);
      expect(phone.shared.role('nota-1')).toBe('dono');
      expect(phone.text('nota-1')).toBe('original');
      expect(phone.store.snapshot().notas).toEqual([]);
      expect(phone.store.versions().some((v) => v.ficha.text === 'mexida no celular')).toBeTrue();
      void ana;
    });

    it('uma anotação daqui com o id de uma compartilhada de outra pessoa ganha outro id (as duas ficam)', async () => {
      const { bia } = await sharedNote('da Ana');
      const outra = person('bia');
      outra.store.add(note('nota-1', 'da Bia, de um backup antigo'));
      TestBed.tick();
      await sync(outra);
      expect(outra.text('nota-1')).toBe('da Ana');
      expect(outra.store.reviews().some((r) => r.id !== 'nota-1' && r.text === 'da Bia, de um backup antigo')).toBeTrue();
      void bia;
    });

    it('juntar um backup não troca nem apaga a compartilhada (uma versão diferente e mais nova fica guardada)', async () => {
      const { bia } = await sharedNote('compartilhada');
      later();
      const backup = {
        app: 'meu-mural',
        version: 2,
        reviews: [],
        notas: [sharedContent(note('nota-1', 'do backup', { updatedAt: new Date().toISOString() }))],
        drafts: [],
        wishes: [],
        deleted: { reviews: { 'nota-1': new Date().toISOString() }, drafts: {}, wishes: {} },
      };
      bia.store.importJson(JSON.stringify(backup), 'merge');
      TestBed.tick();
      expect(bia.text('nota-1')).toBe('compartilhada');
      expect(bia.store.versions().some((v) => v.ficha.text === 'do backup')).toBeTrue();
      bia.store.importJson(JSON.stringify(backup), 'replace');
      TestBed.tick();
      expect(bia.text('nota-1')).toBe('compartilhada');
    });

    it('sair da conta esconde as compartilhadas (elas ficam guardadas para quando voltar)', async () => {
      const { bia } = await sharedNote();
      bia.account.forget();
      TestBed.tick();
      expect(bia.store.get('nota-1')).toBeUndefined();
      expect(bia.data.map.get('meu-mural:compartilhadas:v1')).toContain('nota-1');
    });
  });

  describe('o mural que os outros veem', () => {
    it('a privada não vai no mural público de ninguém (nem o título, nem a lista das fichas à mostra)', async () => {
      const { ana, bia } = await sharedNote('a', { private: true });
      await ana.mural.syncNow();
      await bia.mural.syncNow();
      for (const id of [USERS['ana'].id, USERS['bia'].id]) {
        const m = cloud.murals.get(id)!;
        expect(m.publico.notas).toEqual([]);
        expect(m.fichas).not.toContain('nota-1');
      }
    });

    it('a pública aparece no mural de todos que estão nela; no dos outros, dizendo de quem é, e só a dona avisa quem segue', async () => {
      const { ana, bia } = await sharedNote('a', { private: undefined, publishedAt: undefined });
      later();
      await ana.mural.syncNow();
      await bia.mural.syncNow();
      const delas = cloud.murals.get(USERS['ana'].id)!;
      const dela = cloud.murals.get(USERS['bia'].id)!;
      expect(delas.publico.notas.map((n) => n['id'])).toEqual(['nota-1']);
      expect(delas.publico.notas[0]['sharedBy']).toBeUndefined();
      expect(dela.publico.notas[0]['sharedBy']).toEqual({ codigo: USERS['ana'].codigo, nome: 'Ana' });
      expect(dela.fichas).toContain('nota-1');
      expect(delas.novas.map((n) => n.ref)).toContain('nota-1');
      expect(dela.novas.map((n) => n.ref)).not.toContain('nota-1');
    });

    it('tornar privada pede um envio novo do mural, e ela sai do público', async () => {
      const { ana } = await sharedNote('a', { private: undefined });
      await ana.mural.syncNow();
      expect(cloud.murals.get(USERS['ana'].id)!.publico.notas.length).toBe(1);
      ana.edit('nota-1', { private: true });
      await ana.mural.syncNow();
      expect(cloud.murals.get(USERS['ana'].id)!.publico.notas).toEqual([]);
    });
  });

  describe('mais cenários de sincronização', () => {
    it('a mesma pessoa em dois aparelhos: o celular sem rede e o computador mexem em linhas diferentes, e tudo junta', async () => {
      const { ana, bia } = await sharedNote('um\ndois\ntrês');
      const phone = person('bia');
      await sync(phone);
      expect(phone.text('nota-1')).toBe('um\ndois\ntrês');
      cloud.offline = true;
      phone.edit('nota-1', { text: 'UM\ndois\ntrês' });
      await sync(phone);
      cloud.offline = false;
      bia.edit('nota-1', { text: 'um\ndois\nTRÊS' });
      await sync(bia);
      await sync(phone, bia, ana);
      for (const p of [ana, bia, phone]) expect(p.text('nota-1')).toBe('UM\ndois\nTRÊS');
      expect(bia.shared.conflicts()).toEqual([]);
    });

    it('três pessoas escrevendo ao mesmo tempo em linhas diferentes: as três mudanças ficam para todas', async () => {
      const { ana, bia, cris } = await sharedNote('um\ndois\ntrês');
      await ana.shared.setRole('nota-1', USERS['cris'].codigo, 'editor');
      await sync(cris);
      ana.edit('nota-1', { text: 'UM\ndois\ntrês' });
      bia.edit('nota-1', { text: 'um\nDOIS\ntrês' });
      cris.edit('nota-1', { text: 'um\ndois\nTRÊS\nquatro' });
      await sync(cris, bia, ana);
      for (const p of [ana, bia, cris]) {
        expect(p.text('nota-1')).toBe('UM\nDOIS\nTRÊS\nquatro');
        expect(p.shared.conflicts()).toEqual([]);
      }
    });

    it('sem rede, a mesma linha mudada pelas duas: ao voltar, conflito; a escolha da Bia vale para todas', async () => {
      const { ana, bia } = await sharedNote('O gato preto.');
      cloud.offline = true;
      bia.edit('nota-1', { text: 'O gato cinza.' });
      await sync(bia);
      cloud.offline = false;
      ana.edit('nota-1', { text: 'O gato branco.' });
      await sync(ana);
      await sync(bia, ana);
      expect(bia.shared.conflicts().length).toBe(1);
      later();
      bia.shared.resolve('nota-1', bia.shared.conflicts()[0].conflito!.b);
      TestBed.tick();
      await sync(bia, ana);
      for (const p of [ana, bia]) {
        expect(p.text('nota-1')).toBe('O gato cinza.');
        expect(p.shared.conflicts()).toEqual([]);
      }
    });

    it('escolher uma versão do conflito não desfaz o que alguém escreveu depois dele', async () => {
      const { ana, bia, cris } = await sharedNote('O gato preto.\n\nlista:');
      await ana.shared.setRole('nota-1', USERS['cris'].codigo, 'editor');
      await sync(cris);
      ana.edit('nota-1', { text: 'O gato branco.\n\nlista:' });
      bia.edit('nota-1', { text: 'O gato cinza.\n\nlista:' });
      await sync(ana, bia, ana, cris);
      expect(cris.shared.conflicts().length).toBe(1);
      // depois do conflito, a Cris acrescenta uma linha (sem escolher nada)
      cris.edit('nota-1', { text: `${cris.text('nota-1')}\n- leite` });
      await sync(cris, ana);
      expect(ana.shared.conflicts().length).toBe(1);
      later();
      ana.shared.resolve('nota-1', ana.shared.conflicts()[0].conflito!.b);
      TestBed.tick();
      await sync(ana, bia, cris);
      for (const p of [ana, bia, cris]) {
        expect(p.text('nota-1')).toBe('O gato cinza.\n\nlista:\n- leite');
        expect(p.shared.conflicts()).toEqual([]);
      }
    });

    it('escolher a versão que já estava valendo também guarda o que veio depois', async () => {
      const { ana, bia } = await sharedNote('O gato preto.\nfim');
      ana.edit('nota-1', { text: 'O gato branco.\nfim' });
      bia.edit('nota-1', { text: 'O gato cinza.\nfim' });
      await sync(ana, bia, ana);
      bia.edit('nota-1', { text: 'O gato branco.\nFIM' });
      await sync(bia, ana);
      later();
      ana.shared.resolve('nota-1', ana.shared.conflicts()[0].conflito!.a);
      TestBed.tick();
      await sync(ana, bia);
      for (const p of [ana, bia]) expect(p.text('nota-1')).toBe('O gato branco.\nFIM');
    });

    it('escolher sem rede enquanto a outra escreve em outra linha: ao voltar, a escolha e a linha nova ficam', async () => {
      const { ana, bia } = await sharedNote('O gato preto.\nfim');
      ana.edit('nota-1', { text: 'O gato branco.\nfim' });
      bia.edit('nota-1', { text: 'O gato cinza.\nfim' });
      await sync(ana, bia, ana);
      cloud.offline = true;
      later();
      bia.shared.resolve('nota-1', bia.shared.conflicts()[0].conflito!.b);
      TestBed.tick();
      await sync(bia);
      cloud.offline = false;
      ana.edit('nota-1', { text: 'O gato branco.\nfim\nnovo' });
      await sync(ana);
      await sync(bia, ana);
      for (const p of [ana, bia]) {
        expect(p.text('nota-1')).toBe('O gato cinza.\nfim\nnovo');
        expect(p.shared.conflicts()).toEqual([]);
      }
    });

    it('a editora escolhe a versão da gestora (privada) depois de a dona mudar o título: a escolha entra sem a nuvem recusar', async () => {
      const { ana, bia, cris } = await sharedNote('O gato preto.', { category: 'Casa' });
      await ana.shared.setRole('nota-1', USERS['cris'].codigo, 'gestor');
      await sync(cris);
      ana.edit('nota-1', { text: 'O gato branco.', quiet: true });
      cris.edit('nota-1', { text: 'O gato cinza.', private: true });
      await sync(ana, cris, ana, bia);
      expect(bia.shared.conflicts().length).toBe(1);
      ana.edit('nota-1', { game: { ...ana.store.get('nota-1')!.game, name: 'Bichos' } });
      await sync(ana, bia);
      later();
      const c = bia.shared.conflicts()[0].conflito!;
      bia.shared.resolve('nota-1', c.b.private ? c.b : c.a);
      TestBed.tick();
      await sync(bia, ana, cris);
      for (const p of [ana, bia, cris]) {
        expect(p.shared.conflicts()).toEqual([]);
        expect(p.text('nota-1')).toBe('O gato cinza.');
        expect(p.store.get('nota-1')!.private).toBeTrue();
        expect(p.store.get('nota-1')!.game.name).toBe('Bichos');
      }
      // e cada uma continua no próprio grupo
      expect(ana.store.get('nota-1')!.category).toBe('Casa');
      expect(bia.store.get('nota-1')!.category).toBe(SHARED_GROUP);
      expect(bia.store.versions().length).toBe(0);
    });

    it('sair com uma edição que ainda não subiu: a edição fica guardada', async () => {
      const { ana, bia } = await sharedNote();
      cloud.offline = true;
      bia.edit('nota-1', { text: 'ia mandar depois' });
      cloud.offline = false;
      await bia.shared.leave('nota-1');
      TestBed.tick();
      expect(bia.store.get('nota-1')).toBeUndefined();
      expect(bia.store.versions().some((v) => v.ficha.text === 'ia mandar depois')).toBeTrue();
      await sync(ana);
      expect(ana.text('nota-1')).toBe('arroz\nfeijão');
    });

    it('tirada pela dona enquanto escrevia sem rede: a edição fica guardada e ela fica sabendo', async () => {
      const { ana, bia } = await sharedNote();
      cloud.offline = true;
      bia.edit('nota-1', { text: 'escrevendo no avião' });
      cloud.offline = false;
      await ana.shared.removeMember('nota-1', USERS['bia'].codigo);
      await sync(bia);
      expect(bia.store.get('nota-1')).toBeUndefined();
      expect(bia.shared.notice()?.tipo).toBe('saiu');
      expect(bia.store.versions().some((v) => v.ficha.text === 'escrevendo no avião')).toBeTrue();
    });

    it('saiu e foi posta de novo: a anotação volta como está agora', async () => {
      const { ana, bia } = await sharedNote();
      await bia.shared.leave('nota-1');
      ana.edit('nota-1', { text: 'mudou enquanto ela estava fora' });
      await sync(ana);
      await ana.shared.setRole('nota-1', USERS['bia'].codigo, 'editor');
      await sync(bia);
      expect(bia.text('nota-1')).toBe('mudou enquanto ela estava fora');
      expect(bia.shared.role('nota-1')).toBe('editor');
    });

    it('a dona muda o grupo enquanto a editora escreve: o texto junta, e o grupo de cada uma fica o dela', async () => {
      const { ana, bia } = await sharedNote('um', { category: 'Casa' });
      ana.edit('nota-1', { category: 'Mercado' });
      bia.edit('nota-1', { text: 'um\ndois' });
      await sync(ana, bia, ana);
      for (const p of [ana, bia]) expect(p.text('nota-1')).toBe('um\ndois');
      expect(ana.store.get('nota-1')!.category).toBe('Mercado');
      expect(bia.store.get('nota-1')!.category).toBe(SHARED_GROUP);
      bia.edit('nota-1', { text: 'um\ndois\ntrês', category: 'Casa' });
      await sync(bia, ana);
      expect(ana.store.get('nota-1')!.category).toBe('Mercado');
      expect(bia.store.get('nota-1')!.category).toBe('Casa');
      expect(ana.text('nota-1')).toBe('um\ndois\ntrês');
    });

    it('a dona e a gestora mexem nas tags ao mesmo tempo: cada uma fica com as suas, e nada brigou', async () => {
      const { ana, bia } = await sharedNote('a', { tags: ['mercado', 'semana'] });
      await ana.shared.setRole('nota-1', USERS['bia'].codigo, 'gestor');
      await sync(bia);
      ana.edit('nota-1', { tags: ['mercado', 'semana', 'urgente'] });
      bia.edit('nota-1', { tags: ['mercado', 'feira'] });
      await sync(ana, bia, ana);
      expect(ana.store.get('nota-1')!.tags).toEqual(['mercado', 'semana', 'urgente']);
      expect(bia.store.get('nota-1')!.tags).toEqual(['mercado', 'feira']);
      expect(ana.shared.conflicts()).toEqual([]);
      expect(bia.shared.conflicts()).toEqual([]);
    });

    it('duas gravações seguidas da mesma pessoa (a nuvem pede para esperar 1 s): nada se perde, e sobe depois', async () => {
      const { ana, bia } = await sharedNote('um');
      cloud.strict = true;
      bia.edit('nota-1', { text: 'um\ndois' });
      await sync(bia);
      // logo em seguida (no mesmo segundo), outra edição
      const r = bia.store.get('nota-1')!;
      bia.store.update({ ...r, text: 'um\ndois\ntrês', updatedAt: new Date(Date.now() + 1).toISOString() });
      TestBed.tick();
      await bia.shared.sync();
      expect(bia.text('nota-1')).toBe('um\ndois\ntrês');
      later();
      await sync(bia, ana);
      expect(ana.text('nota-1')).toBe('um\ndois\ntrês');
    });

    it('fixar uma compartilhada num aparelho fixa nos outros aparelhos da mesma pessoa (e só nos dela)', async () => {
      const { ana, bia } = await sharedNote();
      await bia.mural.syncNow();
      const phone = person('bia');
      later();
      bia.store.update(withPin(bia.store.get('nota-1')!, true, new Date().toISOString()));
      TestBed.tick();
      await bia.mural.syncNow();
      // no celular, a anotação chega depois do mural (ou antes): fica fixada do mesmo jeito
      await phone.mural.syncNow();
      await sync(phone);
      expect(phone.store.get('nota-1')?.noteRank).toBe('fixada');
      expect(ana.store.get('nota-1')?.noteRank).toBeUndefined();
      // soltar no celular solta no computador
      later();
      phone.store.update(withPin(phone.store.get('nota-1')!, false, new Date().toISOString()));
      TestBed.tick();
      await phone.mural.syncNow();
      await bia.mural.syncNow();
      TestBed.tick();
      expect(bia.store.get('nota-1')?.noteRank).toBeUndefined();
      // nada disso foi para a anotação na nuvem
      expect(cloud.notes.get('nota-1')!.dados['noteRank']).toBeUndefined();
    });

    it('o lugar escolhido em outro aparelho vale para a compartilhada que chega depois', async () => {
      const { bia } = await sharedNote();
      later();
      bia.store.update(withPin(bia.store.get('nota-1')!, true, new Date().toISOString()));
      TestBed.tick();
      await bia.mural.syncNow();
      const phone = person('bia');
      await phone.mural.syncNow();
      expect(phone.store.get('nota-1')).toBeUndefined();
      await sync(phone);
      expect(phone.store.get('nota-1')?.noteRank).toBe('fixada');
      // o celular manda uma vez (a compartilhada pública passa a ir no mural público dele); depois, nada
      await phone.mural.syncNow();
      await bia.mural.syncNow();
      const before = [...cloud.privados.values()].map((x) => x.rev).join();
      await phone.mural.syncNow();
      await bia.mural.syncNow();
      expect([...cloud.privados.values()].map((x) => x.rev).join()).toBe(before);
    });

    it('a dona apaga para todos com a leitora tendo fixado: some, e ela fica sabendo', async () => {
      const { ana, cris } = await sharedNote();
      later();
      cris.store.update(withPin(cris.store.get('nota-1')!, true, new Date().toISOString()));
      TestBed.tick();
      await ana.shared.deleteForAll('nota-1');
      await sync(cris);
      expect(cris.store.get('nota-1')).toBeUndefined();
      expect(cris.shared.notice()?.tipo).toBe('saiu');
    });

    describe('no Kanban', () => {
      it('a editora leva a compartilhada para Feito: ela finaliza para todas', async () => {
        const { ana, bia } = await sharedNote('a', { category: 'Casa' });
        const board = bia.kanban.boardFor(SHARED_GROUP);
        bia.actions.move(board.id, 'nota-1', board.columns[2].id);
        TestBed.tick();
        expect(isDone(bia.store.get('nota-1')!)).toBeTrue();
        await sync(bia, ana);
        expect(isDone(ana.store.get('nota-1')!)).toBeTrue();
      });

      it('a leitora leva a compartilhada para Feito: o quadro é dela, mas a anotação não finaliza (e o bilhete não diz que finalizou)', async () => {
        const { ana, cris } = await sharedNote('a', { category: 'Casa' });
        const board = cris.kanban.boardFor(SHARED_GROUP);
        spyOn(cris.toasts, 'show').and.callThrough();
        cris.actions.move(board.id, 'nota-1', board.columns[2].id);
        TestBed.tick();
        expect(cris.kanban.boardFor(SHARED_GROUP).cards.map((c) => c.note)).toEqual(['nota-1']);
        expect(isDone(cris.store.get('nota-1')!)).toBeFalse();
        expect(cris.toasts.show).not.toHaveBeenCalled();
        await sync(cris, ana);
        expect(isDone(ana.store.get('nota-1')!)).toBeFalse();
      });

      it('a dona muda o grupo: a anotação continua no quadro da leitora', async () => {
        const { ana, cris } = await sharedNote('a', { category: 'Casa' });
        const board = cris.kanban.boardFor(SHARED_GROUP);
        cris.actions.move(board.id, 'nota-1', board.columns[0].id);
        ana.edit('nota-1', { category: 'Trabalho' });
        await sync(ana, cris);
        expect(cris.kanban.live(cris.kanban.boardFor(SHARED_GROUP)).map((c) => c.note)).toEqual(['nota-1']);
        expect(cris.store.get('nota-1')!.category).toBe(SHARED_GROUP);
      });

      it('a leitora leva a compartilhada para o próprio grupo: ela vai para o quadro dele, e nada sobe', async () => {
        const { ana, cris } = await sharedNote('a', { category: 'Casa' });
        cris.edit('nota-1', { category: 'Mercado', subject: 'Feira', tags: ['sábado'] });
        await sync(cris, ana);
        expect(cris.store.get('nota-1')).toEqual(jasmine.objectContaining({ category: 'Mercado', subject: 'Feira', tags: ['sábado'] }));
        expect(ana.store.get('nota-1')!.category).toBe('Casa');
        expect(cloud.notes.get('nota-1')!.rev).toBe(1);
        const board = cris.kanban.boardFor('Mercado');
        cris.actions.move(board.id, 'nota-1', board.columns[0].id);
        TestBed.tick();
        expect(cris.kanban.live(cris.kanban.boardFor('Mercado')).map((c) => c.note)).toEqual(['nota-1']);
      });
    });
  });

  describe('o grupo, o assunto e as tags são de cada um', () => {
    it('quem recebe acha a anotação no grupo Compartilhadas, com o desenho de duas pessoas; a dona, no grupo dela', async () => {
      const { ana, bia, cris } = await sharedNote('a', { category: 'Casa', subject: 'Feira', tags: ['mercado'] });
      expect(ana.store.get('nota-1')).toEqual(jasmine.objectContaining({ category: 'Casa', subject: 'Feira', tags: ['mercado'] }));
      for (const p of [bia, cris]) {
        const r = p.store.get('nota-1')!;
        expect(r.category).toBe(SHARED_GROUP);
        expect(r.subject).toBeUndefined();
        expect(r.tags).toBeUndefined();
      }
      // o desenho de duas pessoas é o de sempre do grupo: nada vai para os ajustes
      expect(categoryIcon(SHARED_GROUP)).toBe(ICON.pessoas);
      for (const p of [ana, bia, cris]) expect(p.settings.categoryLooksAt()).toBe('');
    });

    it('o desenho que a pessoa já escolheu para Compartilhadas fica', async () => {
      const ana = person('ana');
      const bia = person('bia');
      bia.settings.setCategoryLook(SHARED_GROUP, { icon: 'coracao', color: 'rosa' });
      ana.store.add(note('nota-1', 'a'));
      TestBed.tick();
      await ana.shared.share(ana.store.get('nota-1')!, [{ codigo: USERS['bia'].codigo, papel: 'editor' }]);
      await sync(bia);
      expect(bia.store.get('nota-1')!.category).toBe(SHARED_GROUP);
      expect(bia.settings.categoryLook(SHARED_GROUP)).toEqual({ icon: 'coracao', color: 'rosa' });
      expect(categoryIcon(SHARED_GROUP, bia.settings.categoryLook(SHARED_GROUP))).toBe(ICON_CHOICE['coracao']);
    });

    it('o grupo, o assunto, as tags e a fixada nunca vão para a anotação na nuvem', async () => {
      const { ana, bia, cris } = await sharedNote('a', { category: 'Casa', subject: 'Feira', tags: ['mercado'] });
      bia.edit('nota-1', { text: 'b', category: 'Trabalho', tags: ['x'] });
      ana.edit('nota-1', { text: 'c', tags: ['y'], noteRank: 'fixada' });
      cris.edit('nota-1', { category: 'Leitura' });
      await sync(ana, bia, cris, ana);
      expect(cloud.leaks).toBe(0);
      expect(cloud.notes.get('nota-1')!.dados['text']).toBeDefined();
    });

    it('o grupo escolhido num aparelho vai para os outros aparelhos da mesma pessoa (e só para os dela)', async () => {
      const { ana, bia } = await sharedNote('a', { category: 'Casa' });
      await bia.mural.syncNow();
      const phone = person('bia');
      await phone.mural.syncNow();
      await sync(phone);
      expect(phone.store.get('nota-1')!.category).toBe(SHARED_GROUP);
      bia.edit('nota-1', { category: 'Trabalho', subject: 'Reunião', tags: ['daily'] });
      await bia.mural.syncNow();
      await phone.mural.syncNow();
      TestBed.tick();
      expect(phone.store.get('nota-1')).toEqual(jasmine.objectContaining({ category: 'Trabalho', subject: 'Reunião', tags: ['daily'] }));
      expect(ana.store.get('nota-1')!.category).toBe('Casa');
      // fixar no celular não desfaz o grupo
      later();
      phone.store.update(withPin(phone.store.get('nota-1')!, true, new Date().toISOString()));
      TestBed.tick();
      await phone.mural.syncNow();
      await bia.mural.syncNow();
      TestBed.tick();
      expect(bia.store.get('nota-1')).toEqual(jasmine.objectContaining({ category: 'Trabalho', noteRank: 'fixada' }));
    });

    it('a anotação guardada antes (com o grupo no conteúdo) fica onde estava, e o lugar vai para os outros aparelhos', async () => {
      const { bia } = await sharedNote('a', { category: 'Casa' });
      // como um aparelho de antes guardava: o grupo e as tags no conteúdo, e o lugar só com a fixada
      const raw = JSON.parse(bia.data.getItem('meu-mural:compartilhadas:v1')!);
      const [entry] = raw.contas['u-bia'];
      entry.base = { ...entry.base, category: 'Mercado', subject: 'Feira', tags: ['sábado'] };
      entry.pessoal = { noteRank: 'fixada' };
      raw.lugares = {};
      const data = new MemoryData();
      data.setItem('meu-mural:compartilhadas:v1', JSON.stringify(raw));
      const old = person('bia', data);
      expect(old.store.get('nota-1')).toEqual(jasmine.objectContaining({ category: 'Mercado', subject: 'Feira', tags: ['sábado'], noteRank: 'fixada' }));
      expect(old.shared.places().get('nota-1')?.p).toEqual(jasmine.objectContaining({ category: 'Mercado', org: true }));
      // e o conteúdo guardado de novo já vem sem eles
      const again = JSON.parse(data.getItem('meu-mural:compartilhadas:v1')!).contas['u-bia'][0];
      expect(again.base.category).toBeUndefined();
      expect(again.pessoal.org).toBeTrue();
    });

    it('um lugar de um site de antes (só a fixada) não tira a anotação do grupo', async () => {
      const { bia } = await sharedNote('a');
      bia.edit('nota-1', { category: 'Trabalho' });
      later();
      bia.shared.mergePlaces(new Map([['nota-1', { p: { noteRank: 'fixada' }, em: new Date().toISOString() }]]));
      TestBed.tick();
      expect(bia.store.get('nota-1')).toEqual(jasmine.objectContaining({ category: 'Trabalho', noteRank: 'fixada' }));
    });

    /** Como um aparelho de antes guardava a anotação: o grupo no conteúdo, e o lugar só com a fixada. */
    function oldDevice(from: MemoryData, account: string, category: string, keepPlaces = false): MemoryData {
      const raw = JSON.parse(from.getItem('meu-mural:compartilhadas:v1')!);
      const [entry] = raw.contas[account];
      entry.base = { ...entry.base, category };
      entry.pessoal = {};
      if (!keepPlaces) raw.lugares = {};
      const data = new MemoryData();
      data.setItem('meu-mural:compartilhadas:v1', JSON.stringify(raw));
      return data;
    }

    it('o aparelho fechado desde antes do grupo ser de cada um não desfaz, ao abrir, o grupo escolhido depois em outro', async () => {
      const ana = person('ana');
      ana.store.add(note('nota-1', 'a', { category: 'Pessoal' }));
      TestBed.tick();
      await ana.shared.share(ana.store.get('nota-1')!, [{ codigo: USERS['bia'].codigo, papel: 'editor' }]);
      TestBed.tick();
      // o celular parou aqui, com o site de antes: a anotação no grupo Pessoal
      const phoneData = oldDevice(ana.data, 'u-ana', 'Pessoal');
      // no computador, ela vai para Compras
      ana.edit('nota-1', { category: 'Compras' });
      await ana.mural.syncNow();
      // dias depois, o celular abre com o site novo
      later();
      const phone = person('ana', phoneData);
      await phone.mural.syncNow();
      TestBed.tick();
      expect(phone.store.get('nota-1')!.category).toBe('Compras');
      await ana.mural.syncNow();
      TestBed.tick();
      expect(ana.store.get('nota-1')!.category).toBe('Compras');
    });

    it('a anotação guardada antes não passa por cima do lugar mais novo guardado no mesmo aparelho', async () => {
      const { bia } = await sharedNote('a');
      bia.edit('nota-1', { category: 'Trabalho' });
      // uma aba com o site de antes, ainda aberta, gravou a anotação como gravava (com o grupo de antes)
      const again = person('bia', oldDevice(bia.data, 'u-bia', 'Casa', true));
      expect(again.store.get('nota-1')!.category).toBe('Trabalho');
      expect(again.shared.places().get('nota-1')!.p.category).toBe('Trabalho');
    });

    it('no aparelho novo de quem recebeu, a anotação que chega antes do mural não volta para Compartilhadas', async () => {
      const { bia } = await sharedNote('a', { category: 'Casa' });
      bia.edit('nota-1', { category: 'Trabalho' });
      await bia.mural.syncNow();
      later();
      const phone = person('bia');
      // as compartilhadas baixam antes do mural privado (onde está o grupo escolhido no computador)
      await sync(phone);
      expect(phone.store.get('nota-1')!.category).toBe(SHARED_GROUP);
      await phone.mural.syncNow();
      TestBed.tick();
      expect(phone.store.get('nota-1')!.category).toBe('Trabalho');
      await bia.mural.syncNow();
      TestBed.tick();
      expect(bia.store.get('nota-1')!.category).toBe('Trabalho');
    });

    it('o lugar de um site de antes (só a fixada) fica com o grupo guardado, e um aparelho novo acha a anotação nele', async () => {
      const { bia } = await sharedNote('a');
      bia.edit('nota-1', { category: 'Trabalho' });
      later();
      bia.shared.mergePlaces(new Map([['nota-1', { p: { noteRank: 'fixada' }, em: new Date().toISOString() }]]));
      TestBed.tick();
      expect(bia.shared.places().get('nota-1')!.p).toEqual(jasmine.objectContaining({ category: 'Trabalho', noteRank: 'fixada', org: true }));
      await bia.mural.syncNow();
      const phone = person('bia');
      await phone.mural.syncNow();
      await sync(phone);
      expect(phone.store.get('nota-1')).toEqual(jasmine.objectContaining({ category: 'Trabalho', noteRank: 'fixada' }));
    });

    it('no aparelho novo, a anotação que chega antes do mural não apaga o desenho e a cor que a pessoa deu aos grupos', async () => {
      const { bia } = await sharedNote('a');
      bia.settings.setCategoryLook('Trabalho', { icon: 'maleta', color: 'azul' });
      await bia.mural.syncNow();
      later();
      const phone = person('bia');
      await sync(phone);
      await phone.mural.syncNow();
      TestBed.tick();
      expect(phone.settings.categoryLook('Trabalho')).toEqual({ icon: 'maleta', color: 'azul' });
      await bia.mural.syncNow();
      TestBed.tick();
      expect(bia.settings.categoryLook('Trabalho')).toEqual({ icon: 'maleta', color: 'azul' });
    });

    it('uma resposta estranha da lista (um wi-fi que devolve uma página) não tira as compartilhadas nem o lugar delas', async () => {
      const { ana, bia } = await sharedNote('a', { category: 'Casa' });
      bia.edit('nota-1', { category: 'Trabalho' });
      cloud.brokenList = true;
      await sync(ana, bia);
      cloud.brokenList = false;
      expect(ana.store.get('nota-1')!.category).toBe('Casa');
      expect(bia.store.get('nota-1')!.category).toBe('Trabalho');
      expect(bia.shared.places().get('nota-1')!.p.category).toBe('Trabalho');
      await sync(ana, bia);
      expect(bia.store.get('nota-1')!.category).toBe('Trabalho');
    });

    it('quem já estava numa anotação e abre num aparelho novo (o lugar de antes, sem o grupo) fica no grupo de antes', async () => {
      const { ana } = await sharedNote('a');
      // a nota gravada antes, com o grupo da dona no conteúdo
      cloud.notes.get('nota-1')!.dados['category'] = 'Casa';
      cloud.notes.get('nota-1')!.versao++;
      const phone = person('bia');
      phone.shared.mergePlaces(new Map([['nota-1', { p: { noteRank: 'fixada' }, em: new Date().toISOString() }]]));
      await sync(phone);
      expect(phone.store.get('nota-1')).toEqual(jasmine.objectContaining({ category: 'Casa', noteRank: 'fixada' }));
      void ana;
    });
  });

  describe('mergeNote (os campos da anotação)', () => {
    const base = note('nota-x', 'texto', { category: 'Casa', tags: ['a', 'b'] });

    it('o título e a capa: muda o que um mexeu; os dois mexendo diferente, conflito', () => {
      const a = { ...base, game: { ...base.game, name: 'Novo título' } };
      const b = { ...base, game: { ...base.game, coverUrl: 'https://capa.teste/x.jpg' } };
      const m = mergeNote(base, a, b);
      expect(m.other).toBeNull();
      expect(m.merged.game.name).toBe('Novo título');
      expect(m.merged.game.coverUrl).toBe('https://capa.teste/x.jpg');
      const c = { ...base, game: { ...base.game, name: 'Outro título' } };
      const k = mergeNote(base, a, c);
      expect(k.parts).toEqual(['titulo']);
      expect(k.merged.game.name).toBe('Novo título');
      expect(k.other!.game.name).toBe('Outro título');
    });

    it('o grupo, o assunto e as tags nunca entram na junção: são de cada um', () => {
      const m = mergeNote(base, { ...base, category: 'X', tags: ['a'] }, { ...base, category: 'Y', subject: 'Z', tags: ['d'] });
      expect(m.parts).toEqual([]);
      expect(m.merged.category).toBeUndefined();
      expect(m.merged.subject).toBeUndefined();
      expect(m.merged.tags).toBeUndefined();
      expect(Object.keys(sharedContent(base))).not.toContain('category');
      expect(Object.keys(sharedContent(base))).not.toContain('tags');
    });

    it('finalizar: os dois finalizaram, fica a primeira data; um abriu de novo, vale o que mudou', () => {
      const a = { ...base, doneAt: '2026-10-16T13:00:00.000Z' };
      const b = { ...base, doneAt: '2026-10-16T12:00:00.000Z' };
      expect(mergeNote(base, a, b).merged.doneAt).toBe('2026-10-16T12:00:00.000Z');
      const done = { ...base, doneAt: '2026-10-16T12:00:00.000Z' };
      const { doneAt: _x, ...open } = done;
      expect(mergeNote(done, open as Review, { ...done, text: 'mais' }).merged.doneAt).toBeUndefined();
    });

    it('a aparência: cores e papéis diferentes juntam; a mesma coisa mudada diferente, conflito', () => {
      const a = { ...base, stock: 'azul' as const };
      const b = { ...base, paper: 'canson' as Review['paper'] };
      const m = mergeNote(base, a, b);
      expect(m.merged.stock).toBe('azul');
      expect(m.merged.paper).toBe(b.paper);
      expect(mergeNote(base, a, { ...base, stock: 'rosa' }).parts).toEqual(['aparencia']);
    });

    it('quem vê: atômico', () => {
      expect(mergeNote(base, { ...base, private: true }, { ...base, quiet: true }).parts).toEqual(['publico']);
      expect(mergeNote(base, { ...base, private: true }, base).merged.private).toBeTrue();
    });

    it('o lugar no mural (fixada) nunca entra na junção', () => {
      const m = mergeNote(base, { ...base, noteRank: 'fixada' }, base);
      expect(m.merged.noteRank).toBeUndefined();
    });

    it('a mais nova das duas dá a hora da junção', () => {
      const a = { ...base, text: 'x\ntexto', updatedAt: '2026-10-16T15:00:00.000Z' };
      const b = { ...base, text: 'texto\ny', updatedAt: '2026-10-16T14:00:00.000Z' };
      expect(mergeNote(base, a, b).merged.updatedAt).toBe('2026-10-16T15:00:00.000Z');
    });
  });
});
