import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import { brl, monthLabel, monthShort } from '../core/spending';
import { PeriodSpend, kindOf } from '../core/spending-period';
import { SpendingStore } from '../core/spending-store';

/** Quantos aparecem antes do "Ver todos". */
const SHOWN = 10;

/**
 * Os maiores gastos do período: a fita curta da vista de vários meses. Cada lançamento uma vez só, com
 * tudo o que saiu dele nos meses (as parcelas e os meses de um fixo somados), o maior em cima. Os dez
 * maiores; "Ver todos" mostra o resto. Tocar num abre o último mês em que ele aparece.
 */
@Component({
  selector: 'app-spending-top',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h2 class="titulo" id="gt-titulo">
        Maiores gastos
        @if (focusName(); as f) {
          <span class="foco">em {{ f }}</span>
        }
        <span class="n">{{ spends().length }}</span>
      </h2>
    </header>
    @if (lines().length) {
      <ol class="linhas" aria-labelledby="gt-titulo">
        @for (l of lines(); track l.s.entry.id; let i = $index) {
          <li>
            <button type="button" class="linha" [attr.aria-label]="l.label" (click)="go.emit(l.s.last)">
              <span class="pos" aria-hidden="true">{{ i + 1 }}</span>
              <span class="selo" [style.--cor]="l.color" aria-hidden="true"></span>
              <span class="nome" aria-hidden="true">{{ l.s.entry.title }}</span>
              <span class="marcas" aria-hidden="true">
                @if (l.kind === 'parcela') {
                  <span class="canhoto">{{ l.s.months }} de {{ l.s.entry.installments }}</span>
                } @else if (l.kind === 'fixo') {
                  <lucide-icon class="fixo" [img]="RepeatIcon" [size]="13" />
                  <span class="meses">{{ l.s.months }} {{ l.s.months === 1 ? 'mês' : 'meses' }}</span>
                } @else {
                  <span class="meses">{{ l.when }}</span>
                }
              </span>
              <span class="cat" aria-hidden="true">{{ l.category }}</span>
              <span class="valor" aria-hidden="true">{{ brl(l.s.total) }}</span>
            </button>
          </li>
        }
      </ol>
      @if (spends().length > shownCount) {
        <button type="button" class="mais" (click)="all.set(!all())">{{ all() ? 'Só os ' + shownCount + ' maiores' : 'Ver todos (' + spends().length + ')' }}</button>
      }
    } @else {
      <p class="vazio">Nada saiu {{ focusName() ? 'nesta categoria ' : '' }}nesses meses.</p>
    }
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 16px 10px;
      container: maiores / inline-size;
    }
    .titulo {
      @include gk.peca-titulo;
      margin-bottom: 6px;
    }
    .foco {
      color: var(--ink);
    }
    .n {
      font-weight: 600;
      opacity: 0.75;
    }
    .linhas {
      margin: 0;
      padding: 0;
      list-style: none;
    }
    li + li .linha {
      border-top: 1.5px dashed rgb(21 21 21 / 0.14);
      border-radius: 0;
    }
    .linha {
      @include gk.linha-escolha;
      display: grid;
      grid-template-columns: 1.6em auto minmax(0, max-content) minmax(0, 1fr) auto auto;
      align-items: center;
      gap: 0 9px;
      min-height: 38px;
    }
    .pos {
      @include gk.valor;
      font-size: 0.8rem;
      text-align: right;
      color: var(--ink-2);
    }
    .selo {
      @include gk.selo(10px);
    }
    .nome {
      overflow: hidden;
      text-overflow: ellipsis;
      white-space: nowrap;
      font-weight: 500;
      font-size: 0.96rem;
    }
    .marcas {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      overflow: hidden;
      @include gk.eixo-nome;
    }
    .canhoto {
      padding: 1px 5px 0;
      border-radius: 2px;
      background: #f3e6b8;
      box-shadow: inset 0 0 0 1px rgb(138 106 47 / 0.4);
      color: var(--ink);
      white-space: nowrap;
    }
    .fixo {
      display: inline-flex;
      color: var(--ink);
    }
    .meses {
      white-space: nowrap;
    }
    .cat {
      @include gk.eixo-nome;
      font-size: 0.74rem;
      color: rgb(21 21 21 / 0.62);
    }
    .valor {
      @include gk.valor;
      font-size: 1rem;
      text-align: right;
    }
    @container maiores (max-width: 460px) {
      .linha {
        grid-template-columns: 1.6em auto minmax(0, 1fr) auto;
        row-gap: 1px;
        padding-block: 4px;
      }
      .nome {
        grid-column: 3;
      }
      .valor {
        grid-column: 4;
        grid-row: 1;
      }
      .marcas {
        grid-column: 3;
        grid-row: 2;
      }
      .cat {
        display: none;
      }
    }
    .mais {
      @include gk.tinta-pequena;
      margin-top: 4px;
    }
    .vazio {
      margin: 6px 0 4px;
      font-family: var(--f-hand);
      font-size: 1rem;
      color: var(--ink-2);
    }
  `,
})
export class SpendingTop {
  private readonly store = inject(SpendingStore);

  readonly spends = input.required<PeriodSpend[]>();
  /** A categoria escolhida (a lista já vem só com ela). */
  readonly focus = input<string | null>(null);
  readonly go = output<string>();

  protected readonly RepeatIcon = ICON.repetir;
  protected readonly brl = brl;
  protected readonly shownCount = SHOWN;
  protected readonly all = signal(false);

  protected readonly focusName = computed(() => {
    const f = this.focus();
    return f ? (this.store.category(f)?.name ?? 'Sem categoria') : null;
  });

  protected readonly lines = computed(() => {
    const list = this.all() ? this.spends() : this.spends().slice(0, SHOWN);
    return list.map((s) => {
      const c = this.store.category(s.entry.category);
      const kind = kindOf(s.entry);
      const when = monthShort(s.last);
      const name = c?.name ?? 'Sem categoria';
      const extra = kind === 'parcela' ? `${s.months} parcelas de ${s.entry.installments} no período` : kind === 'fixo' ? `todo mês, ${s.months} meses no período` : `em ${monthLabel(s.last)}`;
      return { s, kind, when, color: `var(--stock-${c?.color ?? 'cinza'})`, category: name, label: `${s.entry.title}, ${brl(s.total)}, ${name}, ${extra}. Abrir ${monthLabel(s.last)}` };
    });
  });
}
