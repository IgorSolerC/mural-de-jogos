import { SignJWT, createLocalJWKSet, exportJWK, generateKeyPair, type CryptoKey, type JWK } from 'jose';
import { DatabaseSync } from 'node:sqlite';
import { fileURLToPath } from 'node:url';
import { beforeAll, beforeEach, describe, expect, it } from 'vitest';
import { migrate, sqliteDb } from '../src/adapters/sqlite-node';
import { createApp } from '../src/app';
import { readConfig } from '../src/config';
import { AGENDA_SCOPE, CALENDAR_URL, GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, open, readAgendaKeys } from '../src/domain/agenda';
import { googleVerifier } from '../src/domain/google';
import { forgetAgendaAccess } from '../src/routes/agenda';
import { Deps } from '../src/ports';
import { BASE_ENV, NOW, TABLES, jsonCaller } from './harness';

/**
 * O Google Agenda do Calendário (migração 0013): ligar (o endereço do Google, o código trocado pela
 * permissão, guardada cifrada), buscar o que mudou na agenda, mandar o que mudou no Murall e desligar.
 * O Google é de mentira: cada pedido fica anotado e a resposta vem de `google`.
 */

const KEY = Buffer.alloc(32, 7).toString('base64');
const ENV = { ...BASE_ENV, ORIGENS: 'https://murall.igorsc.com.br,http://localhost:4200', GOOGLE_CLIENT_SECRET: 'segredo-do-cliente', AGENDA_CHAVE: KEY, AGENDA_CODIGOS: '*' };
const BACK = 'https://murall.igorsc.com.br/google.html';

interface Call {
  url: string;
  method: string;
  body: string;
  auth: string;
}

describe('o Google Agenda', () => {
  let key: CryptoKey;
  let jwk: JWK;
  const sqlite = new DatabaseSync(':memory:');
  migrate(sqlite, fileURLToPath(new URL('../migrations', import.meta.url)));
  const db = sqliteDb(sqlite);
  let calls: Call[];
  let google: (call: Call) => Response;
  let json: ReturnType<typeof jsonCaller>;

  const reply = (status: number, body: unknown = {}) => new Response(status === 204 ? null : JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });

  function build(env: Record<string, string> = ENV) {
    const config = readConfig(env);
    const deps: Deps = {
      db,
      config,
      now: () => NOW,
      verifyGoogle: googleVerifier(config.googleClientId, createLocalJWKSet({ keys: [jwk] })),
      agenda: {
        keys: readAgendaKeys(env),
        fetch: async (url, init) => {
          const call = { url, method: init?.method ?? 'GET', body: String(init?.body ?? ''), auth: String((init?.headers as Record<string, string> | undefined)?.['Authorization'] ?? '') };
          calls.push(call);
          return google(call);
        },
      },
    };
    const app = createApp(deps);
    json = jsonCaller((p, init) => app.request(`https://api.teste${p}`, init));
  }

  beforeAll(async () => {
    const pair = await generateKeyPair('RS256', { extractable: true });
    key = pair.privateKey;
    jwk = { ...(await exportJWK(pair.publicKey)), kid: 'agenda', alg: 'RS256' };
  });

  beforeEach(async () => {
    await db.batch(TABLES.map((t) => ({ sql: `DELETE FROM ${t}` })));
    forgetAgendaAccess();
    calls = [];
    google = () => reply(500);
    build();
  });

  async function login(sub = 'igor'): Promise<string> {
    const credential = await new SignJWT({ given_name: sub })
      .setProtectedHeader({ alg: 'RS256', kid: 'agenda' })
      .setSubject(sub)
      .setAudience(ENV.GOOGLE_CLIENT_ID)
      .setIssuer('https://accounts.google.com')
      .setIssuedAt(new Date())
      .setExpirationTime('1h')
      .sign(key);
    const b = (await (await json('POST', '/v1/auth/google', { credential })).json()) as { token: string };
    return b.token;
  }

  /** Liga o Google Agenda da conta, com o Google respondendo a troca do código. */
  async function connect(token: string): Promise<void> {
    const start = (await (await json('POST', '/v1/agenda/conectar', { retorno: BACK }, token)).json()) as { url: string };
    const state = new URL(start.url).searchParams.get('state')!;
    google = (c) => (c.url === GOOGLE_TOKEN_URL ? reply(200, { access_token: 'acesso-1', refresh_token: 'renova-1', expires_in: 3600, scope: `openid ${AGENDA_SCOPE}` }) : reply(500));
    const r = await json('POST', '/v1/agenda/retorno', { codigo: 'codigo-1', estado: state }, token);
    expect(r.status).toBe(200);
  }

  it('sem o client secret e a chave, fica indisponível', async () => {
    build({ ...ENV, GOOGLE_CLIENT_SECRET: '', AGENDA_CHAVE: '' });
    const token = await login();
    expect(await (await json('GET', '/v1/agenda', undefined, token)).json()).toEqual({ disponivel: false, conectada: false, desde: null });
    expect((await json('POST', '/v1/agenda/conectar', { retorno: BACK }, token)).status).toBe(503);
  });

  it('enquanto o app está em teste no Google, só as contas da lista veem o Google Agenda', async () => {
    build({ ...ENV, AGENDA_CODIGOS: '' });
    const token = await login();
    expect(((await (await json('GET', '/v1/agenda', undefined, token)).json()) as { disponivel: boolean }).disponivel).toBe(false);
    // o código como a pessoa vê (com o traço, como em Ajustes), e não como fica no banco
    const me = (await (await json('GET', '/v1/eu', undefined, token)).json()) as { codigo: string };
    expect(me.codigo).toMatch(/^[0-9A-Z]{4}-[0-9A-Z]{4}$/);
    build({ ...ENV, AGENDA_CODIGOS: `XXXX-XXXX, ${me.codigo.toLowerCase()}` });
    expect(((await (await json('GET', '/v1/agenda', undefined, token)).json()) as { disponivel: boolean }).disponivel).toBe(true);
    const other = await login('bia');
    expect((await json('POST', '/v1/agenda/conectar', { retorno: BACK }, other)).status).toBe(503);
  });

  it('ligar: o endereço do Google pede a agenda, offline, e só volta para o google.html do site', async () => {
    const token = await login();
    expect((await json('POST', '/v1/agenda/conectar', { retorno: 'https://outro.site/google.html' }, token)).status).toBe(400);
    expect((await json('POST', '/v1/agenda/conectar', { retorno: 'https://murall.igorsc.com.br/outra.html' }, token)).status).toBe(400);
    const r = (await (await json('POST', '/v1/agenda/conectar', { retorno: BACK }, token)).json()) as { url: string };
    const url = new URL(r.url);
    expect(url.origin + url.pathname).toBe('https://accounts.google.com/o/oauth2/v2/auth');
    expect(url.searchParams.get('client_id')).toBe(ENV.GOOGLE_CLIENT_ID);
    expect(url.searchParams.get('redirect_uri')).toBe(BACK);
    expect(url.searchParams.get('scope')).toBe(AGENDA_SCOPE);
    expect(url.searchParams.get('access_type')).toBe('offline');
    expect(url.searchParams.get('state')!.length).toBeGreaterThan(30);
    // sem login, nada
    expect((await json('POST', '/v1/agenda/conectar', { retorno: BACK })).status).toBe(401);
  });

  it('a volta: o código vira a permissão, guardada cifrada; um estado de outra conta ou repetido não serve', async () => {
    const token = await login();
    const other = await login('bia');
    const start = (await (await json('POST', '/v1/agenda/conectar', { retorno: BACK }, token)).json()) as { url: string };
    const state = new URL(start.url).searchParams.get('state')!;
    google = (c) => (c.url === GOOGLE_TOKEN_URL ? reply(200, { access_token: 'a', refresh_token: 'renova-secreto', expires_in: 3600, scope: AGENDA_SCOPE }) : reply(500));
    expect((await json('POST', '/v1/agenda/retorno', { codigo: 'c', estado: state }, other)).status).toBe(400);
    expect((await json('POST', '/v1/agenda/retorno', { codigo: 'c', estado: 'inventado' }, token)).status).toBe(400);
    const ok = await json('POST', '/v1/agenda/retorno', { codigo: 'c', estado: state }, token);
    expect(ok.status).toBe(200);
    const exchange = calls.find((c) => c.url === GOOGLE_TOKEN_URL)!;
    const form = new URLSearchParams(exchange.body);
    expect(form.get('client_secret')).toBe('segredo-do-cliente');
    expect(form.get('redirect_uri')).toBe(BACK);
    expect(form.get('grant_type')).toBe('authorization_code');
    const row = await db.first<{ refresh: string }>('SELECT refresh FROM agenda_google');
    expect(row!.refresh).not.toContain('renova-secreto');
    expect(await open(KEY, row!.refresh)).toBe('renova-secreto');
    expect(((await (await json('GET', '/v1/agenda', undefined, token)).json()) as { conectada: boolean }).conectada).toBe(true);
    // usado uma vez só
    expect((await json('POST', '/v1/agenda/retorno', { codigo: 'c', estado: state }, token)).status).toBe(400);
  });

  it('sem a caixa da agenda marcada na tela do Google, não liga', async () => {
    const token = await login();
    const start = (await (await json('POST', '/v1/agenda/conectar', { retorno: BACK }, token)).json()) as { url: string };
    google = () => reply(200, { access_token: 'a', refresh_token: 'r', scope: 'openid email' });
    const r = await json('POST', '/v1/agenda/retorno', { codigo: 'c', estado: new URL(start.url).searchParams.get('state') }, token);
    expect(r.status).toBe(400);
    expect(((await r.json()) as { erro: string }).erro).toBe('agenda-sem-permissao');
  });

  it('busca o que mudou na agenda principal, com o sync token, e devolve só o que o site usa', async () => {
    const token = await login();
    await connect(token);
    forgetAgendaAccess();
    calls = [];
    google = (c) => {
      if (c.url === GOOGLE_TOKEN_URL) return reply(200, { access_token: 'acesso-2', expires_in: 3600 });
      const u = new URL(c.url);
      if (u.searchParams.get('pageToken') === 'p2') return reply(200, { items: [{ id: 'evento2', status: 'cancelled' }], nextSyncToken: 'sync-novo' });
      return reply(200, {
        items: [
          { id: 'evento1', status: 'confirmed', summary: 'Dentista', start: { dateTime: '2026-10-20T15:00:00-03:00' }, end: { dateTime: '2026-10-20T16:00:00-03:00' }, organizer: { self: true }, location: 'Rua X', updated: '2026-10-06T10:00:00.000Z', etag: '"1"' },
          { id: 'INVALIDO!', status: 'confirmed' },
        ],
        nextPageToken: 'p2',
      });
    };
    const r = (await (await json('GET', '/v1/agenda/eventos?sync=sync-velho', undefined, token)).json()) as { eventos: Record<string, unknown>[]; sync: string };
    expect(r.sync).toBe('sync-novo');
    expect(r.eventos.map((e) => e['id'])).toEqual(['evento1', 'evento2']);
    expect(r.eventos[0]!).toEqual(jasmineLess({ id: 'evento1', summary: 'Dentista', tipo: 'default', seu: true, convidados: 0 }));
    expect(r.eventos[0]!['location']).toBeUndefined();
    const list = calls.filter((c) => c.url.startsWith(CALENDAR_URL));
    expect(new URL(list[0]!.url).searchParams.get('syncToken')).toBe('sync-velho');
    expect(list[0]!.auth).toBe('Bearer acesso-2');
    // o acesso renovado fica guardado: a segunda página não pede outro
    expect(calls.filter((c) => c.url === GOOGLE_TOKEN_URL).length).toBe(1);
  });

  it('o Google esqueceu o sync token: o site recomeça do zero', async () => {
    const token = await login();
    await connect(token);
    google = () => reply(410, { error: { code: 410 } });
    const r = await json('GET', '/v1/agenda/eventos?sync=velho', undefined, token);
    expect(r.status).toBe(410);
    expect(((await r.json()) as { erro: string }).erro).toBe('agenda-refazer');
  });

  it('manda as mudanças: criar (ou mudar, se outro aparelho criou), mudar e apagar, cada uma com a sua resposta', async () => {
    const token = await login();
    await connect(token);
    const evento = { summary: 'Bolo', start: { date: '2026-10-20' }, end: { date: '2026-10-21' }, recurrence: ['RRULE:FREQ=YEARLY'], colorId: '4', attendees: [{ email: 'x@y' }] };
    google = (c) => {
      if (c.method === 'POST' && c.url === CALENDAR_URL) return JSON.parse(c.body).id === 'mu0001' ? reply(409) : reply(200, { etag: '"n"', updated: 'u', htmlLink: 'l' });
      if (c.method === 'PATCH') return reply(200, { etag: '"p"', updated: 'u2' });
      if (c.method === 'DELETE') return reply(410);
      return reply(500);
    };
    const r = (await (
      await json('POST', '/v1/agenda/enviar', { ops: [{ acao: 'criar', id: 'mu0001', evento }, { acao: 'criar', id: 'mu0002', evento }, { acao: 'mudar', id: 'mu0003', evento }, { acao: 'apagar', id: 'mu0004' }] }, token)
    ).json()) as { resultados: Record<string, unknown>[] };
    expect(r.resultados).toEqual([
      { id: 'mu0001', ok: true, etag: '"p"', updated: 'u2', htmlLink: null },
      { id: 'mu0002', ok: true, etag: '"n"', updated: 'u', htmlLink: 'l' },
      { id: 'mu0003', ok: true, etag: '"p"', updated: 'u2', htmlLink: null },
      { id: 'mu0004', ok: true },
    ]);
    const created = calls.find((c) => c.method === 'POST' && c.url === CALENDAR_URL && c.body.includes('mu0002'))!;
    const body = JSON.parse(created.body);
    // os convidados não passam: o Murall só escreve o que é dele
    expect(body.attendees).toBeUndefined();
    expect(body).toEqual({ id: 'mu0002', summary: 'Bolo', start: { date: '2026-10-20' }, end: { date: '2026-10-21' }, status: 'confirmed', recurrence: ['RRULE:FREQ=YEARLY'], colorId: '4' });
    // um evento que não serve, ou um id inventado, recusa o pedido
    expect((await json('POST', '/v1/agenda/enviar', { ops: [{ acao: 'criar', id: 'mu0005', evento: { summary: 'x' } }] }, token)).status).toBe(400);
    expect((await json('POST', '/v1/agenda/enviar', { ops: [{ acao: 'apagar', id: 'X!' }] }, token)).status).toBe(400);
  });

  it('as vezes de um evento que repete: vêm na busca, e uma vez se tira (apagar) e volta (voltar)', async () => {
    const token = await login();
    await connect(token);
    google = (c) => {
      if (c.method === 'GET')
        return reply(200, {
          items: [
            { id: 'mu0001_20261027', status: 'cancelled', recurringEventId: 'mu0001', originalStartTime: { date: '2026-10-27' } },
            { id: 'abc123_20261028T120000Z', status: 'cancelled', recurringEventId: 'abc123', originalStartTime: { dateTime: '2026-10-28T09:00:00-03:00' } },
            { id: 'abc123_lixo', status: 'cancelled' },
          ],
          nextSyncToken: 's',
        });
      if (c.method === 'PATCH') return reply(200, { status: 'confirmed' });
      if (c.method === 'DELETE') return reply(204);
      return reply(500);
    };
    const list = (await (await json('GET', '/v1/agenda/eventos', undefined, token)).json()) as { eventos: Record<string, unknown>[] };
    expect(list.eventos.map((e) => e['id'])).toEqual(['mu0001_20261027', 'abc123_20261028T120000Z']);
    expect(list.eventos[0]!['recurringEventId']).toBe('mu0001');
    calls = [];
    const r = (await (
      await json('POST', '/v1/agenda/enviar', { ops: [{ acao: 'apagar', id: 'abc123_20261028T120000Z' }, { acao: 'voltar', id: 'mu0001_20261027' }] }, token)
    ).json()) as { resultados: Record<string, unknown>[] };
    expect(r.resultados).toEqual([
      { id: 'abc123_20261028T120000Z', ok: true },
      { id: 'mu0001_20261027', ok: true },
    ]);
    expect(calls.map((c) => [c.method, c.url.slice(CALENDAR_URL.length)])).toEqual([
      ['DELETE', '/abc123_20261028T120000Z'],
      ['PATCH', '/mu0001_20261027'],
    ]);
    expect(JSON.parse(calls[1]!.body)).toEqual({ status: 'confirmed' });
    // numa vez só não se cria nem se muda o evento; voltar é só de uma vez
    expect((await json('POST', '/v1/agenda/enviar', { ops: [{ acao: 'mudar', id: 'mu0001_20261027', evento: { summary: 'x' } }] }, token)).status).toBe(400);
    expect((await json('POST', '/v1/agenda/enviar', { ops: [{ acao: 'voltar', id: 'mu0001' }] }, token)).status).toBe(400);
  });

  it('a permissão tirada no Google: a agenda fica desligada; desligar devolve a permissão ao Google', async () => {
    const token = await login();
    await connect(token);
    forgetAgendaAccess();
    google = (c) => (c.url === GOOGLE_TOKEN_URL ? reply(400, { error: 'invalid_grant' }) : reply(500));
    const r = await json('GET', '/v1/agenda/eventos', undefined, token);
    expect(r.status).toBe(409);
    expect(await db.first('SELECT 1 AS x FROM agenda_google')).toBeNull();

    await connect(token);
    google = () => reply(200);
    expect((await json('DELETE', '/v1/agenda', undefined, token)).status).toBe(200);
    const revoke = calls.find((c) => c.url.startsWith(GOOGLE_REVOKE_URL))!;
    expect(new URL(revoke.url).searchParams.get('token')).toBe('renova-1');
    expect(await db.first('SELECT 1 AS x FROM agenda_google')).toBeNull();
  });

  it('apagar a conta leva a permissão guardada', async () => {
    const token = await login();
    await connect(token);
    expect((await json('DELETE', '/v1/eu', undefined, token)).status).toBe(200);
    expect(await db.first('SELECT 1 AS x FROM agenda_google')).toBeNull();
  });
});

/** O objeto tem pelo menos estes campos (o resto não importa aqui). */
function jasmineLess(partial: Record<string, unknown>) {
  return expect.objectContaining(partial);
}
