import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { brl, brlShort, monthLabel } from '../core/spending';
import { PeriodTotals } from '../core/spending-period';

/**
 * O resumo da vista de vários meses: o saldo do período (negativo em vermelho, com o duplo sublinhado do
 * fim de conta, como o do mês), quanto entrou e saiu, e à mão o que dá para comparar: a média que saiu por
 * mês, o mês que mais e o que menos saiu, e o período contra os mesmos meses logo antes dele.
 */
@Component({
  selector: 'app-spending-period-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = totals();
    <h2 class="sr-only">Resumo de {{ label() }}</h2>
    <p class="saldo">
      <span class="saldo-nome">Saldo de {{ label() }}</span>
      <span class="numero" [class.negativo]="t.balance < 0">{{ brl(t.balance) }}</span>
    </p>
    <p class="contas">
      <span>Entrou <b class="entrou">{{ brl(t.income) }}</b></span>
      <span>Saiu <b>{{ brl(t.spent) }}</b></span>
    </p>
    @if (t.active) {
      <p class="nota">
        Saiu em média <b>{{ brl(t.avgSpent) }}</b> por mês{{ t.active < months() ? ' (nos ' + t.active + ' meses com lançamento)' : '' }}.
      </p>
    }
    @if (extremes(); as x) {
      <p class="nota">{{ x }}</p>
    }
    @if (versus(); as v) {
      <p class="nota">{{ v.text }}</p>
    }
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 14px 16px 14px;
    }
    .saldo {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 2px 10px;
      margin: 0;
    }
    .saldo-nome {
      @include gk.peca-titulo;
      flex-basis: 100%;
    }
    .numero {
      font-family: var(--f-label);
      font-weight: 800;
      font-style: italic;
      font-size: 2.3rem;
      letter-spacing: -0.02em;
      line-height: 1.05;

      &.negativo {
        color: var(--red-deep);
        text-decoration: underline double 2px;
        text-underline-offset: 6px;
      }
    }
    .contas {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 16px;
      margin: 8px 0 0;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: var(--ink-2);

      b {
        @include gk.valor;
        margin-left: 3px;
        font-size: 1.02rem;
        letter-spacing: 0;
        color: var(--ink);
      }
      .entrou {
        color: var(--tinta-entrada);
      }
    }
    .nota {
      margin: 8px 0 0;
      font-family: var(--f-hand);
      font-size: 1.02rem;
      line-height: 1.3;

      b {
        font-family: var(--f-label);
        font-weight: 700;
        font-variant-numeric: tabular-nums;
      }
    }
  `,
})
export class SpendingPeriodSummary {
  readonly totals = input.required<PeriodTotals>();
  /** Os mesmos meses logo antes do período (null sem lançamento lá). */
  readonly previous = input<PeriodTotals | null>(null);
  /** "mai a out de 2026". */
  readonly label = input.required<string>();
  /** Quantos meses o período tem. */
  readonly months = input.required<number>();

  protected readonly brl = brl;

  protected readonly extremes = computed(() => {
    const { most, least } = this.totals();
    if (!most || !least) return null;
    const name = (m: string) => monthLabel(m).split(' de ')[0];
    return `O mês que mais saiu foi ${name(most.month)} (${brlShort(most.spent)}); o que menos, ${name(least.month)} (${brlShort(least.spent)}).`;
  });

  /** O período contra os mesmos meses logo antes: quanto saiu a mais ou a menos. */
  protected readonly versus = computed(() => {
    const prev = this.previous();
    const now = this.totals();
    const n = this.months();
    // poucos meses com lançamento lá (o começo do livro): a comparação mentiria
    if (!prev?.avgSpent || !now.avgSpent || prev.active < Math.ceil(n / 2)) return null;
    const d = now.avgSpent / prev.avgSpent - 1;
    if (Math.abs(d) < 0.01) return { text: `Por mês, saiu o mesmo que nos ${n} meses antes (${brlShort(prev.avgSpent)}).` };
    return {
      text: `Por mês, saiu ${Math.round(Math.abs(d) * 100)}% ${d > 0 ? 'mais' : 'menos'} que nos ${n} meses antes (média de ${brlShort(prev.avgSpent)}).`,
    };
  });
}
