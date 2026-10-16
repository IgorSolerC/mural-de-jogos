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

const note = (id: string, title: string, extra: Record<string, unknown> = {}): Review =>
  ({
    ...sanitizeReview({ kind: 'anotacoes', game: { name: title }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!,
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
  /** O nome escrito na etiqueta da coluna (sem a contagem, impressa logo depois). */
  const columnName = (h: Element) => h.childNodes[0].textContent!.trim();
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
    TestBed.inject(ReviewStore).reviews.set([
      note('nlogin01', 'Corrigir o login', { category: 'Trabalho', text: '- [ ] Ver [[Sincronizar quadros]]' }),
      note('nsync001', 'Sincronizar quadros', { category: 'Trabalho', noteRank: 'sub' }),
    ]);
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
    expect([...host.querySelectorAll('.etiqueta-nome')].map(columnName)).toEqual(['A fazer', 'Fazendo', 'Feito']);
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
    expect(column('afazer').querySelector('.etiqueta-n')?.textContent?.trim()).toBe(', 2 anotações');
  });

  it('a ficha do quadro é enxuta: sem tachinha, sem a categoria e sem o "Parte de" da sub-nota; a contagem diz "anotações"', async () => {
    kanban.state.set({ boards: [board()], removed: {} });
    await go('/anotacoes/kanban/qtrabalho');
    const fichas = column('afazer').querySelectorAll('app-review-card');
    expect(fichas.length).toBe(2);
    expect(column('afazer').querySelector('.aba-cat')).toBeNull();
    expect(column('afazer').querySelector('.sub-marca')).toBeNull();
    expect(column('afazer').querySelector('[data-nota="nsync001"]')!.textContent).not.toContain('Parte de');
    for (const pin of column('afazer').querySelectorAll('app-review-card app-pin')) expect(getComputedStyle(pin).display).toBe('none');
    expect(column('afazer').querySelector('.etiqueta-nome')!.textContent!.replace(/\s+/g, ' ')).toContain('A fazer , 2 anotações');
  });

  it('o cabeçalho da coluna é o papel claro com o contorno e o desenho na cor dela, não uma cartolina', async () => {
    kanban.state.set({ boards: [board()], removed: {} });
    await go('/anotacoes/kanban/qtrabalho');
    const header = column('feito').querySelector<HTMLElement>('.etiqueta')!;
    expect(header.classList).not.toContain('cartolina');
    expect(header.getAttribute('data-cor')).toBe('verde');
    expect(getComputedStyle(header).backgroundColor).toBe('rgb(255, 252, 242)');
    expect(getComputedStyle(header, '::before').borderTopColor).toBe('rgb(94, 156, 28)');
    expect(getComputedStyle(header.querySelector('.etiqueta-icone')!).color).toBe('rgb(94, 156, 28)');
  });

  it('a etiqueta dos ajustes abre a folha da anotação no quadro', async () => {
    kanban.state.set({ boards: [board()], removed: {} });
    await go('/anotacoes/kanban/qtrabalho');
    const mexer = column('afazer').querySelector<HTMLButtonElement>('[data-nota="nsync001"] .mexer')!;
    expect(mexer.getAttribute('aria-label')).toBe('Etapa, importância e características de Sincronizar quadros');
    mexer.click();
    await settle();
    expect(host.querySelector('app-kanban-card-sheet')).not.toBeNull();
  });

  it('"Só os títulos": a tira com o nome e a importância, lembrada por quadro neste aparelho', async () => {
    const outro: KanbanBoard = { ...board(), id: 'qfaculda', name: 'Faculdade' };
    kanban.state.set({ boards: [board(), outro], removed: {} });
    await go('/anotacoes/kanban/qtrabalho');
    const titles = host.querySelector<HTMLButtonElement>('button[aria-label="Só os títulos"]')!;
    expect(titles.getAttribute('aria-pressed')).toBe('false');
    titles.click();
    await settle();
    expect(titles.getAttribute('aria-pressed')).toBe('true');
    expect(column('afazer').querySelector('app-review-card')).toBeNull();
    const tiras = [...column('afazer').querySelectorAll('.tira')];
    expect(tiras.map((t) => t.querySelector('.tira-nome')!.textContent!.trim())).toEqual(['Corrigir o login', 'Sincronizar quadros']);
    // só a escala da importância (quem não tem, nada); o nome dela fica para o leitor de tela
    expect(tiras[0].querySelector('.imp-mini')?.getAttribute('data-imp')).toBe('critico');
    expect(tiras[0].querySelector('.tira-nome')!.getAttribute('aria-label')).toBe('Corrigir o login, importância crítico');
    expect(tiras[1].querySelector('.imp-mini')).toBeNull();
    expect(tiras[0].querySelector('.dymo')).toBeNull();
    // o teclado continua movendo pela tira
    tiras[1].querySelector('.hit')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    await settle();
    expect(namesIn('afazer')).toEqual(['nsync001', 'nlogin01']);
    // o outro quadro continua nas fichas; voltando, os títulos
    await go('/anotacoes/kanban/qfaculda');
    expect(column('afazer').querySelector('app-review-card')).not.toBeNull();
    await go('/anotacoes/kanban/qtrabalho');
    expect(column('afazer').querySelector('.tira')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('meu-mural:kanban-titulos:v1')!)).toEqual(['qtrabalho']);
    host.querySelector<HTMLButtonElement>('button[aria-label="Fichas"]')!.click();
    await settle();
    expect(column('afazer').querySelector('.tira')).toBeNull();
    expect(JSON.parse(localStorage.getItem('meu-mural:kanban-titulos:v1')!)).toEqual([]);
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
