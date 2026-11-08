import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { MAX_MINUTES, MINUTE_STEP, MIN_MINUTES } from '../core/pomodoro';
import { ICON, IconModule } from './icons';

/** Os números escritos na régua (os outros passos são só risquinhos). */
const LABELS = [5, 30, 60, 90, 120];

/**
 * A régua dos minutos do Pomodoro (PLANO-POMODORO.md, seção 4): uma régua escolar de madeira, de 5 a 120, com um
 * risco a cada 5 minutos e o trecho escolhido pintado de marca-texto na cor da fase. Por baixo, um
 * `<input type="range">` de verdade (o teclado, o leitor de tela e o dedo), só vestido: o cursor é um pedaço de
 * fita-crepe. Ao lado, o número grande a marcador e os botões de 5 em 5.
 */
@Component({
  selector: 'app-minutes-ruler',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.pausa]': "tone() === 'pausa'" },
  template: `
    <div class="topo">
      <label class="nome" [for]="inputId()">{{ label() }}</label>
      <span class="valor" aria-hidden="true"
        >{{ value() }}<small>min</small></span
      >
      <span class="passos">
        <button type="button" class="passo" (click)="nudge(-1)" [disabled]="value() <= MIN" [attr.aria-label]="'Menos 5 minutos de ' + label().toLowerCase()">
          <lucide-icon [img]="ICON.tirar" [size]="16" aria-hidden="true" />
        </button>
        <button type="button" class="passo" (click)="nudge(1)" [disabled]="value() >= MAX" [attr.aria-label]="'Mais 5 minutos de ' + label().toLowerCase()">
          <lucide-icon [img]="ICON.adicionar" [size]="16" aria-hidden="true" />
        </button>
      </span>
    </div>
    <div class="regua" [style.--v]="fraction()">
      <span class="pintado"></span>
      <span class="riscos" aria-hidden="true">
        @for (t of ticks; track t) {
          <i [class.grande]="labels.has(t)"></i>
        }
      </span>
      <span class="numeros" aria-hidden="true">
        @for (t of LABELS; track t) {
          <b [style.--at]="(t - MIN) / (MAX - MIN)" [class.coberto]="covered(t)">{{ t }}</b>
        }
      </span>
      <input
        type="range"
        [id]="inputId()"
        [min]="MIN"
        [max]="MAX"
        [step]="STEP"
        [value]="value()"
        [attr.aria-valuetext]="value() + ' minutos'"
        (input)="changed.emit(+$any($event.target).value)"
      />
    </div>
  `,
  styles: `
    :host {
      --tinta-fase: #e62e2d;
      --marca: rgb(255 120 100 / 0.5);
      display: grid;
      gap: 8px;
    }
    :host(.pausa) {
      --tinta-fase: #0f8a3e;
      --marca: rgb(110 225 140 / 0.55);
    }

    .topo {
      display: flex;
      align-items: center;
      gap: 12px;
    }

    .nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .valor {
      margin-left: auto;
      color: var(--tinta-fase);
      font-family: var(--f-marker);
      font-size: 2.1rem;
      line-height: 1;
      font-variant-numeric: tabular-nums;

      small {
        margin-left: 4px;
        color: var(--ink);
        font-family: var(--f-hand);
        font-size: 1rem;
      }
    }

    .passos {
      display: flex;
      gap: 4px;
    }

    .passo {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: var(--ink);
      color: #f1f1ec;
      cursor: pointer;
      box-shadow:
        0 1px 2px rgb(0 0 0 / 0.35),
        0 4px 8px -4px rgb(0 0 0 / 0.4);
      transition:
        scale var(--t-ui) var(--ease-ui),
        color var(--t-ui) var(--ease-ui);

      lucide-icon {
        display: inline-flex;
      }

      &:hover:not(:disabled) {
        scale: 1.06;
        color: var(--hi);
      }

      &:disabled {
        opacity: 0.3;
        cursor: default;
      }

      &:focus-visible {
        outline: 2.5px solid var(--ink);
        outline-offset: 2px;
        box-shadow: 0 0 0 6px rgb(241 241 236 / 0.85);
      }
    }

    /* a régua de madeira, com o trecho escolhido pintado de marca-texto */
    .regua {
      position: relative;
      height: 46px;
      border-radius: 3px;
      background:
        repeating-linear-gradient(90deg, rgb(120 80 30 / 0.06) 0 2px, transparent 2px 9px),
        linear-gradient(#ecd8a6, #dcc08a);
      box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.55),
        inset 0 -2px 3px rgb(110 70 20 / 0.25),
        0 1px 1px rgb(0 0 0 / 0.25),
        0 6px 10px -6px rgb(0 0 0 / 0.45);
    }

    /* 12px de margem dos dois lados: onde o meio do cursor alcança nas pontas */
    .pintado {
      position: absolute;
      top: 6px;
      left: 6px;
      width: calc(6px + (100% - 24px) * var(--v));
      height: 14px;
      border-radius: 2px 7px 5px 2px;
      background: var(--marca);
      mix-blend-mode: multiply;
    }

    .riscos {
      position: absolute;
      inset: 0 12px auto;
      display: flex;
      justify-content: space-between;

      i {
        width: 1.5px;
        height: 10px;
        background: rgb(40 25 10 / 0.7);

        &.grande {
          height: 18px;
          background: #2a1a0a;
        }
      }
    }

    .numeros b {
      position: absolute;
      bottom: 4px;
      left: calc(12px + (100% - 24px) * var(--at));
      translate: -50% 0;
      color: #2a1a0a;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.78rem;
      line-height: 1;
      transition: opacity var(--t-ui) var(--ease-ui);

      /* o número embaixo do cursor some, para não ser lido pela metade */
      &.coberto {
        opacity: 0;
      }
    }

    /* o range de verdade, por cima de tudo, transparente; o cursor é um pedaço de fita-crepe */
    input {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      margin: 0;
      background: none;
      cursor: pointer;
      appearance: none;
      -webkit-appearance: none;

      &::-webkit-slider-runnable-track {
        height: 100%;
        background: none;
      }
      &::-moz-range-track {
        height: 100%;
        background: none;
      }
      &::-webkit-slider-thumb {
        -webkit-appearance: none;
        width: 24px;
        height: 54px;
        margin-top: -4px;
        border: 0;
        border-radius: 1px;
        background:
          linear-gradient(var(--tinta-fase), var(--tinta-fase)) center / 3px 70% no-repeat,
          rgb(222 205 160 / 0.94);
        box-shadow:
          0 1px 1px rgb(0 0 0 / 0.25),
          0 4px 6px -3px rgb(0 0 0 / 0.45);
        rotate: -3deg;
        transition: scale var(--t-ui) var(--ease-ui);
      }
      &::-moz-range-thumb {
        width: 24px;
        height: 54px;
        border: 0;
        border-radius: 1px;
        background:
          linear-gradient(var(--tinta-fase), var(--tinta-fase)) center / 3px 70% no-repeat,
          rgb(222 205 160 / 0.94);
        box-shadow:
          0 1px 1px rgb(0 0 0 / 0.25),
          0 4px 6px -3px rgb(0 0 0 / 0.45);
      }
      &:hover::-webkit-slider-thumb,
      &:active::-webkit-slider-thumb {
        scale: 1.06;
      }
      &:focus-visible {
        outline: 3px solid var(--ink);
        outline-offset: 4px;
        border-radius: 3px;
      }
    }
  `,
})
export class MinutesRuler {
  readonly label = input.required<string>();
  readonly value = input.required<number>();
  readonly tone = input<'estudo' | 'pausa'>('estudo');
  readonly inputId = input.required<string>();
  readonly changed = output<number>();

  protected readonly ICON = ICON;
  protected readonly MIN = MIN_MINUTES;
  protected readonly MAX = MAX_MINUTES;
  protected readonly STEP = MINUTE_STEP;
  protected readonly LABELS = LABELS;
  protected readonly labels = new Set(LABELS);
  protected readonly ticks = Array.from({ length: (MAX_MINUTES - MIN_MINUTES) / MINUTE_STEP + 1 }, (_, i) => MIN_MINUTES + i * MINUTE_STEP);
  protected readonly fraction = computed(() => (this.value() - MIN_MINUTES) / (MAX_MINUTES - MIN_MINUTES));

  /** O número que o cursor tamparia (a menos de 10 minutos dele). */
  protected covered(t: number): boolean {
    return Math.abs(t - this.value()) < 10;
  }

  protected nudge(dir: 1 | -1): void {
    const next = Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, this.value() + dir * MINUTE_STEP));
    if (next !== this.value()) this.changed.emit(next);
  }
}
