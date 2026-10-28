import { Hono } from 'hono';
import { MAX_CHAVES, dobra, type Aprovacao } from '../../../contrato/api-v1/escopos';
import { OPS_DO_KANBAN } from '../../../contrato/api-v1/operacoes-kanban';
import {
  KEY_COLUMNS,
  KEY_ID_RE,
  KeyRow,
  type ApiKey,
  MAX_KEYS_PER_DAY,
  accessNotice,
  apiAllowed,
  apiUnavailable,
  connectorDomain,
  expiresIn,
  keyOf,
  keyOut,
  newKeyId,
  newSecret,
  readKeyInput,
} from '../domain/api-key';
import { brakeStatement, usedToday } from '../domain/brake';
import { write } from '../domain/quota';
import { scopesOfRequest, waitsForApproval } from '../domain/requests';
import { hashToken } from '../domain/session';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';
import { readJson, sessionOf } from './http';

/**
 * As chaves de API da conta, só com a sessão do site (PLANO-API.md, 5.1): uma chave nunca cria nem
 * muda outra. `GET/POST /v1/eu/chaves`, `PATCH/DELETE /v1/eu/chaves/:id` e `DELETE /v1/eu/chaves`
 * (cortar todas).
 */
/**
 * Os pedidos abertos das chaves apagadas (uma, `keyId`, ou todas da conta) ficam recusados. Sempre
 * dentro da conta: o id de uma chave de outra pessoa nunca mexe nos pedidos dela.
 */
export function refuseOpen(userId: string, at: Date, keyId?: string): Statement {
  return {
    sql:
      "UPDATE api_pedidos SET estado = 'recusado', resultado = ?, resolvido_em = ? WHERE usuario_id = ? " +
      `${keyId ? 'AND chave_id = ? ' : ''}AND estado IN ('pendente', 'aguardando-aprovacao')`,
    params: [JSON.stringify({ motivo: 'A chave foi apagada.' }), at.toISOString(), userId, ...(keyId ? [keyId] : [])],
  };
}

const APPROVAL_RANK: Record<Aprovacao, number> = { nunca: 0, mudancas: 1, tudo: 2 };

/**
 * Os pedidos abertos de uma chave que a pessoa acabou de apertar (tirou uma permissão, um grupo, ou
 * passou a pedir aprovação): o pedido que usava a permissão tirada fica recusado; com os grupos
 * apertados, os das Anotações e do Kanban também (a nuvem não sabe de que grupo é cada nota, e uma
 * nota de um grupo tirado não pode mudar); e o pendente que agora espera aprovação passa a esperar
 * (menos o que um aparelho está aplicando agora, que entraria duas vezes). Sem isso, mudar a chave não
 * parava o que ela já tinha pedido.
 */
async function narrowOpen(deps: Deps, before: ApiKey, after: ApiKey, at: Date): Promise<{ statements: Statement[]; rows: number }> {
  const lostScope = before.scopes.some((x) => !after.scopes.includes(x));
  const fold = (list: string[] | null) => (list ? new Set(list.map(dobra)) : null);
  const was = fold(before.groups);
  const now = fold(after.groups);
  const lostGroup = now !== null && (was === null || [...was].some((g) => !now.has(g)));
  const stricter = APPROVAL_RANK[after.approval] > APPROVAL_RANK[before.approval];
  if (!lostScope && !lostGroup && !stricter) return { statements: [], rows: 0 };
  const rows = await deps.db.all<{ id: string; op: string; dados: string; estado: string; pego_ate: string | null }>(
    "SELECT id, op, dados, estado, pego_ate FROM api_pedidos WHERE usuario_id = ? AND chave_id = ? AND estado IN ('pendente', 'aguardando-aprovacao') AND expira_em > ?",
    [after.userId, after.id, at.toISOString()],
  );
  const refuse: string[] = [];
  const hold: string[] = [];
  for (const r of rows) {
    let dados: unknown = null;
    try {
      dados = JSON.parse(r.dados);
    } catch {
      // um pedido que não se lê não ganha passe livre
    }
    const scopeGone = scopesOfRequest(r.op, dados).some((x) => !after.scopes.includes(x));
    const groupGone = lostGroup && (r.op.startsWith('nota.') || (OPS_DO_KANBAN as readonly string[]).includes(r.op));
    if (scopeGone || groupGone) refuse.push(r.id);
    else if (r.estado === 'pendente' && waitsForApproval(after.approval, r.op, dados) && !(r.pego_ate && Date.parse(r.pego_ate) > at.getTime())) hold.push(r.id);
  }
  const marks = (ids: string[]) => ids.map(() => '?').join(', ');
  const out: Statement[] = [];
  if (refuse.length) {
    out.push({
      sql: `UPDATE api_pedidos SET estado = 'recusado', resultado = ?, resolvido_em = ? WHERE usuario_id = ? AND estado IN ('pendente', 'aguardando-aprovacao') AND id IN (${marks(refuse)})`,
      params: [JSON.stringify({ motivo: 'A chave perdeu a permissão deste pedido.' }), at.toISOString(), after.userId, ...refuse],
    });
  }
  if (hold.length) {
    out.push({
      sql: `UPDATE api_pedidos SET estado = 'aguardando-aprovacao' WHERE usuario_id = ? AND estado = 'pendente' AND (pego_ate IS NULL OR pego_ate < ?) AND id IN (${marks(hold)})`,
      params: [after.userId, at.toISOString(), ...hold],
    });
  }
  return { statements: out, rows: refuse.length + hold.length };
}

export function keyRoutes(app: Hono, deps: Deps): void {
  const notFound = () => new HttpError(404, 'chave-nao-encontrada', 'Não achei essa chave nesta conta.');
  const userCode = async (userId: string) =>
    (await deps.db.first<{ codigo: string }>('SELECT codigo FROM usuarios WHERE id = ?', [userId]))?.codigo ?? '';

  app.get('/v1/eu/chaves', async (c) => {
    const s = await sessionOf(deps, c);
    const rows = await deps.db.all<KeyRow & { cliente_id: string | null; retornos: string | null }>(
      `SELECT k.${KEY_COLUMNS.split(', ').join(', k.')}, k.cliente_id, c.retornos FROM api_chaves k ` +
        'LEFT JOIN oauth_clientes c ON c.id = k.cliente_id WHERE k.usuario_id = ? ORDER BY k.criada_em DESC, k.id',
      [s.userId],
    );
    return c.json({
      disponivel: apiAllowed(deps, await userCode(s.userId)),
      chaves: rows.map((r) => keyOut(keyOf(r), r.cliente_id ? { dominio: connectorDomain(r.cliente_id, r.retornos) } : null)),
    });
  });

  app.post('/v1/eu/chaves', async (c) => {
    const s = await sessionOf(deps, c);
    if (!apiAllowed(deps, await userCode(s.userId))) throw apiUnavailable();
    const input = readKeyInput(await readJson(c), true);
    const now = deps.now();
    const live = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM api_chaves WHERE usuario_id = ? AND expira_em > ?', [
      s.userId,
      now.toISOString(),
    ]);
    if ((live?.n ?? 0) >= MAX_CHAVES) {
      throw new HttpError(409, 'chaves-demais', `Já são ${MAX_CHAVES} chaves nesta conta. Apague uma que não usa mais.`);
    }
    if ((await usedToday(deps, s.userId, 'chave', now)) >= MAX_KEYS_PER_DAY) {
      throw new HttpError(429, 'chaves-devagar', 'Muitas chaves criadas hoje. Tente de novo amanhã.');
    }
    const id = newKeyId();
    const secret = newSecret();
    const at = now.toISOString();
    const row: KeyRow = {
      id,
      usuario_id: s.userId,
      nome: input.name!,
      origem: 'manual',
      escopos: JSON.stringify(input.scopes),
      grupos: input.groups ? JSON.stringify(input.groups) : null,
      aprovacao: input.approval!,
      criada_em: at,
      expira_em: expiresIn(now, input.days!),
      usada_em: null,
    };
    await write(
      deps,
      [
        {
          sql: `INSERT INTO api_chaves (${KEY_COLUMNS}, hash) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
          params: [row.id, row.usuario_id, row.nome, row.origem, row.escopos, row.grupos, row.aprovacao, row.criada_em, row.expira_em, null, await hashToken(secret)],
        },
        brakeStatement(s.userId, 'chave', now),
        accessNotice(s.userId, row.id, row.nome, null, at),
      ],
      11,
    );
    // o segredo só existe nesta resposta: a nuvem guarda o hash
    return c.json({ chave: keyOut(keyOf(row)), segredo: secret }, 201);
  });

  app.patch('/v1/eu/chaves/:id', async (c) => {
    const s = await sessionOf(deps, c);
    const id = c.req.param('id');
    if (!KEY_ID_RE.test(id)) throw notFound();
    const input = readKeyInput(await readJson(c), false);
    const current = await deps.db.first<KeyRow>(`SELECT ${KEY_COLUMNS} FROM api_chaves WHERE id = ? AND usuario_id = ?`, [id, s.userId]);
    if (!current) throw notFound();
    const next: KeyRow = {
      ...current,
      ...(input.name !== undefined ? { nome: input.name } : {}),
      ...(input.scopes !== undefined ? { escopos: JSON.stringify(input.scopes) } : {}),
      ...(input.groups !== undefined ? { grupos: input.groups ? JSON.stringify(input.groups) : null } : {}),
      ...(input.approval !== undefined ? { aprovacao: input.approval } : {}),
    };
    const narrowed = await narrowOpen(deps, keyOf(current), keyOf(next), deps.now());
    await write(
      deps,
      [
        {
          sql: 'UPDATE api_chaves SET nome = ?, escopos = ?, grupos = ?, aprovacao = ? WHERE id = ? AND usuario_id = ?',
          params: [next.nome, next.escopos, next.grupos, next.aprovacao, id, s.userId],
        },
        ...narrowed.statements,
      ],
      2 + narrowed.rows,
    );
    return c.json({ chave: keyOut(keyOf(next)) });
  });

  app.delete('/v1/eu/chaves/:id', async (c) => {
    const s = await sessionOf(deps, c);
    const id = c.req.param('id');
    if (!KEY_ID_RE.test(id)) throw notFound();
    const [result] = await write(deps, [{ sql: 'DELETE FROM api_chaves WHERE id = ? AND usuario_id = ?', params: [id, s.userId] }, refuseOpen(s.userId, deps.now(), id)], 8);
    if (!result?.changes) throw notFound();
    return c.json({ ok: true });
  });

  // "Cortar todos os acessos": todas as chaves e conectores da conta, de uma vez
  app.delete('/v1/eu/chaves', async (c) => {
    const s = await sessionOf(deps, c);
    const [result] = await write(deps, [{ sql: 'DELETE FROM api_chaves WHERE usuario_id = ?', params: [s.userId] }, refuseOpen(s.userId, deps.now())], 4 * MAX_CHAVES + 20);
    return c.json({ ok: true, apagadas: result?.changes ?? 0 });
  });
}
