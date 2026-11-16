import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WidgetDone, WidgetSheet } from './widget-sheet';
import { PIXEL_GALLERY_KEY, PixelGallery } from '../core/pixel-gallery-store';
import { Toasts } from './toast';
import { widgetDef } from '../core/widgets';

/** A folha do widget com a pixel art: o desenho numa linha, o ateliê por cima, e o Pôr sai com a marca. */
describe('a folha do widget com a pixel art', () => {
  afterEach(() => {
    document.querySelectorAll('dialog').forEach((d) => d.open && d.close());
    document.querySelectorAll('app-widget-sheet').forEach((e) => e.remove());
    TestBed.resetTestingModule();
  });

  async function open(values: Record<string, string> = {}, swap = false) {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(WidgetSheet);
    fixture.componentRef.setInput('start', { name: 'pixel', values });
    fixture.componentRef.setInput('onCard', false);
    fixture.componentRef.setInput('swap', swap);
    const done: WidgetDone[] = [];
    fixture.componentInstance.done.subscribe((d) => done.push(d));
    const host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    for (let i = 0; i < 4; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r, 30));
    }
    return { fixture, host, done };
  }

  it('o widget novo já abre no ateliê; o que se pinta lá chega na folha e sai no Pôr', async () => {
    const { fixture, host, done } = await open({ width: '2', height: '1' });
    const studio = host.querySelector('dialog.atelie') as HTMLDialogElement;
    expect(studio?.open).toBeTrue();
    // a paleta e a tela não são campos da folha: moram no ateliê
    expect(host.querySelector('.wfolha select[data-campo="palette"]')).toBeNull();
    expect(host.querySelector('input[data-campo="width"]')).toBeNull();
    const board = studio.querySelector('svg.folha') as SVGSVGElement;
    for (const k of [']', ']', ']', 'Enter']) board.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
    fixture.detectChanges();
    (studio.querySelector('.pronto') as HTMLButtonElement).click();
    await fixture.whenStable();
    fixture.detectChanges();
    expect(host.querySelector('app-pixel-field .linha-desc')?.textContent).toContain('2 × 1 · 9 cores · Clássica');
    (host.querySelector('.jeito input[value="figurinha"]') as HTMLInputElement).click();
    fixture.detectChanges();
    (host.querySelector('.pe .ok') as HTMLButtonElement).click();
    expect(done).toEqual([{ name: 'pixel', args: ['2x1', '4', 'figurinha'], size: 'medio' }]);
  });

  it('os sete jeitos em duas fileiras (quatro e três), cada miniatura desenhada pela peça dos jeitos', async () => {
    const { host } = await open(widgetDef('pixel')!.read(['3x3', '010/111/010', 'lego']), true);
    const tiles = host.querySelector<HTMLElement>('.jeitos')!;
    expect(tiles.style.getPropertyValue('--n')).toBe('4');
    expect([...tiles.querySelectorAll<HTMLInputElement>('.jeito input')].map((i) => i.value)).toEqual(['pixel', 'figurinha', 'ponto-cruz', 'micanga', 'voxel', 'blocos', 'lego']);
    expect(tiles.querySelectorAll('.jeito-desenho g[appPixelLookArt]').length).toBe(7);
    expect(tiles.querySelector('.jeito.on input')!.getAttribute('value')).toBe('lego');
    // a fileira de cima tem quatro, a de baixo três: a quinta começa embaixo da primeira
    const box = (i: number) => tiles.querySelectorAll('.jeito')[i].getBoundingClientRect();
    expect(Math.abs(box(4).left - box(0).left)).toBeLessThan(3);
    expect(box(4).left).toBeLessThan(box(1).left);
    expect(box(4).top).toBeGreaterThan(box(3).top);
  });

  it('com obras na galeria, o widget novo abre a folha da galeria; a escolhida vira o desenho, com o nome de legenda', async () => {
    const at = '2026-11-16T10:00:00.000Z';
    localStorage.setItem(PIXEL_GALLERY_KEY, JSON.stringify({ pieces: [{ id: 'sol', title: 'Sol', art: ['3x3', '010/111/010', 'miçanga'], createdAt: at, at }], removed: {} }));
    try {
      const { fixture, host, done } = await open();
      expect(host.querySelector('dialog.atelie')).toBeNull();
      const sheet = host.querySelector<HTMLDialogElement>('app-pixel-picker dialog')!;
      expect(sheet.open).toBeTrue();
      sheet.querySelector<HTMLButtonElement>('.obra')!.click();
      for (let i = 0; i < 3; i++) {
        await fixture.whenStable();
        fixture.detectChanges();
      }
      expect(sheet.open).toBeFalse();
      expect(host.querySelector('app-pixel-field .linha-desc')?.textContent).toContain('3 × 3');
      (host.querySelector('.pe .ok') as HTMLButtonElement).click();
      expect(done).toEqual([{ name: 'pixel', args: ['3x3', '01/111/01', 'micanga', 'Sol'], size: 'medio' }]);
    } finally {
      localStorage.removeItem(PIXEL_GALLERY_KEY);
    }
  });

  it('trocar pela galeria um desenho feito à mão tem o Desfazer', async () => {
    const at = '2026-11-16T10:00:00.000Z';
    localStorage.setItem(PIXEL_GALLERY_KEY, JSON.stringify({ pieces: [{ id: 'sol', title: 'Sol', art: ['3x3', '010/111/010'], createdAt: at, at }], removed: {} }));
    try {
      const { fixture, host } = await open({ width: '2', height: '1', pixels: '44', caption: 'Meu traço' }, true);
      const toasts = TestBed.inject(Toasts);
      const shown = spyOn(toasts, 'show').and.callThrough();
      host.querySelector<HTMLButtonElement>('.escolher-galeria')!.click();
      for (let i = 0; i < 3; i++) {
        await fixture.whenStable();
        fixture.detectChanges();
      }
      host.querySelector<HTMLButtonElement>('app-pixel-picker .obra')!.click();
      await fixture.whenStable();
      fixture.detectChanges();
      expect(host.querySelector('app-pixel-field .linha-desc')?.textContent).toContain('3 × 3');
      // a legenda escrita à mão fica
      expect(host.querySelector<HTMLInputElement>('input[data-campo="caption"]')?.value).toBe('Meu traço');
      const [text, action] = shown.calls.mostRecent().args;
      expect(text).toContain('O desenho de antes saiu');
      action!.run();
      fixture.detectChanges();
      expect(host.querySelector('app-pixel-field .linha-desc')?.textContent).toContain('2 × 1');
    } finally {
      localStorage.removeItem(PIXEL_GALLERY_KEY);
    }
  });

  it('mexendo num que já está no texto, a folha abre na linha do desenho; sem pontos, o Pôr leva ao ateliê', async () => {
    const { fixture, host, done } = await open({ width: '4', height: '4', pixels: '', palette: 'pico8' }, true);
    expect(host.querySelector('dialog.atelie')).toBeNull();
    expect(host.querySelector('app-pixel-field .linha-desc')?.textContent).toContain('4 × 4 · 16 cores · PICO-8');
    (host.querySelector('.pe .ok') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(done.length).toBe(0);
    expect(host.querySelector('.pe .falta')?.textContent).toContain('Falta desenhar');
    expect(document.activeElement).toBe(host.querySelector('app-pixel-field [data-campo="pixels"]'));
  });

  it('Guardar na galeria de pixel arts: uma cópia do desenho, com a legenda de nome; o widget fica como está', async () => {
    localStorage.removeItem('meu-mural:pixel-arts:v1');
    const { fixture, host, done } = await open({ width: '2', height: '1', pixels: '12', caption: 'Dupla' }, true);
    const gallery = TestBed.inject(PixelGallery);
    const before = gallery.count();
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Guardar na galeria'))!.click();
    fixture.detectChanges();
    expect(gallery.count()).toBe(before + 1);
    expect(gallery.pieces().at(-1)).toEqual(jasmine.objectContaining({ title: 'Dupla', art: ['2x1', '12'] }));
    expect(TestBed.inject(Toasts).current()!.text).toContain('Guardei uma cópia');
    // de novo: o mesmo desenho já está lá
    [...host.querySelectorAll<HTMLButtonElement>('button')].find((b) => b.textContent!.includes('Guardar na galeria'))!.click();
    expect(gallery.count()).toBe(before + 1);
    expect(TestBed.inject(Toasts).current()!.text).toBe('Este desenho já está na galeria de pixel arts.');
    expect(done).toEqual([]);
    gallery.remove([gallery.pieces().at(-1)!.id]);
    localStorage.removeItem('meu-mural:pixel-arts:v1');
  });
});
