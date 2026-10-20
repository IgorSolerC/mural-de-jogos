import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Follow } from '../core/follow';
import { Kind } from '../core/review';
import { Mural } from '../core/mural';
import { SiteHeader } from './site-header';
import { CalendarStore } from '../core/calendar-store';
import { Desk } from '../core/desk';

@Component({ template: '' })
class Blank {}

/**
 * Todas as larguras que o topo pode ter: de um celular de 320px (288px sem as margens) até a largura
 * máxima do site (1384px), de 2 em 2 pixels. O topo segue a própria largura (container queries), então
 * basta mudar a largura dele para ver cada resolução.
 */
const WIDTHS = Array.from({ length: (1384 - 288) / 2 + 1 }, (_, i) => 288 + i * 2);

/** Os cenários que mudam o tamanho das coisas: o botão de cada página, o mural de nome mais comprido, com e sem Amigos. */
const SCENES: { name: string; kind: Kind; url: string; friends: boolean; unseen: number }[] = [
  { name: 'mural de jogos, com amigos', kind: 'jogos', url: '/analises/jogos', friends: true, unseen: 12 },
  { name: 'Pra depois', kind: 'jogos', url: '/analises/jogos/pra-depois', friends: true, unseen: 3 },
  { name: 'Wishlist', kind: 'jogos', url: '/analises/jogos/wishlist', friends: true, unseen: 0 },
  { name: 'Pra depois de músicas (o nome mais comprido)', kind: 'musicas', url: '/analises/musicas/pra-depois', friends: true, unseen: 0 },
  { name: 'anotações', kind: 'anotacoes', url: '/anotacoes', friends: true, unseen: 150 },
  { name: 'Wishlist de séries, sem conta', kind: 'series', url: '/analises/series/wishlist', friends: false, unseen: 0 },
  { name: 'Ajustes', kind: 'animes', url: '/ajustes', friends: true, unseen: 7 },
];

type Box = { name: string; r: DOMRect; el: Element };

/** A partir desta largura o topo é uma fileira só (ver site-header.scss). */
const ONE_ROW = 920;

describe('o topo do site', () => {
  describe('as partes do site', () => {
    let fixture: ComponentFixture<SiteHeader>;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({
        imports: [SiteHeader],
        providers: [
          provideZonelessChangeDetection(),
          provideRouter([{ path: '**', component: Blank }]),
          { provide: Follow, useValue: { available: signal(true), unseen: signal(0) } },
        ],
      });
      fixture = TestBed.createComponent(SiteHeader);
    });

    afterEach(() => localStorage.clear());

    const tags = () => [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLAnchorElement>('.etiqueta')];
    const at = async (url: string) => {
      await TestBed.inject(Router).navigateByUrl(url);
      await fixture.whenStable();
    };

    it('o cartaz é só "Murall", sem trocar de mural, e o varal tem as três partes', async () => {
      await at('/perfil');
      const el = fixture.nativeElement as HTMLElement;
      expect(el.querySelector('.logo')?.textContent?.trim()).toBe('MurALL');
      expect(el.querySelector('app-kind-switcher')).toBeNull();
      expect(tags().map((t) => t.textContent?.trim())).toEqual(['Anotações', 'Análises', 'Extras']);
      // as Análises abrem direto no último mural de resenhas
      expect(tags().map((t) => t.getAttribute('href'))).toEqual(['/anotacoes', '/analises/jogos', '/extras']);
      expect(tags().some((t) => t.classList.contains('on'))).withContext('no Perfil nenhuma parte acende').toBeFalse();
    });

    it('o logo é "Mur" a pincel e um recorte só com o "ALL", e o leitor de tela ouve "Murall"', async () => {
      await at('/perfil');
      const el = fixture.nativeElement as HTMLElement;
      const link = el.querySelector<HTMLAnchorElement>('.logo-link')!;
      expect(link.getAttribute('aria-label')).toBe('Murall');
      expect(link.getAttribute('href')).toBe('/');
      expect(el.querySelector('.mur')?.textContent).toBe('Mur');
      const cuts = el.querySelectorAll('.recorte');
      expect(cuts.length).withContext('um recorte só, não um por letra').toBe(1);
      expect(cuts[0].textContent).toBe('ALL');
      // o que se vê não é lido letra por letra: o nome do link já diz tudo
      for (const part of el.querySelectorAll('.mur, .all')) expect(part.getAttribute('aria-hidden')).toBe('true');
    });

    it('acende a parte aberta', async () => {
      const lit: Record<string, string> = {
        '/anotacoes': 'Anotações',
        '/analises/livros': 'Análises',
        '/analises/livros/pra-depois': 'Análises',
        '/analises/livros/lado-a-lado': 'Análises',
        '/extras/muraldle': 'Extras',
        '/ranking': 'Extras',
        '/comparar/mural': 'Extras',
      };
      for (const [url, label] of Object.entries(lit)) {
        await at(url);
        expect(tags().filter((t) => t.classList.contains('on')).map((t) => t.textContent?.trim())).withContext(url).toEqual([label]);
      }
    });

    it('o botão de adicionar segue a página, não o mural aberto', async () => {
      const mural = TestBed.inject(Mural);
      const button = () => (fixture.nativeElement as HTMLElement).querySelector('.adicionar button')!.getAttribute('aria-label');
      mural.kind.set('anotacoes');
      await at('/anotacoes');
      expect(button()).toBe('Nova anotação');
      // saindo das anotações para o Perfil, o botão já é de resenha
      await at('/perfil');
      expect(button()).toBe('Nova resenha');
      mural.kind.set('livros');
      await at('/analises/livros/pra-depois');
      expect(button()).toBe('Guardar livro pra depois');
      await at('/analises/livros/wishlist');
      expect(button()).toBe('Adicionar livro à wishlist');
    });

    it('no Calendário, o botão marca um lembrete (e não abre o editor)', async () => {
      const calendar = TestBed.inject(CalendarStore);
      const newReview = spyOn(TestBed.inject(Desk), 'newReview');
      await at('/anotacoes/calendario?vista=semana');
      const btn = (fixture.nativeElement as HTMLElement).querySelector<HTMLButtonElement>('.adicionar button')!;
      expect(btn.getAttribute('aria-label')).toBe('Novo lembrete');
      expect(btn.textContent!.replace(/\s+/g, ' ').trim()).toBe('Novo lembrete');
      btn.click();
      expect(calendar.compose()?.day).toBeNull();
      expect(newReview).not.toHaveBeenCalled();
    });
  });

  describe('em todas as larguras', () => {
    let fixture: ComponentFixture<SiteHeader>;
    let host: HTMLElement;
    let still: HTMLStyleElement;
    const loaded: FontFace[] = [];
    const available = signal(true);
    const unseen = signal(0);

    beforeAll(async () => {
      // as letras do site: o teste serve os arquivos em /media (o CSS global os pede em /base/media)
      const faces: [string, string, FontFaceDescriptors][] = [
        ['Permanent Marker', 'permanent-marker-latin-400-normal', { weight: '400' }],
        ['Kalam', 'kalam-latin-700-normal', { weight: '700' }],
        ['Abril Fatface', 'abril-fatface-latin-400-normal', { weight: '400' }],
        ['Barlow Condensed', 'barlow-condensed-latin-800-normal', { weight: '800' }],
        ['Barlow Condensed', 'barlow-condensed-latin-800-italic', { weight: '800', style: 'italic' }],
      ];
      for (const [family, file, desc] of faces) {
        const face = new FontFace(family, `url(/media/${file}.woff2)`, desc);
        document.fonts.add(await face.load());
        loaded.push(face);
      }
      // sem transições: cada largura é medida já no lugar final
      still = document.createElement('style');
      still.textContent = '*, *::before, *::after { transition: none !important; animation: none !important; }';
      document.head.appendChild(still);
    });

    afterAll(() => still?.remove());

    beforeEach(async () => {
      localStorage.clear();
      TestBed.configureTestingModule({
        imports: [SiteHeader],
        providers: [
          provideZonelessChangeDetection(),
          provideRouter([{ path: '**', component: Blank }]),
          { provide: Follow, useValue: { available, unseen } },
        ],
      });
      fixture = TestBed.createComponent(SiteHeader);
      host = fixture.nativeElement;
      document.body.appendChild(host);
    });

    afterEach(() => {
      host.remove();
      localStorage.clear();
    });

    const boxes = (sel: string): Box[] =>
      [...host.querySelectorAll(sel)].map((el) => ({
        el,
        r: el.getBoundingClientRect(),
        name: (el.getAttribute('aria-label') || el.textContent || el.className).toString().trim().replace(/\s+/g, ' ').slice(0, 30),
      }));

    for (const scene of SCENES) {
      it(scene.name, async () => {
        available.set(scene.friends);
        unseen.set(scene.unseen);
        TestBed.inject(Mural).kind.set(scene.kind);
        await TestBed.inject(Router).navigateByUrl(scene.url);
        await fixture.whenStable();
        await document.fonts.ready;
        // medido com as letras de verdade (sem elas, as larguras seriam outras)
        expect(loaded.length).toBe(5);
        expect(loaded.map((f) => f.status)).withContext('as letras do site carregaram').toEqual(loaded.map(() => 'loaded'));

        const problems: string[] = [];
        for (const w of WIDTHS) {
          host.style.width = `${w}px`;
          const top = host.getBoundingClientRect();
          // o que se toca, e o cartaz inteiro (ele não pode cobrir um botão)
          const targets = boxes('.logo-link, .etiqueta, .botton, .adicionar button');
          const solid = [...targets, ...boxes('.cartaz')];
          const say = (msg: string) => problems.push(`${w}px: ${msg}`);

          for (const t of targets) {
            if (t.r.left < top.left - 4 || t.r.right > top.right + 4) say(`${t.name} sai do topo`);
            // o link "Murall" é texto do cartaz: basta a altura da linha
            const [minW, minH] = t.el.matches('.logo-link') ? [24, 18] : [40, 40];
            if (t.r.width < minW || t.r.height < minH) say(`${t.name} pequeno demais (${Math.round(t.r.width)}x${Math.round(t.r.height)})`);
          }
          for (let i = 0; i < solid.length; i++) {
            for (let j = i + 1; j < solid.length; j++) {
              const a = solid[i],
                b = solid[j];
              if (a.el.contains(b.el) || b.el.contains(a.el)) continue;
              const x = Math.min(a.r.right, b.r.right) - Math.max(a.r.left, b.r.left);
              const y = Math.min(a.r.bottom, b.r.bottom) - Math.max(a.r.top, b.r.top);
              if (x > 2 && y > 2) say(`${a.name} encosta em ${b.name} (${Math.round(x)}x${Math.round(y)})`);
            }
          }

          // o varal é uma fileira só, e nenhum nome é cortado
          const tags = boxes('.etiqueta');
          if (Math.max(...tags.map((t) => t.r.top)) - Math.min(...tags.map((t) => t.r.top)) > 6) say('as etiquetas quebraram de linha');
          for (const t of tags) if (t.el.scrollWidth > t.el.clientWidth + 1) say(`${t.name} cortada`);

          // a partir de ONE_ROW é uma fileira só; abaixo, o varal fica embaixo do cartaz
          const cartaz = boxes('.cartaz')[0].r;
          const varal = boxes('.barbante')[0].r;
          if (w >= ONE_ROW ? varal.top > cartaz.bottom || varal.bottom < cartaz.top : varal.top < cartaz.bottom - 4) {
            say(`varal fora do lugar (${w >= ONE_ROW ? 'devia estar ao lado do cartaz' : 'devia estar embaixo do cartaz'})`);
          }
          // o barbante não passa da beira do topo
          if (varal.left < top.left - 1 || varal.right > top.right + 1) say('o barbante sai do topo');
          // a última etiqueta fica antes do gancho da ponta
          if (Math.max(...tags.map((t) => t.r.right)) > varal.right) say('a última etiqueta passa do gancho');
        }
        expect(problems).withContext(scene.name).toEqual([]);
      });
    }

    // o botão de adicionar muda com a página (a pilha de fichas, a folha do Pra depois, o cupom da
    // Wishlist), mas o topo não muda de altura: trocar de página não empurra nada
    it('tem a mesma altura em toda página', async () => {
      available.set(true);
      const urls = ['/analises/jogos', '/analises/jogos/pra-depois', '/analises/jogos/wishlist', '/anotacoes', '/extras'];
      const steps = WIDTHS.filter((_, i) => i % 4 === 0);
      const heights: number[][] = [];
      for (const url of urls) {
        await TestBed.inject(Router).navigateByUrl(url);
        await fixture.whenStable();
        await document.fonts.ready;
        heights.push(
          steps.map((w) => {
            host.style.width = `${w}px`;
            return Math.round(host.getBoundingClientRect().height);
          }),
        );
      }
      const problems = steps
        .map((w, i) => ({ w, hs: heights.map((h) => h[i]) }))
        .filter(({ hs }) => new Set(hs).size > 1)
        .map(({ w, hs }) => `${w}px: ${urls.map((u, j) => `${u} ${hs[j]}`).join(', ')}`);
      expect(problems).toEqual([]);
    });
  });
});
