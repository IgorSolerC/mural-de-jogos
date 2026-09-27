import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * Risco de caneta vermelha, de uma passada só, sob a palavra que está ordenando: o professor
 * sublinhando o que interessa. Fica por baixo do texto (o pai precisa de position: relative).
 */
@Component({
  selector: 'app-pen-mark',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 100 10" preserveAspectRatio="none">
      <path d="M2 7.4C20 5.2 46 3.9 72 3.8c9 0 17 .3 25 1" />
    </svg>
  `,
  styles: `
    :host {
      position: absolute;
      left: -7%;
      right: -7%;
      bottom: var(--pen-y, -5px);
      height: 7px;
      pointer-events: none;
    }
    /* a caneta corre da esquerda para a direita: o recorte abre junto com o traço */
    svg {
      display: block;
      width: 100%;
      height: 100%;
      overflow: visible;
      animation: draw 280ms 80ms var(--ease-physical) both;
    }
    /* traço de espessura constante, seja a palavra curta (Visual) ou longa (Jogabilidade) */
    path {
      fill: none;
      stroke: var(--red);
      stroke-width: var(--pen-w, 2.6px);
      stroke-linecap: round;
      vector-effect: non-scaling-stroke;
    }
    @keyframes draw {
      from {
        clip-path: inset(-4px 100% -4px -4px);
      }
      to {
        clip-path: inset(-4px -4px -4px -4px);
      }
    }
  `,
})
export class PenMark {}
