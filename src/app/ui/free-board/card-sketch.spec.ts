import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FbNote } from '../../core/free-board';
import { cardItems } from './card-sketch';
import { pieceLook } from './far-look';
import { FreeBoardPiece } from './free-board-piece';
import { SketchItem } from './sketch-model';

const frames = async (n = 2) => {
  for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
};

const LONG = 'O elétrico 28 lota às 10h; ir cedo, antes das 8h, e descer no Largo das Portas do Sol para ver o rio. Depois seguir a pé até a Sé.';

/**
 * O card do texto em proporção (PLANO-CAIXAS-DE-TEXTO.md, D5): o desenho do meio e de longe tem as medidas do card de
 * perto, para a troca não se ver tirando o zoom (antes, a letra crescia e o respiro, a moldura e o desenho sumiam).
 */
describe('o card do texto em proporção (card-sketch.ts)', () => {
  let host: HTMLElement | null = null;
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));
  afterEach(() => host?.remove());

  async function dom(node: FbNote): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(FreeBoardPiece);
    fixture.componentRef.setInput('node', node);
    fixture.componentRef.setInput('info', { kind: 'bilhete', image: null });
    fixture.componentRef.setInput('level', 'perto');
    host = fixture.nativeElement as HTMLElement;
    host.style.position = 'absolute';
    document.body.appendChild(host);
    await document.fonts.ready;
    fixture.detectChanges();
    await fixture.whenStable();
    await frames();
    return host.querySelector<HTMLElement>('.cartao')!;
  }

  function sketch(node: FbNote): SketchItem[] {
    const items: SketchItem[] = [];
    cardItems(items, node, pieceLook(node, null), 1, true);
    return items;
  }

  const rects = (items: SketchItem[]) => items.filter((i): i is Extract<SketchItem, { t: 'r' }> => i.t === 'r');

  for (const fs of [1, 2]) {
    it(`a faixa, a folha clara, o título e as linhas do corpo no mesmo lugar do card de perto (letra ${fs})`, async () => {
      // (o título e as linhas curtos, que não quebram com letra nenhuma: nos testes as letras do site não chegam, e a
      // de reserva da peça não é a do canvas que mede)
      const lines = ['um', 'dois', 'três', 'quatro', 'cinco', 'seis', 'sete', 'oito', 'nove', 'dez'].join('\n');
      const node: FbNote = { i: `c${fs}`, t: 'x', x: 0, y: 0, w: 320 * fs, h: 104 * fs + 80, txt: `Cuidado\n${lines}`, ...(fs !== 1 ? { fs } : {}) };
      const card = await dom(node);
      const box = card.getBoundingClientRect();
      const sheetEl = card.querySelector<HTMLElement>('.cartao-corpo')!.getBoundingClientRect();
      const titleEl = card.querySelector<HTMLElement>('.cartao-titulo')!.getBoundingClientRect();
      const look = pieceLook(node, null);
      const items = sketch(node);
      const [paper, ...rest] = rects(items);
      expect(paper).toEqual(jasmine.objectContaining({ x: 0, y: 0, w: node.w, h: node.h }));
      const sheet = rest.find((r) => r.fill === look.paper && r.w === node.w - 10)!;
      expect(sheet).withContext('a folha clara').toBeDefined();
      expect(Math.abs(sheet.y - (sheetEl.top - box.top))).withContext('o alto da folha').toBeLessThan(2);
      expect(Math.abs(sheet.x - (sheetEl.left - box.left))).toBeLessThan(1);
      expect(Math.abs(sheet.y + sheet.h - (sheetEl.bottom - box.top))).withContext('o pé da folha').toBeLessThan(2);
      // o título começa onde a letra começa
      const titleBar = rest.find((r) => r.fill === look.ink && r.op === 0.72)!;
      expect(Math.abs(titleBar.x - (titleEl.left - box.left))).toBeLessThan(2);
      // as linhas do corpo: quantas a peça mostra, na mesma altura (o meio de cada uma)
      const bodyBars = rest.filter((r) => r.fill === look.bodyInk && r.op === 0.32);
      const text = card.querySelector<HTMLElement>('.cartao-texto')!;
      const lh = parseFloat(getComputedStyle(text).lineHeight);
      const shown = Math.round(text.getBoundingClientRect().height / lh);
      expect(bodyBars.length).toBe(shown);
      const firstMid = text.getBoundingClientRect().top - box.top + lh / 2;
      expect(Math.abs(bodyBars[0].y + bodyBars[0].h / 2 - firstMid)).toBeLessThan(3);
    });
  }

  it('o card só com o título é o papel do jeito, sem folha; baixo demais para o corpo, também', () => {
    const only: FbNote = { i: 'a', t: 'x', x: 0, y: 0, w: 208, h: 104, txt: 'Só o título' };
    expect(rects(sketch(only)).filter((r) => r.fill === pieceLook(only, null).paper && r.w === 198).length).toBe(0);
    const low: FbNote = { i: 'b', t: 'x', x: 0, y: 0, w: 208, h: 60, txt: `Título\n${LONG}` };
    const look = pieceLook(low, null);
    expect(rects(sketch(low)).some((r) => r.fill === look.paper && r.w === 198)).toBeFalse();
  });

  it('sem desenho na faixa (o texto novo, ou o Vazio), sem o quadradinho, e o título começa no lado, como na peça', async () => {
    const node: FbNote = { i: 'sem', t: 'x', x: 0, y: 0, w: 320, h: 160, txt: 'Cuidado\num\ndois', ic: '' };
    const card = await dom(node);
    expect(card.querySelector('.cartao-icone')).toBeNull();
    const box = card.getBoundingClientRect();
    const titleEl = card.querySelector<HTMLElement>('.cartao-titulo')!.getBoundingClientRect();
    const look = pieceLook(node, null);
    const items = rects(sketch(node));
    expect(items.some((r) => r.op === 0.35)).withContext('o quadradinho do desenho').toBeFalse();
    const titleBar = items.find((r) => r.fill === look.ink && r.op === 0.72)!;
    expect(Math.abs(titleBar.x - (titleEl.left - box.left))).toBeLessThan(2);
    // com o desenho (o card de antes), o quadradinho volta e o título anda para a direita
    const withIcon = rects(sketch({ ...node, i: 'com', ic: undefined }));
    expect(withIcon.some((r) => r.op === 0.35)).toBeTrue();
    expect(withIcon.find((r) => r.fill === look.ink && r.op === 0.72)!.x).toBeGreaterThan(titleBar.x + 10);
  });

  it('o card sem título: só a folha clara com a moldura em volta, e o ícone no recorte do canto, como na peça', async () => {
    const node: FbNote = { i: 'st', t: 'x', x: 0, y: 0, w: 320, h: 130, ic: 'estrela', txt: '\num dois três' };
    const card = await dom(node);
    const box = card.getBoundingClientRect();
    const sheetEl = card.querySelector<HTMLElement>('.cartao-corpo')!.getBoundingClientRect();
    const iconEl = card.querySelector<HTMLElement>('.entalhe .cartao-icone')!.getBoundingClientRect();
    const look = pieceLook(node, null);
    const items = rects(sketch(node));
    const sheet = items.find((r) => r.fill === look.paper && r.w === node.w - 10)!;
    expect(Math.abs(sheet.y - (sheetEl.top - box.top))).toBeLessThan(2);
    // nada da faixa: nenhum traço do título
    expect(items.some((r) => r.op === 0.72)).toBeFalse();
    const icon = items.find((r) => r.op === 0.35)!;
    expect(Math.abs(icon.x + icon.w / 2 - (iconEl.left + iconEl.width / 2 - box.left))).toBeLessThan(3);
    expect(Math.abs(icon.y + icon.h / 2 - (iconEl.top + iconEl.height / 2 - box.top))).toBeLessThan(3);
    // as linhas do texto na mesma altura da peça
    const textEl = card.querySelector<HTMLElement>('.cartao-texto')!;
    const lh = parseFloat(getComputedStyle(textEl).lineHeight);
    const bars = items.filter((r) => r.op === 0.32);
    expect(Math.abs(bars[0].y + bars[0].h / 2 - (textEl.getBoundingClientRect().top - box.top + lh / 2))).toBeLessThan(3);
    // a primeira linha começa depois do ícone
    const first = items.find((r) => r.op === 0.32)!;
    expect(first.x).toBeGreaterThan(icon.x + icon.w);
  });

  it('a lista e a tarefa começam depois do marcador, como na peça', () => {
    const n: FbNote = { i: 'l', t: 'x', x: 0, y: 0, w: 320, h: 400, txt: 'Mala\nAntes de ir\n- [ ] Passaporte\n- Casaco\n1. Chave' };
    const xs = rects(sketch(n))
      .filter((r) => r.op === 0.32)
      .map((r) => r.x);
    expect(xs[1]).toBeGreaterThan(xs[0]);
    expect(xs[2]).toBe(xs[1]);
    expect(xs[3]).toBe(xs[1]);
  });

  it('a letra maior deixa as linhas mais grossas e mais altas, no mesmo card', () => {
    const base: FbNote = { i: 'a', t: 'x', x: 0, y: 0, w: 400, h: 400, txt: `T\n${LONG}` };
    const big: FbNote = { ...base, i: 'b', fs: 2 };
    const bars = (n: FbNote) => rects(sketch(n)).filter((r) => r.op === 0.32);
    expect(bars(big)[0].h).toBeCloseTo(bars(base)[0].h * 2, 1);
    expect(bars(big).length).toBeGreaterThan(bars(base).length);
  });
});
