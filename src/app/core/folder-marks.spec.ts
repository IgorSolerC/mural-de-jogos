import { folderTree } from './folders';
import { markedTops, marksLabel, moveMarked } from './folder-marks';

/** Pastas e fichas marcadas juntas (PLANO-MARCAR-PASTAS.md): só as de cima, mover com um Desfazer, as palavras. */
describe('pastas e fichas marcadas juntas (core/folder-marks.ts)', () => {
  const tree = folderTree([
    { id: 'pa', group: 'g', name: 'A', parent: null },
    { id: 'pb', group: 'g', name: 'B', parent: 'pa' },
    { id: 'pc', group: 'g', name: 'C', parent: null },
  ]);
  const where: Record<string, string | null> = { n1: null, n2: 'pa', n3: 'pb', n4: 'pc' };

  it('o que está dentro de uma pasta marcada vai com ela: sai da lista, em qualquer nível', () => {
    expect(markedTops(tree, { folders: ['pb', 'pa'], items: ['n1', 'n2', 'n3', 'n4'] }, (id) => where[id])).toEqual({ folders: ['pa'], items: ['n1', 'n4'] });
  });

  it('a pasta desfeita não conta, e as repetidas saem', () => {
    expect(markedTops(tree, { folders: ['pz', 'pc', 'pc'], items: ['n4', 'n4'] }, (id) => where[id])).toEqual({ folders: ['pc'], items: [] });
  });

  it('mover: as pastas, depois as fichas, com um Desfazer só na ordem contrária; o que não pode fica', () => {
    const log: string[] = [];
    const moved = moveMarked(
      {
        move: (id, parent) => {
          if (id === 'pc') return null;
          log.push(`move ${id}→${parent}`);
          return () => log.push(`volta ${id}`);
        },
        place: (ids, folder) => {
          log.push(`place ${ids.join(',')}→${folder}`);
          return { moved: ids.length - 1, undo: () => log.push('volta fichas') };
        },
      },
      { folders: ['pa', 'pc', 'px'], items: ['n1', 'n4'] },
      'px',
    );
    expect(moved.folders).toBe(1);
    expect(moved.items).toBe(1);
    // a própria pasta de destino não vai para dentro dela; a que recusou e uma ficha ficaram
    expect(moved.stayed).toBe(3);
    moved.undo();
    expect(log).toEqual(['move pa→px', 'place n1,n4→px', 'volta fichas', 'volta pa']);
  });

  it('as palavras: as pastas antes', () => {
    expect(marksLabel(2, 3, ['anotação', 'anotações'])).toBe('2 pastas e 3 anotações');
    expect(marksLabel(1, 0, ['recorte', 'recortes'])).toBe('1 pasta');
    expect(marksLabel(0, 1, ['recorte', 'recortes'])).toBe('1 recorte');
  });
});
