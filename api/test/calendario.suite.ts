import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { beforeAll, describe, expect, it } from 'vitest';
import type { AgendaDoMesV1, LembreteV1, VezV1 } from '../../contrato/api-v1/calendario';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { cleanup } from '../src/domain/cleanup';
import { googleVerifier } from '../src/domain/google';
import { Config, Db, Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, gzip, jsonCaller } from './harness';

/**
 * O Calendário na API das AIs (PLANO-API.md, rodada 7): o espelho dos lembretes e da agenda de cada mês
 * que o site enche, a leitura com a chave e os pedidos de criar, mudar e apagar lembretes. Roda nos dois
 * bancos.
 */

const ENV = { ...BASE_ENV, COTA_LINHAS_DIA: '100000', API_CODIGOS: '*' };

/** Um lembrete v1 com o que importa no teste; o resto, o de sempre. */
export function lembrete(id: string, extra: Partial<LembreteV1> = {}): LembreteV1 {
  return {
    id,
    titulo: `Lembrete ${id}`,
    dia: '2026-10-20',
    hora: null,
    fim: null,
    hora_fim: null,
    repete: null,
    em_palavras: 'Só em 20 de outubro de 2026.',
    pulados: [],
    cor: 'amarelo',
    silencioso: false,
    notas: [],
    google: null,
    criado_em: '2026-10-01T10:00:00.000Z',
    versao: '2026-10-01T10:00:00.000Z',
    ...extra,
  };
}

export const DENTISTA = lembrete('lb-dentista', { titulo: 'Dentista', dia: '2026-10-22', hora: '14:30', hora_fim: '15:30', cor: 'azul', em_palavras: 'Só em 22 de outubro de 2026.' });
export const ACADEMIA = lembrete('lb-academia', {
  titulo: 'Academia',
  dia: '2026-10-05',
  hora: '07:00',
  repete: { cada: 'semana', intervalo: 1, dias_da_semana: [1, 3], vez_no_mes: null, so_nos_meses_com_o_dia: false, ate: null, vezes: null },
  em_palavras: 'Toda semana, na segunda e quarta, a partir de 5 de outubro de 2026.',
  pulados: ['2026-10-12'],
  cor: 'verde',
});
export const FERIAS = lembrete('lb-ferias', { titulo: 'Férias na praia', dia: '2026-11-28', fim: '2026-12-03', cor: 'laranja', em_palavras: 'De 28 de nov. a 3 de dez. de 2026.' });

const vez = (l: LembreteV1, dia: string, extra: Partial<VezV1> = {}): VezV1 => ({
  lembrete: l.id,
  titulo: l.titulo,
  dia,
  fim: null,
  hora: l.hora,
  hora_fim: l.hora_fim,
  cor: l.cor!,
  silencioso: l.silencioso,
  repete: !!l.repete,
  notas: l.notas,
  ...extra,
});

/** A agenda de outubro, novembro e dezembro de 2026 (o resto da janela, vazio). */
export const OUTUBRO: AgendaDoMesV1 = {
  mes: '2026-10',
  vezes: [
    vez(ACADEMIA, '2026-10-05'),
    vez(ACADEMIA, '2026-10-07'),
    vez(ACADEMIA, '2026-10-14'),
    vez(ACADEMIA, '2026-10-19'),
    vez(ACADEMIA, '2026-10-21'),
    vez(DENTISTA, '2026-10-22'),
    vez(ACADEMIA, '2026-10-26'),
    vez(ACADEMIA, '2026-10-28'),
  ],
};
export const NOVEMBRO: AgendaDoMesV1 = {
  mes: '2026-11',
  vezes: [vez(ACADEMIA, '2026-11-02'), vez(ACADEMIA, '2026-11-04'), vez(FERIAS, '2026-11-28', { fim: '2026-12-03' })],
};
export const DEZEMBRO: AgendaDoMesV1 = { mes: '2026-12', vezes: [vez(FERIAS, '2026-11-28', { fim: '2026-12-03' }), vez(ACADEMIA, '2026-12-02')] };

export function calendarioSuite(label: string, getDb: () => Db) {
  let key: CryptoKey;
  let jwk: JWK;

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'calendario', alg: 'RS256' };
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
        .setProtectedHeader({ alg: 'RS256', kid: 'calendario' })
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
    const newKey = async (token: string, escopos = ['calendario:ler'], extra: Record<string, unknown> = {}) =>
      (await body(json('POST', '/v1/eu/chaves', { nome: 'AI da agenda', escopos, validade: 30, ...extra }, token))) as { segredo: string; chave: { id: string } };
    const mirror = (token: string, payload: unknown) => json('POST', '/v1/eu/espelho', payload, token);
    const item = (tipo: string, id: string, dados: unknown) => ({ tipo, id, hash: 'ab'.repeat(8), dados });
    const agenda = (a: AgendaDoMesV1) => item('agenda', `agenda-${a.mes}`, a);
    /** Os três lembretes e a janela da agenda de julho de 2026 a outubro de 2027 (NOW é 2026-10). */
    const itens = () => {
      const months: string[] = [];
      for (let i = -3; i <= 12; i++) {
        const d = new Date(Date.UTC(2026, 9 + i, 1));
        months.push(`${d.getUTCFullYear()}-${String(d.getUTCMonth() + 1).padStart(2, '0')}`);
      }
      const full = new Map([OUTUBRO, NOVEMBRO, DEZEMBRO].map((a) => [a.mes, a]));
      return [DENTISTA, ACADEMIA, FERIAS].map((l) => item('lembrete', l.id, l)).concat(months.map((m) => agenda(full.get(m) ?? { mes: m, vezes: [] })));
    };
    const ext = (secret: string, path: string, init: RequestInit = {}) =>
      call(path, { ...init, headers: { Authorization: `Bearer ${secret}`, ...(init.body ? { 'Content-Type': 'application/json' } : {}), ...(init.headers ?? {}) } });
    /** Uma conta com mural, uma chave com as permissões dadas e o espelho cheio. */
    const ready = async (escopos = ['calendario:ler'], keyExtra: Record<string, unknown> = {}) => {
      const me = await login('ana');
      const k = await newKey(me.token, escopos, keyExtra);
      const rev = await push(me.token, 0);
      const res = await mirror(me.token, { rev, fuso: 'America/Sao_Paulo', poe: itens() });
      expect(res.status).toBe(200);
      return { me, secret: k.segredo, keyId: k.chave.id, rev };
    };
    return { db, deps, call, json, body, login, push, newKey, mirror, item, agenda, itens, ext, ready, advance };
  }

  describe(`${label}: o espelho do Calendário`, () => {
    it('qualquer permissão do Calendário faz a nuvem pedir a área calendario; o lembrete guarda o dia e o título sem acento', async () => {
      const t = await setup();
      for (const scope of ['calendario:ler', 'calendario:escrever', 'calendario:apagar']) {
        await t.db.batch(TABLES.map((x) => ({ sql: `DELETE FROM ${x}` })));
        const me = await t.login('ana');
        await t.newKey(me.token, [scope]);
        const got = await t.body(t.call('/v1/eu/espelho', { headers: { Authorization: `Bearer ${me.token}` } }));
        expect(got.areas, scope).toEqual(['calendario']);
      }
      const me = await t.login('ana');
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: t.itens() })).status).toBe(200);
      const got = await t.body(t.call('/v1/eu/espelho', { headers: { Authorization: `Bearer ${me.token}` } }));
      expect(Object.keys(got.hashes.lembrete).sort()).toEqual(['lb-academia', 'lb-dentista', 'lb-ferias']);
      expect(Object.keys(got.hashes.agenda)).toHaveLength(16);
      const row = await t.db.first<{ data: string; busca: string; versao: string }>("SELECT data, busca, versao FROM api_espelho WHERE tipo = 'lembrete' AND id = ?", [FERIAS.id]);
      expect(row).toEqual({ data: '2026-11-28', busca: 'ferias na praia', versao: FERIAS.versao });
      const month = await t.db.first<{ data: string }>("SELECT data FROM api_espelho WHERE tipo = 'agenda' AND id = ?", ['agenda-2026-11']);
      expect(month?.data).toBe('2026-11');
    });

    it('só a forma da v1 entra: um campo a mais some, e o que não serve é recusado', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['calendario:ler']);
      const rev = await t.push(me.token, 0);
      const extra = { ...ACADEMIA, google: null, segredo: 'não devia ir', repete: { ...ACADEMIA.repete, semanaComeca: 0 } };
      const month = { ...OUTUBRO, vezes: [{ ...OUTUBRO.vezes[0], passou: true }] };
      expect((await t.mirror(me.token, { rev, poe: [t.item('lembrete', ACADEMIA.id, extra), t.item('agenda', 'agenda-2026-10', month)] })).status).toBe(200);
      const saved = async (id: string) => JSON.parse((await t.db.first<{ dados: string }>('SELECT dados FROM api_espelho WHERE id = ?', [id]))!.dados);
      expect(await saved(ACADEMIA.id)).toEqual(ACADEMIA);
      expect(await saved('agenda-2026-10')).toEqual({ ...OUTUBRO, vezes: [OUTUBRO.vezes[0]] });
      const bad = async (tipo: string, id: string, dados: unknown) => {
        const res = await t.mirror(me.token, { rev, poe: [t.item(tipo, id, dados)] });
        expect(res.status, JSON.stringify(dados).slice(0, 120)).toBe(400);
        return (await t.body(res)).erro;
      };
      // o 31 de novembro, a hora 24:00, a cor que não existe, a repetição sem o cada, o id que não bate
      expect(await bad('lembrete', DENTISTA.id, { ...DENTISTA, dia: '2026-11-31' })).toBe('espelho-invalido');
      expect(await bad('lembrete', DENTISTA.id, { ...DENTISTA, hora: '24:00' })).toBe('espelho-invalido');
      expect(await bad('lembrete', DENTISTA.id, { ...DENTISTA, cor: 'preto' })).toBe('espelho-invalido');
      expect(await bad('lembrete', DENTISTA.id, { ...DENTISTA, repete: { intervalo: 1 } })).toBe('espelho-invalido');
      expect(await bad('lembrete', 'lb-outro', DENTISTA)).toBe('espelho-invalido');
      // a agenda de um mês com outro id, a vez que acaba antes de começar
      expect(await bad('agenda', 'agenda-2026-11', OUTUBRO)).toBe('espelho-invalido');
      expect(await bad('agenda', 'agenda-2026-10', { ...OUTUBRO, vezes: [{ ...OUTUBRO.vezes[0], fim: '2026-10-01' }] })).toBe('espelho-invalido');
    });

    it('a chave que só lê as Anotações não deixa os lembretes entrarem', async () => {
      const t = await setup();
      const me = await t.login('ana');
      await t.newKey(me.token, ['notas:ler']);
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: [t.item('lembrete', DENTISTA.id, DENTISTA)] })).status).toBe(400);
    });

    it('a limpeza tira o Calendário de quem não tem mais nenhuma chave dele', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const reader = await t.newKey(me.token, ['calendario:ler']);
      const writer = await t.newKey(me.token, ['calendario:apagar']);
      const rev = await t.push(me.token, 0);
      expect((await t.mirror(me.token, { rev, poe: t.itens() })).status).toBe(200);
      const count = async () => (await t.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM api_espelho WHERE usuario_id = ? AND tipo IN ('lembrete', 'agenda')", [me.id]))!.n;
      await t.json('DELETE', `/v1/eu/chaves/${reader.chave.id}`, undefined, me.token);
      await cleanup(t.deps);
      // a que só apaga ainda precisa do lembrete de agora
      expect(await count()).toBe(19);
      await t.json('DELETE', `/v1/eu/chaves/${writer.chave.id}`, undefined, me.token);
      await cleanup(t.deps);
      expect(await count()).toBe(0);
      expect(await t.db.first('SELECT 1 AS x FROM api_espelho_estado WHERE usuario_id = ?', [me.id])).toBeNull();
    });
  });
}
