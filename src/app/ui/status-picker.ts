import { ChangeDetectionStrategy, Component, computed, input, model } from '@angular/core';
import { LucideAngularModule } from 'lucide-angular';
import { profileOf } from '../core/kinds';
import { Kind, STATUSES, Status } from '../core/review';
import { statusIcon, StatusLabel } from './status-label';

let uid = 0;

/**
 * Escolher o status é escolher qual etiqueta colar na ficha: as três ficam na cartela como recorte
 * picotado, e a escolhida sai colada, a etiqueta de verdade.
 */
@Component({
  selector: 'app-status-picker',
  imports: [LucideAngularModule, StatusLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend class="rotulo">Status</legend>
      <div class="opts">
        @for (s of statuses; track s) {
          <label class="opcao">
            <input type="radio" [name]="name" [value]="s" [checked]="value() === s" (change)="value.set(s)" />
            @if (value() === s) {
              <app-status-label class="colado" [status]="s" [kind]="kind()" />
            } @else {
              <span class="recorte">
                <lucide-icon [img]="icon(s)" [size]="15" [strokeWidth]="2.6" aria-hidden="true" />
                <span>{{ labels()[s] }}</span>
              </span>
            }
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
      gap: 6px 12px;
    }
    /* o recorte tem as medidas da etiqueta, para nada pular quando ela é colada */
    .recorte,
    app-status-label {
      gap: 5px;
      padding: 6px 9px 5px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      line-height: 1;
    }
    .recorte lucide-icon {
      display: inline-flex;
      margin-top: -1px;
    }
    app-status-label.colado {
      rotate: -2.5deg;
    }
  `,
})
export class StatusPicker {
  readonly value = model<Status | null>(null);
  readonly kind = input.required<Kind>();
  protected readonly statuses = STATUSES;
  protected readonly labels = computed(() => profileOf(this.kind()).status);
  protected icon(s: Status) {
    return statusIcon(this.kind(), s);
  }
  protected readonly name = `status-${++uid}`;
}
