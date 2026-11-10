import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ContextMenu, MenuItem } from './context-menu';
import { ICON } from './icons';

describe('o menu do botão direito: a paleta de cores', () => {
  it('a leva de cores vira amostras (a cor de verdade, o nome no leitor de tela, o tique na de agora); as outras continuam em lista', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(ContextMenu);
    const host = fixture.nativeElement as HTMLElement;
    document.body.appendChild(host);
    const chosen: string[] = [];
    const color = (id: string, label: string, swatch: string, on = false): MenuItem => ({ id, label, icon: ICON.paleta, swatch, on, run: () => chosen.push(id) });
    fixture.componentRef.setInput('caption', 'Cor');
    fixture.componentRef.setInput('sections', [
      [color('azul', 'Azul', 'rgb(112, 205, 255)', true), color('rosa', 'Rosa', 'rgb(255, 121, 168)')],
      [{ id: 'apagar', label: 'Apagar', icon: ICON.apagar, run: () => chosen.push('apagar') }],
    ]);
    fixture.componentInstance.show({ key: 'cor', x: 10, y: 10, back: null, by: 'teclado' });
    await fixture.whenStable();
    const swatches = [...host.querySelectorAll<HTMLButtonElement>('.leva.paleta .amostra')];
    expect(swatches.map((b) => b.getAttribute('aria-label'))).toEqual(['Azul', 'Rosa']);
    expect(getComputedStyle(swatches[1]).backgroundColor).toBe('rgb(255, 121, 168)');
    expect(swatches[0].getAttribute('aria-checked')).toBe('true');
    expect(swatches[0].querySelector('.tique')).not.toBeNull();
    expect(swatches[1].textContent?.trim()).toBe('');
    expect(host.querySelector('.leva:not(.paleta) .escolha .nome')?.textContent).toBe('Apagar');
    // a seta para o lado anda pelas amostras
    swatches[0].focus();
    swatches[0].dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true }));
    expect(document.activeElement).toBe(swatches[1]);
    swatches[1].click();
    expect(chosen).toEqual(['rosa']);
    fixture.destroy();
    host.remove();
  });
});
