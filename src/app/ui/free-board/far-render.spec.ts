import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FbNode } from '../../core/free-board';
import { ReviewStore } from '../../core/review-store';
import { sanitizeReview } from '../../core/review';
import { pinningFor } from '../../core/wall-physics';
import { drawFar, placeLabels } from './far-layer';
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

  describe('a fita das molduras de longe (placeLabels)', () => {
    // meia letra por caractere: o "LISBOA" de 13 px mede 39 px, mais o espaçamento e o respiro
    const width = (t: string, font: number) => t.length * font * 0.5;
    const frame = (nome: string, x: number, y: number, w: number, h: number) => ({ node: { i: nome, t: 'm' as const, x, y, w, h, nome }, x, y, w, h });

    it('a letra encolhe antes de cortar o nome; cortado, guarda pelo menos três letras; menos que isso, sem fita', () => {
      expect(placeLabels([frame('Lisboa', 0, 100, 400, 200)], width)[0]).toEqual(jasmine.objectContaining({ text: 'LISBOA', font: 13 }));
      // 64 px de moldura: o LISBOA inteiro só a 9 px
      expect(placeLabels([frame('Lisboa', 0, 100, 64, 60)], width)[0]).toEqual(jasmine.objectContaining({ text: 'LISBOA', font: 9 }));
      const cut = placeLabels([frame('Antes de ir para Portugal', 0, 100, 90, 60)], width)[0];
      expect(cut.font).toBe(9);
      expect(cut.text.endsWith('…')).toBeTrue();
      expect(cut.text.length).toBeGreaterThanOrEqual(4);
      expect(cut.w).toBeLessThanOrEqual(90 - 12);
      // 40 px: nem "LIS…" cabe, e "LI…" não diz qual é
      expect(placeLabels([frame('Lisboa', 0, 100, 40, 60)], width)).toEqual([]);
    });

    it('a fita que cobriria a moldura de cima vai para a borda de baixo (nunca para dentro, onde as peças a cobririam); a de dentro de outra moldura fica meio para fora', () => {
      const top = frame('Lisboa', 0, 0, 300, 100);
      const below = frame('Antes de ir', 0, 106, 300, 100);
      const placed = placeLabels([top, below], width);
      const fita = placed.find((l) => l.text === 'ANTES DE IR')!;
      expect(fita.y).toBeGreaterThan(below.y + below.h - fita.h / 2);
      expect(fita.y).toBeLessThan(below.y + below.h);
      // tapada em cima e embaixo: sem fita nesta conta
      expect(placeLabels([top, below, frame('Fim', 0, 212, 300, 100)], width).map((l) => l.text)).not.toContain('ANTES DE IR');
      const lisboa = placed.find((l) => l.text === 'LISBOA')!;
      expect(lisboa.y).toBeLessThan(top.y);
      // dentro de uma moldura maior, a fita pode passar por cima dela (está dentro dela de qualquer jeito)
      const nested = placeLabels([frame('Casa', 0, 0, 600, 400), frame('Sala', 50, 80, 300, 200)], width).find((l) => l.text === 'SALA')!;
      expect(nested.y).toBeLessThan(80);
    });

    it('as fitas da mesma conta ficam na mesma letra: a da que mais precisou encolher', () => {
      const placed = placeLabels([frame('Lisboa', 0, 0, 64, 60), frame('Antes de ir', 0, 200, 400, 100)], width);
      expect(placed.map((l) => l.font)).toEqual([9, 9]);
    });

    it('a fita não vai para onde uma peça montada no DOM (por cima do canvas) a cobriria', () => {
      const top = frame('Lisboa', 0, 0, 300, 100);
      const below = frame('Antes de ir', 0, 106, 300, 100);
      // a tabela do meio, montada, passando da borda de baixo da moldura
      const table = { x: 20, y: 180, w: 200, h: 40 };
      // (a que só chega perto da beirada não tapa a fita, que encosta por fora)
      expect(placeLabels([top, below], width, [{ x: 20, y: 180, w: 200, h: 23 }]).map((l) => l.text)).toEqual(['LISBOA', 'ANTES DE IR']);
      expect(placeLabels([top, below], width, [table]).map((l) => l.text)).toEqual(['LISBOA']);
    });

    it('as molduras maiores primeiro: a fita que bateria numa já posta fica de fora', () => {
      // duas molduras sobrepostas (nenhuma dentro da outra): só a maior ganha a fita
      const placed = placeLabels([frame('Pequena', 400, 60, 300, 120), frame('Grande', 80, 40, 500, 300)], width);
      expect(placed.map((l) => l.text)).toEqual(['GRANDE']);
    });
  });
});

