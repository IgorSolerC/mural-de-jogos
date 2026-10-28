import { Context, Hono } from 'hono';
import { brakeRoom, usedToday } from '../domain/brake';
import { formatCode, normalizeCode } from '../domain/code';
import { COMMENT_ID_RE, COMMENT_MAX, CommentsFrom, cleanComment } from '../domain/comment';
import { photoOut } from '../domain/photo';
import { write } from '../domain/quota';
import { isReaction } from '../domain/reaction';
import { MURAL_RE, REF_RE, cleanTitle } from '../domain/review';
import { isShown, shownRefs } from '../domain/shown';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson, sessionOf } from './http';
import { MAX_REACTIONS_PER_DAY } from './reactions';

/**
 * Comentários nas fichas publicadas (resenhas e anotações) e as reações a cada comentário.
 *
 * Comenta quem segue o dono, como nas reações; se o dono preferir, só quem ele segue
 * (`usuarios.comentarios_de`, trocado no `PATCH /v1/eu`). O dono sempre comenta nas próprias fichas,
 * até nas privadas, e quem está numa anotação compartilhada comenta nela (privada ou não).
 * Quem vê o mural vê os comentários; os de uma ficha privada, só o dono e quem está na anotação. O texto leva as marcas de formatação do site e fica guardado como veio (limpo, até
 * `COMMENT_MAX` caracteres). Quem escreveu apaga o seu; o dono da ficha apaga qualquer um dela.
 *
 * O dono recebe um aviso no correio (atividade 'comentou'), um por pessoa e ficha: comentar de novo na
 * mesma ficha troca o aviso pelo de agora, e apagar o último comentário da pessoa ali apaga o aviso.
 * Numa anotação compartilhada, o mesmo aviso chega a todos que estão nela, menos a quem escreveu (ver
 * `/v1/eu/notificacoes`): por isso o comentário do dono ali também guarda o aviso, com ele de alvo.
 *
 * Reagir a um comentário é como reagir a uma ficha (uma por pessoa, trocar substitui, dá para tirar),
 * para quem pode comentar ali, e não avisa ninguém. Conta no mesmo freio das reações às fichas.
 *
 * Respostas: um comentário pode responder a outro da mesma ficha (`respostaA`), e a resposta também
 * pode ser respondida, sem limite de fundura (a árvore é o site que desenha). Quem foi respondido
 * recebe um aviso ('respondeu', um por pessoa, respondido e ficha, como o 'comentou'), que leva o
 * código do dono da ficha e o id da resposta; o dono não recebe também o 'comentou' quando a resposta
 * é a um comentário dele (fora da anotação compartilhada, em que o 'comentou' é o aviso de todos).
 * Apagar um comentário com respostas deixa ele no lugar, sem texto nem autor (`apagado`), para a
 * conversa continuar fazendo sentido; ele sai de vez quando a última resposta dele sai.
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
  codigo: string;
  nome: string;
  comentarios_de: string;
}

interface CommentRow {
  id: string;
  texto: string;
  criado_em: string;
  resposta_a: string | null;
  apagado: number;
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
  const reply = r.resposta_a ? { respostaA: r.resposta_a } : {};
  // o apagado que ficou por causa das respostas: só o lugar dele na conversa
  if (r.apagado) return { id: r.id, apagado: true, autor: null, texto: '', em: r.criado_em, reacoes: [], ...reply };
  const foto = photoOut(r.foto);
  return { id: r.id, autor: { codigo: formatCode(r.codigo), nome: r.nome, ...(foto ? { foto } : {}) }, texto: r.texto, em: r.criado_em, reacoes: reactions, ...reply };
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
    const found = code ? await deps.db.first<Owner>('SELECT id, codigo, nome, comentarios_de FROM usuarios WHERE codigo = ?', [code]) : null;
    if (!found) throw new HttpError(404, 'pessoa-nao-encontrada', 'Não achei ninguém com esse código.');
    return found;
  }

  function refParam(c: Context): string {
    const ref = c.req.param('ref') ?? '';
    if (!REF_RE.test(ref)) throw new HttpError(400, 'resenha-invalida', 'Essa ficha não existe.');
    return ref;
  }

  /** O comentário pelo id, com o dono da ficha, ou 404 (também o apagado que ficou por causa das respostas). */
  async function comment(c: Context): Promise<{ id: string; dono_id: string; ref: string; autor_id: string; resposta_a: string | null; dono: Owner }> {
    const id = c.req.param('id') ?? '';
    const found = COMMENT_ID_RE.test(id)
      ? await deps.db.first<{ id: string; dono_id: string; ref: string; autor_id: string; resposta_a: string | null; codigo: string; nome: string; comentarios_de: string }>(
          'SELECT k.id, k.dono_id, k.ref, k.autor_id, k.resposta_a, d.codigo, d.nome, d.comentarios_de FROM comentarios k JOIN usuarios d ON d.id = k.dono_id ' +
            'WHERE k.id = ? AND k.apagado = 0',
          [id],
        )
      : null;
    if (!found) throw new HttpError(404, 'comentario-nao-encontrado', 'Esse comentário não existe mais.');
    return {
      id: found.id,
      dono_id: found.dono_id,
      ref: found.ref,
      autor_id: found.autor_id,
      resposta_a: found.resposta_a,
      dono: { id: found.dono_id, codigo: found.codigo, nome: found.nome, comentarios_de: found.comentarios_de },
    };
  }

  /**
   * Os avisos que um comentário que saiu deixa de dar: o 'comentou' de quem escreveu, se ele não tem
   * mais nenhum na ficha, e o 'respondeu' ao autor do comentário respondido, se ele não respondeu mais
   * nada dessa pessoa ali. Vão depois de o comentário sair (ou virar apagado), no mesmo lote.
   */
  async function noticesGone(k: { dono_id: string; ref: string; autor_id: string; resposta_a: string | null }) {
    const parent = k.resposta_a ? await deps.db.first<{ autor_id: string }>('SELECT autor_id FROM comentarios WHERE id = ?', [k.resposta_a]) : null;
    return [
      {
        sql:
          "DELETE FROM atividades WHERE tipo = 'comentou' AND autor_id = ? AND alvo_id = ? AND ref = ? " +
          'AND NOT EXISTS (SELECT 1 FROM comentarios WHERE dono_id = ? AND ref = ? AND autor_id = ? AND apagado = 0)',
        params: [k.autor_id, k.dono_id, k.ref, k.dono_id, k.ref, k.autor_id],
      },
      ...(!parent
        ? []
        : [
            {
              sql:
                "DELETE FROM atividades WHERE tipo = 'respondeu' AND autor_id = ? AND alvo_id = ? AND ref = ? " +
                'AND NOT EXISTS (SELECT 1 FROM comentarios r JOIN comentarios p ON p.id = r.resposta_a ' +
                'WHERE r.dono_id = ? AND r.ref = ? AND r.autor_id = ? AND r.apagado = 0 AND p.autor_id = ?)',
              params: [k.autor_id, parent.autor_id, k.ref, k.dono_id, k.ref, k.autor_id, parent.autor_id],
            },
          ]),
    ];
  }

  /** A ficha `ref` do mural de `ownerId` é uma anotação compartilhada com alguém? */
  async function sharedNote(ownerId: string, ref: string): Promise<boolean> {
    return !!(await deps.db.first('SELECT 1 AS x FROM nota_membros m JOIN notas n ON n.id = m.nota_id WHERE m.nota_id = ? AND n.dono_id = ? LIMIT 1', [ref, ownerId]));
  }

  /** `userId` está na anotação compartilhada `ref` do mural de `ownerId` (sem ser o dono)? */
  async function member(ownerId: string, ref: string, userId: string | null): Promise<boolean> {
    if (!userId || userId === ownerId) return false;
    return !!(await deps.db.first('SELECT 1 AS x FROM nota_membros m JOIN notas n ON n.id = m.nota_id WHERE m.nota_id = ? AND n.dono_id = ? AND m.usuario_id = ?', [
      ref,
      ownerId,
      userId,
    ]));
  }

  /**
   * `userId` pode comentar (e reagir aos comentários) nas fichas de `who`? Com `ref`, na ficha `ref`:
   * quem está nela, se for uma anotação compartilhada, pode sempre.
   */
  async function allowed(who: Owner, userId: string | null, ref?: string): Promise<boolean> {
    if (!userId) return false;
    if (userId === who.id) return true;
    if (ref !== undefined && (await member(who.id, ref, userId))) return true;
    // quem segue quem: a pessoa segue o dono, ou (se ele escolheu assim) o dono segue a pessoa
    const [follower, followed] = fromOf(who) === 'seguidos' ? [who.id, userId] : [userId, who.id];
    return !!(await deps.db.first('SELECT 1 AS x FROM seguindo WHERE seguidor_id = ? AND seguido_id = ?', [follower, followed]));
  }

  /**
   * A ficha está à mostra para `userId`? O dono vê as dele todas, até as privadas; quem está numa
   * anotação compartilhada vê ela; os outros, só as do mural público (ver domain/shown.ts).
   */
  async function visible(who: Pick<Owner, 'id'>, ref: string, userId: string | null): Promise<boolean> {
    return userId === who.id || isShown(await shownRefs(deps.db, who.id), ref) || (await member(who.id, ref, userId));
  }

  /** A ficha não está à mostra (privada ou apagada): para os outros, ela não existe. */
  const hiddenCard = () => new HttpError(404, 'ficha-nao-encontrada', 'Essa ficha não está mais no mural.');

  /** A recusa, dizendo o que falta: seguir a pessoa, ou ser seguido por ela. */
  const refusal = (who: Owner) =>
    fromOf(who) === 'seguidos'
      ? new HttpError(403, 'comentar-so-seguidos', `Aqui só comenta quem ${who.nome} segue.`)
      : new HttpError(403, 'comentar-sem-seguir', 'Siga a pessoa para comentar nas fichas dela.');

  /** Quantos comentários cada ficha do mural da pessoa tem, quem pode comentar ali e se quem pergunta pode. */
  app.get('/v1/murais/:codigo/comentarios', async (c) => {
    const me = await viewer(c);
    const who = await owner(c.req.param('codigo'));
    // (o apagado que ficou por causa das respostas não conta)
    const rows = await deps.db.all<{ ref: string; n: number }>('SELECT ref, COUNT(*) AS n FROM comentarios WHERE dono_id = ? AND apagado = 0 GROUP BY ref LIMIT ?', [
      who.id,
      MAX_CARDS_COUNTED,
    ]);
    const shown = me === who.id ? null : await shownRefs(deps.db, who.id);
    // as anotações dele em que quem pergunta está contam mesmo privadas
    const joined =
      shown && me
        ? new Set(
            (
              await deps.db.all<{ id: string }>('SELECT n.id FROM nota_membros m JOIN notas n ON n.id = m.nota_id WHERE m.usuario_id = ? AND n.dono_id = ?', [
                me,
                who.id,
              ])
            ).map((n) => n.id),
          )
        : null;
    const counted = rows.filter((r) => isShown(shown, r.ref) || !!joined?.has(r.ref));
    return c.json({ contagem: Object.fromEntries(counted.map((r) => [r.ref, r.n])), quem: fromOf(who), pode: await allowed(who, me) });
  });

  /**
   * Os comentários da ficha `ref`, do mais antigo para o mais novo (os `MAX_COMMENTS_LISTED` mais novos),
   * com as reações de cada um e, nas respostas, o id do comentário respondido (`respostaA`).
   */
  app.get('/v1/murais/:codigo/comentarios/:ref', async (c) => {
    const me = await viewer(c);
    const who = await owner(c.req.param('codigo'));
    const ref = refParam(c);
    if (!(await visible(who, ref, me))) throw hiddenCard();
    const rows = await deps.db.all<CommentRow>(
      'SELECT k.id, k.texto, k.criado_em, k.resposta_a, k.apagado, u.codigo, u.nome, u.foto FROM comentarios k JOIN usuarios u ON u.id = k.autor_id ' +
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
      pode: await allowed(who, me, ref),
    });
  });

  /** Comentar na ficha `ref` do mural de `codigo` (com `respostaA`, respondendo a um comentário dela). */
  app.post('/v1/murais/:codigo/comentarios/:ref', async (c) => {
    const s = await session(c);
    const who = await owner(c.req.param('codigo'));
    const ref = refParam(c);
    const body = await readJson(c);
    const text = cleanComment(body['texto']);
    if (!text) throw new HttpError(400, 'comentario-vazio', 'Escreva alguma coisa antes de comentar.');
    if (text.length > COMMENT_MAX) throw new HttpError(400, 'comentario-grande', `O comentário passa de ${COMMENT_MAX} caracteres.`);
    if (!(await allowed(who, s.userId, ref))) throw refusal(who);
    if (!(await visible(who, ref, s.userId))) throw hiddenCard();
    // a resposta: o comentário respondido é desta ficha e ainda está nela
    const replyTo = body['respostaA'];
    let parent: { id: string; autor_id: string } | null = null;
    if (replyTo !== undefined && replyTo !== null) {
      parent =
        typeof replyTo === 'string' && COMMENT_ID_RE.test(replyTo)
          ? await deps.db.first<{ id: string; autor_id: string }>('SELECT id, autor_id FROM comentarios WHERE id = ? AND dono_id = ? AND ref = ? AND apagado = 0', [
              replyTo,
              who.id,
              ref,
            ])
          : null;
      if (!parent) throw new HttpError(404, 'comentario-nao-encontrado', 'O comentário que você ia responder não existe mais.');
    }
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
    // o aviso: só de outra pessoa para o dono, ou de qualquer um numa anotação compartilhada (ver o começo);
    // a resposta a um comentário do próprio dono já avisa ele com o 'respondeu'
    const shared = await sharedNote(who.id, ref);
    const answered = parent && parent.autor_id !== s.userId ? parent.autor_id : null;
    const notify = shared || (who.id !== s.userId && answered !== who.id);
    const replyNote = JSON.stringify({ titulo: cleanTitle(body['titulo']), mural, dono: formatCode(who.codigo), comentario: id });
    // O comentário só entra se ainda há vaga no freio e (na resposta) o respondido ainda está na ficha,
    // conferidos no banco, no mesmo lote: dois pedidos ao mesmo tempo não passam juntos do limite, e a
    // resposta não fica solta, sem o comentário de cima, que saiu entre a conferência e a gravação.
    // Todo o resto do lote só vale se ele entrou.
    const room = brakeRoom(s.userId, 'comentar', now, MAX_COMMENTS_PER_DAY);
    const made = 'EXISTS (SELECT 1 FROM comentarios WHERE id = ?)';
    const results = await write(
      deps,
      [
        {
          sql:
            'INSERT INTO comentarios (id, dono_id, ref, autor_id, texto, criado_em, resposta_a) SELECT ?, ?, ?, ?, ?, ?, ? ' +
            `WHERE ${room.sql} AND (? IS NULL OR EXISTS (SELECT 1 FROM comentarios WHERE id = ? AND dono_id = ? AND ref = ? AND apagado = 0))`,
          params: [id, who.id, ref, s.userId, text, at, parent?.id ?? null, ...room.params, parent?.id ?? null, parent?.id ?? null, who.id, ref],
        },
        // o aviso para quem foi respondido: o de antes sai e entra o de agora
        ...(!answered
          ? []
          : [
              { sql: `DELETE FROM atividades WHERE tipo = 'respondeu' AND autor_id = ? AND alvo_id = ? AND ref = ? AND ${made}`, params: [s.userId, answered, ref, id] },
              {
                sql: `INSERT INTO atividades (tipo, autor_id, alvo_id, ref, resumo, criado_em) SELECT 'respondeu', ?, ?, ?, ?, ? WHERE ${made}`,
                params: [s.userId, answered, ref, replyNote, at, id],
              },
            ]),
        // o aviso: o de antes sai e entra o de agora
        ...(!notify
          ? []
          : [
              { sql: `DELETE FROM atividades WHERE tipo = 'comentou' AND autor_id = ? AND alvo_id = ? AND ref = ? AND ${made}`, params: [s.userId, who.id, ref, id] },
              {
                sql: `INSERT INTO atividades (tipo, autor_id, alvo_id, ref, resumo, criado_em) SELECT 'comentou', ?, ?, ?, ?, ? WHERE ${made}`,
                params: [s.userId, who.id, ref, resumo, at, id],
              },
            ]),
        { sql: `INSERT INTO freios (usuario_id, acao, criado_em) SELECT ?, 'comentar', ? WHERE ${made}`, params: [s.userId, at, id] },
      ],
      20,
    );
    if (!results[0]?.changes) {
      if ((await usedToday(deps, s.userId, 'comentar', now)) >= MAX_COMMENTS_PER_DAY) {
        throw new HttpError(429, 'comentar-devagar', 'Você comentou bastante hoje. Tente de novo amanhã.');
      }
      throw new HttpError(404, 'comentario-nao-encontrado', 'O comentário que você ia responder não existe mais.');
    }
    return c.json({ comentario: commentOut({ id, texto: text, criado_em: at, resposta_a: parent?.id ?? null, apagado: 0, ...author }, []) }, 201);
  });

  /**
   * Apagar um comentário: quem escreveu, ou o dono da ficha. As reações dele vão junto. Com respostas,
   * ele fica no lugar como apagado (sem texto nem autor à mostra) e a resposta diz `{ apagado: true }`;
   * sem respostas, sai de vez, e leva junto o apagado de cima que ficou só por causa dele.
   */
  app.delete('/v1/comentarios/:id', async (c) => {
    const s = await session(c);
    const k = await comment(c);
    if (k.autor_id !== s.userId && k.dono_id !== s.userId) {
      throw new HttpError(403, 'comentario-de-outro', 'Só quem escreveu ou o dono da ficha apaga um comentário.');
    }
    const reactions = await deps.db.first<{ n: number }>('SELECT COUNT(*) AS n FROM comentario_reacoes WHERE comentario_id = ?', [k.id]);
    // com respostas, fica como apagado; sem, sai. Decidido no banco, no mesmo lote: uma resposta que
    // chegue entre a conferência e a gravação não fica solta, sem o comentário de cima
    const results = await write(
      deps,
      [
        { sql: 'DELETE FROM comentario_reacoes WHERE comentario_id = ?', params: [k.id] },
        { sql: "UPDATE comentarios SET apagado = 1, texto = '' WHERE id = ? AND EXISTS (SELECT 1 FROM comentarios WHERE resposta_a = ?)", params: [k.id, k.id] },
        { sql: 'DELETE FROM comentarios WHERE id = ? AND apagado = 0', params: [k.id] },
        // os avisos só saem com o último comentário (ou a última resposta) da pessoa ali
        ...(await noticesGone(k)),
      ],
      12 + 2 * (reactions?.n ?? 0),
    );
    const keep = !!results[1]?.changes;
    // o apagado de cima que ficou só por causa deste sai também (e o de cima dele, e assim por diante)
    let up = keep ? null : k.resposta_a;
    while (up) {
      const p = await deps.db.first<{ id: string; apagado: number; resposta_a: string | null }>('SELECT id, apagado, resposta_a FROM comentarios WHERE id = ?', [up]);
      if (!p?.apagado || (await deps.db.first('SELECT 1 AS x FROM comentarios WHERE resposta_a = ? LIMIT 1', [p.id]))) break;
      await write(deps, [{ sql: 'DELETE FROM comentarios WHERE id = ?', params: [p.id] }], 2);
      up = p.resposta_a;
    }
    return c.json(keep ? { ok: true, apagado: true } : { ok: true });
  });

  /** Reagir (ou trocar a reação) a um comentário. */
  app.put('/v1/comentarios/:id/reacao', async (c) => {
    const s = await session(c);
    const k = await comment(c);
    const body = await readJson(c);
    const reaction = body['reacao'];
    if (!isReaction(reaction)) throw new HttpError(400, 'reacao-invalida', 'Essa reação não existe.');
    if (!(await allowed(k.dono, s.userId, k.ref))) throw refusal(k.dono);
    if (!(await visible(k.dono, k.ref, s.userId))) throw hiddenCard();
    const now = deps.now();
    const before = await deps.db.first<{ reacao: string }>('SELECT reacao FROM comentario_reacoes WHERE comentario_id = ? AND autor_id = ?', [k.id, s.userId]);
    if (before?.reacao === reaction) return c.json({ reacao: reaction });
    if ((await usedToday(deps, s.userId, 'reagir', now)) >= MAX_REACTIONS_PER_DAY) {
      throw new HttpError(429, 'reagir-devagar', 'Você reagiu a muita coisa hoje. Tente de novo amanhã.');
    }
    const room = brakeRoom(s.userId, 'reagir', now, MAX_REACTIONS_PER_DAY);
    const results = await write(
      deps,
      [
        // só com vaga no freio, conferida no banco (ver brakeRoom); o comentário que saiu enquanto isso não ganha reação
        {
          sql:
            'INSERT OR REPLACE INTO comentario_reacoes (comentario_id, autor_id, reacao, criado_em) SELECT ?, ?, ?, ? ' +
            `WHERE ${room.sql} AND EXISTS (SELECT 1 FROM comentarios WHERE id = ? AND apagado = 0)`,
          params: [k.id, s.userId, reaction, now.toISOString(), ...room.params, k.id],
        },
        {
          sql: `INSERT INTO freios (usuario_id, acao, criado_em) SELECT ?, 'reagir', ? WHERE ${room.sql} AND EXISTS (SELECT 1 FROM comentarios WHERE id = ? AND apagado = 0)`,
          params: [s.userId, now.toISOString(), ...room.params, k.id],
        },
      ],
      6,
    );
    if (!results[0]?.changes) {
      if (await deps.db.first('SELECT 1 AS x FROM comentarios WHERE id = ? AND apagado = 0', [k.id])) {
        throw new HttpError(429, 'reagir-devagar', 'Você reagiu a muita coisa hoje. Tente de novo amanhã.');
      }
      throw new HttpError(404, 'comentario-nao-encontrado', 'Esse comentário não existe mais.');
    }
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
