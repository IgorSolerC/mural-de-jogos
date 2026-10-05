import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CategoryStat } from '../../core/stats';

/**
 * Quanto cada nota pesa: uma barra empilhada por categoria com os pesos escolhidos ficha a ficha, em
 * tons de tinta do mais forte (Relevante) ao mais fraco, e o Não tem riscado a lápis.
 */
@Component({
  selector: 'app-pesos',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul>
      @for (row of rows(); track row.cat.key) {
        <li>
          <span class="nome">{{ row.cat.label }}</span>
          <span class="barra" role="img" [attr.aria-label]="row.spoken">
            @for (part of row.parts; track part.key) {
              @if (part.n) {
                <span [class]="'seg seg-' + part.key" [style.flex-grow]="part.n" [title]="part.label + ': ' + part.n">
                  @if (part.w >= 12) {
                    <span>{{ part.n }}</span>
                  }
                </span>
              }
            }
          </span>
        </li>
      }
    </ul>
    <p class="legenda" aria-hidden="true">
      @for (l of legend; track l.key) {
        <span><i [class]="'lg seg-' + l.key"></i>{{ l.label }}</span>
      }
    </p>
  `,
  styles: `
    :host {
      display: block;
    }

    ul {
      display: grid;
      gap: 12px;
      margin: 0;
      padding: 0;
      list-style: none;
    }

    li {
      display: grid;
      grid-template-columns: 7.5rem minmax(0, 1fr);
      align-items: center;
      gap: 12px;
    }

    .nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.98rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }

    .barra {
      display: flex;
      gap: 2px;
      height: 28px;
      padding: 2px;
      border: 1.5px solid var(--ink);
      border-radius: 2px;
      background: #fbfcf6;
    }

    .seg {
      display: grid;
      place-items: center;
      min-width: 4px;
      overflow: hidden;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      font-variant-numeric: tabular-nums;
    }

    .seg-relevante {
      background: var(--ink);
      color: var(--paper);
    }
    .seg-normal {
      background: rgb(21 21 21 / 0.5);
      color: var(--paper);
    }
    .seg-pouco {
      background: rgb(21 21 21 / 0.18);
      color: var(--ink);
    }
    .seg-nao-tem {
      background: repeating-linear-gradient(45deg, rgb(21 21 21 / 0.6) 0 1.5px, transparent 1.5px 6px);
      color: var(--ink);
    }

    .legenda {
      display: flex;
      flex-wrap: wrap;
      gap: 4px 16px;
      margin: 10px 0 0;
      font-family: var(--f-hand);
      font-size: 0.95rem;
      color: var(--ink-2);

      span {
        display: inline-flex;
        align-items: center;
        gap: 6px;
      }
    }

    .lg {
      display: inline-block;
      width: 18px;
      height: 12px;
      border: 1px solid var(--ink);
      border-radius: 1px;
    }

    @media (max-width: 560px) {
      li {
        grid-template-columns: minmax(0, 1fr);
        gap: 4px;
      }
    }
  `,
})
export class Pesos {
  readonly categories = input.required<readonly CategoryStat[]>();
  readonly count = input.required<number>();

  protected readonly legend = [
    { key: 'relevante', label: 'Relevante' },
    { key: 'normal', label: 'Normal' },
    { key: 'pouco', label: 'Pouco importante' },
    { key: 'nao-tem', label: 'Não tem' },
  ];

  protected readonly rows = computed(() => {
    const count = this.count();
    const total = count || 1;
    return this.categories().map((c) => {
      const normal = Math.max(0, count - c.relevante - c.pouco - c.naoTem);
      const parts = [
        { key: 'relevante', label: 'Relevante', n: c.relevante },
        { key: 'normal', label: 'Normal', n: normal },
        { key: 'pouco', label: 'Pouco importante', n: c.pouco },
        { key: 'nao-tem', label: 'Não tem', n: c.naoTem },
      ].map((p) => ({ ...p, w: (p.n / total) * 100 }));
      return { cat: c, parts, spoken: `${c.label}: ${parts.map((p) => `${p.n} ${p.label.toLowerCase()}`).join(', ')}` };
    });
  });
}
