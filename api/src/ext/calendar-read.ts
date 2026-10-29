import { Context, Hono } from 'hono';
import { CORES, ehDia, type AgendaDoMesV1, type LembreteV1, type VezV1 } from '../../../contrato/api-v1/calendario';
import { dobra } from '../../../contrato/api-v1/escopos';
import { MES_RE } from '../../../contrato/api-v1/gastos';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { todayIn } from '../domain/mirror';
import { HttpError } from '../errors';
import { Deps, SqlValue } from '../ports';
import { OFFSET_MAX, intQuery, mirrorState } from './routes';

/**
 * Ler o Calendário com a chave (PLANO-API.md, 7.4; rodada 7): a agenda entre dois dias (as vezes de
 * cada lembrete, com as repetições já abertas pelo app, da agenda de cada mês que o site mandou), os
 * lembretes como estão guardados e um lembrete pelo id. Tudo do espelho; a API não abre repetição
 * nenhuma.
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

/** O lembrete do espelho, ou null. */
export async function mirroredReminder(deps: Deps, userId: string, id: string): Promise<LembreteV1 | null> {
  if (!/^[\w-]{1,64}$/.test(id)) return null;
  const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'lembrete' AND id = ?", [userId, id]);
  return row ? (JSON.parse(row.dados) as LembreteV1) : null;
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
    if (!janela) return c.json({ de: from, ate: to, vezes: [], espelho });
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
    return c.json({ de: from, ate: to, vezes, espelho });
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
    if (text) {
      where.push("busca LIKE ? ESCAPE '\\'");
      params.push(`%${dobra(text).replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    }
    const rows = await deps.db.all<{ dados: string }>(`SELECT dados FROM api_espelho WHERE ${where.join(' AND ')} ORDER BY data DESC, id LIMIT ? OFFSET ?`, [
      ...params,
      limit + 1,
      offset,
    ]);
    const itens: LembreteV1[] = [];
    let chars = 0;
    for (const row of rows.slice(0, limit)) {
      if (itens.length && chars + row.dados.length > PAGE_MAX_CHARS) break;
      chars += row.dados.length;
      itens.push(JSON.parse(row.dados) as LembreteV1);
    }
    const more = rows.length > itens.length;
    return c.json({ itens, ...(more ? { depois: String(offset + itens.length) } : {}), espelho: await mirrorState(deps, me.key.userId) });
  });

  app.get('/ext/v1/lembretes/:id', async (c) => {
    const me = await caller(c);
    const l = await mirroredReminder(deps, me.key.userId, c.req.param('id'));
    if (!l) throw notFound();
    return c.json({ lembrete: l });
  });
}
