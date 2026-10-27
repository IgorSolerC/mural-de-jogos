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
}
