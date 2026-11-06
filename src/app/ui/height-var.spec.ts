import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { HeightVar } from './height-var';

@Component({
  imports: [HeightVar],
  template: `<div class="caixa" appHeightVar="--caixa-h" style="height: 200px"></div>`,
})
class Caixa {}

describe('A altura numa variável do CSS (HeightVar)', () => {
  it('escreve na hora e, quando muda, no quadro seguinte, sem o "ResizeObserver loop" de quem depende dela', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Caixa);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    const caixa = fixture.nativeElement.querySelector('.caixa') as HTMLElement;
    expect(caixa.style.getPropertyValue('--caixa-h')).toBe('200px');
    // quem está dentro muda de altura com a variável (como a folha do editor)
    const dentro = caixa.appendChild(document.createElement('div'));
    dentro.style.height = 'calc(var(--caixa-h) - 10px)';
    const erros: string[] = [];
    const ouve = (e: ErrorEvent) => {
      erros.push(e.message);
      e.preventDefault();
    };
    window.addEventListener('error', ouve);
    try {
      caixa.style.height = '300px';
      await new Promise((r) => setTimeout(r, 100));
      expect(caixa.style.getPropertyValue('--caixa-h')).toBe('300px');
      expect(dentro.offsetHeight).toBe(290);
      expect(erros).toEqual([]);
    } finally {
      window.removeEventListener('error', ouve);
      fixture.destroy();
    }
  });
});
