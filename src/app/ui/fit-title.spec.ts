import { Component, provideZonelessChangeDetection, signal, viewChildren } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FIT_MIN_PX, FitTitle } from './fit-title';

/** Áreas do mesmo tamanho, com o texto que cada uma tem, para comparar os tamanhos da letra. */
@Component({
  imports: [FitTitle],
  template: `
    @for (t of texts(); track $index) {
      <div class="area" [style.height.px]="heights()[$index]" [appFitTitle]="t">
        <p class="titulo">{{ t }}</p>
      </div>
    }
  `,
  styles: `
    .area {
      width: 150px;
      display: flex;
      align-items: center;
      overflow: hidden;
      font-family: 'Permanent Marker', cursive;
    }
    .titulo {
      width: 100%;
      margin: 0;
      line-height: 1.08;
      text-align: center;
      overflow-wrap: normal;
    }
  `,
})
class Host {
  readonly texts = signal<string[]>([]);
  readonly heights = signal<number[]>([]);
  readonly fits = viewChildren(FitTitle);
}

describe('o título do tamanho do espaço (ui/fit-title.ts)', () => {
  function mount(texts: string[], heights: number[]) {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    fixture.componentInstance.texts.set(texts);
    fixture.componentInstance.heights.set(heights);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    for (const f of fixture.componentInstance.fits()) f.fit();
    const els = [...(fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.titulo')];
    return { els, size: (i: number) => parseFloat(els[i].style.fontSize), done: () => fixture.nativeElement.remove() };
  }

  it('um caractere fica enorme, uma palavra grande, uma frase menor', () => {
    const { size, done } = mount(['日', 'Bhaskara', 'Quando começou a Revolução Francesa?'], [180, 180, 180]);
    expect(size(0)).toBeGreaterThan(size(1));
    expect(size(1)).toBeGreaterThan(size(2));
    expect(size(0)).toBeGreaterThan(100);
    done();
  });

  it('com menos espaço (o subtítulo ou a imagem tomam parte), a mesma letra fica menor', () => {
    const { size, done } = mount(['Fotossíntese', 'Fotossíntese'], [180, 70]);
    expect(size(1)).toBeLessThanOrEqual(size(0) + 0.5);
    done();
  });

  it('nada sai da área, nem a palavra comprida (a letra diminui, a palavra não quebra no meio)', () => {
    const { els, done } = mount(['Anticonstitucionalissimamente', 'O que é a mitocôndria e para que ela serve na célula?'], [180, 180]);
    for (const el of els) {
      const area = el.parentElement!;
      expect(el.scrollWidth).toBeLessThanOrEqual(area.clientWidth + 1);
      expect(el.scrollHeight).toBeLessThanOrEqual(area.clientHeight + 1);
      expect(parseFloat(el.style.fontSize)).toBeGreaterThanOrEqual(FIT_MIN_PX);
    }
    done();
  });

  it('um título que nem com a menor letra cabe em quatro linhas usa as linhas que precisar', () => {
    const long = 'Explique a diferença entre mitose e meiose em todas as fases, com exemplos';
    const { els, done } = mount([long], [200]);
    const el = els[0];
    const lines = Math.round(el.scrollHeight / (parseFloat(el.style.fontSize) * 1.08));
    expect(el.scrollHeight).toBeLessThanOrEqual(el.parentElement!.clientHeight + 1);
    expect(lines).toBeGreaterThanOrEqual(1);
    done();
  });
});
