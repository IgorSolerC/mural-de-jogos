import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AudioTrack } from './audio-track';
import { Countdown } from './countdown';
import { GluedMedia } from './glued-media';

/**
 * Um widget do texto (ver core/widgets.ts), desenhado pelo componente dele. Cada widget novo ganha
 * um `@case` aqui e um componente seu, que recebe os parâmetros como foram escritos.
 */
@Component({
  selector: 'app-note-widget',
  imports: [AudioTrack, Countdown, GluedMedia],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @switch (name()) {
      @case ('contador') {
        <app-countdown [args]="args()" />
      }
      @case ('imagem') {
        <app-glued-media kind="imagem" [args]="args()" />
      }
      @case ('video') {
        <app-glued-media kind="video" [args]="args()" />
      }
      @case ('audio') {
        <app-audio-track [args]="args()" />
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
