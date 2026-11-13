import { combineMask, composite, emptyMask, flipMask, flipRows, invertMask, lift, maskAny, maskBounds, maskOutline, outline, placedMask, rectMask, rotateMask, rotateRows, wandMask } from './pixel-selection';

/** A seleção do ateliê (PLANO-ATELIE.md, feature 4): as máscaras, o pedaço solto, virar, girar e o contorno. */
describe('pixel art: a seleção', () => {
  const bits = (m: { w: number; h: number; bits: Uint8Array }) => Array.from({ length: m.h }, (_, y) => Array.from(m.bits.slice(y * m.w, y * m.w + m.w)).join(''));

  it('a caixa para qualquer lado, cortada na tela; somar, tirar e inverter', () => {
    const a = rectMask(4, 3, { x: 2, y: 1 }, { x: 0, y: 0 });
    expect(bits(a)).toEqual(['1110', '1110', '0000']);
    expect(bits(rectMask(3, 2, { x: 1, y: 1 }, { x: 9, y: 9 }))).toEqual(['000', '011']);
    const b = rectMask(4, 3, { x: 2, y: 1 }, { x: 3, y: 2 });
    expect(bits(combineMask(a, b, 'somar'))).toEqual(['1110', '1111', '0011']);
    expect(bits(combineMask(a, b, 'tirar'))).toEqual(['1110', '1100', '0000']);
    expect(bits(combineMask(a, b, 'trocar'))).toEqual(bits(b));
    expect(bits(invertMask(a))).toEqual(['0001', '0001', '1111']);
    expect(maskAny(emptyMask(2, 2))).toBeFalse();
    expect(maskBounds(b)).toEqual({ x: 2, y: 1, w: 2, h: 2 });
  });

  it('a varinha pega a mancha pelos lados, ou a cor inteira', () => {
    const rows = ['1100', '0101', '1100'];
    expect(bits(wandMask(rows, 4, 3, { x: 0, y: 0 }, true))).toEqual(['1100', '0100', '1100']);
    expect(bits(wandMask(rows, 4, 3, { x: 0, y: 0 }, false))).toEqual(['1100', '0101', '1100']);
  });

  it('as formigas: só os lados de fora', () => {
    expect(maskOutline(rectMask(2, 1, { x: 0, y: 0 }, { x: 0, y: 0 }))).toBe('M0 0h1M0 1h1M0 0v1M1 0v1');
  });

  it('soltar o pedaço deixa o buraco (ou não, copiando); pôr de volta não cobre com o transparente', () => {
    const rows = ['1200', '3400'];
    const m = rectMask(4, 2, { x: 0, y: 0 }, { x: 1, y: 1 });
    const cut = lift(rows, m, false)!;
    expect(cut.base).toEqual(['0000', '0000']);
    expect(cut.float.rows).toEqual(['12', '34']);
    expect(lift(rows, m, true)!.base).toEqual(rows);
    const moved = { ...cut.float, x: 2, y: 0 };
    expect(composite(cut.base, moved)).toEqual(['0012', '0034']);
    // o pedaço com transparente não apaga o que está embaixo, e o que sai da tela some
    expect(composite(['9999'], { x: 3, y: 0, rows: ['10'], mask: rectMask(2, 1, { x: 0, y: 0 }, { x: 1, y: 0 }) })).toEqual(['9991']);
    expect(bits(placedMask(moved, 4, 2))).toEqual(['0011', '0011']);
  });

  it('virar e girar as fileiras e as máscaras', () => {
    expect(flipRows(['12', '34'], 'h')).toEqual(['21', '43']);
    expect(flipRows(['12', '34'], 'v')).toEqual(['34', '12']);
    expect(rotateRows(['123', '456'], 'cw')).toEqual(['41', '52', '63']);
    expect(rotateRows(['123', '456'], 'ccw')).toEqual(['36', '25', '14']);
    expect(rotateRows(['123', '456'], '180')).toEqual(['654', '321']);
    const m = rectMask(3, 2, { x: 0, y: 0 }, { x: 0, y: 1 });
    expect(bits(rotateMask(m, 'cw'))).toEqual(['11', '00', '00']);
    expect(bits(flipMask(m, 'h'))).toEqual(['001', '001']);
  });

  it('o contorno em volta do que é pintado, só no transparente e dentro da seleção', () => {
    expect(outline(['000', '010', '000'], 3, 3, 4, null)).toEqual(['040', '414', '040']);
    expect(outline(['000', '010', '000'], 3, 3, 4, rectMask(3, 3, { x: 0, y: 0 }, { x: 2, y: 0 }))).toEqual(['040', '010', '000']);
  });
});
