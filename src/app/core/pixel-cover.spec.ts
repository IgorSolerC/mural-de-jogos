import { COVER_ART_BOX, COVER_H, COVER_W, coverScale, drawPixelCover, gridOf, isPixelCoverSize, opaqueBox, pixelCoverPng } from './pixel-cover';
import { MAX_BYTES, MAX_SIDE } from './images';
import { DEFAULT_PALETTE } from './pixel-art';

/** Um desenho de `w` × `h` com o canto de cima à esquerda pintado (a tinta 1) e o resto transparente. */
function art(w: number, h: number, fill = false) {
  const rows = Array.from({ length: h }, (_, y) => Array.from({ length: w }, (_, x) => (fill ? String(((x * 7 + y * 3) % 15) + 1).slice(-1) : x === 0 && y === 0 ? '1' : '0')).join(''));
  return { w, h, rows, palette: DEFAULT_PALETTE, colors: {} };
}

describe('a pixel art de capa, no papel milimetrado (core/pixel-cover.ts)', () => {
  it('cada ponto é um número inteiro de pixels, e o desenho cabe no quadrado do meio', () => {
    expect(coverScale(16, 16)).toBe(35);
    expect(coverScale(64, 32)).toBe(8);
    expect(coverScale(1, 1)).toBe(COVER_ART_BOX);
    for (const [w, h] of [[16, 16], [64, 64], [7, 50], [1, 1]]) expect(Math.max(w, h) * coverScale(w, h)).toBeLessThanOrEqual(COVER_ART_BOX);
  });

  it('o quadriculado casa com os pontos, fica perto de 16 px, e a linha grossa cai na borda do ponto dividido', () => {
    expect(gridOf(35)).toEqual({ pitch: 17.5, every: 2 });
    expect(gridOf(70)).toEqual({ pitch: 17.5, every: 4 });
    expect(gridOf(17)).toEqual({ pitch: 17, every: 5 });
    expect(gridOf(8)).toEqual({ pitch: 16, every: 5 });
    expect(gridOf(1)).toEqual({ pitch: 16, every: 5 });
    expect(gridOf(560).pitch).toBeCloseTo(16);
  });

  it('o retrato 4:5 com o desenho no meio, nítido (o ponto pintado tem a cor inteira até a borda)', () => {
    const canvas = drawPixelCover(art(16, 16));
    expect([canvas.width, canvas.height]).toEqual([COVER_W, COVER_H]);
    const cell = coverScale(16, 16);
    const x0 = Math.round((COVER_W - 16 * cell) / 2);
    const y0 = Math.round((COVER_H - 16 * cell) / 2);
    const ctx = canvas.getContext('2d')!;
    const inside = ctx.getImageData(x0 + cell - 1, y0 + cell - 1, 1, 1).data;
    const corner = ctx.getImageData(x0, y0, 1, 1).data;
    expect(Array.from(inside)).toEqual(Array.from(corner));
    // o ponto do lado é transparente no desenho: fica transparente, sem papel nem quadriculado (16/nov)
    expect(ctx.getImageData(x0 + cell + 3, y0 + 3, 1, 1).data[3]).toBe(0);
    expect(ctx.getImageData(2, 2, 1, 1).data[3]).toBe(0);
  });

  it('o PNG cabe no teto das imagens, também com o maior desenho, todo pintado', async () => {
    for (const a of [art(16, 16), art(64, 64, true)]) {
      const png = await pixelCoverPng(a);
      expect(png).not.toBeNull();
      expect(png!.blob.type).toBe('image/png');
      expect(png!.blob.size).toBeLessThanOrEqual(MAX_BYTES);
      expect(Math.max(png!.width, png!.height)).toBeLessThanOrEqual(MAX_SIDE);
    }
  });

  it('acha a caixa do desenho na capa (o que não é transparente); a imagem cheia ou vazia não tem o que tirar', () => {
    const canvas = drawPixelCover(art(20, 10, true));
    const cell = coverScale(20, 10);
    const box = opaqueBox(canvas.getContext('2d')!.getImageData(0, 0, COVER_W, COVER_H).data, COVER_W, COVER_H)!;
    expect(box).toEqual({ x: Math.round((COVER_W - 20 * cell) / 2), y: Math.round((COVER_H - 10 * cell) / 2), w: 20 * cell, h: 10 * cell, width: COVER_W, height: COVER_H });
    const full = new Uint8ClampedArray(4 * 4).fill(255);
    expect(opaqueBox(full, 2, 2)).toBeNull();
    expect(opaqueBox(new Uint8ClampedArray(4 * 4), 2, 2)).toBeNull();
  });

  it('o tamanho de uma capa de pixel art: 720 × 900, ou a metade', () => {
    expect(isPixelCoverSize(COVER_W, COVER_H)).toBeTrue();
    expect(isPixelCoverSize(360, 450)).toBeTrue();
    expect(isPixelCoverSize(600, 600)).toBeFalse();
    expect(isPixelCoverSize(720, 720)).toBeFalse();
  });
});
