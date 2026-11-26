import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { FreeBoard, sanitizeFreeBoard } from '../core/free-board';
import { VisitBoards } from '../core/visit-boards';
import { VisitCanvasView } from './visit-canvas';

const BOARD = sanitizeFreeBoard({
  v: 1,
  id: 'visitaQuadroLivre00001',
  nome: 'Mansão',
  grupo: 'Jogos',
  em: '2026-11-09T00:00:00.000Z',
  publico: true,
  n: [
    { i: 'm', t: 'm', x: 0, y: 0, w: 780, h: 520, nome: 'Roxo' },
    { i: 'a', t: 'x', x: 52, y: 104, w: 182, h: 104, txt: 'Senha?' },
    {
      i: 'b',
      t: 'x',
      x: 260,
      y: 104,
      w: 182,
      h: 104,
      txt: 'Lisboa\nO elétrico 28 lota às 10h; ir cedo, antes das 8h, e descer no Largo das Portas do Sol para ver o rio. Depois seguir a pé até a Sé.',
    },
  ],
  e: [],
})!;

/** O canvas aberto na visita, como a página do colega dá (o quadro do canvas e o título da anotação). */
@Component({
  selector: 'app-host',
  imports: [VisitCanvasView],
  template: '<app-visit-canvas name="Ana" [boardId]="board()" [title]="title()" />',
})
class Host {
  readonly board = signal('visitaQuadroLivre00001');
  readonly title = signal<string | null>('Mapa da mansão');
}

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

describe('o canvas aberto na visita (as mesmas peças do dono, PLANO-CANVAS.md rodada 5)', () => {
  const settle = async () => {
    for (let k = 0; k < 5; k++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  };

  beforeEach(() => {
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ path: '**', component: Raiz }]),
        { provide: VisitBoards, useValue: { boards: signal<readonly FreeBoard[]>([BOARD]), loading: signal(false), code: signal('ANA00001'), failed: signal(false), load: () => Promise.resolve() } },
      ],
    });
  });

  it('o quadro aberto é a mesma peça do dono, só para ver: sem o editar, e o E não liga nada', async () => {
    const f = TestBed.createComponent(Host);
    f.nativeElement.style.cssText = 'display:block;width:900px;height:600px';
    document.body.appendChild(f.nativeElement);
    await settle();
    const el = f.nativeElement as HTMLElement;
    const view = el.querySelector('app-free-board')!;
    expect(view).not.toBeNull();
    expect(el.querySelector('.nome-quadro')!.textContent!.trim()).toBe('Mapa da mansão');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await settle();
    expect(view.querySelector('[data-peca="a"]')).not.toBeNull();
    view.querySelector('.visor')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    await settle();
    expect(el.querySelector('app-free-board-tools')).toBeNull();
    expect(el.querySelector('.editar, .pronto')).toBeNull();
    // o Esc volta para o mural dela
    const router = TestBed.inject(Router);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    expect(router.url).toBe('/comparar/mural');
    f.nativeElement.remove();
  });

  it('o card com "…" abre inteiro para ler na visita, como no ver do dono: a folha sem campos, e o Fechar', async () => {
    const f = TestBed.createComponent(Host);
    f.nativeElement.style.cssText = 'display:block;width:900px;height:600px';
    document.body.appendChild(f.nativeElement);
    await settle();
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await settle();
    const el = f.nativeElement as HTMLElement;
    const card = el.querySelector<HTMLElement>('[data-peca="b"]')!;
    const box = card.getBoundingClientRect();
    const at = { clientX: box.left + box.width / 2, clientY: box.top + box.height / 2, bubbles: true, cancelable: true };
    const visor = el.querySelector<HTMLElement>('.visor')!;
    visor.dispatchEvent(new PointerEvent('pointerdown', { ...at, pointerId: 5, pointerType: 'mouse', button: 0 }));
    visor.dispatchEvent(new PointerEvent('pointerup', { ...at, pointerId: 5, pointerType: 'mouse', button: 0 }));
    visor.dispatchEvent(new MouseEvent('click', at));
    let sheet: HTMLElement | null = null;
    for (let k = 0; k < 100 && !sheet?.querySelector('.titulo.lido'); k++) {
      await settle();
      sheet = el.querySelector<HTMLElement>('app-free-board-text-sheet');
    }
    expect(sheet?.querySelector('.titulo.lido')?.textContent?.trim()).toBe('Lisboa');
    expect(sheet!.querySelector('.texto-lido')!.textContent).toContain('até a Sé.');
    expect(sheet!.querySelector('textarea, app-rich-editor, .icone-botao')).toBeNull();
    sheet!.querySelector<HTMLButtonElement>('.pronto')!.click();
    await settle();
    expect(el.querySelector('app-free-board-text-sheet')).toBeNull();
    f.nativeElement.remove();
  });

  it('o canvas que não é público (ou não veio): o aviso, e o caminho de volta para o mural', async () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.board.set('outroQuadroQualquer001');
    document.body.appendChild(f.nativeElement);
    await settle();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-free-board')).toBeNull();
    expect(el.querySelector('.aviso')!.textContent).toContain('não é público');
    expect(el.querySelector('.aviso a')!.getAttribute('href')).toBe('/comparar/mural');
    f.nativeElement.remove();
  });
});
