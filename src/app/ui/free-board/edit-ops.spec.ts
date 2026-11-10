import { FbNode, FreeBoard, sanitizeFreeBoard } from '../../core/free-board';
import { HOLE } from '../../core/free-board-geometry';
import {
  History,
  boxSelect,
  classifyPaste,
  copyPieces,
  dragSet,
  fitFrame,
  handlesFor,
  hitEdge,
  hitPiece,
  noteLine,
  pasteClip,
  placeGrid,
  readClip,
  resized,
  sizeRule,
  snappedDelta,
} from './edit-ops';

const note = (i: string, x: number, y: number, w = 208, h = 104): FbNode => ({ i, t: 'x', x, y, w, h, txt: i });
const frame = (i: string, x: number, y: number, w: number, h: number): FbNode => ({ i, t: 'm', x, y, w, h, nome: i });
const img: FbNode = { i: 'img', t: 'w', x: 0, y: 0, w: 260, h: 195, src: '{{imagem: https://exemplo.com/a.png}}' };
const count: FbNode = { i: 'ct', t: 'w', x: 0, y: 0, w: 312, h: 156, src: '{{contador: 24/12/2026 | Natal}}' };

function board(n: FbNode[], e: { i: string; a: string; b: string; txt?: string }[] = []): FreeBoard {
  return sanitizeFreeBoard({ v: 1, id: 'abcdefghijklmnopqrstuv', nome: 'T', grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', n, e })!;
}

describe('Quadro livre: a edição (funções puras)', () => {
  it('acerta a peça de cima; dentro da moldura o clique é do fundo, na borda e no título é dela', () => {
    const nodes = [frame('m', 0, 0, 1000, 800), note('a', 100, 200), note('b', 150, 220)];
    expect(hitPiece(nodes, { x: 160, y: 230 }, 1)?.i).toBe('b');
    expect(hitPiece(nodes, { x: 500, y: 500 }, 1)).toBeNull();
    expect(hitPiece(nodes, { x: 500, y: 30 }, 1)?.i).toBe('m');
    expect(hitPiece(nodes, { x: 5, y: 500 }, 1)?.i).toBe('m');
    // de longe a borda é mais larga no mundo (a mesma na tela)
    expect(hitPiece(nodes, { x: 60, y: 500 }, 0.2)?.i).toBe('m');
    expect(hitPiece(nodes, { x: 2000, y: 2000 }, 1)).toBeNull();
  });

  it('acerta a seta perto do ponteiro', () => {
    const b = board([note('a', 0, 0), note('b', 600, 0)], [{ i: 'e', a: 'a', b: 'b' }]);
    expect(hitEdge(b, { x: 400, y: 52 }, 8)?.i).toBe('e');
    expect(hitEdge(b, { x: 400, y: 120 }, 8)).toBeNull();
  });

  it('a caixa pega as inteiras dentro; com Alt, as que ela encosta', () => {
    const nodes = [note('a', 0, 0), note('b', 300, 0)];
    expect([...boxSelect(nodes, { x: -10, y: -10, w: 400, h: 200 })]).toEqual(['a']);
    expect([...boxSelect(nodes, { x: -10, y: -10, w: 400, h: 200 }, true)].sort()).toEqual(['a', 'b']);
  });

  it('arrastar a moldura leva o que está dentro, e o agrupamento vai inteiro', () => {
    const b = board([frame('m', 0, 0, 1000, 800), note('a', 100, 200), { ...note('x', 2000, 0), g: 'gg' }, { ...note('y', 2400, 0), g: 'gg' }]);
    expect([...dragSet(b, new Set(['m']))].sort()).toEqual(['a', 'm']);
    expect([...dragSet(b, new Set(['x']))].sort()).toEqual(['x', 'y']);
  });

  it('encaixa nos furos (Alt solta)', () => {
    expect(snappedDelta({ x: 0, y: 0 }, 30, 14, true)).toEqual({ x: 26, y: 26 });
    expect(snappedDelta({ x: 5, y: 0 }, 30, 14, false)).toEqual({ x: 30, y: 14 });
  });

  it('o tamanho: livre, na proporção (a imagem) e só a largura (os widgets)', () => {
    expect(sizeRule(note('a', 0, 0))).toBe('livre');
    expect(sizeRule(img)).toBe('proporcao');
    expect(sizeRule(count)).toBe('largura');
    expect(handlesFor('largura')).toEqual(['e', 'w']);
    expect(resized({ x: 0, y: 0, w: 208, h: 104 }, 'se', 52, 26, 'livre')).toEqual({ x: 0, y: 0, w: 260, h: 130 });
    const r = resized({ x: 0, y: 0, w: 260, h: 195 }, 'se', 100, 0, 'proporcao');
    expect(r.w).toBe(360);
    expect(r.h).toBe(270);
    expect(resized({ x: 0, y: 0, w: 312, h: 156 }, 'e', 104, 300, 'largura')).toEqual({ x: 0, y: 0, w: 416, h: 156 });
    // nunca menor que o mínimo
    expect(resized({ x: 0, y: 0, w: 312, h: 156 }, 'w', 400, 0, 'largura').w).toBe(130);
  });

  it('as peças novas entram em grade a partir do ponto, nos furos', () => {
    const r = placeGrid({ x: 10, y: 10 }, [{ w: 260, h: 195 }, { w: 260, h: 100 }, { w: 260, h: 195 }], 2);
    expect(r[0]).toEqual({ x: 0, y: 0, w: 260, h: 195 });
    expect(r[1].x).toBe(260 + HOLE);
    expect(r[2].y).toBe(Math.round((195 + HOLE) / HOLE) * HOLE);
  });

  it('copiar e colar: as setas entre as copiadas vão junto, com ids novos, no lugar do ponteiro', () => {
    const b = board([note('a', 0, 0), note('b', 300, 0), note('c', 600, 0)], [
      { i: 'ab', a: 'a', b: 'b', txt: 'lupa' },
      { i: 'bc', a: 'b', b: 'c' },
    ]);
    const { clip, text } = copyPieces(b, new Set(['a', 'b']));
    expect(clip.n.map((n) => n.i)).toEqual(['a', 'b']);
    expect(clip.e.map((e) => e.i)).toEqual(['ab']);
    expect(text).toBe('a\n\nb');
    expect(readClip(JSON.stringify(clip))).toEqual(clip);
    expect(readClip('{"v":2}')).toBeNull();
    const pasted = pasteClip(b, clip, { x: 1000, y: 520 }, '2026-11-10T00:00:00.000Z');
    expect(pasted.added.length).toBe(2);
    expect(pasted.added.every((n) => !['a', 'b'].includes(n.i))).toBeTrue();
    expect(pasted.added[0].x).toBe(Math.round(1000 / HOLE) * HOLE);
    expect(pasted.added[1].x).toBe(Math.round(1000 / HOLE) * HOLE + 300);
    expect(pasted.board.e.length).toBe(3);
  });

  it('o que se cola de fora vira um widget, uma nota pelo título ou um bilhete', () => {
    expect(classifyPaste('https://www.youtube.com/watch?v=dQw4w9WgXcQ')).toEqual({ kind: 'widget', src: '{{video: https://www.youtube.com/watch?v=dQw4w9WgXcQ}}' });
    expect(classifyPaste('https://exemplo.com/foto.png')).toEqual({ kind: 'widget', src: '{{imagem: https://exemplo.com/foto.png}}' });
    expect(classifyPaste('{{contador: 24/12/2026 | Natal}}')).toEqual({ kind: 'widget', src: '{{contador: 24/12/2026 | Natal}}' });
    expect(classifyPaste('[[Diário da mansão]]')).toEqual({ kind: 'nota', title: 'Diário da mansão' });
    expect(classifyPaste('| a | b |\n| --- | --- |\n| 1 | 2 |')?.kind).toBe('widget');
    expect(classifyPaste('Senha?')).toEqual({ kind: 'bilhete', txt: 'Senha?' });
    expect(classifyPaste('   ')).toBeNull();
    expect(noteLine('abc', 'Um | título')).toBe('{{nota: #abc | Um título}}');
  });

  it('ajustar a moldura ao que tem dentro', () => {
    const b = board([frame('m', 0, 0, 2000, 2000), note('a', 260, 260), note('b', 780, 520)]);
    const r = fitFrame(b, 'm')!;
    expect(r.x).toBeLessThan(260);
    expect(r.x + r.w).toBeGreaterThan(780 + 208);
    expect(r.y + r.h).toBeGreaterThan(520 + 104);
  });

  it('desfazer e refazer, com até 100 passos', () => {
    const h = new History();
    const b0 = board([]);
    const b1 = { ...b0, nome: '1' };
    const b2 = { ...b0, nome: '2' };
    h.push(b0);
    h.push(b1);
    expect(h.undo(b2)).toBe(b1);
    expect(h.undo(b1)).toBe(b0);
    expect(h.undo(b0)).toBeNull();
    expect(h.redo(b0)).toBe(b1);
    for (let k = 0; k < 150; k++) h.push(b0);
    let n = 0;
    while (h.undo(b0)) n++;
    expect(n).toBe(100);
  });
});
