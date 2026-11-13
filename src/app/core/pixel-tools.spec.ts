import { brushCells, fitZoom, mirrored, perfectCorner, replaceInk, resizeCanvas, stampCells, stepZoom, zoomLabel } from './pixel-tools';

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
