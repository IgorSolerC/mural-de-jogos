import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { Desk, DeskHandlers } from '../core/desk';
import { Mural } from '../core/mural';
import { Wish } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { WISHLIST_PREFS_KEY } from '../core/wishlist-view';
import { WishFolders } from '../core/wish-folders';
import { Toasts } from '../ui/toast';
import { Confirm } from '../ui/confirm';
import { WishlistPage } from './wishlist-page';

/** As pastas na Wishlist (PLANO-WISHLIST.md, rodada 5): na parede, o caminho, a busca dentro e os menus. */

const at = (d: number) => new Date(Date.UTC(2026, 10, d)).toISOString();
const wish = (id: string, name: string, extra: Partial<Wish> = {}): Wish => ({ id, kind: 'jogos', game: { name, coverUrl: `https://x.test/${id}.jpg`, source: 'manual' }, createdAt: at(1), updatedAt: at(1), ...extra });

describe('as pastas na Wishlist', () => {
  let host: HTMLElement;
  let store: ReviewStore;
  let folders: WishFolders;
  let fixture: ComponentFixture<WishlistPage>;
  let coop: string;
  let indie: string;
  let rogue: string;

  async function settle(): Promise<void> {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
  async function mount(): Promise<void> {
    fixture = TestBed.createComponent(WishlistPage);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  }
  const shown = () => [...host.querySelectorAll<HTMLElement>('[data-ficha]')].map((x) => x.getAttribute('data-ficha'));
  const cards = () => [...host.querySelectorAll<HTMLElement>('app-folder-card')].map((x) => x.querySelector('.nome')!.textContent!.trim());
  const panel = () => [...host.querySelectorAll<HTMLElement>('.menu-contexto')].find((m) => m.querySelector('.escolha'))!;
  const nameOf = (b: Element) => (b.querySelector('.nome') ?? b.querySelector('.sr-only'))!.textContent!.trim();
  const labels = () => [...panel().querySelectorAll('.escolha')].map(nameOf);
  const option = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => nameOf(b) === label)!;
  /** O botão direito; na suíte inteira a parede às vezes ainda assenta: tenta de novo até o menu abrir (no máximo três vezes). */
  async function rightClick(target: Element | (() => Element)): Promise<void> {
    for (let i = 0; i < 3; i++) {
      const el = typeof target === 'function' ? target() : target;
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, pointerType: 'mouse', clientX: 30, clientY: 30 }));
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 }));
      await settle();
      if (panel()) return;
    }
  }
  async function open(id: string): Promise<void> {
    host.querySelector<HTMLButtonElement>(`app-folder-card[data-pasta="${id}"] button`)!.click();
    await settle();
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(WISHLIST_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    TestBed.inject(Mural).kind.set('jogos');
    store = TestBed.inject(ReviewStore);
    folders = TestBed.inject(WishFolders);
    const noop = () => undefined;
    const handlers: DeskHandlers = {
      newReview: noop, openReview: noop, newNote: noop, newNoteIn: noop, newWish: noop, newDraft: noop, openLoose: noop, closeReader: noop,
      editReview: noop, removeReview: noop, openDraft: noop, openWish: noop, editWish: noop, removeDraft: noop, removeWish: (id) => void store.removeWish(id),
    };
    TestBed.inject(Desk).register(handlers);
    store.saveWish(wish('w1', 'Celeste', { createdAt: at(5) }));
    store.saveWish(wish('w2', 'Hades', { createdAt: at(4), tags: ['co-op'] }));
    store.saveWish(wish('w3', 'Dead Cells', { createdAt: at(3), tags: ['co-op'] }));
    store.saveWish(wish('w4', 'Tunic', { createdAt: at(2) }));
    coop = folders.create('jogos', null, 'Co-op')!.id;
    indie = folders.create('jogos', null, 'Indies')!.id;
    rogue = folders.create('jogos', indie, 'Roguelikes')!.id;
    folders.place(['w2'], coop);
    folders.place(['w4'], indie);
    folders.place(['w3'], rogue);
  });

  afterEach(async () => {
    host?.remove();
    TestBed.inject(Toasts).dismiss();
    await TestBed.inject(Router).navigate([], { queryParams: {} });
    localStorage.clear();
  });

  it('na raiz: as pastas antes, e só os recortes soltos; a pasta conta os de dentro e espia as capas', async () => {
    await mount();
    expect(cards()).toEqual(['Co-op', 'Indies']);
    expect(shown()).toEqual(['w1']);
    const indies = host.querySelector(`app-folder-card[data-pasta="${indie}"]`)!;
    expect(indies.querySelector('.qtd')!.textContent).toContain('2 recortes · 1 pasta');
  });

  it('entrar: o caminho na pasta da barra, a pasta no endereço, as de dentro; o caminho volta', async () => {
    await mount();
    await open(indie);
    expect(TestBed.inject(Router).url).toContain(`pasta=${indie}`);
    expect(host.querySelector('app-folder-path .aqui')!.textContent).toContain('Indies');
    expect(document.activeElement).toBe(host.querySelector('app-folder-path .aqui'));
    expect(cards()).toEqual(['Roguelikes']);
    expect(shown()).toEqual(['w4']);
    // o "Adicionar" de qualquer lugar nasce aqui
    expect(folders.open()).toEqual({ kind: 'jogos', id: indie });
    host.querySelector<HTMLButtonElement>('app-folder-path [data-caminho=""]')!.click();
    await settle();
    expect(shown()).toEqual(['w1']);
    // subindo, o foco vai para a pasta de onde se veio
    expect(document.activeElement).toBe(host.querySelector(`app-folder-card[data-pasta="${indie}"] button`));
  });

  it('o Sortear tira da Wishlist inteira (a pasta aberta e as de dentro) e abre a pasta do sorteado', async () => {
    await mount();
    const draw = [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.trim() === 'Sortear')!;
    expect(draw.disabled).toBeFalse();
    const tunic = store.wishes().findIndex((w) => w.id === 'w4');
    spyOn(Math, 'random').and.returnValue((tunic + 0.5) / store.wishes().length);
    draw.click();
    await settle();
    expect(TestBed.inject(Router).url).toContain(`pasta=${indie}`);
    expect(host.querySelector('.sorteio')!.textContent).toContain('Tunic');
  });

  it('dentro de uma pasta, a busca e os filtros pegam ela e as de dentro, sem as pastas na parede', async () => {
    await mount();
    await open(indie);
    const field = host.querySelector<HTMLInputElement>('#busca-desejos')!;
    field.value = 'e';
    field.dispatchEvent(new Event('input'));
    await settle();
    expect(shown().sort()).toEqual(['w3']);
    expect(cards()).toEqual([]);
    expect(host.querySelector('.achados')!.textContent).toContain('em Indies e nas pastas de dentro');
  });

  it('a pasta vazia diz como guardar nela; o menu do recorte move e tira da pasta, com o Desfazer', async () => {
    const empty = folders.create('jogos', null, 'Vazia')!.id;
    await mount();
    await open(empty);
    expect(host.querySelector('.pasta-vazia h2')!.textContent).toContain('Vazia está vazia');
    host.querySelector<HTMLButtonElement>('app-folder-path [data-caminho=""]')!.click();
    await settle();
    await open(coop);
    await rightClick(() => host.querySelector('app-wish-cover[data-ficha="w2"]')!);
    expect(labels()).toContain('Mover para pasta…');
    option('Tirar da pasta').click();
    await settle();
    expect(folders.of(store.getWish('w2')!)).toBeNull();
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('“Hades” saiu das pastas.');
    toast.action!.run();
    await settle();
    expect(folders.of(store.getWish('w2')!)).toBe(coop);
  });

  it('o nada vai até o fim da página, abaixo da busca; a pasta da busca fica com o do navegador', async () => {
    await mount();
    const ctx = (target: Element, x: number, y: number) => {
      const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: x, clientY: y });
      target.dispatchEvent(e);
      return e.defaultPrevented;
    };
    const bar = host.querySelector<HTMLElement>('.pasta.solta')!;
    const b = bar.getBoundingClientRect();
    expect(ctx(bar, b.left + 4, b.bottom - 2)).toBeFalse();
    // embaixo da última, no corpo da página (fora da parede)
    const h = host.getBoundingClientRect();
    expect(ctx(document.body, h.left + 4, h.bottom + 4)).toBeTrue();
    await settle();
    expect(labels()).toEqual(['Adicionar um jogo aqui', 'Nova pasta aqui']);
    panel().dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true }));
  });

  it('o menu da pasta: Nova pasta dentro já com o nome para escrever, e Desfazer a pasta sobe o que tinha', async () => {
    await mount();
    await rightClick(() => host.querySelector(`app-folder-card[data-pasta="${coop}"]`)!);
    expect(labels()).toEqual(['Abrir', 'Marcar', 'Adicionar um jogo aqui', 'Nova pasta dentro', 'Renomear', 'Customizar…', 'Mover para…', 'Desfazer a pasta']);
    option('Renomear').click();
    await settle();
    const name = host.querySelector<HTMLInputElement>(`app-folder-card[data-pasta="${coop}"] input`)!;
    expect(name).not.toBeNull();
    name.value = 'Com a Bia';
    name.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter' }));
    await settle();
    expect(folders.tree().live(coop)!.name).toBe('Com a Bia');
    await rightClick(() => host.querySelector(`app-folder-card[data-pasta="${coop}"]`)!);
    option('Desfazer a pasta').click();
    // a pergunta (tem um recorte dentro)
    await settle();
    const q = TestBed.inject(Confirm).current()!;
    expect(q.text).toBe('O 1 recorte de dentro vai para a Wishlist. Nenhum recorte sai da wishlist.');
    q.resolve('confirm');
    await settle();
    await settle();
    expect(folders.tree().live(coop)).toBeUndefined();
    expect(shown().sort()).toEqual(['w1', 'w2']);
  });
});
