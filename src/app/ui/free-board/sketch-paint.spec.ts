import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FbNode, FreeBoard, newBoardId } from '../../core/free-board';
import { boundsOf, paintOrder } from '../../core/free-board-geometry';
import { fornoGuardado } from '../../core/forno-store';
import { ImageStore } from '../../core/image-store';
import { resetForno } from '../forno';
import { BoardSketch } from './board-sketch';
import { SketchItem, sketchModel, wrap } from './sketch-model';
import { fitBox, paintSketch } from './sketch-paint';
import { Scene } from './scene';

/** A miniatura assada (PLANO-MINIATURA-CANVAS.md, rodada 2): o mesmo desenho, com as fotos e o texto, no forno. */

const T = '2026-11-26T10:00:00.000Z';
const board = (n: FbNode[]): FreeBoard => ({ v: 1, id: newBoardId(), nome: 'Mapa', grupo: 'Viagem', em: T, n, e: [] });
const NODES: FbNode[] = [
  { i: 'm1', t: 'm', x: 0, y: 0, w: 1200, h: 800, c: 'azul', nome: 'Lisboa' },
  { i: 'x1', t: 'x', x: 60, y: 110, w: 520, h: 300, k: 'dica', txt: 'Viva Viagem\nCarregar no aeroporto mesmo, antes de pegar o metrô vermelho.' },
  { i: 'w1', t: 'w', x: 640, y: 110, w: 500, h: 300, src: '{{contador: 2026-12-20 | Embarque}}' },
  { i: 'w2', t: 'w', x: 60, y: 450, w: 500, h: 300, src: '{{imagem: murall://imagem/fotoDoLaboratorio00001 | recorte}}' },
];

function model(rich: boolean, w = 380, h = 253) {
  const b = board(NODES);
  const scene = new Scene(b);
  const nodes = paintOrder([...scene.nodes.values()]);
  return sketchModel(scene, nodes, boundsOf(nodes)!, null, w, h, rich ? { now: new Date('2026-11-26T12:00:00').getTime() } : null);
}
const texts = (items: SketchItem[]) => items.flatMap((i) => (i.t === 't' ? [i.txt] : []));

describe('a miniatura assada (sketch-paint.ts)', () => {
  it('o desenho rico escreve o texto do card e quanto falta no contador; o SVG fica com as barrinhas', () => {
    const plain = model(false);
    const rich = model(true);
    expect(texts(rich.items).some((t) => t.startsWith('Carregar'))).toBeTrue();
    expect(texts(plain.items).some((t) => t.startsWith('Carregar'))).toBeFalse();
    // de 26/11 ao meio-dia até 20/12 à meia-noite: 23 dias inteiros
    expect(texts(rich.items)).toContain('23');
    // a foto: a mesma peça nos dois (o SVG não a desenha)
    expect(rich.items.filter((i) => i.t === 'i')).toEqual(plain.items.filter((i) => i.t === 'i'));
  });

  it('quebra o texto nas palavras, em até tantas linhas, com reticências no fim', () => {
    const width = (t: string) => t.length * 5;
    expect(wrap('um dois três quatro cinco seis', 50, 2, width)).toEqual(['um dois', 'três quat…']);
    expect(wrap('curto', 50, 2, width)).toEqual(['curto']);
  });

  it('pinta o desenho no canvas no mesmo lugar do SVG, com a foto que veio', async () => {
    const m = model(true);
    const canvas = new OffscreenCanvas(380, 253);
    const ctx = canvas.getContext('2d')!;
    const photo = new OffscreenCanvas(40, 40);
    const pc = photo.getContext('2d')!;
    pc.fillStyle = '#ff0000';
    pc.fillRect(0, 0, 40, 40);
    const bmp = await createImageBitmap(photo);
    paintSketch(ctx, m, 380, 253, 1, new Map([['fotoDoLaboratorio00001', bmp]]));
    const { s, ox, oy } = fitBox(m.box, 380, 253);
    const at = (x: number, y: number) => [...ctx.getImageData(Math.round(ox + x * s), Math.round(oy + y * s), 1, 1).data];
    // o meio da foto: vermelho
    expect(at(310, 600).slice(0, 3)).toEqual([255, 0, 0]);
    // o feltro da moldura azul, longe das peças
    const felt = at(600, 780);
    expect(felt[2]).toBeGreaterThan(felt[0]);
    expect(felt[3]).toBe(255);
    bmp.close();
  });
});

describe('a miniatura no card (BoardSketch com o assado)', () => {
  beforeEach(() => {
    resetForno();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), { provide: ImageStore, useValue: { get: async () => null } }] });
  });
  afterEach(() => resetForno());

  it('assa por cima do SVG, guarda no banco do forno e, aberto de novo, aparece direto de lá', async () => {
    const b = board(NODES);
    const box = document.createElement('div');
    box.style.cssText = 'position: relative; width: 380px; height: 253px;';
    document.body.appendChild(box);
    const make = async () => {
      const f = TestBed.createComponent(BoardSketch);
      f.componentRef.setInput('board', b);
      f.componentRef.setInput('bake', true);
      box.appendChild(f.nativeElement);
      (f.nativeElement as HTMLElement).style.cssText = 'position: absolute; inset: 0;';
      await f.whenStable();
      return f;
    };
    const before = (await fornoGuardado()).imagens;
    const first = await make();
    const img = await waitFor(() => (first.nativeElement as HTMLElement).querySelector<HTMLImageElement>('img.assada'));
    expect(img.src).toMatch(/^blob:/);
    expect((first.nativeElement as HTMLElement).querySelector('svg')).not.toBeNull();
    expect((await fornoGuardado()).imagens).toBe(before + 1);
    first.destroy();
    // de novo, sem esteira: o banco já tem
    resetForno();
    const again = await make();
    const kept = await waitFor(() => (again.nativeElement as HTMLElement).querySelector<HTMLImageElement>('img.assada'));
    expect(kept).not.toBeNull();
    // (veio do banco: nada novo foi assado)
    expect((await fornoGuardado()).imagens).toBe(before + 1);
    again.destroy();
    box.remove();
  });
});

async function waitFor<T>(get: () => T | null, ms = 4000): Promise<T> {
  const end = performance.now() + ms;
  for (;;) {
    const v = get();
    if (v) return v;
    if (performance.now() > end) throw new Error('não chegou a tempo');
    await new Promise((r) => setTimeout(r, 50));
  }
}
