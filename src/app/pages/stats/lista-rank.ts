import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { Review, formatScore } from '../../core/review';
import { CoverSleeve } from '../../ui/cover-sleeve';

/**
 * Uma lista de ranking na folha de bloquinho (as melhores, a lanterninha): posição, capinha, nome e a
 * nota a caneta. Cada linha abre a ficha.
 */
@Component({
  selector: 'app-lista-rank',
  imports: [CoverSleeve],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ol>
      @for (r of reviews(); track r.id; let i = $index) {
        <li>
          <button type="button" class="rank" [class.primeiro]="top() && i === 0" (click)="opened.emit(r)">
            <span class="pos">{{ top() ? i + 1 : total() - i }}º</span>
            <app-cover-sleeve class="capa" size="thumb" [game]="r.game" [decorative]="true" />
            <span class="nome">{{ r.game.name }}</span>
            <span class="nota" [class.alta]="top() && r.scores.final >= 9">{{ fmt(r.scores.final) }}</span>
          </button>
        </li>
      }
    </ol>
  `,
  styles: `
    ol {
      margin: 8px 0 0;
      padding: 0;
      list-style: none;
    }

    li + li {
      border-top: 1.5px dashed rgb(21 21 21 / 0.25);
    }

    .rank {
      display: grid;
      grid-template-columns: 2.4rem 40px minmax(0, 1fr) auto;
      align-items: center;
      gap: 12px;
      width: 100%;
      margin: 0;
      padding: 8px 6px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--ink);
      text-align: left;
      font: inherit;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);

      &:hover {
        background: rgb(21 21 21 / 0.06);
      }
    }

    .pos {
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      font-size: 1.25rem;
      color: var(--ink-2);
      font-variant-numeric: tabular-nums;
    }

    .capa {
      rotate: -2deg;
    }

    .nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.12rem;
      line-height: 1.12;
      overflow-wrap: anywhere;
    }

    .primeiro .nome {
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.3rem;
    }

    .nota {
      font-family: var(--f-marker);
      font-size: 1.55rem;
      line-height: 1;
      font-variant-numeric: tabular-nums;

      &.alta {
        color: var(--red-deep);
      }
    }
  `,
})
export class ListaRank {
  readonly reviews = input.required<readonly Review[]>();
  /** As de cima (1º, 2º…) ou as de baixo (contando do total para trás). */
  readonly top = input(true);
  readonly total = input(0);
  readonly opened = output<Review>();

  protected readonly fmt = formatScore;
}
