import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Até quantos risquinhos cabem numa linha do caderno; daí para cima, escreve o número. */
const MAX_MARKS = 20;
const STEP = 7;
const GROUP = 34;

/**
 * Risquinhos de contar, de cinco em cinco (quatro em pé e um cortando), na cor da caneta de quem
 * contou (`currentColor`). Cada traço entorta um pouco, sempre do mesmo jeito para a mesma posição.
 */
@Component({
  selector: 'app-tally',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': 'n()' },
  template: `
    @if (n() === 0) {
      <span class="zero" aria-hidden="true">–</span>
    } @else if (n() > max) {
      <span class="numero" aria-hidden="true">{{ n() }}</span>
    } @else {
      <svg [attr.viewBox]="'0 0 ' + width() + ' 24'" [attr.width]="width()" height="24" aria-hidden="true">
        @for (s of strokes(); track $index) {
          <path [attr.d]="s" />
        }
      </svg>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      min-height: 26px;
      vertical-align: middle;
    }
    svg {
      display: block;
      overflow: visible;
    }
    path {
      fill: none;
      stroke: currentColor;
      stroke-width: 2.3;
      stroke-linecap: round;
    }
    .numero {
      font-family: var(--f-marker);
      font-size: 1.2rem;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .zero {
      opacity: 0.45;
      font-family: var(--f-hand);
    }
  `,
})
export class Tally {
  readonly n = input.required<number>();
  protected readonly max = MAX_MARKS;

  protected readonly width = computed(() => {
    const n = Math.min(this.n(), MAX_MARKS);
    const groups = Math.floor(n / 5);
    const rest = n % 5;
    return Math.max(8, groups * GROUP + rest * STEP + 4);
  });

  protected readonly strokes = computed(() => {
    const n = Math.min(this.n(), MAX_MARKS);
    const out: string[] = [];
    for (let i = 0; i < n; i++) {
      const group = Math.floor(i / 5);
      const pos = i % 5;
      const x0 = 3 + group * GROUP;
      const j = (k: number) => ((Math.sin((i + 1) * 12.9898 + k * 78.233) * 43758.5453) % 1) * 1.4;
      if (pos < 4) {
        const x = x0 + pos * STEP;
        out.push(`M${x + j(1)} ${3 + j(2)} Q${x + 1 + j(3)} 12 ${x + j(4)} ${21 + j(5)}`);
      } else {
        // o quinto corta os quatro, de baixo para cima
        out.push(`M${x0 - 3 + j(1)} ${17 + j(2)} L${x0 + 3 * STEP + 4 + j(3)} ${6 + j(4)}`);
      }
    }
    return out;
  });
}
