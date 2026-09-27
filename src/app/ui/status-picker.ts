import { ChangeDetectionStrategy, Component, model } from '@angular/core';
import { STATUSES, Status } from '../core/review';
import { StatusLabel } from './status-label';

let uid = 0;

/** Escolher o status é escolher qual etiqueta colar na ficha. */
@Component({
  selector: 'app-status-picker',
  imports: [StatusLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend>Status</legend>
      <div class="opts">
        @for (s of statuses; track s) {
          <label class="opt" [class.on]="value() === s">
            <input type="radio" [name]="name" [value]="s" [checked]="value() === s" (change)="value.set(s)" />
            <app-status-label [status]="s" />
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
      display: flex;
      flex-wrap: wrap;
      gap: 10px;
    }
    .opt {
      position: relative;
      display: inline-grid;
      place-items: center;
      min-height: 46px;
      padding: 6px 10px;
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
    .opt app-status-label {
      rotate: 0deg;
      opacity: 0.8;
      transition:
        rotate var(--t-physical) var(--ease-physical),
        opacity var(--t-ui) var(--ease-ui),
        scale var(--t-physical) var(--ease-physical);
    }
    .opt.on {
      box-shadow: inset 0 0 0 3px var(--ink);
      background: rgb(255 255 255 / 0.35);
    }
    .opt.on app-status-label {
      opacity: 1;
      rotate: -3deg;
      scale: 1.08;
    }
    .opt:has(input:focus-visible) {
      outline: 3px solid var(--ink);
      outline-offset: 2px;
    }
    input {
      position: absolute;
      opacity: 0;
      width: 1px;
      height: 1px;
      margin: 0;
      pointer-events: none;
    }
  `,
})
export class StatusPicker {
  readonly value = model<Status | null>(null);
  protected readonly statuses = STATUSES;
  protected readonly name = `status-${++uid}`;
}
