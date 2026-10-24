import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal } from '@angular/core';
import { ICON, IconModule } from './icons';

/**
 * O broche de ampliar dos widgets: o broche de lata do volume (ui/_broche.scss), com a seta de
 * ampliar desenhada a tinta. Aparece com o mouse em cima da peça dele (quem o usa põe a classe
 * `amplia` no que conta como "em cima": a mais perto em volta dele, então a foto colada numa nota
 * não acende o broche da nota, nem a nota o da foto) ou com o foco do teclado; sem mouse, fica
 * sempre à mostra. Na ficha do mural, o texto deixa o toque passar (o mouse nunca chega na peça):
 * lá, a ficha conta onde o mouse anda e o broche acende só com ele dentro do desenho da peça (ou
 * dele mesmo, que pode sair para fora dela), nunca com o mouse em qualquer canto da ficha.
 * Escondido só na opacidade: o Tab chega nele (e um broche invisível debaixo do mouse já está à
 * mostra); com a peça escondida, ele some junto (`visibility: inherit`).
 *
 * O toque não sobe (na ficha do mural, abriria a leitura): quem usa decide o que ampliar, pelo
 * `pressed` (a foto abre o visor dela; as outras peças sobem para o meio da tela, ui/piece-lift.ts).
 */
@Component({
  selector: 'app-zoom-knob',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.perto]': 'near()' },
  template: `
    <button type="button" class="botao tocavel" [attr.aria-label]="label()" title="Ampliar" (click)="press($event)">
      <span class="face"><lucide-icon [img]="Icon" [size]="18" aria-hidden="true" /></span>
    </button>
  `,
  styles: `
    @use 'broche';

    :host {
      @include broche.escondido;
      display: block;
      width: 30px;
      height: 30px;
      visibility: inherit;
    }
    :host(.perto),
    :host(:has(:focus-visible)) {
      @include broche.a-mostra;
    }
    /* sem mouse (só o toque), sempre à mostra */
    @media (hover: none) {
      :host {
        @include broche.a-mostra;
      }
    }
    .botao {
      @include broche.lata;
    }
  `,
})
export class ZoomKnob {
  /** O que o leitor de tela diz ("Ampliar a imagem: Na praia"). */
  readonly label = input('Ampliar');
  readonly pressed = output<void>();

  protected readonly Icon = ICON.aumentar;
  /** O mouse está em cima da peça dele. */
  protected readonly near = signal(false);

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const enter = (): void => this.near.set(true);
    const leave = (): void => this.near.set(false);
    let piece: HTMLElement | null = null;
    // na ficha do mural, quem ouve o mouse é a ficha (o toque passa pelo texto, a peça não o vê)
    let card: HTMLElement | null = null;
    const move = (e: Event): void => {
      const p = e as PointerEvent;
      if (p.pointerType !== 'touch' && piece) this.near.set(inside(piece, p) || inside(host, p));
    };
    const listen = (on: boolean): void => {
      const go = on ? 'addEventListener' : 'removeEventListener';
      if (card) {
        card[go]('pointerenter', move);
        card[go]('pointermove', move);
        card[go]('pointerleave', leave);
      } else {
        piece?.[go]('pointerenter', enter);
        piece?.[go]('pointerleave', leave);
      }
    };
    afterNextRender(() => {
      piece = host.parentElement?.closest<HTMLElement>('.amplia') ?? null;
      card = piece?.closest<HTMLElement>('app-review-card') ?? null;
      listen(true);
    });
    inject(DestroyRef).onDestroy(() => listen(false));
  }

  protected press(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.pressed.emit();
  }
}

/** O ponto do mouse cai dentro do desenho do elemento (a caixa dele na tela, com o giro). */
function inside(el: HTMLElement, e: PointerEvent): boolean {
  const r = el.getBoundingClientRect();
  return e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom;
}
