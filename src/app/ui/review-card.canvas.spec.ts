import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { canvasNoteId } from '../core/canvas-id';
import { FbNode, FreeBoard, newBoardId } from '../core/free-board';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { expectEtiquetaPadrao } from '../testing/etiqueta-acoes.spec';
import { NoteIndex } from './note-index';
import { ReviewCard } from './review-card';

/** O canvas na parede (PLANO-CANVAS.md, rodada 2): a ficha desenha o eucatex pendurado no lugar da cartolina. */

const T = '2026-11-20T10:00:00.000Z';
const BOARD = newBoardId();
const piece = (i: string, x: number, y: number): FbNode => ({ i, t: 'x', x, y, w: 200, h: 120, txt: i });
const board = (n: FbNode[] = [piece('a1', 0, 0), piece('a2', 300, 0)]): FreeBoard => ({ v: 1, id: BOARD, nome: 'Mapa', grupo: 'Jogos', em: T, n, e: [] });

function canvas(extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: canvasNoteId(BOARD),
    kind: 'anotacoes',
    game: { name: 'Mapa da viagem', coverUrl: null, source: 'manual' },
    text: '',
    stock: 'cinza',
    category: 'Jogos',
    tags: ['Roteiro', 'Mapa'],
    completedAt: '2026-11-20',
    private: true,
    createdAt: T,
    updatedAt: T,
    ...extra,
  })!;
}

/** A anotação mais alta da vista Comum: capa, três tags e o texto comprido (a ficha corta onde ele passa). */
function tallest(): Review {
  return sanitizeReview({
    id: 'nota-alta1',
    kind: 'anotacoes',
    game: { name: 'Uma anotação de título bem comprido que ocupa duas linhas', coverUrl: 'https://example.com/capa-alta.jpg', source: 'manual' },
    text: Array.from({ length: 30 }, (_, i) => `- [ ] Uma tarefa bem comprida, a de número ${i + 1}, que quebra a linha`).join('\n'),
    stock: 'amarelo',
    category: 'Jogos',
    tags: ['Roteiro', 'Mapa', 'Dia 1'],
    completedAt: '2026-11-20',
    createdAt: T,
    updatedAt: T,
  })!;
}

describe('o canvas na parede (PLANO-CANVAS.md, 2)', () => {
  let fixtures: ComponentFixture<ReviewCard>[] = [];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewCard, NoteIndex], providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    for (const f of fixtures) f.destroy();
    fixtures = [];
    document.querySelectorAll('.lugar-teste').forEach((e) => e.remove());
    localStorage.clear();
  });

  async function show(review: Review, inputs: Record<string, unknown> = {}, width = 395): Promise<HTMLElement> {
    TestBed.inject(ReviewStore).reviews.update((list) => [...list.filter((r) => r.id !== review.id), review]);
    const fixture = TestBed.createComponent(ReviewCard);
    fixtures.push(fixture);
    fixture.componentRef.setInput('review', review);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    const box = document.createElement('div');
    box.className = 'lugar-teste';
    box.style.cssText = `width: ${width}px; padding: 60px 30px; display: grid;`;
    box.appendChild(fixture.nativeElement);
    document.body.appendChild(box);
    await fixture.whenStable();
    return fixture.nativeElement as HTMLElement;
  }

  it('desenha o prego, o barbante, a moldura com a miniatura e a fita com o nome; nada da cartolina', async () => {
    const el = await show(canvas(), { canvasBoard: board(), checkable: true });
    expect(el.classList).toContain('canvas');
    const card = el.querySelector('app-canvas-card')!;
    expect(card.querySelector('.prego')).not.toBeNull();
    expect(card.querySelector('svg.barbante')).not.toBeNull();
    expect(card.querySelector('.moldura .eucatex app-board-sketch svg')).not.toBeNull();
    expect(card.querySelector('.dymo')!.textContent!.trim()).toBe('Mapa da viagem');
    expect(getComputedStyle(card.querySelector('.dymo')!).textTransform).toBe('uppercase');
    // sem a tachinha, a cabeça, as tags e a data à vista (D2): tudo no nome do botão
    expect(el.querySelector('app-pin')).toBeNull();
    expect(el.querySelector('.head')).toBeNull();
    expect(el.querySelector('app-note-tag')).toBeNull();
    // o papel da cartolina continua (ele dirige a entrada da ficha), mas não aparece
    expect(getComputedStyle(el.querySelector('app-paper-art')!).visibility).toBe('hidden');
    // a orelha do grupo, os botões e o resto ficam presos na moldura
    expect(card.querySelector('.moldura > .aba-cat')?.textContent).toContain('Jogos');
    expect(card.querySelector('.moldura > .acoes')).not.toBeNull();
  });

  it('a parede em volta do prego continua parede: o botão começa na moldura', async () => {
    const el = await show(canvas(), { canvasBoard: board() });
    const hit = el.querySelector('button.hit')!.getBoundingClientRect();
    const moldura = el.querySelector('app-canvas-card .moldura')!.getBoundingClientRect();
    expect(Math.abs(hit.top - moldura.top)).toBeLessThan(6);
    expect(getComputedStyle(el).pointerEvents).toBe('none');
    // ao lado do barbante, acima da moldura, o clique cai na parede
    const at = document.elementFromPoint(moldura.left + 10, moldura.top - 20);
    expect(el.contains(at)).toBeFalse();
  });

  it('o botão que abre diz tudo o que o card não mostra (2.4); o desenho é aria-hidden', async () => {
    const el = await show(canvas(), { canvasBoard: board() });
    const hit = el.querySelector<HTMLButtonElement>(':scope > .corpo > button.hit')!;
    expect(hit.getAttribute('aria-label')).toBe('Abrir canvas: Mapa da viagem, 2 peças, grupo Jogos, tag Roteiro, tag Mapa, 20 de nov de 2026, privado');
    expect(el.querySelector('app-canvas-card .eucatex')!.getAttribute('aria-hidden')).toBe('true');
    expect(el.querySelector('app-canvas-card .dymo')!.getAttribute('aria-hidden')).toBe('true');
    // o quadro que ainda não chegou: sem as peças no nome
    const late = await show(canvas({ category: undefined, tags: [], private: undefined }), { canvasBoard: null });
    expect(late.querySelector('button.hit')!.getAttribute('aria-label')).toBe('Abrir canvas: Mapa da viagem, 20 de nov de 2026, público');
  });

  it('com capa: a foto encapada no plástico, no lugar da miniatura', async () => {
    const com = await show(canvas({ game: { name: 'Mapa', coverUrl: 'https://example.com/capa.jpg', source: 'manual' } }), { canvasBoard: board() });
    expect(com.querySelector('.eucatex app-cover-sleeve')).not.toBeNull();
    expect(com.querySelector('.eucatex app-board-sketch')).toBeNull();
  });

  it('sem peças: "Canvas vazio" a giz, no meio do eucatex', async () => {
    const vazio = await show(canvas(), { canvasBoard: board([]) });
    expect(vazio.querySelector('.eucatex .vazio')!.textContent!.trim()).toBe('Canvas vazio');
    expect(vazio.querySelector('.eucatex app-board-sketch')).toBeNull();
  });

  it('gira em volta do prego (tilt × 1,3) e endireita com o foco do teclado, com o anel na moldura', async () => {
    const el = await show(canvas(), { canvasBoard: board() });
    // (sem a transição: o --tilt chega depois do primeiro desenho, e o giro estaria no meio dela)
    el.style.transition = 'none';
    const tilt = Number(el.style.getPropertyValue('--tilt'));
    // (com o ponteiro do navegador de teste por cima, ela já está reta: é o mouse em cima)
    const still = !el.matches(':hover, :has(:focus-visible)');
    expect(getComputedStyle(el).rotate).toBe(!still ? '0deg' : tilt ? `${+(tilt * 1.3).toFixed(4)}deg` : 'none');
    expect(getComputedStyle(el).transformOrigin.split(' ')[1]).toBe('6px');
    expect(getComputedStyle(el).boxShadow).toBe('none');
    el.querySelector<HTMLButtonElement>('button.hit')!.focus({ focusVisible: true } as FocusOptions);
    await new Promise((r) => setTimeout(r, 50));
    if (el.matches(':has(:focus-visible)')) {
      const moldura = getComputedStyle(el.querySelector('app-canvas-card .moldura')!);
      expect(moldura.outlineStyle).toBe('solid');
      expect(moldura.outlineOffset).toBe('5px');
      expect(getComputedStyle(el).outlineStyle).toBe('none');
    }
  });

  it('o Finalizar e o Fixar são o padrão dos cards (CLAUDE.md), presos no alto da moldura à direita', async () => {
    const el = await show(canvas(), { canvasBoard: board(), checkable: true });
    const acoes = el.querySelector<HTMLElement>('app-canvas-card .moldura > .acoes')!;
    expect(acoes.querySelectorAll('button').length).toBe(2);
    expectEtiquetaPadrao(acoes, { semCorNaMao: ['feito'], comNome: ['feito'] });
    const m = el.querySelector('app-canvas-card .moldura')!.getBoundingClientRect();
    const a = acoes.getBoundingClientRect();
    expect(a.top).toBeLessThan(m.top);
    expect(m.right - a.right).toBeLessThan(40);
  });

  it('finalizado: o carimbo por cima do eucatex; fixado: o alfinete vermelho na moldura', async () => {
    const el = await show(canvas({ doneAt: T, noteRank: 'fixada' }), { canvasBoard: board(), checkable: true });
    expect(el.querySelector('app-canvas-card .moldura > .carimbo app-done-stamp')).not.toBeNull();
    expect(el.querySelector('app-canvas-card .moldura > .acoes .fixar.marcado')).not.toBeNull();
  });

  it('marcando: o adesivo redondo no canto de cima da moldura, e o botão marca em vez de abrir', async () => {
    const el = await show(canvas(), { canvasBoard: board(), picking: true, pickedAt: 2 });
    expect(el.querySelector('app-canvas-card .moldura > .marca .n')!.textContent).toBe('2');
    expect(el.querySelector('button.hit')!.getAttribute('aria-label')).toBe('Marcar: Mapa da viagem');
  });

  it('a Visão geral: deitado na mesa, sem prego nem barbante, da altura das outras fichas', async () => {
    const el = await show(canvas(), { canvasBoard: board(), compact: true, overview: true }, 190);
    expect(el.querySelector('app-canvas-card .prego')).toBeNull();
    expect(el.querySelector('app-canvas-card svg.barbante')).toBeNull();
    expect(el.offsetHeight).toBe(98);
  });

  it('fora da parede (a ficha simples do Kanban, do Calendário) e na secreta, não é canvas', async () => {
    const simples = await show(canvas(), { canvasBoard: board(), compact: true });
    expect(simples.querySelector('app-canvas-card')).toBeNull();
    const secreta = await show(canvas(), { canvasBoard: board(), bare: true });
    expect(secreta.querySelector('app-canvas-card')).toBeNull();
  });

  for (const [onde, width] of [
    ['no computador', 395],
    ['no celular', 358],
  ] as const) {
    it(`nunca passa da largura nem da altura da anotação comum mais alta (2.5), ${onde}`, async () => {
      // (uma ficha por vez na página: a seguinte tira a de antes do lugar)
      const note = await show(tallest(), {}, width);
      const max = { w: note.offsetWidth, h: note.offsetHeight };
      expect(max.h).toBeGreaterThan(300);
      const c = await show(canvas(), { canvasBoard: board() }, width);
      expect(c.offsetWidth).toBeLessThanOrEqual(max.w);
      expect(c.offsetHeight).toBeLessThanOrEqual(max.h);
      // a fita longa para na beirada, com reticências, sem passar da moldura
      const long = await show(canvas({ game: { name: 'Um canvas de nome muito comprido que não cabe inteiro na fita Dymo', coverUrl: null, source: 'manual' } }), { canvasBoard: board() }, width);
      const dymo = long.querySelector<HTMLElement>('.dymo')!;
      expect(getComputedStyle(dymo).textOverflow).toBe('ellipsis');
      expect(dymo.getBoundingClientRect().right).toBeLessThan(long.querySelector('.moldura')!.getBoundingClientRect().right);
    });
  }

  it('a Lista: a moldurinha no lugar da tirinha e as peças no lugar das tarefas', async () => {
    const f = TestBed.createComponent(NoteIndex);
    f.componentRef.setInput('reviews', [canvas()]);
    f.componentRef.setInput('canvasBoard', (id: string) => (id === BOARD ? board() : null));
    document.body.appendChild(f.nativeElement);
    await f.whenStable();
    const row = (f.nativeElement as HTMLElement).querySelector('.linha')!;
    expect(row.querySelector('.cor.moldurinha')).not.toBeNull();
    expect(row.querySelector('.tarefas')!.textContent!.trim()).toBe('2 peças');
    expect(row.textContent).toContain('Canvas:');
    f.destroy();
  });
});
