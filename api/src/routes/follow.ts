import { Context, Hono } from 'hono';
import { DAY_MS, utcDayStart, write } from '../domain/quota';
import { base64url, sha256 } from '../domain/bytes';
import { formatCode, normalizeCode } from '../domain/code';
import { cardOut } from '../domain/photo';
import { shownSql } from '../domain/shown';
import { HttpError } from '../errors';
import { Deps } from '../ports';
import { readJson, sessionOf } from './http';

/**
 * Seguir e o correio. Seguir é de mão única e sem aprovação: guarda o id de quem segue e de quem é
 * seguido (trocar o código não desfaz). Quem é seguido recebe um aviso uma vez só por pessoa; quem
 * segue passa a ver, no correio, as resenhas novas que a pessoa publicar dali em diante.
 *
 * O correio não grava nada por pessoa: as atividades são uma linha por acontecimento (ver
 * `routes/mural.ts`), e cada um lê as suas juntando com quem segue. Conferir se há algo novo
 * (`?depois=`) responde 204, sem corpo, quando não há.
 *
 * O perfil de cada um mostra quantos ela segue e quantos a seguem (`GET /v1/murais/:codigo/pessoas`)
 * e, se ela deixar (`pessoas_visiveis`), quem são: para dar para seguir os amigos dos amigos sem
 * passar código de mão em mão.
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
/** Quantos seguidores a lista de pessoas devolve, os mais novos. */
const MAX_FOLLOWERS_LISTED = 1000;

interface Person {
  id: string;
  codigo: string;
  nome: string;
}

interface FeedRow {
  tipo: 'seguiu' | 'resenha' | 'reagiu' | 'comentou' | 'respondeu' | 'compartilhou' | 'acesso';
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

/**
 * A chave de quem eu sigo: a mesma enquanto eu seguir a pessoa, mesmo se ela trocar o código. Feita do
 * par (eu, ela), então não diz nada a quem não segue e não liga a pessoa entre seguidores diferentes.
 * O site usa para levar o mural guardado da pessoa para o código novo, sem duplicar.
 */
async function pairKey(followerId: string, followedId: string): Promise<string> {
  return base64url((await sha256(`seguindo:${followerId}:${followedId}`)).slice(0, 12));
}

/** O que o aviso de acesso guardou: o nome da chave e, num conector, o domínio dele. */
function accessSummary(raw: string | null): { nome: string; conector: string | null } {
  try {
    const d = JSON.parse(raw ?? '{}') as Record<string, unknown>;
    return {
      nome: typeof d['nome'] === 'string' && d['nome'] ? d['nome'].slice(0, 60) : 'Uma chave',
      conector: typeof d['conector'] === 'string' && d['conector'] ? d['conector'].slice(0, 120) : null,
    };
  } catch {
    return { nome: 'Uma chave', conector: null };
  }
}

function summary(raw: string | null): { titulo: string; mural: string; reacao?: string; papel?: string; dono?: string; comentario?: string } | null {
  if (!raw) return null;
  try {
    const data = JSON.parse(raw) as Record<string, unknown>;
    if (typeof data['titulo'] !== 'string' || typeof data['mural'] !== 'string') return null;
    return {
      titulo: data['titulo'],
      mural: data['mural'],
      ...(typeof data['reacao'] === 'string' ? { reacao: data['reacao'] } : {}),
      ...(typeof data['papel'] === 'string' ? { papel: data['papel'] } : {}),
      ...(typeof data['dono'] === 'string' ? { dono: data['dono'] } : {}),
      ...(typeof data['comentario'] === 'string' ? { comentario: data['comentario'] } : {}),
    };
  } catch {
    return null;
  }
}

export function followRoutes(app: Hono, deps: Deps): void {
  const session = (c: Context) => sessionOf(deps, c);

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
    const today = utcDayStart(now);
    // O limite do dia conta as pessoas DISTINTAS que comecei a seguir hoje, mesmo as que já deixei de
    // seguir (o aviso delas já foi): senão, seguir e deixar de seguir abriria vaga sem fim. Seguir de
    // novo quem já recebeu o aviso (o "Desfazer") não avisa ninguém, então não gasta o limite.
    const totalSql = '(SELECT COUNT(*) FROM seguindo WHERE seguidor_id = ?)';
    const todaySql =
      '(SELECT COUNT(*) FROM (' +
      "SELECT alvo_id FROM atividades WHERE tipo = 'seguiu' AND autor_id = ? AND criado_em >= ? " +
      'UNION SELECT seguido_id FROM seguindo WHERE seguidor_id = ? AND criado_em >= ?))';
    const warnedSql = "(SELECT COUNT(*) FROM atividades WHERE tipo = 'seguiu' AND autor_id = ? AND alvo_id = ?)";
    const limitParams = [s.userId, s.userId, today, s.userId, today, s.userId, target.id];
    /** O limite que barra seguir agora, ou null (lido antes, para a resposta; e de novo, se o lote não entrou). */
    const blocked = async (): Promise<HttpError | null> => {
      const counts = await deps.db.first<{ total: number; hoje: number; avisada: number }>(
        `SELECT ${totalSql} AS total, ${todaySql} AS hoje, ${warnedSql} AS avisada`,
        limitParams,
      );
      if ((counts?.total ?? 0) >= MAX_FOLLOWING) {
        return new HttpError(429, 'seguindo-demais', `Você já segue ${MAX_FOLLOWING} pessoas, o máximo. Deixe de seguir alguém antes.`);
      }
      if (!counts?.avisada && (counts?.hoje ?? 0) >= MAX_FOLLOWS_PER_DAY) {
        return new HttpError(429, 'seguir-devagar', 'Você começou a seguir muita gente hoje. Tente de novo amanhã.');
      }
      return null;
    };
    const before = await blocked();
    if (before) throw before;
    const at = now.toISOString();
    // deixou de seguir há pouco (o "Desfazer"): volta como era
    const undone = await deps.db.first<{ criado_em: string; silenciado: number }>(
      'SELECT criado_em, silenciado FROM seguindo_desfeito WHERE seguidor_id = ? AND seguido_id = ? AND desfeito_em >= ?',
      [s.userId, target.id, new Date(now.getTime() - UNDO_MS).toISOString()],
    );
    const muted = undone?.silenciado ? 1 : 0;
    // a data de antes: o correio continua com as resenhas que já tinham chegado
    const since = undone?.criado_em ?? at;
    // Os limites lidos acima não bastam: pedidos ao mesmo tempo (seguir em massa por um script) leem
    // todos a mesma contagem velha e passariam juntos. Dentro do lote (uma transação) a contagem é a do
    // banco na hora; o resto do lote só vale se o seguir entrou.
    const followed = 'EXISTS (SELECT 1 FROM seguindo WHERE seguidor_id = ? AND seguido_id = ?)';
    const [inserted] = await write(
      deps,
      [
        {
          sql:
            'INSERT OR IGNORE INTO seguindo (seguidor_id, seguido_id, criado_em, silenciado) SELECT ?, ?, ?, ? ' +
            `WHERE ${totalSql} < ? AND (${warnedSql} > 0 OR ${todaySql} < ?)`,
          params: [s.userId, target.id, since, muted, s.userId, MAX_FOLLOWING, s.userId, target.id, s.userId, today, s.userId, today, MAX_FOLLOWS_PER_DAY],
        },
        {
          sql: `DELETE FROM seguindo_desfeito WHERE seguidor_id = ? AND seguido_id = ? AND ${followed}`,
          params: [s.userId, target.id, s.userId, target.id],
        },
        // o aviso para quem foi seguido: uma vez só por pessoa (o índice único ignora a repetição)
        {
          sql: `INSERT OR IGNORE INTO atividades (tipo, autor_id, alvo_id, criado_em) SELECT 'seguiu', ?, ?, ? WHERE ${followed}`,
          params: [s.userId, target.id, at, s.userId, target.id],
        },
      ],
      11,
    );
    if (!inserted || inserted.changes === 0) {
      // outro pedido ao mesmo tempo seguiu a mesma pessoa: vale o dele
      const current = await deps.db.first<{ criado_em: string; silenciado: number }>(
        'SELECT criado_em, silenciado FROM seguindo WHERE seguidor_id = ? AND seguido_id = ?',
        [s.userId, target.id],
      );
      if (current) return c.json({ pessoa: personOut(target), desde: current.criado_em, silenciado: !!current.silenciado });
      throw (await blocked()) ?? new HttpError(429, 'seguir-devagar', 'Você começou a seguir muita gente hoje. Tente de novo amanhã.');
    }
    return c.json({ pessoa: personOut(target), desde: since, silenciado: !!muted }, 201);
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

  /**
   * Seguindo e Seguidores no perfil de alguém: os números sempre; com `?listas=1`, quem são (os mais
   * novos primeiro, até `MAX_FOLLOWING` de cada), se a pessoa deixa ver ou se é ela mesma pedindo. Só
   * conta e lista quem tem mural público (o perfil de quem não tem nem abre), e quem não tem mural
   * público só vê os próprios: para os outros, é 404, como o mural (`GET /v1/murais/:codigo`). Cada um
   * vem com o cartão (a foto, o fundo do perfil e os números), quando já veio. Aberto a quem pode abrir
   * o mural (`VER_MURAIS`); a sessão, se vier, só diz se é a própria pessoa.
   */
  app.get('/v1/murais/:codigo/pessoas', async (c) => {
    const mustSignIn = deps.config.publicMurals === 'logados';
    const viewer = mustSignIn ? await session(c) : c.req.header('Authorization') ? await session(c).catch(() => null) : null;
    const code = normalizeCode(c.req.param('codigo'));
    const found = code
      ? await deps.db.first<{ id: string; visiveis: number; publico: number; seguindo: number; seguidores: number }>(
          'SELECT u.id, u.pessoas_visiveis AS visiveis, ' +
            '(SELECT COUNT(*) FROM murais_publicos WHERE usuario_id = u.id) AS publico, ' +
            '(SELECT COUNT(*) FROM seguindo s JOIN murais_publicos p ON p.usuario_id = s.seguido_id WHERE s.seguidor_id = u.id) AS seguindo, ' +
            '(SELECT COUNT(*) FROM seguindo s JOIN murais_publicos p ON p.usuario_id = s.seguidor_id WHERE s.seguido_id = u.id) AS seguidores ' +
            'FROM usuarios u WHERE u.codigo = ?',
          [code],
        )
      : null;
    // sem mural público, o código não mostra nada a ninguém além da dona: nem os números, nem as listas
    const owner = found && (found.publico || viewer?.userId === found.id) ? found : null;
    if (!owner) throw new HttpError(404, 'pessoa-nao-encontrada', 'Não achei ninguém com esse código.');
    const out = { seguindo: owner.seguindo, seguidores: owner.seguidores, listasVisiveis: !!owner.visiveis };
    if (c.req.query('listas') !== '1' || !(owner.visiveis || viewer?.userId === owner.id)) return c.json(out);
    type Row = { codigo: string; nome: string; foto: string | null; cartao: string | null };
    const list = (them: 'seguido_id' | 'seguidor_id', me: 'seguidor_id' | 'seguido_id') =>
      deps.db.all<Row>(
        `SELECT u.codigo, u.nome, u.foto, u.cartao FROM seguindo s JOIN usuarios u ON u.id = s.${them} ` +
          `JOIN murais_publicos p ON p.usuario_id = u.id WHERE s.${me} = ? ORDER BY s.criado_em DESC LIMIT ?`,
        [owner.id, MAX_FOLLOWING],
      );
    const following = await list('seguido_id', 'seguidor_id');
    const followers = await list('seguidor_id', 'seguido_id');
    const person = (r: Row) => {
      const cartao = cardOut(r.cartao, r.foto);
      return { ...personOut(r), ...(cartao ? { cartao } : {}) };
    };
    return c.json({ ...out, listas: { seguindo: following.map(person), seguidores: followers.map(person) } });
  });

  /** As duas listas numa chamada só: quem eu sigo e quem me segue. */
  app.get('/v1/eu/pessoas', async (c) => {
    const s = await session(c);
    const following = await deps.db.all<{ id: string; codigo: string; nome: string; criado_em: string; silenciado: number; rev: number | null; me_segue: number }>(
      'SELECT u.id, u.codigo, u.nome, s.criado_em, s.silenciado, p.rev, ' +
        '(SELECT COUNT(*) FROM seguindo r WHERE r.seguidor_id = u.id AND r.seguido_id = ?) AS me_segue ' +
        'FROM seguindo s JOIN usuarios u ON u.id = s.seguido_id LEFT JOIN murais_publicos p ON p.usuario_id = u.id ' +
        'WHERE s.seguidor_id = ? ORDER BY s.criado_em DESC LIMIT ?',
      [s.userId, s.userId, MAX_FOLLOWING],
    );
    const followers = await deps.db.all<{ codigo: string; nome: string; criado_em: string; eu_sigo: number }>(
      'SELECT u.codigo, u.nome, s.criado_em, ' +
        '(SELECT COUNT(*) FROM seguindo r WHERE r.seguidor_id = ? AND r.seguido_id = u.id) AS eu_sigo ' +
        'FROM seguindo s JOIN usuarios u ON u.id = s.seguidor_id WHERE s.seguido_id = ? ORDER BY s.criado_em DESC LIMIT ?',
      [s.userId, s.userId, MAX_FOLLOWERS_LISTED],
    );
    const keys = await Promise.all(following.map((p) => pairKey(s.userId, p.id)));
    return c.json({
      seguindo: following.map((p, i) => ({
        ...personOut(p),
        chave: keys[i],
        desde: p.criado_em,
        silenciado: !!p.silenciado,
        rev: p.rev ?? null,
        meSegue: !!p.me_segue,
      })),
      seguidores: followers.map((p) => ({ ...personOut(p), desde: p.criado_em, euSigo: !!p.eu_sigo })),
    });
  });

  app.get('/v1/eu/notificacoes', async (c) => {
    const s = await session(c);
    const now = deps.now();
    const floor = new Date(now.getTime() - FEED_DAYS * DAY_MS).toISOString();
    const after = isoParam(c.req.query('depois'));
    // as três fontes: quem começou a me seguir (e ainda segue), as resenhas de quem eu sigo,
    // publicadas depois que comecei a seguir, e quem reagiu às minhas ou comentou nelas (silenciado se eu
    // silenciei a pessoa)
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
          // a ficha que virou privada (ou foi apagada) sai do correio de quem segue
          `AND ${shownSql('u', 'a.ref')} ` +
          'UNION ALL ' +
          'SELECT a.tipo AS tipo, a.criado_em AS criado_em, a.ref, a.resumo, u.codigo, u.nome, COALESCE(m.silenciado, 0) AS silenciado, ' +
          'CASE WHEN m.seguidor_id IS NULL THEN 0 ELSE 1 END AS eu_sigo ' +
          'FROM atividades a JOIN usuarios u ON u.id = a.autor_id ' +
          'LEFT JOIN seguindo m ON m.seguidor_id = a.alvo_id AND m.seguido_id = a.autor_id ' +
          // (o comentário do dono numa anotação compartilhada é aviso só para os outros dela)
          // (e quem respondeu a um comentário meu, em qualquer ficha)
          // (e uma chave de API criada ou um conector autorizado nesta conta, PLANO-API.md D11: a conta é autora
          // e alvo; fica aqui porque o D1 aceita no máximo 5 partes num UNION)
          "WHERE ((a.tipo IN ('reagiu', 'comentou', 'respondeu') AND a.autor_id <> a.alvo_id) OR a.tipo = 'acesso') AND a.alvo_id = ? AND a.criado_em > ? " +
          // a resposta numa ficha de outra pessoa que virou privada (ou foi apagada) sai do correio, como a
          // ficha nova: o aviso leva o título dela. Fica para o dono e para quem está na anotação compartilhada
          // (a resposta que deu o aviso diz de quem é a ficha)
          "AND (a.tipo <> 'respondeu' OR EXISTS (SELECT 1 FROM comentarios r JOIN usuarios d ON d.id = r.dono_id " +
          'WHERE r.ref = a.ref AND r.autor_id = a.autor_id AND r.apagado = 0 AND r.resposta_a IS NOT NULL ' +
          `AND (d.id = a.alvo_id OR ${shownSql('d', 'a.ref')} ` +
          'OR EXISTS (SELECT 1 FROM nota_membros nm2 JOIN notas n2 ON n2.id = nm2.nota_id WHERE n2.id = a.ref AND n2.dono_id = d.id AND nm2.usuario_id = a.alvo_id)))) ' +
          'UNION ALL ' +
          // quem comentou numa anotação em que eu estou (de outra pessoa), enquanto eu ainda estou nela
          "SELECT 'comentou' AS tipo, a.criado_em AS criado_em, a.ref, a.resumo, u.codigo, u.nome, COALESCE(f.silenciado, 0) AS silenciado, " +
          'CASE WHEN f.seguidor_id IS NULL THEN 0 ELSE 1 END AS eu_sigo ' +
          'FROM nota_membros nm JOIN notas n ON n.id = nm.nota_id ' +
          "JOIN atividades a ON a.alvo_id = n.dono_id AND a.ref = n.id AND a.tipo = 'comentou' " +
          'JOIN usuarios u ON u.id = a.autor_id ' +
          'LEFT JOIN seguindo f ON f.seguidor_id = nm.usuario_id AND f.seguido_id = a.autor_id ' +
          'WHERE nm.usuario_id = ? AND a.autor_id <> ? AND a.criado_em > ? ' +
          'UNION ALL ' +
          // quem compartilhou uma anotação comigo (enquanto eu ainda estou nela), com o título e o papel de agora
          "SELECT 'compartilhou' AS tipo, a.criado_em AS criado_em, a.ref, " +
          "json_object('titulo', COALESCE(json_extract(n.dados, '$.game.name'), ''), 'mural', 'anotacoes', 'papel', m.papel) AS resumo, " +
          'u.codigo, u.nome, 0 AS silenciado, ' +
          '(SELECT COUNT(*) FROM seguindo b WHERE b.seguidor_id = ? AND b.seguido_id = a.autor_id) AS eu_sigo ' +
          'FROM atividades a JOIN usuarios u ON u.id = a.autor_id ' +
          'JOIN nota_membros m ON m.nota_id = a.ref AND m.usuario_id = a.alvo_id JOIN notas n ON n.id = a.ref ' +
          "WHERE a.tipo = 'compartilhou' AND a.alvo_id = ? AND a.criado_em > ? " +
          'ORDER BY criado_em DESC LIMIT ?',
        [s.userId, s.userId, since, s.userId, since, s.userId, since, s.userId, s.userId, since, s.userId, s.userId, since, limit],
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
        if (r.tipo === 'acesso') {
          const a = accessSummary(r.resumo);
          return { ...base, ref: r.ref, nome: a.nome, conector: a.conector };
        }
        const sum = summary(r.resumo);
        if (r.tipo === 'compartilhou') {
          return { ...base, ref: r.ref, titulo: (sum?.titulo || 'Anotação').slice(0, 120), mural: 'anotacoes', papel: sum?.papel ?? 'leitor', euSigo: !!r.eu_sigo };
        }
        const review = { ...base, ref: r.ref, titulo: sum?.titulo ?? '', mural: sum?.mural ?? 'jogos', silenciado: !!r.silenciado };
        // a resposta: de quem é a ficha (pode ser de outra pessoa) e qual comentário abrir
        if (r.tipo === 'respondeu') return { ...review, dono: sum?.dono ?? '', comentario: sum?.comentario ?? '' };
        return r.tipo === 'reagiu' ? { ...review, reacao: sum?.reacao ?? 'amei' } : review;
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
