import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { Mural } from '../core/mural';
import { Draft, Wish } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { AreaBar } from './area-bar';
import { CalendarStore } from '../core/calendar-store';
import { CloudAccount } from '../core/cloud-account';
import { boardIdFor } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { Review, sanitizeReview } from '../core/review';

@Component({ template: '' })
class Blank {}

/** As rotas de verdade (guardas e redirecionamentos), com páginas em branco. */
const BLANK_ROUTES = routes.map(function blank(r: (typeof routes)[number]): (typeof routes)[number] {
  return { ...r, loadComponent: r.loadComponent ? () => Blank : undefined, children: r.children?.map(blank) };
});

/** De um celular de 320px (288px sem as margens) até a largura máxima do site, de 2 em 2 pixels. */
const WIDTHS = Array.from({ length: (1384 - 288) / 2 + 1 }, (_, i) => 288 + i * 2);

describe('o índice embaixo do topo', () => {
  let fixture: ComponentFixture<AreaBar>;
  let host: HTMLElement;
  let router: Router;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      imports: [AreaBar],
      providers: [provideZonelessChangeDetection(), provideRouter(BLANK_ROUTES)],
    });
    router = TestBed.inject(Router);
    fixture = TestBed.createComponent(AreaBar);
    host = fixture.nativeElement;
    document.body.appendChild(host);
  });

  afterEach(() => {
    host.remove();
    localStorage.clear();
  });

  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await fixture.whenStable();
  }

  /** Um quadro do Kanban aberto com tantas anotações (o grupo Trabalho). */
  function fillBoard(n: number): void {
    const notes = Array.from({ length: n }, (_, i) =>
      sanitizeReview({
        id: 'nq' + String(i).padStart(6, '0'),
        kind: 'anotacoes',
        category: 'Trabalho',
        game: { name: 'Nota ' + i, coverUrl: null, source: 'manual' },
        scores: { final: 0 },
        text: '',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      }),
    ) as Review[];
    TestBed.inject(ReviewStore).reviews.set(notes);
    const kanban = TestBed.inject(KanbanStore);
    const id = boardIdFor('trabalho');
    kanban.state.set({
      boards: [
        {
          id,
          category: 'trabalho',
          at: '2026-10-19T10:00:00.000Z',
          columns: [{ id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false }],
          cards: notes.map((r) => ({ note: r.id, column: 'afazer', importance: null })),
        },
      ],
      removed: {},
      legacy: [],
    });
    kanban.openBoard.set(id);
  }

  const tabs = () => [...host.querySelectorAll<HTMLAnchorElement>('.secao:not(.volta)')];
  const summary = () => host.querySelector('.resumo')?.textContent?.replace(/\s+/g, ' ').trim() ?? null;

  /** Fila e wishlist com tantos itens de jogos (só o que a contagem lê). */
  function fill(drafts: number, wishes: number): void {
    const store = TestBed.inject(ReviewStore);
    const item = (id: string) => ({ id, kind: 'jogos', game: { name: id, coverUrl: null, source: 'manual', sourceId: id } });
    store.drafts.set(Array.from({ length: drafts }, (_, i) => item('d' + i) as unknown as Draft));
    store.wishes.set(Array.from({ length: wishes }, (_, i) => item('w' + i) as unknown as Wish));
  }
  const picker = () => host.querySelector<HTMLButtonElement>('app-kind-switcher button.palavra');

  it('nas Análises: o mural e as três seções, com a aberta marcada', async () => {
    await go('/analises/livros/pra-depois');
    expect(picker()?.textContent).toContain('Livros');
    expect(tabs().map((t) => t.textContent?.trim())).toEqual(['Mural', 'Pra depois', 'Wishlist']);
    expect(tabs().map((t) => t.getAttribute('href'))).toEqual(['/analises/livros', '/analises/livros/pra-depois', '/analises/livros/wishlist']);
    expect(tabs().map((t) => t.getAttribute('aria-current'))).toEqual([null, 'page', null]);
    expect(host.querySelector('nav')?.getAttribute('aria-label')).toBe('Seções das análises');

    // o lado a lado é uma vista do mural
    await go('/analises/livros/lado-a-lado');
    expect(tabs().map((t) => t.classList.contains('on'))).toEqual([true, false, false]);
  });

  it('na ponta, quanto há na seção aberta (e nada quando ela está vazia)', async () => {
    fill(35, 1);
    await go('/analises/jogos/pra-depois');
    expect(summary()).toContain('35');
    expect(summary()).toContain('jogos esperando a sua opinião');
    await go('/analises/jogos/wishlist');
    expect(summary()).toContain('jogo que você quer jogar');
    await go('/analises/livros/wishlist');
    expect(summary()).withContext('a wishlist de livros está vazia').toBeNull();
  });

  it('trocar de mural nas Análises vai para o mesmo lugar do outro mural', async () => {
    await go('/analises/jogos/wishlist');
    picker()!.click();
    await fixture.whenStable();
    const items = [...host.querySelectorAll<HTMLButtonElement>('[role="menuitemradio"]')];
    expect(items.map((b) => b.textContent?.trim().split(/\s/)[0])).toEqual(['Jogos', 'Livros', 'Filmes', 'Séries', 'Animes', 'Músicas']);
    items.find((b) => b.textContent?.includes('Séries'))!.click();
    // a troca anda dentro de uma view transition: espera o endereço chegar
    for (let i = 0; i < 50 && router.url !== '/analises/series/wishlist'; i++) await new Promise((r) => setTimeout(r, 20));
    await fixture.whenStable();
    expect(router.url).toBe('/analises/series/wishlist');
    expect(TestBed.inject(Mural).kind()).toBe('series');
  });

  it('nos Extras, o mural (sem o de anotações) e a volta para Extras; no mural de um colega, nada', async () => {
    await go('/extras');
    expect(picker()).not.toBeNull();
    expect(host.querySelector('.volta')).toBeNull();
    // o que é Extras é escrito na própria página, não na barra
    expect(host.querySelector('.nota')).toBeNull();

    await go('/extras/estatisticas');
    expect(picker()).not.toBeNull();
    expect(tabs().length).toBe(0);
    expect(host.querySelector('.volta')?.getAttribute('href')).toBe('/extras');
    picker()!.click();
    await fixture.whenStable();
    expect(host.textContent).not.toContain('Anotações');

    await go('/comparar/mural');
    expect(picker()).toBeNull();
    expect(host.classList).toContain('vazio');
  });

  it('nas Anotações: Mural, Kanban e Calendário, sem a etiqueta do mural; o Kanban fica aceso nos quadros', async () => {
    await go('/anotacoes');
    expect(picker()).toBeNull();
    expect(tabs().map((t) => t.textContent!.trim())).toEqual(['Mural', 'Kanban', 'Calendário']);
    expect(tabs()[0].classList).toContain('on');
    expect(tabs()[1].getAttribute('href')).toBe('/anotacoes/kanban');
    await go('/anotacoes/kanban/qualquer');
    expect(tabs()[1].classList).toContain('on');
    expect(tabs()[0].classList).not.toContain('on');
    await go('/anotacoes/calendario?vista=semana');
    expect(tabs()[2].classList).toContain('on');
    expect(tabs()[2].getAttribute('href')).toBe('/anotacoes/calendario');
  });

  it('a aba Cofre, depois do Calendário, só para quem pode usar o cofre: um link comum para a origem dele', async () => {
    const conta = TestBed.inject(CloudAccount).account;
    conta.set({ codigo: 'G11T-G00D', nome: 'Igor' });
    await go('/anotacoes');
    expect(tabs().map((t) => t.textContent!.trim())).toEqual(['Mural', 'Kanban', 'Calendário']);
    conta.set({ codigo: 'G11T-G00D', nome: 'Igor', cofre: true });
    await fixture.whenStable();
    expect(tabs().map((t) => t.textContent!.trim())).toEqual(['Mural', 'Kanban', 'Calendário', 'Cofre']);
    const cofre = tabs()[3];
    expect(cofre.getAttribute('aria-label')).toBe('Cofre de senhas');
    expect(cofre.getAttribute('href')).toBe('https://cofre.murall.igorsc.com.br/');
    expect(cofre.getAttribute('rel')).toBe('noreferrer');
    expect(cofre.hasAttribute('target')).toBe(false);
    expect(cofre.classList).not.toContain('on');
    // nas Análises, não
    await go('/analises/jogos');
    expect(tabs().map((t) => t.textContent!.trim())).not.toContain('Cofre');
  });

  it('no Calendário, quantos lembretes hoje tem', async () => {
    const calendar = TestBed.inject(CalendarStore);
    await go('/anotacoes/calendario');
    expect(summary()).toBeNull();
    calendar.save({ ...calendar.blank(calendar.today()), title: 'Dentista' });
    calendar.save({ ...calendar.blank('2020-01-01'), title: 'Remédio', repeat: 'dia' });
    calendar.save({ ...calendar.blank('2099-01-01'), title: 'Longe' });
    await fixture.whenStable();
    expect(summary()).toContain('2');
    expect(summary()).toContain('lembretes hoje');
  });

  it('no Perfil e nos Ajustes não aparece', async () => {
    for (const url of ['/perfil', '/ajustes', '/novidades', '/amigos']) {
      await go(url);
      expect(host.querySelector('.indice')).withContext(url).toBeNull();
      expect(getComputedStyle(host).display).withContext(url).toBe('none');
    }
  });

  it('em Amigos, um mural por vez: o seletor aparece, com o de anotações também', async () => {
    TestBed.inject(Settings).friendKinds.set('separado');
    await go('/amigos');
    picker()!.click();
    await fixture.whenStable();
    expect(host.textContent).toContain('Anotações');
    expect(router.url).toBe('/amigos');
  });

  it('cada mural e cada seção tem o seu logo; Amigos fica sem', async () => {
    const logos: [string, string][] = [
      ['/analises/jogos', 'app-reviews-logo'],
      ['/analises/jogos/lado-a-lado', 'app-reviews-logo'],
      ['/analises/jogos/pra-depois', 'app-queue-logo'],
      ['/analises/jogos/wishlist', 'app-wishlist-logo'],
      ['/anotacoes', 'app-notes-logo'],
      ['/anotacoes/kanban/qualquer', 'app-kanban-logo'],
      ['/anotacoes/calendario', 'app-calendar-logo'],
      ['/extras', 'app-extras-logo'],
      ['/extras/estatisticas', 'app-extras-logo'],
    ];
    for (const [url, tag] of logos) {
      await go(url);
      const shown = [...host.querySelectorAll('.pagina > *')].map((el) => el.tagName.toLowerCase());
      expect(shown).withContext(url).toEqual([tag]);
      // o logo é desenho: o nome da página está no h1 dela
      expect(host.querySelector('.pagina [aria-hidden="true"]')).withContext(url).not.toBeNull();
    }
    TestBed.inject(Settings).friendKinds.set('separado');
    await go('/amigos');
    expect(host.querySelector('.pagina')).toBeNull();
  });

  it('o logo das análises diz o mural; o do Calendário, a data de hoje', async () => {
    await go('/analises/livros');
    expect(host.querySelector('app-reviews-logo .papel')?.textContent?.trim()).toBe('Análises');
    expect(host.querySelector('app-reviews-logo .canhoto')?.textContent?.trim()).toBe('de livros');
    const calendar = TestBed.inject(CalendarStore);
    calendar.today.set('2026-03-07');
    await go('/anotacoes/calendario');
    expect(host.querySelector('app-calendar-logo .data')?.textContent?.trim()).toBe('07 mar 2026');
    calendar.today.set('2026-10-20');
    await fixture.whenStable();
    expect(host.querySelector('app-calendar-logo .data')?.textContent?.trim()).toBe('20 out 2026');
  });

  describe('em todas as larguras', () => {
    let still: HTMLStyleElement;
    const loaded: FontFace[] = [];

    beforeAll(async () => {
      // as letras do site: o teste serve os arquivos em /media
      const faces: [string, string, FontFaceDescriptors][] = [
        ['Permanent Marker', 'permanent-marker-latin-400-normal', { weight: '400' }],
        ['Barlow Condensed', 'barlow-condensed-latin-800-normal', { weight: '800' }],
      ];
      for (const [family, file, desc] of faces) {
        const face = new FontFace(family, `url(/media/${file}.woff2)`, desc);
        document.fonts.add(await face.load());
        loaded.push(face);
      }
      still = document.createElement('style');
      still.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(still);
    });

    afterAll(() => still?.remove());

    // o mural de nome mais comprido (Músicas) e a seção mais comprida aberta; nas Anotações, as quatro
    // seções (com a do cofre) e a contagem do Calendário e a do Kanban (a mais comprida, com três dígitos)
    for (const url of ['/analises/musicas/pra-depois', '/analises/jogos/wishlist', '/extras', '/extras/mata-mata', '/anotacoes/calendario', '/anotacoes/kanban']) {
      it(url, async () => {
        fill(135, 1);
        if (url.startsWith('/anotacoes')) {
          TestBed.inject(CloudAccount).account.set({ codigo: 'G11T-G00D', nome: 'Igor', cofre: true });
          const calendar = TestBed.inject(CalendarStore);
          calendar.save({ ...calendar.blank(calendar.today()), title: 'Dentista' });
          fillBoard(135);
        }
        TestBed.inject(Mural).kind.set('jogos');
        await go(url);
        await document.fonts.ready;
        expect(loaded.map((f) => f.status)).toEqual(['loaded', 'loaded']);

        const problems: string[] = [];
        for (const w of WIDTHS) {
          host.style.width = `${w}px`;
          const box = host.getBoundingClientRect();
          const say = (msg: string) => problems.push(`${w}px: ${msg}`);
          const targets = [picker(), ...host.querySelectorAll<HTMLElement>('.secao')].filter((el): el is HTMLElement => !!el);
          const all = targets.map((el) => ({ el, r: el.getBoundingClientRect(), name: el.textContent!.trim().slice(0, 20) }));
          // a contagem e o texto de Extras: não se tocam, mas também não podem encostar em nada
          const text = [...host.querySelectorAll<HTMLElement>('.resumo, .nota')].map((el) => ({ el, r: el.getBoundingClientRect(), name: el.className }));
          for (const t of text) if (t.r.left < box.left - 2 || t.r.right > box.right + 2) say(`${t.name} sai do índice`);

          for (const t of all) {
            if (t.r.left < box.left - 2 || t.r.right > box.right + 2) say(`${t.name} sai do índice`);
            if (t.r.height < 44 || t.r.width < 40) say(`${t.name} pequeno demais (${Math.round(t.r.width)}x${Math.round(t.r.height)})`);
            if (t.el.scrollWidth > t.el.clientWidth + 1) say(`${t.name} cortado`);
          }
          // o logo cabe na barra e na faixa dele, sem encostar em nada
          const logo = host.querySelector<HTMLElement>('.logo');
          const logos = logo ? [{ el: logo, r: logo.getBoundingClientRect(), name: logo.tagName.toLowerCase() }] : [];
          for (const l of logos) {
            if (l.r.left < box.left - 2 || l.r.right > box.right + 2) say(`${l.name} sai do índice`);
            if (l.el.offsetHeight > 56) say(`${l.name} mais alto que a faixa (${l.el.offsetHeight}px)`);
          }
          const solid = [...all, ...text, ...logos];
          for (let i = 0; i < solid.length; i++) {
            for (let j = i + 1; j < solid.length; j++) {
              const a = solid[i].r,
                b = solid[j].r;
              const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (x > 1 && y > 1) say(`${solid[i].name} encosta em ${solid[j].name}`);
            }
          }
          // as seções são uma fileira só
          const tops = tabs().map((t) => t.getBoundingClientRect().top);
          if (tops.length && Math.max(...tops) - Math.min(...tops) > 2) say('as seções quebraram de linha');
        }
        expect(problems).withContext(url).toEqual([]);
      });
    }

    /**
     * Trocar de página não mexe na barra: as páginas de uma parte têm a mesma altura em toda largura,
     * e com tudo numa fileira (a partir de 900px) todas as partes têm a mesma.
     */
    it('a barra tem a mesma altura em toda página', async () => {
      fill(135, 3);
      TestBed.inject(CalendarStore).save({ ...TestBed.inject(CalendarStore).blank(TestBed.inject(CalendarStore).today()), title: 'Dentista' });
      const areas: Record<string, string[]> = {
        analises: ['/analises/musicas', '/analises/musicas/lado-a-lado', '/analises/musicas/pra-depois', '/analises/musicas/wishlist'],
        anotacoes: ['/anotacoes', '/anotacoes/kanban', '/anotacoes/calendario'],
        extras: ['/extras', '/extras/estatisticas', '/ranking'],
      };
      const steps = WIDTHS.filter((_, i) => i % 4 === 0);
      const heights = new Map<string, number[]>();
      for (const urls of Object.values(areas)) {
        for (const url of urls) {
          await go(url);
          await document.fonts.ready;
          heights.set(
            url,
            steps.map((w) => {
              host.style.width = `${w}px`;
              return Math.round(host.getBoundingClientRect().height);
            }),
          );
        }
      }
      const problems: string[] = [];
      steps.forEach((w, i) => {
        for (const [area, urls] of Object.entries(areas)) {
          const hs = urls.map((u) => heights.get(u)![i]);
          if (new Set(hs).size > 1) problems.push(`${w}px, ${area}: ${urls.map((u, j) => `${u} ${hs[j]}`).join(', ')}`);
        }
        if (w >= 900) {
          const all = [...heights.values()].map((h) => h[i]);
          if (new Set(all).size > 1) problems.push(`${w}px: alturas diferentes entre as partes (${[...new Set(all)].join(', ')})`);
        }
      });
      expect(problems).toEqual([]);
    });
  });
});
