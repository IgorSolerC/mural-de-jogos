import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import { CONTEXTO_FICHAS, MURAIS, RELEVANCIAS, STATUS, VEREDITOS, ehMural, type ContextoFichasV1, type DesejoV1, type FichaV1, type PraDepoisV1 } from '../../../contrato/api-v1/murais';
import { resumo } from '../../../contrato/api-v1/notas';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { HttpError } from '../errors';
import { Deps, SqlValue } from '../ports';
import { OFFSET_MAX, intQuery, mirrorState } from './routes';

/**
 * Ler os murais de resenhas com a chave (PLANO-API.md, 7.4; rodada 9): a wishlist, o Pra depois e as
 * fichas, cada um com filtros e pelo id, e o que cada mural tem. Tudo do espelho; a nota final e o que
 * cada mural tem vêm prontos do site.
 */

export const WISH_SCOPES = ['desejos:ler', 'desejos:escrever'] as const;
export const LATER_SCOPES = ['pra-depois:ler', 'pra-depois:escrever'] as const;
export const REVIEW_SCOPES = ['fichas:ler', 'fichas:escrever'] as const;

const LIST_MAX = 100;
const PAGE_MAX_CHARS = 256_000;
const ID_RE = /^[\w-]{1,64}$/;

/** As ordens da lista das fichas. */
const REVIEW_ORDERS: Record<string, string> = {
  concluida: 'data IS NULL, data DESC, id',
  nota: "json_extract(dados, '$.nota_final') DESC, id",
  nome: "lower(json_extract(dados, '$.nome')), id",
  mudou: 'versao DESC, id',
};

/** O tipo de linha de cada lista, e o nome dela nas mensagens. */
type ListKind = 'desejo' | 'pra-depois' | 'ficha';
const NOT_FOUND: Record<ListKind, HttpError> = {
  desejo: new HttpError(404, 'desejo-nao-encontrado', 'Não achei esse desejo na wishlist.'),
  'pra-depois': new HttpError(404, 'pra-depois-nao-encontrado', 'Não achei esse item no Pra depois.'),
  ficha: new HttpError(404, 'ficha-nao-encontrada', 'Não achei essa ficha.'),
};

/** O item do espelho pelo id, ou null. */
export async function mirroredItem<T>(deps: Deps, userId: string, tipo: ListKind, id: string): Promise<T | null> {
  if (!ID_RE.test(id)) return null;
  const row = await deps.db.first<{ dados: string }>('SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = ? AND id = ?', [userId, tipo, id]);
  return row ? (JSON.parse(row.dados) as T) : null;
}

/** O que cada mural tem (as notas, os status), ou null antes de o espelho chegar. */
export async function reviewContext(deps: Deps, userId: string): Promise<ContextoFichasV1 | null> {
  const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'contexto-fichas' AND id = ?", [userId, CONTEXTO_FICHAS]);
  return row ? (JSON.parse(row.dados) as ContextoFichasV1) : null;
}

/** Quantos itens há em cada mural numa lista (a wishlist, o Pra depois). */
async function countByMural(deps: Deps, userId: string, tipo: ListKind): Promise<Record<string, number>> {
  const rows = await deps.db.all<{ grupo: string; n: number }>('SELECT grupo, COUNT(*) AS n FROM api_espelho WHERE usuario_id = ? AND tipo = ? GROUP BY grupo', [userId, tipo]);
  const by = new Map(rows.map((r) => [r.grupo, r.n]));
  return Object.fromEntries(MURAIS.map((m) => [m, by.get(m) ?? 0]));
}

/** O que os murais acrescentam ao contexto, para a chave que alcança cada um. */
export async function muralsContext(deps: Deps, me: KeyCaller) {
  const has = (scopes: readonly string[]) => scopes.some((s) => me.key.scopes.includes(s));
  const userId = me.key.userId;
  return {
    desejos: has(WISH_SCOPES) ? { por_mural: await countByMural(deps, userId, 'desejo'), relevancias: RELEVANCIAS } : null,
    pra_depois: has(LATER_SCOPES) ? { por_mural: await countByMural(deps, userId, 'pra-depois') } : null,
    fichas: has(REVIEW_SCOPES) ? await reviewContext(deps, userId) : null,
  };
}

const likeOf = (text: string) => `%${dobra(text).replace(/[%_\\]/g, (m) => `\\${m}`)}%`;

/** O mural da consulta (um dos de resenhas), ou o 400 com os que existem. */
function muralQuery(v: string): string {
  if (!ehMural(v)) throw new HttpError(400, 'mural-invalido', `O mural é um destes: ${MURAIS.join(', ')}.`);
  return v;
}

/** Uma página do espelho com o teto de caracteres (os 10 ms de CPU do Worker grátis). */
function page<T>(rows: readonly { dados: string }[], limit: number, offset: number, map: (raw: string) => T): { itens: T[]; depois?: string } {
  const itens: T[] = [];
  let chars = 0;
  for (const row of rows.slice(0, limit)) {
    if (itens.length && chars + row.dados.length > PAGE_MAX_CHARS) break;
    chars += row.dados.length;
    itens.push(map(row.dados));
  }
  return { itens, ...(rows.length > itens.length ? { depois: String(offset + itens.length) } : {}) };
}

export function muralsReadRoutes(app: Hono, deps: Deps): void {
  const caller = async (c: Context, scope: string) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, scope);
    return me;
  };
  const q = (c: Context, k: string) => c.req.query(k)?.trim() || undefined;

  /** A wishlist e o Pra depois: por mural, pela busca no nome; a wishlist também pela relevância. */
  function listRoute(path: string, tipo: 'desejo' | 'pra-depois', scope: string) {
    app.get(path, async (c) => {
      const me = await caller(c, scope);
      const limit = intQuery(q(c, 'limite'), 50, 1, LIST_MAX);
      const offset = intQuery(q(c, 'depois'), 0, 0, OFFSET_MAX);
      const where = ['usuario_id = ?', 'tipo = ?'];
      const params: SqlValue[] = [me.key.userId, tipo];
      const mural = q(c, 'mural');
      if (mural !== undefined) {
        where.push('grupo = ?');
        params.push(muralQuery(mural));
      }
      const rel = q(c, 'relevancia');
      if (tipo === 'desejo' && rel !== undefined) {
        if (!(RELEVANCIAS as readonly string[]).includes(rel)) throw new HttpError(400, 'filtro-invalido', `A relevância é ${RELEVANCIAS.join(', ')}.`);
        where.push("json_extract(dados, '$.relevancia') = ?");
        params.push(rel);
      }
      const text = q(c, 'q');
      if (text) {
        where.push("busca LIKE ? ESCAPE '\\'");
        params.push(likeOf(text));
      }
      // a wishlist como a tela: MUST na frente, LATER no fim; dentro, o que entrou por último primeiro
      const order =
        tipo === 'desejo'
          ? "CASE json_extract(dados, '$.relevancia') WHEN 'must' THEN 0 WHEN 'comum' THEN 1 ELSE 2 END, json_extract(dados, '$.criado_em') DESC, id"
          : "json_extract(dados, '$.criado_em') DESC, id";
      const rows = await deps.db.all<{ dados: string }>(`SELECT dados FROM api_espelho WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit + 1, offset]);
      return c.json({ ...page(rows, limit, offset, (raw) => JSON.parse(raw) as DesejoV1 | PraDepoisV1), espelho: await mirrorState(deps, me.key.userId) });
    });
    app.get(`${path}/:id`, async (c) => {
      const me = await caller(c, scope);
      const item = await mirroredItem<DesejoV1 | PraDepoisV1>(deps, me.key.userId, tipo, c.req.param('id'));
      if (!item) throw NOT_FOUND[tipo];
      return c.json({ [tipo === 'desejo' ? 'desejo' : 'pra_depois']: item });
    });
  }

  listRoute('/ext/v1/desejos', 'desejo', 'desejos:ler');
  listRoute('/ext/v1/pra-depois', 'pra-depois', 'pra-depois:ler');

  // As fichas: por mural, status, veredito, nota mínima e busca; o texto vira um resumo, a não ser que se peça inteiro.
  app.get('/ext/v1/fichas', async (c) => {
    const me = await caller(c, 'fichas:ler');
    const limit = intQuery(q(c, 'limite'), 30, 1, LIST_MAX);
    const offset = intQuery(q(c, 'depois'), 0, 0, OFFSET_MAX);
    const orderName = q(c, 'ordem') ?? 'concluida';
    const order = Object.hasOwn(REVIEW_ORDERS, orderName) ? REVIEW_ORDERS[orderName] : undefined;
    if (!order) throw new HttpError(400, 'ordem-invalida', `A ordem é uma destas: ${Object.keys(REVIEW_ORDERS).join(', ')}.`);
    const where = ['usuario_id = ?', "tipo = 'ficha'"];
    const params: SqlValue[] = [me.key.userId];
    const mural = q(c, 'mural');
    if (mural !== undefined) {
      where.push('grupo = ?');
      params.push(muralQuery(mural));
    }
    for (const [k, allowed] of [
      ['status', STATUS],
      ['veredito', VEREDITOS],
    ] as const) {
      const v = q(c, k);
      if (v === undefined) continue;
      if (!(allowed as readonly string[]).includes(v)) throw new HttpError(400, 'filtro-invalido', `${k} é um destes: ${allowed.join(', ')}.`);
      where.push(`json_extract(dados, '$.${k}') = ?`);
      params.push(v);
    }
    const min = q(c, 'nota_min');
    if (min !== undefined) {
      const n = Number(min);
      if (!Number.isFinite(n) || n < 0 || n > 10) throw new HttpError(400, 'filtro-invalido', 'nota_min vai de 0 a 10.');
      where.push("json_extract(dados, '$.nota_final') >= ?");
      params.push(n);
    }
    const text = q(c, 'q');
    if (text) {
      where.push("busca LIKE ? ESCAPE '\\'");
      params.push(likeOf(text));
    }
    const withText = q(c, 'com_texto') === 'sim' || q(c, 'com_texto') === 'true';
    const rows = await deps.db.all<{ dados: string }>(`SELECT dados FROM api_espelho WHERE ${where.join(' AND ')} ORDER BY ${order} LIMIT ? OFFSET ?`, [...params, limit + 1, offset]);
    const shown = page(rows, limit, offset, (raw) => {
      const { texto, ...rest } = JSON.parse(raw) as FichaV1;
      return { ...rest, resumo: resumo(texto), ...(withText ? { texto } : {}) };
    });
    return c.json({ ...shown, espelho: await mirrorState(deps, me.key.userId) });
  });

  app.get('/ext/v1/fichas/:id', async (c) => {
    const me = await caller(c, 'fichas:ler');
    const f = await mirroredItem<FichaV1>(deps, me.key.userId, 'ficha', c.req.param('id'));
    if (!f) throw NOT_FOUND.ficha;
    return c.json({ ficha: f });
  });
}

/** A busca nos murais: os desejos, os pra depois e as fichas (pelo nome, o por e, na ficha, o texto). */
export async function searchMurals(deps: Deps, me: KeyCaller, raw: string, areas: readonly string[], max: number) {
  const out: (
    | { tipo: 'desejo' | 'pra-depois'; id: string; nome: string; mural: string }
    | { tipo: 'ficha'; id: string; nome: string; mural: string; nota_final: number; concluida_em: string | null }
  )[] = [];
  const parts: [string, ListKind, string][] = [
    ['desejos', 'desejo', 'desejos:ler'],
    ['pra-depois', 'pra-depois', 'pra-depois:ler'],
    ['fichas', 'ficha', 'fichas:ler'],
  ];
  for (const [area, tipo, scope] of parts) {
    if (!areas.includes(area)) continue;
    requireScope(me, scope);
    const rows = await deps.db.all<{ dados: string }>(`SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = ? AND busca LIKE ? ESCAPE '\\' ORDER BY versao DESC LIMIT ?`, [
      me.key.userId,
      tipo,
      likeOf(raw),
      max,
    ]);
    for (const row of rows) {
      const x = JSON.parse(row.dados) as FichaV1 | DesejoV1;
      out.push(tipo === 'ficha' ? { tipo, id: x.id, nome: x.nome, mural: x.mural, nota_final: (x as FichaV1).nota_final, concluida_em: (x as FichaV1).concluida_em } : { tipo, id: x.id, nome: x.nome, mural: x.mural });
    }
  }
  return out;
}
