import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { brl, brlShort } from '../core/spending';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** Um dia do mês, já medido. */
interface Day {
  n: number;
  weekday: string;
  /** O que saiu no dia, tudo. */
  amount: number;
  /** Disso, o que era fixo ou parcela (marcado antes do mês). */
  planned: number;
  /** O que foi de uma vez. */
  once: number;
  /** A altura da coluna e a do pedaço de baixo (o marcado), em % do papel. */
  height: number;
  base: number;
  /** Passou do alto do papel (a conta grande do mês): a coluna é cortada e leva o valor. */
  over: boolean;
  weekend: boolean;
  /** Depois de hoje (no mês de hoje): ainda não aconteceu. */
  ahead: boolean;
}

/** A coluna mais alta ocupa isto do papel (o resto é ar para o valor escrito). */
const TOP = 82;

/**
 * Dia a dia: o que saiu em cada dia do mês, uma coluna fina por dia no papel quadriculado, os fins de
 * semana numa faixa mais escura do papel. Embaixo de cada coluna, em kraft escuro, o que era fixo ou
 * parcela (como no mês a mês); em cima, de tinta, o que foi de uma vez. A escala é a dos gastos de uma vez:
 * a conta grande (o aluguel) que passa do papel é cortada com o valor escrito, para não achatar o resto.
 * A média por dia e a conta do fim de semana olham só os gastos de uma vez. Passar o mouse mostra o dia.
 * No mês de hoje, os dias que ainda não chegaram ficam apagados.
 */
@Component({
  selector: 'app-spending-days',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <header class="cabeca">
      <div class="titulo-linha">
        <h2 class="titulo">Dia a dia</h2>
        <span class="legenda" aria-hidden="true">
          <span><span class="amostra marcado"></span>fixos e parcelas</span>
          <span><span class="amostra uma"></span>uma vez</span>
          @if (avg(); as a) {
            <span><span class="amostra media-amostra"></span>média de uma vez {{ brlShort(a.value) }}/dia</span>
          }
        </span>
      </div>
      @if (note(); as n) {
        <p class="conta">{{ n }}</p>
      }
    </header>
    <div class="papel" role="img" [attr.aria-label]="label()" [style.--n]="days().length" (pointerleave)="hovered.set(null)">
      @if (avg(); as a) {
        <span class="media" [style.bottom.%]="a.at" aria-hidden="true"></span>
      }
      @for (d of days(); track d.n; let i = $index) {
        <span class="dia" [class.fim]="d.weekend" [class.adiante]="d.ahead" (pointerenter)="hovered.set(i)" aria-hidden="true">
          <span class="barra" [class.cortada]="d.over" [style.height.%]="d.height">
            <span class="base" [style.height.%]="d.base"></span>
          </span>
          @if ((d.over || d.n === top()?.n) && d.amount) {
            <span class="valor" [class.dentro]="d.over" [style.bottom.%]="d.over ? 70 : d.height">{{ brlShort(d.amount) }}</span>
          }
        </span>
      }
      @if (hovered() !== null) {
        @let d = days()[hovered()!];
        @let at = hovered()! / days().length;
        <span
          class="dica"
          [attr.data-ancora]="at < 0.34 ? 'inicio' : at > 0.66 ? 'fim' : 'meio'"
          [style.left.%]="((at < 0.34 ? hovered()! : at > 0.66 ? hovered()! + 1 : hovered()! + 0.5) / days().length) * 100"
          aria-hidden="true"
        >
          <b>{{ d.weekday }} {{ d.n }}</b> {{ d.amount ? brl(d.amount) : 'nada' }}{{ d.planned && d.once ? ' (' + brl(d.planned) + ' fixos e parcelas)' : d.planned ? ' de fixos e parcelas' : '' }}
        </span>
      }
    </div>
    <!-- o eixo na mesma grade das colunas: cada número embaixo do dia dele -->
    <div class="eixo" [style.--n]="days().length" aria-hidden="true">
      @for (n of ticks(); track n) {
        <span [style.grid-column]="n">{{ n }}</span>
      }
    </div>
  `,
  styles: `
    @use 'spending-kit' as gk;

    :host {
      @include gk.peca;
      display: block;
      padding: 12px 16px 10px;
    }
    .cabeca {
      margin-bottom: 22px;
    }
    .titulo-linha {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      justify-content: space-between;
      gap: 4px 14px;
    }
    .titulo {
      @include gk.peca-titulo;
    }
    .legenda {
      display: flex;
      flex-wrap: wrap;
      gap: 2px 12px;
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

      &.marcado {
        background: #8a6a2f;
      }
      &.uma {
        background: var(--ink);
      }
      &.media-amostra {
        width: 12px;
        height: 0;
        border-top: 1px solid var(--red-deep);
        border-radius: 0;
      }
    }
    .conta {
      margin: 6px 0 0;
      font-family: var(--f-hand);
      font-size: 1.02rem;
      line-height: 1.3;
    }
    .papel {
      @include gk.papel-grafico;
      position: relative;
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      height: 120px;
      padding: 0 2px;
    }
    .dia {
      position: relative;
      display: flex;
      align-items: flex-end;
      justify-content: center;
      height: 100%;

      /* o fim de semana: a faixa do papel um pouco mais escura */
      &.fim {
        background: rgb(46 125 90 / 0.08);
      }
      &.adiante .barra {
        opacity: 0.25;
      }
      &:hover {
        background: rgb(21 21 21 / 0.06);
      }
    }
    /* a coluna: de tinta (o de uma vez), com o marcado em kraft escuro embaixo */
    .barra {
      position: relative;
      display: flex;
      flex-direction: column;
      justify-content: flex-end;
      width: min(70%, 12px);
      border-radius: 2px 2px 0 0;
      background: var(--ink);
      overflow: hidden;

      /* passou do papel: o alto em dentes, como uma tira cortada */
      &.cortada {
        border-radius: 0;
        clip-path: polygon(0 4px, 25% 0, 50% 4px, 75% 0, 100% 4px, 100% 100%, 0 100%);
      }
    }
    .base {
      width: 100%;
      background: #8a6a2f;
    }
    .valor {
      position: absolute;
      left: 50%;
      translate: -50% -3px;
      padding: 0 2px;
      border-radius: 2px;
      background: rgb(251 252 246 / 0.88);
      @include gk.valor;
      font-size: 0.72rem;
      white-space: nowrap;
      pointer-events: none;

      /* a coluna cortada leva o valor escrito em cima dela, num papelzinho */
      &.dentro {
        box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
      }
    }
    .media {
      position: absolute;
      left: 0;
      right: 0;
      height: 0;
      border-top: 1px solid var(--red-deep);
      pointer-events: none;
    }
    /* a dica fica dentro do papel, no alto, presa à beira do lado em que o dia está */
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
    .eixo {
      display: grid;
      grid-template-columns: repeat(var(--n), minmax(0, 1fr));
      margin-top: 4px;
      padding: 0 2px;
      @include gk.eixo-nome;

      span {
        grid-row: 1;
        text-align: center;
      }
    }
  `,
})
export class SpendingDays {
  /** O que saiu em cada dia (índice 0 = dia 1), ver `spentByDay`. */
  readonly amounts = input.required<number[]>();
  /** Disso, o que era fixo ou parcela em cada dia (o mesmo tamanho). */
  readonly planned = input<number[]>([]);
  readonly month = input.required<string>();
  /** Hoje, quando o mês aberto é o de hoje (os dias depois dele ficam apagados). */
  readonly today = input<string | null>(null);

  protected readonly brl = brl;
  protected readonly brlShort = brlShort;
  protected readonly hovered = signal<number | null>(null);

  /** O alto do papel: o maior gasto de uma vez (com folga), ou o maior dia quando só há fixos e parcelas. */
  private readonly scale = computed(() => {
    const planned = this.planned();
    const once = this.amounts().map((a, i) => Math.max(0, a - (planned[i] ?? 0)));
    const maxOnce = Math.max(0, ...once);
    return maxOnce ? maxOnce * 1.25 : Math.max(1, ...this.amounts());
  });

  protected readonly days = computed<Day[]>(() => {
    const [y, m] = this.month().split('-').map(Number);
    const today = this.today();
    const todayN = today?.startsWith(this.month()) ? Number(today.slice(8, 10)) : 99;
    const scale = this.scale();
    return this.amounts().map((amount, i) => {
      const planned = Math.min(amount, this.planned()[i] ?? 0);
      const wd = new Date(Date.UTC(y, m - 1, i + 1)).getUTCDay();
      const over = amount > scale;
      return {
        n: i + 1,
        weekday: WEEKDAYS[wd],
        amount,
        planned,
        once: amount - planned,
        height: over ? 100 : (amount / scale) * TOP,
        base: amount ? (planned / amount) * 100 : 0,
        over,
        weekend: wd === 0 || wd === 6,
        ahead: i + 1 > todayN,
      };
    });
  });

  /** O dia que mais saiu de uma vez (leva o valor escrito). */
  protected readonly top = computed(() => this.days().reduce<Day | null>((a, d) => (!a || d.once > a.once ? d : a), null));

  protected readonly ticks = computed(() => [1, 10, 20, this.days().length]);

  /** A média de uma vez por dia, nos dias que já passaram (no mês de hoje) ou em todos. */
  protected readonly avg = computed(() => {
    const passed = this.days().filter((d) => !d.ahead);
    const total = passed.reduce((s, d) => s + d.once, 0);
    if (!passed.length || !total) return null;
    const value = Math.round(total / passed.length);
    return { value, at: (value / this.scale()) * TOP };
  });

  /** À mão: o fim de semana contra os dias de semana, só no que foi de uma vez. */
  protected readonly note = computed(() => {
    const passed = this.days().filter((d) => !d.ahead);
    const end = passed.filter((d) => d.weekend);
    const week = passed.filter((d) => !d.weekend);
    const sum = (l: Day[]) => l.reduce((s, d) => s + d.once, 0);
    if (!end.length || !week.length || !sum(passed)) return null;
    const perEnd = sum(end) / end.length;
    const perWeek = sum(week) / week.length;
    return `Sem os fixos e as parcelas, num dia de fim de semana saiu em média ${brlShort(perEnd)}; num dia de semana, ${brlShort(perWeek)}.`;
  });

  protected readonly label = computed(() => {
    const t = this.top();
    const a = this.avg();
    return `O que saiu em cada dia do mês.${t?.once ? ` O dia que mais saiu de uma vez foi ${t.n}, ${brl(t.once)}.` : ''}${a ? ` Média de ${brl(a.value)} por dia, sem os fixos e as parcelas.` : ''}`;
  });
}
