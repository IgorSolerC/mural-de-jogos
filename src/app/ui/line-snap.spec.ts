import { Component, ElementRef, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { snapToLines } from './line-snap';

@Component({
  selector: 'app-peca-pauta',
  template: `<div class="peca" [style.height.px]="alto()"></div>`,
  styles: `
    :host {
      display: block;
      box-sizing: border-box;
      padding: 3px 0 7px;
      line-height: 30px;
    }
  `,
})
class PecaPauta {
  readonly alto = signal(140);
  readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  constructor() {
    snapToLines('.peca');
  }
}

describe('A peça em linhas inteiras da pauta (snapToLines)', () => {
  const quadros = () => new Promise((r) => setTimeout(r, 80));

  async function peca(alto: number) {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(PecaPauta);
    fixture.componentInstance.alto.set(alto);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    await quadros();
    return fixture;
  }

  it('a peça que passa da linha sobe até a linha seguinte', async () => {
    const f = await peca(145);
    expect(f.componentInstance.host.getBoundingClientRect().height).toBe(180);
    f.destroy();
  });

  // o padding soma 10: com 140 de peça, o total é a altura exata de cinco linhas
  for (const alto of [140, 140.3, 140.6, 140.96]) {
    it(`os décimos a mais de ${alto}px não empurram o texto de baixo: o host fica com a altura exata`, async () => {
      const f = await peca(alto);
      expect(f.componentInstance.host.getBoundingClientRect().height).toBe(150);
      f.destroy();
    });
  }

  it('a peça que cresce depois tira o desconto da margem', async () => {
    const f = await peca(140.6);
    const piece = f.nativeElement.querySelector('.peca') as HTMLElement;
    expect(piece.style.marginBottom).not.toBe('');
    f.componentInstance.alto.set(165);
    f.detectChanges();
    await f.whenStable();
    await quadros();
    expect(f.componentInstance.host.getBoundingClientRect().height).toBe(180);
    expect(piece.style.marginBottom).toBe('');
    f.destroy();
  });
});
