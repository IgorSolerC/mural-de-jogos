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

  it('a pasta não tem recado explicativo: a dica de arrastar fica só para o leitor de tela', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    expect(host.querySelector('.pasta-nota')).toBeNull();
    expect(host.querySelector('.pasta')!.textContent).not.toContain('Arraste');
    const dica = host.querySelector('#' + host.querySelector('.quadro')!.getAttribute('aria-describedby'))!;
    expect(dica.classList).toContain('sr-only');
    expect(dica.textContent).toContain('Shift e as setas');
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
    // a etiqueta da importância mora dentro da ficha: sobe e gira com ela no hover
    expect(login.querySelector('app-review-card .pe .imp')).not.toBeNull();
    // metade na ficha, metade fora, e dentro do lugar da anotação (não encosta na de baixo)
    const ficha = login.querySelector('app-review-card')!.getBoundingClientRect();
    const imp = login.querySelector('.imp')!.getBoundingClientRect();
    const lugar = login.querySelector('app-kanban-note')!.getBoundingClientRect();
    expect(imp.top).toBeLessThan(ficha.bottom);
    expect(imp.bottom).toBeGreaterThan(ficha.bottom);
    expect(imp.bottom).toBeLessThanOrEqual(lugar.bottom + 1);
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
    // a cor nasce na categoria da anotação
    expect(TestBed.inject(Settings).tagColor('Urgente', 'Trabalho')).toBeTruthy();
    expect(TestBed.inject(Settings).tagColor('Urgente', 'Estudos')).toBeUndefined();
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
    // só na categoria do quadro
    expect(TestBed.inject(Settings).tagColor('correcao', 'Trabalho')).toBe('verde');
    expect(TestBed.inject(Settings).tagColor('correcao', 'Estudos')).toBeUndefined();
    expect(column('afazer').querySelector('[data-nota="nlogin01"] app-note-tag')!.classList).toContain('cor');
    sheet.querySelector<HTMLButtonElement>('app-tag-colors [aria-label="Sem cor"]')!.click();
    await settle();
    expect(TestBed.inject(Settings).tagColor('correcao', 'Trabalho')).toBeUndefined();
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

  it('a anotação sem descrição avisa na linha da data (e, na vista Só os títulos, com o lápis na tira)', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const card = (id: string) => host.querySelector(`[data-nota="${id}"]`)!;
    expect(card('nsync001').querySelector('.meta-nota .sem-texto')!.textContent!.trim()).toBe('Sem descrição');
    expect(card('nsync001').querySelector('.hit')!.getAttribute('aria-label')).toContain('sem descrição');
    // com texto, nada
    expect(card('nlogin01').querySelector('.sem-texto')).toBeNull();
    host.querySelector<HTMLButtonElement>('.pasta button[aria-label="Só os títulos"]')!.click();
    await settle();
    expect(card('nsync001').querySelector('.tira .sem-texto')!.getAttribute('title')).toBe('Sem descrição');
    expect(card('nsync001').querySelector('.tira-nome')!.getAttribute('aria-label')).toBe('Sincronizar quadros, sem descrição');
    expect(card('nlogin01').querySelector('.sem-texto')).toBeNull();
    // escrever a descrição tira o aviso
    store.update({ ...store.get('nsync001')!, text: 'Agora tem.' });
    await settle();
    expect(card('nsync001').querySelector('.sem-texto')).toBeNull();
  });

  it('o foco que volta para a ficha (ao fechar a leitura) não deixa os botões de ajustes e da seta à mostra', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const li = host.querySelector<HTMLElement>('[data-nota="nlogin01"]')!;
    li.querySelector<HTMLElement>('.hit')!.focus();
    await settle();
    expect(li.contains(document.activeElement)).toBeTrue();
    expect(getComputedStyle(li.querySelector('.acoes')!).opacity).toBe('0');
    expect(getComputedStyle(li.querySelector('.acoes')!).pointerEvents).toBe('none');
  });

  it('a seta da ficha (junto dos ajustes) leva a anotação para a coluna seguinte, e some na última', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const seta = (id: string) => host.querySelector<HTMLButtonElement>(`[data-nota="${id}"] .acoes .avancar`);
    // na mesma etiqueta dos ajustes, depois deles
    const acoes = host.querySelector('[data-nota="nlogin01"] .acoes')!;
    expect([...acoes.querySelectorAll('button')].map((b) => b.className)).toEqual(['mexer', 'avancar']);
    expect(seta('nlogin01')!.getAttribute('aria-label')).toBe('Levar Corrigir o login para Fazendo');
    expect(seta('nlogin01')!.title).toBe('Levar para Fazendo');
    seta('nlogin01')!.click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nsync001']);
    expect(namesIn('fazendo')).toEqual(['nlogin01']);
    expect(seta('nlogin01')!.getAttribute('aria-label')).toBe('Levar Corrigir o login para Feito');
    // para Feito, que finaliza; lá, na última coluna, só os ajustes
    seta('nlogin01')!.click();
    await settle();
    expect(cardsIn(kanban.get(TRAB)!, 'feito').map((c) => c.note)).toEqual(['nlogin01']);
    expect(isDone(store.get('nlogin01')!)).toBeTrue();
    expect(seta('nlogin01')).toBeNull();
    expect(host.querySelector('[data-nota="nlogin01"] .acoes .mexer')).not.toBeNull();
    // na vista Só os títulos também
    host.querySelector<HTMLButtonElement>('.pasta button[aria-label="Só os títulos"]')!.click();
    await settle();
    expect(seta('nsync001')!.getAttribute('aria-label')).toBe('Levar Sincronizar quadros para Fazendo');
  });

  it('a busca e as tags (as etiquetas da pasta, como no mural) escondem as outras, e Limpar mostra todas', async () => {
    store.update({ ...store.get('nsync001')!, tags: ['Sincronização'] });
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    // sem seletor: as etiquetas depois do picote, como as do mural de anotações
    expect(host.querySelector('.pasta select')).toBeNull();
    const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.pasta-baixo app-tag-chips .atalho')];
    expect(chips().map((b) => b.querySelector('app-note-tag')!.textContent!.trim())).toEqual(['Correção', 'Sincronização']);
    expect(chips().map((b) => b.getAttribute('aria-pressed'))).toEqual(['false', 'false']);
    chips()[0].click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01']);
    expect(chips()[0].getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.achados')?.textContent).toContain('Mostrando 1 de 2');
    // ligadas várias, vale qualquer uma delas
    chips()[1].click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001']);
    chips()[0].click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nsync001']);
    // a busca conta em quantas cada tag ainda está
    host.querySelector<HTMLButtonElement>('.achados .tinta-link')!.click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001']);
    expect(chips().every((b) => b.getAttribute('aria-pressed') === 'false')).toBeTrue();
  });

  it('o quadro passa da pasta até as beiradas da tela: a primeira coluna na linha da pasta, o resto some num degradê, e a seta traz as escondidas', async () => {
    const frames = async (n = 3) => {
      for (let i = 0; i < n; i++) await new Promise((r) => requestAnimationFrame(r));
      await settle();
    };
    const many = board();
    many.columns = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `Etapa ${i + 1}`, icon: 'circulo' as const, color: 'cinza' as const, finishes: false }));
    many.cards = [{ note: 'nlogin01', column: 'c0', importance: null }];
    kanban.state.set(state(many));
    await go(TRAB_URL);
    await frames();
    const q = host.querySelector<HTMLElement>('.quadro')!;
    const pasta = host.querySelector('.pasta')!.getBoundingClientRect();
    // mais largo que a pasta, de beirada a beirada da tela; a primeira coluna onde a pasta começa
    expect(q.getBoundingClientRect().width).toBeGreaterThan(pasta.width);
    expect(Math.abs(q.querySelector('.coluna')!.getBoundingClientRect().left - pasta.left)).toBeLessThan(3);
    // no começo: degradê só na direita, e a seta de lá diz quantas estão escondidas
    expect(q.classList).toContain('corte-fim');
    expect(q.classList).not.toContain('corte-inicio');
    expect(host.querySelector('.trilho-inicio')).toBeNull();
    const seta = host.querySelector<HTMLButtonElement>('.trilho-fim .seta-quadro')!;
    const escondidas = Number(seta.querySelector('.seta-n')!.textContent);
    expect(escondidas).toBeGreaterThan(0);
    expect(seta.getAttribute('aria-label')).toContain(`${escondidas} escondida`);
    // a seta traz a primeira coluna que não estava inteira para a linha da pasta
    const primeiraCortada = [...q.querySelectorAll<HTMLElement>('.coluna')].length - escondidas;
    q.style.scrollBehavior = 'auto';
    spyOn(q, 'scrollTo').and.callFake(((o: ScrollToOptions) => (q.scrollLeft = o.left!)) as typeof q.scrollTo);
    seta.click();
    await frames();
    const alvo = q.querySelectorAll<HTMLElement>('.coluna')[primeiraCortada];
    expect(q.scrollLeft).toBeGreaterThan(0);
    expect(alvo.getBoundingClientRect().left).toBeGreaterThanOrEqual(pasta.left - 2);
    // rolado: o degradê e a seta da esquerda aparecem
    expect(q.classList).toContain('corte-inicio');
    expect(host.querySelector('.trilho-inicio .seta-quadro')).not.toBeNull();
    // no fim, a beirada da direita volta a ser nítida e a seta dela sai
    q.scrollLeft = q.scrollWidth;
    q.dispatchEvent(new Event('scroll'));
    await frames();
    expect(q.classList).not.toContain('corte-fim');
    expect(host.querySelector('.trilho-fim')).toBeNull();
  });

  it('com poucas colunas, o quadro cabe: nem degradê nem seta', async () => {
    const one = board();
    one.columns = one.columns.slice(0, 1);
    one.cards = one.cards.filter((c) => c.column === 'afazer');
    kanban.state.set(state(one));
    await go(TRAB_URL);
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    await settle();
    const q = host.querySelector<HTMLElement>('.quadro')!;
    expect(q.classList).not.toContain('corte-inicio');
    expect(q.classList).not.toContain('corte-fim');
    expect(host.querySelector('.seta-quadro')).toBeNull();
  });

  it('o clique direito numa tag do filtro esconde as anotações dela (riscada, com quantas tira); um clique mostra de novo', async () => {
    store.update({ ...store.get('nsync001')!, tags: ['Sincronização'] });
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.pasta-baixo app-tag-chips .atalho')];
    const chip = (label: string) => chips().find((b) => b.querySelector('app-note-tag')!.textContent!.trim() === label)!;
    // ligada e depois escondida: sai das ligadas
    chip('Correção').click();
    await settle();
    const menu = new MouseEvent('contextmenu', { bubbles: true, cancelable: true });
    chip('Correção').dispatchEvent(menu);
    await settle();
    expect(menu.defaultPrevented).toBeTrue();
    expect(namesIn('afazer')).toEqual(['nsync001']);
    expect(chip('Correção').classList).toContain('fora');
    expect(chip('Correção').getAttribute('aria-pressed')).toBe('false');
    expect(chip('Correção').textContent).toContain('escondida');
    expect(chip('Correção').querySelector('.n')!.textContent).toBe('1');
    expect(host.querySelector('.achados')?.textContent).toContain('Mostrando 1 de 2');
    chip('Correção').click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001']);
    expect(chip('Correção').classList).not.toContain('fora');
    expect(host.querySelector('.achados')).toBeNull();
  });

  it('no dedo, segurar a tag meio segundo esconde (e o toque que sobe não liga a tag); um toque comum liga', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const chip = () => host.querySelector<HTMLButtonElement>('.pasta-baixo .atalho')!;
    const touch = (type: string) => chip().dispatchEvent(new PointerEvent(type, { bubbles: true, pointerType: 'touch', clientX: 10, clientY: 10 }));
    touch('pointerdown');
    await new Promise((r) => setTimeout(r, 560));
    // o menu do navegador que vem do segurar não esconde de novo
    chip().dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true }));
    touch('pointerup');
    chip().click();
    await settle();
    expect(chip().classList).toContain('fora');
    expect(namesIn('afazer')).toEqual(['nsync001']);
    // um toque comum (sem segurar) na riscada mostra de novo
    touch('pointerdown');
    touch('pointerup');
    chip().click();
    await settle();
    expect(chip().classList).not.toContain('fora');
    expect(chip().getAttribute('aria-pressed')).toBe('false');
  });

  it('a tag com o filtro padrão Excluído (na categoria do quadro) começa riscada, e Limpar mostra todas', async () => {
    TestBed.inject(Settings).setTagHidden('Correção', 'Trabalho', true);
    // em outra categoria, a mesma tag não esconde nada
    TestBed.inject(Settings).setTagHidden('Sincronização', 'Estudos', true);
    store.update({ ...store.get('nsync001')!, tags: ['Sincronização'] });
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    expect(namesIn('afazer')).toEqual(['nsync001']);
    const fora = [...host.querySelectorAll('.pasta-baixo .atalho.fora app-note-tag')].map((t) => t.textContent!.trim());
    expect(fora).toEqual(['Correção']);
    host.querySelector<HTMLButtonElement>('.achados .tinta-link')!.click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001']);
    expect(host.querySelector('.pasta-baixo .atalho.fora')).toBeNull();
  });

  it('Adicionar nota abre as duas saídas, e Nova coluna (só na pasta, sem a vaga tracejada no fim do quadro) cria uma no fim, com os ajustes abertos (e guarda o quadro)', async () => {
    await go(`/anotacoes/kanban/${EST}`);
    column(kanban.boardFor('Estudos').columns[1].id).querySelector<HTMLButtonElement>('.adicionar-btn')!.click();
    await settle();
    expect([...host.querySelectorAll('.adicionar-op')].map((b) => b.textContent!.trim())).toEqual(['Buscar nota', 'Nova nota']);
    expect([...host.querySelectorAll('.quadro button')].some((x) => x.textContent!.includes('Nova coluna'))).toBeFalse();
    const nova = [...host.querySelectorAll<HTMLButtonElement>('.pasta button')].filter((x) => x.textContent!.includes('Nova coluna'));
    expect(nova.length).toBe(1);
    nova[0].click();
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
  it('arrastar uma das marcadas leva todas juntas, na ordem do quadro, e elas continuam marcadas', async () => {
    store.update({ ...store.get('nprova01')!, category: 'Trabalho' });
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const card = (id: string) => host.querySelector<HTMLElement>(`.lugar[data-nota="${id}"]`)!;
    const ctrlClick = (el: HTMLElement) => {
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: true, button: 0, isPrimary: true }));
      el.dispatchEvent(new PointerEvent('pointerup', { bubbles: true, cancelable: true, ctrlKey: true, button: 0, isPrimary: true }));
      el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: true, button: 0 }));
    };
    ctrlClick(card('nprova01').querySelector<HTMLElement>('.hit')!);
    ctrlClick(card('nlogin01').querySelector<HTMLElement>('.hit')!);
    await settle();
    expect(host.querySelectorAll('[data-marcada]').length).toBe(2);
    // aperta (sem o Ctrl) a de baixo e leva até Feito
    const grab = card('nprova01').querySelector<HTMLElement>('.hit')!;
    const r = grab.getBoundingClientRect();
    const at = (x: number, y: number) => ({ bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
    grab.dispatchEvent(new PointerEvent('pointerdown', at(r.left + 20, r.top + 10)));
    window.dispatchEvent(new PointerEvent('pointermove', at(r.left + 40, r.top + 30)));
    await settle();
    // as duas saíram das colunas: no lugar, uma vaga só, e a pilha segue o ponteiro com o 2
    expect(host.querySelectorAll('.lugar.vaga').length).toBe(1);
    expect(host.querySelector('.kanban-fantasma.pilha .pilha-n')?.textContent).toBe('2');
    const feito = column('feito').getBoundingClientRect();
    window.dispatchEvent(new PointerEvent('pointermove', at(feito.left + feito.width / 2, feito.top + 80)));
    await settle();
    window.dispatchEvent(new PointerEvent('pointerup', at(feito.left + feito.width / 2, feito.top + 80)));
    grab.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await settle();
    expect(namesIn('feito')).toEqual(['nlogin01', 'nprova01']);
    expect(isDone(store.get('nlogin01')!)).toBeTrue();
    expect(isDone(store.get('nprova01')!)).toBeTrue();
    expect(host.querySelector('.kanban-fantasma')).toBeNull();
    expect([...host.querySelectorAll('[data-marcada]')].map((e) => e.getAttribute('data-nota'))).toEqual(['nlogin01', 'nprova01']);
    // um clique comum numa delas desmarca (e abre a anotação, como sempre)
    const plain = card('nlogin01').querySelector<HTMLElement>('.hit')!;
    plain.dispatchEvent(new PointerEvent('pointerdown', at(0, 0)));
    window.dispatchEvent(new PointerEvent('pointerup', at(0, 0)));
    plain.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, button: 0 }));
    await settle();
    expect(host.querySelectorAll('[data-marcada]').length).toBe(0);
  });

  describe('ordem da coluna', () => {
    /** A fazer com três anotações à mão: login (crítico), sync (sem importância), alfa (crítico). */
    function sortable(): KanbanBoard {
      const b = board();
      return {
        ...b,
        cards: [
          { note: 'nlogin01', column: 'afazer', importance: 'critico' },
          { note: 'nsync001', column: 'afazer', importance: null },
          { note: 'nalfa001', column: 'afazer', importance: 'critico' },
          { note: 'nmeio001', column: 'fazendo', importance: 'critico' },
        ],
      };
    }
    beforeEach(() => {
      store.reviews.update((list) => [...list, note('nalfa001', 'Alfa', { category: 'Trabalho' }), note('nmeio001', 'Meio', { category: 'Trabalho' })]);
    });
    async function openSheet(col: string): Promise<HTMLElement> {
      column(col).querySelector<HTMLButtonElement>('.etiqueta-btn')!.click();
      await settle();
      return host.querySelector<HTMLElement>('app-kanban-column-sheet')!;
    }
    /** Escolhe o critério `text` no nível `level` (0: a ordem, 1: o desempate). */
    async function pick(sheet: HTMLElement, level: number, text: string): Promise<void> {
      const label = [...sheet.querySelectorAll('.nivel')[level].querySelectorAll<HTMLElement>('.ordem-op')].find((l) => l.textContent!.trim() === text)!;
      label.querySelector('input')!.click();
      await settle();
    }

    it('nos ajustes da coluna: por importância e, no empate, por título; o cabeçalho e a frase dizem; À mão devolve a ordem de antes', async () => {
      kanban.state.set(state(sortable()));
      await go(TRAB_URL);
      expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001', 'nalfa001']);
      expect(column('afazer').querySelector('.etiqueta-ordem')).toBeNull();
      const sheet = await openSheet('afazer');
      expect(sheet.querySelector('.ordem-frase')!.textContent).toContain('Na ordem em que você arrastar');
      // à mão, o desempate nem aparece
      expect(sheet.querySelectorAll('.nivel').length).toBe(1);

      await pick(sheet, 0, 'Importância');
      expect(namesIn('afazer')).toEqual(['nlogin01', 'nalfa001', 'nsync001']);
      expect(column('afazer').querySelector('.etiqueta-ordem')!.textContent!.trim()).toBe('Por importância');
      expect([...sheet.querySelectorAll('.segmento .seg-nome')].map((s) => s.textContent!.trim())).toEqual(['Crítico primeiro', 'Baixíssimo primeiro']);
      // o desempate não oferece o critério da ordem
      expect([...sheet.querySelectorAll('.nivel')[1].querySelectorAll('.ordem-op')].map((l) => l.textContent!.trim())).toEqual([
        'Nenhum',
        'Criação',
        'Alteração',
        'Título',
        'Tag',
        'Tarefas',
      ]);

      await pick(sheet, 1, 'Título');
      expect(namesIn('afazer')).toEqual(['nalfa001', 'nlogin01', 'nsync001']);
      expect(column('afazer').querySelector('.etiqueta-ordem')!.textContent!.trim()).toBe('Por importância e título');
      expect(sheet.querySelector('.ordem-frase')!.textContent).toContain('No empate, por título, de A a Z.');
      expect(kanban.get(TRAB)!.columns[0].sort).toEqual([{ by: 'importancia' }, { by: 'titulo' }]);
      // a ordem à mão continua guardada
      expect(cardsIn(kanban.get(TRAB)!, 'afazer').map((c) => c.note)).toEqual(['nlogin01', 'nsync001', 'nalfa001']);

      // o título vira a ordem: os dois trocam de lugar
      await pick(sheet, 0, 'Título');
      expect(kanban.get(TRAB)!.columns[0].sort).toEqual([{ by: 'titulo' }, { by: 'importancia' }]);
      const sentido = sheet.querySelectorAll<HTMLInputElement>('input[name="ca-sentido-1"]');
      sentido[1].click();
      await settle();
      expect(namesIn('afazer')).toEqual(['nsync001', 'nlogin01', 'nalfa001']);
      expect(kanban.get(TRAB)!.columns[0].sort).toEqual([{ by: 'titulo', reverse: true }, { by: 'importancia' }]);

      await pick(sheet, 0, 'À mão');
      expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001', 'nalfa001']);
      expect('sort' in kanban.get(TRAB)!.columns[0]).toBeFalse();
      expect(column('afazer').querySelector('.etiqueta-ordem')).toBeNull();
    });

    it('"Usar esta ordem nas outras colunas" leva a ordem a todas (com Desfazer) e some quando todas já estão nela', async () => {
      kanban.state.set(state(sortable()));
      await go(TRAB_URL);
      const sheet = await openSheet('afazer');
      expect(sheet.querySelector('.ordem-todas')).toBeNull();
      await pick(sheet, 0, 'Tag');
      const all = sheet.querySelector<HTMLButtonElement>('.ordem-todas button')!;
      expect(all.textContent!.trim()).toBe('Usar esta ordem nas outras colunas');
      all.click();
      await settle();
      expect(kanban.get(TRAB)!.columns.map((c) => c.sort)).toEqual([[{ by: 'tag' }], [{ by: 'tag' }], [{ by: 'tag' }]]);
      expect(sheet.querySelector('.ordem-todas')).toBeNull();
      expect(column('feito').querySelector('.etiqueta-ordem')!.textContent!.trim()).toBe('Por tag');
    });

    it('Shift e as setas numa coluna em ordem só trocam com a empatada; sem empate, dizem por que ficam', async () => {
      const b = sortable();
      kanban.state.set(state({ ...b, columns: b.columns.map((c) => (c.id === 'afazer' ? { ...c, sort: [{ by: 'importancia' }] } : c)) }));
      await go(TRAB_URL);
      expect(namesIn('afazer')).toEqual(['nlogin01', 'nalfa001', 'nsync001']);
      const press = (id: string, key: string) => {
        host.querySelector(`[data-nota="${id}"] .hit`)!.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey: true, bubbles: true }));
      };
      press('nsync001', 'ArrowUp');
      await settle();
      expect(namesIn('afazer')).toEqual(['nlogin01', 'nalfa001', 'nsync001']);
      expect(host.querySelector('[aria-live="polite"].sr-only')!.textContent).toContain('Sincronizar quadros fica no lugar: A fazer está em ordem por importância.');
      press('nalfa001', 'ArrowUp');
      await settle();
      expect(namesIn('afazer')).toEqual(['nalfa001', 'nlogin01', 'nsync001']);
      expect(host.querySelector('[aria-live="polite"].sr-only')!.textContent).toContain('Alfa: A fazer, 1 de 3.');
      // vindo do lado, cai no lugar dela na ordem (depois das críticas, antes da sem importância)
      press('nmeio001', 'ArrowLeft');
      await settle();
      expect(namesIn('afazer')).toEqual(['nalfa001', 'nlogin01', 'nmeio001', 'nsync001']);
    });

    it('arrastando para uma coluna em ordem, a vaga fica onde a anotação vai aparecer', async () => {
      const b = sortable();
      kanban.state.set(state({ ...b, columns: b.columns.map((c) => (c.id === 'afazer' ? { ...c, sort: [{ by: 'importancia' }] } : c)) }));
      await go(TRAB_URL);
      const grab = host.querySelector<HTMLElement>('.lugar[data-nota="nmeio001"] .hit')!;
      const r = grab.getBoundingClientRect();
      const at = (x: number, y: number) => ({ bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
      grab.dispatchEvent(new PointerEvent('pointerdown', at(r.left + 20, r.top + 10)));
      window.dispatchEvent(new PointerEvent('pointermove', at(r.left + 40, r.top + 30)));
      await settle();
      // no alto de A fazer: ela é crítica como as que estão lá, então a vaga pode ir até o topo
      const afazer = column('afazer').getBoundingClientRect();
      const top = column('afazer').querySelector('.lugar')!.getBoundingClientRect().top;
      window.dispatchEvent(new PointerEvent('pointermove', at(afazer.left + afazer.width / 2, top + 2)));
      await settle();
      expect(namesIn('afazer')).toEqual(['nmeio001', 'nlogin01', 'nalfa001', 'nsync001']);
      // no pé da coluna: a vaga para antes da sem importância
      window.dispatchEvent(new PointerEvent('pointermove', at(afazer.left + afazer.width / 2, afazer.bottom - 4)));
      await settle();
      expect(namesIn('afazer')).toEqual(['nlogin01', 'nalfa001', 'nmeio001', 'nsync001']);
      expect(column('afazer').querySelectorAll('.lugar')[2].classList).toContain('vaga');
      window.dispatchEvent(new PointerEvent('pointerup', at(afazer.left + afazer.width / 2, afazer.bottom - 4)));
      await settle();
      expect(namesIn('afazer')).toEqual(['nlogin01', 'nalfa001', 'nmeio001', 'nsync001']);
      expect(cardsIn(kanban.get(TRAB)!, 'afazer').map((c) => c.note)).toEqual(['nlogin01', 'nsync001', 'nalfa001', 'nmeio001']);
    });
  });
});
