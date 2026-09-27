import { ChangeDetectionStrategy, Component, input, model, output } from '@angular/core';
import { WEIGHTS, WEIGHT_LABEL, Weight } from '../core/review';

let uid = 0;

/** Os números de 0 a 10 escritos na ficha; a nota escolhida ganha um círculo de caneta. */
@Component({
  selector: 'app-score-picker',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.big]': 'big()', '[class.off]': 'weight() === "nao-tem"' },
  template: `
    <fieldset>
      <legend>
        <span class="label">{{ label() }}</span>
        @if (weight(); as w) {
          <select
            class="weight"
            [class]="w"
            [attr.aria-label]="'Peso de ' + label() + ' na média'"
            (change)="weightChange.emit($any($event.target).value)"
          >
            @for (opt of weights; track opt) {
              <option [value]="opt" [selected]="opt === w">{{ weightLabels[opt] }}</option>
            }
          </select>
        }
        @if (!required() && value() !== null) {
          <button type="button" class="clear" (click)="value.set(null)">limpar</button>
        } @else if (!required()) {
          <span class="optional">opcional</span>
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
      align-items: baseline;
      gap: 10px;
      width: 100%;
      padding: 0;
      margin-bottom: 4px;
    }
    .label {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    :host(.big) .label {
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.25rem;
      letter-spacing: 0;
      text-transform: none;
    }
    /* Peso da categoria: uma etiquetinha discreta à direita do nome */
    .weight {
      margin-left: auto;
      height: 30px;
      padding: 0 26px 0 10px;
      border: 0;
      border-radius: 4px;
      appearance: none;
      background:
        url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='10' height='6'%3E%3Cpath d='M1 1l4 4 4-4' fill='none' stroke='%23151515' stroke-width='1.8' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E")
          right 9px center / 10px 6px no-repeat,
        rgb(255 255 255 / 0.32);
      color: var(--ink);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      cursor: pointer;
      box-shadow: inset 0 0 0 1.5px rgb(21 21 21 / 0.28);
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .weight:hover {
      background-color: rgb(255 255 255 / 0.55);
    }
    .weight.relevante,
    .weight.pouco,
    .weight.nao-tem {
      background-color: var(--paper);
      box-shadow: inset 0 0 0 2px var(--ink);
    }
    /* categoria que o jogo não tem: some a fileira de números */
    :host(.off) .nums {
      display: none;
    }
    :host(.off) .label {
      opacity: 0.55;
      text-decoration: line-through 2px;
    }
    .optional,
    .clear {
      font-family: var(--f-ui);
      font-size: 0.84rem;
      color: var(--ink-2);
    }
    .clear {
      border: 0;
      padding: 2px 4px;
      background: none;
      text-decoration: underline;
      text-underline-offset: 3px;
      border-radius: 3px;
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
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    :host(.big) .num {
      height: 50px;
      font-size: 1.55rem;
    }
    .num:hover {
      background: rgb(255 255 255 / 0.35);
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
      :host(.big) .num {
        height: 44px;
        font-size: 1.3rem;
      }
    }
  `,
})
export class ScorePicker {
  readonly label = input.required<string>();
  readonly required = input(false);
  readonly big = input(false);
  /** Peso da categoria na média; null esconde o seletor. */
  readonly weight = input<Weight | null>(null);
  readonly weightChange = output<Weight>();
  protected readonly weights = WEIGHTS;
  protected readonly weightLabels = WEIGHT_LABEL;
  readonly value = model<number | null>(null);

  protected readonly numbers = [0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10];
  protected readonly name = `nota-${++uid}`;
}
