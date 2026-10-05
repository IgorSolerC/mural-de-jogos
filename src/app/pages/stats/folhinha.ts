import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { KindProfile, cap, countOf } from '../../core/kinds';
import { MonthCell, YearRow, monthLong, monthName } from '../../core/stats';

const one = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * A folhinha: uma tabela de verdade, um ano por linha e um mês por coluna, cada quadradinho pintado
 * a tinta tanto mais escuro quanto mais fichas terminaram nele. Rola de lado no celular.
 */
@Component({
  selector: 'app-folhinha',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="rolo">
      <table>
        <caption class="sr-only">{{ cap(profile().plural) }} terminad{{ profile().fem ? 'as' : 'os' }} por mês</caption>
        <thead>
          <tr>
            <td class="canto"></td>
            @for (m of months; track m) {
              <th scope="col">{{ monthName(m) }}</th>
            }
            <th scope="col" class="extra">sem mês</th>
            <th scope="col" class="extra">total</th>
          </tr>
        </thead>
        <tbody>
          @for (row of rows(); track row.year) {
            <tr>
              <th scope="row">{{ row.year }}</th>
              @for (m of row.months; track m.month) {
                <td class="mes" [class.cheio]="heat(m.n) >= 0.6" [class.vazio]="!m.n" [style.--a]="heat(m.n)" [title]="tip(row.year, m)">
                  @if (m.n) {
                    {{ m.n }}
                  } @else {
                    <span class="sr-only">0</span>
                  }
                </td>
              }
              <td class="extra solto">{{ row.loose || '' }}</td>
              <td class="extra total">{{ row.n }}</td>
            </tr>
          }
        </tbody>
      </table>
    </div>
  `,
  styles: `
    :host {
      display: block;
    }

    /* posicionado: o texto escondido das células (sr-only) fica preso aqui dentro e não alarga a página */
    .rolo {
      position: relative;
      overflow-x: auto;
      margin: 0 -6px;
      padding: 0 6px 6px;
    }

    table {
      width: 100%;
      min-width: 620px;
      border-collapse: separate;
      border-spacing: 4px;
      font-family: var(--f-label);
      font-weight: 800;
      font-variant-numeric: tabular-nums;
    }

    thead th {
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-2);
    }

    tbody th {
      padding-right: 8px;
      font-size: 1rem;
      text-align: right;
    }

    .mes {
      height: 38px;
      border-radius: 2px;
      text-align: center;
      font-size: 1rem;
      background: rgb(21 21 21 / var(--a, 0));
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.35);

      &.vazio {
        box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.12);
      }

      &.cheio {
        color: var(--paper);
      }
    }

    .extra {
      width: 4.2rem;
    }

    .solto {
      font-family: var(--f-hand);
      font-weight: 400;
      color: var(--ink-2);
      text-align: center;
    }

    .total {
      font-family: var(--f-marker);
      font-weight: 400;
      text-align: center;
    }
  `,
})
export class Folhinha {
  readonly rows = input.required<readonly YearRow[]>();
  readonly max = input.required<number>();
  readonly profile = input.required<KindProfile>();

  protected readonly months = Array.from({ length: 12 }, (_, i) => i + 1);
  protected readonly monthName = monthName;
  protected readonly cap = cap;

  protected heat(n: number): number {
    const max = this.max();
    return max && n ? 0.14 + (n / max) * 0.8 : 0;
  }

  protected tip(year: number, m: MonthCell): string {
    if (!m.n) return `${monthLong(m.month)} de ${year}: nada`;
    return `${monthLong(m.month)} de ${year}: ${countOf(this.profile(), m.n)}, média ${one.format(m.avg ?? 0)}`;
  }
}
