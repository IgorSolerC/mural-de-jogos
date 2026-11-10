import { FbNode, FbSide, FreeBoard, shownNodes } from './free-board';

/**
 * A geometria do Quadro livre (PLANO-QUADRO-LIVRE.md, seção 9): caixas, o índice em grade que acha o que
 * está na tela sem olhar peça por peça, as molduras e o que está dentro de cada uma, a ordem de leitura e
 * a curva das setas. Tudo puro, sem DOM: o motor (ui/free-board/) só desenha o que sai daqui.
 */

export interface Rect {
  x: number;
  y: number;
  w: number;
  h: number;
}

export interface Point {
  x: number;
  y: number;
}

/** O passo dos furos do eucatex: a grade onde as peças encaixam (decisão D6). */
export const HOLE = 26;

/** O valor no furo mais perto. */
export function snap(v: number, step = HOLE): number {
  return Math.round(v / step) * step;
}

export function intersects(a: Rect, b: Rect): boolean {
  return a.x < b.x + b.w && b.x < a.x + a.w && a.y < b.y + b.h && b.y < a.y + a.h;
}

/** `inner` está inteiro dentro de `outer`? */
export function contains(outer: Rect, inner: Rect): boolean {
  return inner.x >= outer.x && inner.y >= outer.y && inner.x + inner.w <= outer.x + outer.w && inner.y + inner.h <= outer.y + outer.h;
}

/** A caixa que cobre todas (null sem nenhuma). */
export function boundsOf(rects: readonly Rect[]): Rect | null {
  if (!rects.length) return null;
  let x0 = Infinity;
  let y0 = Infinity;
  let x1 = -Infinity;
  let y1 = -Infinity;
  for (const r of rects) {
    x0 = Math.min(x0, r.x);
    y0 = Math.min(y0, r.y);
    x1 = Math.max(x1, r.x + r.w);
    y1 = Math.max(y1, r.y + r.h);
  }
  return { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
}

/** A caixa crescida `m` para cada lado (a folga em volta da tela). */
export function grow(r: Rect, m: number): Rect {
  return { x: r.x - m, y: r.y - m, w: r.w + 2 * m, h: r.h + 2 * m };
}

/** A caixa entre dois pontos (a caixa de seleção, arrastada para qualquer lado). */
export function rectBetween(a: Point, b: Point): Rect {
  return { x: Math.min(a.x, b.x), y: Math.min(a.y, b.y), w: Math.abs(a.x - b.x), h: Math.abs(a.y - b.y) };
}

export const center = (r: Rect): Point => ({ x: r.x + r.w / 2, y: r.y + r.h / 2 });

// ===== o índice em grade =====

/** O tamanho de cada célula do índice, no mundo. */
const CELL = 1024;

/**
 * As caixas por célula de 1.024 px: achar o que toca uma caixa (a tela, a caixa de seleção) é olhar só as
 * células dela. Mil peças → microssegundos. Atualiza só a peça que andou (`put`).
 */
export class GridIndex {
  private readonly cells = new Map<string, Set<string>>();
  private readonly boxes = new Map<string, Rect>();

  constructor(items: Iterable<{ i: string } & Rect> = []) {
    for (const it of items) this.put(it.i, it);
  }

  get size(): number {
    return this.boxes.size;
  }

  rect(id: string): Rect | undefined {
    return this.boxes.get(id);
  }

  /** Põe ou atualiza a caixa de `id`. */
  put(id: string, r: Rect): void {
    const before = this.boxes.get(id);
    if (before && before.x === r.x && before.y === r.y && before.w === r.w && before.h === r.h) return;
    if (before) this.unlink(id, before);
    const box = { x: r.x, y: r.y, w: r.w, h: r.h };
    this.boxes.set(id, box);
    for (const key of cellsOf(box)) {
      let cell = this.cells.get(key);
      if (!cell) this.cells.set(key, (cell = new Set()));
      cell.add(id);
    }
  }

  remove(id: string): void {
    const before = this.boxes.get(id);
    if (!before) return;
    this.unlink(id, before);
    this.boxes.delete(id);
  }

  /** Os ids cujas caixas tocam `r`. */
  query(r: Rect): Set<string> {
    const out = new Set<string>();
    for (const key of cellsOf(r)) {
      for (const id of this.cells.get(key) ?? []) {
        if (!out.has(id) && intersects(this.boxes.get(id)!, r)) out.add(id);
      }
    }
    return out;
  }

  private unlink(id: string, r: Rect): void {
    for (const key of cellsOf(r)) {
      const cell = this.cells.get(key);
      cell?.delete(id);
      if (cell && !cell.size) this.cells.delete(key);
    }
  }
}

/** As células que a caixa toca. Uma caixa enorme (uma moldura de 100 mil px) toca muitas: fica no limite de 4.096. */
function cellsOf(r: Rect): string[] {
  const x0 = Math.floor(r.x / CELL);
  const y0 = Math.floor(r.y / CELL);
  const x1 = Math.floor((r.x + Math.max(0, r.w - 1)) / CELL);
  const y1 = Math.floor((r.y + Math.max(0, r.h - 1)) / CELL);
  const out: string[] = [];
  for (let cx = x0; cx <= x1; cx++) {
    for (let cy = y0; cy <= y1; cy++) {
      out.push(`${cx},${cy}`);
      if (out.length >= 4096) return out;
    }
  }
  return out;
}

// ===== molduras =====

const area = (r: Rect) => r.w * r.h;

/**
 * Para cada peça, a moldura mais justa em que ela está inteira (a menor que a contém), ou nada. Uma moldura
 * dentro de outra tem a de fora como dona. É calculado, nunca guardado: arrastar a moldura leva o que está
 * dentro dela no começo do arrasto (como no Obsidian).
 */
export function framesOf(nodes: readonly FbNode[]): Map<string, string> {
  const frames = nodes.filter((n) => n.t === 'm').sort((a, b) => area(a) - area(b));
  const out = new Map<string, string>();
  for (const n of nodes) {
    const owner = frames.find((f) => f.i !== n.i && area(f) > area(n) && contains(f, n));
    if (owner) out.set(n.i, owner.i);
  }
  return out;
}

/** Tudo o que está dentro da moldura `frame` (as de dentro e o que elas têm), sem ela. */
export function insideFrame(nodes: readonly FbNode[], frame: string): Set<string> {
  const owner = framesOf(nodes);
  const out = new Set<string>();
  let grew = true;
  while (grew) {
    grew = false;
    for (const n of nodes) {
      const o = owner.get(n.i);
      if (o && (o === frame || out.has(o)) && !out.has(n.i)) {
        out.add(n.i);
        grew = true;
      }
    }
  }
  return out;
}

/**
 * A ordem de desenhar: as molduras atrás de tudo, a maior mais atrás (a menor, dentro dela, aparece);
 * as outras peças na ordem guardada.
 */
export function paintOrder(nodes: readonly FbNode[]): FbNode[] {
  const frames = nodes.filter((n) => n.t === 'm').sort((a, b) => area(b) - area(a));
  return [...frames, ...nodes.filter((n) => n.t !== 'm')];
}

/**
 * A ordem de leitura (o Tab e o "Ver em lista", seção 4.9 do plano): por fileiras de cima para baixo e,
 * em cada fileira, da esquerda para a direita; uma moldura vem com tudo o que tem dentro logo depois
 * dela, na mesma ordem. Duas peças estão na mesma fileira se uma começa antes da metade da outra.
 */
export function readingOrder(board: Pick<FreeBoard, 'n'>): FbNode[] {
  const nodes = shownNodes(board);
  const owner = framesOf(nodes);
  const children = new Map<string | null, FbNode[]>();
  for (const n of nodes) {
    const o = owner.get(n.i) ?? null;
    const list = children.get(o) ?? [];
    list.push(n);
    children.set(o, list);
  }
  const out: FbNode[] = [];
  const walk = (parent: string | null) => {
    for (const n of rows(children.get(parent) ?? [])) {
      out.push(n);
      if (n.t === 'm') walk(n.i);
    }
  };
  walk(null);
  return out;
}

function rows(list: readonly FbNode[]): FbNode[] {
  const sorted = [...list].sort((a, b) => a.y - b.y || a.x - b.x);
  const out: FbNode[] = [];
  let row: FbNode[] = [];
  let rowMid = -Infinity;
  for (const n of sorted) {
    if (row.length && n.y >= rowMid) {
      out.push(...row.sort((a, b) => a.x - b.x));
      row = [];
    }
    if (!row.length) rowMid = n.y + n.h / 2;
    row.push(n);
  }
  out.push(...row.sort((a, b) => a.x - b.x));
  return out;
}

// ===== setas =====

/** O meio do lado `side` da caixa. */
export function anchor(r: Rect, side: FbSide): Point {
  switch (side) {
    case 't':
      return { x: r.x + r.w / 2, y: r.y };
    case 'b':
      return { x: r.x + r.w / 2, y: r.y + r.h };
    case 'l':
      return { x: r.x, y: r.y + r.h / 2 };
    case 'r':
      return { x: r.x + r.w, y: r.y + r.h / 2 };
  }
}

/** Para onde o lado aponta (a seta sai perpendicular a ele). */
export const NORMAL: Readonly<Record<FbSide, Point>> = { t: { x: 0, y: -1 }, b: { x: 0, y: 1 }, l: { x: -1, y: 0 }, r: { x: 1, y: 0 } };

/**
 * Os lados para ligar `a` a `b` quando a seta não diz: os de frente um para o outro no eixo em que as
 * caixas estão mais separadas (a de cima sai por baixo, a da esquerda sai pela direita). Uma caixa
 * por cima da outra liga pelos lados mais perto.
 */
export function autoSides(a: Rect, b: Rect): { as: FbSide; bs: FbSide } {
  const gapX = Math.max(b.x - (a.x + a.w), a.x - (b.x + b.w));
  const gapY = Math.max(b.y - (a.y + a.h), a.y - (b.y + b.h));
  const ca = center(a);
  const cb = center(b);
  if (gapX <= 0 && gapY <= 0) {
    // sobrepostas: pelo eixo em que os meios estão mais longe
    return Math.abs(cb.x - ca.x) >= Math.abs(cb.y - ca.y) ? (cb.x >= ca.x ? { as: 'r', bs: 'l' } : { as: 'l', bs: 'r' }) : cb.y >= ca.y ? { as: 'b', bs: 't' } : { as: 't', bs: 'b' };
  }
  if (gapX >= gapY) return cb.x >= ca.x ? { as: 'r', bs: 'l' } : { as: 'l', bs: 'r' };
  return cb.y >= ca.y ? { as: 'b', bs: 't' } : { as: 't', bs: 'b' };
}

/** O lado de `r` mais perto do ponto (a seta solta no meio de uma peça escolhe o lado pelo ponteiro). */
export function nearestSide(r: Rect, p: Point): FbSide {
  const d: [FbSide, number][] = [
    ['t', Math.abs(p.y - r.y)],
    ['b', Math.abs(p.y - (r.y + r.h))],
    ['l', Math.abs(p.x - r.x)],
    ['r', Math.abs(p.x - (r.x + r.w))],
  ];
  return d.sort((x, y) => x[1] - y[1])[0][0];
}

export interface EdgePath {
  /** O caminho do SVG (uma Bézier cúbica). */
  d: string;
  from: Point;
  to: Point;
  /** Os pontos de controle da curva. */
  c1: Point;
  c2: Point;
  /** O meio da curva (onde vai o rótulo). */
  mid: Point;
  /** A direção da curva chegando em `to` e saindo de `from` (radianos), para desenhar as pontas. */
  endAngle: number;
  startAngle: number;
  /** A caixa da curva (para saber se ela toca a tela). */
  box: Rect;
}

const round = (v: number) => Math.round(v * 10) / 10;

/**
 * A curva de `a` até `b` (o jeito do Obsidian): sai do meio do lado, perpendicular a ele, e chega do mesmo
 * jeito no outro. Os pontos de controle ficam a uma distância que cresce com a distância entre as pontas
 * (de 40 a 300 px), então peças perto têm uma curva curta e peças longe, uma curva larga.
 */
export function edgePath(a: Rect, b: Rect, sides: { as?: FbSide; bs?: FbSide } = {}, bend = 0): EdgePath {
  const auto = autoSides(a, b);
  const as = sides.as ?? auto.as;
  const bs = sides.bs ?? auto.bs;
  const from = anchor(a, as);
  const to = anchor(b, bs);
  const dist = Math.hypot(to.x - from.x, to.y - from.y);
  const k = Math.min(300, Math.max(40, dist * 0.45));
  // `bend`: a curva empurrada para um lado (perpendicular à reta entre as pontas), para contornar as peças
  const nx = dist ? -(to.y - from.y) / dist : 0;
  const ny = dist ? (to.x - from.x) / dist : 0;
  const c1 = { x: from.x + NORMAL[as].x * k + nx * bend, y: from.y + NORMAL[as].y * k + ny * bend };
  const c2 = { x: to.x + NORMAL[bs].x * k + nx * bend, y: to.y + NORMAL[bs].y * k + ny * bend };
  const mid = bezier(from, c1, c2, to, 0.5);
  const d = `M${round(from.x)} ${round(from.y)} C${round(c1.x)} ${round(c1.y)} ${round(c2.x)} ${round(c2.y)} ${round(to.x)} ${round(to.y)}`;
  // a curva fica dentro da caixa dos quatro pontos (propriedade da Bézier)
  const box = boundsOf([from, c1, c2, to].map((p) => ({ x: p.x, y: p.y, w: 0, h: 0 })))!;
  return { d, from, to, c1, c2, mid, endAngle: Math.atan2(to.y - c2.y, to.x - c2.x), startAngle: Math.atan2(from.y - c1.y, from.x - c1.x), box };
}

/**
 * A curva de `a` até `b` que não passa por baixo de outra peça: a seta reta que cruzaria um bilhete no meio do
 * caminho dizia ligar três peças onde liga duas. Tenta a curva de sempre e, se ela cruza uma peça (as molduras
 * não contam: a seta passa por cima delas), empurra a curva para um lado e para o outro, cada vez mais, até
 * achar um caminho livre; sem nenhum, fica a de sempre. `around` dá as peças que encostam numa caixa.
 */
export function routedEdgePath(a: Rect, b: Rect, sides: { as?: FbSide; bs?: FbSide }, around: (box: Rect) => Iterable<Rect>): EdgePath {
  const first = edgePath(a, b, sides);
  const step = Math.max(80, Math.min(400, Math.max(a.h, b.h, a.w * 0.5, b.w * 0.5)));
  const blocked = (p: EdgePath): boolean => {
    const others = [...around(p.box)].filter((r) => r !== a && r !== b && !(contains(r, a) || contains(r, b)));
    if (!others.length) return false;
    // as pontas ficam de fora: a curva sai e chega encostada nas peças das pontas
    for (let k = 2; k <= 22; k++) {
      const q = bezier(p.from, p.c1, p.c2, p.to, k / 24);
      if (others.some((r) => q.x > r.x && q.x < r.x + r.w && q.y > r.y && q.y < r.y + r.h)) return true;
    }
    return false;
  };
  if (!blocked(first)) return first;
  for (const m of [1, -1, 2, -2, 3, -3]) {
    const p = edgePath(a, b, sides, m * step);
    if (!blocked(p)) return p;
  }
  return first;
}

/** O ponto `t` (0 a 1) da Bézier cúbica. */
export function bezier(p0: Point, p1: Point, p2: Point, p3: Point, t: number): Point {
  const u = 1 - t;
  const a = u * u * u;
  const b = 3 * u * u * t;
  const c = 3 * u * t * t;
  const d = t * t * t;
  return { x: a * p0.x + b * p1.x + c * p2.x + d * p3.x, y: a * p0.y + b * p1.y + c * p2.y + d * p3.y };
}

/** A distância do ponto até a curva (para o clique pegar a seta), por amostragem. */
export function distanceToPath(p: Point, path: Pick<EdgePath, 'from' | 'c1' | 'c2' | 'to'>, samples = 24): number {
  let best = Infinity;
  let prev = path.from;
  for (let k = 1; k <= samples; k++) {
    const next = bezier(path.from, path.c1, path.c2, path.to, k / samples);
    best = Math.min(best, segmentDistance(p, prev, next));
    prev = next;
  }
  return best;
}

function segmentDistance(p: Point, a: Point, b: Point): number {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const len = dx * dx + dy * dy;
  const t = len ? Math.max(0, Math.min(1, ((p.x - a.x) * dx + (p.y - a.y) * dy) / len)) : 0;
  return Math.hypot(p.x - (a.x + t * dx), p.y - (a.y + t * dy));
}

// ===== a câmera =====

/** O zoom vai de 5% a 400%. */
export const ZOOM_MIN = 0.05;
export const ZOOM_MAX = 4;

export interface Camera {
  /** O ponto do mundo no canto de cima à esquerda da tela. */
  x: number;
  y: number;
  /** A escala: 1 = 100%. */
  z: number;
}

/** A parte do mundo que a tela (`w` × `h` px) mostra. */
export function viewRect(cam: Camera, w: number, h: number): Rect {
  return { x: cam.x, y: cam.y, w: w / cam.z, h: h / cam.z };
}

/** O ponto da tela (px, a partir do canto do quadro) no mundo. */
export function toWorld(cam: Camera, p: Point): Point {
  return { x: cam.x + p.x / cam.z, y: cam.y + p.y / cam.z };
}

/** O zoom novo, mantendo parado o ponto da tela `p` (a roda e a pinça dão zoom no ponteiro). */
export function zoomAt(cam: Camera, p: Point, z: number): Camera {
  const nz = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, z));
  const w = toWorld(cam, p);
  return { x: w.x - p.x / nz, y: w.y - p.y / nz, z: nz };
}

/** A câmera que mostra `r` inteira na tela, com uma margem e sem passar de 100% ("Ver tudo"). */
export function fitRect(r: Rect | null, w: number, h: number, margin = 48): Camera {
  if (!r || w <= 0 || h <= 0) return { x: -w / 2, y: -h / 2, z: 1 };
  const z = Math.min(1, ZOOM_MAX, Math.max(ZOOM_MIN, Math.min((w - 2 * margin) / Math.max(1, r.w), (h - 2 * margin) / Math.max(1, r.h))));
  const c = center(r);
  return { x: c.x - w / 2 / z, y: c.y - h / 2 / z, z };
}
