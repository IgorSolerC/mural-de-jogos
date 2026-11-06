import { ChangeDetectionStrategy, Component, provideZonelessChangeDetection, signal, viewChild } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GROW_MAX, GrowToFit } from './grow-to-fit';

/**
 * O pai com altura (a área), a caixa sem zoom e o texto que cresce, como no verso da carta: os parágrafos e o
 * título do card são `.linha`, e o título quebra em qualquer lugar (o "anywhere" do card).
 */
@Component({
  imports: [GrowToFit],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="area" [style.width.px]="w()" [style.height.px]="h()">
      <div class="caixa" [appGrowToFit]="lines().join('|') + title()" [appGrowToFitMin]="min()">
        <div class="texto">
          @if (title()) {
            <div class="linha topo"><i></i><span>{{ title() }}</span></div>
          }
          @for (l of lines(); track $index) {
            <p class="linha">{{ l }}</p>
          }
        </div>
      </div>
    </div>
  `,
  styles: `
    .area {
      display: flex;
      flex-direction: column;
      box-sizing: border-box;
      padding: 0 0 10px;
      overflow: auto;
      font: 16px/20px monospace;
    }
    .caixa {
      display: flow-root;
    }
    .texto {
      overflow-wrap: anywhere;
    }
    .linha {
      margin: 0;
    }
    .topo {
      display: flex;
      gap: 4px;
      overflow-wrap: anywhere;
    }
    .topo i {
      flex: none;
      width: 16px;
    }
  `,
})
class Host {
  readonly w = signal(300);
  readonly h = signal(400);
  readonly min = signal(1);
  readonly title = signal('');
  readonly lines = signal<string[]>([]);
  readonly grow = viewChild.required(GrowToFit);
}

describe('GrowToFit: a resposta do verso do tamanho do espaço', () => {
  let fixture: ComponentFixture<Host>;
  let host: Host;
  const $ = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement;
  const zoom = () => Number($('.texto').style.getPropertyValue('zoom') || 1);
  /** Quantas linhas a tela mostra, no tamanho de agora (a letra tem 20px de linha). */
  const rows = (el: HTMLElement) => Math.round(el.getBoundingClientRect().height / (20 * zoom()));
  function fit(): void {
    fixture.detectChanges();
    host.grow().fit();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(Host);
    host = fixture.componentInstance;
    document.body.append(fixture.nativeElement);
  });
  afterEach(() => fixture.nativeElement.remove());

  it('a curta cresce até o dobro', () => {
    host.lines.set(['Romaji → a']);
    fit();
    expect(zoom()).toBe(GROW_MAX);
  });

  it('crescendo, a linha que cabia numa só não vira duas (o "Romaji → ka" não desce o "ka")', () => {
    // 22 letras de 9,6px: numa linha só até uns 1,4x nos 300px
    host.lines.set(['Romaji → ka e mais isto', 'a']);
    fit();
    expect(zoom()).toBeGreaterThan(1);
    expect(zoom()).toBeLessThan(GROW_MAX);
    expect(rows($('.linha'))).toBe(1);
  });

  it('o título do card, que quebra em qualquer lugar, não quebra no meio da palavra por causa do crescimento', () => {
    host.title.set('Katakanaaaaaaaaaaaaa');
    host.lines.set(['イ']);
    fit();
    expect(zoom()).toBeGreaterThan(1);
    expect(rows($('.topo'))).withContext('o título numa linha só').toBe(1);
  });

  it('não cabe nem no tamanho de sempre: sem deixar, fica como é (e rola); deixando, diminui até caber', () => {
    host.h.set(80);
    host.lines.set(['um', 'dois', 'três', 'quatro']);
    fit();
    expect($('.texto').style.getPropertyValue('zoom')).toBe('');
    host.min.set(0.75);
    fit();
    expect(zoom()).toBeLessThan(1);
    expect(zoom()).toBeGreaterThanOrEqual(0.75);
    const area = $('.area');
    expect(area.scrollHeight).toBeLessThanOrEqual(area.clientHeight);
  });

  it('a palavra mais larga que a carta também faz diminuir, em vez de quebrar', () => {
    host.w.set(150);
    host.min.set(0.75);
    host.title.set('Hiraganaaaaaaaaa');
    host.lines.set(['a']);
    fit();
    expect(zoom()).toBeLessThan(1);
    expect(rows($('.topo'))).toBe(1);
  });

  it('o comprido, que nem no menor cabe, fica como é', () => {
    host.h.set(80);
    host.min.set(0.75);
    host.lines.set(Array.from({ length: 20 }, (_, i) => `linha ${i}`));
    fit();
    expect($('.texto').style.getPropertyValue('zoom')).toBe('');
  });

  it('depois da conta, nada fica marcado para medir', () => {
    host.title.set('Hiragana');
    host.lines.set(['a']);
    fit();
    expect($('.texto').hasAttribute('data-medindo')).toBeFalse();
  });
});
