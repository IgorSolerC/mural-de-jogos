import { ChangeDetectionStrategy, Component, computed, input, model, signal } from '@angular/core';
import { ICON, IconModule } from './icons';
import {
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  DIFFICULTY_MAX_SKULLS,
  DIFFICULTY_SKULLS,
  Difficulty,
  isHorned,
} from '../core/review';

const SLOTS = Array.from({ length: DIFFICULTY_MAX_SKULLS }, (_, i) => i);

/** Caveirinhas desenhadas a caneta: de 0 (Nenhuma) a 5 (Infernal, roxas e com chifres). */
@Component({
  selector: 'app-skulls',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': '"Dificuldade: " + label()' },
  template: `
    @for (i of slots; track i) {
      @if (horned() && i < count()) {
        <!-- a do topo (Infernal): a caveira com chifres do acervo, riscada de roxo (no mural, em tinta
             preta: --chifre-ink) -->
        <lucide-icon class="on chifres" [img]="HornedIcon" [size]="size()" aria-hidden="true" />
      } @else if (ghosts() || i < count()) {
        <lucide-icon
          [img]="SkullIcon"
          [size]="size()"
          [class.on]="i < count()"
          aria-hidden="true"
        />
      }
    }
    @if (showLabel()) {
      <span class="label" aria-hidden="true">{{ value() === 'nenhuma' ? 'Sem dificuldade' : 'Dificuldade ' + label() }}</span>
    }
  `,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      color: var(--ink);
    }
    lucide-icon {
      display: inline-flex;
      opacity: 0.22;
    }
    lucide-icon.on {
      opacity: 1;
    }
    .chifres {
      color: var(--chifre-ink, var(--roxo-impossivel));
    }
    .label {
      white-space: nowrap;
      margin-left: 6px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
  `,
})
export class Skulls {
  readonly value = input.required<Difficulty>();
  readonly size = input(15);
  readonly showLabel = input(true);
  /** Mostra as posições vazias da escala (na leitura sim, no cartão não). */
  readonly ghosts = input(true);
  protected readonly SkullIcon = ICON.caveira;
  protected readonly HornedIcon = ICON.caveiraComChifres;
  protected readonly slots = SLOTS;
  protected readonly count = computed(() => DIFFICULTY_SKULLS[this.value()]);
  protected readonly horned = computed(() => isHorned(this.value()));
  protected readonly label = computed(() => DIFFICULTY_LABEL[this.value()]);
}

let uid = 0;

/**
 * A dificuldade como uma escala, igual à das notas: cinco caveiras numa fileira, e a escolhida
 * enche a fileira até ela, com o nome do nível ao lado. Na quinta, todas ganham chifres. Nenhuma
 * é o sinal de vazio antes da primeira caveira: a fileira vazia, a um clique.
 */
@Component({
  selector: 'app-difficulty-picker',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend class="rotulo">{{ label() }}</legend>
      <div class="medidor">
        <div class="caveiras" [class.horned]="horned()" (pointerleave)="preview.set(null)">
          <label class="zero" [class.on]="value() === 'nenhuma'" (pointerenter)="onEnter($event, 'nenhuma')">
            <input
              type="radio"
              [name]="name"
              value="nenhuma"
              [checked]="value() === 'nenhuma'"
              [attr.aria-label]="labels.nenhuma"
              (change)="value.set('nenhuma')"
            />
            <lucide-icon [img]="NoneIcon" [size]="22" aria-hidden="true" />
          </label>
          @for (d of levels; track d; let i = $index) {
            <label class="cav" [class.on]="i < count()" (pointerenter)="onEnter($event, d)">
              <input
                type="radio"
                [name]="name"
                [value]="d"
                [checked]="value() === d"
                [attr.aria-label]="labels[d]"
                (change)="value.set(d)"
              />
              <lucide-icon class="liso" [img]="SkullIcon" [size]="24" aria-hidden="true" />
              <lucide-icon class="chifre" [img]="HornedIcon" [size]="24" aria-hidden="true" />
            </label>
          }
        </div>
        <span class="nome" [class.vazio]="shown() === 'nenhuma'" [class.previa]="preview() !== null" aria-hidden="true">
          {{ labels[shown()] }}
        </span>
      </div>
    </fieldset>
  `,
  styles: `
    @use 'a11y';

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
      padding: 0;
      margin-bottom: 4px;
    }
    .medidor {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 14px;
    }
    .caveiras {
      display: flex;
      margin-left: -6px;
    }
    .cav,
    .zero {
      position: relative;
      display: grid;
      place-items: center;
      width: 36px;
      height: 44px;
      border-radius: 4px;
      color: var(--ink);
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .cav:hover,
    .zero:hover {
      background: rgb(21 21 21 / 0.06);
    }
    .cav:has(input:focus-visible),
    .zero:has(input:focus-visible) {
      outline: 3px solid var(--ink);
      outline-offset: -2px;
    }
    input {
      @include a11y.radio-escondido;
    }
    /* a escala vazia é a das leituras: caveiras em tinta rala */
    .liso {
      display: inline-flex;
    }
    .cav > :not(input) {
      opacity: 0.22;
      transition:
        opacity var(--t-ui) var(--ease-ui),
        scale var(--t-physical) var(--ease-physical);
    }
    .cav.on > :not(input) {
      opacity: 1;
    }
    /* passando o mouse, a fileira mostra até onde a escolha iria */
    .caveiras:hover .cav > :not(input) {
      opacity: 0.22;
    }
    .caveiras .cav:hover > :not(input),
    .caveiras .cav:has(~ .cav:hover) > :not(input) {
      opacity: 0.75;
    }
    .cav:active > :not(input),
    .zero:active > :not(input) {
      scale: 0.9;
    }
    /* o vazio fica um passo antes da escala, meio apagado até ser o escolhido */
    .zero {
      margin-right: 6px;
    }
    .zero > :not(input) {
      display: inline-flex;
      opacity: 0.4;
      transition:
        opacity var(--t-ui) var(--ease-ui),
        scale var(--t-physical) var(--ease-physical);
    }
    .zero.on > :not(input) {
      opacity: 1;
    }
    .caveiras:hover .zero > :not(input) {
      opacity: 0.4;
    }
    .caveiras .zero:hover > :not(input) {
      opacity: 0.75;
    }
    /* Os chifres só aparecem no Infernal. Passando o mouse, a prévia é de caveiras lisas, até
       chegar na quinta: aí a fileira inteira fica roxa e ganha chifres. */
    .chifre,
    .caveiras.horned:not(:hover) .cav.on .liso,
    .caveiras:has(.cav:last-child:hover) .liso {
      display: none;
    }
    .caveiras.horned:not(:hover) .cav.on .chifre,
    .caveiras:has(.cav:last-child:hover) .chifre {
      display: inline-flex;
    }
    /* a caveira com chifres é riscada de roxo, como no mural */
    .chifre {
      color: var(--chifre-ink, var(--roxo-impossivel));
    }
    .nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.95rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      color: var(--ink);
    }
    .nome.vazio,
    .nome.previa {
      color: var(--ink-2);
    }
    @media (prefers-reduced-motion: reduce) {
      .cav > :not(input),
      .zero > :not(input) {
        transition: none;
      }
    }
  `,
})
export class DifficultyPicker {
  readonly value = model<Difficulty>('nenhuma');
  /** "Dificuldade", ou "Dificuldade de leitura" no mural de livros. */
  readonly label = input('Dificuldade');
  /** Os níveis que têm caveira; Nenhuma é a fileira vazia. */
  protected readonly levels = DIFFICULTIES.filter((d) => d !== 'nenhuma');
  protected readonly labels = DIFFICULTY_LABEL;
  protected readonly count = computed(() => DIFFICULTY_SKULLS[this.value()]);
  protected readonly horned = computed(() => isHorned(this.value()));
  /** O nível sob o mouse: o nome ao lado mostra até onde a escolha iria, como a fileira. */
  protected readonly preview = signal<Difficulty | null>(null);
  protected readonly shown = computed(() => this.preview() ?? this.value());
  protected readonly SkullIcon = ICON.caveira;
  protected readonly HornedIcon = ICON.caveiraComChifres;
  protected readonly NoneIcon = ICON.nenhum;
  protected readonly name = `dificuldade-${++uid}`;

  /** Só o mouse mostra a prévia; no toque, o dedo já escolhe. */
  protected onEnter(e: PointerEvent, d: Difficulty): void {
    if (e.pointerType === 'mouse') this.preview.set(d);
  }
}
