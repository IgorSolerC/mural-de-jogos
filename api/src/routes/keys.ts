import { Hono } from 'hono';
import { MAX_CHAVES } from '../../../contrato/api-v1/escopos';
import {
  KEY_COLUMNS,
  KEY_ID_RE,
  KeyRow,
  MAX_KEYS_PER_DAY,
  apiAllowed,
  apiUnavailable,
  expiresIn,
  keyOf,
  keyOut,
  newKeyId,
  newSecret,
  readKeyInput,
} from '../domain/api-key';
import { brakeStatement, usedToday } from '../domain/brake';
import { write } from '../domain/quota';
import { hashToken } from '../domain/session';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson, sessionOf } from './http';

/**
 * As chaves de API da conta, só com a sessão do site (PLANO-API.md, 5.1): uma chave nunca cria nem
 * muda outra. `GET/POST /v1/eu/chaves`, `PATCH/DELETE /v1/eu/chaves/:id` e `DELETE /v1/eu/chaves`
 * (cortar todas).
 */
export function keyRoutes(app: Hono, deps: Deps): void {
  const notFound = () => new HttpError(404, 'chave-nao-encontrada', 'Não achei essa chave nesta conta.');
  const userCode = async (userId: string) =>
    (await deps.db.first<{ codigo: string }>('SELECT codigo FROM usuarios WHERE id = ?', [userId]))?.codigo ?? '';

  app.get('/v1/eu/chaves', async (c) => {
    const s = await sessionOf(deps, c);
    const rows = await deps.db.all<KeyRow>(`SELECT ${KEY_COLUMNS} FROM api_chaves WHERE usuario_id = ? ORDER BY criada_em DESC, id`, [s.userId]);
    return c.json({ disponivel: apiAllowed(deps, await userCode(s.userId)), chaves: rows.map((r) => keyOut(keyOf(r))) });
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
      ],
      6,
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
    await write(
      deps,
      [
        {
          sql: 'UPDATE api_chaves SET nome = ?, escopos = ?, grupos = ?, aprovacao = ? WHERE id = ? AND usuario_id = ?',
          params: [next.nome, next.escopos, next.grupos, next.aprovacao, id, s.userId],
        },
      ],
      2,
    );
    return c.json({ chave: keyOut(keyOf(next)) });
  });

  app.delete('/v1/eu/chaves/:id', async (c) => {
    const s = await sessionOf(deps, c);
    const id = c.req.param('id');
    if (!KEY_ID_RE.test(id)) throw notFound();
    const [result] = await write(deps, [{ sql: 'DELETE FROM api_chaves WHERE id = ? AND usuario_id = ?', params: [id, s.userId] }], 4);
    if (!result?.changes) throw notFound();
    return c.json({ ok: true });
  });

  // "Cortar todos os acessos": todas as chaves e conectores da conta, de uma vez
  app.delete('/v1/eu/chaves', async (c) => {
    const s = await sessionOf(deps, c);
    const [result] = await write(deps, [{ sql: 'DELETE FROM api_chaves WHERE usuario_id = ?', params: [s.userId] }], 4 * MAX_CHAVES);
    return c.json({ ok: true, apagadas: result?.changes ?? 0 });
  });
}
