import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import type { ContextoNotasV1, NotaV1 } from '../../contrato/api-v1/notas';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { MIRROR_ROWS_PER_DAY } from '../src/domain/mirror';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, gzip, jsonCaller } from './harness';

/**
 * O espelho e a leitura das Anotações (PLANO-API.md, rodada 2): o site enche o espelho pela sessão,
 * só na rev do mural de agora e só com chave que lê; a AI lê com a chave, com os filtros, a página, a
 * busca e o contexto, sem nunca passar dos grupos da chave. Roda nos dois bancos, como `suite.ts`.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };
const DAY = 86_400_000;

/** Uma nota v1 com o que importa no teste; o resto, o de sempre. */
function nota(id: string, extra: Partial<NotaV1> = {}): NotaV1 {
  return {
    id,
    titulo: `Nota ${id}`,
    texto: 'Um texto qualquer.',
    grupo: null,
    assunto: null,
    tags: [],
    data: null,
    finalizada_em: null,
    fixada: false,
    visibilidade: 'privada',
    capa: null,
    tarefas: { feitas: 0, total: 0 },
    kanban: null,
    criada_em: '2026-10-01T10:00:00.000Z',
    versao: '2026-10-01T10:00:00.000Z',
    ...extra,
  };
}

const CONTEXTO: ContextoNotasV1 = {
  grupos: [
    { nome: 'Trabalho', notas: 2, assuntos: ['Reuniões'], tags: [{ nome: 'urgente', notas: 1 }] },
    { nome: 'Estudos', notas: 1, assuntos: ['Cálculo'], tags: [{ nome: 'prova', notas: 1 }] },
  ],
  sem_grupo: { notas: 1, tags: [{ nome: 'casa', notas: 1 }] },
  tags_fixas: ['urgente'],
};

const NOTAS = [
  nota('trab-1', { grupo: 'Trabalho', assunto: 'Reuniões', tags: ['urgente'], titulo: 'Pauta da reunião', texto: 'Levar a ata.\n- [ ] mandar e-mail', versao: '2026-10-05T10:00:00.000Z', fixada: true }),
  nota('trab-2', { grupo: 'Trabalho', titulo: 'Arquivo morto', finalizada_em: '2026-10-02T10:00:00.000Z', versao: '2026-10-02T10:00:00.000Z' }),
  nota('estu-1', { grupo: 'Estudos', assunto: 'Cálculo', tags: ['prova'], titulo: 'Integrais', texto: 'Revisar a prova de Cálculo na sexta.', data: '2026-11-06', versao: '2026-10-04T10:00:00.000Z' }),
  nota('solta', { tags: ['casa'], titulo: 'Lista do mercado', texto: 'Arroz, feijão.', versao: '2026-10-03T10:00:00.000Z' }),
];

export function espelhoSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'espelho', alg: 'RS256' };
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
        .setProtectedHeader({ alg: 'RS256', kid: 'espelho' })
        .setSubject(sub)
        .setAudience(ENV.GOOGLE_CLIENT_ID)
        .setIssuer('https://accounts.google.com')
        .setIssuedAt(new Date())
        .setExpirationTime('1h')
        .sign(key);
      const b = await body(json('POST', '/v1/auth/google', { credential }));
      return { token: b.token as string, codigo: b.conta.codigo as string, id: b.conta.id as string };
    };
    /** Grava o mural (o site, numa sincronização) e devolve a rev. */
    const push = async (token: string, base: number) => {
      const form = new FormData();
      form.append('privado', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      form.append('publico', new Blob([await gzip('{"reviews":[]}')], { type: 'application/gzip' }));
      const res = await call('/v1/eu/mural', { method: 'PUT', headers: { Authorization: `Bearer ${token}`, 'Mural-Rev-Base': String(base) }, body: form });
      advance(5_000);
      return ((await res.json()) as { rev: number }).rev;
    };
    const newKey = async (token: string, extra: Record<string, unknown> = {}) =>
      (await body(json('POST', '/v1/eu/chaves', { nome: 'AI', escopos: ['notas:ler'], validade: 30, ...extra }, token))).segredo as string;
    const mirror = (token: string, payload: unknown) => json('POST', '/v1/eu/espelho', payload, token);
    const item = (dados: NotaV1 | ContextoNotasV1, tipo = 'nota') => ({ tipo, id: tipo === 'nota' ? (dados as NotaV1).id : 'notas', hash: 'ab'.repeat(8), dados });
    const ext = (secret: string, path: string) => call(path, { headers: { Authorization: `Bearer ${secret}` } });
    /** Uma conta com mural, chave que lê e o espelho cheio. */
    const ready = async (keyExtra: Record<string, unknown> = {}) => {
      const me = await login('ana');
      const secret = await newKey(me.token, keyExtra);
      const rev = await push(me.token, 0);
      const res = await mirror(me.token, { rev, fuso: 'America/Sao_Paulo', poe: [...NOTAS.map((n) => item(n)), item(CONTEXTO, 'contexto')] });
      expect(res.status).toBe(200);
      return { me, secret, rev };
    };
    const ids = async (secret: string, query = '') => ((await body(ext(secret, `/ext/v1/notas${query}`))).itens as { id: string }[]).map((n) => n.id);
    return { db, deps, call, json, body, login, push, newKey, mirror, item, ext, ready, ids, advance };
  }

  describe(`${label}: o espelho (o site enche)`, () => {
    it('sem chave que lê, não há áreas e o site não espelha nada', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, { escopos: ['desejos:ler'] });
      expect(await t.body(t.json('GET', '/v1/eu/espelho', undefined, me.token))).toEqual({ areas: [], rev: null, hashes: {} });
      const res = await t.mirror(me.token, { rev: 1, poe: [t.item(NOTAS[0]!)] });
      expect(res.status).toBe(409);
      expect((await t.body(res)).erro).toBe('espelho-sem-chave');
    });

    it('só na rev do mural de agora; depois, as impressões dizem o que já está lá', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token);
      expect(await t.body(t.json('GET', '/v1/eu/espelho', undefined, me.token))).toEqual({ areas: ['notas'], rev: null, hashes: { nota: {}, contexto: {} } });
      // sem mural na nuvem, nenhuma rev serve
      expect((await t.body(t.mirror(me.token, { rev: 1, poe: [t.item(NOTAS[0]!)] }))).erro).toBe('espelho-atrasado');
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: [t.item(NOTAS[0]!), t.item(CONTEXTO, 'contexto')] })).status).toBe(200);
      const next = await t.push(me.token, rev);
      expect((await t.body(t.mirror(me.token, { rev, poe: [t.item(NOTAS[1]!)] }))).erro, 'um aparelho atrasado').toBe('espelho-atrasado');
      expect((await t.mirror(me.token, { rev: next, tira: [{ tipo: 'nota', id: 'trab-1' }], poe: [t.item(NOTAS[1]!)] })).status).toBe(200);
      const got = await t.body(t.json('GET', '/v1/eu/espelho', undefined, me.token));
      expect(got.rev).toBe(next);
      expect(Object.keys(got.hashes.nota)).toEqual(['trab-2']);
      expect(got.hashes.contexto).toEqual({ notas: 'ab'.repeat(8) });
    });

    it.each([
      [{ poe: [{ tipo: 'nota', id: 'x1', hash: 'ab'.repeat(8), dados: { ...nota('x1'), titulo: 'x'.repeat(201) } }] }, 'forma'],
      [{ poe: [{ tipo: 'nota', id: 'x1', hash: 'ab'.repeat(8), dados: nota('x2') }] }, 'id'],
      [{ poe: [{ tipo: 'gasto', id: 'x1', hash: 'ab'.repeat(8), dados: {} }] }, 'tipo'],
      [{ poe: [{ tipo: 'nota', id: 'x 1', hash: 'ab'.repeat(8), dados: nota('x 1') }] }, 'tipo'],
      [{ poe: [{ tipo: 'nota', id: 'x1', hash: 'nao', dados: nota('x1') }] }, 'impressão'],
      [{ poe: Array.from({ length: 51 }, (_, i) => ({ tipo: 'nota', id: `n${i}`, hash: 'ab'.repeat(8), dados: nota(`n${i}`) })) }, '50'],
      [{ poe: [{ tipo: 'contexto', id: 'notas', hash: 'ab'.repeat(8), dados: { grupos: 'nao' } }] }, 'contexto'],
    ])('recusa o que não tem a forma da v1: %#', async (payload, word) => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token);
      const rev = await t.push(me.token, 0);
      const res = await t.mirror(me.token, { rev, ...payload });
      expect(res.status).toBe(400);
      const b = await t.body(res);
      expect(b.erro).toBe('espelho-invalido');
      expect(b.mensagem.toLowerCase()).toContain(word);
    });

    it('um campo a mais não entra no espelho', async () => {
      const t = await setup();
      const { secret, me } = await t.ready();
      const rev = await t.push(me.token, 1);
      await t.mirror(me.token, { rev, poe: [t.item({ ...nota('extra'), segredo: 'não devia ir' } as NotaV1)] });
      const got = await t.body(t.ext(secret, '/ext/v1/notas/extra'));
      expect(got.nota).toEqual(nota('extra'));
    });

    it(`no máximo ${MIRROR_ROWS_PER_DAY} linhas por conta e por dia`, async () => {
      const t = await setup();
      const { me, rev } = await t.ready();
      await t.db.batch([{ sql: 'UPDATE api_espelho_estado SET linhas_dia = ? WHERE usuario_id = ?', params: [MIRROR_ROWS_PER_DAY - 1, me.id] }]);
      const res = await t.mirror(me.token, { rev, poe: [t.item(NOTAS[0]!), t.item(NOTAS[1]!)] });
      expect(res.status).toBe(429);
      expect((await t.body(res)).erro).toBe('espelho-cota');
      t.advance(DAY);
      expect((await t.mirror(me.token, { rev, poe: [t.item(NOTAS[0]!), t.item(NOTAS[1]!)] })).status).toBe(200);
    });

    it('a limpeza tira o espelho de quem não tem mais chave que lê; apagar a conta também', async () => {
      const t = await setup();
      const { me } = await t.ready();
      const count = async () => (await t.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM api_espelho WHERE usuario_id = ?', [me.id]))!.n;
      await cleanup(t.deps);
      expect(await count()).toBe(NOTAS.length + 1);
      await t.json('DELETE', '/v1/eu/chaves', undefined, me.token);
      await cleanup(t.deps);
      expect(await count()).toBe(0);
      expect(await t.db.first('SELECT 1 AS x FROM api_espelho_estado WHERE usuario_id = ?', [me.id])).toBeNull();
      await t.newKey(me.token);
      expect((await t.mirror(me.token, { rev: 1, poe: [t.item(NOTAS[0]!)] })).status).toBe(200);
      expect(await count()).toBe(1);
      expect((await t.json('DELETE', '/v1/eu', undefined, me.token)).status).toBe(200);
      expect(await count()).toBe(0);
    });
  });

  describe(`${label}: ler as Anotações com a chave`, () => {
    it('pede notas:ler; o espelho vazio avisa o que fazer', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const gastos = await t.newKey(me.token, { escopos: ['gastos:ler'] });
      const res = await t.ext(gastos, '/ext/v1/notas');
      expect(res.status).toBe(403);
      expect((await t.body(res)).erro).toBe('sem-permissao');
      const leitora = await t.newKey(me.token);
      const empty = await t.body(t.ext(leitora, '/ext/v1/notas'));
      expect(empty.itens).toEqual([]);
      expect(empty.espelho.estado).toBe('vazio');
      expect(empty.espelho.aviso).toContain('abra o site');
      expect((await t.ext(me.token, '/ext/v1/notas')).status, 'a sessão não vale aqui').toBe(401);
    });

    it('a lista vem com o resumo, da mudada por último para a mais antiga; com_texto traz o texto', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const list = await t.body(t.ext(secret, '/ext/v1/notas'));
      expect(list.itens.map((n: { id: string }) => n.id)).toEqual(['trab-1', 'estu-1', 'solta', 'trab-2']);
      expect(list.itens[0].resumo).toBe('Levar a ata. - [ ] mandar e-mail');
      expect(list.itens[0].texto).toBeUndefined();
      expect(list.espelho.estado).toBe('pronto');
      expect(list.depois).toBeUndefined();
      const full = await t.body(t.ext(secret, '/ext/v1/notas?com_texto=sim&limite=1'));
      expect(full.itens[0].texto).toBe('Levar a ata.\n- [ ] mandar e-mail');
      expect(full.depois).toBe('1');
      expect(await t.ids(secret, '?limite=2&depois=2')).toEqual(['solta', 'trab-2']);
    });

    it('os filtros: grupo (sem ligar para acento e caixa), sem grupo, assunto, tag, finalizadas, fixadas, busca, mudou depois de, ordem', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      expect(await t.ids(secret, '?grupo=TRABALHO')).toEqual(['trab-1', 'trab-2']);
      expect(await t.ids(secret, '?grupo=-')).toEqual(['solta']);
      expect(await t.ids(secret, '?assunto=c%C3%A1lculo')).toEqual(['estu-1']);
      expect(await t.ids(secret, '?tag=%23Urgente')).toEqual(['trab-1']);
      expect(await t.ids(secret, '?finalizadas=sim')).toEqual(['trab-2']);
      expect(await t.ids(secret, '?finalizadas=nao&fixadas=nao')).toEqual(['estu-1', 'solta']);
      expect(await t.ids(secret, '?fixadas=sim')).toEqual(['trab-1']);
      expect(await t.ids(secret, '?q=calculo')).toEqual(['estu-1']);
      expect(await t.ids(secret, '?q=FEIJAO')).toEqual(['solta']);
      expect(await t.ids(secret, '?q=100%25')).toEqual([]);
      expect(await t.ids(secret, '?mudou_depois_de=2026-10-03T12:00:00Z')).toEqual(['trab-1', 'estu-1']);
      expect(await t.ids(secret, '?ordem=titulo')).toEqual(['trab-2', 'estu-1', 'solta', 'trab-1']);
      expect(await t.ids(secret, '?ordem=data')).toEqual(['estu-1', 'solta', 'trab-1', 'trab-2']);
      for (const bad of ['?ordem=sorte', '?finalizadas=talvez', '?mudou_depois_de=ontem']) expect((await t.ext(secret, `/ext/v1/notas${bad}`)).status, bad).toBe(400);
    });

    it('a página para antes de passar do teto, e diz de onde continuar', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const secret = await t.newKey(me.token);
      const rev = await t.push(me.token, 0);
      const big = Array.from({ length: 14 }, (_, i) => t.item(nota(`grande-${String(i).padStart(2, '0')}`, { texto: 'x'.repeat(20_000), versao: new Date(NOW.getTime() - i * 1000).toISOString() })));
      expect((await t.mirror(me.token, { rev, poe: big })).status).toBe(200);
      const page = await t.body(t.ext(secret, '/ext/v1/notas?com_texto=sim&limite=100'));
      expect(page.itens.length).toBeLessThan(14);
      expect(page.itens.length).toBeGreaterThan(10);
      expect(page.depois).toBe(String(page.itens.length));
    });

    it('a nota inteira pelo id', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      expect((await t.body(t.ext(secret, '/ext/v1/notas/estu-1'))).nota).toEqual(NOTAS[2]);
      expect((await t.ext(secret, '/ext/v1/notas/nao-existe')).status).toBe(404);
      expect((await t.ext(secret, '/ext/v1/notas/x%20y')).status).toBe(404);
    });

    it('a chave limitada a um grupo não vê as outras notas, os nomes dos outros grupos nem as tags deles', async () => {
      const t = await setup();
      const { me } = await t.ready();
      const trabalho = await t.newKey(me.token, { grupos: ['trabalho'] });
      expect(await t.ids(trabalho)).toEqual(['trab-1', 'trab-2']);
      expect(await t.ids(trabalho, '?grupo=-')).toEqual([]);
      expect(await t.ids(trabalho, '?grupo=Estudos')).toEqual([]);
      expect((await t.ext(trabalho, '/ext/v1/notas/estu-1')).status).toBe(404);
      const ctx = await t.body(t.ext(trabalho, '/ext/v1/contexto'));
      expect(ctx.notas.grupos.map((g: { nome: string }) => g.nome)).toEqual(['Trabalho']);
      expect(ctx.notas.sem_grupo).toEqual({ notas: 0, tags: [] });
      expect(JSON.stringify(ctx.notas)).not.toContain('prova');
      const found = await t.body(t.ext(trabalho, '/ext/v1/busca?q=prova'));
      expect(found.itens).toEqual([]);
    });

    it('uma conta não lê o espelho de outra', async () => {
      const t = await setup();
      await t.ready();
      const bia = await t.login('bia');
      const hers = await t.newKey(bia.token);
      expect(await t.ids(hers)).toEqual([]);
      expect((await t.ext(hers, '/ext/v1/notas/trab-1')).status).toBe(404);
      expect((await t.body(t.ext(hers, '/ext/v1/busca?q=reuniao'))).itens).toEqual([]);
      expect((await t.body(t.ext(hers, '/ext/v1/contexto'))).notas).toBeNull();
    });

    it('o contexto: a conta, hoje no fuso dela, a chave e o vocabulário das Anotações', async () => {
      const t = await setup();
      const { secret, me } = await t.ready();
      const ctx = await t.body(t.ext(secret, '/ext/v1/contexto'));
      expect(ctx.conta).toEqual({ codigo: me.codigo, nome: 'ana' });
      expect(ctx.fuso).toBe('America/Sao_Paulo');
      expect(ctx.notas).toEqual(CONTEXTO);
      // NOW (15h UTC, 12h em Brasília) mais 10 h: já é dia 7 em UTC, ainda dia 6 em Brasília
      t.advance(10 * 3_600_000);
      expect((await t.body(t.ext(secret, '/ext/v1/contexto'))).hoje).toBe('2026-10-06');
      // sem notas:ler, o contexto vem sem as notas
      const gastos = await t.newKey(me.token, { escopos: ['gastos:ler'] });
      expect((await t.body(t.ext(gastos, '/ext/v1/contexto'))).notas).toBeNull();
    });

    it('a busca: título e texto sem ligar para acento, com o trecho em volta', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const found = await t.body(t.ext(secret, '/ext/v1/busca?q=c%C3%A1lculo'));
      expect(found.itens).toEqual([{ tipo: 'nota', id: 'estu-1', titulo: 'Integrais', grupo: 'Estudos', trecho: 'Revisar a prova de Cálculo na sexta.' }]);
      expect((await t.body(t.ext(secret, '/ext/v1/busca?q=pauta'))).itens[0].trecho).toBe('Levar a ata. - [ ] mandar e-mail');
      expect((await t.ext(secret, '/ext/v1/busca?q=a')).status).toBe(400);
    });
  });
}
