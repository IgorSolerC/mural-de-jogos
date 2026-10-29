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
}
