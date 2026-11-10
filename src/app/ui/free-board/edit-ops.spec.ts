import { FbNode, FreeBoard, sanitizeFreeBoard } from '../../core/free-board';
import { HOLE } from '../../core/free-board-geometry';
import {
  History,
  boxSelect,
  classifyPaste,
  copyPieces,
  dragSet,
  fitFrame,
  freeSpot,
  keepsHover,
  linkTarget,
  fitMeasured,
  fitRatio,
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

  it('o tamanho: livre (moldura, texto, tabela) e na proporção (os outros widgets, por qualquer alça)', () => {
    expect(sizeRule(note('a', 0, 0))).toBe('livre');
    expect(sizeRule(img)).toBe('proporcao');
    expect(sizeRule({ ...count, src: '{{video: https://youtu.be/abc}}' })).toBe('proporcao');
    // o contador, a nota, o som: antes só ficavam mais largos, sem crescer o desenho
    expect(sizeRule(count)).toBe('proporcao');
    expect(sizeRule({ ...count, src: '{{nota: #abc | Lupa}}' })).toBe('proporcao');
    // a tabela se reorganiza na caixa: livre
    expect(sizeRule({ ...count, src: '| a | b |\n|---|---|\n| 1 | 2 |' })).toBe('livre');
    expect(resized({ x: 0, y: 0, w: 208, h: 104 }, 'se', 52, 26, 'livre')).toEqual({ x: 0, y: 0, w: 260, h: 130 });
    const r = resized({ x: 0, y: 0, w: 260, h: 195 }, 'se', 100, 0, 'proporcao');
    expect(r.w).toBe(360);
    expect(r.h).toBe(270);
    // pelo meio de baixo: a altura manda, e a peça cresce para os dois lados, no lugar
    expect(resized({ x: 0, y: 0, w: 312, h: 156 }, 's', 0, 52, 'proporcao')).toEqual({ x: -52, y: 0, w: 416, h: 208 });
    // pelo meio de um lado: a largura manda, e a altura vem junto, para os dois lados
    expect(resized({ x: 0, y: 0, w: 312, h: 156 }, 'e', 104, 300, 'proporcao')).toEqual({ x: 0, y: -26, w: 416, h: 208 });
    // pelo canto, só para baixo: a altura manda (antes, nada mudava)
    expect(resized({ x: 0, y: 0, w: 312, h: 156 }, 'se', 0, 52, 'proporcao')).toEqual({ x: 0, y: 0, w: 416, h: 208 });
    // nunca menor que o mínimo
    expect(resized({ x: 0, y: 0, w: 312, h: 156 }, 'w', 400, 0, 'proporcao').w).toBe(52);
  });

  it('a caixa do widget fica na proporção do desenho medido, dentro da guardada e no canto de cima à esquerda', () => {
    // a foto em pé numa caixa deitada (a imagem trocada): a caixa encolhe na largura
    expect(fitRatio({ x: 10, y: 20, w: 400, h: 200 }, 0.5)).toEqual({ x: 10, y: 20, w: 100, h: 200 });
    // o desenho deitado numa caixa alta: encolhe na altura
    expect(fitRatio({ x: 0, y: 0, w: 260, h: 260 }, 2)).toEqual({ x: 0, y: 0, w: 260, h: 130 });
    // arredondamento não mexe
    const box = { x: 0, y: 0, w: 261, h: 130 };
    expect(fitRatio(box, 2)).toBe(box);
  });

  it('o quadro com as medidas: só as caixas dos widgets medidos, sem mudar a data nem as setas', () => {
    const b = board([img, count, note('t', 0, 400)], [{ i: 's', a: 'img', b: 'ct' }]);
    expect(fitMeasured(b, new Map())).toBe(b);
    const m = new Map([['img', { src: img.src, r: 1 }], ['t', { src: '', r: 1 }]]);
    const out = fitMeasured(b, m);
    expect(out.n.find((n) => n.i === 'img')).toEqual(jasmine.objectContaining({ x: 0, y: 0, w: 195, h: 195 }));
    expect(out.n.find((n) => n.i === 't')).toBe(b.n.find((n) => n.i === 't')!);
    expect(out.em).toBe(b.em);
    expect(out.e).toBe(b.e);
    // a mesma medida, o mesmo resultado (as peças não viram objetos novos a cada conta)
    expect(fitMeasured(b, m).n[0]).toBe(out.n[0]);
    // a tabela: nunca menor que a altura do conteúdo na largura dela; mais alta, fica (as fileiras esticam)
    const tb: FbNode = { i: 'tb', t: 'w', x: 0, y: 0, w: 416, h: 100, src: '| a |\n|---|\n| 1 |' };
    const tables = board([tb]);
    expect(fitMeasured(tables, new Map([['tb', { src: tb.src, w: 416, minH: 140.4 }]])).n[0].h).toBe(141);
    expect(fitMeasured(tables, new Map([['tb', { src: tb.src, w: 416, minH: 60 }]]))).toBe(tables);
    // medida noutra largura (no meio de puxar a alça): não vale até medir de novo
    expect(fitMeasured(tables, new Map([['tb', { src: tb.src, w: 300, minH: 200 }]]))).toBe(tables);
    // a medida de outra linha (a imagem trocada, medida de novo depois) não vale
    expect(fitMeasured(b, new Map([['img', { src: '{{imagem: https://exemplo.com/b.png}}', r: 1 }]]))).toBe(b);
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

  it('a seta chega na peça soltando rente a ela; dentro da moldura é o vazio; nunca na peça de onde sai', () => {
    const nodes = [note('a', 0, 0), note('b', 400, 0), frame('f', 0, 300, 600, 400)];
    expect(linkTarget(nodes, { x: 390, y: 50 }, 1, 'a')?.i).toBe('b');
    expect(linkTarget(nodes, { x: 360, y: 50 }, 1, 'a')).toBeNull();
    expect(linkTarget(nodes, { x: 100, y: 50 }, 1, 'a')).toBeNull();
    expect(linkTarget(nodes, { x: 300, y: 295 }, 1, 'a')?.i).toBe('f');
    expect(linkTarget(nodes, { x: 300, y: 500 }, 1, 'a')).toBeNull();
    // a folga é de tela: de longe (zoom 0,5) ela vale o dobro no mundo
    expect(linkTarget(nodes, { x: 370, y: 50 }, 0.5, 'a')?.i).toBe('b');
  });

  it('a peça das bolinhas continua a mesma perto dela (as bolinhas ficam fora da borda)', () => {
    const a = note('a', 0, 0);
    expect(keepsHover(a, { x: 230, y: 52 }, 1)).toBeTrue();
    expect(keepsHover(a, { x: 260, y: 52 }, 1)).toBeFalse();
    expect(keepsHover(a, { x: 260, y: 52 }, 0.5)).toBeTrue();
  });

  it('a peça nova vai para o lugar livre mais perto, sem cobrir outra (a moldura não conta)', () => {
    const taken = [note('a', 0, 0, 208, 104)];
    const box = { x: 52, y: 26, w: 208, h: 104 };
    const spot = freeSpot(taken, box);
    expect(spot.w).toBe(208);
    expect(intersectsAny(spot, taken)).toBeFalse();
    expect(Math.hypot(spot.x - box.x, spot.y - box.y)).toBeLessThan(300);
    expect(freeSpot([], box)).toEqual(box);
  });
});

function intersectsAny(r: { x: number; y: number; w: number; h: number }, list: readonly { x: number; y: number; w: number; h: number }[]): boolean {
  return list.some((t) => r.x < t.x + t.w && t.x < r.x + r.w && r.y < t.y + t.h && t.y < r.y + r.h);
}
