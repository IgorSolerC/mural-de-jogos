import { describe, expect, it } from 'vitest';
import { HttpError } from '../src/errors';
import { MAX_IMAGE_BYTES, MAX_SIDE, checkImage, chunks, imageInfo } from '../src/domain/image';
import { gif, jpeg, png, svg, webp, webpLossless, webpLossy } from './imagens-amostras';

/** O reconhecimento pelos primeiros bytes (domain/image.ts): o tipo e o tamanho de verdade, sem decodificar. */
describe('imageInfo', () => {
  it('lê o tamanho do WebP (VP8X, VP8 e VP8L), do JPEG e do PNG', () => {
    expect(imageInfo(webp(900, 600))).toEqual({ tipo: 'image/webp', largura: 900, altura: 600 });
    expect(imageInfo(webpLossy(640, 480))).toEqual({ tipo: 'image/webp', largura: 640, altura: 480 });
    expect(imageInfo(webpLossless(333, 777))).toEqual({ tipo: 'image/webp', largura: 333, altura: 777 });
    expect(imageInfo(jpeg(800, 450))).toEqual({ tipo: 'image/jpeg', largura: 800, altura: 450 });
    expect(imageInfo(png(120, 900))).toEqual({ tipo: 'image/png', largura: 120, altura: 900 });
  });

  it('o JPEG com outros pedaços antes do tamanho (EXIF, tabelas, enchimento)', () => {
    expect(imageInfo(jpeg(700, 500, { extra: true }))).toEqual({ tipo: 'image/jpeg', largura: 700, altura: 500 });
  });

  it('o resto não é imagem: SVG, GIF, texto, cabeçalho cortado, tamanho zero', () => {
    expect(imageInfo(svg())).toBeNull();
    expect(imageInfo(gif())).toBeNull();
    expect(imageInfo(new TextEncoder().encode('<html><script>alert(1)</script></html>'))).toBeNull();
    expect(imageInfo(webp(900, 600).slice(0, 20))).toBeNull();
    expect(imageInfo(jpeg(800, 450).slice(0, 12))).toBeNull();
    expect(imageInfo(png(0, 10))).toBeNull();
    // o JPEG sem tamanho antes dos dados
    expect(imageInfo(Uint8Array.from([0xff, 0xd8, 0xff, 0xda, 0, 8, 1, 2, 3, 4, 5, 6, 7, 8]))).toBeNull();
  });
});

describe('checkImage', () => {
  const code = (bytes: Uint8Array) => {
    try {
      checkImage(bytes);
      return 'ok';
    } catch (e) {
      return e instanceof HttpError ? `${e.status} ${e.code}` : 'outro';
    }
  };

  it('aceita até 900 px no lado maior e até 200 KB', () => {
    expect(code(webp(MAX_SIDE, MAX_SIDE))).toBe('ok');
    expect(code(webp(MAX_SIDE, 10, MAX_IMAGE_BYTES))).toBe('ok');
  });

  it('recusa o que passa: o lado maior, o peso, o tipo e o vazio', () => {
    expect(code(webp(MAX_SIDE + 1, 10))).toBe('413 imagem-grande');
    expect(code(jpeg(10, 1600))).toBe('413 imagem-grande');
    expect(code(webp(100, 100, MAX_IMAGE_BYTES + 1))).toBe('413 imagem-grande');
    expect(code(svg())).toBe('415 imagem-tipo');
    expect(code(gif())).toBe('415 imagem-tipo');
    expect(code(new Uint8Array())).toBe('400 imagem-vazia');
  });
});

describe('chunks', () => {
  it('parte os ids em lotes (o D1 aceita até 100 parâmetros)', () => {
    expect(chunks([1, 2, 3, 4, 5], 2)).toEqual([[1, 2], [3, 4], [5]]);
    expect(chunks([], 2)).toEqual([]);
    expect(chunks(Array.from({ length: 200 }, (_, i) => i)).map((c) => c.length)).toEqual([90, 90, 20]);
  });
});
