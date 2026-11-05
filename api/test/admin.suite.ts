import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { googleVerifier } from '../src/domain/google';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, eraseNow, jsonCaller } from './harness';

/**
 * A conta de admin (PLANO-ADMIN-APIS.md, rodada 1): quem é admin é o id, nunca o código. Roda nos dois
 * bancos, como `suite.ts`.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };

export function adminSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'admin', alg: 'RS256' };
  });

  async function setup() {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config: Config = readConfig(ENV);
    const deps: Deps = {
      db,
      config,
      now: () => NOW,
      verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })),
    };
    /** Um app igual, com esta lista de admins. */
    const appWith = (admins: string) => {
      const app = createApp({ ...deps, config: readConfig({ ...ENV, ADMIN_USUARIOS: admins }) });
      const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
      const json = jsonCaller(call);
      return {
        json,
        uso: (token?: string) => json('GET', '/v1/admin/uso', undefined, token),
        eu: async (token: string) => (await (await json('GET', '/v1/eu', undefined, token)).json()) as any,
      };
    };
    const open = appWith('');
    const login = async (sub: string) => {
      const credential = await new SignJWT({ given_name: sub })
        .setProtectedHeader({ alg: 'RS256', kid: 'admin' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const b = (await (await open.json('POST', '/v1/auth/google', { credential })).json()) as any;
      return { token: b.token as string, codigo: b.conta.codigo as string, id: b.conta.id as string };
    };
    return { deps, appWith, login };
  }

  describe(`${label}: a conta de admin`, () => {
    it('sem sessão, 401; com a sessão de outra conta, 403; sem nada na resposta', async () => {
      const t = await setup();
      const dona = await t.login('dona');
      const bia = await t.login('bia');
      const app = t.appWith(dona.id);
      expect((await app.uso()).status).toBe(401);
      const res = await app.uso(bia.token);
      expect(res.status).toBe(403);
      expect(await res.json()).toEqual({ erro: 'so-admin', mensagem: 'Só a conta de admin vê isto.' });
    });

    it('a conta da lista entra, e a resposta não fica guardada', async () => {
      const t = await setup();
      const dona = await t.login('dona');
      const res = await t.appWith(`outra, ${dona.id}`).uso(dona.token);
      expect(res.status).toBe(200);
      expect(res.headers.get('Cache-Control')).toBe('no-store');
      expect(await res.json()).toMatchObject({ geradoEm: NOW.toISOString(), contandoDesde: null, linhas: [], falhas: [] });
    });

    it('o /v1/eu avisa só a própria conta', async () => {
      const t = await setup();
      const dona = await t.login('dona');
      const bia = await t.login('bia');
      const app = t.appWith(dona.id);
      expect((await app.eu(dona.token)).admin).toBe(true);
      expect((await app.eu(bia.token)).admin).toBe(false);
    });

    it('lista vazia é ninguém, e `*` não libera ninguém', async () => {
      const t = await setup();
      const dona = await t.login('dona');
      for (const admins of ['', '*', ' , ']) {
        const app = t.appWith(admins);
        expect((await app.uso(dona.token)).status, admins).toBe(403);
        expect((await app.eu(dona.token)).admin, admins).toBe(false);
      }
    });

    it('o código não dá acesso: nem o da própria conta na lista', async () => {
      const t = await setup();
      const dona = await t.login('dona');
      for (const admins of [dona.codigo, dona.codigo.replace('-', '')]) {
        expect((await t.appWith(admins).uso(dona.token)).status, admins).toBe(403);
      }
    });

    it('quem troca de código continua admin, e quem fica com o código antigo não vira', async () => {
      const t = await setup();
      const dona = await t.login('dona');
      const bia = await t.login('bia');
      const app = t.appWith(dona.id);
      const antigo = dona.codigo;

      const troca = await app.json('POST', '/v1/eu/codigo', undefined, dona.token);
      expect(troca.status).toBe(200);
      const pega = await app.json('PUT', '/v1/eu/codigo', { codigo: antigo }, bia.token);
      expect(pega.status).toBe(200);
      expect((await app.eu(bia.token)).codigo).toBe(antigo);

      expect((await app.uso(dona.token)).status).toBe(200);
      expect((await app.eu(dona.token)).admin).toBe(true);
      expect((await app.uso(bia.token)).status).toBe(403);
      expect((await app.eu(bia.token)).admin).toBe(false);
    });

    it('a conta nova que nasce depois de a dona sair, com o código dela, não vira admin', async () => {
      const t = await setup();
      const dona = await t.login('dona');
      const app = t.appWith(dona.id);
      await eraseNow(t.deps, dona.token);
      expect((await app.uso(dona.token)).status).toBe(401);

      const bia = await t.login('bia');
      expect((await app.json('PUT', '/v1/eu/codigo', { codigo: dona.codigo }, bia.token)).status).toBe(200);
      expect((await app.uso(bia.token)).status).toBe(403);
    });

    it('uma chave de API da própria conta de admin não entra', async () => {
      const t = await setup();
      const dona = await t.login('dona');
      const app = t.appWith(dona.id);
      const res = await app.json('POST', '/v1/eu/chaves', { nome: 'Uma AI', escopos: ['gastos:ler'], validade: 7 }, dona.token);
      expect(res.status).toBe(201);
      const { segredo } = (await res.json()) as { segredo: string };
      expect(segredo).toMatch(/^murall_/);
      expect((await app.uso(segredo)).status).toBe(401);
    });
  });
}
