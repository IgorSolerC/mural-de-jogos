/**
 * Puxar uma alça para mudar o tamanho de uma caixa: a conta que o Quadro livre (as peças, ui/free-board/edit-ops.ts) e o
 * ateliê da pixel art (esticar a seleção, a referência) dividem. Tudo aqui é puro; quem usa diz o menor tamanho e como
 * arredondar (os furos do quadro, o ponto inteiro da pixel art, ou nada).
 */

export interface Box {
  x: number;
  y: number;
  w: number;
  h: number;
}

/** As alças: os cantos e o meio dos lados (n, s, e, w e as combinações). */
export type Handle = 'n' | 's' | 'e' | 'w' | 'ne' | 'nw' | 'se' | 'sw';
export const ALL_HANDLES: readonly Handle[] = ['nw', 'n', 'ne', 'e', 'se', 's', 'sw', 'w'];

/** Livre (cada lado anda sozinho) ou na proporção (o desenho cresce por igual e não deforma). */
export type SizeRule = 'livre' | 'proporcao';

export interface ResizeOptions {
  /** O menor lado (a altura, se a caixa já começou menor, pode ficar como estava). */
  min: number;
  /** Como a borda que anda cai (o furo do quadro, o ponto inteiro); sem isso, `Math.round`. */
  round?: (v: number) => number;
  /** Na proporção, como o tamanho e o lugar que saem da conta caem (o Quadro livre e a seleção: em inteiros; a referência: com fração). */
  sizeRound?: (v: number) => number;
}

/**
 * A caixa nova ao puxar a alça `h` de `dx`, `dy`. Na proporção, a largura manda (no meio de cima ou de baixo, a
 * altura, e a caixa cresce para os dois lados), e o desenho não deforma.
 */
export function resizeBox(start: Box, h: Handle, dx: number, dy: number, rule: SizeRule, opts: ResizeOptions): Box {
  const min = opts.min;
  const s = opts.round ?? Math.round;
  let x0 = start.x;
  let y0 = start.y;
  let x1 = start.x + start.w;
  let y1 = start.y + start.h;
  if (h.includes('w')) x0 = s(x0 + dx);
  if (h.includes('e')) x1 = s(x1 + dx);
  if (h.includes('n')) y0 = s(y0 + dy);
  if (h.includes('s')) y1 = s(y1 + dy);
  if (x1 - x0 < min) h.includes('w') ? (x0 = x1 - min) : (x1 = x0 + min);
  if (y1 - y0 < Math.min(min, start.h)) h.includes('n') ? (y0 = y1 - Math.min(min, start.h)) : (y1 = y0 + Math.min(min, start.h));
  let out = { x: x0, y: y0, w: x1 - x0, h: y1 - y0 };
  if (rule === 'proporcao') {
    const r = opts.sizeRound ?? Math.round;
    const ratio = start.w / (start.h > 0 ? start.h : 1);
    // no canto, manda o lado que andou mais (puxar o canto só para baixo também cresce); no meio de um lado, ele
    const byHeight = h === 'n' || h === 's' || (h.length === 2 && Math.abs(out.h / start.h - 1) > Math.abs(out.w / start.w - 1));
    const w = Math.max(min, byHeight ? r(out.h * ratio) : out.w);
    const hh = Math.max(Math.min(1, min), r(w / ratio));
    // o eixo que ninguém puxou cresce para os dois lados, no lugar
    const x = h === 'n' || h === 's' ? r(start.x + (start.w - w) / 2) : h.includes('w') ? x1 - w : x0;
    const y = h === 'e' || h === 'w' ? r(start.y + (start.h - hh) / 2) : h.includes('n') ? y1 - hh : y0;
    out = { x, y, w, h: hh };
  }
  return out;
}
