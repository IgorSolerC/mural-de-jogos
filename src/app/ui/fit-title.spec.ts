import { Component, provideZonelessChangeDetection, signal, viewChildren } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { FIT_FLOOR_PX, FIT_MIN_PX, FitTitle } from './fit-title';

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
      // a palavra que nem a 12 px cabe na largura desce até o piso, inteira, em vez de quebrar no meio
      expect(parseFloat(el.style.fontSize)).toBeGreaterThanOrEqual(FIT_FLOOR_PX);
      expect(el.style.overflowWrap).toBe('');
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

  it('a frase que nem a 12 px cabe na área desce até o piso e aparece inteira, sem cortar a última palavra', () => {
    const long = 'Explique a diferença entre mitose e meiose em todas as fases, com exemplos de cada uma delas';
    const { els, size, done } = mount([long], [46]);
    const el = els[0];
    expect(size(0)).toBeLessThan(FIT_MIN_PX);
    expect(size(0)).toBeGreaterThanOrEqual(FIT_FLOOR_PX);
    expect(el.scrollHeight).toBeLessThanOrEqual(el.parentElement!.clientHeight + 1);
    expect(el.style.getPropertyValue('-webkit-line-clamp')).toBe('');
    done();
  });

  it('o que nem no piso cabe termina em reticências, nas linhas que a área tem', () => {
    const huge = Array(12).fill('Explique a diferença entre mitose e meiose em todas as fases').join(', ');
    const { els, size, done } = mount([huge, 'Fogo'], [80, 80]);
    expect(size(0)).toBe(FIT_FLOOR_PX);
    expect(els[0].style.getPropertyValue('-webkit-line-clamp')).toBe(String(Math.floor(80 / (FIT_FLOOR_PX * 1.08))));
    expect(els[0].getBoundingClientRect().height).toBeLessThanOrEqual(81);
    // a curta, na mesma conta, sem o limite
    expect(els[1].style.getPropertyValue('-webkit-line-clamp')).toBe('');
    done();
  });
});
