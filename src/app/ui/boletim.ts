import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ArrowDown, ArrowUp, LucideAngularModule } from 'lucide-angular';
import { RATED_KEYS, Review, SCORE_LABEL, ScoreKey, WEIGHT_LABEL, formatScore, weightOf } from '../core/review';
import { PenMark } from './pen-mark';

/**
 * Boletim: quatro casas fixas, sempre na mesma ordem, para comparar ficha com ficha. A que o jogo
 * "não tem" fica riscada, sem sair do lugar. O mesmo boletim na ficha do mural e na leitura.
 */
@Component({
  selector: 'app-boletim',
  imports: [LucideAngularModule, PenMark],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'size()' },
  template: `
    <dl>
      @for (c of cells(); track c.key; let i = $index) {
        <div class="cell" [class.off]="c.off">
          <dt>
            {{ labels[c.key] }}
            @if (highlight() === c.key) {
              <app-pen-mark />
            }
          </dt>
          <dd>
            @if (c.off) {
              <span aria-hidden="true">—</span><span class="sr-only">não tem</span>
            } @else {
              @if (c.ten) {
                <!-- 10: o número vem num adesivo holográfico colado na casa -->
                <span class="adesivo foil-nota" [style.--foil-delay]="i * -1.3 + 's'">{{ c.value }}</span>
              } @else if (c.ruim) {
                <!-- 0 ou 1: nota vermelha num pedaço de fita preta rasgado à mão -->
                <span class="fita-rasgada">{{ c.value }}</span>
              } @else {
                {{ c.value }}
              }
              @switch (c.weight) {
                @case ('relevante') {
                  <lucide-icon class="w" [img]="UpIcon" [size]="arrowSize()" [strokeWidth]="3.2" aria-hidden="true" [title]="weightLabels.relevante" />
                  <span class="sr-only">({{ weightLabels.relevante }})</span>
                }
                @case ('pouco') {
                  <lucide-icon class="w" [img]="DownIcon" [size]="arrowSize()" [strokeWidth]="3.2" aria-hidden="true" [title]="weightLabels.pouco" />
                  <span class="sr-only">({{ weightLabels.pouco }})</span>
                }
              }
            }
          </dd>
        </div>
      }
    </dl>
  `,
  styles: `
    :host {
      display: block;
    }
    dl {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin: 0;
    }
    dl::before {
      content: '';
      grid-column: 1 / -1;
      height: 1.5px;
      margin-bottom: 1px;
      background: rgb(21 21 21 / 0.34);
    }
    .cell {
      display: grid;
      justify-items: center;
      /* espaço fixo para o risco de caneta: a casa não muda de altura quando a ordem muda */
      gap: 6px;
      padding: 6px 2px 2px;
      min-width: 0;
    }
    .cell + .cell {
      border-left: 1.5px solid rgb(21 21 21 / 0.2);
    }
    dt {
      position: relative;
      max-width: 100%;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.01em;
      line-height: 1;
      white-space: nowrap;
      text-overflow: clip;
    }
    dd {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      margin: 0;
      font-family: var(--f-marker);
      font-size: 1.32rem;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    /* riscada, mas legível: o risco já diz que não conta */
    .cell.off dt {
      text-decoration: line-through 1.5px;
      opacity: 0.84;
    }
    .w {
      display: inline-flex;
    }
    /* Nota 10: um adesivo holográfico de cantos redondos com o número a pincel por cima, colado
       meio torto, que se destaca da cartolina pela sombra. A folha vem de .foil-nota (styles.scss). */
    .adesivo {
      --varnish: 0.22;
      display: inline-block;
      min-width: 1.4em;
      text-align: center;
      padding: 0.04em 0.26em 0;
      margin: -0.08em 0;
      --sombra: 0.5px 1.5px 3px rgb(0 0 0 / 51%);
      border-radius: 12px;
      rotate: -2.5deg;
    }
    .adesivo.foil-nota {
      box-shadow: var(--sombra);
    }
    /* 0 ou 1: o avesso do adesivo, um pedaço de fita preta rasgado à mão (.fita-rasgada, no
       styles.scss), colado mais torto que o adesivo, de quem colou sem cuidado */
    .fita-rasgada {
      margin: -0.06em 0;
      rotate: -3deg;
    }
    .cell:nth-child(even) .adesivo {
      rotate: 1.8deg;
    }
    .cell:nth-child(even) .fita-rasgada {
      rotate: 2.4deg;
    }

    /* ===== Leitura: o mesmo boletim, com casas mais altas e números maiores ===== */
    :host(.big) dl::before {
      height: 2px;
    }
    :host(.big) .cell {
      gap: 8px;
      padding: 12px 4px 6px;
    }
    :host(.big) .cell + .cell {
      border-left-width: 2px;
    }
    :host(.big) dt {
      font-size: 1rem;
      letter-spacing: 0.02em;
    }
    :host(.big) dd {
      gap: 2px;
      font-size: 2.1rem;
      line-height: 1;
    }
    :host(.big) .cell.off dt {
      text-decoration-thickness: 2px;
    }
    @media (max-width: 600px) {
      :host(.big) dt {
        font-size: 0.86rem;
      }
      :host(.big) dd {
        font-size: 1.7rem;
      }
    }
  `,
})
export class Boletim {
  readonly review = input.required<Review>();
  /** Qual nota está sendo usada na ordenação do mural, riscada a caneta. */
  readonly highlight = input<ScoreKey | null>(null);
  readonly size = input<'card' | 'big'>('card');

  protected readonly cells = computed(() => {
    const r = this.review();
    return RATED_KEYS.map((key) => {
      const weight = weightOf(r.weights, key);
      return { key, weight, off: weight === 'nao-tem', ten: r.scores[key] === 10, ruim: (r.scores[key] ?? 2) < 2, value: formatScore(r.scores[key]) };
    });
  });
  protected readonly arrowSize = computed(() => (this.size() === 'big' ? 17 : 13));
  protected readonly labels = SCORE_LABEL;
  protected readonly weightLabels = WEIGHT_LABEL;
  protected readonly UpIcon = ArrowUp;
  protected readonly DownIcon = ArrowDown;
}
