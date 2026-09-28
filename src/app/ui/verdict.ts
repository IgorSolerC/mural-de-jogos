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

/**
 * O veredito, na cartela: cada um é o recorte do canhoto preto da etiqueta da ficha. O escolhido sai
 * colado, igualzinho ao canhoto que vai para o mural: tinta preta, a palavra em papel e o ícone na
 * cor clara do veredito; o Masterpiece com a palavra e o fio em folha de ouro.
 */
@Component({
  selector: 'app-verdict-picker',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>
        <span class="pergunta">E o veredito?</span>
        @if (value()) {
          <button type="button" class="acao-caneta" (click)="value.set(null)">tirar</button>
        }
      </legend>
      <div class="opts">
        @for (v of options; track v) {
          <label class="opcao">
            <input type="radio" [name]="name" [value]="v" [checked]="value() === v" (change)="value.set(v)" />
            <span
              class="canhoto"
              [class.recorte]="value() !== v"
              [class.colado]="value() === v"
              [class.gold]="v === 'masterpiece'"
              [class.tarja-rasgada]="value() === v && v === 'chato'"
              [class.rasgo-direita]="value() === v && v === 'chato'"
              [style.--v]="'var(--verdict-' + v + '-lit)'"
            >
              <lucide-icon [img]="icons[v]" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
              <span class="palavra">{{ labels[v] }}</span>
            </span>
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
      gap: 16px;
      width: 100%;
      padding: 0;
      margin-bottom: 14px;
    }
    legend .pergunta {
      margin: 0;
    }
    .opts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 10px;
    }
    /* as medidas do canhoto da ficha, um pouco menor: recorte e colado ocupam o mesmo lugar */
    .canhoto {
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 7px;
      height: 40px;
      padding: 0 14px 0 12px;
      border-radius: 3px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      line-height: 1;
    }
    .canhoto lucide-icon {
      display: inline-flex;
      margin-top: -1px;
    }
    .canhoto.colado {
      --cola: -2deg;
      background: var(--ink);
      color: var(--paper);
      box-shadow: 0 2px 3px rgb(0 0 0 / 0.3);
    }
    .canhoto.colado lucide-icon {
      color: var(--v);
    }
    /* Chato: o canhoto colado com a borda de fora arrancada, como o da ficha */
    .canhoto.colado.tarja-rasgada {
      --rasgo-w: 11px;
      background: transparent;
      color: var(--paper);
      padding-right: 20px;
      box-shadow: none;
      filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3));
    }
    /* Masterpiece: palavra e fio da moldura estampados a quente em folha de ouro */
    .canhoto.colado.gold::after {
      content: '';
      position: absolute;
      inset: 3px;
      border: 1.5px solid #d8ab48;
      border-radius: 2px;
      pointer-events: none;
    }
    .canhoto.colado.gold .palavra {
      background: linear-gradient(100deg, #d8ab48 0%, #f7dc8a 30%, #fff4c4 45%, #e3b857 65%, #f3d27a 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
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
