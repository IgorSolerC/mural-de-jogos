import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { Mural } from '../core/mural';
import { Draft, Wish } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { AreaBar } from './area-bar';

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
    expect(host.querySelector('.nota')?.textContent).toContain('Números e jogos');
    expect(host.querySelector('.volta')).toBeNull();

    await go('/extras/estatisticas');
    expect(picker()).not.toBeNull();
    expect(tabs().length).toBe(0);
    expect(host.querySelector('.volta')?.getAttribute('href')).toBe('/extras');
    expect(host.querySelector('.nota')).toBeNull();
    picker()!.click();
    await fixture.whenStable();
    expect(host.textContent).not.toContain('Anotações');

    await go('/comparar/mural');
    expect(picker()).toBeNull();
    expect(host.classList).toContain('vazio');
  });

  it('nas Anotações (uma seção só), no Perfil e nos Ajustes não aparece', async () => {
    for (const url of ['/anotacoes', '/perfil', '/ajustes', '/novidades', '/amigos']) {
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

    // o mural de nome mais comprido (Músicas) e a seção mais comprida aberta
    for (const url of ['/analises/musicas/pra-depois', '/analises/jogos/wishlist', '/extras', '/extras/mata-mata']) {
      it(url, async () => {
        fill(135, 1);
        TestBed.inject(Mural).kind.set('jogos');
        await go(url);
        await document.fonts.ready;
        expect(loaded.map((f) => f.status)).toEqual(['loaded', 'loaded']);

        const problems: string[] = [];
        for (const w of WIDTHS) {
          host.style.width = `${w}px`;
          const box = host.getBoundingClientRect();
          const say = (msg: string) => problems.push(`${w}px: ${msg}`);
          const targets = [picker()!, ...host.querySelectorAll<HTMLElement>('.secao')];
          const all = targets.map((el) => ({ el, r: el.getBoundingClientRect(), name: el.textContent!.trim().slice(0, 20) }));
          // a contagem e o texto de Extras: não se tocam, mas também não podem encostar em nada
          const text = [...host.querySelectorAll<HTMLElement>('.resumo, .nota')].map((el) => ({ el, r: el.getBoundingClientRect(), name: el.className }));
          for (const t of text) if (t.r.left < box.left - 2 || t.r.right > box.right + 2) say(`${t.name} sai do índice`);

          for (const t of all) {
            if (t.r.left < box.left - 2 || t.r.right > box.right + 2) say(`${t.name} sai do índice`);
            if (t.r.height < 44 || t.r.width < 40) say(`${t.name} pequeno demais (${Math.round(t.r.width)}x${Math.round(t.r.height)})`);
            if (t.el.scrollWidth > t.el.clientWidth + 1) say(`${t.name} cortado`);
          }
          const solid = [...all, ...text];
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
  });
});
