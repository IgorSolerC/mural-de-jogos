import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ContextoFichasV1, DesejoV1, FichaV1, PraDepoisV1 } from '../../contrato/api-v1/murais';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, gzip, jsonCaller } from './harness';

/**
 * Os murais de resenhas na API das AIs (PLANO-API.md, rodada 9): o espelho da wishlist, do Pra depois e
 * das fichas que o site enche, a leitura com a chave e os pedidos de pôr, mudar e tirar desejos e pra
 * depois e de criar e mudar fichas. Roda nos dois bancos.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };
const AT = '2026-10-01T10:00:00.000Z';

export const desejo = (id: string, extra: Partial<DesejoV1> = {}): DesejoV1 => ({
  id,
  mural: 'jogos',
  nome: `Jogo ${id}`,
  ano: null,
  por: null,
  capa: null,
  relevancia: 'comum',
  criado_em: AT,
  versao: AT,
  ...extra,
});

export const SILKSONG = desejo('dj-silksong', { nome: 'Hollow Knight: Silksong', ano: '2025', capa: 'https://capas.teste/silksong.jpg', relevancia: 'must', criado_em: '2026-10-05T10:00:00.000Z', versao: '2026-10-05T10:00:00.000Z' });
export const HADES = desejo('dj-hades2', { nome: 'Hades II', ano: '2025', relevancia: 'later' });
export const DUNA = desejo('dl-duna', { mural: 'livros', nome: 'Duna', por: 'Frank Herbert', ano: '1965', criado_em: '2026-10-03T10:00:00.000Z', versao: '2026-10-03T10:00:00.000Z' });

export const PRA_CELESTE: PraDepoisV1 = { id: 'pd-celeste', mural: 'jogos', nome: 'Celeste', ano: '2018', por: null, capa: null, criado_em: AT, versao: AT };

export const ficha = (id: string, extra: Partial<FichaV1> = {}): FichaV1 => ({
  id,
  mural: 'jogos',
  nome: `Ficha ${id}`,
  por: null,
  ano: null,
  capa: null,
  forma: null,
  artista: null,
  nota_final: 8,
  notas: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 },
  nota_final_na_mao: false,
  status: 'finalizado',
  dificuldade: 'nenhuma',
  veredito: null,
  quantidade: null,
  texto: '',
  concluida_em: '2026-09-10',
  visibilidade: 'publica',
  releitura_de: null,
  criada_em: AT,
  versao: AT,
  ...extra,
});

export const OUTER_WILDS = ficha('rf-outer', {
  nome: 'Outer Wilds',
  ano: '2019',
  nota_final: 9.6,
  notas: { historia: 10, diversao: 10, jogabilidade: 9, visual: 9 },
  status: 'platinado',
  dificuldade: 'media',
  veredito: 'masterpiece',
  quantidade: 22.5,
  texto: 'O melhor jogo de exploração que já joguei.',
  concluida_em: '2026-08-20',
});
export const COSMOS = ficha('rf-cosmos', {
  mural: 'livros',
  nome: 'Cosmos',
  por: 'Carl Sagan',
  nota_final: 8.4,
  notas: { historia: 8, envolvimento: 9, personagens: null, escrita: 8 },
  dificuldade: 'facil',
  veredito: 'recomendo',
  quantidade: 396,
  concluida_em: '2026-07-01',
  visibilidade: 'privada',
});

const perfil = (mural: ContextoFichasV1['murais'][number]['mural'], nome: string, notas: [string, string, number][], extra: Partial<ContextoFichasV1['murais'][number]> = {}) => ({
  mural,
  nome,
  notas: notas.map(([id, n, peso]) => ({ id, nome: n, peso })),
  status: { incompleto: 'Incompleto', finalizado: 'Finalizado', platinado: 'Platinado' },
  dificuldade: null,
  quantidade: null,
  releitura: 'releitura',
  fichas: 0,
  ...extra,
});

export const CONTEXTO: ContextoFichasV1 = {
  murais: [
    perfil('jogos', 'jogos', [['historia', 'História', 1], ['diversao', 'Diversão', 2], ['jogabilidade', 'Jogabilidade', 1], ['visual', 'Visual', 1]], {
      dificuldade: 'Dificuldade',
      quantidade: { unidade: 'horas', fracao: true },
      releitura: 'rejogada',
      fichas: 1,
    }),
    perfil('livros', 'livros', [['historia', 'História', 1], ['envolvimento', 'Envolvimento', 2], ['personagens', 'Personagens', 1], ['escrita', 'Escrita', 1]], {
      status: { incompleto: 'Larguei', finalizado: 'Lido', platinado: 'Relido' },
      dificuldade: 'Dificuldade de leitura',
      quantidade: { unidade: 'páginas', fracao: false },
      fichas: 1,
    }),
    perfil('filmes', 'filmes', [['historia', 'História', 1], ['roteiro', 'Roteiro', 2], ['atuacao', 'Atuação', 1], ['visual', 'Visual', 1]]),
    perfil('series', 'séries', [['historia', 'História', 1], ['roteiro', 'Roteiro', 2], ['atuacao', 'Atuação', 1], ['visual', 'Visual', 1]]),
    perfil('animes', 'animes', [['historia', 'História', 1], ['roteiro', 'Roteiro', 2], ['personagens', 'Personagens', 1], ['animacao', 'Animação', 1]]),
    perfil('musicas', 'músicas', [['letra', 'Letra', 1], ['envolvimento', 'Envolvimento', 2], ['vocal', 'Vocal', 1], ['instrumental', 'Instrumental', 1]]),
  ],
};

export function muraisSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'murais', alg: 'RS256' };
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
        .setProtectedHeader({ alg: 'RS256', kid: 'murais' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const b = await body(json('POST', '/v1/auth/google', { credential }));
      return { token: b.token as string, codigo: b.conta.codigo as string, id: b.conta.id as string };
    };
    const push = async (token: string, base: number) => {
      const form = new FormData();
      form.append('privado', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      form.append('publico', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      const res = await call('/v1/eu/mural', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Mural-Rev-Base': String(base) }, body: form });
      advance(5_000);
      return ((await res.json()) as { rev: number }).rev;
    };
    const newKey = async (token: string, escopos = ['desejos:ler'], extra: Record<string, unknown> = {}) =>
      (await body(json('POST', '/v1/eu/chaves', { nome: 'AI dos murais', escopos, validade: 30, ...extra }, token))) as { segredo: string; chave: { id: string } };
    const mirror = (token: string, payload: unknown) => json('POST', '/v1/eu/espelho', payload, token);
    const item = (tipo: string, id: string, dados: unknown) => ({ tipo, id, hash: 'ab'.repeat(8), dados });
    /** O que a chave lê vai ao espelho (só os tipos das áreas dela entram). */
    const itens = (escopos: string[]) => [
      ...(escopos.some((s) => s.startsWith('desejos:')) ? [SILKSONG, HADES, DUNA].map((d) => item('desejo', d.id, d)) : []),
      ...(escopos.some((s) => s.startsWith('pra-depois:')) ? [item('pra-depois', PRA_CELESTE.id, PRA_CELESTE)] : []),
      ...(escopos.some((s) => s.startsWith('fichas:')) ? [...[OUTER_WILDS, COSMOS].map((f) => item('ficha', f.id, f)), item('contexto-fichas', 'fichas', CONTEXTO)] : []),
    ];
    const ext = (secret: string, path: string, init: RequestInit = {}) =>
      call(path, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } });
    /** Uma conta com mural, uma chave com as permissões dadas e o espelho cheio. */
    const ready = async (escopos = ['desejos:ler'], keyExtra: Record<string, unknown> = {}) => {
      const me = await login('ana');
      const k = await newKey(me.token, escopos, keyExtra);
      const rev = await push(me.token, 0);
      const res = await mirror(me.token, { rev, fuso: 'America/Sao_Paulo', poe: itens(escopos) });
      expect(res.status).toBe(200);
      return { me, secret: k.segredo, keyId: k.chave.id, rev };
    };
    return { db, deps, call, json, body, login, push, newKey, mirror, item, itens, ext, ready, advance };
  }

  describe(`${label}: o espelho dos murais`, () => {
    it('cada área vem com qualquer permissão dela; o mural vai na coluna do grupo', async () => {
      const t = await setup();
      const cases: [string, string[]][] = [
        ['desejos:ler', ['desejos']],
        ['desejos:escrever', ['desejos']],
        ['pra-depois:ler', ['pra-depois']],
        ['pra-depois:escrever', ['pra-depois']],
        ['fichas:ler', ['fichas']],
        ['fichas:escrever', ['fichas']],
      ];
      for (const [scope, areas] of cases) {
        await t.db.batch(TABLES.map((x) => ({ sql: `DELETE FROM ${x}` })));
        const me = await t.login('ana');
        await t.newKey(me.token, [scope]);
        const got = await t.body(t.call('/v1/eu/espelho', { headers: { Authorization: `Bearer ${me.token}` } }));
        expect(got.areas, scope).toEqual(areas);
      }
      const all = ['desejos:ler', 'pra-depois:ler', 'fichas:ler'];
      const { me } = await t.ready(all);
      const got = await t.body(t.call('/v1/eu/espelho', { headers: { Authorization: `Bearer ${me.token}` } }));
      expect(Object.keys(got.hashes.desejo).sort()).toEqual([DUNA.id, HADES.id, SILKSONG.id].sort());
      expect(Object.keys(got.hashes['pra-depois'])).toEqual([PRA_CELESTE.id]);
      expect(Object.keys(got.hashes.ficha).sort()).toEqual([COSMOS.id, OUTER_WILDS.id].sort());
      const row = await t.db.first<{ grupo: string; data: string; busca: string }>("SELECT grupo, data, busca FROM api_espelho WHERE tipo = 'desejo' AND id = ?", [DUNA.id]);
      expect(row).toEqual({ grupo: 'livros', data: '2026-10-03', busca: 'duna\nfrank herbert' });
      const f = await t.db.first<{ grupo: string; data: string }>("SELECT grupo, data FROM api_espelho WHERE tipo = 'ficha' AND id = ?", [OUTER_WILDS.id]);
      expect(f).toEqual({ grupo: 'jogos', data: '2026-08-20' });
    });

    it('só a forma da v1 entra: um campo a mais some, e o que não serve é recusado', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['desejos:ler', 'pra-depois:ler', 'fichas:ler']);
      const rev = await t.push(me.token, 0);
      const extras = [
        t.item('desejo', SILKSONG.id, { ...SILKSONG, papel: 'canson' }),
        t.item('ficha', OUTER_WILDS.id, { ...OUTER_WILDS, pesos: { diversao: 'relevante' } }),
        t.item('pra-depois', PRA_CELESTE.id, { ...PRA_CELESTE, relevancia: 'must' }),
      ];
      expect((await t.mirror(me.token, { rev, poe: extras })).status).toBe(200);
      const saved = async (id: string) => JSON.parse((await t.db.first<{ dados: string }>('SELECT dados FROM api_espelho WHERE id = ?', [id]))!.dados);
      expect(await saved(SILKSONG.id)).toEqual(SILKSONG);
      expect(await saved(OUTER_WILDS.id)).toEqual(OUTER_WILDS);
      expect(await saved(PRA_CELESTE.id)).toEqual(PRA_CELESTE);
      const bad = async (tipo: string, id: string, dados: unknown) => {
        const res = await t.mirror(me.token, { rev, poe: [t.item(tipo, id, dados)] });
        expect(res.status, JSON.stringify(dados).slice(0, 100)).toBe(400);
      };
      // o mural das anotações, a relevância que não existe, a capa sem https, a nota 11, a nota que não existe, o status que não existe
      await bad('desejo', SILKSONG.id, { ...SILKSONG, mural: 'anotacoes' });
      await bad('desejo', SILKSONG.id, { ...SILKSONG, relevancia: 'urgente' });
      await bad('desejo', SILKSONG.id, { ...SILKSONG, capa: 'http://capa' });
      await bad('ficha', OUTER_WILDS.id, { ...OUTER_WILDS, notas: { ...OUTER_WILDS.notas, visual: 11 } });
      await bad('ficha', OUTER_WILDS.id, { ...OUTER_WILDS, notas: { graficos: 9 } });
      await bad('ficha', OUTER_WILDS.id, { ...OUTER_WILDS, status: 'zerado' });
      await bad('contexto-fichas', 'outro', CONTEXTO);
    });

    it('a chave de uma área não deixa as outras entrarem', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['desejos:ler']);
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: [t.item('ficha', OUTER_WILDS.id, OUTER_WILDS)] })).status).toBe(400);
      expect((await t.mirror(me.token, { rev, poe: [t.item('pra-depois', PRA_CELESTE.id, PRA_CELESTE)] })).status).toBe(400);
    });

    it('a limpeza tira cada área de quem não tem mais chave dela', async () => {
      const t = await setup();
      const { me } = await t.ready(['desejos:escrever', 'fichas:ler']);
      const keys = (await t.body(t.json('GET', '/v1/eu/chaves', undefined, me.token))).chaves as { id: string }[];
      const count = async (tipo: string) => (await t.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM api_espelho WHERE usuario_id = ? AND tipo = ?', [me.id, tipo]))!.n;
      expect(await count('desejo')).toBe(3);
      expect(await count('ficha')).toBe(2);
      for (const k of keys) await t.json('DELETE', `/v1/eu/chaves/${k.id}`, undefined, me.token);
      await t.newKey(me.token, ['fichas:escrever']);
      await cleanup(t.deps);
      expect(await count('desejo')).toBe(0);
      expect(await count('ficha')).toBe(2);
      expect(await count('contexto-fichas')).toBe(1);
    });
  });

  describe(`${label}: ler os murais com a chave`, () => {
    const READ = ['desejos:ler', 'pra-depois:ler', 'fichas:ler'];

    it('cada lista pede a permissão de ler dela (a de escrever não lê)', async () => {
      const t = await setup();
      const { me } = await t.ready(READ);
      const paths: [string, string][] = [
        ['/ext/v1/desejos', 'desejos:escrever'],
        [`/ext/v1/desejos/${SILKSONG.id}`, 'desejos:escrever'],
        ['/ext/v1/pra-depois', 'pra-depois:escrever'],
        ['/ext/v1/fichas', 'fichas:escrever'],
        [`/ext/v1/fichas/${OUTER_WILDS.id}`, 'notas:ler'],
      ];
      for (const [path, scope] of paths) {
        const other = await t.newKey(me.token, [scope]);
        const res = await t.ext(other.segredo, path);
        expect(res.status, `${scope} ${path}`).toBe(403);
      }
    });

    it('a wishlist como a tela: MUST na frente, LATER no fim; por mural, relevância e busca', async () => {
      const t = await setup();
      const { secret } = await t.ready(READ);
      expect((await t.body(t.ext(secret, '/ext/v1/desejos'))).itens).toEqual([SILKSONG, DUNA, HADES]);
      expect((await t.body(t.ext(secret, '/ext/v1/desejos?mural=livros'))).itens).toEqual([DUNA]);
      expect((await t.body(t.ext(secret, '/ext/v1/desejos?relevancia=later'))).itens).toEqual([HADES]);
      expect((await t.body(t.ext(secret, '/ext/v1/desejos?q=herbert'))).itens).toEqual([DUNA]);
      const page = await t.body(t.ext(secret, '/ext/v1/desejos?limite=2'));
      expect(page.itens).toEqual([SILKSONG, DUNA]);
      expect((await t.body(t.ext(secret, `/ext/v1/desejos?limite=2&depois=${page.depois}`))).itens).toEqual([HADES]);
      expect((await t.body(t.ext(secret, `/ext/v1/desejos/${DUNA.id}`))).desejo).toEqual(DUNA);
      expect((await t.ext(secret, '/ext/v1/desejos?mural=anotacoes')).status).toBe(400);
      expect((await t.ext(secret, '/ext/v1/desejos?relevancia=urgente')).status).toBe(400);
      expect((await t.ext(secret, '/ext/v1/desejos/dj-nenhum')).status).toBe(404);
    });

    it('o Pra depois, e um item pelo id', async () => {
      const t = await setup();
      const { secret } = await t.ready(READ);
      expect((await t.body(t.ext(secret, '/ext/v1/pra-depois?mural=jogos'))).itens).toEqual([PRA_CELESTE]);
      expect((await t.body(t.ext(secret, '/ext/v1/pra-depois?mural=filmes'))).itens).toEqual([]);
      expect((await t.body(t.ext(secret, `/ext/v1/pra-depois/${PRA_CELESTE.id}`))).pra_depois).toEqual(PRA_CELESTE);
    });

    it('as fichas: resumo no lugar do texto, filtros, ordens e a ficha inteira pelo id', async () => {
      const t = await setup();
      const { secret } = await t.ready(READ);
      const list = await t.body(t.ext(secret, '/ext/v1/fichas'));
      const { texto, ...outer } = OUTER_WILDS;
      expect(list.itens[0]).toEqual({ ...outer, resumo: texto });
      expect(list.itens.map((f: FichaV1) => f.id)).toEqual([OUTER_WILDS.id, COSMOS.id]);
      expect((await t.body(t.ext(secret, '/ext/v1/fichas?com_texto=sim'))).itens[0].texto).toBe(texto);
      expect((await t.body(t.ext(secret, '/ext/v1/fichas?mural=livros'))).itens.map((f: FichaV1) => f.id)).toEqual([COSMOS.id]);
      expect((await t.body(t.ext(secret, '/ext/v1/fichas?veredito=masterpiece'))).itens.map((f: FichaV1) => f.id)).toEqual([OUTER_WILDS.id]);
      expect((await t.body(t.ext(secret, '/ext/v1/fichas?status=finalizado'))).itens.map((f: FichaV1) => f.id)).toEqual([COSMOS.id]);
      expect((await t.body(t.ext(secret, '/ext/v1/fichas?nota_min=9'))).itens.map((f: FichaV1) => f.id)).toEqual([OUTER_WILDS.id]);
      expect((await t.body(t.ext(secret, '/ext/v1/fichas?q=exploracao'))).itens.map((f: FichaV1) => f.id)).toEqual([OUTER_WILDS.id]);
      expect((await t.body(t.ext(secret, '/ext/v1/fichas?ordem=nome'))).itens.map((f: FichaV1) => f.id)).toEqual([COSMOS.id, OUTER_WILDS.id]);
      expect((await t.ext(secret, '/ext/v1/fichas?ordem=constructor')).status).toBe(400);
      expect((await t.ext(secret, '/ext/v1/fichas?status=zerado')).status).toBe(400);
      expect((await t.body(t.ext(secret, `/ext/v1/fichas/${COSMOS.id}`))).ficha).toEqual(COSMOS);
      expect((await t.ext(secret, '/ext/v1/fichas/rf-nenhuma')).status).toBe(404);
    });

    it('o contexto traz cada parte só para quem a alcança', async () => {
      const t = await setup();
      const { me, secret } = await t.ready(READ);
      const ctx = await t.body(t.ext(secret, '/ext/v1/contexto'));
      expect(ctx.desejos).toEqual({ por_mural: { jogos: 2, livros: 1, filmes: 0, series: 0, animes: 0, musicas: 0 }, relevancias: ['must', 'comum', 'later'] });
      expect(ctx.pra_depois).toEqual({ por_mural: { jogos: 1, livros: 0, filmes: 0, series: 0, animes: 0, musicas: 0 } });
      expect(ctx.fichas).toEqual(CONTEXTO);
      const writer = await t.newKey(me.token, ['fichas:escrever']);
      const only = await t.body(t.ext(writer.segredo, '/ext/v1/contexto'));
      expect(only.fichas).toEqual(CONTEXTO);
      expect(only.desejos).toBeNull();
      expect(only.pra_depois).toBeNull();
    });

    it('a busca acha nos murais que a chave lê', async () => {
      const t = await setup();
      const { me, secret } = await t.ready(READ);
      const got = await t.body(t.ext(secret, '/ext/v1/busca?q=hollow'));
      expect(got.itens).toEqual([{ tipo: 'desejo', id: SILKSONG.id, nome: SILKSONG.nome, mural: 'jogos' }]);
      const f = await t.body(t.ext(secret, '/ext/v1/busca?q=sagan&areas=fichas'));
      expect(f.itens).toEqual([{ tipo: 'ficha', id: COSMOS.id, nome: 'Cosmos', mural: 'livros', nota_final: 8.4, concluida_em: '2026-07-01' }]);
      const wishes = await t.newKey(me.token, ['desejos:ler']);
      expect((await t.ext(wishes.segredo, '/ext/v1/busca?q=cosmos&areas=fichas')).status).toBe(403);
    });
  });

  describe(`${label}: escrever na Wishlist e no Pra depois`, () => {
    const ALL = ['desejos:ler', 'desejos:escrever', 'pra-depois:ler', 'pra-depois:escrever'];
    const send = (t: Awaited<ReturnType<typeof setup>>, secret: string, method: string, path: string, payload?: unknown) =>
      t.ext(secret, path, { method, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });

    it('pôr pede desejos:escrever; o desejo aparece no começo da lista e pelo id', async () => {
      const t = await setup();
      const { me, secret } = await t.ready(ALL, { aprovacao: 'nunca' });
      const reader = await t.newKey(me.token, ['desejos:ler']);
      expect((await send(t, reader.segredo, 'POST', '/ext/v1/desejos', { mural: 'jogos', nome: 'Celeste' })).status).toBe(403);
      const res = await send(t, secret, 'POST', '/ext/v1/desejos', { mural: 'filmes', nome: 'Duna: Parte Dois', ano: '2024', relevancia: 'must' });
      expect(res.status).toBe(202);
      const got = await t.body(res);
      expect(got.pedido).toEqual(expect.objectContaining({ op: 'desejo.por', estado: 'pendente' }));
      expect(got.desejo).toEqual(expect.objectContaining({ id: got.pedido.alvo, mural: 'filmes', nome: 'Duna: Parte Dois', ano: '2024', capa: null, relevancia: 'must' }));
      const list = await t.body(t.ext(secret, '/ext/v1/desejos'));
      expect(list.itens[0]).toEqual({ ...got.desejo, pedidos: [{ id: got.pedido.id, op: 'desejo.por', estado: 'pendente' }] });
      expect((await t.body(t.ext(secret, '/ext/v1/desejos?mural=jogos'))).itens.map((d: DesejoV1) => d.id)).toEqual([SILKSONG.id, HADES.id]);
      expect((await t.body(t.ext(secret, `/ext/v1/desejos/${got.pedido.alvo}`))).desejo.nome).toBe('Duna: Parte Dois');
    });

    it('o mesmo nome no mesmo mural é 409 com o que já está (no espelho ou num pedido aberto); noutro mural, entra', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const dup = await send(t, secret, 'POST', '/ext/v1/desejos', { mural: 'jogos', nome: 'hollow knight: SILKSONG' });
      expect(dup.status).toBe(409);
      const err = await t.body(dup);
      expect(err.erro).toBe('desejo-existe');
      expect(err.desejo).toEqual(SILKSONG);
      expect((await send(t, secret, 'POST', '/ext/v1/desejos', { mural: 'livros', nome: 'Hollow Knight: Silksong' })).status).toBe(202);
      expect((await send(t, secret, 'POST', '/ext/v1/desejos', { mural: 'livros', nome: 'Hollow Knight: Silksong' })).status).toBe(409);
      expect((await t.body(send(t, secret, 'POST', '/ext/v1/pra-depois', { mural: 'jogos', nome: 'Celeste' }))).erro).toBe('pra-depois-existe');
    });

    it('um lote: um pedido por item, conferidos todos antes; um repetido e nada entra', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const bad = await send(t, secret, 'POST', '/ext/v1/desejos', { itens: [{ mural: 'jogos', nome: 'Tunic' }, { mural: 'jogos', nome: 'tunic' }] });
      expect(bad.status).toBe(409);
      expect((await t.body(bad)).mensagem).toContain('Item 2');
      const wrong = await send(t, secret, 'POST', '/ext/v1/desejos', { itens: [{ mural: 'jogos', nome: 'Tunic' }, { mural: 'jogos' }] });
      expect(wrong.status).toBe(400);
      expect((await t.body(t.ext(secret, '/ext/v1/pedidos'))).itens).toEqual([]);
      const ok = await t.body(send(t, secret, 'POST', '/ext/v1/desejos', { itens: [{ mural: 'jogos', nome: 'Tunic' }, { mural: 'animes', nome: 'Frieren', relevancia: 'must' }] }));
      expect(ok.pedidos).toHaveLength(2);
      expect(ok.desejos.map((d: DesejoV1) => d.nome)).toEqual(['Tunic', 'Frieren']);
    });

    it('mudar o desejo com a versão de agora (409 com o de agora); a leitura já mostra', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' });
      const old = await send(t, secret, 'PATCH', `/ext/v1/desejos/${HADES.id}`, { versao: '2026-01-01T00:00:00.000Z', relevancia: 'must' });
      expect(old.status).toBe(409);
      expect((await t.body(old)).desejo).toEqual(HADES);
      const got = await t.body(send(t, secret, 'PATCH', `/ext/v1/desejos/${HADES.id}`, { versao: HADES.versao, relevancia: 'must' }));
      expect(got.desejo).toEqual({ ...HADES, relevancia: 'must', versao: got.pedido.criado_em });
      expect((await t.body(t.ext(secret, `/ext/v1/desejos/${HADES.id}`))).desejo).toEqual({ ...got.desejo, pedidos: [{ id: got.pedido.id, op: 'desejo.editar', estado: 'pendente' }] });
      expect((await send(t, secret, 'PATCH', '/ext/v1/desejos/dj-nenhum', { versao: AT, relevancia: 'must' })).status).toBe(404);
    });

    it('tirar da wishlist e do Pra depois, com a versão na consulta; o que vai sair fica com o pedido', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' });
      expect((await send(t, secret, 'DELETE', `/ext/v1/desejos/${DUNA.id}`)).status).toBe(400);
      const gone = await t.body(send(t, secret, 'DELETE', `/ext/v1/desejos/${DUNA.id}?versao=${DUNA.versao}`));
      expect(gone.pedido.op).toBe('desejo.tirar');
      expect(gone.desejo).toBeNull();
      expect((await t.body(t.ext(secret, `/ext/v1/desejos/${DUNA.id}`))).desejo.pedidos).toEqual([{ id: gone.pedido.id, op: 'desejo.tirar', estado: 'pendente' }]);
      const later = await t.body(send(t, secret, 'DELETE', `/ext/v1/pra-depois/${PRA_CELESTE.id}?versao=${PRA_CELESTE.versao}`));
      expect(later.pedido.op).toBe('pra-depois.tirar');
    });

    it('com a aprovação "mudancas", pôr entra direto e mudar ou tirar espera', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      expect((await t.body(send(t, secret, 'POST', '/ext/v1/pra-depois', { mural: 'filmes', nome: 'Aftersun' }))).pedido.estado).toBe('pendente');
      expect((await t.body(send(t, secret, 'PATCH', `/ext/v1/desejos/${HADES.id}`, { versao: HADES.versao, relevancia: 'must' }))).pedido.estado).toBe('aguardando-aprovacao');
      expect((await t.body(send(t, secret, 'DELETE', `/ext/v1/desejos/${DUNA.id}?versao=${DUNA.versao}`))).pedido.estado).toBe('aguardando-aprovacao');
    });
  });

  describe(`${label}: criar e mudar fichas`, () => {
    const ALL = ['fichas:ler', 'fichas:escrever'];
    const send = (t: Awaited<ReturnType<typeof setup>>, secret: string, method: string, path: string, payload?: unknown) =>
      t.ext(secret, path, { method, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });

    it('criar pede fichas:escrever; a ficha nasce privada, sem a nota final, e aparece na lista e pelo id', async () => {
      const t = await setup();
      const { me, secret } = await t.ready(ALL, { aprovacao: 'nunca' });
      const reader = await t.newKey(me.token, ['fichas:ler']);
      expect((await send(t, reader.segredo, 'POST', '/ext/v1/fichas', { mural: 'jogos', nome: 'Tunic', notas: { diversao: 9 } })).status).toBe(403);
      const res = await send(t, secret, 'POST', '/ext/v1/fichas', { mural: 'jogos', nome: 'Tunic', notas: { historia: 7, diversao: 9 }, status: 'platinado', quantidade: 30, texto: 'A raposa.' });
      expect(res.status).toBe(202);
      const got = await t.body(res);
      expect(got.pedido).toEqual(expect.objectContaining({ op: 'ficha.criar', estado: 'pendente' }));
      expect(got.ficha).toEqual(
        expect.objectContaining({ id: got.pedido.alvo, nota_final: null, notas: { historia: 7, diversao: 9, jogabilidade: null, visual: null }, visibilidade: 'privada', status: 'platinado', quantidade: 30 }),
      );
      const list = await t.body(t.ext(secret, '/ext/v1/fichas'));
      expect(list.itens[0]).toEqual(expect.objectContaining({ id: got.pedido.alvo, resumo: 'A raposa.', pedidos: [{ id: got.pedido.id, op: 'ficha.criar', estado: 'pendente' }] }));
      expect((await t.body(t.ext(secret, '/ext/v1/fichas?mural=livros'))).itens.map((f: FichaV1) => f.id)).toEqual([COSMOS.id]);
      expect((await t.body(t.ext(secret, `/ext/v1/fichas/${got.pedido.alvo}`))).ficha.nome).toBe('Tunic');
    });

    it('as notas e os campos de outro mural são 422 (pelo contexto); quem vê pede publicar', async () => {
      const t = await setup();
      const { me, secret } = await t.ready(ALL);
      const wrong = await send(t, secret, 'POST', '/ext/v1/fichas', { mural: 'jogos', nome: 'Tunic', notas: { escrita: 9 } });
      expect(wrong.status).toBe(422);
      const err = await t.body(wrong);
      expect(err.erro).toBe('ficha-invalida');
      expect(err.mensagem).toContain('historia, diversao, jogabilidade, visual');
      expect((await send(t, secret, 'PATCH', `/ext/v1/fichas/${COSMOS.id}`, { versao: COSMOS.versao, quantidade: 396.5 })).status).toBe(422);
      expect((await send(t, secret, 'POST', '/ext/v1/fichas', { mural: 'jogos', nome: 'Tunic', notas: { diversao: 9 }, visibilidade: 'publica' })).status).toBe(403);
      const pub = await t.newKey(me.token, [...ALL, 'publicar']);
      expect((await send(t, pub.segredo, 'POST', '/ext/v1/fichas', { mural: 'jogos', nome: 'Tunic', notas: { diversao: 9 }, visibilidade: 'publica' })).status).toBe(202);
    });

    it('mudar com a versão de agora (409 com a de agora); mudar uma nota deixa a final para o Murall', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' });
      const old = await send(t, secret, 'PATCH', `/ext/v1/fichas/${OUTER_WILDS.id}`, { versao: '2026-01-01T00:00:00.000Z', veredito: 'recomendo' });
      expect(old.status).toBe(409);
      expect((await t.body(old)).ficha).toEqual(OUTER_WILDS);
      const text = await t.body(send(t, secret, 'PATCH', `/ext/v1/fichas/${OUTER_WILDS.id}`, { versao: OUTER_WILDS.versao, texto: 'Revi e continua o melhor.' }));
      expect(text.ficha).toEqual({ ...OUTER_WILDS, texto: 'Revi e continua o melhor.', versao: text.pedido.criado_em });
      const notes = await t.body(send(t, secret, 'PATCH', `/ext/v1/fichas/${OUTER_WILDS.id}`, { versao: text.ficha.versao, notas: { visual: 10 } }));
      expect(notes.ficha.nota_final).toBeNull();
      const now = (await t.body(t.ext(secret, `/ext/v1/fichas/${OUTER_WILDS.id}`))).ficha;
      expect(now.pedidos.map((p: { op: string }) => p.op)).toEqual(['ficha.editar', 'ficha.editar']);
      expect(now.notas.visual).toBe(10);
      expect((await send(t, secret, 'PATCH', '/ext/v1/fichas/rf-nenhuma', { versao: AT, texto: 'x' })).status).toBe(404);
    });

    it('com a aprovação "mudancas", criar entra direto e mudar espera', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      expect((await t.body(send(t, secret, 'POST', '/ext/v1/fichas', { mural: 'livros', nome: 'Torto Arado', notas: { envolvimento: 10 } }))).pedido.estado).toBe('pendente');
      expect((await t.body(send(t, secret, 'PATCH', `/ext/v1/fichas/${COSMOS.id}`, { versao: COSMOS.versao, veredito: 'masterpiece' }))).pedido.estado).toBe('aguardando-aprovacao');
    });
  });
}
