import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Review, formatScore } from '../../core/review';
import { CategoryStat, strength } from '../../core/stats';
import { formatAvg } from '../../core/review';


/**
 * Nota a nota do mural: uma coluna por categoria, com a média grande a pincel, uma régua de 0 a 10
 * (a média na tira, a mediana num risco vermelho), a maior e a menor ficha e o quanto ela anda junto
 * com a Média.
 */
@Component({
  selector: 'app-categorias',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (c of categories(); track c.key) {
      <article class="cat" [attr.aria-label]="c.label">
        <h3>{{ c.label }}</h3>
        <p class="media"><span class="grande">{{ avg(c.avg) }}</span><span class="miudo">média · mediana {{ avg(c.median) }}</span></p>
        <div class="barra" aria-hidden="true">
          <span class="fill" [style.width.%]="((c.avg ?? 0) / 10) * 100"></span>
          @if (c.median !== null) {
            <span class="med" [style.left.%]="(c.median / 10) * 100"></span>
          }
        </div>
        <ul class="fatos">
          @if (c.max; as m) {
            <li><span class="rot">Maior</span> <button type="button" class="nome" (click)="opened.emit(m.review)">{{ m.review.game.name }}</button> · {{ fmt(m.value) }}</li>
          }
          @if (c.min; as m) {
            <li><span class="rot">Menor</span> <button type="button" class="nome" (click)="opened.emit(m.review)">{{ m.review.game.name }}</button> · {{ fmt(m.value) }}</li>
          }
          <li><span class="rot">Notas 10</span> {{ c.tens }}</li>
          <li class="corr">{{ corrText(c) }}</li>
        </ul>
      </article>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      margin-top: 16px;
    }

    .cat {
      min-width: 0;
      padding: 4px 20px 6px;

      & + .cat {
        border-left: 1.5px dashed rgb(21 21 21 / 0.25);
      }

      &:first-child {
        padding-left: 0;
      }
    }

    h3 {
      margin: 0;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.05rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }

    .media {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 2px 10px;
      margin: 6px 0 10px;
    }

    .grande {
      font-family: var(--f-marker);
      font-size: 2.5rem;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .miudo {
      font-family: var(--f-hand);
      font-size: 0.98rem;
      color: var(--ink-2);
    }

    .barra {
      position: relative;
      height: 14px;
      border: 1.5px solid var(--ink);
      border-radius: 2px;
      background: rgb(255 255 255 / 0.5);
    }

    .fill {
      position: absolute;
      inset: 0 auto 0 0;
      border-right: 1.5px solid var(--ink);
      background-color: var(--stock-azul);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
    }

    .med {
      position: absolute;
      top: -5px;
      bottom: -5px;
      width: 3px;
      margin-left: -1.5px;
      border-radius: 2px;
      background: var(--red);
    }

    .fatos {
      display: grid;
      gap: 4px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1.3;
    }

    .rot {
      margin-right: 6px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
    }

    .nome {
      display: inline;
      margin: 0;
      padding: 0;
      border: 0;
      background: none;
      color: inherit;
      font: inherit;
      font-weight: 700;
      text-align: left;
      text-decoration: underline;
      text-decoration-thickness: 1.5px;
      text-underline-offset: 3px;
      cursor: pointer;

      &:hover {
        text-decoration-color: var(--red);
      }
    }

    .corr {
      margin-top: 4px;
      font-style: italic;
      color: var(--ink-2);
    }

    @media (max-width: 1180px) {
      :host {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        row-gap: 20px;
      }

      .cat + .cat:nth-child(3) {
        padding-left: 0;
        border-left: 0;
      }
    }

    @media (max-width: 560px) {
      :host {
        grid-template-columns: minmax(0, 1fr);
      }

      .cat,
      .cat + .cat:nth-child(3) {
        padding: 14px 0 0;
      }

      .cat + .cat {
        border-left: 0;
        border-top: 1.5px dashed rgb(21 21 21 / 0.25);
      }
    }
  `,
})
export class Categorias {
  readonly categories = input.required<readonly CategoryStat[]>();
  readonly opened = output<Review>();

  protected readonly fmt = formatScore;

  protected readonly avg = formatAvg;

  protected corrText(c: CategoryStat): string {
    switch (strength(c.corr)) {
      case 'forte':
        return 'anda junto com a Média';
      case 'media':
        return 'puxa um pouco a Média';
      case 'fraca':
        return 'quase não mexe na Média';
      default:
        return 'poucas fichas para dizer';
    }
  }
}
