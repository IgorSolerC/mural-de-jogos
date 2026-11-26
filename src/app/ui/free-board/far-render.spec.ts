import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FbNode } from '../../core/free-board';
import { ReviewStore } from '../../core/review-store';
import { sanitizeReview } from '../../core/review';
import { pinningFor } from '../../core/wall-physics';
import { drawFar } from './far-layer';
import { CardOf } from './far-look';
import { stockColor } from './far-palette';
import { FreeBoardPiece } from './free-board-piece';
import { pieceInfo } from './scene';
import { SketchItem, frameItems } from './sketch-model';

/** O editor de longe com as cores de verdade (PLANO-MINIATURA-CANVAS.md, rodada 3). */

const T = '2026-11-26T10:00:00.000Z';
const nota: FbNode = { i: 'w1', t: 'w', x: 0, y: 0, w: 400, h: 300, src: '{{nota: #nota-roteiro | Roteiro}}' };
const tabela: FbNode = { i: 'w2', t: 'w', x: 0, y: 0, w: 400, h: 300, src: '{{tabela: listrada}}\n| Dia | Cidade |\n| - | - |\n| 1 | Lisboa |' };

describe('o editor de longe (rodada 3)', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => localStorage.clear());

  async function piece(node: FbNode, zoom: number) {
    const f = TestBed.createComponent(FreeBoardPiece);
    f.componentRef.setInput('node', node);
    f.componentRef.setInput('info', pieceInfo(node));
    f.componentRef.setInput('level', 'meio');
    f.componentRef.setInput('zoom', zoom);
    document.body.appendChild(f.nativeElement);
    await f.whenStable();
    return f;
  }

  it('no meio, a nota colada fica na cartolina da ficha, com o nome quando cabe (não mais a tira branca)', async () => {
    const r = sanitizeReview({ id: 'nota-roteiro', kind: 'anotacoes', game: { name: 'Roteiro de Lisboa', coverUrl: null, source: 'manual' }, text: '', stock: 'amarelo', createdAt: T, updatedAt: T })!;
    TestBed.inject(ReviewStore).reviews.update((l) => [...l, r]);
    const f = await piece(nota, 0.2);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.tira')).toBeNull();
    const svg = el.querySelector('svg.de-longe')!;
    expect([...svg.querySelectorAll('rect')].some((x) => x.getAttribute('fill') === stockColor(pinningFor(r.id, r.stock).stock))).toBeTrue();
    expect([...svg.querySelectorAll('text')].some((t) => t.textContent!.startsWith('Roteiro'))).toBeTrue();
    // a letra é do tamanho da tela: 7 a 9 px no zoom da conta
    const size = Number(svg.querySelector('text')!.getAttribute('font-size')) * 0.2;
    expect(size).toBeGreaterThanOrEqual(7);
    expect(size).toBeLessThanOrEqual(9);
    f.destroy();
  });

  it('no meio, a tabela tem o cabeçalho escuro da listrada (não mais o bloco bege com o nome)', async () => {
    const f = await piece(tabela, 0.2);
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('.leve')).toBeNull();
    expect([...el.querySelectorAll('svg.de-longe path')].some((p) => p.getAttribute('fill') === '#22201d')).toBeTrue();
    // o modo rico, como o assado do mural: o que está escrito nas fileiras (não fileiras vazias, de esqueleto)
    expect([...el.querySelectorAll('svg.de-longe text')].map((t) => t.textContent)).toContain('1 · Lisboa');
    f.destroy();
  });

  it('de longe, a moldura fica sem a fita do desenho: o nome dela é a fita do tamanho da tela (sem nome duas vezes)', () => {
    const frame = { i: 'm1', t: 'm' as const, x: 0, y: 0, w: 2000, h: 1500, c: 'azul' as const, nome: 'Lisboa' };
    const withTape: SketchItem[] = [];
    frameItems(withTape, frame, 0.1);
    const without: SketchItem[] = [];
    frameItems(without, frame, 0.1, false);
    expect(withTape.some((i) => i.t === 't')).toBeTrue();
    expect(without.some((i) => i.t === 't')).toBeFalse();
  });

  it('de longe, o canvas pinta a nota colada na cor da ficha e a tabela com o cabeçalho', () => {
    const cards: CardOf = () => ({ stock: 'azul', name: 'Porto', folder: false });
    const canvas = document.createElement('canvas');
    canvas.width = 200;
    canvas.height = 100;
    const ctx = canvas.getContext('2d')!;
    const a = { ...nota, x: 0, y: 0, w: 1000, h: 1000 };
    const b = { ...tabela, x: 1000, y: 0, w: 1000, h: 1000 };
    drawFar(ctx, { area: { x: 0, y: 0, w: 2000, h: 1000 }, k: 0.1, z: 0.01, far: [a, b].map((node) => ({ node, info: pieceInfo(node) })), edges: [], labels: [], thumb: () => null, cards });
    const px = (x: number, y: number) => [...ctx.getImageData(x, y, 1, 1).data.slice(0, 3)];
    const hex = (c: string) => [1, 3, 5].map((i) => parseInt(c.slice(i, i + 2), 16));
    expect(px(50, 60)).toEqual(hex(stockColor('azul')));
    // o alto da tabela: o cabeçalho escuro
    expect(px(150, 3)).toEqual(hex('#22201d'));
  });
});
