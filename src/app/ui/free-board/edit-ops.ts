import { FbColor, FbEdge, FbNode, FbSide, FreeBoard, addPieces, idsOf, knownNode, newNodeId, shownNodes, withGroups } from '../../core/free-board';
import { GridIndex, HOLE, Point, Rect, boundsOf, contains, distanceToPath, grow, insideFrame, intersects, paintOrder, routedEdgePath, snap } from '../../core/free-board-geometry';
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

/**
 * A peça onde a seta puxada vai chegar: a de cima no ponto, ou a que está a menos de `slack` px de tela dele (soltar
 * rente à borda, ou um pouco fora dela, também liga). Nunca `from`, de onde a seta sai.
 */
export function linkTarget(nodes: readonly FbNode[], p: Point, z: number, from: string, slack = 18): FbNode | null {
  const hit = hitPiece(nodes, p, z);
  if (hit && hit.i !== from) return hit;
  const pad = slack / z;
  const order = paintOrder(nodes);
  for (let k = order.length - 1; k >= 0; k--) {
    const n = order[k];
    if (n.i === from) continue;
    if (p.x < n.x - pad || p.y < n.y - pad || p.x > n.x + n.w + pad || p.y > n.y + n.h + pad) continue;
    // a moldura: só perto da borda (dentro dela é o vazio, onde a seta solta pergunta o que nasce ali)
    if (n.t === 'm' && p.x > n.x + pad && p.x < n.x + n.w - pad && p.y > n.y + Math.max(pad, FRAME_HEAD) && p.y < n.y + n.h - pad) continue;
    return n;
  }
  return null;
}

/**
 * A peça das bolinhas continua a mesma enquanto o ponteiro está perto dela: as bolinhas ficam fora da borda, e ir
 * até uma delas não pode tirar o ponteiro de cima da peça (as bolinhas sumiam no caminho). `reach`: px de tela.
 */
export function keepsHover(n: FbNode, p: Point, z: number, reach = 40): boolean {
  const pad = reach / z;
  return p.x >= n.x - pad && p.y >= n.y - pad && p.x <= n.x + n.w + pad && p.y <= n.y + n.h + pad;
}

/** A seta mais perto do ponto, se está a menos de `tol` (no mundo). */
export function hitEdge(board: Pick<FreeBoard, 'n' | 'e'>, p: Point, tol: number): FbEdge | null {
  const shown = shownNodes(board);
  const byId = new Map(shown.map((n) => [n.i, n]));
  // o mesmo caminho que a tela desenha (contornando as peças); o índice só é montado se alguma seta está perto
  let index: GridIndex | null = null;
  const around = (box: Rect) => {
    index ??= new GridIndex(shown.filter((n) => n.t !== 'm'));
    return [...index.query(box)].map((id) => byId.get(id)!);
  };
  let best: { e: FbEdge; d: number } | null = null;
  for (const e of board.e) {
    const a = byId.get(e.a);
    const b = byId.get(e.b);
    if (!a || !b) continue;
    const straight = boundsOf([a, b])!;
    // a curva contornada fica perto da caixa das duas pontas (o desvio vai até 400 para o lado)
    if (!intersects(grow(straight, 1500 + tol), { x: p.x, y: p.y, w: 0, h: 0 })) continue;
    const path = routedEdgePath(a, b, { as: e.as as FbSide | undefined, bs: e.bs as FbSide | undefined }, around);
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

/**
 * Como a peça muda de tamanho: livre (a moldura, o texto e a tabela, que se reorganiza na caixa) ou na proporção
 * (os outros widgets: o desenho cresce por igual, e a caixa tem sempre a proporção dele, ver `fitMeasured`).
 */
export type SizeRule = 'livre' | 'proporcao';

export function sizeRule(node: FbNode): SizeRule {
  return node.t === 'w' && !reflows(node) ? 'proporcao' : 'livre';
}

/** O widget que se reorganiza na caixa (a tabela, que mora em várias linhas): os outros são desenhos em escala. */
export function reflows(node: FbNode): boolean {
  if (node.t !== 'w') return false;
  const parsed = parseWidgetLine(node.src.split('\n')[0]);
  return parsed ? !!widgetDef(parsed.name)?.body : !!node.src.trim();
}

const MIN = 52;

/**
 * A caixa nova ao puxar a alça `h` de `dx`, `dy` (no mundo). Na proporção, a largura manda (no meio de cima ou de
 * baixo, a altura, e a peça cresce para os dois lados), e o desenho não deforma. Com encaixe, a borda que anda cai
 * num furo.
 */
export function resized(start: Rect, h: Handle, dx: number, dy: number, rule: SizeRule, opts: { snapOn?: boolean } = {}): Rect {
  let x0 = start.x;
  let y0 = start.y;
  let x1 = start.x + start.w;
  let y1 = start.y + start.h;
  const s = (v: number) => (opts.snapOn ? snap(v) : Math.round(v));
  if (h.includes('w')) x0 = s(x0 + dx);
  if (h.includes('e')) x1 = s(x1 + dx);
  if (h.includes('n')) y0 = s(y0 + dy);
  if (h.includes('s')) y1 = s(y1 + dy);
  if (x1 - x0 < MIN) h.includes('w') ? (x0 = x1 - MIN) : (x1 = x0 + MIN);
  if (y1 - y0 < Math.min(MIN, start.h)) h.includes('n') ? (y0 = y1 - Math.min(MIN, start.h)) : (y1 = y0 + Math.min(MIN, start.h));
  let out = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (rule === 'proporcao') {
    const ratio = start.w / Math.max(1, start.h);
    // no canto, manda o lado que andou mais (puxar o canto só para baixo também cresce); no meio de um lado, ele
    const byHeight = h === 'n' || h === 's' || (h.length === 2 && Math.abs(out.h / start.h - 1) > Math.abs(out.w / start.w - 1));
    const w = Math.max(MIN, byHeight ? Math.round(out.h * ratio) : out.w);
    const hh = Math.max(1, Math.round(w / ratio));
    // o eixo que ninguém puxou cresce para os dois lados, no lugar
    const x = h === 'n' || h === 's' ? Math.round(start.x + (start.w - w) / 2) : h.includes('w') ? x1 - w : x0;
    const y = h === 'e' || h === 'w' ? Math.round(start.y + (start.h - hh) / 2) : h.includes('n') ? y1 - hh : y0;
    out = { x, y, w, h: hh };
  }
  return out;
}

/**
 * O que a peça mediu do widget dela (free-board-piece.ts), para a linha `src`: `r`, a proporção do desenho em
 * escala (largura sobre altura); na tabela, `minH`, a altura que o conteúdo pede na largura `w`. A caixa guardada
 * fora disso deixava uma sobra em volta do desenho (ou o conteúdo para fora dela), e a caixa é o que se seleciona,
 * se puxa e recebe as setas.
 */
export type PieceMeasure = { src: string; r: number } | { src: string; w: number; minH: number };

/** As duas medidas dizem o mesmo (a proporção, até dois milésimos)? */
export function sameMeasure(a: PieceMeasure, b: PieceMeasure): boolean {
  if (a.src !== b.src) return false;
  if ('r' in a && 'r' in b) return Math.abs(a.r - b.r) / b.r < 0.002;
  return 'minH' in a && 'minH' in b && a.w === b.w && a.minH === b.minH;
}

/**
 * A caixa na proporção `r`, dentro da guardada e presa no canto de cima à esquerda: é onde o desenho já aparecia
 * (do tamanho que cabia, nesse canto). Até 1,5 px, ou 1% do lado, de diferença é arredondamento (ou a letra de outro
 * aparelho, que mede uns décimos diferente: a caixa não fica sendo regravada por isso).
 */
export function fitRatio(box: Rect, r: number): Rect {
  const near = (a: number, b: number) => Math.abs(a - b) <= Math.max(1.5, b * 0.01);
  if (!(r > 0) || near(box.w, box.h * r) || near(box.h, box.w / r)) return box;
  return box.w / box.h > r ? { ...box, w: Math.max(8, Math.round(box.h * r)) } : { ...box, h: Math.max(8, Math.round(box.w / r)) };
}

const fitted = new WeakMap<FbNode, { m: PieceMeasure; out: FbNode }>();

/** A caixa do widget pela medida: na proporção do desenho, ou, na tabela, ao menos da altura do conteúdo. */
function fitBox(box: Rect, m: PieceMeasure): Rect {
  if ('r' in m) return fitRatio(box, m.r);
  // (a medida de outra largura não vale: a altura do conteúdo muda com ela)
  return m.w === box.w && m.minH > box.h ? { ...box, h: Math.ceil(m.minH) } : box;
}

/**
 * O quadro com cada widget medido na caixa do desenho dele (`fitBox`, sempre a partir da caixa guardada). Só as
 * caixas mudam: nem a data do quadro nem as setas. Nada a acertar, o mesmo quadro (o mesmo objeto).
 */
export function fitMeasured(board: FreeBoard, measures: ReadonlyMap<string, PieceMeasure>): FreeBoard {
  if (!measures.size) return board;
  let changed = false;
  const n = board.n.map((node) => {
    const m = measures.get(node.i);
    if (!m || !knownNode(node) || node.t !== 'w' || node.src !== m.src) return node;
    let hit = fitted.get(node);
    if (hit?.m !== m) {
      const box = fitBox(node, m);
      hit = { m, out: box.w === node.w && box.h === node.h ? node : { ...node, w: box.w, h: box.h } };
      fitted.set(node, hit);
    }
    changed ||= hit.out !== node;
    return hit.out;
  });
  return changed ? { ...board, n } : board;
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
 * O lugar livre mais perto de `box` (em volta dele, em anéis de dois furos), sem encostar em nada de `taken` (com
 * meio furo de vão). As molduras não contam: dentro delas é lugar de pôr. Sem lugar em uns 2.000 px, fica onde estava.
 */
export function freeSpot(taken: readonly Rect[], box: Rect): Rect {
  const near = taken.filter((t) => intersects(grow(box, 2200), t));
  const fits = (r: Rect) => !near.some((t) => intersects(grow(r, HOLE / 2), t));
  if (fits(box)) return box;
  const step = HOLE * 2;
  for (let ring = 1; ring <= 40; ring++) {
    const around: Rect[] = [];
    for (let dx = -ring; dx <= ring; dx++) {
      for (let dy = -ring; dy <= ring; dy++) {
        if (Math.max(Math.abs(dx), Math.abs(dy)) === ring) around.push({ ...box, x: box.x + dx * step, y: box.y + dy * step });
      }
    }
    around.sort((a, b) => Math.hypot(a.x - box.x, a.y - box.y) - Math.hypot(b.x - box.x, b.y - box.y));
    const spot = around.find(fits);
    if (spot) return spot;
  }
  return box;
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

  /** O quadro do último passo (o de antes da última mudança), sem voltar. */
  last(): FreeBoard | undefined {
    return this.past.at(-1);
  }

  /** Esquece o último passo (a mudança que se desfez sozinha, sem virar passo novo). */
  dropLast(): void {
    this.past.pop();
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
