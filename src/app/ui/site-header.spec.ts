import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Router, provideRouter } from '@angular/router';
import { Follow } from '../core/follow';
import { Kind } from '../core/review';
import { Mural } from '../core/mural';
import { SiteHeader, pathOf, sectionOn } from './site-header';

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
  { name: 'mural de jogos, com amigos', kind: 'jogos', url: '/', friends: true, unseen: 12 },
  { name: 'Pra depois', kind: 'jogos', url: '/fila', friends: true, unseen: 3 },
  { name: 'Wishlist', kind: 'jogos', url: '/wishlist', friends: true, unseen: 0 },
  { name: 'mural de anotações', kind: 'anotacoes', url: '/', friends: true, unseen: 150 },
  { name: 'Wishlist de séries, sem conta', kind: 'series', url: '/wishlist', friends: false, unseen: 0 },
  { name: 'Ajustes de animes', kind: 'animes', url: '/ajustes', friends: true, unseen: 7 },
];

type Box = { name: string; r: DOMRect; el: Element };

/** A partir desta largura o topo é uma fileira só (ver site-header.scss). */
const ONE_ROW = 1280;

describe('o topo do site', () => {
  it('acende a etiqueta certa', () => {
    const extras = { path: '/extras', also: ['/ranking', '/comparar', '/comparar/mural'] };
    expect(sectionOn('/extras/muraldle', extras)).toBeTrue();
    expect(sectionOn('/comparar/mural', extras)).toBeTrue();
    expect(sectionOn('/fila', { path: '/' })).toBeFalse();
    expect(sectionOn('/lado-a-lado', { path: '/', also: ['/lado-a-lado'] })).toBeTrue();
    expect(pathOf('/ajustes?aba=backup')).toBe('/ajustes');
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
        expect(loaded.map((f) => f.status)).withContext('as letras do site carregaram').toEqual(['loaded', 'loaded', 'loaded', 'loaded']);

        const problems: string[] = [];
        for (const w of WIDTHS) {
          host.style.width = `${w}px`;
          const top = host.getBoundingClientRect();
          // o que se toca, e o cartaz inteiro (ele não pode cobrir um botão)
          const targets = boxes('.logo-link, app-kind-switcher button.palavra, .etiqueta, .botton, .adicionar button');
          const solid = [...targets, ...boxes('.cartaz')];
          const say = (msg: string) => problems.push(`${w}px: ${msg}`);

          for (const t of targets) {
            if (t.r.left < top.left - 4 || t.r.right > top.right + 4) say(`${t.name} sai do topo`);
            // o link "Meu mural" é texto do cartaz: basta a altura da linha
            const [minW, minH] = t.el.matches('.logo-link') ? [24, 18] : t.el.matches('.palavra') ? [24, 24] : [40, 40];
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
          // o barbante vai de ponta a ponta, sem passar da beira do topo
          if (varal.left < top.left - 1 || varal.right > top.right + 1) say('o barbante sai do topo');
        }
        expect(problems).withContext(scene.name).toEqual([]);
      });
    }
  });
});
