import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import { CONTEXTO_NOTAS, resumo, type ContextoNotasV1, type NotaResumoV1, type NotaV1 } from '../../../contrato/api-v1/notas';
import { formatCode } from '../domain/code';
import { KeyCaller, authenticateKey, keyOut, requireScope } from '../domain/api-key';
import { todayIn } from '../domain/mirror';
import { createdNote, overlay, pendingOf, type NotaComPedidos } from './overlay';
import { spendingContext } from './spending-read';
import type { ContextoGastosV1, LancamentoV1 } from '../../../contrato/api-v1/gastos';
import { HttpError } from '../errors';
import { Deps, SqlValue } from '../ports';

/**
 * A API das AIs e dos programas (PLANO-API.md, seção 7): `/ext/v1/*`, só com chave de API. Lê do
 * espelho (seção 8), que o site enche depois de sincronizar; uma chave limitada a alguns grupos nunca
 * vê as notas (nem os nomes, nem as tags) dos outros.
 */

/** O teto de uma página: os 10 ms de CPU do Worker grátis (PLANO-API.md, seção 23). */
const PAGE_MAX_CHARS = 256_000;
const LIST_MAX = 100;
const SEARCH_MAX = 20;
const ORDERS: Record<string, string> = {
  mudou: 'versao DESC, id',
  criada: "json_extract(dados, '$.criada_em') DESC, id",
  titulo: "lower(json_extract(dados, '$.titulo')), id",
  data: 'data IS NULL, data DESC, id',
};

const notFound = () => new HttpError(404, 'nota-nao-encontrada', 'Não achei essa nota (ou ela está num grupo que esta chave não alcança).');

/** O estado do espelho da conta, para a AI saber se a lista vazia é "não tem nada" ou "ainda não chegou". */
export async function mirrorState(deps: Deps, userId: string) {
  const row = await deps.db.first<{ atualizado_em: string; fuso: string | null }>('SELECT atualizado_em, fuso FROM api_espelho_estado WHERE usuario_id = ?', [
    userId,
  ]);
  return row
    ? { estado: 'pronto' as const, atualizado_em: row.atualizado_em, fuso: row.fuso }
    : {
        estado: 'vazio' as const,
        atualizado_em: null,
        fuso: null,
        aviso: 'O Murall ainda não preparou o acesso: abra o site em algum aparelho logado nesta conta, e as notas chegam em seguida.',
      };
}

/** A condição dos grupos da chave (sem grupo, a nota fica de fora quando a chave é limitada). */
function groupLimit(caller: KeyCaller): { sql: string; params: SqlValue[] } {
  const groups = caller.key.groups;
  if (!groups?.length) return { sql: '', params: [] };
  return { sql: ` AND grupo IN (${groups.map(() => '?').join(', ')})`, params: groups.map(dobra) };
}

const bool = (v: string | undefined) => (v === undefined ? null : v === 'sim' || v === 'true' || v === '1' ? true : v === 'nao' || v === 'false' || v === '0' ? false : undefined);

export function extRoutes(app: Hono, deps: Deps): void {
  const caller = (c: Context) => authenticateKey(deps, c.req.header('Authorization'));

  app.get('/ext/v1/eu', async (c) => {
    const me = await caller(c);
    return c.json({ conta: { codigo: formatCode(me.code), nome: me.name }, chave: keyOut(me.key) });
  });

  // ===== As Anotações (notas:ler) =====

  app.get('/ext/v1/notas', async (c) => {
    const me = await caller(c);
    requireScope(me, 'notas:ler');
    const q = (k: string) => c.req.query(k)?.trim() || undefined;
    const limit = Math.min(LIST_MAX, Math.max(1, Number(q('limite') ?? 30) || 30));
    const offset = Math.max(0, Number(q('depois') ?? 0) || 0);
    const order = ORDERS[q('ordem') ?? 'mudou'];
    if (!order) throw new HttpError(400, 'ordem-invalida', `A ordem é uma destas: ${Object.keys(ORDERS).join(', ')}.`);
    const done = bool(q('finalizadas'));
    const pinned = bool(q('fixadas'));
    if (done === undefined || pinned === undefined) throw new HttpError(400, 'filtro-invalido', 'finalizadas e fixadas são sim ou nao.');
    const withText = bool(q('com_texto')) === true;

    const where: string[] = ['usuario_id = ?', "tipo = 'nota'"];
    const params: SqlValue[] = [me.key.userId];
    const group = q('grupo');
    if (group !== undefined) {
      // "-" é "sem grupo"
      if (group === '-') where.push('grupo IS NULL');
      else {
        where.push('grupo = ?');
        params.push(dobra(group));
      }
    }
    const subject = q('assunto');
    if (subject) {
      where.push("lower(json_extract(dados, '$.assunto')) = lower(?)");
      params.push(subject);
    }
    const tag = q('tag');
    if (tag) {
      where.push("EXISTS (SELECT 1 FROM json_each(dados, '$.tags') WHERE lower(value) = lower(?))");
      params.push(tag.replace(/^#+/, ''));
    }
    if (done !== null) where.push(`json_extract(dados, '$.finalizada_em') IS ${done ? 'NOT ' : ''}NULL`);
    if (pinned !== null) where.push(`json_extract(dados, '$.fixada') = ${pinned ? 1 : 0}`);
    const since = q('mudou_depois_de');
    if (since) {
      if (Number.isNaN(Date.parse(since))) throw new HttpError(400, 'filtro-invalido', 'mudou_depois_de é uma data ISO (2026-10-27T12:00:00Z).');
      where.push('versao > ?');
      params.push(new Date(since).toISOString());
    }
    const text = q('q');
    if (text) {
      where.push('busca LIKE ?');
      params.push(`%${dobra(text).replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
      where[where.length - 1] += " ESCAPE '\\'";
    }
    const limitSql = groupLimit(me);
    const rows = await deps.db.all<{ dados: string }>(
      `SELECT dados FROM api_espelho WHERE ${where.join(' AND ')}${limitSql.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...params, ...limitSql.params, limit + 1, offset],
    );
    // os pedidos abertos por cima: as notas mudadas aparecem como vão ficar; as criadas (ainda não
    // aplicadas) vêm no começo da primeira página, se couberem nos grupos da chave e no grupo pedido
    const pending = await pendingOf(deps, me.key.userId);
    const now = deps.now();
    const summary = (n: NotaComPedidos): NotaResumoV1 & { pedidos?: NotaComPedidos['pedidos'] } => {
      const { texto, ...rest } = n;
      return { ...rest, resumo: resumo(texto), ...(withText ? { texto } : {}) };
    };
    const itens: ReturnType<typeof summary>[] = [];
    if (offset === 0) {
      for (const r of pending.created) {
        const n = createdNote(r, pending, now);
        const allowed = !me.key.groups?.length || (n.grupo !== null && me.key.groups.some((g) => dobra(g) === dobra(n.grupo!)));
        const inGroup = group === undefined || (group === '-' ? n.grupo === null : n.grupo !== null && dobra(n.grupo) === dobra(group));
        if (allowed && inGroup) itens.push(summary(n));
      }
    }
    let chars = 0;
    let taken = 0;
    for (const row of rows.slice(0, limit)) {
      if (taken && chars + row.dados.length > PAGE_MAX_CHARS) break;
      chars += row.dados.length;
      taken++;
      const n = JSON.parse(row.dados) as NotaV1;
      itens.push(summary(overlay(n, pending.byNote.get(n.id), now)));
    }
    const more = rows.length > taken;
    return c.json({ itens, ...(more ? { depois: String(offset + taken) } : {}), espelho: await mirrorState(deps, me.key.userId) });
  });

  app.get('/ext/v1/notas/:id', async (c) => {
    const me = await caller(c);
    requireScope(me, 'notas:ler');
    const id = c.req.param('id');
    if (!/^[\w-]{1,64}$/.test(id)) throw notFound();
    const limitSql = groupLimit(me);
    const row = await deps.db.first<{ dados: string }>(`SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'nota' AND id = ?${limitSql.sql}`, [
      me.key.userId,
      id,
      ...limitSql.params,
    ]);
    const pending = await pendingOf(deps, me.key.userId);
    const now = deps.now();
    if (row) return c.json({ nota: overlay(JSON.parse(row.dados) as NotaV1, pending.byNote.get(id), now) });
    // a nota que só existe num pedido de criar (o Murall ainda não aplicou)
    const created = pending.created.find((r) => r.alvo === id);
    const n = created ? createdNote(created, pending, now) : null;
    if (!n || (me.key.groups?.length && (n.grupo === null || !me.key.groups.some((g) => dobra(g) === dobra(n.grupo!))))) throw notFound();
    return c.json({ nota: n });
  });

  // ===== O vocabulário da conta (o que a AI deve usar em vez de inventar) =====

  app.get('/ext/v1/contexto', async (c) => {
    const me = await caller(c);
    const state = await mirrorState(deps, me.key.userId);
    let notas: ContextoNotasV1 | null = null;
    if (me.key.scopes.includes('notas:ler')) {
      const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'contexto' AND id = ?", [
        me.key.userId,
        CONTEXTO_NOTAS,
      ]);
      if (row) {
        notas = JSON.parse(row.dados) as ContextoNotasV1;
        const groups = me.key.groups;
        if (groups?.length) {
          // a chave limitada vê só os grupos dela: nem os nomes dos outros, nem as tags das notas deles
          const allowed = new Set(groups.map(dobra));
          notas = { grupos: notas.grupos.filter((g) => allowed.has(dobra(g.nome))), sem_grupo: { notas: 0, tags: [] }, tags_fixas: notas.tags_fixas };
        }
      }
    }
    return c.json({
      conta: { codigo: formatCode(me.code), nome: me.name },
      hoje: todayIn(state.fuso, deps.now()),
      fuso: state.fuso ?? 'America/Sao_Paulo',
      chave: keyOut(me.key),
      notas,
      // os envelopes e as pessoas dos Gastos (os nomes a usar ao lançar), para a chave que os lê
      gastos: me.key.scopes.includes('gastos:ler') ? ((await spendingContext(deps, me.key.userId)) satisfies ContextoGastosV1 | null) : null,
      espelho: state,
    });
  });

  // ===== A busca: nas Anotações e nos títulos dos lançamentos =====

  app.get('/ext/v1/busca', async (c) => {
    const me = await caller(c);
    const raw = c.req.query('q')?.trim() ?? '';
    if (raw.length < 2 || raw.length > 200) throw new HttpError(400, 'busca-invalida', 'Escreva de 2 a 200 letras para buscar.');
    const areas = (c.req.query('areas') ?? 'notas').split(',').map((a) => a.trim());
    const itens: (
      | { tipo: 'nota'; id: string; titulo: string; grupo: string | null; trecho: string }
      | { tipo: 'lancamento'; id: string; titulo: string; dia: string; centavos: number; envelope: string | null }
    )[] = [];
    if (areas.includes('notas')) {
      requireScope(me, 'notas:ler');
      const term = dobra(raw);
      const limitSql = groupLimit(me);
      const rows = await deps.db.all<{ dados: string }>(
        `SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'nota' AND busca LIKE ? ESCAPE '\\'${limitSql.sql} ORDER BY versao DESC LIMIT ?`,
        [me.key.userId, `%${term.replace(/[%_\\]/g, (m) => `\\${m}`)}%`, ...limitSql.params, SEARCH_MAX],
      );
      for (const row of rows) {
        const n = JSON.parse(row.dados) as NotaV1;
        itens.push({ tipo: 'nota', id: n.id, titulo: n.titulo, grupo: n.grupo, trecho: excerpt(n, term) });
      }
    }
    if (areas.includes('gastos')) {
      requireScope(me, 'gastos:ler');
      const rows = await deps.db.all<{ dados: string }>(
        `SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'lancamento' AND busca LIKE ? ESCAPE '\\' ORDER BY data DESC LIMIT ?`,
        [me.key.userId, `%${dobra(raw).replace(/[%_\\]/g, (m) => `\\${m}`)}%`, SEARCH_MAX],
      );
      for (const row of rows) {
        const l = JSON.parse(row.dados) as LancamentoV1;
        itens.push({ tipo: 'lancamento', id: l.id, titulo: l.titulo, dia: l.dia, centavos: l.centavos, envelope: l.envelope?.nome ?? null });
      }
    }
    return c.json({ itens, espelho: await mirrorState(deps, me.key.userId) });
  });
}

/** Um pedaço do texto em volta do que achou (ou o começo, se achou só no título). */
function excerpt(n: NotaV1, term: string): string {
  const at = dobra(n.texto).indexOf(term);
  if (at < 0) return resumo(n.texto, 160);
  const from = Math.max(0, at - 70);
  const to = Math.min(n.texto.length, at + term.length + 90);
  return `${from > 0 ? '…' : ''}${n.texto.slice(from, to).replace(/\s+/g, ' ').trim()}${to < n.texto.length ? '…' : ''}`;
}
