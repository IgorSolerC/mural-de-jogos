import { Cell, PIXEL_MAX, inkChar } from './pixel-art';

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
export const ZOOMS: readonly number[] = [1, 2, 3, 4, 6, 8, 12, 16, 24, 32, 48, 64];
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
