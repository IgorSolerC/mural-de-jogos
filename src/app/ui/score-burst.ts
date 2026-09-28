import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { formatScore } from '../core/review';

/** Estrela de papel recortada à mão: 18 pontas levemente irregulares. */
export const BURST_POINTS = (() => {
  const n = 18;
  const jitter = [0, 3, -2, 4, -3, 1, 2, -4, 3, -1, 4, -2, 1, -3, 2, 0, -2, 3];
  const pts: string[] = [];
  for (let i = 0; i < n * 2; i++) {
    const outer = i % 2 === 0;
    const r = outer ? 48 + jitter[(i / 2) % n] * 0.5 : 37 + jitter[((i - 1) / 2) % n] * 0.3;
    const a = (Math.PI * i) / n - Math.PI / 2;
    pts.push(`${(50 + r * Math.cos(a)).toFixed(1)},${(50 + r * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
})();

@Component({
  selector: 'app-score-burst',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.big]': 'size() === "big"', role: 'img', '[attr.aria-label]': '"Média " + text() + " de 10"', '[class.decimal]': 'text().length > 2', '[class.hi-grade]': '(value() ?? 0) >= 9' },
  template: `
    <svg viewBox="0 0 100 100" aria-hidden="true">
      <polygon [attr.points]="points" />
    </svg>
    <span class="value" aria-hidden="true"
      >{{ text() }}<small>/10</small></span
    >
  `,
  styles: `
    :host {
      position: relative;
      display: inline-grid;
      place-items: center;
      width: 76px;
      height: 76px;
      rotate: -9deg;
      filter: drop-shadow(1px 3px 2px rgb(0 0 0 / 0.35));
    }
    :host(.big) {
      width: 120px;
      height: 120px;
    }
    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }
    /* Estrela de papel recortada à mão, contorno de caneta */
    polygon {
      fill: var(--paper);
      stroke: var(--ink);
      stroke-width: 2.2;
      stroke-linejoin: round;
      paint-order: stroke;
    }
    .value {
      position: relative;
      display: flex;
      align-items: baseline;
      color: var(--ink);
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      font-size: 2.1rem;
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    /* Nota 9 ou mais: o número sai na caneta vermelha, como nota alta de professor */
    :host(.hi-grade) .value {
      color: var(--red-deep);
    }
    :host(.big) .value {
      font-size: 3.4rem;
    }
    /* "8,4" é mais largo que "9": encolhe um pouco para caber na estrela */
    :host(.decimal) .value {
      font-size: 1.7rem;
    }
    :host(.big.decimal) .value {
      font-size: 2.8rem;
    }
    small {
      font-size: 0.42em;
      font-weight: 800;
      margin-left: 1px;
      opacity: 0.92;
    }
  `,
})
export class ScoreBurst {
  readonly value = input.required<number | null>();
  readonly size = input<'card' | 'big'>('card');
  protected readonly points = BURST_POINTS;
  protected readonly text = computed(() => formatScore(this.value()));
}
