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

  describe(`${label}: ler os Gastos com a chave`, () => {
    it('pede gastos:ler', async () => {
      const t = await setup();
      const { me } = await t.ready();
      const other = await t.newKey(me.token, ['notas:ler']);
      const res = await t.ext(other.segredo, '/ext/v1/gastos/meses/2026-10');
      expect(res.status).toBe(403);
      expect((await t.body(res)).erro).toBe('sem-permissao');
    });

    it('o mês como o app mostra; fora da janela, 404 com o que fazer; espelho vazio, avisa', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const got = await t.body(t.ext(secret, '/ext/v1/gastos/meses/2026-10'));
      expect(got.mes).toEqual(mes('2026-10'));
      expect(got.espelho.estado).toBe('pronto');
      const out = await t.ext(secret, '/ext/v1/gastos/meses/2020-01');
      expect(out.status).toBe(404);
      expect((await t.body(out)).erro).toBe('mes-fora');
      expect((await t.ext(secret, '/ext/v1/gastos/meses/2026-13')).status).toBe(400);
      const u = await setup();
      const me = await u.login('bia');
      const k = await u.newKey(me.token, ['gastos:ler']);
      const empty = await u.body(u.ext(k.segredo, '/ext/v1/gastos/meses/2026-10'));
      expect(empty.mes).toBeNull();
      expect(empty.espelho.estado).toBe('vazio');
    });

    it('os lançamentos, do dia mais recente para o mais antigo, com os filtros', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const ids = async (query = '') => ((await t.body(t.ext(secret, `/ext/v1/gastos/lancamentos${query}`))).itens as { id: string }[]).map((l) => l.id);
      expect(await ids()).toEqual(['merc-1', 'sal-1', 'viol-1']);
      expect(await ids('?de=2026-10')).toEqual(['merc-1', 'sal-1']);
      expect(await ids('?ate=2026-09')).toEqual(['viol-1']);
      expect(await ids('?de=2026-10-02&ate=2026-10-31')).toEqual(['merc-1']);
      expect(await ids('?tipo=entrada')).toEqual(['sal-1']);
      expect(await ids('?envelope=item')).toEqual(['viol-1']);
      expect(await ids('?envelope=mercado')).toEqual(['merc-1']);
      expect(await ids('?pessoa=bruna')).toEqual(['viol-1']);
      expect(await ids('?pessoa=eu')).toEqual(['merc-1', 'viol-1']);
      expect(await ids('?q=MERC')).toEqual(['merc-1']);
      const page = await t.body(t.ext(secret, '/ext/v1/gastos/lancamentos?limite=1'));
      expect([page.itens.length, page.depois]).toEqual([1, '1']);
      expect(await ids('?limite=2&depois=1')).toEqual(['sal-1', 'viol-1']);
      const unknown = await t.ext(secret, '/ext/v1/gastos/lancamentos?envelope=Farmacia');
      expect(unknown.status).toBe(400);
      expect((await t.body(unknown)).mensagem).toContain('Mercado, Item, Renda');
      expect((await t.ext(secret, '/ext/v1/gastos/lancamentos?de=ontem')).status).toBe(400);
      expect((await t.ext(secret, '/ext/v1/gastos/lancamentos?tipo=gasto')).status).toBe(400);
    });

    it('um lançamento pelo id', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      expect((await t.body(t.ext(secret, '/ext/v1/gastos/lancamentos/viol-1'))).lancamento).toEqual(LANCAMENTOS[1]);
      expect((await t.ext(secret, '/ext/v1/gastos/lancamentos/nao-existe')).status).toBe(404);
    });

    it('o contexto traz os envelopes e as pessoas para a chave que lê os gastos; a busca acha lançamentos', async () => {
      const t = await setup();
      const { secret, me } = await t.ready();
      expect((await t.body(t.ext(secret, '/ext/v1/contexto'))).gastos).toEqual(CONTEXTO);
      const notesOnly = await t.newKey(me.token, ['notas:ler']);
      expect((await t.body(t.ext(notesOnly.segredo, '/ext/v1/contexto'))).gastos).toBeNull();
      const found = await t.body(t.ext(secret, '/ext/v1/busca?q=viol&areas=gastos'));
      expect(found.itens).toEqual([{ tipo: 'lancamento', id: 'viol-1', titulo: 'Violão', dia: '2026-09-10', centavos: 13990, envelope: 'Item' }]);
      expect((await t.ext(notesOnly.segredo, '/ext/v1/busca?q=viol&areas=gastos')).status).toBe(403);
    });
  });

  describe(`${label}: escrever nos Gastos com a chave`, () => {
    const ALL = ['gastos:ler', 'gastos:lancar', 'gastos:editar'];
    const post = (t: Awaited<ReturnType<typeof setup>>, secret: string, path: string, payload: unknown, headers: Record<string, string> = {}) =>
      t.ext(secret, path, { method: 'POST', body: JSON.stringify(payload), headers });
    const count = async (t: Awaited<ReturnType<typeof setup>>) => (await t.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM api_pedidos'))!.n;

    it('lançar um: o pedido entra direto e o lançamento vem como vai ficar (envelope pelo nome, você, hoje)', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const res = await post(t, secret, '/ext/v1/gastos/lancamentos', { titulo: 'Padaria', centavos: 1850, envelope: 'mercado' });
      expect(res.status).toBe(202);
      const out = await t.body(res);
      expect(out.pedido).toEqual(expect.objectContaining({ op: 'gasto.lancar', estado: 'pendente' }));
      expect(out.lancamento).toEqual(
        expect.objectContaining({ titulo: 'Padaria', centavos: 1850, tipo: 'saida', envelope: { id: 'mercado', nome: 'Mercado' }, pessoas: ['Eu'], dia: '2026-10-06', mes: '2026-10', pagamento: 'avista' }),
      );
      // aparece na lista (no começo) e pelo id, com o pedido marcado
      const list = await t.body(t.ext(secret, '/ext/v1/gastos/lancamentos'));
      expect(list.itens[0].id).toBe(out.lancamento.id);
      expect(list.itens[0].pedidos).toEqual([expect.objectContaining({ op: 'gasto.lancar', estado: 'pendente' })]);
      expect((await t.body(t.ext(secret, `/ext/v1/gastos/lancamentos/${out.lancamento.id}`))).lancamento.titulo).toBe('Padaria');
      // e o mês diz que há pedidos abertos
      expect((await t.body(t.ext(secret, '/ext/v1/gastos/meses/2026-10'))).pedidos_abertos).toEqual([expect.objectContaining({ op: 'gasto.lancar', alvo: out.lancamento.id })]);
    });

    it('lançar pede gastos:lancar; criar envelope ou pessoa junto pede gastos:editar', async () => {
      const t = await setup();
      const { secret, me } = await t.ready(['gastos:ler']);
      expect((await post(t, secret, '/ext/v1/gastos/lancamentos', { titulo: 'X', centavos: 100 })).status).toBe(403);
      const launcher = (await t.newKey(me.token, ['gastos:ler', 'gastos:lancar'])).segredo;
      expect((await post(t, launcher, '/ext/v1/gastos/lancamentos', { titulo: 'X', centavos: 100, envelope: 'Farmácia', criar_envelope: true })).status).toBe(403);
      expect((await post(t, launcher, '/ext/v1/gastos/lancamentos', { titulo: 'X', centavos: 100 })).status).toBe(202);
    });

    it('o envelope e as pessoas têm de existir (e ser do tipo certo), a não ser que se peça para criar', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const err = async (payload: unknown) => {
        const res = await post(t, secret, '/ext/v1/gastos/lancamentos', payload);
        return [res.status, (await t.body(res)) as { erro: string; mensagem: string }] as const;
      };
      const [s1, b1] = await err({ titulo: 'Remédio', centavos: 3000, envelope: 'Farmácia' });
      expect([s1, b1.erro]).toEqual([422, 'envelope-desconhecido']);
      expect(b1.mensagem).toContain('Mercado, Item');
      expect((await err({ titulo: 'Remédio', centavos: 3000, envelope: 'Renda' }))[1].erro).toBe('envelope-de-outro-tipo');
      const [s3, b3] = await err({ titulo: 'Jantar', centavos: 9000, pessoas: ['eu', 'Caio'] });
      expect([s3, b3.erro]).toEqual([422, 'pessoa-desconhecida']);
      expect(b3.mensagem).toContain('"Caio"');
      expect((await err({ titulo: 'Volta', centavos: 500, tipo: 'entrada', envelope: 'renda', reembolso_de: 'nao-existe' }))[1].erro).toBe('gasto-nao-encontrado');
      expect((await err({ titulo: 'X', centavos: 10.5 }))[1].erro).toBe('pedido-invalido');
      expect((await err({ titulo: 'X', centavos: 100, tipo: 'entrada', pessoas: ['eu'] }))[1].erro).toBe('pedido-invalido');
      expect((await post(t, secret, '/ext/v1/gastos/lancamentos', { titulo: 'Jantar', centavos: 9000, pessoas: ['Bruna', 'Caio'], criar_pessoas: true })).status).toBe(202);
      expect((await post(t, secret, '/ext/v1/gastos/lancamentos', { titulo: 'Volta', centavos: 500, tipo: 'entrada', envelope: 'renda', reembolso_de: 'merc-1' })).status).toBe(202);
    });

    it('a frase rápida vira pedido (o site entende ao aplicar) e aparece à parte na lista', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const out = await t.body(post(t, secret, '/ext/v1/gastos/lancamentos', { frase: 'uber 23,90 ontem #transporte' }));
      expect(out.lancamento).toBeNull();
      expect(out.pedido.estado).toBe('pendente');
      const list = await t.body(t.ext(secret, '/ext/v1/gastos/lancamentos'));
      expect(list.frases_abertas).toEqual([{ pedido: out.pedido.id, estado: 'pendente', frase: 'uber 23,90 ontem #transporte' }]);
      expect((await post(t, secret, '/ext/v1/gastos/lancamentos', { frase: '' })).status).toBe(400);
    });

    it('o lote: um pedido por lançamento; um item errado e nada entra; o mesmo Idempotency-Key não repete', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const itens = [
        { titulo: 'Mercado', centavos: 10000, envelope: 'Mercado' },
        { titulo: 'Item', centavos: 5000, envelope: 'Item', parcelas: 3 },
      ];
      const bad = await post(t, secret, '/ext/v1/gastos/lancamentos', { itens: [...itens, { titulo: 'Sem valor' }] });
      expect(bad.status).toBe(400);
      expect((await t.body(bad)).mensagem).toContain('Item 3');
      expect(await count(t)).toBe(0);
      const ok = await t.body(post(t, secret, '/ext/v1/gastos/lancamentos', { itens }, { 'Idempotency-Key': 'fatura-out' }));
      expect(ok.pedidos.length).toBe(2);
      expect(ok.lancamentos.map((l: LancamentoV1) => [l.titulo, l.pagamento, l.parcelas])).toEqual([
        ['Mercado', 'avista', null],
        ['Item', 'parcelado', 3],
      ]);
      await post(t, secret, '/ext/v1/gastos/lancamentos', { itens }, { 'Idempotency-Key': 'fatura-out' });
      expect(await count(t)).toBe(2);
      const phrases = await t.body(post(t, secret, '/ext/v1/gastos/lancamentos', { frases: ['ifood 44,90', 'cinema 38 #luxo'] }));
      expect(phrases.pedidos.length).toBe(2);
      expect((await post(t, secret, '/ext/v1/gastos/lancamentos', { itens: Array.from({ length: 51 }, () => itens[0]) })).status).toBe(400);
    });

    it('mudar e apagar pedem a versão de agora e esperam a aprovação; a mudança aparece por cima', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const old = await t.ext(secret, '/ext/v1/gastos/lancamentos/merc-1', { method: 'PATCH', body: JSON.stringify({ centavos: 25000, versao: '2026-01-01T00:00:00.000Z' }) });
      expect(old.status).toBe(409);
      expect((await t.body(old)).lancamento.id).toBe('merc-1');
      const res = await t.ext(secret, '/ext/v1/gastos/lancamentos/merc-1', {
        method: 'PATCH',
        body: JSON.stringify({ centavos: 25000, precisava: 'indispensavel', versao: LANCAMENTOS[0]!.versao }),
      });
      expect(res.status).toBe(202);
      const out = await t.body(res);
      expect(out.pedido.estado).toBe('aguardando-aprovacao');
      expect([out.lancamento.centavos, out.lancamento.precisava]).toEqual([25000, 'indispensavel']);
      const shown = (await t.body(t.ext(secret, '/ext/v1/gastos/lancamentos/merc-1'))).lancamento;
      expect([shown.centavos, shown.pedidos.length]).toEqual([25000, 1]);
      expect((await t.ext(secret, '/ext/v1/gastos/lancamentos/viol-1', { method: 'DELETE' })).status).toBe(400);
      const del = await t.ext(secret, `/ext/v1/gastos/lancamentos/viol-1?versao=${encodeURIComponent(LANCAMENTOS[1]!.versao)}`, { method: 'DELETE' });
      expect(del.status).toBe(202);
      expect((await t.body(del)).pedido).toEqual(expect.objectContaining({ op: 'gasto.apagar', estado: 'aguardando-aprovacao' }));
      expect((await t.ext(secret, '/ext/v1/gastos/lancamentos/nao-existe', { method: 'PATCH', body: JSON.stringify({ centavos: 1, versao: LANCAMENTOS[0]!.versao }) })).status).toBe(404);
    });

    it('envelopes e pessoas: criar (sem repetir nome) e mudar pelo nome ou pelo id', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const created = await post(t, secret, '/ext/v1/gastos/envelopes', { nome: 'Farmácia', tipo: 'saida', limite_centavos: 20000 });
      expect(created.status).toBe(202);
      expect((await t.body(created)).pedido.op).toBe('envelope.criar');
      expect((await post(t, secret, '/ext/v1/gastos/envelopes', { nome: 'mercado' })).status).toBe(409);
      const patch = (path: string, payload: unknown) => t.ext(secret, path, { method: 'PATCH', body: JSON.stringify(payload) });
      const edited = await t.body(patch('/ext/v1/gastos/envelopes/mercado', { limite_centavos: 90000 }));
      expect(edited.pedido).toEqual(expect.objectContaining({ op: 'envelope.editar', alvo: 'mercado' }));
      expect((await patch('/ext/v1/gastos/envelopes/Renda', { limite_centavos: 100 })).status).toBe(422);
      expect((await patch('/ext/v1/gastos/envelopes/Nada', { nome: 'Outro' })).status).toBe(404);
      expect((await post(t, secret, '/ext/v1/gastos/pessoas', { nome: 'bruna' })).status).toBe(409);
      expect((await post(t, secret, '/ext/v1/gastos/pessoas', { nome: 'Caio' })).status).toBe(202);
      expect((await t.body(patch('/ext/v1/gastos/pessoas/eu', { nome: 'Igor' }))).pedido.alvo).toBe('eu');
    });
  });

  describe(`${label}: os Gastos pelo MCP`, () => {
    const ALL = ['gastos:ler', 'gastos:lancar', 'gastos:editar'];
    let seq = 0;
    const rpc = (t: Awaited<ReturnType<typeof setup>>, secret: string, method: string, params?: unknown) =>
      t.body(
        t.call('/mcp', {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, ...(params ? { params } : {}) }),
        }),
      );
    const tool = async (t: Awaited<ReturnType<typeof setup>>, secret: string, name: string, args: Record<string, unknown> = {}) =>
      (await rpc(t, secret, 'tools/call', { name, arguments: args })).result;

    it('a chave dos gastos vê as ferramentas dos gastos (e o contexto e a busca), não as das notas', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const names = (await rpc(t, secret, 'tools/list')).result.tools.map((x: { name: string }) => x.name);
      expect(names).toEqual(expect.arrayContaining(['ver_contexto', 'buscar', 'ver_gastos_do_mes', 'listar_lancamentos', 'ler_lancamento', 'lancar_gastos', 'editar_lancamento', 'apagar_lancamento', 'criar_envelope', 'editar_envelope', 'criar_pessoa', 'editar_pessoa', 'ver_pedidos']));
      expect(names).not.toContain('listar_notas');
    });

    it('ler o mês e a lista pelo MCP: o caminho com o mês, os filtros na consulta, o texto marcado como dado', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const month = await tool(t, secret, 'ver_gastos_do_mes', { mes: '2026-10' });
      expect(month.structuredContent.mes.saldo).toBe(418860);
      expect(month.content[0].text).toContain('<conteudo_do_usuario>');
      const list = await tool(t, secret, 'listar_lancamentos', { envelope: 'item' });
      expect(list.structuredContent.itens.map((l: { id: string }) => l.id)).toEqual(['viol-1']);
      const found = await tool(t, secret, 'buscar', { q: 'violão' });
      expect(found.structuredContent.itens.map((i: { tipo: string }) => i.tipo)).toEqual(['lancamento']);
      expect((await tool(t, secret, 'ver_gastos_do_mes', {})).isError).toBe(true);
    });

    it('lançar por frases vira um pedido por lançamento; apagar leva a versão na consulta', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const out = await tool(t, secret, 'lancar_gastos', { frases: ['ifood 44,90', 'cinema 38 #luxo'] });
      expect(out.isError).toBeUndefined();
      expect(out.content[0].text).toMatch(/^2 pedidos feitos/);
      const del = await tool(t, secret, 'apagar_lancamento', { id: 'viol-1', versao: LANCAMENTOS[1]!.versao });
      expect(del.structuredContent.pedido).toEqual(expect.objectContaining({ op: 'gasto.apagar', estado: 'aguardando-aprovacao' }));
      expect(del.content[0].text).toContain('alvo viol-1');
      const unknown = await tool(t, secret, 'lancar_gastos', { itens: [{ titulo: 'Remédio', centavos: 3000, envelope: 'Farmácia' }] });
      expect(unknown.isError).toBe(true);
      expect(unknown.content[0].text).toContain('envelope-desconhecido');
    });
  });
}
