import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { WidgetDone, WidgetSheet } from './widget-sheet';

/** A folha do widget com a pixel art: a prancheta escreve nos valores da folha, e o Pôr sai com a marca. */
describe('a folha do widget com a pixel art', () => {
  afterEach(() => {
    document.querySelectorAll('app-widget-sheet').forEach((e) => e.remove());
    TestBed.resetTestingModule();
  });

  async function open(values: Record<string, string> = {}) {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(WidgetSheet);
    fixture.componentRef.setInput('start', { name: 'pixel', values });
    fixture.componentRef.setInput('onCard', false);
    const done: WidgetDone[] = [];
    fixture.componentInstance.done.subscribe((d) => done.push(d));
    const host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    await fixture.whenStable();
    fixture.detectChanges();
    await fixture.whenStable();
    return { fixture, host, done };
  }

  it('sem desenho, o Pôr diz o que falta e leva o foco para a prancheta', async () => {
    const { fixture, host, done } = await open();
    expect((host.querySelector('input[data-campo="width"]') as HTMLInputElement).value).toBe('16');
    (host.querySelector('.pe .ok') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(done.length).toBe(0);
    expect(host.querySelector('.pe .falta')?.textContent).toContain('Falta desenhar');
    expect(document.activeElement).toBe(host.querySelector('svg.prancheta'));
  });

  it('o que se pinta na prancheta sai no Pôr, com a paleta e o jeito escolhidos', async () => {
    const { fixture, host, done } = await open({ width: '2', height: '1' });
    const svg = host.querySelector('svg.prancheta') as SVGSVGElement;
    svg.focus();
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: '4', bubbles: true }));
    svg.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    fixture.detectChanges();
    const select = host.querySelector('select[data-campo="palette"]') as HTMLSelectElement;
    select.value = 'mar';
    select.dispatchEvent(new Event('change'));
    (host.querySelector('.jeito input[value="figurinha"]') as HTMLInputElement).click();
    fixture.detectChanges();
    (host.querySelector('.pe .ok') as HTMLButtonElement).click();
    expect(done).toEqual([{ name: 'pixel', args: ['2x1', '4', 'mar', 'figurinha'], size: 'medio' }]);
  });
});
