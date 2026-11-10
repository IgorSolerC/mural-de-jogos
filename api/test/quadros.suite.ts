import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { DAY_MS } from '../src/domain/quota';
import { MAX_BOARD_BYTES } from '../src/routes/boards';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, eraseNow, gunzip, gzip } from './harness';

/**
 * O Quadro livre na nuvem (PLANO-QUADRO-LIVRE.md, rodada 5): um quadro por linha, a versão por quadro, o 409 de
 * quem gravou no meio, as lápides, o contador `Quadros-Versao` no GET do mural, as imagens dos quadros que a
 * limpeza das soltas não apaga, os tetos, apagar a conta e a limpeza diária.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', IMAGENS_MB_TOTAL: '400', IMAGENS_MB_PESSOA: '25', IMAGENS_POR_DIA: '30' };
const ID = (k: number) => `quadro${String(k).padStart(4, '0')}`.padEnd(22, 'q');
const IMG = (k: number) => `imagem${String(k).padStart(4, '0')}`.padEnd(22, 'i');

export function quadrosSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'quadros', alg: 'RS256' };
  });

  async function setup() {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config: Config = readConfig(ENV);
    const clock = { t: NOW.getTime() };
    const deps: Deps = { db, config, now: () => new Date(clock.t), verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })) };
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
    const auth = (token: string): Record<string, string> => ({ Authorization: `Bearer ${token}` });
    const login = async (sub: string) => {
      const credential = await new SignJWT({ given_name: sub })
        .setProtectedHeader({ alg: 'RS256', kid: 'quadros' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const res = await call('/v1/auth/google', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ credential }) });
      const b = (await res.json()) as any;
      return { token: b.token as string, id: b.conta.id as string };
    };
    const board = (id: string, nome = 'Mansão') => JSON.stringify({ v: 1, id, nome, grupo: 'Jogos', em: new Date(clock.t).toISOString(), n: [], e: [] });
    const put = async (token: string, id: string, base: number, body?: Uint8Array<ArrayBuffer> | string, images: string[] = []) => {
      const bytes = typeof body === 'string' || body === undefined ? await gzip(body ?? board(id)) : body;
      const res = await call(`/v1/eu/quadros/${id}`, {
        method: 'PUT',
        headers: { ...auth(token), 'Content-Type': 'application/gzip', 'Quadro-Rev-Base': String(base), ...(images.length ? { 'Quadro-Imagens': images.join(',') } : {}) },
        body: bytes,
      });
      clock.t += 3_000;
      return { status: res.status, body: (await res.json()) as any };
    };
    const list = async (token: string) => {
      const res = await call('/v1/eu/quadros', { headers: auth(token) });
      return { versao: res.headers.get('Quadros-Versao'), body: (await res.json()) as any };
    };
    const del = async (token: string, id: string) => (await (await call(`/v1/eu/quadros/${id}`, { method: 'DELETE', headers: auth(token) })).json()) as any;
    /** O GET do mural, como o site faz a cada 5 minutos: o `Quadros-Versao` vem nele. */
    const muralHead = async (token: string) => {
      const form = new FormData();
      form.append('privado', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      form.append('publico', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      const pulled = await call('/v1/eu/mural', { headers: auth(token) });
      if (pulled.status === 404) {
        await call('/v1/eu/mural', { method: 'PUT', headers: { ...auth(token), 'Mural-Rev-Base': '0' }, body: form });
        clock.t += 5_000;
      }
      return (await call('/v1/eu/mural', { headers: auth(token) })).headers.get('Quadros-Versao');
    };
    const advance = (ms: number) => void (clock.t += ms);
    return { db, deps, call, auth, login, put, list, del, muralHead, advance, board };
  }

  describe(`Quadro livre: a nuvem (${label})`, () => {
    it('guarda o quadro compactado, devolve os mesmos bytes, e a versão dele sobe a cada envio', async () => {
      const { login, put, call, auth, list, board } = await setup();
      const ana = await login('ana');
      const sent = board(ID(1));
      expect((await put(ana.token, ID(1), 0, sent)).body).toEqual({ rev: 1 });
      const got = await call(`/v1/eu/quadros/${ID(1)}`, { headers: auth(ana.token) });
      expect(got.status).toBe(200);
      expect(got.headers.get('Quadro-Rev')).toBe('1');
      expect(await gunzip(await got.arrayBuffer())).toBe(sent);
      // a mesma versão: nada desce
      expect((await call(`/v1/eu/quadros/${ID(1)}?rev=1`, { headers: auth(ana.token) })).status).toBe(204);
      expect((await put(ana.token, ID(1), 1, board(ID(1), 'Mansão 2'))).body).toEqual({ rev: 2 });
      const l = await list(ana.token);
      expect(l.body.quadros).toEqual([jasmineLike({ id: ID(1), rev: 2 })]);
    });

    it('quem gravou no meio: 409 com a versão de agora (o site junta e manda de novo)', async () => {
      const { login, put } = await setup();
      const ana = await login('ana');
      await put(ana.token, ID(1), 0);
      await put(ana.token, ID(1), 1);
      const stale = await put(ana.token, ID(1), 1);
      expect(stale.status).toBe(409);
      expect(stale.body.rev).toBe(2);
      // "novo" de um quadro que já existe também é 409
      expect((await put(ana.token, ID(1), 0)).status).toBe(409);
      // e o envio de uma versão que a nuvem nunca teve
      expect((await put(ana.token, ID(2), 5)).status).toBe(409);
    });

    it('o contador Quadros-Versao (no GET do mural e na lista) sobe a cada gravação e a cada apagar', async () => {
      const { login, put, del, muralHead, list } = await setup();
      const ana = await login('ana');
      expect(await muralHead(ana.token)).toBe('0');
      await put(ana.token, ID(1), 0);
      expect(await muralHead(ana.token)).toBe('1');
      await put(ana.token, ID(2), 0);
      await del(ana.token, ID(1));
      expect(await muralHead(ana.token)).toBe('3');
      expect((await list(ana.token)).versao).toBe('3');
    });

    it('apagar deixa a lápide: a lista diz, o GET responde 410, e o envio de antes leva 409 com o apagado', async () => {
      const { login, put, del, call, auth, list } = await setup();
      const ana = await login('ana');
      await put(ana.token, ID(1), 0);
      const gone = await del(ana.token, ID(1));
      expect(gone.rev).toBe(2);
      expect(typeof gone.apagado).toBe('string');
      expect((await call(`/v1/eu/quadros/${ID(1)}`, { headers: auth(ana.token) })).status).toBe(410);
      expect((await list(ana.token)).body.quadros[0]).toEqual(jasmineLike({ id: ID(1), rev: 2, apagado: gone.apagado }));
      const late = await put(ana.token, ID(1), 1);
      expect(late.status).toBe(409);
      expect(late.body.apagado).toBe(gone.apagado);
      // apagar de novo não muda nada; o que nunca subiu também não
      expect((await del(ana.token, ID(1))).rev).toBe(2);
      expect((await del(ana.token, ID(9))).rev).toBe(0);
    });

    it('cada conta só vê e só grava os seus', async () => {
      const { login, put, call, auth, list } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      await put(ana.token, ID(1), 0);
      expect((await call(`/v1/eu/quadros/${ID(1)}`, { headers: auth(bia.token) })).status).toBe(404);
      expect((await put(bia.token, ID(1), 1)).status).toBe(409);
      expect((await list(bia.token)).body.quadros).toEqual([]);
    });

    it('os tetos: o quadro grande demais, o que não é gzip, o id que não serve, envios seguidos do mesmo quadro', async () => {
      const { login, put, call, auth, advance } = await setup();
      const ana = await login('ana');
      expect((await put(ana.token, ID(1), 0, new Uint8Array(MAX_BOARD_BYTES + 10))).status).toBe(413);
      expect((await put(ana.token, ID(1), 0, new TextEncoder().encode('{"v":1}'.padEnd(40, ' ')) as Uint8Array<ArrayBuffer>)).status).toBe(400);
      expect((await call('/v1/eu/quadros/curto', { method: 'PUT', headers: { ...auth(ana.token), 'Quadro-Rev-Base': '0' }, body: new Uint8Array(30) })).status).toBe(400);
      expect((await call(`/v1/eu/quadros/${ID(1)}`, { method: 'PUT', headers: auth(ana.token), body: new Uint8Array(30) })).status).toBe(400);
      await put(ana.token, ID(1), 0);
      advance(-2_500);
      expect((await put(ana.token, ID(1), 1)).status).toBe(429);
    });

    it('as imagens que um quadro usa nunca ficam soltas (nem são apagadas pela limpeza)', async () => {
      const { db, deps, login, put } = await setup();
      const ana = await login('ana');
      const old = new Date(NOW.getTime() - 40 * DAY_MS).toISOString();
      await db.batch([
        { sql: "INSERT INTO imagens (id, dono_id, tipo, bytes, largura, altura, pronta, solta_desde, criada_em, gravacao) VALUES (?, ?, 'image/webp', 10, 1, 1, 1, ?, ?, 'x')", params: [IMG(1), ana.id, old, old] },
        { sql: "INSERT INTO imagens (id, dono_id, tipo, bytes, largura, altura, pronta, solta_desde, criada_em, gravacao) VALUES (?, ?, 'image/webp', 10, 1, 1, 1, ?, ?, 'x')", params: [IMG(2), ana.id, old, old] },
      ]);
      await put(ana.token, ID(1), 0, undefined, [IMG(1)]);
      const loose = async (id: string) => (await db.first<{ solta_desde: string | null }>('SELECT solta_desde FROM imagens WHERE id = ?', [id]))?.solta_desde;
      // entrar no quadro tira a marca de solta
      expect(await loose(IMG(1))).toBeNull();
      await cleanup(deps);
      const left = (await db.all<{ id: string }>('SELECT id FROM imagens ORDER BY id')).map((r) => r.id);
      expect(left).toEqual([IMG(1)]);
      expect((await db.all<{ imagem_id: string }>('SELECT imagem_id FROM quadro_imagens')).map((r) => r.imagem_id)).toEqual([IMG(1)]);
    });

    it('a limpeza diária tira as lápides de mais de 30 dias; apagar a conta leva os quadros', async () => {
      const { db, deps, login, put, del, advance } = await setup();
      const ana = await login('ana');
      await put(ana.token, ID(1), 0);
      await put(ana.token, ID(2), 0, undefined, [IMG(3)]);
      await del(ana.token, ID(1));
      advance(31 * DAY_MS);
      await cleanup(deps);
      expect((await db.all<{ id: string }>('SELECT id FROM quadros')).map((r) => r.id)).toEqual([ID(2)]);
      await eraseNow(deps, ana.token);
      expect(await db.first('SELECT 1 AS x FROM quadros')).toBeNull();
      expect(await db.first('SELECT 1 AS x FROM quadro_imagens')).toBeNull();
    });
  });
}

/** Um objeto com pelo menos estes campos (o vitest tem `expect.objectContaining`). */
function jasmineLike(o: Record<string, unknown>) {
  return expect.objectContaining(o);
}
