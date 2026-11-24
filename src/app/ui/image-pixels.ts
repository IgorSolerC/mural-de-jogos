import { MAX_SOURCE_BYTES } from '../core/images';
import { Rgba } from '../core/pixel-import';

/**
 * O lado maior que se lê pixel por pixel (4096², 64 MB, é o que um celular aguenta); a maior vem já encolhida até ele
 * (uma foto: nenhuma pixel art ampliada é tão grande, e a obra para em 256 de qualquer jeito).
 */
export const READ_SIDE_MAX = 4096;

/** Por que a imagem não abriu: grande demais (o arquivo ou o lado) ou não é uma imagem que o navegador lê. */
export type ImageReadProblem = 'grande' | 'nao-abre';

export class ImageReadError extends Error {
  constructor(readonly problem: ImageReadProblem) {
    super(problem);
  }
}

/**
 * Os pixels de uma imagem do computador, um por um (RGBA), no tamanho dela: o canvas desenha a imagem inteira sem
 * borrar nada. A GIF animada dá o primeiro quadro.
 */
export async function readImagePixels(file: Blob): Promise<Rgba> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImageReadError('grande');
  let bitmap: ImageBitmap;
  try {
    bitmap = await createImageBitmap(file);
    if (bitmap.width > READ_SIDE_MAX || bitmap.height > READ_SIDE_MAX) {
      const k = READ_SIDE_MAX / Math.max(bitmap.width, bitmap.height);
      const big = bitmap;
      bitmap = await createImageBitmap(big, { resizeWidth: Math.max(1, Math.round(big.width * k)), resizeHeight: Math.max(1, Math.round(big.height * k)), resizeQuality: 'high' });
      big.close();
    }
  } catch {
    throw new ImageReadError('nao-abre');
  }
  try {
    const { width: w, height: h } = bitmap;
    if (!w || !h) throw new ImageReadError('nao-abre');
    const canvas = document.createElement('canvas');
    canvas.width = w;
    canvas.height = h;
    const ctx = canvas.getContext('2d', { willReadFrequently: true });
    if (!ctx) throw new ImageReadError('nao-abre');
    ctx.imageSmoothingEnabled = false;
    ctx.drawImage(bitmap, 0, 0);
    return { data: ctx.getImageData(0, 0, w, h).data, w, h };
  } finally {
    bitmap.close();
  }
}

/** As imagens de um soltar (ou do seletor de arquivos), na ordem; o que não é imagem fica de fora. */
export function imageFilesOf(list: FileList | readonly File[] | null | undefined): File[] {
  return Array.from(list ?? []).filter((f) => f.type.startsWith('image/'));
}

/** O soltar traz arquivos (do computador), e não um texto ou uma obra da própria página. */
export function carriesFiles(data: DataTransfer | null | undefined): boolean {
  return !!data && Array.from(data.types ?? []).includes('Files');
}
