import { Component, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Icone } from './icone';

/** O traço do ícone do cofre sai do tamanho dele, a mesma regra do Murall (shared/traco-dos-icones.ts). */
@Component({
  selector: 'cofre-teste-icone',
  imports: [Icone],
  template: `<cofre-icone nome="cadeado" [style.width.px]="lado()" [style.height.px]="lado()" />`,
})
class Host {
  readonly lado = signal(20);
}

describe('o traço do ícone do cofre', () => {
  it('um décimo do lado até 20px (o ícone das colunas do Kanban), e 2px acima, sem mudar o tamanho', () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(Host);
    const el = f.nativeElement as HTMLElement;
    document.body.appendChild(el);
    try {
      for (const [lado, traco] of [[20, 2], [18, 1.8], [15, 1.5], [34, 2]]) {
        f.componentInstance.lado.set(lado);
        f.detectChanges();
        const svg = el.querySelector('svg')!;
        expect(svg.getBoundingClientRect().width).withContext(`${lado}px`).toBeCloseTo(lado, 1);
        const desenho = getComputedStyle(svg.querySelector('rect, path')!);
        expect(desenho.vectorEffect).toBe('non-scaling-stroke');
        expect(parseFloat(desenho.strokeWidth)).withContext(`${lado}px`).toBeCloseTo(traco, 2);
      }
    } finally {
      el.remove();
    }
  });
});
