import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ACCOUNT_KEY, SESSION_KEY } from './cloud-account';
import { Cloud } from './cloud-config';
import { deleteDatabase } from './erase-save';
import { IMAGES_DB, ImageStore, StoredImage } from './image-store';
import { ImageSync, shortReason } from './image-sync';
import { samplePng } from './images.spec';

const API = 'https://api.teste';
const TOKEN = 'A'.repeat(43);
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

/** Uma colada aqui, com um id que ordena pela data. */
function pasted(n: number, estado: StoredImage['estado'] = 'local'): StoredImage {
  return {
    id: `imagem${String(n).padStart(2, '0')}` + 'x'.repeat(14),
    blob: new Blob([`bytes ${n}`], { type: 'image/webp' }),
    tipo: 'image/webp',
    largura: 10,
    altura: 10,
    bytes: 7,
    hash: `h${n}`,
    criada: `2026-10-28T10:00:0${n}.000Z`,
    estado,
  };
}

describe('as imagens coladas e a nuvem (core/image-sync.ts)', () => {
  let calls: { url: string; init: RequestInit }[];
  let answer: (url: string, init: RequestInit) => Response | Promise<Response>;

  async function setup(signedIn = true): Promise<{ sync: ImageSync; store: ImageStore }> {
    await deleteDatabase(IMAGES_DB);
    localStorage.clear();
    if (signedIn) {
      localStorage.setItem(SESSION_KEY, TOKEN);
      localStorage.setItem(ACCOUNT_KEY, JSON.stringify({ id: 'conta-1', codigo: 'K7QF-M2XA', nome: 'Igor' }));
    }
    calls = [];
    answer = () => json({ id: 'x' }, 201);
    spyOn(window, 'fetch').and.callFake(async (url: RequestInfo | URL, init?: RequestInit) => {
      // só as imagens contam: a conferência da sessão e o que outro teste ainda vivo pedir (a
      // sincronização dele) ficam de fora, com um 404 rápido
      if (String(url).endsWith('/v1/eu')) return json({ id: 'conta-1', codigo: 'K7QF-M2XA', nome: 'Igor' });
      if (!String(url).includes('/v1/imagens/')) return json({ erro: 'nao-achei', mensagem: 'x' }, 404);
      calls.push({ url: String(url), init: init ?? {} });
      return answer(String(url), init ?? {});
    });
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => ({ api: API, googleClientId: 'x' }) } }],
    });
    return { sync: TestBed.inject(ImageSync), store: TestBed.inject(ImageStore) };
  }

  afterEach(async () => {
    localStorage.clear();
    await deleteDatabase(IMAGES_DB);
  });

  it('manda as que só estão aqui, uma por vez, das mais velhas, com os bytes e o tipo; elas ficam na nuvem', async () => {
    const { sync, store } = await setup();
    await store.restore([pasted(2), pasted(1), pasted(3, 'na-nuvem')]);
    await sync.send();
    expect(calls.map((c) => `${c.init.method} ${c.url}`)).toEqual([`PUT ${API}/v1/imagens/${pasted(1).id}`, `PUT ${API}/v1/imagens/${pasted(2).id}`]);
    expect((calls[0].init.headers as Record<string, string>)['Content-Type']).toBe('image/webp');
    expect((calls[0].init.headers as Record<string, string>)['Authorization']).toBe(`Bearer ${TOKEN}`);
    expect(await (calls[0].init.body as Blob).text()).toBe('bytes 1');
    expect((await store.all()).every((i) => i.estado === 'na-nuvem')).toBeTrue();
    expect(await store.unsent()).toBe(0);
    expect(sync.problem()).toBeNull();
  });

  it('fora da conta, nada sobe', async () => {
    const { sync, store } = await setup(false);
    await store.restore([pasted(1)]);
    await sync.send();
    expect(calls).toEqual([]);
  });

  it('o limite do dia para a fila por uma hora (sem insistir a cada rodada); pedir agora tenta de novo', async () => {
    const { sync, store } = await setup();
    await store.restore([pasted(1), pasted(2)]);
    answer = () => json({ erro: 'imagens-hoje', mensagem: 'Chegou ao limite de 30 imagens por dia.' }, 429);
    await sync.send();
    expect(calls.length).toBe(1);
    expect(sync.problem()?.code).toBe('imagens-hoje');
    expect(shortReason(sync.problem())).toBe('chegou ao limite de imagens do dia');
    await sync.send();
    await sync.send(Date.now() + 30 * 60_000);
    expect(calls.length).withContext('meia hora depois, ainda espera').toBe(1);
    answer = () => json({ id: 'x' }, 201);
    await sync.send(Date.now() + 61 * 60_000);
    expect(calls.length).toBe(3);
    expect(await store.unsent()).toBe(0);
    expect(sync.problem()).toBeNull();
    // e o retry (o botão, o Sair) não espera
    await store.restore([pasted(4)]);
    answer = () => json({ erro: 'imagens-hoje', mensagem: 'x' }, 429);
    await sync.send();
    sync.retry();
    answer = () => json({ id: 'x' }, 201);
    await sync.send();
    expect(await store.unsent()).toBe(0);
  });

  it('o que a nuvem nunca aceita fica recusado (só aqui) e a fila segue com as outras', async () => {
    const { sync, store } = await setup();
    await store.restore([pasted(1), pasted(2)]);
    answer = (url) => (url.includes(pasted(1).id) ? json({ erro: 'imagem-tipo', mensagem: 'Só imagens WebP, JPEG ou PNG.' }, 415) : json({ id: 'x' }, 201));
    await sync.send();
    expect((await store.get(pasted(1).id))?.estado).toBe('recusada');
    expect((await store.get(pasted(2).id))?.estado).toBe('na-nuvem');
    expect(await store.unsent()).withContext('a recusada só existe aqui').toBe(1);
    await sync.send();
    expect(calls.length).withContext('a recusada não vai de novo').toBe(2);
  });

  it('sem conexão: para, e a próxima rodada tenta de novo na hora', async () => {
    const { sync, store } = await setup();
    await store.restore([pasted(1)]);
    answer = () => Promise.reject(new TypeError('Failed to fetch'));
    await sync.send();
    expect(shortReason(sync.problem())).toBe('sem conexão');
    answer = () => json({ id: 'x' }, 201);
    await sync.send();
    expect(await store.unsent()).toBe(0);
  });

  it('a que a nuvem perdeu (apagada como solta) e está aqui volta para a fila e sobe de novo; a alheia e a ausente, não', async () => {
    const { sync, store } = await setup();
    const alheia = { ...pasted(3, 'na-nuvem'), alheia: true as const };
    await store.restore([pasted(1, 'na-nuvem'), alheia]);
    expect(await sync.lost([pasted(1).id, alheia.id, 'naoestaaqui' + 'x'.repeat(11)])).toBe(1);
    expect((await store.get(pasted(1).id))?.estado).toBe('local');
    expect((await store.get(alheia.id))?.estado).toBe('na-nuvem');
    await sync.send();
    expect(calls.map((c) => c.url)).toEqual([`${API}/v1/imagens/${pasted(1).id}`]);
  });

  it('duas chamadas ao mesmo tempo mandam cada imagem uma vez', async () => {
    const { sync, store } = await setup();
    await store.restore([pasted(1)]);
    await Promise.all([sync.send(), sync.send()]);
    expect(calls.length).toBe(1);
  });

  it('a que falta neste aparelho desce da nuvem, fica guardada (já na nuvem, com o tamanho) e não desce de novo', async () => {
    const { sync, store } = await setup();
    const png = await samplePng(300, 200);
    const id = 'deoutroaparelho' + 'y'.repeat(7);
    answer = () => new Response(png, { headers: { 'Content-Type': 'image/png' } });
    const url = await sync.fetch(id);
    expect(url).toMatch(/^blob:/);
    expect(calls.map((c) => `${c.init.method ?? 'GET'} ${c.url}`)).toEqual([`GET ${API}/v1/imagens/${id}`]);
    const stored = await store.get(id);
    expect(stored).toEqual(jasmine.objectContaining({ estado: 'na-nuvem', largura: 300, altura: 200, tipo: 'image/png' }));
    expect(await store.url(id)).toBe(url);
  });

  it('a de outra pessoa (a nuvem diz Imagem-Sua: 0) fica para mostrar, mas não conta como mural seu nem vai no backup', async () => {
    const { sync, store } = await setup();
    await store.ready;
    const png = await samplePng(120, 80);
    const id = 'deoutrapessoa' + 'y'.repeat(9);
    answer = () => new Response(png, { headers: { 'Content-Type': 'image/png', 'Imagem-Sua': '0' } });
    expect(await sync.fetch(id)).toMatch(/^blob:/);
    expect((await store.get(id))?.alheia).toBeTrue();
    expect(store.count()).toBe(0);
    expect(await store.forBackup()).toEqual([]);
    expect(await store.unsent()).toBe(0);
    expect(sync.publicUrl(id)).toBe(`${API}/v1/imagens/${id}`);
  });

  it('a que a nuvem não tem (ou não é sua) só é pedida de novo depois de um minuto', async () => {
    const { sync } = await setup();
    const id = 'naoestanuvem' + 'z'.repeat(10);
    answer = () => json({ erro: 'imagem-nao-encontrada', mensagem: 'x' }, 404);
    expect(await sync.fetch(id)).toBeNull();
    expect(await sync.fetch(id)).toBeNull();
    expect(calls.length).toBe(1);
    expect(await sync.fetch(id, Date.now() + 61_000)).toBeNull();
    expect(calls.length).toBe(2);
  });

  it('desce no máximo quatro ao mesmo tempo, e o mesmo id uma vez só', async () => {
    const { sync } = await setup();
    let open = 0;
    let most = 0;
    answer = async () => {
      open++;
      most = Math.max(most, open);
      await new Promise((r) => setTimeout(r, 20));
      open--;
      return json({ erro: 'imagem-nao-encontrada', mensagem: 'x' }, 404);
    };
    const ids = Array.from({ length: 10 }, (_, i) => `paralelo${String(i).padStart(2, '0')}` + 'w'.repeat(12));
    await Promise.all([...ids.map((id) => sync.fetch(id)), sync.fetch(ids[0])]);
    expect(calls.length).toBe(10);
    expect(most).toBe(4);
  });

  it('fora da conta, nada desce', async () => {
    const { sync } = await setup(false);
    expect(await sync.fetch('qualquerum' + 'q'.repeat(12))).toBeNull();
    expect(calls).toEqual([]);
  });
});
