import { FbNode, sanitizeFreeBoard } from './free-board';
import {
  GridIndex,
  HOLE,
  autoSides,
  boundsOf,
  contains,
  distanceToPath,
  edgePath,
  fitRect,
  framesOf,
  insideFrame,
  intersects,
  nearestSide,
  paintOrder,
  readingOrder,
  rectBetween,
  snap,
  toWorld,
  viewRect,
  zoomAt,
  ZOOM_MAX,
  ZOOM_MIN,
} from './free-board-geometry';

const box = (i: string, x: number, y: number, w = 100, h = 60, t: 'x' | 'm' = 'x'): FbNode => (t === 'm' ? { i, t, x, y, w, h, nome: i } : { i, t, x, y, w, h, txt: i });

describe('Quadro livre: geometria', () => {
  it('encaixa nos furos do eucatex (26 px)', () => {
    expect(HOLE).toBe(26);
    expect(snap(12)).toBe(0);
    expect(snap(14)).toBe(26);
    expect(snap(-40)).toBe(-52);
  });

  it('caixas: toca, contém, cobre, entre dois pontos', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(intersects(a, { x: 99, y: 99, w: 10, h: 10 })).toBeTrue();
    expect(intersects(a, { x: 100, y: 0, w: 10, h: 10 })).toBeFalse();
    expect(contains(a, { x: 10, y: 10, w: 90, h: 90 })).toBeTrue();
    expect(contains(a, { x: 10, y: 10, w: 91, h: 10 })).toBeFalse();
    expect(boundsOf([a, { x: -50, y: 20, w: 10, h: 300 }])).toEqual({ x: -50, y: 0, w: 150, h: 320 });
    expect(boundsOf([])).toBeNull();
    expect(rectBetween({ x: 30, y: 5 }, { x: 10, y: 50 })).toEqual({ x: 10, y: 5, w: 20, h: 45 });
  });

  it('o índice em grade acha o que toca a caixa, segue a peça que andou e esquece a tirada', () => {
    const idx = new GridIndex([
      { i: 'perto', x: 10, y: 10, w: 50, h: 50 },
      { i: 'longe', x: 5000, y: 5000, w: 50, h: 50 },
      { i: 'enorme', x: -3000, y: -3000, w: 10000, h: 10000 },
    ]);
    expect([...idx.query({ x: 0, y: 0, w: 100, h: 100 })].sort()).toEqual(['enorme', 'perto']);
    idx.put('perto', { x: 5020, y: 5020, w: 10, h: 10 });
    expect([...idx.query({ x: 0, y: 0, w: 100, h: 100 })]).toEqual(['enorme']);
    expect([...idx.query({ x: 4990, y: 4990, w: 100, h: 100 })].sort()).toEqual(['enorme', 'longe', 'perto']);
    idx.remove('enorme');
    expect(idx.size).toBe(2);
    expect([...idx.query({ x: 0, y: 0, w: 100, h: 100 })]).toEqual([]);
  });

  it('o índice aguenta milhares de peças sem olhar uma por uma', () => {
    const items = Array.from({ length: 5000 }, (_, k) => ({ i: `n${k}`, x: (k % 100) * 300, y: Math.floor(k / 100) * 300, w: 240, h: 180 }));
    const idx = new GridIndex(items);
    const t0 = performance.now();
    let found = 0;
    for (let k = 0; k < 200; k++) found += idx.query({ x: k * 50, y: k * 50, w: 1600, h: 900 }).size;
    expect(found).toBeGreaterThan(0);
    expect(performance.now() - t0).toBeLessThan(200);
  });

  it('cada peça tem a moldura mais justa que a contém; a de dentro de outra tem a de fora como dona', () => {
    const nodes = [box('fora', 0, 0, 1000, 1000, 'm'), box('dentro', 100, 100, 400, 400, 'm'), box('a', 150, 150), box('b', 600, 600), box('solta', 2000, 0), box('meio', 450, 100)];
    const owner = framesOf(nodes);
    expect(owner.get('dentro')).toBe('fora');
    expect(owner.get('a')).toBe('dentro');
    expect(owner.get('b')).toBe('fora');
    expect(owner.has('solta')).toBeFalse();
    // metade para fora da de dentro: é da de fora
    expect(owner.get('meio')).toBe('fora');
    expect([...insideFrame(nodes, 'fora')].sort()).toEqual(['a', 'b', 'dentro', 'meio']);
    expect([...insideFrame(nodes, 'dentro')]).toEqual(['a']);
  });

  it('as molduras se desenham atrás de tudo, a maior mais atrás', () => {
    const nodes = [box('a', 0, 0), box('pequena', 0, 0, 300, 300, 'm'), box('b', 10, 10), box('grande', 0, 0, 900, 900, 'm')];
    expect(paintOrder(nodes).map((n) => n.i)).toEqual(['grande', 'pequena', 'a', 'b']);
  });

  it('a ordem de leitura vai por fileiras e entra em cada moldura logo depois dela', () => {
    const b = sanitizeFreeBoard({
      v: 1,
      id: 'q'.repeat(22),
      nome: 'Blue Prince',
      grupo: 'Jogos',
      n: [
        box('direita', 400, 10),
        box('esquerda', 0, 20),
        box('moldura', 0, 200, 600, 400, 'm'),
        box('m2', 300, 260),
        box('m1', 20, 250),
        box('embaixo', 0, 800),
      ],
      e: [],
    })!;
    expect(readingOrder(b).map((n) => n.i)).toEqual(['esquerda', 'direita', 'moldura', 'm1', 'm2', 'embaixo']);
  });

  it('a seta liga os lados de frente um para o outro no eixo em que as peças estão mais longe', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    expect(autoSides(a, { x: 300, y: 20, w: 100, h: 100 })).toEqual({ as: 'r', bs: 'l' });
    expect(autoSides(a, { x: -300, y: 20, w: 100, h: 100 })).toEqual({ as: 'l', bs: 'r' });
    expect(autoSides(a, { x: 50, y: 400, w: 100, h: 100 })).toEqual({ as: 'b', bs: 't' });
    expect(autoSides(a, { x: 50, y: -400, w: 100, h: 100 })).toEqual({ as: 't', bs: 'b' });
    expect(nearestSide(a, { x: 98, y: 50 })).toBe('r');
    expect(nearestSide(a, { x: 50, y: 2 })).toBe('t');
  });

  it('a curva sai do meio do lado e chega no meio do outro; o rótulo vai no meio; o clique perto pega a seta', () => {
    const a = { x: 0, y: 0, w: 100, h: 100 };
    const b = { x: 400, y: 0, w: 100, h: 100 };
    const p = edgePath(a, b);
    expect(p.from).toEqual({ x: 100, y: 50 });
    expect(p.to).toEqual({ x: 400, y: 50 });
    expect(p.d.startsWith('M100 50 C')).toBeTrue();
    expect(p.mid.x).toBeCloseTo(250, 5);
    expect(p.mid.y).toBeCloseTo(50, 5);
    // chega da esquerda para a direita
    expect(p.endAngle).toBeCloseTo(0, 5);
    expect(intersects(p.box, { x: 200, y: 49.5, w: 1, h: 1 })).toBeTrue();
    expect(distanceToPath({ x: 250, y: 53 }, p)).toBeLessThan(4);
    expect(distanceToPath({ x: 250, y: 300 }, p)).toBeGreaterThan(100);
    // os lados pedidos valem
    const down = edgePath(a, b, { as: 'b', bs: 'b' });
    expect(down.from).toEqual({ x: 50, y: 100 });
    expect(down.to).toEqual({ x: 450, y: 100 });
  });

  it('a câmera: o zoom no ponteiro deixa o ponto parado, dentro de 5% a 400%', () => {
    const cam = { x: 100, y: 50, z: 1 };
    const p = { x: 300, y: 200 };
    const before = toWorld(cam, p);
    const zoomed = zoomAt(cam, p, 2.5);
    const after = toWorld(zoomed, p);
    expect(after.x).toBeCloseTo(before.x, 9);
    expect(after.y).toBeCloseTo(before.y, 9);
    expect(zoomAt(cam, p, 100).z).toBe(ZOOM_MAX);
    expect(zoomAt(cam, p, 0.0001).z).toBe(ZOOM_MIN);
    expect(viewRect({ x: 0, y: 0, z: 2 }, 1000, 600)).toEqual({ x: 0, y: 0, w: 500, h: 300 });
  });

  it('"Ver tudo" mostra a caixa inteira no meio, sem passar de 100%', () => {
    const cam = fitRect({ x: 0, y: 0, w: 4000, h: 1000 }, 1000, 600, 0);
    expect(cam.z).toBeCloseTo(0.25, 9);
    const view = viewRect(cam, 1000, 600);
    expect(view.x + view.w / 2).toBeCloseTo(2000, 6);
    expect(view.y + view.h / 2).toBeCloseTo(500, 6);
    expect(fitRect({ x: 0, y: 0, w: 10, h: 10 }, 1000, 600).z).toBe(1);
    expect(fitRect(null, 1000, 600)).toEqual({ x: -500, y: -300, z: 1 });
  });
});
