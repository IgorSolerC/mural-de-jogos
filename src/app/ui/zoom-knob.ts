import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input, output, signal } from '@angular/core';
import { ICON, IconModule } from './icons';

/**
 * O broche de ampliar dos widgets: o broche de lata do volume (ui/_broche.scss), com a seta de
 * ampliar desenhada a tinta. Aparece com o mouse em cima da peça dele (quem o usa põe a classe
 * `amplia` no que conta como "em cima": a mais perto em volta dele, então a foto colada numa nota
 * não acende o broche da nota, nem a nota o da foto; na ficha do mural, onde o texto deixa o toque
 * passar, vale a ficha inteira) ou com o foco do teclado; sem mouse, fica sempre à mostra.
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
    :host-context(app-review-card:hover),
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
    afterNextRender(() => {
      piece = host.parentElement?.closest<HTMLElement>('.amplia') ?? null;
      piece?.addEventListener('pointerenter', enter);
      piece?.addEventListener('pointerleave', leave);
    });
    inject(DestroyRef).onDestroy(() => {
      piece?.removeEventListener('pointerenter', enter);
      piece?.removeEventListener('pointerleave', leave);
    });
  }

  protected press(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.pressed.emit();
  }
}
