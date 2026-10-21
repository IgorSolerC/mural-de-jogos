import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { write } from '../src/domain/quota';
import { Db, Deps } from '../src/ports';
import { readSecrets } from '../src/secrets';
import { BASE_ENV, NOW, TABLES, fakeGoogle, fakeMural, jsonCaller } from './harness';
import { createSuite } from './create.suite';
import { entrySuite } from './entry.suite';
import { itemsSuite } from './items.suite';
import { manageSuite } from './manage.suite';
import { openSuite } from './open.suite';

/**
 * A mesma suíte roda em dois bancos: o D1 (simulado pelo Miniflare, `workers.test.ts`) e o SQLite do
 * Node (`node.test.ts`). Se algo só funcionar num deles, a outra rodada quebra.
 */
export function cofreSuite(label: string, getDb: () => Db, extras: ((label: string, setup: Setup) => void)[] = []) {
  let google: Awaited<ReturnType<typeof fakeGoogle>>;
  beforeAll(async () => {
    google = await fakeGoogle();
  });

  /** Um cofre novo, com o banco vazio, o Google e o Murall de mentira e um relógio que anda à mão. */
  async function setup(env: Record<string, string> = {}) {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const vars = { ...BASE_ENV, ...env };
    const clock = { t: NOW.getTime() };
    google.requests.length = 0;
    google.tamper({});
    const deps: Deps = {
      db,
      config: readConfig(vars),
      secrets: readSecrets(vars),
      now: () => new Date(clock.t),
      mural: fakeMural(),
      googleLogin: google.login(vars.GOOGLE_CLIENT_SECRET),
    };
    const app = createApp(deps);
    const call = jsonCaller((path, init) => app.request(path, init));
    const advance = (ms: number) => {
      clock.t += ms;
    };
    /** O mesmo banco e o mesmo relógio, com outra configuração (uma pimenta nova, o modo só leitura). */
    const withEnv = (more: Record<string, string>) => {
      const v2 = { ...vars, ...more };
      const other = createApp({ ...deps, config: readConfig(v2), secrets: readSecrets(v2) });
      return jsonCaller((path, init) => other.request(path, init));
    };
    return { db, deps, call, advance, google, withEnv };
  }

  entrySuite(label, setup);
  createSuite(label, setup);
  openSuite(label, setup);
  itemsSuite(label, setup);
  manageSuite(label, setup);
  for (const extra of extras) extra(label, setup);

  describe(`API do cofre (${label})`, () => {
    it('o /api/status responde sem login, com o uso do dia', async () => {
      const { call } = await setup();
      const res = await call('GET', '/api/status', undefined, { origin: null });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ versao: 1, modo: 'ligado', dia: '2026-10-21', gravacoes: 0, linhasGravadas: 0, cotaLinhas: 1000 });
    });

    it('nada fica em cache, e o tipo não é adivinhado', async () => {
      const { call } = await setup();
      for (const res of [await call('GET', '/api/status'), await call('GET', '/api/nada')]) {
        expect(res.headers.get('Cache-Control')).toBe('no-store');
        expect(res.headers.get('X-Content-Type-Options')).toBe('nosniff');
      }
    });

    it('não responde CORS, e recusa pedido de outra origem', async () => {
      const { call } = await setup();
      const outra = await call('POST', '/api/status', {}, { origin: 'https://murall.igorsc.com.br' });
      expect(outra.status).toBe(403);
      expect(await outra.json()).toMatchObject({ erro: 'origem-recusada' });
      expect((await call('GET', '/api/status', undefined, { origin: 'https://atacante.dev' })).status).toBe(403);
      const daqui = await call('GET', '/api/status');
      expect(daqui.status).toBe(200);
      expect(daqui.headers.get('Access-Control-Allow-Origin')).toBeNull();
    });

    it('desligado, só o status responde; só leitura, só GET', async () => {
      const desligado = await setup({ MODO: 'desligado' });
      expect((await desligado.call('GET', '/api/status')).status).toBe(200);
      expect(await (await desligado.call('GET', '/api/qualquer')).json()).toMatchObject({ erro: 'cofre-desligado' });
      const leitura = await setup({ MODO: 'so-leitura' });
      expect(await (await leitura.call('POST', '/api/qualquer', {})).json()).toMatchObject({ erro: 'cofre-so-leitura' });
      expect((await leitura.call('GET', '/api/qualquer')).status).toBe(404);
    });

    it('endereço do cofre que não bate com o rpId desliga tudo', async () => {
      const { call } = await setup({ COFRE_RP_ID: 'teste.dev' });
      expect(await (await call('GET', '/api/status')).json()).toMatchObject({ modo: 'desligado' });
    });

    it('endereço desconhecido responde 404 em JSON', async () => {
      const { call } = await setup();
      const res = await call('GET', '/api/nada');
      expect(res.status).toBe(404);
      expect(await res.json()).toMatchObject({ erro: 'nao-encontrado' });
    });

    it('a cota do dia: grava e conta, e para antes de passar do limite', async () => {
      const { db, deps, call } = await setup({ COTA_LINHAS_DIA: '10' });
      await write(deps, [{ sql: 'INSERT INTO freios (chave, acao, criado_em) VALUES (?, ?, ?)', params: ['a', 'teste', NOW.toISOString()] }], 2);
      expect(await (await call('GET', '/api/status')).json()).toMatchObject({ gravacoes: 1, linhasGravadas: 3 });
      await expect(write(deps, [{ sql: 'DELETE FROM freios' }], 7)).rejects.toMatchObject({ code: 'cota-diaria' });
      expect(await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM freios')).toEqual({ n: 1 });
    });

    it('o banco recusa envelope incoerente com o tipo', async () => {
      const { db } = await setup();
      const at = NOW.toISOString();
      const blob = new Uint8Array(4);
      await db.batch([
        {
          sql: 'INSERT INTO cofre_contas (usuario_id, versao_cripto, kdf_m, kdf_t, kdf_p, sal, v, auth_hash, auth_pimenta, manifesto, contador, usuario_passkey, criado_em, mudado_em) VALUES (?, 1, 65536, 3, 1, ?, ?, ?, 1, ?, 0, ?, ?, ?)',
          params: ['u1', blob, blob, blob, blob, blob, at, at],
        },
        {
          sql: 'INSERT INTO cofre_credenciais (id, usuario_id, chave_publica, algoritmo, prf, apelido, criado_em) VALUES (?, ?, ?, -7, 1, ?, ?)',
          params: ['c1', 'u1', blob, 'Celular', at],
        },
      ]);
      const envelope = (tipo: string, credencial: string | null, s: Uint8Array | null, rec: Uint8Array | null) =>
        db.batch([
          {
            sql: 'INSERT INTO cofre_envelopes (id, usuario_id, tipo, credencial_id, envelope, s_cifrado, rec_hash, criado_em) VALUES (?, ?, ?, ?, ?, ?, ?, ?)',
            params: [`e-${tipo}-${credencial}`, 'u1', tipo, credencial, blob, s, rec, at],
          },
        ]);
      await expect(envelope('recuperacao', 'c1', null, blob)).rejects.toThrow();
      await expect(envelope('prf', null, null, null)).rejects.toThrow();
      await expect(envelope('servidor', 'c1', null, null)).rejects.toThrow();
      await expect(envelope('prf', 'c1', blob, null)).rejects.toThrow();
      await envelope('prf', 'c1', null, null);
      await envelope('recuperacao', null, null, blob);
      // um código de recuperação por conta, um envelope por aparelho
      await expect(db.batch([{ sql: "INSERT INTO cofre_envelopes (id, usuario_id, tipo, envelope, rec_hash, criado_em) VALUES ('x', 'u1', 'recuperacao', ?, ?, ?)", params: [blob, blob, at] }])).rejects.toThrow();
      await expect(envelope('prf', 'c1', null, null)).rejects.toThrow();
    });
  });
}

export type Setup = (env?: Record<string, string>) => Promise<{
  db: Db;
  deps: Deps;
  call: ReturnType<typeof jsonCaller>;
  advance: (ms: number) => void;
  google: Awaited<ReturnType<typeof fakeGoogle>>;
  withEnv: (more: Record<string, string>) => ReturnType<typeof jsonCaller>;
}>;
