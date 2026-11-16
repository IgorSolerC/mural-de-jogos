import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ColorMap, hexToHsv, hsvToHex } from './color-map';

describe('o mapa de cor do ateliê', () => {
  it('as contas: hex ↔ HSV, e o cinza e o preto guardam o matiz', () => {
    expect(hexToHsv('#ff0000')).toEqual({ h: 0, s: 1, v: 1 });
    expect(hsvToHex({ h: 120, s: 1, v: 1 })).toBe('#00ff00');
    expect(hsvToHex(hexToHsv('#1d59a6'))).toBe('#1d59a6');
    expect(hexToHsv('#000000', 210).h).toBe(210);
    expect(hexToHsv('#808080', 40)).toEqual(jasmine.objectContaining({ h: 40, s: 0 }));
  });

  async function make(color: string | null) {
    TestBed.configureTestingModule({ imports: [ColorMap], providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(ColorMap);
    f.componentRef.setInput('color', color);
    f.componentRef.setInput('disabled', color === null);
    const got: string[] = [];
    let done = 0;
    f.componentInstance.picking.subscribe((c) => got.push(c));
    f.componentInstance.picked.subscribe(() => done++);
    document.body.appendChild(f.nativeElement);
    f.detectChanges();
    await f.whenStable();
    return { f, got, done: () => done, el: f.nativeElement as HTMLElement };
  }
  afterEach(() => TestBed.resetTestingModule());

  it('no teclado: as setas mudam a saturação e o brilho (Shift: de dez em dez), e soltar a tecla fecha o passo', async () => {
    const { f, got, done, el } = await make('#808080');
    const sv = el.querySelector('.sv') as HTMLElement;
    sv.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowUp', shiftKey: true, bubbles: true }));
    sv.dispatchEvent(new KeyboardEvent('keyup', { key: 'ArrowUp', bubbles: true }));
    f.detectChanges();
    expect(got.at(-1)).toBe('#9a9a9a');
    expect(done()).toBe(1);
    expect(sv.getAttribute('aria-valuetext')).toBe('saturação 0%, brilho 60%');
    const hue = el.querySelector('.matiz') as HTMLElement;
    hue.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    f.detectChanges();
    expect(hue.getAttribute('aria-valuenow')).toBe('1');
    el.remove();
  });

  it('arrastar no quadrado escolhe a cor debaixo do ponteiro', async () => {
    const { f, got, done, el } = await make('#ff0000');
    const sv = el.querySelector('.sv') as HTMLElement;
    const r = sv.getBoundingClientRect();
    const at = (type: string, fx: number, fy: number) => sv.dispatchEvent(new PointerEvent(type, { bubbles: true, button: 0, pointerId: 3, clientX: r.left + fx * r.width, clientY: r.top + fy * r.height }));
    at('pointerdown', 1, 0);
    at('pointermove', 0, 1);
    at('pointerup', 0, 1);
    f.detectChanges();
    expect(got[0]).toBe('#ff0000');
    expect(got.at(-1)).toBe('#000000');
    expect(done()).toBe(1);
    el.remove();
  });

  it('o transparente: apagado, fora do teclado', async () => {
    const { el } = await make(null);
    expect(el.classList).toContain('apagado');
    expect(el.querySelector('.sv')?.getAttribute('tabindex')).toBe('-1');
    el.remove();
  });
});
