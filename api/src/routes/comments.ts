import { Context, Hono } from 'hono';
import { brakeStatement, usedToday } from '../domain/brake';
import { formatCode, normalizeCode } from '../domain/code';
import { COMMENT_ID_RE, COMMENT_MAX, CommentsFrom, cleanComment } from '../domain/comment';
import { photoOut } from '../domain/photo';
import { write } from '../domain/quota';
import { isReaction } from '../domain/reaction';
import { MURAL_RE, REF_RE, cleanTitle } from '../domain/review';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson, sessionOf } from './http';
import { MAX_REACTIONS_PER_DAY } from './reactions';

/**
 * Comentários nas fichas publicadas (resenhas e anotações) e as reações a cada comentário.
 *
 * Comenta quem segue o dono, como nas reações; se o dono preferir, só quem ele segue
 * (`usuarios.comentarios_de`, trocado no `PATCH /v1/eu`). O dono sempre comenta nas próprias fichas.
 * Quem vê o mural vê os comentários. O texto leva as marcas de formatação do site e fica guardado como veio (limpo, até
 * `COMMENT_MAX` caracteres). Quem escreveu apaga o seu; o dono da ficha apaga qualquer um dela.
 *
 * O dono recebe um aviso no correio (atividade 'comentou'), um por pessoa e ficha: comentar de novo na
 * mesma ficha troca o aviso pelo de agora, e apagar o último comentário da pessoa ali apaga o aviso.
 *
 * Reagir a um comentário é como reagir a uma ficha (uma por pessoa, trocar substitui, dá para tirar),
 * para quem pode comentar ali, e não avisa ninguém. Conta no mesmo freio das reações às fichas.
 */

/** Quantos comentários uma conta escreve em 24 horas, contando os apagados depois (ver `domain/brake.ts`). */
export const MAX_COMMENTS_PER_DAY = 100;
/** Quantos comentários uma ficha devolve, os mais novos. */
export const MAX_COMMENTS_LISTED = 200;
/** Quantas fichas com comentários a contagem do mural devolve, e quantas reações uma ficha devolve. */
const MAX_CARDS_COUNTED = 3000;
const MAX_REACTIONS_LISTED = 3000;

interface Owner {
  id: string;
  nome: string;
  comentarios_de: string;
}

interface CommentRow {
  id: string;
  texto: string;
  criado_em: string;
  codigo: string;
  nome: string;
  foto: string | null;
}

interface ReactionOut {
  codigo: string;
  nome: string;
  reacao: string;
  em: string;
}

const fromOf = (o: Pick<Owner, 'comentarios_de'>): CommentsFrom => (o.comentarios_de === 'seguidos' ? 'seguidos' : 'seguidores');

function commentOut(r: CommentRow, reactions: ReactionOut[]) {
  const foto = photoOut(r.foto);
  return { id: r.id, autor: { codigo: formatCode(r.codigo), nome: r.nome, ...(foto ? { foto } : {}) }, texto: r.texto, em: r.criado_em, reacoes: reactions };
}

export function commentRoutes(app: Hono, deps: Deps): void {
  const session = (c: Context) => sessionOf(deps, c);

  /**
   * Quem está olhando, se disse quem é: só muda o `pode` da resposta. Uma sessão que não vale mais
   * conta como ninguém (com `VER_MURAIS=logados`, a sessão é obrigatória, como no mural).
   */
  async function viewer(c: Context): Promise<string | null> {
    if (deps.config.publicMurals === 'logados') return (await session(c)).userId;
    if (!c.req.header('Authorization')) return null;
    return (await session(c).catch(() => null))?.userId ?? null;
  }

  /** O dono da ficha pelo código, ou 404. */
  async function owner(input: string): Promise<Owner> {
    const code = normalizeCode(input);
    const found = code ? await deps.db.first<Owner>('SELECT id, nome, comentarios_de FROM usuarios WHERE codigo = ?', [code]) : null;
    if (!found) throw new HttpError(404, 'pessoa-nao-encontrada', 'Não achei ninguém com esse código.');
    return found;
  }

  function refParam(c: Context): string {
    const ref = c.req.param('ref') ?? '';
    if (!REF_RE.test(ref)) throw new HttpError(400, 'resenha-invalida', 'Essa ficha não existe.');
    return ref;
  }

  /** O comentário pelo id, com o dono da ficha, ou 404. */
  async function comment(c: Context): Promise<{ id: string; dono_id: string; ref: string; autor_id: string; dono: Owner }> {
    const id = c.req.param('id') ?? '';
    const found = COMMENT_ID_RE.test(id)
      ? await deps.db.first<{ id: string; dono_id: string; ref: string; autor_id: string; nome: string; comentarios_de: string }>(
          'SELECT k.id, k.dono_id, k.ref, k.autor_id, d.nome, d.comentarios_de FROM comentarios k JOIN usuarios d ON d.id = k.dono_id WHERE k.id = ?',
          [id],
        )
      : null;
    if (!found) throw new HttpError(404, 'comentario-nao-encontrado', 'Esse comentário não existe mais.');
    return { id: found.id, dono_id: found.dono_id, ref: found.ref, autor_id: found.autor_id, dono: { id: found.dono_id, nome: found.nome, comentarios_de: found.comentarios_de } };
  }

  /** `userId` pode comentar (e reagir aos comentários) nas fichas de `who`? */
  async function allowed(who: Owner, userId: string | null): Promise<boolean> {
    if (!userId) return false;
    if (userId === who.id) return true;
    // quem segue quem: a pessoa segue o dono, ou (se ele escolheu assim) o dono segue a pessoa
    const [follower, followed] = fromOf(who) === 'seguidos' ? [who.id, userId] : [userId, who.id];
    return !!(await deps.db.first('SELECT 1 AS x FROM seguindo WHERE seguidor_id = ? AND seguido_id = ?', [follower, followed]));
  }

  /** A recusa, dizendo o que falta: seguir a pessoa, ou ser seguido por ela. */
  const refusal = (who: Owner) =>
    fromOf(who) === 'seguidos'
      ? new HttpError(403, 'comentar-so-seguidos', `Aqui só comenta quem ${who.nome} segue.`)
      : new HttpError(403, 'comentar-sem-seguir', 'Siga a pessoa para comentar nas fichas dela.');

  /** Quantos comentários cada ficha do mural da pessoa tem, quem pode comentar ali e se quem pergunta pode. */
  app.get('/v1/murais/:codigo/comentarios', async (c) => {
    const me = await viewer(c);
    const who = await owner(c.req.param('codigo'));
    const rows = await deps.db.all<{ ref: string; n: number }>('SELECT ref, COUNT(*) AS n FROM comentarios WHERE dono_id = ? GROUP BY ref LIMIT ?', [
      who.id,
      MAX_CARDS_COUNTED,
    ]);
    return c.json({ contagem: Object.fromEntries(rows.map((r) => [r.ref, r.n])), quem: fromOf(who), pode: await allowed(who, me) });
  });

  /** Os comentários da ficha `ref`, do mais antigo para o mais novo (os `MAX_COMMENTS_LISTED` mais novos), com as reações de cada um. */
  app.get('/v1/murais/:codigo/comentarios/:ref', async (c) => {
    const me = await viewer(c);
    const who = await owner(c.req.param('codigo'));
    const ref = refParam(c);
    const rows = await deps.db.all<CommentRow>(
      'SELECT k.id, k.texto, k.criado_em, u.codigo, u.nome, u.foto FROM comentarios k JOIN usuarios u ON u.id = k.autor_id ' +
        'WHERE k.dono_id = ? AND k.ref = ? ORDER BY k.criado_em DESC, k.rowid DESC LIMIT ?',
      [who.id, ref, MAX_COMMENTS_LISTED + 1],
    );
    const older = rows.length > MAX_COMMENTS_LISTED;
    const shown = rows.slice(0, MAX_COMMENTS_LISTED).reverse();
    const reactions = shown.length
      ? await deps.db.all<ReactionOut & { comentario_id: string }>(
          'SELECT r.comentario_id, r.reacao, r.criado_em AS em, u.codigo, u.nome FROM comentario_reacoes r ' +
            'JOIN comentarios k ON k.id = r.comentario_id JOIN usuarios u ON u.id = r.autor_id ' +
            'WHERE k.dono_id = ? AND k.ref = ? ORDER BY r.criado_em DESC LIMIT ?',
          [who.id, ref, MAX_REACTIONS_LISTED],
        )
      : [];
    const byComment = new Map<string, ReactionOut[]>();
    for (const r of reactions) {
      const list = byComment.get(r.comentario_id) ?? [];
      list.push({ codigo: formatCode(r.codigo), nome: r.nome, reacao: r.reacao, em: r.em });
      byComment.set(r.comentario_id, list);
    }
    return c.json({
      comentarios: shown.map((r) => commentOut(r, byComment.get(r.id) ?? [])),
      maisAntigos: older,
      quem: fromOf(who),
      pode: await allowed(who, me),
    });
  });

  /** Comentar na ficha `ref` do mural de `codigo`. */
  app.post('/v1/murais/:codigo/comentarios/:ref', async (c) => {
    const s = await session(c);
    const who = await owner(c.req.param('codigo'));
    const ref = refParam(c);
    const body = await readJson(c);
    const text = cleanComment(body['texto']);
    if (!text) throw new HttpError(400, 'comentario-vazio', 'Escreva alguma coisa antes de comentar.');
    if (text.length > COMMENT_MAX) throw new HttpError(400, 'comentario-grande', `O comentário passa de ${COMMENT_MAX} caracteres.`);
    if (!(await allowed(who, s.userId))) throw refusal(who);
    const now = deps.now();
    if ((await usedToday(deps, s.userId, 'comentar', now)) >= MAX_COMMENTS_PER_DAY) {
      throw new HttpError(429, 'comentar-devagar', 'Você comentou bastante hoje. Tente de novo amanhã.');
    }
    const author = await deps.db.first<{ codigo: string; nome: string; foto: string | null }>('SELECT codigo, nome, foto FROM usuarios WHERE id = ?', [s.userId]);
    if (!author) throw new HttpError(401, 'sessao-invalida', 'Sua sessão acabou. Entre de novo para usar a nuvem.');
    const id = crypto.randomUUID();
    const at = now.toISOString();
    const mural = typeof body['mural'] === 'string' && MURAL_RE.test(body['mural']) ? body['mural'] : 'jogos';
    const resumo = JSON.stringify({ titulo: cleanTitle(body['titulo']), mural });
    await write(
      deps,
      [
        { sql: 'INSERT INTO comentarios (id, dono_id, ref, autor_id, texto, criado_em) VALUES (?, ?, ?, ?, ?, ?)', params: [id, who.id, ref, s.userId, text, at] },
        // o aviso para o dono (nunca de um comentário dele mesmo): o de antes sai e entra o de agora
        ...(who.id === s.userId
          ? []
          : [
              { sql: "DELETE FROM atividades WHERE tipo = 'comentou' AND autor_id = ? AND alvo_id = ? AND ref = ?", params: [s.userId, who.id, ref] },
              {
                sql: "INSERT INTO atividades (tipo, autor_id, alvo_id, ref, resumo, criado_em) VALUES ('comentou', ?, ?, ?, ?, ?)",
                params: [s.userId, who.id, ref, resumo, at],
              },
            ]),
        brakeStatement(s.userId, 'comentar', now),
      ],
      18,
    );
    return c.json({ comentario: commentOut({ id, texto: text, criado_em: at, ...author }, []) }, 201);
  });

  /** Apagar um comentário: quem escreveu, ou o dono da ficha. As reações dele vão junto. */
  app.delete('/v1/comentarios/:id', async (c) => {
    const s = await session(c);
    const k = await comment(c);
    if (k.autor_id !== s.userId && k.dono_id !== s.userId) {
      throw new HttpError(403, 'comentario-de-outro', 'Só quem escreveu ou o dono da ficha apaga um comentário.');
    }
    const reactions = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM comentario_reacoes WHERE comentario_id = ?', [k.id]);
    await write(
      deps,
      [
        { sql: 'DELETE FROM comentario_reacoes WHERE comentario_id = ?', params: [k.id] },
        { sql: 'DELETE FROM comentarios WHERE id = ?', params: [k.id] },
        // o aviso só sai com o último comentário da pessoa naquela ficha
        {
          sql:
            "DELETE FROM atividades WHERE tipo = 'comentou' AND autor_id = ? AND alvo_id = ? AND ref = ? " +
            'AND NOT EXISTS (SELECT 1 FROM comentarios WHERE dono_id = ? AND ref = ? AND autor_id = ?)',
          params: [k.autor_id, k.dono_id, k.ref, k.dono_id, k.ref, k.autor_id],
        },
      ],
      10 + 2 * (reactions?.n ?? 0),
    );
    return c.json({ ok: true });
  });

  /** Reagir (ou trocar a reação) a um comentário. */
  app.put('/v1/comentarios/:id/reacao', async (c) => {
    const s = await session(c);
    const k = await comment(c);
    const body = await readJson(c);
    const reaction = body['reacao'];
    if (!isReaction(reaction)) throw new HttpError(400, 'reacao-invalida', 'Essa reação não existe.');
    if (!(await allowed(k.dono, s.userId))) throw refusal(k.dono);
    const now = deps.now();
    const before = await deps.db.first<{ reacao: string }>('SELECT reacao FROM comentario_reacoes WHERE comentario_id = ? AND autor_id = ?', [k.id, s.userId]);
    if (before?.reacao === reaction) return c.json({ reacao: reaction });
    if ((await usedToday(deps, s.userId, 'reagir', now)) >= MAX_REACTIONS_PER_DAY) {
      throw new HttpError(429, 'reagir-devagar', 'Você reagiu a muita coisa hoje. Tente de novo amanhã.');
    }
    await write(
      deps,
      [
        {
          sql: 'INSERT OR REPLACE INTO comentario_reacoes (comentario_id, autor_id, reacao, criado_em) VALUES (?, ?, ?, ?)',
          params: [k.id, s.userId, reaction, now.toISOString()],
        },
        brakeStatement(s.userId, 'reagir', now),
      ],
      6,
    );
    return c.json({ reacao: reaction }, before ? 200 : 201);
  });

  /** Tirar a reação de um comentário. */
  app.delete('/v1/comentarios/:id/reacao', async (c) => {
    const s = await session(c);
    const k = await comment(c);
    await write(deps, [{ sql: 'DELETE FROM comentario_reacoes WHERE comentario_id = ? AND autor_id = ?', params: [k.id, s.userId] }], 3);
    return c.json({ ok: true });
  });
}
