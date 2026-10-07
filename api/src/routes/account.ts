import { Context, Hono } from 'hono';
import { formatCode, generateCode } from '../domain/code';
import { cleanName } from '../domain/name';
import { write } from '../domain/quota';
import { MAX_SESSIONS, Session, authenticate, hashToken, newToken, sessionStatements } from '../domain/session';
import { HttpError } from '../errors';
import { Deps, Statement } from '../ports';

const DAY = 86_400_000;

/** Lê o corpo JSON com limite de tamanho; um corpo que não é objeto vira `{}`. */
export async function readJson(c: Context, maxBytes = 16_384): Promise<Record<string, unknown>> {
  const text = await c.req.text();
  if (text.length > maxBytes) throw new HttpError(413, 'grande-demais', 'O pedido é grande demais.');
  if (!text) return {};
  try {
    const data: unknown = JSON.parse(text);
    return data && typeof data === 'object' && !Array.isArray(data) ? (data as Record<string, unknown>) : {};
  } catch {
    throw new HttpError(400, 'json-invalido', 'O pedido não é um JSON válido.');
  }
}

interface UserRow {
  id: string;
  codigo: string;
  nome: string;
  criado_em: string;
}

/** Login, sessões e a própria conta: /v1/auth/* e /v1/eu. */
export function accountRoutes(app: Hono, deps: Deps): void {
  const session = (c: Context): Promise<Session> => authenticate(deps, c.req.header('Authorization'));
  const account = (u: Pick<UserRow, 'id' | 'codigo' | 'nome'>) => ({ id: u.id, codigo: formatCode(u.codigo), nome: u.nome });
  const findBySub = (sub: string) =>
    deps.db.first<UserRow>('SELECT id, codigo, nome, criado_em FROM usuarios WHERE google_sub = ?', [sub]);

  app.post('/v1/auth/google', async (c) => {
    const body = await readJson(c);
    if (typeof body['credential'] !== 'string' || body['credential'].length > 8_192) {
      throw new HttpError(400, 'sem-credencial', 'Faltou o login do Google.');
    }
    const google = await deps.verifyGoogle(body['credential']);
    const device = typeof body['aparelho'] === 'string' ? body['aparelho'].slice(0, 60) || null : null;
    const now = deps.now();
    const token = newToken();
    const hash = await hashToken(token);

    let user = await findBySub(google.sub);
    let created = false;
    if (user) {
      // freio: no máximo MAX_SESSIONS logins por conta em 24 horas (cada um grava algumas linhas)
      const recent = await deps.db.first<{ n: number }>(
        'SELECT COUNT(*) AS n FROM sessoes WHERE usuario_id = ? AND criada_em > ?',
        [user.id, new Date(now.getTime() - DAY).toISOString()],
      );
      if ((recent?.n ?? 0) >= MAX_SESSIONS) {
        throw new HttpError(429, 'muitos-logins', 'Muitos logins nesta conta hoje. Tente de novo amanhã.');
      }
      await write(deps, sessionStatements(hash, user.id, device, now), 6);
    } else {
      const name = cleanName(body['nome']) ?? cleanName(google.givenName) ?? 'Sem nome';
      const id = crypto.randomUUID();
      const code = await freeCode(deps);
      const statements: Statement[] = [
        {
          sql: 'INSERT INTO usuarios (id, google_sub, codigo, nome, criado_em) VALUES (?, ?, ?, ?, ?)',
          params: [id, google.sub, code, name, now.toISOString()],
        },
        ...sessionStatements(hash, id, device, now),
      ];
      try {
        await write(deps, statements, 10);
        user = { id, codigo: code, nome: name, criado_em: now.toISOString() };
        created = true;
      } catch (error) {
        // dois primeiros logins ao mesmo tempo: o outro criou a conta; entra nela
        user = await findBySub(google.sub);
        if (!user || error instanceof HttpError) throw error;
        await write(deps, sessionStatements(hash, user.id, device, now), 6);
      }
    }
    return c.json({ token, conta: { ...account(user), nova: created } });
  });

  app.post('/v1/auth/sair', async (c) => {
    const s = await session(c);
    await write(deps, [{ sql: 'DELETE FROM sessoes WHERE hash = ?', params: [s.hash] }], 3);
    return c.json({ ok: true });
  });

  app.post('/v1/auth/sair-de-todos', async (c) => {
    const s = await session(c);
    await write(deps, [{ sql: 'DELETE FROM sessoes WHERE usuario_id = ?', params: [s.userId] }], 3 * MAX_SESSIONS);
    return c.json({ ok: true });
  });

  app.get('/v1/eu', async (c) => {
    const s = await session(c);
    const user = await deps.db.first<UserRow & { seguidores: number; seguindo: number }>(
      'SELECT id, codigo, nome, criado_em, ' +
        '(SELECT COUNT(*) FROM seguindo WHERE seguido_id = usuarios.id) AS seguidores, ' +
        '(SELECT COUNT(*) FROM seguindo WHERE seguidor_id = usuarios.id) AS seguindo ' +
        'FROM usuarios WHERE id = ?',
      [s.userId],
    );
    if (!user) throw new HttpError(401, 'sessao-invalida', 'Sua sessão acabou. Entre de novo para usar a nuvem.');
    return c.json({ ...account(user), criadoEm: user.criado_em, seguidores: user.seguidores, seguindo: user.seguindo });
  });

  app.patch('/v1/eu', async (c) => {
    const s = await session(c);
    const name = cleanName((await readJson(c))['nome']);
    if (!name) throw new HttpError(400, 'nome-invalido', 'Escreva um nome de 1 a 40 caracteres.');
    await write(deps, [{ sql: 'UPDATE usuarios SET nome = ? WHERE id = ?', params: [name, s.userId] }], 2);
    return c.json({ nome: name });
  });

  app.delete('/v1/eu', async (c) => {
    const s = await session(c);
    const id = s.userId;
    const counts = await deps.db.first<{ n: number }>(
      'SELECT (SELECT COUNT(*) FROM sessoes WHERE usuario_id = ?) + ' +
        '(SELECT COUNT(*) FROM seguindo WHERE seguidor_id = ? OR seguido_id = ?) + ' +
        '(SELECT COUNT(*) FROM seguindo_desfeito WHERE seguidor_id = ? OR seguido_id = ?) + ' +
        '(SELECT COUNT(*) FROM atividades WHERE autor_id = ? OR alvo_id = ?) + ' +
        '(SELECT COUNT(*) FROM reacoes WHERE autor_id = ? OR dono_id = ?) AS n',
      [id, id, id, id, id, id, id, id, id],
    );
    await write(
      deps,
      [
        { sql: 'DELETE FROM sessoes WHERE usuario_id = ?', params: [id] },
        { sql: 'DELETE FROM murais WHERE usuario_id = ?', params: [id] },
        { sql: 'DELETE FROM murais_publicos WHERE usuario_id = ?', params: [id] },
        { sql: 'DELETE FROM seguindo WHERE seguidor_id = ? OR seguido_id = ?', params: [id, id] },
        { sql: 'DELETE FROM seguindo_desfeito WHERE seguidor_id = ? OR seguido_id = ?', params: [id, id] },
        { sql: 'DELETE FROM atividades WHERE autor_id = ? OR alvo_id = ?', params: [id, id] },
        { sql: 'DELETE FROM reacoes WHERE autor_id = ? OR dono_id = ?', params: [id, id] },
        { sql: 'DELETE FROM usuarios WHERE id = ?', params: [id] },
      ],
      3 * ((counts?.n ?? 0) + 3),
      { ignoreBudget: true },
    );
    return c.json({ ok: true });
  });
}

/** Um código que ninguém usa ainda (com 1,1 trilhão de combinações, quase sempre o primeiro). */
async function freeCode(deps: Deps): Promise<string> {
  for (let i = 0; i < 5; i++) {
    const code = generateCode();
    if (!(await deps.db.first('SELECT 1 AS x FROM usuarios WHERE codigo = ?', [code]))) return code;
  }
  throw new HttpError(503, 'codigo-indisponivel', 'Não consegui criar um código agora. Tente de novo.');
}
