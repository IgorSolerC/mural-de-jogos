import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { KanbanBoard, boardIdFor, cardsIn } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { Desk } from '../core/desk';
import { Review, isDone, sanitizeReview } from '../core/review';
import { ProfileStore } from '../core/profile-store';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { MuralConfig } from '../ui/mural-config';
import { Mural } from '../core/mural';
import { KANBAN_LAST_KEY } from '../core/kanban';
import { WallView } from '../core/wall-view';
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
      note('nsync001', 'Sincronizar quadros', { category: 'Trabalho' }),
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
    expect(host.querySelector('.primeiro h2')?.textContent).toContain('Cada grupo tem o seu quadro');
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
    const abas = [...host.querySelectorAll<HTMLAnchorElement>('.abas-quadros a.aba')];
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

  it('os grupos escondidos nas configurações do mural ficam no "Mais", como no mural; escolher ali abre o quadro', async () => {
    TestBed.inject(Settings).setCategoryPrefs('Estudos', { hidden: true });
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const links = () => [...host.querySelectorAll<HTMLAnchorElement>('.abas-quadros a.aba')].map((a) => a.querySelector('app-cat-label')!.textContent!.trim());
    expect(links()).toEqual(['Trabalho']);
    const mais = host.querySelector<HTMLLabelElement>('.abas-quadros label.aba-mais')!;
    expect(mais.textContent).toContain('Mais');
    expect(mais.classList).not.toContain('on');
    const select = mais.querySelector('select')!;
    expect([...select.options].filter((o) => !o.disabled).map((o) => o.textContent!.trim())).toEqual(['Estudos (0)']);
    select.value = EST;
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(router.url).toBe(`/anotacoes/kanban/${EST}`);
    // aberto, o "Mais" mostra o grupo, como a aba aberta
    const aberto = host.querySelector<HTMLLabelElement>('.abas-quadros label.aba-mais')!;
    expect(aberto.classList).toContain('on');
    expect(aberto.querySelector('app-cat-label')!.textContent!.trim()).toBe('Estudos');
  });

  it('as abas vão na ordem das abas do mural (da maior para a menor lá: as finalizadas escondidas não contam)', async () => {
    TestBed.inject(Mural).kind.set('anotacoes');
    // os Estudos têm mais anotações, mas três finalizadas: no mural, o Trabalho tem mais à mostra (as
    // do quadro dele no mural também)
    TestBed.inject(Settings).setCategoryPrefs('Trabalho', { kanbanOnly: false });
    store.reviews.update((list) => [...list, ...[1, 2, 3].map((i) => note(`nfeita0${i}`, `Feita ${i}`, { category: 'Estudos', doneAt: T0 }))]);
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const links = [...host.querySelectorAll<HTMLAnchorElement>('.abas-quadros a.aba')].map((a) => a.querySelector('app-cat-label')!.textContent!.trim());
    expect(links).toEqual(['Trabalho', 'Estudos']);
    // na ordem montada à mão, a dela
    TestBed.inject(Settings).setNotesConfig({ orderBy: 'minha', order: ['estudos', 'trabalho'] });
    await settle();
    expect([...host.querySelectorAll<HTMLAnchorElement>('.abas-quadros a.aba')].map((a) => a.querySelector('app-cat-label')!.textContent!.trim())).toEqual(['Estudos', 'Trabalho']);
  });

  it('o grupo é o mesmo no mural e no Kanban: o quadro aberto abre a aba dele no mural, e a aba do mural abre o quadro dela', async () => {
    TestBed.inject(Mural).kind.set('anotacoes');
    const view = TestBed.inject(WallView);
    kanban.state.set(state(board()));
    await go(`/anotacoes/kanban/${EST}`);
    expect(view.activeTab()).toBe('c:estudos');
    // no mural, o Trabalho: o Kanban abre nele
    view.setNoteTab('c:trabalho');
    await settle();
    expect(localStorage.getItem(KANBAN_LAST_KEY)).toContain(TRAB);
    await go('/anotacoes/kanban');
    expect(router.url).toBe(TRAB_URL);
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

  it('a ficha do quadro é enxuta: sem tachinha e sem a categoria; a contagem diz "anotações"', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const fichas = column('afazer').querySelectorAll('app-review-card');
    expect(fichas.length).toBe(2);
    expect(column('afazer').querySelector('.aba-cat')).toBeNull();
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
    expect(mexer.getAttribute('aria-label')).toBe('Etapa, assunto, importância, observação, dependências e tags de Sincronizar quadros');
    mexer.click();
    await settle();
    const sheet = host.querySelector('app-kanban-card-sheet')!;
    expect(sheet.querySelector('.sub')!.textContent).toContain('No quadro de Trabalho');
    // a tag de outra anotação da categoria está à mão, em contorno
    const op = () => [...sheet.querySelectorAll<HTMLButtonElement>('.tag-op')].find((b) => b.textContent!.includes('Correção'))!;
    expect(op().getAttribute('aria-pressed')).toBe('false');
    op().click();
    await settle();
    expect(store.get('nsync001')!.tags).toEqual(['Correção']);
    expect(op().getAttribute('aria-pressed')).toBe('true');
    op().click();
    await settle();
    expect(store.get('nsync001')!.tags).toBeUndefined();
    // uma tag nova: amarrada na anotação e com uma das cores, sorteada
    const input = sheet.querySelector<HTMLInputElement>('app-tag-picker input')!;
    input.value = 'Urgente';
    input.dispatchEvent(new Event('input'));
    await settle();
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(store.get('nsync001')!.tags).toEqual(['Urgente']);
    // a cor nasce na categoria da anotação
    expect(TestBed.inject(Settings).tagColor('Urgente', 'Trabalho')).toBeTruthy();
    expect(TestBed.inject(Settings).tagColor('Urgente', 'Estudos')).toBeUndefined();
  });

  /** A folha das configurações chega num pedaço à parte (@defer): espera por ela. */
  async function configSheet(): Promise<HTMLElement> {
    for (let i = 0; i < 100 && !host.querySelector('app-mural-config dialog'); i++) await settle();
    return host.querySelector<HTMLElement>('app-mural-config')!;
  }

  it('a engrenagem é a do mural: num grupo só dela, abrindo as mesmas configurações, com a parte Quadro', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const gear = host.querySelector<HTMLButtonElement>('button[aria-label="Configurações do mural"]')!;
    // sozinha no grupo dela, do tamanho da do mural
    expect(gear.parentElement!.classList).toContain('pasta-grupo');
    expect(gear.parentElement!.children.length).toBe(1);
    expect(gear.querySelector('svg')!.getAttribute('width')).toBe('18');
    expect(host.querySelector('button[aria-label="Ajustes do quadro"]')).toBeNull();
    gear.click();
    await settle();
    expect(gear.getAttribute('aria-expanded')).toBe('true');
    const sheet = await configSheet();
    expect(sheet.querySelector('h2')!.textContent).toBe('Configurações do mural');
    expect([...sheet.querySelectorAll('.parte-nome')].map((t) => t.textContent!.trim())).toEqual(['Padrões', 'Grupos', 'Assuntos', 'Tags', 'Quadro']);
    sheet.querySelector<HTMLButtonElement>('#config-aba-quadro')!.click();
    await settle();
    expect(sheet.querySelector('h3')!.textContent).toBe('Quadro');
    expect(sheet.querySelector('.lead')!.textContent!.replace(/\s+/g, ' ')).toContain('O quadro de Trabalho no Kanban: 3 colunas e 2 anotações.');
    // fechar devolve o foco à engrenagem
    sheet.querySelector('dialog')!.close();
    await settle();
    expect(host.querySelector('app-mural-config')).toBeNull();
    expect(document.activeElement).toBe(gear);
  });

  it('pelas configurações, a cor das tags do grupo muda a ficha do quadro junto', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    host.querySelector<HTMLButtonElement>('button[aria-label="Configurações do mural"]')!.click();
    const sheet = await configSheet();
    sheet.querySelector<HTMLButtonElement>('#config-aba-tags')!.click();
    await settle();
    const grupo = sheet.querySelector('[aria-label="Tags de Trabalho"]')!;
    expect([...grupo.querySelectorAll('.tag-previa')].map((t) => t.textContent!.trim())).toEqual(['Correção']);
    grupo.querySelector<HTMLButtonElement>('app-tag-colors [aria-label="Verde"]')!.click();
    await settle();
    // só no grupo do quadro
    expect(TestBed.inject(Settings).tagColor('correcao', 'Trabalho')).toBe('verde');
    expect(TestBed.inject(Settings).tagColor('correcao', 'Estudos')).toBeUndefined();
    expect(column('afazer').querySelector('[data-nota="nlogin01"] app-note-tag')!.classList).toContain('cor');
    grupo.querySelector<HTMLButtonElement>('app-tag-colors [aria-label="Sem cor"]')!.click();
    await settle();
    expect(TestBed.inject(Settings).tagColor('correcao', 'Trabalho')).toBeUndefined();
    expect(column('afazer').querySelector('[data-nota="nlogin01"] app-note-tag')!.classList).not.toContain('cor');
  });

  it('o Quadro das configurações recomeça o quadro depois da pergunta', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const ask = spyOn(TestBed.inject(Confirm), 'ask').and.resolveTo(true);
    host.querySelector<HTMLButtonElement>('button[aria-label="Configurações do mural"]')!.click();
    const sheet = await configSheet();
    sheet.querySelector<HTMLButtonElement>('#config-aba-quadro')!.click();
    await settle();
    sheet.querySelector<HTMLButtonElement>('.papel.perigo')!.click();
    await settle();
    expect(ask.calls.mostRecent().args[0].title).toBe('Recomeçar o quadro de Trabalho?');
    expect(host.querySelector('app-mural-config')).toBeNull();
    expect(kanban.get(TRAB)!.cards).toEqual([]);
    expect(host.querySelectorAll('.coluna .lugar').length).toBe(0);
    expect(kanban.get(TRAB)!.columns.map((c) => c.name)).toEqual(['A fazer', 'Fazendo', 'Feito']);
    // as anotações continuam no mural
    expect(store.get('nlogin01')).toBeTruthy();
  });

  it('pela engrenagem do mural, a folha não tem a parte Quadro', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    host.querySelector<HTMLButtonElement>('button[aria-label="Configurações do mural"]')!.click();
    let sheet = await configSheet();
    // a última parte aberta foi o Quadro: sem quadro, a folha abre nos Padrões
    sheet.querySelector<HTMLButtonElement>('#config-aba-quadro')!.click();
    await settle();
    sheet.querySelector('dialog')!.close();
    await settle();
    const solo = TestBed.createComponent(MuralConfig);
    document.body.appendChild(solo.nativeElement);
    await solo.whenStable();
    sheet = solo.nativeElement;
    expect([...sheet.querySelectorAll('.parte-nome')].map((t) => t.textContent!.trim())).toEqual(['Padrões', 'Grupos', 'Assuntos', 'Tags']);
    expect(sheet.querySelector('h3')!.textContent).toBe('Padrões');
    sheet.querySelector('dialog')!.close();
    solo.nativeElement.remove();
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
    // nenhuma regra mostra a etiqueta só porque o foco está em algum lugar da ficha: só a mão em
    // cima ou o teclado num dos botões dela
    const rules = [...document.styleSheets].flatMap((sh) => {
      try {
        return [...sh.cssRules].map((r) => r.cssText);
      } catch {
        return [];
      }
    });
    const shows = rules.filter((r) => /\.acoes/.test(r) && /opacity:\s*1/.test(r));
    expect(shows.length).toBeGreaterThan(0);
    expect(shows.filter((r) => r.includes(':focus-within'))).toEqual([]);
    expect(shows.every((r) => r.includes(':hover') || r.includes(':focus-visible') || r.includes('hover: none') || !r.includes('{'))).toBeTrue();
    // e, quando o foco pega na ficha, ela continua sem a etiqueta
    const li = host.querySelector<HTMLElement>('[data-nota="nlogin01"]')!;
    li.querySelector<HTMLElement>('.hit')!.focus();
    if (li.contains(document.activeElement)) expect(getComputedStyle(li.querySelector('.acoes')!).opacity).toBe('0');
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

  describe('dependências', () => {
    /** O login depende de sincronizar (aberta, A fazer) e da prova (de Estudos, finalizada). */
    function withDeps(): KanbanBoard {
      const b = board();
      b.cards[0] = { ...b.cards[0], deps: ['nsync001', 'nprova01'] };
      return b;
    }
    const selo = (id: string) => host.querySelector<HTMLButtonElement>(`[data-nota="${id}"] app-kanban-deps .selo`);
    const tira = (id: string) => host.querySelector<HTMLElement>(`[data-nota="${id}"] .tira-deps`)!;

    beforeEach(() => store.update({ ...store.get('nprova01')!, doneAt: T0 }));

    it('o selo na ficha, ao lado da importância: o desenho e quantas já foram finalizadas, de quantas', async () => {
      kanban.state.set(state(withDeps()));
      await go(TRAB_URL);
      expect(selo('nlogin01')!.closest('.pe')).not.toBeNull();
      expect(selo('nlogin01')!.querySelector('lucide-icon')).not.toBeNull();
      expect(selo('nlogin01')!.textContent!.trim()).toBe('1/2');
      expect(selo('nlogin01')!.getAttribute('aria-label')).toBe('Dependências: 1 de 2 finalizadas. Ver');
      expect(selo('nlogin01')!.classList).not.toContain('prontas');
      // sem dependência, sem selo (e sem importância, sem o pé)
      expect(selo('nsync001')).toBeNull();
      expect(host.querySelector('[data-nota="nsync001"] .pe')).toBeNull();
      // todas finalizadas: verde
      store.update({ ...store.get('nsync001')!, doneAt: T0 });
      await settle();
      expect(selo('nlogin01')!.textContent!.trim()).toBe('2/2');
      expect(selo('nlogin01')!.classList).toContain('prontas');
      // na vista Só os títulos também, na tira
      host.querySelector<HTMLButtonElement>('.pasta button[aria-label="Só os títulos"]')!.click();
      await settle();
      expect(host.querySelector('[data-nota="nlogin01"] .tira app-kanban-deps.mini .selo')!.textContent!.trim()).toBe('2/2');
    });

    it('com o mouse parado no selo, a tira mostra cada uma: o check, o nome que abre a leitura e onde ela está', async () => {
      kanban.state.set(state(withDeps()));
      await go(TRAB_URL);
      const open = spyOn(TestBed.inject(Desk), 'openReview');
      selo('nlogin01')!.parentElement!.dispatchEvent(new PointerEvent('pointerenter', { pointerType: 'mouse' }));
      await new Promise((r) => setTimeout(r, 300));
      await settle();
      expect(tira('nlogin01').matches(':popover-open')).toBeTrue();
      expect(tira('nlogin01').querySelector('.numero')!.textContent).toBe('1 de 2');
      const rows = [...tira('nlogin01').querySelectorAll('.dep')];
      expect(rows.map((r) => r.querySelector('.nome')!.textContent!.trim())).toEqual(['Sincronizar quadros', 'Prova']);
      expect(rows.map((r) => r.querySelector('.onde')!.textContent!.trim())).toEqual(['A fazer', 'Estudos · Fora do quadro']);
      expect(rows.map((r) => r.classList.contains('feita'))).toEqual([false, true]);
      // o check finaliza ali mesmo, e a conta acompanha
      rows[0].querySelector<HTMLButtonElement>('.caixa')!.click();
      await settle();
      expect(isDone(store.get('nsync001')!)).toBeTrue();
      expect(selo('nlogin01')!.textContent!.trim()).toBe('2/2');
      // o nome abre a leitura (e a tira fecha)
      tira('nlogin01').querySelector<HTMLButtonElement>('.dep .nome')!.click();
      await settle();
      expect(open).toHaveBeenCalledWith('nsync001');
      expect(tira('nlogin01').matches(':popover-open')).toBeFalse();
    });

    it('o clique (ou o toque) no selo abre a tira, e "Mudar as dependências" abre a folha da anotação', async () => {
      kanban.state.set(state(withDeps()));
      await go(TRAB_URL);
      selo('nlogin01')!.click();
      await settle();
      expect(tira('nlogin01').matches(':popover-open')).toBeTrue();
      // o clique no selo não abre a leitura nem começa a arrastar
      expect(host.querySelector('app-kanban-card-sheet')).toBeNull();
      tira('nlogin01').querySelector<HTMLButtonElement>('.mudar')!.click();
      await settle();
      expect(host.querySelector('app-kanban-card-sheet .deps-linha .nome')!.textContent!.trim()).toBe('Depende de');
    });

    it('a folha da anotação põe dependência (o seletor esconde as que fariam roda) e tira', async () => {
      kanban.state.set(state(withDeps()));
      await go(TRAB_URL);
      column('afazer').querySelector<HTMLButtonElement>('[data-nota="nsync001"] .mexer')!.click();
      await settle();
      const sheet = host.querySelector('app-kanban-card-sheet')!;
      expect(sheet.querySelectorAll('.dep').length).toBe(0);
      sheet.querySelector<HTMLButtonElement>('.por-dep')!.click();
      await settle();
      const picker = sheet.querySelector('app-card-picker dialog')!;
      // nem ela mesma, nem o login (que depende dela); de qualquer grupo; a prova está finalizada (escondida pelo filtro)
      const listed = () => [...picker.querySelectorAll('.escolha .nome')].map((n) => n.textContent!.trim());
      expect(listed()).toEqual(['Sem categoria']);
      picker.querySelector<HTMLButtonElement>('.filtro[aria-pressed="true"]')!.click();
      await settle();
      expect(listed()).toEqual(['Prova', 'Sem categoria']);
      picker.querySelector<HTMLButtonElement>('.escolha')!.click();
      await settle();
      expect(kanban.get(TRAB)!.cards.find((c) => c.note === 'nsync001')!.deps).toEqual(['nprova01']);
      const rows = [...sheet.querySelectorAll('.dep')];
      expect(rows.map((r) => r.querySelector('.dep-onde')!.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Finalizada Estudos · Fora do quadro']);
      expect(rows[0].classList).toContain('feita');
      sheet.querySelector<HTMLButtonElement>('.dep .tirar')!.click();
      await settle();
      expect(kanban.get(TRAB)!.cards.find((c) => c.note === 'nsync001')!.deps).toBeUndefined();
      expect(sheet.querySelectorAll('.dep').length).toBe(0);
    });

    it('a seta pergunta antes de finalizar com dependência aberta', async () => {
      const b = withDeps();
      b.cards[0] = { ...b.cards[0], column: 'fazendo' };
      kanban.state.set(state(b));
      await go(TRAB_URL);
      const ask = spyOn(TestBed.inject(Confirm), 'ask').and.resolveTo(false);
      host.querySelector<HTMLButtonElement>('[data-nota="nlogin01"] .acoes .avancar')!.click();
      await settle();
      expect(ask).toHaveBeenCalledTimes(1);
      expect(ask.calls.mostRecent().args[0].confirm).toBe('Finalizar mesmo assim');
      expect(namesIn('fazendo')).toEqual(['nlogin01']);
      expect(isDone(store.get('nlogin01')!)).toBeFalse();
      ask.and.resolveTo(true);
      host.querySelector<HTMLButtonElement>('[data-nota="nlogin01"] .acoes .avancar')!.click();
      await settle();
      expect(cardsIn(kanban.get(TRAB)!, 'feito').map((c) => c.note)).toEqual(['nlogin01']);
      expect(isDone(store.get('nlogin01')!)).toBeTrue();
    });
  });

  it('Pular esta coluna, nos ajustes dela: a seta das colunas da esquerda passa direto por ela', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const seta = (id: string) => host.querySelector<HTMLButtonElement>(`[data-nota="${id}"] .acoes .avancar`);
    column('fazendo').querySelector<HTMLButtonElement>('.etiqueta-btn')!.click();
    await settle();
    const sheet = host.querySelector('app-kanban-column-sheet')!;
    const sw = [...sheet.querySelectorAll<HTMLButtonElement>('.interruptor')].find((b) => b.getAttribute('aria-labelledby') === 'ca-pula')!;
    expect(sheet.querySelector('#ca-pula')!.textContent!.trim()).toBe('Pular esta coluna');
    expect(sheet.querySelector('#ca-pula-d')!.textContent).toContain('leva a anotação para “Feito”');
    expect(sw.getAttribute('aria-checked')).toBe('false');
    sw.click();
    await settle();
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(kanban.get(TRAB)!.columns[1].skip).toBeTrue();
    // a seta de A fazer diz e leva para Feito
    expect(seta('nlogin01')!.title).toBe('Levar para Feito');
    seta('nlogin01')!.click();
    await settle();
    expect(cardsIn(kanban.get(TRAB)!, 'feito').map((c) => c.note)).toEqual(['nlogin01']);
    expect(isDone(store.get('nlogin01')!)).toBeTrue();
    // arrastando (pelo teclado), ela ainda chega na coluna pulada
    host.querySelector(`[data-nota="nsync001"] .hit`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    await settle();
    expect(cardsIn(kanban.get(TRAB)!, 'fazendo').map((c) => c.note)).toContain('nsync001');
    // e a coluna pulada continua com a seta dela
    expect(seta('nsync001')!.title).toBe('Levar para Feito');
  });

  it('a seta some quando todas as colunas depois são puladas', async () => {
    const b = board();
    b.columns[1].skip = true;
    b.columns[2].skip = true;
    kanban.state.set(state(b));
    await go(TRAB_URL);
    expect(host.querySelector('[data-nota="nlogin01"] .acoes .avancar')).toBeNull();
    expect(host.querySelector('[data-nota="nlogin01"] .acoes .mexer')).not.toBeNull();
    column('fazendo').querySelector<HTMLButtonElement>('.etiqueta-btn')!.click();
    await settle();
    expect(host.querySelector('app-kanban-column-sheet #ca-pula-d')!.textContent).toContain('sem outra coluna depois, ela não aparece');
  });

  it('a contagem fica na ponta direita da etiqueta, no mesmo lugar com nome curto ou longo', async () => {
    const b = board();
    b.columns[0].name = 'Ok';
    b.columns[1].name = 'Esperando a resposta do cliente sobre o orçamento';
    kanban.state.set(state(b));
    await go(TRAB_URL);
    const gap = (id: string) => {
      const h = column(id).querySelector('.etiqueta-nome')!.getBoundingClientRect();
      const n = column(id).querySelector('.etiqueta-n')!.getBoundingClientRect();
      return { right: h.right - n.right, middle: Math.abs((n.top + n.bottom) / 2 - (h.top + h.bottom) / 2), lines: h.height };
    };
    const curto = gap('afazer');
    const longo = gap('fazendo');
    expect(longo.lines).toBeGreaterThan(curto.lines);
    expect(Math.abs(curto.right)).toBeLessThan(1);
    expect(Math.abs(longo.right)).toBeLessThan(1);
    expect(curto.middle).toBeLessThan(3);
    expect(longo.middle).toBeLessThan(3);
    // o nome continua sendo o texto do título, com a contagem para o leitor de tela
    expect(columnName(column('afazer').querySelector('.etiqueta-nome')!)).toBe('Ok');
  });

  it('a seta põe a anotação no topo da coluna seguinte, em cima das que já estavam lá', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const seta = (id: string) => host.querySelector<HTMLButtonElement>(`[data-nota="${id}"] .acoes .avancar`)!;
    seta('nsync001').click();
    await settle();
    seta('nlogin01').click();
    await settle();
    expect(namesIn('fazendo')).toEqual(['nlogin01', 'nsync001']);
    expect(cardsIn(kanban.get(TRAB)!, 'fazendo')[0].note).toBe('nlogin01');
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

  it('o assunto: abre a linha da data na ficha; o filtro da pasta (antes das tags) esconde os outros, e a nova nasce no único ligado', async () => {
    store.update({ ...store.get('nlogin01')!, subject: 'Site' });
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const kicker = column('afazer').querySelector('[data-nota="nlogin01"] .assunto')!;
    expect(kicker.textContent!.replace('Assunto: ', '').trim()).toBe('Site');
    expect(column('afazer').querySelector('[data-nota="nsync001"] .assunto')).toBeNull();
    const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.pasta-baixo app-subject-chips .assunto')];
    // impresso em tinta, de A a Z, e "Sem assunto" no fim, com quantas cada um mostra
    expect(chips().map((b) => b.textContent!.replace(/\s+/g, ' ').trim())).toEqual(['Site, 1', 'Sem assunto, 1']);
    chips()[0].click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01']);
    expect(chips()[0].getAttribute('aria-pressed')).toBe('true');
    expect(host.querySelector('.achados')?.textContent).toContain('Mostrando 1 de 2');
    // a anotação nova pedida da coluna nasce no assunto ligado
    const spy = spyOn(TestBed.inject(Desk), 'newNoteIn');
    column('afazer').querySelector<HTMLButtonElement>('.adicionar-btn')!.click();
    await settle();
    [...column('afazer').querySelectorAll<HTMLButtonElement>('.adicionar-op')].find((b) => b.textContent!.includes('Nova nota'))!.click();
    await settle();
    expect(spy).toHaveBeenCalledWith('Trabalho', undefined, 'Site');
    host.querySelector<HTMLButtonElement>('.achados .tinta-link')!.click();
    await settle();
    expect(namesIn('afazer')).toEqual(['nlogin01', 'nsync001']);
    expect(chips().every((b) => b.getAttribute('aria-pressed') === 'false')).toBeTrue();
  });

  it('o assunto na folha da anotação: os do grupo à mão; escolher muda a anotação', async () => {
    store.update({ ...store.get('nlogin01')!, subject: 'Site' });
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    column('afazer').querySelector<HTMLButtonElement>('[data-nota="nsync001"] .mexer')!.click();
    await settle();
    const sheet = host.querySelector('app-kanban-card-sheet')!;
    const op = () => [...sheet.querySelectorAll<HTMLButtonElement>('app-subject-picker .op')].find((b) => b.textContent!.includes('Site'))!;
    expect(op().getAttribute('aria-checked')).toBe('false');
    op().click();
    await settle();
    expect(store.get('nsync001')!.subject).toBe('Site');
    sheet.querySelector<HTMLButtonElement>('app-subject-picker .nenhum')!.click();
    await settle();
    expect(store.get('nsync001')!.subject).toBeUndefined();
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
    const veu = (lado: string) => host.querySelector(`.veu-${lado}`)!.classList;
    expect(veu('fim')).toContain('on');
    expect(veu('inicio')).not.toContain('on');
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
    expect(veu('inicio')).toContain('on');
    expect(host.querySelector('.trilho-inicio .seta-quadro')).not.toBeNull();
    // no fim, a beirada da direita volta a ser nítida e a seta dela sai
    q.scrollLeft = q.scrollWidth;
    q.dispatchEvent(new Event('scroll'));
    await frames();
    expect(veu('fim')).not.toContain('on');
    expect(host.querySelector('.trilho-fim')).toBeNull();
  });

  it('o degradê é a parede do site por cima das beiradas, e não uma máscara no quadro que rola', async () => {
    const many = board();
    many.columns = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `Etapa ${i + 1}`, icon: 'circulo' as const, color: 'cinza' as const, finishes: false }));
    kanban.state.set(state(many));
    await go(TRAB_URL);
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    await settle();
    const q = host.querySelector<HTMLElement>('.quadro')!;
    expect(getComputedStyle(q).maskImage).toBe('none');
    // a rolagem de lado numa camada própria: desliza o que já está desenhado, sem redesenhar as fichas
    expect(getComputedStyle(q).willChange).toBe('scroll-position');
    // a de eucatex (a de sempre) é o fundo da página: a do véu começa no alto da página, na largura dela
    const paredes = [...host.querySelectorAll<HTMLElement>('.veu .veu-parede')];
    expect(paredes.length).toBe(2);
    for (const p of paredes) {
      expect(p.querySelector('[data-parede]')!.getAttribute('data-parede')).toBe('eucatex');
      expect(p.classList).toContain('na-pagina');
      const r = p.getBoundingClientRect();
      expect(Math.abs(r.top + scrollY)).toBeLessThan(2);
      expect(Math.abs(r.width - document.documentElement.clientWidth)).toBeLessThan(2);
    }
    // por cima das colunas, sem pegar o mouse
    expect(getComputedStyle(host.querySelector('.veu')!).pointerEvents).toBe('none');
    // as outras paredes ficam presas na tela, como a do site
    TestBed.inject(ProfileStore).update((p) => ({ ...p, page: 'planta' }));
    await settle();
    for (const p of host.querySelectorAll<HTMLElement>('.veu .veu-parede')) {
      expect(p.classList).not.toContain('na-pagina');
      expect(getComputedStyle(p).position).toBe('fixed');
    }
  });

  it('o quadro que rola de lado não mostra a barra de rolagem (nem guarda o lugar dela)', async () => {
    const many = board();
    many.columns = Array.from({ length: 9 }, (_, i) => ({ id: `c${i}`, name: `Etapa ${i + 1}`, icon: 'circulo' as const, color: 'cinza' as const, finishes: false }));
    kanban.state.set(state(many));
    await go(TRAB_URL);
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    await settle();
    const q = host.querySelector<HTMLElement>('.quadro')!;
    expect(q.scrollWidth).toBeGreaterThan(q.clientWidth);
    expect(getComputedStyle(q).scrollbarWidth).toBe('none');
    expect(q.offsetHeight - q.clientHeight).toBe(0);
  });

  it('com poucas colunas, o quadro cabe: nem degradê nem seta', async () => {
    const one = board();
    one.columns = one.columns.slice(0, 1);
    one.cards = one.cards.filter((c) => c.column === 'afazer');
    kanban.state.set(state(one));
    await go(TRAB_URL);
    for (let i = 0; i < 3; i++) await new Promise((r) => requestAnimationFrame(r));
    await settle();
    expect(host.querySelector('.veu-inicio')!.classList).not.toContain('on');
    expect(host.querySelector('.veu-fim')!.classList).not.toContain('on');
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

  it('o card padrão da coluna: ligar veste as anotações dela (na cor da etiqueta), o estojo monta o card, e a Nova nota já nasce vestida', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    column('fazendo').querySelector<HTMLButtonElement>('.etiqueta-btn')!.click();
    await settle();
    const sheet = () => host.querySelector('app-kanban-column-sheet')!;
    const sw = [...sheet().querySelectorAll<HTMLButtonElement>('.interruptor')].find((b) => b.getAttribute('aria-labelledby') === 'ca-card')!;
    expect(sw.getAttribute('aria-checked')).toBe('false');
    expect(sheet().querySelector('.padrao')).toBeNull();
    // mover para lá veste depois de ligar
    sw.click();
    await settle();
    expect(sw.getAttribute('aria-checked')).toBe('true');
    expect(kanban.get(TRAB)!.columns[1].look).toEqual({ stock: 'amarelo' });
    expect(sheet().querySelector('.padrao app-review-card')).not.toBeNull();
    host.querySelector(`[data-nota="nlogin01"] .hit`)!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    await settle();
    expect(store.get('nlogin01')!.stock).toBe('amarelo');
    // o estojo: a folha Card padrão, por cima, com a ficha de prévia; Usar este card guarda e veste
    sheet().querySelector<HTMLButtonElement>('.padrao .montar')!.click();
    await settle();
    await new Promise((r) => setTimeout(r, 50));
    await settle();
    const tpl = host.querySelector('app-kanban-template-sheet')!;
    expect(tpl.querySelector('dialog[open] h2')!.textContent).toContain('Card padrão');
    expect(tpl.querySelector('.previa app-review-card')).not.toBeNull();
    [...tpl.querySelectorAll<HTMLButtonElement>('.foot button')].find((b) => b.textContent!.includes('Usar este card'))!.click();
    await settle();
    expect(host.querySelector('app-kanban-template-sheet')).toBeNull();
    expect(kanban.get(TRAB)!.columns[1].dresses).toBeTrue();
    // a Nova nota da coluna abre o editor já com o card
    const desk = TestBed.inject(Desk);
    const spy = spyOn(desk, 'newNoteIn');
    column('fazendo').querySelector<HTMLButtonElement>('.adicionar-btn')!.click();
    await settle();
    [...column('fazendo').querySelectorAll<HTMLButtonElement>('.adicionar-op')].find((b) => b.textContent!.includes('Nova nota'))!.click();
    expect(spy).toHaveBeenCalledWith('Trabalho', kanban.get(TRAB)!.columns[1].look);
    // desligar: as que estão lá continuam vestidas (o visual já é delas)
    sw.click();
    await settle();
    expect(store.get('nlogin01')!.stock).toBe('amarelo');
  });

  it('as saídas do Adicionar são a etiqueta de papel: sem contorno de tinta, com o meio-corte tracejado por dentro', async () => {
    await go(`/anotacoes/kanban/${EST}`);
    column(kanban.boardFor('Estudos').columns[1].id).querySelector<HTMLButtonElement>('.adicionar-btn')!.click();
    await settle();
    const op = host.querySelector<HTMLButtonElement>('.adicionar-op')!;
    const look = getComputedStyle(op);
    // colada rente: só sombra para fora, nada de contorno de tinta por dentro
    expect(look.boxShadow).not.toContain('inset');
    expect(look.backgroundColor).not.toBe('rgba(0, 0, 0, 0)');
    const corte = getComputedStyle(op, '::after');
    expect(corte.borderTopStyle).toBe('dashed');
    expect(corte.pointerEvents).toBe('none');
    // desligada, sobra só o corte: sem papel nem sombra (sem a transição, para ler o fim dela)
    op.style.transition = 'none';
    op.disabled = true;
    expect(getComputedStyle(op).backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(op).boxShadow).toBe('none');
    expect(getComputedStyle(op, '::after').borderTopStyle).toBe('dashed');
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
      // no pé da coluna (rolada até o fim, se ela não couber na tela do teste): a vaga para antes da sem importância
      const rolo = column('afazer').querySelector<HTMLElement>('.rolo')!;
      rolo.scrollTop = rolo.scrollHeight;
      const foot = [...column('afazer').querySelectorAll('.lugar')].at(-1)!.getBoundingClientRect().bottom - 2;
      window.dispatchEvent(new PointerEvent('pointermove', at(afazer.left + afazer.width / 2, foot)));
      await settle();
      expect(namesIn('afazer')).toEqual(['nlogin01', 'nalfa001', 'nmeio001', 'nsync001']);
      expect(column('afazer').querySelectorAll('.lugar')[2].classList).toContain('vaga');
      window.dispatchEvent(new PointerEvent('pointerup', at(afazer.left + afazer.width / 2, foot)));
      await settle();
      expect(namesIn('afazer')).toEqual(['nlogin01', 'nalfa001', 'nmeio001', 'nsync001']);
      expect(cardsIn(kanban.get(TRAB)!, 'afazer').map((c) => c.note)).toEqual(['nlogin01', 'nsync001', 'nalfa001', 'nmeio001']);
    });
  });

  it('mover uma anotação não desliga o filtro das tags (só trocar de quadro)', async () => {
    kanban.state.set(state(board()));
    await go(TRAB_URL);
    const chips = () => [...host.querySelectorAll<HTMLButtonElement>('.pasta-baixo app-tag-chips .atalho')];
    chips()[0].click();
    await settle();
    host.querySelector('[data-nota="nlogin01"] .hit')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', shiftKey: true, bubbles: true }));
    await settle();
    expect(namesIn('fazendo')).toEqual(['nlogin01']);
    expect(chips()[0].getAttribute('aria-pressed')).toBe('true');
  });

  describe('colunas compridas', () => {
    /** Trabalho com 23 anotações em Feito (a coluna das finalizadas). */
    function long(): KanbanBoard {
      const b = board();
      const ids = Array.from({ length: 23 }, (_, i) => `nfeit${String(i).padStart(3, '0')}`);
      store.reviews.update((rs) => [...rs, ...ids.map((id, i) => note(id, `Feita ${i + 1}`, { category: 'Trabalho' }))]);
      return { ...b, cards: [...b.cards, ...ids.map((id) => ({ note: id, column: 'feito', importance: null }))] };
    }

    it('mostram as 10 primeiras e o "Mostrar mais 5" no pé; a última leva das que faltam', async () => {
      kanban.state.set(state(long()));
      await go(TRAB_URL);
      expect(namesIn('feito').length).toBe(10);
      // a contagem da etiqueta continua contando todas
      expect(column('feito').querySelector('.etiqueta-n')!.textContent).toContain('23');
      const mais = () => column('feito').querySelector<HTMLButtonElement>('.mais');
      expect(mais()!.textContent!.replace(/\s+/g, ' ').trim()).toBe('Mostrar mais 5 , faltam 13');
      // a coluna com poucas não tem botão
      expect(column('afazer').querySelector('.mais')).toBeNull();
      mais()!.click();
      await settle();
      expect(namesIn('feito').length).toBe(15);
      mais()!.click();
      await settle();
      expect(namesIn('feito').length).toBe(20);
      expect(mais()!.textContent).toContain('Mostrar mais 3');
      const focused = spyOn(HTMLElement.prototype, 'focus').and.callThrough();
      mais()!.click();
      await settle();
      expect(namesIn('feito').length).toBe(23);
      expect(mais()).toBeNull();
      await settle();
      // o botão sumiu: o foco vai para a primeira das que chegaram
      // (na suíte inteira o foco às vezes não pega no headless: confere a quem ele foi dado)
      expect(focused.calls.all().map((c) => (c.object as HTMLElement).closest('.lugar')?.getAttribute('data-nota'))).toContain('nfeit020');
    });

    it('cada coluna rola por dentro: a altura dela cabe na tela e a página não cresce com ela', async () => {
      kanban.state.set(state(long()));
      await go(TRAB_URL);
      column('feito').querySelector<HTMLButtonElement>('.mais')!.click();
      await settle();
      const rolo = column('feito').querySelector<HTMLElement>('.rolo')!;
      expect(getComputedStyle(rolo).overflowY).toBe('auto');
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      const topo = parseFloat(host.querySelector<HTMLElement>('app-kanban-page')!.style.getPropertyValue('--kb-topo'));
      // a tela menos as abas e a pasta, a folga em cima delas (12px) e a das sombras embaixo (34px)
      expect(column('feito').getBoundingClientRect().height).toBeLessThanOrEqual(Math.max(360, innerHeight - topo - 46) + 1);
      expect(rolo.scrollHeight).toBeGreaterThan(rolo.clientHeight);
      // a sombra do pé diz que há mais embaixo; rolando até o fim, ela sai e a do alto aparece
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      expect(rolo.parentElement!.classList).toContain('abaixo');
      rolo.scrollTop = rolo.scrollHeight;
      rolo.dispatchEvent(new Event('scroll'));
      await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      expect(rolo.parentElement!.classList).toContain('acima');
      expect(rolo.parentElement!.classList).not.toContain('abaixo');
    });

    it('as colunas cabem na tela junto com as abas e a pasta, medida de novo quando a pasta cresce', async () => {
      kanban.state.set(state(long()));
      await go(TRAB_URL);
      const frames = () => new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
      await frames();
      const page = host.querySelector<HTMLElement>('app-kanban-page')!;
      const topo = () => parseFloat(page.style.getPropertyValue('--kb-topo'));
      // do alto das abas ao alto das colunas (o quadro tem 8px de folga em cima)
      const measured = () => host.querySelector('.quadro')!.getBoundingClientRect().top + 8 - host.querySelector('.abas-quadros')!.getBoundingClientRect().top;
      expect(Math.abs(topo() - measured())).toBeLessThanOrEqual(1);
      expect(getComputedStyle(column('feito')).maxHeight).toBe(`${Math.max(360, innerHeight - topo() - 46)}px`);
      // a página acaba no pé do quadro: sem a folga de baixo das outras páginas
      expect(getComputedStyle(page).marginBottom).toMatch(/^(-?0px|-\d+px)$/);
      // a pasta mais alta (as tags que quebram em outra linha, o "Mostrando 3 de 9"): as colunas encolhem para caber
      const before = topo();
      host.querySelector<HTMLElement>('.pasta-baixo')!.style.minHeight = '120px';
      await frames();
      expect(topo()).toBeGreaterThan(before);
      expect(Math.abs(topo() - measured())).toBeLessThanOrEqual(1);
    });

    it('a sombra da última ficha se apaga dentro da coluna, sem ser cortada pela beirada do rolo', async () => {
      kanban.state.set(state(long()));
      await go(TRAB_URL);
      for (const id of ['afazer', 'feito']) {
        const rolo = column(id).querySelector<HTMLElement>('.rolo')!;
        rolo.scrollTop = rolo.scrollHeight;
        const last = [...rolo.querySelectorAll('.lugar app-kanban-note')].at(-1)!.getBoundingClientRect();
        const end = rolo.querySelector('.mais')?.getBoundingClientRect().bottom ?? last.bottom;
        // a sombra das fichas (--shadow-card) é forte nos primeiros 20px e se apaga até uns 30px
        expect(rolo.getBoundingClientRect().bottom - end).toBeGreaterThanOrEqual(29);
      }
      // o Adicionar sobe o mesmo tanto: entre a última e ele, a folga de antes mais a da sombra
      const rolo = column('afazer').querySelector<HTMLElement>('.rolo')!;
      expect(column('afazer').querySelector('.adicionar')!.getBoundingClientRect().top - rolo.getBoundingClientRect().bottom).toBeLessThanOrEqual(5);
    });

    it('a anotação que desce além das que estão à mostra continua à vista', async () => {
      kanban.state.set(state(long()));
      await go(TRAB_URL);
      // a 10ª desce uma: a coluna passa a mostrar 15
      host.querySelector('[data-nota="nfeit009"] .hit')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', shiftKey: true, bubbles: true }));
      await settle();
      expect(namesIn('feito').length).toBe(15);
      expect(namesIn('feito')[10]).toBe('nfeit009');
    });

    it('soltar depois da última à mostra cai antes das que o "Mostrar mais" guarda', async () => {
      kanban.state.set(state(long()));
      await go(TRAB_URL);
      const grab = host.querySelector<HTMLElement>('.lugar[data-nota="nlogin01"] .hit')!;
      const r = grab.getBoundingClientRect();
      const at = (x: number, y: number) => ({ bubbles: true, cancelable: true, button: 0, isPrimary: true, pointerId: 1, pointerType: 'mouse', clientX: x, clientY: y });
      grab.dispatchEvent(new PointerEvent('pointerdown', at(r.left + 20, r.top + 10)));
      window.dispatchEvent(new PointerEvent('pointermove', at(r.left + 40, r.top + 30)));
      await settle();
      const rolo = column('feito').querySelector<HTMLElement>('.rolo')!;
      rolo.scrollTop = rolo.scrollHeight;
      const feito = column('feito').getBoundingClientRect();
      const last = [...column('feito').querySelectorAll('.lugar:not(.vaga)')].at(-1)!.getBoundingClientRect();
      window.dispatchEvent(new PointerEvent('pointermove', at(feito.left + feito.width / 2, last.bottom - 2)));
      await settle();
      window.dispatchEvent(new PointerEvent('pointerup', at(feito.left + feito.width / 2, last.bottom - 2)));
      await settle();
      const ids = cardsIn(kanban.get(TRAB)!, 'feito').map((c) => c.note);
      expect(ids.indexOf('nlogin01')).toBe(10);
      expect(namesIn('feito')).toContain('nlogin01');
    });
  });
  describe('status', () => {
    const withStatus = () => {
      const b = board();
      b.cards[0] = { ...b.cards[0], status: 'Aguardando cliente' };
      b.cards[1] = { ...b.cards[1], status: 'Sérgio' };
      return b;
    };

    it('na ficha, a etiqueta da importância com as palavras da pessoa, logo depois da importância; tocar abre a folha', async () => {
      kanban.state.set(state(withStatus()));
      await go(TRAB_URL);
      const pe = column('afazer').querySelector<HTMLElement>('[data-nota="nlogin01"] app-review-card .pe')!;
      expect([...pe.children].map((e) => e.className.split(' ')[0])).toEqual(['imp', 'status']);
      const status = pe.querySelector<HTMLButtonElement>('.status')!;
      expect(status.textContent!.trim()).toBe('Aguardando cliente');
      expect(status.getAttribute('aria-label')).toBe('Observação: Aguardando cliente. Mudar');
      // a mesma etiqueta de bloco da importância: a letra de etiqueta, na tinta preta
      expect(getComputedStyle(status).fontFamily).toBe(getComputedStyle(pe.querySelector('.imp')!).fontFamily);
      expect(getComputedStyle(status).color).toBe('rgb(21, 21, 21)');
      // só com status (sem importância), o pé aparece com ele
      expect(column('afazer').querySelector('[data-nota="nsync001"] .pe .status')!.textContent!.trim()).toBe('Sérgio');
      expect(column('afazer').querySelector('[data-nota="nsync001"] .pe .imp')).toBeNull();
      status.click();
      await settle();
      expect(host.querySelector<HTMLInputElement>('app-kanban-card-sheet .status-valor input')!.value).toBe('Aguardando cliente');
    });

    it('com o status, a fileira do pé desce de linha em vez de cobrir a ficha de baixo', async () => {
      kanban.state.set(state(withStatus()));
      await go(TRAB_URL);
      const card = column('afazer').querySelector<HTMLElement>('[data-nota="nlogin01"] app-review-card')!;
      const pe = card.querySelector<HTMLElement>('.pe')!;
      expect(getComputedStyle(pe).position).toBe('relative');
      // metade para fora da ficha, como a de antes
      expect(Math.round(pe.getBoundingClientRect().bottom - card.getBoundingClientRect().bottom)).toBeGreaterThan(0);
    });

    it('"Só os títulos": a etiqueta pequena na tira, e o leitor de tela diz', async () => {
      kanban.state.set(state(withStatus()));
      await go(TRAB_URL);
      host.querySelector<HTMLButtonElement>('.pasta button[aria-label="Só os títulos"]')!.click();
      await settle();
      const tira = column('afazer').querySelector('[data-nota="nlogin01"] .tira')!;
      expect(tira.querySelector('.status-mini')!.textContent!.trim()).toBe('Aguardando cliente');
      expect(tira.querySelector('.tira-nome')!.getAttribute('aria-label')).toBe('Corrigir o login, importância crítico, observação Aguardando cliente');
      expect(column('afazer').querySelector('[data-nota="nsync001"] .status-mini')!.textContent!.trim()).toBe('Sérgio');
    });

    it('"Só os títulos": cabendo, numa linha com a importância; com muita coisa, o status sobe para cima do selo e da importância', async () => {
      const b = withStatus();
      b.cards[0] = { ...b.cards[0], status: 'Aguardando a assinatura do', deps: ['nprova01'] };
      b.cards[1] = { ...b.cards[1], importance: 'baixo' };
      kanban.state.set(state(b));
      await go(TRAB_URL);
      host.querySelector<HTMLButtonElement>('.pasta button[aria-label="Só os títulos"]')!.click();
      await settle();
      const top = (id: string, sel: string) => column('afazer').querySelector(`[data-nota="${id}"] .tira ${sel}`)!.getBoundingClientRect();
      // curto: lado a lado, o status antes da importância
      expect(Math.abs(top('nsync001', '.status-mini').top - top('nsync001', '.imp-mini').top)).toBeLessThan(6);
      expect(top('nsync001', '.status-mini').right).toBeLessThan(top('nsync001', '.imp-mini').left);
      // com muita coisa: o status em cima, o selo e a importância embaixo, na mesma linha
      expect(top('nlogin01', '.status-mini').bottom).toBeLessThanOrEqual(top('nlogin01', '.imp-mini').top + 2);
      expect(Math.abs(top('nlogin01', '.selo').top - top('nlogin01', '.imp-mini').top)).toBeLessThan(6);
      // e o nome fica com pelo menos metade da tira
      expect(top('nlogin01', '.tira-nome').width).toBeGreaterThanOrEqual(top('nlogin01', '').width * 0.4);
    });

    it('a folha escreve o status (vale no Enter, ao sair do campo ou ao fechar) e o x tira', async () => {
      kanban.state.set(state(board()));
      await go(TRAB_URL);
      const cardOf = (id: string) => kanban.get(TRAB)!.cards.find((c) => c.note === id)!;
      column('afazer').querySelector<HTMLButtonElement>('[data-nota="nsync001"] .mexer')!.click();
      await settle();
      const sheet = host.querySelector('app-kanban-card-sheet')!;
      expect(sheet.querySelector('label[for$="-status"]')!.textContent!.trim()).toBe('Observação');
      const input = sheet.querySelector<HTMLInputElement>('.status-valor input')!;
      expect(input.value).toBe('');
      expect(sheet.querySelector('.status-valor .tirar')).toBeNull();
      input.value = '  Em   revisão ';
      input.dispatchEvent(new Event('input'));
      await settle();
      // escrevendo, ainda não guardou
      expect(cardOf('nsync001').status).toBeUndefined();
      input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
      await settle();
      expect(cardOf('nsync001').status).toBe('Em revisão');
      expect(column('afazer').querySelector('[data-nota="nsync001"] .pe .status')!.textContent!.trim()).toBe('Em revisão');
      // ao sair do campo
      input.value = 'Com o Sérgio';
      input.dispatchEvent(new Event('input'));
      input.dispatchEvent(new Event('change'));
      await settle();
      expect(cardOf('nsync001').status).toBe('Com o Sérgio');
      // o x tira
      sheet.querySelector<HTMLButtonElement>('.status-valor .tirar')!.click();
      await settle();
      expect(cardOf('nsync001').status).toBeUndefined();
      expect(input.value).toBe('');
      expect(column('afazer').querySelector('[data-nota="nsync001"] .pe')).toBeNull();
      // fechar a folha (o Esc, ou o x) guarda o que estava escrito
      input.value = 'Aguardando cliente';
      input.dispatchEvent(new Event('input'));
      sheet.querySelector<HTMLDialogElement>('dialog')!.close();
      await settle();
      expect(cardOf('nsync001').status).toBe('Aguardando cliente');
    });
  });
});
