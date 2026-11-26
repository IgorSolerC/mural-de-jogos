import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import type { SketchItem } from './sketch-model';

/**
 * Os itens do desenho em ponto pequeno (PLANO-MINIATURA-CANVAS.md) dentro de um `<g>` de SVG: a miniatura do canvas
 * (board-sketch.ts) e as peças do nível meio do editor (free-board-piece.ts) desenham a mesma coisa pelo mesmo molde.
 * A foto (`i`) não entra aqui: quem desenha decide (o assado a pinta; a peça do meio mostra a miniatura dela).
 */
@Component({
  selector: 'g[appSketchShapes]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (it of items(); track $index) {
      @switch (it.t) {
        @case ('r') {
          <svg:rect
            [attr.x]="it.x"
            [attr.y]="it.y"
            [attr.width]="it.w"
            [attr.height]="it.h"
            [attr.rx]="it.rx"
            [attr.fill]="it.fill"
            [attr.stroke]="it.stroke ?? null"
            [attr.stroke-width]="it.sw ?? null"
            [attr.stroke-dasharray]="it.dash ?? null"
            [attr.opacity]="it.op ?? null"
          />
        }
        @case ('p') {
          <svg:path
            [attr.d]="it.d"
            [attr.fill]="it.fill"
            [attr.stroke]="it.stroke ?? null"
            [attr.stroke-width]="it.sw ?? null"
            [attr.opacity]="it.op ?? null"
            [attr.transform]="it.tr ?? null"
          />
        }
        @case ('t') {
          <svg:text
            [attr.class]="it.font"
            [attr.x]="it.x"
            [attr.y]="it.y"
            [attr.font-size]="it.size"
            [attr.fill]="it.fill"
            [attr.opacity]="it.op ?? null"
            [attr.text-anchor]="it.anchor ?? null"
          >{{ it.txt }}</svg:text>
        }
      }
    }
  `,
  styles: `
    path,
    rect {
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    /* o título das peças, a caneta como no card; o nome da moldura, as letras da fita Dymo */
    .mao {
      font-family: var(--f-hand);
      font-weight: 700;
    }
    .dymo {
      font-family: var(--f-label);
      font-weight: 800;
      letter-spacing: 0.1em;
    }
  `,
})
export class SketchShapes {
  readonly items = input.required<readonly SketchItem[]>();
}
