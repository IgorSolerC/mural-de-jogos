import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { write } from '../src/domain/quota';
import { toBytes } from '../src/routes/mural';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, gunzip, gzip, jsonCaller, noGoogle } from './harness';

/**
 * A mesma suíte roda em dois bancos: o D1 (simulado pelo Miniflare, `workers.test.ts`) e o SQLite do
 * Node (`node.test.ts`). Se algo só funcionar num deles, a outra rodada quebra.
 */

/** No lugar das chaves do Google: um par gerado na hora, e um segundo par para assinaturas falsas. */
let googleKey: CryptoKey;
let otherKey: CryptoKey;
let publicJwk: JWK;

interface TokenOptions {
  sub?: string;
  aud?: string;
  iss?: string;
  givenName?: string;
  expiresIn?: string;
  key?: 'google' | 'outra';
  issuedAt?: Date;
}

/** Um ID token como o que o botão do Google entrega. */
async function googleToken(o: TokenOptions = {}): Promise<string> {
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
    const clock = { t: now.getTime() };
    const deps: Deps = { db, config, now: () => new Date(clock.t), verifyGoogle: googleVerifier(config.googleClientId, keys) };
    /** Passa o tempo (o limite entre envios do mural é de 3 segundos). */
    const advance = (ms: number) => {
      clock.t += ms;
    };
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
    const json = jsonCaller(call);
    /** Entra com um token do Google e devolve a resposta já lida. */
    const login = async (o: TokenOptions = {}, extra: Record<string, unknown> = {}) => {
      const res = await json('POST', '/v1/auth/google', { credential: await googleToken(o), ...extra });
      return { res, body: (await res.json()) as any };
    };
    /** Envia o mural como o site envia: multipart com o privado, o público e as resenhas novas. */
    const push = async (token: string, base: number | null, docs: { privado?: string; publico?: string; novas?: unknown; raw?: Uint8Array<ArrayBuffer> } = {}) => {
      const form = new FormData();
      form.append('privado', new Blob([docs.raw ?? (await gzip(docs.privado ?? '{"reviews":[]}'))], { type: 'application/gzip' }));
      form.append('publico', new Blob([await gzip(docs.publico ?? '{"reviews":[]}')], { type: 'application/gzip' }));
      if (docs.novas !== undefined) form.append('novas', JSON.stringify(docs.novas));
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (base !== null) headers['Mural-Rev-Base'] = String(base);
      const res = await call('/v1/eu/mural', { method: 'PUT', headers, body: form });
      advance(5_000);
      return { res, body: (await res.json()) as any };
    };
    const pull = (token: string, rev?: number) =>
      call(`/v1/eu/mural${rev === undefined ? '' : `?rev=${rev}`}`, { headers: { Authorization: `Bearer ${token}` } });
    return { db, deps, app, call, json, login, advance, push, pull };
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

    it('responde com a hora da nuvem, exposta ao site', async () => {
      const { call } = await setup();
      const res = await call('/v1/status', { headers: { Origin: 'https://igorsolerc.github.io' } });
      expect(res.headers.get('Mural-Agora')).toBe(NOW.toISOString());
      expect(res.headers.get('Access-Control-Expose-Headers')).toContain('Mural-Agora');
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
            'Access-Control-Request-Headers': 'authorization,mural-rev-base',
          },
        });
        expect(res.status).toBe(204);
        expect(res.headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4200');
        expect(res.headers.get('Access-Control-Allow-Headers')?.toLowerCase()).toContain('mural-rev-base');
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
        await write({ db, config, now: () => new Date('2026-10-06T23:59:00Z'), verifyGoogle: noGoogle }, [insert('AAAA1111')], 8);
        await write({ db, config, now: () => new Date('2026-10-07T00:01:00Z'), verifyGoogle: noGoogle }, [insert('BBBB2222')], 8);
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
          { sql: "INSERT INTO freios VALUES ('u', 'reagir', '2026-10-04T00:00:00Z')" },
          { sql: "INSERT INTO freios VALUES ('u', 'entrar', '2026-10-06T10:00:00Z')" },
        ]);
        await cleanup(deps);
        expect(await db.all('SELECT acao FROM freios')).toEqual([{ acao: 'entrar' }]);
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
        expect(body.conta.id).toMatch(/^[0-9a-f-]{36}$/);
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

      it('sair não devolve a vaga no limite de logins do dia', async () => {
        const { login, json } = await setup();
        for (let i = 0; i < 10; i++) {
          const { res, body } = await login();
          expect(res.status).toBe(200);
          expect((await json('POST', '/v1/auth/sair', undefined, body.token)).status).toBe(200);
        }
        const { res, body } = await login();
        expect(res.status).toBe(429);
        expect(body.erro).toBe('muitos-logins');
      });

      it('guarda no máximo 10 sessões por conta, tirando a usada há mais tempo', async () => {
        const { db, json, login } = await setup();
        const first = (await login()).body.token as string;
        // a primeira é a usada há mais tempo; os freios antigos só para não esbarrar no limite de logins
        await db.batch([{ sql: "UPDATE sessoes SET usada_em = '2026-01-01T00:00:00Z'" }]);
        for (let i = 0; i < 10; i++) {
          await db.batch([{ sql: "UPDATE freios SET criado_em = '2026-01-01T00:00:00Z'" }]);
          await login();
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
        expect(await me.json()).toEqual({ id: body.conta.id, codigo: body.conta.codigo, nome: 'Igor', criadoEm: NOW.toISOString(), seguidores: 0, seguindo: 0 });
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
          { sql: "INSERT INTO murais (usuario_id, rev, dados, bytes, atualizado_em) VALUES (?, 1, x'1f8b', 2, '2026-10-06')", params: [me] },
          { sql: "INSERT INTO murais_publicos VALUES (?, 1, x'1f8b', 2, '2026-10-06')", params: [me] },
          { sql: "INSERT INTO murais (usuario_id, rev, dados, bytes, atualizado_em) VALUES (?, 1, x'1f8b', 2, '2026-10-06')", params: [them] },
          { sql: "INSERT INTO seguindo (seguidor_id, seguido_id, criado_em) VALUES (?, ?, '2026-10-06')", params: [me, them] },
          { sql: "INSERT INTO seguindo (seguidor_id, seguido_id, criado_em) VALUES (?, ?, '2026-10-06')", params: [them, me] },
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
        const { login, db } = await setup();
        const { token } = (await login()).body;
        const readOnly = createApp({ db, config: readConfig({ ...BASE_ENV, MODO: 'so-leitura' }), now: () => NOW, verifyGoogle: noGoogle });
        const headers = { Authorization: `Bearer ${token}` };
        expect((await readOnly.request('https://api.teste/v1/eu', { headers })).status).toBe(200);
        expect((await readOnly.request('https://api.teste/v1/auth/google', { method: 'POST', body: '{}' })).status).toBe(503);
      });
    });

    describe('mural', () => {
      const review = (ref: string, titulo = `Jogo ${ref}`) => ({ ref, titulo, mural: 'jogos' });

      it('sem mural ainda: 404 sem-mural', async () => {
        const { login, pull } = await setup();
        const { token } = (await login()).body;
        const res = await pull(token);
        expect(res.status).toBe(404);
        expect(((await res.json()) as any).erro).toBe('sem-mural');
      });

      it('envia (rev 0 → 1), baixa igual, e com a mesma rev responde 204 sem corpo', async () => {
        const { login, push, pull } = await setup();
        const { token } = (await login()).body;
        const sent = await push(token, 0, { privado: '{"reviews":[{"id":"r1"}]}' });
        expect(sent.res.status).toBe(200);
        expect(sent.body).toEqual({ rev: 1, novas: 0 });
        const res = await pull(token);
        expect(res.status).toBe(200);
        expect(res.headers.get('Mural-Rev')).toBe('1');
        expect(res.headers.get('Content-Type')).toBe('application/gzip');
        expect(await gunzip(await res.arrayBuffer())).toBe('{"reviews":[{"id":"r1"}]}');
        const same = await pull(token, 1);
        expect(same.status).toBe(204);
        expect(same.headers.get('Mural-Rev')).toBe('1');
        expect(await same.text()).toBe('');
      });

      it('dois aparelhos: quem envia com a rev velha recebe 409 e nada dele entra', async () => {
        const { login, push, pull, db } = await setup();
        const { token } = (await login()).body;
        await push(token, 0, { privado: '{"v":"A1"}', publico: '{"p":"A1"}' });
        expect((await push(token, 1, { privado: '{"v":"A2"}', publico: '{"p":"A2"}', novas: [review('rA2x')] })).body.rev).toBe(2);
        const late = await push(token, 1, { privado: '{"v":"B"}', publico: '{"p":"B"}', novas: [review('rBxx')] });
        expect(late.res.status).toBe(409);
        expect(late.body).toMatchObject({ erro: 'conflito', rev: 2 });
        expect(await gunzip(await (await pull(token)).arrayBuffer())).toBe('{"v":"A2"}');
        const pub = await db.first<{ rev: number; dados: unknown }>('SELECT rev, dados FROM murais_publicos');
        expect(pub!.rev).toBe(2);
        expect(await gunzip(toBytes(pub!.dados).slice().buffer as ArrayBuffer)).toBe('{"p":"A2"}');
        expect((await db.all<{ ref: string }>('SELECT ref FROM atividades')).map((a) => a.ref)).toEqual(['rA2x']);
        // o primeiro envio de outro aparelho (rev 0) também não passa por cima
        expect((await push(token, 0, { privado: '{"v":"C"}' })).res.status).toBe(409);
      });

      it('resenhas novas viram atividade uma vez só, com título e mural', async () => {
        const { login, push, db } = await setup();
        const { token } = (await login()).body;
        await push(token, 0, { novas: [review('r0001', 'Hollow  Knight\u200b'), { ref: 'x', titulo: 'ruim', mural: 'jogos' }, review('r0001')] });
        await push(token, 1, { novas: [review('r0001'), review('r0002')] });
        const rows = await db.all<{ ref: string; resumo: string }>('SELECT ref, resumo FROM atividades ORDER BY ref');
        expect(rows.map((r) => r.ref)).toEqual(['r0001', 'r0002']);
        expect(JSON.parse(rows[0]!.resumo)).toEqual({ titulo: 'Hollow Knight', mural: 'jogos' });
      });

      it('no máximo 10 resenhas novas por envio e 30 por dia', async () => {
        const { login, push, db } = await setup();
        const { token } = (await login()).body;
        const batch = (from: number) => Array.from({ length: 12 }, (_, i) => review(`r${String(from + i).padStart(4, '0')}`));
        let rev = 0;
        for (const from of [0, 100, 200, 300]) rev = (await push(token, rev, { novas: batch(from) })).body.rev;
        expect(await db.first('SELECT COUNT(*) AS n FROM atividades')).toEqual({ n: 30 });
      });

      it('recusa o que não é gzip, o grande demais e o envio sem rev', async () => {
        const { login, push } = await setup();
        const { token } = (await login()).body;
        const notGzip = await push(token, 0, { raw: new Uint8Array(new TextEncoder().encode('{"reviews":[]} só texto puro aqui')) });
        expect(notGzip.res.status).toBe(400);
        const big = new Uint8Array(1_900_001);
        big[0] = 0x1f;
        big[1] = 0x8b;
        const tooBig = await push(token, 0, { raw: big });
        expect(tooBig.res.status).toBe(413);
        expect(tooBig.body.erro).toBe('mural-grande-demais');
        expect((await push(token, null)).res.status).toBe(400);
      });

      it('dois envios em menos de 3 segundos: o segundo espera (429)', async () => {
        const { login, push, advance } = await setup();
        const { token } = (await login()).body;
        await push(token, 0);
        advance(-4_000); // volta para 1 segundo depois do primeiro
        const res = await push(token, 1);
        expect(res.res.status).toBe(429);
        expect((await push(token, 1)).res.status).toBe(200);
      });

      it('sem sessão, nada', async () => {
        const { call } = await setup();
        expect((await call('/v1/eu/mural')).status).toBe(401);
        expect((await call('/v1/eu/mural', { method: 'PUT' })).status).toBe(401);
      });
    });

    describe('mural público pelo código', () => {
      it('qualquer um abre só o público, pelo código digitado de qualquer jeito; 204 sem mudança', async () => {
        const { login, push, call } = await setup();
        const { token, conta } = (await login()).body;
        await push(token, 0, { privado: '{"privado":true}', publico: '{"reviews":["publica"]}' });
        const typed = conta.codigo.toLowerCase().replace('-', ' ');
        const res = await call(`/v1/murais/${encodeURIComponent(typed)}`);
        expect(res.status).toBe(200);
        expect(res.headers.get('Mural-Rev')).toBe('1');
        expect(res.headers.get('Mural-Codigo')).toBe(conta.codigo);
        expect(await gunzip(await res.arrayBuffer())).toBe('{"reviews":["publica"]}');
        expect((await call(`/v1/murais/${conta.codigo}?rev=1`)).status).toBe(204);
      });

      it('código desconhecido, inválido ou sem mural: 404', async () => {
        const { login, call } = await setup();
        const { conta } = (await login()).body;
        for (const code of ['ZZZZ-ZZZZ', 'nada', conta.codigo]) {
          const res = await call(`/v1/murais/${code}`);
          expect(res.status).toBe(404);
          expect(((await res.json()) as any).erro).toBe('mural-nao-encontrado');
        }
      });

      it('com VER_MURAIS=logados, só quem tem sessão abre', async () => {
        const { login, push, db } = await setup();
        const { token, conta } = (await login()).body;
        await push(token, 0);
        const closed = createApp({ db, config: readConfig({ ...BASE_ENV, VER_MURAIS: 'logados' }), now: () => NOW, verifyGoogle: noGoogle });
        expect((await closed.request(`https://api.teste/v1/murais/${conta.codigo}`)).status).toBe(401);
        const withSession = await closed.request(`https://api.teste/v1/murais/${conta.codigo}`, { headers: { Authorization: `Bearer ${token}` } });
        expect(withSession.status).toBe(200);
      });

      it('trocar o código: o novo abre, o antigo para', async () => {
        const { login, push, json, call } = await setup();
        const { token, conta } = (await login()).body;
        await push(token, 0);
        const res = await json('POST', '/v1/eu/codigo', undefined, token);
        const { codigo } = (await res.json()) as { codigo: string };
        expect(codigo).toMatch(/^[0-9A-HJKMNP-TV-Z]{4}-[0-9A-HJKMNP-TV-Z]{4}$/);
        expect(codigo).not.toBe(conta.codigo);
        expect((await call(`/v1/murais/${conta.codigo}`)).status).toBe(404);
        expect((await call(`/v1/murais/${codigo}`)).status).toBe(200);
        expect(((await (await json('GET', '/v1/eu', undefined, token)).json()) as any).codigo).toBe(codigo);
      });
    });

    describe('seguir e correio', () => {
      const review = (ref: string, titulo = `Jogo ${ref}`) => ({ ref, titulo, mural: 'jogos' });
      /** Duas contas: Ana (quem publica) e Bia (quem segue). */
      async function two(env: Record<string, string> = {}) {
        const t = await setup(env);
        const ana = (await t.login({ sub: 'ana', givenName: 'Ana' })).body;
        const bia = (await t.login({ sub: 'bia', givenName: 'Bia' })).body;
        const feed = async (token: string, depois?: string) => {
          const res = await t.json('GET', `/v1/eu/notificacoes${depois ? `?depois=${encodeURIComponent(depois)}` : ''}`, undefined, token);
          return { status: res.status, body: res.status === 200 ? ((await res.json()) as any) : null };
        };
        return { ...t, ana, bia, feed };
      }

      it('segue pelo código digitado de qualquer jeito e avisa uma vez só', async () => {
        const { json, ana, bia, db, advance } = await two();
        const typed = ana.conta.codigo.toLowerCase().replace('-', ' ');
        const res = await json('POST', '/v1/seguindo', { codigo: typed }, bia.token);
        expect(res.status).toBe(201);
        expect(((await res.json()) as any).pessoa).toEqual({ codigo: ana.conta.codigo, nome: 'Ana' });
        expect((await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo }, bia.token)).status).toBe(200);
        advance(1000);
        await json('DELETE', `/v1/seguindo/${ana.conta.codigo}`, undefined, bia.token);
        advance(1000);
        expect((await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo }, bia.token)).status).toBe(201);
        const avisos = await db.all("SELECT 1 FROM atividades WHERE tipo = 'seguiu'");
        expect(avisos).toHaveLength(1);
      });

      it('recusa seguir a si mesmo, código desconhecido ou inválido, e sem sessão', async () => {
        const { json, ana } = await two();
        expect((await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo }, ana.token)).status).toBe(400);
        expect((await json('POST', '/v1/seguindo', { codigo: 'ZZZZ-ZZZZ' }, ana.token)).status).toBe(404);
        expect((await json('POST', '/v1/seguindo', { codigo: 'oi' }, ana.token)).status).toBe(400);
        expect((await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo })).status).toBe(401);
      });

      it('o correio traz as resenhas publicadas depois de começar a seguir, e 204 quando não há nada novo', async () => {
        const { json, push, ana, bia, feed, advance } = await two();
        await push(ana.token, 0, { novas: [review('antes1', 'Celeste')] });
        await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo }, bia.token);
        advance(1000);
        await push(ana.token, 1, { novas: [review('depois1', 'Hades'), review('antes1', 'Celeste')] });
        const first = await feed(bia.token);
        expect(first.status).toBe(200);
        expect(first.body.itens).toEqual([
          { tipo: 'resenha', em: expect.any(String), pessoa: { codigo: ana.conta.codigo, nome: 'Ana' }, ref: 'depois1', titulo: 'Hades', mural: 'jogos', silenciado: false },
        ]);
        expect(first.body.naoVistas).toBe(1);
        expect((await feed(bia.token, first.body.itens[0].em)).status).toBe(204);
        await push(ana.token, 2, { novas: [review('depois2', 'Hollow Knight')] });
        const second = await feed(bia.token, first.body.itens[0].em);
        expect(second.status).toBe(200);
        expect(second.body.itens.map((i: any) => i.ref)).toEqual(['depois2', 'depois1']);
        expect(second.body.naoVistas).toBe(2);
      });

      it('marcar como visto zera o número; silenciar mantém no correio sem contar', async () => {
        const { json, push, ana, bia, feed, advance } = await two();
        await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo }, bia.token);
        advance(1000);
        await push(ana.token, 0, { novas: [review('res1')] });
        const { body } = await feed(bia.token);
        expect(body.naoVistas).toBe(1);
        const seen = await json('POST', '/v1/eu/notificacoes/vistas', { ate: body.itens[0].em }, bia.token);
        expect(seen.status).toBe(200);
        expect((await feed(bia.token)).body.naoVistas).toBe(0);
        // uma data velha não desfaz o visto; uma futura vira agora
        await json('POST', '/v1/eu/notificacoes/vistas', { ate: '2020-01-01T00:00:00.000Z' }, bia.token);
        expect((await feed(bia.token)).body.naoVistas).toBe(0);
        await push(ana.token, 1, { novas: [review('res2')] });
        expect((await feed(bia.token)).body.naoVistas).toBe(1);
        const muted = await json('PATCH', `/v1/seguindo/${ana.conta.codigo}`, { silenciado: true }, bia.token);
        expect(muted.status).toBe(200);
        const quiet = (await feed(bia.token)).body;
        expect(quiet.naoVistas).toBe(0);
        expect(quiet.itens[0]).toMatchObject({ ref: 'res2', silenciado: true });
        expect((await json('PATCH', `/v1/seguindo/${bia.conta.codigo}`, { silenciado: true }, ana.token)).status).toBe(404);
        expect((await json('POST', '/v1/eu/notificacoes/vistas', {}, bia.token)).status).toBe(400);
      });

      it('quem foi seguido vê o aviso com "seguir de volta"; o aviso some se a pessoa deixar de seguir', async () => {
        const { json, ana, bia, feed, advance } = await two();
        await json('POST', '/v1/seguindo', { codigo: bia.conta.codigo }, ana.token);
        let item = (await feed(bia.token)).body.itens[0];
        expect(item).toEqual({ tipo: 'seguiu', em: expect.any(String), pessoa: { codigo: ana.conta.codigo, nome: 'Ana' }, euSigo: false });
        advance(1000);
        await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo }, bia.token);
        item = (await feed(bia.token)).body.itens.find((i: any) => i.tipo === 'seguiu');
        expect(item.euSigo).toBe(true);
        await json('DELETE', `/v1/seguindo/${bia.conta.codigo}`, undefined, ana.token);
        expect((await feed(bia.token)).body.itens.filter((i: any) => i.tipo === 'seguiu')).toEqual([]);
      });

      it('as listas de pessoas, tirar um seguidor e trocar o código sem perder quem segue', async () => {
        const { json, push, ana, bia } = await two();
        await push(ana.token, 0);
        await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo }, bia.token);
        const listBia = (await (await json('GET', '/v1/eu/pessoas', undefined, bia.token)).json()) as any;
        expect(listBia.seguindo).toEqual([{ codigo: ana.conta.codigo, nome: 'Ana', chave: expect.any(String), desde: expect.any(String), silenciado: false, rev: 1, meSegue: false }]);
        expect(listBia.seguidores).toEqual([]);
        const listAna = (await (await json('GET', '/v1/eu/pessoas', undefined, ana.token)).json()) as any;
        expect(listAna.seguidores).toEqual([{ codigo: bia.conta.codigo, nome: 'Bia', desde: expect.any(String), euSigo: false }]);
        // Ana troca o código: Bia continua seguindo e vê o código novo
        const { codigo } = (await (await json('POST', '/v1/eu/codigo', undefined, ana.token)).json()) as any;
        const again = (await (await json('GET', '/v1/eu/pessoas', undefined, bia.token)).json()) as any;
        expect(again.seguindo[0].codigo).toBe(codigo);
        // Ana tira Bia da lista de quem a segue
        expect((await json('DELETE', `/v1/eu/seguidores/${bia.conta.codigo}`, undefined, ana.token)).status).toBe(200);
        expect(((await (await json('GET', '/v1/eu/pessoas', undefined, bia.token)).json()) as any).seguindo).toEqual([]);
      });

      it('no máximo 60 pessoas novas por dia', async () => {
        const { json, login, ana } = await two({ COTA_LINHAS_DIA: '100000' });
        const codes: string[] = [];
        for (let i = 0; i < 61; i++) codes.push((await login({ sub: `p${i}` })).body.conta.codigo);
        for (let i = 0; i < 60; i++) expect((await json('POST', '/v1/seguindo', { codigo: codes[i] }, ana.token)).status).toBe(201);
        const res = await json('POST', '/v1/seguindo', { codigo: codes[60] }, ana.token);
        expect(res.status).toBe(429);
        expect(((await res.json()) as any).erro).toBe('seguir-devagar');
      });

      it('apagar a conta tira quem ela segue, quem a segue e os avisos', async () => {
        const { json, db, ana, bia } = await two();
        await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo }, bia.token);
        await json('POST', '/v1/seguindo', { codigo: bia.conta.codigo }, ana.token);
        expect((await json('DELETE', '/v1/eu', undefined, ana.token)).status).toBe(200);
        expect(await db.all('SELECT 1 FROM seguindo')).toEqual([]);
        expect(await db.all("SELECT 1 FROM atividades WHERE tipo = 'seguiu'")).toEqual([]);
      });

      it('com a nuvem em só leitura, o correio abre e seguir é recusado', async () => {
        const { db, ana, bia } = await two();
        const readOnly = createApp({ db, config: readConfig({ ...BASE_ENV, MODO: 'so-leitura' }), now: () => NOW, verifyGoogle: noGoogle });
        const json = jsonCaller((path, init) => readOnly.request(`https://api.teste${path}`, init));
        expect((await json('GET', '/v1/eu/notificacoes', undefined, bia.token)).status).toBe(200);
        expect((await json('POST', '/v1/seguindo', { codigo: ana.conta.codigo }, bia.token)).status).toBe(503);
      });
    });
  });
}
