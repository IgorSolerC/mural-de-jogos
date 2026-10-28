import { describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { CATALOG_PER_MINUTE, catalogBrake, readCatalogKeys } from '../src/routes/catalog';
import { CatalogKeys, Db } from '../src/ports';
import { BASE_ENV, NOW, noGoogle } from './harness';

/** A busca com as chaves do site não toca no banco: um banco que quebra se for chamado. */
const noDb: Db = {
  first: () => Promise.reject(new Error('o banco não devia ser chamado')),
  all: () => Promise.reject(new Error('o banco não devia ser chamado')),
  batch: () => Promise.reject(new Error('o banco não devia ser chamado')),
};

const SITE = 'https://igorsolerc.github.io';

function setup(keys: CatalogKeys, reply: (url: string, init?: RequestInit) => Response = () => Response.json({ results: [] }), env: Record<string, string> = {}) {
  const calls: { url: string; init?: RequestInit }[] = [];
  const app = createApp({
    db: noDb,
    config: readConfig({ ...BASE_ENV, ...env }),
    now: () => NOW,
    verifyGoogle: noGoogle,
    catalog: {
      keys,
      fetch: async (url, init) => {
        calls.push({ url, init });
        return reply(url, init);
      },
      brake: catalogBrake(),
    },
  });
  const get = (path: string, origin: string | null = SITE, ip?: string) =>
    app.request(`https://api.teste${path}`, { headers: { ...(origin ? { Origin: origin } : {}), ...(ip ? { 'CF-Connecting-IP': ip } : {}) } });
  return { get, calls };
}

describe('busca com as chaves do site', () => {
  it('lê as chaves dos secrets, sem espaços', () => {
    expect(readCatalogKeys({ TMDB_KEY: ' abc ', RAWG_KEY: 'r' })).toEqual({ tmdb: 'abc', rawg: 'r' });
    expect(readCatalogKeys({})).toEqual({ tmdb: '', rawg: '' });
  });

  it('diz quais catálogos têm a chave, sem nunca mostrar a chave', async () => {
    const { get } = setup({ tmdb: 'segredo', rawg: '' });
    const res = await get('/v1/catalogo');
    expect(res.status).toBe(200);
    const text = await res.text();
    expect(JSON.parse(text)).toEqual({ tmdb: true, rawg: false });
    expect(text).not.toContain('segredo');
    expect(res.headers.get('Cache-Control')).toContain('max-age');
  });

  it('repassa a busca do TMDB com a chave curta na URL e devolve o corpo de lá', async () => {
    const { get, calls } = setup({ tmdb: 'abc123', rawg: '' }, () => Response.json({ results: [{ id: 598 }] }));
    const res = await get('/v1/catalogo/tmdb/search/movie?query=cidade%20de%20deus&language=pt-BR&include_adult=false&page=1&extra=1');
    expect(res.status).toBe(200);
    expect(await res.json()).toEqual({ results: [{ id: 598 }] });
    expect(res.headers.get('Cache-Control')).toBe('public, max-age=86400');
    const url = new URL(calls[0].url);
    expect(url.origin + url.pathname).toBe('https://api.themoviedb.org/3/search/movie');
    expect(url.searchParams.get('query')).toBe('cidade de deus');
    expect(url.searchParams.get('api_key')).toBe('abc123');
    // só os parâmetros que o site usa
    expect(url.searchParams.has('extra')).toBe(false);
  });

  it('o token de leitura do TMDB vai no cabeçalho', async () => {
    const { get, calls } = setup({ tmdb: 'eyJtoken', rawg: '' });
    await get('/v1/catalogo/tmdb/movie/598/images?include_image_language=pt,en,null');
    expect(calls[0].url).not.toContain('api_key');
    expect((calls[0].init?.headers as Record<string, string>)['Authorization']).toBe('Bearer eyJtoken');
  });

  it('repassa a RAWG: a busca, um jogo e as lojas', async () => {
    const { get, calls } = setup({ tmdb: '', rawg: 'k' });
    for (const path of ['games?search=hades&page_size=8&search_precise=true', 'games/7', 'games/god-of-war/stores']) {
      expect((await get(`/v1/catalogo/rawg/${path}`)).status).toBe(200);
    }
    expect(calls.map((c) => new URL(c.url).pathname)).toEqual(['/api/games', '/api/games/7', '/api/games/god-of-war/stores']);
    expect(calls.every((c) => new URL(c.url).searchParams.get('key') === 'k')).toBe(true);
  });

  it('a chave do site nunca volta para o navegador: os endereços da página seguinte saem sem ela', async () => {
    const key = 'b9035166c0ffee';
    const { get } = setup({ tmdb: '', rawg: key }, () =>
      Response.json({
        next: `https://api.rawg.io/api/games?key=${key}&page=2&search=zelda`,
        previous: `https://api.rawg.io/api/games?page=1&key=${key}`,
        results: [{ id: 1, name: 'Zelda', background_image: 'https://media.rawg.io/x.jpg' }],
      }),
    );
    const res = await get('/v1/catalogo/rawg/games?search=zelda');
    const text = await res.text();
    expect(text).not.toContain(key);
    const body = JSON.parse(text);
    expect(body.next).toBe('https://api.rawg.io/api/games?page=2&search=zelda');
    expect(body.previous).toBe('https://api.rawg.io/api/games?page=1');
    expect(body.results[0].name).toBe('Zelda');
    // a chave curta do TMDB também
    const tmdb = setup({ tmdb: 'abc123', rawg: '' }, () => Response.json({ link: 'https://api.themoviedb.org/3/x?api_key=abc123&page=2' }));
    expect(await (await tmdb.get('/v1/catalogo/tmdb/search/movie?query=x')).json()).toEqual({ link: 'https://api.themoviedb.org/3/x?page=2' });
  });

  it('recusa endereços que o site não usa, pedidos de fora do site e parâmetros enormes', async () => {
    const { get, calls } = setup({ tmdb: 't', rawg: 'r' });
    expect((await get('/v1/catalogo/tmdb/account')).status).toBe(404);
    expect((await get('/v1/catalogo/tmdb/movie/598/../../account')).status).toBe(404);
    expect((await get('/v1/catalogo/rawg/creators')).status).toBe(404);
    expect((await get('/v1/catalogo/rawg/games', null)).status).toBe(403);
    expect((await get('/v1/catalogo/rawg/games', 'https://outro.site')).status).toBe(403);
    expect((await get(`/v1/catalogo/rawg/games?search=${'a'.repeat(200)}`)).status).toBe(400);
    expect(calls).toEqual([]);
  });

  it('sem a chave, responde 503 e o site volta para a Wikipedia', async () => {
    const { get, calls } = setup({ tmdb: '', rawg: '' });
    const res = await get('/v1/catalogo/rawg/games?search=hades');
    expect(res.status).toBe(503);
    expect(((await res.json()) as { erro: string }).erro).toBe('sem-chave');
    expect(calls).toEqual([]);
  });

  it('a chave recusada ou no limite vira 503, sem passar o erro de lá adiante', async () => {
    const refused = setup({ tmdb: 't', rawg: '' }, () => new Response('{"status_code":7}', { status: 401 }));
    const r1 = await refused.get('/v1/catalogo/tmdb/search/tv?query=x');
    expect(r1.status).toBe(503);
    expect(((await r1.json()) as { erro: string }).erro).toBe('chave-recusada');
    const limited = setup({ tmdb: '', rawg: 'r' }, () => new Response('{}', { status: 429 }));
    const r2 = await limited.get('/v1/catalogo/rawg/games?search=x');
    expect(((await r2.json()) as { erro: string }).erro).toBe('catalogo-limite');
    const down = setup({ tmdb: '', rawg: 'r' }, () => {
      throw new Error('rede');
    });
    expect((await down.get('/v1/catalogo/rawg/games?search=x')).status).toBe(502);
  });

  it('um IP que busca demais espera um minuto, sem gastar a cota das chaves; os outros IPs seguem', async () => {
    const { get, calls } = setup({ tmdb: 't', rawg: 'r' });
    for (let i = 0; i < CATALOG_PER_MINUTE; i++) expect((await get(`/v1/catalogo/rawg/games?search=x${i}`, SITE, '203.0.113.7')).status).toBe(200);
    const res = await get('/v1/catalogo/tmdb/search/movie?query=duna', SITE, '203.0.113.7');
    expect(res.status).toBe(429);
    expect(((await res.json()) as { erro: string }).erro).toBe('catalogo-devagar');
    expect(res.headers.get('Retry-After')).toBe('60');
    // a recusa não é guardada no navegador
    expect(res.headers.get('Cache-Control')).toBe('no-store');
    expect(calls.length).toBe(CATALOG_PER_MINUTE);
    expect((await get('/v1/catalogo/rawg/games?search=y', SITE, '198.51.100.2')).status).toBe(200);
    // o pedido de fora do site não conta na vaga de ninguém
    expect((await get('/v1/catalogo/rawg/games?search=y', 'https://outro.site', '198.51.100.3')).status).toBe(403);
  });

  it('o freio conta por janela de um minuto e não lembra IPs sem fim', () => {
    const brake = catalogBrake(2, 60_000, 3);
    expect([brake.take('a', 0), brake.take('a', 1), brake.take('a', 2)]).toEqual([true, true, false]);
    // passou o minuto: a vaga volta
    expect(brake.take('a', 60_000)).toBe(true);
    // com mais IPs que o freio lembra, o mais antigo sai (e recomeça do zero)
    brake.take('b', 60_001);
    brake.take('c', 60_002);
    brake.take('a', 60_003);
    brake.take('d', 60_004);
    // o "a" já tinha gastado as duas vezes deste minuto: esquecido, ganha a vaga de novo
    expect([brake.take('a', 60_005), brake.take('a', 60_006), brake.take('a', 60_007)]).toEqual([true, true, false]);
  });

  it('com a nuvem desligada, a busca do site também para', async () => {
    const { get, calls } = setup({ tmdb: 't', rawg: 'r' }, undefined, { MODO: 'desligado' });
    expect((await get('/v1/catalogo/rawg/games?search=x')).status).toBe(503);
    expect(calls).toEqual([]);
  });
});
