import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { DAY_MS } from '../src/domain/quota';
import { MAX_BOARD_BYTES } from '../src/routes/boards';
import { Config, Db, Deps } from '../src/ports';
import { FERRAMENTAS, alcanca } from '../../contrato/api-v1/ferramentas';
import { BASE_ENV, NOW, TABLES, eraseNow, gunzip, gzip, jsonCaller } from './harness';

/**
 * O Quadro livre na nuvem (PLANO-QUADRO-LIVRE.md, rodada 5): um quadro por linha, a versão por quadro, o 409 de
 * quem gravou no meio, as lápides, o contador `Quadros-Versao` no GET do mural, as imagens dos quadros que a
 * limpeza das soltas não apaga, os tetos, apagar a conta e a limpeza diária.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', IMAGENS_MB_TOTAL: '400', IMAGENS_MB_PESSOA: '25', IMAGENS_POR_DIA: '30', API_CODIGOS: '*' };
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
      return { token: b.token as string, id: b.conta.id as string, codigo: b.conta.codigo as string };
    };
    const board = (id: string, nome = 'Mansão') => JSON.stringify({ v: 1, id, nome, grupo: 'Jogos', em: new Date(clock.t).toISOString(), n: [], e: [] });
    const put = async (token: string, id: string, base: number, body?: Uint8Array<ArrayBuffer> | string, images: string[] = [], publico?: boolean) => {
      const bytes = typeof body === 'string' || body === undefined ? await gzip(body ?? board(id)) : body;
      const res = await call(`/v1/eu/quadros/${id}`, {
        method: 'PUT',
        headers: {
          ...auth(token),
          'Content-Type': 'application/gzip',
          'Quadro-Rev-Base': String(base),
          ...(images.length ? { 'Quadro-Imagens': images.join(',') } : {}),
          ...(publico === undefined ? {} : { 'Quadro-Publico': publico ? '1' : '0' }),
        },
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
    const json = jsonCaller(call);
    const newKey = async (token: string, escopos: string[], extra: Record<string, unknown> = {}) =>
      (await (await json('POST', '/v1/eu/chaves', { nome: 'Claude', escopos, validade: 30, aprovacao: 'nunca', ...extra }, token)).json()) as { segredo: string };
    /** O espelho com o quadro em texto, como o site manda (core/api-mirror.ts). */
    const mirrorBoards = async (token: string, quadros: unknown[]) => {
      const pulled = await call('/v1/eu/mural', { headers: auth(token) });
      let rev = Number(pulled.headers.get('Mural-Rev') ?? 0);
      if (!rev) {
        await muralHead(token);
        rev = Number((await call('/v1/eu/mural', { headers: auth(token) })).headers.get('Mural-Rev'));
      }
      const res = await json('POST', '/v1/eu/espelho', { rev, poe: quadros.map((q) => ({ tipo: 'quadro-livre', id: (q as { id: string }).id, hash: 'ab'.repeat(8), dados: q })) }, token);
      return res;
    };
    const ext = (secret: string, method: string, path: string, data?: unknown) =>
      call(path, { method, headers: { Authorization: `Bearer ${secret}`, ...(data ? { 'Content-Type': 'application/json' } : {}) }, ...(data ? { body: JSON.stringify(data) } : {}) });
    return { db, deps, call, auth, login, put, list, del, muralHead, advance, board, newKey, mirrorBoards, ext };
  }

  describe(`Quadro livre: a nuvem (${label})`, () => {
    it('guarda o quadro compactado, devolve os mesmos bytes, e a versão dele sobe a cada envio', async () => {
      const { login, put, call, auth, list, board } = await setup();
      const ana = await login('ana');
      const sent = board(ID(1));
      expect((await put(ana.token, ID(1), 0, sent)).body).toEqual({ rev: 1, versao: 1 });
      const got = await call(`/v1/eu/quadros/${ID(1)}`, { headers: auth(ana.token) });
      expect(got.status).toBe(200);
      expect(got.headers.get('Quadro-Rev')).toBe('1');
      expect(await gunzip(await got.arrayBuffer())).toBe(sent);
      // a mesma versão: nada desce
      expect((await call(`/v1/eu/quadros/${ID(1)}?rev=1`, { headers: auth(ana.token) })).status).toBe(204);
      expect((await put(ana.token, ID(1), 1, board(ID(1), 'Mansão 2'))).body).toEqual({ rev: 2, versao: 2 });
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

    it('o quadro público: quem visita vê a lista e o quadro (os privados e as lápides, não), e as imagens dele', async () => {
      const { db, login, put, call, auth, del } = await setup();
      const ana = await login('ana');
      const bia = await login('bia');
      const old = new Date(NOW.getTime() - 2 * DAY_MS).toISOString();
      await db.batch([
        { sql: "INSERT INTO imagens (id, dono_id, tipo, bytes, largura, altura, pronta, criada_em, gravacao) VALUES (?, ?, 'image/webp', 10, 1, 1, 1, ?, 'x')", params: [IMG(5), ana.id, old] },
      ]);
      await put(ana.token, ID(1), 0, undefined, [IMG(5)], true);
      await put(ana.token, ID(2), 0, undefined, [], false);
      await put(ana.token, ID(3), 0, undefined, [], true);
      await del(ana.token, ID(3));
      const list = (await (await call(`/v1/murais/${ana.codigo}/quadros`, { headers: auth(bia.token) })).json()) as any;
      expect(list.quadros.map((q: { id: string }) => q.id)).toEqual([ID(1)]);
      expect((await call(`/v1/murais/${ana.codigo}/quadros/${ID(1)}`, { headers: auth(bia.token) })).status).toBe(200);
      expect((await call(`/v1/murais/${ana.codigo}/quadros/${ID(2)}`, { headers: auth(bia.token) })).status).toBe(404);
      expect((await call(`/v1/murais/${ana.codigo}/quadros/${ID(3)}`, { headers: auth(bia.token) })).status).toBe(404);
      // a imagem do quadro público: quem visita vê; o quadro volta a privado (sem o cabeçalho, nada muda)
      const { imageAccess } = await import('../src/domain/image');
      expect((await imageAccess(db, IMG(5), bia.id))?.publica).toBeTruthy();
      await put(ana.token, ID(1), 1, undefined, [IMG(5)]);
      expect((await imageAccess(db, IMG(5), bia.id))?.publica).toBeTruthy();
      await put(ana.token, ID(1), 2, undefined, [IMG(5)], false);
      expect((await imageAccess(db, IMG(5), bia.id))?.publica).toBeFalsy();
      expect((await call(`/v1/murais/${ana.codigo}/quadros/${ID(1)}`, { headers: auth(bia.token) })).status).toBe(404);
      expect((await call('/v1/murais/XXXXXXXX/quadros', { headers: auth(bia.token) })).status).toBe(404);
    });

    it('a API das AIs: o espelho leva o quadro em texto, ver_quadros e ler_quadro leem, só dos grupos da chave', async () => {
      const t = await setup();
      const ana = await t.login('ana');
      const k = await t.newKey(ana.token, ['notas:ler']);
      const q = { id: ID(1), nome: 'Mansão', grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', pecas: 2, setas: 1, publico: false, texto: '# Mansão\n- Bilhete: Senha? [k3f9]\n' };
      expect((await t.mirrorBoards(ana.token, [q, { ...q, id: ID(2), nome: 'Verbos', grupo: 'Estudos' }])).status).toBe(200);
      expect((await t.mirrorBoards(ana.token, [{ ...q, pecas: -1 }])).status).toBe(400);
      const list = (await (await t.ext(k.segredo, 'GET', '/ext/v1/quadros')).json()) as any;
      expect(list.quadros.map((x: { nome: string }) => x.nome).sort()).toEqual(['Mansão', 'Verbos']);
      expect(list.quadros[0].texto).toBeUndefined();
      const one = (await (await t.ext(k.segredo, 'GET', '/ext/v1/quadros/mansao')).json()) as any;
      expect(one.quadro.texto).toContain('Senha? [k3f9]');
      expect((await t.ext(k.segredo, 'GET', '/ext/v1/quadros/nenhum')).status).toBe(404);
      // a chave limitada a um grupo só vê o quadro dele
      const only = await t.newKey(ana.token, ['notas:ler'], { grupos: ['Estudos'] });
      const limited = (await (await t.ext(only.segredo, 'GET', '/ext/v1/quadros')).json()) as any;
      expect(limited.quadros.map((x: { nome: string }) => x.nome)).toEqual(['Verbos']);
      // sem notas:ler, nada
      const blind = await t.newKey(ana.token, ['gastos:ler']);
      expect((await t.ext(blind.segredo, 'GET', '/ext/v1/quadros')).status).toBe(403);
    });

    it('a API das AIs pede quadros e peças novas (o site aplica); o que não serve é recusado', async () => {
      const t = await setup();
      const ana = await t.login('ana');
      const k = await t.newKey(ana.token, ['notas:ler', 'notas:criar']);
      await t.mirrorBoards(ana.token, [{ id: ID(1), nome: 'Mansão', grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', pecas: 0, setas: 0, publico: false, texto: '# Mansão\n' }]);
      const made = await t.ext(k.segredo, 'POST', '/ext/v1/quadros', { nome: 'Blue Prince', grupo: 'Jogos' });
      expect(made.status).toBe(202);
      const b = (await made.json()) as any;
      expect(b.quadro.id).toMatch(/^[A-Za-z0-9_-]{22}$/);
      expect(b.pedido.estado).toBe('pendente');
      const list = (await (await t.ext(k.segredo, 'GET', '/ext/v1/quadros')).json()) as any;
      expect(list.chegando.map((x: { nome: string }) => x.nome)).toEqual(['Blue Prince']);
      // acrescentar no que existe (pelo nome) e no que está chegando (pelo id do pedido de criar)
      const add = { pecas: [{ bilhete: 'Senha?' }, { bilhete: 'Ler email', perto: 'nova1' }], setas: [{ de: 'nova1', para: 'nova2', rotulo: 'precisa' }], moldura: { titulo: 'Roxo', pecas: ['nova1', 'nova2'] } };
      expect((await t.ext(k.segredo, 'POST', '/ext/v1/quadros/Mansão/pecas', add)).status).toBe(202);
      expect((await t.ext(k.segredo, 'POST', `/ext/v1/quadros/${b.quadro.id}/pecas`, add)).status).toBe(202);
      expect((await t.ext(k.segredo, 'POST', `/ext/v1/quadros/${ID(1)}/setas`, { setas: [{ de: 'a1', para: 'b2' }] })).status).toBe(202);
      // o que não serve
      expect((await t.ext(k.segredo, 'POST', `/ext/v1/quadros/${ID(1)}/pecas`, {})).status).toBe(400);
      expect((await t.ext(k.segredo, 'POST', `/ext/v1/quadros/${ID(1)}/pecas`, { pecas: [{ bilhete: 'x', nota: 'n1' }] })).status).toBe(400);
      expect((await t.ext(k.segredo, 'POST', `/ext/v1/quadros/${ID(1)}/setas`, { setas: [{ de: 'a', para: 'a' }] })).status).toBe(400);
      expect((await t.ext(k.segredo, 'POST', '/ext/v1/quadros/Outro/pecas', add)).status).toBe(404);
      expect((await t.ext(k.segredo, 'POST', '/ext/v1/quadros', { nome: 'Sem grupo' })).status).toBe(400);
      // sem o contexto no espelho, os grupos das notas espelhadas conferem: o nome errado não vira grupo novo
      await t.db.batch([{ sql: "INSERT INTO api_espelho (usuario_id, tipo, id, hash, grupo, dados) VALUES (?, 'nota', 'n1', 'ab', 'jogos', '{}')", params: [ana.id] }]);
      const typo = await t.ext(k.segredo, 'POST', '/ext/v1/quadros', { nome: 'X', grupo: 'Jogoz' });
      expect([typo.status, ((await typo.json()) as any).erro]).toEqual([422, 'grupo-desconhecido']);
      expect((await t.ext(k.segredo, 'POST', '/ext/v1/quadros', { nome: 'X', grupo: 'JOGOS' })).status).toBe(202);
      // só leitura não cria
      const reader = await t.newKey(ana.token, ['notas:ler']);
      expect((await t.ext(reader.segredo, 'POST', '/ext/v1/quadros', { nome: 'X', grupo: 'Jogos' })).status).toBe(403);
      // as ferramentas do MCP: ler com notas:ler; criar e acrescentar com notas:criar
      const tools = (scopes: string[]) => FERRAMENTAS.filter((f) => f.nome.includes('quadro') && alcanca(f, scopes)).map((f) => f.nome);
      expect(tools(['notas:ler'])).toEqual(['ver_quadros', 'ler_quadro']);
      expect(tools(['notas:criar'])).toEqual(['criar_quadro', 'acrescentar_no_quadro', 'ligar_no_quadro']);
    });

    it('o envio em partes (o quadro e a lista das imagens, que não cabe num cabeçalho) e o contador na resposta', async () => {
      const { db, login, call, auth, board } = await setup();
      const ana = await login('ana');
      const imgs = Array.from({ length: 1500 }, (_, k) => IMG(k));
      const form = new FormData();
      form.append('quadro', new Blob([await gzip(board(ID(1)))], { type: 'application/gzip' }));
      form.append('imagens', JSON.stringify(imgs));
      const res = await call(`/v1/eu/quadros/${ID(1)}`, { method: 'PUT', headers: { ...auth(ana.token), 'Quadro-Rev-Base': '0' }, body: form });
      expect(res.status).toBe(200);
      expect(await res.json()).toEqual({ rev: 1, versao: 1 });
      expect((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM quadro_imagens'))!.n).toBe(1500);
    });

    it('apagar com a versão de antes não apaga o que outro aparelho mexeu depois (a mexida vence)', async () => {
      const { login, put, call, auth } = await setup();
      const ana = await login('ana');
      await put(ana.token, ID(1), 0);
      await put(ana.token, ID(1), 1);
      const stale = await call(`/v1/eu/quadros/${ID(1)}`, { method: 'DELETE', headers: { ...auth(ana.token), 'Quadro-Rev-Base': '1' } });
      expect(stale.status).toBe(409);
      expect(((await stale.json()) as any).rev).toBe(2);
      const ok = await call(`/v1/eu/quadros/${ID(1)}`, { method: 'DELETE', headers: { ...auth(ana.token), 'Quadro-Rev-Base': '2' } });
      expect(((await ok.json()) as any).rev).toBe(3);
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
