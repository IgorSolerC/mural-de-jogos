import { PixelArt } from './pixel-art';
import { MAX_BYTES } from './images';
import { drawPixelArt } from './pixel-png';

/**
 * A pixel art como capa (PLANO-CAPAS.md): o desenho sozinho, o transparente transparente (desde 16/nov, sem o papel
 * milimetrado: o xadrez e o papel são só do ateliê), num retrato 4:5 como as capas. O desenho fica no meio, num quadrado que sobra
 * dentro dos cortes das capas (o 3:4 do seletor, o 1:1 do mural de músicas), com um número inteiro de pixels por
 * ponto: nada borra. O quadriculado começa no canto do desenho, então as linhas caem nas bordas dos pontos.
 */
export const COVER_W = 720;
export const COVER_H = 900;
/** O lado do quadrado do desenho (fora dele, só o papel). */
export const COVER_ART_BOX = 560;

/** O passo do quadriculado fino, mais ou menos (o grosso, a cada cinco). */
const PITCH = 16;

/** Quantos pixels por ponto: o maior inteiro com que o desenho cabe no quadrado. */
export function coverScale(w: number, h: number, box = COVER_ART_BOX): number {
  return Math.max(1, Math.floor(box / Math.max(w, h)));
}

/**
 * O quadriculado: o passo fica perto de `PITCH`, sempre casando com os pontos (um ponto grande tem várias linhas
 * dentro; pontos pequenos, uma linha a cada tantos), e a linha grossa vem a cada `every` passos: na borda de cada
 * ponto, quando o ponto é dividido; senão, a cada cinco, como no milimetrado.
 */
export function gridOf(cell: number): { pitch: number; every: number } {
  const parts = Math.round(cell / PITCH);
  if (parts >= 2) return { pitch: cell / parts, every: parts };
  return { pitch: cell * Math.max(1, Math.round(PITCH / cell)), every: 5 };
}

type Art = Pick<PixelArt, 'w' | 'h' | 'rows' | 'palette' | 'colors'>;

/** A capa num canvas: só o desenho no meio, o resto transparente (sem o papel milimetrado, pedido do dono em 16/nov). `k` encolhe tudo (1 = 720 × 900). */
export function drawPixelCover(art: Art, k = 1): HTMLCanvasElement {
  const width = Math.round(COVER_W * k);
  const height = Math.round(COVER_H * k);
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) return canvas;
  const cell = coverScale(art.w, art.h, Math.round(COVER_ART_BOX * k));
  const x0 = Math.round((width - art.w * cell) / 2);
  const y0 = Math.round((height - art.h * cell) / 2);
  ctx.imageSmoothingEnabled = false;
  ctx.drawImage(drawPixelArt(art, cell), x0, y0);
  return canvas;
}

/**
 * A capa em PNG (sem perda: o WebP borraria as bordas dos pontos), no tamanho de sempre; o desenho muito picado que
 * passasse do teto das imagens (200 KB) sai pela metade. Null: o navegador não montou a imagem.
 */
export async function pixelCoverPng(art: Art): Promise<{ blob: Blob; width: number; height: number } | null> {
  for (const k of [1, 0.5]) {
    const canvas = drawPixelCover(art, k);
    const blob = await new Promise<Blob | null>((resolve) => canvas.toBlob(resolve, 'image/png'));
    if (blob && blob.size <= MAX_BYTES) return { blob, width: canvas.width, height: canvas.height };
  }
  return null;
}

/** Onde o desenho está na capa, em pixels da imagem, e o tamanho dela. */
export interface ArtBox {
  x: number;
  y: number;
  w: number;
  h: number;
  width: number;
  height: number;
}

/**
 * A caixa do que não é transparente numa imagem (os pontos do desenho). Null: ela é toda transparente, ou o
 * desenho já vai de ponta a ponta (não há o que tirar).
 */
export function opaqueBox(data: Uint8ClampedArray, width: number, height: number): ArtBox | null {
  let top = height;
  let bottom = -1;
  let left = width;
  let right = -1;
  for (let y = 0; y < height; y++) {
    const row = y * width * 4;
    for (let x = 0; x < width; x++) {
      if (data[row + x * 4 + 3] === 0) continue;
      if (y < top) top = y;
      bottom = y;
      if (x < left) left = x;
      if (x > right) right = x;
    }
  }
  if (bottom < 0) return null;
  const box = { x: left, y: top, w: right - left + 1, h: bottom - top + 1, width, height };
  return box.w === width && box.h === height ? null : box;
}

/** É uma capa de pixel art (o PNG 4:5 de `pixelCoverPng`, inteiro ou pela metade)? */
export function isPixelCoverSize(width: number, height: number): boolean {
  return [1, 0.5].some((k) => width === Math.round(COVER_W * k) && height === Math.round(COVER_H * k));
}
