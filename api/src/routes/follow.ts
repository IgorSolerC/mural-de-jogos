import { Context, Hono } from 'hono';
import { utcDay, write } from '../domain/quota';
import { Session, authenticate } from '../domain/session';
import { formatCode, normalizeCode } from '../domain/code';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson } from './account';

/**
 * Seguir e o correio. Seguir é de mão única e sem aprovação: guarda o id de quem segue e de quem é
 * seguido (trocar o código não desfaz). Quem é seguido recebe um aviso uma vez só por pessoa; quem
 * segue passa a ver, no correio, as resenhas novas que a pessoa publicar dali em diante.
 *
 * O correio não grava nada por pessoa: as atividades são uma linha por acontecimento (ver
 * `routes/mural.ts`), e cada um lê as suas juntando com quem segue. Conferir se há algo novo
 * (`?depois=`) responde 204, sem corpo, quando não há.
 */

/** Quantas pessoas uma conta segue, no máximo. */
export const MAX_FOLLOWING = 300;
/** Quantas pessoas uma conta começa a seguir por dia UTC (cada uma avisa alguém). */
export const MAX_FOLLOWS_PER_DAY = 60;
/** Seguir de volta até 10 minutos depois de deixar de seguir (o "Desfazer") devolve o seguir de antes. */
export const UNDO_MS = 10 * 60_000;
/** O correio mostra os últimos 30 dias, até 60 itens. */
export const FEED_DAYS = 30;
export const FEED_LIMIT = 60;

const DAY = 86_400_000;

interface Person {
  id: string;
  codigo: string;
  nome: string;
}

interface FeedRow {
  tipo: 'seguiu' | 'resenha';
  criado_em: string;
  ref: string | null;
  resumo: string | null;
  codigo: string;
  nome: string;
  silenciado: number;
  eu_sigo: number;
}

/** Um instante ISO que veio do site, ou null. */
function isoParam(value: unknown): string | null {
  if (typeof value !== 'string' || value.length > 40) return null;
  const t = Date.parse(value);
  return Number.isFinite(t) && /^\d{4}-\d{2}-\d{2}T/.test(value) ? new Date(t).toISOString() : null;
}

function summary(raw: string | null): { titulo: string; mural: string } | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    return typeof data['titulo'] === 'string' && typeof data['mural'] === 'string' ? { titulo: data['titulo'], mural: data['mural'] } : null;
  } catch {
    return null;
  }
}

export function followRoutes(app: Hono, deps: Deps): void {
  const session = (c: Context): Promise<Session> => authenticate(deps, c.req.header('Authorization'));

  /** A pessoa pelo código, ou 404. */
  async function byCode(input: unknown): Promise<Person> {
    const code = typeof input === 'string' ? normalizeCode(input) : null;
    if (!code) throw new HttpError(400, 'codigo-invalido', 'Esse código não existe. Confira: ele tem 8 letras e números.');
    const person = await deps.db.first<Person>('SELECT id, codigo, nome FROM usuarios WHERE codigo = ?', [code]);
    if (!person) throw new HttpError(404, 'pessoa-nao-encontrada', 'Não achei ninguém com esse código. Confira as letras: são 8, entre letras e números.');
    return person;
  }

  const personOut = (p: Pick<Person, 'codigo' | 'nome'>) => ({ codigo: formatCode(p.codigo), nome: p.nome });

  app.post('/v1/seguindo', async (c) => {
    const s = await session(c);
    const body = await readJson(c);
    const target = await byCode(body['codigo']);
    if (target.id === s.userId) throw new HttpError(400, 'seguir-a-si', 'Esse é o seu código. Siga o de outra pessoa.');
    const existing = await deps.db.first<{ criado_em: string; silenciado: number }>(
      'SELECT criado_em, silenciado FROM seguindo WHERE seguidor_id = ? AND seguido_id = ?',
      [s.userId, target.id],
    );
    if (existing) return c.json({ pessoa: personOut(target), desde: existing.criado_em, silenciado: !!existing.silenciado });

    const now = deps.now();
    const today = `${utcDay(now)}T00:00:00.000Z`;
    // O limite do dia conta as pessoas DISTINTAS que comecei a seguir hoje, mesmo as que já deixei de
    // seguir (o aviso delas já foi): senão, seguir e deixar de seguir abriria vaga sem fim. Seguir de
    // novo quem já recebeu o aviso (o "Desfazer") não avisa ninguém, então não gasta o limite.
    const counts = await deps.db.first<{ total: number; hoje: number; avisada: number }>(
      'SELECT (SELECT COUNT(*) FROM seguindo WHERE seguidor_id = ?) AS total, ' +
        '(SELECT COUNT(*) FROM (' +
        "SELECT alvo_id FROM atividades WHERE tipo = 'seguiu' AND autor_id = ? AND criado_em >= ? " +
        'UNION SELECT seguido_id FROM seguindo WHERE seguidor_id = ? AND criado_em >= ?)) AS hoje, ' +
        "(SELECT COUNT(*) FROM atividades WHERE tipo = 'seguiu' AND autor_id = ? AND alvo_id = ?) AS avisada",
      [s.userId, s.userId, today, s.userId, today, s.userId, target.id],
    );
    if ((counts?.total ?? 0) >= MAX_FOLLOWING) {
      throw new HttpError(429, 'seguindo-demais', `Você já segue ${MAX_FOLLOWING} pessoas, o máximo. Deixe de seguir alguém antes.`);
    }
    if (!counts?.avisada && (counts?.hoje ?? 0) >= MAX_FOLLOWS_PER_DAY) {
      throw new HttpError(429, 'seguir-devagar', 'Você começou a seguir muita gente hoje. Tente de novo amanhã.');
    }
    const at = now.toISOString();
    // deixou de seguir há pouco (o "Desfazer"): volta como era
    const undone = await deps.db.first<{ criado_em: string; silenciado: number }>(
      'SELECT criado_em, silenciado FROM seguindo_desfeito WHERE seguidor_id = ? AND seguido_id = ? AND desfeito_em >= ?',
      [s.userId, target.id, new Date(now.getTime() - UNDO_MS).toISOString()],
    );
    const muted = undone?.silenciado ? 1 : 0;
    await write(
      deps,
      [
        {
          sql: 'INSERT OR IGNORE INTO seguindo (seguidor_id, seguido_id, criado_em, silenciado) VALUES (?, ?, ?, ?)',
          params: [s.userId, target.id, at, muted],
        },
        { sql: 'DELETE FROM seguindo_desfeito WHERE seguidor_id = ? AND seguido_id = ?', params: [s.userId, target.id] },
        // o aviso para quem foi seguido: uma vez só por pessoa (o índice único ignora a repetição)
        {
          sql: "INSERT OR IGNORE INTO atividades (tipo, autor_id, alvo_id, criado_em) VALUES ('seguiu', ?, ?, ?)",
          params: [s.userId, target.id, at],
        },
      ],
      11,
    );
    return c.json({ pessoa: personOut(target), desde: at, silenciado: !!muted }, 201);
  });

  app.delete('/v1/seguindo/:codigo', async (c) => {
    const s = await session(c);
    const target = await byCode(c.req.param('codigo'));
    await write(
      deps,
      [
        // guarda o seguir de antes para o "Desfazer" (ver UNDO_MS)
        {
          sql:
            'INSERT OR REPLACE INTO seguindo_desfeito (seguidor_id, seguido_id, criado_em, silenciado, desfeito_em) ' +
            'SELECT seguidor_id, seguido_id, criado_em, silenciado, ? FROM seguindo WHERE seguidor_id = ? AND seguido_id = ?',
          params: [deps.now().toISOString(), s.userId, target.id],
        },
        { sql: 'DELETE FROM seguindo WHERE seguidor_id = ? AND seguido_id = ?', params: [s.userId, target.id] },
      ],
      6,
    );
    return c.json({ ok: true });
  });

  app.patch('/v1/seguindo/:codigo', async (c) => {
    const s = await session(c);
    const target = await byCode(c.req.param('codigo'));
    const body = await readJson(c);
    if (typeof body['silenciado'] !== 'boolean') throw new HttpError(400, 'sem-silenciado', 'Faltou dizer se é para silenciar.');
    const [result] = await write(
      deps,
      [{ sql: 'UPDATE seguindo SET silenciado = ? WHERE seguidor_id = ? AND seguido_id = ?', params: [body['silenciado'] ? 1 : 0, s.userId, target.id] }],
      2,
    );
    if (!result || result.changes === 0) throw new HttpError(404, 'nao-segue', 'Você não segue essa pessoa.');
    return c.json({ pessoa: personOut(target), silenciado: body['silenciado'] });
  });

  /** Tirar alguém da lista de quem me segue (ele pode seguir de novo, mas sem aviso novo). */
  app.delete('/v1/eu/seguidores/:codigo', async (c) => {
    const s = await session(c);
    const follower = await byCode(c.req.param('codigo'));
    await write(deps, [{ sql: 'DELETE FROM seguindo WHERE seguidor_id = ? AND seguido_id = ?', params: [follower.id, s.userId] }], 3);
    return c.json({ ok: true });
  });

  /** As duas listas numa chamada só: quem eu sigo e quem me segue. */
  app.get('/v1/eu/pessoas', async (c) => {
    const s = await session(c);
    const following = await deps.db.all<{ codigo: string; nome: string; criado_em: string; silenciado: number; rev: number | null; me_segue: number }>(
      'SELECT u.codigo, u.nome, s.criado_em, s.silenciado, p.rev, ' +
        '(SELECT COUNT(*) FROM seguindo r WHERE r.seguidor_id = u.id AND r.seguido_id = ?) AS me_segue ' +
        'FROM seguindo s JOIN usuarios u ON u.id = s.seguido_id LEFT JOIN murais_publicos p ON p.usuario_id = u.id ' +
        'WHERE s.seguidor_id = ? ORDER BY s.criado_em DESC LIMIT ?',
      [s.userId, s.userId, MAX_FOLLOWING],
    );
    const followers = await deps.db.all<{ codigo: string; nome: string; criado_em: string; eu_sigo: number }>(
      'SELECT u.codigo, u.nome, s.criado_em, ' +
        '(SELECT COUNT(*) FROM seguindo r WHERE r.seguidor_id = ? AND r.seguido_id = u.id) AS eu_sigo ' +
        'FROM seguindo s JOIN usuarios u ON u.id = s.seguidor_id WHERE s.seguido_id = ? ORDER BY s.criado_em DESC LIMIT 1000',
      [s.userId, s.userId],
    );
    return c.json({
      seguindo: following.map((p) => ({ ...personOut(p), desde: p.criado_em, silenciado: !!p.silenciado, rev: p.rev ?? null, meSegue: !!p.me_segue })),
      seguidores: followers.map((p) => ({ ...personOut(p), desde: p.criado_em, euSigo: !!p.eu_sigo })),
    });
  });

  app.get('/v1/eu/notificacoes', async (c) => {
    const s = await session(c);
    const now = deps.now();
    const floor = new Date(now.getTime() - FEED_DAYS * DAY).toISOString();
    const after = isoParam(c.req.query('depois'));
    // as duas fontes: quem começou a me seguir (e ainda segue) e as resenhas de quem eu sigo,
    // publicadas depois que comecei a seguir
    const feed = (since: string, limit: number) =>
      deps.db.all<FeedRow>(
        "SELECT 'seguiu' AS tipo, a.criado_em AS criado_em, NULL AS ref, NULL AS resumo, u.codigo, u.nome, 0 AS silenciado, " +
          '(SELECT COUNT(*) FROM seguindo b WHERE b.seguidor_id = ? AND b.seguido_id = a.autor_id) AS eu_sigo ' +
          'FROM atividades a JOIN usuarios u ON u.id = a.autor_id ' +
          'JOIN seguindo f ON f.seguidor_id = a.autor_id AND f.seguido_id = a.alvo_id ' +
          "WHERE a.tipo = 'seguiu' AND a.alvo_id = ? AND a.criado_em > ? " +
          'UNION ALL ' +
          "SELECT 'resenha' AS tipo, a.criado_em AS criado_em, a.ref, a.resumo, u.codigo, u.nome, s.silenciado, 1 AS eu_sigo " +
          'FROM seguindo s JOIN atividades a ON a.autor_id = s.seguido_id ' +
          "JOIN usuarios u ON u.id = a.autor_id WHERE s.seguidor_id = ? AND a.tipo = 'resenha' AND a.criado_em > s.criado_em AND a.criado_em > ? " +
          'ORDER BY criado_em DESC LIMIT ?',
        [s.userId, s.userId, since, s.userId, since, limit],
      );
    if (after) {
      const fresh = await feed(after > floor ? after : floor, 1);
      if (!fresh.length) return c.body(null, 204);
    }
    const rows = await feed(floor, FEED_LIMIT);
    const user = await deps.db.first<{ notificacoes_vistas_em: string | null; criado_em: string }>(
      'SELECT notificacoes_vistas_em, criado_em FROM usuarios WHERE id = ?',
      [s.userId],
    );
    const seenAt = user?.notificacoes_vistas_em ?? user?.criado_em ?? floor;
    return c.json({
      itens: rows.map((r) => {
        const base = { tipo: r.tipo, em: r.criado_em, pessoa: personOut(r) };
        if (r.tipo === 'seguiu') return { ...base, euSigo: !!r.eu_sigo };
        const sum = summary(r.resumo);
        return { ...base, ref: r.ref, titulo: sum?.titulo ?? '', mural: sum?.mural ?? 'jogos', silenciado: !!r.silenciado };
      }),
      vistasEm: seenAt,
      naoVistas: rows.filter((r) => r.criado_em > seenAt && !r.silenciado).length,
    });
  });

  /** Marca como visto tudo até `ate` (o item mais novo que o site mostrou). */
  app.post('/v1/eu/notificacoes/vistas', async (c) => {
    const s = await session(c);
    const body = await readJson(c);
    const now = deps.now().toISOString();
    const until = isoParam(body['ate']);
    if (!until) throw new HttpError(400, 'sem-data', 'Faltou dizer até quando foi visto.');
    const at = until > now ? now : until;
    await write(
      deps,
      [
        {
          sql: 'UPDATE usuarios SET notificacoes_vistas_em = ? WHERE id = ? AND (notificacoes_vistas_em IS NULL OR notificacoes_vistas_em < ?)',
          params: [at, s.userId, at],
        },
      ],
      2,
    );
    return c.json({ vistasEm: at });
  });
}
