import { ComponentFixture, TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { Router, provideRouter } from '@angular/router';
import { PixelFolders } from '../core/pixel-folders';
import { PixelPiece } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { PIXEL_PREFS_KEY } from '../core/pixel-gallery-view';
import { Toasts } from '../ui/toast';
import { PixelArtsPage } from './pixel-arts-page';

/** Marcar várias pixel arts (PLANO-PIXEL-ARTS.md, rodada 5): a seleção das Anotações, a tira e as ações em massa. */

const at = (h: number) => new Date(Date.UTC(2026, 10, 16, h)).toISOString();
const piece = (id: string, title: string, extra: Partial<PixelPiece> = {}): PixelPiece => ({ id, title, art: ['2x2', '12/21'], createdAt: at(1), at: at(1), ...extra });

describe('marcar várias pixel arts', () => {
  let host: HTMLElement;
  let gallery: PixelGallery;
  let fixture: ComponentFixture<PixelArtsPage>;

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
  const marked = () => [...host.querySelectorAll<HTMLElement>('[data-marcada]')].map((x) => x.getAttribute('data-ficha'));
  const tray = (id: string) => document.querySelector<HTMLButtonElement>(`app-selection-tray [data-acao="${id}"]`)!;
  async function tap(id: string): Promise<void> {
    host.querySelector<HTMLButtonElement>(`[data-ficha="${id}"] .hit`)!.click();
    await settle();
  }

  beforeEach(() => {
    localStorage.clear();
    localStorage.setItem(PIXEL_PREFS_KEY, JSON.stringify({ vista: 'grade' }));
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    gallery = TestBed.inject(PixelGallery);
    gallery.state.set({
      pieces: [piece('pa', 'Gato', { createdAt: at(5), tags: ['bichos', 'preto'] }), piece('pb', 'Cachorro', { createdAt: at(4), tags: ['bichos'] }), piece('pc', 'Espada', { createdAt: at(3) })],
      removed: {},
    });
  });

  afterEach(async () => {
    host?.remove();
    TestBed.inject(Toasts).dismiss();
    for (const d of document.querySelectorAll('dialog[open]')) (d as HTMLDialogElement).close();
    await TestBed.inject(Router).navigate([], { queryParams: {} });
    localStorage.clear();
  });

  it('o Marcar da barra: o toque marca em vez de abrir, com a ordem; a tira conta; Pronto sai', async () => {
    await mount();
    host.querySelector<HTMLButtonElement>('[aria-label="Marcar pixel arts"]')!.click();
    await settle();
    await tap('pb');
    await tap('pa');
    expect(marked().sort()).toEqual(['pa', 'pb']);
    expect(host.querySelector<HTMLElement>('[data-ficha="pa"]')!.style.getPropertyValue('--marca-n')).toBe('2');
    expect(host.querySelector<HTMLDialogElement>('dialog.obra')!.open).toBeFalse();
    expect(document.querySelector('app-selection-tray .conta')!.textContent).toContain('2 marcadas');
    tray('pronto').click();
    await settle();
    expect(marked()).toEqual([]);
    expect(document.querySelector('app-selection-tray')).toBeNull();
  });

  it('Marcar todas, e Apagar as marcadas com o Desfazer', async () => {
    await mount();
    fixture.componentInstance['toggleMarking']();
    await settle();
    tray('todas').click();
    await settle();
    expect(marked().sort()).toEqual(['pa', 'pb', 'pc']);
    tray('apagar').click();
    await settle();
    expect(gallery.count()).toBe(0);
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('3 pixel arts saíram da galeria');
    toast.action!.run();
    await settle();
    expect(gallery.count()).toBe(3);
  });

  it('Tags…: a de todas vai para todas, a de só algumas sai de todas, numa mudança com o Desfazer', async () => {
    await mount();
    fixture.componentInstance['toggleMarking']();
    await settle();
    await tap('pa');
    await tap('pb');
    tray('tags').click();
    await settle();
    expect(document.querySelector('app-pixel-bulk-tags .algumas')!.textContent).toContain('em 1 de 2');
    fixture.componentInstance['applyTags']({ all: ['bichos', 'favoritos'], drop: ['preto'] });
    await settle();
    expect(gallery.get('pa')!.tags).toEqual(['bichos', 'favoritos']);
    expect(gallery.get('pb')!.tags).toEqual(['bichos', 'favoritos']);
    expect(gallery.get('pc')!.tags).toBeUndefined();
    TestBed.inject(Toasts).current()!.action!.run();
    await settle();
    expect(gallery.get('pa')!.tags).toEqual(['bichos', 'preto']);
    expect(gallery.get('pb')!.tags).toEqual(['bichos']);
  });

  it('Mover para pasta… leva as marcadas juntas', async () => {
    const box = TestBed.inject(PixelFolders).create(null, 'Bichos')!.id;
    await mount();
    fixture.componentInstance['toggleMarking']();
    await settle();
    await tap('pa');
    await tap('pb');
    tray('mover').click();
    await settle();
    expect(fixture.componentInstance['moveSheet']()!.title).toBe('Mover 2 pixel arts');
    fixture.componentInstance['moveTo'](box);
    await settle();
    const folders = TestBed.inject(PixelFolders);
    expect([folders.of(gallery.get('pa')!), folders.of(gallery.get('pb')!), folders.of(gallery.get('pc')!)]).toEqual([box, box, null]);
  });

  it('o botão direito numa das marcadas age em todas elas', async () => {
    await mount();
    fixture.componentInstance['toggleMarking']();
    await settle();
    await tap('pa');
    await tap('pb');
    const page = fixture.componentInstance;
    page['menuOn'].set('pa');
    const labels = page['menuSections']().flat().map((i: { label: string }) => i.label);
    expect(labels).toEqual(['Mover as 2 para pasta…', 'Tags das 2…', 'Baixar as 2', 'Copiar as 2 como widgets', 'Apagar as 2']);
    page['menuSections']().flat().find((i: { label: string }) => i.label === 'Apagar as 2')!.run();
    await settle();
    expect(gallery.pieces().map((p) => p.id)).toEqual(['pc']);
  });

  it('copiar as marcadas leva as linhas dos widgets, para colar numa anotação', async () => {
    const written: string[] = [];
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (t: string) => {
      written.push(t);
    });
    await mount();
    fixture.componentInstance['toggleMarking']();
    await settle();
    await tap('pc');
    await tap('pa');
    tray('copiar').click();
    await settle();
    expect(written).toEqual(['{{pixel: 2x2 | 12/21 | Espada}}\n\n{{pixel: 2x2 | 12/21 | Gato}}']);
  });
});
