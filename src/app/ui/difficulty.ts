import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { LucideAngularModule, Skull } from 'lucide-angular';
import { DIFFICULTIES, DIFFICULTY_LABEL, DIFFICULTY_SKULLS, Difficulty } from '../core/review';

const SLOTS = [0, 1, 2, 3];

/** Caveirinhas desenhadas a caneta: de 0 (Nenhuma) a 4 (Impossível). */
@Component({
  selector: 'app-skulls',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { role: 'img', '[attr.aria-label]': '"Dificuldade: " + label()' },
  template: `
    @for (i of slots; track i) {
      @if (ghosts() || i < count()) {
        <lucide-icon
          [img]="SkullIcon"
          [size]="size()"
          [strokeWidth]="2.4"
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
  protected readonly SkullIcon = Skull;
  protected readonly slots = SLOTS;
  protected readonly count = computed(() => DIFFICULTY_SKULLS[this.value()]);
  protected readonly label = computed(() => DIFFICULTY_LABEL[this.value()]);
}

let uid = 0;

@Component({
  selector: 'app-difficulty-picker',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>Dificuldade</legend>
      <div class="opts">
        @for (d of options; track d) {
          <label class="opt" [class.on]="value() === d">
            <input type="radio" [name]="name" [value]="d" [checked]="value() === d" (change)="value.set(d)" />
            <span class="skulls" aria-hidden="true">
              @for (i of slots; track i) {
                @if (i < skulls[d]) {
                  <lucide-icon [img]="SkullIcon" [size]="16" [strokeWidth]="2.4" />
                }
              }
              @if (!skulls[d]) {
                <span class="none">—</span>
              }
            </span>
            <span class="name">{{ labels[d] }}</span>
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
      padding: 0;
      margin-bottom: 8px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .opts {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 6px;
    }
    .opt {
      position: relative;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 3px;
      min-height: 56px;
      padding: 6px 4px;
      border-radius: 6px;
      cursor: pointer;
      box-shadow: inset 0 0 0 2px rgb(21 21 21 / 0.18);
      transition:
        box-shadow var(--t-ui) var(--ease-ui),
        background-color var(--t-ui) var(--ease-ui);
    }
    .opt:hover {
      background: rgb(255 255 255 / 0.3);
    }
    .opt.on {
      box-shadow: inset 0 0 0 3px var(--ink);
      background: rgb(255 255 255 / 0.35);
    }
    .opt:has(input:focus-visible) {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    .skulls {
      display: inline-flex;
      height: 18px;
      align-items: center;
    }
    .skulls lucide-icon {
      display: inline-flex;
    }
    .none {
      font-family: var(--f-marker);
      line-height: 1;
    }
    .name {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.05em;
      text-transform: uppercase;
      text-align: center;
    }
    .on .name {
      text-decoration: underline 3px var(--red);
      text-underline-offset: 3px;
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
export class DifficultyPicker {
  readonly value = model<Difficulty>('nenhuma');
  protected readonly options = DIFFICULTIES;
  protected readonly labels = DIFFICULTY_LABEL;
  protected readonly skulls = DIFFICULTY_SKULLS;
  protected readonly slots = SLOTS;
  protected readonly SkullIcon = Skull;
  protected readonly name = `dificuldade-${++uid}`;
}
