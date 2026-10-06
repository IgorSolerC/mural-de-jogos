import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { write } from '../src/domain/quota';
import { Config, Db, Deps } from '../src/ports';

/**
 * A mesma suíte roda em dois bancos: o D1 (simulado pelo Miniflare, `workers.test.ts`) e o SQLite do
 * Node (`node.test.ts`). Se algo só funcionar num deles, a outra rodada quebra.
 */
export const BASE_ENV = {
  MODO: 'ligado',
  ORIGENS: 'https://igorsolerc.github.io,http://localhost:4200',
  COTA_LINHAS_DIA: '1000',
  GOOGLE_CLIENT_ID: 'teste.apps.googleusercontent.com',
};

const TABLES = ['usuarios', 'sessoes', 'murais', 'murais_publicos', 'seguindo', 'atividades', 'uso_diario'];
const NOW = new Date('2026-10-06T15:00:00Z');

/** No lugar das chaves do Google: um par gerado na hora, e um segundo par para assinaturas falsas. */
let googleKey: CryptoKey;
let otherKey: CryptoKey;
let publicJwk: JWK;

export interface TokenOptions {
  sub?: string;
  aud?: string;
  iss?: string;
  givenName?: string;
  expiresIn?: string;
  key?: 'google' | 'outra';
  issuedAt?: Date;
}

/** Um ID token como o que o botão do Google entrega. */
export async function googleToken(o: TokenOptions = {}): Promise<string> {
  const jwt = new SignJWT({ ...(o.givenName ? { given_name: o.givenName } : {}), email: 'nao-deve-ser-guardado@example.com' })
    .setProtectedHeader({ alg: 'RS256', kid: 'teste' })
    .setSubject(o.sub ?? '1234567890')
    .setAudience(o.aud ?? BASE_ENV.GOOGLE_CLIENT_ID)
    .setIssuer(o.iss ?? 'https://accounts.google.com')
    .setIssuedAt(o.issuedAt ?? new Date())
    .setExpirationTime(o.expiresIn ?? '1h');
  return jwt.sign(o.key === 'outra' ? otherKey : googleKey);
}

export function apiSuite(label: string, getDb: () => Db) {
  beforeAll(async () => {
    const google = await generateKeyPair('RS256', { extractable: true });
    googleKey = google.privateKey;
    publicJwk = { ...(await exportJWK(google.publicKey)), kid: 'teste', alg: 'RS256' };
    otherKey = (await generateKeyPair('RS256')).privateKey;
  });

  async function setup(env: Record<string, string> = {}, now = NOW) {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config: Config = readConfig({ ...BASE_ENV, ...env });
    const keys = createLocalJWKSet({ keys: [publicJwk] });
    const deps: Deps = { db, config, now: () => now, verifyGoogle: googleVerifier(config.googleClientId, keys) };
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
    const json = (method: string, path: string, body?: unknown, token?: string) =>
      call(path, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `Bearer ${token}` } : {}) },
        ...(body === undefined ? {} : { body: JSON.stringify(body) }),
      });
    /** Entra com um token do Google e devolve a resposta já lida. */
    const login = async (o: TokenOptions = {}, extra: Record<string, unknown> = {}) => {
      const res = await json('POST', '/v1/auth/google', { credential: await googleToken(o), ...extra });
      return { res, body: (await res.json()) as any };
    };
    return { db, deps, app, call, json, login };
  }

  describe(`API (${label})`, () => {
    it('cria todas as tabelas da migração', async () => {
      const db = getDb();
      const rows = await db.all<{ name: string }>("SELECT name FROM sqlite_master WHERE type = 'table'");
      const names = rows.map((r) => r.name);
      for (const t of TABLES) expect(names).toContain(t);
    });

    it('o /v1/status responde com o modo e o uso do dia', async () => {
      const { call } = await setup();
      const res = await call('/v1/status');
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({
        versao: 1,
        modo: 'ligado',
        dia: '2026-10-06',
        gravacoes: 0,
        linhasGravadas: 0,
        cotaLinhas: 1000,
      });
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
    });

    it('endereço desconhecido responde 404 no formato de erro', async () => {
      const { call } = await setup();
      const res = await call('/v1/nada');
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ erro: 'nao-encontrado' });
    });

    describe('interruptor (MODO)', () => {
      it('desligado: só o /v1/status responde', async () => {
        const { call } = await setup({ MODO: 'desligado' });
        expect((await call('/v1/status')).status).toBe(200);
        const res = await call('/v1/nada');
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ erro: 'nuvem-desligada' });
      });

      it('só leitura: GET passa, gravação é recusada', async () => {
        const { call } = await setup({ MODO: 'so-leitura' });
        expect((await call('/v1/nada')).status).toBe(404);
        const res = await call('/v1/nada', { method: 'POST' });
        expect(res.status).toBe(503);
        expect(await res.json()).toMatchObject({ erro: 'nuvem-so-leitura' });
      });

      it('valor desconhecido (erro de digitação) desliga', async () => {
        const { call } = await setup({ MODO: 'Ligado ' });
        const status = await (await call('/v1/status')).json();
        expect(status).toMatchObject({ modo: 'desligado' });
        expect((await call('/v1/nada')).status).toBe(503);
      });
    });

    describe('CORS', () => {
      it('libera só as origens configuradas', async () => {
        const { call } = await setup();
        const ok = await call('/v1/status', { headers: { Origin: 'https://igorsolerc.github.io' } });
        expect(ok.headers.get('Access-Control-Allow-Origin')).toBe('https://igorsolerc.github.io');
        const other = await call('/v1/status', { headers: { Origin: 'https://outro.site' } });
        expect(other.headers.get('Access-Control-Allow-Origin')).toBeNull();
      });

      it('a pré-consulta (OPTIONS) libera os cabeçalhos da sincronização e fica guardada', async () => {
        const { call } = await setup();
        const res = await call('/v1/eu/mural', {
          method: 'OPTIONS',
          headers: {
            Origin: 'http://localhost:4200',
            'Access-Control-Request-Method': 'PUT',
            'Access-Control-Request-Headers': 'authorization,if-match',
          },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4200');
        expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('if-match');
        expect(res.headers.get('Access-Control-Max-Age')).toBe('86400');
      });

      it('erros também levam o CORS (o site consegue ler a mensagem)', async () => {
        const { call } = await setup({ MODO: 'desligado' });
        const res = await call('/v1/nada', { headers: { Origin: 'https://igorsolerc.github.io' } });
        expect(res.status).toBe(503);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('https://igorsolerc.github.io');
      });
    });

    describe('cota de gravações', () => {
      const insert = (codigo: string) => ({
        sql: 'INSERT INTO usuarios (id, google_sub, codigo, nome, criado_em) VALUES (?, ?, ?, ?, ?)',
        params: [`id-${codigo}`, `sub-${codigo}`, codigo, 'Teste', NOW.toISOString()],
      });

      it('grava e anota o uso no mesmo lote', async () => {
        const { deps, db, call } = await setup();
        const [result] = await write(deps, [insert('AAAA1111')], 3);
        expect(result!.changes).toBe(1);
        expect(await db.first('SELECT codigo FROM usuarios')).toEqual({ codigo: 'AAAA1111' });
        expect(await (await call('/v1/status')).json()).toMatchObject({ gravacoes: 1, linhasGravadas: 4 });
      });

      it('passou da cota: recusa com 503 cota-diaria e não grava nada', async () => {
        const { deps, db } = await setup({ COTA_LINHAS_DIA: '10' });
        await write(deps, [insert('AAAA1111')], 5); // usa 6
        await expect(write(deps, [insert('BBBB2222')], 5)).rejects.toMatchObject({ status: 503, code: 'cota-diaria' });
        expect(await db.all('SELECT codigo FROM usuarios')).toHaveLength(1);
        expect(await db.first('SELECT linhas_gravadas FROM uso_diario')).toEqual({ linhas_gravadas: 6 });
      });

      it('a cota recomeça no dia UTC seguinte', async () => {
        const { db } = await setup({ COTA_LINHAS_DIA: '10' });
        const config = readConfig({ ...BASE_ENV, COTA_LINHAS_DIA: '10' });
        await write({ db, config, now: () => new Date('2026-10-06T23:59:00Z'), verifyGoogle: null! }, [insert('AAAA1111')], 8);
        await write({ db, config, now: () => new Date('2026-10-07T00:01:00Z'), verifyGoogle: null! }, [insert('BBBB2222')], 8);
        expect(await db.all('SELECT dia FROM uso_diario ORDER BY dia')).toEqual([{ dia: '2026-10-06' }, { dia: '2026-10-07' }]);
      });

      it('cota inválida ou ausente bloqueia toda gravação', async () => {
        const { deps } = await setup({ COTA_LINHAS_DIA: 'muito' });
        await expect(write(deps, [insert('AAAA1111')], 1)).rejects.toMatchObject({ code: 'cota-diaria' });
      });

      it('com a nuvem em só leitura ou desligada, não grava', async () => {
        for (const MODO of ['so-leitura', 'desligado']) {
          const { deps, db } = await setup({ MODO });
          await expect(write(deps, [insert('AAAA1111')], 1)).rejects.toMatchObject({ status: 503 });
          expect(await db.all('SELECT * FROM usuarios')).toHaveLength(0);
          expect(await db.all('SELECT * FROM uso_diario')).toHaveLength(0);
        }
      });

      it('um erro no meio do lote desfaz tudo, inclusive a anotação do uso', async () => {
        const { deps, db } = await setup();
        await expect(write(deps, [insert('AAAA1111'), insert('AAAA1111')], 2)).rejects.toThrow();
        expect(await db.all('SELECT * FROM usuarios')).toHaveLength(0);
        expect(await db.all('SELECT * FROM uso_diario')).toHaveLength(0);
      });
    });

    describe('limpeza diária', () => {
      it('apaga sessões vencidas, atividades de mais de 90 dias e uso de mais de 30 dias', async () => {
        const { deps, db } = await setup();
        await db.batch([
          { sql: "INSERT INTO sessoes VALUES ('velha', 'u', '2026-01-01', '2026-01-01', '2026-10-01T00:00:00Z', NULL)" },
          { sql: "INSERT INTO sessoes VALUES ('nova', 'u', '2026-10-01', '2026-10-01', '2026-12-30T00:00:00Z', NULL)" },
          { sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, criado_em) VALUES ('seguiu', 'a', 'b', '2026-06-01T00:00:00Z')" },
          { sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, criado_em) VALUES ('seguiu', 'a', 'c', '2026-09-01T00:00:00Z')" },
          { sql: "INSERT INTO uso_diario VALUES ('2026-08-01', 5, 1)" },
          { sql: "INSERT INTO uso_diario VALUES ('2026-10-01', 5, 1)" },
        ]);
        await cleanup(deps);
        expect(await db.all('SELECT hash FROM sessoes')).toEqual([{ hash: 'nova' }]);
        expect(await db.all('SELECT alvo_id FROM atividades')).toEqual([{ alvo_id: 'c' }]);
        expect(await db.all('SELECT dia FROM uso_diario')).toEqual([{ dia: '2026-10-01' }]);
      });

      it('não roda com a nuvem desligada', async () => {
        const { deps, db } = await setup({ MODO: 'desligado' });
        await db.batch([{ sql: "INSERT INTO uso_diario VALUES ('2026-01-01', 5, 1)" }]);
        await cleanup(deps);
        expect(await db.all('SELECT dia FROM uso_diario')).toHaveLength(1);
      });
    });

    describe('índices únicos das atividades', () => {
      it('seguir de novo não cria outra notificação; a mesma resenha também não', async () => {
        const { db } = await setup();
        const follow = { sql: "INSERT OR IGNORE INTO atividades (tipo, autor_id, alvo_id, criado_em) VALUES ('seguiu', 'a', 'b', '2026-10-06')" };
        const review = { sql: "INSERT OR IGNORE INTO atividades (tipo, autor_id, ref, criado_em) VALUES ('resenha', 'a', 'r1', '2026-10-06')" };
        await db.batch([follow, follow, review, review]);
        expect(await db.all('SELECT tipo FROM atividades ORDER BY tipo')).toEqual([{ tipo: 'resenha' }, { tipo: 'seguiu' }]);
      });
    });

    describe('login com Google', () => {
      it('primeiro login cria a conta com código, nome e sessão; o e-mail não é guardado', async () => {
        const { login, db } = await setup();
        const { res, body } = await login({ givenName: 'Igor' }, { nome: '  Igor   Soler ', aparelho: 'Chrome no Windows' });
        expect(res.status).toBe(200);
        expect(body.conta).toMatchObject({ nome: 'Igor Soler', nova: true });
        expect(body.conta.codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
        expect(body.token).toMatch(/^[A-Za-z0-9_-]{43}$/);
        const user = await db.first<Record<string, unknown>>('SELECT * FROM usuarios');
        expect(user).toMatchObject({ google_sub: '1234567890', nome: 'Igor Soler', codigo: body.conta.codigo.replace('-', '') });
        expect(JSON.stringify(await db.all('SELECT * FROM usuarios'))).not.toContain('example.com');
        const session = await db.first<{ hash: string; aparelho: string }>('SELECT hash, aparelho FROM sessoes');
        expect(session!.aparelho).toBe('Chrome no Windows');
        expect(session!.hash).toMatch(/^[0-9a-f]{64}$/);
        expect(session!.hash).not.toBe(body.token);
      });

      it('sem nome escolhido, usa o primeiro nome do Google; sem os dois, "Sem nome"', async () => {
        const { login } = await setup();
        expect((await login({ sub: 'a', givenName: 'Marina' })).body.conta.nome).toBe('Marina');
        expect((await login({ sub: 'b' })).body.conta.nome).toBe('Sem nome');
      });

      it('o segundo login entra na mesma conta, com outra sessão', async () => {
        const { login, db } = await setup();
        const first = await login();
        const second = await login({}, { nome: 'Outro nome' });
        expect(second.body.conta).toEqual({ ...first.body.conta, nova: false });
        expect(second.body.token).not.toBe(first.body.token);
        expect(await db.all('SELECT * FROM usuarios')).toHaveLength(1);
        expect(await db.all('SELECT * FROM sessoes')).toHaveLength(2);
      });

      it.each([
        ['de outro app (aud)', { aud: 'outro.apps.googleusercontent.com' }],
        ['de outro emissor (iss)', { iss: 'https://accounts.example.com' }],
        ['assinado por outra chave', { key: 'outra' as const }],
        ['vencido', { expiresIn: '-5m', issuedAt: new Date(Date.now() - 3_600_000) }],
      ])('recusa token %s', async (_label, options) => {
        const { login, db } = await setup();
        const { res, body } = await login(options);
        expect(res.status).toBe(401);
        expect(body.erro).toBe('login-invalido');
        expect(await db.all('SELECT * FROM usuarios')).toHaveLength(0);
      });

      it('recusa pedido sem credencial ou com JSON quebrado', async () => {
        const { json, call } = await setup();
        expect((await json('POST', '/v1/auth/google', {})).status).toBe(400);
        const res = await call('/v1/auth/google', { method: 'POST', body: '{nada' });
        expect(res.status).toBe(400);
        expect(((await res.json()) as any).erro).toBe('json-invalido');
      });

      it('sem Client ID configurado, o login responde 503', async () => {
        const { login } = await setup({ GOOGLE_CLIENT_ID: '' });
        const { res, body } = await login();
        expect(res.status).toBe(503);
        expect(body.erro).toBe('login-indisponivel');
      });

      it('no máximo 10 logins por conta em 24 horas', async () => {
        const { login } = await setup();
        for (let i = 0; i < 10; i++) expect((await login()).res.status).toBe(200);
        const { res, body } = await login();
        expect(res.status).toBe(429);
        expect(body.erro).toBe('muitos-logins');
      });

      it('guarda no máximo 10 sessões por conta, tirando a usada há mais tempo', async () => {
        const { db, json } = await setup();
        const first = await setupLogin(json)();
        // a primeira é a usada há mais tempo; criada_em antiga só para não esbarrar no freio de logins
        await db.batch([{ sql: "UPDATE sessoes SET usada_em = '2026-01-01T00:00:00Z'" }]);
        for (let i = 0; i < 10; i++) {
          await db.batch([{ sql: "UPDATE sessoes SET criada_em = '2026-01-01T00:00:00Z'" }]);
          await setupLogin(json)();
        }
        expect(await db.all('SELECT * FROM sessoes')).toHaveLength(10);
        expect((await json('GET', '/v1/eu', undefined, first)).status).toBe(401);
      });
    });

    describe('sessão e conta', () => {
      it('GET /v1/eu responde com a sessão e recusa sem ela', async () => {
        const { login, json } = await setup();
        const { body } = await login({}, { nome: 'Igor' });
        const me = await json('GET', '/v1/eu', undefined, body.token);
        expect(me.status).toBe(200);
        expect(await me.json()).toEqual({ codigo: body.conta.codigo, nome: 'Igor', criadoEm: NOW.toISOString(), seguidores: 0, seguindo: 0 });
        for (const token of [undefined, 'x', 'A'.repeat(43)]) {
          const res = await json('GET', '/v1/eu', undefined, token);
          expect(res.status).toBe(401);
          expect(((await res.json()) as any).erro).toBe('sessao-invalida');
        }
      });

      it('sessão vencida não entra; sessão usada há mais de um dia é renovada', async () => {
        const { login, db, deps } = await setup();
        const { body } = await login();
        const later = (days: number) => createApp({ ...deps, now: () => new Date(NOW.getTime() + days * 86_400_000) });
        const get = (days: number) =>
          later(days).request('https://api.teste/v1/eu', { headers: { Authorization: `Bearer ${body.token}` } });
        expect((await get(2)).status).toBe(200);
        const renewed = await db.first<{ usada_em: string; expira_em: string }>('SELECT usada_em, expira_em FROM sessoes');
        expect(renewed!.usada_em).toBe(new Date(NOW.getTime() + 2 * 86_400_000).toISOString());
        expect(renewed!.expira_em).toBe(new Date(NOW.getTime() + 92 * 86_400_000).toISOString());
        expect((await get(93)).status).toBe(401);
      });

      it('sair encerra só esta sessão; sair de todos encerra todas', async () => {
        const { login, json } = await setup();
        const a = (await login()).body.token;
        const b = (await login()).body.token;
        const c = (await login()).body.token;
        expect((await json('POST', '/v1/auth/sair', undefined, a)).status).toBe(200);
        expect((await json('GET', '/v1/eu', undefined, a)).status).toBe(401);
        expect((await json('GET', '/v1/eu', undefined, b)).status).toBe(200);
        expect((await json('POST', '/v1/auth/sair-de-todos', undefined, b)).status).toBe(200);
        expect((await json('GET', '/v1/eu', undefined, b)).status).toBe(401);
        expect((await json('GET', '/v1/eu', undefined, c)).status).toBe(401);
      });

      it('troca o nome público, limpo e com limite', async () => {
        const { login, json, db } = await setup();
        const { token } = (await login()).body;
        const res = await json('PATCH', '/v1/eu', { nome: '  Igor\u0000 \u200b Soler  ' }, token);
        expect(await res.json()).toEqual({ nome: 'Igor Soler' });
        expect(((await json('PATCH', '/v1/eu', { nome: '   ' }, token)).status)).toBe(400);
        await json('PATCH', '/v1/eu', { nome: 'x'.repeat(80) }, token);
        expect(await db.first('SELECT nome FROM usuarios')).toEqual({ nome: 'x'.repeat(40) });
      });

      it('apagar a conta tira tudo dela e só dela', async () => {
        const { login, json, db } = await setup();
        const mine = (await login({ sub: 'eu' })).body;
        const other = (await login({ sub: 'outro' })).body;
        const ids = await db.all<{ id: string; google_sub: string }>('SELECT id, google_sub FROM usuarios');
        const me = ids.find((u) => u.google_sub === 'eu')!.id;
        const them = ids.find((u) => u.google_sub === 'outro')!.id;
        await db.batch([
          { sql: "INSERT INTO murais VALUES (?, 1, x'1f8b', 2, '2026-10-06')", params: [me] },
          { sql: "INSERT INTO murais_publicos VALUES (?, 1, x'1f8b', 2, '2026-10-06')", params: [me] },
          { sql: "INSERT INTO murais VALUES (?, 1, x'1f8b', 2, '2026-10-06')", params: [them] },
          { sql: "INSERT INTO seguindo VALUES (?, ?, '2026-10-06')", params: [me, them] },
          { sql: "INSERT INTO seguindo VALUES (?, ?, '2026-10-06')", params: [them, me] },
          { sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, criado_em) VALUES ('seguiu', ?, ?, '2026-10-06')", params: [them, me] },
          { sql: "INSERT INTO atividades (tipo, autor_id, ref, criado_em) VALUES ('resenha', ?, 'r1', '2026-10-06')", params: [me] },
          { sql: "INSERT INTO atividades (tipo, autor_id, ref, criado_em) VALUES ('resenha', ?, 'r2', '2026-10-06')", params: [them] },
        ]);
        expect((await json('DELETE', '/v1/eu', undefined, mine.token)).status).toBe(200);
        expect(await db.all('SELECT google_sub FROM usuarios')).toEqual([{ google_sub: 'outro' }]);
        expect(await db.all('SELECT usuario_id FROM sessoes')).toEqual([{ usuario_id: them }]);
        expect(await db.all('SELECT usuario_id FROM murais')).toEqual([{ usuario_id: them }]);
        expect(await db.all('SELECT * FROM murais_publicos')).toHaveLength(0);
        expect(await db.all('SELECT * FROM seguindo')).toHaveLength(0);
        expect(await db.all('SELECT ref FROM atividades')).toEqual([{ ref: 'r2' }]);
        expect((await json('GET', '/v1/eu', undefined, other.token)).status).toBe(200);
      });

      it('apagar a conta funciona mesmo com a cota do dia esgotada', async () => {
        const { login, json, db, deps } = await setup();
        const { token } = (await login()).body;
        await db.batch([{ sql: 'UPDATE uso_diario SET linhas_gravadas = ?', params: [deps.config.dailyRowBudget] }]);
        expect((await json('DELETE', '/v1/eu', undefined, token)).status).toBe(200);
        expect(await db.all('SELECT * FROM usuarios')).toHaveLength(0);
      });

      it('com a nuvem em só leitura, o GET /v1/eu funciona e o login é recusado', async () => {
        const { login, db, app } = await setup();
        const { token } = (await login()).body;
        const readOnly = createApp({ db, config: readConfig({ ...BASE_ENV, MODO: 'so-leitura' }), now: () => NOW, verifyGoogle: null! });
        const headers = { Authorization: `Bearer ${token}` };
        expect((await readOnly.request('https://api.teste/v1/eu', { headers })).status).toBe(200);
        expect((await readOnly.request('https://api.teste/v1/auth/google', { method: 'POST', body: '{}' })).status).toBe(503);
        void app;
      });
    });
  });
}

/** Um login direto pela rota, devolvendo só o token (para os testes de muitas sessões). */
function setupLogin(json: (m: string, p: string, b?: unknown, t?: string) => Response | Promise<Response>) {
  return async () => {
    const res = await json('POST', '/v1/auth/google', { credential: await googleToken() });
    return ((await res.json()) as { token: string }).token;
  };
}
