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

/** A dificuldade, na cartela: o recorte de cada nível, e o escolhido colado como etiqueta de papel. */
@Component({
  selector: 'app-difficulty-picker',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend class="rotulo">Dificuldade</legend>
      <div class="opts">
        @for (d of options; track d) {
          <label class="opcao">
            <input type="radio" [name]="name" [value]="d" [checked]="value() === d" (change)="value.set(d)" />
            <span class="nivel" [class.recorte]="value() !== d" [class.colado]="value() === d">
              @if (skulls[d]) {
                <span class="skulls" aria-hidden="true">
                  @for (i of slots; track i) {
                    @if (i < skulls[d]) {
                      <lucide-icon [img]="SkullIcon" [size]="15" [strokeWidth]="2.4" />
                    }
                  }
                </span>
              }
              <span>{{ labels[d] }}</span>
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
    .opts {
      display: flex;
      flex-wrap: wrap;
      gap: 6px 10px;
    }
    .nivel {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      height: 34px;
      padding: 0 10px 0 9px;
      border-radius: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      line-height: 1;
    }
    /* colada: etiqueta de papel com o fio impresso na borda, como o bônus a favor */
    .nivel.colado {
      --cola: 1.5deg;
      background: var(--paper);
      color: var(--ink);
      box-shadow:
        inset 0 0 0 1.5px rgb(21 21 21 / 0.82),
        0 2px 3px rgb(0 0 0 / 0.3);
    }
    .skulls {
      display: inline-flex;
      gap: 1px;
    }
    .skulls lucide-icon {
      display: inline-flex;
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
