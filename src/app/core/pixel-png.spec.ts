import { PixelPiece } from './pixel-gallery';
import { pieceToPng, pngName, pngScale } from './pixel-png';

describe('a pixel art em PNG', () => {
  const piece: PixelPiece = { id: 'p', title: 'Gato preto', art: ['16x8', '1'], createdAt: '2026-11-16T10:00:00.000Z', at: '2026-11-16T10:00:00.000Z' };

  it('o grande passa de 512 px no lado maior; o original tem um pixel por ponto', async () => {
    expect(pngScale(16, 8)).toBe(32);
    const big = await createImageBitmap((await pieceToPng(piece))!);
    expect([big.width, big.height]).toEqual([512, 256]);
    const small = await createImageBitmap((await pieceToPng(piece, true))!);
    expect([small.width, small.height]).toEqual([16, 8]);
  });

  it('o nome diz o tamanho do original e não repete', () => {
    expect(pngName(piece)).toBe('gato-preto.png');
    expect(pngName(piece, new Set(), { w: 16, h: 8 })).toBe('gato-preto-16x8.png');
    expect(pngName(piece, new Set(['gato-preto-16x8.png']), { w: 16, h: 8 })).toBe('gato-preto-16x8-2.png');
  });
});
