import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { provideRouter } from '@angular/router';
import { NoteFolders } from '../core/note-folders';
import { PIXEL_FOLDER_GROUP, PixelPiece } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { Settings } from '../core/settings';
import { Confirm } from '../ui/confirm';
import { Toasts } from '../ui/toast';
import { PixelArtsPage } from './pixel-arts-page';

/** Marcar pastas junto com as pixel arts (PLANO-MARCAR-PASTAS.md, rodada 4). */

const at = (h: number) => new Date(Date.UTC(2026, 10, 16, h)).toISOString();
const piece = (id: string, title: string, folder?: string): PixelPiece => ({ id, title, art: ['2x2', '12/21'], createdAt: at(1), at: at(1), ...(folder ? { folder } : {}) });

describe('marcar pastas na galeria de pixel arts', () => {
  let host: HTMLElement;
  let gallery: PixelGallery;
  let page: PixelArtsPage;
  let copied: string[];

  async function settle(): Promise<void> {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 0));
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
  const folderButton = (id: string) => host.querySelector<HTMLElement>(`app-folder-card[data-pasta="${id}"] button`)!;
  const tap = (el: HTMLElement, ctrl = true, detail = 1) => {
    el.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, ctrlKey: ctrl, button: 0 }));
    el.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, ctrlKey: ctrl, button: 0, detail }));
  };
  const trayButton = (id: string) => host.querySelector<HTMLButtonElement>(`app-selection-tray [data-acao="${id}"]`)!;

  beforeEach(async () => {
    localStorage.clear();
    copied = [];
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection(), provideRouter([])] });
    spyOn(navigator.clipboard, 'writeText').and.callFake(async (t: string) => void copied.push(t));
    TestBed.inject(Settings).setNotesConfig({
      folders: [
        { id: 'pbich000001', group: PIXEL_FOLDER_GROUP, name: 'Bichos', parent: null },
        { id: 'pjogo000001', group: PIXEL_FOLDER_GROUP, name: 'Jogos', parent: null },
      ],
    });
    gallery = TestBed.inject(PixelGallery);
    gallery.state.set({ pieces: [piece('pa', 'Gato', 'pbich000001'), piece('pb', 'Espada'), piece('pc', 'Peixe', 'pbich000001')], removed: {} });
    const fixture = TestBed.createComponent(PixelArtsPage);
    page = fixture.componentInstance;
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await settle();
  });

  afterEach(() => {
    host?.remove();
    for (const d of document.querySelectorAll('dialog[open]')) (d as HTMLDialogElement).close();
    localStorage.clear();
  });

  it('Ctrl+clique marca a pasta e a obra; a tira diz quantas de cada; abrir a pasta não desmarca', async () => {
    tap(folderButton('pbich000001'));
    tap(host.querySelector<HTMLElement>('[data-ficha="pb"] .hit') ?? host.querySelector<HTMLElement>('[data-ficha="pb"]')!);
    await settle();
    expect(page.selection.folders()).toEqual(['pbich000001']);
    expect(page.selection.ids()).toEqual(['pb']);
    expect(host.querySelector('app-selection-tray .fora')!.textContent!.trim()).toBe('1 pasta e 1 pixel art');
    // dois toques abrem a pasta; as marcas ficam (D4)
    tap(folderButton('pjogo000001'), false);
    tap(folderButton('pjogo000001'), false, 2);
    await settle();
    expect(page.selection.count()).toBe(2);
  });

  it('o Copiar leva as de dentro das pastas marcadas', async () => {
    tap(folderButton('pbich000001'));
    await settle();
    trayButton('copiar').click();
    await settle();
    expect(copied.length).toBe(1);
    expect(copied[0].split('\n\n').length).toBe(2);
    expect(TestBed.inject(Toasts).current()!.text).toBe('Copiei as 2 pixel arts como widgets (de dentro da pasta).');
  });

  it('Mover para pasta… leva a pasta inteira e a obra', async () => {
    tap(folderButton('pbich000001'));
    tap(host.querySelector<HTMLElement>('[data-ficha="pb"]')!);
    await settle();
    trayButton('mover').click();
    await settle();
    const sheet = host.querySelector('app-folder-move-sheet')!;
    expect(sheet.querySelector('h2')!.textContent).toBe('Mover 1 pasta e 1 pixel art');
    const opts = [...sheet.querySelectorAll<HTMLButtonElement>('[role="radio"]')];
    expect(opts.find((b) => b.textContent!.includes('Bichos'))!.disabled).toBeTrue();
    opts.find((b) => b.textContent!.includes('Jogos'))!.click();
    await settle();
    const tree = TestBed.inject(NoteFolders).tree();
    expect(tree.parentOf('pbich000001')).toBe('pjogo000001');
    expect(gallery.get('pb')!.folder).toBe('pjogo000001');
    expect(TestBed.inject(Toasts).current()!.text).toBe('1 pasta e 1 pixel art guardadas em Jogos.');
  });

  it('Apagar com a pasta marcada pergunta; Apagar tudo leva as de dentro, e o Desfazer volta', async () => {
    const choose = spyOn(TestBed.inject(Confirm), 'choose').and.resolveTo('confirm');
    tap(folderButton('pbich000001'));
    await settle();
    trayButton('apagar').click();
    await settle();
    expect(choose.calls.mostRecent().args[0].text).toContain('A pasta marcada sai com tudo o que está dentro (2 pixel arts).');
    expect(gallery.get('pa')).toBeUndefined();
    expect(gallery.get('pc')).toBeUndefined();
    expect(gallery.get('pb')).toBeDefined();
    expect(TestBed.inject(NoteFolders).tree().live('pbich000001')).toBeUndefined();
    TestBed.inject(Toasts).current()!.action!.run();
    await settle();
    expect(gallery.get('pa')).toBeDefined();
    expect(TestBed.inject(NoteFolders).tree().live('pbich000001')).toBeDefined();
  });
});
