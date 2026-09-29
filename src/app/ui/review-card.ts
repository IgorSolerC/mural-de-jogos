import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { g, profileOf } from '../core/kinds';
import {
  Bonus,
  DIFFICULTY_LABEL,
  Review,
  SCORE_LABEL,
  ScoreKey,
  VERDICT_LABEL,
  NO_DAY_LABEL,
  dayLabel,
  formatAmount,
  formatScore,
  leadSentence,
  parseDay,
  ratedKeys,
  scoreOf,
  sortBonuses,
  weightOf,
} from '../core/review';
import { cutsPaper } from '../core/paper';
import { paperStyle } from '../core/paper-art';
import { pinningFor } from '../core/wall-physics';
import { BonusSticker, BonusTally, spokenTally } from './bonus';
import { Boletim } from './boletim';
import { CoverSleeve } from './cover-sleeve';
import { JudgeLabel } from './judge-label';
import { Luz } from './luz';
import { Skulls } from './difficulty';
import { PenMark } from './pen-mark';
import { PaperArtLayer } from './paper-layer';
import { Pin } from './pin';
import { StatusLabel } from './status-label';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
/** Quantos adesivos de bônus cabem na ficha antes de o resto virar contagem. */
const MAX_STICKERS = 4;
const dayFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short' });

/**
 * Ficha do mural: uma cartolina escrita à mão a pincel atômico, com a foto do jogo colada nela. Na foto,
 * só a tira de fita de status colada no pé. O julgamento é um par de mesmo peso: a Média e o veredito
 * na mesma etiqueta dupla, com picote no meio.
 */
@Component({
  selector: 'app-review-card',
  imports: [PaperArtLayer, Pin, PenMark, StatusLabel, CoverSleeve, BonusSticker, BonusTally, JudgeLabel, Boletim, Skulls],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a luz da lâmpada segue o ponteiro nas folhas holográficas da ficha levantada
  hostDirectives: [Luz],
  host: {
    class: 'cartolina',
    '[class.is-landing]': 'landing()',
    '[class.compact]': 'compact()',
    '[class.picking]': 'picking()',
    '[class.picked]': 'pickedAt() !== null',
    '[style.--stock]': '"var(--stock-" + pin().stock + ")"',
    '[style.--pen]': 'pin().stock === "vermelho" ? "var(--ink)" : null',
    '[style.--tilt]': 'pin().tilt',
    '[style.--pin-x]': 'pinX() + "%"',
    '[style.--drop-y]': 'pin().dropY + "px"',
    // a prévia no editor não disputa o nome com a ficha de verdade que está no mural
    '[style.view-transition-name]': 'preview() ? null : "ficha-" + review().id',
    '[class.vazia]': 'empty()',
    // o papel escolhido (textura) e, quando falta um pedaço, o papel recortado desenhado nas marcas
    '[style]': 'paperVars()',
    '[class.recortada]': 'cut()',
    '[class.orelha]': 'review().damage === "orelha"',
  },
  template: `
    <!-- o papel da ficha: a cartolina, o rabisco e o estrago, por baixo da foto e dos adesivos -->
    <app-paper-art [id]="review().id" [scribble]="review().scribble" [damage]="review().damage" [seed]="review().damageSeed" [glitter]="review().paper === 'glitter'" [content]="review()" />
    <app-pin class="pin" [color]="pin().pinColor" />

    <div class="head">
      <div class="cover" data-colado>
        <div class="box">
          <app-cover-sleeve [game]="review().game" [decorative]="true" [size]="compact() ? 'thumb' : 'card'">
            <!-- Finalizado é o normal e não se anuncia; o que foge do normal vem impresso na faixa da capa -->
            @if (review().status !== 'finalizado') {
              <app-status-label class="faixa" [status]="review().status" [kind]="review().kind" [band]="true" />
            }
          </app-cover-sleeve>
        </div>
      </div>

      <div class="words">
        <h4 class="title" data-queima>{{ empty() ? emptyName() : review().game.name }}</h4>
        <p class="meta" data-queima>
          @if (review().completedAt; as day) {
            <time [attr.datetime]="day">{{ date() }}</time>
          } @else {
            <span>{{ date() }}</span>
          }
          @if (review().hoursPlayed !== null && !compact()) {
            <span aria-hidden="true"> · </span><span>{{ hours() }}</span>
          }
          @if (review().difficulty !== 'nenhuma') {
            <span aria-hidden="true"> · </span><app-skulls class="caveiras" [value]="review().difficulty" [size]="compact() ? 13 : 14" [showLabel]="false" [ghosts]="false" />
          }
          @if (compact() && sortedCell(); as c) {
            <span aria-hidden="true"> · </span><span class="sorted"><span>{{ labels[c.key] }} </span>@if (c.ten) {<span class="selo-dez">{{ c.value }}</span>} @else if (c.ruim) {<span class="fita-rasgada">{{ c.value }}</span>} @else {<span>{{ c.value }}</span>}<app-pen-mark /></span>
          }
          @if (compact() && bonuses().length) {
            <app-bonus-tally class="tally" [bonuses]="bonuses()" />
          }
        </p>
      </div>

      <!-- O julgamento: etiqueta dupla, a Média no papel e o veredito na faixa preta -->
      <app-judge-label class="judge" data-colado [value]="review().scores.final" [verdict]="review().verdict" [size]="compact() ? 'compact' : 'card'" [fit]="true" />
    </div>

    @if (!compact()) {
      @if (lead(); as line) {
        <p class="lead" data-queima>“{{ line }}”</p>
      }

      <!-- Os bônus: adesivos colados na cartolina, os a favor primeiro -->
      @if (bonuses().length) {
        <ul class="bonus" data-colado aria-label="Bônus">
          @for (b of shownBonuses().shown; track b.id; let i = $index) {
            <li>
              <app-bonus-sticker [bonus]="b" [index]="i" />
              <span class="sr-only">({{ b.kind === 'favor' ? 'a favor' : 'contra' }})</span>
            </li>
          }
          @if (shownBonuses().hidden.length) {
            <li class="mais"><span aria-hidden="true">mais</span> <app-bonus-tally [bonuses]="shownBonuses().hidden" /></li>
          }
        </ul>
      }

      <app-boletim class="boletim" data-queima [review]="review()" [highlight]="highlight()" />
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
        box-shadow var(--t-ui) var(--ease-ui),
        --luz 600ms var(--ease-physical);
    }

    /* O papel é a camada de baixo do app-paper-art (é ela que rasga, queima e dobra); a ficha em si
       não tem fundo. A foto e os adesivos ficam por cima de tudo, inteiros. */
    :host {
      background: none;
    }
    .cover,
    .judge,
    .bonus {
      position: relative;
      z-index: 3;
    }
    /* a orelha dobra a foto e os adesivos junto: a aba (z 3) passa por cima deles */
    :host(.orelha) :is(.cover, .judge, .bonus) {
      z-index: 2;
    }
    /* Faltou um pedaço: a sombra segue o recorte em vez de ser uma caixa */
    :host(.recortada) {
      --land-shadow: none;
      --sombra-papel: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 9px 9px rgb(0 0 0 / 0.42));
    }
    :host(.recortada),
    :host(.recortada:hover),
    :host(.recortada:focus-within),
    :host(.recortada:active) {
      box-shadow: none;
    }
    :host(.recortada:hover),
    :host(.recortada:focus-within) {
      --sombra-papel: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3)) drop-shadow(0 18px 16px rgb(0 0 0 / 0.46));
    }

    /* Empurrãozinho: a ficha gira em volta da tachinha e desgruda da parede */
    :host(:hover),
    :host(:focus-within) {
      rotate: calc(var(--tilt) * 0.35deg);
      translate: 0 -3px;
      box-shadow: var(--shadow-lift);
      --shine: 100%;
    }
    /* com o mouse em cima, a lâmpada bate nas folhas holográficas onde o ponteiro está */
    @media (hover: hover) {
      :host(:hover) {
        --luz: 1;
      }
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

    /* ===== Cabeça: a foto colada + o que foi escrito + o julgamento ===== */
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

    .words {
      grid-area: words;
      display: flex;
      flex-direction: column;
      align-items: flex-start;
      min-width: 0;
      /* a tachinha fura o papel acima do nome, sem encostar nele */
      padding-top: 10px;
    }
    :host(.vazia) .title {
      opacity: 0.4;
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

    /* as caveiras da dificuldade, na mesma linha da data, sentadas na linha do texto */
    .caveiras {
      vertical-align: -2px;
      /* no mural o Infernal fica em tinta preta, como as outras; o roxo mora na leitura e no editor */
      --chifre-ink: currentColor;
    }

    /* ===== A primeira frase da resenha, inteira, na letra de quem escreveu ===== */
    /* a etiqueta ocupa a coluna toda para saber se o veredito cabe; ela mesma encosta à esquerda */
    .judge {
      grid-area: judge;
      min-width: 0;
      margin-top: 14px;
    }

    .lead {
      margin-top: 14px;
      font-family: var(--f-hand);
      font-size: 1.1rem;
      line-height: 1.36;
      text-wrap: pretty;
      overflow-wrap: anywhere;
    }

    /* ===== Adesivos de bônus: colados à mão entre a frase e o boletim ===== */
    .bonus {
      display: flex;
      flex-wrap: wrap;
      gap: 7px 6px;
      margin: 14px 0 0;
      padding: 0 0 0 1px;
      list-style: none;
    }
    .bonus li {
      display: flex;
      max-width: 100%;
    }
    /* passou de quatro: o resto vira contagem, e a lista inteira fica na leitura */
    .bonus .mais {
      align-items: center;
      gap: 5px;
      padding-left: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
    }
    /* na ficha simples, só a contagem na linha da data */
    .tally {
      margin-left: 8px;
    }

    /* o boletim vem logo depois do que foi escrito; o papel que sobra fica no pé, como ficha de fichário */
    .boletim {
      --fios-top: 14px;
      padding-top: 14px;
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

    /* ===== Ficha simples: uma tira de cartolina =====
       Toda tira tem a mesma altura, a de um nome em duas linhas: a folga da tachinha, o nome,
       a data e a etiqueta. A foto, na proporção de sempre, ocupa essa altura inteira, e o nome
       e a etiqueta ficam empilhados ao lado dela. */
    :host(.compact) {
      --title-fs: 1.24rem;
      --strip-h: calc(6px + var(--title-fs) * 2.14 + 4px + 20px + 8px + 42px);
      /* a capinha tem 2px de plástico em volta de uma foto 4:5 */
      --cover-w: calc((var(--strip-h) - 4px) * 0.8 + 4px);
      padding: 14px 14px 12px;
    }
    :host(.compact) .head {
      grid-template-rows: auto 1fr;
      min-height: var(--strip-h);
      gap: 0 12px;
    }
    /* na capinha pequena a faixa é só a palavra, sem ícone, para caber inteira */
    :host(.compact) .faixa {
      --band-h: 16px;
      --band-fs: 0.7rem;
      --band-track: 0.03em;
      --band-icon: none;
    }
    :host(.compact) .words {
      padding-top: 6px;
    }
    :host(.compact) .title {
      font-size: var(--title-fs);
    }
    :host(.compact) .meta {
      margin-top: 4px;
      font-size: 0.82rem;
      line-height: 20px;
    }
    /* com um nome de uma linha só, a etiqueta assenta no pé da foto */
    :host(.compact) .judge {
      align-self: end;
      margin-top: 8px;
    }
    .sorted {
      position: relative;
      white-space: nowrap;
      --pen-y: -4px;
    }
    /* um 10 na nota que ordena: o selo dourado do boletim, em miniatura */
    .sorted .selo-dez {
      font-size: 1em;
      margin-left: 0.1em;
    }
    /* um 0 ou 1: a fita preta rasgada do boletim, em miniatura */
    .sorted .fita-rasgada {
      line-height: 16px;
      padding: 0 0.34em;
      rotate: -2.5deg;
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
        box-shadow: var(--land-shadow, var(--shadow-lift));
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
        --title-fs: 1.2rem;
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
  /** É a prévia no editor, a ficha sendo feita: não entra nas transições do mural. */
  readonly preview = input(false);
  /** Ainda sem jogo: o nome no lugar é só um marcador, em tinta rala. */
  readonly empty = input(false);
  readonly opened = output<string>();
  readonly toggled = output<string>();

  protected readonly pin = computed(() => pinningFor(this.review().id, this.review().stock));
  protected readonly profile = computed(() => profileOf(this.review().kind));
  protected readonly paperVars = computed(() => paperStyle(this.review().paper, this.review().pattern));
  protected readonly cut = computed(() => cutsPaper(this.review().damage));
  /** "Nome do jogo", "Nome da série". */
  protected readonly emptyName = computed(() => `Nome ${g(this.profile(), 'do', 'da')} ${this.profile().singular}`);
  /** A tachinha fica no meio da ficha (42–58%), acima do nome, longe da foto. */
  protected readonly pinX = computed(() => Math.round(42 + (this.pin().pinX - 40) * 0.8));
  protected readonly date = computed(() => {
    const day = this.review().completedAt;
    return day === null ? 'Sem data' : (this.dayOnly() ? dayFmt : dateFmt).format(parseDay(day)).replace(/\./g, '');
  });
  protected readonly hours = computed(() => formatAmount(this.review().kind, this.review().hoursPlayed));
  protected readonly lead = computed(() => leadSentence(this.review().text));
  protected readonly bonuses = computed(() => sortBonuses(this.review().bonuses));
  /**
   * No máximo quatro adesivos na ficha, para ela não virar álbum. Escolhe alternando a favor e
   * contra, para o limite nunca esconder todos de um lado; o resto vira a contagem "mais +1 −1".
   */
  protected readonly shownBonuses = computed(() => {
    const all = this.bonuses();
    if (all.length <= MAX_STICKERS) return { shown: all, hidden: [] as Bonus[] };
    const favor = all.filter((b) => b.kind === 'favor');
    const contra = all.filter((b) => b.kind === 'contra');
    const pick = new Set<string>();
    for (let i = 0; pick.size < MAX_STICKERS; i++) {
      if (favor[i]) pick.add(favor[i].id);
      if (pick.size < MAX_STICKERS && contra[i]) pick.add(contra[i].id);
    }
    return { shown: all.filter((b) => pick.has(b.id)), hidden: all.filter((b) => !pick.has(b.id)) };
  });

  /** As quatro casas sempre na mesma ordem; a que o jogo "não tem" fica riscada, sem sair do lugar. */
  protected readonly cells = computed(() => {
    const r = this.review();
    return ratedKeys(r.kind).map((key) => {
      const weight = weightOf(r.weights, key);
      const v = scoreOf(r.scores, key);
      return { key, weight, off: weight === 'nao-tem', ten: v === 10, ruim: (v ?? 2) < 2, value: formatScore(v) };
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
    if (r.bonuses.length) parts.push(spokenTally(r.bonuses));
    const p = this.profile();
    parts.push(p.status[r.status]);
    if (r.difficulty !== 'nenhuma' && p.difficulty) parts.push(`${p.difficulty.toLowerCase()} ${DIFFICULTY_LABEL[r.difficulty].toLowerCase()}`);
    parts.push(
      r.completedAt === null
        ? NO_DAY_LABEL.toLowerCase()
        : `${dayLabel(r.kind, r.status).toLowerCase()} ${dateFmt.format(parseDay(r.completedAt)).replace(/\./g, '')}`,
    );
    return `Abrir resenha: ${parts.join(', ')}`;
  });

  protected readonly labels = SCORE_LABEL;
}
