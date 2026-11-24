import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WidgetDone, WidgetSheet } from './widget-sheet';
import { PIXEL_GALLERY_KEY, PixelGallery } from '../core/pixel-gallery-store';
import { Toasts } from './toast';
import { Confirm } from './confirm';
import { widgetDef } from '../core/widgets';
import { PixelDrafts } from '../core/pixel-drafts';

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
    // sair pergunta (PLANO-RASCUNHOS-PIXEL.md): antes de responder, nada chegou na folha
    expect(TestBed.inject(Confirm).current()?.title).toBe('Salvar as mudanças?');
    expect(host.querySelector('app-pixel-field .linha-nome')?.textContent).toContain('Nada desenhado ainda');
    TestBed.inject(Confirm).answer('confirm');
    // (o Salvar espera o rascunho ficar em dia no banco)
    for (let i = 0; i < 10; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await fixture.whenStable();
      fixture.detectChanges();
    }
    expect(host.querySelector('app-pixel-field .linha-nome')?.textContent).toContain('O desenho');
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

  it('o rascunho do ateliê (PLANO-RASCUNHOS-PIXEL.md): é do widget, com a legenda de nome, e sai no Pôr; a cópia guardada tira o dela', async () => {
    const { fixture, host, done } = await open({ width: '2', height: '1', pixels: '12', caption: 'Dupla' }, true);
    const drafts = TestBed.inject(PixelDrafts);
    await drafts.ready;
    const field = fixture.debugElement.query((d) => d.name === 'app-pixel-field').componentInstance;
    expect(field['target']()).toEqual({ origin: { kind: 'widget' }, title: 'Dupla' });
    const values = { pixels: '21', width: '2', height: '1', palette: 'classica', colors: '' };
    await drafts.put({ id: 'rwidg001', origin: { kind: 'widget' }, title: 'Dupla', values, base: '', createdAt: 1, savedAt: 1 });
    field['saved']({ values, layers: undefined, draft: 'rwidg001' });
    fixture.detectChanges();
    expect(await drafts.get('rwidg001')).not.toBeNull();
    // a cópia guardada na galeria: o rascunho dela sai (o do widget fica)
    localStorage.removeItem('meu-mural:pixel-arts:v1');
    await drafts.put({ id: 'rwidg002', origin: { kind: 'nova' }, title: 'Dupla', values: { ...values, pixels: '22' }, base: '', createdAt: 1, savedAt: 1 });
    (fixture.componentInstance as unknown as { copyToGallery(r: unknown): void }).copyToGallery({ values: { ...values, pixels: '22' }, layers: undefined, draft: 'rwidg002' });
    await new Promise((r) => setTimeout(r, 20));
    expect(await drafts.get('rwidg002')).toBeNull();
    expect(await drafts.get('rwidg001')).not.toBeNull();
    (host.querySelector('.pe .ok') as HTMLButtonElement).click();
    await new Promise((r) => setTimeout(r, 20));
    expect(done.length).toBe(1);
    expect(await drafts.get('rwidg001')).toBeNull();
    const gallery = TestBed.inject(PixelGallery);
    gallery.remove(gallery.pieces().map((p) => p.id));
    localStorage.removeItem('meu-mural:pixel-arts:v1');
  });

  it('o Salvar como cópia do ateliê: o desenho novo vai para a galeria "(cópia)", e o widget fica com o de antes', async () => {
    localStorage.removeItem('meu-mural:pixel-arts:v1');
    const { fixture, host } = await open({ width: '2', height: '1', pixels: '12', caption: 'Dupla' }, true);
    const gallery = TestBed.inject(PixelGallery);
    const before = gallery.count();
    const sheet = fixture.componentInstance as unknown as { copyToGallery(r: { values: Record<string, string>; layers: undefined }): void; values(): Record<string, string> };
    sheet.copyToGallery({ values: { pixels: '21', width: '2', height: '1', palette: 'classica', colors: '' }, layers: undefined });
    fixture.detectChanges();
    expect(gallery.count()).toBe(before + 1);
    expect(gallery.pieces().at(-1)).toEqual(jasmine.objectContaining({ title: 'Dupla (cópia)', art: ['2x1', '21'] }));
    expect(sheet.values()['pixels']).toBe('12');
    expect(host.querySelector('app-pixel-field')).not.toBeNull();
    expect(TestBed.inject(Toasts).current()!.text).toContain('o desenho do widget ficou como era');
    gallery.remove([gallery.pieces().at(-1)!.id]);
    localStorage.removeItem('meu-mural:pixel-arts:v1');
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
