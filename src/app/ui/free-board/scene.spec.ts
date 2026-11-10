import { FbNode, FreeBoard, sanitizeFreeBoard } from '../../core/free-board';
import { FAR_PX, MAX_MOUNTED, NEAR_IMAGE_PX, NEAR_PX, Scene, levelOf, needsRecount, pieceInfo } from './scene';

const IMG = 'kkdxDJwYDycpsMExjuKjNQ';
const note = (i: string, x: number, y: number, w = 208, h = 104): FbNode => ({ i, t: 'x', x, y, w, h, txt: i });
const frame = (i: string, x: number, y: number, w: number, h: number): FbNode => ({ i, t: 'm', x, y, w, h, nome: i });
const image = (i: string, x: number, y: number): FbNode => ({ i, t: 'w', x, y, w: 240, h: 180, src: `{{imagem: murall://imagem/${IMG} | foto}}` });

function board(n: FbNode[], e: { i: string; a: string; b: string }[] = []): FreeBoard {
  return sanitizeFreeBoard({ v: 1, id: 'abcdefghijklmnopqrstuv', nome: 'Teste', grupo: 'Jogos', em: '2026-11-09T00:00:00.000Z', n, e })!;
}

describe('Quadro livre: a cena', () => {
  it('lê o que cada peça é (a imagem guardada traz o id para a miniatura)', () => {
    expect(pieceInfo(frame('m', 0, 0, 10, 10))).toEqual({ kind: 'moldura', image: null });
    expect(pieceInfo(note('x', 0, 0))).toEqual({ kind: 'bilhete', image: null });
    expect(pieceInfo(image('i', 0, 0))).toEqual({ kind: 'imagem', image: IMG });
    expect(pieceInfo({ i: 'n', t: 'w', x: 0, y: 0, w: 10, h: 10, src: '{{nota: #abc | Título}}' }).kind).toBe('nota');
    expect(pieceInfo({ i: 'c', t: 'w', x: 0, y: 0, w: 10, h: 10, src: '{{contador: 24/12/2026 | Natal}}' }).kind).toBe('widget');
    expect(pieceInfo({ i: 'h', t: 'w', x: 0, y: 0, w: 10, h: 10, src: '{{imagem: https://exemplo.com/a.png}}' })).toEqual({ kind: 'imagem', image: null });
  });

  it('o nível sai do tamanho na tela: perto, meio, longe; a imagem só vem inteira quando aparece grande', () => {
    const n = note('a', 0, 0, 100, 100);
    expect(levelOf(n, pieceInfo(n), NEAR_PX / 100)).toBe('perto');
    expect(levelOf(n, pieceInfo(n), (NEAR_PX - 1) / 100)).toBe('meio');
    expect(levelOf(n, pieceInfo(n), FAR_PX / 100)).toBe('meio');
    expect(levelOf(n, pieceInfo(n), (FAR_PX - 1) / 100)).toBe('longe');
    const img = { ...image('i', 0, 0), w: 100, h: 100 };
    expect(levelOf(img, pieceInfo(img), NEAR_PX / 100)).toBe('meio');
    expect(levelOf(img, pieceInfo(img), NEAR_IMAGE_PX / 100)).toBe('perto');
  });

  it('monta só o que está perto da tela (a tela e meia tela de folga), na ordem de desenhar', () => {
    const s = new Scene(board([note('perto', 100, 100), note('folga', 1300, 100), note('fora', 5000, 5000), frame('m', 0, 0, 900, 700)]));
    const f = s.frame({ x: 0, y: 0, z: 1 }, 1000, 800);
    expect(f.frames.map((p) => p.node.i)).toEqual(['m']);
    expect(f.pieces.map((p) => p.node.i)).toEqual(['perto', 'folga']);
    expect(f.far).toEqual([]);
  });

  it('de longe, a peça vai para o canvas; a moldura grande continua no DOM', () => {
    const s = new Scene(board([frame('m', 0, 0, 4000, 3000), note('a', 100, 100), note('b', 400, 100)]));
    const f = s.frame({ x: -100, y: -100, z: 0.1 }, 1000, 800);
    expect(f.frames.map((p) => [p.node.i, p.level])).toEqual([['m', 'perto']]);
    expect(f.pieces).toEqual([]);
    expect(f.far.map((p) => p.node.i)).toEqual(['a', 'b']);
  });

  it('com mais peças que o teto, as mais longe do meio esperam no canvas', () => {
    const many: FbNode[] = [];
    for (let k = 0; k < MAX_MOUNTED + 20; k++) many.push(note(`n${k}`, (k % 30) * 220, Math.floor(k / 30) * 120));
    const s = new Scene(board(many));
    const f = s.frame({ x: 0, y: 0, z: 1 }, 8000, 8000);
    expect(f.pieces.length).toBe(MAX_MOUNTED);
    expect(f.far.length).toBe(20);
    // a do canto de cima à esquerda (perto do meio? não: o meio é 4000,4000) vai para o canvas antes da do meio
    const mounted = new Set(f.pieces.map((p) => p.node.i));
    expect(mounted.has('n0')).toBeFalse();
  });

  it('as setas: as que tocam a área, perto ou longe, e nenhuma fora dela', () => {
    const s = new Scene(
      board(
        [note('a', 0, 0), note('b', 400, 0), note('c', 90000, 90000), note('d', 90400, 90000)],
        [
          { i: 'ab', a: 'a', b: 'b' },
          { i: 'cd', a: 'c', b: 'd' },
        ],
      ),
    );
    const f = s.frame({ x: 0, y: 0, z: 1 }, 1000, 800);
    expect(f.edges.map((e) => e.edge.i)).toEqual(['ab']);
    const far = s.frame({ x: 0, y: 0, z: 0.05 }, 1000, 800);
    expect(far.far.map((p) => p.node.i)).toEqual(['a', 'b']);
    expect(far.edges.map((e) => e.edge.i)).toEqual(['ab']);
  });

  it('a caixa de tudo (o Ver tudo) e o quadro vazio', () => {
    expect(new Scene(board([note('a', -100, 50), note('b', 300, 400, 100, 100)])).bounds).toEqual({ x: -100, y: 50, w: 500, h: 450 });
    expect(new Scene(board([])).bounds).toBeNull();
  });

  it('só refaz a conta quando a câmera anda um quarto de tela ou o zoom muda 15%', () => {
    const last = { x: 0, y: 0, z: 1 };
    expect(needsRecount(null, last, 1000, 800)).toBeTrue();
    expect(needsRecount(last, { x: 200, y: 0, z: 1 }, 1000, 800)).toBeFalse();
    expect(needsRecount(last, { x: 260, y: 0, z: 1 }, 1000, 800)).toBeTrue();
    expect(needsRecount(last, { x: 0, y: 0, z: 1.1 }, 1000, 800)).toBeFalse();
    expect(needsRecount(last, { x: 0, y: 0, z: 1.2 }, 1000, 800)).toBeTrue();
    expect(needsRecount(last, { x: 0, y: 0, z: 0.8 }, 1000, 800)).toBeTrue();
  });

  it('aguenta o quadro de 2.000 peças: a conta de uma tela leva poucos ms', () => {
    const many: FbNode[] = [];
    for (let k = 0; k < 2000; k++) many.push(k % 4 ? note(`n${k}`, (k % 50) * 260, Math.floor(k / 50) * 156) : image(`n${k}`, (k % 50) * 260, Math.floor(k / 50) * 156));
    const edges = Array.from({ length: 1500 }, (_, k) => ({ i: `e${k}`, a: `n${k}`, b: `n${k + 1}` }));
    const s = new Scene(board(many, edges));
    const t0 = performance.now();
    for (let k = 0; k < 20; k++) s.frame({ x: k * 300, y: k * 100, z: 0.3 + k * 0.02 }, 1920, 1080);
    expect((performance.now() - t0) / 20).toBeLessThan(8);
  });
});
