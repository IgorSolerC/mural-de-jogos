/**
 * As imagens coladas nas anotações (PLANO-IMAGENS.md): o endereço no texto e o encolher no aparelho.
 *
 * A imagem colada vira um widget de imagem com um endereço do próprio Murall, `murall://imagem/ID`, e
 * não com o da nuvem (que pode mudar de casa): quem mostra traduz na hora (ver core/image-store.ts). O
 * id nasce aqui, sorteado (16 bytes), então o texto nunca muda depois que a imagem sobe.
 *
 * Antes de guardar, a imagem é redesenhada num canvas com o lado maior em 900 px (nunca aumenta), em
 * WebP (o Safari não gera WebP no canvas: lá vai JPEG, com fundo branco no lugar da transparência). O
 * redesenho tira o EXIF inteiro, o GPS da foto também. A nuvem confere o mesmo nos bytes (api/
 * src/domain/image.ts): 900 px e 200 KB.
 */

/** O começo do endereço de uma imagem guardada pelo Murall. */
export const LOCAL_IMAGE = 'murall://imagem/';
/** O lado maior, em pixels (o mesmo que a nuvem confere). */
export const MAX_SIDE = 900;
/** Até aqui, a imagem está boa; passou, a qualidade desce. */
export const TARGET_BYTES = 120 * 1024;
/** O teto da nuvem: nada maior é guardado. */
export const MAX_BYTES = 200 * 1024;
/** O arquivo original maior que isto nem é aberto (uma foto de 40 MB travaria o celular). */
export const MAX_SOURCE_BYTES = 40 * 1024 * 1024;

const ID = /^[A-Za-z0-9_-]{22}$/;
const LOCAL = /^murall:\/\/imagem\/([A-Za-z0-9_-]{22})$/;

/** O id de uma imagem guardada pelo Murall, ou null (um link comum, ou nada). */
export function localImageId(url: string): string | null {
  return LOCAL.exec(url.trim())?.[1] ?? null;
}

/** Os ids das imagens do Murall num texto (o mural público em JSON, por exemplo), sem repetir. */
export function localImageIds(text: string): string[] {
  return [...new Set(Array.from(text.matchAll(/murall:\/\/imagem\/([A-Za-z0-9_-]{22})(?![A-Za-z0-9_-])/g), (m) => m[1]))];
}

export function localImageUrl(id: string): string {
  if (!ID.test(id)) throw new Error(`id de imagem inválido: ${id}`);
  return LOCAL_IMAGE + id;
}

/** Um id novo: 16 bytes sorteados, em base64url (22 letras). */
export function newImageId(): string {
  const bytes = crypto.getRandomValues(new Uint8Array(16));
  return btoa(String.fromCharCode(...bytes)).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

/** A impressão digital dos bytes (SHA-256 em hex): a mesma imagem colada duas vezes é guardada uma vez. */
export async function hashOf(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest('SHA-256', await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, '0')).join('');
}

/** O tamanho encolhido: o lado maior em `max`, na mesma proporção; o que já é menor fica como está. */
export function fitSize(width: number, height: number, max = MAX_SIDE): { width: number; height: number } {
  const big = Math.max(width, height);
  if (big <= max) return { width, height };
  const k = max / big;
  return { width: Math.max(1, Math.round(width * k)), height: Math.max(1, Math.round(height * k)) };
}

export interface ShrunkImage {
  blob: Blob;
  tipo: 'image/webp' | 'image/jpeg';
  largura: number;
  altura: number;
}

/** Por que a imagem não entrou, numa frase para a pessoa. */
export class ImageProblem extends Error {}

/** As tentativas, da melhor para a menor: a qualidade desce, depois o tamanho. */
const STEPS: readonly { side: number; quality: number }[] = [
  { side: MAX_SIDE, quality: 0.8 },
  { side: MAX_SIDE, quality: 0.7 },
  { side: MAX_SIDE, quality: 0.6 },
  { side: 720, quality: 0.6 },
  { side: 560, quality: 0.55 },
];

/**
 * Encolhe a imagem colada (qualquer formato que o navegador abra): 900 px no lado maior, WebP (ou JPEG
 * no Safari), até 120 KB se der, nunca mais de 200 KB. `encode` só muda nos testes.
 */
export async function shrinkImage(file: Blob, encode: Encoder = canvasEncode): Promise<ShrunkImage> {
  if (file.size > MAX_SOURCE_BYTES) throw new ImageProblem('Essa imagem é grande demais para abrir aqui (mais de 40 MB).');
  if (file.type && !file.type.startsWith('image/')) throw new ImageProblem('Isso não é uma imagem.');
  let bitmap: ImageBitmap;
  try {
    // a orientação da foto (o EXIF do celular) é aplicada aqui; depois o redesenho a tira
    bitmap = await createImageBitmap(file, { imageOrientation: 'from-image' });
  } catch {
    throw new ImageProblem('Essa imagem não abre aqui. Salve como JPG ou PNG e tente de novo.');
  }
  try {
    let best: ShrunkImage | null = null;
    for (const step of STEPS) {
      const size = fitSize(bitmap.width, bitmap.height, step.side);
      const out = await encode(bitmap, size.width, size.height, step.quality);
      if (!best || out.blob.size < best.blob.size) best = out;
      if (out.blob.size <= TARGET_BYTES) return out;
    }
    if (best && best.blob.size <= MAX_BYTES) return best;
    throw new ImageProblem('Essa imagem não coube nem bem pequena. Tente outra.');
  } finally {
    bitmap.close();
  }
}

export type Encoder = (source: CanvasImageSource, width: number, height: number, quality: number) => Promise<ShrunkImage>;

/** O canvas do navegador: WebP onde ele sabe gerar; senão (Safari), JPEG com fundo branco. */
export const canvasEncode: Encoder = async (source, width, height, quality) => {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  if (!ctx) throw new ImageProblem('O navegador não deixou preparar a imagem.');
  ctx.imageSmoothingQuality = 'high';
  ctx.drawImage(source, 0, 0, width, height);
  const webp = await toBlob(canvas, 'image/webp', quality);
  if (webp?.type === 'image/webp') return { blob: webp, tipo: 'image/webp', largura: width, altura: height };
  // sem WebP: a transparência vira o branco do papel (o JPEG não tem transparência)
  ctx.globalCompositeOperation = 'destination-over';
  ctx.fillStyle = '#fff';
  ctx.fillRect(0, 0, width, height);
  const jpeg = await toBlob(canvas, 'image/jpeg', quality);
  if (!jpeg) throw new ImageProblem('O navegador não deixou preparar a imagem.');
  return { blob: jpeg, tipo: 'image/jpeg', largura: width, altura: height };
};

function toBlob(canvas: HTMLCanvasElement, type: string, quality: number): Promise<Blob | null> {
  return new Promise((resolve) => canvas.toBlob(resolve, type, quality));
}

/** A imagem de um colar ou de um soltar (a primeira; o resto fica de fora), ou null. */
export function imageFileOf(data: DataTransfer | null | undefined): File | null {
  if (!data) return null;
  for (const file of Array.from(data.files ?? [])) if (file.type.startsWith('image/')) return file;
  for (const item of Array.from(data.items ?? [])) {
    if (item.kind === 'file' && item.type.startsWith('image/')) {
      const file = item.getAsFile();
      if (file) return file;
    }
  }
  return null;
}

/** "52 KB", "1,2 MB": o tamanho para a pessoa. */
export function sizeLabel(bytes: number): string {
  if (bytes < 1024 * 1024) return `${Math.max(1, Math.round(bytes / 1024))} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1).replace('.', ',')} MB`;
}
