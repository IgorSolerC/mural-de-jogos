import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { PixelPiece } from '../core/pixel-gallery';
import { PIXEL_GALLERY_KEY } from '../core/pixel-gallery-store';
import { PixelPicker } from './pixel-picker';

@Component({
  imports: [PixelPicker],
  template: `<app-pixel-picker [(open)]="open" [chosen]="chosen()" (picked)="picked.push($event)" (create)="created = created + 1" />`,
})
class Host {
  readonly open = signal(false);
  readonly chosen = signal('');
  readonly picked: PixelPiece[] = [];
  created = 0;
}

const at = (d: number) => `2026-11-${String(d).padStart(2, '0')}T10:00:00.000Z`;
const PIECES = [
  { id: 'gato', title: 'Gato preto', art: ['2x2', '12/21'], createdAt: at(1), at: at(3), tags: ['bichos'] },
  { id: 'sol', title: 'Sol', art: ['3x3', '010/111/010', 'miçanga'], createdAt: at(2), at: at(5), tags: ['céu'] },
  { id: 'lua', title: 'Lua', art: ['2x2', '10/01'], createdAt: at(4), at: at(4), tags: ['céu'] },
];

describe('a folha da galeria de pixel arts (PixelPicker)', () => {
  afterEach(() => {
    localStorage.removeItem(PIXEL_GALLERY_KEY);
    document.querySelectorAll('dialog').forEach((d) => d.open && d.close());
  });

  async function make(list: unknown[] = PIECES) {
    localStorage.setItem(PIXEL_GALLERY_KEY, JSON.stringify({ pieces: list, removed: {} }));
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.open.set(true);
    await settle(fixture);
    const sheet = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    return { fixture, sheet, host: fixture.componentInstance };
  }

  async function settle(fixture: ComponentFixture<unknown>): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await fixture.whenStable();
      fixture.detectChanges();
    }
  }

  const names = (sheet: HTMLElement) => Array.from(sheet.querySelectorAll('.obra .nome'), (n) => n.textContent);

  it('abre como modal, em grade, com as mexidas por último primeiro e a busca já com o foco', async () => {
    const { sheet } = await make();
    expect(sheet.open).toBeTrue();
    expect(sheet.querySelector('.lista.grade-px')).not.toBeNull();
    expect(names(sheet)).toEqual(['Sol', 'Lua', 'Gato preto']);
    expect(document.activeElement).toBe(sheet.querySelector('input[type="search"]'));
    // o nome é miúdo; o jeito, o tamanho e a data ficam no título
    expect(sheet.querySelector('.obra')?.getAttribute('title')).toContain('Miçanga · 3 × 3');
  });

  it('a busca acha pelo nome e pela tag; Enter escolhe a primeira e fecha', async () => {
    const { fixture, sheet, host } = await make();
    const search = sheet.querySelector<HTMLInputElement>('input[type="search"]')!;
    search.value = 'céu';
    search.dispatchEvent(new Event('input'));
    await settle(fixture);
    expect(names(sheet)).toEqual(['Sol', 'Lua']);
    search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    await settle(fixture);
    expect(host.picked.map((p) => p.id)).toEqual(['sol']);
    expect(host.open()).toBeFalse();
  });

  it('os filtros: o Jeito, um por vez, e as tags; a ordem de A a Z', async () => {
    const { fixture, sheet } = await make();
    const jeito = Array.from(sheet.querySelectorAll<HTMLButtonElement>('.indice .idx'));
    expect(sheet.querySelector('.indice')?.textContent).toContain('Jeito');
    jeito.find((b) => b.textContent?.includes('Miçanga'))!.click();
    await settle(fixture);
    expect(names(sheet)).toEqual(['Sol']);
    expect(sheet.querySelector('.achados')?.textContent).toContain('Mostrando 1 de 3');
    sheet.querySelector<HTMLButtonElement>('.achados .tinta-link')!.click();
    await settle(fixture);
    expect(names(sheet).length).toBe(3);
    const order = sheet.querySelector<HTMLSelectElement>('.ordem select')!;
    order.value = 'az';
    order.dispatchEvent(new Event('change'));
    await settle(fixture);
    expect(names(sheet)).toEqual(['Gato preto', 'Lua', 'Sol']);
  });

  it('a escolhida vem primeiro, com o tique', async () => {
    localStorage.setItem(PIXEL_GALLERY_KEY, JSON.stringify({ pieces: PIECES, removed: {} }));
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.componentInstance.chosen.set('gato');
    fixture.componentInstance.open.set(true);
    await settle(fixture);
    const sheet = (fixture.nativeElement as HTMLElement).querySelector('dialog')!;
    expect(names(sheet)[0]).toBe('Gato preto');
    expect(sheet.querySelector('.obra.on .marca')).not.toBeNull();
  });

  it('o Desenhar uma nova fecha a folha e avisa quem abriu; com a galeria vazia, a folha convida', async () => {
    const { fixture, sheet, host } = await make([]);
    expect(sheet.querySelector('.nada')?.textContent).toContain('ainda está vazia');
    sheet.querySelector<HTMLButtonElement>('.foot .criar')!.click();
    await settle(fixture);
    expect(host.created).toBe(1);
    expect(host.open()).toBeFalse();
  });
});
