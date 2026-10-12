import { Component, computed, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Cloud } from '../core/cloud-config';
import { CloudAccount } from '../core/cloud-account';
import { CloudMurals } from '../core/cloud-murals';
import { Comments } from '../core/comments';
import { ColleagueStore } from '../core/colleague-store';
import { FeedItem, Follow, People } from '../core/follow';
import { LocalData } from '../core/local-data';
import { ProfilePeople } from '../core/profile-people';
import { Reactions } from '../core/reactions';
import { Confirm } from '../ui/confirm';
import { ReviewReader } from '../ui/review-reader';
import { MailPage } from './mail-page';

/**
 * Amigos desenhada de verdade, em todas as larguras que a página pode ter: de um celular de 320px
 * (288px sem as margens) até a largura máxima do site (1384px). A página segue a própria largura
 * (container queries), então basta mudar a largura dela para ver cada resolução. Em cada uma, nas três
 * partes: nada sai da página, as etiquetas ficam numa fileira só e inteiras, o que se toca tem tamanho
 * de dedo, e o quadro de avisos só fica ao lado do Feed quando cabe.
 */

class MemoryData {
  private readonly map = new Map<string, string>();
  readonly where = 'local';
  getItem(key: string): string | null {
    return this.map.get(key) ?? null;
  }
  setItem(key: string, value: string): void {
    this.map.set(key, value);
  }
  onExternalChange(): void {
    /* sem outras abas */
  }
  takeForeign(): null {
    return null;
  }
}

/** A leitura de mentira: a página só precisa que ela exista. */
@Component({ selector: 'app-review-reader', template: '', providers: [{ provide: ReviewReader, useExisting: StubReader }] })
class StubReader {
  open(): void {
    /* nada a abrir */
  }
}

const WIDTHS = Array.from({ length: (1384 - 288) / 8 + 1 }, (_, i) => 288 + i * 8);
/** A partir desta largura da página o quadro de avisos fica ao lado do Feed (ver mail-page.scss). */
const BOARD_BESIDE = 800;

const ana = { codigo: 'AAAA-1111', nome: 'Ana' };
const bia = { codigo: 'BBBB-2222', nome: 'Bia Albuquerque de Vasconcelos' };
const cris = { codigo: 'CCCC-3333', nome: 'Cris' };
const at = (h: number) => `2026-10-06T${String(h).padStart(2, '0')}:00:00.000Z`;

const FEED: FeedItem[] = [
  { tipo: 'reagiu', em: at(20), pessoa: ana, ref: 'rminha1', titulo: 'The Legend of Zelda: Tears of the Kingdom', mural: 'jogos', silenciado: false, reacao: 'fogo' },
  { tipo: 'reagiu', em: at(19), pessoa: bia, ref: 'rminha1', titulo: 'The Legend of Zelda: Tears of the Kingdom', mural: 'jogos', silenciado: false, reacao: 'amei' },
  { tipo: 'resenha', em: at(18), pessoa: bia, ref: 'rbia01', titulo: 'Hades', mural: 'jogos', silenciado: false },
  { tipo: 'comentou', em: at(17), pessoa: cris, ref: 'rminha2', titulo: 'Hades', mural: 'jogos', silenciado: false },
  { tipo: 'seguiu', em: at(16), pessoa: cris, euSigo: false },
  { tipo: 'resenha', em: at(15), pessoa: ana, ref: 'rana01', titulo: 'Celeste', mural: 'series', silenciado: false },
  { tipo: 'seguiu', em: at(14), pessoa: bia, euSigo: true },
];
const PEOPLE: People = {
  seguindo: [
    { ...ana, desde: at(1), silenciado: false, rev: 1, meSegue: true },
    { ...bia, desde: at(1), silenciado: true, rev: 1, meSegue: true },
  ],
  seguidores: [
    { ...ana, desde: at(1), euSigo: true },
    { ...bia, desde: at(1), euSigo: true },
    { ...cris, desde: at(1), euSigo: false },
  ],
};

type Box = { name: string; r: DOMRect; el: Element };

describe('Amigos em todas as larguras', () => {
  let fixture: ComponentFixture<MailPage>;
  let host: HTMLElement;
  let still: HTMLStyleElement;
  const loaded: FontFace[] = [];

  beforeAll(async () => {
    // as letras do site: o teste serve os arquivos em /media (o CSS global os pede em /base/media)
    const faces: [string, string, FontFaceDescriptors][] = [
      ['Permanent Marker', 'permanent-marker-latin-400-normal', { weight: '400' }],
      ['Kalam', 'kalam-latin-700-normal', { weight: '700' }],
      ['Barlow Condensed', 'barlow-condensed-latin-800-normal', { weight: '800' }],
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
    const items = signal<FeedItem[]>(FEED);
    const people = signal<People | null>(PEOPLE);
    const follow = {
      available: signal(true),
      offline: signal(false),
      items,
      // tudo chegou depois da última visita: os adesivos "Novo" e o número da etiqueta aparecem
      seenAt: signal<string | null>(at(0)),
      seenKeys: signal<ReadonlySet<string>>(new Set()),
      people,
      visible: computed(() => items()),
      isFollowing: (code: string) => people()?.seguindo.some((p) => p.codigo === code) ?? null,
      check: async () => undefined,
      loadPeople: async () => people()!,
      markSeen: async () => undefined,
    };
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: LocalData, useClass: MemoryData },
        { provide: Follow, useValue: follow },
        // os murais não vêm: cada post fica com a cartolina de "Tentar de novo" (a ficha tem os testes dela)
        { provide: CloudMurals, useValue: { ensure: async () => null } },
        { provide: ColleagueStore, useValue: { colleagues: signal([]), select: () => undefined } },
        { provide: ProfilePeople, useValue: { of: () => undefined, load: async () => undefined } },
        { provide: Reactions, useValue: { canReact: () => true, mineOn: () => null, of: () => [], myCode: () => 'EEEE-0000', load: async () => undefined, react: async () => undefined } },
        { provide: Comments, useValue: { countOf: () => 0, loadCounts: async () => undefined, want: () => undefined } },
        { provide: Cloud, useValue: { ready: Promise.resolve(), config: signal({ api: 'https://api.teste', googleClientId: 'x' }) } },
        { provide: CloudAccount, useValue: { account: signal({ id: 'u-eu', codigo: 'EEEE-0000', nome: 'Eu' }), signedIn: signal(true) } },
        { provide: Confirm, useValue: { ask: async () => true, choose: async () => null } },
      ],
    });
    TestBed.overrideComponent(MailPage, { remove: { imports: [ReviewReader] }, add: { imports: [StubReader] } });
    fixture = TestBed.createComponent(MailPage);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    fixture.detectChanges();
    await fixture.whenStable();
    for (let i = 0; i < 5; i++) await new Promise((r) => setTimeout(r, 0));
    fixture.detectChanges();
    await document.fonts.ready;
  });

  afterEach(() => {
    host.remove();
    localStorage.clear();
    TestBed.resetTestingModule();
  });

  const boxes = (sel: string): Box[] =>
    [...host.querySelectorAll(sel)]
      .filter((el) => (el as HTMLElement).offsetParent !== null)
      .map((el) => ({
        el,
        r: el.getBoundingClientRect(),
        name: (el.getAttribute('aria-label') || el.textContent || el.className).toString().trim().replace(/\s+/g, ' ').slice(0, 34),
      }));

  /** O que vale em qualquer parte: nada sai da página, as etiquetas numa fileira, alvos do tamanho do dedo. */
  function common(w: number, say: (msg: string) => void): void {
    const page = host.getBoundingClientRect();
    if (host.scrollWidth > host.clientWidth + 1) say(`a página rola para o lado (${host.scrollWidth}px)`);
    const tabs = boxes('.aba');
    if (tabs.length !== 3) say(`${tabs.length} etiquetas`);
    if (Math.max(...tabs.map((t) => t.r.top)) - Math.min(...tabs.map((t) => t.r.top)) > 6) say('as etiquetas quebraram de linha');
    for (const t of tabs) {
      // o nome inteiro, numa linha só, dentro da etiqueta (o número dos avisos fica na quina, por fora)
      const name = t.el.querySelector('.aba-nome')!.getBoundingClientRect();
      if (name.left < t.r.left + 2 || name.right > t.r.right - 2 || name.height > 26) say(`etiqueta ${t.name} cortada`);
      if (t.r.height < 44) say(`etiqueta ${t.name} baixa demais (${Math.round(t.r.height)}px)`);
    }
    for (let i = 0; i < tabs.length; i++) for (let j = i + 1; j < tabs.length; j++) if (Math.min(tabs[i].r.right, tabs[j].r.right) - Math.max(tabs[i].r.left, tabs[j].r.left) > 1) say(`${tabs[i].name} encosta em ${tabs[j].name}`);
    // tudo o que se toca fica dentro da página e tem pelo menos 40px (as etiquetas, 44); o nome de
    // alguém é um link de texto: vale a altura (30px) e a largura que o nome tiver
    for (const t of boxes('button, a')) {
      if (t.r.left < page.left - 12 || t.r.right > page.right + 12) say(`${t.name} sai da página`);
      const [minW, minH] = t.el.matches('.nome, .pessoa-nome, .link-giz') ? [16, 30] : [40, 40];
      if (t.r.width < minW || t.r.height < minH) say(`${t.name} pequeno demais (${Math.round(t.r.width)}x${Math.round(t.r.height)})`);
    }
    void w;
  }

  async function goTo(id: 'chegou' | 'avisos' | 'pessoas'): Promise<void> {
    host.querySelector<HTMLElement>(`#aba-${id}`)!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  it('as letras do site carregaram (sem elas, as larguras seriam outras)', () => {
    expect(loaded.map((f) => f.status)).toEqual(['loaded', 'loaded', 'loaded']);
  });

  it('Feed: os posts numa coluna e o quadro de avisos ao lado só quando cabe', () => {
    expect(host.querySelectorAll('app-feed-post').length).withContext('os dois posts').toBe(2);
    expect(host.querySelector('.aba .conta')?.textContent?.trim()).withContext('o número de avisos novos na etiqueta').toBe('4');
    const problems: string[] = [];
    for (const w of WIDTHS) {
      host.style.width = `${w}px`;
      const say = (msg: string) => problems.push(`${w}px: ${msg}`);
      common(w, say);
      const page = host.getBoundingClientRect();
      const feed = host.querySelector('.feed')!.getBoundingClientRect();
      const board = boxes('.lado')[0];
      if (!!board !== w >= BOARD_BESIDE) say(board ? 'o quadro apareceu sem lugar' : 'o quadro sumiu');
      if (board) {
        if (board.r.right > page.right + 1) say('o quadro sai da página');
        if (board.r.left < feed.right + 24) say(`o quadro encosta no Feed (${Math.round(board.r.left - feed.right)}px)`);
      }
      if (feed.right > page.right + 1) say('o Feed sai da página');
      // o pé de cada post não passa da largura do post
      for (const pe of boxes('app-feed-post .espera')) if (pe.r.right > feed.right + 2) say('a ficha passa da coluna do Feed');
    }
    expect(problems).toEqual([]);
  });

  it('Avisos: o quadro inteiro, com cada linha dentro da folha', async () => {
    await goTo('avisos');
    expect(host.querySelectorAll('.aviso').length).toBe(4);
    const problems: string[] = [];
    for (const w of WIDTHS) {
      host.style.width = `${w}px`;
      const say = (msg: string) => problems.push(`${w}px: ${msg}`);
      common(w, say);
      const sheet = host.querySelector('.folha')!.getBoundingClientRect();
      if (sheet.right > host.getBoundingClientRect().right + 1) say('a folha sai da página');
      for (const t of boxes('.aviso .texto, .aviso .seguir, .aviso .mutuo')) if (t.r.right > sheet.right - 8 || t.r.left < sheet.left + 8) say(`${t.name} sai da folha`);
    }
    expect(problems).toEqual([]);
  });

  it('Pessoas: o campo do código, o seu código e a lista dentro da folha, com as opções de alguém abertas', async () => {
    await goTo('pessoas');
    host.querySelector<HTMLElement>('.pessoa .opcoes')!.click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(host.querySelectorAll('.pessoa').length).toBe(3);
    expect(host.querySelector('.gaveta')).not.toBeNull();
    const problems: string[] = [];
    for (const w of WIDTHS) {
      host.style.width = `${w}px`;
      const say = (msg: string) => problems.push(`${w}px: ${msg}`);
      common(w, say);
      const sheet = host.querySelector('.folha')!.getBoundingClientRect();
      if (sheet.right > host.getBoundingClientRect().right + 1) say('a folha sai da página');
      for (const t of boxes('.folha button, .folha input, .pessoa-nome, .gaveta-dica')) if (t.r.right > sheet.right - 8 || t.r.left < sheet.left + 8) say(`${t.name} sai da folha`);
      // o crachá fica ao lado da folha ou em cima dela, nunca por cima, e o nome e o código cabem nele
      const badge = host.querySelector('.meu-cracha')!.getBoundingClientRect();
      const beside = badge.left >= sheet.right - 6;
      const above = badge.bottom <= sheet.top + 16;
      if (!beside && !above) say('o crachá encosta na folha');
      for (const t of boxes('.meu-codigo, .meu-cracha button')) if (t.r.left < badge.left - 6 || t.r.right > badge.right + 6) say(`${t.name} sai do crachá`);
      const input = host.querySelector('#codigo-seguir')!.getBoundingClientRect();
      if (input.width < 120) say(`o campo do código ficou estreito (${Math.round(input.width)}px)`);
    }
    expect(problems).toEqual([]);
  });
});
