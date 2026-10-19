import { Hono } from 'hono';
import { AGENDA_SCOPE, CALENDAR_URL, GOOGLE_AUTH_URL, GOOGLE_REVOKE_URL, GOOGLE_TOKEN_URL, cleanEvent, isEventId, isInstanceId, open, plainCode, seal, trimEvent } from '../domain/agenda';
import { brakeStatement, usedToday } from '../domain/brake';
import { base64url, sha256 } from '../domain/bytes';
import { write } from '../domain/quota';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson, sessionOf } from './http';

/**
 * O Google Agenda ligado ao Calendário (a agenda principal da pessoa, nos dois sentidos). A API guarda a
 * permissão (o refresh token, cifrado) e conversa com o Google em nome da pessoa; quem decide o que muda
 * é o site: ele busca o que mudou no Google (`GET /v1/agenda/eventos`, com o sync token que ele guarda) e
 * manda o que mudou no Murall (`POST /v1/agenda/enviar`). Nenhum evento fica guardado aqui.
 *
 * Ligar: o site pede o endereço do Google (`POST /v1/agenda/conectar`), abre numa janela, o Google volta
 * para `google.html` do site com o código, e o site entrega o código aqui (`POST /v1/agenda/retorno`),
 * que troca pela permissão com o client secret (que nunca sai do Worker).
 */

/** Quantas vezes por dia uma conta pode começar a ligar o Google Agenda. */
export const MAX_CONNECTS_PER_DAY = 20;
/** O pedido de ligar vale por isto. */
const REQUEST_MS = 15 * 60_000;
/** Quantas páginas de eventos (de 250) cada busca traz antes de devolver a vez. */
const MAX_PAGES = 8;
/** Quantas mudanças vão ao Google de uma vez. */
export const MAX_OPS = 25;
const UPSTREAM_TIMEOUT_MS = 10_000;
const EVENT_FIELDS =
  'nextPageToken,nextSyncToken,items(id,status,summary,start,end,recurrence,recurringEventId,originalStartTime,colorId,updated,etag,htmlLink,eventType,organizer(self),attendees(self))';

/** O acesso de cada conta enquanto o Worker está de pé (vale ~1 hora): poupa um pedido ao Google por chamada. */
const accessCache = new Map<string, { token: string; until: number }>();

export function agendaRoutes(app: Hono, deps: Deps): void {
  const keys = deps.agenda?.keys ?? { clientSecret: '', key: '', codes: [] };
  const upstream = deps.agenda?.fetch ?? ((input: string, init?: RequestInit) => fetch(input, init));
  const configured = () => !!(keys.clientSecret && keys.key && deps.config.googleClientId);
  /** Configurado e, enquanto há a lista de contas (o app em teste no Google), a conta está nela. */
  const available = async (userId: string) => {
    if (!configured()) return false;
    if (keys.codes.includes('*')) return true;
    const row = await deps.db.first<{ codigo: string }>('SELECT codigo FROM usuarios WHERE id = ?', [userId]);
    return !!row && keys.codes.includes(plainCode(row.codigo));
  };
  const ensure = async (userId: string) => {
    if (!(await available(userId))) throw new HttpError(503, 'agenda-indisponivel', 'O Google Agenda ainda não está disponível.');
  };

  const google = async (url: string, init: RequestInit = {}): Promise<Response> => {
    try {
      return await upstream(url, { ...init, signal: AbortSignal.timeout(UPSTREAM_TIMEOUT_MS) });
    } catch {
      throw new HttpError(502, 'google-fora', 'O Google não respondeu. Tente de novo daqui a pouco.');
    }
  };

  /** O endereço de volta precisa ser o `google.html` de um endereço do site. */
  const backUrl = (v: unknown): string => {
    let url: URL;
    try {
      url = new URL(String(v ?? ''));
    } catch {
      throw new HttpError(400, 'retorno-invalido', 'Endereço de volta inválido.');
    }
    if (!deps.config.allowedOrigins.includes(url.origin) || !url.pathname.endsWith('/google.html') || url.search || url.hash) {
      throw new HttpError(400, 'retorno-invalido', 'Endereço de volta inválido.');
    }
    return url.href;
  };

  const desligada = () => new HttpError(409, 'agenda-desligada', 'O Google Agenda não está ligado. Ligue de novo no Calendário.');

  /** O acesso ao Google da conta (renovado com o refresh token guardado). */
  const access = async (userId: string): Promise<string> => {
    const cached = accessCache.get(userId);
    const now = deps.now().getTime();
    if (cached && cached.until > now) return cached.token;
    const row = await deps.db.first<{ refresh: string }>('SELECT refresh FROM agenda_google WHERE usuario_id = ?', [userId]);
    if (!row) throw desligada();
    let refresh: string;
    try {
      refresh = await open(keys.key, row.refresh);
    } catch {
      throw desligada();
    }
    const res = await google(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: deps.config.googleClientId, client_secret: keys.clientSecret, refresh_token: refresh, grant_type: 'refresh_token' }),
    });
    if (res.status === 400 || res.status === 401) {
      // a pessoa tirou a permissão no Google (ou ela venceu, no modo de teste): fica desligada
      await write(deps, [{ sql: 'DELETE FROM agenda_google WHERE usuario_id = ?', params: [userId] }], 2);
      throw desligada();
    }
    if (!res.ok) throw new HttpError(502, 'google-fora', 'O Google não respondeu. Tente de novo daqui a pouco.');
    const body = (await res.json()) as { access_token?: string; expires_in?: number };
    if (!body.access_token) throw new HttpError(502, 'google-fora', 'O Google não respondeu. Tente de novo daqui a pouco.');
    accessCache.set(userId, { token: body.access_token, until: now + Math.max(60, (body.expires_in ?? 3600) - 120) * 1000 });
    return body.access_token;
  };

  const calendar = async (userId: string, url: string, init: RequestInit = {}) => {
    const token = await access(userId);
    return google(url, { ...init, headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json', ...(init.headers ?? {}) } });
  };

  app.get('/v1/agenda', async (c) => {
    const s = await sessionOf(deps, c);
    const row = await deps.db.first<{ conectada_em: string }>('SELECT conectada_em FROM agenda_google WHERE usuario_id = ?', [s.userId]);
    return c.json({ disponivel: await available(s.userId), conectada: !!row, desde: row?.conectada_em ?? null });
  });

  app.post('/v1/agenda/conectar', async (c) => {
    const s = await sessionOf(deps, c);
    await ensure(s.userId);
    const body = await readJson(c);
    const retorno = backUrl(body['retorno']);
    const now = deps.now();
    if ((await usedToday(deps, s.userId, 'agenda', now)) >= MAX_CONNECTS_PER_DAY) {
      throw new HttpError(429, 'agenda-devagar', 'Muitas tentativas de ligar o Google Agenda hoje. Tente amanhã.');
    }
    const state = base64url(crypto.getRandomValues(new Uint8Array(32)));
    const hash = base64url(await sha256(state));
    await write(
      deps,
      [
        // um pedido por vez: o de antes (abandonado) sai
        { sql: 'DELETE FROM agenda_pedidos WHERE usuario_id = ?', params: [s.userId] },
        { sql: 'INSERT INTO agenda_pedidos (estado, usuario_id, retorno, criado_em) VALUES (?, ?, ?, ?)', params: [hash, s.userId, retorno, now.toISOString()] },
        brakeStatement(s.userId, 'agenda', now),
      ],
      6,
    );
    const url = new URL(GOOGLE_AUTH_URL);
    url.search = new URLSearchParams({
      client_id: deps.config.googleClientId,
      redirect_uri: retorno,
      response_type: 'code',
      scope: AGENDA_SCOPE,
      access_type: 'offline',
      // sempre a tela de permissão: é ela que garante o refresh token
      prompt: 'consent',
      include_granted_scopes: 'true',
      state,
    }).toString();
    return c.json({ url: url.href });
  });

  app.post('/v1/agenda/retorno', async (c) => {
    const s = await sessionOf(deps, c);
    await ensure(s.userId);
    const body = await readJson(c);
    const code = typeof body['codigo'] === 'string' ? body['codigo'] : '';
    const state = typeof body['estado'] === 'string' ? body['estado'] : '';
    if (!code || code.length > 2048 || !state || state.length > 200) throw new HttpError(400, 'retorno-invalido', 'A resposta do Google veio incompleta.');
    const hash = base64url(await sha256(state));
    const req = await deps.db.first<{ usuario_id: string; retorno: string; criado_em: string }>('SELECT usuario_id, retorno, criado_em FROM agenda_pedidos WHERE estado = ?', [hash]);
    const now = deps.now();
    if (!req || req.usuario_id !== s.userId || now.getTime() - Date.parse(req.criado_em) > REQUEST_MS) {
      throw new HttpError(400, 'retorno-vencido', 'O pedido para ligar o Google Agenda venceu. Tente de novo.');
    }
    const res = await google(GOOGLE_TOKEN_URL, {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ client_id: deps.config.googleClientId, client_secret: keys.clientSecret, code, redirect_uri: req.retorno, grant_type: 'authorization_code' }),
    });
    const token = (await res.json().catch(() => ({}))) as { refresh_token?: string; access_token?: string; expires_in?: number; scope?: string };
    if (!res.ok || !token.access_token) throw new HttpError(400, 'google-recusou', 'O Google não aceitou a permissão. Tente de novo.');
    if (!(token.scope ?? '').split(' ').includes(AGENDA_SCOPE)) {
      throw new HttpError(400, 'agenda-sem-permissao', 'A permissão para ver e mudar a sua agenda não foi dada. Tente de novo e marque a caixa da agenda.');
    }
    if (!token.refresh_token) throw new HttpError(400, 'google-recusou', 'O Google não deu a permissão duradoura. Tente de novo.');
    await write(
      deps,
      [
        { sql: 'DELETE FROM agenda_pedidos WHERE estado = ?', params: [hash] },
        { sql: 'INSERT OR REPLACE INTO agenda_google (usuario_id, refresh, conectada_em) VALUES (?, ?, ?)', params: [s.userId, await seal(keys.key, token.refresh_token), now.toISOString()] },
      ],
      4,
    );
    accessCache.set(s.userId, { token: token.access_token, until: now.getTime() + Math.max(60, (token.expires_in ?? 3600) - 120) * 1000 });
    return c.json({ conectada: true, desde: now.toISOString() });
  });

  app.delete('/v1/agenda', async (c) => {
    const s = await sessionOf(deps, c);
    const row = await deps.db.first<{ refresh: string }>('SELECT refresh FROM agenda_google WHERE usuario_id = ?', [s.userId]);
    if (row && keys.key) {
      // devolve a permissão ao Google (sem esperar: desligar aqui vale de qualquer jeito)
      try {
        const refresh = await open(keys.key, row.refresh);
        await google(`${GOOGLE_REVOKE_URL}?token=${encodeURIComponent(refresh)}`, { method: 'POST', headers: { 'Content-Type': 'application/x-www-form-urlencoded' } });
      } catch {
        /* o Google fora não impede desligar */
      }
    }
    await write(deps, [{ sql: 'DELETE FROM agenda_google WHERE usuario_id = ?', params: [s.userId] }, { sql: 'DELETE FROM agenda_pedidos WHERE usuario_id = ?', params: [s.userId] }], 4);
    accessCache.delete(s.userId);
    return c.json({ ok: true });
  });

  /**
   * O que mudou na agenda principal: com o `sync` que o site guardou, só o que mudou desde então (com os
   * apagados); sem ele, tudo. Até 8 páginas por vez: com mais, devolve `pagina` para o site pedir o resto.
   * O Google esqueceu o `sync` (410): o site recomeça do zero.
   */
  app.get('/v1/agenda/eventos', async (c) => {
    const s = await sessionOf(deps, c);
    await ensure(s.userId);
    const sync = c.req.query('sync') ?? '';
    let page = c.req.query('pagina') ?? '';
    if (sync.length > 2048 || page.length > 2048) throw new HttpError(400, 'parametro-grande', 'O pedido é grande demais.');
    const eventos: Record<string, unknown>[] = [];
    for (let i = 0; i < MAX_PAGES; i++) {
      const q = new URLSearchParams({ maxResults: '250', fields: EVENT_FIELDS });
      if (sync) q.set('syncToken', sync);
      else q.set('showDeleted', 'false');
      if (page) q.set('pageToken', page);
      const res = await calendar(s.userId, `${CALENDAR_URL}?${q}`);
      if (res.status === 410) throw new HttpError(410, 'agenda-refazer', 'A agenda precisa ser lida de novo do começo.');
      if (res.status === 401 || res.status === 403) throw new HttpError(502, 'google-recusou', 'O Google recusou o pedido à agenda.');
      if (!res.ok) throw new HttpError(502, 'google-fora', 'O Google não respondeu. Tente de novo daqui a pouco.');
      const body = (await res.json()) as { items?: Record<string, unknown>[]; nextPageToken?: string; nextSyncToken?: string };
      // as vezes de um evento que repete (tirada ou mudada só num dia) vêm com o id delas
      for (const item of body.items ?? []) if (isEventId(item['id']) || isInstanceId(item['id'])) eventos.push(trimEvent(item));
      if (body.nextPageToken) {
        page = body.nextPageToken;
        continue;
      }
      return c.json({ eventos, sync: body.nextSyncToken ?? null });
    }
    return c.json({ eventos, pagina: page, sync: null });
  });

  /**
   * O que mudou no Murall, até 25 por vez: criar (com o id que o site escolheu, que não repete entre
   * aparelhos), mudar e apagar; e, numa vez só de um evento que repete (o id da vez), apagar (tirar o
   * dia, como o "Só este evento" do Google) e voltar (o dia tirado volta). Cada uma tem a sua resposta;
   * uma que falha não impede as outras.
   */
  app.post('/v1/agenda/enviar', async (c) => {
    const s = await sessionOf(deps, c);
    await ensure(s.userId);
    const body = await readJson(c, 200_000);
    const ops = body['ops'];
    if (!Array.isArray(ops) || ops.length > MAX_OPS) throw new HttpError(400, 'ops-invalidas', 'Mudanças demais de uma vez.');
    const resultados: Record<string, unknown>[] = [];
    const done = async (id: string, res: Response) => {
      const ev = (await res.json().catch(() => ({}))) as Record<string, unknown>;
      resultados.push({ id, ok: true, etag: ev['etag'] ?? null, updated: ev['updated'] ?? null, htmlLink: ev['htmlLink'] ?? null });
    };
    const failed = (id: string, res: Response | null) =>
      resultados.push({ id, ok: false, erro: !res ? 'google-fora' : res.status === 429 || res.status === 403 ? 'limite' : res.status === 400 ? 'recusado' : 'google-fora' });
    for (const op of ops) {
      const o = (op ?? {}) as Record<string, unknown>;
      const id = o['id'];
      const acao = o['acao'];
      const ok = isEventId(id) ? ['criar', 'mudar', 'apagar'].includes(acao as string) : isInstanceId(id) && (acao === 'apagar' || acao === 'voltar');
      if (!ok || typeof id !== 'string') throw new HttpError(400, 'ops-invalidas', 'Uma das mudanças não é válida.');
      const url = `${CALENDAR_URL}/${id}`;
      let res: Response | null = null;
      try {
        if (acao === 'voltar') {
          res = await calendar(s.userId, url, { method: 'PATCH', body: JSON.stringify({ status: 'confirmed' }) });
          // a vez não existe mais (a repetição mudou): não há o que voltar
          if (res.ok || res.status === 404 || res.status === 410) resultados.push({ id, ok: true });
          else failed(id, res);
          continue;
        }
        if (acao === 'apagar') {
          res = await calendar(s.userId, url, { method: 'DELETE' });
          // já apagado lá: está feito
          if (res.ok || res.status === 404 || res.status === 410) resultados.push({ id, ok: true });
          else failed(id, res);
          continue;
        }
        const event = cleanEvent(o['evento']);
        if (acao === 'criar') {
          res = await calendar(s.userId, CALENDAR_URL, { method: 'POST', body: JSON.stringify({ ...event, id }) });
          // outro aparelho já criou (o id é o mesmo): vira mudança
          if (res.status === 409) res = await calendar(s.userId, url, { method: 'PATCH', body: JSON.stringify(event) });
        } else {
          res = await calendar(s.userId, url, { method: 'PATCH', body: JSON.stringify(event) });
          if (res.status === 404) res = await calendar(s.userId, CALENDAR_URL, { method: 'POST', body: JSON.stringify({ ...event, id }) });
        }
        if (res.ok) await done(id, res);
        else failed(id, res);
      } catch (err) {
        if (err instanceof HttpError && err.code !== 'google-fora') throw err;
        failed(id, res);
      }
    }
    return c.json({ resultados });
  });
}

/** Para o teste: esquece os acessos guardados (cada teste começa do zero). */
export function forgetAgendaAccess(): void {
  accessCache.clear();
}

