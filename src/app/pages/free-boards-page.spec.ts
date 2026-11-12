import { Component, getDebugNode, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Router, RouterOutlet, provideRouter } from '@angular/router';
import { freeBoardMatcher } from '../app.routes';
import { freeBoardPath } from '../core/areas';
import { FreeBoard, boardInGroup, sanitizeFreeBoard } from '../core/free-board';
import { Camera } from '../core/free-board-geometry';
import { FreeBoardStore } from '../core/free-board-store';
import { FreeBoardSync } from '../core/free-board-sync';
import { studyGroupId } from '../core/study';
import { Confirm } from '../ui/confirm';
import { FreeBoardsPage } from './free-boards-page';
import { expectEtiquetaPadrao } from '../testing/etiqueta-acoes.spec';
import { Desk } from '../core/desk';
import { FreeBoardNoteAsk } from '../core/free-board-note-ask';
import { sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';

@Component({ selector: 'app-raiz', imports: [RouterOutlet], template: '<router-outlet />' })
class Raiz {}

const board = (id: string, nome: string, grupo: string, em: string, n = 2): FreeBoard =>
  sanitizeFreeBoard({
    v: 1,
    id: id.padEnd(22, 'x'),
    nome,
    grupo,
    em,
    n: Array.from({ length: n }, (_, k) => ({ i: `p${k}`, t: 'x', x: k * 260, y: 0, w: 208, h: 104, txt: `Bilhete ${k}` })),
    e: [],
  })!;

/** A loja dos quadros de mentira: os quadros num signal, sem banco. */
class FakeStore {
  readonly boards = signal<readonly FreeBoard[]>([]);
  readonly ready = Promise.resolve();
  cameras = new Map<string, Camera>();
  created: [string, string][] = [];
  get(id: string) {
    return this.boards().find((b) => b.id === id) ?? null;
  }
  inGroup(g: string) {
    return this.boards().filter((b) => boardInGroup(b, g));
  }
  async create(nome: string, grupo: string) {
    this.created.push([nome, grupo]);
    const b = board('novo', nome, grupo, '2026-11-09T23:00:00.000Z', 0);
    this.boards.update((l) => [b, ...l]);
    return b;
  }
  async rename(id: string, nome: string) {
    this.boards.update((l) => l.map((b) => (b.id === id ? { ...b, nome } : b)));
    return this.get(id);
  }
  async moveToGroup(id: string, grupo: string) {
    this.boards.update((l) => l.map((b) => (b.id === id ? { ...b, grupo } : b)));
    return this.get(id);
  }
  async duplicate() {
    return null;
  }
  async remove(id: string) {
    const b = this.get(id);
    this.boards.update((l) => l.filter((x) => x.id !== id));
    return b;
  }
  async restore(b: FreeBoard) {
    this.boards.update((l) => [b, ...l]);
    return b;
  }
  async camera(id: string) {
    return this.cameras.get(id) ?? null;
  }
  async setCamera(id: string, c: Camera) {
    this.cameras.set(id, c);
  }
}

/** O seu papel no quadro, como a sincronização diz (PLANO-COMPARTILHAR.md, rodada 6). */
let boardRole = 'dono';

describe('a página do Quadro livre', () => {
  let host: HTMLElement;
  let router: Router;
  let store: FakeStore;

  async function settle(n = 6): Promise<void> {
    for (let i = 0; i < n; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  }
  async function go(url: string): Promise<void> {
    await router.navigateByUrl(url);
    await settle();
  }
  const $ = <T extends HTMLElement = HTMLElement>(sel: string) => host.querySelector<T>(sel);
  const $$ = (sel: string) => [...host.querySelectorAll<HTMLElement>(sel)];
  const text = (el: Element | null) => el?.textContent?.replace(/\s+/g, ' ').trim() ?? '';

  beforeEach(() => {
    store = new FakeStore();
    store.boards.set([
      board('mansao', 'Mansão', 'Jogos', '2026-11-09T20:00:00.000Z', 3),
      board('verbos', 'Verbos', 'Estudos', '2026-11-08T20:00:00.000Z', 1),
    ]);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([{ matcher: freeBoardMatcher, component: FreeBoardsPage }]),
        { provide: FreeBoardStore, useValue: store },
        { provide: FreeBoardSync, useValue: { flush: async () => undefined, noteVersion: () => undefined, roleOf: () => boardRole, shared: () => new Map() } },
        { provide: Confirm, useValue: { ask: async () => true } },
      ],
    });
    router = TestBed.inject(Router);
    const fixture = TestBed.createComponent(Raiz);
    host = fixture.nativeElement;
    document.body.appendChild(host);
  });
  afterEach(() => host.remove());

  it('o endereço: Tudo, um grupo, um quadro aberto, e nada mais', () => {
    const seg = (p: string) => p.split('/').filter(Boolean).map((path) => ({ path, parameters: {}, parameterMap: null })) as never;
    expect(freeBoardMatcher(seg('anotacoes/quadro-livre'))?.posParams).toEqual({});
    expect(Object.keys(freeBoardMatcher(seg('anotacoes/quadro-livre/g1/q1'))!.posParams!)).toEqual(['grupo', 'quadro']);
    expect(freeBoardMatcher(seg('anotacoes/quadro-livre/a/b/c'))).toBeNull();
    expect(freeBoardMatcher(seg('anotacoes/kanban'))).toBeNull();
    expect(freeBoardPath(studyGroupId('Jogos'), 'q')).toBe(`/anotacoes/quadro-livre/${studyGroupId('Jogos')}/q`);
  });

  it('Tudo mostra os quadros de todos os grupos em folhas, com o nome, quantas peças e as abas dos grupos', async () => {
    await go(freeBoardPath());
    const cards = $$('app-free-board-card');
    expect(cards.length).toBe(2);
    expect(text(cards[0].querySelector('.nome'))).toBe('Mansão');
    expect(text(cards[0].querySelector('.pe'))).toContain('3 peças');
    expect(cards[0].querySelector('a')!.getAttribute('href')).toContain(`/anotacoes/quadro-livre/${studyGroupId('Jogos')}/mansao`);
    expect(cards[0].querySelector('app-board-sketch svg')).not.toBeNull();
    const tabs = $$('.abas-grupos .abas:not(.medida) .aba').map(text);
    expect(tabs.some((t) => t.includes('Jogos'))).toBeTrue();
    expect(tabs.some((t) => t.includes('Estudos'))).toBeTrue();
    expect(text($('.resumo'))).toContain('2 quadros em todos os grupos');
  });

  it('um grupo mostra só os quadros dele', async () => {
    await go(freeBoardPath(studyGroupId('Estudos')));
    expect($$('app-free-board-card').map((c) => text(c.querySelector('.nome')))).toEqual(['Verbos']);
    expect(text($('.vaga'))).toBe('Novo quadro em Estudos');
  });

  it('Novo quadro: a folha pede o nome e o quadro abre já criado, no grupo aberto', async () => {
    await go(freeBoardPath(studyGroupId('Jogos')));
    $('.vaga')!.click();
    await settle();
    const input = $<HTMLInputElement>('.novo-nome input')!;
    expect(document.activeElement).toBe(input);
    input.value = 'Blue';
    input.dispatchEvent(new Event('input'));
    await settle();
    $<HTMLFormElement>('form.novo')!.requestSubmit();
    await settle(10);
    expect(store.created).toEqual([['Blue', 'Jogos']]);
    expect(router.url).toBe(freeBoardPath(studyGroupId('Jogos'), store.boards()[0].id));
  });

  it('o quadro abre em tela cheia, só para ver, com o nome e o Voltar; o Esc volta para a lista', async () => {
    await go(freeBoardPath(studyGroupId('Jogos'), store.boards()[0].id));
    await settle(10);
    expect($('.tela-cheia')).not.toBeNull();
    expect(text($('.nome-quadro'))).toBe('Mansão');
    expect($('.tela-cheia app-free-board')).not.toBeNull();
    document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await settle(10);
    expect(router.url).toBe(freeBoardPath(studyGroupId('Jogos')));
    expect($('.tela-cheia')).toBeNull();
  });

  it('o topo do quadro aberto são etiquetas de tinta separadas, como as ferramentas: voltar, Editar ou Pronto e a tela cheia', async () => {
    await go(freeBoardPath(studyGroupId('Jogos'), store.boards()[0].id));
    await settle(10);
    expectEtiquetaPadrao($('.grupo-voltar')!, { semMedida: true });
    const dir = $('.topo-dir')!;
    expect([...dir.querySelectorAll('button')].map((b) => text(b) || b.querySelector('.sr-only')?.textContent?.trim())).toEqual(['Compartilhar', 'Editar', 'Tela cheia']);
    expectEtiquetaPadrao(dir, { rotate: '-1deg', gap: '6px', semMedida: true, comNome: ['compartilhar', 'editar'] });
    $<HTMLButtonElement>('.etiqueta-topo.editar')!.click();
    await settle(10);
    expect(text($('.etiqueta-topo.pronto'))).toBe('Pronto');
    expectEtiquetaPadrao(dir, { rotate: '-1deg', gap: '6px', semMedida: true, comNome: ['compartilhar', 'pronto'] });
  });

  it('o quadro que não está aqui diz isso, com o caminho de volta', async () => {
    await go(freeBoardPath(studyGroupId('Jogos'), 'naoexistexxxxxxxxxxxxx'));
    expect(text($('.aviso'))).toContain('Este quadro não está aqui');
  });

  it('o botão direito num quadro abre o menu dele; Renomear troca o nome no lugar da folha', async () => {
    await go(freeBoardPath());
    const link = $$('app-free-board-card a')[0];
    link.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
    await settle();
    const items = [...document.querySelectorAll<HTMLElement>('.menu-contexto [role="menuitem"]')].map(text);
    expect(items).toEqual(['Abrir', 'Renomear', 'Duplicar', 'Compartilhar', 'Mover para o grupo…', 'Tornar público', 'Apagar']);
    [...document.querySelectorAll<HTMLElement>('.menu-contexto [role="menuitem"]')][1].click();
    await settle();
    const input = $<HTMLInputElement>('.renomear input')!;
    input.value = 'Mansão velha';
    input.dispatchEvent(new Event('input'));
    $<HTMLFormElement>('form.renomear')!.requestSubmit();
    await settle();
    expect(store.boards()[0].nome).toBe('Mansão velha');
  });

  it('o quadro de outra pessoa que você só lê (PLANO-COMPARTILHAR.md, rodada 6): sem Editar, e o menu sem o que é do dono', async () => {
    boardRole = 'leitor';
    try {
      await go(freeBoardPath());
      $$('app-free-board-card a')[0].dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, clientX: 40, clientY: 40 }));
      await settle();
      expect([...document.querySelectorAll<HTMLElement>('.menu-contexto [role="menuitem"]')].map(text)).toEqual(['Abrir', 'Duplicar', 'Compartilhar']);
      document.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
      await go(freeBoardPath(studyGroupId('Jogos'), store.boards()[0].id));
      await settle(10);
      expect($('.etiqueta-topo.editar')).toBeNull();
      expect($('.etiqueta-topo.compartilhar')).not.toBeNull();
    } finally {
      boardRole = 'dono';
    }
  });

  it('a miniatura de um quadro mais alto que largo cabe na folha (antes, esticava a folha e empurrava o nome para fora)', async () => {
    const tall = sanitizeFreeBoard({
      v: 1, id: 'torreTorreTorreTorre01', nome: 'Torre', grupo: 'Jogos', em: '2026-11-10T20:00:00.000Z',
      n: [{ i: 'm', t: 'm', x: 0, y: 0, w: 300, h: 2000 }, { i: 'x', t: 'x', x: 20, y: 1900, w: 200, h: 80, txt: 'Embaixo' }],
      e: [],
    })!;
    store.boards.set([tall, ...store.boards()]);
    await go(freeBoardPath());
    const card = $$('app-free-board-card').find((c) => text(c.querySelector('.nome')) === 'Torre')!;
    const folha = card.querySelector('.folha')!.getBoundingClientRect();
    const mini = card.querySelector('.miniatura')!.getBoundingClientRect();
    const pe = card.querySelector('.pe')!.getBoundingClientRect();
    expect(mini.width).toBeLessThanOrEqual(folha.width);
    expect(mini.height).toBeLessThan(folha.width);
    expect(pe.bottom).toBeLessThanOrEqual(folha.bottom + 0.5);
  });

  it('pôr uma anotação: o seletor mostra as de qualquer grupo, as finalizadas também; "Nova anotação" abre o editor no grupo do quadro e a salva vai para o quadro', async () => {
    const reviews = TestBed.inject(ReviewStore);
    const mk = (id: string, name: string, category: string, extra: Record<string, unknown> = {}) =>
      sanitizeReview({ id, kind: 'anotacoes', game: { name, coverUrl: null, source: 'manual' }, category, text: '', createdAt: '2026-11-01T10:00:00.000Z', updatedAt: '2026-11-01T10:00:00.000Z', ...extra })!;
    reviews.reviews.set([mk('n1', 'Senhas', 'Jogos'), mk('n2', 'Daily', 'Trabalho'), mk('n3', 'Chefe final', 'Jogos', { completedAt: '2026-11-02T10:00:00.000Z' })]);
    await go(freeBoardPath(studyGroupId('Jogos'), 'mansao'));
    // o dono pede pelo quadro (a peça chama `owner.pickNote`)
    const instance = getDebugNode(host.querySelector('app-free-boards-page')!)!.componentInstance as FreeBoardsPage;
    const asked = instance.owner.pickNote('Jogos');
    await settle();
    const names = $$('dialog.escolher .escolha .nome').map(text);
    expect(names).toEqual(jasmine.arrayWithExactContents(['Senhas', 'Daily', 'Chefe final']));
    const desk = TestBed.inject(Desk);
    const opened = spyOn(desk, 'newNoteIn');
    $<HTMLButtonElement>('dialog.escolher .criar')!.click();
    await settle();
    expect(opened).toHaveBeenCalledWith('Jogos', undefined, undefined, '');
    // o editor salvou a nova: ela vai para o quadro
    expect(TestBed.inject(FreeBoardNoteAsk).claim('n9', 'Ideia')).toBeTrue();
    expect(await asked).toEqual({ id: 'n9', title: 'Ideia' });
  });
});
