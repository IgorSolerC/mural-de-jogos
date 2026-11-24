import { INK_MAX, PIXEL_MAX, quantize, writePixelArt } from './pixel-art';
import { pieceTitleOf } from './pixel-gallery';
import { medianCut } from './pixel-tools';

/**
 * Da imagem à obra (PLANO-SOLTAR-IMAGENS.md, rodada 2): uma imagem do computador vira uma pixel art da galeria. Os
 * bytes RGBA dela (como o canvas dá) passam por aqui, sem o canvas: tudo puro.
 *
 * - **A ampliada**: uma pixel art ampliada (cada ponto um quadradinho de `kx` × `ky` pixels) muda de cor só na grade
 *   dos quadradinhos. `guessScale` procura, em cada eixo, o maior passo em que quase todas as mudanças de cor caem
 *   (e onde a grade começa, que a imagem cortada não começa no canto); `undoScale` volta cada quadradinho a um
 *   ponto, com a cor que mais aparece nele.
 * - **O teto**: maior que `PIXEL_MAX` depois disso, encolhe até caber, sem deformar (`fitSide`, `shrinkRgba`).
 * - **A paleta da imagem**: até 61 cores, as dela, exatas; mais que isso, as 61 do corte na mediana (o "com as cores
 *   dela" do ateliê). Da mais escura para a mais clara, como no ateliê.
 */

/** Uma imagem em bytes: RGBA, linha por linha. */
export interface Rgba {
  data: ArrayLike<number>;
  w: number;
  h: number;
}

/** O passo da grade de uma pixel art ampliada, em cada eixo, e onde ela começa (0 a passo − 1). */
export interface PixelScale {
  kx: number;
  ky: number;
  ox: number;
  oy: number;
}

/** A imagem que não é ampliada: um pixel por ponto. */
export const NO_SCALE: PixelScale = { kx: 1, ky: 1, ox: 0, oy: 0 };

/** Quanto das mudanças de cor precisa cair na grade para ela valer. */
const ALIGNED_MIN = 0.97;
/** Quanto duas cores podem diferir (em cada canal) e ainda ser a mesma: o PNG salvo com outro perfil de cor. */
const SAME_TOLERANCE = 12;
/** A grade adivinhada deixa ao menos tantos pontos em cada eixo (uma mancha só não diz o passo). */
const MIN_CELLS = 4;
/** Acima disto (por lado), nem se procura a grade: a conta pesaria e nenhuma pixel art ampliada é tão grande. */
export const GUESS_SIDE_MAX = 4096;

function transparent(d: ArrayLike<number>, o: number): boolean {
  return (d[o + 3] ?? 0) < 128;
}

/** Os dois pixels são da mesma cor (os dois transparentes também são). */
function same(d: ArrayLike<number>, a: number, b: number): boolean {
  const ta = transparent(d, a);
  if (ta || transparent(d, b)) return ta && transparent(d, b);
  return Math.abs(d[a] - d[b]) <= SAME_TOLERANCE && Math.abs(d[a + 1] - d[b + 1]) <= SAME_TOLERANCE && Math.abs(d[a + 2] - d[b + 2]) <= SAME_TOLERANCE;
}

/** Quantas mudanças de cor há antes de cada coluna (`axis` x) ou fileira (`axis` y): edges[i] = entre i − 1 e i. */
function edgesOf(img: Rgba, axis: 'x' | 'y'): Float64Array {
  // (uma passada pela imagem inteira: a folha pede de novo a cada passo escolhido, e a imagem não muda)
  const kept = edgeCache.get(img)?.[axis];
  if (kept) return kept;
  const edges = countEdges(img, axis);
  edgeCache.set(img, { ...edgeCache.get(img), [axis]: edges });
  return edges;
}

const edgeCache = new WeakMap<Rgba, { x?: Float64Array; y?: Float64Array }>();

function countEdges(img: Rgba, axis: 'x' | 'y'): Float64Array {
  const { data, w, h } = img;
  const n = axis === 'x' ? w : h;
  const edges = new Float64Array(n);
  if (axis === 'x') {
    for (let y = 0; y < h; y++) for (let x = 1; x < w; x++) if (!same(data, (y * w + x - 1) * 4, (y * w + x) * 4)) edges[x]++;
  } else {
    for (let y = 1; y < h; y++) for (let x = 0; x < w; x++) if (!same(data, ((y - 1) * w + x) * 4, (y * w + x) * 4)) edges[y]++;
  }
  return edges;
}

/** O quanto das mudanças cai na grade de passo `k` começando em `o` (0 a 1), e o melhor começo. */
function alignment(edges: Float64Array, k: number): { score: number; o: number } {
  const buckets = new Float64Array(k);
  let total = 0;
  for (let i = 1; i < edges.length; i++) {
    buckets[i % k] += edges[i];
    total += edges[i];
  }
  let o = 0;
  for (let j = 1; j < k; j++) if (buckets[j] > buckets[o]) o = j;
  return { score: total ? buckets[o] / total : 0, o };
}

/** O maior passo que vale num eixo (com o começo); null: nenhum passo de 2 ou mais vale; undefined: sem mudança de cor. */
function axisScale(edges: Float64Array): { k: number; o: number } | null | undefined {
  if (!edges.some((e) => e > 0)) return undefined;
  for (let k = Math.floor(edges.length / MIN_CELLS); k >= 2; k--) {
    const a = alignment(edges, k);
    if (a.score >= ALIGNED_MIN) return { k, o: a.o };
  }
  return null;
}

/**
 * O passo da grade da pixel art ampliada, em cada eixo (o maior que vale). Quando o passo menor de um eixo também
 * vale no outro, os dois ficam com ele (os pontos quadrados, o comum). Null: a imagem não parece ampliada.
 */
export function guessScale(img: Rgba): PixelScale | null {
  if (img.w > GUESS_SIDE_MAX || img.h > GUESS_SIDE_MAX || img.w < MIN_CELLS * 2 || img.h < MIN_CELLS * 2) return null;
  const ex = edgesOf(img, 'x');
  const ey = edgesOf(img, 'y');
  const sx = axisScale(ex);
  const sy = axisScale(ey);
  if (sx === null || sy === null || (!sx && !sy)) return null;
  // um eixo sem nenhuma mudança de cor (listras): o passo do outro
  let x = sx ?? { k: sy!.k, o: 0 };
  let y = sy ?? { k: sx!.k, o: 0 };
  if (x.k !== y.k) {
    const small = Math.min(x.k, y.k);
    const onX = alignment(ex, small);
    const onY = alignment(ey, small);
    if ((!sx || onX.score >= ALIGNED_MIN) && (!sy || onY.score >= ALIGNED_MIN)) {
      x = { k: small, o: sx ? onX.o : 0 };
      y = { k: small, o: sy ? onY.o : 0 };
    }
  }
  return { kx: x.k, ky: y.k, ox: x.o, oy: y.o };
}

/**
 * O passo escolhido à mão (`k` nos dois eixos): a grade começa onde as mudanças de cor mais caem (a adivinhada,
 * quando o passo é o dela). Só passos que deixam ao menos um ponto.
 */
export function scaleFor(img: Rgba, k: number, guess: PixelScale | null = null): PixelScale {
  const step = Math.max(1, Math.min(Math.round(k), img.w, img.h));
  if (step === 1) return NO_SCALE;
  if (guess && guess.kx === step && guess.ky === step) return guess;
  if (img.w > GUESS_SIDE_MAX || img.h > GUESS_SIDE_MAX) return { kx: step, ky: step, ox: 0, oy: 0 };
  return { kx: step, ky: step, ox: alignment(edgesOf(img, 'x'), step).o, oy: alignment(edgesOf(img, 'y'), step).o };
}

/** Onde começa a primeira célula (antes do 0, quando a grade começa depois dele) e quantas há, num eixo. */
function cells(n: number, k: number, o: number): { start: number; count: number } {
  const start = o > 0 ? o - k : 0;
  return { start, count: Math.ceil((n - start) / k) };
}

/** O tamanho da obra com o passo `s`: cada quadradinho vira um ponto (os cortados na beirada também). */
export function scaledSize(w: number, h: number, s: PixelScale): { w: number; h: number } {
  return { w: cells(w, s.kx, s.ox % s.kx).count, h: cells(h, s.ky, s.oy % s.ky).count };
}

/** De cada quadradinho, até tantos pixels por lado entram na conta (no miolo, com o passo igual entre eles). */
const SAMPLES = 8;

/** Os pontos do miolo de um pedaço [a, b) de um eixo: sem a beirada (borrada no JPEG), até `SAMPLES`. */
function inner(a: number, b: number): number[] {
  const n = b - a;
  const m = n >= 4 ? Math.floor(n / 4) : 0;
  const lo = a + m;
  const span = b - m - lo;
  const count = Math.min(SAMPLES, span);
  return Array.from({ length: count }, (_, i) => lo + Math.floor(((i + 0.5) * span) / count));
}

/**
 * Cada quadradinho da grade vira um ponto, com a cor que mais aparece no miolo dele (o transparente conta como uma
 * cor); quando nenhuma se repete (a imagem salva em JPEG), a média do miolo.
 */
export function undoScale(img: Rgba, s: PixelScale): Rgba {
  if (s.kx <= 1 && s.ky <= 1) return img;
  const cx = cells(img.w, s.kx, s.ox % s.kx);
  const cy = cells(img.h, s.ky, s.oy % s.ky);
  const out = new Uint8ClampedArray(cx.count * cy.count * 4);
  const counts = new Map<number, number>();
  const xs = Array.from({ length: cx.count }, (_, i) => inner(Math.max(0, cx.start + i * s.kx), Math.min(img.w, cx.start + (i + 1) * s.kx)));
  for (let j = 0; j < cy.count; j++) {
    const ys = inner(Math.max(0, cy.start + j * s.ky), Math.min(img.h, cy.start + (j + 1) * s.ky));
    for (let i = 0; i < cx.count; i++) {
      counts.clear();
      let best = -1;
      let bestN = 0;
      let r = 0;
      let g = 0;
      let b = 0;
      let opaque = 0;
      let seen = 0;
      for (const y of ys) {
        for (const x of xs[i]) {
          const o = (y * img.w + x) * 4;
          seen++;
          // a cor sem o alfa (o transparente é uma cor só: -1)
          const clear = transparent(img.data, o);
          const key = clear ? -1 : (img.data[o] << 16) | (img.data[o + 1] << 8) | img.data[o + 2];
          if (!clear) {
            r += img.data[o];
            g += img.data[o + 1];
            b += img.data[o + 2];
            opaque++;
          }
          const n = (counts.get(key) ?? 0) + 1;
          counts.set(key, n);
          if (n > bestN) {
            bestN = n;
            best = key;
          }
        }
      }
      const p = (j * cx.count + i) * 4;
      // (nenhuma cor se repete: a média, se a maior parte é pintada)
      if (bestN <= 1 && seen > 1 && opaque * 2 > seen) best = (Math.round(r / opaque) << 16) | (Math.round(g / opaque) << 8) | Math.round(b / opaque);
      if (best >= 0) {
        out[p] = (best >> 16) & 255;
        out[p + 1] = (best >> 8) & 255;
        out[p + 2] = best & 255;
        out[p + 3] = 255;
      }
    }
  }
  return { data: out, w: cx.count, h: cy.count };
}

/** O tamanho que cabe em `max` × `max` sem deformar (igual, se já cabe). */
export function fitSide(w: number, h: number, max = PIXEL_MAX): { w: number; h: number } {
  if (w <= max && h <= max) return { w, h };
  const k = max / Math.max(w, h);
  return { w: Math.max(1, Math.min(max, Math.round(w * k))), h: Math.max(1, Math.min(max, Math.round(h * k))) };
}

/**
 * A imagem encolhida para `w` × `h` pela média de cada caixa (a cor pesada pelo alfa: o transparente não escurece a
 * beirada). Para crescer não serve: o teto só encolhe.
 */
export function shrinkRgba(img: Rgba, w: number, h: number): Rgba {
  if (w >= img.w && h >= img.h) return img;
  const out = new Uint8ClampedArray(w * h * 4);
  const fx = img.w / w;
  const fy = img.h / h;
  for (let j = 0; j < h; j++) {
    const y0 = Math.floor(j * fy);
    const y1 = Math.max(y0 + 1, Math.floor((j + 1) * fy));
    for (let i = 0; i < w; i++) {
      const x0 = Math.floor(i * fx);
      const x1 = Math.max(x0 + 1, Math.floor((i + 1) * fx));
      let r = 0;
      let g = 0;
      let b = 0;
      let a = 0;
      let n = 0;
      for (let y = y0; y < y1; y++) {
        for (let x = x0; x < x1; x++) {
          const o = (y * img.w + x) * 4;
          const al = img.data[o + 3];
          r += img.data[o] * al;
          g += img.data[o + 1] * al;
          b += img.data[o + 2] * al;
          a += al;
          n++;
        }
      }
      const p = (j * w + i) * 4;
      if (a > 0) {
        out[p] = r / a;
        out[p + 1] = g / a;
        out[p + 2] = b / a;
      }
      out[p + 3] = a / n;
    }
  }
  return { data: out, w, h };
}

/** A imagem pronta para virar obra: sem a ampliação (o passo `s`) e no teto. */
export function pixelSized(img: Rgba, s: PixelScale = NO_SCALE): Rgba {
  const plain = undoScale(img, s);
  const fit = fitSide(plain.w, plain.h);
  return shrinkRgba(plain, fit.w, fit.h);
}

function hex(n: number): string {
  return n.toString(16).padStart(2, '0');
}

/**
 * As cores de uma imagem: as dela, exatas, quando são até `INK_MAX`; senão as do corte na mediana. Da mais escura
 * para a mais clara (como o corte na mediana dá), sem o transparente.
 */
export function imageInks(img: Rgba): string[] {
  const seen = new Map<string, number>();
  for (let o = 0; o + 3 < img.data.length; o += 4) {
    if (transparent(img.data, o)) continue;
    const c = `#${hex(img.data[o])}${hex(img.data[o + 1])}${hex(img.data[o + 2])}`;
    if (!seen.has(c)) {
      seen.set(c, 0.2126 * img.data[o] + 0.7152 * img.data[o + 1] + 0.0722 * img.data[o + 2]);
      if (seen.size > INK_MAX) return medianCut(img.data, INK_MAX);
    }
  }
  return [...seen.entries()].sort((a, b) => a[1] - b[1] || (a[0] < b[0] ? -1 : 1)).map(([c]) => c);
}

/**
 * A obra da imagem (já sem a ampliação e no teto, ver `pixelSized`): a grade dela, a paleta Própria com as cores
 * dela e cada ponto na cor mais perto. Null: a imagem é toda transparente.
 */
export function imageArt(img: Rgba): string[] | null {
  const inks = imageInks(img);
  if (!inks.length) return null;
  const all = [null, ...inks];
  const colors: Record<number, string> = {};
  inks.forEach((c, i) => (colors[i + 1] = c));
  return writePixelArt({ w: img.w, h: img.h, rows: quantize(img.data, img.w, img.h, all), palette: 'propria', colors, look: 'pixel', caption: '' });
}

/**
 * O nome da obra: o do arquivo, sem a extensão (como a pessoa escreveu; os espaços de sobra saem). O "image.png" do
 * que se cola não diz nada: vira sem título.
 */
export function titleOfFile(name: string): string {
  const base = pieceTitleOf(name.replace(/\.[a-z0-9]{1,5}$/i, ''));
  return /^image$/i.test(base) ? '' : base;
}

/** A imagem pede a pergunta da ampliação: algum lado passa de 64 (o pedido do dono). */
export const ASK_SIDE = 64;
export function asksScale(w: number, h: number): boolean {
  return w > ASK_SIDE || h > ASK_SIDE;
}
