import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { ArrowDown, ArrowUp, LucideAngularModule } from 'lucide-angular';
import { RatedKey, Review, SCORE_LABEL, SCORE_SHORT, ScoreKey, WEIGHT_LABEL, formatScore, ratedKeys, scoreOf, weightOf } from '../core/review';
import { PenMark } from './pen-mark';

/**
 * Boletim: quatro casas fixas, sempre na mesma ordem, para comparar ficha com ficha. A que a ficha
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
          <dt [class.tem-curto]="!!shortLabels[c.key]">
            <span class="nome">{{ labels[c.key] }}</span>
            @if (shortLabels[c.key]; as curto) {
              <!-- quando o nome inteiro não cabe na casa (celular), fica a abreviação -->
              <span class="nome-curto" aria-hidden="true">{{ curto }}</span>
            }
            <!-- o peso fica no nome: a categoria que conta mais ou menos, com a nota livre embaixo -->
            @switch (c.weight) {
              @case ('relevante') {
                <lucide-icon class="w" [img]="UpIcon" [strokeWidth]="3.4" aria-hidden="true" [title]="weightLabels.relevante" />
                <span class="sr-only">({{ weightLabels.relevante }})</span>
              }
              @case ('pouco') {
                <lucide-icon class="w" [img]="DownIcon" [strokeWidth]="3.4" aria-hidden="true" [title]="weightLabels.pouco" />
                <span class="sr-only">({{ weightLabels.pouco }})</span>
              }
            }
            @if (highlight() === c.key) {
              <app-pen-mark />
            }
          </dt>
          <dd>
            @if (c.off) {
              <span aria-hidden="true">—</span><span class="sr-only">não tem</span>
            } @else {
              @if (c.ten) {
                <!-- 10: o selo dourado colado na casa, com o 10 impresso nele -->
                <span class="selo-dez">{{ c.value }}</span>
              } @else if (c.ruim) {
                <!-- 0 ou 1: nota vermelha num pedaço de fita preta rasgado à mão -->
                <span class="fita-rasgada">{{ c.value }}</span>
              } @else {
                {{ c.value }}
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
      /* os rótulos apertam quando o próprio boletim fica estreito (ficha no celular) */
      container: boletim / inline-size;
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
      display: inline-flex;
      align-items: center;
      gap: 1px;
      max-width: 100%;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.76rem;
      /* em caixa alta, como os outros rótulos impressos, um pouco mais aberto para respirar */
      text-transform: uppercase;
      letter-spacing: 0.05em;
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
    /* a seta do peso, colada no nome, do tamanho das letras e um pouco mais leve que elas */
    .w {
      display: inline-flex;
      flex: none;
      opacity: 0.86;
    }
    .w ::ng-deep svg {
      width: 1em;
      height: 1em;
    }
    /* Nota 10: o selo dourado (.selo-dez, no styles.scss), colado um pouco torto, cada casa para
       um lado, e um tico abaixo do meio, na altura em que o pincel escreve as outras notas */
    .selo-dez {
      translate: 0 0.07em;
    }
    .cell:nth-child(even) .selo-dez {
      --selo-giro: 6deg;
    }
    /* 0 ou 1: o avesso do selo, um pedaço de fita preta rasgado à mão (.fita-rasgada, no
       styles.scss), colado torto, de quem colou sem cuidado */
    .fita-rasgada {
      margin: -0.06em 0;
      rotate: -3deg;
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
      font-size: 0.94rem;
      letter-spacing: 0.06em;
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
    /* Em caixa alta, "JOGABILIDADE" não cabe numa casa de boletim estreito (celular): com a seta
       passa da casa, e sem ela encosta nos fios. Ali o nome vira abreviação, no mesmo tamanho, em
       todas as fichas. O nome inteiro continua para o leitor de tela. */
    .nome-curto {
      display: none;
    }
    @container boletim (max-width: 380px) {
      dt.tem-curto .nome {
        position: absolute;
        width: 1px;
        height: 1px;
        overflow: hidden;
        clip-path: inset(50%);
      }
      dt.tem-curto .nome-curto {
        display: inline;
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
    return ratedKeys(r.kind).map((key) => {
      const weight = weightOf(r.weights, key);
      const v = scoreOf(r.scores, key);
      return { key, weight, off: weight === 'nao-tem', ten: v === 10, ruim: (v ?? 2) < 2, value: formatScore(v) };
    });
  });
  protected readonly labels = SCORE_LABEL;
  protected readonly shortLabels: Partial<Record<RatedKey, string>> = SCORE_SHORT;
  protected readonly weightLabels = WEIGHT_LABEL;
  protected readonly UpIcon = ArrowUp;
  protected readonly DownIcon = ArrowDown;
}
