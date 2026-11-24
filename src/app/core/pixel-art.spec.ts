import { BEAD_R, INK_MAX, PALETTES, PIXEL_LOOKS, VOXEL_VIEW, beadNeck, beadPath, beadPaths, compressRow, drawingInks, expandRow, gridOf, inkChar, inkCount, inkIndex, inkArea, inkOf, inkPaths, lookBox, normalHex, paintCells, paletteWord, parseColors, parseDims, pixelLookWord, readPixelArt, stitchArms, stitchFills, voxelBox, voxelFaces, voxelPoint, writeColors, writeGrid, writePixelArt } from './pixel-art';
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
    expect(expandRow('1*99'.repeat(50)).length).toBe(256);
  });

  it('a sequência de 100 ou mais vai em pedaços de 99, com dois algarismos (o site antigo lê igual)', () => {
    expect(compressRow('0'.repeat(250))).toBe('0*990*990*52');
    expect(compressRow('0'.repeat(102) + '1')).toBe('0*990001');
    expect(compressRow('a'.repeat(99))).toBe('a*99');
    for (const n of [99, 100, 103, 104, 198, 255]) expect(expandRow(compressRow('3'.repeat(n) + '1'))).toBe('3'.repeat(n) + '1');
  });

  it('uma grade de 256 × 256 vai ao texto e volta igual', () => {
    const chars = '0123456789abcdefghijklmnopqrstuvwxyzABCDEFGHIJKLMNOPQRSTUVWXYZ';
    let seed = 7;
    const rnd = () => (seed = (seed * 1103515245 + 12345) % 2147483648) / 2147483648;
    // pedaços de várias larguras (curtas e de mais de 99), como numa imagem trazida
    const rows = Array.from({ length: 256 }, () => {
      let r = '';
      while (r.length < 256) r += chars[Math.floor(rnd() * 62)].repeat(1 + Math.floor(rnd() * (rnd() < 0.1 ? 180 : 4)));
      return r.slice(0, 256);
    });
    const art = readPixelArt(writePixelArt({ ...readPixelArt(['256x256']), rows, caption: '' })!);
    expect([art.w, art.h]).toEqual([256, 256]);
    expect(art.rows).toEqual(rows);
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

  it('a grade vale de 1 a 256 de cada lado', () => {
    expect(parseDims('16x16')).toEqual({ w: 16, h: 16 });
    expect(parseDims('32×8')).toEqual({ w: 32, h: 8 });
    expect(parseDims('64x64')).toEqual({ w: 64, h: 64 });
    expect(parseDims('200x150')).toEqual({ w: 200, h: 150 });
    expect(parseDims('256x256')).toEqual({ w: 256, h: 256 });
    expect(parseDims('257x8')).toBeNull();
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

  it('os sete jeitos: cada um tem a palavra dele, e a legenda que é a palavra de um continua legenda', () => {
    expect(PIXEL_LOOKS.map((l) => l.value)).toEqual(['pixel', 'figurinha', 'ponto-cruz', 'micanga', 'voxel', 'blocos', 'lego']);
    for (const l of PIXEL_LOOKS) expect(pixelLookWord(l.value)).toBe(l.value);
    expect(pixelLookWord('Voxels')).toBe('voxel');
    expect(pixelLookWord('LEGO')).toBe('lego');
    expect(readPixelArt(['2x1', '12', 'lego']).look).toBe('lego');
    // a legenda "Blocos" vai depois do jeito escrito, e volta como legenda
    const named = writePixelArt({ ...readPixelArt(['2x1', '12']), caption: 'Blocos' })!;
    expect(named).toEqual(['2x1', '12', 'classica', 'pixel', 'Blocos']);
    expect(readPixelArt(named).caption).toBe('Blocos');
    expect(readPixelArt(named).look).toBe('pixel');
  });

  it('os caminhos de cada jeito: a conta com o furo, o X em duas pernas e a área de todos', () => {
    // a conta: o círculo e o furo, os dois no mesmo caminho; na diagonal, nenhuma ponte
    const beads = inkPaths(['10', '01'], 'micanga');
    expect(beads.length).toBe(1);
    expect(beads[0].d.match(/M/g)!.length).toBe(4);
    // o X: uma perna de baixo e uma de cima por ponto, separadas por cor
    const arms = stitchArms(['12']);
    expect(arms.back.map((p) => p.ink)).toEqual([1, 2]);
    expect(arms.front.map((p) => p.ink)).toEqual([1, 2]);
    expect(inkPaths(['12'], 'ponto-cruz')[0].d).toBe(arms.back[0].d + arms.front[0].d);
    // os blocos e o lego são os quadrados do pixel, com a luz por cima
    expect(inkPaths(['1120'], 'blocos')).toEqual(inkPaths(['1120'], 'pixel'));
    expect(inkPaths(['1120'], 'lego')).toEqual(inkPaths(['1120'], 'pixel'));
    // a área: todos os pontos juntos, qualquer cor
    expect(inkArea(['12a0', '0Z00'])).toBe('M0 0h3v1h-3zM1 1h1v1h-1z');
    expect(inkArea(['000'])).toBe('');
  });

  /** Se o ponto (x, y) cai dentro do caminho, pintado como o desenho pinta (nonzero). */
  function inside(d: string, x: number, y: number): boolean {
    const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
    const path = document.createElementNS('http://www.w3.org/2000/svg', 'path');
    path.setAttribute('d', d);
    svg.appendChild(path);
    document.body.appendChild(svg);
    const p = svg.createSVGPoint();
    p.x = x;
    p.y = y;
    const yes = path.isPointInFill(p);
    svg.remove();
    return yes;
  }

  it('a miçanga: as contas iguais vizinhas derretem uma na outra, e o fundo não aparece entre elas', () => {
    const one = beadPaths(['1'])[0].d;
    // a conta sozinha: redonda, furada (o furo no sentido contrário), sem ponte
    expect(one).toBe(beadPath(0, 0));
    expect(inside(one, 0.5, 0.5)).toBeFalse();
    expect(inside(one, 0.5, 0.2)).toBeTrue();
    expect(inside(one, 0.03, 0.03)).toBeFalse();
    // duas iguais lado a lado: a ponte no meio, com a cintura mais fina que a conta e longe dos furos
    const pair = beadPaths(['11'])[0].d;
    expect(inside(pair, 1, 0.5)).toBeTrue();
    expect(inside(pair, 1, 0.5 - 0.2)).toBeTrue();
    expect(inside(pair, 1, 0.5 - BEAD_R + 0.02)).toBeFalse();
    expect(inside(pair, 0.5, 0.5)).toBeFalse();
    expect(inside(pair, 1.5, 0.5)).toBeFalse();
    // e uma embaixo da outra
    expect(inside(beadPaths(['1', '1'])[0].d, 0.5, 1)).toBeTrue();
    // de cores diferentes, nenhuma ponte: o fundo aparece entre elas
    const two = beadPaths(['12']);
    expect(two.length).toBe(2);
    expect(two.some((p) => inside(p.d, 1, 0.5))).toBeFalse();
    // quatro iguais: o miolo tapa o vão do meio; os quatro furos continuam furados
    const four = beadPaths(['11', '11'])[0].d;
    expect(inside(four, 1, 1)).toBeTrue();
    expect(inside(four, 1.15, 0.85)).toBeTrue();
    for (const [x, y] of [[0.5, 0.5], [1.5, 0.5], [0.5, 1.5], [1.5, 1.5]]) expect(inside(four, x, y)).withContext(`furo ${x} ${y}`).toBeFalse();
    // três num L: as pontes, sem miolo para o lado do que falta (o canto não incha)
    const ell = beadPaths(['11', '10'])[0].d;
    expect(inside(ell, 1, 0.5)).toBeTrue();
    expect(inside(ell, 0.5, 1)).toBeTrue();
    expect(inside(ell, 1.1, 1.1)).toBeFalse();
    // na diagonal, cada uma redonda
    expect(inside(beadPaths(['10', '01'])[0].d, 1, 1)).toBeFalse();
    // a ponte sai tangente: os dois lados dela começam e acabam em cima da beirada das contas
    const neck = beadNeck(0.5, 0.5, 1.5, 0.5);
    for (const [x, y] of neck.match(/[ML]-?[\d.]+ -?[\d.]+/g)!.map((s) => s.slice(1).split(' ').map(Number))) {
      const r = Math.min(Math.hypot(x - 0.5, y - 0.5), Math.hypot(x - 1.5, y - 0.5));
      expect(Math.abs(r - BEAD_R)).toBeLessThan(0.002);
    }
  });

  it('o ponto-cruz: entre dois pontos iguais a linha tapa o pano; o ponto sozinho e o de outra cor mostram o pano', () => {
    expect(stitchFills(['1'])).toEqual([]);
    expect(stitchFills(['12'])).toEqual([]);
    expect(stitchFills(['10', '01'])).toEqual([]);
    // lado a lado: o losango entre os dois X, de um meio ao outro, sem chegar no furo de cima nem no de baixo
    const pair = stitchFills(['11'])[0].d;
    expect(inside(pair, 1, 0.5)).toBeTrue();
    expect(inside(pair, 0.75, 0.5)).toBeTrue();
    expect(inside(pair, 1, 0.03)).toBeFalse();
    expect(inside(pair, 1, 0.97)).toBeFalse();
    // um embaixo do outro
    expect(inside(stitchFills(['1', '1'])[0].d, 0.5, 1)).toBeTrue();
    // quatro iguais: até o furo do canto do meio some; as beiradas de fora continuam pano
    const four = stitchFills(['11', '11'])[0].d;
    expect(inside(four, 1, 1)).toBeTrue();
    expect(inside(four, 1.04, 0.96)).toBeTrue();
    expect(inside(four, 0.05, 1)).toBeFalse();
    // num L, o canto do que falta continua pano
    const ell = stitchFills(['11', '10'])[0].d;
    expect(inside(ell, 1.1, 1.1)).toBeFalse();
    // a cor de cada um: o losango é da cor dos dois
    expect(stitchFills(['22', '11']).map((p) => p.ink)).toEqual([1, 2]);
  });

  it('o voxel girado: a frente desce um tico para a direita, o fundo sobe e vai para a direita, e o quadro cabe tudo', () => {
    const [x1] = voxelPoint(1, 0, 0);
    const [, y1] = voxelPoint(1, 0, 0);
    expect(x1).toBeLessThan(1);
    expect(y1).toBeGreaterThan(0.1);
    const [dx, dy] = voxelPoint(0, 0, 1);
    expect(dx).toBeGreaterThan(0.4);
    expect(dy).toBeLessThan(-0.25);
    // com estes ângulos um lado nunca cobre o de outro cubinho: o fundo anda menos de um ponto até a frente
    expect(VOXEL_VIEW.dx / VOXEL_VIEW.ax).toBeLessThan(1);
    expect(-VOXEL_VIEW.dy / VOXEL_VIEW.by).toBeLessThan(1);
    // o quadro: todos os cantos do bloco dentro dele
    const box = voxelBox(16, 13);
    for (const x of [0, 16]) {
      for (const y of [0, 13]) {
        for (const d of [0, 1]) {
          const [px, py] = voxelPoint(x, y, d);
          expect(px).toBeGreaterThan(box.x);
          expect(px).toBeLessThan(box.x + box.w);
          expect(py).toBeGreaterThan(box.y);
          expect(py).toBeLessThan(box.y + box.h);
        }
      }
    }
    expect(lookBox('voxel', 16, 13)).toEqual(box);
    // os outros jeitos: a grade com a sobra
    expect(lookBox('ponto-cruz', 4, 3)).toEqual({ x: -0.8, y: -0.8, w: 5.6, h: 4.6 });
    expect(lookBox('pixel', 4, 3)).toEqual({ x: 0, y: 0, w: 4, h: 3 });
  });

  it('o voxel sem grade: cubinhos vizinhos da mesma cor são uma face só, na frente, no alto e no lado', () => {
    // três iguais numa fileira: uma frente, um alto e um lado, cada um um quadrilátero só
    const row = voxelFaces(['111']);
    expect(row.fronts.length).toBe(1);
    for (const f of [row.fronts, row.tops, row.rights]) expect(f[0].d.match(/M/g)!.length).withContext(f[0].d).toBe(1);
    expect(inside(row.fronts[0].d, ...voxelPoint(1, 0.5, 0))).toBeTrue();
    expect(row.fronts[0].d).toBe(inkPaths(['111'], 'voxel')[0].d);
    // uma coluna de três iguais: o lado direito de cima a baixo num quadrilátero só, o alto só no de cima
    const col = voxelFaces(['1', '1', '1']);
    expect(col.rights[0].d.match(/M/g)!.length).toBe(1);
    expect(col.tops[0].d.match(/M/g)!.length).toBe(1);
    expect(inside(col.rights[0].d, ...voxelPoint(1, 2.5, 0.5))).toBeTrue();
    // cores diferentes: faces separadas, cada uma da sua cor
    const two = voxelFaces(['12']);
    expect(two.fronts.map((p) => p.ink)).toEqual([1, 2]);
    expect(two.tops.map((p) => p.ink)).toEqual([1, 2]);
    // o lado direito do 1 fica escondido pelo 2; o alto do de baixo, pelo de cima
    expect(two.rights.map((p) => p.ink)).toEqual([2]);
    const stack = voxelFaces(['1', '2']);
    expect(stack.tops.map((p) => p.ink)).toEqual([1]);
    // o alto de uma fileira com um vizinho em cima no meio: dois pedaços, um de cada lado
    const notch = voxelFaces(['010', '111']);
    expect(notch.tops.map((p) => p.d.match(/M/g)!.length)).toEqual([3]);
    // o transparente não tem face
    expect(voxelFaces(['000'])).toEqual({ fronts: [], tops: [], rights: [] });
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
