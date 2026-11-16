import { PixelArt } from './pixel-art';
import { MAX_BYTES } from './images';
import { drawPixelArt } from './pixel-png';

/**
 * A pixel art como capa (PLANO-CAPAS.md): impressa no papel milimetrado, o jeito Pixel da galeria (o papel creme com
 * o quadriculado verde da Mostra), num retrato 4:5 como as capas. O desenho fica no meio, num quadrado que sobra
 * dentro dos cortes das capas (o 3:4 do seletor, o 1:1 do mural de músicas), com um número inteiro de pixels por
 * ponto: nada borra. O quadriculado começa no canto do desenho, então as linhas caem nas bordas dos pontos.
 */
export const COVER_W = 720;
export const COVER_H = 900;
/** O lado do quadrado do desenho (fora dele, só o papel). */
export const COVER_ART_BOX = 560;

const PAPER = '#f7f4ea';
const FINE = 'rgb(60 140 120 / 0.13)';
const BOLD = 'rgb(60 140 120 / 0.3)';
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

/** A capa num canvas: o papel, o quadriculado e o desenho no meio. `k` encolhe tudo (1 = 720 × 900). */
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
  ctx.fillStyle = PAPER;
  ctx.fillRect(0, 0, width, height);
  const { pitch, every } = gridOf(cell);
  // as linhas, a partir do canto do desenho para os dois lados, com a grossa a cada `every`
  const lines = (from: number, size: number, draw: (at: number, bold: boolean) => void) => {
    const first = Math.ceil(-from / pitch);
    for (let i = first; from + i * pitch < size; i++) draw(Math.round(from + i * pitch), i % every === 0);
  };
  lines(x0, width, (at, bold) => {
    ctx.fillStyle = bold ? BOLD : FINE;
    ctx.fillRect(at, 0, 1, height);
  });
  lines(y0, height, (at, bold) => {
    ctx.fillStyle = bold ? BOLD : FINE;
    ctx.fillRect(0, at, width, 1);
  });
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
