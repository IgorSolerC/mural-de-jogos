import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import type { BaralhoV1, CartaV1, ContextoEstudosV1, ItemDaFilaV1 } from '../../contrato/api-v1/estudos';
import { FERRAMENTAS, alcanca } from '../../contrato/api-v1/ferramentas';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, gzip, jsonCaller } from './harness';
import { nota } from './kanban.suite';

/**
 * Os Estudos na API das AIs (PLANO-API.md, seção 23, rodada 12): o espelho das cartas, dos baralhos e da
 * fila do dia que o site enche, a leitura com a chave (o que estudar agora, com a frente e o verso) e os
 * pedidos de mexer nos baralhos e nas cartas e de responder. Roda nos dois bancos.
 *
 * NOW é 2026-10-06 15:00 UTC: meio-dia em São Paulo, o dia de estudo 2026-10-06.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };
const at = (ms: number) => new Date(NOW.getTime() + ms).toISOString();
const MIN = 60_000;
const HOJE = '2026-10-06';
const AMANHA = '2026-10-07';

export function carta(n: string, extra: Partial<CartaV1> = {}): CartaV1 {
  return {
    nota: n,
    titulo: `Frente ${n}`,
    titulo_da_frente: null,
    subtitulo: null,
    imagem: null,
    nota_titulo: `Frente ${n}`,
    verso: `O verso de ${n}`,
    grupo: 'Estudos',
    baralhos: ['d-jp'],
    no_mural: null,
    fica_no_mural: false,
    nivel: 'aprendendo',
    estado: 'revisao',
    volta_em: '2026-10-06T07:00:00.000Z',
    vistas: 3,
    acertos: 2,
    erros: 1,
    ultimas: '101',
    entrou_em: '2026-10-01T10:00:00.000Z',
    versao: '2026-10-05T10:00:00.000Z',
    ...extra,
  };
}

const item = (n: string, baralho: string, tipo: ItemDaFilaV1['tipo'], volta_em: string | null = null): ItemDaFilaV1 => ({ nota: n, baralho, tipo, volta_em });

/** O fogo já voltou, a terra volta em 10 minutos, o vento daqui a 2 horas; a água é revisão, a lei é nova. */
export const CARTAS: CartaV1[] = [
  carta('n-agua', { titulo: '水', titulo_da_frente: '水', nota_titulo: 'Água' }),
  carta('n-fogo', { titulo: '火', titulo_da_frente: '火', nota_titulo: 'Fogo', estado: 'aprendendo', nivel: 'nova', volta_em: at(-MIN) }),
  carta('n-terra', { titulo: '土', estado: 'aprendendo', nivel: 'nova', volta_em: at(10 * MIN) }),
  carta('n-vento', { titulo: '風', baralhos: ['d-jp', 'd-kanji'], estado: 'reaprendendo', volta_em: at(120 * MIN) }),
  carta('n-lei', { titulo: 'Usucapião', grupo: 'Trabalho', baralhos: ['d-dir'], estado: 'nova', nivel: 'desconhecida', volta_em: null, vistas: 0, acertos: 0, erros: 0, ultimas: '' }),
];

const FILA_JP = [item('n-fogo', 'd-jp', 'aprender', at(-MIN)), item('n-terra', 'd-jp', 'aprender', at(10 * MIN)), item('n-vento', 'd-jp', 'aprender', at(120 * MIN)), item('n-agua', 'd-jp', 'revisao')];

const baralho = (id: string, nome: string, posicao: number, itens: ItemDaFilaV1[], extra: Partial<BaralhoV1> = {}): BaralhoV1 => ({
  id,
  nome,
  grupo: 'Estudos',
  cor: 'azul',
  icone: null,
  novas_por_dia: 5,
  no_mural: false,
  estilo: 'classica',
  posicao,
  cartas: 1,
  por_nivel: { desconhecida: 0, nova: 0, aprendendo: 1, dominada: 0 },
  filas: [
    { dia: HOJE, itens, cortada: false },
    { dia: AMANHA, itens: [], cortada: false },
  ],
  versao: '2026-10-01T10:00:00.000Z',
  ...extra,
});

export const BARALHOS: BaralhoV1[] = [
  baralho('d-jp', 'Japonês', 0, FILA_JP, { cartas: 4, por_nivel: { desconhecida: 0, nova: 2, aprendendo: 2, dominada: 0 } }),
  baralho('d-kanji', 'Kanji', 1, [], { estilo: 'biblioteca' }),
  baralho('d-dir', 'Direito Civil', 2, [item('n-lei', 'd-dir', 'nova')], { cor: 'vermelho', no_mural: true, grupo: 'Trabalho' }),
];

export const CONTEXTO: ContextoEstudosV1 = {
  config: { retencao: 0.9, revisoes_por_dia: 200, ordem_das_novas: 'entrada' },
  cartas: 5,
  filas: [
    { dia: HOJE, itens: [...FILA_JP.slice(0, 3), item('n-agua', 'd-jp', 'revisao'), item('n-lei', 'd-dir', 'nova')], cortada: false },
    { dia: AMANHA, itens: [item('n-agua', 'd-jp', 'revisao')], cortada: false },
  ],
};

export function estudosSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'estudos', alg: 'RS256' };
  });

  async function setup() {
    const db = getDb();
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    const config: Config = readConfig(ENV);
    const clock = { t: NOW.getTime() };
    const deps: Deps = { db, config, now: () => new Date(clock.t), verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })) };
    const advance = (ms: number) => void (clock.t += ms);
    const app = createApp(deps);
    const call = (path: string, init?: RequestInit) => app.request(`https://api.teste${path}`, init);
    const json = jsonCaller(call);
    const body = async (res: Response | Promise<Response>) => (await (await res).json()) as any;
    const login = async (sub: string) => {
      const credential = await new SignJWT({ given_name: sub })
        .setProtectedHeader({ alg: 'RS256', kid: 'estudos' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date(clock.t))
        .setExpirationTime('1h')
        .sign(key);
      const b = await body(json('POST', '/v1/auth/google', { credential }));
      return { token: b.token as string, id: b.conta.id as string };
    };
    const push = async (token: string, base: number) => {
      const form = new FormData();
      form.append('privado', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      form.append('publico', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      const res = await call('/v1/eu/mural', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Mural-Rev-Base': String(base) }, body: form });
      return ((await res.json()) as { rev: number }).rev;
    };
    const newKey = async (token: string, escopos: string[], extra: Record<string, unknown> = {}) =>
      (await body(json('POST', '/v1/eu/chaves', { nome: 'Professor', escopos, validade: 30, aprovacao: 'nunca', ...extra }, token))) as { segredo: string; chave: { id: string } };
    const mirror = (token: string, payload: unknown) => json('POST', '/v1/eu/espelho', payload, token);
    const row = (tipo: string, id: string, dados: unknown) => ({ tipo, id, hash: 'ab'.repeat(8), dados });
    const tudo = () => [
      ...CARTAS.map((c) => row('carta', c.nota, c)),
      ...BARALHOS.map((b) => row('baralho', b.id, b)),
      row('contexto-estudos', 'estudos', CONTEXTO),
      row('nota', 'n-solta', nota('n-solta', { titulo: 'Montanha', texto: '山 = montanha', grupo: 'Estudos' })),
      row('nota', 'n-outra', nota('n-outra', { titulo: 'Contrato', grupo: 'Trabalho' })),
    ];
    const ext = (secret: string, path: string, init: RequestInit = {}) =>
      call(path, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } });
    const send = (secret: string, method: string, path: string, data: unknown = {}) => ext(secret, path, { method, body: JSON.stringify(data) });
    /** Uma conta, uma chave com as permissões dadas e o espelho cheio (os Estudos e duas notas). */
    const ready = async (escopos = ['estudos:ler'], keyExtra: Record<string, unknown> = {}) => {
      const me = await login('ana');
      // a chave das notas deixa as notas entrarem no espelho (virar carta precisa da nota)
      await newKey(me.token, ['notas:ler']);
      const k = await newKey(me.token, escopos, keyExtra);
      const rev = await push(me.token, 0);
      const res = await mirror(me.token, { rev, fuso: 'America/Sao_Paulo', poe: tudo() });
      expect(res.status).toBe(200);
      return { me, secret: k.segredo, keyId: k.chave.id, rev };
    };
    return { db, deps, call, json, body, login, push, newKey, mirror, row, tudo, ext, send, ready, advance };
  }

  describe(`${label}: o espelho dos Estudos`, () => {
    it('qualquer permissão dos Estudos faz a nuvem pedir a área estudos', async () => {
      const t = await setup();
      for (const scope of ['estudos:ler', 'estudos:estudar', 'estudos:escrever', 'estudos:apagar']) {
        await t.db.batch(TABLES.map((x) => ({ sql: `DELETE FROM ${x}` })));
        const me = await t.login('ana');
        await t.newKey(me.token, [scope]);
        const got = await t.body(t.call('/v1/eu/espelho', { headers: { Authorization: `Bearer ${me.token}` } }));
        expect(got.areas, scope).toEqual(['estudos']);
      }
    });

    it('só a forma da v1 entra: um campo a mais some, e o que não serve é recusado', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['estudos:ler']);
      const rev = await t.push(me.token, 0);
      const k = CARTAS[0]!;
      expect((await t.mirror(me.token, { rev, poe: [t.row('carta', k.nota, { ...k, srs: { s: 3 } }), t.row('baralho', 'd-jp', { ...BARALHOS[0], segredo: 1 })] })).status).toBe(200);
      const saved = JSON.parse((await t.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE tipo = 'carta' AND id = ?", [k.nota]))!.dados);
      expect(saved).toEqual(k);
      const grupo = await t.db.first<{ grupo: string; data: string }>("SELECT grupo, data FROM api_espelho WHERE tipo = 'carta' AND id = ?", [k.nota]);
      expect(grupo).toEqual({ grupo: 'estudos', data: '2026-10-06' });
      const bad = async (tipo: string, id: string, dados: unknown) => (await t.mirror(me.token, { rev, poe: [t.row(tipo, id, dados)] })).status;
      expect(await bad('carta', k.nota, { ...k, nivel: 'mestre' })).toBe(400);
      // a carta guardada fora dos baralhos (a anotação mudou de grupo) vai com a lista vazia
      expect(await bad('carta', k.nota, { ...k, baralhos: [] })).toBe(200);
      expect(await bad('baralho', 'd-jp', { ...BARALHOS[0], grupo: 5 })).toBe(400);
      // o grupo do baralho, sem acento, como o das cartas (o limite de grupos da chave vale para ele)
      expect((await t.db.first<{ grupo: string }>("SELECT grupo FROM api_espelho WHERE tipo = 'baralho' AND id = 'd-jp'"))!.grupo).toBe('estudos');
      // o site de antes dos grupos manda o baralho sem o campo: vale null
      const { grupo: _g, ...old } = BARALHOS[0]!;
      expect(await bad('baralho', 'd-jp', old)).toBe(200);
      expect(JSON.parse((await t.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE tipo = 'baralho' AND id = 'd-jp'"))!.dados).grupo).toBeNull();
      expect(await bad('carta', k.nota, { ...k, imagem: 'javascript:alert(1)' })).toBe(400);
      expect(await bad('carta', 'outra', k)).toBe(400);
      expect(await bad('baralho', 'd-jp', { ...BARALHOS[0], estilo: 'neon' })).toBe(400);
      expect(await bad('baralho', 'd-jp', { ...BARALHOS[0], filas: [{ dia: HOJE, itens: [{ nota: 'x', baralho: 'd-jp', tipo: 'talvez', volta_em: null }], cortada: false }] })).toBe(400);
      expect(await bad('contexto-estudos', 'outro', CONTEXTO)).toBe(400);
      expect(await bad('contexto-estudos', 'estudos', { ...CONTEXTO, config: { ...CONTEXTO.config, ordem_das_novas: 'aleatoria' } })).toBe(400);
    });

    it('a chave que só lê as Anotações não deixa as cartas entrarem; a limpeza tira os Estudos sem chave', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['notas:ler']);
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: [t.row('carta', 'n-agua', CARTAS[0])] })).status).toBe(400);
      const k = await t.newKey(me.token, ['estudos:estudar']);
      expect((await t.mirror(me.token, { rev, poe: [t.row('carta', 'n-agua', CARTAS[0])] })).status).toBe(200);
      await t.json('DELETE', `/v1/eu/chaves/${k.chave.id}`, undefined, me.token);
      await cleanup(t.deps);
      expect((await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM api_espelho WHERE tipo = 'carta'"))!.n).toBe(0);
    });
  });

  describe(`${label}: ler os Estudos com a chave`, () => {
    it('pede estudos:ler (a que só estuda não lê), mas o contexto mostra os baralhos a qualquer chave dos Estudos', async () => {
      const t = await setup();
      const { me } = await t.ready();
      const only = await t.newKey(me.token, ['estudos:estudar']);
      expect((await t.ext(only.segredo, '/ext/v1/estudos')).status).toBe(403);
      expect((await t.ext(only.segredo, '/ext/v1/estudos/hoje')).status).toBe(403);
      const ctx = await t.body(t.ext(only.segredo, '/ext/v1/contexto'));
      expect(ctx.estudos.baralhos.map((b: { nome: string }) => b.nome)).toEqual(['Japonês', 'Kanji', 'Direito Civil']);
      expect(ctx.estudos.config.retencao).toBe(0.9);
      const notes = await t.newKey(me.token, ['notas:ler']);
      expect((await t.body(t.ext(notes.segredo, '/ext/v1/contexto'))).estudos).toBeNull();
    });

    it('os baralhos com o que tem para hoje em cada um (as cartas nos passos que voltam mais tarde não contam)', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const got = await t.body(t.ext(secret, '/ext/v1/estudos'));
      expect(got.cartas).toBe(5);
      expect(got.baralhos.map((b: { nome: string }) => b.nome)).toEqual(['Japonês', 'Kanji', 'Direito Civil']);
      expect(got.baralhos[0].filas).toBeUndefined();
      expect(got.baralhos[0].hoje).toEqual({ novas: 0, aprender: 2, revisar: 1 });
      expect(got.baralhos[2].hoje).toEqual({ novas: 1, aprender: 0, revisar: 0 });
      expect(got.hoje).toEqual({ dia: HOJE, contagem: { novas: 1, aprender: 2, revisar: 1 }, cortada: false });
    });

    it('estudar agora: a que já voltou, a revisão e a nova, a que volta em 10 minutos; a de daqui a 2 horas fica para mais tarde', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const got = await t.body(t.ext(secret, '/ext/v1/estudos/hoje'));
      expect(got.dia).toBe(HOJE);
      expect(got.cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-fogo', 'n-agua', 'n-lei', 'n-terra']);
      expect(got.cartas[0]).toEqual({ ...CARTAS[1], tipo: 'aprender', baralho_da_vez: 'd-jp' });
      expect(got.cartas[0].verso).toBe('O verso de n-fogo');
      expect(got.mais_tarde).toEqual([{ nota: 'n-vento', titulo: '風', volta_em: at(120 * MIN) }]);
      expect(got.contagem).toEqual({ novas: 1, aprender: 2, revisar: 1 });
      // com limite, o resto em restam; de um baralho, a fila dele
      const one = await t.body(t.ext(secret, '/ext/v1/estudos/hoje?limite=1'));
      expect(one.cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-fogo']);
      expect(one.restam).toBe(3);
      const dir = await t.body(t.ext(secret, `/ext/v1/estudos/hoje?baralho=${encodeURIComponent('direito civil')}`));
      expect(dir.baralho).toEqual({ id: 'd-dir', nome: 'Direito Civil', grupo: 'Trabalho' });
      expect(dir.cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-lei']);
      const missing = await t.ext(secret, '/ext/v1/estudos/hoje?baralho=Grego');
      expect(missing.status).toBe(404);
      expect((await t.body(missing)).mensagem).toContain('Japonês (Estudos), Kanji (Estudos), Direito Civil (Trabalho)');
    });

    it('o grupo: os baralhos dele, o Estudar o grupo e as cartas dele; o grupo sem baralho é 404', async () => {
      const t = await setup();
      const { secret } = await t.ready(['estudos:ler']);
      const jp = await t.body(t.ext(secret, '/ext/v1/estudos?grupo=estudos'));
      expect(jp.grupo).toBe('Estudos');
      // cada carta uma vez, mesmo em dois baralhos do grupo (o 風 está no Japonês e no Kanji)
      expect(jp.cartas).toBe(4);
      expect(jp.baralhos.map((b: { nome: string; grupo: string }) => `${b.nome}/${b.grupo}`)).toEqual(['Japonês/Estudos', 'Kanji/Estudos']);
      expect(jp.hoje.contagem).toEqual({ novas: 0, aprender: 2, revisar: 1 });
      const now = await t.body(t.ext(secret, '/ext/v1/estudos/hoje?grupo=Trabalho'));
      expect(now.cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-lei']);
      const cards = await t.body(t.ext(secret, '/ext/v1/estudos/cartas?grupo=trabalho'));
      expect(cards.itens.map((c: { nota: string }) => c.nota)).toEqual(['n-lei']);
      const none = await t.ext(secret, '/ext/v1/estudos?grupo=Culinaria');
      expect(none.status).toBe(404);
      expect((await t.body(none)).mensagem).toContain('Os grupos com baralho: Estudos, Trabalho');
    });

    it('o tempo anda: a de 2 horas aparece; amanhã vale a fila de amanhã; depois disso, o aviso de abrir o Murall', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      t.advance(121 * MIN);
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/hoje'))).cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-fogo', 'n-terra', 'n-vento', 'n-agua', 'n-lei']);
      // 15h em São Paulo + 15 h = 6h do dia seguinte (depois das 4h)
      t.advance(15 * 60 * MIN);
      const tomorrow = await t.body(t.ext(secret, '/ext/v1/estudos/hoje'));
      expect(tomorrow.dia).toBe(AMANHA);
      expect(tomorrow.cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-agua']);
      t.advance(24 * 60 * MIN);
      const old = await t.body(t.ext(secret, '/ext/v1/estudos/hoje'));
      expect(old.cartas).toEqual([]);
      expect(old.aviso).toContain('Abra o site');
      expect((await t.body(t.ext(secret, '/ext/v1/estudos'))).hoje.contagem).toBeNull();
    });

    it('a chave limitada a um grupo só vê as cartas das notas dele', async () => {
      const t = await setup();
      const { secret } = await t.ready(['estudos:ler'], { grupos: ['Trabalho'] });
      const got = await t.body(t.ext(secret, '/ext/v1/estudos/hoje'));
      expect(got.cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-lei']);
      expect(got.mais_tarde).toEqual([]);
      const decks = await t.body(t.ext(secret, '/ext/v1/estudos'));
      expect(decks.hoje.contagem).toEqual({ novas: 1, aprender: 0, revisar: 0 });
      // nem quantas cartas há nas notas dos outros grupos
      expect(decks.cartas).toBe(1);
      // e só os baralhos do grupo dela (cada baralho é de um grupo)
      expect(decks.baralhos.map((b: { nome: string; cartas: number }) => `${b.nome}: ${b.cartas}`)).toEqual(['Direito Civil: 1']);
      expect(decks.baralhos[0].por_nivel).toEqual({ desconhecida: 1, nova: 0, aprendendo: 0, dominada: 0 });
      expect((await t.body(t.ext(secret, '/ext/v1/contexto'))).estudos.baralhos.map((b: { nome: string }) => b.nome)).toEqual(['Direito Civil']);
      expect((await t.ext(secret, '/ext/v1/estudos/hoje?baralho=Kanji')).status).toBe(404);
      expect((await t.body(t.ext(secret, '/ext/v1/contexto'))).estudos.cartas).toBe(1);
      expect((await t.ext(secret, '/ext/v1/estudos/cartas/n-agua')).status).toBe(404);
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/cartas'))).itens.map((c: { nota: string }) => c.nota)).toEqual(['n-lei']);
    });

    it('as cartas: sem o verso (com_verso traz), por baralho, nível e busca sem acento; uma carta pelo id', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const all = await t.body(t.ext(secret, '/ext/v1/estudos/cartas?ordem=titulo'));
      expect(all.itens).toHaveLength(5);
      expect(all.itens[0].verso).toBeUndefined();
      expect(all.itens[0].resumo_do_verso).toMatch(/^O verso de/);
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/cartas?com_verso=sim&limite=1'))).itens[0].verso).toMatch(/^O verso de/);
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/cartas?baralho=kanji'))).itens.map((c: { nota: string }) => c.nota)).toEqual(['n-vento']);
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/cartas?nivel=desconhecida'))).itens.map((c: { nota: string }) => c.nota)).toEqual(['n-lei']);
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/cartas?q=usucapiao'))).itens.map((c: { nota: string }) => c.nota)).toEqual(['n-lei']);
      expect((await t.ext(secret, '/ext/v1/estudos/cartas?nivel=mestre')).status).toBe(400);
      expect((await t.ext(secret, '/ext/v1/estudos/cartas?ordem=constructor')).status).toBe(400);
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/cartas/n-agua'))).carta).toEqual(CARTAS[0]);
      expect((await t.ext(secret, '/ext/v1/estudos/cartas/n-solta')).status).toBe(404);
    });
  });

  describe(`${label}: escrever nos Estudos com a chave`, () => {
    const WRITE = ['estudos:ler', 'estudos:estudar', 'estudos:escrever', 'estudos:apagar'];

    it('responder: entra direto mesmo com a aprovação "mudancas", e sai da fila de agora na hora', async () => {
      const t = await setup();
      const { secret } = await t.ready(WRITE, { aprovacao: 'mudancas' });
      const res = await t.send(secret, 'POST', '/ext/v1/estudos/cartas/n-fogo/responder', { acertou: true, baralho: 'Japonês' });
      expect(res.status).toBe(202);
      const got = await t.body(res);
      expect(got.pedido.estado).toBe('pendente');
      expect(got.pedido.op).toBe('carta.responder');
      const pedido = await t.db.first<{ dados: string }>('SELECT dados FROM api_pedidos WHERE id = ?', [got.pedido.id]);
      expect(JSON.parse(pedido!.dados)).toEqual({ acertou: true, baralho: 'd-jp' });
      const now = await t.body(t.ext(secret, '/ext/v1/estudos/hoje'));
      expect(now.cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-agua', 'n-lei', 'n-terra']);
      // mudar espera a aprovação
      const edit = await t.body(t.send(secret, 'PATCH', '/ext/v1/estudos/cartas/n-agua', { subtitulo: 'mizu' }));
      expect(edit.pedido.estado).toBe('aguardando-aprovacao');
      expect(edit.carta.subtitulo).toBe('mizu');
      // de um baralho que não é dela, ou sem dizer se acertou
      const wrong = await t.send(secret, 'POST', '/ext/v1/estudos/cartas/n-fogo/responder', { acertou: false, baralho: 'Direito Civil' });
      expect(wrong.status).toBe(422);
      expect((await t.body(wrong)).erro).toBe('baralho-de-fora');
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas/n-fogo/responder', { acertou: 'sim' })).status).toBe(400);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas/n-solta/responder', { acertou: true })).status).toBe(404);
    });

    it('cada operação pede a permissão dela', async () => {
      const t = await setup();
      const { secret } = await t.ready(['estudos:ler']);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas/n-fogo/responder', { acertou: true })).status).toBe(403);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Grego' })).status).toBe(403);
      expect((await t.send(secret, 'DELETE', '/ext/v1/estudos/baralhos/Kanji')).status).toBe(403);
      expect((await t.send(secret, 'DELETE', '/ext/v1/estudos/cartas/n-agua')).status).toBe(403);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas/n-agua/recomecar')).status).toBe(403);
    });

    it('baralhos: criar (o nome repetido é 409), já usar o nome dele, mudar e apagar', async () => {
      const t = await setup();
      const { secret } = await t.ready(WRITE);
      // o grupo é obrigatório, e tem de ser um que existe
      const noGroup = await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Latim' });
      expect(noGroup.status).toBe(422);
      expect((await t.body(noGroup)).erro).toBe('grupo-obrigatorio');
      const unknown = await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Latim', grupo: 'Culinária' });
      expect(unknown.status).toBe(422);
      expect((await t.body(unknown)).mensagem).toContain('Os grupos:');
      const dup = await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'japones', grupo: 'estudos' });
      expect(dup.status).toBe(409);
      expect((await t.body(dup)).baralho.id).toBe('d-jp');
      // o grupo escrito como já está
      const made = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Grego', grupo: 'ESTUDOS', cor: 'verde', novas_por_dia: 10, estilo: 'selo' }));
      expect(made.baralho).toMatchObject({ nome: 'Grego', grupo: 'Estudos', cor: 'verde', novas_por_dia: 10, estilo: 'selo', posicao: 3, cartas: 0 });
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Grego', grupo: 'Estudos' })).status).toBe(409);
      // o grupo não muda por editar
      expect((await t.send(secret, 'PATCH', '/ext/v1/estudos/baralhos/Kanji', { grupo: 'Trabalho' })).status).toBe(400);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'x', cor: 'roxo' })).status).toBe(400);
      // o baralho que vai nascer já aparece, e já recebe cartas pelo nome
      const list = await t.body(t.ext(secret, '/ext/v1/estudos'));
      expect(list.baralhos.map((b: { nome: string }) => b.nome)).toEqual(['Japonês', 'Kanji', 'Direito Civil', 'Grego']);
      expect(list.baralhos[3].pedidos).toHaveLength(1);
      const put = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-solta', baralhos: ['grego'] }));
      expect(put.carta.baralhos).toEqual([made.baralho.id]);
      // mudar: o nome e o lugar (o nome de outro é 409)
      expect((await t.send(secret, 'PATCH', '/ext/v1/estudos/baralhos/Kanji', { nome: 'Japonês' })).status).toBe(409);
      expect((await t.send(secret, 'PATCH', '/ext/v1/estudos/baralhos/Kanji', {})).status).toBe(400);
      const moved = await t.body(t.send(secret, 'PATCH', '/ext/v1/estudos/baralhos/Kanji', { nome: 'Kanji N5', posicao: 0 }));
      expect(moved.baralho).toMatchObject({ id: 'd-kanji', nome: 'Kanji N5', posicao: 0 });
      expect((await t.body(t.ext(secret, '/ext/v1/estudos'))).baralhos.map((b: { nome: string }) => b.nome)).toEqual(['Kanji N5', 'Japonês', 'Direito Civil', 'Grego']);
      const del = await t.body(t.send(secret, 'DELETE', '/ext/v1/estudos/baralhos/d-dir'));
      expect(del.pedido.op).toBe('baralho.apagar');
      expect((await t.send(secret, 'DELETE', '/ext/v1/estudos/baralhos/Latim')).status).toBe(404);
    });

    it('virar carta: uma (com a frente) ou um lote; os nomes viram ids; a anotação continua no mural', async () => {
      const t = await setup();
      const { secret } = await t.ready(WRITE);
      const one = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-solta', baralhos: ['Kanji'], titulo: '山', subtitulo: 'yama' }));
      expect(one.carta).toMatchObject({ nota: 'n-solta', titulo: '山', subtitulo: 'yama', nota_titulo: 'Montanha', verso: '山 = montanha', baralhos: ['d-kanji'], no_mural: true, nivel: 'desconhecida' });
      // a carta que vai nascer aparece na lista e pelo id
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/cartas?baralho=Kanji'))).itens.map((c: { nota: string }) => c.nota)).toEqual(['n-solta', 'n-vento']);
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/cartas/n-solta'))).carta.pedidos).toHaveLength(1);
      // a que já é carta entra no baralho novo também
      const more = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas', { notas: ['n-agua', 'n-solta'], baralhos: ['Kanji'] }));
      expect(more.cartas.map((c: CartaV1) => c.baralhos)).toEqual([['d-jp', 'd-kanji'], ['d-kanji']]);
      expect(more.pedidos).toHaveLength(2);
      // só nos baralhos do grupo da anotação: o lote com uma de outro grupo não guarda nada
      const other = await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { notas: ['n-outra', 'n-agua'], baralhos: ['Direito Civil'] });
      expect(other.status).toBe(422);
      const why = await t.body(other);
      expect(why.erro).toBe('baralho-de-outro-grupo');
      expect(why.mensagem).toMatch(/^Nota 2: Direito Civil \(Trabalho\) é de outro grupo/);
      expect(why.mensagem).toContain('Os baralhos de Estudos: Japonês, Kanji');
      // o baralho que não existe, no lote: com a posição da nota
      const missing = await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { notas: ['n-agua', 'n-outra'], baralhos: ['Latim'] });
      expect(missing.status).toBe(422);
      expect((await t.body(missing)).mensagem).toMatch(/^Nota 1: Não há o baralho "Latim"/);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { notas: ['n-agua'], baralhos: ['Kanji'], titulo: 'x' })).status).toBe(400);
      const unknownDeck = await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-solta', baralhos: ['Latim'] });
      expect(unknownDeck.status).toBe(422);
      expect((await t.body(unknownDeck)).mensagem).toContain('Japonês (Estudos), Kanji (Estudos), Direito Civil (Trabalho)');
      const unknownNote = await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { notas: ['n-solta', 'n-nada'], baralhos: ['Kanji'] });
      expect(unknownNote.status).toBe(404);
      expect((await t.body(unknownNote)).mensagem).toMatch(/^Nota 2:/);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-solta', baralhos: [] })).status).toBe(400);
    });

    it('a anotação que já é carta só entra em mais baralhos; esconder do mural espera a aprovação', async () => {
      const t = await setup();
      const { secret } = await t.ready(WRITE, { aprovacao: 'mudancas' });
      const res = await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-agua', baralhos: ['Kanji'], titulo: 'outro' });
      expect(res.status).toBe(422);
      expect((await t.body(res)).erro).toBe('ja-e-carta');
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { notas: ['n-solta', 'n-agua'], baralhos: ['Kanji'], no_mural: true })).status).toBe(422);
      // só os baralhos: entra direto, e a frente de agora fica
      const more = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-agua', baralhos: ['Kanji'] }));
      expect(more.pedido.estado).toBe('pendente');
      expect(more.carta).toMatchObject({ titulo: '水', baralhos: ['d-jp', 'd-kanji'] });
      // virar carta tirando do mural espera; no mural, não
      expect((await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-solta', baralhos: ['Kanji'], no_mural: false }))).pedido.estado).toBe('aguardando-aprovacao');
      expect((await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-outra', baralhos: ['Direito Civil'] }))).pedido.estado).toBe('pendente');
    });

    it('o baralho que vai nascer serve para estudar_agora (vazio); o nome do que vai ser apagado fica livre', async () => {
      const t = await setup();
      const { secret } = await t.ready(WRITE);
      await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Grego', grupo: 'Estudos' });
      const res = await t.ext(secret, '/ext/v1/estudos/hoje?baralho=Grego');
      expect(res.status).toBe(200);
      const got = await t.body(res);
      expect(got.cartas).toEqual([]);
      expect(got.aviso).toContain('ainda vai ser criado');
      await t.send(secret, 'DELETE', '/ext/v1/estudos/baralhos/Kanji');
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Kanji', grupo: 'Estudos' })).status).toBe(202);
    });

    it('o mesmo nome em outro grupo: nasce; pelo nome, vale o do grupo da anotação; sem como desempatar, pede o id', async () => {
      const t = await setup();
      const { secret } = await t.ready(WRITE);
      const twin = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Kanji', grupo: 'Trabalho' }));
      expect(twin.baralho).toMatchObject({ nome: 'Kanji', grupo: 'Trabalho' });
      // a anotação de Trabalho vai para o Kanji de Trabalho; a de Estudos, para o de Estudos
      const work = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-outra', baralhos: ['kanji'] }));
      expect(work.carta.baralhos).toEqual([twin.baralho.id]);
      const study = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-solta', baralhos: ['Kanji'] }));
      expect(study.carta.baralhos).toEqual(['d-kanji']);
      // mudar o baralho pelo nome repetido: qual dos dois?
      const which = await t.send(secret, 'PATCH', '/ext/v1/estudos/baralhos/Kanji', { cor: 'rosa' });
      expect(which.status).toBe(422);
      expect((await t.body(which)).erro).toBe('baralho-ambiguo');
      expect((await t.send(secret, 'PATCH', '/ext/v1/estudos/baralhos/d-kanji', { cor: 'rosa' })).status).toBe(202);
    });

    it('a chave limitada a um grupo não faz carta de nota de outro grupo', async () => {
      const t = await setup();
      const { secret } = await t.ready(WRITE, { grupos: ['Trabalho'] });
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-solta', baralhos: ['Kanji'] })).status).toBe(404);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas', { nota: 'n-outra', baralhos: ['Direito Civil'] })).status).toBe(202);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/cartas/n-agua/responder', { acertou: true })).status).toBe(404);
      // nem vê, nem mexe nos baralhos dos outros grupos; nem cria baralho fora dos dela
      expect((await t.send(secret, 'PATCH', '/ext/v1/estudos/baralhos/Kanji', { cor: 'rosa' })).status).toBe(404);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Latim', grupo: 'Estudos' })).status).toBe(403);
      expect((await t.send(secret, 'POST', '/ext/v1/estudos/baralhos', { nome: 'Latim', grupo: 'Trabalho' })).status).toBe(202);
    });

    it('mudar a carta (os baralhos trocam a lista inteira), tirar e recomeçar', async () => {
      const t = await setup();
      const { secret } = await t.ready(WRITE);
      const edit = await t.body(t.send(secret, 'PATCH', '/ext/v1/estudos/cartas/n-vento', { baralhos: ['Kanji'], no_mural: true, titulo: null }));
      expect(edit.carta).toMatchObject({ baralhos: ['d-kanji'], no_mural: true, fica_no_mural: true, titulo: 'Frente n-vento', titulo_da_frente: null });
      expect((await t.send(secret, 'PATCH', '/ext/v1/estudos/cartas/n-vento', {})).status).toBe(400);
      expect((await t.send(secret, 'PATCH', '/ext/v1/estudos/cartas/n-vento', { imagem: 'http://inseguro.com/a.png' })).status).toBe(400);
      const reset = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas/n-agua/recomecar'));
      expect(reset.carta).toMatchObject({ nivel: 'desconhecida', estado: 'nova', vistas: 0, ultimas: '' });
      const out = await t.body(t.send(secret, 'DELETE', '/ext/v1/estudos/cartas/n-terra'));
      expect(out.carta).toBeNull();
      // a tirada e a recomeçada saem da fila de agora
      expect((await t.body(t.ext(secret, '/ext/v1/estudos/hoje'))).cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-fogo', 'n-lei']);
    });

    it('criar_nota com estudos: pede estudos:escrever, e os baralhos vão pelo id', async () => {
      const t = await setup();
      const { me, secret } = await t.ready(['notas:criar', ...WRITE]);
      const res = await t.send(secret, 'POST', '/ext/v1/notas', { titulo: 'Rio', texto: '川 = rio', grupo: 'Estudos', estudos: { baralhos: ['kanji'], titulo: '川' } });
      expect(res.status).toBe(202);
      const got = await t.body(res);
      const pedido = await t.db.first<{ dados: string }>('SELECT dados FROM api_pedidos WHERE id = ?', [got.pedido.id]);
      expect(JSON.parse(pedido!.dados).estudos).toEqual({ baralhos: ['d-kanji'], titulo: '川' });
      // a carta que vai nascer com a nota aparece nos Estudos
      const card = await t.body(t.ext(secret, `/ext/v1/estudos/cartas/${got.nota.id}`));
      expect(card.carta).toMatchObject({ titulo: '川', verso: '川 = rio', baralhos: ['d-kanji'], no_mural: null });
      expect((await t.send(secret, 'POST', '/ext/v1/notas', { titulo: 'x', estudos: { baralhos: ['Latim'] } })).status).toBe(422);
      const noStudy = await t.newKey(me.token, ['notas:criar']);
      expect((await t.send(noStudy.segredo, 'POST', '/ext/v1/notas', { titulo: 'x', estudos: { baralhos: ['Kanji'] } })).status).toBe(403);
    });

    it('tirar a permissão da chave recusa o pedido aberto que a usava', async () => {
      const t = await setup();
      const { me, secret, keyId } = await t.ready(WRITE, { aprovacao: 'tudo' });
      const r = await t.body(t.send(secret, 'POST', '/ext/v1/estudos/cartas/n-fogo/responder', { acertou: true }));
      expect(r.pedido.estado).toBe('aguardando-aprovacao');
      expect((await t.json('PATCH', `/v1/eu/chaves/${keyId}`, { escopos: ['estudos:ler'] }, me.token)).status).toBe(200);
      expect((await t.db.first<{ estado: string }>('SELECT estado FROM api_pedidos WHERE id = ?', [r.pedido.id]))!.estado).toBe('recusado');
    });
  });

  describe(`${label}: os Estudos no MCP`, () => {
    it('as ferramentas aparecem pela permissão, e estudar pelo MCP vira pedido', async () => {
      const t = await setup();
      const { secret } = await t.ready(['estudos:ler', 'estudos:estudar']);
      const rpc = (method: string, params?: unknown) =>
        t.call('/mcp', { method: 'POST', headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' }, body: JSON.stringify({ jsonrpc: '2.0', id: 1, method, ...(params ? { params } : {}) }) });
      const names = ((await t.body(rpc('tools/list'))).result.tools as { name: string }[]).map((x) => x.name);
      expect(names).toEqual(FERRAMENTAS.filter((f) => alcanca(f, ['estudos:ler', 'estudos:estudar'])).map((f) => f.nome));
      expect(names).toEqual(expect.arrayContaining(['ver_contexto', 'ver_estudos', 'estudar_agora', 'listar_cartas', 'ler_carta', 'responder_carta']));
      expect(names).not.toContain('virar_carta');
      const now = (await t.body(rpc('tools/call', { name: 'estudar_agora', arguments: { limite: 2 } }))).result;
      expect(now.content[0].text).toContain('<conteudo_do_usuario>');
      expect(now.structuredContent.cartas.map((c: { nota: string }) => c.nota)).toEqual(['n-fogo', 'n-agua']);
      const ans = (await t.body(rpc('tools/call', { name: 'responder_carta', arguments: { nota: 'n-fogo', acertou: false } }))).result;
      expect(ans.content[0].text).toMatch(/^Pedido pd_\S+ feito, estado pendente/);
      expect(ans.structuredContent.pedido.op).toBe('carta.responder');
    });
  });
}
