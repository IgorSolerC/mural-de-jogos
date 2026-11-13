import { Type, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { Desk, DeskHandlers } from '../core/desk';
import { Mural } from '../core/mural';
import { Draft, Wish } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { QueuePage } from './queue-page';
import { WishlistPage } from './wishlist-page';

/** O menu do botão direito nas folhas do Pra depois e nos recortes da Wishlist. */

const T0 = '2026-10-20T10:00:00.000Z';
const draft = (id: string, name: string): Draft => ({ id, kind: 'jogos', game: { name, coverUrl: null, source: 'manual' }, createdAt: T0, updatedAt: T0 });
const wish = (id: string, name: string, relevance?: Wish['relevance']): Wish => ({ ...draft(id, name), ...(relevance ? { relevance } : {}) });

describe('menu do botão direito no Pra depois e na Wishlist', () => {
  let host: HTMLElement;
  let store: ReviewStore;
  let calls: string[];

  const panel = () => host.querySelector<HTMLElement>('.menu-contexto')!;
  const labels = () => [...panel().querySelectorAll('.escolha .nome')].map((x) => x.textContent!.trim());
  const option = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => b.querySelector('.nome')!.textContent!.trim() === label)!;
  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  }
  async function rightClick(target: Element): Promise<MouseEvent> {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, pointerType: 'mouse', clientX: 30, clientY: 30 }));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 });
    target.dispatchEvent(e);
    await settle();
    return e;
  }
  /** Espera a folha (ou o recorte) sair e o foco ir para a vizinha. */
  async function frames(n = 8): Promise<void> {
    for (let i = 0; i < n; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }

  async function mount<T>(page: Type<T>): Promise<ComponentFixture<T>> {
    const fixture = TestBed.createComponent(page);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
    return fixture;
  }

  beforeEach(() => {
    localStorage.clear();
    calls = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    TestBed.inject(Mural).kind.set('jogos');
    store = TestBed.inject(ReviewStore);
    const noop = () => undefined;
    const handlers: DeskHandlers = {
      newReview: noop,
      openReview: noop,
      newNote: noop,
      newNoteIn: noop,
      newWish: noop,
      newDraft: noop,
      openLoose: noop,
      closeReader: noop,
      editReview: noop,
      removeReview: noop,
      openDraft: (id) => void calls.push(`openDraft:${id}`),
      openWish: (id) => void calls.push(`openWish:${id}`),
      removeDraft: (id) => {
        calls.push(`removeDraft:${id}`);
        store.removeDraft(id);
      },
      removeWish: (id) => {
        calls.push(`removeWish:${id}`);
        store.removeWish(id);
      },
    };
    TestBed.inject(Desk).register(handlers);
  });

  afterEach(() => {
    host?.remove();
    localStorage.clear();
  });

  it('Pra depois: terminar a resenha e, sozinho no fim, tirar da fila; o foco vai para a folha vizinha', async () => {
    store.saveDraft(draft('d1', 'Celeste'));
    store.saveDraft(draft('d2', 'Hades'));
    await mount(QueuePage);
    const sheet = (id: string) => host.querySelector<HTMLElement>(`app-draft-card[data-ficha="${id}"]`)!;
    const e = await rightClick(sheet('d1'));
    expect(e.defaultPrevented).toBeTrue();
    expect(panel().querySelector('.legenda')!.textContent).toContain('Celeste');
    expect(labels()).toEqual(['Terminar a resenha', 'Tirar da fila']);
    option('Terminar a resenha').click();
    expect(calls).toEqual(['openDraft:d1']);
    await rightClick(sheet('d1'));
    option('Tirar da fila').click();
    await settle();
    await frames();
    expect(calls).toContain('removeDraft:d1');
    expect(sheet('d1')).toBeNull();
    expect(document.activeElement).toBe(sheet('d2').querySelector('.hit'));
  });

  it('Wishlist: começar a resenha, as outras vontades (Comum tira o adesivo) e tirar da wishlist', async () => {
    store.saveWish(wish('w1', 'Celeste'));
    store.saveWish(wish('w2', 'Hades', 'must'));
    await mount(WishlistPage);
    const clip = (id: string) => host.querySelector<HTMLElement>(`.desejo[data-ficha="${id}"]`)!;
    await rightClick(clip('w1'));
    expect(labels()).toEqual(['Começar a resenha', 'Marcar MUST PLAY', 'Marcar LATER', 'Tirar da wishlist']);
    option('Começar a resenha').click();
    expect(calls).toEqual(['openWish:w1']);
    await rightClick(clip('w2'));
    expect(labels()).toEqual(['Começar a resenha', 'Tirar o adesivo', 'Marcar LATER', 'Tirar da wishlist']);
    option('Marcar LATER').click();
    await settle();
    await frames();
    expect(store.getWish('w2')!.relevance).toBe('later');
    await rightClick(clip('w2'));
    option('Tirar da wishlist').click();
    await settle();
    await frames();
    expect(store.getWish('w2')).toBeUndefined();
    expect(document.activeElement).toBe(clip('w1').querySelector('.hit'));
  });
});
