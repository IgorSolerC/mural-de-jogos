import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { PixelFolders } from '../core/pixel-folders';
import { PixelPiece } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { PIXEL_PREFS_KEY } from '../core/pixel-gallery-view';
import { Confirm } from '../ui/confirm';
import { Toasts } from '../ui/toast';
import { PixelArtsPage } from './pixel-arts-page';

/** As pastas da galeria de pixel arts (PLANO-PIXEL-ARTS.md, rodada 4): as das Anotações, como na Wishlist. */

const at = (h: number) => new Date(Date.UTC(2026, 10, 16, h)).toISOString();
const piece = (id: string, title: string, extra: Partial<PixelPiece> = {}): PixelPiece => ({ id, title, art: ['2x2', '12/21'], createdAt: at(1), at: at(1), ...extra });

describe('as pastas da galeria de pixel arts', () => {
  let host: HTMLElement;
  let gallery: PixelGallery;
  let folders: PixelFolders;
  let fixture: ComponentFixture<PixelArtsPage>;
  let bichos: string;
  let jogos: string;
  let rpg: string;

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
  async function mount(): Promise<void> {
    fixture = TestBed.createComponent(PixelArtsPage);
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
  async function rightClick(target: () => Element): Promise<void> {
    for (let i = 0; i < 6; i++) {
      const el = target();
      // (no ponto do próprio alvo: o nada só vale abaixo da busca)
      const r = el.getBoundingClientRect();
      const at = { clientX: r.left + 4, clientY: r.top + 4 };
      el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, pointerType: 'mouse', ...at }));
      el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, ...at }));
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
    localStorage.setItem(PIXEL_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    gallery = TestBed.inject(PixelGallery);
    folders = TestBed.inject(PixelFolders);
    gallery.state.set({
      pieces: [piece('pa', 'Gato', { createdAt: at(5) }), piece('pb', 'Cachorro', { createdAt: at(4) }), piece('pc', 'Espada', { createdAt: at(3) }), piece('pd', 'Escudo', { createdAt: at(2) })],
      removed: {},
    });
    bichos = folders.create(null, 'Bichos')!.id;
    jogos = folders.create(null, 'Jogos')!.id;
    rpg = folders.create(jogos, 'RPG')!.id;
    folders.place(['pb'], bichos);
    folders.place(['pc'], jogos);
    folders.place(['pd'], rpg);
  });

  afterEach(async () => {
    host?.remove();
    TestBed.inject(Toasts).dismiss();
    for (const d of document.querySelectorAll('dialog[open]')) (d as HTMLDialogElement).close();
    await TestBed.inject(Router).navigate([], { queryParams: {} });
    localStorage.clear();
  });

  it('na raiz: as pastas antes, e só as obras soltas; a pasta conta as de dentro e espia os desenhos', async () => {
    await mount();
    expect(cards()).toEqual(['Bichos', 'Jogos']);
    expect(shown()).toEqual(['pa']);
    const box = host.querySelector(`app-folder-card[data-pasta="${jogos}"]`)!;
    expect(box.querySelector('.qtd')!.textContent).toContain('2 pixel arts · 1 pasta');
  });

  it('a pasta espia as artes de verdade: sem o papel branco, a margem, o xadrez nem a sombra de retângulo', async () => {
    await mount();
    const box = host.querySelector(`app-folder-card[data-pasta="${jogos}"]`)!;
    // as miniaturas só montam perto da tela (ui/near-screen.ts): na suíte inteira a página pode estar rolada
    box.scrollIntoView({ block: 'center' });
    for (let i = 0; i < 40 && !box.querySelector('.espia-pixel'); i++) {
      window.dispatchEvent(new Event('scroll'));
      await new Promise((r) => setTimeout(r, 50));
      await settle();
    }
    const peek = box.querySelector<HTMLElement>('.espia-pixel')!;
    expect(peek).withContext('a pasta espia a obra').not.toBeNull();
    expect(peek.querySelector('app-pixel-thumb svg')).not.toBeNull();
    const look = getComputedStyle(peek);
    expect(look.backgroundImage).toBe('none');
    expect(look.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(look.paddingLeft).toBe('0px');
    expect(look.boxShadow).toBe('none');
    // a sombra segue o contorno do desenho (o transparente não vira retângulo)
    expect(look.filter).toContain('drop-shadow');
    const svg = peek.querySelector('svg')!.getBoundingClientRect();
    expect(Math.abs(svg.width - peek.getBoundingClientRect().width)).toBeLessThan(1);
  });

  it('entrar: o caminho na barra, a pasta no endereço, as de dentro; o caminho volta', async () => {
    await mount();
    await open(jogos);
    expect(TestBed.inject(Router).url).toContain(`pasta=${jogos}`);
    expect(host.querySelector('app-folder-path .aqui')!.textContent).toContain('Jogos');
    expect(cards()).toEqual(['RPG']);
    expect(shown()).toEqual(['pc']);
    host.querySelector<HTMLButtonElement>('app-folder-path [data-caminho=""]')!.click();
    await settle();
    expect(shown()).toEqual(['pa']);
    expect(document.activeElement).toBe(host.querySelector(`app-folder-card[data-pasta="${jogos}"] button`));
  });

  it('dentro de uma pasta, a busca pega ela e as de dentro', async () => {
    await mount();
    await open(jogos);
    fixture.componentInstance['setQuery']('es');
    await settle();
    expect(shown().sort()).toEqual(['pc', 'pd']);
    expect(host.querySelector('.achados')!.textContent).toContain('em Jogos e nas pastas de dentro');
  });

  it('a obra nova nasce na pasta aberta', async () => {
    await mount();
    await open(bichos);
    fixture.componentInstance['add']();
    await settle();
    host.querySelector<HTMLDialogElement>('app-pixel-studio dialog')?.close();
    await settle();
    // desenha (como o ateliê manda) e guarda
    const sheet = fixture.componentInstance['sheet']();
    sheet['drawn']({ pixels: '1', width: '1', height: '1', palette: 'classica', colors: '' });
    host.querySelector<HTMLButtonElement>('dialog.obra button[type="submit"]')!.click();
    await settle();
    const made = gallery.pieces().find((p) => !['pa', 'pb', 'pc', 'pd'].includes(p.id))!;
    expect(folders.of(made)).toBe(bichos);
  });

  it('a pasta vazia diz como guardar nela; o menu da obra move e tira da pasta, com o Desfazer', async () => {
    const empty = folders.create(null, 'Vazia')!.id;
    await mount();
    await open(empty);
    expect(host.querySelector('.pasta-vazia h2')!.textContent).toContain('Vazia está vazia');
    host.querySelector<HTMLButtonElement>('app-folder-path [data-caminho=""]')!.click();
    await settle();
    await open(bichos);
    await rightClick(() => host.querySelector('app-pixel-tile[data-ficha="pb"] .hit')!);
    expect(labels()).toContain('Mover para pasta…');
    option('Tirar da pasta').click();
    await settle();
    expect(folders.of(gallery.get('pb')!)).toBeNull();
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('“Cachorro” saiu das pastas.');
    toast.action!.run();
    await settle();
    expect(folders.of(gallery.get('pb')!)).toBe(bichos);
  });

  it('Mover para pasta… pela folha da árvore', async () => {
    await mount();
    await rightClick(() => host.querySelector('app-pixel-tile[data-ficha="pa"] .hit')!);
    option('Mover para pasta…').click();
    await settle();
    const fixtureMove = fixture.componentInstance;
    expect(fixtureMove['moveSheet']()!.title).toBe('Mover Gato');
    fixtureMove['moveTo'](rpg);
    await settle();
    expect(folders.of(gallery.get('pa')!)).toBe(rpg);
  });

  it('sem obra nenhuma, as pastas continuam à mão', async () => {
    gallery.state.set({ pieces: [], removed: {} });
    await mount();
    expect(cards()).toEqual(['Bichos', 'Jogos']);
    expect(host.querySelector('.vazio')).toBeNull();
  });

  it('mudar a pasta pela ficha: o aviso diz para onde foi', async () => {
    await mount();
    host.querySelector<HTMLButtonElement>('app-pixel-tile[data-ficha="pa"] .hit')!.click();
    await settle();
    const sheet = fixture.componentInstance['sheet']();
    sheet['folder'].set(jogos);
    host.querySelector<HTMLButtonElement>('dialog.obra button[type="submit"]')!.click();
    await settle();
    expect(folders.of(gallery.get('pa')!)).toBe(jogos);
    expect(TestBed.inject(Toasts).current()!.text).toBe('“Gato” foi para Jogos');
    expect(shown()).toEqual([]);
  });

  it('o menu da pasta e o do vão; Desfazer a pasta sobe o que tinha', async () => {
    await mount();
    await rightClick(() => host.querySelector('.grade')!);
    expect(labels()).toEqual(['Nova pixel art aqui', 'Nova pasta aqui']);
    TestBed.inject(Toasts).dismiss();
    document.querySelectorAll<HTMLElement>('.menu-contexto').forEach((m) => m.hidePopover?.());
    await settle();
    await rightClick(() => host.querySelector(`app-folder-card[data-pasta="${bichos}"]`)!);
    expect(labels()).toEqual(['Abrir', 'Marcar', 'Nova pixel art aqui', 'Nova pasta dentro', 'Renomear', 'Mover para…', 'Desfazer a pasta']);
    option('Desfazer a pasta').click();
    await settle();
    const q = TestBed.inject(Confirm).current()!;
    expect(q.text).toBe('A 1 pixel art de dentro vai para a galeria. Nenhuma pixel art é apagada.');
    q.resolve('confirm');
    await settle();
    await settle();
    expect(folders.tree().live(bichos)).toBeUndefined();
    expect(shown().sort()).toEqual(['pa', 'pb']);
  });
});
