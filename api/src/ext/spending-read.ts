import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import { CONTEXTO_GASTOS, DIA_RE, MES_RE, visaoDoMes, type ContextoGastosV1, type LancamentoV1, type MesV1 } from '../../../contrato/api-v1/gastos';
import { authenticateKey, requireScope } from '../domain/api-key';
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

/** O envelope pelo id ou pelo nome (sem ligar para acento e caixa), ou null. */
export function findEnvelope(ctx: ContextoGastosV1 | null, raw: string) {
  return ctx?.envelopes.find((e) => e.id === raw) ?? ctx?.envelopes.find((e) => dobra(e.nome) === dobra(raw)) ?? null;
}

/** A pessoa pelo id ou pelo nome (sem ligar para acento e caixa); "eu" e "você" são você. */
export function findPerson(ctx: ContextoGastosV1 | null, raw: string) {
  const k = dobra(raw);
  if (k === 'eu' || k === 'voce') return ctx?.pessoas.find((p) => p.eu) ?? null;
  return ctx?.pessoas.find((p) => p.id === raw) ?? ctx?.pessoas.find((p) => dobra(p.nome) === k) ?? null;
}

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
    return c.json({ mes: JSON.parse(row.dados) as MesV1, espelho });
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
    if (text) {
      where.push("busca LIKE ? ESCAPE '\\'");
      params.push(`%${dobra(text).replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    }
    const rows = await deps.db.all<{ dados: string }>(
      `SELECT dados FROM api_espelho WHERE ${where.join(' AND ')} ORDER BY data DESC, json_extract(dados, '$.criado_em') DESC, id LIMIT ? OFFSET ?`,
      [...params, limit + 1, offset],
    );
    const itens: LancamentoV1[] = [];
    let chars = 0;
    for (const row of rows.slice(0, limit)) {
      if (itens.length && chars + row.dados.length > PAGE_MAX_CHARS) break;
      chars += row.dados.length;
      itens.push(JSON.parse(row.dados) as LancamentoV1);
    }
    const more = rows.length > itens.length;
    return c.json({ itens, ...(more ? { depois: String(offset + itens.length) } : {}), espelho: await mirrorState(deps, me.key.userId) });
  });

  app.get('/ext/v1/gastos/lancamentos/:id', async (c) => {
    const me = await caller(c);
    const id = c.req.param('id');
    if (!/^[\w-]{1,64}$/.test(id)) throw notFound();
    const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'lancamento' AND id = ?", [me.key.userId, id]);
    if (!row) throw notFound();
    return c.json({ lancamento: JSON.parse(row.dados) as LancamentoV1 });
  });
}
