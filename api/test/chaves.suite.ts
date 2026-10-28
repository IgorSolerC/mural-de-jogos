import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { ESCOPOS, MAX_CHAVES } from '../../contrato/api-v1/escopos';
import { SEGREDO_RE, segredoConfere } from '../../contrato/api-v1/segredo';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { MAX_KEYS_PER_DAY } from '../src/domain/api-key';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { hashToken } from '../src/domain/session';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, jsonCaller, eraseNow } from './harness';

/**
 * As chaves de API (PLANO-API.md, rodada 1): criar, listar, mudar e apagar com a sessão do site; o
 * `/ext/v1/eu` com a chave; validade, `API_CODIGOS`, isolamento entre contas, "Sair de todos" e apagar
 * a conta. Roda nos dois bancos, como `suite.ts`.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };
const DAY = 86_400_000;
const NOVA = { nome: 'Claude — Gastos', escopos: ['gastos:ler', 'gastos:lancar'], validade: 90 };

export function chavesSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'chaves', alg: 'RS256' };
  });

  async function setup(env: Record<string, string> = {}) {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config: Config = readConfig({ ...ENV, ...env });
    const clock = { t: NOW.getTime() };
    const logged: string[] = [];
    const deps: Deps = {
      db,
      config,
      now: () => new Date(clock.t),
      verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })),
      log: (line) => logged.push(line),
    };
    const advance = (ms: number) => void (clock.t += ms);
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
    const json = jsonCaller(call);
    const body = async (res: Response | Promise<Response>) => (await (await res).json()) as any;
    const login = async (sub: string) => {
      const credential = await new SignJWT({ given_name: sub })
        .setProtectedHeader({ alg: 'RS256', kid: 'chaves' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const b = await body(json('POST', '/v1/auth/google', { credential }));
      return { token: b.token as string, codigo: b.conta.codigo as string, id: b.conta.id as string };
    };
    /** Cria uma chave e devolve a resposta lida (com o segredo). */
    const create = async (token: string, extra: Record<string, unknown> = {}) => {
      const res = await json('POST', '/v1/eu/chaves', { ...NOVA, ...extra }, token);
      return { status: res.status, body: await body(res) };
    };
    const ext = (secret: string | null, path = '/ext/v1/eu', init: RequestInit = {}) =>
      call(path, { ...init, headers: { ...(secret ? { Authorization: `Bearer ${secret}` } : {}), ...(init.headers as Record<string, string>) } });
    const keyRows = (userId: string) => db.all<{ hash: string; usada_em: string | null }>('SELECT hash, usada_em FROM api_chaves WHERE usuario_id = ?', [userId]);
    return { db, deps, app, call, json, body, login, create, ext, advance, keyRows, logged };
  }

  describe(`${label}: as chaves de API`, () => {
    it('sem a conta em API_CODIGOS, nada aparece e criar é recusado', async () => {
      const t = await setup({ API_CODIGOS: '' });
      const me = await t.login('ana');
      expect((await t.body(t.json('GET', '/v1/eu', undefined, me.token))).api).toBe(false);
      expect(await t.body(t.json('GET', '/v1/eu/chaves', undefined, me.token))).toEqual({ disponivel: false, chaves: [] });
      const res = await t.create(me.token);
      expect(res.status).toBe(403);
      expect(res.body.erro).toBe('api-indisponivel');
    });

    it('API_CODIGOS com o código (com ou sem traço) abre só para aquela conta', async () => {
      const t = await setup();
      const ana = await t.login('ana');
      const bia = await t.login('bia');
      for (const codes of [`XXXX-XXXX, ${ana.codigo.toLowerCase()}`, ana.codigo.replace('-', '')]) {
        const app = createApp({ ...t.deps, config: readConfig({ ...ENV, API_CODIGOS: codes }) });
        const me = async (token: string) => (await (await app.request('https://api.teste/v1/eu', { headers: { Authorization: `Bearer ${token}` } })).json()) as any;
        expect((await me(ana.token)).api, codes).toBe(true);
        expect((await me(bia.token)).api, codes).toBe(false);
      }
    });

    it('cria: o segredo vem uma vez, com a forma certa, e a nuvem guarda só o hash', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { status, body } = await t.create(me.token, { grupos: [' Trabalho ', 'trabalho', 'Estudos'], aprovacao: 'tudo' });
      expect(status).toBe(201);
      expect(body.segredo).toMatch(SEGREDO_RE);
      expect(segredoConfere(body.segredo)).toBe(true);
      expect(body.chave).toEqual({
        id: expect.stringMatching(/^ch_[A-Za-z0-9_-]{16}$/),
        nome: 'Claude — Gastos',
        origem: 'manual',
        escopos: ['gastos:ler', 'gastos:lancar'],
        grupos: ['Trabalho', 'Estudos'],
        aprovacao: 'tudo',
        criadaEm: NOW.toISOString(),
        expiraEm: new Date(NOW.getTime() + 90 * DAY).toISOString(),
        usadaEm: null,
      });
      const rows = await t.keyRows(me.id);
      expect(rows).toHaveLength(1);
      expect(rows[0]!.hash).toBe(await hashToken(body.segredo));
      const list = await t.body(t.json('GET', '/v1/eu/chaves', undefined, me.token));
      expect(list).toEqual({ disponivel: true, chaves: [body.chave] });
      expect(JSON.stringify(list)).not.toContain(body.segredo);
      expect(JSON.stringify(list)).not.toContain(rows[0]!.hash);
      expect((await t.body(t.json('GET', '/v1/eu', undefined, me.token))).api).toBe(true);
    });

    it('a aprovação padrão é "antes de mudar ou apagar", e os escopos ficam na ordem da lista', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token, { escopos: ['publicar', 'notas:ler', 'conta:ler', 'notas:ler'] });
      expect(body.chave.aprovacao).toBe('mudancas');
      expect(body.chave.escopos).toEqual(['notas:ler', 'publicar']);
      expect(body.chave.grupos).toBeNull();
    });

    it.each([
      [{ nome: '   ' }, 'nome'],
      [{ nome: 'x'.repeat(41) }, null],
      [{ escopos: [] }, 'permissão'],
      [{ escopos: ['conta:ler'] }, 'permissão'],
      [{ escopos: ['notas:ler', 'cofre:ler'] }, 'cofre:ler'],
      [{ escopos: 'notas:ler' }, 'permissão'],
      [{ validade: 10 }, 'validade'],
      [{ validade: undefined }, 'validade'],
      [{ aprovacao: 'as-vezes' }, 'aprovação'],
      [{ grupos: Array.from({ length: 21 }, (_, i) => `G${i}`) }, 'grupos'],
      [{ grupos: ['ok', ''] }, 'grupos'],
      [{ grupos: 'Trabalho' }, 'grupos'],
    ])('recusa o que não serve: %j', async (extra, word) => {
      const t = await setup();
      const me = await t.login('ana');
      const res = await t.create(me.token, extra);
      if (word === null) {
        // nome longo demais: corta em 40, como o app faz com os nomes
        expect(res.status).toBe(201);
        expect(res.body.chave.nome).toHaveLength(40);
        return;
      }
      expect(res.status).toBe(400);
      expect(res.body.erro).toBe('chave-invalida');
      expect(res.body.mensagem.toLowerCase()).toContain(word);
    });

    it('o /ext/v1/eu responde com a chave; o uso é anotado no máximo uma vez por hora', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token);
      const res = await t.ext(body.segredo);
      expect(res.status).toBe(200);
      const out = await t.body(res);
      expect(out.conta).toEqual({ codigo: me.codigo, nome: 'ana' });
      expect(out.chave).toEqual({ ...body.chave, usadaEm: NOW.toISOString() });
      t.advance(30 * 60 * 1000);
      await t.ext(body.segredo);
      expect((await t.keyRows(me.id))[0]!.usada_em).toBe(NOW.toISOString());
      t.advance(31 * 60 * 1000);
      await t.ext(body.segredo);
      expect((await t.keyRows(me.id))[0]!.usada_em).toBe(new Date(NOW.getTime() + 61 * 60 * 1000).toISOString());
    });

    it('sessão e chave não se misturam', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token);
      const withSession = await t.ext(me.token);
      expect(withSession.status).toBe(401);
      expect((await t.body(withSession)).mensagem).toContain('sessão do site');
      const withKey = await t.json('GET', '/v1/eu', undefined, body.segredo);
      expect(withKey.status).toBe(401);
      expect((await t.body(withKey)).erro).toBe('sessao-invalida');
      const keyMakesKey = await t.json('POST', '/v1/eu/chaves', NOVA, body.segredo);
      expect(keyMakesKey.status).toBe(401);
    });

    it('recusa a chave sem cabeçalho, copiada errada ou desconhecida, e o log nunca mostra a chave', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token);
      const secret: string = body.segredo;
      const last = secret.at(-1) === 'A' ? 'B' : 'A';
      const tampered = secret.slice(0, -1) + last;
      const cut = secret.slice(0, -3);
      const other = secret.slice(0, 7) + (secret[7] === 'x' ? 'y' : 'x') + secret.slice(8);
      for (const s of [null, tampered, cut, other, 'murall_']) {
        const res = await t.ext(s);
        expect(res.status, String(s)).toBe(401);
        expect((await t.body(res)).erro).toBe('chave-invalida');
      }
      // uma chave com a forma certa e a conferência certa, mas que não existe
      const { montarSegredo } = await import('../../contrato/api-v1/segredo');
      const unknown = montarSegredo('A'.repeat(43));
      expect((await t.ext(unknown)).status).toBe(401);
      expect(t.logged.join('\n')).not.toContain(secret.slice(7, 20));
      expect(t.logged).toContain('GET /ext/v1/eu 401 chave-invalida');
    });

    it('a chave vence na data; a limpeza tira 30 dias depois', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token, { validade: 7 });
      t.advance(7 * DAY - 1000);
      expect((await t.ext(body.segredo)).status).toBe(200);
      t.advance(1000);
      expect((await t.ext(body.segredo)).status).toBe(401);
      // vencida continua na lista (para a pessoa entender), até a limpeza
      expect((await t.body(t.json('GET', '/v1/eu/chaves', undefined, me.token))).chaves).toHaveLength(1);
      await cleanup(t.deps);
      expect(await t.keyRows(me.id)).toHaveLength(1);
      t.advance(31 * DAY);
      // (a sessão de 90 dias ainda vale: renovada ao usar)
      await cleanup(t.deps);
      expect(await t.keyRows(me.id)).toHaveLength(0);
    });

    it('a chave com a data de vencer estragada não entra (na dúvida, venceu)', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token);
      expect((await t.ext(body.segredo)).status).toBe(200);
      await t.db.batch([{ sql: "UPDATE api_chaves SET expira_em = 'nunca'" }]);
      const res = await t.ext(body.segredo);
      expect(res.status).toBe(401);
      expect((await t.body(res)).erro).toBe('chave-invalida');
    });

    it('a conta que sai de API_CODIGOS para de responder às chaves', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token);
      const closed = createApp({ ...t.deps, config: readConfig({ ...ENV, API_CODIGOS: 'XXXX-XXXX' }) });
      const res = await closed.request('https://api.teste/ext/v1/eu', { headers: { Authorization: `Bearer ${body.segredo}` } });
      expect(res.status).toBe(403);
      expect((await t.body(res)).erro).toBe('api-indisponivel');
    });

    it('uma conta não vê, não muda e não apaga as chaves de outra', async () => {
      const t = await setup();
      const ana = await t.login('ana');
      const bia = await t.login('bia');
      const { body } = await t.create(ana.token);
      const id = body.chave.id;
      expect((await t.body(t.json('GET', '/v1/eu/chaves', undefined, bia.token))).chaves).toEqual([]);
      const patch = await t.json('PATCH', `/v1/eu/chaves/${id}`, { nome: 'Minha agora' }, bia.token);
      expect(patch.status).toBe(404);
      expect((await t.json('DELETE', `/v1/eu/chaves/${id}`, undefined, bia.token)).status).toBe(404);
      await t.json('DELETE', '/v1/eu/chaves', undefined, bia.token);
      expect((await t.ext(body.segredo)).status).toBe(200);
      const out = await t.body(t.ext(body.segredo));
      expect(out.chave.nome).toBe('Claude — Gastos');
      expect(out.conta.codigo).toBe(ana.codigo);
    });

    it('muda o nome, os escopos, os grupos e a aprovação; a validade não muda', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token, { grupos: ['Trabalho'] });
      const id = body.chave.id;
      const res = await t.json('PATCH', `/v1/eu/chaves/${id}`, { nome: 'Outra', escopos: ['notas:ler'], grupos: null, aprovacao: 'nunca', validade: 365 }, me.token);
      expect(res.status).toBe(200);
      const changed = (await t.body(res)).chave;
      expect(changed).toEqual({ ...body.chave, nome: 'Outra', escopos: ['notas:ler'], grupos: null, aprovacao: 'nunca' });
      expect((await t.body(t.ext(body.segredo))).chave.escopos).toEqual(['notas:ler']);
      const bad = await t.json('PATCH', `/v1/eu/chaves/${id}`, { escopos: ['notas:voar'] }, me.token);
      expect(bad.status).toBe(400);
      expect((await t.json('PATCH', '/v1/eu/chaves/nao-e-id', { nome: 'x' }, me.token)).status).toBe(404);
    });

    it('apagar uma vale na hora; cortar todas leva todas', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const a = (await t.create(me.token)).body;
      const b = (await t.create(me.token, { nome: 'Outra' })).body;
      const c = (await t.create(me.token, { nome: 'Mais uma' })).body;
      expect((await t.json('DELETE', `/v1/eu/chaves/${a.chave.id}`, undefined, me.token)).status).toBe(200);
      expect((await t.ext(a.segredo)).status).toBe(401);
      expect((await t.ext(b.segredo)).status).toBe(200);
      expect((await t.json('DELETE', `/v1/eu/chaves/${a.chave.id}`, undefined, me.token)).status).toBe(404);
      expect(await t.body(t.json('DELETE', '/v1/eu/chaves', undefined, me.token))).toEqual({ ok: true, apagadas: 2 });
      expect((await t.ext(b.segredo)).status).toBe(401);
      expect((await t.ext(c.segredo)).status).toBe(401);
    });

    it(`no máximo ${MAX_CHAVES} chaves vivas, e ${MAX_KEYS_PER_DAY} criadas por dia (apagar não devolve a vaga)`, async () => {
      const t = await setup();
      const me = await t.login('ana');
      for (let i = 0; i < MAX_CHAVES; i++) expect((await t.create(me.token, { nome: `K${i}` })).status).toBe(201);
      const full = await t.create(me.token);
      expect(full.status).toBe(409);
      expect(full.body.erro).toBe('chaves-demais');
      await t.json('DELETE', '/v1/eu/chaves', undefined, me.token);
      const brake = await t.create(me.token);
      expect(brake.status).toBe(429);
      expect(brake.body.erro).toBe('chaves-devagar');
      t.advance(DAY + 1000);
      expect((await t.create(me.token)).status).toBe(201);
    });

    it('"Sair de todos" só corta as chaves quando pedido', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token);
      await t.json('POST', '/v1/auth/sair-de-todos', undefined, me.token);
      expect((await t.ext(body.segredo)).status).toBe(200);
      const again = await t.login('ana');
      await t.json('POST', '/v1/auth/sair-de-todos', { chaves: true }, again.token);
      expect((await t.ext(body.segredo)).status).toBe(401);
      expect(await t.keyRows(me.id)).toHaveLength(0);
    });

    it('apagar a conta leva as chaves; a conta marcada para sair já para de responder', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const { body } = await t.create(me.token);
      await t.db.batch([{ sql: 'UPDATE usuarios SET apagar_em = ? WHERE id = ?', params: [new Date(NOW.getTime() + 7 * DAY).toISOString(), me.id] }]);
      const marked = await t.ext(body.segredo);
      expect(marked.status).toBe(401);
      expect((await t.body(marked)).mensagem).toContain('marcada para sair');
      await t.db.batch([{ sql: 'UPDATE usuarios SET apagar_em = NULL WHERE id = ?', params: [me.id] }]);
      expect((await t.ext(body.segredo)).status).toBe(200);
      await eraseNow(t.deps, me.token);
      expect(await t.keyRows(me.id)).toHaveLength(0);
      expect((await t.ext(body.segredo)).status).toBe(401);
    });

    it('a API das AIs aceita qualquer origem; o resto continua só com as do site', async () => {
      const t = await setup();
      const pre = (path: string, origin: string) =>
        t.call(path, { method: 'OPTIONS', headers: { Origin: origin, 'Access-Control-Request-Method': 'GET', 'Access-Control-Request-Headers': 'authorization' } });
      expect((await pre('/ext/v1/eu', 'https://qualquer.exemplo')).headers.get('Access-Control-Allow-Origin')).toBe('*');
      expect((await pre('/v1/eu', 'https://qualquer.exemplo')).headers.get('Access-Control-Allow-Origin')).toBeNull();
      expect((await pre('/v1/eu', 'http://localhost:4200')).headers.get('Access-Control-Allow-Origin')).toBe('http://localhost:4200');
    });

    it('toda permissão da lista tem nome e o que inclui; nenhuma fala do cofre', () => {
      for (const e of ESCOPOS) {
        expect(e.id).toMatch(/^[a-z-]+(:[a-z]+)?$/);
        expect(e.nome.length).toBeGreaterThan(3);
        expect(e.inclui.length).toBeGreaterThan(5);
      }
      expect(JSON.stringify(ESCOPOS).toLowerCase()).not.toContain('cofre');
    });
  });
}
