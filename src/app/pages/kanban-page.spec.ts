import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { KanbanBoard, cardsIn } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { Review, isDone, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { KanbanPage } from './kanban-page';

/** A página do Kanban: as colunas com as anotações, o primeiro quadro, mover pelo teclado e o filtro. */

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const T0 = '2026-10-16T10:00:00.000Z';

const note = (id: string, title: string): Review =>
  ({
    ...sanitizeReview({ kind: 'anotacoes', game: { name: title }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!,
    id,
  });

function board(): KanbanBoard {
  return {
    id: 'qtrabalho',
    name: 'Trabalho',
    at: T0,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'fazendo', name: 'Fazendo', icon: 'lapis', color: 'amarelo', finishes: false },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    traits: [{ id: 'tbug', name: 'Correção', color: 'vermelha' }],
    cards: [
      { note: 'nlogin01', column: 'afazer', importance: 'critico', traits: ['tbug'] },
      { note: 'nsync001', column: 'afazer', importance: null, traits: [] },
      // a anotação apagada não aparece (e não quebra nada)
      { note: 'nsumiu01', column: 'fazendo', importance: null, traits: [] },
    ],
  };
}

describe('página do Kanban', () => {
  let host: HTMLElement;
  let kanban: KanbanStore;
  let router: Router;

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await settle();
  }
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  }
  const column = (id: string) => host.querySelector<HTMLElement>(`[data-coluna="${id}"]`)!;
  const namesIn = (id: string) => [...column(id).querySelectorAll('.lugar')].map((li) => li.getAttribute('data-nota'));

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'anotacoes/kanban', component: KanbanPage },
          { path: 'anotacoes/kanban/:quadro', component: KanbanPage },
        ]),
      ],
    });
    TestBed.inject(ReviewStore).reviews.set([note('nlogin01', 'Corrigir o login'), note('nsync001', 'Sincronizar quadros')]);
    kanban = TestBed.inject(KanbanStore);
    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(Raiz);
    host = fixture.nativeElement;
    document.body.appendChild(host);
  });
  afterEach(() => {
    host.remove();
    localStorage.clear();
  });

  it('sem quadro: a cartolina cria o primeiro, com as três colunas, e abre nele', async () => {
    await go('/anotacoes/kanban');
    expect(host.querySelector('.primeiro')).not.toBeNull();
    const input = host.querySelector<HTMLInputElement>('.primeiro-campo input')!;
    input.value = 'Faculdade';
    input.dispatchEvent(new Event('input'));
    host.querySelector<HTMLFormElement>('.primeiro-form')!.dispatchEvent(new Event('submit'));
    await settle();
    const b = kanban.boards()[0];
    expect(b.name).toBe('Faculdade');
    expect(router.url).toBe(`/anotacoes/kanban/${b.id}`);
    expect([...host.querySelectorAll('.etiqueta-nome')].map((h) => h.textContent!.trim())).toEqual(['A fazer', 'Fazendo', 'Feito']);
  });

  it('sem quadro no endereço, abre o primeiro; mostra as colunas, as anotações e as etiquetas delas', async () => {
    kanban.state.set({ boards: [board()], removed: {} });
    await go('/anotacoes/kanban');
    expect(router.url).toBe('/anotacoes/kanban/qtrabalho');
    expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001']);
    expect(namesIn('fazendo')).toEqual([]);
    expect(column('feito').querySelector('.carimbo')?.textContent).toContain('Finaliza');
    const login = column('afazer').querySelector('[data-nota="nlogin01"]')!;
    expect(login.querySelector('.imp')?.textContent).toContain('Crítico');
    expect(login.querySelector('.dymo')?.textContent?.trim()).toBe('Correção');
    expect(column('afazer').querySelector('.etiqueta-n')?.textContent?.trim()).toBe('2');
  });

  it('Shift e as setas levam a anotação para o lado (e para Feito, que finaliza) e para cima', async () => {
    kanban.state.set({ boards: [board()], removed: {} });
    await go('/anotacoes/kanban/qtrabalho');
    const press = (id: string, key: string) => {
      host.querySelector(`[data-nota="${id}"] .hit`)!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: true, bubbles: true }));
    };
    press('nsync001', 'ArrowUp');
    await settle();
    expect(namesIn('afazer')).toEqual(['nsync001', 'nlogin01']);
    press('nlogin01', 'ArrowRight');
    await settle();
    expect(namesIn('fazendo')).toEqual(['nlogin01']);
    press('nlogin01', 'ArrowRight');
    await settle();
    expect(cardsIn(kanban.get('qtrabalho')!, 'feito').map((c) => c.note)).toEqual(['nlogin01']);
    expect(isDone(TestBed.inject(ReviewStore).get('nlogin01')!)).toBeTrue();
    // sem Shift, a seta é só a seta
    host.querySelector(`[data-nota="nsync001"] .hit`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(namesIn('afazer')).toEqual(['nsync001']);
  });

  it('a busca e a característica escondem as outras, e Limpar mostra todas', async () => {
    kanban.state.set({ boards: [board()], removed: {} });
    await go('/anotacoes/kanban/qtrabalho');
    const select = host.querySelector<HTMLSelectElement>('.pasta select')!;
    select.value = 'tbug';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01']);
    expect(host.querySelector('.achados')?.textContent).toContain('Mostrando 1 de 3');
    host.querySelector<HTMLButtonElement>('.achados .tinta-link')!.click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001']);
  });

  it('Adicionar nota abre as duas saídas, e Nova coluna cria uma no fim, com os ajustes abertos', async () => {
    kanban.state.set({ boards: [board()], removed: {} });
    await go('/anotacoes/kanban/qtrabalho');
    column('fazendo').querySelector<HTMLButtonElement>('.adicionar-btn')!.click();
    await settle();
    expect([...column('fazendo').querySelectorAll('.adicionar-op')].map((b) => b.textContent!.trim())).toEqual(['Buscar nota', 'Nova nota']);
    host.querySelector<HTMLButtonElement>('.coluna-nova')!.click();
    await settle();
    const b = kanban.get('qtrabalho')!;
    expect(b.columns.length).toBe(4);
    expect(b.columns[3].name).toBe('Nova coluna');
    expect(host.querySelector('app-kanban-column-sheet dialog[open]')).not.toBeNull();
  });
});
