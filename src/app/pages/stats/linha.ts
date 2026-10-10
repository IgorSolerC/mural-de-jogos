import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ONE_DECIMAL as one } from '../../core/review';

export interface PontoLinha {
  key: string;
  label: string;
  value: number | null;
  n: number;
}


/**
 * Uma linha a caneta ligando um ponto por período (a média de cada ano). A escala de baixo fica justa
 * nos valores, com meio ponto de folga, para a subida e a descida aparecerem; o número de cada ponto
 * vai escrito em cima dele quando cabe (até 12 pontos), senão só o primeiro, o último, o maior e o menor.
 */
@Component({
  selector: 'app-linha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="area" role="img" [attr.aria-label]="spoken()">
      <svg viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        @for (seg of segments(); track $index) {
          <polyline [attr.points]="seg" />
        }
      </svg>
      @for (p of placed(); track p.key) {
        @if (p.value !== null) {
          <span class="ponto" [style.left.%]="p.x" [style.bottom.%]="p.y" [title]="p.label + ': média ' + fmt(p.value) + ' (' + p.n + ')'">
            @if (p.show) {
              <span class="num">{{ fmt(p.value) }}</span>
            }
          </span>
        }
      }
    </div>
    <div class="eixo" aria-hidden="true">
      @for (p of placed(); track p.key; let i = $index) {
        <span [style.left.%]="p.x" [class.pulo]="placed().length > 8 && i % 2 === 1 && i !== placed().length - 1">{{ p.label }}</span>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    .area {
      position: relative;
      height: 160px;
      margin: 0 18px;
      border-bottom: 2.5px solid var(--ink);
    }

    svg {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      overflow: visible;
    }

    polyline {
      fill: none;
      stroke: var(--ink);
      stroke-width: 2.5;
      stroke-linecap: round;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;
    }

    .ponto {
      position: absolute;
      width: 12px;
      height: 12px;
      translate: -50% 50%;
      border: 2px solid var(--ink);
      border-radius: 50%;
      background: var(--paper);
    }

    .num {
      position: absolute;
      bottom: 13px;
      left: 50%;
      translate: -50% 0;
      font-family: var(--f-marker);
      font-size: 0.95rem;
      line-height: 1;
      white-space: nowrap;
      font-variant-numeric: tabular-nums;
    }

    .eixo {
      position: relative;
      height: 24px;
      margin: 0 18px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.84rem;
      font-variant-numeric: tabular-nums;

      span {
        position: absolute;
        top: 5px;
        translate: -50% 0;
        white-space: nowrap;
      }
    }

    @media (max-width: 560px) {
      .eixo .pulo {
        visibility: hidden;
      }
    }
  `,
})
export class Linha {
  readonly points = input.required<readonly PontoLinha[]>();

  protected readonly fmt = (v: number) => one.format(v);

  private readonly range = computed(() => {
    const vals = this.points()
      .map((p) => p.value)
      .filter((v): v is number => v !== null);
    if (!vals.length) return { lo: 0, hi: 10 };
    const lo = Math.max(0, Math.floor((Math.min(...vals) - 0.5) * 2) / 2);
    const hi = Math.min(11, Math.ceil((Math.max(...vals) + 0.5) * 2) / 2);
    return { lo, hi: hi > lo ? hi : lo + 1 };
  });

  protected readonly placed = computed(() => {
    const pts = this.points();
    const { lo, hi } = this.range();
    const vals = pts.map((p) => p.value).filter((v): v is number => v !== null);
    const max = Math.max(...vals);
    const min = Math.min(...vals);
    const firstIdx = pts.findIndex((p) => p.value !== null);
    const lastIdx = pts.length - 1 - [...pts].reverse().findIndex((p) => p.value !== null);
    return pts.map((p, i) => ({
      ...p,
      x: pts.length === 1 ? 50 : (i / (pts.length - 1)) * 100,
      // 82% da altura: em cima sobra lugar para o número do ponto mais alto
      y: p.value === null ? 0 : ((p.value - lo) / (hi - lo)) * 82,
      show: p.value !== null && (pts.length <= 12 || i === firstIdx || i === lastIdx || p.value === max || p.value === min),
    }));
  });

  /** A linha se quebra nos anos sem ficha. */
  protected readonly segments = computed(() => {
    const out: string[] = [];
    let cur: string[] = [];
    for (const p of this.placed()) {
      if (p.value === null) {
        if (cur.length > 1) out.push(cur.join(' '));
        cur = [];
      } else cur.push(`${p.x},${100 - p.y}`);
    }
    if (cur.length > 1) out.push(cur.join(' '));
    return out;
  });

  protected readonly spoken = computed(() =>
    this.points()
      .filter((p) => p.value !== null)
      .map((p) => `${p.label}: ${one.format(p.value!)}`)
      .join('; '),
  );
}
