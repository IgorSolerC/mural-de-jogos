import { stepFocus } from './wall-keys';

/** Itens posicionados à mão: a grade da Visão geral (fileiras) e a lista (colunas). */
function placed(boxes: [number, number, number, number][]): HTMLElement[] {
  return boxes.map(([left, top, width, height]) => ({ getBoundingClientRect: () => new DOMRect(left, top, width, height) }) as unknown as HTMLElement);
}

const key = (k: string, mods: Partial<KeyboardEvent> = {}) => ({ key: k, ctrlKey: false, altKey: false, metaKey: false, shiftKey: false, ...mods });

describe('as setas numa parede de escolher', () => {
  // três fichas por fileira, a segunda fileira com duas (e a do meio um pouco torta)
  const grid = placed([
    [0, 0, 100, 90],
    [120, 4, 100, 90],
    [240, 0, 100, 90],
    [0, 130, 100, 90],
    [120, 128, 100, 90],
  ]);

  it('fileiras: para os lados na ordem; para cima e para baixo, a do lado de cima ou de baixo', () => {
    expect(stepFocus(grid, 0, key('ArrowRight'), 'rows')).toBe(1);
    expect(stepFocus(grid, 1, key('ArrowLeft'), 'rows')).toBe(0);
    expect(stepFocus(grid, 1, key('ArrowDown'), 'rows')).toBe(4);
    expect(stepFocus(grid, 4, key('ArrowUp'), 'rows')).toBe(1);
    // na última fileira, a terceira coluna não tem ninguém embaixo: a mais perto
    expect(stepFocus(grid, 2, key('ArrowDown'), 'rows')).toBe(4);
    expect(stepFocus(grid, 3, key('ArrowDown'), 'rows')).toBeNull();
    expect(stepFocus(grid, 0, key('ArrowLeft'), 'rows')).toBeNull();
  });

  // duas colunas de linhas: 0, 1, 2 na primeira; 3, 4 na segunda
  const list = placed([
    [0, 0, 300, 34],
    [0, 35, 300, 34],
    [0, 70, 300, 34],
    [344, 0, 300, 34],
    [344, 35, 300, 34],
  ]);

  it('colunas: para cima e para baixo na ordem (de uma coluna para a outra); para os lados, a linha da coluna do lado', () => {
    expect(stepFocus(list, 2, key('ArrowDown'), 'columns')).toBe(3);
    expect(stepFocus(list, 3, key('ArrowUp'), 'columns')).toBe(2);
    expect(stepFocus(list, 1, key('ArrowRight'), 'columns')).toBe(4);
    expect(stepFocus(list, 4, key('ArrowLeft'), 'columns')).toBe(1);
    expect(stepFocus(list, 2, key('ArrowRight'), 'columns')).toBe(4);
    expect(stepFocus(list, 4, key('ArrowDown'), 'columns')).toBeNull();
  });

  it('Home e End vão ao primeiro e ao último; com Ctrl, Alt, Cmd ou Shift, nada', () => {
    expect(stepFocus(list, 2, key('Home'), 'columns')).toBe(0);
    expect(stepFocus(list, 2, key('End'), 'columns')).toBe(4);
    expect(stepFocus(list, 0, key('Home'), 'columns')).toBeNull();
    for (const mod of ['ctrlKey', 'altKey', 'metaKey', 'shiftKey'] as const) expect(stepFocus(list, 0, key('ArrowDown', { [mod]: true }), 'columns')).toBeNull();
    expect(stepFocus(list, 0, key('a'), 'columns')).toBeNull();
  });
});
