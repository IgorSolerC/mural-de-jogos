import { describe, expect, it } from 'vitest';
import { ESCOPOS_DO_OAUTH, REGISTROS_POR_IP } from '../../contrato/api-v1/oauth';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, noGoogle } from './harness';

/**
 * O OAuth dos conectores (PLANO-API.md, rodada 5): os metadados, o registro de cliente e, nos passos
 * seguintes, autorizar, os tokens e a revogação. Roda nos dois bancos.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };
const API = 'https://api.teste';

export function oauthSuite(label: string, getDb: () => Db) {
  async function setup() {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const clock = { t: NOW.getTime() };
    const deps: Deps = { db, config: readConfig(ENV), now: () => new Date(clock.t), verifyGoogle: noGoogle };
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`${API}${path}`, init);
    const body = async (res: Response | Promise<Response>) => (await (await res).json()) as any;
    const register = (meta: Record<string, unknown>, ip = '203.0.113.7') =>
      call('/oauth/registrar', { method: 'POST', headers: { 'Content-Type': 'application/json', 'CF-Connecting-IP': ip }, body: JSON.stringify(meta) });
    return { db, clock, call, body, register };
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
}
