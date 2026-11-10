import { LIGHT_STOCKS, LightStock } from './review';
import { groupKey } from './study';
import { cleanCategory } from './note-labels';
import { cleanLabel } from './text';
import { newImageId } from './images';
import { CALLOUTS, CALLOUT_PAPERS, CalloutLook } from './callouts';

/**
 * O Quadro livre (PLANO-QUADRO-LIVRE.md): um quadro infinito de um grupo das anotações, com molduras,
 * bilhetes, widgets (a anotação é o widget Nota; a imagem, o widget Imagem) e setas entre as peças.
 *
 * O formato é o do JSON Canvas do Obsidian, com as chaves curtas: as peças (`n`) na ordem de empilhar (a
 * primeira fica embaixo) e as setas (`e`). Cada quadro é um documento à parte, fora do mural privado: mexer
 * num quadro manda só ele para a nuvem (rodada 5 do plano).
 *
 * A regra vale na leitura (`sanitizeFreeBoard`): o que chega de fora (a nuvem, o backup, outra aba) é
 * cortado para caber, nunca jogado fora por inteiro. Campos que este site não conhece ficam guardados
 * (um site mais novo pode ter mais), e uma peça de tipo desconhecido fica no quadro sem aparecer
 * (`shownNodes`), para não sumir quando este site enviar o quadro de volta.
 */

/** O tipo de cada peça: `m` moldura (o retângulo com título), `x` bilhete (texto), `w` widget (a linha `{{...}}`). */
export type FbKind = 'm' | 'x' | 'w';
export const FB_KINDS: readonly FbKind[] = ['m', 'x', 'w'];

/** Um lado da peça, de onde a seta sai ou onde chega. */
export type FbSide = 't' | 'r' | 'b' | 'l';
export const FB_SIDES: readonly FbSide[] = ['t', 'r', 'b', 'l'];

/** As pontas da seta: omitida, só no fim (→, como no JSON Canvas); `-` nenhuma; `<` só no começo; `<>` nas duas. */
export type FbEnds = '-' | '<' | '<>';
export const FB_ENDS: readonly FbEnds[] = ['-', '<', '<>'];

/** A cor: uma cartolina (moldura, bilhete) ou a do giz (seta). Omitida, a padrão de cada peça. */
export type FbColor = LightStock;

interface FbBase {
  /** O id, único só dentro do quadro (`newNodeId`). */
  i: string;
  /** A posição e o tamanho no mundo, inteiros. */
  x: number;
  y: number;
  w: number;
  h: number;
  c?: FbColor;
  /** O agrupamento (Ctrl+G): as peças com o mesmo `g` andam e são selecionadas juntas. */
  g?: string;
  /** Campos de um site mais novo, guardados como vieram. */
  [extra: string]: unknown;
}

export interface FbFrame extends FbBase {
  t: 'm';
  /** O título, na fita Dymo. */
  nome?: string;
}

export interface FbNote extends FbBase {
  t: 'x';
  /** O texto, com a formatação das anotações: a primeira linha é o título do card, o resto, o que tem dentro. */
  txt: string;
  /** O jeito do card (o mesmo do card das anotações, core/callouts.ts). Omitido, a Nota. */
  k?: CalloutLook;
  /** A cor do card (uma das dez das anotações, `[!nota|azul]`). Omitida, a do jeito. */
  kc?: string;
}

export interface FbWidget extends FbBase {
  t: 'w';
  /** A linha do widget, a mesma das anotações (`{{imagem: murall://imagem/ID | foto}}`, `{{nota: #id | Título}}`). */
  src: string;
}

export type FbNode = FbFrame | FbNote | FbWidget;

/** Uma peça de um tipo que este site não conhece: fica guardada, sem aparecer. */
export interface FbUnknownNode extends FbBase {
  t: string;
}

export interface FbEdge {
  i: string;
  /** De onde sai e onde chega (ids de peças). */
  a: string;
  b: string;
  /**
   * Os lados; omitidos, a seta escolhe os mais perto (ver core/free-board-geometry.ts). Numa seta solta (sem `fx`)
   * eles valem até uma das peças andar ou mudar de tamanho: aí saem, e a seta volta a se ajeitar sozinha.
   */
  as?: FbSide;
  bs?: FbSide;
  /** Presa (o cadeado): os lados ficam onde estão, mesmo com as peças andando. */
  fx?: true;
  p?: FbEnds;
  c?: FbColor;
  /** O rótulo, no pedaço de fita crepe. */
  txt?: string;
  [extra: string]: unknown;
}

export interface FreeBoard {
  v: 1;
  /** 22 letras, sorteado como o das imagens (único entre todas as contas). */
  id: string;
  nome: string;
  /** O grupo das anotações, pelo nome (comparado pela chave, `groupKey`). */
  grupo: string;
  /** Quando mudou por último (a ordem da lista e o desempate da junção). */
  em: string;
  /** Público: quem visita o seu mural vê o quadro (rodada 6). Omitido, só você. */
  publico?: true;
  n: (FbNode | FbUnknownNode)[];
  e: FbEdge[];
  [extra: string]: unknown;
}

// ===== limites (seção 5.3 do plano) =====

export const FB_MAX_NODES = 2000;
export const FB_MAX_EDGES = 3000;
export const FB_NAME_MAX = 60;
export const FB_FRAME_TITLE_MAX = 80;
export const FB_LABEL_MAX = 120;
export const FB_TEXT_MAX = 4000;
/** A linha do widget: a tabela leva o corpo inteiro nela. */
export const FB_SRC_MAX = 20000;
/** "Beira o infinito": uns 380 mil furos de eucatex para cada lado. */
export const FB_COORD_MAX = 10_000_000;
export const FB_SIZE_MIN = 8;
export const FB_SIZE_MAX = 200_000;
/** Quantos quadros cabem numa conta. */
export const FB_MAX_BOARDS = 200;
/** O quadro em JSON, no aparelho (na nuvem o teto é o compactado, 256 KB). */
export const FB_MAX_JSON = 2_000_000;
/** Um campo desconhecido maior que isto não é guardado (um site mais novo não guarda texto longo assim). */
const EXTRA_MAX = 4000;

const ID_RE = /^[A-Za-z0-9_-]{22}$/;
const NODE_ID_RE = /^[A-Za-z0-9_-]{1,24}$/;
const KIND_RE = /^[a-z]{1,8}$/;

// ===== ids =====

/** O id de um quadro novo (o mesmo sorteio das imagens). */
export function newBoardId(): string {
  return newImageId();
}

/** O id do quadro serve? */
export function boardIdOk(id: unknown): id is string {
  return typeof id === 'string' && ID_RE.test(id);
}

/** Um id curto para uma peça ou seta, que ainda não está em `taken`. */
export function newNodeId(taken: ReadonlySet<string>): string {
  for (let len = 4; ; len++) {
    for (let tries = 0; tries < 20; tries++) {
      const bytes = crypto.getRandomValues(new Uint8Array(len));
      let id = '';
      for (const b of bytes) id += (b % 36).toString(36);
      if (/^[a-z]/.test(id) && !taken.has(id)) return id;
    }
  }
}

/** Os ids em uso no quadro (peças e setas dividem o mesmo espaço). */
export function idsOf(board: Pick<FreeBoard, 'n' | 'e'>): Set<string> {
  return new Set([...board.n.map((n) => n.i), ...board.e.map((e) => e.i)]);
}

// ===== a limpeza do que chega =====

const int = (v: unknown, min: number, max: number, fallback: number): number => {
  const n = typeof v === 'number' && Number.isFinite(v) ? Math.round(v) : fallback;
  return Math.min(max, Math.max(min, n));
};

const text = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\r\n?/g, '\n').slice(0, max) : '');

/** Uma linha só, sem espaços sobrando (título, rótulo). */
const line = (v: unknown, max: number): string => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '');

const color = (v: unknown): FbColor | undefined => ((LIGHT_STOCKS as readonly unknown[]).includes(v) ? (v as FbColor) : undefined);

/** Os campos que este site não conhece, se forem pequenos e simples (texto, número, sim/não). */
function extras(raw: Record<string, unknown>, known: ReadonlySet<string>): Record<string, unknown> {
  const out: Record<string, unknown> = {};
  for (const [k, v] of Object.entries(raw)) {
    if (known.has(k) || !/^[A-Za-z][A-Za-z0-9_]{0,23}$/.test(k)) continue;
    if ((typeof v === 'string' && v.length <= EXTRA_MAX) || typeof v === 'boolean' || (typeof v === 'number' && Number.isFinite(v))) out[k] = v;
  }
  return out;
}

const NODE_KEYS = new Set(['i', 't', 'x', 'y', 'w', 'h', 'c', 'g', 'nome', 'txt', 'src', 'k', 'kc']);
const EDGE_KEYS = new Set(['i', 'a', 'b', 'as', 'bs', 'fx', 'p', 'c', 'txt']);
const BOARD_KEYS = new Set(['v', 'id', 'nome', 'grupo', 'em', 'publico', 'n', 'e']);

/** Uma peça, cortada para caber; null se não tem o que guardar (sem id, sem tipo). */
export function sanitizeNode(raw: unknown): FbNode | FbUnknownNode | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const i = typeof r['i'] === 'string' && NODE_ID_RE.test(r['i']) ? r['i'] : null;
  const t = typeof r['t'] === 'string' && KIND_RE.test(r['t']) ? r['t'] : null;
  if (!i || !t) return null;
  const base: FbBase = {
    ...extras(r, NODE_KEYS),
    i,
    x: int(r['x'], -FB_COORD_MAX, FB_COORD_MAX, 0),
    y: int(r['y'], -FB_COORD_MAX, FB_COORD_MAX, 0),
    w: int(r['w'], FB_SIZE_MIN, FB_SIZE_MAX, 240),
    h: int(r['h'], FB_SIZE_MIN, FB_SIZE_MAX, 160),
  };
  const c = color(r['c']);
  if (c) base.c = c;
  const g = typeof r['g'] === 'string' && NODE_ID_RE.test(r['g']) ? r['g'] : null;
  if (g) base.g = g;
  switch (t) {
    case 'm': {
      const nome = line(r['nome'], FB_FRAME_TITLE_MAX);
      return { ...base, t: 'm', ...(nome ? { nome } : {}) };
    }
    case 'x': {
      const k = CALLOUTS.find((d) => d.look === r['k'])?.look;
      const kc = CALLOUT_PAPERS.find((d) => d.word === r['kc'])?.word;
      return { ...base, t: 'x', txt: text(r['txt'], FB_TEXT_MAX), ...(k ? { k } : {}), ...(kc ? { kc } : {}) };
    }
    case 'w': {
      const src = text(r['src'], FB_SRC_MAX).trim();
      // um widget sem linha não mostra nada: não é guardado
      return src ? { ...base, t: 'w', src } : null;
    }
    default: {
      // de um site mais novo: fica com o que veio (os campos conhecidos, cortados; os outros, se simples)
      const known = ['nome', 'txt', 'src'].filter((k) => typeof r[k] === 'string').map((k) => [k, text(r[k], FB_SRC_MAX)]);
      return { ...base, t, ...Object.fromEntries(known) };
    }
  }
}

/** Uma seta, cortada para caber; null se falta uma ponta. */
export function sanitizeEdge(raw: unknown): FbEdge | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  const ok = (v: unknown) => (typeof v === 'string' && NODE_ID_RE.test(v) ? v : null);
  const i = ok(r['i']);
  const a = ok(r['a']);
  const b = ok(r['b']);
  if (!i || !a || !b || a === b) return null;
  const out: FbEdge = { ...extras(r, EDGE_KEYS), i, a, b };
  if ((FB_SIDES as readonly unknown[]).includes(r['as'])) out.as = r['as'] as FbSide;
  if ((FB_SIDES as readonly unknown[]).includes(r['bs'])) out.bs = r['bs'] as FbSide;
  if (r['fx'] === true) out.fx = true;
  if ((FB_ENDS as readonly unknown[]).includes(r['p'])) out.p = r['p'] as FbEnds;
  const c = color(r['c']);
  if (c) out.c = c;
  const txt = line(r['txt'], FB_LABEL_MAX);
  if (txt) out.txt = txt;
  return out;
}

/** O nome do quadro: uma linha, até 60 letras, com a primeira maiúscula (como o nome de pasta). */
export function cleanBoardName(raw: string): string {
  return cleanLabel(raw, FB_NAME_MAX);
}

/**
 * O quadro como vale: os números na faixa, ids repetidos fora (fica o primeiro), as peças e as setas até o
 * limite, a seta que aponta para uma peça que não está no quadro fora. Sem id, sem nome ou sem grupo, null
 * (quadro sem grupo não existe, decisão D12 do plano).
 */
export function sanitizeFreeBoard(raw: unknown): FreeBoard | null {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return null;
  const r = raw as Record<string, unknown>;
  if (!boardIdOk(r['id'])) return null;
  const nome = typeof r['nome'] === 'string' ? cleanBoardName(r['nome']) : '';
  const grupo = typeof r['grupo'] === 'string' ? cleanCategory(r['grupo']) : '';
  if (!nome || !groupKey(grupo)) return null;
  const em = typeof r['em'] === 'string' && Number.isFinite(Date.parse(r['em'])) ? new Date(r['em']).toISOString() : new Date(0).toISOString();
  const taken = new Set<string>();
  const n: (FbNode | FbUnknownNode)[] = [];
  for (const item of Array.isArray(r['n']) ? r['n'] : []) {
    if (n.length >= FB_MAX_NODES) break;
    const node = sanitizeNode(item);
    if (!node || taken.has(node.i)) continue;
    taken.add(node.i);
    n.push(node);
  }
  const nodes = new Set(taken);
  const e: FbEdge[] = [];
  for (const item of Array.isArray(r['e']) ? r['e'] : []) {
    if (e.length >= FB_MAX_EDGES) break;
    const edge = sanitizeEdge(item);
    if (!edge || taken.has(edge.i) || !nodes.has(edge.a) || !nodes.has(edge.b)) continue;
    taken.add(edge.i);
    e.push(edge);
  }
  return { ...extras(r, BOARD_KEYS), v: 1, id: r['id'] as string, nome, grupo, em, ...(r['publico'] === true ? { publico: true as const } : {}), n, e };
}

/** A peça é de um tipo que este site mostra? */
export function knownNode(node: FbNode | FbUnknownNode): node is FbNode {
  return (FB_KINDS as readonly string[]).includes(node.t);
}

/** As peças que este site mostra (as de tipo desconhecido ficam guardadas, sem aparecer). */
export function shownNodes(board: Pick<FreeBoard, 'n'>): FbNode[] {
  return board.n.filter(knownNode);
}

/** As setas que este site mostra: as duas pontas em peças que aparecem. */
export function shownEdges(board: Pick<FreeBoard, 'n' | 'e'>): FbEdge[] {
  const shown = new Set(shownNodes(board).map((n) => n.i));
  return board.e.filter((e) => shown.has(e.a) && shown.has(e.b));
}

/** O quadro cabe no aparelho (o JSON inteiro)? */
export function boardFits(board: FreeBoard): boolean {
  return board.n.length <= FB_MAX_NODES && board.e.length <= FB_MAX_EDGES && JSON.stringify(board).length <= FB_MAX_JSON;
}

// ===== o quadro novo e o grupo =====

export function newFreeBoard(nome: string, grupo: string, at: string, id = newBoardId()): FreeBoard | null {
  return sanitizeFreeBoard({ v: 1, id, nome, grupo, em: at, n: [], e: [] });
}

/** O quadro é do grupo (pela chave)? */
export function boardInGroup(board: Pick<FreeBoard, 'grupo'>, group: string | null | undefined): boolean {
  const key = groupKey(group);
  return !!key && groupKey(board.grupo) === key;
}

/**
 * Os quadros quando o grupo `from` vira `to` (renomeado ou juntado a outro) ou é apagado (`to` null):
 * renomeado, os quadros dele passam a ser de `to` (também quando só muda a escrita, a caixa ou um acento);
 * apagado, saem (decisão D12, como os baralhos). Devolve a lista nova, os que mudaram e os que saíram.
 */
export function boardsMovedGroup(
  boards: readonly FreeBoard[],
  from: string,
  to: string | null,
  at: string,
): { boards: FreeBoard[]; changed: FreeBoard[]; removed: FreeBoard[] } {
  const fromKey = groupKey(from);
  const label = to === null ? null : cleanCategory(to);
  const out: FreeBoard[] = [];
  const changed: FreeBoard[] = [];
  const removed: FreeBoard[] = [];
  for (const b of boards) {
    if (!fromKey || groupKey(b.grupo) !== fromKey) {
      out.push(b);
    } else if (label === null || !groupKey(label)) {
      removed.push(b);
    } else if (b.grupo === label) {
      out.push(b);
    } else {
      const moved = { ...b, grupo: label, em: at };
      out.push(moved);
      changed.push(moved);
    }
  }
  return { boards: out, changed, removed };
}

/** A lista em ordem: os mexidos por último primeiro (decisão D11); no empate, pelo nome. */
export function sortBoards(boards: readonly FreeBoard[]): FreeBoard[] {
  return [...boards].sort((a, b) => b.em.localeCompare(a.em) || a.nome.localeCompare(b.nome, 'pt-BR'));
}

/** O nome que ainda não existe no grupo: "Blue Prince", "Blue Prince (2)"... (para Duplicar e criar). */
export function freeBoardName(boards: readonly FreeBoard[], group: string, wanted: string): string {
  const base = cleanBoardName(wanted) || 'Quadro';
  const taken = new Set(boards.filter((b) => boardInGroup(b, group)).map((b) => b.nome.toLocaleLowerCase('pt-BR')));
  if (!taken.has(base.toLocaleLowerCase('pt-BR'))) return base;
  for (let k = 2; ; k++) {
    const suffix = ` (${k})`;
    const name = cleanBoardName(base.slice(0, FB_NAME_MAX - suffix.length) + suffix);
    if (!taken.has(name.toLocaleLowerCase('pt-BR'))) return name;
  }
}

// ===== mudar as peças (funções puras; o quadro devolvido tem `em` novo) =====

/**
 * Põe peças (e setas) no quadro, por cima de tudo. Ids repetidos ganham outro, e as setas que vinham junto
 * seguem os ids novos (é o colar e o duplicar). Passou do limite: o que não cabe fica de fora, e `left` diz
 * quantas peças.
 */
export function addPieces(board: FreeBoard, nodes: readonly FbNode[], edges: readonly FbEdge[], at: string): { board: FreeBoard; added: FbNode[]; left: number } {
  const taken = idsOf(board);
  const rename = new Map<string, string>();
  const room = Math.max(0, FB_MAX_NODES - board.n.length);
  const added: FbNode[] = [];
  for (const raw of nodes.slice(0, room)) {
    const node = sanitizeNode(raw);
    if (!node || !knownNode(node)) continue;
    const id = taken.has(node.i) ? newNodeId(taken) : node.i;
    taken.add(id);
    rename.set(node.i, id);
    added.push({ ...node, i: id });
  }
  const ends = new Set([...board.n.map((n) => n.i), ...added.map((n) => n.i)]);
  const newEdges: FbEdge[] = [];
  for (const raw of edges) {
    if (board.e.length + newEdges.length >= FB_MAX_EDGES) break;
    const edge = sanitizeEdge(raw);
    if (!edge) continue;
    const a = rename.get(edge.a) ?? edge.a;
    const b = rename.get(edge.b) ?? edge.b;
    if (!ends.has(a) || !ends.has(b) || a === b) continue;
    const id = taken.has(edge.i) ? newNodeId(taken) : edge.i;
    taken.add(id);
    newEdges.push({ ...edge, i: id, a, b });
  }
  return { board: { ...board, em: at, n: [...board.n, ...added], e: [...board.e, ...newEdges] }, added, left: Math.max(0, nodes.length - room) };
}

/** Tira as peças e as setas `ids` (as setas das peças tiradas vão junto). */
export function removePieces(board: FreeBoard, ids: ReadonlySet<string>, at: string): FreeBoard {
  const n = board.n.filter((x) => !ids.has(x.i));
  const left = new Set(n.map((x) => x.i));
  const e = board.e.filter((x) => !ids.has(x.i) && left.has(x.a) && left.has(x.b));
  if (n.length === board.n.length && e.length === board.e.length) return board;
  return { ...board, em: at, n, e };
}

/**
 * Muda campos de peças (posição, tamanho, cor, texto...): `patch(peça)` devolve a peça nova, ou a mesma. A peça
 * que andou ou mudou de tamanho solta os lados das setas dela que não estão presas (elas se ajeitam sozinhas).
 */
export function patchNodes(board: FreeBoard, ids: ReadonlySet<string>, patch: (node: FbNode) => FbNode, at: string): FreeBoard {
  let changed = false;
  const moved = new Set<string>();
  const n = board.n.map((x) => {
    if (!ids.has(x.i) || !knownNode(x)) return x;
    const next = sanitizeNode(patch(x));
    if (!next || next.i !== x.i || next.t !== x.t) return x;
    changed ||= JSON.stringify(next) !== JSON.stringify(x);
    if (next.x !== x.x || next.y !== x.y || next.w !== x.w || next.h !== x.h) moved.add(x.i);
    return next;
  });
  if (!changed) return board;
  return { ...board, em: at, n, e: moved.size ? looseSides(board.e, moved) : board.e };
}

/** As setas soltas (sem cadeado) que tocam as peças `moved` perdem os lados guardados: voltam a escolher sozinhas. */
function looseSides(edges: FbEdge[], moved: ReadonlySet<string>): FbEdge[] {
  let touched = false;
  const out = edges.map((e) => {
    if (e.fx || (!e.as && !e.bs) || (!moved.has(e.a) && !moved.has(e.b))) return e;
    touched = true;
    const { as: _, bs: __, ...rest } = e;
    return rest as FbEdge;
  });
  return touched ? out : edges;
}

/** Anda com as peças `ids` (dx, dy no mundo). */
export function moveNodes(board: FreeBoard, ids: ReadonlySet<string>, dx: number, dy: number, at: string): FreeBoard {
  if (!dx && !dy) return board;
  return patchNodes(board, ids, (n) => ({ ...n, x: n.x + dx, y: n.y + dy }), at);
}

/** Muda campos de uma seta; a que perde uma ponta não muda. */
export function patchEdge(board: FreeBoard, id: string, patch: (edge: FbEdge) => FbEdge, at: string): FreeBoard {
  const nodes = new Set(board.n.map((n) => n.i));
  let changed = false;
  const e = board.e.map((x) => {
    if (x.i !== id) return x;
    const next = sanitizeEdge(patch(x));
    if (!next || next.i !== x.i || !nodes.has(next.a) || !nodes.has(next.b)) return x;
    changed = JSON.stringify(next) !== JSON.stringify(x);
    return next;
  });
  return changed ? { ...board, em: at, e } : board;
}

/** Liga duas peças com uma seta nova (null se uma não existe, se é a mesma ou se o quadro está cheio de setas). */
export function connect(board: FreeBoard, a: string, b: string, at: string, sides: { as?: FbSide; bs?: FbSide } = {}): { board: FreeBoard; edge: FbEdge } | null {
  if (a === b || board.e.length >= FB_MAX_EDGES) return null;
  const nodes = new Set(board.n.map((n) => n.i));
  if (!nodes.has(a) || !nodes.has(b)) return null;
  const edge: FbEdge = { i: newNodeId(idsOf(board)), a, b, ...(sides.as ? { as: sides.as } : {}), ...(sides.bs ? { bs: sides.bs } : {}) };
  return { board: { ...board, em: at, e: [...board.e, edge] }, edge };
}

/** Leva as peças `ids` para cima de tudo (`front`) ou para baixo de tudo, na ordem em que estavam. */
export function restack(board: FreeBoard, ids: ReadonlySet<string>, front: boolean, at: string): FreeBoard {
  const moving = board.n.filter((x) => ids.has(x.i));
  if (!moving.length) return board;
  const rest = board.n.filter((x) => !ids.has(x.i));
  const n = front ? [...rest, ...moving] : [...moving, ...rest];
  return n.every((x, k) => x === board.n[k]) ? board : { ...board, em: at, n };
}

/** Junta as peças `ids` num agrupamento novo (Ctrl+G); devolve o id dele. Menos de duas, nada muda. */
export function groupPieces(board: FreeBoard, ids: ReadonlySet<string>, at: string): { board: FreeBoard; group: string | null } {
  if (board.n.filter((n) => ids.has(n.i)).length < 2) return { board, group: null };
  const group = newNodeId(new Set([...idsOf(board), ...board.n.flatMap((n) => (n.g ? [n.g] : []))]));
  return { board: patchNodes(board, ids, (n) => ({ ...n, g: group }), at), group };
}

/** Desfaz os agrupamentos das peças `ids` (Ctrl+Shift+G). */
export function ungroupPieces(board: FreeBoard, ids: ReadonlySet<string>, at: string): FreeBoard {
  return patchNodes(
    board,
    ids,
    (n) => {
      const { g: _, ...rest } = n;
      return rest as FbNode;
    },
    at,
  );
}

/** Todas as peças do mesmo agrupamento de cada uma de `ids` (clicar numa seleciona o grupo inteiro). */
export function withGroups(board: Pick<FreeBoard, 'n'>, ids: ReadonlySet<string>): Set<string> {
  const groups = new Set(board.n.filter((n) => ids.has(n.i) && n.g).map((n) => n.g as string));
  const out = new Set(ids);
  if (groups.size) for (const n of board.n) if (n.g && groups.has(n.g)) out.add(n.i);
  return out;
}

// ===== o texto como card (o callout das anotações) =====

/** O jeito do card do texto (sem um, a Nota, como o card novo das anotações). */
export function noteLook(n: Pick<FbNote, 'k'>): CalloutLook {
  return n.k ?? 'nota';
}

/**
 * A cor do card do texto: a escolhida ou, num texto de antes dos cards, a da cartolina dele quando ela é uma das
 * cores dos cards (o branco vira o do jeito). "": a do jeito.
 */
export function noteColor(n: Pick<FbNote, 'kc' | 'c'>): string {
  if (n.kc) return n.kc;
  return n.c && CALLOUT_PAPERS.some((d) => d.word === n.c) ? n.c : '';
}

/** O título e o que tem dentro: a primeira linha (sem o # de título) é o título, se for texto e não lista, tabela ou widget. */
export function noteParts(txt: string): { title: string; body: string } {
  const lines = txt.split('\n');
  const first = lines[0] ?? '';
  const rest = (t: string) => t.replace(/^\s*\n/, '');
  if (!first.trim() || /^\s*([-*+>|]|\d+[.)]\s|\[[ xX]?\]|\{\{)/.test(first)) return { title: '', body: rest(txt) };
  return { title: first.replace(/^\s*#+\s*/, '').trim(), body: rest(lines.slice(1).join('\n')) };
}

// ===== o que o quadro usa =====

/** O texto do quadro em que moram os widgets (para achar as imagens: `localImageIds`, e as notas: `cardRefsIn`). */
export function boardSources(board: Pick<FreeBoard, 'n'>): string {
  return board.n.map((n) => (typeof n['src'] === 'string' ? n['src'] : typeof n['txt'] === 'string' ? n['txt'] : '')).join('\n');
}

/** Quantas peças aparecem (o número da folha na lista). */
export function pieceCount(board: Pick<FreeBoard, 'n'>): number {
  return shownNodes(board).length;
}
