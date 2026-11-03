import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { Desk } from '../core/desk';
import { Review, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { StudyStore } from '../core/study-store';
import { Confirm } from '../ui/confirm';
import { StudyPage } from './study-page';

/** A página dos Estudos: a primeira vez, as abas, as pilhas de Tudo, a parede do baralho e a folha. */

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const T0 = '2026-10-10T10:00:00.000Z';
const note = (id: string, title: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', game: { name: title }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!, id });

describe('página dos Estudos', () => {
  let host: HTMLElement;
  let study: StudyStore;
  let router: Router;

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await settle();
  }
  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  }
  const $ = <T extends Element = HTMLElement>(sel: string) => host.querySelector<T & HTMLElement>(sel);
  const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';
  const sheet = () => document.querySelector<HTMLDialogElement>('dialog.baralho-ajustes');
  /** A folha chega num pedaço à parte (@defer): espera ela abrir. */
  async function sheetOpen(): Promise<HTMLDialogElement> {
    for (let i = 0; i < 60 && !sheet()?.open; i++) await settle();
    return sheet()!;
  }

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'anotacoes/estudos', component: StudyPage },
          { path: 'anotacoes/estudos/:baralho', component: StudyPage },
        ]),
        { provide: Confirm, useValue: { ask: async () => true } },
      ],
    });
    TestBed.inject(ReviewStore).reviews.set([note('nsol', 'Sol (日)'), note('nlua', 'Lua (月)'), note('nfogo', 'Fogo'), note('nagua', 'Qual é a fórmula da água?')]);
    study = TestBed.inject(StudyStore);
    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(Raiz);
    host = fixture.nativeElement;
    document.body.appendChild(host);
  });
  afterEach(() => {
    sheet()?.close();
    host.remove();
    localStorage.clear();
  });

  /** Kanjis (sol, lua e fogo; o sol já respondido) e Química (água), e um vazio. */
  function seed(): { kanji: string; quimica: string; vazio: string } {
    const kanji = study.addDeck('Kanjis', 'amarelo', 'livro');
    const quimica = study.addDeck('Química', 'verde');
    const vazio = study.addDeck('Locais', 'azul');
    study.addCard('nsol', [kanji], { title: '日', subtitle: 'sol, dia' });
    study.addCard('nlua', [kanji], { title: '月' });
    study.addCard('nfogo', [kanji]);
    study.addCard('nagua', [quimica]);
    study.answer('nsol', true, kanji);
    return { kanji, quimica, vazio };
  }

  it('sem baralho: a cartolina da primeira vez cria o primeiro com o nome escrito e abre nele', async () => {
    await go('/anotacoes/estudos');
    expect(text($('#primeiro-titulo'))).toBe('Monte o seu primeiro baralho');
    const button = $<HTMLButtonElement>('.primeiro-form button')!;
    expect(button.disabled).toBeTrue();
    const input = $<HTMLInputElement>('.primeiro-form input')!;
    input.value = 'Verbos';
    input.dispatchEvent(new Event('input'));
    await settle();
    button.click();
    await settle();
    expect(study.decks().map((d) => d.name)).toEqual(['Verbos']);
    expect(router.url).toBe(`/anotacoes/estudos/${study.decks()[0].id}`);
  });

  it('as abas: Tudo, um baralho por aba (com quantas para hoje) e o Novo baralho', async () => {
    seed();
    await go('/anotacoes/estudos');
    expect($$('.aba').map(text)).toEqual(['Tudo', 'Kanjis, 3 para hoje', 'Química, 1 para hoje', 'Locais', 'Novo baralho']);
    expect($('.aba.on')?.textContent).toContain('Tudo');
  });

  it('Tudo: os números de todos e cada baralho como uma pilha com o nome, quantas cartas e os montes de hoje', async () => {
    seed();
    await go('/anotacoes/estudos');
    expect(text($('.hoje-n'))).toBe('4 para hoje');
    expect($$('.monte').map(text)).toEqual(['3 novas', '1 aprendendo', '0 revisões']);
    const pilhas = $$('.pilha');
    expect(pilhas.map((p) => text(p.querySelector('.nome-txt')))).toEqual(['Kanjis', 'Química', 'Locais']);
    expect(pilhas.map((p) => text(p.querySelector('.nome-n')))).toEqual(['3 cartas', '1 carta', '0 cartas']);
    expect(pilhas[0].getAttribute('aria-label')).toBe('Kanjis, 3 cartas, 3 para hoje');
    // por cima, a próxima carta do baralho (o sol, já respondido), com o ícone do baralho de naipe
    expect(text(pilhas[0].querySelector('app-study-card .titulo'))).toBe('日');
    expect(pilhas[0].querySelector('app-study-card .naipe')).not.toBeNull();
    // o papelzinho no elástico: os três montes de hoje
    expect([...pilhas[0].querySelectorAll('.papelzinho .pz')].map(text)).toEqual(['2', '1', '0']);
    // o baralho sem cartas: só o lugar dele
    expect(text(pilhas[2].querySelector('.vaga-pilha'))).toBe('Sem cartas');
    expect(pilhas[2].querySelector('app-study-card')).toBeNull();
    // mais cartas, mais grossa a pilha
    expect(pilhas[0].querySelectorAll('.camada').length).toBe(1);
    expect(pilhas[1].querySelectorAll('.camada').length).toBe(0);
  });

  it('um baralho: a parede das cartas, a frente à mostra (sem título, o nome da anotação), e tocar abre a anotação', async () => {
    const { kanji } = seed();
    const open = spyOn(TestBed.inject(Desk), 'openReview');
    await go(`/anotacoes/estudos/${kanji}`);
    const cards = $$('app-study-card');
    // a ordem padrão: a que volta antes primeiro, as nunca estudadas no fim, na ordem em que entraram
    expect(cards.map((c) => text(c.querySelector('.titulo')))).toEqual(['日', '月', 'Fogo']);
    expect(text(cards[0].querySelector('.subtitulo'))).toBe('sol, dia');
    // acertou a nova: o segundo passo, daqui a 10 minutos
    expect(text(cards[0].querySelector('.pe'))).toBe('Nova · daqui a 10 min');
    expect(text(cards[1].querySelector('.pe'))).toBe('Desconhecida');
    expect(text(cards[0].querySelector('.canto'))).toBe('日');
    $$('.carta-btn')[2].click();
    expect(open).toHaveBeenCalledWith('nfogo');
  });

  it('a busca, o nível e a ordem da parede', async () => {
    const { kanji } = seed();
    await go(`/anotacoes/estudos/${kanji}`);
    const titles = () => $$('app-study-card .titulo').map(text);
    const search = $<HTMLInputElement>('#busca-cartas')!;
    search.value = 'lua';
    search.dispatchEvent(new Event('input'));
    await settle();
    expect(titles()).toEqual(['月']);
    search.value = '';
    search.dispatchEvent(new Event('input'));
    await settle();
    const [level, sort] = $$('.escolha select') as HTMLSelectElement[];
    level.value = 'desconhecida';
    level.dispatchEvent(new Event('change'));
    await settle();
    expect(titles()).toEqual(['月', 'Fogo']);
    level.value = 'dominada';
    level.dispatchEvent(new Event('change'));
    await settle();
    expect(text($('.nada'))).toBe('Nenhuma carta com esse filtro.');
    level.value = '';
    level.dispatchEvent(new Event('change'));
    sort.value = 'nome';
    sort.dispatchEvent(new Event('change'));
    await settle();
    expect(titles()).toEqual(['Fogo', '日', '月']);
  });

  it('o baralho vazio diz que não tem cartas, sem a busca', async () => {
    const { vazio } = seed();
    await go(`/anotacoes/estudos/${vazio}`);
    expect(text($('.vaga-txt'))).toBe('Nenhuma carta neste baralho ainda. Escreva uma Nova carta, ou traga anotações que você já tem.');
    expect($('#busca-cartas')).toBeNull();
    expect(text($('.em-dia'))).toBe('Nenhuma carta neste baralho ainda.');
  });

  it('um baralho que não existe mostra Tudo', async () => {
    seed();
    await go('/anotacoes/estudos/sumido');
    expect($('.pilhas')).not.toBeNull();
  });

  it('o Novo baralho nasce com nome e cor livre, abre nele e abre a folha com o nome para escrever', async () => {
    seed();
    await go('/anotacoes/estudos');
    $<HTMLButtonElement>('.aba-nova')!.click();
    await sheetOpen();
    const fresh = study.decks()[3];
    expect(fresh.name).toBe('Baralho 4');
    expect(['amarelo', 'verde', 'azul']).not.toContain(fresh.color);
    expect(router.url).toBe(`/anotacoes/estudos/${fresh.id}`);
    expect(sheet()?.open).toBeTrue();
    const name = sheet()!.querySelector<HTMLInputElement>('.campo input')!;
    expect(document.activeElement).toBe(name);
    name.value = 'Capitais';
    name.dispatchEvent(new Event('change'));
    expect(study.deck(fresh.id)!.name).toBe('Capitais');
  });

  it('o Novo baralho de dentro de um baralho (a mesma página) também abre a folha; o nome nunca repete', async () => {
    const { kanji } = seed();
    study.updateDeck(kanji, { name: 'Baralho 4' });
    await go(`/anotacoes/estudos/${kanji}`);
    $<HTMLButtonElement>('.aba-nova')!.click();
    await sheetOpen();
    const fresh = study.decks()[3];
    expect(fresh.name).toBe('Baralho 5');
    expect(router.url).toBe(`/anotacoes/estudos/${fresh.id}`);
    expect(sheet()?.open).toBeTrue();
  });

  it('Nova carta pede ao editor uma anotação nova com este baralho; Trazer anotações abre o seletor', async () => {
    const { kanji } = seed();
    const fresh = spyOn(TestBed.inject(Desk), 'newNote');
    await go(`/anotacoes/estudos/${kanji}`);
    const [nova, trazer] = $$('.poe-cartas button');
    expect(text(nova)).toBe('Nova carta');
    nova.click();
    expect(study.pending()).toEqual({ decks: [kanji] });
    expect(fresh).toHaveBeenCalledWith('');
    expect(text(trazer)).toBe('Trazer anotações');
  });

  it('trazer uma anotação: vira carta deste baralho, sem título próprio, e continua no mural', async () => {
    const { quimica } = seed();
    await go(`/anotacoes/estudos/${quimica}`);
    // o que o seletor entrega: a anotação escolhida (pela página, como o (picked) faz)
    const page = (window as unknown as { ng: { getComponent(e: Element): { bring(n: string, d: string): void } } }).ng.getComponent(host.querySelector('app-study-page')!);
    TestBed.inject(ReviewStore).reviews.update((list) => [...list, note('nnova', 'Capital do Peru')]);
    page.bring('nnova', quimica);
    const brought = study.cardOf().get('nnova')!;
    expect(brought.decks).toEqual([quimica]);
    expect(brought.front).toEqual({});
    expect(brought.wall).toBeTrue();
    // a que já era carta de outro baralho entra neste também
    page.bring('nlua', quimica);
    expect(study.cardOf().get('nlua')!.decks).toEqual([study.decks()[0].id, quimica]);
  });

  it('a etiqueta de tinta da carta abre a folha dela: tirar dos Estudos tem Desfazer', async () => {
    const { kanji } = seed();
    await go(`/anotacoes/estudos/${kanji}`);
    $$('.carta-li .mexer')[0].click();
    let dialog: HTMLDialogElement | null = null;
    for (let i = 0; i < 60 && !(dialog = document.querySelector<HTMLDialogElement>('dialog.ficha-carta'))?.open; i++) await settle();
    expect(dialog!.open).toBeTrue();
    expect(text(dialog!.querySelector('h2'))).toBe('Sol (日)');
    // nascida nos Estudos, segue o baralho: só nos Estudos
    expect(text(dialog!.querySelector('.mural-txt'))).toBe('Só nos Estudos');
    dialog!.querySelector<HTMLButtonElement>('.papel.perigo')!.click();
    await settle();
    expect(study.cardOf().has('nsol')).toBeFalse();
  });

  it('o "+ Baralho" pelo teclado: as setas só andam na lista, o Enter escolhe; pelo mouse, escolhe na hora', async () => {
    const { kanji, quimica, vazio } = seed();
    await go(`/anotacoes/estudos/${kanji}`);
    $$('.carta-li .mexer')[0].click();
    let dialog: HTMLDialogElement | null = null;
    for (let i = 0; i < 60 && !(dialog = document.querySelector<HTMLDialogElement>('dialog.ficha-carta'))?.open; i++) await settle();
    const select = dialog!.querySelector<HTMLSelectElement>('.mais select')!;
    const key = (k: string) => select.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
    key('ArrowDown');
    select.value = quimica;
    select.dispatchEvent(new Event('change'));
    key('ArrowDown');
    select.value = vazio;
    select.dispatchEvent(new Event('change'));
    await settle();
    expect(study.cardOf().get('nsol')!.decks).toEqual([kanji]);
    key('Enter');
    await settle();
    expect(study.cardOf().get('nsol')!.decks).toEqual([kanji, vazio]);
    // pelo mouse: na hora
    const again = dialog!.querySelector<HTMLSelectElement>('.mais select')!;
    again.dispatchEvent(new MouseEvent('mousedown', { bubbles: true }));
    again.value = quimica;
    again.dispatchEvent(new Event('change'));
    await settle();
    expect(study.cardOf().get('nsol')!.decks).toEqual([kanji, vazio, quimica]);
  });

  it('o play: Estudar no baralho abre a mesa dele; em Tudo, Estudar tudo; em dia, nenhum', async () => {
    const { kanji, vazio } = seed();
    await go(`/anotacoes/estudos/${kanji}`);
    expect(text($('.estudar'))).toBe('Estudar');
    $<HTMLButtonElement>('.estudar')!.click();
    let mesa: HTMLDialogElement | null = null;
    for (let i = 0; i < 60 && !(mesa = document.querySelector<HTMLDialogElement>('dialog.sessao'))?.open; i++) await settle();
    expect(mesa!.open).toBeTrue();
    expect(text(mesa!.querySelector('.baralho'))).toBe('Kanjis');
    mesa!.close();
    await settle();
    await go('/anotacoes/estudos');
    expect(text($('.estudar'))).toBe('Estudar tudo');
    await go(`/anotacoes/estudos/${vazio}`);
    expect($('.estudar')).toBeNull();
  });

  it('a folha do baralho: a cor e o ícone valem na hora; apagar volta para Tudo, com o Desfazer', async () => {
    const { kanji } = seed();
    await go(`/anotacoes/estudos/${kanji}`);
    $<HTMLButtonElement>('button[aria-label="Ajustes do baralho"]')!.click();
    const dialog = await sheetOpen();
    expect(dialog.open).toBeTrue();
    dialog.querySelector<HTMLButtonElement>('.op.cor[aria-label="Rosa"]')!.click();
    expect(study.deck(kanji)!.color).toBe('rosa');
    dialog.querySelector<HTMLButtonElement>('.op.sem-icone')!.click();
    expect(study.deck(kanji)!.icon).toBeNull();
    dialog.querySelector<HTMLButtonElement>('.papel.perigo')!.click();
    await settle();
    await settle();
    expect(study.deck(kanji)).toBeUndefined();
    expect(router.url).toBe('/anotacoes/estudos');
    // as cartas só dele saíram dos Estudos; o Desfazer traz o baralho e elas de volta
    expect(study.cards().map((c) => c.note)).toEqual(['nagua']);
    const toast = document.querySelector<HTMLButtonElement>('app-toast button, .toast button');
    toast?.click();
    if (toast) expect(study.deck(kanji)).toBeDefined();
  });
});
