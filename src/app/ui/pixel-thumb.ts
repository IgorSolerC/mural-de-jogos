import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PixelArt, inkOf, inkPaths } from '../core/pixel-art';

/**
 * O desenho de uma pixel art em miniatura, sem jeito nenhum: os quadradinhos nítidos, um caminho por cor, do
 * tamanho que couber no lugar (inteiro, no meio). O transparente fica transparente: quem usa põe o xadrez atrás
 * (`ui/pixel-studio/_xadrez.scss`). Na folha do widget (ui/pixel-studio/pixel-field.ts), na Grade da galeria e
 * nas listas das folhas da galeria.
 */
@Component({
  selector: 'app-pixel-thumb',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = art();
    <svg [attr.viewBox]="'0 0 ' + a.w + ' ' + a.h" preserveAspectRatio="xMidYMid meet" shape-rendering="crispEdges" aria-hidden="true">
      @for (p of paths(); track p.ink) {
        <path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
      }
    </svg>
  `,
  styles: `
    :host {
      display: block;
      width: 100%;
      height: 100%;
    }
    svg {
      display: block;
      width: 100%;
      height: 100%;
    }
  `,
})
export class PixelThumb {
  readonly art = input.required<Pick<PixelArt, 'w' | 'h' | 'rows' | 'palette' | 'colors'>>();
  protected readonly inks = computed(() => inkOf(this.art().palette, this.art().colors));
  protected readonly paths = computed(() => inkPaths(this.art().rows, 'pixel'));
}
