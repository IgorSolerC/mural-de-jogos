import { FbNode, FreeBoard, newBoardId } from '../../core/free-board';
import { boundsOf, paintOrder } from '../../core/free-board-geometry';
import { SketchItem, fit, sketchModel } from './sketch-model';
import { CardOf } from './far-look';
import { stockColor } from './far-palette';
import { Scene } from './scene';

/** A miniatura do quadro desenhada na hora (PLANO-MINIATURA-CANVAS.md, rodada 1). */

const T = '2026-11-26T10:00:00.000Z';
const board = (n: FbNode[], e: FreeBoard['e'] = []): FreeBoard => ({ v: 1, id: newBoardId(), nome: 'Mapa', grupo: 'Viagem', em: T, n, e });
const cards: CardOf = (id) => (id === 'n1' ? { stock: 'azul', name: 'Porto: o que não perder', folder: true } : null);

/** O desenho do quadro numa caixa de `w` × `h` px da tela. */
function draw(b: FreeBoard, w = 380, h = 253): SketchItem[] {
  const scene = new Scene(b);
  const nodes = paintOrder([...scene.nodes.values()]);
  return sketchModel(scene, nodes, boundsOf(nodes)!, cards, w, h).items;
}
const texts = (items: SketchItem[]) => items.flatMap((i) => (i.t === 't' ? [i.txt] : []));

const MAP: FbNode[] = [
  { i: 'm1', t: 'm', x: 0, y: 0, w: 1200, h: 800, c: 'azul', nome: 'Lisboa' },
  { i: 'x1', t: 'x', x: 60, y: 110, w: 420, h: 240, k: 'dica', txt: 'Viva Viagem\nCarregar no aeroporto.' },
  { i: 'w1', t: 'w', x: 600, y: 110, w: 420, h: 300, src: '{{nota: #n1 | Porto}}' },
  { i: 'w2', t: 'w', x: 60, y: 450, w: 420, h: 300, src: '{{nota: #n-privada | Meu diário secreto}}' },
  { i: 'w3', t: 'w', x: 600, y: 450, w: 300, h: 300, src: '{{pixel: 2x2 | 12/21 | Gato}}' },
];

describe('a miniatura do quadro (board-sketch.ts)', () => {
  it('as peças com cantos arredondados, a nota colada na cartolina da ficha, e o nome da moldura na fita', () => {
    const items = draw(board(MAP));
    const rects = items.filter((i): i is Extract<SketchItem, { t: 'r' }> => i.t === 'r');
    expect(rects.every((r) => r.rx > 0 || r.fill === 'none' || r.h < 1 || r.w < 60)).toBeTrue();
    expect(rects.some((r) => r.fill === stockColor('azul') && r.w === 420)).toBeTrue();
    const t = texts(items);
    expect(t).toContain('LISBOA');
    expect(t.some((x) => x.startsWith('Porto'))).toBeTrue();
    expect(t.some((x) => x.startsWith('Viva'))).toBeTrue();
  });

  it('a nota colada que não se acha (a privada, na visita) não mostra o título escrito na linha', () => {
    expect(texts(draw(board(MAP))).some((x) => /diário|secreto/i.test(x))).toBeFalse();
  });

  it('a pixel art pelos pontos, sem a legenda por cima deles', () => {
    const items = draw(board(MAP));
    expect(items.filter((i) => i.t === 'p' && i.tr?.includes('scale')).length).toBeGreaterThanOrEqual(2);
    expect(texts(items)).not.toContain('Gato');
  });

  it('o giz das setas vem antes das peças (por baixo do papel), na curva do quadro, com a ponta', () => {
    const items = draw(board(MAP, [{ i: 'e1', a: 'x1', b: 'w1', c: 'rosa' }]));
    const chalk = items.findIndex((i) => i.t === 'p' && i.stroke === '#ff79a8');
    const firstPiece = items.findIndex((i) => i.t === 'r' && i.w === 420);
    expect(chalk).toBeGreaterThan(-1);
    expect(chalk).toBeLessThan(firstPiece);
    const d = (items[chalk] as Extract<SketchItem, { t: 'p' }>).d;
    expect(d).toContain('C');
    expect(d.match(/M/g)!.length).toBe(2);
  });

  it('pequena na tela, a peça troca o título por uma barrinha; menor ainda, só a cor', () => {
    const tiny = draw(board(MAP), 50, 33);
    expect(texts(tiny)).toEqual([]);
    expect(tiny.some((i) => i.t === 'r' && i.op === 0.55)).toBeFalse();
    const mid = draw(board(MAP), 120, 80);
    expect(texts(mid).some((x) => x.startsWith('Viva'))).toBeFalse();
    expect(mid.some((i) => i.t === 'r' && i.op === 0.55)).toBeTrue();
  });

  it('corta o texto com reticências, ou some quando nem duas letras cabem', () => {
    const width = (t: string) => t.length * 5;
    expect(fit('Lisboa', 100, width)).toBe('Lisboa');
    expect(fit('Roteiro de Lisboa', 45, width)).toBe('Roteiro…');
    expect(fit('Roteiro', 8, width)).toBe('');
  });
});
