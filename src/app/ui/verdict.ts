import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { Annoyed, Crown, LucideAngularModule, LucideIconData, Meh, Smile, ThumbsUp } from 'lucide-angular';
import { VERDICTS, VERDICT_LABEL, Verdict } from '../core/review';

export const VERDICT_ICON: Record<Verdict, LucideIconData> = {
  masterpiece: Crown,
  recomendo: ThumbsUp,
  legalzinho: Smile,
  meh: Meh,
  chato: Annoyed,
};

/** Carimbo de borracha batido na ficha: moldura dupla, tinta de uma cor por veredito. */
@Component({
  selector: 'app-verdict-stamp',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'value()', '[class.big]': 'size() === "big"', role: 'img', '[attr.aria-label]': '"Veredito: " + label()' },
  template: `
    <lucide-icon [img]="icon()" [size]="size() === 'big' ? 20 : 15" [strokeWidth]="2.6" aria-hidden="true" />
    <span aria-hidden="true">{{ label() }}</span>
  `,
  styles: `
    :host {
      --stamp: var(--verdict-masterpiece);
      display: inline-flex;
      align-items: center;
      gap: 5px;
      padding: 4px 8px 3px;
      border: 2.5px solid var(--stamp);
      border-radius: 4px;
      outline: 1px solid var(--stamp);
      outline-offset: 2px;
      background: rgb(246 246 241 / 0.94);
      color: var(--stamp);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      line-height: 1;
      rotate: -9deg;
      box-shadow: 0 2px 4px rgb(0 0 0 / 0.3);
    }
    :host(.big) {
      font-size: 1.05rem;
      padding: 6px 12px 5px;
    }
    /* Masterpiece: selo de folha de ouro, com moldura em ouro escuro */
    :host(.masterpiece) {
      --stamp: var(--verdict-masterpiece);
      background: var(--foil-gold);
      color: var(--foil-gold-ink);
      text-shadow: 0 1px 0 rgb(255 255 255 / 0.5);
    }
    :host(.recomendo) {
      --stamp: var(--verdict-recomendo);
    }
    :host(.legalzinho) {
      --stamp: var(--verdict-legalzinho);
    }
    :host(.meh) {
      --stamp: var(--verdict-meh);
    }
    :host(.chato) {
      --stamp: var(--verdict-chato);
    }
    lucide-icon {
      display: inline-flex;
      margin-top: -1px;
    }
  `,
})
export class VerdictStamp {
  readonly value = input.required<Verdict>();
  readonly size = input<'card' | 'big'>('card');
  protected readonly icon = computed(() => VERDICT_ICON[this.value()]);
  protected readonly label = computed(() => VERDICT_LABEL[this.value()]);
}

let uid = 0;

@Component({
  selector: 'app-verdict-picker',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>
        <span class="label">Veredito</span>
        @if (value()) {
          <button type="button" class="clear" (click)="value.set(null)">limpar</button>
        }
      </legend>
      <div class="opts">
        @for (v of options; track v) {
          <label class="opt" [class]="v" [class.on]="value() === v">
            <input type="radio" [name]="name" [value]="v" [checked]="value() === v" (change)="value.set(v)" />
            <lucide-icon [img]="icons[v]" [size]="22" [strokeWidth]="2.4" aria-hidden="true" />
            <span class="name">{{ labels[v] }}</span>
          </label>
        }
      </div>
    </fieldset>
  `,
  styles: `
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
      margin-bottom: 8px;
    }
    .label {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
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
    .opts {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 6px;
    }
    .opt {
      --stamp: var(--verdict-masterpiece);
      position: relative;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 4px;
      min-height: 62px;
      padding: 6px 2px;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: inset 0 0 0 2px rgb(21 21 21 / 0.18);
      transition:
        box-shadow var(--t-ui) var(--ease-ui),
        background-color var(--t-ui) var(--ease-ui),
        color var(--t-ui) var(--ease-ui);
    }
    .opt.recomendo {
      --stamp: var(--verdict-recomendo);
    }
    .opt.legalzinho {
      --stamp: var(--verdict-legalzinho);
    }
    .opt.meh {
      --stamp: var(--verdict-meh);
    }
    .opt.chato {
      --stamp: var(--verdict-chato);
    }
    .opt:hover {
      background: rgb(255 255 255 / 0.3);
    }
    /* escolhido: vira carimbo, na tinta do veredito */
    .opt.on {
      background: var(--paper);
      color: var(--stamp);
      box-shadow:
        inset 0 0 0 2.5px var(--stamp),
        inset 0 0 0 4px var(--paper),
        inset 0 0 0 5px var(--stamp);
      rotate: -3deg;
    }
    .opt.on.masterpiece {
      background: var(--foil-gold);
      color: var(--foil-gold-ink);
      box-shadow:
        inset 0 0 0 2.5px var(--stamp),
        inset 0 0 0 4px rgb(255 244 196 / 0.9),
        inset 0 0 0 5px var(--stamp);
    }
    .opt:has(input:focus-visible) {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    lucide-icon {
      display: inline-flex;
    }
    .name {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: center;
    }
    input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      margin: 0;
      pointer-events: none;
    }
    @media (max-width: 420px) {
      .opts {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }
  `,
})
export class VerdictPicker {
  readonly value = model<Verdict | null>(null);
  protected readonly options = VERDICTS;
  protected readonly labels = VERDICT_LABEL;
  protected readonly icons = VERDICT_ICON;
  protected readonly name = `veredito-${++uid}`;
}
