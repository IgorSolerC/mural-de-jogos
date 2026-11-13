import { brushCells, ellipseCells, fitZoom, mirrored, perfectCorner, rectCells, replaceInk, resizeCanvas, shapeBox, snapLine, stampCells, stepZoom, zoomLabel } from './pixel-tools';

/** As contas das ferramentas do ateliê (PLANO-ATELIE.md, seção 3). */
describe('pixel art: as ferramentas do ateliê', () => {
  const key = (cs: { x: number; y: number }[]) => cs.map((c) => `${c.x},${c.y}`).sort();

  it('o pincel: 1 é o ponto; o par tem o meio em cima à esquerda; o redondo tira os cantos', () => {
    expect(brushCells({ x: 3, y: 3 }, 1, 'quadrado')).toEqual([{ x: 3, y: 3 }]);
    expect(key(brushCells({ x: 3, y: 3 }, 2, 'quadrado'))).toEqual(key([{ x: 3, y: 3 }, { x: 4, y: 3 }, { x: 3, y: 4 }, { x: 4, y: 4 }]));
    expect(brushCells({ x: 5, y: 5 }, 3, 'quadrado').length).toBe(9);
    const round = brushCells({ x: 5, y: 5 }, 4, 'redondo');
    expect(round.length).toBe(12);
    expect(key(round)).not.toContain('4,4');
    // o redondo de 2 é o quadrado (não sobra nada dele)
    expect(brushCells({ x: 0, y: 0 }, 2, 'redondo').length).toBe(4);
  });

  it('o carimbo ao longo do caminho não repete pontos', () => {
    const cells = stampCells([{ x: 0, y: 0 }, { x: 1, y: 0 }], 2, 'quadrado');
    expect(cells.length).toBe(6);
  });

  it('o pixel perfeito tira o canto do L, e só dele', () => {
    expect(perfectCorner([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 1, y: 1 }])).toEqual({ x: 1, y: 0 });
    expect(perfectCorner([{ x: 0, y: 0 }, { x: 1, y: 0 }, { x: 2, y: 0 }])).toBeNull();
    expect(perfectCorner([{ x: 0, y: 0 }, { x: 1, y: 1 }])).toBeNull();
  });

  it('a simetria pinta o outro lado do eixo, sem repetir o ponto do meio', () => {
    expect(key(mirrored([{ x: 0, y: 0 }], 'lado', 4, 4))).toEqual(['0,0', '3,0']);
    expect(key(mirrored([{ x: 0, y: 0 }], 'cima', 4, 4))).toEqual(['0,0', '0,3']);
    expect(mirrored([{ x: 1, y: 1 }], 'ambas', 3, 3)).toEqual([{ x: 1, y: 1 }]);
    expect(mirrored([{ x: 0, y: 0 }], 'ambas', 4, 4).length).toBe(4);
  });

  it('o balde da cor inteira troca a cor em qualquer lugar da grade', () => {
    expect(replaceInk(['1001', '0110'], { x: 0, y: 0 }, 11, 4, 2)).toEqual(['b00b', '0bb0']);
    expect(replaceInk(['11'], { x: 0, y: 0 }, 1, 2, 1)).toEqual(['11']);
  });

  it('o tamanho da tela: cresce com transparente em volta e corta do lado de lá da âncora', () => {
    const rows = ['12', '34'];
    expect(resizeCanvas(rows, 2, 2, 4, 3, { x: 0, y: 0 })).toEqual(['1200', '3400', '0000']);
    expect(resizeCanvas(rows, 2, 2, 4, 4, { x: 1, y: 1 })).toEqual(['0000', '0120', '0340', '0000']);
    expect(resizeCanvas(rows, 2, 2, 3, 2, { x: 2, y: 0 })).toEqual(['012', '034']);
    expect(resizeCanvas(rows, 2, 2, 1, 1, { x: 2, y: 2 })).toEqual(['4']);
    expect(resizeCanvas(rows, 2, 2, 99, 1, { x: 0, y: 0 })[0].length).toBe(64);
  });

  it('o zoom anda pelos níveis, cabe na tela e se diz em porcento', () => {
    expect(stepZoom(8, 1)).toBe(12);
    expect(stepZoom(8, -1)).toBe(6);
    expect(stepZoom(64, 1)).toBe(64);
    expect(stepZoom(1, -1)).toBe(1);
    expect(fitZoom(16, 16, 800, 600)).toBe(24);
    expect(fitZoom(64, 64, 300, 300)).toBe(3);
    expect(zoomLabel(8)).toBe('800%');
  });
});

/** As formas do ateliê (PLANO-ATELIE.md, feature 3). */
describe('pixel art: as formas', () => {
  const grid = (cells: { x: number; y: number }[], w: number, h: number) => {
    const rows = Array.from({ length: h }, () => [...'0'.repeat(w)]);
    for (const c of cells) if (rows[c.y]?.[c.x] !== undefined) rows[c.y][c.x] = '1';
    return rows.map((r) => r.join(''));
  };

  it('a caixa: para qualquer lado, quadrada com o Shift e a partir do meio com o Ctrl', () => {
    expect(shapeBox({ x: 5, y: 5 }, { x: 2, y: 7 }, false, false)).toEqual({ x0: 2, y0: 5, x1: 5, y1: 7 });
    expect(shapeBox({ x: 0, y: 0 }, { x: 4, y: 2 }, true, false)).toEqual({ x0: 0, y0: 0, x1: 4, y1: 4 });
    expect(shapeBox({ x: 5, y: 5 }, { x: 7, y: 6 }, false, true)).toEqual({ x0: 3, y0: 4, x1: 7, y1: 6 });
  });

  it('a reta com o Shift fica deitada, em pé ou a 45°', () => {
    expect(snapLine({ x: 0, y: 0 }, { x: 9, y: 2 })).toEqual({ x: 9, y: 0 });
    expect(snapLine({ x: 0, y: 0 }, { x: 1, y: 8 })).toEqual({ x: 0, y: 8 });
    expect(snapLine({ x: 0, y: 0 }, { x: 5, y: -4 })).toEqual({ x: 5, y: -5 });
  });

  it('o retângulo: a beirada ou cheio', () => {
    expect(grid(rectCells(0, 0, 3, 2, false), 4, 3)).toEqual(['1111', '1001', '1111']);
    expect(grid(rectCells(1, 0, 2, 1, true), 4, 2)).toEqual(['0110', '0110']);
  });

  it('a elipse: o círculo de 5 sem quinas e sem ponto dobrado; cheia de ponta a ponta', () => {
    expect(grid(ellipseCells(0, 0, 4, 4, false), 5, 5)).toEqual(['01110', '10001', '10001', '10001', '01110']);
    expect(grid(ellipseCells(0, 0, 4, 4, true), 5, 5)).toEqual(['01110', '11111', '11111', '11111', '01110']);
    const ring = ellipseCells(0, 0, 9, 5, false);
    expect(new Set(ring.map((c) => `${c.x},${c.y}`)).size).toBe(ring.length);
    // a elipse de um ponto e a reta fina (1 de altura) também saem
    expect(grid(ellipseCells(2, 0, 2, 0, false), 5, 1)).toEqual(['00100']);
    expect(grid(ellipseCells(0, 0, 4, 0, true), 5, 1)).toEqual(['11111']);
  });
});
