import { barSpare } from './bar-on-ruling';

describe('A barra de rolar de lado na pauta (barSpare)', () => {
  it('sem barra (ou com a que flutua por cima), nada', () => {
    expect(barSpare(0, 29.6, 0)).toBe(0);
    expect(barSpare(0.2, 29.6, 0)).toBe(0);
    expect(barSpare(10, 0, 0)).toBe(0);
  });

  it('com a barra, o que falta para ela fechar uma linha inteira', () => {
    expect(barSpare(10, 29.6, 0)).toBeCloseTo(19.6, 2);
    expect(barSpare(10, 28.16, 0)).toBeCloseTo(18.16, 2);
    // a barra mais alta que a linha fecha duas
    expect(barSpare(40, 29.6, 0)).toBeCloseTo(19.2, 2);
  });

  it('com margem negativa embaixo (a sombra do papel da tabela), a sobra cobre também ela', () => {
    // 10 da barra + 8 da margem cabem numa linha: a sobra passa dos 8, e a barra não entra na linha de baixo
    expect(barSpare(10, 29.6, -8)).toBeCloseTo(19.6, 2);
    expect(barSpare(10, 29.6, -8)).toBeGreaterThanOrEqual(8);
    // 12 + 20 não cabem numa linha de 29,6: vão duas
    expect(barSpare(12, 29.6, -20)).toBeCloseTo(47.2, 2);
  });
});
