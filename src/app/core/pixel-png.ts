import { PixelArt, inkIndex, inkOf } from './pixel-art';
import { PixelPiece, pixelArtOf } from './pixel-gallery';
import { slugOf } from './text';

/**
 * A obra como imagem PNG (PLANO-PIXEL-ARTS.md, 3): cada ponto um quadrado inteiro de pixels, sem borrar, o
 * transparente transparente. O lado maior fica com pelo menos `PNG_MIN_SIDE` pixels (um 16 × 16 sai com 32 por
 * ponto), nunca com menos de um pixel por ponto. No tamanho original (PLANO-CAMADAS.md, rodada 7), um pixel por ponto: o
 * arquivo que se abre num editor de pixel art.
 */
export const PNG_MIN_SIDE = 512;

/** Quantos pixels por ponto: o bastante para o lado maior passar de `PNG_MIN_SIDE`. */
export function pngScale(w: number, h: number): number {
  return Math.max(1, Math.ceil(PNG_MIN_SIDE / Math.max(w, h)));
}

/**
 * O nome do arquivo: o título como pedaço de endereço ("Gato preto" → "gato-preto.png"); sem título, "pixel-art". No
 * tamanho original, o tamanho no nome ("gato-preto-16x16.png"), para não se confundir com o grande.
 */
export function pngName(p: Pick<PixelPiece, 'title'>, taken: ReadonlySet<string> = new Set(), size?: { w: number; h: number }): string {
  const base = (slugOf(p.title) || 'pixel-art') + (size ? `-${size.w}x${size.h}` : '');
  let name = `${base}.png`;
  for (let n = 2; taken.has(name); n++) name = `${base}-${n}.png`;
  return name;
}

/** O desenho num canvas, `scale` pixels por ponto. */
export function drawPixelArt(art: Pick<PixelArt, 'w' | 'h' | 'rows' | 'palette' | 'colors'>, scale: number): HTMLCanvasElement {
  const canvas = document.createElement('canvas');
  canvas.width = art.w * scale;
  canvas.height = art.h * scale;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const inks = inkOf(art.palette, art.colors);
  art.rows.forEach((row, y) => {
    for (let x = 0; x < art.w; x++) {
      const ch = row[x];
      if (!ch || ch === '0') continue;
      const color = inks[inkIndex(ch)];
      if (!color) continue;
      ctx.fillStyle = color;
      ctx.fillRect(x * scale, y * scale, scale, scale);
    }
  });
  return canvas;
}

/** A obra em PNG, grande (cada ponto um quadrado) ou no tamanho original (`original`); null: o navegador não conseguiu. */
export function pieceToPng(p: PixelPiece, original = false): Promise<Blob | null> {
  const art = pixelArtOf(p);
  const canvas = drawPixelArt(art, original ? 1 : pngScale(art.w, art.h));
  return new Promise((resolve) => canvas.toBlob((b) => resolve(b), 'image/png'));
}

/** Baixa o arquivo (o link de um clique só, solto do documento). */
export function downloadBlob(blob: Blob, name: string): void {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = name;
  a.click();
  // com folga: o navegador ainda lê o arquivo depois do clique
  setTimeout(() => URL.revokeObjectURL(url), 10_000);
}
