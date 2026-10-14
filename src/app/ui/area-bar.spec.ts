import { Component, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { routes } from '../app.routes';
import { Mural } from '../core/mural';
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

  const tabs = () => [...host.querySelectorAll<HTMLAnchorElement>('.secao')];
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

  it('nos Extras, só o mural (sem o de anotações); no mural de um colega, nada', async () => {
    await go('/extras/estatisticas');
    expect(picker()).not.toBeNull();
    expect(tabs().length).toBe(0);
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
    for (const url of ['/analises/musicas/pra-depois', '/analises/jogos', '/extras']) {
      it(url, async () => {
        await go(url);
        await document.fonts.ready;
        expect(loaded.map((f) => f.status)).toEqual(['loaded', 'loaded']);

        const problems: string[] = [];
        for (const w of WIDTHS) {
          host.style.width = `${w}px`;
          const box = host.getBoundingClientRect();
          const say = (msg: string) => problems.push(`${w}px: ${msg}`);
          const all = [picker()!, ...tabs()].map((el) => ({ el, r: el.getBoundingClientRect(), name: el.textContent!.trim().slice(0, 20) }));

          for (const t of all) {
            if (t.r.left < box.left - 2 || t.r.right > box.right + 2) say(`${t.name} sai do índice`);
            if (t.r.height < 44 || t.r.width < 40) say(`${t.name} pequeno demais (${Math.round(t.r.width)}x${Math.round(t.r.height)})`);
            if (t.el.scrollWidth > t.el.clientWidth + 1) say(`${t.name} cortado`);
          }
          for (let i = 0; i < all.length; i++) {
            for (let j = i + 1; j < all.length; j++) {
              const a = all[i].r,
                b = all[j].r;
              const x = Math.min(a.right, b.right) - Math.max(a.left, b.left);
              const y = Math.min(a.bottom, b.bottom) - Math.max(a.top, b.top);
              if (x > 1 && y > 1) say(`${all[i].name} encosta em ${all[j].name}`);
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
