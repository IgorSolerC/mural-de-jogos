import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { Desk, DeskHandlers } from '../core/desk';
import { Mural } from '../core/mural';
import { Wish, relevanceOf } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { WISHLIST_PREFS_KEY } from '../core/wishlist-view';
import { WishFolders } from '../core/wish-folders';
import { Toasts } from '../ui/toast';
import { Confirm } from '../ui/confirm';
import { WishlistPage } from './wishlist-page';

/** Marcar recortes e pastas na Wishlist (PLANO-MARCAR-PASTAS.md, rodada 5). */

const at = (d: number) => new Date(Date.UTC(2026, 10, d)).toISOString();
const wish = (id: string, name: string, extra: Partial<Wish> = {}): Wish => ({ id, kind: 'jogos', game: { name, coverUrl: `https://x.test/${id}.jpg`, source: 'manual' }, createdAt: at(1), updatedAt: at(1), ...extra });

describe('marcar recortes e pastas na Wishlist', () => {
  let host: HTMLElement;
  let store: ReviewStore;
  let folders: WishFolders;
  let page: WishlistPage;
  let opened: string[];
  let copied: string[];
  let coop: string;
  let indie: string;

  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
  const folderButton = (id: string) => host.querySelector<HTMLElement>(`app-folder-card[data-pasta="${id}"] button`)!;
  const cover = (id: string) => host.querySelector<HTMLElement>(`app-wish-cover[data-ficha="${id}"]`)!;
  const tap = (el: HTMLElement, ctrl = true) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: ctrl, button: 0 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ctrl, button: 0 }));
  };
  const trayButton = (id: string) => host.querySelector<HTMLButtonElement>(`app-selection-tray [data-acao="${id}"]`)!;

  beforeEach(async () => {
    localStorage.clear();
    localStorage.setItem(WISHLIST_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    opened = [];
    copied = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (t: string) => void copied.push(t));
    TestBed.inject(Mural).kind.set('jogos');
    store = TestBed.inject(ReviewStore);
    folders = TestBed.inject(WishFolders);
    const noop = () => undefined;
    const handlers: DeskHandlers = {
      newReview: noop, openReview: noop, newNote: noop, newNoteIn: noop, newWish: noop, newDraft: noop, openLoose: noop, closeReader: noop,
      editReview: noop, removeReview: noop, openDraft: noop, openWish: (id) => void opened.push(id), editWish: noop, removeDraft: noop, removeWish: (id) => void store.removeWish(id),
    };
    TestBed.inject(Desk).register(handlers);
    store.saveWish(wish('w1', 'Celeste', { createdAt: at(5), note: 'Plataforma' }));
    store.saveWish(wish('w2', 'Hades', { createdAt: at(4) }));
    store.saveWish(wish('w3', 'Dead Cells', { createdAt: at(3) }));
    coop = folders.create('jogos', null, 'Co-op')!.id;
    indie = folders.create('jogos', null, 'Indies')!.id;
    folders.place(['w2', 'w3'], coop);
    const fixture = TestBed.createComponent(WishlistPage);
    page = fixture.componentInstance;
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  });

  afterEach(async () => {
    host?.remove();
    for (const d of document.querySelectorAll('dialog[open]')) (d as HTMLDialogElement).close();
    TestBed.inject(Toasts).dismiss();
    await TestBed.inject(Router).navigate([], { queryParams: {} });
    localStorage.clear();
  });

  it('Ctrl+clique marca o recorte (sem começar a resenha) e a pasta; a tira conta os dois', async () => {
    tap(cover('w1'));
    tap(folderButton(coop));
    await settle();
    expect(opened).toEqual([]);
    expect(page.selection.ids()).toEqual(['w1']);
    expect(page.selection.folders()).toEqual([coop]);
    expect(host.querySelector('app-selection-tray .fora')!.textContent!.trim()).toBe('1 pasta e 1 recorte');
  });

  it('o Marcar da barra liga o modo: o toque marca', async () => {
    host.querySelector<HTMLButtonElement>('button[aria-label="Marcar recortes"]')!.click();
    await settle();
    tap(cover('w1'), false);
    await settle();
    expect(opened).toEqual([]);
    expect(page.selection.ids()).toEqual(['w1']);
  });

  it('Mover para pasta… leva a pasta inteira e o recorte; o bilhete fala dos recortes', async () => {
    tap(cover('w1'));
    tap(folderButton(coop));
    await settle();
    trayButton('mover').click();
    await settle();
    const sheet = host.querySelector('app-folder-move-sheet')!;
    expect(sheet.querySelector('h2')!.textContent).toBe('Mover 1 pasta e 1 recorte');
    [...sheet.querySelectorAll<HTMLButtonElement>('[role="radio"]')].find((b) => b.textContent!.includes('Indies'))!.click();
    await settle();
    expect(folders.tree().parentOf(coop)).toBe(indie);
    expect(store.getWish('w1')!.folder).toBe(indie);
    expect(TestBed.inject(Toasts).current()!.text).toBe('1 pasta e 1 recorte guardados em Indies.');
  });

  it('Copiar leva o nome e a descrição, também os de dentro da pasta marcada', async () => {
    tap(folderButton(coop));
    tap(cover('w1'));
    await settle();
    trayButton('copiar').click();
    await settle();
    expect(copied[0]).toContain('TÍTULO: Celeste\nDESCRIÇÃO: Plataforma');
    expect(copied[0]).toContain('TÍTULO: Hades');
    expect(TestBed.inject(Toasts).current()!.text).toBe('Copiei os 3 recortes (2 de dentro da pasta).');
  });

  it('a vontade no menu de um marcado vale para todos os marcados', async () => {
    tap(cover('w1'));
    tap(folderButton(coop));
    await settle();
    const el = cover('w1');
    el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 }));
    await settle();
    const must = [...document.querySelectorAll<HTMLButtonElement>('.menu-contexto:popover-open .escolha')].find((b) => b.textContent!.includes('MUST'))!;
    must.click();
    await settle();
    expect(['w1', 'w2', 'w3'].map((id) => relevanceOf(store.getWish(id)!))).toEqual(['must', 'must', 'must']);
  });

  it('Tirar da wishlist com a pasta marcada pergunta; Apagar tudo tira os de dentro, e o Desfazer volta', async () => {
    spyOn(TestBed.inject(Confirm), 'choose').and.resolveTo('confirm');
    tap(folderButton(coop));
    await settle();
    trayButton('tirar').click();
    await settle();
    expect(store.getWish('w2')).toBeUndefined();
    expect(store.getWish('w1')).toBeDefined();
    expect(folders.tree().live(coop)).toBeUndefined();
    expect(TestBed.inject(Toasts).current()!.text).toBe('1 pasta e 2 recortes saíram da wishlist.');
    TestBed.inject(Toasts).current()!.action!.run();
    await settle();
    expect(store.getWish('w2')).toBeDefined();
    expect(folders.tree().live(coop)).toBeDefined();
  });
});
