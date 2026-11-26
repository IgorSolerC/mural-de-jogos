import { SketchItem, SketchModel } from './sketch-model';

/**
 * O assado da miniatura do canvas (PLANO-MINIATURA-CANVAS.md, rodada 2): o mesmo desenho do SVG (`SketchModel`, no
 * modo rico), pintado num canvas 2D com o que o SVG não tem: a foto de verdade nas peças de imagem, o pó do giz nas
 * setas e a trama do feltro nas molduras. Pintar o mesmo modelo garante que o assado cai em cima do SVG sem pular.
 */

type Ctx = CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D;

/** As letras que o assado usa (espera que estejam prontas antes de medir e pintar). */
export const SKETCH_FONTS = ['700 9px Kalam', '800 9px "Barlow Condensed"'];

/** A caixa do mundo (`x y w h`) no canvas de `w` × `h` px, como o `preserveAspectRatio="xMidYMid meet"` do SVG. */
export function fitBox(box: string, w: number, h: number): { s: number; ox: number; oy: number } {
  const [bx, by, bw, bh] = box.split(' ').map(Number);
  const s = Math.min(w / bw, h / bh);
  return { s, ox: (w - bw * s) / 2 - bx * s, oy: (h - bh * s) / 2 - by * s };
}

/**
 * Pinta o desenho num canvas de `w` × `h` px de CSS, com `dpr` pixels por px. As fotos vêm prontas (o id da imagem
 * guardada para o bitmap dela); a que falta fica com o escuro da peça.
 */
export function paintSketch(ctx: Ctx, model: SketchModel, w: number, h: number, dpr: number, photos: ReadonlyMap<string, ImageBitmap>): void {
  const { s, ox, oy } = fitBox(model.box, w, h);
  const base = new DOMMatrix([dpr * s, 0, 0, dpr * s, dpr * ox, dpr * oy]);
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  ctx.setTransform(base);
  paintItems(ctx, model.items, base, dpr * s, photos);
}

/**
 * Pinta os itens com a transformação `base` (do mundo para o canvas, `k` pixels do canvas por unidade do mundo): o
 * assado da miniatura e a camada de longe do editor.
 */
export function paintItems(ctx: Ctx, items: readonly SketchItem[], base: DOMMatrix, k: number, photos: ReadonlyMap<string, ImageBitmap>): void {
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  for (const it of items) {
    ctx.save();
    ctx.globalAlpha = 'op' in it && it.op !== undefined ? it.op : 1;
    paintItem(ctx, it, base, k, photos);
    ctx.restore();
  }
}

function paintItem(ctx: Ctx, it: SketchItem, base: DOMMatrix, k: number, photos: ReadonlyMap<string, ImageBitmap>): void {
  switch (it.t) {
    case 'r': {
      ctx.beginPath();
      ctx.roundRect(it.x, it.y, it.w, it.h, it.rx);
      if (it.fill !== 'none') {
        ctx.fillStyle = it.fill;
        ctx.fill();
        if (it.role === 'feltro') felt(ctx, it, k);
      }
      if (it.stroke) {
        ctx.strokeStyle = it.stroke;
        ctx.lineWidth = it.sw ?? 1;
        if (it.dash) ctx.setLineDash(it.dash.split(' ').map(Number));
        ctx.stroke();
      }
      return;
    }
    case 'p': {
      if (it.tr) ctx.setTransform(base.multiply(transformOf(it.tr)));
      const path = new Path2D(it.d);
      if (it.fill !== 'none') {
        ctx.fillStyle = it.fill;
        ctx.fill(path);
      }
      if (it.stroke) {
        // o giz: o pó que não pegou, num ladrilho de pixels da tela (o mesmo da camada de longe do editor)
        const pattern = it.role === 'giz' ? chalkPattern(ctx, it.stroke) : null;
        pattern?.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
        ctx.strokeStyle = pattern ?? it.stroke;
        ctx.lineWidth = it.sw ?? 1;
        ctx.stroke(path);
      }
      return;
    }
    case 't': {
      ctx.fillStyle = it.fill;
      ctx.font = it.font === 'dymo' ? `800 ${it.size}px "Barlow Condensed", "Arial Narrow", sans-serif` : `700 ${it.size}px Kalam, cursive`;
      if ('letterSpacing' in ctx && it.font === 'dymo') ctx.letterSpacing = `${it.size * 0.1}px`;
      ctx.textAlign = it.anchor === 'middle' ? 'center' : 'left';
      ctx.textBaseline = 'alphabetic';
      ctx.fillText(it.txt, it.x, it.y);
      return;
    }
    case 'i': {
      const bmp = photos.get(it.id);
      if (!bmp) return;
      // a foto cobre a peça (como o object-fit: cover da peça), cortada nos cantos
      ctx.beginPath();
      ctx.roundRect(it.x, it.y, it.w, it.h, it.rx);
      ctx.clip();
      const scale = Math.max(it.w / bmp.width, it.h / bmp.height);
      const dw = bmp.width * scale;
      const dh = bmp.height * scale;
      ctx.drawImage(bmp, it.x + (it.w - dw) / 2, it.y + (it.h - dh) / 2, dw, dh);
      return;
    }
  }
}

/** A trama do feltro: pontinhos claros de 5 px da tela, como o `.feltro` da peça. */
function felt(ctx: Ctx, r: Extract<SketchItem, { t: 'r' }>, k: number): void {
  const step = 5 / k;
  const dot = 0.9 / k;
  ctx.save();
  ctx.clip();
  ctx.fillStyle = 'rgb(255 255 255 / 0.05)';
  ctx.beginPath();
  for (let y = r.y + step / 2; y < r.y + r.h; y += step) for (let x = r.x + step / 2; x < r.x + r.w; x += step) ctx.rect(x, y, dot, dot);
  ctx.fill();
  // a luz que vem de cima
  const g = ctx.createLinearGradient(0, r.y, 0, r.y + Math.min(r.h, 120 / k));
  g.addColorStop(0, 'rgb(255 250 235 / 0.06)');
  g.addColorStop(1, 'rgb(255 250 235 / 0)');
  ctx.fillStyle = g;
  ctx.fillRect(r.x, r.y, r.w, r.h);
  ctx.restore();
}

/** O `translate(a b) scale(s)` do desenho da pixel art. */
function transformOf(tr: string): DOMMatrix {
  const m = /translate\(([-\d.e]+) ([-\d.e]+)\) scale\(([-\d.e]+)\)/.exec(tr);
  if (!m) return new DOMMatrix();
  const [x, y, s] = m.slice(1).map(Number);
  return new DOMMatrix([s, 0, 0, s, x, y]);
}

/** O pó de giz de uma cor: um ladrilho de 64 px com cada pixel de uma força, e uns furos onde o giz não pegou. */
const patterns = new WeakMap<CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, Map<string, CanvasPattern | null>>();
export function chalkPattern(ctx: CanvasRenderingContext2D | OffscreenCanvasRenderingContext2D, color: string): CanvasPattern | null {
  let mine = patterns.get(ctx);
  if (!mine) patterns.set(ctx, (mine = new Map()));
  if (mine.has(color)) return mine.get(color)!;
  const size = 64;
  const tile = new OffscreenCanvas(size, size);
  const t = tile.getContext('2d');
  let pattern: CanvasPattern | null = null;
  if (t) {
    t.fillStyle = color;
    t.fillRect(0, 0, size, size);
    const img = t.getImageData(0, 0, size, size);
    let seed = 7;
    for (let i = 3; i < img.data.length; i += 4) {
      seed = (seed * 1664525 + 1013904223) >>> 0;
      const r = seed / 2 ** 32;
      img.data[i] = Math.round(255 * (r < 0.14 ? 0.12 : 0.5 + r * 0.42));
    }
    t.putImageData(img, 0, 0);
    pattern = ctx.createPattern(tile, 'repeat');
  }
  mine.set(color, pattern);
  return pattern;
}
