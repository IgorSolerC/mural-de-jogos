import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { Desk } from '../core/desk';
import { Review, Stock, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Toasts } from '../ui/toast';
import { addStudyDays, dayStart, studyDay } from '../core/fsrs';
import { studyPath } from '../core/areas';
import { STUDY_SIZE_KEY, studyGroupId } from '../core/study';
import { StudyStore } from '../core/study-store';
import { WallView } from '../core/wall-view';
import { Confirm } from '../ui/confirm';
import { setEverythingNear } from '../ui/near-screen';
import { StudyPage } from './study-page';

/** A página dos Estudos: a primeira vez, as abas, as pilhas de Tudo, a parede do baralho e a folha. */

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const T0 = '2026-10-10T10:00:00.000Z';
const note = (id: string, title: string): Review => ({ ...sanitizeReview({ kind: 'anotacoes', category: 'Estudos', game: { name: title }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0 })!, id });

/** O endereço de um baralho do grupo Estudos (o das anotações daqui), e o do grupo. */
const GROUP = studyGroupId('Estudos');
const deckUrl = (id: string) => studyPath(GROUP, id);

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
    // a janela dos testes é baixa: tudo montado, menos no bloco que testa justamente isso
    setEverythingNear(true);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'anotacoes/estudos', component: StudyPage },
          { path: 'anotacoes/estudos/:grupo', component: StudyPage },
          { path: 'anotacoes/estudos/:grupo/:baralho', component: StudyPage },
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
    setEverythingNear(false);
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
    // no grupo escolhido na cartolina (o de sempre: o grupo Estudos)
    expect(study.decks()[0].group).toBe('Estudos');
    expect(router.url).toBe(deckUrl(study.decks()[0].id));
  });

  it('o grupo sem baralho: a cartolina do primeiro baralho dele, sem escolher o grupo', async () => {
    TestBed.inject(ReviewStore).reviews.update((list) => [...list, { ...note('ntrab', 'Reunião'), category: 'Trabalho' }]);
    seed();
    await go(studyPath(studyGroupId('Trabalho')));
    expect(text($('#primeiro-titulo'))).toBe('Monte o primeiro baralho de Trabalho');
    expect(text($('.primeiro-ficha p'))).toContain('Trabalho já tem 1 anotação.');
    expect($('.primeiro-grupo')).toBeNull();
    // a pasta do grupo continua, com a engrenagem, e diz que ainda não tem baralho
    expect(text($('.em-dia'))).toBe('Nenhum baralho em Trabalho ainda.');
    expect($('button[aria-label="Configurações dos estudos"]')).not.toBeNull();
    expect($('.novo-baralho')).toBeNull();
    const input = $<HTMLInputElement>('.primeiro-form input')!;
    input.value = 'Pautas';
    input.dispatchEvent(new Event('input'));
    await settle();
    $<HTMLButtonElement>('.primeiro-form button')!.click();
    await settle();
    const made = study.decks().find((d) => d.name === 'Pautas')!;
    expect(made.group).toBe('Trabalho');
    expect(router.url).toBe(studyPath(studyGroupId('Trabalho'), made.id));
  });

  it('as abas: Tudo e os grupos das anotações (com quantas para hoje); o grupo mostra só os baralhos dele', async () => {
    TestBed.inject(ReviewStore).reviews.update((list) => [...list, { ...note('ntcp', 'TCP'), category: 'Computação' }]);
    const { kanji } = seed();
    const redes = study.addDeck('Redes', 'rosa', null, undefined, 'Computação');
    study.addCard('ntcp', [redes]);
    await go('/anotacoes/estudos');
    // o Tudo sem número (a pasta logo embaixo diz quantas para hoje)
    expect($$('.abas:not(.medida) .aba').map(text)).toEqual(['Tudo', 'Estudos, 4 para hoje', 'Computação, 1 para hoje']);
    expect($('.aba.on')?.textContent).toContain('Tudo');
    // Tudo: uma seção por grupo, com a etiqueta de fita e o resumo
    expect($$('.grupo-pilhas').map((s) => `${text(s.querySelector('.tape-label'))}: ${text(s.querySelector('.grupo-sum'))}`)).toEqual(['Estudos: 3 baralhos · 4 cartas', 'Computação: 1 baralho · 1 carta']);
    expect(text($('.estudar'))).toBe('Estudar tudo');
    // o grupo: a aba aberta, só os baralhos dele, o Estudar o grupo e o Novo baralho
    await go(studyPath(GROUP));
    expect(text($('.aba.on'))).toBe('Estudos, 4 para hoje');
    expect($$('.pilha .nome-txt').map(text)).toEqual(['Kanjis', 'Química', 'Locais']);
    expect(text($('.hoje-n'))).toBe('4 para hoje');
    expect(text($('.estudar'))).toBe('Estudar o grupo');
    expect(text($('.novo-baralho'))).toBe('Novo baralho');
    // o baralho: a aba do grupo continua aberta, com o caminho de volta e o nome dele
    await go(deckUrl(kanji));
    expect(text($('.aba.on'))).toBe('Estudos, 4 para hoje');
    expect(text($('.trilha .voltar'))).toBe('Baralhos de Estudos');
    expect(text($('.trilha .nome-txt'))).toBe('Kanjis');
    expect($('.trilha .voltar')!.getAttribute('href')).toBe(studyPath(GROUP));
  });

  it('o topo do baralho: o caminho, o nome e o lápis juntos, na mesma linha do para hoje e do Estudar; a busca embaixo', async () => {
    const { kanji } = seed();
    await go(deckUrl(kanji));
    const line = $('.linha-estudo')!;
    // numa linha só, na ordem de quem estuda: o baralho, o que estudar hoje, e os controles
    expect([...line.children].map((c) => c.classList[0])).toEqual(['trilha', 'hoje', 'pasta-controles']);
    expect($('.trilha button[aria-label="Ajustes do baralho"]')).not.toBeNull();
    expect($('.pasta-controles button[aria-label="Ajustes do baralho"]')).toBeNull();
    // à mostra, só "Baralhos" (o grupo está na aba aberta); o leitor de tela e a dica dizem de qual grupo
    expect(text($('.voltar-nome'))).toBe('Baralhos');
    expect(text($('.voltar'))).toBe('Baralhos de Estudos');
    expect($('.voltar')!.getAttribute('title')).toBe('Voltar aos baralhos de Estudos');
    // os montes continuam dizendo o nome ao leitor de tela, mesmo quando a tela só mostra o selo e o número
    const montes = $$('.linha-estudo .monte');
    expect(montes.map((m) => text(m.querySelector('.monte-nome')))).toEqual([jasmine.stringMatching(/^novas?$/), 'aprendendo', jasmine.stringMatching(/^revis(ão|ões)$/)]);
    expect(montes.every((m) => m.getAttribute('title') === text(m))).toBeTrue();
    // a régua das cartas é a do mural e do Kanban: sem picote em cima, a busca e os controles
    const rule = $('.pasta-linha.filtros')!;
    expect(getComputedStyle(rule).borderTopStyle).toBe('none');
    expect(rule.firstElementChild!.classList).toContain('pasta-busca');
    expect(rule.lastElementChild!.classList).toContain('pasta-controles');
  });

  it('o baralho vazio mantém o caminho e o lápis, sem a régua de busca', async () => {
    const { vazio } = seed();
    await go(deckUrl(vazio));
    expect(text($('.trilha .nome-txt'))).toBe('Locais');
    expect($('.trilha button[aria-label="Ajustes do baralho"]')).not.toBeNull();
    expect($('.pasta-linha.filtros')).toBeNull();
    expect(text($('.linha-estudo .em-dia'))).toBe('Nenhuma carta neste baralho ainda.');
  });

  it('o endereço de antes dos grupos (/estudos/:baralho) leva ao baralho no grupo dele; o baralho de outro grupo, ao grupo', async () => {
    const { kanji } = seed();
    await go(`/anotacoes/estudos/${kanji}`);
    await settle();
    expect(router.url).toBe(deckUrl(kanji));
    expect(text($('.trilha .nome-txt'))).toBe('Kanjis');
    await go(studyPath(studyGroupId('Computação'), kanji));
    await settle();
    expect(router.url).toBe('/anotacoes/estudos');
  });

  describe('em Tudo, o Novo baralho', () => {
    const trigger = () => $<HTMLButtonElement>('.novo-baralho .gatilho')!;
    const list = () => $('.novo-baralho .cardapio')!;
    const options = () => $$('.novo-baralho [role=option]');
    const key = (k: string) => document.activeElement!.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    async function inTudo(): Promise<void> {
      // Trabalho: um grupo com anotações e ainda sem baralho
      TestBed.inject(ReviewStore).reviews.update((all) => [...all, { ...note('ntrab', 'Reunião'), category: 'Trabalho' }]);
      seed();
      await go('/anotacoes/estudos');
      // a lista fecha quando o botão sai da tela, e a janela dos testes é baixa: o botão fica à vista
      trigger().scrollIntoView({ block: 'center' });
    }

    it('tem o nome e o + do das outras abas, e diz que abre uma lista, fechada', async () => {
      await inTudo();
      expect(text(trigger())).toBe('Novo baralho');
      expect(trigger().querySelector('lucide-icon')).not.toBeNull();
      expect(trigger().getAttribute('aria-haspopup')).toBe('listbox');
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
      // o nome à mostra faz parte do nome ouvido
      expect(trigger().getAttribute('aria-label')).toContain('Novo baralho');
      expect(list().matches(':popover-open')).toBeFalse();
      // como os outros .tinta da pasta: em caixa alta e centrado (o botão de dentro do "Mais" não herda)
      const inside = trigger().querySelector<HTMLElement>('.novo-dentro')!;
      expect(getComputedStyle(inside).textTransform).toBe('uppercase');
      expect(getComputedStyle(inside).alignItems).toBe('center');
    });

    it('o clique abre o remendo com a pergunta e todos os grupos, até o sem baralho, só com o nome', async () => {
      await inTudo();
      trigger().click();
      await settle();
      expect(list().matches(':popover-open')).toBeTrue();
      expect(trigger().getAttribute('aria-expanded')).toBe('true');
      expect(text(list().querySelector('.legenda'))).toBe('Em qual grupo?');
      expect(options().map(text)).toEqual(['Estudos', 'Trabalho']);
      expect(options().map((o) => o.getAttribute('aria-label'))).toEqual(['Estudos', 'Trabalho']);
      expect(list().querySelector('.n')).toBeNull();
      expect(document.activeElement).toBe(options()[0]);
      // abrir não cria nada
      expect(study.decks().length).toBe(3);
    });

    it('escolher cria o baralho naquele grupo e abre nele, com a folha, como o das outras abas', async () => {
      await inTudo();
      trigger().click();
      await settle();
      options()[1].click();
      await sheetOpen();
      const made = study.decks()[3];
      expect(made.group).toBe('Trabalho');
      expect(router.url).toBe(studyPath(studyGroupId('Trabalho'), made.id));
      expect(sheet()?.open).toBeTrue();
    });

    it('pelo teclado: a seta abre e anda, e o Esc fecha sem criar nada, com o foco de volta no botão', async () => {
      await inTudo();
      trigger().focus();
      key('ArrowDown');
      await settle();
      expect(list().matches(':popover-open')).toBeTrue();
      key('ArrowDown');
      await settle();
      expect(document.activeElement).toBe(options()[1]);
      key('Escape');
      await settle();
      expect(list().matches(':popover-open')).toBeFalse();
      expect(document.activeElement).toBe(trigger());
      expect(study.decks().length).toBe(3);
    });

    it('o remendo que fecha sozinho (o toque fora) não cria nada', async () => {
      await inTudo();
      trigger().click();
      await settle();
      list().hidePopover();
      await settle();
      expect(trigger().getAttribute('aria-expanded')).toBe('false');
      expect(study.decks().length).toBe(3);
    });

    it('num grupo aberto, o botão continua direto, sem perguntar', async () => {
      await inTudo();
      await go(studyPath(GROUP));
      expect($('.novo-baralho .gatilho')).toBeNull();
      expect(text($('button.novo-baralho'))).toBe('Novo baralho');
    });
  });

  it('o grupo aberto abre no mural uma vez (não a cada minuto), e o grupo só com baralho não mexe no mural', async () => {
    const { kanji } = seed();
    const opened = spyOn(TestBed.inject(WallView), 'openGroup');
    await go(studyPath(GROUP));
    expect(opened.calls.allArgs()).toEqual([['Estudos']]);
    // o relógio anda (as contas refazem os grupos): nada de novo
    study.tick();
    await settle();
    expect(opened).toHaveBeenCalledTimes(1);
    // as anotações saem do grupo e só o baralho fica: o mural não tem a aba dele
    opened.calls.reset();
    const store = TestBed.inject(ReviewStore);
    store.reviews.update((list) => list.map((r) => ({ ...r, category: 'Outro' })));
    await go(studyPath(GROUP));
    expect(study.deck(kanji)).toBeTruthy();
    expect(opened).not.toHaveBeenCalled();
  });

  it('Estudar o grupo abre a mesa com os baralhos dele juntos', async () => {
    seed();
    await go(studyPath(GROUP));
    $<HTMLButtonElement>('.estudar')!.click();
    let mesa: HTMLDialogElement | null = null;
    for (let i = 0; i < 60 && !(mesa = document.querySelector<HTMLDialogElement>('dialog.sessao'))?.open; i++) await settle();
    expect(mesa!.open).toBeTrue();
    expect(text(mesa!.querySelector('.baralho'))).toBe('Estudos');
    mesa!.close();
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
    // por cima, a próxima carta do baralho (o sol, já respondido), na Clássica, sem o ícone nos cantos
    expect(text(pilhas[0].querySelector('app-study-card .titulo'))).toBe('日');
    expect(pilhas[0].querySelector('.capa .carta')!.classList).toContain('look-classica');
    expect(pilhas[0].querySelector('app-study-card .canto lucide-icon')).toBeNull();
    // o papelzinho no elástico: os três montes de hoje
    expect([...pilhas[0].querySelectorAll('.papelzinho .pz')].map(text)).toEqual(['2', '1', '0']);
    // o baralho sem cartas: só o lugar dele
    expect(text(pilhas[2].querySelector('.vaga-pilha'))).toBe('Sem cartas');
    expect(pilhas[2].querySelector('app-study-card')).toBeNull();
    // mais cartas, mais grossa a pilha
    expect(pilhas[0].querySelectorAll('.camada').length).toBe(1);
    expect(pilhas[1].querySelectorAll('.camada').length).toBe(0);
  });

  describe('só as cartas perto da tela ficam montadas', () => {
    let deck: string;
    /** Espera até valer (o observador e a fila respondem em quadros). */
    async function until(done: () => boolean, what: string): Promise<void> {
      for (let i = 0; i < 400 && !done(); i++) {
        await new Promise((r) => requestAnimationFrame(r));
        await settle();
      }
      expect(done()).withContext(what).toBeTrue();
    }
    const li = (i: number) => $$('.carta-li')[i];
    const isCard = (i: number) => !!li(i).querySelector('app-study-card');

    beforeEach(async () => {
      setEverythingNear(false);
      const ids = Array.from({ length: 300 }, (_, i) => `nmuitas${String(i).padStart(3, '0')}`);
      TestBed.inject(ReviewStore).reviews.set(ids.map((id, i) => note(id, `Carta ${i}`)));
      deck = study.addDeck('Muitas', 'azul');
      for (const id of ids) study.addCard(id, [deck]);
      await go(deckUrl(deck));
      $('.cartas')!.scrollIntoView({ block: 'start' });
    });
    afterEach(() => scrollTo(0, 0));

    it('monta as de perto; as de longe são vagas, com o botão e o nome no lugar (o Tab e o leitor de tela passam por todas)', async () => {
      await until(() => isCard(0), 'a primeira');
      expect($$('.carta-li').length).toBe(300);
      expect($$('.carta-btn').length).withContext('todos os botões').toBe(300);
      expect(isCard(299)).withContext('a última, longe').toBeFalse();
      expect(li(299).querySelector('.carta-vaga')).not.toBeNull();
      expect(li(299).querySelector('.carta-btn')!.getAttribute('aria-label')).toContain('Carta');
      // os ajustes só chegam com a carta
      expect(li(299).querySelector('.mexer')).toBeNull();
    });

    it('a vaga tem o tamanho da carta, nos dois tamanhos: a página não muda de altura quando ela chega', async () => {
      await until(() => isCard(0), 'a primeira');
      const size = (el: Element) => {
        const r = el.getBoundingClientRect();
        return { w: Math.round((el as HTMLElement).offsetWidth), h: Math.round(r.height), raw: r };
      };
      const box = (i: number) => li(i).getBoundingClientRect();
      expect(Math.abs(box(299).height - box(0).height)).withContext('grandes').toBeLessThanOrEqual(1);
      expect(size(li(299)).w).toBe(size(li(0)).w);
      $$('[aria-label^="Cartas pequenas"]')[0].click();
      await settle();
      await until(() => isCard(0), 'a primeira, pequena');
      expect(Math.abs(box(299).height - box(0).height)).withContext('pequenas').toBeLessThanOrEqual(1);
    });

    it('rolando até lá, a vaga vira carta e a que ficou para trás sai', async () => {
      await until(() => isCard(0), 'a primeira');
      li(299).scrollIntoView({ block: 'center' });
      await until(() => isCard(299), 'a última');
      await until(() => !isCard(0), 'a primeira saiu');
      // o foco do teclado numa carta longe (o Tab chega nela): o botão está lá
      expect(li(0).querySelector('.carta-btn')).not.toBeNull();
    });

    it('outra ordem: as cartas que chegam à tela já vêm montadas, sem passar por uma tela de vagas', async () => {
      await until(() => isCard(0), 'a primeira');
      const select = $<HTMLSelectElement>('select[aria-label="Ordenar por"]')!;
      select.value = 'nome';
      select.dispatchEvent(new Event('change'));
      await settle();
      expect(isCard(0)).toBeTrue();
      select.value = 'entrada';
      select.dispatchEvent(new Event('change'));
      await settle();
      expect(isCard(0)).toBeTrue();
    });

    it('filtrando, a carta que estava longe e sobe para a tela já vem montada', async () => {
      await until(() => isCard(0), 'a primeira');
      const input = $<HTMLInputElement>('#busca-cartas')!;
      input.value = 'Carta 299';
      input.dispatchEvent(new Event('input'));
      await settle();
      expect($$('.carta-li').length).toBe(1);
      $('.cartas')!.scrollIntoView({ block: 'start' });
      await settle();
      await until(() => isCard(0), 'a que sobrou');
    });

    it('a vaga também vira (o toque antes de a carta chegar não se perde), e o verso dela só monta perto da tela', async () => {
      await until(() => isCard(0), 'a primeira');
      const opened = spyOn(TestBed.inject(Desk), 'openReview');
      li(299).querySelector<HTMLElement>('.carta-btn')!.click();
      await settle();
      expect(opened).not.toHaveBeenCalled();
      expect(li(299).classList).toContain('virada');
      expect(li(299).querySelector('.verso')).withContext('longe, sem verso').toBeNull();
      li(299).scrollIntoView({ block: 'center' });
      await until(() => isCard(299), 'a última');
      expect(li(299).querySelector('.verso')).withContext('perto, com o verso').not.toBeNull();
    });
  });

  describe('o tamanho das cartas', () => {
    const size = (label: string) => $<HTMLButtonElement>(`[role="group"][aria-label="Tamanho das cartas"] button[aria-label^="${label}"]`)!;
    const columns = () => getComputedStyle($('.cartas')!).gridTemplateColumns.split(' ').length;

    it('as duas opções, depois do Ordenar: começa nas grandes; as pequenas são a mesma carta, 60% menor, e a escolha fica guardada', async () => {
      const { kanji } = seed();
      await go(deckUrl(kanji));
      // os botões de tinta do "Tipo de ficha" dos murais, na linha do Ordenar
      expect($$('.filtros .pasta-grupo').pop()!.getAttribute('aria-label')).toBe('Tamanho das cartas');
      expect(size('Cartas grandes').classList).toContain('so-icone');
      expect(size('Cartas grandes').getAttribute('aria-pressed')).toBe('true');
      expect(size('Cartas pequenas').getAttribute('aria-pressed')).toBe('false');
      expect($('.cartas.pequenas')).toBeNull();
      expect($('.carta-btn')!.hasAttribute('title')).toBeFalse();
      const big = $('.carta-btn')!.offsetWidth;
      const bigColumns = columns();
      const title = text($('app-study-card .titulo'));

      size('Cartas pequenas').click();
      await settle();
      expect(size('Cartas pequenas').getAttribute('aria-pressed')).toBe('true');
      expect(size('Cartas grandes').getAttribute('aria-pressed')).toBe('false');
      expect($('.cartas.pequenas')).not.toBeNull();
      expect(localStorage.getItem(STUDY_SIZE_KEY)).toBe('pequenas');
      // a grade cabe mais, com o botão perto de 40% do que era, na proporção da carta
      const button = $('.carta-btn')!;
      const card = $('.carta-btn app-study-card')!;
      expect(columns()).toBeGreaterThan(bigColumns);
      expect(button.offsetWidth).toBeLessThan(big * 0.6);
      expect(button.offsetHeight / button.offsetWidth).toBeCloseTo(7 / 5, 1);
      // por dentro, a carta segue do tamanho de sempre, e só o desenho encolhe: a miniatura proporcional
      expect(getComputedStyle(card).scale).toBe('0.4');
      expect(card.offsetWidth * 0.4).toBeCloseTo(button.offsetWidth, 0);
      expect(text($('app-study-card .titulo'))).toBe(title);
      // a letra do nível não se lê mais: o nome e o nível na dica
      expect($('.carta-btn')!.title).toBe($('.carta-btn')!.getAttribute('aria-label')!);

      size('Cartas grandes').click();
      await settle();
      expect($('.cartas.pequenas')).toBeNull();
      expect(localStorage.getItem(STUDY_SIZE_KEY)).toBe('grandes');
    });

    it('em tela de toque, a etiqueta dos ajustes sai só das cartas pequenas (sempre à mostra, tomaria o panorama)', async () => {
      const { kanji } = seed();
      localStorage.setItem(STUDY_SIZE_KEY, 'pequenas');
      await go(deckUrl(kanji));
      // o navegador dos testes tem mouse: a regra é lida da folha de estilos, e no mouse a etiqueta continua
      const onTouch: string[] = [];
      for (const sheet of [...document.styleSheets]) {
        for (const rule of [...sheet.cssRules]) {
          if (!(rule instanceof CSSMediaRule) || !rule.conditionText.includes('hover: none')) continue;
          for (const inner of [...rule.cssRules]) {
            if (inner instanceof CSSStyleRule && inner.selectorText.includes('.pequenas') && inner.style.display === 'none') onTouch.push(inner.selectorText);
          }
        }
      }
      expect(onTouch.length).toBe(1);
      expect(onTouch[0]).toContain('.acoes');
      if (!matchMedia('(hover: none)').matches) expect(getComputedStyle($('.acoes')!).display).not.toBe('none');
    });

    it('vale para os outros baralhos e volta guardada; o que não é um tamanho conhecido abre nas grandes', async () => {
      const { kanji, quimica, vazio } = seed();
      localStorage.setItem(STUDY_SIZE_KEY, 'pequenas');
      await go(deckUrl(kanji));
      expect($('.cartas.pequenas')).not.toBeNull();
      await go(deckUrl(quimica));
      expect($('.cartas.pequenas')).not.toBeNull();
      // sem cartas, não há o que diminuir
      await go(deckUrl(vazio));
      expect($('[aria-label="Tamanho das cartas"]')).toBeNull();
      // Tudo é outra rota: a página do baralho nasce de novo e lê o que está guardado
      localStorage.setItem(STUDY_SIZE_KEY, 'gigantes');
      await go('/anotacoes/estudos');
      await go(deckUrl(kanji));
      expect($('.cartas.pequenas')).toBeNull();
      expect(size('Cartas grandes').getAttribute('aria-pressed')).toBe('true');
    });
  });

  it('um baralho: a parede das cartas, a frente à mostra (sem título, o nome da anotação)', async () => {
    const { kanji } = seed();
    await go(deckUrl(kanji));
    const cards = $$('app-study-card');
    // a ordem padrão: a que volta antes primeiro, as nunca estudadas no fim, na ordem em que entraram
    expect(cards.map((c) => text(c.querySelector('.titulo')))).toEqual(['日', '月', 'Fogo']);
    expect(text(cards[0].querySelector('.subtitulo'))).toBe('sol, dia');
    // a Clássica, o padrão: o nome do baralho em cima, o selo do nível e quando volta no pé
    expect(cards.every((c) => c.querySelector('.carta')!.classList.contains('look-classica'))).toBeTrue();
    expect(text(cards[0].querySelector('.carta > .nome'))).toBe('Kanjis');
    // acertou a nova: o segundo passo, daqui a 10 minutos
    expect(text(cards[0].querySelector('.pe .selo-nivel'))).toBe('Nova');
    expect(text(cards[0].querySelector('.pe .volta'))).toBe('volta daqui a 10 min');
    expect(text(cards[1].querySelector('.pe'))).toBe('Desconhecida');
    expect(cards[1].querySelector('.pe .volta')).toBeNull();
    expect(text(cards[0].querySelector('.canto'))).toBe('日');
  });

  describe('virar a carta na parede', () => {
    const li = (i: number) => $$('.carta-li')[i];
    const btn = (i: number) => li(i).querySelector<HTMLElement>('.carta-btn')!;
    const back = (i: number) => li(i).querySelector<HTMLElement>('.verso');
    const turned = () => $$('.carta-li.virada').length;
    const voice = () => $$('.cartas ~ p[aria-live]').map(text).join(' ');
    /** A nota com texto, para o verso ter o que mostrar. */
    function write(id: string, body: string): void {
      TestBed.inject(ReviewStore).reviews.update((list) => list.map((n) => (n.id === id ? { ...n, text: body } : n)));
    }
    function focusDialog(): HTMLDialogElement | null {
      return document.querySelector<HTMLDialogElement>('app-study-card-focus dialog');
    }
    async function focusOpen(i = 0): Promise<HTMLDialogElement> {
      li(i).querySelector<HTMLElement>('.mexer[aria-label^="Maximizar"]')!.click();
      for (let n = 0; n < 60 && !focusDialog()?.open; n++) await settle();
      return focusDialog()!;
    }
    afterEach(() => focusDialog()?.close());

    it('tocar vira ali mesmo, sem abrir a anotação; tocar no verso volta', async () => {
      const { kanji } = seed();
      write('nsol', 'Leitura: nichi.');
      const open = spyOn(TestBed.inject(Desk), 'openReview');
      await go(deckUrl(kanji));
      const place = li(0).getBoundingClientRect();
      // a frente: sem verso montado, e o botão diz o que faz
      expect(back(0)).toBeNull();
      expect(btn(0).getAttribute('aria-pressed')).toBe('false');
      expect($('#' + btn(0).getAttribute('aria-describedby'))!.textContent).toContain('Vira a carta');

      btn(0).click();
      await settle();
      expect(open).not.toHaveBeenCalled();
      expect(li(0).querySelector('.giro')!.classList).toContain('virada');
      expect(btn(0).getAttribute('aria-pressed')).toBe('true');
      expect(voice()).toBe('Verso de 日');
      // o verso da mesa de estudo: a cartolina da anotação, com o texto dela
      expect(back(0)!.classList).toContain('cartolina');
      expect(back(0)!.hasAttribute('inert')).toBeFalse();
      expect(back(0)!.hasAttribute('aria-hidden')).toBeFalse();
      expect(text(back(0)!.querySelector('.verso-titulo'))).toContain('日');
      expect(text(back(0)!.querySelector('app-rich-text'))).toContain('Leitura: nichi.');
      // a carta não saiu do lugar nem mudou de tamanho
      const now = li(0).getBoundingClientRect();
      expect([now.left, now.top, now.width, now.height]).toEqual([place.left, place.top, place.width, place.height]);
      expect(back(0)!.offsetWidth).toBe(btn(0).offsetWidth);
      expect(back(0)!.offsetHeight).toBeCloseTo(btn(0).offsetHeight, -1);

      back(0)!.querySelector<HTMLElement>('.verso-titulo')!.click();
      await settle();
      expect(open).not.toHaveBeenCalled();
      expect(turned()).toBe(0);
      expect(voice()).toBe('Frente de 日');
      // fica montado para o giro de volta, sem ninguém alcançar
      expect(back(0)!.hasAttribute('inert')).toBeTrue();
      expect(back(0)!.getAttribute('aria-hidden')).toBe('true');
    });

    it('virar não conta como estudo: nada muda nas cartas nem no que está guardado', async () => {
      const { kanji } = seed();
      await go(deckUrl(kanji));
      const before = JSON.stringify(study.state());
      const answer = spyOn(study, 'answer').and.callThrough();
      btn(0).click();
      await settle();
      btn(0).click();
      await settle();
      const dialog = await focusOpen();
      dialog.querySelector<HTMLElement>('.mostrar')!.click();
      await settle();
      dialog.close();
      await settle();
      expect(answer).not.toHaveBeenCalled();
      expect(JSON.stringify(study.state())).toBe(before);
    });

    it('o que se toca no texto do verso é dele: não vira; marcar um trecho também não', async () => {
      const { kanji } = seed();
      write('nsol', 'Ver [[Lua (月)|a lua]] e ||segredo||.\n\nUm trecho para marcar.');
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      for (const el of [...back(0)!.querySelectorAll<HTMLElement>('.elo, .spoiler')]) {
        el.click();
        await settle();
        expect(turned()).withContext(el.className).toBe(1);
      }
      const para = [...back(0)!.querySelectorAll<HTMLElement>('.paragrafo')].pop()!;
      getSelection()!.selectAllChildren(para);
      para.click();
      await settle();
      expect(turned()).withContext('com o trecho marcado').toBe(1);
      getSelection()!.removeAllRanges();
      para.click();
      await settle();
      expect(turned()).withContext('o papel').toBe(0);
    });

    it('o clique não é cancelado (molde que devolve false cancelaria) e a carta é um botão de verdade: Esc volta', async () => {
      const { kanji } = seed();
      await go(deckUrl(kanji));
      expect(btn(0).tagName).toBe('BUTTON');
      expect(btn(0).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true }))).toBeTrue();
      await settle();
      expect(turned()).toBe(1);
      btn(0).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle();
      expect(turned()).toBe(0);
      expect(voice()).toBe('Frente de 日');
      // o Esc na carta de frente não faz nada
      btn(1).dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle();
      expect(turned()).toBe(0);
    });

    it('o foco dentro do verso passa para a carta quando ela vira de volta (não cai na página)', async () => {
      const { kanji } = seed();
      write('nsol', 'Ver [[Lua (月)|a lua]].');
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      back(0)!.querySelector<HTMLElement>('.elo')!.focus();
      back(0)!.querySelector<HTMLElement>('.elo')!.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await settle();
      expect(turned()).toBe(0);
      expect(document.activeElement).toBe(btn(0));
    });

    it('o Esc de fora volta a carta pequena crescida; nos campos e com uma folha aberta, o Esc é deles; as grandes só com o Esc nelas', async () => {
      const { kanji } = seed();
      const esc = (at: EventTarget) => at.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      esc(document.body);
      await settle();
      expect(turned()).withContext('grande, de fora').toBe(1);
      $<HTMLButtonElement>('button[aria-label^="Cartas pequenas"]')!.click();
      await settle();
      btn(0).click();
      await settle();
      esc($('#busca-cartas')!);
      await settle();
      expect(turned()).withContext('na busca').toBe(1);
      const dialog = await focusOpen();
      esc(document.body);
      await settle();
      expect(turned()).withContext('com a folha aberta e o foco solto').toBe(1);
      dialog.close();
      await settle();
      esc(document.body);
      await settle();
      expect(turned()).toBe(0);
      expect(voice()).toBe('Frente de 日');
    });

    it('o mesmo baralho com outro nome continua virado; a carta maximizada fecha ao ir para outro baralho', async () => {
      const { kanji, quimica } = seed();
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      study.updateDeck(kanji, { name: 'Kanjis 2' });
      await settle();
      expect(turned()).toBe(1);
      expect(back(0)).not.toBeNull();
      await focusOpen();
      await go(deckUrl(quimica));
      await settle();
      expect(focusDialog()).toBeNull();
    });

    it('a carta pequena crescida é empurrada de novo quando volta do filtro', async () => {
      const { kanji } = seed();
      localStorage.setItem(STUDY_SIZE_KEY, 'pequenas');
      await go(deckUrl(kanji));
      $('.cartas')!.scrollIntoView({ block: 'start' });
      btn(0).click();
      await settle();
      const search = $<HTMLInputElement>('#busca-cartas')!;
      search.value = 'lua';
      search.dispatchEvent(new Event('input'));
      await settle();
      search.value = '';
      search.dispatchEvent(new Event('input'));
      await settle();
      await new Promise((r) => requestAnimationFrame(r));
      await settle();
      expect(li(0).classList).toContain('virada');
      expect(li(0).style.getPropertyValue('--empurra-x')).toMatch(/px$/);
    });

    it('arrastar no verso (a barra de rolagem, um trecho) não vira; segurar o Espaço na maximizada vira uma vez só', async () => {
      const { kanji } = seed();
      write('nsol', 'Um texto.');
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      const title = back(0)!.querySelector<HTMLElement>('.verso-titulo')!;
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
      title.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 10, clientY: 90 }));
      await settle();
      expect(turned()).toBe(1);
      title.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, clientX: 10, clientY: 10 }));
      title.dispatchEvent(new MouseEvent('click', { bubbles: true, clientX: 12, clientY: 12 }));
      await settle();
      expect(turned()).toBe(0);

      const dialog = await focusOpen();
      const giro = dialog.querySelector<HTMLElement>('.giro')!;
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', repeat: true, bubbles: true, cancelable: true }));
      await settle();
      expect(giro.classList).not.toContain('virada');
    });

    it('a linha de uma tarefa no verso é papel: tocar vira (só marca quem pode marcar)', async () => {
      const { kanji } = seed();
      write('nsol', '- [ ] escrever dez vezes');
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      const row = back(0)!.querySelector<HTMLElement>('label')!;
      expect(row.querySelector('input')).toBeNull();
      row.click();
      await settle();
      expect(turned()).toBe(0);
      expect(study.state().cards.length).toBe(4);
    });

    it('na parede, o verso se apaga na beira de baixo, com folga no pé; na mesa, não', async () => {
      const { kanji } = seed();
      write('nsol', 'Texto.');
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      const css = getComputedStyle(back(0)!.querySelector('.verso-conteudo')!);
      expect(css.maskImage).toContain('linear-gradient');
      expect(css.paddingBottom).toBe('24px');
      const dialog = await focusOpen();
      expect(getComputedStyle(dialog.querySelector('.verso-conteudo')!).maskImage).toBe('none');
    });

    it('a carta pequena crescida volta com um toque fora dela; com o toque na outra, troca', async () => {
      const { kanji } = seed();
      localStorage.setItem(STUDY_SIZE_KEY, 'pequenas');
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      btn(1).click();
      await settle();
      expect(li(1).classList).toContain('virada');
      expect(turned()).toBe(1);
      $('.pasta')!.click();
      await settle();
      expect(turned()).toBe(0);
      // nas grandes, o toque fora não mexe em nada
      $<HTMLButtonElement>('button[aria-label^="Cartas grandes"]')!.click();
      await settle();
      btn(0).click();
      await settle();
      $('.pasta')!.click();
      await settle();
      expect(turned()).toBe(1);
    });

    it('das grandes, várias viradas; de outro baralho, as frentes de novo', async () => {
      const { kanji, quimica } = seed();
      await go(deckUrl(kanji));
      btn(0).click();
      btn(1).click();
      await settle();
      expect(turned()).toBe(2);
      await go(deckUrl(quimica));
      expect(turned()).toBe(0);
      expect($('.verso')).toBeNull();
      await go(deckUrl(kanji));
      expect(turned()).toBe(0);
      expect($('.verso')).toBeNull();
    });

    it('das pequenas, uma de cada vez, crescendo por cima das vizinhas sem tirá-las do lugar, e sem sair da tela', async () => {
      const { kanji } = seed();
      localStorage.setItem(STUDY_SIZE_KEY, 'pequenas');
      await go(deckUrl(kanji));
      $('.cartas')!.scrollIntoView({ block: 'start' });
      const cells = () => $$('.carta-li').map((el) => Math.round(el.getBoundingClientRect().left));
      const place = cells();
      btn(0).click();
      await settle();
      const giro = li(0).querySelector<HTMLElement>('.giro')!;
      giro.getAnimations().forEach((a) => a.finish());
      // a escala da miniatura desfeita: com a do verso (0,4), a carta volta ao tamanho das grandes
      expect(parseFloat(getComputedStyle(giro).scale)).toBeCloseTo(2.5, 5);
      expect(parseFloat(getComputedStyle(back(0)!).scale)).toBeCloseTo(0.4, 5);
      expect(back(0)!.offsetWidth).toBeCloseTo(btn(0).offsetWidth * 2.5, -1);
      expect(cells()).withContext('as vizinhas ficam').toEqual(place);
      expect(getComputedStyle(li(0)).zIndex).toBe('5');
      // a carta da beira esquerda é empurrada para dentro da tela
      const box = li(0).getBoundingClientRect();
      const left = box.left + box.width / 2 - (box.width * 2.5) / 2 + parseFloat(li(0).style.getPropertyValue('--empurra-x'));
      expect(left).toBeGreaterThanOrEqual(7);

      btn(1).click();
      await settle();
      expect(turned()).toBe(1);
      expect(li(1).classList).toContain('virada');
      // trocar o tamanho volta para a frente
      $<HTMLButtonElement>('button[aria-label^="Cartas grandes"]')!.click();
      await settle();
      expect(turned()).toBe(0);
    });

    it('a etiqueta tem o maximizar, o ler e o editar, com o mesmo botão preto', async () => {
      const { kanji } = seed();
      await go(deckUrl(kanji));
      const buttons = [...li(0).querySelectorAll<HTMLElement>('.acoes .mexer')];
      expect(buttons.map((b) => b.getAttribute('aria-label'))).toEqual(['Maximizar 日', 'Ler a anotação de 日', 'Editar a carta 日']);
      expect(buttons[0].getAttribute('aria-haspopup')).toBe('dialog');
      expect(buttons[0].querySelector('lucide-icon')).not.toBeNull();
      expect(getComputedStyle(buttons[0]).width).toBe(getComputedStyle(buttons[1]).width);
      expect(getComputedStyle(buttons[0]).width).toBe(getComputedStyle(buttons[2]).width);
    });

    it('maximizar abre a mesa de estudo só para ver: clicar na carta vira, sem Errei nem Acertei', async () => {
      const { kanji } = seed();
      write('nsol', 'Leitura: nichi.');
      const open = spyOn(TestBed.inject(Desk), 'openReview');
      await go(deckUrl(kanji));
      const dialog = await focusOpen();
      const $d = <T extends HTMLElement = HTMLElement>(sel: string) => dialog.querySelector<T>(sel);
      const isBack = () => $d('.giro')!.classList.contains('virada');
      expect(dialog.classList).toContain('sessao');
      expect($d('.baralho')!.textContent).toBe('Kanjis · só para ver');
      expect(dialog.getAttribute('aria-label')).toBe('Kanjis: 日');
      expect(dialog.querySelectorAll('.errei, .acertei, .montes, .desfazer').length).toBe(0);
      expect(isBack()).toBeFalse();
      expect($d('.verso')!.hasAttribute('inert')).toBeTrue();
      // a frente da mesa de estudo: sem o progresso, que é da parede
      expect($d('.frente .selo-nivel')).toBeNull();
      await new Promise((r) => setTimeout(r));
      expect(document.activeElement).toBe($d('.mostrar'));

      $d('.frente')!.click();
      await settle();
      expect(isBack()).toBeTrue();
      expect($d('.frente')!.hasAttribute('inert')).toBeTrue();
      expect(text($d('.verso app-rich-text'))).toContain('Leitura: nichi.');
      expect(text($d('p[aria-live]'))).toBe('Verso de 日');
      $d('.verso-titulo')!.click();
      await settle();
      expect(isBack()).toBeFalse();
      expect(text($d('p[aria-live]'))).toBe('Frente de 日');
      $d('.mostrar')!.click();
      await settle();
      expect(isBack()).toBeTrue();
      // o Espaço também, fora dos botões
      $d('.topo')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await settle();
      expect(isBack()).toBeFalse();
      expect(open).not.toHaveBeenCalled();

      dialog.close();
      await settle();
      expect(focusDialog()).toBeNull();
      expect(turned()).toBe(0);
    });

    it('a carta virada na parede abre maximizada com o verso à mostra', async () => {
      const { kanji } = seed();
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      const dialog = await focusOpen();
      expect(dialog.querySelector('.giro')!.classList).toContain('virada');
      await settle();
      expect(text(dialog.querySelector('p[aria-live]'))).toBe('Verso de 日');
    });

    it('maximizada, a tecla na rolagem do verso é dela, o foco não cai na página ao voltar, e a carta que sai dos Estudos fecha a folha', async () => {
      const { kanji } = seed();
      write('nsol', 'Ver [[Lua (月)|a lua]].');
      await go(deckUrl(kanji));
      const dialog = await focusOpen();
      const giro = dialog.querySelector<HTMLElement>('.giro')!;
      dialog.querySelector<HTMLElement>('.frente')!.click();
      await settle();
      expect(giro.classList).toContain('virada');
      dialog.querySelector('.verso-conteudo')!.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await settle();
      expect(giro.classList).withContext('o Espaço rola').toContain('virada');
      dialog.querySelector<HTMLElement>('.elo')!.focus();
      dialog.querySelector<HTMLElement>('.verso-titulo')!.click();
      await settle();
      expect(giro.classList).not.toContain('virada');
      expect(document.activeElement).toBe(dialog.querySelector('.mostrar'));
      // com o foco solto na página, o Espaço continua virando
      (document.activeElement as HTMLElement).blur();
      document.body.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true, cancelable: true }));
      await settle();
      expect(giro.classList).toContain('virada');
      study.removeCard('nsol');
      await settle();
      expect(dialog.open).toBeFalse();
    });

    it('virar não abre nada; a etiqueta abre a leitura, e o editar abre o editor na aba Flashcard, sem outra folha', async () => {
      const { kanji } = seed();
      const desk = TestBed.inject(Desk);
      const open = spyOn(desk, 'openReview');
      const edit = spyOn(desk, 'editReview');
      await go(deckUrl(kanji));
      btn(0).click();
      await settle();
      expect(open).not.toHaveBeenCalled();
      expect(edit).not.toHaveBeenCalled();
      li(0).querySelector<HTMLElement>('.mexer[aria-label^="Ler a anotação"]')!.click();
      await settle();
      expect(open).toHaveBeenCalledOnceWith('nsol');
      li(0).querySelector<HTMLElement>('.mexer[aria-label^="Editar a carta"]')!.click();
      await settle();
      expect(edit).toHaveBeenCalledOnceWith('nsol', 'flashcard');
      expect(document.querySelector('dialog.ficha-carta')).toBeNull();
    });
  });

  it('a busca, o nível e a ordem da parede', async () => {
    const { kanji } = seed();
    await go(deckUrl(kanji));
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
    await go(deckUrl(vazio));
    expect(text($('.vaga-txt'))).toBe('Nenhuma carta neste baralho ainda. Escreva uma Nova carta, ou traga anotações que você já tem.');
    expect($('#busca-cartas')).toBeNull();
    expect(text($('.em-dia'))).toBe('Nenhuma carta neste baralho ainda.');
  });

  it('um baralho que não existe mostra Tudo', async () => {
    seed();
    await go('/anotacoes/estudos/sumido');
    expect($('.pilhas')).not.toBeNull();
  });

  it('o Novo baralho nasce no grupo aberto, com nome e cor livre, abre nele e abre a folha com o nome para escrever', async () => {
    seed();
    await go(studyPath(GROUP));
    $<HTMLButtonElement>('.novo-baralho')!.click();
    await sheetOpen();
    const fresh = study.decks()[3];
    expect(fresh.name).toBe('Baralho 4');
    expect(fresh.group).toBe('Estudos');
    expect(['amarelo', 'verde', 'azul']).not.toContain(fresh.color);
    expect(router.url).toBe(deckUrl(fresh.id));
    expect(sheet()?.open).toBeTrue();
    const name = sheet()!.querySelector<HTMLInputElement>('.campo input')!;
    expect(document.activeElement).toBe(name);
    name.value = 'Capitais';
    name.dispatchEvent(new Event('change'));
    expect(study.deck(fresh.id)!.name).toBe('Capitais');
  });

  it('o nome do Novo baralho nunca repete; só o grupo tem o Novo baralho (o baralho tem a Nova carta)', async () => {
    const { kanji } = seed();
    study.updateDeck(kanji, { name: 'Baralho 4' });
    await go(deckUrl(kanji));
    expect($('.novo-baralho')).toBeNull();
    await go(studyPath(GROUP));
    $<HTMLButtonElement>('.novo-baralho')!.click();
    await sheetOpen();
    const fresh = study.decks()[3];
    expect(fresh.name).toBe('Baralho 5');
    expect(router.url).toBe(deckUrl(fresh.id));
    expect(sheet()?.open).toBeTrue();
  });

  it('Nova carta pede ao editor uma anotação nova com este baralho; Trazer anotações abre o seletor', async () => {
    const { kanji } = seed();
    // no grupo do baralho, como a "Nova nota" de uma coluna do Kanban
    const fresh = spyOn(TestBed.inject(Desk), 'newNoteIn');
    await go(deckUrl(kanji));
    const [nova, trazer] = $$('.poe-cartas button');
    expect(text(nova)).toBe('Nova carta');
    nova.click();
    expect(study.pending()).toEqual({ decks: [kanji] });
    expect(fresh).toHaveBeenCalledWith('Estudos');
    expect(text(trazer)).toBe('Trazer anotações');
  });

  it('trazer uma anotação: vira carta deste baralho, sem título próprio, e continua no mural', async () => {
    const { quimica } = seed();
    await go(deckUrl(quimica));
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

  it('trazer uma anotação privada para um baralho público pergunta se ela fica pública; para um privado, não', async () => {
    const { quimica } = seed();
    await go(deckUrl(quimica));
    const page = (window as unknown as { ng: { getComponent(e: Element): { bring(n: string, d: string): void } } }).ng.getComponent(host.querySelector('app-study-page')!);
    const store = TestBed.inject(ReviewStore);
    store.reviews.update((list) => [...list, { ...note('npriv', 'Capital do Peru'), private: true }, { ...note('npri2', 'Capital do Chile'), private: true }]);
    const toasts = TestBed.inject(Toasts);
    page.bring('npriv', quimica);
    expect(toasts.current()!.text).toContain('virou carta');
    study.updateDeck(quimica, { public: true });
    page.bring('npri2', quimica);
    expect(toasts.current()!.text).toBe('Esta anotação é privada, mas o baralho dela é público. Quer deixá-la pública?');
    toasts.dismiss();
  });

  it('o play: Estudar no baralho abre a mesa dele; em Tudo, Estudar tudo; em dia, nenhum', async () => {
    const { kanji, vazio } = seed();
    await go(deckUrl(kanji));
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
    await go(deckUrl(vazio));
    expect($('.estudar')).toBeNull();
  });

  it('em dia, com revisões amanhã: "Estudar adiantado" abre a mesa com elas; sem nada amanhã, não aparece', async () => {
    const kanji = study.addDeck('Kanjis', 'amarelo');
    study.addCard('nsol', [kanji]);
    const inDays = (n: number) =>
      study.state.update((st) => ({
        ...st,
        cards: st.cards.map((c) => ({ ...c, srs: { state: 'revisao' as const, step: 0, s: 5, d: 5, due: dayStart(addStudyDays(studyDay(new Date()), n)).toISOString(), last: T0, reps: 3 } })),
      }));
    inDays(3);
    await go(deckUrl(kanji));
    expect($('.estudar')).toBeNull();
    expect($('.adiantado')).toBeNull();
    inDays(1);
    await settle();
    expect($('.estudar')).toBeNull();
    expect(text($('.adiantado'))).toBe('Estudar adiantado');
    $<HTMLButtonElement>('.adiantado')!.click();
    let mesa: HTMLDialogElement | null = null;
    for (let i = 0; i < 60 && !(mesa = document.querySelector<HTMLDialogElement>('dialog.sessao'))?.open; i++) await settle();
    expect(mesa!.open).toBeTrue();
    expect(text(mesa!.querySelector('.baralho'))).toBe('Kanjis · adiantado');
    expect(mesa!.querySelector('app-study-card')).not.toBeNull();
    mesa!.close();
    await settle();
  });

  it('a engrenagem, na ponta da pasta (em Tudo e no baralho), abre as configurações dos Estudos', async () => {
    const { kanji } = seed();
    await go('/anotacoes/estudos');
    const gear = $<HTMLButtonElement>('button[aria-label="Configurações dos estudos"]')!;
    expect(gear.closest('.pasta-controles')!.lastElementChild!.contains(gear)).toBeTrue();
    gear.click();
    let dialog: HTMLDialogElement | null = null;
    for (let i = 0; i < 60 && !(dialog = document.querySelector<HTMLDialogElement>('dialog.config'))?.open; i++) await settle();
    expect(dialog!.open).toBeTrue();
    expect(dialog!.querySelector('#config-titulo')!.textContent).toContain('Configurações dos estudos');
    dialog!.close();
    await settle();
    await go(deckUrl(kanji));
    const inDeck = $<HTMLButtonElement>('button[aria-label="Configurações dos estudos"]')!;
    expect(inDeck.closest('.pasta-controles')!.lastElementChild!.contains(inDeck)).toBeTrue();
  });

  it('a folha do baralho: a cor e o ícone valem na hora; apagar volta para o grupo, com o Desfazer', async () => {
    const { kanji } = seed();
    await go(deckUrl(kanji));
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
    expect(router.url).toBe(studyPath(GROUP));
    // as cartas só dele saíram dos Estudos; o Desfazer traz o baralho e elas de volta
    expect(study.cards().map((c) => c.note)).toEqual(['nagua']);
    const toast = document.querySelector<HTMLButtonElement>('app-toast button, .toast button');
    toast?.click();
    if (toast) expect(study.deck(kanji)).toBeDefined();
  });

  describe('Público ou Privado (PLANO-BARALHOS-PUBLICOS.md)', () => {
    /** Kanjis com Sol, Lua e Fogo; Lua e Fogo privadas: 33% públicas. */
    function privateSome(): { kanji: string; store: ReviewStore } {
      const out = seed();
      const store = TestBed.inject(ReviewStore);
      for (const id of ['nlua', 'nfogo']) store.update({ ...store.get(id)!, private: true });
      return { kanji: out.kanji, store };
    }
    async function openSheet(kanji: string): Promise<HTMLDialogElement> {
      await go(deckUrl(kanji));
      $<HTMLButtonElement>('button[aria-label="Ajustes do baralho"]')!.click();
      return sheetOpen();
    }
    const tag = (d: HTMLDialogElement, label: string) => [...d.querySelectorAll<HTMLButtonElement>('.quem-tag')].find((b) => text(b) === label)!;

    it('nasce privado; com cartas privadas, a pergunta traz a porcentagem e "Tornar todas" publica fora do Feed', async () => {
      const { kanji, store } = privateSome();
      const confirm = TestBed.inject(Confirm) as unknown as { choose?: (o: { text: string }) => Promise<string | null> };
      let asked = '';
      confirm.choose = async (o) => ((asked = o.text), 'confirm');
      const dialog = await openSheet(kanji);
      expect(tag(dialog, 'Privado').getAttribute('aria-checked')).toBe('true');
      expect(text(dialog.querySelector('.quem-dica'))).toBe('Só você vê este baralho.');
      tag(dialog, 'Público').click();
      await settle();
      expect(asked).toBe('Gostaria de tornar todas as cartas deste baralho públicas? 33% das cartas desse baralho são públicas atualmente.');
      expect(study.deck(kanji)!.public).toBeTrue();
      expect(store.get('nlua')!.private).toBeUndefined();
      expect(store.get('nlua')!.quiet).toBeTrue();
      expect(tag(dialog, 'Público').getAttribute('aria-checked')).toBe('true');
      expect(text(dialog.querySelector('.quem-dica'))).toContain('vê o baralho e as 3 cartas');
      // a pilha e a pasta dizem que é público
      dialog.close();
      await settle();
      expect($('.trilha-nome .nome-publico')).not.toBeNull();
    });

    it('"Só o baralho": as privadas ficam com o dono (o leitor de tela diz quais); Cancelar não muda nada', async () => {
      const { kanji, store } = privateSome();
      const confirm = TestBed.inject(Confirm) as unknown as { choose?: () => Promise<string | null> };
      confirm.choose = async () => null;
      let dialog = await openSheet(kanji);
      tag(dialog, 'Público').click();
      await settle();
      expect(study.deck(kanji)!.public).toBeUndefined();
      expect(tag(dialog, 'Privado').getAttribute('aria-checked')).toBe('true');
      confirm.choose = async () => 'secondary';
      tag(dialog, 'Público').click();
      await settle();
      expect(study.deck(kanji)!.public).toBeTrue();
      expect(store.get('nlua')!.private).toBeTrue();
      expect(text(dialog.querySelector('.quem-dica'))).toContain('Quem visita vê 1 das 3 cartas.');
      dialog.close();
      await settle();
      // sem marca na tela (pedido do dono): só o leitor de tela ouve
      expect($$('.carta-li .cadeado').length).toBe(0);
      expect($$('.carta-btn').filter((b) => b.getAttribute('aria-label')!.endsWith('só você vê esta carta')).length).toBe(2);
      // privado de novo: sem pergunta, sem cadeado
      $<HTMLButtonElement>('button[aria-label="Ajustes do baralho"]')!.click();
      dialog = await sheetOpen();
      tag(dialog, 'Privado').click();
      await settle();
      expect(study.deck(kanji)!.public).toBeUndefined();
      dialog.close();
      await settle();
      expect($$('.carta-btn').filter((b) => b.getAttribute('aria-label')!.endsWith('só você vê esta carta')).length).toBe(0);
    });

    it('com todas as cartas públicas, vira público direto, sem pergunta', async () => {
      const { kanji } = seed();
      const confirm = TestBed.inject(Confirm) as unknown as { choose?: () => Promise<string | null> };
      confirm.choose = jasmine.createSpy('choose');
      const dialog = await openSheet(kanji);
      tag(dialog, 'Público').click();
      await settle();
      expect(confirm.choose).not.toHaveBeenCalled();
      expect(study.deck(kanji)!.public).toBeTrue();
    });
  });

  it('o estilo das cartas: a folha mostra os dez com a primeira carta do baralho, e o escolhido vale na parede e na pilha', async () => {
    const { kanji, quimica } = seed();
    await go(deckUrl(kanji));
    $<HTMLButtonElement>('button[aria-label="Ajustes do baralho"]')!.click();
    const dialog = await sheetOpen();
    const options = [...dialog.querySelectorAll<HTMLButtonElement>('.op.estilo')];
    expect(options.map((o) => text(o.querySelector('.estilo-nome')))).toEqual([
      'Clássica',
      'Faixa de cor',
      'Cartolina inteira',
      'Orelha',
      'Baralho antigo',
      'Ficha de argola',
      'Selo',
      'Polaroid',
      'Ingresso',
      'Ficha da biblioteca',
    ]);
    // sem escolha, a Clássica; cada miniatura é a primeira carta do baralho naquele desenho
    expect(options[0].getAttribute('aria-checked')).toBe('true');
    expect(text(options[8].querySelector('app-study-card .titulo'))).toBe('日');
    expect(options[8].querySelector('.carta')!.classList).toContain('look-ingresso');
    options[8].click();
    await settle();
    expect(study.deck(kanji)!.look).toBe('ingresso');
    expect(study.deck(quimica)!.look).toBeUndefined();
    // a parede do baralho: o ingresso, com o número da carta e o canhoto do nível
    const cards = $$('.cartas app-study-card');
    expect(cards.every((c) => c.querySelector('.carta')!.classList.contains('look-ingresso'))).toBeTrue();
    expect(cards.map((c) => text(c.querySelector('.num')))).toEqual(['Nº 01', 'Nº 02', 'Nº 03']);
    expect(text(cards[0].querySelector('.canhoto .campo b'))).toBe('Nova');
    // voltar para a Clássica tira o campo do baralho
    dialog.querySelector<HTMLButtonElement>('.op.estilo')!.click();
    await settle();
    expect(study.deck(kanji)!.look).toBeUndefined();
    study.updateDeck(kanji, { look: 'selo' });
    sheet()?.close();
    await go('/anotacoes/estudos');
    const pilhas = $$('.pilha');
    expect(pilhas[0].querySelector('.capa .carta')!.classList).toContain('look-selo');
    expect(pilhas[0].querySelector('.camada .carta')!.classList).toContain('look-selo');
    expect(pilhas[1].querySelector('.capa .carta')!.classList).toContain('look-classica');
  });

  it('Tudo: as cartas de baixo da pilha são as costas no estilo do baralho, na cartolina das cartas seguintes', async () => {
    const { kanji } = seed();
    // pedido do usuário: "as 2 cartas brancas que aparecem no fundo dos baralhos não segue o estilo do baralho"
    const stocks: Record<string, Stock> = { nsol: 'vermelho', nlua: 'azul', nfogo: 'verde' };
    TestBed.inject(ReviewStore).reviews.update((rs) => rs.map((r) => (stocks[r.id] ? { ...r, stock: stocks[r.id] } : r)));
    study.updateDeck(kanji, { look: 'biblioteca' });
    await go('/anotacoes/estudos');
    const pilha = $$('.pilha')[0];
    const capa = pilha.querySelector<HTMLElement>('.capa .carta')!;
    expect(capa.classList).not.toContain('costas');
    expect(capa.style.getPropertyValue('--c')).toBe('var(--stock-vermelho)');
    const camadas = [...pilha.querySelectorAll<HTMLElement>('app-study-card.camada .carta')];
    expect(camadas.length).toBe(1);
    // a ficha da biblioteca vazia: a manilha com a faixa na cartolina da carta seguinte (a lua), sem nada escrito
    expect(camadas[0].classList).toContain('look-biblioteca');
    expect(camadas[0].classList).toContain('costas');
    expect(camadas[0].querySelector('.ficha > .faixa')).not.toBeNull();
    expect(camadas[0].style.getPropertyValue('--c')).toBe('var(--stock-azul)');
    expect(text(camadas[0])).toBe('');
    // sem o papel creme de antes por baixo: a camada é só o lugar, a carta desenha o próprio papel
    expect(getComputedStyle(pilha.querySelector('.camada')!).backgroundImage).toBe('none');
    // na Clássica, a ficha creme com a moldura fina
    study.updateDeck(kanji, { look: undefined });
    await settle();
    expect(pilha.querySelector('.camada .carta')!.classList).toContain('look-classica');
    expect(pilha.querySelector('.camada .moldura')).not.toBeNull();
  });
});
