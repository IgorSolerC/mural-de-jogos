import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { KanbanBoard, boardIdFor, cardsIn } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { Review, isDone, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { KanbanPage } from './kanban-page';

/** A página do Kanban: um quadro por categoria, as colunas com as anotações, mover pelo teclado, o filtro das tags e as folhas. */

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const T0 = '2026-10-16T10:00:00.000Z';
const TRAB = boardIdFor('trabalho');
const EST = boardIdFor('estudos');
const TRAB_URL = `/anotacoes/kanban/${TRAB}`;

const note = (id: string, title: string, extra: Record<string, unknown> = {}): Review =>
  ({
    ...sanitizeReview({ kind: 'anotacoes', game: { name: title }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!,
    id,
  });

function board(): KanbanBoard {
  return {
    id: TRAB,
    category: 'trabalho',
    at: T0,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'fazendo', name: 'Fazendo', icon: 'lapis', color: 'amarelo', finishes: false },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    cards: [
      { note: 'nlogin01', column: 'afazer', importance: 'critico' },
      { note: 'nsync001', column: 'afazer', importance: null },
      // a anotação apagada não aparece (e não quebra nada)
      { note: 'nsumiu01', column: 'fazendo', importance: null },
      // nem a que agora é de outra categoria
      { note: 'nprova01', column: 'fazendo', importance: null },
    ],
  };
}

const state = (...boards: KanbanBoard[]) => ({ boards, removed: {}, legacy: [] });

describe('página do Kanban', () => {
  let host: HTMLElement;
  let kanban: KanbanStore;
  let store: ReviewStore;
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
    store = TestBed.inject(ReviewStore);
    store.reviews.set([
      note('nlogin01', 'Corrigir o login', { category: 'Trabalho', tags: ['Correção'], text: '- [ ] Ver [[Sincronizar quadros]]' }),
      note('nsync001', 'Sincronizar quadros', { category: 'Trabalho', noteRank: 'sub' }),
      note('nprova01', 'Prova', { category: 'Estudos' }),
      note('nsolta01', 'Sem categoria'),
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

  it('sem nenhuma categoria: a cartolina diz que cada categoria tem o seu quadro, sem aba nenhuma', async () => {
    store.reviews.set([note('nsolta01', 'Sem categoria')]);
    await go('/anotacoes/kanban');
    expect(host.querySelector('.primeiro h2')?.textContent).toContain('Cada categoria tem o seu quadro');
    expect(host.querySelector('.primeiro .btn-ink')?.textContent).toContain('Escrever uma anotação');
    expect(host.querySelector('.abas-quadros')).toBeNull();
    expect(host.querySelector('.primeiro-campo')).toBeNull();
  });

  it('as abas são as categorias, com quantas anotações cada quadro tem; não há quadro novo solto', async () => {
    TestBed.inject(Settings).setCategoryLook('Trabalho', { color: 'azul' });
    kanban.state.set(state(board()));
    await go('/anotacoes/kanban');
    expect(router.url).toBe(TRAB_URL);
    const abas = [...host.querySelectorAll<HTMLAnchorElement>('.abas-quadros .aba')];
    expect(abas.map((a) => a.querySelector('app-cat-label')!.textContent!.trim())).toEqual(['Trabalho', 'Estudos']);
    expect(abas.map((a) => a.querySelector('.aba-n')!.textContent!.replace(/\s+/g, ' ').trim())).toEqual([', 2 anotações no quadro', ', 0 anotações no quadro']);
    expect(abas[0].getAttribute('aria-current')).toBe('page');
    // a cor da categoria, como na aba do mural
    expect(abas[0].classList).toContain('orelha-cor');
    expect(abas[1].classList).not.toContain('orelha-cor');
    expect(host.querySelector('.aba.nova')).toBeNull();
    // o quadro dos Estudos existe sem ninguém ter mexido nele
    await go(`/anotacoes/kanban/${EST}`);
    expect([...host.querySelectorAll('.etiqueta-nome')].map(columnName)).toEqual(['A fazer', 'Fazendo', 'Feito']);
    expect(kanban.boards().length).toBe(1);
  });

  it('mostra as colunas e só as anotações da categoria, com a importância e as tags coloridas na ficha', async () => {
    TestBed.inject(Settings).setTagColor('Correção', 'vermelho');
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001']);
    expect(namesIn('fazendo')).toEqual([]);
    expect(column('feito').querySelector('.carimbo')?.textContent).toContain('Finaliza');
    const login = column('afazer').querySelector('[data-nota="nlogin01"]')!;
    expect(login.querySelector('.imp')?.textContent).toContain('Crítico');
    const tag = login.querySelector<HTMLElement>('app-note-tag')!;
    expect(tag.textContent!.trim()).toBe('Correção');
    expect(tag.classList).toContain('cor');
    expect(tag.style.getPropertyValue('--tag-cor')).toBe('#d63a2f');
    expect(login.querySelector('.dymo')).toBeNull();
    expect(column('afazer').querySelector('.etiqueta-n')?.textContent?.trim()).toBe(', 2 anotações');
  });

  it('a ficha do quadro é enxuta: sem tachinha, sem a categoria e sem o "Parte de" da sub-nota; a contagem diz "anotações"', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const fichas = column('afazer').querySelectorAll('app-review-card');
    expect(fichas.length).toBe(2);
    expect(column('afazer').querySelector('.aba-cat')).toBeNull();
    expect(column('afazer').querySelector('.sub-marca')).toBeNull();
    expect(column('afazer').querySelector('[data-nota="nsync001"]')!.textContent).not.toContain('Parte de');
    for (const pin of column('afazer').querySelectorAll('app-review-card app-pin')) expect(getComputedStyle(pin).display).toBe('none');
    expect(column('afazer').querySelector('.etiqueta-nome')!.textContent!.replace(/\s+/g, ' ')).toContain('A fazer , 2 anotações');
  });

  it('o cabeçalho da coluna é o papel claro com o contorno e o desenho na cor dela, não uma cartolina', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const header = column('feito').querySelector<HTMLElement>('.etiqueta')!;
    expect(header.classList).not.toContain('cartolina');
    expect(header.getAttribute('data-cor')).toBe('verde');
    expect(getComputedStyle(header).backgroundColor).toBe('rgb(255, 252, 242)');
    expect(getComputedStyle(header, '::before').borderTopColor).toBe('rgb(94, 156, 28)');
    expect(getComputedStyle(header.querySelector('.etiqueta-icone')!).color).toBe('rgb(94, 156, 28)');
  });

  it('a folha da anotação põe e tira as tags dela mesma (as do mural)', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const mexer = column('afazer').querySelector<HTMLButtonElement>('[data-nota="nsync001"] .mexer')!;
    expect(mexer.getAttribute('aria-label')).toBe('Etapa, importância e tags de Sincronizar quadros');
    mexer.click();
    await settle();
    const sheet = host.querySelector('app-kanban-card-sheet')!;
    expect(sheet.querySelector('.sub')!.textContent).toContain('No quadro de Trabalho');
    // a tag de outra anotação da categoria está à mão, em contorno
    const op = () => sheet.querySelector<HTMLButtonElement>('.tag-op[aria-label="Correção"]')!;
    expect(op().getAttribute('aria-pressed')).toBe('false');
    op().click();
    await settle();
    expect(store.get('nsync001')!.tags).toEqual(['Correção']);
    expect(op().getAttribute('aria-pressed')).toBe('true');
    op().click();
    await settle();
    expect(store.get('nsync001')!.tags).toBeUndefined();
    // uma tag nova: amarrada na anotação e com uma das cores, sorteada
    const input = sheet.querySelector<HTMLInputElement>('.nova input')!;
    input.value = 'Urgente';
    input.dispatchEvent(new Event('input'));
    sheet.querySelector<HTMLFormElement>('.nova')!.dispatchEvent(new Event('submit'));
    await settle();
    expect(store.get('nsync001')!.tags).toEqual(['Urgente']);
    expect(TestBed.inject(Settings).tagColor('Urgente')).toBeTruthy();
  });

  it('os ajustes do quadro trocam a cor das tags da categoria, e a ficha muda junto', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    host.querySelector<HTMLButtonElement>('button[aria-label="Ajustes do quadro"]')!.click();
    await settle();
    const sheet = host.querySelector('app-kanban-board-sheet')!;
    expect(sheet.querySelector('.sub')!.textContent).toContain('Trabalho · 2 anotações');
    expect([...sheet.querySelectorAll('.item .previa')].map((t) => t.textContent!.trim())).toEqual(['Correção']);
    sheet.querySelector<HTMLButtonElement>('app-tag-colors [aria-label="Verde"]')!.click();
    await settle();
    expect(TestBed.inject(Settings).tagColor('correcao')).toBe('verde');
    expect(column('afazer').querySelector('[data-nota="nlogin01"] app-note-tag')!.classList).toContain('cor');
    sheet.querySelector<HTMLButtonElement>('app-tag-colors [aria-label="Sem cor"]')!.click();
    await settle();
    expect(TestBed.inject(Settings).tagColor('correcao')).toBeUndefined();
    expect(column('afazer').querySelector('[data-nota="nlogin01"] app-note-tag')!.classList).not.toContain('cor');
  });

  it('"Só os títulos": a tira com o nome e a importância, lembrada por quadro neste aparelho', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const titles = host.querySelector<HTMLButtonElement>('button[aria-label="Só os títulos"]')!;
    expect(titles.getAttribute('aria-pressed')).toBe('false');
    titles.click();
    await settle();
    expect(titles.getAttribute('aria-pressed')).toBe('true');
    expect(column('afazer').querySelector('app-review-card')).toBeNull();
    const tiras = [...column('afazer').querySelectorAll('.tira')];
    expect(tiras.map((t) => t.querySelector('.tira-nome')!.textContent!.trim())).toEqual(['Corrigir o login', 'Sincronizar quadros']);
    expect(tiras[0].querySelector('.imp-mini')?.getAttribute('data-imp')).toBe('critico');
    expect(tiras[0].querySelector('.tira-nome')!.getAttribute('aria-label')).toBe('Corrigir o login, importância crítico');
    expect(tiras[1].querySelector('.imp-mini')).toBeNull();
    expect(tiras[0].querySelector('app-note-tag')).toBeNull();
    tiras[1].querySelector('.hit')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    await settle();
    expect(namesIn('afazer')).toEqual(['nsync001', 'nlogin01']);
    // o quadro dos Estudos continua nas fichas; voltando, os títulos
    await go(`/anotacoes/kanban/${EST}`);
    expect(host.querySelector<HTMLButtonElement>('button[aria-label="Só os títulos"]')!.getAttribute('aria-pressed')).toBe('false');
    await go(TRAB_URL);
    expect(column('afazer').querySelector('.tira')).not.toBeNull();
    expect(JSON.parse(localStorage.getItem('meu-mural:kanban-titulos:v1')!)).toEqual([TRAB]);
    host.querySelector<HTMLButtonElement>('button[aria-label="Fichas"]')!.click();
    await settle();
    expect(column('afazer').querySelector('.tira')).toBeNull();
    expect(JSON.parse(localStorage.getItem('meu-mural:kanban-titulos:v1')!)).toEqual([]);
  });

  it('Shift e as setas levam a anotação para o lado (e para Feito, que finaliza) e para cima', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
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
    expect(cardsIn(kanban.get(TRAB)!, 'feito').map((c) => c.note)).toEqual(['nlogin01']);
    expect(isDone(store.get('nlogin01')!)).toBeTrue();
    host.querySelector(`[data-nota="nsync001"] .hit`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    await settle();
    expect(namesIn('afazer')).toEqual(['nsync001']);
  });

  it('a busca e a tag escondem as outras, e Limpar mostra todas', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const select = host.querySelector<HTMLSelectElement>('.pasta select')!;
    expect([...select.options].map((o) => o.textContent!.trim())).toEqual(['Todas', 'Correção']);
    select.value = 'correcao';
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01']);
    expect(host.querySelector('.achados')?.textContent).toContain('Mostrando 1 de 2');
    host.querySelector<HTMLButtonElement>('.achados .tinta-link')!.click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001']);
  });

  it('Adicionar nota abre as duas saídas, e Nova coluna cria uma no fim, com os ajustes abertos (e guarda o quadro)', async () => {
    await go(`/anotacoes/kanban/${EST}`);
    column(kanban.boardFor('Estudos').columns[1].id).querySelector<HTMLButtonElement>('.adicionar-btn')!.click();
    await settle();
    expect([...host.querySelectorAll('.adicionar-op')].map((b) => b.textContent!.trim())).toEqual(['Buscar nota', 'Nova nota']);
    host.querySelector<HTMLButtonElement>('.coluna-nova')!.click();
    await settle();
    const b = kanban.get(EST)!;
    expect(kanban.boards().map((x) => x.id)).toEqual([EST]);
    expect(b.columns.length).toBe(4);
    expect(b.columns[3].name).toBe('Nova coluna');
    expect(host.querySelector('app-kanban-column-sheet dialog[open]')).not.toBeNull();
  });
  it('Ctrl+clique marca as anotações do quadro, sem abrir nem arrastar; Ctrl+C copia na ordem; Esc desmarca', async () => {
    const copied: string[] = [];
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (t: string) => void copied.push(t));
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const card = (id: string) => host.querySelector<HTMLElement>(`.lugar[data-nota="${id}"]`)!;
    const ctrlClick = (el: HTMLElement) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: true, button: 0, isPrimary: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
    };
    const marked = () => [...host.querySelectorAll('[data-marcada]')].map((e) => e.getAttribute('data-nota') + '#' + (e as HTMLElement).style.getPropertyValue('--marca-n'));
    ctrlClick(card('nsync001').querySelector<HTMLElement>('.hit')!);
    ctrlClick(card('nlogin01').querySelector<HTMLElement>('.hit')!);
    await settle();
    expect(marked()).toEqual(['nlogin01#2', 'nsync001#1']);
    // nem a leitura abriu, nem o arrastar começou
    expect(document.querySelector('dialog[open]')).toBeNull();
    expect(host.querySelector('.quadro')!.classList).not.toContain('arrastando');
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'c', ctrlKey: true, bubbles: true, cancelable: true }));
    await settle();
    expect(copied).toEqual(['1.\nTÍTULO: Sincronizar quadros\nDESCRIÇÃO:\n\n2.\nTÍTULO: Corrigir o login\nDESCRIÇÃO: Ver Sincronizar quadros']);
    // "Só os títulos" redesenha as fichas: as marcas continuam
    host.querySelector<HTMLElement>('button[aria-label="Só os títulos"]')!.click();
    await settle();
    expect(host.querySelector('.quadro')!.classList).toContain('denso');
    expect(marked()).toEqual(['nlogin01#2', 'nsync001#1']);
    document.body.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
    await settle();
    expect(marked()).toEqual([]);
  });

  it('um toque comum fora desmarca', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const li = host.querySelector<HTMLElement>('.lugar[data-nota="nlogin01"] .hit')!;
    li.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
    li.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
    await settle();
    expect(host.querySelectorAll('[data-marcada]').length).toBe(1);
    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, button: 0 }));
    await settle();
    expect(host.querySelectorAll('[data-marcada]').length).toBe(0);
  });
});
