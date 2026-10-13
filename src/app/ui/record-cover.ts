import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input, linkedSignal, signal } from '@angular/core';
import { PickedGame, initialOf } from '../core/review';
import { parseAudio } from '../core/widgets';
import { AudioTrack } from './audio-track';

/**
 * A capa das fichas do mural de músicas: no lugar da foto encapada, o vinil saindo da capa do
 * álbum, o mesmo do widget Áudio (ui/audio-track.ts, o desenho é um só: ui/_vinyl.scss). Com o link
 * da amostra no item (`game.sample`), o botão no meio do disco toca ali mesmo.
 *
 * O disco parado é só desenho. O player de verdade (que pesa, e ouve a janela inteira) só é montado
 * quando a pessoa pede para tocar: um mural com cem discos não tem cem players.
 *
 * - `tucked`: o disco só aponta para fora da capa, parado (a ficha simples e a de capa e nome).
 * - `still`: sem o botão de tocar (a ficha em segredo).
 * - `bar`: tocando, a barra de arrastar aparece embaixo (a leitura).
 */
@Component({
  selector: 'app-record-cover',
  imports: [AudioTrack, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.enfiado]': 'tucked()' },
  template: `
    @if (started() && args(); as a) {
      @defer (on immediate) {
        <app-audio-track [args]="a" [art]="art()" [bare]="true" [withBar]="bar()" [autoplay]="true" [sleeve]="game().name" [spoken]="spoken()" />
      } @placeholder {
        <ng-container *ngTemplateOutlet="parado; context: { esperando: true }" />
      }
    } @else {
      <ng-container *ngTemplateOutlet="parado; context: { esperando: false }" />
    }

    <ng-template #parado let-esperando="esperando">
      <div class="vitrola">
        <div class="disco" data-colado>
          <span class="sulcos">
            <span class="selo"><span class="selo-a">Lado A</span><span class="selo-b">Estéreo</span></span>
          </span>
          <span class="disco-brilho" aria-hidden="true"></span>
          @if (playable()) {
            <button type="button" class="tocar-disco tocavel" [attr.aria-label]="'Tocar: ' + spoken()" aria-pressed="false" [attr.aria-busy]="esperando || null" (click)="start($event)">
              @if (esperando) {
                <span class="aro" aria-hidden="true"></span>
              } @else {
                <svg class="triangulo" viewBox="0 0 24 24" aria-hidden="true"><path d="M8.6 5.6c0-.9 1-1.5 1.8-1l9 6.4c.7.5.7 1.5 0 2l-9 6.4c-.8.5-1.8 0-1.8-1z" /></svg>
              }
            </button>
          }
        </div>
        <div class="capa" data-colado [class.parda]="!art()">
          @if (art(); as src) {
            <img class="arte" [src]="src" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" (error)="failed.set(src)" />
          } @else {
            <span class="capa-nome">{{ game().name || initial() }}</span>
          }
          <span class="capa-gasta" aria-hidden="true"></span>
        </div>
      </div>
    </ng-template>
  `,
  styles: `
    @use 'vinyl';

    :host {
      display: block;
      container-type: inline-size;
      /* o lado da capa: o vinil inteiro (a capa e o disco para fora) ocupa a largura da caixa */
      --s: calc(100cqw / 1.72);
      --giro: 0deg;
    }

    @include vinyl.record;

    /* a capa do álbum já é quadrada: não tem as tarjas pretas da foto do YouTube */
    .capa img.arte {
      scale: none;
    }
    /* parado, o disco não gira (e uma animação pausada em cada ficha do mural pesaria à toa) */
    .sulcos {
      animation: none;
    }
    svg {
      display: block;
    }
    .triangulo {
      margin-left: 0.08em;
    }
    /* esperando o player chegar: o aro de caneta, como no widget */
    .aro {
      display: block;
      width: 0.95em;
      height: 0.95em;
      border: 0.16em solid currentColor;
      border-right-color: transparent;
      border-radius: 50%;
      box-sizing: border-box;
      animation: aro-gira 700ms linear infinite;
    }
    @keyframes aro-gira {
      to {
        rotate: 1turn;
      }
    }

    /* Enfiado: o disco só aponta para fora (um quarto dele), e a capa ocupa quase a caixa toda */
    :host(.enfiado) {
      --s: calc(100cqw / 1.3);
    }
    :host(.enfiado) .vitrola {
      width: 13em;
    }
    :host(.enfiado) .disco {
      left: 3.25em;
    }

    @media (prefers-reduced-motion: reduce) {
      .aro {
        animation: none;
        border-right-color: currentColor;
        opacity: 0.6;
      }
    }
  `,
})
export class RecordCover {
  readonly game = input.required<PickedGame>();
  readonly tucked = input(false);
  readonly still = input(false);
  readonly bar = input(false);

  /** A capa que não abriu, pelo endereço: trocar de capa recomeça. */
  protected readonly failed = signal<string | null>(null);
  protected readonly art = computed(() => {
    const url = this.game().coverUrl;
    return url && this.failed() !== url ? url : null;
  });
  protected readonly initial = computed(() => initialOf(this.game().name));

  /** O link da amostra, se é um som que o site sabe tocar. */
  private readonly sample = computed(() => {
    const url = this.game().sample;
    return url && parseAudio(url) ? url : null;
  });
  protected readonly playable = computed(() => !!this.sample() && !this.tucked() && !this.still());
  /** O player como o widget o lê: o link e o jeito (o vinil). */
  protected readonly args = computed(() => (this.playable() ? [this.sample()!, 'vinil'] : null));
  /** "Airbag, de OK Computer" (a faixa de destaque de um álbum) ou só o nome. */
  protected readonly spoken = computed(() => {
    const g = this.game();
    return g.sampleTitle ? `${g.sampleTitle}, de ${g.name}` : g.name;
  });

  /** A pessoa pediu para tocar: o player entra no lugar do desenho. Outro link volta ao desenho parado. */
  protected readonly started = linkedSignal({ source: this.sample, computation: () => false });

  protected start(e: Event): void {
    e.preventDefault();
    e.stopPropagation();
    this.started.set(true);
  }
}
