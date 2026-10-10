import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { googleVerifier } from '../src/domain/google';
import { cleanup } from '../src/domain/cleanup';
import { FEED_DAYS, FEED_LIMIT, MAX_FOLLOWING, MAX_FOLLOWS_PER_DAY, UNDO_MS } from '../src/routes/follow';
import { MAX_REACTIONS_PER_DAY } from '../src/routes/reactions';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, gunzip, gzip, jsonCaller } from './harness';

/**
 * Seguir, o correio (aba Amigos) e a gravação do mural, com mais detalhe que `suite.ts`: limites,
 * bordas de data, entradas malformadas e os caminhos que o site usa (Desfazer, código trocado,
 * conta apagada).
 *
 * Como em `suite.ts`, roda nos dois bancos (D1 simulado e SQLite do Node).
 *
 * Um bug novo achado aqui entra como `it.fails` (ver o README da raiz, "Testes"): o teste descreve o comportamento certo
 * e falha enquanto o bug existir; corrigido, o vitest acusa e é só trocar por `it`.
 */

/** Com cota de sobra: aqui os limites testados são os de cada conta, não o do dia. */
const ENV = { ...BASE_ENV, ORIGENS: 'https://igorsolerc.github.io', COTA_LINHAS_DIA: '100000' };
const DAY = 86_400_000;

const review = (ref: string, titulo = `Jogo ${ref}`, mural = 'jogos') => ({ ref, titulo, mural });

export function amigosSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'amigos', alg: 'RS256' };
  });

  async function setup(env: Record<string, string> = {}) {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config: Config = readConfig({ ...ENV, ...env });
    const clock = { t: NOW.getTime() };
    const deps: Deps = {
      db,
      config,
      now: () => new Date(clock.t),
      verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })),
    };
    const advance = (ms: number) => void (clock.t += ms);
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
    const json = jsonCaller(call);
    const body = async (res: Response | Promise<Response>) => (await (await res).json()) as any;

    /** Entra (cria a conta na primeira vez) e devolve o token e a conta. */
    const login = async (sub: string, givenName = sub) => {
      const credential = await new SignJWT({ given_name: givenName })
        .setProtectedHeader({ alg: 'RS256', kid: 'amigos' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const b = await body(json('POST', '/v1/auth/google', { credential }));
      return { token: b.token as string, codigo: b.conta.codigo as string, id: b.conta.id as string, nome: b.conta.nome as string };
    };

    /** Envia o mural como o site envia. Avança 5 s depois (o limite entre envios é de 3 s). */
    const push = async (
      token: string,
      base: number | string | null,
      docs: { privado?: string; publico?: string | null; novas?: unknown; novasRaw?: string } = {},
    ) => {
      const form = new FormData();
      form.append('privado', new Blob([await gzip(docs.privado ?? '{"reviews":[]}')], { type: 'application/gzip' }));
      if (docs.publico !== null) form.append('publico', new Blob([await gzip(docs.publico ?? '{"reviews":[]}')], { type: 'application/gzip' }));
      if (docs.novasRaw !== undefined) form.append('novas', docs.novasRaw);
      else if (docs.novas !== undefined) form.append('novas', JSON.stringify(docs.novas));
      const headers: Record<string, string> = { Authorization: `Bearer ${token}` };
      if (base !== null) headers['Mural-Rev-Base'] = String(base);
      const res = await call('/v1/eu/mural', { method: 'PUT', headers, body: form });
      advance(5_000);
      return { status: res.status, body: (await res.json()) as any };
    };

    const feed = async (token: string, depois?: string) => {
      const res = await json('GET', `/v1/eu/notificacoes${depois ? `?depois=${encodeURIComponent(depois)}` : ''}`, undefined, token);
      return { status: res.status, body: res.status === 200 ? ((await res.json()) as any) : null };
    };
    const follow = (token: string, codigo: string) => json('POST', '/v1/seguindo', { codigo }, token);
    const unfollow = (token: string, codigo: string) => json('DELETE', `/v1/seguindo/${codigo}`, undefined, token);
    const mute = (token: string, codigo: string, silenciado: unknown) => json('PATCH', `/v1/seguindo/${codigo}`, { silenciado }, token);
    const people = (token: string) => body(json('GET', '/v1/eu/pessoas', undefined, token));

    return { db, deps, app, call, json, body, login, push, feed, follow, unfollow, mute, people, advance };
  }

  /** Ana publica, Bia segue. */
  async function two(env: Record<string, string> = {}) {
    const t = await setup(env);
    const ana = await t.login('ana', 'Ana');
    const bia = await t.login('bia', 'Bia');
    return { ...t, ana, bia };
  }

  describe(`Amigos e sincronização, em detalhe (${label})`, () => {
    describe('seguir: limites', () => {
      it(`no máximo ${MAX_FOLLOWING} pessoas seguidas ao mesmo tempo (429 seguindo-demais)`, async () => {
        const { db, follow, ana, bia } = await two();
        // 300 contas fictícias seguidas há uma semana (não contam no limite do dia)
        const old = new Date(NOW.getTime() - 7 * DAY).toISOString();
        await db.batch(
          Array.from({ length: MAX_FOLLOWING }, (_, i) => ({
            sql: 'INSERT INTO seguindo (seguidor_id, seguido_id, criado_em, silenciado) VALUES (?, ?, ?, 0)',
            params: [bia.id, `fantasma-${i}`, old],
          })),
        );
        const res = await follow(bia.token, ana.codigo);
        expect(res.status).toBe(429);
        expect(((await res.json()) as any).erro).toBe('seguindo-demais');
      });

      it('o limite do dia vale por conta: o que Ana segue não gasta o de Bia', async () => {
        const { db, follow, login, ana, bia } = await two();
        const at = NOW.toISOString();
        await db.batch(
          Array.from({ length: MAX_FOLLOWS_PER_DAY }, (_, i) => ({
            sql: 'INSERT INTO seguindo (seguidor_id, seguido_id, criado_em, silenciado) VALUES (?, ?, ?, 0)',
            params: [ana.id, `fantasma-${i}`, at],
          })),
        );
        const cris = await login('cris', 'Cris');
        expect((await follow(ana.token, cris.codigo)).status).toBe(429);
        expect((await follow(bia.token, cris.codigo)).status).toBe(201);
      });

      it('seguir de novo quem já sigo responde 200 com a data de antes e não gasta o limite', async () => {
        const { follow, advance, ana, bia } = await two();
        const first = (await (await follow(bia.token, ana.codigo)).json()) as any;
        advance(60_000);
        const again = await follow(bia.token, ana.codigo);
        expect(again.status).toBe(200);
        expect(((await again.json()) as any).desde).toBe(first.desde);
      });

      // Antes contava só quem ainda era seguido: seguir 60, deixar de seguir e seguir mais 60 passava,
      // e cada pessoa nova recebia um aviso.
      it('deixar de seguir não devolve vaga no limite de pessoas novas do dia', async () => {
        const { db, follow, unfollow, login, ana, bia } = await two();
        const at = NOW.toISOString();
        await db.batch(
          Array.from({ length: MAX_FOLLOWS_PER_DAY - 1 }, (_, i) => ({
            sql: 'INSERT INTO seguindo (seguidor_id, seguido_id, criado_em, silenciado) VALUES (?, ?, ?, 0)',
            params: [bia.id, `fantasma-${i}`, at],
          })),
        );
        // a 60ª do dia: ainda cabe
        expect((await follow(bia.token, ana.codigo)).status).toBe(201);
        // deixa de seguir e tenta outra pessoa nova: deveria continuar no limite
        await unfollow(bia.token, ana.codigo);
        const cris = await login('cris', 'Cris');
        const res = await follow(bia.token, cris.codigo);
        expect(res.status).toBe(429);
        // e Cris não deveria ter recebido aviso
        expect(await db.all("SELECT 1 FROM atividades WHERE tipo = 'seguiu' AND alvo_id = ?", [cris.id])).toEqual([]);
      });
      it('no limite do dia, seguir de volta quem acabei de deixar de seguir (o Desfazer) ainda passa', async () => {
        const { db, follow, unfollow, ana, bia } = await two();
        await db.batch(
          Array.from({ length: MAX_FOLLOWS_PER_DAY - 1 }, (_, i) => ({
            sql: 'INSERT INTO seguindo (seguidor_id, seguido_id, criado_em, silenciado) VALUES (?, ?, ?, 0)',
            params: [bia.id, `fantasma-${i}`, NOW.toISOString()],
          })),
        );
        expect((await follow(bia.token, ana.codigo)).status).toBe(201); // a 60ª
        await unfollow(bia.token, ana.codigo);
        expect((await follow(bia.token, ana.codigo)).status).toBe(201); // não avisa de novo: não conta
        expect(await db.all("SELECT 1 FROM atividades WHERE tipo = 'seguiu' AND alvo_id = ?", [ana.id])).toHaveLength(1);
      });

      it('o limite do dia recomeça no dia UTC seguinte, mesmo com os avisos de ontem', async () => {
        const { db, follow, login, advance, ana, bia } = await two();
        await db.batch(
          Array.from({ length: MAX_FOLLOWS_PER_DAY }, (_, i) => ({
            sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, criado_em) VALUES ('seguiu', ?, ?, ?)",
            params: [bia.id, `fantasma-${i}`, NOW.toISOString()],
          })),
        );
        expect((await follow(bia.token, ana.codigo)).status).toBe(429);
        advance(DAY);
        const cris = await login('cris', 'Cris');
        expect((await follow(bia.token, cris.codigo)).status).toBe(201);
      });
    });

    describe('seguir: Desfazer, silenciar e código trocado', () => {
      it('silenciar aceita só true ou false (400 sem-silenciado)', async () => {
        const { follow, mute, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        for (const bad of ['sim', 1, null]) {
          const res = await mute(bia.token, ana.codigo, bad);
          expect(res.status).toBe(400);
          expect(((await res.json()) as any).erro).toBe('sem-silenciado');
        }
        expect((await mute(bia.token, ana.codigo, true)).status).toBe(200);
      });

      it('deixar de seguir quem eu não sigo responde ok, sem efeito', async () => {
        const { unfollow, people, ana, bia } = await two();
        expect((await unfollow(bia.token, ana.codigo)).status).toBe(200);
        expect((await people(bia.token)).seguindo).toEqual([]);
      });

      it('com o código antigo (a pessoa trocou), seguir e deixar de seguir dão 404; o novo funciona', async () => {
        const { json, body, follow, unfollow, people, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        const { codigo: novo } = await body(json('POST', '/v1/eu/codigo', undefined, ana.token));
        expect(novo).not.toBe(ana.codigo);
        expect((await unfollow(bia.token, ana.codigo)).status).toBe(404);
        expect((await follow(bia.token, ana.codigo)).status).toBe(404);
        // o site precisa recarregar a lista para achar o código novo
        expect((await people(bia.token)).seguindo.map((p: any) => p.codigo)).toEqual([novo]);
        expect((await unfollow(bia.token, novo)).status).toBe(200);
      });

      it('a chave de quem eu sigo continua a mesma quando a pessoa troca o código, e é só minha', async () => {
        const { json, body, follow, people, login, ana, bia } = await two();
        const cris = await login('cris', 'Cris');
        await follow(bia.token, ana.codigo);
        await follow(cris.token, ana.codigo);
        const before = (await people(bia.token)).seguindo[0];
        expect(before.chave).toMatch(/^[\w-]{16}$/);
        await body(json('POST', '/v1/eu/codigo', undefined, ana.token));
        const after = (await people(bia.token)).seguindo[0];
        expect(after.codigo).not.toBe(before.codigo);
        expect(after.chave).toBe(before.chave);
        // outra pessoa que segue a Ana vê outra chave (não dá para ligar as listas)
        expect((await people(cris.token)).seguindo[0].chave).not.toBe(before.chave);
      });

      it('quem foi tirado da lista de seguidores pode seguir de novo, sem aviso novo', async () => {
        const { db, json, follow, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        advance(1000);
        await json('DELETE', `/v1/eu/seguidores/${bia.codigo}`, undefined, ana.token);
        advance(1000);
        expect((await follow(bia.token, ana.codigo)).status).toBe(201);
        expect(await db.all("SELECT 1 FROM atividades WHERE tipo = 'seguiu' AND alvo_id = ?", [ana.id])).toHaveLength(1);
      });

      it('tirar quem não me segue responde ok e não mexe no que eu sigo', async () => {
        const { json, follow, people, ana, bia } = await two();
        await follow(ana.token, bia.codigo);
        expect((await json('DELETE', `/v1/eu/seguidores/${bia.codigo}`, undefined, ana.token)).status).toBe(200);
        expect((await people(ana.token)).seguindo.map((p: any) => p.codigo)).toEqual([bia.codigo]);
      });

      it('Desfazer (deixar de seguir e seguir de volta) mantém o silenciado', async () => {
        const { follow, unfollow, mute, people, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        await mute(bia.token, ana.codigo, true);
        advance(1000);
        await unfollow(bia.token, ana.codigo);
        advance(2000); // o toast com "Desfazer" ainda está na tela
        const res = await follow(bia.token, ana.codigo);
        expect(((await res.json()) as any).silenciado).toBe(true);
        expect((await people(bia.token)).seguindo[0].silenciado).toBe(true);
      });

      it('seguir de volta depois de 10 minutos é um seguir novo: sem o silenciado de antes', async () => {
        const { follow, unfollow, mute, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        await mute(bia.token, ana.codigo, true);
        await unfollow(bia.token, ana.codigo);
        advance(UNDO_MS + 1000);
        expect(((await (await follow(bia.token, ana.codigo)).json()) as any).silenciado).toBe(false);
      });

      it('quem foi tirado da lista de seguidores não tem "Desfazer": segue de novo do zero', async () => {
        const { db, json, follow, mute, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        await mute(bia.token, ana.codigo, true);
        await json('DELETE', `/v1/eu/seguidores/${bia.codigo}`, undefined, ana.token);
        expect(await db.all('SELECT 1 FROM seguindo_desfeito')).toEqual([]);
        expect(((await (await follow(bia.token, ana.codigo)).json()) as any).silenciado).toBe(false);
      });

      it('o seguir desfeito some na limpeza do dia seguinte e quando a conta é apagada', async () => {
        const { db, deps, json, follow, unfollow, advance, login, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        await unfollow(bia.token, ana.codigo);
        expect(await db.all('SELECT 1 FROM seguindo_desfeito')).toHaveLength(1);
        advance(DAY + 1000);
        await cleanup(deps);
        expect(await db.all('SELECT 1 FROM seguindo_desfeito')).toEqual([]);
        const cris = await login('cris', 'Cris');
        await follow(cris.token, ana.codigo);
        await unfollow(cris.token, ana.codigo);
        expect((await json('DELETE', '/v1/eu', undefined, ana.token)).status).toBe(200);
        expect(await db.all('SELECT 1 FROM seguindo_desfeito')).toEqual([]);
      });

      it('Desfazer não apaga do correio as resenhas que já tinham chegado', async () => {
        const { follow, unfollow, push, feed, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        advance(1000);
        await push(ana.token, 0, { novas: [review('celeste1', 'Celeste')] });
        expect((await feed(bia.token)).body.itens.map((i: any) => i.ref)).toEqual(['celeste1']);
        await unfollow(bia.token, ana.codigo);
        advance(2000);
        await follow(bia.token, ana.codigo);
        expect((await feed(bia.token)).body.itens.map((i: any) => i.ref)).toEqual(['celeste1']);
      });
      it('Desfazer devolve a data de antes, e só ela: o que chegou no meio também aparece', async () => {
        const { follow, unfollow, push, feed, advance, ana, bia } = await two();
        const first = (await (await follow(bia.token, ana.codigo)).json()) as any;
        advance(1000);
        await unfollow(bia.token, ana.codigo);
        advance(1000);
        await push(ana.token, 0, { novas: [review('nomeio1', 'No meio')] });
        const again = (await (await follow(bia.token, ana.codigo)).json()) as any;
        expect(again.desde).toBe(first.desde);
        expect((await feed(bia.token)).body.itens.map((i: any) => i.ref)).toEqual(['nomeio1']);
      });
    });

    describe('correio', () => {
      it(`só os últimos ${FEED_DAYS} dias`, async () => {
        const { follow, push, feed, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        advance(1000);
        await push(ana.token, 0, { novas: [review('velha01')] });
        advance((FEED_DAYS - 1) * DAY);
        await push(ana.token, 1, { novas: [review('nova001')] });
        expect((await feed(bia.token)).body.itens.map((i: any) => i.ref)).toEqual(['nova001', 'velha01']);
        advance(2 * DAY); // a primeira passou de 30 dias
        expect((await feed(bia.token)).body.itens.map((i: any) => i.ref)).toEqual(['nova001']);
      });

      it(`no máximo ${FEED_LIMIT} itens, os mais novos primeiro`, async () => {
        const { follow, push, feed, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        advance(1000);
        let rev = 0;
        let n = 0;
        // 10 por envio, 30 por dia: 3 dias de 3 envios = 90 resenhas
        for (let day = 0; day < 3; day++) {
          for (let k = 0; k < 3; k++) {
            const novas = Array.from({ length: 10 }, () => review(`r${String(n++).padStart(4, '0')}`));
            rev = (await push(ana.token, rev, { novas })).body.rev;
          }
          advance(DAY);
        }
        const { body } = await feed(bia.token);
        expect(body.itens).toHaveLength(FEED_LIMIT);
        const dates = body.itens.map((i: any) => i.em);
        expect([...dates].sort().reverse()).toEqual(dates);
        // as 30 do primeiro dia: só cabem as mais novas
        expect(body.itens.some((i: any) => i.ref === 'r0000')).toBe(false);
      });

      it('mistura avisos de seguir e resenhas pela data, do mais novo ao mais velho', async () => {
        const { follow, push, feed, advance, login, ana, bia } = await two();
        const cris = await login('cris', 'Cris');
        await follow(bia.token, ana.codigo);
        advance(1000);
        await push(ana.token, 0, { novas: [review('primeira')] }); // +5 s
        await follow(cris.token, bia.codigo);
        advance(1000);
        await push(ana.token, 1, { novas: [review('segunda1')] });
        const tipos = (await feed(bia.token)).body.itens.map((i: any) => (i.tipo === 'seguiu' ? `seguiu:${i.pessoa.nome}` : i.ref));
        expect(tipos).toEqual(['segunda1', 'seguiu:Cris', 'primeira']);
      });

      it('?depois= inválido ou de antes da janela de 30 dias não quebra (responde o correio inteiro)', async () => {
        const { follow, push, feed, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        advance(1000);
        await push(ana.token, 0, { novas: [review('res0001')] });
        for (const cursor of ['ontem', '2026-13-45T99:00:00Z', 'x'.repeat(80)]) {
          const r = await feed(bia.token, cursor);
          expect(r.status).toBe(200);
          expect(r.body.itens).toHaveLength(1);
        }
        // muito antigo: vale o piso de 30 dias, e o item novo responde 200
        expect((await feed(bia.token, '2000-01-01T00:00:00.000Z')).status).toBe(200);
      });

      it('?depois= exatamente no item mais novo: 204; um milissegundo antes: 200', async () => {
        const { follow, push, feed, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        advance(1000);
        await push(ana.token, 0, { novas: [review('res0001')] });
        const em = (await feed(bia.token)).body.itens[0].em as string;
        expect((await feed(bia.token, em)).status).toBe(204);
        expect((await feed(bia.token, new Date(Date.parse(em) - 1).toISOString())).status).toBe(200);
      });

      it('conta nova: o que chegou depois de criar a conta conta como não visto', async () => {
        const { follow, push, feed, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        advance(1000);
        await push(ana.token, 0, { novas: [review('res0001')] });
        const { body } = await feed(bia.token);
        expect(body.vistasEm).toBe(NOW.toISOString());
        expect(body.naoVistas).toBe(1);
      });

      it('deixar de seguir tira as resenhas da pessoa do correio', async () => {
        const { follow, unfollow, push, feed, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        advance(1000);
        await push(ana.token, 0, { novas: [review('res0001')] });
        await unfollow(bia.token, ana.codigo);
        expect((await feed(bia.token)).body.itens).toEqual([]);
      });

      it('a pessoa seguida apaga a conta: some do correio e da lista de quem eu sigo', async () => {
        const { json, follow, push, feed, people, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        await follow(ana.token, bia.codigo);
        advance(1000);
        await push(ana.token, 0, { novas: [review('res0001')] });
        expect((await json('DELETE', '/v1/eu', undefined, ana.token)).status).toBe(200);
        expect((await feed(bia.token)).body.itens).toEqual([]);
        const p = await people(bia.token);
        expect(p.seguindo).toEqual([]);
        expect(p.seguidores).toEqual([]);
      });

      it('o resumo da atividade estragado no banco vira título vazio e mural "jogos", sem quebrar', async () => {
        const { db, follow, feed, advance, ana, bia } = await two();
        await follow(bia.token, ana.codigo);
        advance(1000);
        await db.batch([
          {
            sql: "INSERT INTO atividades (tipo, autor_id, ref, resumo, criado_em) VALUES ('resenha', ?, 'quebrada', '{nao é json', ?)",
            params: [ana.id, new Date(NOW.getTime() + 2000).toISOString()],
          },
        ]);
        const item = (await feed(bia.token)).body.itens[0];
        expect(item).toMatchObject({ tipo: 'resenha', ref: 'quebrada', titulo: '', mural: 'jogos' });
      });

      it('o limite de 30 resenhas novas por dia é por autora', async () => {
        const { push, db, ana, bia } = await two();
        let revA = 0;
        for (let k = 0; k < 3; k++) {
          revA = (await push(ana.token, revA, { novas: Array.from({ length: 10 }, (_, i) => review(`ana${k}${i}xx`)) })).body.rev;
        }
        await push(bia.token, 0, { novas: [review('bia001')] });
        const count = async (id: string) => ((await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM atividades WHERE autor_id = ?', [id]))!.n);
        expect(await count(ana.id)).toBe(30);
        expect(await count(bia.id)).toBe(1);
      });
    });

    describe('gravação do mural: entradas malformadas', () => {
      it('Mural-Rev-Base negativo, fracionário, texto ou acima do inteiro seguro: 400 sem-rev', async () => {
        const { login, push } = await setup();
        const { token } = await login('ana');
        for (const base of ['-1', '1.5', 'abc', '9007199254740993']) {
          const r = await push(token, base);
          expect(r.status, `base ${JSON.stringify(base)}`).toBe(400);
          expect(r.body.erro).toBe('sem-rev');
        }
        expect((await push(token, null)).status).toBe(400);
      });

      // Antes, Number('') e Number(' ') valiam 0 e o cabeçalho vazio passava como "primeiro envio".
      it('Mural-Rev-Base vazio ou fora do formato é recusado como o ausente', async () => {
        const { login, push } = await setup();
        const { token } = await login('ana');
        for (const base of ['', ' ', '+1', '0x1', '1e3']) {
          expect((await push(token, base)).status, `base ${JSON.stringify(base)}`).toBe(400);
        }
        // com espaço em volta, o número vale
        expect((await push(token, ' 0 ')).status).toBe(200);
      });

      it('sem a parte "publico": 400, e nada é gravado', async () => {
        const { login, push, db } = await setup();
        const { token } = await login('ana');
        const r = await push(token, 0, { publico: null });
        expect(r.status).toBe(400);
        expect(r.body.erro).toBe('mural-invalido');
        expect(await db.all('SELECT 1 FROM murais')).toEqual([]);
      });

      it('"novas" que não é JSON, não é lista ou é grande demais: 400', async () => {
        const { login, push, db } = await setup();
        const { token } = await login('ana');
        expect((await push(token, 0, { novasRaw: '{quebrado' })).status).toBe(400);
        expect((await push(token, 0, { novasRaw: '{"ref":"abcd"}' })).status).toBe(400);
        expect((await push(token, 0, { novasRaw: JSON.stringify([review('a'.repeat(30), 'x'.repeat(20_000))]) })).status).toBe(400);
        expect(await db.all('SELECT 1 FROM murais')).toEqual([]);
      });

      it('itens ruins em "novas" são ignorados e o resto entra', async () => {
        const { login, push, db } = await setup();
        const { token } = await login('ana');
        const ok = await push(token, 0, {
          novas: [
            'texto',
            42,
            { ref: 'abc', titulo: 'ref curta demais', mural: 'jogos' },
            { ref: 'tem espaço', titulo: 'ref inválida', mural: 'jogos' },
            { ref: 'semtitulo', titulo: '   ', mural: 'jogos' },
            { ref: 'muralruim', titulo: 'Mural com maiúscula', mural: 'Jogos' },
            review('valida01', 'Válida'),
          ],
        });
        expect(ok.status).toBe(200);
        expect(ok.body.novas).toBe(1);
        expect((await db.all<{ ref: string }>('SELECT ref FROM atividades')).map((a) => a.ref)).toEqual(['valida01']);
      });

      it('um null (ou lista) dentro de "novas" é ignorado, sem derrubar o envio com 500', async () => {
        const { login, push } = await setup();
        const { token } = await login('ana');
        const r = await push(token, 0, { novas: [null, [review('lista01')], review('valida01')] });
        expect(r.status).toBe(200);
        expect(r.body.novas).toBe(1);
      });

      it('o título do aviso fica com no máximo 120 caracteres e sem caracteres invisíveis', async () => {
        const { login, push, db } = await setup();
        const { token } = await login('ana');
        await push(token, 0, { novas: [review('longo001', `​A${'b'.repeat(200)}\u0007`)] });
        const row = await db.first<{ resumo: string }>('SELECT resumo FROM atividades');
        const titulo = JSON.parse(row!.resumo).titulo as string;
        expect(titulo.startsWith('Ab')).toBe(true);
        expect(Array.from(titulo)).toHaveLength(120);
      });

      it('Content-Length acima do teto: 413 antes de ler o corpo', async () => {
        const { login, call } = await setup();
        const { token } = await login('ana');
        const res = await call('/v1/eu/mural', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Mural-Rev-Base': '0', 'Content-Length': String(5_000_000) },
          body: 'x',
        });
        expect(res.status).toBe(413);
      });

      it('corpo que não é multipart: 400 mural-invalido', async () => {
        const { login, call } = await setup();
        const { token } = await login('ana');
        const res = await call('/v1/eu/mural', {
          method: 'PUT',
          headers: { Authorization: `Bearer ${token}`, 'Mural-Rev-Base': '0', 'Content-Type': 'application/json' },
          body: '{}',
        });
        expect(res.status).toBe(400);
      });

      it('o envio barrado pelo intervalo de 3 s (429) não grava, não sobe a rev e não avisa', async () => {
        const { login, push, call, db, advance } = await setup();
        const { token } = await login('ana');
        expect((await push(token, 0)).body.rev).toBe(1);
        advance(-4_000); // o próximo sai 1 s depois do anterior
        const fast = await push(token, 1, { privado: '{"v":"rapido"}', novas: [review('rapida01')] });
        expect(fast.status).toBe(429);
        expect(fast.body.erro).toBe('devagar');
        const res = await call('/v1/eu/mural', { headers: { Authorization: `Bearer ${token}` } });
        expect(res.headers.get('Mural-Rev')).toBe('1');
        expect(await gunzip(await res.arrayBuffer())).toBe('{"reviews":[]}');
        expect(await db.all('SELECT 1 FROM atividades')).toEqual([]);
      });
    });

    describe('o mural público acompanha o privado', () => {
      it('cada envio troca os dois juntos, com a mesma rev; ?rev= velho traz o novo', async () => {
        const { login, push, call } = await setup();
        const ana = await login('ana');
        await push(ana.token, 0, { privado: '{"p":1}', publico: '{"pub":1}' });
        await push(ana.token, 1, { privado: '{"p":2}', publico: '{"pub":2}' });
        const pub = await call(`/v1/murais/${ana.codigo}?rev=1`);
        expect(pub.status).toBe(200);
        expect(pub.headers.get('Mural-Rev')).toBe('2');
        expect(await gunzip(await pub.arrayBuffer())).toBe('{"pub":2}');
        const mine = await call('/v1/eu/mural?rev=1', { headers: { Authorization: `Bearer ${ana.token}` } });
        expect(mine.headers.get('Mural-Rev')).toBe('2');
        expect(await gunzip(await mine.arrayBuffer())).toBe('{"p":2}');
      });

      it('a lista de quem eu sigo traz a rev do mural público (o site usa para saber se mudou)', async () => {
        const { login, push, follow, people } = await setup();
        const ana = await login('ana');
        const bia = await login('bia');
        await follow(bia.token, ana.codigo);
        expect((await people(bia.token)).seguindo[0].rev).toBeNull();
        await push(ana.token, 0);
        await push(ana.token, 1);
        expect((await people(bia.token)).seguindo[0].rev).toBe(2);
      });

      it('o mural de outra pessoa nunca traz o privado dela', async () => {
        const { login, push, call } = await setup();
        const ana = await login('ana');
        await push(ana.token, 0, { privado: '{"segredo":"chave-rawg"}', publico: '{"reviews":[]}' });
        const pub = await call(`/v1/murais/${ana.codigo}`);
        expect(await gunzip(await pub.arrayBuffer())).not.toContain('chave-rawg');
      });
    });

    describe('reações', () => {
      /** Bia segue Ana e reage à resenha r-hades dela. */
      async function reacting(env: Record<string, string> = {}) {
        const t = await two(env);
        await t.follow(t.bia.token, t.ana.codigo);
        const react = (token: string, codigo: string, ref: string, reacao: unknown, titulo = 'Hades') =>
          t.json('PUT', `/v1/murais/${codigo}/reacoes/${ref}`, { reacao, titulo, mural: 'jogos' }, token);
        const unreact = (token: string, codigo: string, ref: string) => t.json('DELETE', `/v1/murais/${codigo}/reacoes/${ref}`, undefined, token);
        const list = async (codigo: string, token?: string) => {
          const res = await t.json('GET', `/v1/murais/${codigo}/reacoes`, undefined, token);
          return { status: res.status, body: res.status === 200 ? ((await res.json()) as any) : null };
        };
        return { ...t, react, unreact, list };
      }

      it('quem segue reage; todo mundo vê, com o nome de quem reagiu', async () => {
        const { react, list, ana, bia } = await reacting();
        expect((await react(bia.token, ana.codigo, 'r-hades', 'fogo')).status).toBe(201);
        const { status, body } = await list(ana.codigo);
        expect(status).toBe(200);
        expect(body.reacoes).toEqual({ 'r-hades': [{ codigo: bia.codigo, nome: 'Bia', reacao: 'fogo', em: NOW.toISOString() }] });
      });

      it('o dono recebe o aviso no correio, e ele conta como não visto', async () => {
        const { react, feed, advance, ana, bia } = await reacting();
        // um minuto depois de a conta da Ana nascer (o visto começa ali)
        advance(60_000);
        await react(bia.token, ana.codigo, 'r-hades', 'uau');
        const { body } = await feed(ana.token);
        const item = body.itens.find((i: any) => i.tipo === 'reagiu');
        expect(item).toEqual({
          tipo: 'reagiu',
          em: new Date(NOW.getTime() + 60_000).toISOString(),
          pessoa: { codigo: bia.codigo, nome: 'Bia' },
          ref: 'r-hades',
          titulo: 'Hades',
          mural: 'jogos',
          silenciado: false,
          reacao: 'uau',
        });
        expect(body.naoVistas).toBe(1);
        // e só o dono: quem reagiu não vê o próprio aviso
        expect((await feed(bia.token)).body.itens.some((i: any) => i.tipo === 'reagiu')).toBe(false);
      });

      it('trocar de reação substitui a de antes (e o aviso); a mesma de novo não muda nada', async () => {
        const { react, list, feed, advance, ana, bia } = await reacting();
        await react(bia.token, ana.codigo, 'r-hades', 'fogo');
        advance(60_000);
        expect((await react(bia.token, ana.codigo, 'r-hades', 'amei')).status).toBe(200);
        const later = new Date(NOW.getTime() + 60_000).toISOString();
        expect((await list(ana.codigo)).body.reacoes['r-hades']).toEqual([{ codigo: bia.codigo, nome: 'Bia', reacao: 'amei', em: later }]);
        advance(60_000);
        expect((await react(bia.token, ana.codigo, 'r-hades', 'amei')).status).toBe(200);
        expect((await list(ana.codigo)).body.reacoes['r-hades'][0].em).toBe(later);
        const avisos = (await feed(ana.token)).body.itens.filter((i: any) => i.tipo === 'reagiu');
        expect(avisos.map((i: any) => i.reacao)).toEqual(['amei']);
      });

      it('tirar a reação tira o aviso também', async () => {
        const { react, unreact, list, feed, ana, bia } = await reacting();
        await react(bia.token, ana.codigo, 'r-hades', 'rindo');
        expect((await unreact(bia.token, ana.codigo, 'r-hades')).status).toBe(200);
        expect((await list(ana.codigo)).body.reacoes).toEqual({});
        expect((await feed(ana.token)).body.itens.some((i: any) => i.tipo === 'reagiu')).toBe(false);
      });

      it('recusa: sem seguir (403), a própria resenha, reação ou resenha inventada (400), código de ninguém (404), sem entrar (401)', async () => {
        const { react, json, ana, bia } = await reacting();
        expect((await react(ana.token, bia.codigo, 'r-celeste', 'fogo')).status).toBe(403);
        expect((await react(ana.token, ana.codigo, 'r-hades', 'fogo')).status).toBe(400);
        expect((await react(bia.token, ana.codigo, 'r-hades', 'raiva')).status).toBe(400);
        expect((await react(bia.token, ana.codigo, 'r-hades', 7)).status).toBe(400);
        expect((await react(bia.token, ana.codigo, 'com espaço', 'fogo')).status).toBe(400);
        expect((await react(bia.token, 'ZZZZ-ZZZZ', 'r-hades', 'fogo')).status).toBe(404);
        expect((await json('PUT', `/v1/murais/${ana.codigo}/reacoes/r-hades`, { reacao: 'fogo' })).status).toBe(401);
      });

      it('além das sete, vale qualquer emoji sozinho (o "+"); texto ou dois emojis, não', async () => {
        const { react, list, ana, bia } = await reacting();
        for (const ok of ['🦄', '🏳️‍🌈', '👍🏽', '🇧🇷', '❤️‍🔥']) expect((await react(bia.token, ana.codigo, 'r-hades', ok)).status, ok).toBeLessThan(300);
        expect((await list(ana.codigo)).body.reacoes['r-hades'][0].reacao).toBe('❤️‍🔥');
        for (const bad of ['ab', '🦄🦄', '🦄a', '1', ' ', 'x'.repeat(40)]) expect((await react(bia.token, ana.codigo, 'r-hades', bad)).status, bad).toBe(400);
      });

      it('com os murais só para quem entrou, a lista também pede a conta', async () => {
        const { list, ana, bia } = await reacting({ VER_MURAIS: 'logados' });
        expect((await list(ana.codigo)).status).toBe(401);
        expect((await list(ana.codigo, bia.token)).status).toBe(200);
      });

      it('o dono que silenciou quem reagiu recebe o aviso sem contar', async () => {
        const { react, follow, mute, feed, advance, ana, bia } = await reacting();
        await follow(ana.token, bia.codigo);
        await mute(ana.token, bia.codigo, true);
        advance(60_000);
        await react(bia.token, ana.codigo, 'r-hades', 'chorei');
        const { body } = await feed(ana.token);
        expect(body.itens.find((i: any) => i.tipo === 'reagiu').silenciado).toBe(true);
        expect(body.naoVistas).toBe(0);
      });

      it(`no máximo ${MAX_REACTIONS_PER_DAY} reações por dia (429 reagir-devagar)`, async () => {
        const { db, react, ana, bia } = await reacting();
        await db.batch(
          Array.from({ length: MAX_REACTIONS_PER_DAY }, () => ({
            sql: "INSERT INTO freios (usuario_id, acao, criado_em) VALUES (?, 'reagir', ?)",
            params: [bia.id, new Date(NOW.getTime() - 60_000).toISOString()],
          })),
        );
        const res = await react(bia.token, ana.codigo, 'r-hades', 'fogo');
        expect(res.status).toBe(429);
        expect(((await res.json()) as any).erro).toBe('reagir-devagar');
      });

      // Antes contava só as reações que existiam: trocar ou tirar e reagir de novo abria a vaga sem fim,
      // e cada reação nova avisava o dono outra vez.
      it('trocar ou tirar a reação não devolve a vaga do dia', async () => {
        const { db, react, unreact, ana, bia } = await reacting();
        await db.batch(
          Array.from({ length: MAX_REACTIONS_PER_DAY - 2 }, () => ({
            sql: "INSERT INTO freios (usuario_id, acao, criado_em) VALUES (?, 'reagir', ?)",
            params: [bia.id, new Date(NOW.getTime() - 60_000).toISOString()],
          })),
        );
        expect((await react(bia.token, ana.codigo, 'r-hades', 'fogo')).status).toBe(201);
        expect((await react(bia.token, ana.codigo, 'r-hades', 'amei')).status).toBe(200);
        // repetir a mesma reação não gasta nada
        expect((await react(bia.token, ana.codigo, 'r-hades', 'amei')).status).toBe(200);
        expect((await unreact(bia.token, ana.codigo, 'r-hades')).status).toBe(200);
        expect((await react(bia.token, ana.codigo, 'r-hades', 'fogo')).status).toBe(429);
      });

      it('apagar a conta leva as reações que ela deu', async () => {
        const { react, list, json, db, ana, bia } = await reacting();
        await react(bia.token, ana.codigo, 'r-hades', 'fogo');
        expect((await json('DELETE', '/v1/eu', undefined, bia.token)).status).toBe(200);
        expect((await list(ana.codigo)).body.reacoes).toEqual({});
        // e os freios dela (as reações dadas no dia)
        expect(await db.all('SELECT 1 FROM freios WHERE usuario_id = ?', [bia.id])).toEqual([]);
        const left = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM reacoes', []);
        expect(left?.n).toBe(0);
      });

      it('apagar a conta leva as reações que ela recebeu (e os avisos delas)', async () => {
        const { react, json, db, ana, bia } = await reacting();
        await react(bia.token, ana.codigo, 'r-hades', 'fogo');
        expect((await json('DELETE', '/v1/eu', undefined, ana.token)).status).toBe(200);
        const left = await db.first<{ n: number }>('SELECT COUNT(*) AS n FROM reacoes', []);
        expect(left?.n).toBe(0);
        expect(await db.all("SELECT 1 FROM atividades WHERE tipo = 'reagiu'")).toEqual([]);
      });
    });
  });
}
