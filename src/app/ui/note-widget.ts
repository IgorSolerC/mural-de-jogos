import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Countdown } from './countdown';

/**
 * Um widget do texto (ver core/widgets.ts), desenhado pelo componente dele. Cada widget novo ganha
 * um `@case` aqui e um componente seu, que recebe os parâmetros como foram escritos.
 */
@Component({
  selector: 'app-note-widget',
  imports: [Countdown],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (name()) {
      @case ('contador') {
        <app-countdown [args]="args()" />
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
  `,
})
export class NoteWidget {
  /** O nome do registro ("contador"). */
  readonly name = input.required<string>();
  readonly args = input.required<readonly string[]>();
}
