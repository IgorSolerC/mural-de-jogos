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

  describe(`${label}: ler o Calendário com a chave`, () => {
    it('pede calendario:ler (a que só escreve ou só apaga não lê)', async () => {
      const t = await setup();
      const { me } = await t.ready();
      for (const scopes of [['notas:ler'], ['calendario:escrever'], ['calendario:apagar']]) {
        const other = await t.newKey(me.token, scopes);
        for (const path of ['/ext/v1/agenda', '/ext/v1/lembretes', `/ext/v1/lembretes/${DENTISTA.id}`]) {
          const res = await t.ext(other.segredo, path);
          expect(res.status, `${scopes.join()} ${path}`).toBe(403);
          expect((await t.body(res)).erro).toBe('sem-permissao');
        }
      }
    });

    it('a agenda entre dois dias: as vezes que passam pelo intervalo, a de vários dias uma vez só', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const got = await t.body(t.ext(secret, '/ext/v1/agenda?de=2026-10-20&ate=2026-10-28'));
      expect(got.de).toBe('2026-10-20');
      expect(got.vezes.map((v: VezV1) => `${v.dia} ${v.titulo}`)).toEqual([
        '2026-10-21 Academia',
        '2026-10-22 Dentista',
        '2026-10-26 Academia',
        '2026-10-28 Academia',
      ]);
      // as férias começam em novembro e acabam em dezembro: aparecem uma vez, e também em quem pede só dezembro
      const end = await t.body(t.ext(secret, '/ext/v1/agenda?de=2026-11&ate=2026-12'));
      expect(end.de).toBe('2026-11-01');
      expect(end.ate).toBe('2026-12-31');
      expect(end.vezes.filter((v: VezV1) => v.lembrete === FERIAS.id)).toEqual([NOVEMBRO.vezes[2]]);
      const dec = await t.body(t.ext(secret, '/ext/v1/agenda?de=2026-12-01&ate=2026-12-01'));
      expect(dec.vezes.map((v: VezV1) => v.lembrete)).toEqual([FERIAS.id]);
    });

    it('sem de, a agenda começa hoje (no fuso da conta) e vai por um mês', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const got = await t.body(t.ext(secret, '/ext/v1/agenda'));
      const today = new Intl.DateTimeFormat('en-CA', { timeZone: 'America/Sao_Paulo' }).format(t.deps.now());
      expect(got.de).toBe(today);
      expect(Date.parse(got.ate) - Date.parse(got.de)).toBe(30 * 86_400_000);
    });

    it('fora da janela, o dia que não existe e o ate antes do de são recusados', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const out = await t.ext(secret, '/ext/v1/agenda?de=2026-01-01&ate=2026-01-31');
      expect(out.status).toBe(400);
      const err = await t.body(out);
      expect(err.erro).toBe('fora-da-janela');
      expect(err.mensagem).toContain('2026-07 a 2027-10');
      expect((await t.ext(secret, '/ext/v1/agenda?de=2026-10-32')).status).toBe(400);
      expect((await t.ext(secret, '/ext/v1/agenda?de=2026-10-20&ate=2026-10-01')).status).toBe(400);
    });

    it('sem espelho ainda, a agenda vem vazia com o aviso', async () => {
      const t = await setup();
      const me = await t.login('ana');
      const k = await t.newKey(me.token, ['calendario:ler']);
      const got = await t.body(t.ext(k.segredo, '/ext/v1/agenda'));
      expect(got.vezes).toEqual([]);
      expect(got.espelho.estado).toBe('vazio');
    });

    it('os lembretes como estão guardados: do dia mais novo para o mais antigo, com de, ate, q e páginas', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      const all = await t.body(t.ext(secret, '/ext/v1/lembretes'));
      expect(all.itens).toEqual([FERIAS, DENTISTA, ACADEMIA]);
      expect((await t.body(t.ext(secret, '/ext/v1/lembretes?de=2026-10-10&ate=2026-10'))).itens).toEqual([DENTISTA]);
      expect((await t.body(t.ext(secret, '/ext/v1/lembretes?q=FERIAS'))).itens).toEqual([FERIAS]);
      const page = await t.body(t.ext(secret, '/ext/v1/lembretes?limite=2'));
      expect(page.itens.map((l: LembreteV1) => l.id)).toEqual([FERIAS.id, DENTISTA.id]);
      expect((await t.body(t.ext(secret, `/ext/v1/lembretes?limite=2&depois=${page.depois}`))).itens).toEqual([ACADEMIA]);
      expect((await t.ext(secret, '/ext/v1/lembretes?de=amanha')).status).toBe(400);
    });

    it('um lembrete pelo id; o que não existe é 404', async () => {
      const t = await setup();
      const { secret } = await t.ready();
      expect((await t.body(t.ext(secret, `/ext/v1/lembretes/${ACADEMIA.id}`))).lembrete).toEqual(ACADEMIA);
      const res = await t.ext(secret, '/ext/v1/lembretes/lb-nenhum');
      expect(res.status).toBe(404);
      expect((await t.body(res)).erro).toBe('lembrete-nao-encontrado');
    });

    it('o contexto traz as cores e a janela para qualquer chave do Calendário, e nada para as outras', async () => {
      const t = await setup();
      const { me, secret } = await t.ready();
      const ctx = await t.body(t.ext(secret, '/ext/v1/contexto'));
      expect(ctx.calendario).toEqual({ cores: ['vermelho', 'laranja', 'amarelo', 'verde', 'azul', 'lilas', 'rosa', 'cinza', 'branco'], janela: { de: '2026-07', ate: '2027-10' }, lembretes: 3 });
      const writer = await t.newKey(me.token, ['calendario:apagar']);
      expect((await t.body(t.ext(writer.segredo, '/ext/v1/contexto'))).calendario.lembretes).toBe(3);
      const notes = await t.newKey(me.token, ['notas:ler']);
      expect((await t.body(t.ext(notes.segredo, '/ext/v1/contexto'))).calendario).toBeNull();
    });

    it('a busca acha os lembretes pelo título, com a repetição em palavras; sem areas, entra no que a chave lê', async () => {
      const t = await setup();
      const { me, secret } = await t.ready();
      const got = await t.body(t.ext(secret, '/ext/v1/busca?q=academia'));
      expect(got.itens).toEqual([{ tipo: 'lembrete', id: ACADEMIA.id, titulo: 'Academia', dia: '2026-10-05', repete: ACADEMIA.em_palavras }]);
      expect((await t.body(t.ext(secret, '/ext/v1/busca?q=dentista&areas=calendario'))).itens[0]).toEqual({ tipo: 'lembrete', id: DENTISTA.id, titulo: 'Dentista', dia: '2026-10-22', repete: null });
      const notes = await t.newKey(me.token, ['notas:ler']);
      expect((await t.ext(notes.segredo, '/ext/v1/busca?q=academia&areas=calendario')).status).toBe(403);
    });
  });

  describe(`${label}: escrever no Calendário com a chave`, () => {
    const ALL = ['calendario:ler', 'calendario:escrever', 'calendario:apagar'];
    const send = (t: Awaited<ReturnType<typeof setup>>, secret: string, method: string, path: string, payload?: unknown) =>
      t.ext(secret, path, { method, ...(payload !== undefined ? { body: JSON.stringify(payload) } : {}) });

    it('criar pede calendario:escrever; o lembrete aparece na lista, pelo id e nos pedidos abertos da agenda', async () => {
      const t = await setup();
      const { me, secret } = await t.ready(ALL, { aprovacao: 'nunca' });
      const reader = await t.newKey(me.token, ['calendario:ler', 'calendario:apagar']);
      expect((await send(t, reader.segredo, 'POST', '/ext/v1/lembretes', { titulo: 'X', dia: '2026-11-03' })).status).toBe(403);
      const res = await send(t, secret, 'POST', '/ext/v1/lembretes', { titulo: 'Reunião', dia: '2026-11-03', hora: '09:00', repete: { cada: 'semana', dias_da_semana: [2, 4] } });
      expect(res.status).toBe(202);
      const got = await t.body(res);
      expect(got.pedido).toEqual(expect.objectContaining({ op: 'lembrete.criar', estado: 'pendente' }));
      expect(got.lembrete).toEqual(
        expect.objectContaining({ id: got.pedido.alvo, titulo: 'Reunião', hora: '09:00', cor: null, em_palavras: null, repete: expect.objectContaining({ cada: 'semana', dias_da_semana: [2, 4] }) }),
      );
      const list = await t.body(t.ext(secret, '/ext/v1/lembretes'));
      expect(list.itens[0]).toEqual({ ...got.lembrete, pedidos: [{ id: got.pedido.id, op: 'lembrete.criar', estado: 'pendente' }] });
      expect(list.itens).toHaveLength(4);
      // com filtro, o que vai nascer não entra
      expect((await t.body(t.ext(secret, '/ext/v1/lembretes?q=dentista'))).itens).toEqual([DENTISTA]);
      expect((await t.body(t.ext(secret, `/ext/v1/lembretes/${got.pedido.alvo}`))).lembrete.titulo).toBe('Reunião');
      const agenda = await t.body(t.ext(secret, '/ext/v1/agenda?de=2026-11-01&ate=2026-11-07'));
      expect(agenda.pedidos_abertos).toEqual([{ id: got.pedido.id, op: 'lembrete.criar', alvo: got.pedido.alvo, estado: 'pendente', lembrete: got.lembrete }]);
    });

    it('a forma errada é 400; os campos que não combinam são 422 com o campo', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const bad = await send(t, secret, 'POST', '/ext/v1/lembretes', { titulo: 'X', dia: '2026-13-01' });
      expect(bad.status).toBe(400);
      expect((await t.body(bad)).mensagem).toContain('campo dia');
      const mixed = await send(t, secret, 'POST', '/ext/v1/lembretes', { titulo: 'X', dia: '2026-11-03', fim: '2026-11-01' });
      expect(mixed.status).toBe(422);
      const err = await t.body(mixed);
      expect(err.erro).toBe('lembrete-invalido');
      expect(err.mensagem).toContain('campo fim');
    });

    it('mudar pede a versão de agora (409 com o lembrete), responde como vai ficar e a leitura já mostra', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' });
      const old = await send(t, secret, 'PATCH', `/ext/v1/lembretes/${DENTISTA.id}`, { versao: '2026-01-01T00:00:00.000Z', hora: '15:00' });
      expect(old.status).toBe(409);
      expect((await t.body(old)).lembrete).toEqual(DENTISTA);
      expect((await send(t, secret, 'PATCH', '/ext/v1/lembretes/lb-nenhum', { versao: DENTISTA.versao, hora: '15:00' })).status).toBe(404);
      const res = await send(t, secret, 'PATCH', `/ext/v1/lembretes/${DENTISTA.id}`, { versao: DENTISTA.versao, dia: '2026-10-23', hora: '15:00', hora_fim: '16:00' });
      expect(res.status).toBe(202);
      const got = await t.body(res);
      expect(got.lembrete).toEqual(expect.objectContaining({ dia: '2026-10-23', hora: '15:00', hora_fim: '16:00', em_palavras: null, versao: got.pedido.criado_em }));
      const now = (await t.body(t.ext(secret, `/ext/v1/lembretes/${DENTISTA.id}`))).lembrete;
      expect(now).toEqual({ ...got.lembrete, pedidos: [{ id: got.pedido.id, op: 'lembrete.editar', estado: 'pendente' }] });
      // a próxima mudança vai sobre a versão nova
      expect((await send(t, secret, 'PATCH', `/ext/v1/lembretes/${DENTISTA.id}`, { versao: now.versao, cor: 'rosa' })).status).toBe(202);
      // a hora_fim antes da hora, no mesmo dia, não combina
      const mixed = await send(t, secret, 'PATCH', `/ext/v1/lembretes/${ACADEMIA.id}`, { versao: ACADEMIA.versao, hora_fim: '06:00' });
      expect(mixed.status).toBe(422);
    });

    it('o lembrete travado pelo Google muda a cor e as notas; o resto é 422', async () => {
      const t = await setup();
      const { me, secret, rev } = await t.ready(ALL);
      const niver = lembrete('lb-niver', { titulo: 'Aniversário da Bia', google: { link: null, travado: 'google' } });
      expect((await t.mirror(me.token, { rev, poe: [t.item('lembrete', niver.id, niver)] })).status).toBe(200);
      const res = await send(t, secret, 'PATCH', `/ext/v1/lembretes/${niver.id}`, { versao: niver.versao, titulo: 'Niver' });
      expect(res.status).toBe(422);
      const err = await t.body(res);
      expect(err.erro).toBe('lembrete-do-google');
      expect(err.mensagem).toContain('titulo');
      expect((await send(t, secret, 'PATCH', `/ext/v1/lembretes/${niver.id}`, { versao: niver.versao, cor: 'rosa', notas: ['r-presente'] })).status).toBe(202);
    });

    it('apagar pede calendario:apagar; só um dia, num lembrete que se repete e dentro dele; ou inteiro', async () => {
      const t = await setup();
      const { me, secret } = await t.ready(ALL, { aprovacao: 'nunca' });
      const writer = await t.newKey(me.token, ['calendario:ler', 'calendario:escrever']);
      expect((await send(t, writer.segredo, 'DELETE', `/ext/v1/lembretes/${DENTISTA.id}?versao=${DENTISTA.versao}`)).status).toBe(403);
      expect((await send(t, secret, 'DELETE', `/ext/v1/lembretes/${DENTISTA.id}`)).status).toBe(400);
      const once = await send(t, secret, 'DELETE', `/ext/v1/lembretes/${DENTISTA.id}?versao=${DENTISTA.versao}&dia=2026-10-22`);
      expect(once.status).toBe(422);
      expect((await t.body(once)).erro).toBe('nao-repete');
      const before = await send(t, secret, 'DELETE', `/ext/v1/lembretes/${ACADEMIA.id}?versao=${ACADEMIA.versao}&dia=2026-10-01`);
      expect((await t.body(before)).erro).toBe('dia-fora');
      const day = await t.body(send(t, secret, 'DELETE', `/ext/v1/lembretes/${ACADEMIA.id}?versao=${ACADEMIA.versao}&dia=2026-10-19`));
      expect(day.pedido.op).toBe('lembrete.apagar');
      expect(day.lembrete.pulados).toEqual(['2026-10-12', '2026-10-19']);
      const whole = await t.body(send(t, secret, 'DELETE', `/ext/v1/lembretes/${DENTISTA.id}?versao=${DENTISTA.versao}`));
      expect(whole.lembrete).toBeNull();
      // o de apagar inteiro fica na leitura, com o pedido na lista; a agenda diz os dois à parte
      expect((await t.body(t.ext(secret, `/ext/v1/lembretes/${DENTISTA.id}`))).lembrete.pedidos).toEqual([{ id: whole.pedido.id, op: 'lembrete.apagar', estado: 'pendente' }]);
      const agenda = await t.body(t.ext(secret, '/ext/v1/agenda?de=2026-10-01&ate=2026-10-31'));
      expect(agenda.pedidos_abertos.map((p: { op: string; dia?: string; lembrete: unknown }) => [p.op, p.dia ?? null, p.lembrete === null])).toEqual([
        ['lembrete.apagar', '2026-10-19', false],
        ['lembrete.apagar', null, true],
      ]);
    });

    it('com a aprovação "mudancas", criar entra direto e mudar ou apagar espera', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      expect((await t.body(send(t, secret, 'POST', '/ext/v1/lembretes', { titulo: 'X', dia: '2026-11-03' }))).pedido.estado).toBe('pendente');
      expect((await t.body(send(t, secret, 'PATCH', `/ext/v1/lembretes/${DENTISTA.id}`, { versao: DENTISTA.versao, cor: 'rosa' }))).pedido.estado).toBe('aguardando-aprovacao');
      expect((await t.body(send(t, secret, 'DELETE', `/ext/v1/lembretes/${FERIAS.id}?versao=${FERIAS.versao}`))).pedido.estado).toBe('aguardando-aprovacao');
    });

    it('o mesmo Idempotency-Key devolve o mesmo pedido', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL);
      const init = { method: 'POST', body: JSON.stringify({ titulo: 'Uma vez', dia: '2026-11-03' }), headers: { 'Idempotency-Key': 'lb-1' } };
      const a = await t.body(t.ext(secret, '/ext/v1/lembretes', init));
      const b = await t.body(t.ext(secret, '/ext/v1/lembretes', init));
      expect(b.pedido.id).toBe(a.pedido.id);
      expect(b.repetido).toBe(true);
    });
  });

  describe(`${label}: o Calendário pelo MCP`, () => {
    const ALL = ['calendario:ler', 'calendario:escrever', 'calendario:apagar'];
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

    it('cada permissão do Calendário mostra as ferramentas dela; o contexto vale para qualquer uma, a busca só para quem lê', async () => {
      const t = await setup();
      const { me } = await t.ready();
      const names = async (scopes: string[]) => (await rpc(t, (await t.newKey(me.token, scopes)).segredo, 'tools/list')).result.tools.map((x: { name: string }) => x.name);
      expect(await names(['calendario:ler'])).toEqual(['guia_do_murall', 'ver_contexto', 'buscar', 'ver_agenda', 'listar_lembretes', 'ler_lembrete', 'ver_pedidos']);
      expect(await names(['calendario:escrever'])).toEqual(['guia_do_murall', 'ver_contexto', 'criar_lembrete', 'editar_lembrete', 'ver_pedidos']);
      expect(await names(['calendario:apagar'])).toEqual(['guia_do_murall', 'ver_contexto', 'apagar_lembrete', 'ver_pedidos']);
      const list = (await rpc(t, (await t.newKey(me.token, ['calendario:apagar'])).segredo, 'tools/list')).result.tools as { name: string; annotations: { destructiveHint: boolean } }[];
      expect(list.find((x) => x.name === 'apagar_lembrete')!.annotations.destructiveHint).toBe(true);
    });

    it('ver_agenda e ler_lembrete, marcados como dado; criar com a repetição; tirar um dia com a versão e o dia na consulta', async () => {
      const t = await setup();
      const { secret } = await t.ready(ALL, { aprovacao: 'nunca' });
      const agenda = await tool(t, secret, 'ver_agenda', { de: '2026-10-20', ate: '2026-10-22' });
      expect(agenda.structuredContent.vezes.map((v: VezV1) => v.titulo)).toEqual(['Academia', 'Dentista']);
      expect(agenda.content[0].text).toContain('<conteudo_do_usuario>');
      expect((await tool(t, secret, 'ler_lembrete', { id: ACADEMIA.id })).structuredContent.lembrete).toEqual(ACADEMIA);
      const made = await tool(t, secret, 'criar_lembrete', { titulo: 'Aula de violão', dia: '2026-11-03', hora: '19:00', repete: { cada: 'semana', intervalo: 2 }, chave_idempotencia: 'violao-1' });
      expect(made.isError).toBeUndefined();
      expect(made.content[0].text).toContain(`alvo ${made.structuredContent.lembrete.id}`);
      expect(made.structuredContent.lembrete.repete).toEqual({ cada: 'semana', intervalo: 2, dias_da_semana: [], vez_no_mes: null, so_nos_meses_com_o_dia: false, ate: null, vezes: null });
      const day = await tool(t, secret, 'apagar_lembrete', { id: ACADEMIA.id, versao: ACADEMIA.versao, dia: '2026-10-26' });
      expect(day.isError).toBeUndefined();
      expect(day.structuredContent.lembrete.pulados).toEqual(['2026-10-12', '2026-10-26']);
      const locked = await tool(t, secret, 'editar_lembrete', { id: DENTISTA.id, versao: '2026-01-01T00:00:00.000Z', cor: 'rosa' });
      expect(locked.isError).toBe(true);
      expect(locked.content[0].text).toContain('versao-velha');
    });
  });
}
