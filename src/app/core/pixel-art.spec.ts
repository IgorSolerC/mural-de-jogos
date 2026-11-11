import { gridOf, inkOf, normalHex, parseColors, parseDims, readPixelArt, writeColors, writeGrid, writePixelArt } from './pixel-art';
import { parseWidgetLine, widgetDef, widgetLine, widgetSpoken } from './widgets';

/** A pixel art no texto (PLANO-PIXEL.md, seção 1): poucas letras, lidas em qualquer ordem, escritas sempre iguais. */
describe('pixel art: a marca no texto', () => {
  const heart = '0110011/11111111/11111111/0111111/001111/00011';

  it('lê a grade, os pontos, a paleta, as cores trocadas, o jeito e a legenda, em qualquer ordem', () => {
    const art = readPixelArt(['Coração', 'figurinha', '3#E43B44 7#35a', 'pastel', heart, '8x8']);
    expect(art.w).toBe(8);
    expect(art.h).toBe(8);
    expect(art.rows[0]).toBe('01100110');
    expect(art.rows[5]).toBe('00011000');
    expect(art.rows[6]).toBe('00000000');
    expect(art.palette).toBe('pastel');
    expect(art.colors).toEqual({ 3: '#e43b44', 7: '#3355aa' });
    expect(art.look).toBe('figurinha');
    expect(art.caption).toBe('Coração');
  });

  it('sem nada além dos pontos: a clássica, o pixel, e a grade tirada das fileiras', () => {
    const art = readPixelArt(['01/1111/1']);
    expect([art.w, art.h]).toEqual([4, 3]);
    expect(art.rows).toEqual(['0100', '1111', '1000']);
    expect(art.palette).toBe('classica');
    expect(art.look).toBe('pixel');
  });

  it('escreve na ordem da folha, sem os zeros do fim nem o que é o de sempre', () => {
    const art = readPixelArt(['8x8', heart]);
    expect(writePixelArt(art)).toEqual(['8x8', heart]);
    const full = readPixelArt(['8x8', heart, 'Coração', 'micanga', 'neon', '4#ff0000']);
    expect(writePixelArt(full)).toEqual(['8x8', heart, 'neon', '4#ff0000', 'micanga', 'Coração']);
  });

  it('a fileira vazia do meio fica (//), as do fim saem; o que passa da grade fica de fora', () => {
    expect(writeGrid(['0000', '0110', '0000', '1000', '0000'])).toBe('/011//1');
    expect(gridOf('111111/22', 3, 2)).toEqual(['111', '220']);
    expect(writeGrid(gridOf('111111/22', 3, 2))).toBe('111/22');
  });

  it('desenho sem ponto pintado não sai', () => {
    expect(writePixelArt(readPixelArt(['4x4', '0000/00']))).toBeNull();
    expect(writePixelArt(readPixelArt(['4x4']))).toBeNull();
  });

  it('a legenda com nome de paleta ou de jeito faz os dois irem escritos antes dela', () => {
    const art = { ...readPixelArt(['2x1', '11']), caption: 'Pastel' };
    const args = writePixelArt(art)!;
    expect(args).toEqual(['2x1', '11', 'classica', 'pixel', 'Pastel']);
    expect(readPixelArt(args).caption).toBe('Pastel');
    expect(readPixelArt(args).palette).toBe('classica');
    // uma legenda "2026" ou "8x8" continua legenda: a grade e os pontos vêm antes
    expect(readPixelArt(writePixelArt({ ...art, caption: '2026' })!).caption).toBe('2026');
    expect(readPixelArt(writePixelArt({ ...art, caption: '8x8' })!).caption).toBe('8x8');
    // e a com cara de cor trocada também: a do 1, como já é, ocupa o lugar das cores
    const odd = readPixelArt(writePixelArt({ ...art, caption: '3#fff' })!);
    expect(odd.caption).toBe('3#fff');
    expect(writeColors(odd.colors, odd.palette)).toBe('');
  });

  it('a grade vale de 1 a 32 de cada lado', () => {
    expect(parseDims('16x16')).toEqual({ w: 16, h: 16 });
    expect(parseDims('32×8')).toEqual({ w: 32, h: 8 });
    expect(parseDims('33x8')).toBeNull();
    expect(parseDims('0x8')).toBeNull();
  });

  it('as cores trocadas: só as diferentes da paleta, na ordem', () => {
    expect(parseColors('3#fff 1#000000')).toEqual({ 3: '#ffffff', 1: '#000000' });
    expect(parseColors('3#ffff')).toBeNull();
    expect(parseColors('0#ffffff')).toBeNull();
    expect(writeColors({ 7: '#3355aa', 1: '#1d1b22' }, 'classica')).toBe('7#3355aa');
    expect(normalHex('#AbC')).toBe('#aabbcc');
    const inks = inkOf('classica', { 4: '#00ff00' });
    expect(inks[0]).toBeNull();
    expect(inks[4]).toBe('#00ff00');
    expect(inks.length).toBe(10);
  });

  it('é um widget: a linha inteira, com o tamanho, ida e volta', () => {
    const line = widgetLine('pixel', ['8x8', heart, 'pastel', 'Coração'], 'pequeno');
    expect(line).toBe(`{{pixel: 8x8 | ${heart} | pastel | Coração | pequeno}}`);
    const w = parseWidgetLine(line)!;
    expect(w.name).toBe('pixel');
    expect(w.size).toBe('pequeno');
    const def = widgetDef('pixel-art')!;
    expect(def.write(def.read(w.args))).toEqual(w.args);
    expect(widgetSpoken('pixel', w.args)).toBe('Pixel art, Coração · 8 × 8 · Pastel');
    expect(def.copy(w.args, { now: 0 })).toBe('pixel art 8×8 | Coração');
    expect(def.plain(w.args)).toBe('Coração');
  });

  it('a folha: o que passa da grade continua nos valores, e só sai cortado na marca', () => {
    const def = widgetDef('pixel')!;
    const v = def.read(['2x2', '1111/1111/1111']);
    expect(v['pixels']).toBe('1111/1111/1111');
    expect(def.write(v)).toEqual(['2x2', '11/11']);
    expect(def.write({ ...v, width: '4', height: '3' })).toEqual(['4x3', '1111/1111/1111']);
    expect(def.write({ ...v, pixels: '' })).toBeNull();
    // a grade vazia (o campo apagado) é a de sempre, não 1 ponto
    expect(def.write({ ...v, width: '', height: '' })![0]).toBe('16x16');
  });
});
