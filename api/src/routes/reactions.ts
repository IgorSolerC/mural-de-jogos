import { Context, Hono } from 'hono';
import { write } from '../domain/quota';
import { Session, authenticate } from '../domain/session';
import { formatCode, normalizeCode } from '../domain/code';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson } from './account';

/**
 * Reações às resenhas, como as do WhatsApp: uma por pessoa por resenha (trocar substitui, dá para
 * tirar). Só reage quem segue o dono; quem vê o mural dele vê todas, com o nome de quem reagiu. O dono
 * recebe um aviso no correio (atividade 'reagiu'); trocar de reação avisa de novo, tirar apaga o aviso.
 */

/** As reações que existem. O site tem a mesma lista (core/reactions.ts). */
export const REACTIONS = ['amei', 'fogo', 'rindo', 'uau', 'chorei', 'hmm', 'nao-curti'] as const;
/** Quantas reações (novas ou trocadas) uma conta dá em 24 horas. */
export const MAX_REACTIONS_PER_DAY = 300;
/** Quantas reações o mural de alguém devolve, as mais novas. */
export const MAX_REACTIONS_LISTED = 3000;

const DAY = 86_400_000;

/** O título da resenha no aviso: sem invisíveis, espaços juntos, até 120 caracteres. */
function cleanTitle(input: unknown): string {
  if (typeof input !== 'string') return '';
  return Array.from(input.replace(/[\p{Cc}\p{Cf}]/gu, '').replace(/\s+/g, ' ').trim()).slice(0, 120).join('').trim();
}

export function reactionRoutes(app: Hono, deps: Deps): void {
  const session = (c: Context): Promise<Session> => authenticate(deps, c.req.header('Authorization'));

  /** O dono da resenha pelo código, ou 404. */
  async function owner(input: string): Promise<{ id: string; codigo: string }> {
    const code = normalizeCode(input);
    const found = code ? await deps.db.first<{ id: string; codigo: string }>('SELECT id, codigo FROM usuarios WHERE codigo = ?', [code]) : null;
    if (!found) throw new HttpError(404, 'pessoa-nao-encontrada', 'Não achei ninguém com esse código.');
    return found;
  }

  function refParam(c: Context): string {
    const ref = c.req.param('ref') ?? '';
    if (!/^[\w-]{4,64}$/.test(ref)) throw new HttpError(400, 'resenha-invalida', 'Essa resenha não existe.');
    return ref;
  }

  /** Quem reagiu a cada resenha do mural da pessoa, as mais novas primeiro. */
  app.get('/v1/murais/:codigo/reacoes', async (c) => {
    if (deps.config.publicMurals === 'logados') await session(c);
    const who = await owner(c.req.param('codigo'));
    const rows = await deps.db.all<{ ref: string; reacao: string; criado_em: string; codigo: string; nome: string }>(
      'SELECT r.ref, r.reacao, r.criado_em, u.codigo, u.nome FROM reacoes r JOIN usuarios u ON u.id = r.autor_id ' +
        'WHERE r.dono_id = ? ORDER BY r.criado_em DESC LIMIT ?',
      [who.id, MAX_REACTIONS_LISTED],
    );
    const out: Record<string, { codigo: string; nome: string; reacao: string; em: string }[]> = {};
    for (const r of rows) (out[r.ref] ??= []).push({ codigo: formatCode(r.codigo), nome: r.nome, reacao: r.reacao, em: r.criado_em });
    return c.json({ reacoes: out });
  });

  /** Reagir (ou trocar a reação) à resenha `ref` do mural de `codigo`. */
  app.put('/v1/murais/:codigo/reacoes/:ref', async (c) => {
    const s = await session(c);
    const who = await owner(c.req.param('codigo'));
    const ref = refParam(c);
    const body = await readJson(c);
    const reaction = body['reacao'];
    if (typeof reaction !== 'string' || !(REACTIONS as readonly string[]).includes(reaction)) {
      throw new HttpError(400, 'reacao-invalida', 'Essa reação não existe.');
    }
    if (who.id === s.userId) throw new HttpError(400, 'reagir-a-si', 'Essa resenha é sua.');
    const follows = await deps.db.first('SELECT 1 AS x FROM seguindo WHERE seguidor_id = ? AND seguido_id = ?', [s.userId, who.id]);
    if (!follows) throw new HttpError(403, 'reagir-sem-seguir', 'Siga a pessoa para reagir às resenhas dela.');
    const now = deps.now();
    const before = await deps.db.first<{ reacao: string }>('SELECT reacao FROM reacoes WHERE dono_id = ? AND ref = ? AND autor_id = ?', [who.id, ref, s.userId]);
    if (before?.reacao === reaction) return c.json({ reacao: reaction });
    const today = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM reacoes WHERE autor_id = ? AND criado_em >= ?', [
      s.userId,
      new Date(now.getTime() - DAY).toISOString(),
    ]);
    if ((today?.n ?? 0) >= MAX_REACTIONS_PER_DAY) throw new HttpError(429, 'reagir-devagar', 'Você reagiu a muita coisa hoje. Tente de novo amanhã.');
    const mural = typeof body['mural'] === 'string' && /^[a-z]{2,20}$/.test(body['mural']) ? body['mural'] : 'jogos';
    const resumo = JSON.stringify({ titulo: cleanTitle(body['titulo']), mural, reacao: reaction });
    const at = now.toISOString();
    await write(
      deps,
      [
        {
          sql: 'INSERT OR REPLACE INTO reacoes (dono_id, ref, autor_id, reacao, criado_em) VALUES (?, ?, ?, ?, ?)',
          params: [who.id, ref, s.userId, reaction, at],
        },
        // o aviso: o de antes sai e entra o novo, com a reação de agora
        { sql: "DELETE FROM atividades WHERE tipo = 'reagiu' AND autor_id = ? AND alvo_id = ? AND ref = ?", params: [s.userId, who.id, ref] },
        {
          sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, ref, resumo, criado_em) VALUES ('reagiu', ?, ?, ?, ?, ?)",
          params: [s.userId, who.id, ref, resumo, at],
        },
      ],
      12,
    );
    return c.json({ reacao: reaction }, before ? 200 : 201);
  });

  /** Tirar a reação (e o aviso dela). */
  app.delete('/v1/murais/:codigo/reacoes/:ref', async (c) => {
    const s = await session(c);
    const who = await owner(c.req.param('codigo'));
    const ref = refParam(c);
    await write(
      deps,
      [
        { sql: 'DELETE FROM reacoes WHERE dono_id = ? AND ref = ? AND autor_id = ?', params: [who.id, ref, s.userId] },
        { sql: "DELETE FROM atividades WHERE tipo = 'reagiu' AND autor_id = ? AND alvo_id = ? AND ref = ?", params: [s.userId, who.id, ref] },
      ],
      6,
    );
    return c.json({ ok: true });
  });
}
