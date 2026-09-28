import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ArrowDown, ArrowUp, LucideAngularModule } from 'lucide-angular';
import {
  RATED_KEYS,
  Review,
  SCORE_LABEL,
  ScoreKey,
  STATUS_LABEL,
  VERDICT_LABEL,
  WEIGHT_LABEL,
  dayLabel,
  formatHours,
  formatScore,
  leadSentence,
  parseDay,
  weightOf,
} from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { CoverSleeve } from './cover-sleeve';
import { PenMark } from './pen-mark';
import { Pin } from './pin';
import { StatusLabel } from './status-label';
import { VERDICT_ICON } from './verdict';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/**
 * Ficha de balcão: a cartolina é o cartaz escrito à mão do dono da locadora, e a caixa do jogo é
 * um objeto preso nela com fita-crepe. Na arte, só a faixa de status impressa no pé da caixa. O julgamento é um par de mesmo
 * peso: a Média escrita a pincel como preço de cartaz e o carimbo do veredito batido ao lado.
 */
@Component({
  selector: 'app-review-card',
  imports: [LucideAngularModule, Pin, PenMark, StatusLabel, CoverSleeve],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cartolina',
    '[class.is-landing]': 'landing()',
    '[class.compact]': 'compact()',
    '[class.picking]': 'picking()',
    '[class.picked]': 'pickedAt() !== null',
    '[style.--stock]': '"var(--stock-" + pin().stock + ")"',
    '[style.--tilt]': 'pin().tilt',
    '[style.--pin-x]': 'pinX() + "%"',
    '[style.--drop-y]': 'pin().dropY + "px"',
    '[style.view-transition-name]': '"ficha-" + review().id',
  },
  template: `
    <app-pin class="pin" [color]="pin().pinColor" />

    <div class="head">
      <div class="cover">
        <div class="box">
          <app-cover-sleeve [game]="review().game" [decorative]="true" [size]="compact() ? 'thumb' : 'card'">
            <!-- Finalizado é o normal e não se anuncia; o que foge do normal vem impresso na faixa da capa -->
            @if (review().status !== 'finalizado') {
              <app-status-label class="faixa" [status]="review().status" [band]="true" />
            }
          </app-cover-sleeve>
          <span class="tape tape-a" aria-hidden="true"></span>
          <span class="tape tape-b" aria-hidden="true"></span>
        </div>
      </div>

      <div class="words">
        <h4 class="title">{{ review().game.name }}</h4>
        <p class="meta">
          <time [attr.datetime]="review().completedAt">{{ date() }}</time>
          @if (review().hoursPlayed !== null && !compact()) {
            <span aria-hidden="true"> · </span><span>{{ hours() }}</span>
          }
          @if (compact() && sortedCell(); as c) {
            <span aria-hidden="true"> · </span><span class="sorted">{{ labels[c.key] }} {{ c.value }}<app-pen-mark /></span>
          }
        </p>
      </div>

      <!-- O julgamento: etiqueta dupla, a Média no papel e o veredito na faixa da cor dele -->
      <div class="judge">
        <p
          class="grade"
          role="img"
          [attr.aria-label]="'Média ' + grade().text + ' de 10'"
          [class.top]="grade().top"
        >
          <span class="int" aria-hidden="true">{{ grade().int }}</span>
          @if (grade().dec) {
            <span class="dec" aria-hidden="true">,{{ grade().dec }}</span>
          }
        </p>
        @if (review().verdict; as v) {
          <p class="band" [class.gold]="v === 'masterpiece'" role="img" [attr.aria-label]="'Veredito: ' + verdictLabels[v]" [style.--v]="'var(--verdict-' + v + '-lit)'">
            <lucide-icon [img]="verdictIcons[v]" [size]="compact() ? 16 : 19" [strokeWidth]="2.6" aria-hidden="true" />
            <span aria-hidden="true">{{ verdictLabels[v] }}</span>
          </p>
        }
      </div>
    </div>

    @if (!compact()) {
      @if (lead(); as line) {
        <p class="lead">“{{ line }}”</p>
      }

      <!-- Boletim: quatro casas fixas, sempre na mesma ordem, para comparar ficha com ficha -->
      <dl class="boletim">
        @for (c of cells(); track c.key) {
          <div class="cell" [class.off]="c.off">
            <dt>
              {{ labels[c.key] }}
              @if (highlight() === c.key) {
                <app-pen-mark />
              }
            </dt>
            <dd>
              @if (c.off) {
                <span aria-hidden="true">—</span><span class="sr-only">não tem</span>
              } @else {
                {{ c.value }}
                @switch (c.weight) {
                  @case ('relevante') {
                    <lucide-icon class="w" [img]="UpIcon" [size]="13" [strokeWidth]="3.2" aria-hidden="true" />
                    <span class="sr-only">({{ weightLabels.relevante }})</span>
                  }
                  @case ('pouco') {
                    <lucide-icon class="w" [img]="DownIcon" [size]="13" [strokeWidth]="3.2" aria-hidden="true" />
                    <span class="sr-only">({{ weightLabels.pouco }})</span>
                  }
                }
              }
            </dd>
          </div>
        }
      </dl>
    }

    <!-- Marcando para o lado a lado: o adesivo redondo no canto diz se a ficha vai e em que ordem -->
    @if (picking()) {
      <span class="marca" aria-hidden="true">
        @if (pickedAt(); as n) {
          <span class="n">{{ n }}</span>
        }
      </span>
      <button
        type="button"
        class="hit"
        [attr.aria-label]="'Marcar pra ver lado a lado: ' + review().game.name"
        [attr.aria-pressed]="pickedAt() !== null"
        (click)="toggled.emit(review().id)"
      ></button>
    } @else {
      <button type="button" class="hit" [attr.aria-label]="spoken()" (click)="opened.emit(review().id)"></button>
    }
  `,
  styles: `
    :host {
      --pad: 16px;
      --cover-w: 112px;
      position: relative;
      display: flex;
      flex-direction: column;
      width: 100%;
      max-width: 440px;
      justify-self: center;
      margin-top: var(--drop-y);
      padding: var(--pad) var(--pad) 14px;
      border-radius: 2px;
      box-shadow: var(--shadow-card);
      rotate: calc(var(--tilt) * 1deg);
      transform-origin: var(--pin-x) 12px;
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
    /* no toque: a ficha volta a encostar na parede */
    :host(:active) {
      translate: 0 0;
      box-shadow: var(--shadow-card);
      transition-duration: 80ms;
    }
    /* O foco fica na parede, em volta da ficha: amarelo, não preto sobre grafite */
    :host(:has(.hit:focus-visible)) {
      outline: 3px solid var(--hi);
      outline-offset: 5px;
    }
    .hit:focus-visible {
      outline: none;
    }

    .pin {
      top: -9px;
      left: calc(var(--pin-x) - 13px);
    }

    /* ===== Cabeça: caixa do jogo presa com fita + o que o dono escreveu + o julgamento ===== */
    .head {
      display: grid;
      grid-template-columns: var(--cover-w) minmax(0, 1fr);
      grid-template-areas:
        'cover words'
        'cover judge';
      grid-template-rows: auto 1fr;
      gap: 0 16px;
      align-items: start;
    }

    .cover {
      grid-area: cover;
      min-width: 0;
    }
    .box {
      position: relative;
      rotate: calc(var(--tilt) * -0.6deg);
    }
    /* a faixa de status, impressa no pé da arte, de uma borda à outra */
    .faixa {
      position: absolute;
      inset: auto 0 0;
    }
    .tape {
      position: absolute;
      top: -6px;
      width: 36px;
      height: 14px;
      background-color: rgb(222 205 160 / 0.86);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      clip-path: polygon(0 12%, 4px 50%, 0 88%, 100% 100%, calc(100% - 4px) 50%, 100% 0);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3));
      z-index: 2;
    }
    .tape-a {
      left: -12px;
      rotate: -38deg;
    }
    .tape-b {
      right: -12px;
      rotate: 36deg;
    }

    .words {
      grid-area: words;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
      /* a tachinha fura o papel acima do nome, sem encostar nele */
      padding-top: 10px;
    }
    .title {
      max-width: 100%;
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.62rem;
      line-height: 1.04;
      letter-spacing: 0.005em;
      text-wrap: balance;
      overflow-wrap: anywhere;
      /* duas linhas no máximo; o nome inteiro fica no leitor de tela e na leitura */
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
      padding-bottom: 0.06em;
    }
    .meta {
      margin-top: 6px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      font-variant-numeric: tabular-nums;
    }

    /* ===== O julgamento: etiqueta dupla de preço, como canhoto de locadora =====
       À esquerda, a Média impressa em papel branco; à direita, o veredito numa faixa na cor dele.
       As duas metades têm a mesma altura e o mesmo peso, unidas por um picote com entalhes. */
    .judge {
      --notch: 5px;
      grid-area: judge;
      justify-self: start;
      display: flex;
      align-items: stretch;
      min-height: 58px;
      margin-top: 14px;
      /* sombra que segue o recorte dos entalhes, colada na cartolina */
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 5px 6px rgb(0 0 0 / 0.22));
      rotate: calc(var(--tilt) * -0.5deg - 1deg);
    }
    .grade {
      display: flex;
      align-items: center;
      justify-content: center;
      min-width: 76px;
      padding: 4px 14px 3px 13px;
      border-radius: 3px;
      background: var(--paper);
      color: var(--ink);
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .int {
      font-size: 2.9rem;
      letter-spacing: -0.03em;
    }
    .dec {
      font-size: 1.9rem;
      letter-spacing: -0.02em;
      /* a vírgula e a casa decimal no mesmo pé do inteiro, só menores */
      align-self: flex-end;
      margin-bottom: 0.2em;
    }
    /* 9 ou mais: o número sai em vermelho, como nota alta de professor */
    .grade.top {
      color: var(--red-deep);
    }
    .band {
      position: relative;
      display: flex;
      align-items: center;
      gap: 7px;
      padding: 0 18px 0 17px;
      border-radius: 0 3px 3px 0;
      /* picote: a linha pontilhada onde o canhoto se destaca */
      border-left: 2px dotted rgb(255 255 255 / 0.5);
      /* uma tinta só, a do pincel: preto assenta em qualquer uma das seis cartolinas */
      background: var(--ink);
      color: var(--paper);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 1.02rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      line-height: 1;
      white-space: nowrap;
      mask:
        radial-gradient(circle at 0 0, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) top / 100% 51% no-repeat,
        radial-gradient(circle at 0 100%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) bottom / 100% 51% no-repeat;
    }
    /* Moldura interna do selo, desligada por enquanto: repensar o desenho antes de voltar.
    .band::after {
      content: '';
      position: absolute;
      inset: 4px 4px 4px 6px;
      border: 2.5px solid currentColor;
      border-radius: 2px;
      pointer-events: none;
    }
    :host(.compact) .band::after {
      inset: 3px 3px 3px 5px;
      border-width: 2px;
    }
    */
    /* Masterpiece: o mesmo canhoto preto, com a palavra e o fio da moldura estampados a quente
       em folha de ouro. O brilho corre pela folha quando a ficha levanta, como no Platinado. */
    .band.gold {
      border-left-color: rgb(243 210 122 / 0.55);
      transition: --shine 900ms var(--ease-physical);
    }
    .band.gold::after {
      content: '';
      position: absolute;
      inset: 4px 4px 4px 5px;
      border: 1.5px solid #d8ab48;
      border-radius: 2px;
      pointer-events: none;
    }
    .band.gold span {
      background:
        linear-gradient(115deg, transparent 25%, rgb(255 255 255 / 0.95) 45%, transparent 60%) calc(var(--shine) * 1.6 - 60%) 0 / 220% 100% no-repeat,
        linear-gradient(100deg, #d8ab48 0%, #f7dc8a 30%, #fff4c4 45%, #e3b857 65%, #f3d27a 100%);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
    }
    .band lucide-icon {
      display: inline-flex;
      margin-top: -1px;
      color: var(--v);
    }
    /* os entalhes de ticket, em cima e embaixo, onde as duas metades se encontram */
    .grade:not(:only-child) {
      border-radius: 3px 0 0 3px;
      mask:
        radial-gradient(circle at 100% 0, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) top / 100% 51% no-repeat,
        radial-gradient(circle at 100% 100%, #0000 var(--notch), #000 calc(var(--notch) + 0.5px)) bottom / 100% 51% no-repeat;
    }

    /* ===== A frase do dono, inteira, na letra dele ===== */
    .lead {
      margin-top: 14px;
      font-family: var(--f-hand);
      font-size: 1.1rem;
      line-height: 1.36;
      text-wrap: pretty;
      overflow-wrap: anywhere;
    }

    /* ===== Boletim ===== */
    .boletim {
      display: grid;
      grid-template-columns: repeat(4, minmax(0, 1fr));
      /* o boletim vem logo depois do que foi escrito; o papel que sobra fica no pé, como ficha de fichário */
      margin: 0;
      padding-top: 14px;
    }
    .boletim::before {
      content: '';
      grid-column: 1 / -1;
      height: 1.5px;
      margin-bottom: 1px;
      background: rgb(21 21 21 / 0.34);
    }
    .cell {
      display: grid;
      justify-items: center;
      /* espaço fixo para o risco de caneta: a casa não muda de altura quando a ordem muda */
      gap: 6px;
      padding: 6px 2px 2px;
      min-width: 0;
    }
    .cell + .cell {
      border-left: 1.5px solid rgb(21 21 21 / 0.2);
    }
    dt {
      position: relative;
      max-width: 100%;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.01em;
      line-height: 1;
      white-space: nowrap;
      text-overflow: clip;
    }
    dd {
      display: inline-flex;
      align-items: center;
      gap: 1px;
      margin: 0;
      font-family: var(--f-marker);
      font-size: 1.32rem;
      line-height: 1.1;
      font-variant-numeric: tabular-nums;
    }
    /* riscada, mas legível: o risco já diz que não conta */
    .cell.off dt {
      text-decoration: line-through 1.5px;
      opacity: 0.84;
    }
    .w {
      display: inline-flex;
    }

    /* ===== Adesivo de marcação: bolinha de etiqueta colada no canto da cartolina =====
       Vazio, é só o contorno tracejado de onde o adesivo vai; marcado, é um disco de tinta com o
       número da ordem em amarelo, a mesma dupla do botão de pincel. Lê bem nas seis cartolinas. */
    .marca {
      position: absolute;
      top: -12px;
      right: -12px;
      z-index: 3;
      display: grid;
      place-items: center;
      width: 42px;
      height: 42px;
      border-radius: 50%;
      border: 2.5px dashed rgb(21 21 21 / 0.78);
      background: rgb(246 246 241 / 0.9);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.25);
      rotate: -8deg;
      transition:
        background-color var(--t-ui) var(--ease-ui),
        border-color var(--t-ui) var(--ease-ui);
    }
    :host(.picked) .marca {
      border: 2.5px solid var(--ink);
      background: var(--ink);
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.35), 0 4px 6px -2px rgb(0 0 0 / 0.4);
      animation: stick 280ms var(--ease-physical);
    }
    .marca .n {
      color: var(--hi);
      font-family: var(--f-marker);
      font-size: 1.35rem;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      /* o pincel senta um pouco abaixo do centro óptico */
      translate: 0 1px;
    }
    @keyframes stick {
      from {
        scale: 0.6;
        opacity: 0;
      }
    }

    .hit {
      position: absolute;
      inset: 0;
      z-index: 4;
      border: 0;
      padding: 0;
      background: transparent;
      border-radius: 2px;
      cursor: pointer;
    }

    /* ===== Ficha simples: uma etiqueta de prateleira ===== */
    :host(.compact) {
      --cover-w: 68px;
      padding: 14px 14px 12px;
    }
    /* a coluna do nome é estreita demais para a etiqueta: ela desce e ocupa a largura da tira */
    :host(.compact) .head {
      grid-template-areas:
        'cover words'
        'judge judge';
      grid-template-rows: auto auto;
      gap: 0 12px;
    }
    /* na capinha pequena a faixa é só a palavra, sem ícone, para caber inteira */
    :host(.compact) .faixa {
      --band-h: 16px;
      --band-fs: 0.7rem;
      --band-track: 0.03em;
      --band-icon: none;
    }
    :host(.compact) .tape {
      width: 28px;
      height: 11px;
      top: -5px;
    }
    :host(.compact) .tape-a {
      left: -10px;
    }
    :host(.compact) .tape-b {
      right: -10px;
    }
    :host(.compact) .words {
      padding-top: 6px;
    }
    :host(.compact) .title {
      font-size: 1.24rem;
    }
    :host(.compact) .meta {
      margin-top: 4px;
      font-size: 0.82rem;
    }
    :host(.compact) .judge {
      --notch: 4px;
      min-height: 46px;
      margin-top: 10px;
    }
    :host(.compact) .grade {
      min-width: 60px;
      padding: 3px 11px 2px 10px;
    }
    :host(.compact) .int {
      font-size: 2.25rem;
    }
    :host(.compact) .dec {
      font-size: 1.5rem;
    }
    :host(.compact) .band {
      gap: 6px;
      padding: 0 13px 0 12px;
      font-size: 0.86rem;
    }
    .sorted {
      position: relative;
      white-space: nowrap;
      --pen-y: -4px;
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

    /* Celular: uma coluna de fichas deitadas, na largura toda */
    @media (max-width: 559px) {
      :host {
        --cover-w: 104px;
        max-width: none;
        rotate: calc(var(--tilt) * 0.5deg);
        margin-top: calc(var(--drop-y) * 0.4);
      }
      :host(.compact) {
        --cover-w: 62px;
      }
      :host(.compact) .faixa {
        --band-fs: 0.66rem;
      }
      /* no celular a coluna do nome é estreita: a etiqueta do julgamento desce e ocupa a largura */
      :host(:not(.compact)) .head {
        grid-template-areas:
          'cover words'
          'judge judge';
        grid-template-rows: auto auto;
      }
      .title {
        font-size: 1.46rem;
      }
      :host(.compact) .title {
        font-size: 1.2rem;
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
  /** A seção já diz o mês e o ano: a ficha mostra só o dia. */
  readonly dayOnly = input(false);
  /** Modo de marcar fichas para o lado a lado: tocar marca em vez de abrir. */
  readonly picking = input(false);
  /** Posição da ficha no lado a lado (1, 2, 3…), ou null se não está marcada. */
  readonly pickedAt = input<number | null>(null);
  readonly opened = output<string>();
  readonly toggled = output<string>();

  protected readonly pin = computed(() => pinningFor(this.review().id, this.review().stock));
  /** A tachinha fica no meio do cartaz (42–58%), acima do nome: a fita já segura a capa. */
  protected readonly pinX = computed(() => Math.round(42 + (this.pin().pinX - 40) * 0.8));
  protected readonly date = computed(() =>
    (this.dayOnly() ? dayFmt : dateFmt).format(parseDay(this.review().completedAt)).replace(/\./g, ''),
  );
  protected readonly hours = computed(() => formatHours(this.review().hoursPlayed));
  protected readonly lead = computed(() => leadSentence(this.review().text));

  /** "9,4" → inteiro 9 e decimal 4, escritos em tamanhos diferentes como preço de cartaz. */
  protected readonly grade = computed(() => {
    const v = this.review().scores.final;
    const text = formatScore(v);
    const [int, dec = ''] = text.split(',');
    return { text, int, dec, top: (v ?? 0) >= 9 };
  });

  /** As quatro casas sempre na mesma ordem; a que o jogo "não tem" fica riscada, sem sair do lugar. */
  protected readonly cells = computed(() => {
    const r = this.review();
    return RATED_KEYS.map((key) => {
      const weight = weightOf(r.weights, key);
      return { key, weight, off: weight === 'nao-tem', value: formatScore(r.scores[key]) };
    });
  });

  /** Na ficha simples, a nota que ordena o mural aparece ao lado da data. */
  protected readonly sortedCell = computed(() => {
    const k = this.highlight();
    if (!k || k === 'final') return null;
    const c = this.cells().find((x) => x.key === k);
    return c && !c.off ? c : null;
  });

  /** O que o leitor de tela diz ao chegar no botão da ficha. */
  protected readonly spoken = computed(() => {
    const r = this.review();
    const parts = [r.game.name, `média ${formatScore(r.scores.final)}`];
    if (r.verdict) parts.push(VERDICT_LABEL[r.verdict]);
    parts.push(STATUS_LABEL[r.status]);
    parts.push(`${dayLabel(r.status).toLowerCase()} ${dateFmt.format(parseDay(r.completedAt)).replace(/\./g, '')}`);
    return `Abrir resenha: ${parts.join(', ')}`;
  });

  protected readonly verdictLabels = VERDICT_LABEL;
  protected readonly verdictIcons = VERDICT_ICON;
  protected readonly weightLabels = WEIGHT_LABEL;
  protected readonly UpIcon = ArrowUp;
  protected readonly DownIcon = ArrowDown;
  protected readonly labels = SCORE_LABEL;
}
