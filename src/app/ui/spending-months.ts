import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { MonthStrip, brl, brlShort, monthLabel, monthShort } from '../core/spending';
import { SpendingStore } from '../core/spending-store';

/**
 * O mês a mês: os últimos meses, cada um uma faixa de papel kraft do tamanho do que saiu nele, todas na
 * mesma escala, com um risco de caneta onde chegou o que entrou (passou do risco, gastou mais do que
 * recebeu). Com um envelope escolhido, a parte dele aparece na cor dele no começo de cada faixa, para ver
 * a categoria mês a mês. Tocar num mês abre ele.
 */
@Component({
  selector: 'app-spending-months',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="titulo">
      Mês a mês
      @if (focusName(); as f) {
        <span class="foco"><span class="selo" [style.--cor]="focusColor()" aria-hidden="true"></span>{{ f }}</span>
      }
    </h2>
    <ol class="meses">
      @for (m of rows(); track m.month) {
        <li>
          <button type="button" class="mes" [class.aberto]="m.month === month()" [attr.aria-current]="m.month === month() ? 'true' : null" [attr.aria-label]="m.label" (click)="go.emit(m.month)">
            <span class="nome" aria-hidden="true">{{ m.short }}</span>
            <span class="pista" aria-hidden="true">
              <span class="faixa" [style.width.%]="m.width">
                @if (m.part) {
                  <span class="parte" [style.width.%]="m.part" [style.background-color]="focusColor()"></span>
                }
              </span>
              @if (m.income !== null) {
                <span class="risco" [style.left.%]="m.income"></span>
              }
            </span>
            <span class="valor" aria-hidden="true">{{ m.value }}</span>
          </button>
        </li>
      }
    </ol>
    <p class="legenda" aria-hidden="true">
      <span class="risco-mini"></span> o que entrou
      @if (focusName()) {
        · <span class="selo" [style.--cor]="focusColor()"></span> {{ focusName() }}
      }
    </p>
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 14px 10px;
    }
    .titulo {
      @include gk.peca-titulo;
      margin-bottom: 8px;
    }
    .foco {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      color: var(--ink);
    }
    .selo {
      @include gk.selo(10px);
    }
    .meses {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    .mes {
      display: grid;
      grid-template-columns: 44px minmax(0, 1fr) 70px;
      align-items: center;
      gap: 8px;
      width: 100%;
      min-height: 30px;
      padding: 2px 2px;
      border: 0;
      border-radius: 2px;
      background: none;
      color: var(--ink);
      font: inherit;
      cursor: pointer;

      &:hover {
        background: rgb(21 21 21 / 0.05);
      }
      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: 0;
      }
      &.aberto {
        background: rgb(255 218 66 / 0.4);

        .nome {
          color: var(--ink);
        }
      }
    }
    @media (pointer: coarse) {
      .mes {
        min-height: 44px;
      }
    }
    .nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .pista {
      position: relative;
      height: 14px;
    }
    /* a faixa de kraft, com a parte do envelope escolhido colada no começo */
    .faixa {
      position: absolute;
      inset: 0 auto 0 0;
      display: flex;
      min-width: 2px;
      border-radius: 1px;
      background-color: #c9a878;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.25);
      overflow: hidden;
    }
    .parte {
      height: 100%;
      box-shadow: 2px 0 0 #fbf9f2;
    }
    .risco {
      position: absolute;
      top: -4px;
      bottom: -4px;
      width: 2px;
      margin-left: -1px;
      border-radius: 1px;
      background: var(--red-deep);
    }
    .valor {
      @include gk.valor;
      font-size: 0.9rem;
      text-align: right;
    }
    .legenda {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      margin: 6px 0 0;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    .risco-mini {
      display: inline-block;
      width: 2px;
      height: 12px;
      background: var(--red-deep);
    }
  `,
})
export class SpendingMonths {
  private readonly store = inject(SpendingStore);

  readonly strips = input.required<MonthStrip[]>();
  readonly month = input.required<string>();
  /** O envelope escolhido: a parte dele em cada faixa. */
  readonly focus = input<string | null>(null);
  readonly go = output<string>();

  protected readonly focusName = computed(() => {
    const f = this.focus();
    return f ? (this.store.category(f)?.name ?? null) : null;
  });
  protected readonly focusColor = computed(() => `var(--stock-${this.store.category(this.focus() ?? '')?.color ?? 'cinza'})`);

  protected readonly rows = computed(() => {
    const strips = this.strips();
    const scale = Math.max(1, ...strips.map((s) => Math.max(s.spent, s.income)));
    const year = Number(this.month().slice(0, 4));
    const focus = this.focus();
    return strips.map((s) => {
      const part = focus ? (s.byCategory.find((c) => c.id === focus)?.amount ?? 0) : 0;
      const label = `${monthLabel(s.month)}: saiu ${brl(s.spent)}, entrou ${brl(s.income)}${focus ? `; ${this.focusName()} ${brl(part)}` : ''}`;
      return {
        month: s.month,
        short: monthShort(s.month, year),
        width: (s.spent / scale) * 100,
        part: s.spent ? (part / s.spent) * 100 : 0,
        income: s.income ? (s.income / scale) * 100 : null,
        value: focus ? brlShort(part) : brlShort(s.spent),
        label,
      };
    });
  });
}
