import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { AudioTrack } from './audio-track';
import { Countdown } from './countdown';
import { GluedMedia } from './glued-media';

/**
 * Um widget do texto (ver core/widgets.ts), desenhado pelo componente dele. Cada widget novo ganha
 * um `@case` aqui e um componente seu, que recebe os parâmetros como foram escritos. Um widget
 * grande (o áudio) vem num `@defer`, para não pesar no carregamento do site.
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
        <!-- a fita, o vinil e o player vêm num pedaço à parte do site, carregado só quando aparece uma faixa -->
        @defer (on immediate) {
          <app-audio-track [args]="args()" />
        } @placeholder {
          <div class="esperando-faixa"></div>
        }
      }
    }
  `,
  styles: `
    :host {
      display: block;
    }
    /* o lugar da faixa enquanto ela chega: a altura de uma tira, para o texto não pular tanto */
    .esperando-faixa {
      min-height: calc(var(--line, 1.5em) * 3);
    }
  `,
})
export class NoteWidget {
  /** O nome do registro ("contador"). */
  readonly name = input.required<string>();
  readonly args = input.required<readonly string[]>();
}
