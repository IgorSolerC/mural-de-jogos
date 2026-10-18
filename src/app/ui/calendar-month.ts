import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, output } from '@angular/core';
import { MONTHS_LONG } from '../core/dates';
import { Reminder, WEEKDAYS_LONG, WEEKDAYS_SHORT, addDays, addMonths, isDone, monthGrid, monthLabel, monthOf, remindersByDay, weekday } from '../core/calendar';

/** Um dia da folha, já com o que ele mostra. */
interface Cell {
  day: string;
  n: number;
  /** De outro mês (as pontas da folha). */
  out: boolean;
  sunday: boolean;
  today: boolean;
  /** As bolinhas: a cor de cada lembrete (os primeiros) e se ele já foi feito. */
  dots: { color: string; done: boolean }[];
  /** Quantos não couberam em bolinhas. */
  more: number;
  label: string;
  /** Os nomes, para a dica do mouse. */
  names: string;
}

/**
 * A folha de um mês (a "folhinha"): os dias de domingo a sábado, os domingos impressos em vermelho, o
 * dia de hoje circulado a caneta e, embaixo do número, uma bolinha adesiva na cor de cada lembrete do
 * dia (as de papelaria, de marcar), apagada quando ele já foi feito. Tocar num dia o escolhe
 * (`picked`); as setas andam pelos dias (e mudam de mês nas pontas), PageUp e PageDown pulam um mês,
 * Home e End vão ao começo e ao fim da semana (`moved`; quem usa troca o dia).
 *
 * Grande, é a vista do mês; pequena (`mini`), é o calendário ao lado do dia aberto, com o dia
 * escolhido marcado a marca-texto.
 */
@Component({
  selector: 'app-calendar-month',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.mini]': 'mini()' },
  template: `
    <table class="grade" (keydown)="onKey($event)">
      <caption class="sr-only">{{ caption() }}</caption>
      <thead>
        <tr>
          @for (w of weekdays; track $index) {
            <th scope="col" [class.domingo]="$index === 0" [attr.abbr]="weekdaysLong[$index]">{{ mini() ? w.charAt(0) : w }}</th>
          }
        </tr>
      </thead>
      <tbody>
        @for (week of cells(); track week[0].day) {
          <tr>
            @for (c of week; track c.day) {
              <td [class.fora]="c.out">
                <button
                  type="button"
                  class="dia"
                  [attr.data-dia]="c.day"
                  [class.domingo]="c.sunday"
                  [class.hoje]="c.today"
                  [class.escolhido]="mini() && c.day === day()"
                  [class.tem]="c.dots.length > 0"
                  [attr.tabindex]="c.day === cursor() ? 0 : -1"
                  [attr.aria-label]="c.label"
                  [attr.aria-current]="c.today ? 'date' : null"
                  [attr.aria-pressed]="mini() ? c.day === day() : null"
                  [title]="c.names"
                  (click)="picked.emit(c.day)"
                >
                  <span class="num" aria-hidden="true">{{ c.n }}</span>
                  @if (c.dots.length) {
                    <span class="pontos" aria-hidden="true">
                      @for (p of c.dots; track $index) {
                        <span class="ponto" [class.feito]="p.done" [style.--stock]="'var(--stock-' + p.color + ')'"></span>
                      }
                      @if (c.more) {
                        <span class="mais">+{{ c.more }}</span>
                      }
                    </span>
                  }
                </button>
              </td>
            }
          </tr>
        }
      </tbody>
    </table>
  `,
  styles: `
    :host {
      display: block;
      --linha: rgb(21 21 21 / 0.16);
      --domingo: var(--red-deep);
    }

    .grade {
      width: 100%;
      border-collapse: collapse;
      table-layout: fixed;
    }

    /* os dias da semana, impressos pequenos no alto de cada coluna */
    th {
      padding: 0 0 8px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.82rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      text-align: left;
      padding-left: 10px;
      color: var(--ink);

      &.domingo {
        color: var(--domingo);
      }
    }

    /* as linhas da folha: riscos finos de impressão entre os dias */
    td {
      padding: 0;
      border-top: 1.5px solid var(--linha);
      vertical-align: top;

      & + td {
        border-left: 1.5px solid var(--linha);
      }
    }

    .dia {
      position: relative;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      justify-content: space-between;
      width: 100%;
      height: var(--celula, clamp(64px, 9.5vw, 112px));
      padding: 8px 8px 9px 10px;
      border: 0;
      border-radius: 2px;
      background: transparent;
      color: var(--ink);
      text-align: left;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);

      &:hover {
        background: rgb(21 21 21 / 0.055);
      }

      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: -3px;
      }
    }

    /* o número impresso; o de domingo em vermelho, como numa folhinha */
    .num {
      position: relative;
      display: grid;
      place-items: center;
      min-width: 1.9em;
      height: 1.9em;
      margin: -4px 0 0 -6px;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 1.12rem;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    .domingo .num {
      color: var(--domingo);
    }

    .fora .dia {
      .num {
        opacity: 0.62;
      }
      .pontos {
        opacity: 0.45;
      }
    }

    /* hoje: o número circulado a caneta vermelha, à mão */
    .hoje .num::after {
      content: '';
      position: absolute;
      inset: -3px -5px;
      background: var(--circulo-caneta) center / 100% 100% no-repeat;
      pointer-events: none;
    }

    /* as bolinhas adesivas: uma por lembrete, na cor dele; a de um lembrete feito, riscada a caneta */
    .pontos {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px;
      max-width: 100%;
    }

    .ponto {
      position: relative;
      flex: none;
      width: 11px;
      height: 11px;
      border-radius: 50%;
      background-color: var(--stock);
      background-image: radial-gradient(circle at 35% 30%, rgb(255 255 255 / 0.55), transparent 55%);
      box-shadow:
        inset 0 0 0 1px rgb(21 21 21 / 0.6),
        0 1px 1px rgb(0 0 0 / 0.25);

      /* feito: o risco de caneta atravessando a bolinha (a branca continua diferente da feita) */
      &.feito::after {
        content: '';
        position: absolute;
        left: -2px;
        right: -2px;
        top: calc(50% - 0.75px);
        height: 1.5px;
        border-radius: 1px;
        background: var(--ink);
        rotate: -45deg;
      }
    }

    .mais {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.76rem;
      letter-spacing: 0.02em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }

    /* ===== A pequena, ao lado do dia aberto ===== */
    :host(.mini) {
      th {
        padding: 0 0 6px;
        text-align: center;
        font-size: 0.74rem;
      }

      td,
      td + td {
        border: 0;
      }

      .dia {
        align-items: center;
        justify-content: flex-start;
        gap: 2px;
        height: 46px;
        padding: 5px 2px 4px;
      }

      .num {
        margin: 0;
        font-size: 0.98rem;
      }

      .pontos {
        justify-content: center;
        gap: 2px;
      }

      .ponto {
        width: 6px;
        height: 6px;
        box-shadow: inset 0 0 0 1px rgb(21 21 21 / 0.6);

        &.feito::after {
          left: -1px;
          right: -1px;
          height: 1px;
          top: calc(50% - 0.5px);
        }
      }

      /* o dia aberto: o traço de marca-texto atrás do número */
      .escolhido .num::before {
        content: '';
        position: absolute;
        inset: 3px -1px;
        z-index: -1;
        border-radius: 3px 8px 4px 9px;
        background: color-mix(in srgb, var(--hi) 85%, transparent);
        rotate: -2deg;
      }

      .num {
        isolation: isolate;
      }
    }

    @media (max-width: 600px) {
      th {
        padding-left: 0;
        text-align: center;
        font-size: 0.72rem;
        letter-spacing: 0.04em;
      }

      .dia {
        align-items: center;
        height: var(--celula, 58px);
        padding: 6px 2px 7px;
      }

      .num {
        margin: -2px 0 0;
        font-size: 1rem;
      }

      /* numa célula de 44px cabem três bolinhas e o +N, numa linha só */
      .pontos {
        flex-wrap: nowrap;
        justify-content: center;
        gap: 2px;
      }

      .ponto {
        width: 6px;
        height: 6px;
      }

      .mais {
        font-size: 0.68rem;
      }
    }

    @media (prefers-reduced-motion: reduce) {
      .dia {
        transition: none;
      }
    }
  `,
})
export class CalendarMonth {
  /** O dia escolhido (na grande, onde o teclado está); o mês da folha é o dele. */
  readonly day = input.required<string>();
  readonly today = input.required<string>();
  readonly reminders = input.required<readonly Reminder[]>();
  readonly mini = input(false);
  /** Tocou num dia (ou Enter nele). */
  readonly picked = output<string>();
  /** O teclado andou para outro dia. */
  readonly moved = output<string>();

  protected readonly weekdays = WEEKDAYS_SHORT;
  protected readonly weekdaysLong = WEEKDAYS_LONG;

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  /** Andou pelo teclado: o foco vai para o dia novo assim que ele aparece. */
  private follow = false;

  protected readonly month = computed(() => monthOf(this.day()));
  protected readonly caption = computed(() => monthLabel(this.month()));
  /** Onde o Tab entra na folha: o dia escolhido. */
  protected readonly cursor = computed(() => this.day());

  protected readonly cells = computed<Cell[][]>(() => {
    const weeks = monthGrid(this.month());
    const byDay = remindersByDay(this.reminders(), weeks.flat());
    const month = this.month();
    const today = this.today();
    const max = this.mini() ? 3 : 4;
    return weeks.map((week) =>
      week.map((day) => {
        const list = byDay.get(day) ?? [];
        const shown = list.length > max ? max - 1 : list.length;
        const n = Number(day.slice(8));
        const m = Number(day.slice(5, 7));
        const count = list.length === 1 ? '1 lembrete' : `${list.length} lembretes`;
        return {
          day,
          n,
          out: monthOf(day) !== month,
          sunday: weekday(day) === 0,
          today: day === today,
          dots: list.slice(0, shown).map((r) => ({ color: r.color, done: isDone(r, day) })),
          more: list.length - shown,
          label: `${WEEKDAYS_LONG[weekday(day)]}, ${n} de ${MONTHS_LONG[m - 1]}${day === today ? ', hoje' : ''}${list.length ? `, ${count}: ${list.map((r) => r.title).join(', ')}` : ''}`,
          names: list.map((r) => r.title).join('\n'),
        };
      }),
    );
  });

  constructor() {
    afterRenderEffect(() => {
      const day = this.day();
      if (!this.follow) return;
      this.follow = false;
      this.host.querySelector<HTMLElement>(`[data-dia="${day}"]`)?.focus();
    });
  }

  protected onKey(e: KeyboardEvent): void {
    const from = (e.target as HTMLElement).closest<HTMLElement>('[data-dia]')?.dataset['dia'];
    if (!from) return;
    let to: string | null = null;
    switch (e.key) {
      case 'ArrowLeft':
        to = addDays(from, -1);
        break;
      case 'ArrowRight':
        to = addDays(from, 1);
        break;
      case 'ArrowUp':
        to = addDays(from, -7);
        break;
      case 'ArrowDown':
        to = addDays(from, 7);
        break;
      case 'Home':
        to = addDays(from, -weekday(from));
        break;
      case 'End':
        to = addDays(from, 6 - weekday(from));
        break;
      case 'PageUp':
        to = addMonths(from, -1);
        break;
      case 'PageDown':
        to = addMonths(from, 1);
        break;
    }
    if (!to) return;
    e.preventDefault();
    this.follow = true;
    this.moved.emit(to);
  }
}

