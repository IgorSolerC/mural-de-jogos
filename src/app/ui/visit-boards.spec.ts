import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { visitBoardPath } from '../core/areas';
import { FreeBoard, sanitizeFreeBoard } from '../core/free-board';
import { studyGroupId } from '../core/study';
import { VisitBoards } from '../core/visit-boards';
import { VisitBoardsView } from './visit-boards';

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
  ],
  e: [],
})!;

/** A rota da visita com o grupo e o quadro, como a página do colega dá. */
@Component({
  selector: 'app-host',
  imports: [VisitBoardsView],
  template: '<app-visit-boards name="Ana" [groupId]="group()" [boardId]="board()" />',
})
class Host {
  readonly group = signal<string | null>(null);
  readonly board = signal<string | null>(null);
}

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

describe('a visita no Quadro livre (as mesmas peças do dono)', () => {
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
        { provide: VisitBoards, useValue: { boards: signal<readonly FreeBoard[]>([BOARD]), loading: signal(false), code: signal('ANA00001') } },
      ],
    });
  });

  it('a lista: as abas dos grupos e as mesmas folhas kraft do dono, com o caminho da visita', async () => {
    const f = TestBed.createComponent(Host);
    document.body.appendChild(f.nativeElement);
    await settle();
    const el = f.nativeElement as HTMLElement;
    expect(el.querySelector('app-study-group-tabs')).not.toBeNull();
    const card = el.querySelector('app-free-board-card a')!;
    expect(card.getAttribute('href')).toContain(visitBoardPath(studyGroupId('Jogos'), BOARD.id));
    expect(card.querySelector('.nome')!.textContent!.trim()).toBe('Mansão');
    f.nativeElement.remove();
  });

  it('o quadro aberto é a mesma peça do dono, só para ver: sem o editar, e o E não liga nada', async () => {
    const f = TestBed.createComponent(Host);
    f.componentInstance.group.set(studyGroupId('Jogos'));
    f.componentInstance.board.set(BOARD.id);
    f.nativeElement.style.cssText = 'display:block;width:900px;height:600px';
    document.body.appendChild(f.nativeElement);
    await settle();
    const el = f.nativeElement as HTMLElement;
    const view = el.querySelector('app-free-board')!;
    expect(view).not.toBeNull();
    expect(el.querySelector('.nome-quadro')!.textContent!.trim()).toBe('Mansão');
    await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
    await settle();
    expect(view.querySelector('[data-peca="a"]')).not.toBeNull();
    view.querySelector('.visor')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'e', bubbles: true }));
    await settle();
    expect(el.querySelector('app-free-board-tools')).toBeNull();
    expect(el.querySelector('.editar, .pronto')).toBeNull();
    // o Esc volta para a lista do grupo
    const router = TestBed.inject(Router);
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle();
    expect(router.url).toBe(visitBoardPath(studyGroupId('Jogos')));
    f.nativeElement.remove();
  });
});
