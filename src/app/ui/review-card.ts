import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ArrowDown, ArrowUp, LucideAngularModule } from 'lucide-angular';
import {
  DIFFICULTY_LABEL,
  RATED_KEYS,
  Review,
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
import { Skulls } from './difficulty';
import { Pin } from './pin';
import { ScoreBurst } from './score-burst';
import { StatusLabel } from './status-label';
import { VerdictStamp } from './verdict';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });


@Component({
  selector: 'app-review-card',
  imports: [LucideAngularModule, Pin, ScoreBurst, StatusLabel, CoverSleeve, Skulls, VerdictStamp],
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
      @if (review().game.year && !compact()) {
        <span>{{ review().game.year }}</span><span aria-hidden="true"> · </span>
      }
      <time [attr.datetime]="review().completedAt" [title]="dateTitle()">{{ date() }}</time>
      @if (review().hoursPlayed !== null && !compact()) {
        <span aria-hidden="true"> · </span><span [title]="'Tempo jogado'">{{ hours() }}</span>
      }
    </p>

    @if (!compact()) {
      <dl class="subs">
        @for (k of subKeys(); track k) {
          <div class="row" [class.hl]="highlight() === k">
            <dt>
              {{ labels[k] }}
              @switch (weightOf(review().weights, k)) {
                @case ('relevante') {
                  <lucide-icon class="w" [img]="UpIcon" [size]="13" [strokeWidth]="3" [title]="weightLabels.relevante" />
                }
                @case ('pouco') {
                  <lucide-icon class="w" [img]="DownIcon" [size]="13" [strokeWidth]="3" [title]="weightLabels.pouco" />
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
      @if (review().difficulty !== 'nenhuma' && !compact()) {
        <app-skulls [value]="review().difficulty" [size]="15" [showLabel]="false" [ghosts]="false" [title]="difficultyLabel()" />
      }
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

    .subs {
      margin: 12px 0 0;
      display: grid;
      gap: 1px;
    }
    .row {
      display: flex;
      align-items: baseline;
      gap: 6px;
      padding: 1px 4px;
      margin: 0 -4px;
      border-radius: 2px;
    }
    .row::after {
      /* pontilhado feito à caneta ligando nome e nota */
      content: '';
      order: 1;
      flex: 1;
      border-bottom: 2px dotted rgb(21 21 21 / 0.35);
      translate: 0 -4px;
    }
    dt {
      order: 0;
      display: inline-flex;
      align-items: center;
      gap: 3px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      color: var(--ink-2);
    }
    dd {
      order: 2;
      margin: 0;
      min-width: 1.4ch;
      text-align: right;
      font-family: var(--f-marker);
      font-size: 1.2rem;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    .w {
      display: inline-flex;
    }
    /* destaque de marca-texto quando o mural está ordenado por essa nota */
    .row.hl {
      background: linear-gradient(transparent 18%, rgb(255 255 255 / 0.55) 18% 88%, transparent 88%);
    }

    .excerpt {
      margin-top: 10px;
      font-family: var(--f-hand);
      font-size: 1.02rem;
      line-height: 1.38;
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
    }

    .tags {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      justify-content: space-between;
      gap: 8px;
      margin-top: 14px;
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
      margin-top: 10px;
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
      .subs {
        margin-top: 8px;
      }
      dt {
        font-size: 0.72rem;
        letter-spacing: 0.05em;
      }
      dd {
        font-size: 1rem;
      }
      .excerpt {
        display: none;
      }
      .tags {
        margin-top: 10px;
        gap: 6px;
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
  protected readonly difficultyLabel = computed(() => 'Dificuldade: ' + DIFFICULTY_LABEL[this.review().difficulty]);
  /** Categorias que o jogo "não tem" nem aparecem na ficha. */
  protected readonly subKeys = computed(() => RATED_KEYS.filter((k) => weightOf(this.review().weights, k) !== 'nao-tem'));
  protected readonly hours = computed(() => formatHours(this.review().hoursPlayed));
  protected readonly weightOf = weightOf;
  protected readonly weightLabels = WEIGHT_LABEL;
  protected readonly UpIcon = ArrowUp;
  protected readonly DownIcon = ArrowDown;
  protected readonly fmt = formatScore;
  protected readonly labels = SCORE_LABEL;
}
