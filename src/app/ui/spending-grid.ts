import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { brl, brlShort, monthLabel, monthShort } from '../core/spending';
import { CategoryLine, PeriodMonth } from '../core/spending-period';
import { SpendingStore } from '../core/spending-store';

/** Quantas categorias aparecem antes do "+ N categorias". */
const SHOWN = 8;

/**
 * As categorias mês a mês: uma tabela de livro-caixa, uma linha por categoria de saída (a de mais gasto
 * em cima) e uma coluna por mês, com a média e o total do período na ponta. O fundo de cada casa é
 * kraft, mais forte onde a categoria gastou mais (comparando os meses dela), para ver de relance o mês
 * que fugiu do normal. Embaixo, o total de cada mês. Tocar numa categoria a escolhe: o mês a mês mostra a
 * parte dela e os maiores gastos ficam só nela.
 */
@Component({
  selector: 'app-spending-grid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <h2 class="titulo" id="gg-titulo">Categorias mês a mês <span class="moeda">em R$</span></h2>
    <div #rolagem class="rolagem" tabindex="0" aria-labelledby="gg-titulo">
      <table>
        <thead>
          <tr>
            <th scope="col" class="cat">Categoria</th>
            @for (m of heads(); track m.month) {
              <th scope="col" [class.aberta]="m.month === month()" [attr.aria-label]="m.label">{{ m.short }}</th>
            }
            <th scope="col" class="resumo">Média</th>
            <th scope="col" class="resumo">Total</th>
          </tr>
        </thead>
        <tbody>
          @for (l of shown(); track l.id) {
            <tr [class.escolhida]="focus() === l.id">
              <th scope="row" class="cat">
                <button type="button" class="nome" [attr.aria-pressed]="focus() === l.id" (click)="pick.emit(focus() === l.id ? null : l.id)">
                  <span class="selo" [style.--cor]="l.color" aria-hidden="true"></span>
                  <span class="nome-texto">{{ l.name }}</span>
                </button>
              </th>
              @for (v of l.cells; track $index) {
                <td [style.--forca]="l.max ? v / l.max : 0" [class.zero]="!v" [attr.title]="brl(v)">{{ v ? whole(v) : '—' }}</td>
              }
              <td class="resumo">{{ whole(l.avg) }}</td>
              <td class="resumo total">{{ whole(l.total) }}</td>
            </tr>
          }
        </tbody>
        <tfoot>
          <tr>
            <th scope="row" class="cat">Saiu no mês</th>
            @for (m of months(); track m.month) {
              <td [class.zero]="!m.rows.length">{{ m.rows.length ? whole(m.spent) : '—' }}</td>
            }
            <td class="resumo">{{ whole(avgSpent()) }}</td>
            <td class="resumo total">{{ whole(totalSpent()) }}</td>
          </tr>
        </tfoot>
      </table>
    </div>
    @if (rest() > 0) {
      <button type="button" class="mais" (click)="all.set(!all())">{{ all() ? 'Só as ' + shownCount + ' maiores' : '+ ' + rest() + (rest() === 1 ? ' categoria' : ' categorias') }}</button>
    }
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 16px 10px;
    }
    .titulo {
      @include gk.peca-titulo;
      margin-bottom: 8px;
    }
    .moeda {
      font-weight: 600;
      letter-spacing: 0.06em;
      opacity: 0.75;
    }
    /* a tabela rola de lado dentro da peça quando os meses não cabem (doze, no celular) */
    .rolagem {
      overflow-x: auto;
      /* a rolagem para numa casa inteira, rente à margem das categorias */
      scroll-snap-type: x mandatory;
      scroll-padding-inline-start: var(--margem, 9em);
      scrollbar-width: thin;
      scrollbar-color: rgb(21 21 21 / 0.3) transparent;

      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: 2px;
      }
    }
    table {
      width: 100%;
      border-collapse: separate;
      border-spacing: 2px;
      font-variant-numeric: tabular-nums;
    }
    th,
    td {
      padding: 0 6px;
      white-space: nowrap;
    }
    thead th {
      @include gk.eixo-nome;
      height: 24px;
      text-align: right;

      &.aberta {
        color: var(--ink);
      }
      &.cat {
        text-align: left;
      }
    }
    /* a categoria fica presa na margem enquanto os meses rolam */
    .cat {
      position: sticky;
      left: 0;
      z-index: 1;
      background-color: var(--papel-ficha);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow: 6px 0 6px -5px rgb(0 0 0 / 0.25);
      text-align: left;
    }
    td,
    thead th:not(.cat) {
      scroll-snap-align: start;
    }
    tbody th {
      padding: 0;
    }
    .nome {
      @include gk.linha-escolha;
      display: flex;
      align-items: center;
      gap: 7px;
      width: 9em;
      min-height: 30px;
      /* folga para o selinho torto, que a rolagem da tabela cortaria rente à beira */
      padding: 0 6px 0 4px;
    }
    .nome-texto {
      overflow: hidden;
      text-overflow: ellipsis;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
    }
    .selo {
      @include gk.selo(10px);
    }
    /* cada casa: o valor, num fundo kraft mais forte onde a categoria gastou mais */
    td {
      @include gk.valor;
      height: 30px;
      border-radius: 2px;
      background: rgb(168 131 80 / calc(var(--forca, 0) * 0.5));
      font-size: 0.84rem;
      text-align: right;

      &.zero {
        color: rgb(21 21 21 / 0.35);
      }
      &.resumo {
        background: none;
        color: var(--ink-2);
      }
      &.total {
        color: var(--ink);
        font-weight: 800;
      }
    }
    thead .resumo {
      color: var(--ink);
    }
    tr.escolhida .cat,
    tr.escolhida .nome {
      background-color: rgb(255 218 66 / 0.55);
    }
    tfoot {
      th,
      td {
        border-top: 1.5px solid rgb(21 21 21 / 0.4);
        border-radius: 0;
        font-weight: 800;
      }
      td {
        background: none;
      }
      th {
        @include gk.eixo-nome;
        padding-left: 4px;
      }
    }
    .mais {
      @include gk.tinta-pequena;
      margin-top: 4px;
    }
  `,
})
export class SpendingGrid {
  private readonly store = inject(SpendingStore);

  readonly months = input.required<PeriodMonth[]>();
  readonly lines = input.required<CategoryLine[]>();
  readonly month = input.required<string>();
  readonly focus = input<string | null>(null);
  readonly pick = output<string | null>();

  protected readonly brl = brl;
  protected readonly brlShort = brlShort;
  /** "1.500": o valor redondo, sem o "R$" (o título já diz). */
  protected whole(cents: number): string {
    return brlShort(cents).replace(/R\$\s/, '');
  }
  protected readonly shownCount = SHOWN;
  protected readonly all = signal(false);
  private readonly scroller = viewChild.required<ElementRef<HTMLElement>>('rolagem');

  constructor() {
    // quando os meses não cabem, a tabela abre nos mais novos (o mês aberto fica à mostra)
    afterRenderEffect(() => {
      this.months();
      const el = this.scroller().nativeElement;
      el.scrollLeft = el.scrollWidth;
    });
  }

  protected readonly heads = computed(() => {
    const year = Number(this.month().slice(0, 4));
    return this.months().map((m) => ({ month: m.month, short: monthShort(m.month, year), label: monthLabel(m.month) }));
  });

  protected readonly rows = computed(() =>
    this.lines().map((l) => {
      const c = this.store.category(l.id);
      return { ...l, name: c?.name ?? 'Sem categoria', color: `var(--stock-${c?.color ?? 'cinza'})`, max: Math.max(...l.cells) };
    }),
  );

  /** As maiores (e a escolhida, mesmo pequena). */
  protected readonly shown = computed(() => {
    const rows = this.rows();
    if (this.all() || rows.length <= SHOWN + 1) return rows;
    return rows.filter((r, i) => i < SHOWN || r.id === this.focus());
  });
  protected readonly rest = computed(() => (this.rows().length <= SHOWN + 1 ? 0 : this.rows().length - SHOWN));

  protected readonly totalSpent = computed(() => this.months().reduce((s, m) => s + m.spent, 0));
  protected readonly avgSpent = computed(() => {
    const active = this.months().filter((m) => m.rows.length).length;
    return active ? Math.round(this.totalSpent() / active) : 0;
  });
}
