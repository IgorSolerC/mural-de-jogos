import { ChangeDetectionStrategy, Component, inject, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { Player, Players } from '../core/players';

/**
 * "Mural de quem?": as plaquinhas para escolher com que mural os jogos de Extras jogam, o seu ou o de
 * um colega aberto em Comparar. Cada jogo diz quantas fichas conta (`countOf`) e o mínimo para jogar.
 */
@Component({
  selector: 'app-player-picker',
  imports: [RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <fieldset>
      <legend class="rotulo">Mural de quem?</legend>
      <div class="plates" role="group" aria-label="Mural de quem">
        @for (p of players.all(); track p.id) {
          <button
            type="button"
            class="plate"
            [attr.aria-pressed]="players.selected().id === p.id"
            [disabled]="count(p) < min()"
            (click)="players.select(p.id)"
          >
            {{ p.name }} <span class="count">{{ count(p) }}</span>
          </button>
        }
      </div>
      @if (players.all().length === 1) {
        <p class="nota">Para jogar com as fichas de um colega, abra o backup dele em <a routerLink="/comparar">Comparar</a>.</p>
      }
    </fieldset>
  `,
  styles: `
    :host {
      display: block;
    }

    fieldset {
      margin: 22px 0 0;
      padding: 0;
      border: 0;
    }

    .rotulo {
      margin-bottom: 10px;
      padding: 0;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.12em;
      text-transform: uppercase;
    }

    .plates {
      display: flex;
      flex-wrap: wrap;
      gap: 6px;
      padding-top: 4px;
      border-bottom: 3px solid var(--ink);
    }

    .nota {
      margin-top: 10px;
      font-family: var(--f-hand);
      font-size: 1.05rem;
      line-height: 1.3;

      a {
        color: inherit;
        text-decoration-thickness: 2px;
        text-underline-offset: 3px;
      }
    }
  `,
})
export class PlayerPicker {
  protected readonly players = inject(Players);
  /** Quantas fichas desse mural servem para o jogo (todas, por padrão). */
  readonly countOf = input<(p: Player) => number>((p) => p.reviews.length);
  /** O mínimo de fichas para o mural poder ser escolhido. */
  readonly min = input(2);

  protected count(p: Player): number {
    return this.countOf()(p);
  }
}
