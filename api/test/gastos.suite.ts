import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import { CONTEXTO_GASTOS, visaoDoMes, type ContextoGastosV1, type LancamentoV1, type MesV1 } from '../../contrato/api-v1/gastos';
import type { NotaV1 } from '../../contrato/api-v1/notas';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, gzip, jsonCaller } from './harness';

/**
 * Os Gastos na API das AIs (PLANO-API.md, rodada 6): o espelho que o site enche (lançamentos, a visão
 * de cada mês e o contexto), a leitura com a chave e os pedidos de escrita. Roda nos dois bancos.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };

/** Um lançamento v1 com o que importa no teste; o resto, o de sempre. */
export function lancamento(id: string, extra: Partial<LancamentoV1> = {}): LancamentoV1 {
  return {
    id,
    titulo: `Gasto ${id}`,
    centavos: 1000,
    tipo: 'saida',
    envelope: { id: 'mercado', nome: 'Mercado' },
    pagamento: 'avista',
    parcelas: null,
    precisava: null,
    pessoas: ['Eu'],
    dia: '2026-10-05',
    mes: '2026-10',
    fatura: 0,
    mensal: null,
    reembolso_de: null,
    criado_em: '2026-10-05T10:00:00.000Z',
    versao: '2026-10-05T10:00:00.000Z',
    ...extra,
  };
}

export const LANCAMENTOS: LancamentoV1[] = [
  lancamento('merc-1', { titulo: 'Mercado da semana', centavos: 23050, dia: '2026-10-26', versao: '2026-10-26T12:00:00.000Z' }),
  lancamento('viol-1', {
    titulo: 'Violão',
    centavos: 13990,
    envelope: { id: 'luxo', nome: 'Item' },
    pagamento: 'parcelado',
    parcelas: 10,
    precisava: 'luxo',
    pessoas: ['Eu', 'Bruna'],
    dia: '2026-09-10',
    mes: '2026-09',
  }),
  lancamento('sal-1', { titulo: 'Salário', centavos: 455900, tipo: 'entrada', envelope: { id: 'renda', nome: 'Renda' }, pagamento: null, pessoas: [], dia: '2026-10-01', mensal: { ate: null, valores: {}, pulados: [] } }),
];

export function mes(m: string, extra: Partial<MesV1> = {}): MesV1 {
  return {
    mes: m,
    entradas: 455900,
    saidas: 37040,
    saldo: 418860,
    comprometido: 13990,
    por_envelope: [
      { id: 'mercado', nome: 'Mercado', centavos: 23050, limite_centavos: 80000 },
      { id: 'luxo', nome: 'Item', centavos: 13990, limite_centavos: null },
    ],
    entradas_por_envelope: [{ id: 'renda', nome: 'Renda', centavos: 455900 }],
    precisava: { luxo: 13990, conforto: 0, indispensavel: 0, sem_resposta: 23050 },
    por_pessoa: [
      { nome: 'Eu', centavos: 30045 },
      { nome: 'Bruna', centavos: 6995 },
    ],
    carnes: [{ id: 'viol-1', titulo: 'Violão', parcela: 2, de: 10, falta: 111920, ultimo_mes: '2027-06' }],
    parcelas_a_frente: { total: 111920, proximo_mes: 13990, ultimo_mes: '2027-06' },
    linhas: [
      { id: 'merc-1', titulo: 'Mercado da semana', dia: '2026-10-26', centavos: 23050, tipo: 'saida', envelope: 'Mercado', parcela: null, mensal: false },
      { id: 'viol-1', titulo: 'Violão', dia: '2026-10-10', centavos: 13990, tipo: 'saida', envelope: 'Item', parcela: { n: 2, de: 10 }, mensal: false },
      { id: 'sal-1', titulo: 'Salário', dia: '2026-10-01', centavos: 455900, tipo: 'entrada', envelope: 'Renda', parcela: null, mensal: true },
    ],
    ...extra,
  };
}

export const CONTEXTO: ContextoGastosV1 = {
  envelopes: [
    { id: 'mercado', nome: 'Mercado', tipo: 'saida', cor: 'amarelo', limite_centavos: 80000, versao: '2026-01-01T00:00:00.000Z' },
    { id: 'luxo', nome: 'Item', tipo: 'saida', cor: 'lilas', limite_centavos: null, versao: '2026-01-01T00:00:00.000Z' },
    { id: 'renda', nome: 'Renda', tipo: 'entrada', cor: 'verde', limite_centavos: null, versao: '2026-01-01T00:00:00.000Z' },
  ],
  pessoas: [
    { id: 'eu', nome: 'Eu', eu: true },
    { id: 'p-bruna', nome: 'Bruna', eu: false },
  ],
  meses: ['2026-09', '2026-10'],
};

export function gastosSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'gastos', alg: 'RS256' };
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
        .setProtectedHeader({ alg: 'RS256', kid: 'gastos' })
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
    const newKey = async (token: string, escopos = ['gastos:ler'], extra: Record<string, unknown> = {}) =>
      (await body(json('POST', '/v1/eu/chaves', { nome: 'AI dos gastos', escopos, validade: 30, ...extra }, token))) as { segredo: string; chave: { id: string } };
    const mirror = (token: string, payload: unknown) => json('POST', '/v1/eu/espelho', payload, token);
    const item = (tipo: string, id: string, dados: unknown) => ({ tipo, id, hash: 'cd'.repeat(8), dados });
    const gastos = () => [
      ...LANCAMENTOS.map((l) => item('lancamento', l.id, l)),
      item('visao', visaoDoMes('2026-10'), mes('2026-10')),
      item('visao', visaoDoMes('2026-09'), mes('2026-09', { linhas: [] })),
      item('contexto-gastos', CONTEXTO_GASTOS, CONTEXTO),
    ];
    const ext = (secret: string, path: string, init: RequestInit = {}) =>
      call(path, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } });
    /** Uma conta com mural, uma chave que lê os gastos e o espelho cheio. */
    const ready = async (escopos = ['gastos:ler'], keyExtra: Record<string, unknown> = {}) => {
      const me = await login('ana');
      const k = await newKey(me.token, escopos, keyExtra);
      const rev = await push(me.token, 0);
      const res = await mirror(me.token, { rev, fuso: 'America/Sao_Paulo', poe: gastos() });
      expect(res.status).toBe(200);
      return { me, secret: k.segredo, keyId: k.chave.id, rev };
    };
    return { db, deps, call, json, body, login, push, newKey, mirror, item, gastos, ext, ready, advance };
  }

  describe(`${label}: o espelho dos Gastos`, () => {
    it('a chave que lê os gastos faz a nuvem pedir a área gastos, com as impressões dos tipos dela', async () => {
      const t = await setup();
      const me = await t.login('ana');
      expect((await t.body(t.call('/v1/eu/espelho', { headers: { Authorization: `Bearer ${me.token}` } }))).areas).toEqual([]);
      await t.newKey(me.token, ['gastos:ler']);
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: t.gastos() })).status).toBe(200);
      const got = await t.body(t.call('/v1/eu/espelho', { headers: { Authorization: `Bearer ${me.token}` } }));
      expect(got.areas).toEqual(['gastos']);
      expect(Object.keys(got.hashes).sort()).toEqual(['contexto-gastos', 'lancamento', 'visao']);
      expect(Object.keys(got.hashes.lancamento).sort()).toEqual(['merc-1', 'sal-1', 'viol-1']);
      expect(Object.keys(got.hashes.visao).sort()).toEqual(['gastos-2026-09', 'gastos-2026-10']);
      const row = await t.db.first<{ data: string; busca: string }>("SELECT data, busca FROM api_espelho WHERE tipo = 'lancamento' AND id = 'merc-1'");
      expect(row).toEqual({ data: '2026-10-26', busca: 'mercado da semana' });
    });

    it('só a forma da v1 entra: um campo a mais some, e o que não serve é recusado', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['gastos:ler']);
      const rev = await t.push(me.token, 0);
      const extra = { ...lancamento('x1'), segredo: 'não devia ir' };
      expect((await t.mirror(me.token, { rev, poe: [t.item('lancamento', 'x1', extra)] })).status).toBe(200);
      const saved = JSON.parse((await t.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE id = 'x1'"))!.dados);
      expect(saved).toEqual(lancamento('x1'));
      const bad = async (poe: unknown[]) => {
        const res = await t.mirror(me.token, { rev, poe });
        expect(res.status).toBe(400);
        return (await t.body(res)).erro;
      };
      expect(await bad([t.item('lancamento', 'x2', lancamento('x2', { centavos: 10.5 }))])).toBe('espelho-invalido');
      expect(await bad([t.item('lancamento', 'x3', lancamento('x3', { dia: '26/10/2026' }))])).toBe('espelho-invalido');
      expect(await bad([t.item('lancamento', 'x4', lancamento('x5'))])).toBe('espelho-invalido');
      expect(await bad([t.item('visao', 'gastos-2026-11', mes('2026-10'))])).toBe('espelho-invalido');
      expect(await bad([t.item('contexto-gastos', 'outro', CONTEXTO)])).toBe('espelho-invalido');
    });

    it('a chave que só lê as Anotações não deixa os gastos entrarem', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['notas:ler']);
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: [t.item('lancamento', 'merc-1', LANCAMENTOS[0])] })).status).toBe(400);
    });

    it('a limpeza tira só a área que ninguém lê mais; o estado sai quando nenhuma fica', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const notes = await t.newKey(me.token, ['notas:ler']);
      const spending = await t.newKey(me.token, ['gastos:ler']);
      const rev = await t.push(me.token, 0);
      const nota: NotaV1 = {
        id: 'n1', titulo: 'Nota', texto: '', grupo: null, assunto: null, tags: [], data: null, finalizada_em: null, fixada: false, visibilidade: 'privada', capa: null,
        tarefas: { feitas: 0, total: 0 }, kanban: null, criada_em: '2026-10-01T10:00:00.000Z', versao: '2026-10-01T10:00:00.000Z',
      };
      expect((await t.mirror(me.token, { rev, poe: [...t.gastos(), t.item('nota', 'n1', nota)] })).status).toBe(200);
      const count = async (tipo: string) => (await t.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM api_espelho WHERE usuario_id = ? AND tipo = ?', [me.id, tipo]))!.n;
      await t.json('DELETE', `/v1/eu/chaves/${spending.chave.id}`, undefined, me.token);
      await cleanup(t.deps);
      expect([await count('lancamento'), await count('visao'), await count('contexto-gastos'), await count('nota')]).toEqual([0, 0, 0, 1]);
      expect(await t.db.first('SELECT 1 AS x FROM api_espelho_estado WHERE usuario_id = ?', [me.id])).not.toBeNull();
      await t.json('DELETE', `/v1/eu/chaves/${notes.chave.id}`, undefined, me.token);
      await cleanup(t.deps);
      expect(await count('nota')).toBe(0);
      expect(await t.db.first('SELECT 1 AS x FROM api_espelho_estado WHERE usuario_id = ?', [me.id])).toBeNull();
    });
  });
}
