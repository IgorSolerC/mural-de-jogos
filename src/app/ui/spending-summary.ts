import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { MONTHS_LONG, MONTHS_SHORT } from '../core/dates';
import { DayBalance, MonthTotals, Repeat, brl, brlShort } from '../core/spending';

/** Quantos do "Repetiu" cabem na linha. */
const REPEATS_SHOWN = 3;

/**
 * O resumo do mês: o saldo (negativo em vermelho e sublinhado duas vezes, como no fim de uma conta),
 * quanto entrou e saiu, quanto ainda dá por dia até o fim do mês (no mês de hoje, com saldo), o saldo dia
 * a dia (uma linha de caneta sobre o papel quadriculado, vermelha onde passa do zero para baixo, com o eixo
 * do mês inteiro e "hoje" onde ela para) e o que se repetiu no mês, numa linha escrita à mão.
 */
@Component({
  selector: 'app-spending-summary',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let t = totals();
    <h2 class="sr-only">Resumo do mês</h2>
    <p class="saldo">
      <span class="saldo-nome">{{ future() ? 'Saldo previsto' : 'Saldo do mês' }}</span>
      <span class="numero" [class.negativo]="t.balance < 0">{{ brl(t.balance) }}</span>
    </p>
    <p class="contas">
      <span>Entrou <b class="entrou">{{ brl(t.income) }}</b></span>
      <span>Saiu <b>{{ brl(t.spent) }}</b></span>
    </p>
    @if (advice(); as a) {
      <p class="conselho">{{ a }}</p>
    }
    @if (versus(); as v) {
      <p class="conselho">{{ v }}</p>
    }

    @if (chart(); as c) {
      <figure class="grafico" [attr.aria-label]="c.label">
        <div class="plot" (pointermove)="hover($event, c.points.length)" (pointerleave)="hovered.set(null)">
          <svg viewBox="0 0 300 80" preserveAspectRatio="none" aria-hidden="true">
            <defs>
              <clipPath [attr.id]="ids.up"><rect x="0" y="0" width="300" [attr.height]="c.zero" /></clipPath>
              <clipPath [attr.id]="ids.down"><rect x="0" [attr.y]="c.zero" width="300" [attr.height]="80 - c.zero" /></clipPath>
            </defs>
            <line class="zero" x1="0" x2="300" [attr.y1]="c.zero" [attr.y2]="c.zero" />
            <path class="area-baixo" [attr.d]="c.area" [attr.clip-path]="'url(#' + ids.down + ')'" />
            <polyline class="linha" [attr.points]="c.line" [attr.clip-path]="'url(#' + ids.up + ')'" />
            <polyline class="linha baixo" [attr.points]="c.line" [attr.clip-path]="'url(#' + ids.down + ')'" />
            @if (hovered(); as h) {
              <line class="mira" [attr.x1]="c.xs[h]" [attr.x2]="c.xs[h]" y1="0" y2="80" />
            }
          </svg>
          <!-- onde a linha para (no mês de hoje): o dia de hoje -->
          @if (c.today !== null) {
            <span class="hoje" [class.sem-nome]="c.today > 86" [style.left.%]="c.today" aria-hidden="true"></span>
          }
          <!-- o ponto mais baixo, escrito no papel (no celular não há o passar do mouse) -->
          @if (c.low; as low) {
            <span class="baixo-nota" [style.left.%]="low.x" [style.top.%]="low.y" [class.direita]="low.x > 70" [class.acima]="low.y > 55" aria-hidden="true">
              {{ brlShort(low.balance) }} dia {{ low.day }}
            </span>
          }
          @if (hovered(); as h) {
            <span class="dica" [style.left.%]="(c.xs[h] / 300) * 100" [class.direita]="c.xs[h] > 200">
              <b>{{ c.points[h].day.slice(8) }} {{ monthShort() }}</b> {{ brl(c.points[h].balance) }}
            </span>
          }
        </div>
        <figcaption class="eixo" aria-hidden="true">
          <span>1 {{ monthShort() }}</span>
          <span>saldo dia a dia</span>
          <span>{{ c.lastDay }} {{ monthShort() }}</span>
        </figcaption>
      </figure>
    }

    @if (repeatLine(); as r) {
      <p class="nota repetiu"><b>Repetiu:</b> {{ r }}</p>
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
    /* o número impresso, grande; negativo em vermelho com o duplo sublinhado do fim de conta */
    .numero {
      font-family: var(--f-label);
      font-weight: 800;
      font-style: italic;
      font-size: 2.3rem;
      letter-spacing: -0.02em;
      line-height: 1.05;
      font-variant-numeric: tabular-nums;

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

    .conselho,
    .nota {
      margin: 8px 0 0;
      font-family: var(--f-hand);
      font-size: 1.04rem;
      line-height: 1.3;
    }
    .nota {
      margin-top: 10px;
      font-size: 0.98rem;
      color: var(--ink-2);
    }
    .repetiu b {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink);
    }

    /* o gráfico no papel quadriculado */
    .grafico {
      margin: 12px 0 0;
    }
    .plot {
      position: relative;
      height: 80px;
      border-radius: 2px;
      background:
        linear-gradient(rgb(46 125 90 / 0.1) 1px, transparent 1px) 0 0 / 10px 10px,
        linear-gradient(90deg, rgb(46 125 90 / 0.1) 1px, transparent 1px) 0 0 / 10px 10px,
        #fbfcf6;
      box-shadow: inset 0 0 0 1px rgb(21 21 21 / 0.1);
      cursor: crosshair;
      touch-action: pan-y;

      svg {
        display: block;
        width: 100%;
        height: 100%;
        overflow: visible;
      }
    }
    .zero {
      stroke: rgb(21 21 21 / 0.45);
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    .linha {
      fill: none;
      stroke: var(--ink);
      stroke-width: 2;
      stroke-linejoin: round;
      vector-effect: non-scaling-stroke;

      &.baixo {
        stroke: var(--red-deep);
      }
    }
    .area-baixo {
      fill: rgb(184 29 28 / 0.12);
    }
    .mira {
      stroke: rgb(21 21 21 / 0.4);
      stroke-width: 1;
      vector-effect: non-scaling-stroke;
    }
    /* hoje: um traço de lápis de cima a baixo, com "hoje" embaixo */
    .hoje {
      position: absolute;
      top: 0;
      bottom: 0;
      width: 0;
      border-left: 1.5px solid rgb(21 21 21 / 0.35);

      /* na linha dos nomes do eixo (e sem o nome perto do fim do mês, onde o último dia já está escrito) */
      &.sem-nome::after {
        content: none;
      }
      &::after {
        content: 'hoje';
        position: absolute;
        bottom: -19px;
        left: 0;
        translate: -50% 0;
        font-family: var(--f-label);
        font-weight: 800;
        font-size: 0.66rem;
        letter-spacing: 0.08em;
        text-transform: uppercase;
        color: var(--ink);
      }
    }
    .baixo-nota {
      position: absolute;
      translate: -50% 4px;
      padding: 0 3px;
      border-radius: 2px;
      background: rgb(251 252 246 / 0.9);
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.72rem;
      color: var(--red-deep);
      white-space: nowrap;
      pointer-events: none;
      font-variant-numeric: tabular-nums;

      &.direita {
        translate: -100% 4px;
      }
      /* perto do pé do papel, a nota fica em cima do ponto */
      &.acima {
        translate: -50% calc(-100% - 5px);
      }
      &.acima.direita {
        translate: -100% calc(-100% - 5px);
      }
    }
    .dica {
      position: absolute;
      z-index: 1;
      top: -6px;
      translate: -50% -100%;
      padding: 3px 7px 2px;
      border-radius: 2px;
      background: var(--ink);
      color: var(--paper);
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.82rem;
      font-variant-numeric: tabular-nums;
      white-space: nowrap;
      pointer-events: none;

      b {
        color: var(--hi);
        margin-right: 4px;
      }
      &.direita {
        translate: -100% -100%;
      }
    }
    .eixo {
      display: flex;
      justify-content: space-between;
      margin-top: 4px;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.72rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
  `,
})
export class SpendingSummary {
  readonly totals = input.required<MonthTotals>();
  readonly days = input.required<DayBalance[]>();
  readonly month = input.required<string>();
  /** Quantos dias faltam no mês, contando hoje (0 fora do mês de hoje). */
  readonly daysLeft = input(0);
  readonly future = input(false);
  /** O que saiu mais de uma vez no mês. */
  readonly repeats = input<Repeat[]>([]);
  /** O que saiu no mês de antes (null sem lançamento lá): a linha que compara os dois. */
  readonly previous = input<number | null>(null);

  protected readonly brl = brl;
  protected readonly brlShort = brlShort;
  protected readonly hovered = signal<number | null>(null);
  private static seq = 0;
  protected readonly ids = { up: `gs-cima-${++SpendingSummary.seq}`, down: `gs-baixo-${SpendingSummary.seq}` };

  protected readonly monthShort = computed(() => MONTHS_SHORT[Number(this.month().slice(5, 7)) - 1]);
  private readonly lastDay = computed(() => new Date(Date.UTC(+this.month().slice(0, 4), +this.month().slice(5, 7), 0)).getUTCDate());

  /** No mês de hoje, com saldo: quanto ainda dá por dia até o fim do mês. */
  protected readonly advice = computed(() => {
    const t = this.totals();
    const left = this.daysLeft();
    if (!left || t.balance <= 0) return null;
    return `Dá ${brlShort(Math.floor(t.balance / left))} por dia até o fim do mês (${left} ${left === 1 ? 'dia' : 'dias'}).`;
  });

  /** Este mês contra o de antes: quanto saiu a mais ou a menos. */
  protected readonly versus = computed(() => {
    const before = this.previous();
    const now = this.totals().spent;
    if (!before || !now || this.future()) return null;
    const name = MONTHS_LONG[(Number(this.month().slice(5, 7)) + 10) % 12];
    const diff = now - before;
    if (Math.abs(diff) < 100) return `Saiu o mesmo que em ${name}.`;
    const pct = Math.round((Math.abs(diff) / before) * 100);
    return `Saiu ${brlShort(Math.abs(diff))} ${diff > 0 ? 'a mais' : 'a menos'} que em ${name} (${diff > 0 ? '+' : '−'}${pct}%)${this.daysLeft() ? ', e o mês ainda não acabou' : ''}.`;
  });

  /** "Ifood 3× (R$ 279) · Uber 2× (R$ 50)". */
  protected readonly repeatLine = computed(() => {
    const list = this.repeats();
    if (!list.length) return null;
    const shown = list.slice(0, REPEATS_SHOWN).map((r) => `${r.title} ${r.times}× (${brlShort(r.total)})`);
    return shown.join(' · ') + (list.length > REPEATS_SHOWN ? ` e mais ${list.length - REPEATS_SHOWN}` : '') + '.';
  });

  protected readonly chart = computed(() => {
    const points = this.days();
    if (points.length < 2 || points.every((p) => p.balance === 0)) return null;
    const values = points.map((p) => p.balance);
    const max = Math.max(0, ...values);
    const min = Math.min(0, ...values);
    const span = max - min || 1;
    const y = (v: number) => 6 + ((max - v) / span) * 68;
    // o eixo é o mês inteiro, mesmo no mês de hoje (a linha para em hoje)
    const last = this.lastDay();
    const xs = points.map((_, i) => (i / Math.max(1, last - 1)) * 300);
    const line = points.map((p, i) => `${xs[i].toFixed(1)},${y(p.balance).toFixed(1)}`).join(' ');
    const zero = y(0);
    const area = `M0,${zero} L${line.replace(/ /g, ' L')} L${xs[xs.length - 1].toFixed(1)},${zero} Z`;
    const lowest = points.reduce((a, b) => (b.balance < a.balance ? b : a));
    const lowIndex = points.indexOf(lowest);
    const end = points[points.length - 1];
    const stops = points.length < last;
    const label =
      `Saldo dia a dia${stops ? ` até hoje, dia ${points.length}` : ''}: termina em ${brl(end.balance)}` +
      (lowest.balance < 0 ? `, o mais baixo foi ${brl(lowest.balance)} no dia ${Number(lowest.day.slice(8))}` : '') +
      '.';
    return {
      points,
      xs,
      line,
      zero,
      area,
      label,
      lastDay: last,
      today: stops ? (xs[xs.length - 1] / 300) * 100 : null,
      low: lowest.balance < 0 ? { x: (xs[lowIndex] / 300) * 100, y: (y(lowest.balance) / 80) * 100, balance: lowest.balance, day: Number(lowest.day.slice(8)) } : null,
    };
  });

  protected hover(e: PointerEvent, n: number): void {
    const box = (e.currentTarget as HTMLElement).getBoundingClientRect();
    const i = Math.round(((e.clientX - box.left) / box.width) * (this.lastDay() - 1));
    this.hovered.set(Math.max(0, Math.min(n - 1, i)));
  }
}
