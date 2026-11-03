import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from './cloud-config';
import { CLOUD_COLLEAGUE_PREFIX, CloudMurals } from './cloud-murals';
import { Colleague, ColleagueStore } from './colleague-store';

/**
 * A escolha do Comparar enquanto os murais vêm da nuvem: atualizar por trás (o refresh do Comparar e
 * do mural da pessoa) e buscar para o correio e o perfil (ensure) nunca trocam quem está escolhido,
 * nem a escolha que a pessoa fez enquanto o mural vinha; só abrir (o código digitado, um amigo da
 * lista, o link) escolhe.
 */

@Component({ template: '' })
class Blank {}

async function gz(doc: unknown): Promise<ArrayBuffer> {
  const stream = new Blob([JSON.stringify(doc)]).stream().pipeThrough(new CompressionStream('gzip'));
  return new Response(stream).arrayBuffer();
}

const review = (id: string, name: string) => ({
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
});

const MARINA = 'K7QF-M2XA';
const CARLA = 'Q1W2-E3R4';
const JOAO = 'A1B2-C3D4';
const idOf = (code: string) => CLOUD_COLLEAGUE_PREFIX + code.replace('-', '');
const muralOf = (name: string, ...reviews: ReturnType<typeof review>[]) => ({ app: 'meu-mural', version: 2, owner: { name }, reviews });

describe('murais dos amigos pela nuvem: a escolha do Comparar não muda por trás', () => {
  let murals: CloudMurals;
  let colleagues: ColleagueStore;
  let published: Map<string, { rev: number; doc: unknown }>;
  /** As respostas da nuvem esperam aqui, por código, até o teste soltar. */
  let gates: Map<string, Promise<void>>;
  /** Os códigos que já foram pedidos à nuvem. */
  let asked: string[];

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase('meu-mural:colegas');
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
    localStorage.clear();
    gates = new Map();
    asked = [];
    published = new Map([
      [MARINA, { rev: 3, doc: muralOf('Marina', review('rmar01', 'Celeste')) }],
      [CARLA, { rev: 1, doc: muralOf('Carla', review('rcar01', 'Hades')) }],
      [JOAO, { rev: 1, doc: muralOf('João', review('rjoa01', 'Inside')) }],
    ]);
    spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL) => {
      const u = new URL(String(url));
      const code = decodeURIComponent(u.pathname.replace('/v1/murais/', ''));
      asked.push(code);
      await gates.get(code);
      const hit = published.get(code)!;
      if (u.searchParams.get('rev') === String(hit.rev)) return new Response(null, { status: 204, headers: { 'Mural-Rev': String(hit.rev) } });
      return new Response(await gz(hit.doc), { status: 200, headers: { 'Mural-Rev': String(hit.rev), 'Content-Type': 'application/gzip' } });
    });
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: 'comparar/mural', component: Blank }]),
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: 'https://api.teste', googleClientId: 'x.apps.googleusercontent.com' }) } },
      ],
    });
    murals = TestBed.inject(CloudMurals);
    colleagues = TestBed.inject(ColleagueStore);
    await colleagues.ready;
  });

  afterEach(async () => {
    localStorage.clear();
    await colleagues.clear();
  });

  /** A resposta para `code` fica presa até chamar o que volta. */
  function hold(code: string): () => void {
    let release!: () => void;
    gates.set(code, new Promise<void>((r) => (release = r)));
    return () => {
      gates.delete(code);
      release();
    };
  }

  /** Espera o pedido do mural de `code` sair para a nuvem. */
  async function sent(code: string): Promise<void> {
    for (let i = 0; i < 200 && !asked.includes(code); i++) await new Promise((r) => setTimeout(r));
    expect(asked).toContain(code);
  }

  /** Finge que o mural guardado foi aberto há 10 minutos (o guardado vale 2), sem mexer na escolha. */
  async function age(code: string): Promise<Colleague> {
    const c = colleagues.colleagues().find((x) => x.id === idOf(code))!;
    const old = { ...c, loadedAt: new Date(Date.now() - 10 * 60_000).toISOString() };
    await colleagues.restore(old, false);
    return old;
  }

  it('a pessoa escolhe outra enquanto o mural aberto se atualiza: a escolha dela fica', async () => {
    await murals.open(CARLA);
    await murals.open(MARINA);
    const old = await age(MARINA);
    expect(colleagues.selected()!.id).toBe(idOf(MARINA));
    const release = hold(MARINA);
    asked = [];
    const refreshing = murals.refresh(old);
    await sent(MARINA);
    // o Comparar mostra Marina e se atualiza por trás; a pessoa toca na Carla
    colleagues.select(idOf(CARLA));
    release();
    await refreshing;
    expect(colleagues.selected()!.id).toBe(idOf(CARLA));
    // e o mural da Marina foi atualizado mesmo assim
    expect(Date.now() - Date.parse(colleagues.colleagues().find((c) => c.id === idOf(MARINA))!.loadedAt)).toBeLessThan(60_000);
  });

  it('o correio busca vários murais ao mesmo tempo: quem está escolhido continua o mesmo, chegue em que ordem chegar', async () => {
    await murals.open(CARLA);
    const releaseMarina = hold(MARINA);
    const releaseJoao = hold(JOAO);
    const a = murals.ensure(MARINA);
    const b = murals.ensure(JOAO);
    releaseJoao();
    await b;
    releaseMarina();
    await a;
    expect(colleagues.selected()!.id).toBe(idOf(CARLA));
    expect(colleagues.colleagues().length).toBe(3);
  });

  it('a pessoa escolhe outra enquanto o perfil busca um mural: a escolha dela fica', async () => {
    await murals.open(CARLA);
    await murals.open(JOAO);
    const release = hold(MARINA);
    const fetching = murals.ensure(MARINA);
    await sent(MARINA);
    colleagues.select(idOf(CARLA));
    release();
    expect((await fetching)!.name).toBe('Marina');
    expect(colleagues.selected()!.id).toBe(idOf(CARLA));
  });

  it('sem escolha guardada (vale o primeiro da lista), buscar outro mural não troca quem está à mostra', async () => {
    await murals.open(CARLA);
    localStorage.clear();
    const fresh = new ColleagueStore();
    await fresh.ready;
    expect(fresh.selected()!.id).toBe(idOf(CARLA));
    await fresh.restore({ ...fresh.colleagues()[0], id: idOf(JOAO), codigo: JOAO, name: 'João' }, false);
    expect(fresh.colleagues()[0].id).toBe(idOf(JOAO));
    expect(fresh.selected()!.id).toBe(idOf(CARLA));
  });

  it('abrir (o código, um amigo da lista, o link) escolhe', async () => {
    await murals.open(CARLA);
    await murals.ensure(MARINA);
    expect(colleagues.selected()!.id).toBe(idOf(CARLA));
    await murals.open(MARINA);
    expect(colleagues.selected()!.id).toBe(idOf(MARINA));
  });
});
