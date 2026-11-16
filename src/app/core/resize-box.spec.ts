import { resizeBox } from './resize-box';

describe('puxar uma alça (a conta do Quadro livre e do ateliê)', () => {
  const box = { x: 2, y: 2, w: 4, h: 2 };

  it('livre: cada lado anda sozinho, e o menor lado é o de quem usa', () => {
    expect(resizeBox(box, 'e', 3, 9, 'livre', { min: 1 })).toEqual({ x: 2, y: 2, w: 7, h: 2 });
    expect(resizeBox(box, 'nw', -1, -1, 'livre', { min: 1 })).toEqual({ x: 1, y: 1, w: 5, h: 3 });
    expect(resizeBox(box, 'w', 10, 0, 'livre', { min: 1 })).toEqual({ x: 5, y: 2, w: 1, h: 2 });
  });

  it('na proporção o desenho não deforma; o meio de um lado cresce para os dois lados', () => {
    expect(resizeBox(box, 'se', 4, 0, 'proporcao', { min: 1 })).toEqual({ x: 2, y: 2, w: 8, h: 4 });
    expect(resizeBox(box, 's', 0, 2, 'proporcao', { min: 1 })).toEqual({ x: 0, y: 2, w: 8, h: 4 });
  });

  it('o arredondamento é de quem usa (os furos do quadro)', () => {
    expect(resizeBox({ x: 0, y: 0, w: 100, h: 100 }, 'e', 13, 0, 'livre', { min: 52, round: (v) => Math.round(v / 20) * 20 })).toEqual({ x: 0, y: 0, w: 120, h: 100 });
  });
});
