import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import { CONTEXTO_GASTOS, DIA_RE, MES_RE, visaoDoMes, type ContextoGastosV1, type LancamentoV1, type MesV1 } from '../../../contrato/api-v1/gastos';
import {
  OPS_DE_GASTO,
  acharEnvelope as findEnvelope,
  acharPessoa as findPerson,
  conferirOpGasto,
  editarLancamentoV1,
  lancamentoDoPedido,
  type EditarLancamentoV1,
  type LancarV1,
  type OpGasto,
} from '../../../contrato/api-v1/operacoes-gastos';
import { authenticateKey, requireScope } from '../domain/api-key';
import { todayIn } from '../domain/mirror';
import { openRequests, stateOf, type RequestRow } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps, SqlValue } from '../ports';
import { mirrorState } from './routes';

/**
 * Ler os Gastos com a chave (PLANO-API.md, 7.4; rodada 6): o mês como o app mostra (a visão que o site
 * fez com as contas da tela), os lançamentos com filtros e um lançamento pelo id. Tudo do espelho; a
 * API não faz conta nenhuma.
 */

const LIST_MAX = 200;
const PAGE_MAX_CHARS = 256_000;
const notFound = () => new HttpError(404, 'lancamento-nao-encontrado', 'Não achei esse lançamento.');

/** O vocabulário dos Gastos que o site mandou, ou null (o espelho ainda não chegou). */
export async function spendingContext(deps: Deps, userId: string): Promise<ContextoGastosV1 | null> {
  const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'contexto-gastos' AND id = ?", [userId, CONTEXTO_GASTOS]);
  return row ? (JSON.parse(row.dados) as ContextoGastosV1) : null;
}

/** Um pedido aberto, como a AI vê por cima do lançamento. */
interface PedidoNoGasto {
  id: string;
  op: OpGasto;
  estado: ReturnType<typeof stateOf>;
}
export type LancamentoComPedidos = LancamentoV1 & { pedidos?: PedidoNoGasto[] };

/** Os pedidos abertos dos Gastos (PLANO-API.md, 8.5): os lançamentos que vão entrar, as mudanças e as frases. */
async function pendingSpending(deps: Deps, userId: string) {
  const rows = (await openRequests(deps, userId)).filter((r) => (OPS_DE_GASTO as readonly string[]).includes(r.op));
  const created: RequestRow[] = [];
  const phrases: RequestRow[] = [];
  const byEntry = new Map<string, RequestRow[]>();
  for (const r of rows) {
    if (r.op === 'gasto.lancar') ('frase' in (JSON.parse(r.dados) as LancarV1) ? phrases : created).push(r);
    else if (r.op === 'gasto.editar' || r.op === 'gasto.apagar') byEntry.set(r.alvo, [...(byEntry.get(r.alvo) ?? []), r]);
  }
  return { rows, created, phrases, byEntry };
}

const marker = (r: RequestRow, now: Date): PedidoNoGasto => ({ id: r.id, op: r.op as OpGasto, estado: stateOf(r, now) });

/** O lançamento com as mudanças abertas por cima (o de apagar fica, com o pedido na lista). */
function overlayEntry(l: LancamentoV1, rows: readonly RequestRow[] | undefined, ctx: ContextoGastosV1 | null, now: Date): LancamentoComPedidos {
  if (!rows?.length) return l;
  let out = l;
  for (const r of rows) {
    if (r.op !== 'gasto.editar') continue;
    const c = conferirOpGasto('gasto.editar', JSON.parse(r.dados));
    if (c.ok) out = editarLancamentoV1(out, c.dados as EditarLancamentoV1, ctx, r.criado_em);
  }
  return { ...out, pedidos: rows.map((r) => marker(r, now)) };
}

/** O lançamento de agora: o do espelho, ou o de um pedido de lançar ainda não aplicado; com os pedidos por cima. */
export async function currentEntry(deps: Deps, userId: string, id: string): Promise<LancamentoComPedidos | null> {
  const [row, pending, ctx, state] = await Promise.all([
    deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'lancamento' AND id = ?", [userId, id]),
    pendingSpending(deps, userId),
    spendingContext(deps, userId),
    mirrorState(deps, userId),
  ]);
  const now = deps.now();
  if (row) return overlayEntry(JSON.parse(row.dados) as LancamentoV1, pending.byEntry.get(id), ctx, now);
  const created = pending.created.find((r) => r.alvo === id);
  const base = created ? lancamentoDoPedido(id, JSON.parse(created.dados) as LancarV1, ctx, todayIn(state.fuso, now), created.criado_em) : null;
  if (!base || !created) return null;
  const shown = overlayEntry(base, pending.byEntry.get(id), ctx, now);
  return { ...shown, pedidos: [marker(created, now), ...(shown.pedidos ?? [])] };
}

/** As frases que ainda vão virar lançamento (o site entende cada uma ao aplicar). */
const phrasesOut = (rows: readonly RequestRow[], now: Date) =>
  rows.map((r) => ({ pedido: r.id, estado: stateOf(r, now), frase: (JSON.parse(r.dados) as { frase: string }).frase }));

const names = (list: readonly { nome: string }[]) => list.map((x) => x.nome).join(', ');

export function spendingReadRoutes(app: Hono, deps: Deps): void {
  const caller = async (c: Context) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, 'gastos:ler');
    return me;
  };

  // O mês como o app mostra.
  app.get('/ext/v1/gastos/meses/:mes', async (c) => {
    const me = await caller(c);
    const month = c.req.param('mes');
    if (!MES_RE.test(month)) throw new HttpError(400, 'mes-invalido', 'O mês é AAAA-MM (2026-10).');
    const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'visao' AND id = ?", [
      me.key.userId,
      visaoDoMes(month),
    ]);
    const espelho = await mirrorState(deps, me.key.userId);
    if (!row) {
      if (espelho.estado === 'vazio') return c.json({ mes: null, espelho });
      throw new HttpError(
        404,
        'mes-fora',
        'Este mês não está pronto: vão os 24 meses mais recentes com lançamento e os 3 próximos. Para outro mês, liste os lançamentos com de e ate.',
      );
    }
    const pending = await pendingSpending(deps, me.key.userId);
    const now = deps.now();
    return c.json({
      mes: JSON.parse(row.dados) as MesV1,
      // o mês é o do Murall agora: o que ainda não entrou vem aqui à parte
      ...(pending.rows.length ? { pedidos_abertos: pending.rows.map((r) => ({ ...marker(r, now), alvo: r.alvo })) } : {}),
      espelho,
    });
  });

  // Os lançamentos, do dia mais recente para o mais antigo.
  app.get('/ext/v1/gastos/lancamentos', async (c) => {
    const me = await caller(c);
    const q = (k: string) => c.req.query(k)?.trim() || undefined;
    const limit = Math.min(LIST_MAX, Math.max(1, Number(q('limite') ?? 50) || 50));
    const offset = Math.max(0, Number(q('depois') ?? 0) || 0);
    const where: string[] = ['usuario_id = ?', "tipo = 'lancamento'"];
    const params: SqlValue[] = [me.key.userId];
    const bound = (k: 'de' | 'ate') => {
      const v = q(k);
      if (v === undefined) return;
      if (!MES_RE.test(v) && !DIA_RE.test(v)) throw new HttpError(400, 'filtro-invalido', `${k} é um mês (AAAA-MM) ou um dia (AAAA-MM-DD).`);
      // o mês inteiro: de = o dia 1, ate = o fim do mês
      where.push(k === 'de' ? 'data >= ?' : 'data <= ?');
      params.push(v.length === 7 ? (k === 'de' ? `${v}-01` : `${v}-31`) : v);
    };
    bound('de');
    bound('ate');
    const flow = q('tipo');
    if (flow !== undefined) {
      if (flow !== 'saida' && flow !== 'entrada') throw new HttpError(400, 'filtro-invalido', 'tipo é saida ou entrada.');
      where.push("json_extract(dados, '$.tipo') = ?");
      params.push(flow);
    }
    const envelope = q('envelope');
    const person = q('pessoa');
    if (envelope !== undefined || person !== undefined) {
      const ctx = await spendingContext(deps, me.key.userId);
      if (envelope !== undefined) {
        const e = findEnvelope(ctx, envelope);
        if (!e) throw new HttpError(400, 'envelope-desconhecido', `Não há o envelope "${envelope.slice(0, 40)}". Os que existem: ${names(ctx?.envelopes ?? [])}.`);
        where.push("json_extract(dados, '$.envelope.id') = ?");
        params.push(e.id);
      }
      if (person !== undefined) {
        const p = findPerson(ctx, person);
        if (!p) throw new HttpError(400, 'pessoa-desconhecida', `Não há a pessoa "${person.slice(0, 40)}". As que existem: ${names(ctx?.pessoas ?? [])}.`);
        where.push("EXISTS (SELECT 1 FROM json_each(dados, '$.pessoas') WHERE value = ?)");
        params.push(p.nome);
      }
    }
    const text = q('q');
    // com filtro, os lançamentos que ainda vão entrar não aparecem (a prévia não passa por eles)
    const filtered = [q('de'), q('ate'), flow, envelope, person, text].some((v) => v !== undefined);
    if (text) {
      where.push("busca LIKE ? ESCAPE '\\'");
      params.push(`%${dobra(text).replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    }
    const rows = await deps.db.all<{ dados: string }>(
      `SELECT dados FROM api_espelho WHERE ${where.join(' AND ')} ORDER BY data DESC, json_extract(dados, '$.criado_em') DESC, id LIMIT ? OFFSET ?`,
      [...params, limit + 1, offset],
    );
    const pending = await pendingSpending(deps, me.key.userId);
    const ctx = await spendingContext(deps, me.key.userId);
    const espelho = await mirrorState(deps, me.key.userId);
    const now = deps.now();
    const itens: LancamentoComPedidos[] = [];
    if (offset === 0 && !filtered) {
      const hoje = todayIn(espelho.fuso, now);
      for (const r of pending.created) {
        const l = lancamentoDoPedido(r.alvo, JSON.parse(r.dados) as LancarV1, ctx, hoje, r.criado_em);
        const later = pending.byEntry.get(r.alvo);
        if (l) itens.push({ ...overlayEntry(l, later, ctx, now), pedidos: [marker(r, now), ...(later ?? []).map((x) => marker(x, now))] });
      }
    }
    let chars = 0;
    let taken = 0;
    for (const row of rows.slice(0, limit)) {
      if (taken && chars + row.dados.length > PAGE_MAX_CHARS) break;
      chars += row.dados.length;
      taken++;
      const l = JSON.parse(row.dados) as LancamentoV1;
      itens.push(overlayEntry(l, pending.byEntry.get(l.id), ctx, now));
    }
    const more = rows.length > taken;
    return c.json({
      itens,
      ...(more ? { depois: String(offset + taken) } : {}),
      ...(offset === 0 && pending.phrases.length ? { frases_abertas: phrasesOut(pending.phrases, now) } : {}),
      espelho,
    });
  });

  app.get('/ext/v1/gastos/lancamentos/:id', async (c) => {
    const me = await caller(c);
    const id = c.req.param('id');
    if (!/^[\w-]{1,64}$/.test(id)) throw notFound();
    const l = await currentEntry(deps, me.key.userId, id);
    if (!l) throw notFound();
    return c.json({ lancamento: l });
  });
}
