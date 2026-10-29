import { Context, Hono } from 'hono';
import { CORES, ehDia, type AgendaDoMesV1, type LembreteV1, type VezV1 } from '../../../contrato/api-v1/calendario';
import { dobra } from '../../../contrato/api-v1/escopos';
import { MES_RE } from '../../../contrato/api-v1/gastos';
import {
  OPS_DO_CALENDARIO,
  conferirOpLembrete,
  editarLembreteV1,
  lembreteDoPedido,
  tirarDiaV1,
  type ApagarLembreteV1,
  type CriarLembreteV1,
  type EditarLembreteV1,
  type OpLembrete,
} from '../../../contrato/api-v1/operacoes-calendario';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { todayIn } from '../domain/mirror';
import { openRequests, stateOf, type RequestRow } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps, SqlValue } from '../ports';
import { OFFSET_MAX, intQuery, mirrorState } from './routes';

/**
 * Ler o Calendário com a chave (PLANO-API.md, 7.4; rodada 7): a agenda entre dois dias (as vezes de
 * cada lembrete, com as repetições já abertas pelo app, da agenda de cada mês que o site mandou), os
 * lembretes como estão guardados e um lembrete pelo id. Tudo do espelho; a API não abre repetição
 * nenhuma. Os pedidos abertos vêm por cima (8.5): o lembrete criado aparece, o mudado aparece mudado; a
 * agenda, que é a do Murall agora, traz o que ainda não entrou à parte, em `pedidos_abertos`.
 */

/** As permissões do Calendário: qualquer uma deixa ver o contexto dele (as cores, a janela). */
export const CALENDAR_SCOPES = ['calendario:ler', 'calendario:escrever', 'calendario:apagar'] as const;

const LIST_MAX = 200;
const PAGE_MAX_CHARS = 256_000;
/** A agenda pedida sem `ate`: um mês a partir de `de`. */
const AGENDA_DAYS = 31;

const notFound = () => new HttpError(404, 'lembrete-nao-encontrado', 'Não achei esse lembrete.');

/** O mês seguinte (`AAAA-MM`). */
function nextMonth(month: string): string {
  const [y, m] = month.split('-').map(Number) as [number, number];
  return m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`;
}

/** O dia `n` dias depois. */
function addDays(day: string, n: number): string {
  const d = new Date(Date.UTC(+day.slice(0, 4), +day.slice(5, 7) - 1, +day.slice(8) + n));
  return d.toISOString().slice(0, 10);
}

/** A janela da agenda que o site mandou (o primeiro e o último mês), ou null. */
export async function agendaWindow(deps: Deps, userId: string): Promise<{ de: string; ate: string } | null> {
  const row = await deps.db.first<{ de: string | null; ate: string | null }>("SELECT MIN(data) AS de, MAX(data) AS ate FROM api_espelho WHERE usuario_id = ? AND tipo = 'agenda'", [userId]);
  return row?.de && row.ate ? { de: row.de, ate: row.ate } : null;
}

/** O vocabulário do Calendário: as cores, a janela da agenda e quantos lembretes há. */
export async function calendarContext(deps: Deps, me: KeyCaller) {
  const [janela, count] = await Promise.all([
    agendaWindow(deps, me.key.userId),
    deps.db.first<{ n: number }>("SELECT COUNT(*) AS n FROM api_espelho WHERE usuario_id = ? AND tipo = 'lembrete'", [me.key.userId]),
  ]);
  return { cores: CORES, janela, lembretes: count?.n ?? 0 };
}

/** Um pedido aberto, como a AI vê por cima do lembrete. */
interface PedidoNoLembrete {
  id: string;
  op: OpLembrete;
  estado: ReturnType<typeof stateOf>;
}
export type LembreteComPedidos = LembreteV1 & { pedidos?: PedidoNoLembrete[] };

/** Os pedidos abertos do Calendário: os lembretes que vão nascer e, por lembrete, as mudanças. */
async function pendingCalendar(deps: Deps, userId: string) {
  const rows = (await openRequests(deps, userId)).filter((r) => (OPS_DO_CALENDARIO as readonly string[]).includes(r.op));
  const created = rows.filter((r) => r.op === 'lembrete.criar');
  const byReminder = new Map<string, RequestRow[]>();
  for (const r of rows) if (r.op !== 'lembrete.criar') byReminder.set(r.alvo, [...(byReminder.get(r.alvo) ?? []), r]);
  return { rows, created, byReminder };
}

const marker = (r: RequestRow, now: Date): PedidoNoLembrete => ({ id: r.id, op: r.op as OpLembrete, estado: stateOf(r, now) });

/** O lembrete com as mudanças abertas por cima (o de apagar inteiro fica, com o pedido na lista). */
function overlayReminder(l: LembreteV1, rows: readonly RequestRow[] | undefined, now: Date): LembreteComPedidos {
  if (!rows?.length) return l;
  let out = l;
  for (const r of rows) {
    const c = conferirOpLembrete(r.op as OpLembrete, JSON.parse(r.dados));
    if (!c.ok) continue;
    if (r.op === 'lembrete.editar') out = editarLembreteV1(out, c.dados as EditarLembreteV1, r.criado_em);
    else if ((c.dados as ApagarLembreteV1).dia) out = tirarDiaV1(out, (c.dados as ApagarLembreteV1).dia!, r.criado_em);
  }
  return { ...out, pedidos: rows.map((r) => marker(r, now)) };
}

/** O lembrete de um pedido de criar ainda não aplicado, com as mudanças de depois por cima. */
function createdReminder(row: RequestRow, later: readonly RequestRow[] | undefined, now: Date): LembreteComPedidos {
  const shown = overlayReminder(lembreteDoPedido(row.alvo, JSON.parse(row.dados) as CriarLembreteV1, row.criado_em), later, now);
  return { ...shown, pedidos: [marker(row, now), ...(shown.pedidos ?? [])] };
}

/** O lembrete de agora: o do espelho, ou o de um pedido de criar ainda não aplicado; com os pedidos por cima. */
export async function currentReminder(deps: Deps, userId: string, id: string): Promise<LembreteComPedidos | null> {
  if (!/^[\w-]{1,64}$/.test(id)) return null;
  const [row, pending] = await Promise.all([
    deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'lembrete' AND id = ?", [userId, id]),
    pendingCalendar(deps, userId),
  ]);
  const now = deps.now();
  if (row) return overlayReminder(JSON.parse(row.dados) as LembreteV1, pending.byReminder.get(id), now);
  const created = pending.created.find((r) => r.alvo === id);
  return created ? createdReminder(created, pending.byReminder.get(id), now) : null;
}

/** Um dia ou um mês da consulta: o mês vira o primeiro dia (em `de`) ou o último (em `ate`). */
function dayQuery(v: string, k: 'de' | 'ate'): string {
  if (ehDia(v)) return v;
  if (MES_RE.test(v)) return k === 'de' ? `${v}-01` : addDays(`${nextMonth(v)}-01`, -1);
  throw new HttpError(400, 'filtro-invalido', `${k} é um dia (AAAA-MM-DD) ou um mês (AAAA-MM).`);
}

export function calendarReadRoutes(app: Hono, deps: Deps): void {
  const caller = async (c: Context) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, 'calendario:ler');
    return me;
  };

  // As vezes dos lembretes entre dois dias (com as repetições abertas), na ordem da folhinha.
  app.get('/ext/v1/agenda', async (c) => {
    const me = await caller(c);
    const espelho = await mirrorState(deps, me.key.userId);
    const q = (k: string) => c.req.query(k)?.trim() || undefined;
    const from = q('de') !== undefined ? dayQuery(q('de')!, 'de') : todayIn(espelho.fuso, deps.now());
    const to = q('ate') !== undefined ? dayQuery(q('ate')!, 'ate') : addDays(from, AGENDA_DAYS - 1);
    if (to < from) throw new HttpError(400, 'filtro-invalido', 'ate vem depois de de.');
    const janela = await agendaWindow(deps, me.key.userId);
    const pending = await pendingCalendar(deps, me.key.userId);
    const now = deps.now();
    // a agenda é a do Murall agora: o que ainda não entrou vem à parte, com o lembrete como vai ficar
    const open = pending.rows.length
      ? {
          pedidos_abertos: await Promise.all(
            pending.rows.map(async (r) => {
              const d = JSON.parse(r.dados) as { dia?: string };
              const whole = r.op === 'lembrete.apagar' && !d.dia;
              const shown = whole ? null : await currentReminder(deps, me.key.userId, r.alvo);
              let lembrete: LembreteV1 | null = null;
              if (shown) {
                const { pedidos: _p, ...rest } = shown;
                lembrete = rest;
              }
              return { ...marker(r, now), alvo: r.alvo, lembrete, ...(r.op === 'lembrete.apagar' && d.dia ? { dia: d.dia } : {}) };
            }),
          ),
        }
      : {};
    if (!janela) return c.json({ de: from, ate: to, vezes: [], ...open, espelho });
    if (from.slice(0, 7) < janela.de || to.slice(0, 7) > janela.ate) {
      throw new HttpError(
        400,
        'fora-da-janela',
        `A agenda vai de ${janela.de} a ${janela.ate} (3 meses antes do atual a 12 depois). Para outro tempo, liste os lembretes (cada um diz como se repete).`,
      );
    }
    const rows = await deps.db.all<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'agenda' AND data >= ? AND data <= ? ORDER BY data", [
      me.key.userId,
      from.slice(0, 7),
      to.slice(0, 7),
    ]);
    // a vez de vários dias que passa de um mês para o outro está nos dois: uma vez só
    const seen = new Set<string>();
    const vezes: VezV1[] = [];
    for (const row of rows) {
      for (const v of (JSON.parse(row.dados) as AgendaDoMesV1).vezes) {
        const k = `${v.lembrete} ${v.dia}`;
        if (seen.has(k) || v.dia > to || (v.fim ?? v.dia) < from) continue;
        seen.add(k);
        vezes.push(v);
      }
    }
    return c.json({ de: from, ate: to, vezes, ...open, espelho });
  });

  // Os lembretes como estão guardados, do primeiro dia mais novo para o mais antigo.
  app.get('/ext/v1/lembretes', async (c) => {
    const me = await caller(c);
    const q = (k: string) => c.req.query(k)?.trim() || undefined;
    const limit = intQuery(q('limite'), 50, 1, LIST_MAX);
    const offset = intQuery(q('depois'), 0, 0, OFFSET_MAX);
    const where: string[] = ['usuario_id = ?', "tipo = 'lembrete'"];
    const params: SqlValue[] = [me.key.userId];
    for (const k of ['de', 'ate'] as const) {
      const v = q(k);
      if (v === undefined) continue;
      where.push(k === 'de' ? 'data >= ?' : 'data <= ?');
      params.push(dayQuery(v, k));
    }
    const text = q('q');
    // com filtro, os lembretes que ainda vão nascer não aparecem (a prévia não passa por eles)
    const filtered = [q('de'), q('ate'), text].some((v) => v !== undefined);
    if (text) {
      where.push("busca LIKE ? ESCAPE '\\'");
      params.push(`%${dobra(text).replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    }
    const rows = await deps.db.all<{ dados: string }>(`SELECT dados FROM api_espelho WHERE ${where.join(' AND ')} ORDER BY data DESC, id LIMIT ? OFFSET ?`, [
      ...params,
      limit + 1,
      offset,
    ]);
    const pending = await pendingCalendar(deps, me.key.userId);
    const now = deps.now();
    const itens: LembreteComPedidos[] = offset === 0 && !filtered ? pending.created.map((r) => createdReminder(r, pending.byReminder.get(r.alvo), now)) : [];
    let chars = 0;
    let taken = 0;
    for (const row of rows.slice(0, limit)) {
      if (taken && chars + row.dados.length > PAGE_MAX_CHARS) break;
      chars += row.dados.length;
      taken++;
      const l = JSON.parse(row.dados) as LembreteV1;
      itens.push(overlayReminder(l, pending.byReminder.get(l.id), now));
    }
    const more = rows.length > taken;
    return c.json({ itens, ...(more ? { depois: String(offset + taken) } : {}), espelho: await mirrorState(deps, me.key.userId) });
  });

  app.get('/ext/v1/lembretes/:id', async (c) => {
    const me = await caller(c);
    const l = await currentReminder(deps, me.key.userId, c.req.param('id'));
    if (!l) throw notFound();
    return c.json({ lembrete: l });
  });
}
