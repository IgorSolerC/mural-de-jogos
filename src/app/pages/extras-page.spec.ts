import { provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { CloudAccount, CloudAccountInfo } from '../core/cloud-account';
import { Colleague, ColleagueStore } from '../core/colleague-store';
import { Cloud } from '../core/cloud-config';
import { todayISO } from '../core/dates';
import { PixelGallery } from '../core/pixel-gallery-store';
import { PomodoroStore } from '../core/pomodoro-store';
import { Review } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { ExtrasPage } from './extras-page';

/** Extras repensado (PLANO-EXTRAS.md): a prateleira "Sempre à mão", o seletor de mural e os dois letreiros. */

const at = '2026-11-01T12:00:00.000Z';
function review(id: string, name: string, final: number): Review {
  return {
    id,
    kind: 'jogos',
    game: { name, coverUrl: null, source: 'manual' },
    scores: { historia: final, diversao: final, jogabilidade: final, visual: final, final },
    status: 'finalizado',
    difficulty: 'media',
    verdict: null,
    weights: {},
    bonuses: [],
    hoursPlayed: 10,
    text: '',
    stock: 'amarelo',
    private: false,
    createdAt: at,
    updatedAt: at,
    completedAt: '2026-11-01',
  } as unknown as Review;
}

describe('a página de Extras', () => {
  afterEach(() => localStorage.clear());

  /** Abre a página; com `keep`, sem limpar o que o teste guardou no navegador antes. */
  async function open(options: { cloud?: boolean; signedIn?: boolean; account?: Partial<CloudAccountInfo> | null; reviews?: Review[]; keep?: boolean }) {
    if (!options.keep) localStorage.clear();
    const account = signal(options.account === undefined ? null : options.account);
    TestBed.configureTestingModule({
      imports: [ExtrasPage],
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([]),
        { provide: Cloud, useValue: { config: signal(options.cloud === false ? null : { api: 'https://api.teste' }) } },
        { provide: CloudAccount, useValue: { account, signedIn: () => options.signedIn !== false && account() !== null } },
      ],
    });
    const store = TestBed.inject(ReviewStore);
    for (const r of options.reviews ?? []) store.add(r);
    const fixture = TestBed.createComponent(ExtrasPage);
    await fixture.whenStable();
    const host: HTMLElement = fixture.nativeElement;
    const linha = (href: string) => host.querySelector<HTMLAnchorElement>(`a[href="${href}"]`);
    return {
      account,
      fixture,
      host,
      linha,
      /** O nome acessível da linha: o nome e como está. */
      label: (href: string) => linha(href)?.getAttribute('aria-label'),
      boards: () => [...host.querySelectorAll('.letreiro-cab .sr-only')].map((h) => h.textContent?.trim()),
    };
  }

  const MURAL = ['/extras/muraldle', '/extras/mata-mata', '/extras/maior-ou-menor', '/extras/estatisticas', '/ranking', '/comparar'];

  it('tem a prateleira com o Pomodoro e as Pixel arts, e os letreiros Jogar e Números com as seis linhas', async () => {
    const t = await open({ signedIn: false });
    expect(t.host.querySelector('#extras-mao')?.textContent?.trim()).toBe('Sempre à mão');
    expect(t.linha('/extras/pomodoro')).not.toBeNull();
    expect(t.linha('/extras/pixel-arts')).not.toBeNull();
    expect(t.boards()).toEqual(['Jogar', 'Números']);
    for (const href of MURAL) expect(t.linha(href)).withContext(href).not.toBeNull();
    expect(t.linha('/extras/uso-das-apis')).toBeNull();
  });

  it('o seletor de mural fica na página, logo antes dos letreiros (a prateleira vale para qualquer mural)', async () => {
    const t = await open({ signedIn: false });
    const seletor = t.host.querySelector('.de-quem app-kind-switcher')!;
    expect(seletor).not.toBeNull();
    const shelf = t.host.querySelector('.mao')!;
    const boards = t.host.querySelector('.letreiros')!;
    expect(shelf.compareDocumentPosition(seletor) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(seletor.compareDocumentPosition(boards) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
  });

  it('cada linha diz como está no nome do link; as letras de plástico ficam fora do leitor de tela', async () => {
    const t = await open({ signedIn: false, reviews: [review('a', 'Hades', 9.4), review('b', 'Celeste', 8), review('c', 'Tunic', 7)] });
    expect(t.label('/extras/muraldle')).toBe('Muraldle: a de hoje te espera');
    expect(t.label('/extras/mata-mata')).toBe('Mata-mata: comece um torneio');
    expect(t.label('/extras/maior-ou-menor')).toBe('Maior ou menor: sem recorde ainda');
    expect(t.label('/extras/estatisticas')).toBe('Estatísticas: 3 jogos · média 8,1');
    expect(t.label('/ranking')).toBe('Ranking: 1º Hades 9,4');
    expect(t.label('/comparar')).toBe('Comparar: só com conta');
    for (const l of t.host.querySelectorAll('app-plastic-letters')) expect(l.getAttribute('aria-hidden')).toBe('true');
  });

  it('o mural vazio diz o que falta em cada linha', async () => {
    const t = await open({ signedIn: false });
    expect(t.label('/extras/muraldle')).toBe('Muraldle: precisa de 3 fichas');
    expect(t.label('/extras/mata-mata')).toBe('Mata-mata: precisa de 2 fichas');
    expect(t.label('/extras/estatisticas')).toBe('Estatísticas: nada no mural ainda');
    expect(t.label('/extras/pixel-arts')).toBe('Pixel arts: nenhuma obra ainda');
  });

  it('o Muraldle de hoje começado e o recorde do Maior ou menor aparecem', async () => {
    const reviews = [review('a', 'Hades', 9), review('b', 'Celeste', 8), review('c', 'Tunic', 7)];
    localStorage.setItem('mural-de-jogos:muraldle:v1', JSON.stringify({ games: { 'jogos|eu': { day: todayISO(), secretId: 'a', guesses: ['b', 'c'], done: null } }, stats: {} }));
    localStorage.setItem('mural-de-jogos:recordes:v1', JSON.stringify({ 'maior-ou-menor|jogos|eu|final': 6, 'maior-ou-menor|jogos|eu|diversao': 11 }));
    const t = await open({ signedIn: false, reviews, keep: true });
    expect(t.label('/extras/muraldle')).toBe('Muraldle: hoje · 2 chutes');
    expect(t.label('/extras/maior-ou-menor')).toBe('Maior ou menor: recorde 11');

    // outra aba acerta a de hoje: a página relê sem recarregar
    localStorage.setItem('mural-de-jogos:muraldle:v1', JSON.stringify({ games: { 'jogos|eu': { day: todayISO(), secretId: 'a', guesses: ['b', 'c', 'a'], done: 'acertou' } }, stats: {} }));
    window.dispatchEvent(new StorageEvent('storage', { key: 'mural-de-jogos:muraldle:v1' }));
    await t.fixture.whenStable();
    expect(t.label('/extras/muraldle')).toBe('Muraldle: hoje · acertou em 3');
  });

  it('as peças: a fileira do último chute, a sequência, os duelos e o recorde', async () => {
    const reviews = [review('a', 'Hades', 9), review('b', 'Celeste', 8), review('c', 'Tunic', 7), review('d', 'Inside', 6)];
    localStorage.setItem('mural-de-jogos:muraldle:v1', JSON.stringify({ games: {}, stats: { 'jogos|eu': { played: 6, won: 6, streak: 6, best: 6, lastWon: todayISO(), recent: [] } } }));
    localStorage.setItem('mural-de-jogos:mata-mata:v1', JSON.stringify({ jogos: { owner: 'eu', option: 'todos', slots: ['a', 'b', 'c', 'd'], picks: ['a'], masked: true, startedAt: '' } }));
    localStorage.setItem('mural-de-jogos:recordes:v1', JSON.stringify({ 'maior-ou-menor|jogos|eu|final': 14 }));
    const t = await open({ signedIn: false, reviews, keep: true });
    const linha = (href: string) => t.linha(href)!;

    // sem chute hoje: a fileira cinza, uma peça por coluna do jogo; a sequência na peça da chama
    const pecas = [...linha('/extras/muraldle').querySelectorAll('.pc')];
    expect(pecas.length).toBe(9);
    expect(pecas.every((p) => p.getAttribute('data-m') === 'desconhecido')).toBeTrue();
    expect(linha('/extras/muraldle').querySelector('.pc-chama')?.textContent?.trim()).toBe('6 dias');
    expect(t.label('/extras/muraldle')).toBe('Muraldle: a de hoje te espera, 6 dias seguidos');

    // o torneio de 4: 3 duelos, o primeiro feito e o segundo agora
    const duelos = [...linha('/extras/mata-mata').querySelectorAll('.pc-duelos i')].map((i) => i.getAttribute('data-s'));
    expect(duelos).toEqual(['feito', 'agora', 'falta']);
    expect(t.label('/extras/mata-mata')).toBe('Mata-mata: Semifinal · duelo 2 de 3');

    expect(linha('/extras/maior-ou-menor').querySelector('.pc-numero')?.textContent?.trim()).toBe('14');
    expect(linha('/extras/maior-ou-menor').querySelectorAll('.pc-setas i').length).toBe(2);
    for (const p of t.host.querySelectorAll('.pc-fila, .pc-chama, .pc-duelos, .pc-setas, .pc-numero')) expect(p.getAttribute('aria-hidden')).toBe('true');
  });

  it('sem fichas bastantes, nenhuma peça: só o que falta', async () => {
    const t = await open({ signedIn: false, reviews: [review('a', 'Hades', 9)] });
    expect(t.linha('/extras/muraldle')!.querySelector('.pc-fila')).toBeNull();
    expect(t.linha('/extras/maior-ou-menor')!.querySelector('.pc-setas')).toBeNull();
    expect(t.linha('/extras/mata-mata')!.querySelector('.pc-duelos')).toBeNull();
  });

  it('os números em peças: as varetinhas das notas, as medalhas do pódio', async () => {
    const t = await open({ signedIn: false, reviews: [review('a', 'Hades', 9.4), review('b', 'Celeste', 8), review('c', 'Tunic', 7), review('d', 'Inside', 3)] });
    const barras = [...t.linha('/extras/estatisticas')!.querySelectorAll('.pc-barras i')];
    expect(barras.length).toBe(11);
    // as de 7 para cima em amarelo; a maior vareta do tamanho todo
    expect(barras.map((b) => b.classList.contains('alta'))).toEqual([false, false, false, false, false, false, false, true, true, true, true]);
    expect((barras[9] as HTMLElement).style.height).toBe('100%');
    expect((barras[0] as HTMLElement).style.height).toBe('0%');
    expect([...t.linha('/ranking')!.querySelectorAll('.pc-medalhas i')].map((m) => m.textContent?.trim())).toEqual(['1', '2', '3']);
    expect(t.label('/ranking')).toBe('Ranking: 1º Hades 9,4');
  });

  it('sem fichas, nem varetinhas nem medalhas', async () => {
    const t = await open({ signedIn: false });
    expect(t.host.querySelector('.pc-barras')).toBeNull();
    expect(t.host.querySelector('.pc-medalhas')).toBeNull();
  });

  it('Comparar: cada amigo aberto numa bolinha com a inicial e quanto combinam, o escolhido primeiro', async () => {
    const t = await open({ account: { codigo: 'K7QF-M2XA', nome: 'Ana' }, reviews: [review('a', 'Hades', 9.4), review('b', 'Celeste', 8)] });
    const friend = (id: string, name: string, reviews: Review[]) => ({ id, name, fileName: '', loadedAt: at, reviews }) as unknown as Colleague;
    const store = TestBed.inject(ColleagueStore);
    store.colleagues.set([friend('bia', 'Bia', [review('x', 'Hades', 9.4), review('y', 'Celeste', 8)]), friend('leo', 'Léo', [review('z', 'Outra', 5)])]);
    await t.fixture.whenStable();
    const rostos = [...t.linha('/comparar')!.querySelectorAll('.pc-amigo')];
    expect(rostos.map((r) => r.querySelector('.pc-rosto')!.textContent!.trim())).toEqual(['B', 'L']);
    expect(rostos.map((r) => r.querySelector('app-plastic-letters')!.textContent!.replace(/\s+/g, ''))).toEqual(['100%', '–']);
    expect(t.label('/comparar')).toBe('Comparar: Bia 100%, Léo nada em comum');
  });

  it('o torneio jogado com o mural de um colega diz de quem é', async () => {
    const theirs = [review('b1', 'Hades', 9), review('b2', 'Celeste', 8), review('b3', 'Tunic', 7), review('b4', 'Inside', 6)];
    localStorage.setItem('mural-de-jogos:mata-mata:v1', JSON.stringify({ jogos: { owner: 'bia', option: 'todos', slots: ['b1', 'b2', 'b3', 'b4'], picks: ['b1'], masked: true, startedAt: '' } }));
    const t = await open({ signedIn: false, reviews: [review('a', 'Hades', 9), review('b', 'Celeste', 8)], keep: true });
    TestBed.inject(ColleagueStore).colleagues.set([{ id: 'bia', name: 'Bia', fileName: '', loadedAt: at, reviews: theirs } as unknown as Colleague]);
    await t.fixture.whenStable();
    expect(t.label('/extras/mata-mata')).toBe('Mata-mata: Semifinal · duelo 2 de 3 · com Bia');
  });

  it('outra conta vê a mesma página, sem a prancheta', async () => {
    const t = await open({ account: { codigo: 'K7QF-M2XA', nome: 'Ana' } });
    expect(t.linha('/extras/uso-das-apis')).toBeNull();
    expect(t.label('/comparar')).toBe('Comparar: escolha um amigo');
  });

  it('com a nuvem desligada, nem a conta de admin vê a prancheta', async () => {
    const t = await open({ cloud: false, account: { codigo: 'G11T-G00D', nome: 'Igor', admin: true } });
    expect(t.linha('/extras/uso-das-apis')).toBeNull();
  });

  it('a conta de admin ganha a prancheta do Uso das APIs na prateleira', async () => {
    const t = await open({ account: { codigo: 'G11T-G00D', nome: 'Igor', admin: true } });
    const p = t.linha('/extras/uso-das-apis')!;
    expect(p).not.toBeNull();
    expect(p.closest('app-shelf')).not.toBeNull();
    expect(p.getAttribute('aria-label')).toBe('Uso das APIs: só você vê');
  });

  it('a bandeira que chega depois (a conferida da conta) faz a prancheta aparecer sem recarregar', async () => {
    const t = await open({ account: { codigo: 'G11T-G00D', nome: 'Igor' } });
    expect(t.linha('/extras/uso-das-apis')).toBeNull();
    t.account.set({ codigo: 'G11T-G00D', nome: 'Igor', admin: true });
    await t.fixture.whenStable();
    expect(t.linha('/extras/uso-das-apis')).not.toBeNull();
  });

  it('o Pomodoro ligado muda a fita e o nome do link, e o tomate corre', async () => {
    const t = await open({ signedIn: false });
    const tomate = () => t.linha('/extras/pomodoro')!;
    expect(tomate().getAttribute('aria-label')).toBe('Pomodoro: desligado');
    // a fita diz só o nome; o estado fica no nome do link
    expect(tomate().querySelector('.dymo-fita')?.textContent?.trim()).toBe('Pomodoro');
    const store = TestBed.inject(PomodoroStore);
    store.start();
    await t.fixture.whenStable();
    expect(tomate().getAttribute('aria-label')).toBe('Pomodoro: estudando');
    expect(tomate().querySelector('app-pomodoro-dial')!.classList).not.toContain('parado');
    store.stop();
    await t.fixture.whenStable();
    expect(tomate().getAttribute('aria-label')).toBe('Pomodoro: desligado');
  });

  it('o monitor mostra a obra mais nova e o link conta as obras; sem obra, a tela pede a primeira', async () => {
    const t = await open({ signedIn: false });
    const tela = () => t.linha('/extras/pixel-arts')!.querySelector('app-crt-monitor')!;
    expect(tela().querySelector('app-pixel-thumb')).toBeNull();
    expect(tela().textContent?.trim()).toBe('desenhe a primeira');
    TestBed.inject(PixelGallery).state.set({
      pieces: [
        { id: 'p1', title: 'Gato', art: ['2x2', '12/21'], createdAt: at, at },
        { id: 'p2', title: 'Espada', art: ['1x1', '4'], createdAt: at, at },
      ],
      removed: {},
    });
    await t.fixture.whenStable();
    expect(t.label('/extras/pixel-arts')).toBe('Pixel arts: 2 obras');
    // uma tela só, com a mais nova (a Espada, 1×1)
    const thumbs = tela().querySelectorAll('app-pixel-thumb svg');
    expect(thumbs.length).toBe(1);
    expect(thumbs[0].getAttribute('viewBox')).toBe('0 0 1 1');
    // e a arte ocupa a tela (não some com altura zero)
    expect(thumbs[0].getBoundingClientRect().height).toBeGreaterThan(40);
  });

  it('as fitas da prateleira dizem só o nome', async () => {
    const t = await open({ account: { codigo: 'G11T-G00D', nome: 'Igor', admin: true } });
    const fitas = [...t.host.querySelectorAll('app-shelf .dymo-fita')].map((f) => f.textContent?.trim());
    expect(fitas).toEqual(['Pomodoro', 'Pixel arts', 'Uso das APIs']);
  });
});
