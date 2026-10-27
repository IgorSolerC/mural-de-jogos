import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import type { ColunaV1, QuadroV1 } from '../../../contrato/api-v1/kanban';
import type { CriarNotaV1 } from '../../../contrato/api-v1/operacoes';
import { OPS_DO_KANBAN, aplicarNoQuadroV1, conferirOpKanban, type NotaParaOQuadro, type OpKanban } from '../../../contrato/api-v1/operacoes-kanban';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { openRequests, stateOf, type RequestRow } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { groupLimit, mirrorState } from './routes';

/**
 * Ler o Kanban com a chave (PLANO-API.md, 7.4; rodada 8): os quadros (um por grupo das Anotações, com
 * as colunas) e um quadro inteiro, com os cartões na ordem da tela. Tudo do espelho, com os pedidos
 * abertos por cima (8.5): a coluna criada já aparece, o cartão movido já está no lugar novo. A chave
 * limitada a alguns grupos só vê os quadros deles.
 */

/** As permissões do Kanban: qualquer uma deixa ver as colunas no contexto (quem move precisa dos nomes). */
export const KANBAN_SCOPES = ['kanban:ler', 'kanban:mover', 'kanban:colunas'] as const;

/** Um pedido aberto, como a AI vê por cima do quadro. */
interface PedidoNoQuadro {
  id: string;
  op: string;
  alvo: string;
  estado: ReturnType<typeof stateOf>;
}
export type QuadroComPedidos = QuadroV1 & { pedidos?: PedidoNoQuadro[] };

/** O quadro como a lista e o contexto mostram: sem os cartões. */
export type QuadroResumoV1 = Omit<QuadroV1, 'cartoes'> & { pedidos?: PedidoNoQuadro[] };

/** Dos pedidos abertos da conta, os que mexem no Kanban: os do quadro e as notas novas que nascem nele. */
function kanbanRows(rows: readonly RequestRow[]): RequestRow[] {
  return rows.filter((r) => (OPS_DO_KANBAN as readonly string[]).includes(r.op) || (r.op === 'nota.criar' && !!(JSON.parse(r.dados) as CriarNotaV1).kanban));
}

/** Os pedidos de um quadro: os que dizem o id dele, e as notas novas do grupo dele que nascem no quadro. */
function rowsOf(q: Pick<QuadroV1, 'id' | 'grupo'>, rows: readonly RequestRow[]): RequestRow[] {
  return rows.filter((r) => {
    const d = JSON.parse(r.dados) as { quadro?: string; grupo?: string | null };
    return r.op === 'nota.criar' ? !!d.grupo && dobra(d.grupo) === dobra(q.grupo) : d.quadro === q.id;
  });
}

/** O título, as tags e o "finalizada" das notas que chegam ao quadro por um pedido (do espelho, ou de um pedido de criar). */
async function arriving(deps: Deps, userId: string, ids: readonly string[], open: readonly RequestRow[]): Promise<Map<string, NotaParaOQuadro>> {
  const out = new Map<string, NotaParaOQuadro>();
  for (const r of open) {
    if (r.op !== 'nota.criar' || !ids.includes(r.alvo)) continue;
    const d = JSON.parse(r.dados) as CriarNotaV1;
    out.set(r.alvo, { titulo: d.titulo, finalizada: false, tags: d.tags ?? [] });
  }
  const rest = ids.filter((id) => !out.has(id));
  if (rest.length) {
    const rows = await deps.db.all<{ id: string; dados: string }>(
      `SELECT id, dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'nota' AND id IN (${rest.map(() => '?').join(', ')})`,
      [userId, ...rest],
    );
    for (const row of rows) {
      const n = JSON.parse(row.dados) as { titulo: string; finalizada_em: string | null; tags: string[] };
      out.set(row.id, { titulo: n.titulo, finalizada: !!n.finalizada_em, tags: n.tags });
    }
  }
  return out;
}

/** O quadro com os pedidos abertos dele aplicados por cima, e a lista `pedidos` com o que ainda não entrou. */
async function overlayBoard(deps: Deps, userId: string, q: QuadroV1, open: readonly RequestRow[], all: readonly RequestRow[]): Promise<QuadroComPedidos> {
  const mine = rowsOf(q, open);
  if (!mine.length) return q;
  const notes = await arriving(
    deps,
    userId,
    mine.filter((r) => r.op === 'cartao.mover' && !q.cartoes.some((c) => c.nota === r.alvo)).map((r) => r.alvo),
    all,
  );
  let out = q;
  for (const r of mine) {
    const raw = JSON.parse(r.dados) as Record<string, unknown>;
    if (r.op === 'nota.criar') {
      const d = raw as unknown as CriarNotaV1;
      out = aplicarNoQuadroV1(out, 'cartao.mover', r.alvo, { quadro: q.id, ...d.kanban }, { titulo: d.titulo, finalizada: false, tags: d.tags ?? [] });
      continue;
    }
    const c = conferirOpKanban(r.op as OpKanban, raw);
    if (c.ok) out = aplicarNoQuadroV1(out, r.op as OpKanban, r.alvo, c.dados, notes.get(r.alvo));
  }
  const now = deps.now();
  return { ...out, pedidos: mine.map((r) => ({ id: r.id, op: r.op, alvo: r.alvo, estado: stateOf(r, now) })) };
}

/** Os quadros que a chave alcança, de A a Z, sem os cartões, com os pedidos abertos por cima. */
export async function boardSummaries(deps: Deps, me: KeyCaller): Promise<QuadroResumoV1[]> {
  const limit = groupLimit(me);
  const all = await openRequests(deps, me.key.userId);
  const open = kanbanRows(all);
  if (!open.length) {
    // sem nada aberto, o banco tira os cartões (a API não abre cada quadro)
    const rows = await deps.db.all<{ dados: string }>(
      `SELECT json_remove(dados, '$.cartoes') AS dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'quadro'${limit.sql} ORDER BY grupo`,
      [me.key.userId, ...limit.params],
    );
    return rows.map((r) => JSON.parse(r.dados) as QuadroResumoV1);
  }
  const rows = await deps.db.all<{ dados: string }>(`SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'quadro'${limit.sql} ORDER BY grupo`, [
    me.key.userId,
    ...limit.params,
  ]);
  const out: QuadroResumoV1[] = [];
  for (const r of rows) {
    const { cartoes: _c, ...q } = await overlayBoard(deps, me.key.userId, JSON.parse(r.dados) as QuadroV1, open, all);
    out.push(q);
  }
  return out;
}

/** As colunas de cada quadro, para o contexto (o vocabulário: os nomes a usar ao mover). */
export async function kanbanContext(deps: Deps, me: KeyCaller) {
  const boards = await boardSummaries(deps, me);
  return boards.map((q) => ({
    id: q.id,
    grupo: q.grupo,
    so_no_kanban: q.so_no_kanban,
    colunas: q.colunas.map((c: ColunaV1) => ({ id: c.id, nome: c.nome, finaliza: c.finaliza, pula: c.pula })),
  }));
}

/**
 * O quadro de um grupo (pelo nome, sem ligar para acento e caixa, ou pelo id) como vai ficar, com os
 * pedidos abertos por cima, se a chave alcança; ou null.
 */
export async function findBoard(deps: Deps, me: KeyCaller, ref: string): Promise<QuadroComPedidos | null> {
  if (!ref || ref.length > 64) return null;
  const limit = groupLimit(me);
  const row = await deps.db.first<{ dados: string }>(
    `SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'quadro' AND (id = ? OR grupo = ?)${limit.sql}`,
    [me.key.userId, ref, dobra(ref.trim()), ...limit.params],
  );
  if (!row) return null;
  const all = await openRequests(deps, me.key.userId);
  return overlayBoard(deps, me.key.userId, JSON.parse(row.dados) as QuadroV1, kanbanRows(all), all);
}

/** O 404 de um quadro que não existe (ou que a chave não alcança), com os que ela alcança. */
export async function boardNotFound(deps: Deps, me: KeyCaller, ref: string): Promise<HttpError> {
  const names = (await boardSummaries(deps, me)).map((q) => q.grupo);
  return new HttpError(
    404,
    'quadro-nao-encontrado',
    `Não achei o quadro "${ref.slice(0, 64)}". Cada grupo das Anotações tem o seu quadro; ${names.length ? `os que esta chave alcança: ${names.join(', ')}.` : 'esta chave ainda não alcança nenhum (abra o Murall para o espelho chegar).'}`,
  );
}

export function kanbanReadRoutes(app: Hono, deps: Deps): void {
  const caller = async (c: Context) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, 'kanban:ler');
    return me;
  };

  // Os quadros, com as colunas (sem os cartões).
  app.get('/ext/v1/kanban', async (c) => {
    const me = await caller(c);
    return c.json({ quadros: await boardSummaries(deps, me), espelho: await mirrorState(deps, me.key.userId) });
  });

  // Um quadro inteiro: as colunas e os cartões, na ordem da tela.
  app.get('/ext/v1/kanban/:grupo', async (c) => {
    const me = await caller(c);
    const ref = c.req.param('grupo');
    const q = await findBoard(deps, me, ref);
    const espelho = await mirrorState(deps, me.key.userId);
    if (!q) {
      if (espelho.estado === 'vazio') return c.json({ quadro: null, espelho });
      throw await boardNotFound(deps, me, ref);
    }
    return c.json({ quadro: q, espelho });
  });
}
