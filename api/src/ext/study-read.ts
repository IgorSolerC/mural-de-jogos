import { Context, Hono } from 'hono';
import { dobra } from '../../../contrato/api-v1/escopos';
import {
  CONTEXTO_ESTUDOS,
  NIVEIS,
  diaDeEstudo,
  filaDeAgora,
  filaDoDia,
  type BaralhoV1,
  type CartaV1,
  type ContagemV1,
  type ContextoEstudosV1,
  type FilaDoDiaV1,
  type ItemDaFilaV1,
  type NivelV1,
} from '../../../contrato/api-v1/estudos';
import { resumo } from '../../../contrato/api-v1/notas';
import type { CriarNotaV1 } from '../../../contrato/api-v1/operacoes';
import {
  OPS_DOS_ESTUDOS,
  acharBaralho,
  baralhosDeNome,
  baralhoDoPedido,
  cartaDoPedido,
  conferirOpEstudo,
  editarBaralhoV1,
  editarCartaV1,
  moverBaralho,
  type CriarBaralhoV1,
  type EditarBaralhoV1,
  type EditarCartaV1,
  type OpEstudo,
  type PorCartaV1,
} from '../../../contrato/api-v1/operacoes-estudos';
import { KeyCaller, authenticateKey, requireScope } from '../domain/api-key';
import { todayIn } from '../domain/mirror';
import { openRequests, stateOf, type RequestRow } from '../domain/requests';
import { HttpError } from '../errors';
import { Deps, SqlValue } from '../ports';
import { OFFSET_MAX, groupLimit, intQuery, mirrorState } from './routes';

/**
 * Ler os Estudos com a chave (PLANO-API.md, seção 23, rodada 12): os baralhos (com o que tem para hoje
 * em cada um), as cartas (a frente, o verso, o progresso) e a fila de agora, para a AI estudar com a
 * pessoa. Tudo do espelho: a fila do dia vem pronta do app (o FSRS e os limites do dia são conta dele);
 * daqui só se separa o que é para agora das cartas nos passos que voltam mais tarde. Os pedidos abertos
 * vêm por cima (8.5): o baralho criado aparece, a carta mudada aparece mudada, a respondida sai da fila.
 * Cada baralho é de um grupo das anotações (PLANO-ESTUDOS-GRUPOS.md): a chave limitada a alguns grupos só
 * vê as cartas das notas deles e os baralhos deles.
 */

/** As permissões dos Estudos: qualquer uma deixa ver os baralhos no contexto (quem põe cartas precisa dos nomes). */
export const STUDY_SCOPES = ['estudos:ler', 'estudos:estudar', 'estudos:escrever', 'estudos:apagar'] as const;

const LIST_MAX = 100;
const TODAY_MAX = 50;
const PAGE_MAX_CHARS = 256_000;
/** O D1 aceita até 100 valores numa consulta. */
const IN_MAX = 90;
const ID_RE = /^[\w-]{1,64}$/;
const CARD_ORDERS: Record<string, string> = {
  entrou: "json_extract(dados, '$.entrou_em') DESC, id",
  volta: 'data IS NULL, data, id',
  titulo: "lower(json_extract(dados, '$.titulo')), id",
  mudou: 'versao DESC, id',
};

export const cardNotFound = () => new HttpError(404, 'carta-nao-encontrada', 'Não achei essa carta (a anotação não é carta, ou está num grupo que esta chave não alcança).');

interface PedidoNosEstudos {
  id: string;
  op: string;
  estado: ReturnType<typeof stateOf>;
}
export type ComPedidos<T> = T & { pedidos?: PedidoNosEstudos[] };
/** O baralho como a lista e o contexto mostram: sem as filas, com o que tem para hoje. */
export type BaralhoResumoV1 = Omit<BaralhoV1, 'filas'> & { hoje: ContagemV1 | null };

const marker = (r: RequestRow, now: Date): PedidoNosEstudos => ({ id: r.id, op: r.op, estado: stateOf(r, now) });

/** Os pedidos abertos que mexem nos Estudos: os dos baralhos e das cartas, e as notas novas que nascem carta. */
export async function pendingStudy(deps: Deps, userId: string) {
  // todos os abertos (as notas que vão nascer, para a carta de uma delas), e os dos Estudos
  const all = await openRequests(deps, userId);
  const rows = all.filter((r) => (OPS_DOS_ESTUDOS as readonly string[]).includes(r.op) || (r.op === 'nota.criar' && !!(JSON.parse(r.dados) as CriarNotaV1).estudos));
  const decks = rows.filter((r) => r.op.startsWith('baralho.'));
  const byCard = new Map<string, RequestRow[]>();
  for (const r of rows) if (!r.op.startsWith('baralho.')) byCard.set(r.alvo, [...(byCard.get(r.alvo) ?? []), r]);
  return { all, rows, decks, byCard };
}
export type PendingStudy = Awaited<ReturnType<typeof pendingStudy>>;

/** Os pedidos abertos e os baralhos como vão ficar: o que cada rota dos Estudos lê uma vez só. */
export interface StudyNow {
  pending: PendingStudy;
  decks: ComPedidos<BaralhoV1>[];
}

export async function studyNow(deps: Deps, userId: string): Promise<StudyNow> {
  const pending = await pendingStudy(deps, userId);
  return { pending, decks: decksAsWillBe(await mirroredDecks(deps, userId), pending, deps.now()) };
}

/** O baralho vai ser apagado por um pedido aberto (não conta para nome repetido nem para o limite). */
export const leaving = (d: ComPedidos<BaralhoV1>) => !!d.pedidos?.some((p) => p.op === 'baralho.apagar');

/** Os baralhos que a chave alcança: a limitada a alguns grupos só vê os dos grupos dela. */
export function decksInKey<T extends Pick<BaralhoV1, 'grupo'>>(me: KeyCaller, decks: readonly T[]): T[] {
  return me.key.groups?.length ? decks.filter((d) => inKeyGroups(me, d.grupo)) : [...decks];
}

/** O nome do baralho com o grupo, para as mensagens: "Kana (Estudo Japones)". */
export const deckLabel = (d: Pick<BaralhoV1, 'nome' | 'grupo'>) => (d.grupo ? `${d.nome} (${d.grupo})` : d.nome);

/**
 * O baralho pelo nome ou pelo id. O mesmo nome em mais de um grupo vale o do `grupo` (o da anotação); sem
 * ele para desempatar, 422 pedindo o id.
 */
export function pickDeck<T extends BaralhoV1>(decks: readonly T[], ref: string, grupo?: string | null, campo = 'baralho'): T | null {
  const d = acharBaralho(decks, ref, grupo);
  if (!d || d.id === ref) return d;
  const named = baralhosDeNome(decks, ref);
  if (named.length > 1 && !(grupo && d.grupo && dobra(d.grupo) === dobra(grupo))) {
    throw new HttpError(422, 'baralho-ambiguo', `Há mais de um baralho "${ref.slice(0, 64)}" (campo ${campo}): ${named.map((x) => `${deckLabel(x)}, id ${x.id}`).join('; ')}. Use o id.`);
  }
  return d;
}

/** Os baralhos pedidos (nomes ou ids) trocados pelos ids, ou 422 com os que existem. `campo` vai na mensagem; `grupo` desempata o nome repetido. */
export function resolveDecks(decks: readonly BaralhoV1[], refs: readonly string[], campo = 'baralhos', grupo?: string | null): string[] {
  return refs.map((ref) => {
    const d = pickDeck(decks, ref, grupo, campo);
    if (!d) {
      throw new HttpError(
        422,
        'baralho-desconhecido',
        `Não há o baralho "${ref.slice(0, 64)}" (campo ${campo}). ${decks.length ? `Os baralhos são: ${decks.map(deckLabel).join(', ')}.` : 'Ainda não há baralhos: crie com criar_baralho.'}`,
      );
    }
    return d.id;
  });
}

/** Os baralhos do espelho, na ordem da fileira. */
export async function mirroredDecks(deps: Deps, userId: string): Promise<BaralhoV1[]> {
  const rows = await deps.db.all<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'baralho'", [userId]);
  return rows.map((r) => JSON.parse(r.dados) as BaralhoV1).sort((a, b) => a.posicao - b.posicao || a.id.localeCompare(b.id));
}

/** Os baralhos como vão ficar: os criados no fim, os mudados mudados, os que vão sair com o pedido na lista. */
export function decksAsWillBe(decks: readonly BaralhoV1[], pending: PendingStudy, now: Date): ComPedidos<BaralhoV1>[] {
  let out: ComPedidos<BaralhoV1>[] = [...decks];
  for (const r of pending.decks) {
    const op = r.op as OpEstudo;
    const c = conferirOpEstudo(op, JSON.parse(r.dados));
    if (!c.ok) continue;
    const mark = (b: ComPedidos<BaralhoV1>) => ({ ...b, pedidos: [...(b.pedidos ?? []), marker(r, now)] });
    if (op === 'baralho.criar') {
      if (out.some((b) => b.id === r.alvo)) continue;
      const next = out.reduce((m, b) => Math.max(m, b.posicao + 1), 0);
      out.push(mark(baralhoDoPedido(r.alvo, c.dados as CriarBaralhoV1, next, r.criado_em)));
    } else if (op === 'baralho.editar') {
      const d = c.dados as EditarBaralhoV1;
      out = out.map((b) => (b.id === r.alvo ? mark(editarBaralhoV1(b, d, r.criado_em)) : b));
      if (d.posicao !== undefined) out = moverBaralho(out, r.alvo, d.posicao);
    } else out = out.map((b) => (b.id === r.alvo ? mark(b) : b));
  }
  return out.sort((a, b) => a.posicao - b.posicao || a.id.localeCompare(b.id));
}

/**
 * Os baralhos `ids` são do grupo da anotação? (Cada baralho só tem cartas do grupo dele.) 422 com o motivo,
 * ou nada; o baralho de antes dos grupos (sem grupo) ainda não tem como conferir e passa.
 */
export function assertDecksInGroup(decks: readonly BaralhoV1[], ids: readonly string[], grupo: string | null, quem: string): void {
  if (!grupo) throw new HttpError(422, 'nota-sem-grupo', `${quem} não tem grupo: só a anotação de um grupo vira carta, porque cada baralho é de um grupo. Ponha a anotação num grupo (editar_nota) antes.`);
  const out = ids.map((id) => decks.find((d) => d.id === id)).filter((d): d is BaralhoV1 => !!d && !!d.grupo && dobra(d.grupo) !== dobra(grupo));
  if (out.length) {
    const ok = decks.filter((d) => !!d.grupo && dobra(d.grupo) === dobra(grupo)).map((d) => d.nome);
    throw new HttpError(
      422,
      'baralho-de-outro-grupo',
      `${out.map(deckLabel).join(', ')} ${out.length === 1 ? 'é de outro grupo' : 'são de outro grupo'}, e ${quem.toLowerCase()} é de ${grupo}: um baralho só tem cartas do grupo dele. ${ok.length ? `Os baralhos de ${grupo}: ${ok.join(', ')}.` : `Ainda não há baralho em ${grupo}: crie com criar_baralho (grupo: "${grupo}").`}`,
    );
  }
}

/** Os baralhos levam a carta ao mural (o "no mural também" de algum deles)? */
export const wallOf = (decks: readonly Pick<BaralhoV1, 'id' | 'no_mural'>[]) => (ids: readonly string[]) => ids.some((id) => decks.find((d) => d.id === id)?.no_mural);

/** O que se sabe de uma anotação para mostrar a carta que vai nascer: do espelho das notas, ou de um pedido de criar. */
export interface NoteInfo {
  id: string;
  titulo: string;
  texto: string;
  grupo: string | null;
  /** Está no mural agora (a nota só no Kanban não está): a que vira carta continua onde está. */
  noMural: boolean;
}

/** A carta com os pedidos abertos dela por cima (a que vai sair fica, com o pedido na lista). */
export function cardAsWillBe(
  card: CartaV1 | null,
  rows: readonly RequestRow[] | undefined,
  decks: readonly BaralhoV1[],
  note: NoteInfo | null,
  now: Date,
): ComPedidos<CartaV1> | null {
  if (!rows?.length) return card;
  let c: CartaV1 | null = card;
  const wall = wallOf(decks);
  for (const r of rows) {
    const raw = JSON.parse(r.dados) as Record<string, unknown>;
    if (r.op === 'nota.criar') {
      const d = raw as unknown as CriarNotaV1;
      if (!c && d.estudos) c = cartaDoPedido({ id: r.alvo, titulo: d.titulo, texto: d.texto ?? '', grupo: d.grupo ?? null }, null, d.estudos, r.criado_em, wall, false);
      continue;
    }
    const op = r.op as OpEstudo;
    const k = conferirOpEstudo(op, raw);
    if (!k.ok) continue;
    if (op === 'carta.por') {
      if (c || note) c = cartaDoPedido(note ?? { id: r.alvo, titulo: c!.nota_titulo, texto: c!.verso, grupo: c!.grupo }, c, k.dados as PorCartaV1, r.criado_em, wall, note?.noMural ?? true);
    } else if (op === 'carta.editar' && c) c = editarCartaV1(c, k.dados as EditarCartaV1, r.criado_em, wall);
    else if (op === 'carta.recomecar' && c) c = { ...c, nivel: 'desconhecida', estado: 'nova', volta_em: null, vistas: 0, acertos: 0, erros: 0, ultimas: '' };
  }
  return c ? { ...c, pedidos: rows.map((r) => marker(r, now)) } : null;
}

/** As notas (do espelho das Anotações, ou de um pedido de criar) pelo id: para a carta que vai nascer. */
export async function notesInfo(deps: Deps, userId: string, ids: readonly string[], open: readonly RequestRow[]): Promise<Map<string, NoteInfo>> {
  const out = new Map<string, NoteInfo>();
  for (const r of open) {
    if (r.op !== 'nota.criar' || !ids.includes(r.alvo)) continue;
    const d = JSON.parse(r.dados) as CriarNotaV1;
    out.set(r.alvo, { id: r.alvo, titulo: d.titulo, texto: d.texto ?? '', grupo: d.grupo ?? null, noMural: true });
  }
  const rest = ids.filter((id) => !out.has(id));
  for (let i = 0; i < rest.length; i += IN_MAX) {
    const part = rest.slice(i, i + IN_MAX);
    const rows = await deps.db.all<{ id: string; dados: string }>(
      `SELECT id, dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'nota' AND id IN (${part.map(() => '?').join(', ')})`,
      [userId, ...part],
    );
    for (const row of rows) {
      const n = JSON.parse(row.dados) as { titulo: string; texto: string; grupo: string | null; kanban: { no_mural: boolean } | null };
      out.set(row.id, { id: row.id, titulo: n.titulo, texto: n.texto, grupo: n.grupo, noMural: !n.kanban || n.kanban.no_mural });
    }
  }
  return out;
}

/** O grupo cabe na chave? (A limitada não vê a carta de nota sem grupo.) */
export function inKeyGroups(me: KeyCaller, grupo: string | null): boolean {
  const groups = me.key.groups;
  return !groups?.length || (grupo !== null && groups.some((g) => dobra(g) === dobra(grupo)));
}

/** As cartas do espelho pelo id, só as que a chave alcança. */
async function cardsById(deps: Deps, me: KeyCaller, ids: readonly string[]): Promise<Map<string, CartaV1>> {
  const out = new Map<string, CartaV1>();
  const limit = groupLimit(me);
  for (let i = 0; i < ids.length; i += IN_MAX - limit.params.length) {
    const part = ids.slice(i, i + IN_MAX - limit.params.length);
    const rows = await deps.db.all<{ dados: string }>(
      `SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'carta' AND id IN (${part.map(() => '?').join(', ')})${limit.sql}`,
      [me.key.userId, ...part, ...limit.params],
    );
    for (const r of rows) {
      const c = JSON.parse(r.dados) as CartaV1;
      out.set(c.nota, c);
    }
  }
  return out;
}

/** A carta de agora: a do espelho com os pedidos por cima, ou a que só existe num pedido; null fora do alcance. */
export async function findCard(deps: Deps, me: KeyCaller, nota: string, ctx?: StudyNow): Promise<ComPedidos<CartaV1> | null> {
  if (!ID_RE.test(nota)) return null;
  const { pending, decks } = ctx ?? (await studyNow(deps, me.key.userId));
  const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'carta' AND id = ?", [me.key.userId, nota]);
  const card = row ? (JSON.parse(row.dados) as CartaV1) : null;
  const rows = pending.byCard.get(nota);
  const info = card || !rows?.length ? null : ((await notesInfo(deps, me.key.userId, [nota], pending.all)).get(nota) ?? null);
  const out = cardAsWillBe(card, rows, decks, info, deps.now());
  return out && inKeyGroups(me, out.grupo) ? out : null;
}

/** O contexto dos Estudos: a configuração e os baralhos (os nomes a usar ao pôr cartas), para qualquer chave dos Estudos. */
export async function studyContext(deps: Deps, me: KeyCaller) {
  const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'contexto-estudos' AND id = ?", [
    me.key.userId,
    CONTEXTO_ESTUDOS,
  ]);
  if (!row) return null;
  const ctx = JSON.parse(row.dados) as ContextoEstudosV1;
  const only = await reachable(deps, me);
  const decks = limitedDecks(decksInKey(me, decksAsWillBe(await mirroredDecks(deps, me.key.userId), await pendingStudy(deps, me.key.userId), deps.now())), only);
  return {
    config: ctx.config,
    cartas: only ? only.size : ctx.cartas,
    baralhos: decks.map((b) => ({ id: b.id, nome: b.nome, grupo: b.grupo ?? null, cor: b.cor, novas_por_dia: b.novas_por_dia, no_mural: b.no_mural, estilo: b.estilo, cartas: b.cartas })),
  };
}

/**
 * As filas de um grupo: as de todos, só com as cartas dos baralhos dele (a carta é de um grupo só, e o
 * baralho que a traz na fila de todos é um dos dela). O teto de revisões do dia é o de todos os baralhos:
 * com ele cheio, o grupo mostra as revisões que cabem nele, como o Estudar tudo.
 */
function groupQueues(filas: readonly FilaDoDiaV1[], ids: ReadonlySet<string>): FilaDoDiaV1[] {
  return filas.map((f) => ({ ...f, itens: f.itens.filter((i) => ids.has(i.baralho)) }));
}

/** Os baralhos do grupo pedido (sem acento nem caixa), ou 404 com os grupos que têm baralho. */
function decksOfGroup<T extends Pick<BaralhoV1, 'id' | 'grupo'>>(decks: readonly T[], grupo: string): T[] {
  const mine = decks.filter((d) => !!d.grupo && dobra(d.grupo) === dobra(grupo));
  if (mine.length) return mine;
  const groups = [...new Set(decks.flatMap((d) => (d.grupo ? [d.grupo] : [])))];
  throw new HttpError(404, 'grupo-sem-baralho', `O grupo "${grupo.slice(0, 32)}" não tem baralho. ${groups.length ? `Os grupos com baralho: ${groups.join(', ')}.` : 'Ainda não há baralhos: crie com criar_baralho.'}`);
}

/**
 * Quantas cartas o grupo tem nos baralhos dele (cada carta uma vez, mesmo em dois baralhos; a guardada fora
 * dos baralhos não conta), só as que a chave alcança.
 */
async function groupCards(deps: Deps, me: KeyCaller, grupo: string): Promise<number> {
  const limit = groupLimit(me);
  const row = await deps.db.first<{ n: number }>(
    `SELECT COUNT(*) AS n FROM api_espelho WHERE usuario_id = ? AND tipo = 'carta' AND grupo = ? AND json_array_length(dados, '$.baralhos') > 0${limit.sql}`,
    [me.key.userId, dobra(grupo), ...limit.params],
  );
  return row?.n ?? 0;
}

/** A fila de agora de uma fila do dia (a de todos, ou a de um baralho), sem as cartas que um pedido já respondeu ou tirou. */
function nowQueue(filas: readonly FilaDoDiaV1[], dia: string, pending: PendingStudy, now: Date) {
  const fila = filaDoDia(filas, dia);
  if (!fila) return null;
  const gone = new Set<string>();
  for (const [nota, rows] of pending.byCard) if (rows.some((r) => r.op === 'carta.responder' || r.op === 'carta.tirar' || r.op === 'carta.recomecar')) gone.add(nota);
  return { fila, ...filaDeAgora(fila, now, gone) };
}

/** As cartas que a chave limitada alcança, com o nível e os baralhos (null: a chave não é limitada, alcança todas). */
async function reachable(deps: Deps, me: KeyCaller): Promise<Map<string, { nivel: NivelV1; baralhos: string[] }> | null> {
  if (!me.key.groups?.length) return null;
  const limit = groupLimit(me);
  const rows = await deps.db.all<{ id: string; nivel: NivelV1; baralhos: string }>(
    `SELECT id, json_extract(dados, '$.nivel') AS nivel, json_extract(dados, '$.baralhos') AS baralhos FROM api_espelho WHERE usuario_id = ? AND tipo = 'carta'${limit.sql}`,
    [me.key.userId, ...limit.params],
  );
  return new Map(rows.map((r) => [r.id, { nivel: r.nivel, baralhos: JSON.parse(r.baralhos) as string[] }]));
}

/**
 * Os números dos baralhos (quantas cartas, os níveis) só com as cartas que a chave limitada alcança: ela
 * não fica sabendo nem quantas cartas há nas notas dos outros grupos.
 */
function limitedDecks<T extends Pick<BaralhoV1, 'id' | 'cartas' | 'por_nivel'>>(decks: readonly T[], only: ReadonlyMap<string, { nivel: NivelV1; baralhos: string[] }> | null): T[] {
  if (!only) return [...decks];
  return decks.map((d) => {
    const por_nivel = Object.fromEntries(NIVEIS.map((n) => [n, 0])) as Record<NivelV1, number>;
    let cartas = 0;
    for (const c of only.values()) {
      if (!c.baralhos.includes(d.id)) continue;
      cartas++;
      if (c.nivel in por_nivel) por_nivel[c.nivel]++;
    }
    return { ...d, cartas, por_nivel };
  });
}

const count = (items: readonly ItemDaFilaV1[], tipo: ItemDaFilaV1['tipo']) => items.filter((i) => i.tipo === tipo).length;

export function studyReadRoutes(app: Hono, deps: Deps): void {
  const caller = async (c: Context) => {
    const me = await authenticateKey(deps, c.req.header('Authorization'));
    requireScope(me, 'estudos:ler');
    return me;
  };
  /** O dia de estudo de agora no fuso da conta (vira às 4h). */
  const studyDay = (fuso: string | null) => diaDeEstudo(deps.now(), (d) => todayIn(fuso, d));

  // Os baralhos (com o que tem para hoje em cada um), a configuração e o total de hoje.
  app.get('/ext/v1/estudos', async (c) => {
    const me = await caller(c);
    const espelho = await mirrorState(deps, me.key.userId);
    const ctxRow = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'contexto-estudos' AND id = ?", [
      me.key.userId,
      CONTEXTO_ESTUDOS,
    ]);
    if (!ctxRow) return c.json({ config: null, cartas: 0, baralhos: [], hoje: null, espelho });
    const ctx = JSON.parse(ctxRow.dados) as ContextoEstudosV1;
    const pending = await pendingStudy(deps, me.key.userId);
    const now = deps.now();
    const dia = studyDay(espelho.fuso);
    const only = await reachable(deps, me);
    const counted = (q: ReturnType<typeof nowQueue>): ContagemV1 | null => {
      if (!q) return null;
      if (!only) return q.contagem;
      const live = [...q.agora].filter((i) => only.has(i.nota));
      return { novas: count(live, 'nova'), aprender: count(live, 'aprender'), revisar: count(live, 'revisao') };
    };
    const group = c.req.query('grupo')?.trim() || null;
    const inKey = decksInKey(me, decksAsWillBe(await mirroredDecks(deps, me.key.userId), pending, now));
    const decks = limitedDecks(group ? decksOfGroup(inKey, group) : inKey, only);
    const baralhos: ComPedidos<BaralhoResumoV1>[] = decks.map(({ filas, ...b }) => ({ ...b, hoje: counted(nowQueue(filas, dia, pending, now)) }));
    const all = nowQueue(group ? groupQueues(ctx.filas, new Set(decks.map((d) => d.id))) : ctx.filas, dia, pending, now);
    return c.json({
      config: ctx.config,
      ...(group ? { grupo: decks[0]?.grupo ?? group } : {}),
      cartas: group ? await groupCards(deps, me, group) : only ? only.size : ctx.cartas,
      baralhos,
      hoje: all
        ? { dia, contagem: counted(all), cortada: all.fila.cortada }
        : { dia, contagem: null, aviso: 'A fila de hoje ainda não chegou: o Murall não foi aberto desde ontem. Abra o site em algum aparelho e ela chega em seguida.' },
      espelho,
    });
  });

  // O que tem para estudar agora (de todos os baralhos, ou de um), com a frente e o verso de cada carta.
  app.get('/ext/v1/estudos/hoje', async (c) => {
    const me = await caller(c);
    const espelho = await mirrorState(deps, me.key.userId);
    const limit = intQuery(c.req.query('limite'), 10, 1, TODAY_MAX);
    const pending = await pendingStudy(deps, me.key.userId);
    const now = deps.now();
    const dia = studyDay(espelho.fuso);
    const ref = c.req.query('baralho')?.trim();
    const group = c.req.query('grupo')?.trim() || null;
    let filas: readonly FilaDoDiaV1[] | null = null;
    let deck: { id: string; nome: string; grupo: string | null } | null = null;
    if (ref) {
      // o baralho que só existe num pedido (criado agora pela AI) também vale: ainda sem cartas
      const found = pickDeck(decksInKey(me, decksAsWillBe(await mirroredDecks(deps, me.key.userId), pending, now)), ref, group);
      if (!found) throw await deckNotFound(deps, me, ref);
      deck = { id: found.id, nome: found.nome, grupo: found.grupo ?? null };
      if (!found.filas.length && found.pedidos?.some((p) => p.op === 'baralho.criar')) {
        return c.json({ dia, baralho: deck, contagem: { novas: 0, aprender: 0, revisar: 0 }, cartas: [], mais_tarde: [], restam: 0, aviso: 'O baralho ainda vai ser criado: as cartas dele entram na fila quando o Murall aplicar os pedidos.', espelho });
      }
      filas = found.filas;
    } else {
      const row = await deps.db.first<{ dados: string }>("SELECT dados FROM api_espelho WHERE usuario_id = ? AND tipo = 'contexto-estudos' AND id = ?", [
        me.key.userId,
        CONTEXTO_ESTUDOS,
      ]);
      filas = row ? (JSON.parse(row.dados) as ContextoEstudosV1).filas : null;
      // o Estudar o grupo: a fila de todos, só com os baralhos dele
      if (group && filas) {
        const mine = decksOfGroup(decksInKey(me, decksAsWillBe(await mirroredDecks(deps, me.key.userId), pending, now)), group);
        filas = groupQueues(filas, new Set(mine.map((d) => d.id)));
      }
    }
    const q = filas ? nowQueue(filas, dia, pending, now) : null;
    if (!q) {
      const aviso = filas
        ? 'A fila de hoje ainda não chegou: o Murall não foi aberto desde ontem. Abra o site em algum aparelho e ela chega em seguida.'
        : 'Os Estudos ainda não chegaram: abra o Murall em algum aparelho logado nesta conta.';
      return c.json({ dia, baralho: deck, contagem: null, cartas: [], mais_tarde: [], restam: 0, aviso, espelho });
    }
    const only = await reachable(deps, me);
    const agora = only ? q.agora.filter((i) => only.has(i.nota)) : q.agora;
    const later = only ? q.mais_tarde.filter((i) => only.has(i.nota)) : q.mais_tarde;
    const first = agora.slice(0, limit);
    const cards = await cardsById(deps, me, [...first, ...later].map((i) => i.nota));
    const cartas = first.flatMap((i) => {
      const k = cards.get(i.nota);
      return k ? [{ ...k, tipo: i.tipo, baralho_da_vez: i.baralho }] : [];
    });
    return c.json({
      dia,
      baralho: deck,
      contagem: { novas: count(agora, 'nova'), aprender: count(agora, 'aprender'), revisar: count(agora, 'revisao') },
      cartas,
      mais_tarde: later.map((i) => ({ nota: i.nota, titulo: cards.get(i.nota)?.titulo ?? null, volta_em: i.volta_em })),
      restam: Math.max(0, agora.length - first.length),
      ...(q.fila.cortada ? { cortada: true } : {}),
      espelho,
    });
  });

  // As cartas, com filtros (sem o verso; com_verso traz inteiro).
  app.get('/ext/v1/estudos/cartas', async (c) => {
    const me = await caller(c);
    const q = (k: string) => c.req.query(k)?.trim() || undefined;
    const limit = intQuery(q('limite'), 30, 1, LIST_MAX);
    const offset = intQuery(q('depois'), 0, 0, OFFSET_MAX);
    const orderName = q('ordem') ?? 'entrou';
    const order = Object.hasOwn(CARD_ORDERS, orderName) ? CARD_ORDERS[orderName] : undefined;
    if (!order) throw new HttpError(400, 'ordem-invalida', `A ordem é uma destas: ${Object.keys(CARD_ORDERS).join(', ')}.`);
    const level = q('nivel');
    if (level !== undefined && !(NIVEIS as readonly string[]).includes(level)) throw new HttpError(400, 'filtro-invalido', `O nível é ${NIVEIS.join(', ')}.`);
    const withBack = ['sim', 'true', '1'].includes(q('com_verso') ?? '');
    const pending = await pendingStudy(deps, me.key.userId);
    const now = deps.now();
    const decks = decksInKey(me, decksAsWillBe(await mirroredDecks(deps, me.key.userId), pending, now));
    const where: string[] = ['usuario_id = ?', "tipo = 'carta'"];
    const params: SqlValue[] = [me.key.userId];
    let deckId: string | null = null;
    const ref = q('baralho');
    const group = q('grupo');
    if (group) {
      where.push('grupo = ?');
      params.push(dobra(group));
    }
    if (ref) {
      const found = pickDeck(decks, ref, group);
      if (!found) throw await deckNotFound(deps, me, ref);
      deckId = found.id;
      where.push("EXISTS (SELECT 1 FROM json_each(dados, '$.baralhos') WHERE value = ?)");
      params.push(found.id);
    }
    if (level) {
      where.push("json_extract(dados, '$.nivel') = ?");
      params.push(level);
    }
    const text = q('q');
    if (text) {
      where.push("busca LIKE ? ESCAPE '\\'");
      params.push(`%${dobra(text).replace(/[%_\\]/g, (m) => `\\${m}`)}%`);
    }
    const limitSql = groupLimit(me);
    const rows = await deps.db.all<{ dados: string }>(
      `SELECT dados FROM api_espelho WHERE ${where.join(' AND ')}${limitSql.sql} ORDER BY ${order} LIMIT ? OFFSET ?`,
      [...params, ...limitSql.params, limit + 1, offset],
    );
    const summary = (k: ComPedidos<CartaV1>) => {
      const { verso, ...rest } = k;
      return { ...rest, resumo_do_verso: resumo(verso), ...(withBack ? { verso } : {}) };
    };
    const itens: ReturnType<typeof summary>[] = [];
    if (offset === 0) {
      // as cartas que só existem num pedido (a anotação virando carta, a nota nova que nasce carta)
      const mirrored = new Set(rows.map((r) => (JSON.parse(r.dados) as CartaV1).nota));
      const fresh = [...pending.byCard.entries()].filter(([nota, rs]) => !mirrored.has(nota) && rs.some((r) => r.op === 'carta.por' || r.op === 'nota.criar'));
      if (fresh.length) {
        const known = await cardsById(deps, me, fresh.map(([n]) => n));
        const infos = await notesInfo(deps, me.key.userId, fresh.map(([n]) => n).filter((n) => !known.has(n)), pending.all);
        for (const [nota, rs] of fresh) {
          if (known.has(nota)) continue;
          const k = cardAsWillBe(null, rs, decks, infos.get(nota) ?? null, now);
          if (!k || !inKeyGroups(me, k.grupo)) continue;
          if ((deckId && !k.baralhos.includes(deckId)) || (group && (!k.grupo || dobra(k.grupo) !== dobra(group))) || (level && k.nivel !== level) || (text && !dobra(`${k.titulo}\n${k.verso}`).includes(dobra(text)))) continue;
          itens.push(summary(k));
        }
      }
    }
    let chars = 0;
    let taken = 0;
    for (const row of rows.slice(0, limit)) {
      if (taken && chars + row.dados.length > PAGE_MAX_CHARS) break;
      chars += row.dados.length;
      taken++;
      const k = JSON.parse(row.dados) as CartaV1;
      itens.push(summary(cardAsWillBe(k, pending.byCard.get(k.nota), decks, null, now) ?? k));
    }
    const more = rows.length > taken;
    return c.json({ itens, ...(more ? { depois: String(offset + taken) } : {}), espelho: await mirrorState(deps, me.key.userId) });
  });

  // Uma carta inteira: a frente, o verso e o progresso.
  app.get('/ext/v1/estudos/cartas/:nota', async (c) => {
    const me = await caller(c);
    const k = await findCard(deps, me, c.req.param('nota'));
    if (!k) throw cardNotFound();
    return c.json({ carta: k });
  });
}

/** O 404 de um baralho que não existe, com os que existem. */
export async function deckNotFound(deps: Deps, me: KeyCaller, ref: string): Promise<HttpError> {
  const decks = decksInKey(me, decksAsWillBe(await mirroredDecks(deps, me.key.userId), await pendingStudy(deps, me.key.userId), deps.now()));
  return new HttpError(
    404,
    'baralho-nao-encontrado',
    `Não achei o baralho "${ref.slice(0, 64)}". ${decks.length ? `Os baralhos são: ${decks.map(deckLabel).join(', ')}.` : 'Ainda não há baralhos (crie com criar_baralho).'}`,
  );
}

