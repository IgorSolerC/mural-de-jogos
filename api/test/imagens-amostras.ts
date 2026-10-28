/**
 * Imagens de mentira para os testes: só o cabeçalho de cada formato (o que a nuvem lê), com o resto em
 * zeros até o tamanho pedido. A nuvem não decodifica a imagem, então isto basta.
 */

const ascii = (text: string) => [...text].map((c) => c.charCodeAt(0));
const le16 = (n: number) => [n & 0xff, (n >> 8) & 0xff];
const le24 = (n: number) => [n & 0xff, (n >> 8) & 0xff, (n >> 16) & 0xff];
const be16 = (n: number) => [(n >> 8) & 0xff, n & 0xff];
const be32 = (n: number) => [(n >>> 24) & 0xff, (n >> 16) & 0xff, (n >> 8) & 0xff, n & 0xff];

function padded(head: number[], size: number, fill = 0): Uint8Array<ArrayBuffer> {
  const out = new Uint8Array(Math.max(size, head.length));
  out.set(head);
  // o resto muda com `fill`, para duas imagens do mesmo tamanho serem diferentes
  for (let i = head.length; i < out.length; i++) out[i] = (i * 31 + fill) & 0xff;
  return out;
}

/** WebP estendido (VP8X), o que o canvas do Chrome gera com transparência. */
export function webp(largura: number, altura: number, size = 2_000, fill = 0): Uint8Array<ArrayBuffer> {
  return padded([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8X'), 10, 0, 0, 0, 0, 0, 0, 0, ...le24(largura - 1), ...le24(altura - 1)], size, fill);
}

/** WebP com perdas simples (VP8). */
export function webpLossy(largura: number, altura: number): Uint8Array<ArrayBuffer> {
  return padded([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8 '), 0, 0, 0, 0, 0, 0, 0, 0x9d, 0x01, 0x2a, ...le16(largura), ...le16(altura)], 1_000);
}

/** WebP sem perdas (VP8L): 14 bits de largura-1 e 14 de altura-1, lidos por bits. */
export function webpLossless(largura: number, altura: number): Uint8Array<ArrayBuffer> {
  const w = largura - 1;
  const h = altura - 1;
  const bits = w | (h << 14);
  return padded([...ascii('RIFF'), 0, 0, 0, 0, ...ascii('WEBP'), ...ascii('VP8L'), 0, 0, 0, 0, 0x2f, bits & 0xff, (bits >> 8) & 0xff, (bits >> 16) & 0xff, (bits >> 24) & 0xff], 1_000);
}

/** JPEG: o APP0 e, com `extra`, um EXIF e enchimento antes do SOF0. */
export function jpeg(largura: number, altura: number, o: { extra?: boolean; size?: number } = {}): Uint8Array<ArrayBuffer> {
  const app0 = [0xff, 0xe0, ...be16(16), ...ascii('JFIF'), 0, 1, 1, 0, 0, 1, 0, 1, 0, 0];
  const exif = o.extra ? [0xff, 0xe1, ...be16(10), ...ascii('Exif'), 0, 0, 1, 2, 0xff, 0xff, 0xff, 0xdb, ...be16(4), 0, 0] : [];
  const sof = [0xff, 0xc0, ...be16(17), 8, ...be16(altura), ...be16(largura), 3, 1, 0x22, 0, 2, 0x11, 1, 3, 0x11, 1];
  return padded([0xff, 0xd8, ...app0, ...exif, ...sof, 0xff, 0xda, 0, 8], o.size ?? 3_000);
}

export function png(largura: number, altura: number): Uint8Array<ArrayBuffer> {
  return padded([0x89, ...ascii('PNG\r\n\x1a\n'), 0, 0, 0, 13, ...ascii('IHDR'), ...be32(largura), ...be32(altura), 8, 6, 0, 0, 0], 1_500);
}

export function gif(): Uint8Array<ArrayBuffer> {
  return padded([...ascii('GIF89a'), ...le16(100), ...le16(100)], 500);
}

export function svg(): Uint8Array<ArrayBuffer> {
  return new TextEncoder().encode('<svg xmlns="http://www.w3.org/2000/svg" onload="alert(1)"><rect width="10" height="10"/></svg>') as Uint8Array<ArrayBuffer>;
}
