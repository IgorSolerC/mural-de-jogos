import { vizinha } from './quadro';

/** Uma etiqueta de 200 por 46 na coluna `c` (220px cada) e na linha `l` (50px cada), deslocada `dy` para cima ou para baixo. */
const etiqueta = (nome: string, c: number, l: number, dy = 0) => ({ el: nome, r: new DOMRect(c * 220, l * 50 + dy, 200, 46) });

describe('a etiqueta vizinha no quadro (as setas)', () => {
  // três pastas: a do meio rolada 20px, e a terceira mais curta
  const todas = [etiqueta('a0', 0, 0), etiqueta('a1', 0, 1), etiqueta('a2', 0, 2), etiqueta('b0', 1, 0, -20), etiqueta('b1', 1, 1, -20), etiqueta('b2', 1, 2, -20), etiqueta('b3', 1, 3, -20), etiqueta('c0', 2, 0)];
  const de = (nome: string) => todas.find((e) => e.el === nome)!.r;
  const sem = (nome: string) => todas.filter((e) => e.el !== nome);

  it('para cima e para baixo, a mais perto na mesma pasta; na ponta, nenhuma', () => {
    expect(vizinha(de('a1'), 'baixo', sem('a1'))).toBe('a2');
    expect(vizinha(de('a1'), 'cima', sem('a1'))).toBe('a0');
    expect(vizinha(de('a2'), 'baixo', sem('a2'))).toBeNull();
    expect(vizinha(de('a0'), 'cima', sem('a0'))).toBeNull();
  });

  it('para os lados, a pasta vizinha (nunca a de depois dela), na etiqueta mais perto da mesma altura', () => {
    expect(vizinha(de('a1'), 'direita', sem('a1'))).toBe('b1');
    expect(vizinha(de('a2'), 'direita', sem('a2'))).toBe('b2');
    // a pasta seguinte é mais curta: vai para a última dela
    expect(vizinha(de('b3'), 'direita', sem('b3'))).toBe('c0');
    expect(vizinha(de('b3'), 'esquerda', sem('b3'))).toBe('a2');
    expect(vizinha(de('c0'), 'direita', sem('c0'))).toBeNull();
    expect(vizinha(de('a0'), 'esquerda', sem('a0'))).toBeNull();
  });

  it('na grade da pasta sozinha, anda como se vê: o lado é a mesma linha, embaixo é a mesma coluna', () => {
    const grade = [etiqueta('1', 0, 0), etiqueta('2', 1, 0), etiqueta('3', 0, 1), etiqueta('4', 1, 1)];
    const r = grade[0]!.r;
    expect(vizinha(r, 'direita', grade.slice(1))).toBe('2');
    expect(vizinha(r, 'baixo', grade.slice(1))).toBe('3');
  });
});
