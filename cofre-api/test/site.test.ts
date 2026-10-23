import { applyD1Migrations, createExecutionContext, type D1Migration } from 'cloudflare:test';
import { env } from 'cloudflare:workers';
import { beforeAll, describe, expect, it } from 'vitest';
import { MuralRpc, serve } from '../src/entry/worker';
import { securityHeaders } from '../src/site';
// @ts-expect-error o script é JavaScript puro, sem tipos
import { expectedHeaders, problems } from '../scripts/cabecalhos.mjs';
import { BASE_ENV } from './harness';

/**
 * O Worker inteiro (a página e a API) no runtime dos Workers, com um servidor de arquivos de mentira no
 * lugar do binding ASSETS: toda resposta sai com os cabeçalhos de segurança, e o HTML ganha o nonce.
 */
const bindings = env as unknown as { DB: D1Database; TEST_MIGRATIONS: D1Migration[] };
beforeAll(() => applyD1Migrations(bindings.DB, bindings.TEST_MIGRATIONS));

const HTML = '<!doctype html><html><head><title>c</title></head><body><cofre-root></cofre-root><script src="main.js" type="module"></script></body></html>';

function workerEnv(more: Record<string, string> = {}) {
  const assets = {
    fetch: async (input: RequestInfo | URL) => {
      const path = new URL(input instanceof Request ? input.url : input).pathname;
      if (path === '/favicon.svg') return new Response('<svg/>', { headers: { 'Content-Type': 'image/svg+xml', ETag: '"abc"' } });
      // a página e qualquer rota dela (o not_found_handling da página única)
      return new Response(HTML, { headers: { 'Content-Type': 'text/html; charset=utf-8', ETag: '"def"', 'Last-Modified': 'x' } });
    },
  };
  return { ...BASE_ENV, ...more, DB: bindings.DB, ASSETS: assets, MURAL: { contaPorGoogle: async () => null } } as never;
}

const get = (path: string, init?: RequestInit, more?: Record<string, string>) => serve(new Request(`https://cofre.teste.dev${path}`, init), workerEnv(more));

describe('a página e os cabeçalhos', () => {
  it('toda resposta sai com todos os cabeçalhos, exatos (o mesmo que o script confere)', async () => {
    for (const path of ['/', '/entrar', '/favicon.svg', '/api/status']) {
      const res = await get(path);
      expect(problems(res.headers, true), path).toEqual([]);
    }
  });

  it('os valores do script e os do Worker são os mesmos', () => {
    const fromWorker = Object.fromEntries(Object.entries(securityHeaders('NONCE', true)).map(([k, v]) => [k.toLowerCase(), v]));
    expect(fromWorker).toEqual(expectedHeaders(true));
    const local = Object.fromEntries(Object.entries(securityHeaders('NONCE', false)).map(([k, v]) => [k.toLowerCase(), v]));
    expect(local).toEqual(expectedHeaders(false));
  });

  it('o HTML ganha o nonce da CSP no ngCspNonce da raiz, um por pedido', async () => {
    const a = await get('/');
    const b = await get('/');
    const nonceOf = (r: Response) => /'nonce-([^']+)'/.exec(r.headers.get('Content-Security-Policy') ?? '')![1];
    const [na, nb] = [nonceOf(a), nonceOf(b)];
    expect(na).not.toBe(nb);
    // o HTMLRewriter escreve o nome em minúsculas; no HTML dá no mesmo (o Angular lê com getAttribute)
    expect((await a.text()).toLowerCase()).toContain(`<cofre-root ngcspnonce="${na}"></cofre-root>`.toLowerCase());
    expect((await b.text()).toLowerCase()).toContain(`ngcspnonce="${nb}"`.toLowerCase());
  });

  it('o que não é HTML passa sem mudança no corpo, e sem ETag', async () => {
    const res = await get('/favicon.svg');
    expect(await res.text()).toBe('<svg/>');
    expect(res.headers.get('ETag')).toBeNull();
    expect(res.headers.get('Last-Modified')).toBeNull();
  });

  it('a página só aceita GET e HEAD; a API, as rotas dela', async () => {
    const post = await get('/', { method: 'POST', body: 'x' });
    expect(post.status).toBe(405);
    expect(problems(post.headers, true)).toEqual([]);
    const api = await get('/api/status');
    expect(api.status).toBe(200);
    expect(await api.json()).toMatchObject({ versao: 1, modo: 'ligado' });
  });

  it('no localhost do desenvolvimento, sem HSTS e sem upgrade-insecure-requests', async () => {
    const res = await serve(new Request('http://localhost:8787/'), workerEnv({ COFRE_ORIGEM: 'http://localhost:8787', COFRE_RP_ID: 'localhost' }));
    expect(problems(res.headers, false)).toEqual([]);
    expect(res.headers.get('Strict-Transport-Security')).toBeNull();
  });

  it('a resposta da API que traz Clear-Site-Data continua com ele', async () => {
    const res = await get('/api/cofre/trancar', { method: 'POST', headers: { Origin: 'https://cofre.teste.dev', 'Content-Type': 'application/json' }, body: '{}' });
    expect(res.headers.get('Clear-Site-Data')).toBe('"cache", "storage"');
    expect(problems(res.headers, true)).toEqual([]);
  });
});

describe('a porta do Murall (MuralRpc)', () => {
  const rpc = (codigos: string) => new MuralRpc(createExecutionContext(), workerEnv({ COFRE_CODIGOS: codigos }));

  it('diz só se a conta está em COFRE_CODIGOS (com ou sem hífen, maiúscula ou não)', () => {
    expect(rpc('G11TG00D').podeUsar('G11T-G00D')).toBe(true);
    expect(rpc('G11T-G00D, K7QFM2XA').podeUsar('k7qf-m2xa')).toBe(true);
    expect(rpc('G11TG00D').podeUsar('K7QF-M2XA')).toBe(false);
    expect(rpc('').podeUsar('G11T-G00D')).toBe(false);
    expect(rpc('*').podeUsar('QUALQUER1')).toBe(true);
  });

  it('uma conta sem cofre: não tem', async () => {
    expect(await rpc('*').temCofre('2b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c')).toBe(false);
  });

  it('apagar o cofre pela porta só aceita o id de uma conta, e com o cofre ligado', async () => {
    const id = '2b7c6a2e-5d4f-4e3a-9b1c-2d3e4f5a6b7c';
    await bindings.DB.prepare("INSERT INTO cofre_eventos (usuario_id, tipo, em) VALUES (?, 'aberto', '2026-10-21T15:00:00.000Z')").bind(id).run();
    for (const ruim of ['', "x' OR '1'='1", 42 as unknown as string]) {
      await expect(rpc('*').temCofre(ruim)).rejects.toThrow();
      await expect(rpc('*').apagarCofre(ruim)).rejects.toThrow();
    }
    const desligado = new MuralRpc(createExecutionContext(), workerEnv({ COFRE_CODIGOS: '*', MODO: 'desligado' }));
    await expect(desligado.apagarCofre(id)).rejects.toThrow();
    expect(await bindings.DB.prepare('SELECT COUNT(*) AS n FROM cofre_eventos WHERE usuario_id = ?').bind(id).first()).toEqual({ n: 1 });
    expect(await rpc('*').apagarCofre(id)).toEqual({ apagado: true });
    expect(await bindings.DB.prepare('SELECT COUNT(*) AS n FROM cofre_eventos WHERE usuario_id = ?').bind(id).first()).toEqual({ n: 0 });
  });

  it('código vazio, enorme ou que não é texto: não', () => {
    expect(rpc('G11TG00D').podeUsar('')).toBe(false);
    expect(rpc('*').podeUsar('X'.repeat(17))).toBe(false);
    expect(rpc('*').podeUsar(42 as unknown as string)).toBe(false);
  });
});
