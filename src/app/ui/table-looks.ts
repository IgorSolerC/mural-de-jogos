import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { TABLE_LOOKS, TableLook } from '../core/tables';
import { Pin } from './pin';
import { TableLookArt } from './table-look-art';

/**
 * Os cinco jeitos da tabela no menu "Tabela" da régua do Visual (ui/rich-editor.ts): as miniaturas da
 * folha da tabela (ui/table-look-art.ts) num papelzinho cada, a escolhida descolada, torta e presa com a
 * tachinha, como na folha. Cada uma é um item do menu (`menu-op`: as setas do menu passam por elas) que
 * marca o jeito (`menuitemradio`).
 */
@Component({
  selector: 'app-table-looks',
  imports: [Pin, TableLookArt],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @for (o of looks; track o.value) {
      @let on = jeito() === o.value;
      <button
        type="button"
        role="menuitemradio"
        tabindex="-1"
        class="menu-op tl-jeito"
        [class.on]="on"
        [attr.aria-checked]="on"
        (pointerdown)="$event.preventDefault()"
        (pointerenter)="$any($event.currentTarget).focus()"
        (click)="pick.emit(o.value)"
      >
        <span class="tl-papel" aria-hidden="true">
          <svg class="tl-desenho" viewBox="0 0 64 48"><svg:g [appTableLookArt]="o.value" /></svg>
        </span>
        @if (on) {
          <app-pin class="tl-pin" />
        }
        <span class="tl-nome">{{ o.label }}</span>
      </button>
    }
  `,
  styles: `
    :host {
      display: grid;
      grid-template-columns: repeat(5, minmax(0, 1fr));
      gap: 2px;
      padding: 2px 0 4px;
    }
    .tl-jeito {
      position: relative;
      display: grid;
      justify-items: center;
      gap: 5px;
      min-width: 0;
      padding: 6px 2px 4px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--ink-2);
      cursor: pointer;
    }
    .tl-jeito:hover,
    .tl-jeito:focus-visible {
      background: rgb(21 21 21 / 0.07);
    }
    .tl-jeito:focus-visible {
      outline: 3px solid var(--ink);
      outline-offset: -1px;
    }
    /* o papelzinho da miniatura, como a amostra da folha da tabela */
    .tl-papel {
      display: block;
      width: 100%;
      max-width: 52px;
      aspect-ratio: 4 / 3;
      border-radius: 2px;
      background-color: #fffdf8;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.08),
        0 1px 1px rgb(0 0 0 / 0.22),
        0 3px 5px -2px rgb(0 0 0 / 0.32);
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical);
    }
    .tl-desenho {
      display: block;
      width: 100%;
      height: 100%;
      padding: 3px;
    }
    .tl-jeito:hover .tl-papel {
      translate: 0 -1px;
    }
    .on .tl-papel {
      rotate: -4deg;
      translate: 0 -2px;
      box-shadow:
        0 0 0 1px rgb(21 21 21 / 0.08),
        0 2px 2px rgb(0 0 0 / 0.2),
        0 6px 9px -4px rgb(0 0 0 / 0.42);
    }
    .tl-pin {
      top: -1px;
      left: calc(50% - 13px);
      scale: 0.5;
    }
    .tl-nome {
      max-width: 100%;
      overflow: hidden;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.6rem;
      letter-spacing: 0.01em;
      line-height: 1.1;
      text-overflow: ellipsis;
      text-transform: uppercase;
    }
    .on .tl-nome {
      color: var(--ink);
    }
    @media (prefers-reduced-motion: reduce) {
      .tl-papel {
        transition: none;
      }
      .on .tl-papel {
        rotate: none;
      }
    }
  `,
})
export class TableLooks {
  readonly jeito = input.required<TableLook>();
  readonly pick = output<TableLook>();
  protected readonly looks = TABLE_LOOKS;
}
