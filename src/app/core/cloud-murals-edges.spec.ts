import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from './cloud-config';
import { CLOUD_COLLEAGUE_PREFIX, CloudMurals } from './cloud-murals';
import { Colleague, ColleagueStore } from './colleague-store';
import { itBug, must } from '../testing/known-bug.spec';

/**
 * Os murais dos amigos pela nuvem, nas bordas: o guardado de 2 minutos, a escolha do Comparar que
 * não pode mudar por trás, sem rede, o nome que a pessoa trocou e o código trocado. Os BUG: são
 * bugs conhecidos (ver testing/known-bug.spec.ts).
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
const muralOf = (name: string, ...reviews: ReturnType<typeof review>[]) => ({ app: 'meu-mural', version: 2, owner: { name }, reviews });

describe('murais dos amigos pela nuvem: bordas e bugs conhecidos', () => {
  let murals: CloudMurals;
  let colleagues: ColleagueStore;
  let calls: string[];
  let offline: boolean;
  let published: Map<string, { rev: number; doc: unknown }>;

  beforeEach(async () => {
    await new Promise<void>((resolve) => {
      const r = indexedDB.deleteDatabase('meu-mural:colegas');
      r.onsuccess = r.onerror = r.onblocked = () => resolve();
    });
    localStorage.clear();
    calls = [];
    offline = false;
    published = new Map([[MARINA, { rev: 3, doc: muralOf('Marina', review('rmar01', 'Celeste')) }]]);
    spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL) => {
      if (offline) throw new TypeError('Failed to fetch');
      const u = new URL(String(url));
      calls.push(u.pathname + u.search);
      const hit = published.get(decodeURIComponent(u.pathname.replace('/v1/murais/', '')));
      if (!hit) return new Response(JSON.stringify({ erro: 'mural-nao-encontrado', mensagem: 'Não achei mural com esse código.' }), { status: 404 });
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

  afterEach(() => localStorage.clear());

  /** Finge que o mural guardado foi aberto há `ms` (o guardado vale 2 minutos). */
  async function age(code: string, ms: number): Promise<Colleague> {
    const id = CLOUD_COLLEAGUE_PREFIX + code.replace('-', '');
    const c = colleagues.colleagues().find((x) => x.id === id)!;
    const old = { ...c, loadedAt: new Date(Date.now() - ms).toISOString() };
    await colleagues.restore(old);
    return old;
  }

  it('ensure: aberto há menos de 2 minutos, usa o guardado sem perguntar à nuvem', async () => {
    await murals.ensure(MARINA);
    calls = [];
    const again = await murals.ensure(MARINA);
    expect(calls).toEqual([]);
    expect(again!.reviews.map((r) => r.game.name)).toEqual(['Celeste']);
  });

  it('ensure: passado o prazo, pergunta "mudou?" com a rev guardada e traz o novo quando mudou', async () => {
    await murals.ensure(MARINA);
    await age(MARINA, 3 * 60_000);
    calls = [];
    published.set(MARINA, { rev: 4, doc: muralOf('Marina', review('rmar01', 'Celeste'), review('rmar02', 'Hades')) });
    const fresh = await murals.ensure(MARINA);
    expect(calls).toEqual([`/v1/murais/${MARINA}?rev=3`]);
    expect(fresh!.rev).toBe(4);
    expect(fresh!.reviews.map((r) => r.game.name).sort()).toEqual(['Celeste', 'Hades']);
  });

  it('ensure não troca quem está escolhido no Comparar', async () => {
    const file = new File([await gz(muralOf('Colega do arquivo', review('rarq01', 'Hollow Knight')))], 'colega.json.gz');
    const fromFile = await colleagues.add(file, 'Colega');
    expect(colleagues.selected()!.id).toBe(fromFile.id);
    await murals.ensure(MARINA);
    expect(colleagues.selected()!.id).toBe(fromFile.id);
    expect(colleagues.colleagues().length).toBe(2);
  });

  it('ensure sem rede: devolve o guardado (mesmo velho); nunca aberto, devolve null', async () => {
    await murals.ensure(MARINA);
    await age(MARINA, 10 * 60_000);
    offline = true;
    expect((await murals.ensure(MARINA))!.reviews.length).toBe(1);
    expect(await murals.ensure('ZZZZ-ZZZZ')).toBeNull();
  });

  it('ensure com código inválido devolve null sem chamar a nuvem', async () => {
    expect(await murals.ensure('nada')).toBeNull();
    expect(calls).toEqual([]);
  });

  it('a pessoa trocou o nome dela: o nome novo vem junto; um nome dado aqui continua valendo', async () => {
    await murals.ensure(MARINA);
    await age(MARINA, 3 * 60_000);
    published.set(MARINA, { rev: 4, doc: muralOf('Marina Souza', review('rmar01', 'Celeste')) });
    expect((await murals.ensure(MARINA))!.name).toBe('Marina Souza');

    const id = CLOUD_COLLEAGUE_PREFIX + MARINA.replace('-', '');
    await colleagues.rename(id, 'Mari (faculdade)');
    await age(MARINA, 3 * 60_000);
    published.set(MARINA, { rev: 5, doc: muralOf('Marina S.', review('rmar01', 'Celeste')) });
    expect((await murals.ensure(MARINA))!.name).toBe('Mari (faculdade)');
  });

  it('refresh: só para murais abertos pelo código, fora do prazo, e sem trocar a escolha', async () => {
    const opened = await murals.open(MARINA);
    calls = [];
    await murals.refresh(opened); // aberto agora: não pergunta
    expect(calls).toEqual([]);
    await murals.refresh({ ...opened, codigo: undefined, loadedAt: '2020-01-01T00:00:00.000Z' }); // backup de arquivo
    expect(calls).toEqual([]);
    const old = await age(MARINA, 3 * 60_000);
    await murals.refresh(old);
    expect(calls).toEqual([`/v1/murais/${MARINA}?rev=3`]);
  });

  it('a pessoa apagou o mural (404): ensure devolve o guardado e o open avisa com a mensagem da nuvem', async () => {
    await murals.ensure(MARINA);
    await age(MARINA, 3 * 60_000);
    published.delete(MARINA);
    expect((await murals.ensure(MARINA))!.reviews.length).toBe(1);
    await expectAsync(murals.open(MARINA)).toBeRejectedWithError('Não achei mural com esse código.');
  });

  // O colega aberto pela nuvem tem o id `nuvem:` + código. Quando a pessoa troca o código (Ajustes ›
  // Perfil), a lista de quem eu sigo passa a trazer o novo, e o mural dela é aberto de novo com outro
  // id: o Comparar fica com duas "Marina", e a do código antigo nunca mais se atualiza (o código
  // antigo responde 404).
  itBug('quando a pessoa troca o código, o Comparar não fica com o mural dela duplicado', async () => {
    await murals.ensure(MARINA);
    const NEW = 'P9RT-4VWX';
    published.set(NEW, published.get(MARINA)!);
    published.delete(MARINA);
    await murals.ensure(NEW);
    const marinas = colleagues.colleagues().filter((c) => c.name === 'Marina');
    must(marinas.length === 1, `o Comparar ficou com ${marinas.length} murais da Marina: ${marinas.map((c) => c.fileName).join(', ')}`);
  });
});
