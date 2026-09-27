import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ArrowDown, ArrowUp, LucideAngularModule } from 'lucide-angular';
import {
  RATED_KEYS,
  Review,
  SCORE_ABBR,
  SCORE_LABEL,
  ScoreKey,
  WEIGHT_LABEL,
  dayLabel,
  formatHours,
  formatScore,
  parseDay,
  weightOf,
} from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { CoverSleeve } from './cover-sleeve';
import { Pin } from './pin';
import { ScoreBurst } from './score-burst';
import { StatusLabel } from './status-label';
import { VerdictStamp } from './verdict';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });


@Component({
  selector: 'app-review-card',
  imports: [LucideAngularModule, Pin, ScoreBurst, StatusLabel, CoverSleeve, VerdictStamp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cartolina',
    '[class.is-landing]': 'landing()',
    '[class.compact]': 'compact()',
    '[class.highlight-sort]': 'highlight() !== null',
    '[style.--stock]': '"var(--stock-" + pin().stock + ")"',
    '[style.--tilt]': 'pin().tilt',
    '[style.--pin-x]': 'pin().pinX + "%"',
    '[style.--drop-y]': 'pin().dropY + "px"',
    '[style.view-transition-name]': '"ficha-" + review().id',
  },
  template: `
    <app-pin class="pin" [color]="pin().pinColor" />

    <div class="cover-wrap">
      <app-cover-sleeve [game]="review().game" />
      @if (review().verdict; as v) {
        <app-verdict-stamp class="stamp" [value]="v" />
      }
      <app-score-burst class="burst" [value]="review().scores.final" [class.hl]="highlight() === 'final'" />
    </div>

    <h3 class="title">{{ review().game.name }}</h3>
    <p class="meta">
      <time [attr.datetime]="review().completedAt" [title]="dateTitle()">{{ date() }}</time>
      @if (review().hoursPlayed !== null && !compact()) {
        <span aria-hidden="true"> · </span><span [title]="'Tempo jogado'">{{ hours() }}</span>
      }
    </p>

    @if (!compact()) {
      <!-- Boletim: as notas numa fileira só de casinhas, como caderneta de professor -->
      <dl class="boletim" [style.--cols]="subKeys().length">
        @for (k of subKeys(); track k) {
          <div class="cell" [class.hl]="highlight() === k">
            <dt>
              <span aria-hidden="true">{{ short[k] }}</span><span class="sr-only">{{ labels[k] }}</span>
              @switch (weightOf(review().weights, k)) {
                @case ('relevante') {
                  <lucide-icon class="w" [img]="UpIcon" [size]="10" [strokeWidth]="3.4" [title]="weightLabels.relevante" />
                }
                @case ('pouco') {
                  <lucide-icon class="w" [img]="DownIcon" [size]="10" [strokeWidth]="3.4" [title]="weightLabels.pouco" />
                }
              }
            </dt>
            <dd>{{ fmt(review().scores[k]) }}</dd>
          </div>
        }
      </dl>

      @if (review().text.trim()) {
        <p class="excerpt">{{ review().text }}</p>
      }
    }

    <div class="tags">
      <app-status-label [status]="review().status" />
    </div>

    <button type="button" class="hit" (click)="opened.emit(review().id)">
      <span class="sr-only">Abrir resenha de {{ review().game.name }}</span>
    </button>
  `,
  styles: `
    :host {
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 300px;
      justify-self: center;
      margin-top: var(--drop-y);
      padding: 22px 16px 16px;
      border-radius: 2px;
      box-shadow: var(--shadow-card);
      rotate: calc(var(--tilt) * 1deg);
      transform-origin: var(--pin-x) 14px;
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical),
        box-shadow var(--t-ui) var(--ease-ui);
    }

    /* Empurrãozinho: a ficha gira em volta da tachinha e desgruda da parede */
    :host(:hover),
    :host(:focus-within) {
      rotate: calc(var(--tilt) * 0.35deg);
      translate: 0 -3px;
      box-shadow: var(--shadow-lift);
      --shine: 100%;
    }

    .pin {
      top: -9px;
      left: calc(var(--pin-x) - 13px);
    }

    .cover-wrap {
      position: relative;
      margin-bottom: 12px;
    }
    .burst {
      position: absolute;
      right: -22px;
      bottom: -18px;
    }
    /* carimbo batido no canto da capa, meio para fora */
    .stamp {
      position: absolute;
      left: -10px;
      top: 14px;
      z-index: 2;
    }

    .title {
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.32rem;
      line-height: 1.12;
      letter-spacing: 0.005em;
      text-wrap: balance;
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      padding-right: 36px;
    }
    .meta {
      margin-top: 4px;
      font-family: var(--f-label);
      font-weight: 600;
      font-size: 0.86rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      color: var(--ink-2);
    }

    .boletim {
      display: grid;
      grid-template-columns: repeat(var(--cols, 4), minmax(0, 1fr));
      margin: 12px 0 0;
      border-block: 1.5px solid rgb(21 21 21 / 0.32);
    }
    .cell {
      display: grid;
      justify-items: center;
      gap: 1px;
      padding: 5px 2px 4px;
      min-width: 0;
    }
    .cell + .cell {
      border-left: 1.5px solid rgb(21 21 21 / 0.2);
    }
    dt {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.72rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: var(--ink-2);
      line-height: 1;
    }
    dd {
      margin: 0;
      font-family: var(--f-marker);
      font-size: 1.3rem;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .w {
      display: inline-flex;
    }
    /* marca-texto na casinha da nota que está ordenando o mural */
    .cell.hl {
      background: linear-gradient(transparent 6%, rgb(255 255 255 / 0.55) 6% 94%, transparent 94%);
    }

    .excerpt {
      margin-top: 10px;
      font-family: var(--f-hand);
      font-size: 1.02rem;
      line-height: 1.38;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }

    /* o status fecha o que foi escrito; ficha com menos texto fica com papel em branco embaixo */
    .tags {
      display: flex;
      align-items: center;
      padding-top: 14px;
    }

    .hit {
      position: absolute;
      inset: 0;
      z-index: 4;
      border: 0;
      padding: 0;
      background: transparent;
      border-radius: 2px;
    }
    .hit:focus-visible {
      outline-offset: 6px;
    }

    /* Ficha simples: capa, nome, data, média, status e veredito */
    :host(.compact) {
      padding: 18px 12px 12px;
    }
    :host(.compact) .cover-wrap {
      margin-bottom: 10px;
    }
    :host(.compact) .burst {
      right: -18px;
      bottom: -16px;
      scale: 0.86;
      transform-origin: 100% 100%;
    }
    :host(.compact) .title {
      font-size: 1.1rem;
      -webkit-line-clamp: 2;
      padding-right: 22px;
    }
    :host(.compact) .tags {
      padding-top: 10px;
    }

    /* Chegada ao mural: a ficha cai, a tachinha entra com força */
    :host(.is-landing) {
      animation: land 620ms var(--ease-physical) both;
    }
    :host(.is-landing) .pin {
      animation: punch 520ms 260ms var(--ease-physical) both;
    }
    @keyframes land {
      0% {
        translate: 0 -70px;
        scale: 1.08;
        rotate: calc(var(--tilt) * 3deg);
        opacity: 0;
        box-shadow: var(--shadow-lift);
      }
      55% {
        opacity: 1;
      }
    }
    @keyframes punch {
      0% {
        scale: 2.2;
        opacity: 0;
      }
      60% {
        scale: 0.9;
        opacity: 1;
      }
    }

    /* Celular: duas colunas de fichas compactas, o mural continua sendo um mural */
    @media (max-width: 559px) {
      :host {
        rotate: calc(var(--tilt) * 0.55deg);
        padding: 16px 10px 12px;
        margin-top: calc(var(--drop-y) * 0.5);
      }
      .pin {
        top: -8px;
        scale: 0.85;
      }
      .cover-wrap {
        margin-bottom: 10px;
      }
      .stamp {
        left: -6px;
        top: 8px;
        scale: 0.86;
        transform-origin: 0 0;
      }
      .burst {
        right: -14px;
        bottom: -14px;
        scale: 0.74;
        transform-origin: 100% 100%;
      }
      .title {
        font-size: 1.02rem;
        padding-right: 18px;
      }
      .meta {
        font-size: 0.74rem;
      }
      .boletim {
        margin-top: 8px;
      }
      .cell {
        padding: 4px 1px 3px;
      }
      dt {
        font-size: 0.62rem;
        letter-spacing: 0.04em;
      }
      dd {
        font-size: 1.05rem;
      }
      .excerpt {
        display: none;
      }
      .tags {
        padding-top: 10px;
      }
      .tags app-status-label {
        scale: 0.86;
        transform-origin: 0 50%;
      }
    }
  `,
})
export class ReviewCard {
  readonly review = input.required<Review>();
  readonly landing = input(false);
  /** Qual nota está sendo usada na ordenação (para destacar na ficha). */
  readonly highlight = input<ScoreKey | null>(null);
  readonly compact = input(false);
  readonly opened = output<string>();

  protected readonly pin = computed(() => pinningFor(this.review().id, this.review().stock));
  protected readonly date = computed(() => dateFmt.format(parseDay(this.review().completedAt)).replace(/\./g, ''));
  protected readonly dateTitle = computed(() => `${dayLabel(this.review().status)} ${this.date()}`);
  /** Categorias que o jogo "não tem" nem aparecem na ficha. */
  protected readonly subKeys = computed(() => RATED_KEYS.filter((k) => weightOf(this.review().weights, k) !== 'nao-tem'));
  protected readonly hours = computed(() => formatHours(this.review().hoursPlayed));
  protected readonly weightOf = weightOf;
  protected readonly weightLabels = WEIGHT_LABEL;
  protected readonly UpIcon = ArrowUp;
  protected readonly DownIcon = ArrowDown;
  protected readonly fmt = formatScore;
  protected readonly labels = SCORE_LABEL;
  protected readonly short = SCORE_ABBR;
}
