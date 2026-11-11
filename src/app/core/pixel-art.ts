import { labelKey as key } from './text';

/**
 * A pixel art das anotações, como dados (o widget `{{pixel: …}}`, ver core/widgets.ts e PLANO-PIXEL.md).
 * O desenho mora numa linha só do texto:
 *
 *   {{pixel: 8x8 | 0110011/11111111/11111111/0111111/001111/00011 | pastel | Coração}}
 *
 * - a grade, `LxA` (de 1 a 32 cada lado);
 * - os pontos, as fileiras de cima para baixo separadas por "/", um algarismo por ponto (0 é o
 *   transparente; de 1 a 9, as cores da paleta). Os 0 do fim de cada fileira e as fileiras vazias do
 *   fim não se escrevem;
 * - a paleta, uma palavra (`classica`, a de sempre, não se escreve);
 * - as cores trocadas, só as que mudaram: "3#e43b44 7#3355aa";
 * - o jeito (`pixel`, o de sempre, não se escreve);
 * - a legenda, o primeiro texto que não é nada disso.
 *
 * Aqui não entra nada de core/widgets.ts nem de core/rich-text.ts: os dois usam este arquivo.
 */

/** O maior lado da grade, em pontos. */
export const PIXEL_MAX = 32;
/** A grade de quando nada foi escrito (a folha abre nela). */
export const PIXEL_DEFAULT_SIDE = 16;


// ===== a paleta =====

/**
 * As paletas: nove cores cada (do 1 ao 9; o 0 é sempre o transparente). Em todas, o 1 é a tinta
 * escura (o contorno) e o 2 o claro; do 3 ao 9, as cores, na mesma ordem de tom (cinza, vermelho,
 * laranja, amarelo, verde, azul, marrom na clássica), para um desenho trocar de paleta e continuar
 * fazendo sentido.
 */
export type PaletteName = 'classica' | 'pastel' | 'terra' | 'mar' | 'neon' | 'cinzas';
export const PALETTES: readonly { value: PaletteName; label: string; colors: readonly string[] }[] = [
  { value: 'classica', label: 'Clássica', colors: ['#1d1b22', '#f7f3e8', '#8a8791', '#d8433b', '#ef8a2f', '#f4c542', '#4f9d4a', '#3a6fc4', '#8a5a3c'] },
  { value: 'pastel', label: 'Pastel', colors: ['#4b4453', '#fffaf0', '#c9b6e8', '#f6b8c4', '#f7c9a0', '#f9e79f', '#b9e4c9', '#a8d8f0', '#e6d3b3'] },
  { value: 'terra', label: 'Terra', colors: ['#2b1d14', '#f1e4c8', '#9a8a74', '#a8462c', '#d08a3c', '#e3c16f', '#6b7f3a', '#3f6b5a', '#7a5a3a'] },
  { value: 'mar', label: 'Mar', colors: ['#0e2235', '#eef6f7', '#9fb7c4', '#e9765b', '#f2c879', '#f6e7b4', '#7fd1c6', '#2fa3b5', '#2d6aa3'] },
  { value: 'neon', label: 'Neon', colors: ['#120f1f', '#f5f5ff', '#4a4466', '#ff3b6b', '#ff9a3c', '#f9f871', '#39ff88', '#3cc8ff', '#b45cff'] },
  { value: 'cinzas', label: 'Cinzas', colors: ['#141414', '#f5f5f5', '#8c8c8c', '#5a5a5a', '#a6a6a6', '#d4d4d4', '#737373', '#3d3d3d', '#bfbfbf'] },
];
/** A paleta de quando nada foi escrito (e a que não se escreve). */
export const DEFAULT_PALETTE: PaletteName = 'classica';
const PALETTE_WORDS: Record<string, PaletteName> = {
  classica: 'classica',
  padrao: 'classica',
  pastel: 'pastel',
  terra: 'terra',
  mar: 'mar',
  oceano: 'mar',
  neon: 'neon',
  cinzas: 'cinzas',
  cinza: 'cinzas',
};
export function paletteWord(a: string): PaletteName | null {
  const k = key(a);
  return Object.hasOwn(PALETTE_WORDS, k) ? PALETTE_WORDS[k] : null;
}

// ===== o jeito =====

/**
 * Os jeitos do desenho:
 * - `pixel`: os quadradinhos rentes na cartolina (o de sempre);
 * - `figurinha`: recortado com a borda branca seguindo o contorno, colado;
 * - `ponto-cruz`: bordado num retalho de étamine, cada ponto um X de linha;
 * - `micanga`: contas redondas numa placa de pinos.
 */
export type PixelLook = 'pixel' | 'figurinha' | 'ponto-cruz' | 'micanga';
export const PIXEL_LOOKS: readonly { value: PixelLook; label: string }[] = [
  { value: 'pixel', label: 'Pixel' },
  { value: 'figurinha', label: 'Figurinha' },
  { value: 'ponto-cruz', label: 'Ponto-cruz' },
  { value: 'micanga', label: 'Miçanga' },
];
export const DEFAULT_PIXEL_LOOK: PixelLook = 'pixel';
const LOOK_WORDS: Record<string, PixelLook> = {
  pixel: 'pixel',
  pixels: 'pixel',
  figurinha: 'figurinha',
  'ponto-cruz': 'ponto-cruz',
  'ponto cruz': 'ponto-cruz',
  pontocruz: 'ponto-cruz',
  bordado: 'ponto-cruz',
  micanga: 'micanga',
  micangas: 'micanga',
  contas: 'micanga',
};
export function pixelLookWord(a: string): PixelLook | null {
  const k = key(a);
  return Object.hasOwn(LOOK_WORDS, k) ? LOOK_WORDS[k] : null;
}

// ===== as partes escritas =====

const DIMS = /^(\d{1,2})\s*[x×]\s*(\d{1,2})$/i;
/** Os pontos: algarismos e "/", com pelo menos um algarismo. */
const ROWS = /^[0-9/]*[0-9][0-9/]*$/;
/** As cores trocadas: "3#e43b44 7#35a", separadas por espaço. */
const COLORS = /^[1-9]#(?:[0-9a-f]{6}|[0-9a-f]{3})(?:\s+[1-9]#(?:[0-9a-f]{6}|[0-9a-f]{3}))*$/i;
const HEX = /^#(?:[0-9a-f]{6}|[0-9a-f]{3})$/i;

/** "16x16" → 16 por 16; null se não é uma grade que vale (de 1 a 32 cada lado). */
export function parseDims(a: string): { w: number; h: number } | null {
  const m = DIMS.exec(a.trim());
  if (!m) return null;
  const w = Number(m[1]);
  const h = Number(m[2]);
  return w >= 1 && h >= 1 && w <= PIXEL_MAX && h <= PIXEL_MAX ? { w, h } : null;
}

/** Um lado da grade, entre 1 e 32 (o que não é número vira `fallback`). */
export function clampSide(n: number | string | undefined, fallback = PIXEL_DEFAULT_SIDE): number {
  // (o campo vazio é o de sempre, e não 0: Number('') é 0)
  const v = typeof n === 'string' ? (n.trim() ? Number(n) : NaN) : (n ?? NaN);
  return Number.isFinite(v) ? Math.min(PIXEL_MAX, Math.max(1, Math.round(v))) : fallback;
}

/** "#35A" → "#3355aa": a cor sempre com seis letras, em minúsculas; null se não é uma cor. */
export function normalHex(c: string): string | null {
  const t = c.trim();
  if (!HEX.test(t)) return null;
  const h = t.slice(1).toLowerCase();
  return '#' + (h.length === 3 ? [...h].map((x) => x + x).join('') : h);
}

/** As cores trocadas escritas ("3#e43b44 7#3355aa") → do número à cor; null se não é isso. */
export function parseColors(a: string): Record<number, string> | null {
  const t = a.trim();
  if (!COLORS.test(t)) return null;
  const out: Record<number, string> = {};
  for (const part of t.split(/\s+/)) out[Number(part[0])] = normalHex(part.slice(1))!;
  return out;
}

/** As cores trocadas de volta ao texto, na ordem dos números, só as que são diferentes da paleta. */
export function writeColors(colors: Readonly<Record<number, string>>, palette: PaletteName): string {
  const base = paletteColors(palette);
  return Object.keys(colors)
    .map(Number)
    .filter((n) => n >= 1 && n <= 9)
    .sort((a, b) => a - b)
    .map((n) => [n, normalHex(colors[n] ?? '')] as const)
    .filter(([n, c]) => c && c !== base[n - 1])
    .map(([n, c]) => `${n}${c}`)
    .join(' ');
}

/** As nove cores de uma paleta (do 1 ao 9). */
export function paletteColors(name: PaletteName): readonly string[] {
  return (PALETTES.find((p) => p.value === name) ?? PALETTES[0]).colors;
}

/** As dez cores do desenho: o 0 é null (transparente); do 1 ao 9, as da paleta com as trocadas por cima. */
export function inkOf(palette: PaletteName, colors: Readonly<Record<number, string>>): (string | null)[] {
  const base = paletteColors(palette);
  return [null, ...base.map((c, i) => normalHex(colors[i + 1] ?? '') ?? c)];
}

/**
 * Os pontos escritos ("0110/11//1") → as fileiras, cada uma com exatamente `w` algarismos, e `h`
 * fileiras: a mais curta completa com 0, o que passa da grade fica de fora.
 */
export function gridOf(raw: string, w: number, h: number): string[] {
  const rows = raw ? raw.split('/') : [];
  const out: string[] = [];
  for (let r = 0; r < h; r++) out.push((rows[r] ?? '').replace(/[^0-9]/g, '').slice(0, w).padEnd(w, '0'));
  return out;
}

/** As fileiras de volta ao texto: sem os 0 do fim de cada uma e sem as vazias do fim; "" se não tem ponto. */
export function writeGrid(rows: readonly string[]): string {
  const cut = rows.map((r) => r.replace(/0+$/, ''));
  while (cut.length && !cut.at(-1)) cut.pop();
  return cut.join('/');
}

/** O desenho tem algum ponto pintado? */
export function hasInk(rows: readonly string[]): boolean {
  return rows.some((r) => /[1-9]/.test(r));
}

/** A pixel art como foi escrita. */
export interface PixelArt {
  w: number;
  h: number;
  /** As fileiras, `h` delas, cada uma com `w` algarismos. */
  rows: string[];
  /** Os pontos como foram escritos (sem cortar: a folha guarda o que passa da grade enquanto está aberta). */
  raw: string;
  palette: PaletteName;
  /** As cores trocadas, do número (1 a 9) à cor ("#e43b44"). */
  colors: Record<number, string>;
  look: PixelLook;
  caption: string;
}

/**
 * Os parâmetros em qualquer ordem: a primeira grade é a grade; os primeiros pontos, os pontos; a
 * primeira palavra de paleta, a paleta; as primeiras cores trocadas, elas; a primeira palavra de jeito,
 * o jeito; o primeiro outro texto, a legenda. Sem a grade, ela sai dos pontos (a fileira mais longa e
 * quantas são).
 */
export function readPixelArt(args: readonly string[]): PixelArt {
  let dims: { w: number; h: number } | null = null;
  let raw: string | null = null;
  let palette: PaletteName | null = null;
  let colors: Record<number, string> | null = null;
  let look: PixelLook | null = null;
  let caption = '';
  for (const a of args) {
    const d: { w: number; h: number } | null = dims ? null : parseDims(a);
    const p: PaletteName | null = palette ? null : paletteWord(a);
    const l: PixelLook | null = look ? null : pixelLookWord(a);
    const c: Record<number, string> | null = colors ? null : parseColors(a);
    if (d) dims = d;
    else if (raw === null && ROWS.test(a.trim())) raw = a.trim();
    else if (p) palette = p;
    else if (c) colors = c;
    else if (l) look = l;
    else if (!caption && a.trim()) caption = a.trim();
  }
  const text = raw ?? '';
  const written = text ? text.split('/') : [];
  // (um laço, e não Math.max(...): uma linha escrita à mão com milhares de fileiras estouraria a pilha)
  let longest = 1;
  for (const r of written) longest = Math.max(longest, r.length);
  // sem grade e sem pontos (o "{{pixel}}" de um widget novo), a grade de sempre
  const w = dims?.w ?? (text ? clampSide(longest) : PIXEL_DEFAULT_SIDE);
  const h = dims?.h ?? (text ? clampSide(written.length) : PIXEL_DEFAULT_SIDE);
  return { w, h, rows: gridOf(text, w, h), raw: text, palette: palette ?? DEFAULT_PALETTE, colors: colors ?? {}, look: look ?? DEFAULT_PIXEL_LOOK, caption };
}

/**
 * Os parâmetros escritos, na ordem da folha: a grade, os pontos, a paleta (a clássica não se escreve),
 * as cores trocadas, o jeito (o pixel não se escreve) e a legenda. Uma legenda que é a palavra de uma
 * paleta ou de um jeito ("Pastel") faz os dois irem escritos antes dela: a primeira palavra de cada um
 * é ele. Null: o desenho não tem nenhum ponto.
 */
export function writePixelArt(art: Pick<PixelArt, 'w' | 'h' | 'rows' | 'palette' | 'colors' | 'look' | 'caption'>): string[] | null {
  const rows = gridOf(art.rows.join('/'), art.w, art.h);
  if (!hasInk(rows)) return null;
  const caption = art.caption.replace(/\s+/g, ' ').trim();
  // (a grade e os pontos vão sempre antes da legenda: uma legenda "2026" ou "8x8" continua legenda)
  const named = !!caption && (!!paletteWord(caption) || !!pixelLookWord(caption));
  // a legenda com cara de cor trocada ("3#fff") seria lida como as cores: sem trocada nenhuma, vai a do 1
  // como ela já é, que ocupa o lugar das cores e não muda nada
  const colors = writeColors(art.colors, art.palette) || (caption && parseColors(caption) ? `1${paletteColors(art.palette)[0]}` : '');
  return [
    `${art.w}x${art.h}`,
    writeGrid(rows),
    named || art.palette !== DEFAULT_PALETTE ? art.palette : '',
    colors,
    named || art.look !== DEFAULT_PIXEL_LOOK ? art.look : '',
    caption,
  ].filter(Boolean);
}

/** "16 × 16 · Pastel": a tirinha do editor e o nome falado. */
export function pixelSummary(art: Pick<PixelArt, 'w' | 'h' | 'palette'>): string {
  const palette = PALETTES.find((p) => p.value === art.palette)?.label ?? '';
  return `${art.w} × ${art.h} · ${palette}`;
}

/** Quantos pontos de cada cor (do 0 ao 9). */
export function inkCount(rows: readonly string[]): number[] {
  const out = new Array<number>(10).fill(0);
  for (const r of rows) for (const ch of r) out[Number(ch)]++;
  return out;
}

// ===== o que a prancheta faz com os pontos (ui/pixel-canvas.ts) =====
// As fileiras são sempre `string[]` de algarismos; cada operação devolve fileiras novas (as de antes
// ficam para o desfazer) e mexe só dentro da grade `w` × `h` (o que está fora fica como está).

/** Um ponto da grade: a coluna e a fileira. */
export interface Cell {
  x: number;
  y: number;
}

/** Fileiras em branco (transparentes), `h` delas com `w` pontos. */
export function blankGrid(w: number, h: number): string[] {
  return Array.from({ length: h }, () => '0'.repeat(w));
}

/** As fileiras com os pontos dados pintados de `ink` (os de fora das fileiras ficam de fora). */
export function paintCells(rows: readonly string[], cells: readonly Cell[], ink: number): string[] {
  const out = [...rows];
  const ch = String(ink);
  for (const { x, y } of cells) {
    const row = out[y];
    if (row === undefined || x < 0 || x >= row.length || row[x] === ch) continue;
    out[y] = row.slice(0, x) + ch + row.slice(x + 1);
  }
  return out;
}

/** Os pontos da reta de `a` até `b`, sem buraco (Bresenham): o arrasto rápido não pula pontos, e o Shift risca. */
export function lineCells(a: Cell, b: Cell): Cell[] {
  const out: Cell[] = [];
  let { x, y } = a;
  const dx = Math.abs(b.x - x);
  const dy = -Math.abs(b.y - y);
  const sx = x < b.x ? 1 : -1;
  const sy = y < b.y ? 1 : -1;
  let err = dx + dy;
  for (;;) {
    out.push({ x, y });
    if (x === b.x && y === b.y) return out;
    const e2 = 2 * err;
    if (e2 >= dy) {
      err += dy;
      x += sx;
    }
    if (e2 <= dx) {
      err += dx;
      y += sy;
    }
  }
}

/** O balde: a mancha da mesma cor em volta de `at` (pelos lados, não pelas quinas), dentro da grade, vira `ink`. */
export function floodFill(rows: readonly string[], at: Cell, ink: number, w: number, h: number): string[] {
  const from = rows[at.y]?.[at.x];
  const to = String(ink);
  if (from === undefined || from === to) return [...rows];
  const grid = rows.map((r) => [...r]);
  const stack: Cell[] = [at];
  while (stack.length) {
    const { x, y } = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h || grid[y][x] !== from) continue;
    grid[y][x] = to;
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  return grid.map((r) => r.join(''));
}

/** O desenho virado de lado (o espelho do lado de lá), dentro da grade. */
export function flipH(rows: readonly string[], w: number, h: number): string[] {
  return rows.map((r, y) => (y < h ? [...r.slice(0, w)].reverse().join('') + r.slice(w) : r));
}

/** O desenho de cabeça para baixo, dentro da grade. */
export function flipV(rows: readonly string[], w: number, h: number): string[] {
  const top = rows.slice(0, h).map((r) => r.slice(0, w));
  return rows.map((r, y) => (y < h ? top[h - 1 - y] + r.slice(w) : r));
}

/** O desenho empurrado um ponto (ou mais) para um lado, dentro da grade; o que sai de um lado volta pelo outro. */
export function shiftGrid(rows: readonly string[], dx: number, dy: number, w: number, h: number): string[] {
  const at = (v: number, n: number) => ((v % n) + n) % n;
  return rows.map((r, y) => {
    if (y >= h) return r;
    const src = rows[at(y - dy, h)];
    let line = '';
    for (let x = 0; x < w; x++) line += src[at(x - dx, w)];
    return line + r.slice(w);
  });
}

// ===== o desenho de cada jeito (ui/pixel-art.ts, a prancheta e as miniaturas da folha) =====

/** Um caminho do desenho: o algarismo (a cor) e o `d` de todos os pontos dele. */
export interface InkPath {
  ink: number;
  d: string;
}

/** Quanto sobra em volta dos pontos em cada jeito, em pontos: a borda da figurinha, o pano, a placa. */
export const LOOK_PAD: Readonly<Record<PixelLook, number>> = { pixel: 0, figurinha: 1, 'ponto-cruz': 0.8, micanga: 0.45 };

/** Um número do desenho com três casas, no máximo (os caminhos ficam curtos). */
export const n3 = (v: number) => Math.round(v * 1000) / 1000;

/**
 * Os pontos de cada cor num caminho só (até nove elementos, qualquer que seja a grade), no desenho do
 * jeito: os quadrados (no pixel e na figurinha, as sequências da fileira juntas num retângulo), o X
 * do ponto-cruz ou o anel da miçanga (a conta, com o furo no meio).
 */
export function inkPaths(rows: readonly string[], look: PixelLook): InkPath[] {
  const parts = new Map<number, string[]>();
  const add = (ink: number, d: string) => {
    const list = parts.get(ink);
    if (list) list.push(d);
    else parts.set(ink, [d]);
  };
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) {
      const ink = row.charCodeAt(x) - 48;
      if (ink <= 0 || ink > 9) continue;
      if (look === 'pixel' || look === 'figurinha') {
        let end = x;
        while (end + 1 < row.length && row.charCodeAt(end + 1) - 48 === ink) end++;
        add(ink, `M${x} ${y}h${end - x + 1}v1h${-(end - x + 1)}z`);
        x = end;
      } else if (look === 'ponto-cruz') {
        add(ink, `M${n3(x + 0.2)} ${n3(y + 0.2)}L${n3(x + 0.8)} ${n3(y + 0.8)}M${n3(x + 0.8)} ${n3(y + 0.2)}L${n3(x + 0.2)} ${n3(y + 0.8)}`);
      } else {
        add(ink, `M${n3(x + 0.21)} ${n3(y + 0.5)}a.29 .29 0 1 0 .58 0a.29 .29 0 1 0 -.58 0`);
      }
    }
  });
  return [...parts].sort(([a], [b]) => a - b).map(([ink, ds]) => ({ ink, d: ds.join('') }));
}


// ===== trazer de uma imagem =====

/** "#d8433b" → [216, 67, 59]. */
function rgbOf(hex: string): [number, number, number] {
  const h = normalHex(hex) ?? '#000000';
  return [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
}

/**
 * Os pontos de uma imagem já encolhida para `w` × `h` (os bytes RGBA dela, como o canvas dá): cada ponto
 * vira a cor mais perto entre as nove de agora (a distância "redmean", que pesa o vermelho e o azul como o
 * olho pesa), e o quase transparente (menos da metade) vira 0.
 */
export function quantize(data: ArrayLike<number>, w: number, h: number, inks: readonly (string | null)[]): string[] {
  const palette = inks.map((c, i) => (i > 0 && c ? { i, rgb: rgbOf(c) } : null)).filter((x): x is { i: number; rgb: [number, number, number] } => !!x);
  const rows: string[] = [];
  for (let y = 0; y < h; y++) {
    let row = '';
    for (let x = 0; x < w; x++) {
      const o = (y * w + x) * 4;
      if ((data[o + 3] ?? 0) < 128 || !palette.length) {
        row += '0';
        continue;
      }
      const [r, g, b] = [data[o], data[o + 1], data[o + 2]];
      let best = palette[0].i;
      let bestD = Infinity;
      for (const p of palette) {
        const rm = (r + p.rgb[0]) / 2;
        const dr = r - p.rgb[0];
        const dg = g - p.rgb[1];
        const db = b - p.rgb[2];
        const d = (2 + rm / 256) * dr * dr + 4 * dg * dg + (2 + (255 - rm) / 256) * db * db;
        if (d < bestD) {
          bestD = d;
          best = p.i;
        }
      }
      row += String(best);
    }
    rows.push(row);
  }
  return rows;
}

/** Onde a imagem de `iw` × `ih` cabe inteira na grade de `w` × `h`, no meio e sem deformar (em pontos). */
export function fitInGrid(iw: number, ih: number, w: number, h: number): { x: number; y: number; w: number; h: number } {
  const scale = Math.min(w / Math.max(1, iw), h / Math.max(1, ih));
  const fw = Math.max(1, Math.min(w, Math.round(iw * scale)));
  const fh = Math.max(1, Math.min(h, Math.round(ih * scale)));
  return { x: Math.floor((w - fw) / 2), y: Math.floor((h - fh) / 2), w: fw, h: fh };
}
