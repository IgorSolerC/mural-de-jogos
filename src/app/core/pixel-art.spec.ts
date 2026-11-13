import { INK_MAX, PALETTES, compressRow, drawingInks, expandRow, gridOf, inkChar, inkCount, inkIndex, inkOf, inkPaths, normalHex, paintCells, paletteWord, parseColors, parseDims, readPixelArt, writeColors, writeGrid, writePixelArt } from './pixel-art';
import { parseWidgetLine, widgetDef, widgetLine, widgetSpoken } from './widgets';

/** A pixel art no texto (PLANO-PIXEL.md, seção 1): poucas letras, lidas em qualquer ordem, escritas sempre iguais. */
describe('pixel art: a marca no texto', () => {
  const heart = '0110011/11111111/11111111/0111111/001111/00011';
  /** O mesmo coração como a folha escreve: as fileiras de oito 1 abreviadas. */
  const short = '0110011/1*08/1*08/01*06/001111/00011';

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
    expect(writePixelArt(art)).toEqual(['8x8', short]);
    const full = readPixelArt(['8x8', heart, 'Coração', 'micanga', 'neon', '4#ff0000']);
    expect(writePixelArt(full)).toEqual(['8x8', short, 'neon', '4#ff0000', 'micanga', 'Coração']);
  });

  it('a fileira vazia do meio fica (//), as do fim saem; o que passa da grade fica de fora', () => {
    expect(writeGrid(['0000', '0110', '0000', '1000', '0000'])).toBe('/011//1');
    expect(gridOf('111111/22', 3, 2)).toEqual(['111', '220']);
    expect(writeGrid(gridOf('111111/22', 3, 2))).toBe('111/22');
  });

  it('o widget novo, sem nada escrito, abre na grade de sempre', () => {
    const art = readPixelArt([]);
    expect([art.w, art.h]).toEqual([16, 16]);
  });

  it('cinco ou mais pontos iguais seguidos vão abreviados, com a quantidade sempre em dois algarismos', () => {
    expect(compressRow('0000000011')).toBe('0*0811');
    expect(compressRow('00001')).toBe('00001');
    expect(compressRow('1'.repeat(32))).toBe('1*32');
    expect(expandRow('0*0811')).toBe('0000000011');
    // os dois algarismos acabam com a dúvida: "0*051" são cinco 0 e um 1
    expect(expandRow('0*051')).toBe('000001');
    // escrito à mão com um algarismo só, no fim da fileira, também vale
    expect(expandRow('3*5')).toBe('33333');
    // nunca passa do tamanho máximo da grade (uma fileira enorme escrita à mão não pesa)
    expect(expandRow('1*99'.repeat(50)).length).toBe(64);
  });

  it('a linha sem abreviação, de antes, continua valendo; e a abreviada é lida igual', () => {
    expect(readPixelArt(['8x8', heart]).rows).toEqual(readPixelArt(['8x8', short]).rows);
    // sem a grade escrita, ela sai das fileiras por extenso
    const art = readPixelArt(['0*12/1']);
    expect([art.w, art.h]).toEqual([12, 2]);
  });

  it('uma fileira de 16 com uma faixa no meio cabe em bem menos letras', () => {
    const rows = ['0000011111100000', '0000000000000000', '0000033333300000'];
    expect(writeGrid(rows)).toBe('0*051*06//0*053*06');
    expect(gridOf(writeGrid(rows), 16, 3)).toEqual(rows);
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

  it('a grade vale de 1 a 64 de cada lado', () => {
    expect(parseDims('16x16')).toEqual({ w: 16, h: 16 });
    expect(parseDims('32×8')).toEqual({ w: 32, h: 8 });
    expect(parseDims('64x64')).toEqual({ w: 64, h: 64 });
    expect(parseDims('65x8')).toBeNull();
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
    // as nove da paleta e, até a 61, as da reserva (um ponto escrito à mão além dela não some)
    expect(inks.length).toBe(62);
    expect(drawingInks('classica', { 4: '#00ff00' }).length).toBe(10);
  });

  it('é um widget: a linha inteira, com o tamanho, ida e volta', () => {
    const line = widgetLine('pixel', ['8x8', short, 'pastel', 'Coração'], 'pequeno');
    expect(line).toBe(`{{pixel: 8x8 | ${short} | pastel | Coração | pequeno}}`);
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

  // ===== 61 cores (PLANO-ATELIE.md, seção 1) =====

  it('os caracteres das cores: 0–9, a–z (10–35), A–Z (36–61), ida e volta', () => {
    expect([inkChar(0), inkChar(9), inkChar(10), inkChar(35), inkChar(36), inkChar(61)]).toEqual(['0', '9', 'a', 'z', 'A', 'Z']);
    for (let n = 0; n <= INK_MAX; n++) expect(inkIndex(inkChar(n))).toBe(n);
    expect(inkIndex('*')).toBe(-1);
    expect(inkIndex('ç')).toBe(-1);
  });

  it('pontos com letras logo depois da grade: lidos, abreviados e escritos de volta iguais', () => {
    const art = readPixelArt(['6x2', 'a*06/0zAZ9', 'Gato']);
    expect(art.rows).toEqual(['aaaaaa', '0zAZ90']);
    expect(art.caption).toBe('Gato');
    expect(writePixelArt(art)).toEqual(['6x2', 'a*06/0zAZ9', 'Gato']);
    expect(compressRow('bbbbbbbbbbbbc')).toBe('b*12c');
    expect(expandRow('Z*03a')).toBe('ZZZa');
  });

  it('uma palavra sem algarismo, "/" nem "*" depois da grade continua legenda; e a de paleta, paleta', () => {
    expect(readPixelArt(['8x8', 'Gato']).caption).toBe('Gato');
    expect(readPixelArt(['8x8', 'Gato']).raw).toBe('');
    expect(readPixelArt(['8x8', 'pico8', '0110']).palette).toBe('pico8');
    expect(readPixelArt(['8x8', 'pico8', '0110']).rows[0]).toBe('01100000');
    // longe da grade, só algarismos são pontos (como antes): "Mario64" é legenda
    expect(readPixelArt(['8x8', '0110', 'Mario64']).caption).toBe('Mario64');
  });

  it('um desenho só de letras numa fileira, ou com cara de palavra, sai com um "/" que não muda nada', () => {
    const one = writePixelArt({ ...readPixelArt(['3x1', '111']), rows: ['abc'] })!;
    expect(one[1]).toBe('abc/');
    expect(readPixelArt(one).rows).toEqual(['abc']);
    const word = writePixelArt({ ...readPixelArt(['3x1', '111']), rows: ['c64'] })!;
    expect(word[1]).toBe('c64/');
    expect(readPixelArt(word).rows).toEqual(['c64']);
    expect(readPixelArt(word).palette).toBe('classica');
  });

  it('as cores trocadas e acrescentadas com letras; a paleta de 16 com a "h" acrescentada tem 17', () => {
    expect(parseColors('c#ff0000 Z#00f')).toEqual({ 12: '#ff0000', 61: '#0000ff' });
    expect(writeColors({ 61: '#0000ff', 12: '#ff0000', 3: '#8a8791' }, 'classica')).toBe('c#ff0000 Z#0000ff');
    expect(inkCount('pico8', {})).toBe(16);
    expect(inkCount('pico8', { 17: '#123456' })).toBe(17);
    const inks = drawingInks('pico8', { 17: '#123456' });
    expect(inks.length).toBe(18);
    expect(inks[17]).toBe('#123456');
  });

  it('a paleta própria: nenhuma cor de base, todas escritas', () => {
    expect(inkCount('propria', {})).toBe(0);
    const art = readPixelArt(['2x1', '12', 'propria', '1#101010 2#202020']);
    expect(art.palette).toBe('propria');
    expect(drawingInks(art.palette, art.colors)).toEqual([null, '#101010', '#202020']);
    expect(writePixelArt(art)).toEqual(['2x1', '12', 'propria', '1#101010 2#202020']);
  });

  it('uma cor no meio sem cor nenhuma (escrita à mão) pega a da reserva, a Completa, e nunca some', () => {
    const completa = PALETTES.find((p) => p.value === 'completa')!.colors;
    expect(completa.length).toBe(INK_MAX);
    expect(new Set(completa).size).toBe(INK_MAX);
    // as nove primeiras são as da Clássica: trocar uma pela outra não muda o desenho
    expect(completa.slice(0, 9)).toEqual(PALETTES[0].colors);
    const inks = drawingInks('propria', { 3: '#333333' });
    expect(inks[1]).toBe(completa[0]);
    expect(inkOf('gameboy', {})[40]).toBe(completa[39]);
  });

  it('as paletas: até 61 cores cada, cores que valem, palavras que se leem de volta', () => {
    for (const p of PALETTES) {
      expect(p.colors.length).toBeLessThanOrEqual(INK_MAX);
      for (const c of p.colors) expect(normalHex(c)).toBe(c);
      expect(paletteWord(p.value)).toBe(p.value);
    }
    expect(paletteWord('PICO-8')).toBe('pico8');
    expect(paletteWord('Própria')).toBe('propria');
  });

  it('pintar, o balde e os caminhos do desenho valem para as letras', () => {
    expect(paintCells(['000'], [{ x: 1, y: 0 }], 37)).toEqual(['0B0']);
    const paths = inkPaths(['aab', '0Z0'], 'pixel');
    expect(paths.map((p) => p.ink)).toEqual([10, 11, 61]);
    expect(paths[0].d).toBe('M0 0h2v1h-2z');
  });

  it('as linhas antigas, só de algarismos, leem e se escrevem exatamente como antes', () => {
    // (como a folha escreve desde a abreviação, de 11/nov)
    const old = [
      ['8x8', '0110011/14411441/14*061/14*061/0144441/001441/00011', 'Coração'],
      ['8x8', '0110011/14411441/14*061/14*061/0144441/001441/00011', 'pastel', 'figurinha'],
      ['8x8', '0110011/14411441/14*061/14*061/0144441/001441/00011', '4#c2185b', 'ponto-cruz', 'Bordado da vó'],
      ['12x6', '00001111/000177771/0017*061/01*10/001288882/0001111', 'mar', 'micanga'],
      ['32x32', '/1*32/2*0533', 'neon', '9#123456', 'Fileiras'],
    ];
    for (const args of old) expect(writePixelArt(readPixelArt(args))).toEqual(args);
    // e as de antes da abreviação leem os mesmos pontos
    const before = readPixelArt(['8x8', '0110011/14411441/14444441/14444441/0144441/001441/00011']);
    expect(before.rows).toEqual(readPixelArt(old[0]).rows);
  });
});
