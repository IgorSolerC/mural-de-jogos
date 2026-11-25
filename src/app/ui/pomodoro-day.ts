import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PomodoroPhase, PomodoroRun, dayStart, focusMs } from '../core/pomodoro';

const HOUR = 3_600_000;

/** "9h05". */
function hourText(ms: number): string {
  const d = new Date(ms);
  return `${d.getHours()}h${String(d.getMinutes()).padStart(2, '0')}`;
}

/** "1h15", "45 min", "0 min". */
export function focusText(ms: number): string {
  const min = Math.floor(ms / 60_000);
  if (min < 60) return `${min} min`;
  return `${Math.floor(min / 60)}h${String(min % 60).padStart(2, '0')}`;
}

/** Quantas horas a régua mostra, no mínimo (um dia de estudo cabe; um estudo de 25 min não some nela). */
const MIN_SPAN = 8;

/**
 * As horas que a régua mostra: do primeiro trecho de hoje (ou de uma hora antes de agora) até duas horas depois de
 * agora, com pelo menos oito horas e sempre dentro do dia. Só a parte do dia que importa: os trechos ficam largos.
 */
export function dayWindow(runs: readonly PomodoroRun[], now: number): { from: number; to: number } {
  const midnight = dayStart(now);
  const hourOf = (ms: number) => (ms - midnight) / HOUR;
  const nowH = hourOf(now);
  const first = runs.length ? Math.max(0, hourOf(runs[0].a)) : nowH - 1;
  let from = Math.max(0, Math.floor(Math.min(first, nowH - 1)));
  let to = Math.max(from + MIN_SPAN, Math.ceil(nowH + 2));
  if (to > 24) {
    to = 24;
    from = Math.max(0, Math.min(from, to - MIN_SPAN));
  }
  return { from, to };
}

/**
 * A régua do dia do Pomodoro (PLANO-POMODORO-REWORK.md): a régua escolar das réguas de minutos (ui/_regua-escolar.scss),
 * uma hora por risco grande, com cada trecho andado hoje pintado com o marca-texto da fase (o vermelho do estudo, o
 * verde da pausa) e o "agora" no pedaço de fita-crepe, o cursor da régua de minutos. Em cima, quantos estudos e quanto
 * tempo de foco. Só desenho para o mouse; o leitor de tela ouve a lista dos trechos.
 */
@Component({
  selector: 'app-pomodoro-day',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <figure class="dia">
      <figcaption class="dia-topo">
        <span class="dia-nome">Hoje</span>
        <span class="dia-conta">{{ summary() }}</span>
      </figcaption>
      <div class="regua" aria-hidden="true">
        @for (r of painted(); track r.a) {
          <span class="trecho" [class.pausa]="r.f === 'pausa'" [style.--de]="r.de" [style.--ate]="r.ate" [title]="r.title"></span>
        }
        <span class="riscos">
          @for (t of ticks(); track t.h) {
            <i [class.grande]="t.grande"></i>
          }
        </span>
        <span class="numeros">
          @for (n of numbers(); track n.h) {
            <b [style.--at]="n.at" [class.coberto]="n.coberto">{{ n.h % 24 }}h</b>
          }
        </span>
        <span class="agora" [class.pausa]="phase() === 'pausa'" [class.parado]="!running()" [style.--at]="nowAt()"></span>
      </div>
      @if (painted().length) {
        <ol class="sr-only">
          @for (r of painted(); track r.a) {
            <li>{{ r.title }}</li>
          }
        </ol>
      }
    </figure>
  `,
  styles: `
    @use 'regua-escolar' as regua;

    :host {
      display: block;
      color: var(--wall-ink);
    }

    .dia {
      display: grid;
      gap: 10px;
      margin: 0;
    }

    .dia-topo {
      display: flex;
      align-items: baseline;
      gap: 10px;
      font-family: var(--f-label);
      font-weight: 800;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .dia-nome {
      font-size: 1rem;
    }

    .dia-conta {
      color: var(--wall-ink-2);
      font-size: 0.9rem;
    }

    .regua {
      @include regua.madeira;
    }

    /* cada trecho, o traço de marca-texto da fase, de onde começou até onde parou */
    .trecho {
      @include regua.marca;
      left: calc(12px + (100% - 24px) * var(--de));
      width: max(3px, calc((100% - 24px) * (var(--ate) - var(--de))));
      background: regua.$marca-estudo;

      &.pausa {
        background: regua.$marca-pausa;
      }
    }

    .riscos {
      @include regua.riscos;
    }

    .numeros b {
      @include regua.numero;
      transition: opacity var(--t-ui) var(--ease-ui);

      &.coberto {
        opacity: 0;
      }
    }

    /* o agora: o pedaço de fita-crepe, com o traço da fase que anda (sem ele, parado ou desligado) */
    .agora {
      @include regua.fita-crepe(regua.$tinta-estudo);
      position: absolute;
      top: -4px;
      left: calc(12px + (100% - 24px) * var(--at));
      translate: -50% 0;
      rotate: -3deg;
      pointer-events: none;

      &.pausa {
        @include regua.fita-crepe(regua.$tinta-pausa);
      }

      &.parado {
        background: rgb(222 205 160 / 0.94);
      }
    }
  `,
})
export class PomodoroDay {
  /** Os trechos de hoje, com o que está andando (core/pomodoro.ts, `todayRuns`). */
  readonly runs = input.required<PomodoroRun[]>();
  readonly now = input.required<number>();
  /** Estudos completos hoje (os tomatinhos). */
  readonly done = input(0);
  /** A fase que anda agora; null parado ou desligado. */
  readonly phase = input<PomodoroPhase | null>(null);

  protected readonly running = computed(() => this.phase() !== null);
  private readonly window = computed(() => dayWindow(this.runs(), this.now()));
  private readonly midnight = computed(() => dayStart(this.now()));

  /** De 0 a 1 na régua. */
  private at(ms: number): number {
    const { from, to } = this.window();
    const h = (ms - this.midnight()) / HOUR;
    return Math.min(1, Math.max(0, (h - from) / (to - from)));
  }

  protected readonly painted = computed(() =>
    this.runs().map((r) => ({
      a: r.a,
      f: r.f,
      de: this.at(r.a),
      ate: this.at(r.b),
      title: `${r.f === 'estudo' ? 'Estudo' : 'Pausa'} das ${hourText(Math.max(r.a, this.midnight()))} às ${hourText(r.b)}`,
    })),
  );

  /** Um risco a cada quarto de hora (meia hora num dia comprido); o grande, na hora cheia. */
  protected readonly ticks = computed(() => {
    const { from, to } = this.window();
    const per = to - from <= 10 ? 4 : 2;
    return Array.from({ length: (to - from) * per + 1 }, (_, i) => ({ h: from + i / per, grande: i % per === 0 }));
  });

  /** Os números: de hora em hora (de duas em duas, de três em três quando o dia de estudo é comprido). */
  protected readonly numbers = computed(() => {
    const { from, to } = this.window();
    const span = to - from;
    const step = span <= 10 ? 1 : span <= 16 ? 2 : 3;
    const first = Math.ceil(from / step) * step;
    const nowH = (this.now() - this.midnight()) / HOUR;
    const out: { h: number; at: number; coberto: boolean }[] = [];
    // o número embaixo da fita-crepe some, como na régua de minutos (a menos de meia hora dela)
    for (let h = first; h <= to; h += step) out.push({ h, at: (h - from) / (to - from), coberto: Math.abs(h - nowH) < 0.5 });
    return out;
  });

  protected readonly nowAt = computed(() => this.at(this.now()));

  protected readonly summary = computed(() => {
    const n = this.done();
    const focus = focusMs(this.runs(), this.now());
    if (!n && !focus) return 'nenhum estudo ainda';
    // o primeiro do dia andando: ainda nenhum completo, mas o foco já conta
    const studies = n === 0 ? 'o primeiro andando' : n === 1 ? '1 estudo' : `${n} estudos`;
    return `${studies} · ${focusText(focus)} de foco`;
  });
}
