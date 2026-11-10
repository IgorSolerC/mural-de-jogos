import { FbColor, FbEdge, FbNode, FbSide, FreeBoard, addPieces, idsOf, knownNode, newNodeId, shownNodes, withGroups } from '../../core/free-board';
import { HOLE, Point, Rect, boundsOf, contains, distanceToPath, edgePath, grow, insideFrame, intersects, paintOrder, snap } from '../../core/free-board-geometry';
import { parseVideo, parseWidgetLine, widgetDef } from '../../core/widgets';

/**
 * A edição do Quadro livre (PLANO-QUADRO-LIVRE.md, 4.4), em funções puras: acertar o que está debaixo do
 * ponteiro, a caixa de seleção, o que vai junto num arrasto, o encaixe nos furos, o tamanho de cada tipo de
 * peça, o que se cola de fora, onde as peças novas entram e o desfazer. A peça (free-board-view.ts) só liga os
 * gestos a isto.
 */

// ===== acertar =====

/** A faixa da borda da moldura que pega o clique (px da tela): no meio dela, o clique é do fundo (a caixa de seleção). */
export const FRAME_EDGE_PX = 12;
/** A altura do alto da moldura (o título) que pega o clique, no mundo. */
export const FRAME_HEAD = 76;

/** A peça de cima no ponto do mundo `p`, com o zoom `z` (a borda da moldura tem largura de tela). */
export function hitPiece(nodes: readonly FbNode[], p: Point, z: number): FbNode | null {
  const order = paintOrder(nodes);
  for (let k = order.length - 1; k >= 0; k--) {
    const n = order[k];
    if (p.x < n.x || p.y < n.y || p.x > n.x + n.w || p.y > n.y + n.h) continue;
    if (n.t !== 'm') return n;
    // a moldura: só a borda e o alto (o título); dentro dela, o clique é do fundo
    const edge = FRAME_EDGE_PX / z;
    const inner = p.x > n.x + edge && p.x < n.x + n.w - edge && p.y > n.y + Math.max(edge, FRAME_HEAD) && p.y < n.y + n.h - edge;
    if (!inner) return n;
  }
  return null;
}

/** A seta mais perto do ponto, se está a menos de `tol` (no mundo). */
export function hitEdge(board: Pick<FreeBoard, 'n' | 'e'>, p: Point, tol: number): FbEdge | null {
  const byId = new Map(shownNodes(board).map((n) => [n.i, n]));
  let best: { e: FbEdge; d: number } | null = null;
  for (const e of board.e) {
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (!a || !b) continue;
    const path = edgePath(a, b, { as: e.as as FbSide | undefined, bs: e.bs as FbSide | undefined });
    if (!intersects(grow(path.box, tol), { x: p.x, y: p.y, w: 0, h: 0 })) continue;
    const d = distanceToPath(p, path);
    if (d <= tol && (!best || d < best.d)) best = { e, d };
  }
  return best?.e ?? null;
}

/** As peças que a caixa pega: as que ficam inteiras dentro dela, ou, com `touch` (Alt), as que ela só encosta. */
export function boxSelect(nodes: readonly FbNode[], box: Rect, touch = false): Set<string> {
  return new Set(nodes.filter((n) => (touch ? intersects(box, n) : contains(box, n))).map((n) => n.i));
}

/**
 * O que anda num arrasto: a seleção, os agrupamentos dela (Ctrl+G) e, de cada moldura arrastada, o que está
 * inteiro dentro dela no começo do arrasto (como no Obsidian).
 */
export function dragSet(board: Pick<FreeBoard, 'n'>, selected: ReadonlySet<string>): Set<string> {
  const nodes = shownNodes(board);
  const out = withGroups(board, selected);
  for (const n of nodes) if (out.has(n.i) && n.t === 'm') for (const id of insideFrame(nodes, n.i)) out.add(id);
  return out;
}

/** O deslocamento com o encaixe nos furos: a peça que guia (a de cima à esquerda) cai num furo. Sem `snapOn`, livre. */
export function snappedDelta(lead: Point, dx: number, dy: number, snapOn: boolean): Point {
  if (!snapOn) return { x: Math.round(dx), y: Math.round(dy) };
  return { x: snap(lead.x + dx) - lead.x, y: snap(lead.y + dy) - lead.y };
}

// ===== o tamanho =====

/** As alças: os cantos e o meio dos lados (n, s, e, w e as combinações). */
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const ALL_HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Como a peça muda de tamanho (decisão D9): livre (moldura, bilhete), na proporção (imagem) ou só a largura (widgets). */
export type SizeRule = 'livre' | 'proporcao' | 'largura';

export function sizeRule(node: FbNode): SizeRule {
  if (node.t !== 'w') return 'livre';
  return parseWidgetLine(node.src)?.name === 'imagem' ? 'proporcao' : 'largura';
}

/** As alças de cada regra: os widgets só dos lados (a altura vem do conteúdo). */
export function handlesFor(rule: SizeRule): readonly Handle[] {
  return rule === 'largura' ? ['e', 'w'] : ALL_HANDLES;
}

const MIN = { livre: 52, proporcao: 52, largura: 130 };

/**
 * A caixa nova ao puxar a alça `h` de `dx`, `dy` (no mundo). Na proporção, a largura manda (Shift a solta,
 * `free`); só a largura, a altura fica. Com encaixe, a borda que anda cai num furo.
 */
export function resized(start: Rect, h: Handle, dx: number, dy: number, rule: SizeRule, opts: { free?: boolean; snapOn?: boolean } = {}): Rect {
  let x0 = start.x;
  let y0 = start.y;
  let x1 = start.x + start.w;
  let y1 = start.y + start.h;
  const s = (v: number) => (opts.snapOn ? snap(v) : Math.round(v));
  if (h.includes('w')) x0 = s(x0 + dx);
  if (h.includes('e')) x1 = s(x1 + dx);
  if (rule !== 'largura') {
    if (h.includes('n')) y0 = s(y0 + dy);
    if (h.includes('s')) y1 = s(y1 + dy);
  }
  const min = MIN[rule];
  if (x1 - x0 < min) h.includes('w') ? (x0 = x1 - min) : (x1 = x0 + min);
  if (y1 - y0 < Math.min(min, start.h)) h.includes('n') ? (y0 = y1 - Math.min(min, start.h)) : (y1 = y0 + Math.min(min, start.h));
  let out = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (rule === 'proporcao' && !opts.free) {
    const ratio = start.w / Math.max(1, start.h);
    const sideOnly = h === 'n' || h === 's';
    const w = sideOnly ? Math.round(out.h * ratio) : out.w;
    const hh = Math.round(w / ratio);
    out = { x: h.includes('w') ? x1 - w : x0, y: h.includes('n') ? y1 - hh : y0, w, h: hh };
  }
  return out;
}

// ===== as peças novas =====

/** O tamanho de uma peça nova de cada tipo (um múltiplo dos furos). */
export function defaultSize(kind: 'bilhete' | 'nota' | 'imagem' | 'contador' | 'video' | 'audio' | 'tabela' | 'widget'): { w: number; h: number } {
  switch (kind) {
    case 'bilhete':
      return { w: HOLE * 8, h: HOLE * 4 };
    case 'nota':
      return { w: HOLE * 12, h: HOLE * 7 };
    case 'imagem':
      return { w: HOLE * 10, h: HOLE * 7.5 };
    case 'video':
      return { w: HOLE * 16, h: HOLE * 9 };
    case 'audio':
      return { w: HOLE * 12, h: HOLE * 5 };
    case 'tabela':
      return { w: HOLE * 16, h: HOLE * 8 };
    default:
      return { w: HOLE * 12, h: HOLE * 6 };
  }
}

/** O tamanho de um widget novo pela linha dele. */
export function sizeForLine(line: string, image?: { w: number; h: number }): { w: number; h: number } {
  const name = parseWidgetLine(line.split('\n')[0])?.name ?? (line.trim().startsWith('|') ? 'tabela' : 'widget');
  if (name === 'imagem' && image) {
    const w = HOLE * 10;
    return { w, h: Math.max(HOLE * 2, Math.round((w * image.h) / Math.max(1, image.w))) };
  }
  if (name === 'contador' || name === 'video' || name === 'audio' || name === 'tabela' || name === 'nota' || name === 'imagem') return defaultSize(name);
  return defaultSize('widget');
}

/**
 * Onde entram `sizes` peças a partir do ponto `at` (o ponto onde se soltou, ou o meio da tela): em grade,
 * da esquerda para a direita, com um furo de vão, quebrando a linha depois de `perRow`.
 */
export function placeGrid(at: Point, sizes: readonly { w: number; h: number }[], perRow = 5): Rect[] {
  const out: Rect[] = [];
  let x = snap(at.x);
  let y = snap(at.y);
  let rowH = 0;
  sizes.forEach((s, k) => {
    if (k && k % perRow === 0) {
      x = snap(at.x);
      y = snap(y + rowH + HOLE);
      rowH = 0;
    }
    out.push({ x, y, w: s.w, h: s.h });
    x = snap(x + s.w + HOLE);
    rowH = Math.max(rowH, s.h);
  });
  return out;
}

/** Uma peça nova (com um id que ainda não está no quadro). */
export function newNode(board: Pick<FreeBoard, 'n' | 'e'>, kind: 'm' | 'x' | 'w', box: Rect, extra: { nome?: string; txt?: string; src?: string; c?: FbColor } = {}): FbNode {
  const i = newNodeId(idsOf(board));
  const base = { i, x: Math.round(box.x), y: Math.round(box.y), w: Math.max(8, Math.round(box.w)), h: Math.max(8, Math.round(box.h)), ...(extra.c ? { c: extra.c } : {}) };
  if (kind === 'm') return { ...base, t: 'm', ...(extra.nome ? { nome: extra.nome } : {}) };
  if (kind === 'x') return { ...base, t: 'x', txt: extra.txt ?? '' };
  return { ...base, t: 'w', src: extra.src ?? '' };
}

// ===== colar =====

/** O tipo da área de transferência das peças (para colar em outro quadro, no mesmo navegador). */
export const CLIP_TYPE = 'application/x-murall-quadro';

export interface Clip {
  v: 1;
  n: FbNode[];
  e: FbEdge[];
}

/** As peças `ids` e as setas entre elas, para copiar; e o texto legível (títulos, bilhetes) para colar fora do Murall. */
export function copyPieces(board: Pick<FreeBoard, 'n' | 'e'>, ids: ReadonlySet<string>): { clip: Clip; text: string } {
  const n = shownNodes(board).filter((x) => ids.has(x.i));
  const inside = new Set(n.map((x) => x.i));
  const e = board.e.filter((x) => inside.has(x.a) && inside.has(x.b));
  const text = n
    .map((x) => (x.t === 'm' ? (x.nome ?? '') : x.t === 'x' ? x.txt : x.src))
    .filter(Boolean)
    .join('\n\n');
  return { clip: { v: 1, n, e }, text };
}

/** O que veio da área de transferência do Murall (null se não é um recorte de peças). */
export function readClip(raw: string): Clip | null {
  try {
    const o = JSON.parse(raw) as Partial<Clip>;
    if (o?.v !== 1 || !Array.isArray(o.n) || !Array.isArray(o.e)) return null;
    return { v: 1, n: o.n as FbNode[], e: o.e as FbEdge[] };
  } catch {
    return null;
  }
}

/**
 * Cola as peças do recorte com o canto de cima à esquerda em `at` (ids novos, setas junto). Devolve o quadro
 * e as peças que entraram.
 */
export function pasteClip(board: FreeBoard, clip: Clip, at: Point, now: string): { board: FreeBoard; added: FbNode[]; left: number } {
  const box = boundsOf(clip.n) ?? { x: 0, y: 0, w: 0, h: 0 };
  const dx = snap(at.x) - box.x;
  const dy = snap(at.y) - box.y;
  const moved = clip.n.map((n) => ({ ...n, x: n.x + dx, y: n.y + dy }));
  return addPieces(board, moved, clip.e, now);
}

/** O que um texto colado vira (seção 4.4): um widget, uma nota pelo título, ou um bilhete. */
export type PasteKind = { kind: 'widget'; src: string } | { kind: 'nota'; title: string } | { kind: 'bilhete'; txt: string };

export function classifyPaste(text: string): PasteKind | null {
  const t = text.trim();
  if (!t) return null;
  // uma linha {{widget: ...}} (a nota, o contador, a imagem...)
  const first = t.split('\n')[0];
  if (/^\{\{[^}]+\}\}$/.test(first) && parseWidgetLine(first)) return { kind: 'widget', src: t };
  // a tabela do markdown
  if (/^\|.+\|\s*\n\|[\s:|-]+\|/.test(t)) return { kind: 'widget', src: t };
  // um link só: o vídeo vira o widget de vídeo; a imagem, o de imagem
  if (/^https:\/\/\S+$/.test(t)) {
    if (parseVideo(t)) return { kind: 'widget', src: `{{video: ${t}}}` };
    if (/\.(png|jpe?g|gif|webp|avif)(\?\S*)?$/i.test(t)) return { kind: 'widget', src: `{{imagem: ${t}}}` };
  }
  // [[Título]]: a anotação desse nome (quem cola procura)
  const link = /^\[\[([^\]|]+)(?:\|[^\]]*)?\]\]$/.exec(t);
  if (link) return { kind: 'nota', title: link[1].trim() };
  return { kind: 'bilhete', txt: t.slice(0, 4000) };
}

/** A linha do widget Nota de uma anotação. */
export function noteLine(id: string, title: string): string {
  const clean = title.replace(/[|{}]/g, ' ').replace(/\s+/g, ' ').trim();
  return `{{nota: #${id}${clean ? ` | ${clean}` : ''}}}`;
}

/** O widget tem uma folha (o duplo clique abre)? */
export function hasSheet(node: FbNode): boolean {
  if (node.t !== 'w') return false;
  const name = parseWidgetLine(node.src.split('\n')[0])?.name ?? 'tabela';
  return !!widgetDef(name);
}

// ===== a moldura =====

/** "Ajustar ao conteúdo": a moldura em volta do que está dentro dela, com uma margem e o lugar do título. */
export function fitFrame(board: Pick<FreeBoard, 'n'>, frameId: string): Rect | null {
  const nodes = shownNodes(board);
  const inside = insideFrame(nodes, frameId);
  const box = boundsOf(nodes.filter((n) => inside.has(n.i)));
  if (!box) return null;
  const pad = HOLE * 2;
  return { x: snap(box.x - pad), y: snap(box.y - pad - HOLE * 2), w: snap(box.w + 2 * pad), h: snap(box.h + 2 * pad + HOLE * 2) };
}

// ===== desfazer =====

/** Quantos passos o desfazer guarda (seção 4.4). */
export const HISTORY_MAX = 100;

/** O desfazer e o refazer de um quadro, só na memória: cada passo é o quadro de antes. */
export class History {
  private readonly past: FreeBoard[] = [];
  private readonly future: FreeBoard[] = [];

  /** Antes de uma mudança: guarda como estava. */
  push(before: FreeBoard): void {
    this.past.push(before);
    if (this.past.length > HISTORY_MAX) this.past.shift();
    this.future.length = 0;
  }

  get canUndo(): boolean {
    return this.past.length > 0;
  }

  get canRedo(): boolean {
    return this.future.length > 0;
  }

  /** Volta um passo: devolve o quadro de antes (e guarda o de agora para o refazer). */
  undo(now: FreeBoard): FreeBoard | null {
    const prev = this.past.pop();
    if (!prev) return null;
    this.future.push(now);
    return prev;
  }

  redo(now: FreeBoard): FreeBoard | null {
    const next = this.future.pop();
    if (!next) return null;
    this.past.push(now);
    return next;
  }

  clear(): void {
    this.past.length = 0;
    this.future.length = 0;
  }
}

/** A peça é uma das que o quadro mostra? (as de tipo desconhecido não são editadas) */
export const editable = (n: { t: string }): n is FbNode => knownNode(n as FbNode);
