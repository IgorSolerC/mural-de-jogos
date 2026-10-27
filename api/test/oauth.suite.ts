import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { ESCOPOS_DO_OAUTH, ESCOPOS_SEM_PEDIDO, REGISTROS_POR_IP } from '../../contrato/api-v1/oauth';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { googleVerifier } from '../src/domain/google';
import { base64url, sha256 } from '../src/domain/bytes';
import { Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, jsonCaller } from './harness';

/**
 * O OAuth dos conectores (PLANO-API.md, rodada 5): os metadados, o registro de cliente e, nos passos
 * seguintes, autorizar, os tokens e a revogação. Roda nos dois bancos.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*', SITE: 'https://site.teste' };
const API = 'https://api.teste';
const CLAUDE = 'https://claude.ai/api/mcp/auth_callback';
const VERIFIER = 'v'.repeat(20) + '-verificador-do-pkce-de-teste';

export function oauthSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;
  let challenge: string;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'oauth', alg: 'RS256' };
    challenge = base64url(await sha256(VERIFIER));
  });

  async function setup(env: Record<string, string> = ENV) {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const clock = { t: NOW.getTime() };
    const config = readConfig(env);
    const deps: Deps = { db, config, now: () => new Date(clock.t), verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })) };
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`${API}${path}`, init);
    const json = jsonCaller(call);
    const body = async (res: Response | Promise<Response>) => (await (await res).json()) as any;
    const register = (meta: Record<string, unknown>, ip = '203.0.113.7') =>
      call('/oauth/registrar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(meta) });
    /** Entra com o Google e devolve o token da sessão do site. */
    const login = async (sub = 'ana') => {
      const credential = await new SignJWT({ given_name: sub })
        .setProtectedHeader({ alg: 'RS256', kid: 'oauth' })
        .setSubject(sub)
        .setAudience(env['GOOGLE_CLIENT_ID']!)
        .setIssuer('https://accounts.google.com')
        // o jose confere o prazo pelo relógio de verdade, não pelo do teste
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      return (await body(json('POST', '/v1/auth/google', { credential }))).token as string;
    };
    /** O cliente do claude.ai registrado. */
    const client = async (redirects = [CLAUDE]) => (await body(register({ client_name: 'Claude', redirect_uris: redirects }))).client_id as string;
    /** O começo do OAuth: o endereço de autorizar com os parâmetros (`null` tira um). */
    const authorize = (params: Record<string, string | null>) => {
      const q = new URLSearchParams();
      const all: Record<string, string | null> = { response_type: 'code', redirect_uri: CLAUDE, code_challenge: challenge, code_challenge_method: 'S256', state: 'xyz', ...params };
      for (const [k, v] of Object.entries(all)) if (v !== null) q.set(k, v);
      return call(`/oauth/autorizar?${q}`, { redirect: 'manual' });
    };
    /** Registra, autoriza e devolve o id do pedido aberto. */
    const openRequest = async (params: Record<string, string | null> = {}) => {
      const id = await client();
      const res = await authorize({ client_id: id, ...params });
      const location = res.headers.get('Location') ?? '';
      return { clientId: id, pedido: /pedido=(op_[\w-]+)/.exec(location)?.[1] ?? '', location };
    };
    return { db, clock, call, json, body, register, login, client, authorize, openRequest };
  }

  describe(`${label}: o OAuth, descoberta e registro`, () => {
    it('os metadados do recurso (na raiz e no /mcp) e do servidor de autorização', async () => {
      const t = await setup();
      const mcp = await t.body(t.call('/.well-known/oauth-protected-resource/mcp'));
      expect(mcp.resource).toBe(`${API}/mcp`);
      expect(mcp.authorization_servers).toEqual([API]);
      expect(mcp.scopes_supported).toEqual(ESCOPOS_DO_OAUTH);
      expect((await t.body(t.call('/.well-known/oauth-protected-resource'))).resource).toBe(API);
      const as = await t.body(t.call('/.well-known/oauth-authorization-server'));
      expect(as.issuer).toBe(API);
      expect(as.authorization_endpoint).toBe(`${API}/oauth/autorizar`);
      expect(as.token_endpoint).toBe(`${API}/oauth/token`);
      expect(as.registration_endpoint).toBe(`${API}/oauth/registrar`);
      expect(as.code_challenge_methods_supported).toEqual(['S256']);
      expect(as.token_endpoint_auth_methods_supported).toEqual(['none']);
    });

    it('o 401 do /mcp aponta o metadado do recurso', async () => {
      const t = await setup();
      const res = await t.call('/mcp', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: '{"jsonrpc":"2.0","id":1,"method":"ping"}' });
      expect(res.status).toBe(401);
      expect(res.headers.get('WWW-Authenticate')).toBe(`Bearer realm="murall", resource_metadata="${API}/.well-known/oauth-protected-resource/mcp"`);
    });

    it('qualquer origem chama o OAuth (CORS *), como o /mcp', async () => {
      const t = await setup();
      const res = await t.call('/oauth/registrar', {
        method: 'OPTIONS',
        headers: { Origin: 'https://inspetor.exemplo', 'Access-Control-Request-Method': 'POST' },
      });
      expect(res.headers.get('Access-Control-Allow-Origin')).toBe('*');
      const meta = await t.call('/.well-known/oauth-authorization-server', { headers: { Origin: 'https://inspetor.exemplo' } });
      expect(meta.headers.get('Access-Control-Allow-Origin')).toBe('*');
    });

    it('registra um cliente público, sem segredo', async () => {
      const t = await setup();
      const res = await t.register({
        client_name: 'Claude',
        redirect_uris: ['https://claude.ai/api/mcp/auth_callback', 'https://claude.ai/api/mcp/auth_callback'],
        grant_types: ['authorization_code', 'refresh_token'],
        token_endpoint_auth_method: 'client_secret_post',
      });
      expect(res.status).toBe(201);
      const out = (await res.json()) as any;
      expect(out.client_id).toMatch(/^oc_[A-Za-z0-9_-]{16}$/);
      expect(out.client_secret).toBeUndefined();
      expect(out.token_endpoint_auth_method).toBe('none');
      expect(out.redirect_uris).toEqual(['https://claude.ai/api/mcp/auth_callback']);
      const row = await t.db.first<{ nome: string; tipo: string; retornos: string }>('SELECT nome, tipo, retornos FROM oauth_clientes WHERE id = ?', [out.client_id]);
      expect(row).toEqual({ nome: 'Claude', tipo: 'dcr', retornos: '["https://claude.ai/api/mcp/auth_callback"]' });
      // o freio guarda o IP em hash, nunca o IP
      const brake = await t.db.first<{ usuario_id: string }>("SELECT usuario_id FROM freios WHERE acao = 'oauth-registro'");
      expect(brake?.usuario_id).toMatch(/^ip:[0-9a-f]{32}$/);
    });

    it('aceita o retorno no próprio computador (as CLIs) e recusa os outros', async () => {
      const t = await setup();
      for (const uri of ['http://localhost:33418/callback', 'http://127.0.0.1:5000/cb', 'http://[::1]:8080/']) {
        expect((await t.register({ redirect_uris: [uri] })).status, uri).toBe(201);
      }
      for (const uri of ['http://exemplo.com/cb', 'https://exemplo.com/cb#x', 'https://ana:senha@exemplo.com/', 'javascript:alert(1)', 'nada', 42]) {
        const res = await t.register({ redirect_uris: [uri] });
        expect(res.status, String(uri)).toBe(400);
        expect(((await res.json()) as any).error).toBe('invalid_redirect_uri');
      }
      expect((await t.body(t.register({}))).error).toBe('invalid_redirect_uri');
      expect((await t.body(t.register({ redirect_uris: ['https://a.exemplo/cb'], grant_types: ['client_credentials'] }))).error).toBe('invalid_client_metadata');
      expect((await t.body(t.register({ redirect_uris: ['https://a.exemplo/cb'], response_types: ['token'] }))).error).toBe('invalid_client_metadata');
      const sem = await t.body(t.register({ redirect_uris: ['https://a.exemplo/cb'] }));
      expect(sem.client_name).toBe('Um aplicativo');
    });

    it(`${REGISTROS_POR_IP} registros por IP em 24 horas`, async () => {
      const t = await setup();
      for (let i = 0; i < REGISTROS_POR_IP; i++) expect((await t.register({ redirect_uris: ['https://a.exemplo/cb'] })).status).toBe(201);
      const res = await t.register({ redirect_uris: ['https://a.exemplo/cb'] });
      expect(res.status).toBe(429);
      expect(((await res.json()) as any).error).toBe('too_many_requests');
      expect((await t.register({ redirect_uris: ['https://a.exemplo/cb'] }, '198.51.100.1')).status).toBe(201);
      t.clock.t += 24 * 60 * 60 * 1000 + 1000;
      expect((await t.register({ redirect_uris: ['https://a.exemplo/cb'] })).status).toBe(201);
    });
  });

  describe(`${label}: o OAuth, autorizar`, () => {
    it('cliente desconhecido ou retorno que não confere: página de erro daqui, nunca um redirecionamento', async () => {
      const t = await setup();
      const unknown = await t.authorize({ client_id: 'oc_AAAAAAAAAAAAAAAA' });
      expect(unknown.status).toBe(400);
      expect(unknown.headers.get('Location')).toBeNull();
      expect(await unknown.text()).toContain('não está registrado');
      const id = await t.client();
      const wrong = await t.authorize({ client_id: id, redirect_uri: 'https://ladrao.exemplo/cb' });
      expect(wrong.status).toBe(400);
      expect(wrong.headers.get('Content-Security-Policy')).toContain("default-src 'none'");
    });

    it('sem PKCE, com outro response_type ou outro resource: o erro volta ao cliente, com o state e o iss', async () => {
      const t = await setup();
      const id = await t.client();
      const back = async (params: Record<string, string | null>) => new URL((await t.authorize({ client_id: id, ...params })).headers.get('Location')!);
      const noPkce = await back({ code_challenge: null });
      expect(noPkce.origin + noPkce.pathname).toBe(CLAUDE);
      expect(noPkce.searchParams.get('error')).toBe('invalid_request');
      expect(noPkce.searchParams.get('state')).toBe('xyz');
      expect(noPkce.searchParams.get('iss')).toBe(API);
      expect((await back({ code_challenge_method: 'plain' })).searchParams.get('error')).toBe('invalid_request');
      expect((await back({ response_type: 'token' })).searchParams.get('error')).toBe('unsupported_response_type');
      expect((await back({ resource: 'https://outro.exemplo/mcp' })).searchParams.get('error')).toBe('invalid_target');
      expect(await t.db.first('SELECT id FROM oauth_pedidos')).toBeNull();
    });

    it('o pedido certo vai para a página Autorizar do site e espera 10 minutos', async () => {
      const t = await setup();
      const { clientId, pedido, location } = await t.openRequest({ resource: `${API}/mcp`, scope: 'notas:ler kanban:ler inventado', redirect_uri: null });
      expect(location).toBe(`https://site.teste/#/autorizar?pedido=${pedido}`);
      const row = await t.db.first<any>('SELECT * FROM oauth_pedidos WHERE id = ?', [pedido]);
      expect(row).toMatchObject({ cliente_id: clientId, retorno: CLAUDE, desafio: challenge, estado_cliente: 'xyz', recurso: `${API}/mcp`, escopos_pedidos: '["notas:ler","kanban:ler"]' });
      const token = await t.login();
      const seen = await t.body(t.call(`/v1/eu/oauth/pedidos/${pedido}`, { headers: { Authorization: `Bearer ${token}` } }));
      expect(seen).toEqual({
        disponivel: true,
        pedido: { id: pedido, cliente: 'Claude', retorno: CLAUDE, dominio: 'claude.ai', conhecido: 'Claude', local: false, escopos: ['notas:ler', 'kanban:ler'], expiraEm: row.expira_em },
      });
      t.clock.t += 10 * 60 * 1000 + 1;
      const late = await t.call(`/v1/eu/oauth/pedidos/${pedido}`, { headers: { Authorization: `Bearer ${token}` } });
      expect(late.status).toBe(404);
      expect(((await late.json()) as any).erro).toBe('pedido-nao-encontrado');
    });

    it('sem scope, vem o padrão; o retorno local é marcado', async () => {
      const t = await setup();
      const id = await t.client(['http://localhost:33418/callback']);
      const res = await t.authorize({ client_id: id, redirect_uri: 'http://localhost:33418/callback' });
      const pedido = /pedido=(op_[\w-]+)/.exec(res.headers.get('Location')!)![1]!;
      const token = await t.login();
      const seen = (await t.body(t.call(`/v1/eu/oauth/pedidos/${pedido}`, { headers: { Authorization: `Bearer ${token}` } }))).pedido;
      expect(seen).toMatchObject({ dominio: 'localhost', conhecido: null, local: true, escopos: [...ESCOPOS_SEM_PEDIDO] });
    });

    it('Permitir cria a chave do conector com o que a pessoa marcou e devolve o código, uma vez', async () => {
      const t = await setup();
      const { clientId, pedido } = await t.openRequest();
      const token = await t.login();
      // sem sessão, nada
      expect((await t.json('POST', `/v1/eu/oauth/pedidos/${pedido}/permitir`, { escopos: ['notas:ler'], validade: 30 })).status).toBe(401);
      const res = await t.json('POST', `/v1/eu/oauth/pedidos/${pedido}/permitir`, { escopos: ['notas:ler', 'notas:criar'], grupos: ['Trabalho'], validade: 30 }, token);
      expect(res.status).toBe(201);
      const out = (await res.json()) as any;
      const back = new URL(out.para);
      expect(back.origin + back.pathname).toBe(CLAUDE);
      expect(back.searchParams.get('code')).toMatch(/^[A-Za-z0-9_-]{43}$/);
      expect(back.searchParams.get('state')).toBe('xyz');
      expect(back.searchParams.get('iss')).toBe(API);
      expect(out.chave).toMatchObject({ nome: 'Claude', origem: 'oauth', escopos: ['notas:ler', 'notas:criar'], grupos: ['Trabalho'], aprovacao: 'mudancas' });
      const row = await t.db.first<any>('SELECT origem, cliente_id, hash, expira_em FROM api_chaves WHERE id = ?', [out.chave.id]);
      // o token de acesso só nasce na troca do código
      expect(row).toEqual({ origem: 'oauth', cliente_id: clientId, hash: null, expira_em: new Date(NOW.getTime() + 30 * 86_400_000).toISOString() });
      const code = await t.db.first<any>('SELECT chave_id, retorno, desafio FROM oauth_codigos');
      expect(code).toEqual({ chave_id: out.chave.id, retorno: CLAUDE, desafio: challenge });
      expect(await t.db.first('SELECT id FROM oauth_pedidos')).toBeNull();
      expect((await t.db.first<any>('SELECT usado_em FROM oauth_clientes WHERE id = ?', [clientId]))?.usado_em).toBe(NOW.toISOString());
      // a lista de Acessos mostra o conector
      const list = await t.body(t.call('/v1/eu/chaves', { headers: { Authorization: `Bearer ${token}` } }));
      expect(list.chaves.map((k: any) => k.origem)).toEqual(['oauth']);
      // o mesmo pedido não vale duas vezes
      expect((await t.json('POST', `/v1/eu/oauth/pedidos/${pedido}/permitir`, { escopos: ['notas:ler'], validade: 30 }, token)).status).toBe(404);
    });

    it('Permitir confere a escolha como a de uma chave, e só para quem pode usar a API', async () => {
      const t = await setup();
      const { pedido } = await t.openRequest();
      const token = await t.login();
      const bad = await t.json('POST', `/v1/eu/oauth/pedidos/${pedido}/permitir`, { escopos: ['tudo'], validade: 30 }, token);
      expect(bad.status).toBe(400);
      expect((await t.json('POST', `/v1/eu/oauth/pedidos/${pedido}/permitir`, { escopos: ['notas:ler'], validade: 2 }, token)).status).toBe(400);
      const closed = await setup({ ...ENV, API_CODIGOS: '' });
      const other = await closed.openRequest();
      const token2 = await closed.login();
      expect((await closed.body(closed.call(`/v1/eu/oauth/pedidos/${other.pedido}`, { headers: { Authorization: `Bearer ${token2}` } }))).disponivel).toBe(false);
      const refused = await closed.json('POST', `/v1/eu/oauth/pedidos/${other.pedido}/permitir`, { escopos: ['notas:ler'], validade: 30 }, token2);
      expect(refused.status).toBe(403);
    });

    it('Não permitir volta ao cliente com access_denied e apaga o pedido', async () => {
      const t = await setup();
      const { pedido } = await t.openRequest();
      const token = await t.login();
      const out = await t.body(t.json('POST', `/v1/eu/oauth/pedidos/${pedido}/recusar`, {}, token));
      const back = new URL(out.para);
      expect(back.searchParams.get('error')).toBe('access_denied');
      expect(back.searchParams.get('state')).toBe('xyz');
      expect(await t.db.first('SELECT id FROM oauth_pedidos')).toBeNull();
      expect(await t.db.first('SELECT id FROM api_chaves')).toBeNull();
    });

    it('sem o endereço do site, autorizar fica indisponível', async () => {
      const t = await setup({ ...ENV, SITE: '' });
      const id = await t.client();
      const res = await t.authorize({ client_id: id });
      expect(res.status).toBe(503);
    });
  });
}
