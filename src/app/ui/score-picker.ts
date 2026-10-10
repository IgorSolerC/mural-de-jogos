import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { WEIGHTS, WEIGHT_LABEL, Weight } from '../core/review';

let uid = 0;

/** Os números de 0 a 10 escritos na ficha; a nota escolhida ganha um círculo de caneta. */
@Component({
  selector: 'app-score-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.off]': 'weight() === "nao-tem"' },
  template: `
    <fieldset>
      <legend>
        <span class="label rotulo">{{ label() }}</span>
        @if (weight(); as w) {
          <select
            class="weight"
            [class]="w"
            [attr.aria-label]="'Peso de ' + label() + ' na média'"
            (change)="weightChange.emit($any($event.target).value)"
          >
            @for (opt of weights; track opt) {
              <option [value]="opt" [selected]="opt === w">{{ opt === 'normal' ? 'Peso normal' : weightLabels[opt] }}</option>
            }
          </select>
        }
      </legend>
      <div class="nums" [attr.hidden]="weight() === 'nao-tem' ? '' : null">
        @for (n of numbers; track n) {
          <label class="num" [class.on]="value() === n">
            <input
              type="radio"
              [name]="name"
              [value]="n"
              [checked]="value() === n"
              [attr.aria-label]="n + ' de 10'"
              (change)="value.set(n)"
            />
            <span aria-hidden="true">{{ n }}</span>
            @if (value() === n) {
              <svg viewBox="0 0 60 50" aria-hidden="true">
                <path d="M33 5c-14-2-27 5-28 18-1 12 11 22 26 21 15-1 25-10 24-21C54 12 43 4 29 7" />
              </svg>
            }
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
    }
    fieldset {
      margin: 0;
      padding: 0;
      border: 0;
      min-width: 0;
    }
    legend {
      display: flex;
      align-items: center;
      gap: 10px;
      width: 100%;
      min-height: 30px;
      padding: 0;
      margin-bottom: 2px;
    }
    .label {
      margin: 0;
    }
    /* Peso da categoria: no normal, só um lembrete impresso à direita do nome, que não disputa com
       as notas. Mexeu no peso, ele vira etiqueta colada, como toda escolha da ficha em branco. */
    .weight {
      margin-left: auto;
      height: 30px;
      padding: 0 24px 0 9px;
      border: 0;
      border-radius: 2px;
      appearance: none;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23151515' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
        right 8px center / 9px 6px no-repeat;
      color: var(--ink-2);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.78rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      transition:
        background-color var(--t-ui) var(--ease-ui),
        color var(--t-ui) var(--ease-ui),
        rotate var(--t-physical) var(--ease-physical);
    }
    .weight:hover {
      background-color: rgb(21 21 21 / 0.06);
      color: var(--ink);
    }
    .weight:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: 1px;
    }
    .weight.relevante,
    .weight.pouco,
    .weight.nao-tem {
      background-color: var(--paper);
      color: var(--ink);
      rotate: -1.5deg;
      box-shadow:
        inset 0 0 0 1.5px rgb(21 21 21 / 0.82),
        0 2px 3px rgb(0 0 0 / 0.3);
    }
    /* categoria que o jogo não tem: some a fileira de números */
    :host(.off) .nums {
      display: none;
    }
    :host(.off) .label {
      opacity: 0.55;
      text-decoration: line-through 2px;
    }
    .nums {
      display: grid;
      grid-template-columns: repeat(11, minmax(0, 1fr));
      gap: 2px;
    }
    .num {
      position: relative;
      display: grid;
      place-items: center;
      height: 40px;
      border-radius: 4px;
      cursor: pointer;
      font-family: var(--f-marker);
      font-size: 1.2rem;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      /* 44 números a pincel pesavam como ruído: os não escolhidos ficam em tinta mais rala */
      color: rgb(21 21 21 / 0.6);
      transition:
        background-color var(--t-ui) var(--ease-ui),
        color var(--t-ui) var(--ease-ui);
    }
    .num:hover {
      color: var(--ink);
      background: rgb(21 21 21 / 0.06);
    }
    .num:has(input:focus-visible) {
      outline: 3px solid var(--ink);
      outline-offset: 1px;
    }
    input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      margin: 0;
      pointer-events: none;
    }
    .on span {
      color: var(--red-deep);
      scale: 1.12;
    }
    svg {
      position: absolute;
      inset: -3px -2px;
      width: calc(100% + 4px);
      height: calc(100% + 6px);
      overflow: visible;
      pointer-events: none;
    }
    path {
      fill: none;
      stroke: var(--red);
      stroke-width: 3.2;
      stroke-linecap: round;
      stroke-dasharray: 150;
      stroke-dashoffset: 150;
      animation: draw 280ms var(--ease-ui) forwards;
    }
    @keyframes draw {
      to {
        stroke-dashoffset: 0;
      }
    }
    @media (max-width: 420px) {
      .num {
        height: 36px;
        font-size: 1.05rem;
      }
    }
  `,
})
export class ScorePicker {
  readonly label = input.required<string>();
  /** Peso da categoria na média; null esconde o seletor. */
  readonly weight = input<Weight | null>(null);
  readonly weightChange = output<Weight>();
  protected readonly weights = WEIGHTS;
  protected readonly weightLabels = WEIGHT_LABEL;
  readonly value = model<number | null>(null);

  protected readonly numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  protected readonly name = `nota-${++uid}`;
}
