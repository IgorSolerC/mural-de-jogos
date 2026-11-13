import { Cell, PIXEL_MAX, inkChar, inkIndex, inksRgb, nearestInk } from './pixel-art';

/**
 * As ferramentas do ateliê da pixel art (ui/pixel-studio/, PLANO-ATELIE.md), como contas: o pincel, a
 * simetria, o balde da cor inteira, o tamanho da tela com a âncora e o zoom. Tudo puro: recebe as
 * fileiras (`string[]`, um caractere de cor por ponto, ver `inkChar`) e devolve fileiras novas, para o
 * desfazer guardar as de antes. O que é de core/pixel-art.ts (a reta, o balde contíguo, virar) fica lá.
 */

// ===== o pincel =====

/** O jeito do pincel: o quadrado (o de sempre) ou o redondo, como no Aseprite. */
export type BrushShape = 'quadrado' | 'redondo';
/** O maior pincel, em pontos. */
export const BRUSH_MAX = 16;

/**
 * Os pontos que o pincel de `size` cobre com o meio em `c`. No tamanho par o meio fica no ponto de cima,
 * à esquerda dos quatro do meio (como o Aseprite). O redondo é o círculo que cabe no quadrado, com os
 * cantos de fora; nos tamanhos 1 e 2 ele é o próprio quadrado.
 */
export function brushCells(c: Cell, size: number, shape: BrushShape): Cell[] {
  const n = Math.max(1, Math.min(BRUSH_MAX, Math.round(size)));
  if (n === 1) return [{ x: c.x, y: c.y }];
  const start = -Math.floor((n - 1) / 2);
  const r = n / 2;
  const out: Cell[] = [];
  for (let dy = 0; dy < n; dy++) {
    for (let dx = 0; dx < n; dx++) {
      if (shape === 'redondo' && n > 2) {
        // o meio do ponto dentro do círculo
        const px = dx + 0.5 - r;
        const py = dy + 0.5 - r;
        if (px * px + py * py > r * r) continue;
      }
      out.push({ x: c.x + start + dx, y: c.y + start + dy });
    }
  }
  return out;
}

/** Os pontos que o pincel cobre de `a` até `b` (cada ponto da reta carimba o pincel), sem repetir. */
export function stampCells(path: readonly Cell[], size: number, shape: BrushShape): Cell[] {
  if (size <= 1) return [...path];
  const seen = new Set<number>();
  const out: Cell[] = [];
  for (const p of path) {
    for (const c of brushCells(p, size, shape)) {
      const k = (c.y + 1024) * 4096 + (c.x + 1024);
      if (seen.has(k)) continue;
      seen.add(k);
      out.push(c);
    }
  }
  return out;
}

/**
 * O "pixel perfeito" do lápis de um ponto: no traço à mão, o ponto do meio de um L (o canto que deixa a
 * linha grossa) sai. Recebe o caminho até agora e diz qual ponto tirar (o penúltimo), ou null.
 */
export function perfectCorner(path: readonly Cell[]): Cell | null {
  if (path.length < 3) return null;
  const a = path[path.length - 3];
  const b = path[path.length - 2];
  const c = path[path.length - 1];
  const diagonal = Math.abs(a.x - c.x) === 1 && Math.abs(a.y - c.y) === 1;
  const touchesA = Math.abs(a.x - b.x) + Math.abs(a.y - b.y) === 1;
  const touchesC = Math.abs(c.x - b.x) + Math.abs(c.y - b.y) === 1;
  return diagonal && touchesA && touchesC ? b : null;
}

// ===== a simetria =====

/** A simetria do Aseprite: nenhuma, de lado (o eixo em pé, no meio), de cima (o eixo deitado) ou as duas. */
export type Symmetry = 'nenhuma' | 'lado' | 'cima' | 'ambas';

/** Os pontos e os do outro lado do eixo (ou dos dois eixos), dentro da grade `w` × `h`, sem repetir. */
export function mirrored(cells: readonly Cell[], sym: Symmetry, w: number, h: number): Cell[] {
  if (sym === 'nenhuma') return [...cells];
  const seen = new Set<number>();
  const out: Cell[] = [];
  const push = (x: number, y: number) => {
    const k = y * 4096 + x;
    if (seen.has(k)) return;
    seen.add(k);
    out.push({ x, y });
  };
  for (const { x, y } of cells) {
    push(x, y);
    if (sym === 'lado' || sym === 'ambas') push(w - 1 - x, y);
    if (sym === 'cima' || sym === 'ambas') push(x, h - 1 - y);
    if (sym === 'ambas') push(w - 1 - x, h - 1 - y);
  }
  return out;
}

// ===== o balde da cor inteira =====

/** O balde sem o "contíguo": todo ponto da cor de `at`, em qualquer lugar da grade, vira `ink`. */
export function replaceInk(rows: readonly string[], at: Cell, ink: number, w: number, h: number): string[] {
  const from = rows[at.y]?.[at.x];
  const to = inkChar(ink);
  if (from === undefined || from === to) return [...rows];
  return rows.map((r, y) => (y < h ? [...r.slice(0, w)].map((ch) => (ch === from ? to : ch)).join('') + r.slice(w) : r));
}

// ===== o tamanho da tela =====

/** Onde o desenho fica quando a tela muda de tamanho: 0, 1 ou 2 em cada eixo (o canto, o meio, o outro canto). */
export interface Anchor {
  x: 0 | 1 | 2;
  y: 0 | 1 | 2;
}

/**
 * A tela de `w` × `h` com outro tamanho, `nw` × `nh` (de 1 a 64), o desenho preso na âncora: crescer põe
 * transparente em volta, diminuir corta a beirada do lado oposto à âncora (o Tamanho da tela do Aseprite).
 */
export function resizeCanvas(rows: readonly string[], w: number, h: number, nw: number, nh: number, anchor: Anchor): string[] {
  const W = Math.max(1, Math.min(PIXEL_MAX, Math.round(nw)));
  const H = Math.max(1, Math.min(PIXEL_MAX, Math.round(nh)));
  // quanto o desenho anda: na âncora do meio, metade da diferença (a sobra ímpar vai para o fim)
  const ox = anchor.x === 0 ? 0 : anchor.x === 1 ? Math.floor((W - w) / 2) : W - w;
  const oy = anchor.y === 0 ? 0 : anchor.y === 1 ? Math.floor((H - h) / 2) : H - h;
  const out: string[] = [];
  for (let y = 0; y < H; y++) {
    const src = rows[y - oy];
    let line = '';
    for (let x = 0; x < W; x++) {
      const sx = x - ox;
      line += src !== undefined && y - oy < h && sx >= 0 && sx < w ? (src[sx] ?? '0') : '0';
    }
    out.push(line);
  }
  return out;
}

// ===== o zoom =====

/** Os zooms da folha, em pixels da tela por ponto (1 é o 100% do Aseprite). */
export const ZOOMS: readonly number[] = [1, 2, 3, 4, 6, 8, 12, 16, 20, 24, 32, 48, 64];
/** Os atalhos 1 a 6 do Aseprite: 100%, 200%, 400%, 800%, 1600% e 3200%. */
export const ZOOM_KEYS: readonly number[] = [1, 2, 4, 8, 16, 32];

/** O zoom vizinho, para dentro (`dir` 1) ou para fora (-1); nas pontas, fica. */
export function stepZoom(z: number, dir: 1 | -1): number {
  if (dir > 0) return ZOOMS.find((v) => v > z) ?? ZOOMS[ZOOMS.length - 1];
  return [...ZOOMS].reverse().find((v) => v < z) ?? ZOOMS[0];
}

/** O maior zoom (dos de cima) em que a tela de `w` × `h` cabe inteira em `vw` × `vh`, com uma folga em volta. */
export function fitZoom(w: number, h: number, vw: number, vh: number, margin = 48): number {
  const fit = Math.min((vw - margin * 2) / Math.max(1, w), (vh - margin * 2) / Math.max(1, h));
  return [...ZOOMS].reverse().find((z) => z <= fit) ?? ZOOMS[0];
}

/** "800%": o zoom como o Aseprite diz. */
export function zoomLabel(z: number): string {
  return `${Math.round(z * 100)}%`;
}

// ===== as formas =====

/** A caixa de uma forma puxada de `a` até `b`: com `square`, quadrada (o lado maior); com `center`, `a` é o meio. */
export function shapeBox(a: Cell, b: Cell, square: boolean, center: boolean): { x0: number; y0: number; x1: number; y1: number } {
  let dx = b.x - a.x;
  let dy = b.y - a.y;
  if (square) {
    const n = Math.max(Math.abs(dx), Math.abs(dy));
    dx = (dx < 0 ? -1 : 1) * n;
    dy = (dy < 0 ? -1 : 1) * n;
  }
  const x0 = center ? a.x - dx : a.x;
  const y0 = center ? a.y - dy : a.y;
  const x1 = a.x + dx;
  const y1 = a.y + dy;
  return { x0: Math.min(x0, x1), y0: Math.min(y0, y1), x1: Math.max(x0, x1), y1: Math.max(y0, y1) };
}

/** A reta com o Shift: presa nos ângulos de 45° (deitada, em pé ou na diagonal), do tamanho do arrasto. */
export function snapLine(a: Cell, b: Cell): Cell {
  const dx = b.x - a.x;
  const dy = b.y - a.y;
  const ax = Math.abs(dx);
  const ay = Math.abs(dy);
  if (ax > ay * 2) return { x: b.x, y: a.y };
  if (ay > ax * 2) return { x: a.x, y: b.y };
  const n = Math.max(ax, ay);
  return { x: a.x + Math.sign(dx) * n, y: a.y + Math.sign(dy) * n };
}

/** O retângulo da caixa: só a beirada, ou cheio. */
export function rectCells(x0: number, y0: number, x1: number, y1: number, filled: boolean): Cell[] {
  const out: Cell[] = [];
  for (let y = y0; y <= y1; y++) {
    for (let x = x0; x <= x1; x++) {
      if (filled || y === y0 || y === y1 || x === x0 || x === x1) out.push({ x, y });
    }
  }
  return out;
}

/**
 * A elipse que cabe na caixa (o algoritmo de Alois Zingl, o mesmo do Aseprite): a beirada sem buraco e sem
 * ponto dobrado; cheia, cada fileira de ponta a ponta da beirada.
 */
export function ellipseCells(x0: number, y0: number, x1: number, y1: number, filled: boolean): Cell[] {
  const ring: Cell[] = [];
  const put = (x: number, y: number) => ring.push({ x, y });
  let a = Math.abs(x1 - x0);
  const b = Math.abs(y1 - y0);
  let b1 = b & 1;
  let dx = 4 * (1 - a) * b * b;
  let dy = 4 * (b1 + 1) * a * a;
  let err = dx + dy + b1 * a * a;
  if (x0 > x1) {
    x0 = x1;
    x1 += a;
  }
  if (y0 > y1) y0 = y1;
  y0 += (b + 1) >> 1;
  y1 = y0 - b1;
  a = 8 * a * a;
  b1 = 8 * b * b;
  do {
    put(x1, y0);
    put(x0, y0);
    put(x0, y1);
    put(x1, y1);
    const e2 = 2 * err;
    if (e2 <= dy) {
      y0++;
      y1--;
      err += dy += a;
    }
    if (e2 >= dx || 2 * err > dy) {
      x0++;
      x1--;
      err += dx += b1;
    }
  } while (x0 <= x1);
  // a ponta fina (a elipse muito estreita): as fileiras que faltam
  while (y0 - y1 <= b) {
    put(x0 - 1, y0);
    put(x1 + 1, y0++);
    put(x0 - 1, y1);
    put(x1 + 1, y1--);
  }
  const seen = new Set<number>();
  const uniq = ring.filter((c) => {
    const k = (c.y + 1024) * 4096 + c.x + 1024;
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
  if (!filled) return uniq;
  const span = new Map<number, [number, number]>();
  for (const c of uniq) {
    const s = span.get(c.y);
    span.set(c.y, s ? [Math.min(s[0], c.x), Math.max(s[1], c.x)] : [c.x, c.x]);
  }
  const out: Cell[] = [];
  for (const [y, [from, to]] of span) for (let x = from; x <= to; x++) out.push({ x, y });
  return out;
}

// ===== mexer na paleta =====

/** As fileiras com cada cor trocada pelo número que `map` dá a ela (`map[i]`; o 0 fica 0). */
export function remapRows(rows: readonly string[], map: readonly number[]): string[] {
  return rows.map((r) =>
    [...r]
      .map((ch) => {
        const i = inkIndex(ch);
        return i > 0 && map[i] !== undefined ? inkChar(map[i]) : ch;
      })
      .join(''),
  );
}

/** As cores do desenho escritas uma a uma (a paleta própria: do 1 até a última, todas). */
export function ownColors(inks: readonly (string | null)[]): Record<number, string> {
  const out: Record<number, string> = {};
  inks.forEach((c, i) => {
    if (i > 0 && c) out[i] = c;
  });
  return out;
}

/** Tira a cor `n` da paleta própria: os pontos dela ficam transparentes e as de depois descem um número. */
export function removeInk(rows: readonly string[], inks: readonly (string | null)[], n: number): { rows: string[]; colors: Record<number, string> } {
  const map: number[] = [0];
  for (let i = 1; i < inks.length; i++) map[i] = i === n ? 0 : i > n ? i - 1 : i;
  const colors: Record<number, string> = {};
  inks.forEach((c, i) => {
    if (i > 0 && c && i !== n) colors[i > n ? i - 1 : i] = c;
  });
  return { rows: remapRows(rows, map), colors };
}

/** Leva a cor `from` para o lugar `to` na paleta própria; o desenho não muda (os pontos seguem a cor). */
export function moveInk(rows: readonly string[], inks: readonly (string | null)[], from: number, to: number): { rows: string[]; colors: Record<number, string> } {
  const order = inks.map((_, i) => i).slice(1);
  const [moved] = order.splice(from - 1, 1);
  order.splice(to - 1, 0, moved);
  return reorder(rows, inks, order);
}

/** As cores da paleta própria em outra ordem (`order`: os números de antes, na ordem nova). */
function reorder(rows: readonly string[], inks: readonly (string | null)[], order: readonly number[]): { rows: string[]; colors: Record<number, string> } {
  const map: number[] = [0];
  const colors: Record<number, string> = {};
  order.forEach((old, k) => {
    map[old] = k + 1;
    const c = inks[old];
    if (c) colors[k + 1] = c;
  });
  return { rows: remapRows(rows, map), colors };
}

/** Ordena a paleta pela luz (do escuro ao claro) ou pelo tom (o círculo das cores; os cinzas no fim, pela luz). */
export function sortInks(rows: readonly string[], inks: readonly (string | null)[], by: 'luz' | 'tom'): { rows: string[]; colors: Record<number, string> } {
  const info = inksRgb(inks).map(({ i, rgb: [r, g, b] }) => {
    const max = Math.max(r, g, b);
    const min = Math.min(r, g, b);
    const light = (0.2126 * r + 0.7152 * g + 0.0722 * b) / 255;
    const sat = max === 0 ? 0 : (max - min) / max;
    let hue = 0;
    if (max !== min) {
      const d = max - min;
      hue = max === r ? ((g - b) / d + 6) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4;
    }
    return { i, light, hue: sat < 0.12 ? 7 : hue };
  });
  info.sort((a, b) => (by === 'luz' ? a.light - b.light : a.hue - b.hue || a.light - b.light) || a.i - b.i);
  return reorder(rows, inks, info.map((x) => x.i));
}

/** O desenho passado para outra paleta, cada cor pela mais perto dela na nova (o "manter as cores"). */
export function convertRows(rows: readonly string[], from: readonly (string | null)[], to: readonly (string | null)[]): string[] {
  const palette = inksRgb(to);
  const map: number[] = [0];
  for (const { i, rgb } of inksRgb(from)) map[i] = nearestInk(rgb[0], rgb[1], rgb[2], palette);
  return remapRows(rows, map);
}

/**
 * As cores de uma imagem (os bytes RGBA; o quase transparente fica fora), até `max`, pelo corte na mediana: a
 * caixa de cores mais espalhada é cortada no meio da parte mais larga, até dar `max` caixas, e cada caixa vira
 * a média dela. Da mais escura para a mais clara, sem repetir.
 */
export function medianCut(data: ArrayLike<number>, max: number): string[] {
  const px: [number, number, number][] = [];
  for (let o = 0; o + 3 < data.length; o += 4) if ((data[o + 3] ?? 0) >= 128) px.push([data[o], data[o + 1], data[o + 2]]);
  if (!px.length || max < 1) return [];
  const spread = (box: readonly [number, number, number][]) => {
    let best = { axis: 0, range: -1 };
    for (let a = 0; a < 3; a++) {
      let lo = 255;
      let hi = 0;
      for (const p of box) {
        if (p[a] < lo) lo = p[a];
        if (p[a] > hi) hi = p[a];
      }
      if (hi - lo > best.range) best = { axis: a, range: hi - lo };
    }
    return best;
  };
  let boxes: [number, number, number][][] = [px];
  while (boxes.length < max) {
    let pick = -1;
    let pickRange = 0;
    boxes.forEach((b, k) => {
      const s = spread(b);
      if (b.length > 1 && s.range > pickRange) {
        pick = k;
        pickRange = s.range;
      }
    });
    if (pick < 0) break;
    const { axis } = spread(boxes[pick]);
    const sorted = [...boxes[pick]].sort((p, q) => p[axis] - q[axis]);
    const mid = sorted.length >> 1;
    boxes = [...boxes.slice(0, pick), sorted.slice(0, mid), sorted.slice(mid), ...boxes.slice(pick + 1)];
  }
  const hex = (n: number) => Math.round(n).toString(16).padStart(2, '0');
  const colors = boxes.map((b) => {
    const sum = b.reduce((acc, p) => [acc[0] + p[0], acc[1] + p[1], acc[2] + p[2]], [0, 0, 0]);
    return { c: `#${hex(sum[0] / b.length)}${hex(sum[1] / b.length)}${hex(sum[2] / b.length)}`, light: (0.2126 * sum[0] + 0.7152 * sum[1] + 0.0722 * sum[2]) / b.length };
  });
  return [...new Set(colors.sort((a, b) => a.light - b.light).map((x) => x.c))];
}
