import { Hono } from 'hono';
import { ESTADOS_ABERTOS } from '../../../contrato/api-v1/operacoes';
import { LEASE_MS, REQUEST_COLUMNS, REQUEST_ID_RE, RESULT_MAX_CHARS, openRequests, requestForSite, type RequestRow } from '../domain/requests';
import { write } from '../domain/quota';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson, sessionOf } from './http';

/**
 * Os pedidos, pelo lado do site (PLANO-API.md, 9), só com a sessão: listar (os abertos, para aplicar
 * e aprovar; os resolvidos, para o histórico), pegar um para aplicar (2 minutos, um aparelho por vez),
 * concluir depois de sincronizar, aprovar, recusar e desfazer.
 */
export function requestRoutes(app: Hono, deps: Deps): void {
  const notFound = () => new HttpError(404, 'pedido-nao-encontrado', 'Não achei esse pedido nesta conta.');
  const one = async (userId: string, id: string) =>
    REQUEST_ID_RE.test(id) ? deps.db.first<RequestRow>(`SELECT ${REQUEST_COLUMNS} FROM api_pedidos WHERE id = ? AND usuario_id = ?`, [id, userId]) : null;

  app.get('/v1/eu/pedidos', async (c) => {
    const s = await sessionOf(deps, c);
    const now = deps.now();
    if (c.req.query('estado') === 'historico') {
      const key = c.req.query('chave');
      const rows = await deps.db.all<RequestRow>(
        `SELECT ${REQUEST_COLUMNS} FROM api_pedidos WHERE usuario_id = ? AND estado NOT IN ('pendente', 'aguardando-aprovacao')` +
          `${key ? ' AND chave_id = ?' : ''} ORDER BY COALESCE(resolvido_em, criado_em) DESC, rowid DESC LIMIT 100`,
        key ? [s.userId, key] : [s.userId],
      );
      return c.json({ itens: rows.map((r) => requestForSite(r, now)) });
    }
    return c.json({ itens: (await openRequests(deps, s.userId, 100)).map((r) => requestForSite(r, now)) });
  });

  app.post('/v1/eu/pedidos/:id/pegar', async (c) => {
    const s = await sessionOf(deps, c);
    const body = await readJson(c);
    const device = typeof body['aparelho'] === 'string' && /^[\w-]{4,64}$/.test(body['aparelho']) ? body['aparelho'] : null;
    if (!device) throw new HttpError(400, 'sem-aparelho', 'Faltou dizer qual aparelho pega o pedido.');
    const id = c.req.param('id');
    const now = deps.now();
    const at = now.toISOString();
    const [result] = await write(
      deps,
      [
        {
          sql:
            'UPDATE api_pedidos SET pego_por = ?, pego_ate = ? WHERE id = ? AND usuario_id = ? AND estado = ? AND expira_em > ? ' +
            'AND (pego_ate IS NULL OR pego_ate < ? OR pego_por = ?)',
          params: [device, new Date(now.getTime() + LEASE_MS).toISOString(), id, s.userId, 'pendente', at, at, device],
        },
      ],
      2,
    );
    const row = await one(s.userId, id);
    if (!row) throw notFound();
    if (!result?.changes) throw new HttpError(409, 'pedido-ocupado', 'Outro aparelho está aplicando este pedido (ou ele não está mais pendente).');
    return c.json({ pedido: requestForSite(row, now) });
  });

  // Depois de sincronizar o que aplicou: o resultado de cada pedido (até 50 por vez)
  app.post('/v1/eu/pedidos/concluir', async (c) => {
    const s = await sessionOf(deps, c);
    const body = await readJson(c, 50 * 2 * RESULT_MAX_CHARS + 10_000);
    const items = Array.isArray(body['itens']) ? (body['itens'] as Record<string, unknown>[]) : null;
    if (!items || !items.length || items.length > 50) throw new HttpError(400, 'pedido-invalido', 'Mande de 1 a 50 pedidos em itens.');
    const at = deps.now().toISOString();
    const statements = items.map((it) => {
      const estado = it?.['estado'];
      if (!it || typeof it['id'] !== 'string' || !REQUEST_ID_RE.test(it['id']) || (estado !== 'aplicado' && estado !== 'conflito' && estado !== 'falhou')) {
        throw new HttpError(400, 'pedido-invalido', 'Cada pedido concluído tem id e estado (aplicado, conflito ou falhou).');
      }
      const json = (v: unknown) => {
        if (v === undefined || v === null) return null;
        const t = JSON.stringify(v);
        if (t.length > RESULT_MAX_CHARS) throw new HttpError(413, 'grande-demais', 'O resultado de um pedido é grande demais.');
        return t;
      };
      // o pendente, e também o recusado (a pessoa recusou, ou a chave perdeu a permissão ou foi apagada)
      // enquanto um aparelho já o tinha pego: o aparelho aplicou, e o histórico conta o que de fato
      // aconteceu (com o Desfazer), em vez de "recusado" com a mudança no mural
      return {
        sql:
          'UPDATE api_pedidos SET estado = ?, resultado = ?, antes = ?, resolvido_em = ?, pego_por = NULL, pego_ate = NULL ' +
          "WHERE id = ? AND usuario_id = ? AND (estado = 'pendente' OR (estado = 'recusado' AND pego_por IS NOT NULL))",
        params: [estado, json(it['resultado']), json(it['antes']), at, it['id'], s.userId],
      };
    });
    const results = await write(deps, statements, 3 * statements.length);
    return c.json({ itens: items.map((it, i) => ({ id: it['id'], ok: (results[i]?.changes ?? 0) > 0 })) });
  });

  /** Muda o estado de um pedido de `from` para `to`; responde 409 se ele não estava num dos de `from`. */
  const move = (path: string, from: readonly string[], to: string, message: string) =>
    app.post(`/v1/eu/pedidos/:id/${path}`, async (c) => {
      const s = await sessionOf(deps, c);
      const id = c.req.param('id');
      const at = deps.now().toISOString();
      const [result] = await write(
        deps,
        [
          {
            sql: `UPDATE api_pedidos SET estado = ?, resolvido_em = ${to === 'pendente' ? 'NULL' : '?'} WHERE id = ? AND usuario_id = ? AND estado IN (${from.map(() => '?').join(', ')})`,
            params: [to, ...(to === 'pendente' ? [] : [at]), id, s.userId, ...from],
          },
        ],
        2,
      );
      const row = await one(s.userId, id);
      if (!row) throw notFound();
      if (!result?.changes) throw new HttpError(409, 'pedido-mudou', message);
      return c.json({ pedido: requestForSite(row, deps.now()) });
    });

  move('aprovar', ['aguardando-aprovacao'], 'pendente', 'Este pedido não está mais esperando aprovação.');
  move('recusar', ESTADOS_ABERTOS, 'recusado', 'Este pedido já foi resolvido.');
  // o site já pôs a nota de antes de volta (como uma edição nova); aqui só fica anotado
  move('desfazer', ['aplicado'], 'desfeito', 'Só um pedido aplicado se desfaz.');
}
