import { ChangeDetectionStrategy, Component, computed, inject, input, output, signal } from '@angular/core';
import { brl, brlShort, monthLabel, monthShort } from '../core/spending';
import { PeriodMonth } from '../core/spending-period';
import { SpendingStore } from '../core/spending-store';

/** Uma coluna, já medida (alturas em % do papel). */
interface Column {
  month: string;
  short: string;
  label: string;
  spent: number;
  income: number;
  balance: number;
  /** A coluna inteira (o que saiu). */
  height: number;
  /** O pedaço de baixo: os fixos e as parcelas, ou a categoria escolhida. */
  base: number;
  /** Onde chegou o que entrou (null sem entrada). */
  tick: number | null;
  /** O valor escrito em cima da coluna (só nas que cabem e nas que importam). */
  showValue: boolean;
  /** Nenhum lançamento no mês. */
  empty: boolean;
  /** Onde a dica fica: começando na coluna (à esquerda), no meio, ou terminando nela (à direita). */
  anchor: 'inicio' | 'meio' | 'fim';
}

/**
 * O mês a mês da vista de vários meses: uma coluna de papel kraft por mês, do tamanho do que saiu, todas
 * na mesma escala, no papel quadriculado. Embaixo de cada coluna, o mais escuro é o que já estava marcado
 * (fixos e parcelas); com uma categoria escolhida, é a parte dela, na cartolina dela. Um risco de caneta
 * vermelha onde chegou o que entrou no mês (a coluna que passa do risco gastou mais do que recebeu) e um
 * fio da média de todos os meses. Embaixo, o mês e o saldo dele. Passar o mouse (ou o foco) mostra os
 * números; tocar abre o mês.
 */
@Component({
  selector: 'app-spending-columns',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <h2 class="titulo">Mês a mês</h2>
      <p class="legenda" aria-hidden="true">
        @if (focusName(); as f) {
          <span><span class="amostra" [style.background]="focusColor()"></span>{{ f }}</span>
          <span><span class="amostra kraft"></span>o resto</span>
        } @else {
          <span><span class="amostra marcado"></span>fixos e parcelas</span>
          <span><span class="amostra kraft"></span>uma vez</span>
        }
        <span><span class="amostra entrou"></span>o que entrou</span>
        @if (avg(); as a) {
          <span><span class="amostra media-amostra"></span>média {{ brlShort(a.value) }}</span>
        }
      </p>
    </header>

    <div class="papel" [style.--n]="columns().length" (pointerleave)="hovered.set(null)">
      @if (avg(); as a) {
        <span class="media" [style.bottom.%]="a.at" aria-hidden="true"></span>
      }
      @for (c of columns(); track c.month; let i = $index) {
        <button
          type="button"
          class="coluna"
          [class.aberta]="c.month === month()"
          [attr.aria-label]="c.label"
          (pointerenter)="hovered.set(i)"
          (focus)="hovered.set(i)"
          (blur)="hovered.set(null)"
          (click)="go.emit(c.month)"
        >
          <span class="barra" [style.height.%]="c.height" aria-hidden="true">
            @if (c.showValue && c.spent) {
              <span class="valor">{{ brlShort(c.spent) }}</span>
            }
            <span class="base" [style.height.%]="c.base" [style.background-color]="focusColor()" [class.marcado]="!focus()" [class.vazia]="!c.base"></span>
          </span>
          @if (c.tick !== null) {
            <span class="risco" [style.bottom.%]="c.tick" aria-hidden="true"></span>
          }
        </button>
      }
      @if (hovered() !== null) {
        @let c = columns()[hovered()!];
        <span class="dica" [attr.data-ancora]="c.anchor" [style.left.%]="((c.anchor === 'inicio' ? hovered()! : c.anchor === 'fim' ? hovered()! + 1 : hovered()! + 0.5) / columns().length) * 100">
          <b>{{ c.short }}</b> saiu {{ brl(c.spent) }} · entrou {{ brl(c.income) }} · saldo {{ brl(c.balance) }}
        </span>
      }
    </div>
    <div class="pe" [style.--n]="columns().length" [class.muitos]="columns().length > 6" aria-hidden="true">
      @for (c of columns(); track c.month) {
        <span class="mes" [class.aberta]="c.month === month()">
          {{ c.short }}
          <small [class.negativo]="c.balance < 0" [class.positivo]="c.balance > 0">{{ c.empty ? '—' : (c.balance > 0 ? '+' : '') + brlShort(c.balance) }}</small>
        </span>
      }
    </div>
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 16px 12px;
      container: colunas / inline-size;
    }
    .cabeca {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px 14px;
      margin-bottom: 26px;
    }
    .titulo {
      @include gk.peca-titulo;
    }
    .legenda {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 12px;
      margin: 0;
      @include gk.eixo-nome;

      > span {
        display: inline-flex;
        align-items: center;
        gap: 5px;
      }
    }
    .amostra {
      width: 10px;
      height: 10px;
      border-radius: 2px;
      background: #c9a878;

      &.marcado {
        background: #8a6a2f;
      }
      &.entrou,
      &.media-amostra {
        width: 12px;
        height: 0;
        border-top: 2px solid var(--red-deep);
        border-radius: 0;
        background: none;
      }
      &.media-amostra {
        border-top: 1px solid rgb(21 21 21 / 0.6);
      }
    }

    /* o papel quadriculado, com uma coluna por mês */
    .papel {
      @include gk.papel-grafico;
      position: relative;
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      height: 190px;
      padding: 0 4px;
    }
    @container colunas (max-width: 420px) {
      .papel {
        height: 150px;
      }
    }
    .coluna {
      position: relative;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      min-width: 0;
      height: 100%;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;

      &:hover,
      &:focus-visible {
        background: rgb(21 21 21 / 0.05);
      }
      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: -2px;
      }
      &.aberta {
        background: rgb(255 218 66 / 0.32);
      }
    }
    /* a coluna de kraft, presa no pé do papel; o pedaço de baixo, o marcado (ou a categoria) */
    .barra {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      width: min(64%, 46px);
      min-height: 1px;
      border-radius: 4px 4px 0 0;
      background-color: #c9a878;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.25);
    }
    .base {
      width: 100%;
      border-top: 2px solid #fbfcf6;
      border-radius: 0;

      &.marcado {
        background-color: #8a6a2f;
      }
      &.vazia {
        border-top: 0;
      }
    }
    .valor {
      position: absolute;
      bottom: calc(100% + 3px);
      left: 50%;
      translate: -50% 0;
      @include gk.valor;
      padding: 0 2px;
      border-radius: 2px;
      background: rgb(251 252 246 / 0.88);
      font-size: 0.74rem;
      color: var(--ink);
    }
    /* o que entrou: um risco de caneta vermelha atravessando a coluna */
    .risco {
      position: absolute;
      left: 14%;
      right: 14%;
      height: 0;
      border-top: 2px solid var(--red-deep);
      pointer-events: none;
    }
    /* a média de todos os meses: um fio de lápis de ponta a ponta, com o valor na ponta */
    .media {
      position: absolute;
      left: 0;
      right: 0;
      height: 0;
      border-top: 1px solid rgb(21 21 21 / 0.45);
      pointer-events: none;
    }
    /* a dica fica dentro do papel, no alto (não cobre a legenda) */
    .dica {
      @include gk.dica;
      top: 6px;
      max-width: 100%;
      white-space: normal;
      translate: -50% 0;

      &[data-ancora='inicio'] {
        translate: 0 0;
      }
      &[data-ancora='fim'] {
        translate: -100% 0;
      }
    }

    /* embaixo: o mês e o saldo dele */
    .pe {
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      margin-top: 4px;
      padding: 0 4px;
    }
    .mes {
      display: grid;
      justify-items: center;
      gap: 1px;
      min-width: 0;
      @include gk.eixo-nome;

      &.aberta {
        color: var(--ink);
      }
      small {
        @include gk.valor;
        font-size: 0.68rem;
        letter-spacing: 0;
        text-transform: none;
        color: var(--ink-2);
        overflow: hidden;
        max-width: 100%;
        text-overflow: clip;
      }
      .positivo {
        color: var(--tinta-entrada);
      }
      .negativo {
        color: var(--red-deep);
      }
    }
    /* doze meses no celular: o saldo só na dica */
    @container colunas (max-width: 520px) {
      .pe.muitos small {
        display: none;
      }
    }
  `,
})
export class SpendingColumns {
  private readonly store = inject(SpendingStore);

  readonly months = input.required<PeriodMonth[]>();
  /** O mês aberto (o último do período). */
  readonly month = input.required<string>();
  /** A categoria escolhida: a parte dela embaixo de cada coluna. */
  readonly focus = input<string | null>(null);
  readonly go = output<string>();

  protected readonly brl = brl;
  protected readonly brlShort = brlShort;
  protected readonly hovered = signal<number | null>(null);

  protected readonly focusName = computed(() => {
    const f = this.focus();
    return f ? (this.store.category(f)?.name ?? 'Sem categoria') : null;
  });
  protected readonly focusColor = computed(() => {
    const f = this.focus();
    return f ? `var(--stock-${this.store.category(f)?.color ?? 'cinza'})` : null;
  });

  private readonly max = computed(() => Math.max(1, ...this.months().map((m) => Math.max(m.spent, m.income))));

  protected readonly columns = computed<Column[]>(() => {
    const ms = this.months();
    const max = this.max();
    const year = Number(this.month().slice(0, 4));
    const f = this.focus();
    const most = ms.reduce((a, m) => (m.spent > a ? m.spent : a), 0);
    // poucos meses: todos com o valor; doze: só o maior e o aberto
    const all = ms.length <= 6;
    return ms.map((m, i) => {
      const part = f ? (m.byCategory.find((c) => c.id === f)?.amount ?? 0) : m.planned;
      return {
        month: m.month,
        // doze meses: o mês sem o ano (o nome do período já diz os anos)
        short: ms.length > 6 ? monthShort(m.month) : monthShort(m.month, year),
        label: `${monthLabel(m.month)}: saiu ${brl(m.spent)}, entrou ${brl(m.income)}, saldo ${brl(m.balance)}. Abrir o mês`,
        spent: m.spent,
        income: m.income,
        balance: m.balance,
        height: (m.spent / max) * 86,
        base: m.spent ? Math.min(100, (part / m.spent) * 100) : 0,
        tick: m.income ? (m.income / max) * 86 : null,
        showValue: all || m.spent === most || m.month === this.month(),
        empty: !m.rows.length,
        anchor: i < ms.length / 3 ? 'inicio' : i >= (ms.length * 2) / 3 ? 'fim' : 'meio',
      };
    });
  });

  /** A média do que saiu nos meses com lançamento, e onde ela fica no papel. */
  protected readonly avg = computed(() => {
    const active = this.months().filter((m) => m.rows.length);
    if (active.length < 2) return null;
    const value = Math.round(active.reduce((s, m) => s + m.spent, 0) / active.length);
    return { value, at: (value / this.max()) * 86 };
  });
}
