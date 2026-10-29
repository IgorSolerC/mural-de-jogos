import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import { CONTEXTO_FICHAS, MURAIS, RELEVANCIAS, STATUS, VEREDITOS, ehMural, type ContextoFichasV1, type DesejoV1, type FichaV1, type PraDepoisV1 } from '../../../contrato/api-v1/murais';
import { resumo } from '../../../contrato/api-v1/notas';
import {
  OPS_DOS_MURAIS,
  conferirOpMural,
  desejoDoPedido,
  editarDesejoV1,
  editarFichaV1,
  fichaDoPedido,
  itemDoPedido,
  type CriarFichaV1,
  type EditarDesejoV1,
  type EditarFichaV1,
  type OpMural,
  type PorItemV1,
} from '../../../contrato/api-v1/operacoes-murais';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { todayIn } from '../domain/mirror';
import { openRequests, stateOf, type RequestRow } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps, SqlValue } from '../ports';
import { OFFSET_MAX, intQuery, mirrorState } from './routes';

/**
 * Ler os murais de resenhas com a chave (PLANO-API.md, 7.4; rodada 9): a wishlist, o Pra depois e as
 * fichas, cada um com filtros e pelo id, e o que cada mural tem. Tudo do espelho; a nota final e o que
 * cada mural tem vêm prontos do site. Os pedidos abertos vêm por cima (8.5): o desejo posto aparece, o
 * mudado aparece mudado, o que vai sair fica com o pedido na lista.
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

/** Um pedido aberto, como a AI vê por cima do item. */
interface PedidoNoItem {
  id: string;
  op: OpMural;
  estado: ReturnType<typeof stateOf>;
}
export type ComPedidos<T> = T & { pedidos?: PedidoNoItem[] };

/** De que lista é cada operação de pôr. */
const PUT_OF: Partial<Record<OpMural, 'desejo' | 'pra-depois'>> = { 'desejo.por': 'desejo', 'pra-depois.por': 'pra-depois' };

/** Os pedidos abertos dos murais: os itens que vão entrar (por lista) e, por item, as mudanças. */
async function pendingMurals(deps: Deps, userId: string) {
  const rows = (await openRequests(deps, userId)).filter((r) => (OPS_DOS_MURAIS as readonly string[]).includes(r.op));
  const created = rows.filter((r) => PUT_OF[r.op as OpMural]);
  const createdReviews = rows.filter((r) => r.op === 'ficha.criar');
  const byItem = new Map<string, RequestRow[]>();
  for (const r of rows) if (!PUT_OF[r.op as OpMural] && r.op !== 'ficha.criar') byItem.set(r.alvo, [...(byItem.get(r.alvo) ?? []), r]);
  return { rows, created, createdReviews, byItem };
}

const marker = (r: RequestRow, now: Date): PedidoNoItem => ({ id: r.id, op: r.op as OpMural, estado: stateOf(r, now) });

/** O item com as mudanças abertas por cima (o que vai sair fica, com o pedido na lista). */
function overlayItem<T extends DesejoV1 | PraDepoisV1>(x: T, rows: readonly RequestRow[] | undefined, now: Date): ComPedidos<T> {
  if (!rows?.length) return x;
  let out = x;
  for (const r of rows) {
    if (r.op !== 'desejo.editar') continue;
    const c = conferirOpMural('desejo.editar', JSON.parse(r.dados));
    if (c.ok) out = editarDesejoV1(out as DesejoV1, c.dados as EditarDesejoV1, r.criado_em) as T;
  }
  return { ...out, pedidos: rows.map((r) => marker(r, now)) };
}

/** O item de um pedido de pôr ainda não aplicado, com as mudanças de depois por cima. */
function createdItem(row: RequestRow, later: readonly RequestRow[] | undefined, now: Date): ComPedidos<DesejoV1 | PraDepoisV1> {
  const d = JSON.parse(row.dados) as PorItemV1;
  const base = row.op === 'desejo.por' ? desejoDoPedido(row.alvo, d, row.criado_em) : itemDoPedido(row.alvo, d, row.criado_em);
  const shown = overlayItem<DesejoV1 | PraDepoisV1>(base, later, now);
  return { ...shown, pedidos: [marker(row, now), ...(shown.pedidos ?? [])] };
}

/** O desejo ou o pra depois de agora: o do espelho, ou o de um pedido de pôr; com os pedidos por cima. */
export async function currentItem(deps: Deps, userId: string, tipo: 'desejo' | 'pra-depois', id: string): Promise<ComPedidos<DesejoV1 | PraDepoisV1> | null> {
  const [found, pending] = await Promise.all([mirroredItem<DesejoV1 | PraDepoisV1>(deps, userId, tipo, id), pendingMurals(deps, userId)]);
  const now = deps.now();
  if (found) return overlayItem(found, pending.byItem.get(id), now);
  const created = pending.created.find((r) => r.alvo === id && PUT_OF[r.op as OpMural] === tipo);
  return created ? createdItem(created, pending.byItem.get(id), now) : null;
}

/** Os itens que vão entrar numa lista (com os pedidos de depois por cima), para conferir o nome repetido. */
export async function arrivingItems(deps: Deps, userId: string, tipo: 'desejo' | 'pra-depois'): Promise<ComPedidos<DesejoV1 | PraDepoisV1>[]> {
  const pending = await pendingMurals(deps, userId);
  const now = deps.now();
  return pending.created.filter((r) => PUT_OF[r.op as OpMural] === tipo).map((r) => createdItem(r, pending.byItem.get(r.alvo), now));
}

/** A ficha com as mudanças abertas por cima. */
function overlayReview(f: FichaV1, rows: readonly RequestRow[] | undefined, now: Date): ComPedidos<FichaV1> {
  if (!rows?.length) return f;
  let out = f;
  for (const r of rows) {
    const c = conferirOpMural('ficha.editar', JSON.parse(r.dados));
    if (r.op === 'ficha.editar' && c.ok) out = editarFichaV1(out, c.dados as EditarFichaV1, r.criado_em);
  }
  return { ...out, pedidos: rows.map((r) => marker(r, now)) };
}

/** O que a prévia de uma ficha nova precisa: o perfil de cada mural e o dia de hoje no fuso da conta. */
async function reviewPreview(deps: Deps, userId: string) {
  const [ctx, state] = await Promise.all([reviewContext(deps, userId), mirrorState(deps, userId)]);
  return { perfil: (mural: string) => ctx?.murais.find((m) => m.mural === mural) ?? null, hoje: todayIn(state.fuso, deps.now()) };
}

/** A ficha de um pedido de criar ainda não aplicado, com as mudanças de depois por cima. */
function createdReview(row: RequestRow, later: readonly RequestRow[] | undefined, now: Date, preview: Awaited<ReturnType<typeof reviewPreview>>): ComPedidos<FichaV1> {
  const d = JSON.parse(row.dados) as CriarFichaV1;
  const shown = overlayReview(fichaDoPedido(row.alvo, d, preview.perfil(d.mural), preview.hoje, row.criado_em), later, now);
  return { ...shown, pedidos: [marker(row, now), ...(shown.pedidos ?? [])] };
}

/** A ficha de agora: a do espelho, ou a de um pedido de criar; com os pedidos por cima. */
export async function currentReview(deps: Deps, userId: string, id: string): Promise<ComPedidos<FichaV1> | null> {
  const [found, pending] = await Promise.all([mirroredItem<FichaV1>(deps, userId, 'ficha', id), pendingMurals(deps, userId)]);
  const now = deps.now();
  if (found) return overlayReview(found, pending.byItem.get(id), now);
  const created = pending.createdReviews.find((r) => r.alvo === id);
  return created ? createdReview(created, pending.byItem.get(id), now, await reviewPreview(deps, userId)) : null;
}

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
      const pending = await pendingMurals(deps, me.key.userId);
      const now = deps.now();
      const shown = page(rows, limit, offset, (raw) => {
        const x = JSON.parse(raw) as DesejoV1 | PraDepoisV1;
        return overlayItem(x, pending.byItem.get(x.id), now);
      });
      // os que vão entrar, no começo da primeira página (só o filtro do mural vale para eles)
      const arriving =
        offset === 0 && rel === undefined && !text
          ? pending.created.filter((r) => PUT_OF[r.op as OpMural] === tipo && (mural === undefined || (JSON.parse(r.dados) as PorItemV1).mural === mural)).map((r) => createdItem(r, pending.byItem.get(r.alvo), now))
          : [];
      return c.json({ ...shown, itens: [...arriving, ...shown.itens], espelho: await mirrorState(deps, me.key.userId) });
    });
    app.get(`${path}/:id`, async (c) => {
      const me = await caller(c, scope);
      const item = await currentItem(deps, me.key.userId, tipo, c.req.param('id'));
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
    const pending = await pendingMurals(deps, me.key.userId);
    const now = deps.now();
    const summary = (f: ComPedidos<FichaV1>) => {
      const { texto, ...rest } = f;
      return { ...rest, resumo: resumo(texto), ...(withText ? { texto } : {}) };
    };
    const shown = page(rows, limit, offset, (raw) => {
      const f = JSON.parse(raw) as FichaV1;
      return summary(overlayReview(f, pending.byItem.get(f.id), now));
    });
    // as que vão nascer, no começo da primeira página (só o filtro do mural vale para elas)
    const filtered = [q(c, 'status'), q(c, 'veredito'), min, text].some((v) => v !== undefined);
    const preview = offset === 0 && !filtered && pending.createdReviews.length ? await reviewPreview(deps, me.key.userId) : null;
    const arriving = preview
      ? pending.createdReviews
          .filter((r) => mural === undefined || (JSON.parse(r.dados) as CriarFichaV1).mural === mural)
          .map((r) => summary(createdReview(r, pending.byItem.get(r.alvo), now, preview)))
      : [];
    return c.json({ ...shown, itens: [...arriving, ...shown.itens], espelho: await mirrorState(deps, me.key.userId) });
  });

  app.get('/ext/v1/fichas/:id', async (c) => {
    const me = await caller(c, 'fichas:ler');
    const f = await currentReview(deps, me.key.userId, c.req.param('id'));
    if (!f) throw NOT_FOUND.ficha;
    return c.json({ ficha: f });
  });
}

/** A busca nos murais: os desejos, os pra depois e as fichas (pelo nome, o por e, na ficha, o texto). */
export async function searchMurals(deps: Deps, me: KeyCaller, raw: string, areas: readonly string[], max: number) {
  const out: (
    | { tipo: 'desejo' | 'pra-depois'; id: string; nome: string; mural: string }
    | { tipo: 'ficha'; id: string; nome: string; mural: string; nota_final: number | null; concluida_em: string | null }
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
