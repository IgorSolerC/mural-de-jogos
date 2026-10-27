import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import type { CartaoV1, QuadroV1 } from '../../contrato/api-v1/kanban';
import type { NotaV1 } from '../../contrato/api-v1/notas';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, gzip, jsonCaller } from './harness';

/**
 * O Kanban na API das AIs (PLANO-API.md, rodada 8): o espelho dos quadros que o site enche (um por
 * grupo, com as colunas e os cartões), a leitura com a chave e os pedidos de mexer nos cartões e nas
 * colunas. Roda nos dois bancos.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };

/** Um cartão v1 com o que importa no teste; o resto, o de sempre. */
export function cartao(nota: string, coluna: string, posicao: number, extra: Partial<CartaoV1> = {}): CartaoV1 {
  return {
    nota,
    titulo: `Nota ${nota}`,
    coluna,
    posicao,
    finalizada: false,
    importancia: null,
    status: null,
    depende_de: [],
    no_mural: true,
    tags: [],
    ...extra,
  };
}

const coluna = (id: string, nome: string, cartoes: number, extra: Partial<QuadroV1['colunas'][number]> = {}) => ({ id, nome, finaliza: false, pula: false, ordem: null, cartoes, ...extra });

export const QUADRO_TRABALHO: QuadroV1 = {
  id: 'kbtrabalho0000001',
  grupo: 'Trabalho',
  so_no_kanban: false,
  colunas: [coluna('c-afazer', 'A fazer', 2), coluna('c-fazendo', 'Fazendo', 1), coluna('c-feito', 'Feito', 1, { finaliza: true })],
  cartoes: [
    cartao('trab-1', 'c-afazer', 0, { titulo: 'Pauta da reunião', importancia: 'importante', tags: ['urgente'] }),
    cartao('trab-3', 'c-afazer', 1, { titulo: 'Relatório', depende_de: ['trab-1'] }),
    cartao('trab-4', 'c-fazendo', 0, { titulo: 'Planilha', status: 'Com o Sérgio' }),
    cartao('trab-2', 'c-feito', 0, { titulo: 'Arquivo morto', finalizada: true }),
  ],
  versao: '2026-10-20T10:00:00.000Z',
};

export const QUADRO_ESTUDOS: QuadroV1 = {
  id: 'kbestudos00000001',
  grupo: 'Estudos',
  so_no_kanban: true,
  colunas: [coluna('e-afazer', 'A fazer', 1), coluna('e-feito', 'Feito', 0, { finaliza: true })],
  cartoes: [cartao('estu-1', 'e-afazer', 0, { titulo: 'Integrais', no_mural: false })],
  versao: '1970-01-01T00:00:00.000Z',
};

/** Uma nota v1 (para o espelho das Anotações, que o Kanban usa para achar as notas fora do quadro). */
export function nota(id: string, extra: Partial<NotaV1> = {}): NotaV1 {
  return {
    id,
    titulo: `Nota ${id}`,
    texto: '',
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

export function kanbanSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'kanban', alg: 'RS256' };
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
        .setProtectedHeader({ alg: 'RS256', kid: 'kanban' })
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
    const newKey = async (token: string, escopos = ['kanban:ler'], extra: Record<string, unknown> = {}) =>
      (await body(json('POST', '/v1/eu/chaves', { nome: 'AI do quadro', escopos, validade: 30, ...extra }, token))) as { segredo: string; chave: { id: string } };
    const mirror = (token: string, payload: unknown) => json('POST', '/v1/eu/espelho', payload, token);
    const item = (tipo: string, id: string, dados: unknown) => ({ tipo, id, hash: 'ab'.repeat(8), dados });
    const quadros = () => [item('quadro', QUADRO_TRABALHO.id, QUADRO_TRABALHO), item('quadro', QUADRO_ESTUDOS.id, QUADRO_ESTUDOS)];
    const ext = (secret: string, path: string, init: RequestInit = {}) =>
      call(path, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } });
    /** Uma conta com mural, uma chave com as permissões dadas e o espelho cheio (os quadros e, se a chave lê, as notas). */
    const ready = async (escopos = ['kanban:ler'], keyExtra: Record<string, unknown> = {}, notas: NotaV1[] = []) => {
      const me = await login('ana');
      const k = await newKey(me.token, escopos, keyExtra);
      const rev = await push(me.token, 0);
      const res = await mirror(me.token, { rev, fuso: 'America/Sao_Paulo', poe: [...quadros(), ...notas.map((n) => item('nota', n.id, n))] });
      expect(res.status).toBe(200);
      return { me, secret: k.segredo, keyId: k.chave.id, rev };
    };
    return { db, deps, call, json, body, login, push, newKey, mirror, item, quadros, ext, ready, advance };
  }

  describe(`${label}: o espelho do Kanban`, () => {
    it('qualquer permissão do Kanban faz a nuvem pedir a área kanban; o grupo vai sem acento', async () => {
      const t = await setup();
      for (const scope of ['kanban:ler', 'kanban:mover', 'kanban:colunas']) {
        await t.db.batch(TABLES.map((x) => ({ sql: `DELETE FROM ${x}` })));
        const me = await t.login('ana');
        await t.newKey(me.token, [scope]);
        const got = await t.body(t.call('/v1/eu/espelho', { headers: { Authorization: `Bearer ${me.token}` } }));
        expect(got.areas, scope).toEqual(['kanban']);
      }
      const me = await t.login('ana');
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: t.quadros() })).status).toBe(200);
      const got = await t.body(t.call('/v1/eu/espelho', { headers: { Authorization: `Bearer ${me.token}` } }));
      expect(Object.keys(got.hashes.quadro).sort()).toEqual([QUADRO_ESTUDOS.id, QUADRO_TRABALHO.id].sort());
      const row = await t.db.first<{ grupo: string; versao: string }>("SELECT grupo, versao FROM api_espelho WHERE tipo = 'quadro' AND id = ?", [QUADRO_TRABALHO.id]);
      expect(row).toEqual({ grupo: 'trabalho', versao: QUADRO_TRABALHO.versao });
    });

    it('só a forma da v1 entra: um campo a mais some, e o que não serve é recusado', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['kanban:ler']);
      const rev = await t.push(me.token, 0);
      const extra = { ...QUADRO_ESTUDOS, segredo: 'não devia ir', cartoes: [{ ...QUADRO_ESTUDOS.cartoes[0], vestida: true }] };
      expect((await t.mirror(me.token, { rev, poe: [t.item('quadro', QUADRO_ESTUDOS.id, extra)] })).status).toBe(200);
      const saved = JSON.parse((await t.db.first<{ dados: string }>('SELECT dados FROM api_espelho WHERE id = ?', [QUADRO_ESTUDOS.id]))!.dados);
      expect(saved).toEqual(QUADRO_ESTUDOS);
      const bad = async (dados: unknown, id = QUADRO_ESTUDOS.id) => {
        const res = await t.mirror(me.token, { rev, poe: [t.item('quadro', id, dados)] });
        expect(res.status).toBe(400);
        return (await t.body(res)).erro;
      };
      // o cartão numa coluna que não existe, a importância que não existe, o id que não bate, sem coluna
      expect(await bad({ ...QUADRO_ESTUDOS, cartoes: [{ ...QUADRO_ESTUDOS.cartoes[0], coluna: 'outra' }] })).toBe('espelho-invalido');
      expect(await bad({ ...QUADRO_ESTUDOS, cartoes: [{ ...QUADRO_ESTUDOS.cartoes[0], importancia: 'urgentissimo' }] })).toBe('espelho-invalido');
      expect(await bad(QUADRO_ESTUDOS, 'kboutro')).toBe('espelho-invalido');
      expect(await bad({ ...QUADRO_ESTUDOS, colunas: [], cartoes: [] })).toBe('espelho-invalido');
      expect(await bad({ ...QUADRO_ESTUDOS, colunas: [...QUADRO_ESTUDOS.colunas, QUADRO_ESTUDOS.colunas[0]] })).toBe('espelho-invalido');
    });

    it('a chave que só lê as Anotações não deixa os quadros entrarem', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['notas:ler']);
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: t.quadros() })).status).toBe(400);
    });

    it('a limpeza tira os quadros de quem não tem mais nenhuma chave do Kanban', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const reader = await t.newKey(me.token, ['kanban:ler']);
      const mover = await t.newKey(me.token, ['kanban:mover']);
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: t.quadros() })).status).toBe(200);
      const count = async () => (await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM api_espelho WHERE usuario_id = ? AND tipo = 'quadro'", [me.id]))!.n;
      await t.json('DELETE', `/v1/eu/chaves/${reader.chave.id}`, undefined, me.token);
      await cleanup(t.deps);
      // a que só move cartões ainda precisa das colunas
      expect(await count()).toBe(2);
      await t.json('DELETE', `/v1/eu/chaves/${mover.chave.id}`, undefined, me.token);
      await cleanup(t.deps);
      expect(await count()).toBe(0);
      expect(await t.db.first('SELECT 1 AS x FROM api_espelho_estado WHERE usuario_id = ?', [me.id])).toBeNull();
    });
  });

  describe(`${label}: ler o Kanban com a chave`, () => {
    it('pede kanban:ler (a que só move cartões não lê o quadro)', async () => {
      const t = await setup();
      const { me } = await t.ready();
      for (const scopes of [['notas:ler'], ['kanban:mover']]) {
        const other = await t.newKey(me.token, scopes);
        const res = await t.ext(other.segredo, '/ext/v1/kanban');
        expect(res.status, scopes.join()).toBe(403);
        expect((await t.body(res)).erro).toBe('sem-permissao');
      }
    });

    it('os quadros com as colunas, de A a Z, sem os cartões', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const got = await t.body(t.ext(secret, '/ext/v1/kanban'));
      const { cartoes: _a, ...estudos } = QUADRO_ESTUDOS;
      const { cartoes: _b, ...trabalho } = QUADRO_TRABALHO;
      expect(got.quadros).toEqual([estudos, trabalho]);
      expect(got.espelho.estado).toBe('pronto');
    });

    it('um quadro inteiro pelo grupo (sem ligar para acento e caixa) ou pelo id; o que não existe diz os que existem', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      expect((await t.body(t.ext(secret, '/ext/v1/kanban/Trabalho'))).quadro).toEqual(QUADRO_TRABALHO);
      expect((await t.body(t.ext(secret, '/ext/v1/kanban/TRABALHO'))).quadro).toEqual(QUADRO_TRABALHO);
      expect((await t.body(t.ext(secret, `/ext/v1/kanban/${QUADRO_ESTUDOS.id}`))).quadro).toEqual(QUADRO_ESTUDOS);
      const res = await t.ext(secret, `/ext/v1/kanban/${encodeURIComponent('Lazer à toa')}`);
      expect(res.status).toBe(404);
      const err = await t.body(res);
      expect(err.erro).toBe('quadro-nao-encontrado');
      expect(err.mensagem).toContain('Estudos, Trabalho');
    });

    it('sem espelho ainda, avisa em vez de dizer que não existe', async () => {
      const t = await setup();
      const me = await t.login('bia');
      const k = await t.newKey(me.token, ['kanban:ler']);
      const got = await t.body(t.ext(k.segredo, '/ext/v1/kanban/Trabalho'));
      expect(got.quadro).toBeNull();
      expect(got.espelho.estado).toBe('vazio');
      expect((await t.body(t.ext(k.segredo, '/ext/v1/kanban'))).quadros).toEqual([]);
    });

    it('a chave limitada a alguns grupos só vê os quadros deles', async () => {
      const t = await setup();
      const { secret } = await t.ready(['kanban:ler'], { grupos: ['estudos'] });
      expect((await t.body(t.ext(secret, '/ext/v1/kanban'))).quadros.map((q: { grupo: string }) => q.grupo)).toEqual(['Estudos']);
      const res = await t.ext(secret, '/ext/v1/kanban/Trabalho');
      expect(res.status).toBe(404);
      expect((await t.body(res)).mensagem).not.toContain('Trabalho,');
      expect((await t.body(t.ext(secret, `/ext/v1/kanban/${QUADRO_TRABALHO.id}`))).erro).toBe('quadro-nao-encontrado');
    });

    it('o contexto traz os quadros e as colunas para qualquer chave do Kanban, e nada para as outras', async () => {
      const t = await setup();
      const { me } = await t.ready(['kanban:mover']);
      const k = await t.newKey(me.token, ['kanban:mover']);
      const ctx = await t.body(t.ext(k.segredo, '/ext/v1/contexto'));
      expect(ctx.kanban).toEqual([
        { id: QUADRO_ESTUDOS.id, grupo: 'Estudos', so_no_kanban: true, colunas: [{ id: 'e-afazer', nome: 'A fazer', finaliza: false, pula: false }, { id: 'e-feito', nome: 'Feito', finaliza: true, pula: false }] },
        {
          id: QUADRO_TRABALHO.id,
          grupo: 'Trabalho',
          so_no_kanban: false,
          colunas: [
            { id: 'c-afazer', nome: 'A fazer', finaliza: false, pula: false },
            { id: 'c-fazendo', nome: 'Fazendo', finaliza: false, pula: false },
            { id: 'c-feito', nome: 'Feito', finaliza: true, pula: false },
          ],
        },
      ]);
      const notes = await t.newKey(me.token, ['notas:ler']);
      expect((await t.body(t.ext(notes.segredo, '/ext/v1/contexto'))).kanban).toBeNull();
    });
  });

  describe(`${label}: escrever no Kanban com a chave`, () => {
    const ALL = ['kanban:ler', 'kanban:mover', 'kanban:colunas', 'notas:ler', 'notas:criar'];
    const NOTAS = [
      nota('trab-5', { grupo: 'Trabalho', titulo: 'Orçamento', tags: ['cliente'] }),
      nota('estu-2', { grupo: 'Estudos', titulo: 'Derivadas' }),
      nota('solta', { titulo: 'Sem grupo' }),
    ];
    const put = (t: Awaited<ReturnType<typeof setup>>, secret: string, path: string, data: unknown, headers: Record<string, string> = {}) =>
      t.ext(secret, path, { method: 'PUT', body: JSON.stringify(data), headers });
    const board = async (t: Awaited<ReturnType<typeof setup>>, secret: string, ref = 'Trabalho') => (await t.body(t.ext(secret, `/ext/v1/kanban/${ref}`))).quadro as QuadroV1 & { pedidos?: { op: string }[] };
    const where = (q: QuadroV1) => q.colunas.map((c) => `${c.nome}: ${q.cartoes.filter((x) => x.coluna === c.id).map((x) => x.nota).join(' ')}`);
    const stored = async (t: Awaited<ReturnType<typeof setup>>, id: string) => JSON.parse((await t.db.first<{ dados: string }>('SELECT dados FROM api_pedidos WHERE id = ?', [id]))!.dados);

    it('mover pede kanban:mover; o quadro fora dos grupos da chave não existe para ela', async () => {
      const t = await setup();
      const { me } = await t.ready(ALL, {}, NOTAS);
      const reader = await t.newKey(me.token, ['kanban:ler']);
      expect((await put(t, reader.segredo, '/ext/v1/kanban/Trabalho/cartoes/trab-1', { coluna: 'Feito' })).status).toBe(403);
      const limited = await t.newKey(me.token, ['kanban:mover'], { grupos: ['Estudos'] });
      const res = await put(t, limited.segredo, '/ext/v1/kanban/Trabalho/cartoes/trab-1', { coluna: 'Feito' });
      expect(res.status).toBe(404);
      expect((await t.body(res)).erro).toBe('quadro-nao-encontrado');
    });

    it('mover um cartão: o pedido guarda a coluna pelo id, responde o cartão como vai ficar, e a leitura já mostra no lugar', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' }, NOTAS);
      const res = await put(t, secret, '/ext/v1/kanban/trabalho/cartoes/trab-1', { coluna: 'feito', posicao: 0, status: 'Entregue' });
      expect(res.status).toBe(202);
      const out = await t.body(res);
      expect(out.pedido).toEqual(expect.objectContaining({ op: 'cartao.mover', alvo: 'trab-1', estado: 'pendente' }));
      expect(out.cartao).toEqual(expect.objectContaining({ nota: 'trab-1', coluna: 'c-feito', posicao: 0, finalizada: true, status: 'Entregue', importancia: 'importante' }));
      expect(await stored(t, out.pedido.id)).toEqual({ quadro: QUADRO_TRABALHO.id, coluna: 'c-feito', posicao: 0, status: 'Entregue' });
      const q = await board(t, secret);
      expect(where(q)).toEqual(['A fazer: trab-3', 'Fazendo: trab-4', 'Feito: trab-1 trab-2']);
      expect(q.pedidos).toEqual([expect.objectContaining({ id: out.pedido.id, op: 'cartao.mover', alvo: 'trab-1', estado: 'pendente' })]);
      // o outro quadro não vê o pedido deste
      expect((await board(t, secret, 'Estudos')).pedidos).toBeUndefined();
    });

    it('pôr no quadro uma nota do grupo; a de outro grupo, a que não existe, a coluna que não existe e nada para mudar são recusadas', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' }, NOTAS);
      const ok = await put(t, secret, '/ext/v1/kanban/Trabalho/cartoes/trab-5', { importancia: 'medio' });
      expect(ok.status).toBe(202);
      expect((await t.body(ok)).cartao).toEqual(expect.objectContaining({ titulo: 'Orçamento', coluna: 'c-afazer', posicao: 2, importancia: 'medio', tags: ['cliente'] }));
      expect(where(await board(t, secret))[0]).toBe('A fazer: trab-1 trab-3 trab-5');
      const err = async (path: string, data: unknown) => {
        const res = await put(t, secret, path, data);
        return [res.status, (await t.body(res)).erro];
      };
      expect(await err('/ext/v1/kanban/Trabalho/cartoes/estu-2', { coluna: 'A fazer' })).toEqual([422, 'nota-de-outro-grupo']);
      expect(await err('/ext/v1/kanban/Trabalho/cartoes/solta', {})).toEqual([422, 'nota-de-outro-grupo']);
      expect(await err('/ext/v1/kanban/Trabalho/cartoes/nao-existe', {})).toEqual([404, 'nota-nao-encontrada']);
      expect(await err('/ext/v1/kanban/Trabalho/cartoes/trab-1', { coluna: 'Revisão' })).toEqual([422, 'coluna-desconhecida']);
      expect(await err('/ext/v1/kanban/Trabalho/cartoes/trab-1', { depende_de: ['trab-1'] })).toEqual([400, 'pedido-invalido']);
      expect(await err('/ext/v1/kanban/Trabalho/cartoes/trab-1', {})).toEqual([400, 'pedido-invalido']);
    });

    it('tirar do quadro: só o que está nele', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' }, NOTAS);
      expect((await t.ext(secret, '/ext/v1/kanban/Trabalho/cartoes/trab-5', { method: 'DELETE' })).status).toBe(404);
      const res = await t.ext(secret, '/ext/v1/kanban/Trabalho/cartoes/trab-3', { method: 'DELETE' });
      expect(res.status).toBe(202);
      expect((await t.body(res)).pedido.op).toBe('cartao.tirar');
      expect(where(await board(t, secret))[0]).toBe('A fazer: trab-1');
    });

    it('as colunas: criar (e já mover para ela), mudar, apagar; nome repetido, a última coluna e o destino que não existe são recusados', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' }, NOTAS);
      const made = await t.ext(secret, '/ext/v1/kanban/Trabalho/colunas', { method: 'POST', body: JSON.stringify({ nome: 'Revisão', depois_de: 'fazendo' }) });
      expect(made.status).toBe(202);
      const col = (await t.body(made)).coluna;
      expect(col).toEqual(expect.objectContaining({ nome: 'Revisão', finaliza: false, cartoes: 0 }));
      // a coluna que ainda vai entrar já serve para mover
      expect((await put(t, secret, '/ext/v1/kanban/Trabalho/cartoes/trab-4', { coluna: 'revisao' })).status).toBe(202);
      expect(where(await board(t, secret))).toEqual(['A fazer: trab-1 trab-3', 'Fazendo: ', 'Revisão: trab-4', 'Feito: trab-2']);
      const dup = await t.ext(secret, '/ext/v1/kanban/Trabalho/colunas', { method: 'POST', body: JSON.stringify({ nome: 'FEITO' }) });
      expect([dup.status, (await t.body(dup)).erro]).toEqual([409, 'coluna-existe']);
      const renamed = await t.ext(secret, `/ext/v1/kanban/Trabalho/colunas/${col.id}`, { method: 'PATCH', body: JSON.stringify({ nome: 'Fazendo' }) });
      expect(renamed.status).toBe(409);
      const moved = await t.ext(secret, '/ext/v1/kanban/Trabalho/colunas/Feito', { method: 'PATCH', body: JSON.stringify({ nome: 'Pronto', posicao: 0 }) });
      expect((await t.body(moved)).coluna).toEqual(expect.objectContaining({ id: 'c-feito', nome: 'Pronto' }));
      expect((await t.ext(secret, '/ext/v1/kanban/Trabalho/colunas/Fazendo?para=Lixo', { method: 'DELETE' })).status).toBe(422);
      const gone = await t.ext(secret, '/ext/v1/kanban/Trabalho/colunas/Fazendo?para=-', { method: 'DELETE' });
      expect(gone.status).toBe(202);
      expect(await stored(t, (await t.body(gone)).pedido.id)).toEqual({ quadro: QUADRO_TRABALHO.id, para: null });
      expect((await board(t, secret)).colunas.map((c) => c.nome)).toEqual(['Pronto', 'A fazer', 'Revisão']);
      expect((await t.ext(secret, '/ext/v1/kanban/Trabalho/colunas/Lixo', { method: 'PATCH', body: JSON.stringify({ nome: 'X' }) })).status).toBe(404);
      // o quadro dos Estudos tem duas: apagar uma deixa a outra, que não sai
      expect((await t.ext(secret, '/ext/v1/kanban/Estudos/colunas/Feito', { method: 'DELETE' })).status).toBe(202);
      const last = await t.ext(secret, '/ext/v1/kanban/Estudos/colunas/A fazer', { method: 'DELETE' });
      expect([last.status, (await t.body(last)).erro]).toEqual([422, 'ultima-coluna']);
    });

    it('com a aprovação "mudancas", criar coluna entra direto e mexer no cartão espera', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, {}, NOTAS);
      const made = await t.body(t.ext(secret, '/ext/v1/kanban/Trabalho/colunas', { method: 'POST', body: JSON.stringify({ nome: 'Revisão' }) }));
      expect(made.pedido.estado).toBe('pendente');
      expect((await t.body(put(t, secret, '/ext/v1/kanban/Trabalho/cartoes/trab-1', { coluna: 'Feito' }))).pedido.estado).toBe('aguardando-aprovacao');
    });

    it('a nota nova já nasce no quadro: pede kanban:mover e um grupo, confere a coluna e aparece no quadro', async () => {
      const t = await setup();
      const { me, secret } = await t.ready(ALL, { aprovacao: 'nunca' }, NOTAS);
      const create = (s: string, data: unknown) => t.ext(s, '/ext/v1/notas', { method: 'POST', body: JSON.stringify(data) });
      const noKanban = await t.newKey(me.token, ['notas:criar']);
      expect((await create(noKanban.segredo, { titulo: 'A', grupo: 'Trabalho', kanban: { coluna: 'Fazendo' } })).status).toBe(403);
      const noGroup = await create(secret, { titulo: 'A', kanban: { coluna: 'Fazendo' } });
      expect([noGroup.status, (await t.body(noGroup)).erro]).toEqual([422, 'kanban-sem-grupo']);
      const badCol = await create(secret, { titulo: 'A', grupo: 'Trabalho', kanban: { coluna: 'Revisão' } });
      expect([badCol.status, (await t.body(badCol)).erro]).toEqual([422, 'coluna-desconhecida']);
      const res = await create(secret, { titulo: 'Reunião com o time', grupo: 'trabalho', kanban: { coluna: 'fazendo', importancia: 'critico' } });
      expect(res.status).toBe(202);
      const out = await t.body(res);
      expect((await stored(t, out.pedido.id)).kanban).toEqual({ coluna: 'c-fazendo', importancia: 'critico' });
      const q = await board(t, secret);
      expect(where(q)[1]).toBe(`Fazendo: trab-4 ${out.nota.id}`);
      expect(q.cartoes.find((c) => c.nota === out.nota.id)).toEqual(expect.objectContaining({ titulo: 'Reunião com o time', importancia: 'critico', finalizada: false }));
      // e já dá para mexer nela (ela existe num pedido de criar)
      expect((await put(t, secret, `/ext/v1/kanban/Trabalho/cartoes/${out.nota.id}`, { coluna: 'Feito' })).status).toBe(202);
      expect(where(await board(t, secret))[2]).toBe(`Feito: trab-2 ${out.nota.id}`);
    });
  });

  describe(`${label}: o Kanban pelo MCP`, () => {
    const ALL = ['kanban:ler', 'kanban:mover', 'kanban:colunas', 'notas:ler', 'notas:criar'];
    let seq = 0;
    const rpc = async (t: Awaited<ReturnType<typeof setup>>, secret: string, method: string, params?: unknown) =>
      t.body(
        t.call('/mcp', {
          method: 'POST',
          headers: { Authorization: `Bearer ${secret}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({ jsonrpc: '2.0', id: ++seq, method, ...(params ? { params } : {}) }),
        }),
      );
    const tool = async (t: Awaited<ReturnType<typeof setup>>, secret: string, name: string, args: Record<string, unknown> = {}) =>
      (await rpc(t, secret, 'tools/call', { name, arguments: args })).result;

    it('cada permissão do Kanban mostra as ferramentas dela; o contexto vale para qualquer uma', async () => {
      const t = await setup();
      const { me } = await t.ready();
      const names = async (scopes: string[]) => (await rpc(t, (await t.newKey(me.token, scopes)).segredo, 'tools/list')).result.tools.map((x: { name: string }) => x.name);
      expect(await names(['kanban:ler'])).toEqual(['guia_do_murall', 'ver_contexto', 'ver_kanban', 'ver_pedidos']);
      expect(await names(['kanban:mover'])).toEqual(['guia_do_murall', 'ver_contexto', 'mover_cartao', 'tirar_do_quadro', 'ver_pedidos']);
      expect(await names(['kanban:colunas'])).toEqual(['guia_do_murall', 'ver_contexto', 'criar_coluna', 'editar_coluna', 'apagar_coluna', 'ver_pedidos']);
      const list = (await rpc(t, (await t.newKey(me.token, ['kanban:colunas'])).segredo, 'tools/list')).result.tools as { name: string; annotations: { destructiveHint: boolean } }[];
      expect(list.find((x) => x.name === 'apagar_coluna')!.annotations.destructiveHint).toBe(true);
    });

    it('ver_kanban sem grupo lista os quadros; com grupo, o quadro inteiro, marcado como dado', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const list = await tool(t, secret, 'ver_kanban');
      expect(list.structuredContent.quadros.map((q: { grupo: string }) => q.grupo)).toEqual(['Estudos', 'Trabalho']);
      const one = await tool(t, secret, 'ver_kanban', { grupo: 'Trabalho' });
      expect(one.structuredContent.quadro).toEqual(QUADRO_TRABALHO);
      expect(one.content[0].text).toContain('<conteudo_do_usuario>');
    });

    it('mover pelo PUT, apagar coluna com o destino na consulta, e criar a nota já numa coluna', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' }, [nota('trab-5', { grupo: 'Trabalho', titulo: 'Orçamento' })]);
      const moved = await tool(t, secret, 'mover_cartao', { grupo: 'Trabalho', nota: 'trab-5', coluna: 'Fazendo', importancia: 'critico', no_mural: null });
      expect(moved.isError).toBeUndefined();
      expect(moved.content[0].text).toContain('alvo trab-5');
      expect(moved.structuredContent.cartao).toEqual(expect.objectContaining({ coluna: 'c-fazendo', importancia: 'critico' }));
      const gone = await tool(t, secret, 'apagar_coluna', { grupo: 'Trabalho', coluna: 'Fazendo', para: '-' });
      expect(gone.structuredContent.pedido.op).toBe('coluna.apagar');
      const made = await tool(t, secret, 'criar_nota', { titulo: 'Reunião', grupo: 'Trabalho', kanban: { coluna: 'Feito' } });
      expect(made.isError).toBeUndefined();
      const q = (await tool(t, secret, 'ver_kanban', { grupo: 'Trabalho' })).structuredContent.quadro as QuadroV1;
      expect(q.colunas.map((c) => c.nome)).toEqual(['A fazer', 'Feito']);
      expect(q.cartoes.find((c) => c.nota === made.structuredContent.nota.id)).toEqual(expect.objectContaining({ coluna: 'c-feito', finalizada: true }));
      const bad = await tool(t, secret, 'mover_cartao', { grupo: 'Trabalho', nota: 'trab-1', coluna: 'Revisão' });
      expect(bad.isError).toBe(true);
      expect(bad.content[0].text).toContain('coluna-desconhecida');
    });
  });
}
