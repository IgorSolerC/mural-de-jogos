import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Review, formatScore } from '../../core/review';

export interface Ponto {
  review: Review;
  x: number;
  y: number;
}

const TICKS = [1, 2, 5, 10, 20, 50, 100, 200, 500, 1000, 2000, 5000];

/**
 * Dispersão no milimetrado: cada ficha é uma bolinha de papel (a quantidade embaixo, em escala de
 * log, porque 2 h e 200 h não cabem na mesma régua reta; a Média de lado). A bolinha é um botão:
 * abre a ficha.
 */
@Component({
  selector: 'app-dispersao',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="quadro">
      <div class="y" aria-hidden="true">
        @for (t of yTicks(); track t) {
          <span [style.bottom.%]="yPos(t)">{{ t }}</span>
        }
      </div>
      <div class="area">
        @for (t of yTicks(); track t) {
          <i class="guia" [style.bottom.%]="yPos(t)"></i>
        }
        @for (p of placed(); track p.review.id) {
          <button
            type="button"
            class="bolinha"
            [class.alta]="p.y >= 9"
            [style.left.%]="p.left"
            [style.bottom.%]="p.bottom"
            [title]="p.review.game.name + ' · ' + xFmt()(p.x) + ' · média ' + fmt(p.y)"
            [attr.aria-label]="p.review.game.name + ': ' + xFmt()(p.x) + ', média ' + fmt(p.y)"
            (click)="opened.emit(p.review)"
          ></button>
        }
      </div>
      <span></span>
      <div class="x" aria-hidden="true">
        @for (t of xTicks(); track t) {
          <span [style.left.%]="xPos(t)">{{ t }}</span>
        }
      </div>
    </div>
    <p class="eixos" aria-hidden="true"><span>↑ Média</span><span>{{ xLabel() }} →</span></p>
  `,
  styles: `
    :host {
      display: block;
    }

    .quadro {
      display: grid;
      grid-template-columns: 26px minmax(0, 1fr);
      grid-template-rows: 230px 22px;
    }

    .y,
    .x {
      position: relative;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.82rem;
      font-variant-numeric: tabular-nums;
    }

    .y span {
      position: absolute;
      right: 6px;
      translate: 0 50%;
    }

    .x span {
      position: absolute;
      top: 4px;
      translate: -50% 0;
    }

    .area {
      position: relative;
      border-left: 2.5px solid var(--ink);
      border-bottom: 2.5px solid var(--ink);
      margin: 0 10px 0 0;
    }

    .guia {
      position: absolute;
      left: 0;
      right: 0;
      height: 0;
      border-top: 1px dashed rgb(21 21 21 / 0.18);
    }

    .bolinha {
      position: absolute;
      width: 13px;
      height: 13px;
      margin: 0;
      padding: 0;
      translate: -50% 50%;
      border: 2px solid var(--ink);
      border-radius: 50%;
      background: var(--paper);
      cursor: pointer;
      transition:
        scale var(--t-ui) var(--ease-ui),
        background-color var(--t-ui) var(--ease-ui);

      /* a área de toque é maior que a bolinha */
      &::after {
        content: '';
        position: absolute;
        inset: -7px;
        border-radius: 50%;
      }

      &.alta {
        background: var(--red);
      }

      &:hover,
      &:focus-visible {
        z-index: 1;
        scale: 1.45;
        background: var(--ink);
      }

      &:focus-visible {
        outline: 3px solid var(--focus);
        outline-offset: 2px;
      }
    }

    .eixos {
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
      font-family: var(--f-hand);
      font-size: 0.95rem;
      color: var(--ink-2);
    }
  `,
})
export class Dispersao {
  readonly points = input.required<readonly Ponto[]>();
  readonly xLabel = input('Horas');
  readonly xFmt = input<(v: number) => string>((v) => String(v));
  readonly opened = output<Review>();

  protected readonly fmt = formatScore;
  protected readonly top = computed(() => (this.points().some((p) => p.y > 10) ? 11 : 10));
  /** O pé da régua: o par logo abaixo da menor nota, para as bolinhas não se espremerem no alto. */
  protected readonly bottom = computed(() => {
    const min = Math.min(10, ...this.points().map((p) => p.y));
    return Math.max(0, Math.floor((min - 0.5) / 2) * 2);
  });
  protected readonly yTicks = computed(() => {
    const out: number[] = [];
    for (let t = this.bottom(); t <= 10; t += this.top() - this.bottom() > 6 ? 2 : 1) out.push(t);
    return out;
  });

  protected yPos(v: number): number {
    return ((v - this.bottom()) / (this.top() - this.bottom())) * 100;
  }
  private readonly maxLog = computed(() => Math.log(1 + Math.max(1, ...this.points().map((p) => p.x))) * 1.04);
  protected readonly xTicks = computed(() => {
    const max = Math.max(1, ...this.points().map((p) => p.x));
    const ticks = TICKS.filter((t) => t <= max * 1.04);
    // no máximo seis números embaixo, espalhados
    return ticks.length > 6 ? ticks.filter((_, i) => i % 2 === ticks.length % 2) : ticks;
  });

  protected xPos(v: number): number {
    return (Math.log(1 + v) / this.maxLog()) * 100;
  }

  protected readonly placed = computed(() =>
    this.points().map((p) => ({ ...p, left: this.xPos(p.x), bottom: this.yPos(p.y) })),
  );
}
