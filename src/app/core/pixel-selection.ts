import { Cell, inkChar } from './pixel-art';

/**
 * A seleção do ateliê da pixel art (ui/pixel-studio/, PLANO-ATELIE.md, feature 4), como contas puras: a
 * máscara dos pontos escolhidos (um byte por ponto da tela, 1 escolhido), o pedaço que flutua quando a
 * seleção se move ou é colada, virar e girar (o pedaço ou a tela inteira) e o contorno. As fileiras são as
 * de sempre (`string[]`, um caractere de cor por ponto, '0' o transparente).
 */

/** A máscara: `w` × `h` bytes, 1 nos pontos escolhidos. */
export interface Mask {
  w: number;
  h: number;
  bits: Uint8Array;
}

/** A máscara vazia (nada escolhido). */
export function emptyMask(w: number, h: number): Mask {
  return { w, h, bits: new Uint8Array(w * h) };
}

/** A máscara com a caixa de `a` até `b` escolhida (para qualquer lado, cortada na tela). */
export function rectMask(w: number, h: number, a: Cell, b: Cell): Mask {
  const m = emptyMask(w, h);
  const x0 = Math.max(0, Math.min(a.x, b.x));
  const x1 = Math.min(w - 1, Math.max(a.x, b.x));
  const y0 = Math.max(0, Math.min(a.y, b.y));
  const y1 = Math.min(h - 1, Math.max(a.y, b.y));
  for (let y = y0; y <= y1; y++) for (let x = x0; x <= x1; x++) m.bits[y * w + x] = 1;
  return m;
}

/** A varinha: a mancha da cor de `at` (pelos lados), ou, sem `contiguous`, essa cor em toda a tela. */
export function wandMask(rows: readonly string[], w: number, h: number, at: Cell, contiguous: boolean): Mask {
  const m = emptyMask(w, h);
  const from = rows[at.y]?.[at.x];
  if (from === undefined || at.x >= w) return m;
  if (!contiguous) {
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (rows[y][x] === from) m.bits[y * w + x] = 1;
    return m;
  }
  const stack: Cell[] = [at];
  while (stack.length) {
    const { x, y } = stack.pop()!;
    if (x < 0 || y < 0 || x >= w || y >= h || m.bits[y * w + x] || rows[y][x] !== from) continue;
    m.bits[y * w + x] = 1;
    stack.push({ x: x + 1, y }, { x: x - 1, y }, { x, y: y + 1 }, { x, y: y - 1 });
  }
  return m;
}

/** Juntar duas máscaras: trocar (a nova), somar (Shift) ou tirar (Shift+Alt). */
export function combineMask(base: Mask | null, add: Mask, mode: 'trocar' | 'somar' | 'tirar'): Mask {
  if (mode === 'trocar' || !base || base.w !== add.w || base.h !== add.h) return mode === 'tirar' ? emptyMask(add.w, add.h) : add;
  const out = emptyMask(add.w, add.h);
  for (let i = 0; i < out.bits.length; i++) out.bits[i] = mode === 'somar' ? base.bits[i] | add.bits[i] : base.bits[i] & (add.bits[i] ^ 1);
  return out;
}

/** Tudo o que não estava escolhido (Ctrl+Shift+I). */
export function invertMask(m: Mask): Mask {
  const out = emptyMask(m.w, m.h);
  for (let i = 0; i < out.bits.length; i++) out.bits[i] = m.bits[i] ^ 1;
  return out;
}

/** A máscara tem algum ponto? */
export function maskAny(m: Mask | null): m is Mask {
  return !!m && m.bits.some((b) => b === 1);
}

/** A caixa dos pontos escolhidos; null, nenhum. */
export function maskBounds(m: Mask): { x: number; y: number; w: number; h: number } | null {
  let x0 = m.w;
  let y0 = m.h;
  let x1 = -1;
  let y1 = -1;
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!m.bits[y * m.w + x]) continue;
      if (x < x0) x0 = x;
      if (x > x1) x1 = x;
      if (y < y0) y0 = y;
      if (y > y1) y1 = y;
    }
  }
  return x1 < 0 ? null : { x: x0, y: y0, w: x1 - x0 + 1, h: y1 - y0 + 1 };
}

/**
 * A beirada dos pontos escolhidos como caminho de SVG (só os lados entre um escolhido e um não escolhido),
 * deslocada por `dx`, `dy`: as formigas da seleção.
 */
export function maskOutline(m: Mask, dx = 0, dy = 0): string {
  const at = (x: number, y: number) => x >= 0 && y >= 0 && x < m.w && y < m.h && m.bits[y * m.w + x] === 1;
  let d = '';
  for (let y = 0; y < m.h; y++) {
    for (let x = 0; x < m.w; x++) {
      if (!at(x, y)) continue;
      const X = x + dx;
      const Y = y + dy;
      if (!at(x, y - 1)) d += `M${X} ${Y}h1`;
      if (!at(x, y + 1)) d += `M${X} ${Y + 1}h1`;
      if (!at(x - 1, y)) d += `M${X} ${Y}v1`;
      if (!at(x + 1, y)) d += `M${X + 1} ${Y}v1`;
    }
  }
  return d;
}

// ===== o pedaço que flutua =====

/** O pedaço solto da tela: os pontos dele (a caixa, '0' fora da máscara), onde está e a máscara dele. */
export interface Float {
  x: number;
  y: number;
  rows: string[];
  mask: Mask;
}

/** Tira da tela o que a máscara escolhe: o pedaço solto e a tela com o buraco (ou sem, `copy`). */
export function lift(rows: readonly string[], m: Mask, copy: boolean): { base: string[]; float: Float } | null {
  const b = maskBounds(m);
  if (!b) return null;
  const local = emptyMask(b.w, b.h);
  const piece: string[] = [];
  for (let y = 0; y < b.h; y++) {
    let line = '';
    for (let x = 0; x < b.w; x++) {
      const on = m.bits[(b.y + y) * m.w + b.x + x] === 1;
      local.bits[y * b.w + x] = on ? 1 : 0;
      line += on ? (rows[b.y + y]?.[b.x + x] ?? '0') : '0';
    }
    piece.push(line);
  }
  const base = copy ? [...rows] : rows.map((r, y) => [...r].map((ch, x) => (m.bits[y * m.w + x] === 1 ? '0' : ch)).join(''));
  return { base, float: { x: b.x, y: b.y, rows: piece, mask: local } };
}

/** A tela com o pedaço por cima (o transparente do pedaço deixa ver a de baixo; o que sai da tela some). */
export function composite(base: readonly string[], f: Float): string[] {
  const out = base.map((r) => [...r]);
  f.rows.forEach((line, y) => {
    const row = out[f.y + y];
    if (!row) return;
    for (let x = 0; x < line.length; x++) {
      const tx = f.x + x;
      if (tx < 0 || tx >= row.length || line[x] === '0') continue;
      row[tx] = line[x];
    }
  });
  return out.map((r) => r.join(''));
}

/** A máscara do pedaço no lugar dele, na tela de `w` × `h` (as formigas e a seleção depois de soltar). */
export function placedMask(f: Float, w: number, h: number): Mask {
  const m = emptyMask(w, h);
  for (let y = 0; y < f.mask.h; y++) {
    for (let x = 0; x < f.mask.w; x++) {
      const tx = f.x + x;
      const ty = f.y + y;
      if (f.mask.bits[y * f.mask.w + x] && tx >= 0 && ty >= 0 && tx < w && ty < h) m.bits[ty * w + tx] = 1;
    }
  }
  return m;
}

// ===== virar e girar =====

/** Fileiras viradas de lado (`h`) ou de cabeça para baixo (`v`). */
export function flipRows(rows: readonly string[], dir: 'h' | 'v'): string[] {
  return dir === 'h' ? rows.map((r) => [...r].reverse().join('')) : [...rows].reverse();
}

/** A máscara virada como as fileiras. */
export function flipMask(m: Mask, dir: 'h' | 'v'): Mask {
  const out = emptyMask(m.w, m.h);
  for (let y = 0; y < m.h; y++) for (let x = 0; x < m.w; x++) out.bits[y * m.w + x] = dir === 'h' ? m.bits[y * m.w + (m.w - 1 - x)] : m.bits[(m.h - 1 - y) * m.w + x];
  return out;
}

/** Fileiras giradas: 90° para a direita (`cw`), para a esquerda (`ccw`) ou 180°; a largura troca com a altura nos de 90°. */
export function rotateRows(rows: readonly string[], dir: 'cw' | 'ccw' | '180'): string[] {
  const h = rows.length;
  const w = rows[0]?.length ?? 0;
  if (dir === '180') return [...rows].reverse().map((r) => [...r].reverse().join(''));
  const out: string[] = [];
  for (let y = 0; y < w; y++) {
    let line = '';
    for (let x = 0; x < h; x++) line += dir === 'cw' ? rows[h - 1 - x][y] : rows[x][w - 1 - y];
    out.push(line);
  }
  return out;
}

/** A máscara girada como as fileiras. */
export function rotateMask(m: Mask, dir: 'cw' | 'ccw' | '180'): Mask {
  const rows: string[] = [];
  for (let y = 0; y < m.h; y++) {
    let line = '';
    for (let x = 0; x < m.w; x++) line += m.bits[y * m.w + x] ? '1' : '0';
    rows.push(line);
  }
  const r = rotateRows(rows, dir);
  const out = emptyMask(r[0]?.length ?? 0, r.length);
  r.forEach((line, y) => {
    for (let x = 0; x < line.length; x++) out.bits[y * out.w + x] = line[x] === '1' ? 1 : 0;
  });
  return out;
}

// ===== o contorno =====

/**
 * O contorno (Shift+O do Aseprite): os pontos transparentes encostados (pelos lados) num ponto pintado viram
 * `ink`. Com a máscara, só dentro dela.
 */
export function outline(rows: readonly string[], w: number, h: number, ink: number, m: Mask | null): string[] {
  const ch = inkChar(ink);
  const filled = (x: number, y: number) => x >= 0 && y >= 0 && x < w && y < h && rows[y][x] !== '0';
  return rows.map((r, y) =>
    [...r]
      .map((c, x) => {
        if (x >= w || c !== '0' || (m && !m.bits[y * w + x])) return c;
        return filled(x - 1, y) || filled(x + 1, y) || filled(x, y - 1) || filled(x, y + 1) ? ch : c;
      })
      .join(''),
  );
}
