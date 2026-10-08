import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, untracked } from '@angular/core';
import { CheckCheck, LockKeyhole, LucideAngularModule, Pin as PinGlyph, Repeat } from 'lucide-angular';
import { cap, g, profileOf, revisitCountOf } from '../core/kinds';
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
  formatReviewDate,
  ratedKeys,
  scoreOf,
  sortBonuses,
  weightOf,
  isDarkStock,
  artIdOf,
  isNote,
} from '../core/review';
import { cutsPaper, decorCuts, lookOf } from '../core/paper';
import { paperVars } from '../core/paper-art';
import { pinningFor } from '../core/wall-physics';
import { scramble } from '../core/spoiler';
import { HAS_LINK, checkCount, plainText } from '../core/rich-text';
import { Rabisco } from './rabisco';
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
import { ReactionBubble } from './reactions';
import { RichText } from './rich-text';
import { Corta } from './clamp';
import { ReviewStore } from '../core/review-store';
import { toggleCheck } from '../core/rich-text';
import { NoteLinks, resolveNote } from '../core/note-links';
import { Desk } from '../core/desk';
import { NoteDone } from '../core/note-done';
import { NotePin } from '../core/note-pin';
import { WallMotion } from '../core/wall-motion';
import { WallView } from '../core/wall-view';
import { DoneStamp, doneDayLong } from './done-stamp';
import type { ReactionTarget } from '../core/reactions';

/** Quantos adesivos de bônus cabem na ficha antes de o resto virar contagem. */
const MAX_STICKERS = 4;

/**
 * Marca as fichas longe da tela (`data-longe`), meia tela para cima e para baixo de folga: o que
 * pisca sem parar nelas espera (ver styles.scss). Um observador só para todas as fichas.
 */
let farAway: IntersectionObserver | undefined;
function watchDistance(el: HTMLElement): () => void {
  if (typeof IntersectionObserver === 'undefined') return () => {};
  farAway ??= new IntersectionObserver(
    (entries) => {
      for (const e of entries) e.target.toggleAttribute('data-longe', !e.isIntersecting);
    },
    { rootMargin: '50% 0px' },
  );
  farAway.observe(el);
  return () => farAway?.unobserve(el);
}

/**
 * Ficha do mural: uma cartolina escrita à mão a pincel atômico, com a foto do jogo colada nela. Na foto,
 * só a tira de fita de status colada no pé. O julgamento é um par de mesmo peso: a Média e o veredito
 * na mesma etiqueta dupla, com picote no meio.
 */
@Component({
  selector: 'app-review-card',
  imports: [LucideAngularModule, Rabisco, PaperArtLayer, Pin, PenMark, StatusLabel, CoverSleeve, BonusSticker, BonusTally, JudgeLabel, Boletim, Skulls, ReactionBubble, RichText, Corta, DoneStamp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a luz da lâmpada segue o ponteiro nas folhas holográficas da ficha levantada
  hostDirectives: [Luz],
  host: {
    class: 'cartolina',
    '[class.is-landing]': 'landing()',
    '[class.compact]': 'compact()',
    '[class.capas]': 'capas()',
    '[class.paired]': 'paired()',
    '[class.picking]': 'picking()',
    '[class.picked]': 'pickedAt() !== null',
    '[style.--stock]': '"var(--stock-" + pin().stock + ")"',
    '[attr.data-cor]': 'pin().stock',
    '[style.--pen]': 'pin().stock === "vermelho" ? "var(--ink)" : null',
    '[style.--tilt]': 'pin().tilt',
    '[style.--pin-x]': 'pinX() + "%"',
    '[style.--drop-y]': 'pin().dropY + "px"',
    // a prévia no editor não disputa o nome com a ficha de verdade que está no mural
    '[style.view-transition-name]': 'preview() ? null : "ficha-" + review().id',
    '[class.vazia]': 'empty()',
    '[class.so-cartolina]': 'bare()',
    '[attr.data-capa]': 'bare() ? bareCover() : null',
    // o papel escolhido (textura) e, quando falta um pedaço, o papel recortado desenhado nas marcas
    '[style]': 'paperVars()',
    '[class.recortada]': 'cut()',
    '[class.orelha]': 'review().damage === "orelha"',
    // marcando pro lado a lado, a rejogada fica de fora (lá é uma ficha por obra)
    '[class.fora]': 'picking() && !!review().revisitOf',
    // a anotação: sem nota, as categorias no lugar da etiqueta, o texto à mostra; larga ou alta
    '[class.nota]': 'note()',
    '[class.sem-capa]': 'note() && !review().game.coverUrl && !capas()',
    '[class.nota-larga]': 'note() && review().noteSize === "larga"',
    '[class.nota-alta]': 'note() && review().noteSize === "alta"',
    // a anotação com o check: a caixinha no canto; acabou de ganhar, o carimbo bate
    '[class.com-check]': 'canFinish()',
    '[class.fixada]': 'note() && review().noteRank === "fixada"',
    '[class.carimbando]': 'stamping()',
  },
  template: `
    <!-- tudo o que está na ficha, junto: é o que entra com fade quando o papel fica pronto (ver
         ui/veil.ts); a marca tracejada da vaga fica na própria ficha, por baixo -->
    <div class="corpo">
    <!-- o papel da ficha: a cartolina, o rabisco e o estrago, por baixo da foto e dos adesivos -->
    <app-paper-art [id]="artId()" [scribble]="review().scribble" [scribbleSeed]="review().scribbleSeed" [scribbleInk]="review().scribbleInk" [damage]="review().damage" [seed]="review().damageSeed" [stain]="review().stain" [stainSeed]="review().stainSeed" [decor]="review().decor" [decorSeed]="review().decorSeed" [glitter]="review().paper === 'glitter'" [dark]="dark()" [content]="review()" />
    <app-pin class="pin" [color]="pin().pinColor" />

    <div class="head">
      @if (!note() || review().game.coverUrl || capas()) {
      <div class="cover" data-colado>
        <div class="box">
          <app-cover-sleeve [game]="review().game" [decorative]="true" [size]="compact() ? 'thumb' : 'card'">
            <!-- Finalizado é o normal e não se anuncia; o que foge do normal vem impresso na faixa da capa -->
            @if (review().status !== 'finalizado' && !capas() && !note()) {
              <app-status-label class="faixa" [status]="review().status" [kind]="review().kind" [band]="true" />
            }
          </app-cover-sleeve>
          <!-- Os selinhos da foto, colados um embaixo do outro no canto, cada um um pouco por cima do
               de cima: o cadeado da privada (só no seu mural; a ficha nunca sai dele) e, só capa e
               nome, o "outra vez" que distingue a rejogada da original. Um selo novo entra no fim. -->
          @if ((review().private || (capas() && (review().revisitOf || doneAt()))) && !bare()) {
            <span class="selos">
              @if (review().private) {
                <span class="selo privada-selo" title="Privada: só você vê">
                  <lucide-icon [img]="PrivateIcon" [size]="compact() || capas() ? 13 : 15" [strokeWidth]="2.8" aria-hidden="true" />
                  <span class="sr-only">Privada: só você vê</span>
                </span>
              }
              @if (capas() && review().revisitOf) {
                <span class="selo vez-selo" aria-hidden="true"><lucide-icon [img]="AgainIcon" [size]="13" [strokeWidth]="3" /></span>
              }
              <!-- só capa e nome: no lugar do carimbo, um selinho de feito -->
              @if (capas() && doneAt()) {
                <span class="selo feito-selo" aria-hidden="true"><lucide-icon [img]="DoneIcon" [size]="13" [strokeWidth]="3" /></span>
              }
            </span>
          }
        </div>
      </div>
      } @else if (review().private && !bare()) {
        <!-- anotação sem capa: o cadeado fica no canto da ficha -->
        <span class="selos selos-ficha">
          <span class="selo privada-selo" title="Privada: só você vê">
            <lucide-icon [img]="PrivateIcon" [size]="13" [strokeWidth]="2.8" aria-hidden="true" />
            <span class="sr-only">Privada: só você vê</span>
          </span>
        </span>
      }

      <div class="words">
        @if (!capas() && doneAt(); as at) {
          <!-- finalizada: o carimbo datador ao lado do título -->
          <div class="titulo-feito">
            <h4 class="title" data-queima>{{ review().game.name }}</h4>
            <app-done-stamp data-queima [at]="at" [dark]="dark()" [hit]="stamping()" />
          </div>
        } @else {
        <h4 class="title" data-queima>{{ empty() || bare() ? emptyName() : review().game.name }}</h4>
        }
        @if (bare()) {
          <!-- só a cartolina: a linha de data fica como no molde, sem dizer nada -->
          <p class="meta molde" data-queima>{{ bareMeta() }}</p>
        } @else if (!capas() && note()) {
          <p class="meta" data-queima>
            <!-- a sub-nota diz o que é antes da data, como a rejogada -->
            @if (review().noteRank === 'sub') {
              <span class="sub-marca">Sub-nota</span><span aria-hidden="true"> · </span>
            }
            @if (review().completedAt; as day) {
              <time [attr.datetime]="day">{{ date() }}</time>
            } @else {
              <span>{{ date() }}</span>
            }
          </p>
        } @else if (!capas()) {
        <p class="meta" data-queima>
          <!-- a rejogada diz o que é antes da data; a original jogada mais vezes diz quantas, depois -->
          @if (review().revisitOf) {
            <span class="vez-marca"><lucide-icon class="vez-icone" [img]="AgainIcon" [size]="compact() ? 13 : 14" [strokeWidth]="3" aria-hidden="true" /><span [class.sr-only]="compact()">{{ revisitWord() }}</span></span><span aria-hidden="true"> · </span>
          }
          @if (review().completedAt; as day) {
            <time [attr.datetime]="day">{{ date() }}</time>
          } @else {
            <span>{{ date() }}</span>
          }
          <!-- sem spoilers, a linha fica só com a data: as horas e as caveiras também contam o que achou -->
          @if (!review().revisitOf && times() > 1) {
            <span aria-hidden="true"> · </span><span class="vez-marca" [title]="timesTitle()"><lucide-icon class="vez-icone" [img]="AgainIcon" [size]="compact() ? 13 : 14" [strokeWidth]="3" aria-hidden="true" />{{ times() }}×<span class="sr-only"> ({{ timesTitle() }})</span></span>
          }
          @if (review().hoursPlayed !== null && !compact() && !masked()) {
            <span aria-hidden="true"> · </span><span>{{ hours() }}</span>
          }
          @if (review().difficulty !== 'nenhuma' && !masked()) {
            <span aria-hidden="true"> · </span><app-skulls class="caveiras" [value]="review().difficulty" [size]="compact() ? 13 : 14" [showLabel]="false" [ghosts]="false" />
          }
          @if (compact() && sortedCell(); as c) {
            <span aria-hidden="true"> · </span><span class="sorted"><span>{{ labels[c.key] }} </span>@if (c.ten) {<span class="selo-dez">{{ c.value }}</span>} @else if (c.ruim) {<span class="fita-rasgada">{{ c.value }}</span>} @else {<span class="nota-valor">{{ c.value }}</span>}<app-pen-mark /></span>
          }
          @if (compact() && bonuses().length) {
            <app-bonus-tally class="tally" [bonuses]="bonuses()" [masked]="masked()" />
          }
        </p>
        }
      </div>

      <!-- O julgamento: etiqueta dupla, a Média no papel e o veredito na faixa preta -->
      @if (note()) {
        <!-- as categorias, no lugar da etiqueta da nota: o espaço ao lado da foto é delas -->
        @if (!capas() && review().bonuses.length) {
          <ul class="judge categorias" data-colado aria-label="Categorias">
            @for (b of shownCategories().shown; track b.id; let i = $index) {
              <li><app-bonus-sticker [bonus]="b" [index]="i" [seed]="review().id" /></li>
            }
            @if (shownCategories().hidden) {
              <li class="mais">+{{ shownCategories().hidden }}</li>
            }
          </ul>
        }
      } @else if (!capas()) {
        <app-judge-label class="judge" data-colado [value]="review().scores.final" [verdict]="review().verdict" [size]="compact() ? 'compact' : 'card'" [fit]="true" [masked]="masked()" />
      }
    </div>

    <!-- antes do texto: no teclado, primeiro a ficha e os botões dela, depois as tarefas e os links -->
    <!-- Marcando para o lado a lado: o adesivo redondo no canto diz se a ficha vai e em que ordem -->
    @if (picking() && review().revisitOf) {
      <!-- a rejogada não vai pro lado a lado: nem marca, nem abre -->
    } @else if (picking()) {
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
      <button type="button" class="hit" [attr.aria-label]="bare() ? 'A cartolina da ficha secreta' : spoken()" (click)="opened.emit(review().id)"></button>
    }
    <!-- o alfinete que fixa a anotação no topo do mural, ao lado do check -->
    @if (canFinish()) {
      <button
        type="button"
        class="fixar"
        [class.marcado]="review().noteRank === 'fixada'"
        [attr.aria-pressed]="review().noteRank === 'fixada'"
        [attr.aria-label]="'Fixar no topo: ' + review().game.name"
        [title]="review().noteRank === 'fixada' ? 'Desafixar' : 'Fixar no topo do mural'"
        (click)="togglePin($event)"
      >
        <lucide-icon [img]="PinIcon" [size]="capas() ? 15 : 18" [strokeWidth]="2.4" aria-hidden="true" />
      </button>
    }
    <!-- o check da anotação inteira: no seu mural, a caixinha no canto de cima -->
    @if (canFinish()) {
      <button
        type="button"
        class="feito"
        [class.marcado]="!!review().doneAt"
        [attr.aria-pressed]="!!review().doneAt"
        [attr.aria-label]="'Finalizar: ' + review().game.name"
        [title]="review().doneAt ? 'Abrir de novo' : 'Finalizar a anotação'"
        (click)="finish()"
      ></button>
    }
    @if (note() && !compact() && !capas()) {
      @if (review().text.trim()) {
        <!-- o começo da anotação, já formatado (listas, tarefas): a parede mostra o que tem nela -->
        <!-- o estrago queima o texto de dentro: o esmaecido do fim fica na caixa (os dois juntos) -->
        <div class="nota-texto" [class.marcavel]="interactive()" appCorta>
          <app-rich-text data-queima [text]="review().text" [checkable]="checkable()" [links]="noteLinks()" (toggled)="toggleTask($event)" />
        </div>
      }
    } @else if (!compact() && !capas()) {
      @if (lead(); as line) {
        @if (masked() && !bare()) {
          <p class="lead" data-queima>“<app-rabisco [text]="line" />”<span class="sr-only">Texto escondido</span></p>
        } @else {
          <p class="lead" data-queima>“{{ line }}”</p>
        }
      }

      <!-- Os bônus: adesivos colados na cartolina, os a favor primeiro -->
      @if (bonuses().length) {
        <ul class="bonus" data-colado aria-label="Bônus">
          @for (b of shownBonuses().shown; track b.id; let i = $index) {
            <li>
              <app-bonus-sticker [bonus]="b" [index]="i" [masked]="masked()" [seed]="review().id" />
              @if (!masked()) {
                <span class="sr-only">({{ b.kind === 'favor' ? 'a favor' : 'contra' }})</span>
              }
            </li>
          }
          @if (shownBonuses().hidden.length) {
            <li class="mais"><span aria-hidden="true">mais</span> <app-bonus-tally [bonuses]="shownBonuses().hidden" [masked]="masked()" /></li>
          }
        </ul>
      }

      <app-boletim class="boletim" data-queima [review]="review()" [highlight]="masked() ? null : highlight()" [masked]="masked()" />
    }

    <!-- as reações de quem segue o dono, num balãozinho colado na quina de baixo (só quando há alguma) -->
    @if (reactTarget(); as t) {
      <div class="reacoes"><app-reaction-bubble [target]="t" /></div>
    }
    </div>
  `,
  styles: `
    :host {
      /* ver ::view-transition-old(*.ficha) no styles.scss */
      view-transition-class: ficha;
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
        filter var(--t-ui) var(--ease-ui),
        --luz 600ms var(--ease-physical);
    }

    /* O corpo é a ficha toda, no lugar dela: sem posição própria (as camadas do papel, a tachinha e o
       botão continuam medidos pela ficha) e sem transformação (que mudaria isso). Só a opacidade
       dele anima, quando a ficha entra (ver ui/veil.ts). */
    .corpo {
      display: flex;
      flex-direction: column;
      flex: 1 1 auto;
      min-width: 0;
    }

    /* Esperando o papel ficar pronto (ver ui/veil.ts): no lugar da ficha, só a marca tracejada na
       parede, como as vagas do mural vazio. A ficha escondida não é pintada nem
       rasterizada, e não recebe clique. */
    :host([data-veu]) .corpo {
      visibility: hidden;
    }
    /* Só a cartolina (a dica do Muraldle): o papel, a estampa, o rabisco, o estrago, a mancha e a
       decoração ficam; a capa, o nome, as notas, o texto e os bônus somem sem mudar o tamanho */
    :host(.so-cartolina) .faixa,
    :host(.so-cartolina) .bonus,
    :host(.so-cartolina) .boletim {
      visibility: hidden;
    }
    /* a etiqueta de nota e veredito fica, sempre no modo secreto ("?" e "Segredo": a ficha vem com masked) */
    /* a capa só aparece quando a dica diz como: em preto e branco e borrada, borrada, ou nítida */
    :host(.so-cartolina:not([data-capa])) .cover {
      visibility: hidden;
    }
    :host(.so-cartolina) .cover .box {
      overflow: hidden;
    }
    :host(.so-cartolina) .cover app-cover-sleeve {
      transition: filter var(--t-physical) var(--ease-physical);
    }
    :host([data-capa='cinza']) .cover app-cover-sleeve {
      filter: blur(6px) grayscale(1);
    }
    :host([data-capa='borrada']) .cover app-cover-sleeve {
      filter: blur(6px);
    }
    /* As camadas do papel saem de vez (são absolutas: a ficha não muda de tamanho). Só esconder não
       bastava: o Chrome pinta mesmo assim o relevo do papel amassado (um filtro que gera a textura
       sozinho, sem depender do desenho), e a vaga aparecia como um retângulo cinza. */
    :host([data-veu]) ::ng-deep .camada {
      display: none;
    }
    :host([data-veu]) {
      box-shadow: none;
      pointer-events: none;
    }
    /* a vaga: a marca tracejada na parede. Some num fade rápido quando a ficha começa a entrar. */
    :host::before {
      content: '';
      position: absolute;
      inset: 0;
      border: 2px dashed rgb(241 241 236 / 0.16);
      border-radius: 3px;
      pointer-events: none;
      opacity: 0;
      transition: opacity 180ms ease-out var(--entrada, 0ms);
    }
    :host([data-veu])::before {
      opacity: 1;
      transition: none;
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
      /* as mesmas três camadas da --shadow-card (beirada, sombra perto e sombra longe), sem o espalhamento que o drop-shadow não tem */
      --sombra-papel: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 8px 10px rgb(0 0 0 / 0.5)) drop-shadow(0 18px 22px rgb(0 0 0 / 0.4));
    }
    :host(.recortada),
    :host(.recortada:hover),
    :host(.recortada:focus-within),
    :host(.recortada:active) {
      box-shadow: none;
      /* na ficha inteira, e não no papel: o filtro vem antes da máscara, e a máscara do papel cortaria a sombra */
      filter: var(--sombra-papel);
    }
    :host(.recortada:hover),
    :host(.recortada:focus-within) {
      --sombra-papel: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3)) drop-shadow(0 16px 16px rgb(0 0 0 / 0.5)) drop-shadow(0 32px 32px rgb(0 0 0 / 0.45));
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

    /* a tachinha segura tudo, até a decoração (4) que passa por cima da foto */
    .pin {
      top: -9px;
      left: calc(var(--pin-x) - 13px);
      z-index: 5;
      pointer-events: none;
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
    :host(.vazia) .title,
    :host(.so-cartolina) .title,
    :host(.so-cartolina) .meta.molde {
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

    /* ===== Outra vez: a rejogada e a original jogada mais de uma vez ===== */
    .vez-marca {
      white-space: nowrap;
    }
    .vez-icone {
      display: inline-block;
      vertical-align: -2px;
      margin-right: 3px;
    }
    /* Os selinhos redondos de tinta no canto da foto, numa coluna: cada um encosta um pouco no de
       cima, como adesivos colados um por cima do outro, cada um torto para um lado */
    .selos {
      position: absolute;
      top: -8px;
      left: -8px;
      z-index: 2;
      display: flex;
      flex-direction: column;
      align-items: center;
      pointer-events: none;
    }
    .selo {
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      border-radius: 50%;
      background: var(--ink);
      color: var(--hi);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.35);
      rotate: 8deg;
      pointer-events: auto;
    }
    .selo + .selo {
      margin-top: -6px;
    }
    .selo:nth-child(even) {
      rotate: -7deg;
      translate: 2px 0;
    }
    :host(.compact) .selos,
    :host(.capas) .selos {
      top: -6px;
      left: -6px;
    }
    :host(.compact) .selo,
    :host(.capas) .selo {
      width: 24px;
      height: 24px;
    }
    :host(.compact) .selo + .selo,
    :host(.capas) .selo + .selo {
      margin-top: -5px;
    }
    :host(.fora) {
      opacity: 0.45;
      filter: saturate(0.6);
    }

    /* ===== Anotação: as categorias no lugar da etiqueta, e o texto à mostra ===== */
    .categorias {
      display: flex;
      flex-wrap: wrap;
      align-content: flex-start;
      gap: 6px 5px;
      margin: 12px 0 0;
      padding: 0;
      list-style: none;
    }
    .categorias li {
      display: flex;
      max-width: 100%;
    }
    .categorias .mais {
      align-items: center;
      padding-left: 2px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
    }
    :host(.compact) .categorias {
      margin-top: 6px;
      align-self: end;
    }
    /* sem capa: o título e as categorias ocupam a ficha toda */
    :host(.sem-capa) .head {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas: 'words' 'judge';
    }
    :host(.compact.sem-capa) .head {
      min-height: 0;
    }
    .selos-ficha {
      top: -6px;
      left: -6px;
    }
    /* o texto da anotação na letra de quem escreveu; o que não cabe some num esmaecido */
    .nota-texto {
      --line: 1.4rem;
      --linhas: 8;
      position: relative;
      margin-top: 14px;
      max-height: calc(var(--line) * var(--linhas));
      /* clip, e não hidden: com hidden a caixa rola quando o Tab chega numa tarefa lá embaixo, e as
         primeiras linhas somem da ficha */
      overflow: clip;
      font-family: var(--f-hand);
      font-size: 1.04rem;
      line-height: var(--line);
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    /* o texto de dentro é o que o estrago queima (ver paper-layer.ts) */
    .nota-texto app-rich-text {
      display: block;
    }
    /* só o texto que passou da ficha esmaece no fim (ver ui/clamp.ts) */
    .nota-texto[data-corta] {
      -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - var(--line) * 1.2), transparent);
      mask-image: linear-gradient(to bottom, #000 calc(100% - var(--line) * 1.2), transparent);
    }
    :host(.nota-alta) .nota-texto {
      --linhas: 18;
    }
    /* com tarefas ou links: o texto fica por cima do botão da ficha, mas só as caixinhas e os links
       pegam o toque; o resto do texto deixa o toque passar e abre a leitura como sempre */
    .nota-texto.marcavel {
      z-index: 5;
      pointer-events: none;
    }
    .nota-texto.marcavel ::ng-deep input[type='checkbox'],
    .nota-texto.marcavel ::ng-deep .elo[tabindex] {
      pointer-events: auto;
    }
    :host(.nota-larga) {
      max-width: none;
    }

    /* ===== O check da anotação inteira: a caixinha de tarefa, maior, no canto da ficha ===== */
    .feito {
      position: absolute;
      top: 10px;
      right: 10px;
      z-index: 5;
      width: 26px;
      height: 26px;
      padding: 0;
      border: 2.5px solid currentColor;
      border-radius: 3px 4px 3px 5px;
      rotate: 4deg;
      background: transparent no-repeat center / 118% 118%;
      opacity: 0.55;
      cursor: pointer;
      transition:
        opacity var(--t-ui) var(--ease-ui),
        scale var(--t-ui) var(--ease-ui);
      --check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M3 10.5 8 15.5 18 2' fill='none' stroke='%23c4302b' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      --lapis: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M3 10.5 8 15.5 18 2' fill='none' stroke='%23151515' stroke-opacity='.3' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
    /* na cartolina escura: o check na caneta clara, como o carimbo e o alfinete */
    :host([data-cor$='escuro']) .feito,
    :host([data-cor='preto']) .feito {
      --check: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M3 10.5 8 15.5 18 2' fill='none' stroke='%23ff8f80' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
      --lapis: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 20 20'%3E%3Cpath d='M3 10.5 8 15.5 18 2' fill='none' stroke='%23f1f1ec' stroke-opacity='.4' stroke-width='3.2' stroke-linecap='round' stroke-linejoin='round'/%3E%3C/svg%3E");
    }
    /* o toque pega uma área maior que a caixinha (do lado do alfinete, só até o meio do vão) */
    .feito::before {
      content: '';
      position: absolute;
      inset: -9px -9px -9px -3px;
    }
    :host(:hover) .feito,
    .feito:focus-visible {
      opacity: 1;
    }
    /* o foco na cor da tinta da cartolina: o amarelo sumia na cartolina amarela */
    .feito:focus-visible,
    .fixar:focus-visible {
      outline: 3px solid currentColor;
      outline-offset: 3px;
    }
    @media (hover: hover) {
      .feito:hover {
        scale: 1.08;
      }
      /* o mouse em cima de uma vazia: o check a lápis, de leve, onde ele vai */
      .feito:not(.marcado):hover {
        background-image: var(--lapis);
      }
    }
    /* sem mouse, os botões não esperam o mouse passar para aparecer */
    @media (hover: none) {
      .feito,
      .fixar {
        opacity: 0.8;
      }
    }
    /* o check de caneta vermelha das tarefas */
    .feito.marcado {
      opacity: 1;
      background-image: var(--check);
    }
    :host(.carimbando) .feito.marcado {
      animation: risca 260ms ease-out both;
    }
    @keyframes risca {
      from {
        scale: 0.7;
      }
    }
    /* o título não passa por baixo do alfinete e da caixinha (só a primeira linha encosta neles) */
    :host(.com-check) .words > :first-child {
      margin-right: 52px;
    }
    :host(.com-check.compact) .words > :first-child {
      margin-right: 58px;
    }
    :host(.com-check.sem-capa) .words > :first-child {
      margin-right: 60px;
    }

    /* ===== O alfinete de fixar no topo: de leve, como o check; fixada, cravado e vermelho ===== */
    .fixar {
      position: absolute;
      top: 9px;
      right: 44px;
      z-index: 5;
      display: grid;
      place-items: center;
      width: 28px;
      height: 28px;
      padding: 0;
      border: 0;
      border-radius: 50%;
      background: transparent;
      color: currentColor;
      opacity: 0.55;
      rotate: 18deg;
      cursor: pointer;
      transition:
        opacity var(--t-ui) var(--ease-ui),
        rotate var(--t-physical) var(--ease-physical),
        scale var(--t-ui) var(--ease-ui);
    }
    /* a área de toque, sem passar do meio do vão até a caixinha */
    .fixar::before {
      content: '';
      position: absolute;
      inset: -6px -2px -6px -6px;
    }
    :host(:hover) .fixar,
    .fixar:focus-visible {
      opacity: 1;
    }
    @media (hover: hover) {
      .fixar:hover {
        scale: 1.1;
      }
    }
    .fixar.marcado {
      opacity: 1;
      rotate: 38deg;
      color: #c4302b;
      filter: drop-shadow(1px 2px 1px rgb(0 0 0 / 0.35));
      animation: crava 320ms var(--ease-physical);
    }
    .fixar.marcado ::ng-deep svg {
      fill: currentColor;
      fill-opacity: 0.85;
    }
    :host([data-cor$='escuro']) .fixar.marcado,
    :host([data-cor='preto']) .fixar.marcado {
      color: #ff8f80;
    }
    @keyframes crava {
      from {
        scale: 1.5;
        translate: 4px -6px;
      }
    }
    .sub-marca {
      opacity: 0.7;
    }

    /* o título e o carimbo lado a lado; sem espaço, o carimbo desce para a linha de baixo */
    .titulo-feito {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 4px 12px;
      max-width: 100%;
    }
    .titulo-feito .title {
      flex: 0 1 auto;
      min-width: min(9rem, 100%);
    }
    .titulo-feito app-done-stamp {
      margin: 2px 0 0 2px;
    }
    :host(.compact) .titulo-feito app-done-stamp {
      --fs: 0.62rem;
    }
    /* o carimbo bateu: a ficha sente o tranco na tachinha (na ficha, não no corpo: um corpo com
       transformação passaria a medir as camadas do papel) */
    :host(.carimbando) {
      animation: tranco 420ms 240ms var(--ease-physical);
    }
    @keyframes tranco {
      30% {
        translate: 0 3px;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      :host(.carimbando),
      :host(.carimbando) .feito.marcado {
        animation: none;
      }
    }

    /* o balão das reações: preso na quina de baixo, metade para fora da ficha, por cima de tudo */
    .reacoes {
      position: absolute;
      right: 14px;
      bottom: -13px;
      z-index: 6;
    }
    :host(.capas) .reacoes {
      right: 6px;
      bottom: -11px;
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

    /* ===== Só capa e nome: a foto colada e o nome escrito embaixo, como legenda =====
       Para ver o máximo de fichas de uma vez. A tachinha fura a cartolina acima da foto; o nome
       ocupa sempre a altura de duas linhas, para as fileiras não ficarem desencontradas. */
    :host(.capas) {
      --cover-w: 100%;
      padding: 18px 9px 9px;
      margin-top: calc(var(--drop-y) * 0.4);
    }
    :host(.capas) .head {
      grid-template-columns: minmax(0, 1fr);
      grid-template-areas:
        'cover'
        'words';
      grid-template-rows: auto auto;
      gap: 7px;
    }
    :host(.capas) .words {
      padding-top: 0;
      align-items: center;
      text-align: center;
    }
    :host(.capas) .title {
      width: 100%;
      min-height: 2.16em;
      font-size: 1rem;
      line-height: 1.08;
    }
    /* o adesivo de marcar encolhe junto com a ficha */
    :host(.capas) .marca {
      top: -10px;
      right: -10px;
      width: 34px;
      height: 34px;
    }
    :host(.capas) .marca .n {
      font-size: 1.1rem;
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

    @media (max-width: 699px) {
      :host(.compact.paired) { --cover-w: 66px; --title-fs: 1.02rem; padding: 14px 9px 12px; }
      :host(.compact.paired) .head {
        grid-template-areas: 'cover' 'words' 'judge';
        grid-template-columns: minmax(0, 1fr);
        grid-template-rows: auto auto auto;
        gap: 10px;
      }
      :host(.compact.paired) .cover { width: var(--cover-w); justify-self: center; }
      :host(.compact.paired) .words { padding-top: 0; min-width: 0; align-items: center; text-align: center; }
      :host(.compact.paired) .title { font-size: var(--title-fs); min-height: 2.14em; overflow-wrap: anywhere; }
      :host(.compact.paired) .meta { min-height: 40px; line-height: 1.35; }
      :host(.compact.paired) .judge { width: 100%; justify-content: center; }
    }

    /* Celular: uma coluna de fichas deitadas, na largura toda */
    @media (max-width: 559px) {
      :host {
        --cover-w: 104px;
        max-width: none;
        rotate: calc(var(--tilt) * 0.5deg);
        margin-top: calc(var(--drop-y) * 0.4);
      }
      :host(.compact:not(.paired)) {
        --title-fs: 1.2rem;
      }
      :host(.compact) .faixa {
        --band-fs: 0.66rem;
      }
      :host(.capas) {
        --cover-w: 100%;
        padding: 16px 7px 8px;
      }
      :host(.capas) .title {
        font-size: 0.9rem;
      }
      /* no celular a coluna do nome é estreita: a etiqueta do julgamento desce e ocupa a largura */
      :host(:not(.compact):not(.capas)) .head {
        grid-template-areas:
          'cover words'
          'judge judge';
        grid-template-rows: auto auto;
      }
      /* a anotação sem capa continua com uma coluna só */
      :host(.sem-capa:not(.compact):not(.capas)) .head {
        grid-template-columns: minmax(0, 1fr);
        grid-template-areas:
          'words'
          'judge';
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
  /** Só a foto e o nome: a ficha mais enxuta, para caber o máximo no mural. */
  readonly capas = input(false);
  /** Duas fichas em colunas no celular, mantendo a orientação da comparação. */
  readonly paired = input(false);
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
  /** Sem spoilers (ver Settings.noSpoilers): notas em "?", bônus meio a meio e o texto embaralhado. */
  readonly masked = input(false);
  /** Só a cartolina, sem nada escrito: a dica do Muraldle. */
  readonly bare = input(false);
  /** Só a cartolina: como a capa aparece (null, escondida). */
  readonly bareCover = input<'cinza' | 'borrada' | 'nitida' | null>(null);
  /** Só a cartolina: o pedaço da resenha que já pode aparecer, no lugar da frase. */
  readonly bareText = input('');
  /** Quantas vezes a obra foi jogada (lida, vista): a original e as rejogadas. Só nas originais. */
  readonly times = input(1);
  /** As tarefas da anotação se marcam na própria ficha (só no seu mural; nos outros, só se veem). */
  readonly checkable = input(false);
  /** O código do dono do mural, para mostrar as reações da ficha (ver core/reactions.ts); null, sem reações. */
  readonly reactCode = input<string | null>(null);
  readonly opened = output<string>();
  readonly toggled = output<string>();

  private readonly store = inject(ReviewStore);

  /** Marcou uma tarefa na ficha do mural: a anotação é salva com ela marcada, sem abrir nada. */
  protected toggleTask(line: number): void {
    const r = this.store.get(this.review().id);
    if (!r || !this.checkable()) return;
    const text = toggleCheck(r.text, line);
    if (text !== r.text) this.store.update({ ...r, text, updatedAt: new Date().toISOString() });
  }

  private readonly desk = inject(Desk);
  private readonly noteDone = inject(NoteDone);
  private readonly view = inject(WallView);
  private readonly motion = inject(WallMotion);

  /** Quando a anotação foi finalizada (o carimbo), ou null. */
  protected readonly doneAt = computed(() => (this.note() && !this.bare() ? (this.review().doneAt ?? null) : null));
  /** O check e o alfinete da anotação: só no seu mural (e não na ficha de só capa e nome, pequena demais). */
  protected readonly canFinish = computed(() => this.note() && this.checkable() && !this.preview() && !this.capas());
  protected readonly DoneIcon = CheckCheck;
  /**
   * O texto tem o que tocar (tarefas, links)? Só então ele sobe por cima do botão da ficha; sem nada
   * para tocar, fica no lugar de sempre, por baixo do que o papel põe por cima dele.
   */
  protected readonly interactive = computed(() => {
    const t = this.review().text;
    return this.checkable() && (checkCount(t).total > 0 || HAS_LINK.test(t));
  });
  /** Acabou de ganhar o check: o carimbo bate, e daqui a pouco a ficha sai do mural. */
  protected readonly stamping = computed(() => this.note() && !this.preview() && this.view.stamping().has(this.review().id));

  private readonly notePin = inject(NotePin);
  protected readonly PinIcon = PinGlyph;
  protected togglePin(e: Event): void {
    if (!this.canFinish()) return;
    const btn = e.currentTarget as HTMLElement;
    const focused = document.activeElement === btn;
    this.notePin.set(this.review().id, this.review().noteRank !== 'fixada');
    // a ficha mudou de seção (o elemento foi tirado e posto de novo): o foco volta para o alfinete
    if (focused && document.activeElement !== btn) btn.focus({ preventScroll: false });
  }

  protected finish(): void {
    // o carimbo ainda batendo: o segundo clique (um duplo clique) não desfaz o que acabou de fazer
    if (!this.canFinish() || this.stamping()) return;
    this.noteDone.set(this.review().id, !this.review().doneAt);
  }

  /** A ficha sai do mural; o foco que estava nela passa para a vizinha (senão cairia no nada). */
  private leave(el: HTMLElement, id: string): void {
    const had = el.contains(document.activeElement);
    const cards = Array.from(document.querySelectorAll<HTMLElement>('[data-ficha]'));
    const at = cards.indexOf(el);
    const next = had ? (cards[at + 1] ?? cards[at - 1]) : undefined;
    this.motion.run(() => this.view.release(id));
    next?.querySelector<HTMLElement>('.hit')?.focus();
  }

  /** Cada carimbo que bate; o de antes (desfeito e refeito no meio) não leva a ficha. */
  private stampRun = 0;

  /**
   * O carimbo bateu: a ficha fica um instante para ver, some e sai do mural, e as vizinhas deslizam
   * para o lugar. Com "Mostrar finalizadas", ela fica, com o carimbo.
   */
  private leaveAfterStamp(el: HTMLElement): void {
    const run = ++this.stampRun;
    const id = this.review().id;
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    const still = () => run === this.stampRun && this.view.stamping().has(id);
    setTimeout(
      () => {
        if (!still()) return;
        if (this.view.showDone() || reduced || typeof el.animate !== 'function') {
          if (this.view.showDone()) this.motion.run(() => this.view.release(id));
          else this.leave(el, id);
          return;
        }
        const out = el.animate(
          [
            { opacity: 1, scale: 1 },
            { opacity: 0, scale: 0.94, translate: '0 14px' },
          ],
          { duration: 340, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' },
        );
        out.finished.then(
          () => {
            if (still()) this.leave(el, id);
            out.cancel();
          },
          () => {},
        );
      },
      reduced ? 1600 : 2100,
    );
  }
  /**
   * Os links do texto da anotação. No seu mural (`checkable`), tocar abre a outra anotação na
   * leitura, com esta no "Voltar", e o link para uma que não existe a cria; nos outros, só aparecem.
   */
  protected readonly noteLinks = computed<NoteLinks>(() => {
    if (!this.checkable()) return {};
    const notes = this.store.notes();
    const from = this.review().id;
    return {
      resolve: (title) => resolveNote(notes, title),
      open: (n) => this.desk.openReview(n.id, from),
      create: (title) => this.desk.newNote(title),
    };
  });

  /** É uma anotação (mural de anotações): sem nota nem veredito; as categorias e o texto. */
  protected readonly note = computed(() => isNote(this.review()));
  /** As categorias que cabem ao lado da foto (até 4 na Completa, 2 na Simples); o resto vira "+N". */
  protected readonly shownCategories = computed(() => {
    const all = this.review().bonuses;
    const max = this.compact() ? 2 : 4;
    return { shown: all.slice(0, max), hidden: Math.max(0, all.length - max) };
  });

  /** A ficha como alvo das reações: o mural de quem e qual ficha. */
  protected readonly reactTarget = computed<ReactionTarget | null>(() => {
    const code = this.reactCode();
    const r = this.review();
    return code && !this.bare() ? { code, ref: r.id, titulo: r.game.name, mural: r.kind } : null;
  });

  protected readonly AgainIcon = Repeat;
  protected readonly PrivateIcon = LockKeyhole;
  /** O papel da rejogada é desenhado com o id da original (ver artIdOf). */
  protected readonly artId = computed(() => artIdOf(this.review()));
  protected readonly pin = computed(() => pinningFor(this.review().id, this.review().stock));
  /** "Rejogada", "Releitura", "Reassistida". */
  protected readonly revisitWord = computed(() => cap(this.profile().revisit.one));
  /** "Jogado 3 vezes": a original e as rejogadas dela. */
  protected readonly timesTitle = computed(() => `${this.times()} vezes no mural: a original e ${revisitCountOf(this.profile(), this.times() - 1)}`);
  protected readonly profile = computed(() => profileOf(this.review().kind));
  /** Cartolina escura: tinta, lápis e estampa claros. */
  protected readonly dark = computed(() => isDarkStock(this.pin().stock));
  protected readonly paperVars = computed(() => paperVars(this.review().paper, this.review().pattern, lookOf(this.review()), this.review().patternSeed, this.dark()));
  protected readonly cut = computed(() => cutsPaper(this.review().damage) || cutsPaper(this.review().stain) || decorCuts(this.review().decor));
  /** "Nome do jogo", "Nome da série". */
  protected readonly emptyName = computed(() =>
    this.note() ? 'Título da anotação' : `Nome ${g(this.profile(), 'do', 'da')} ${this.profile().singular}`,
  );
  /** Só a cartolina: "Data · Horas · Dificuldade", com as partes que o mural tem. */
  protected readonly bareMeta = computed(() => {
    const p = this.profile();
    return ['Data', p.amount ? (p.amount.unit === 'horas' ? 'Horas' : 'Páginas') : null, p.difficulty ? 'Dificuldade' : null]
      .filter(Boolean)
      .join(' · ');
  });
  /** A tachinha fica no meio da ficha (42–58%), acima do nome, longe da foto. */
  protected readonly pinX = computed(() => Math.round(42 + (this.pin().pinX - 40) * 0.8));
  protected readonly date = computed(() => {
    const r = this.review();
    // a fixada fica na seção Fixadas, sem a etiqueta do mês: a data vai inteira
    return formatReviewDate(r.completedAt, this.dayOnly() && r.noteRank !== 'fixada');
  });
  protected readonly hours = computed(() => formatAmount(this.review().kind, this.review().hoursPlayed));
  protected readonly lead = computed(() => {
    if (this.bare()) return this.bareText();
    // a frase sai do texto sem as marcas de formatação (negrito, listas, tarefas)
    const line = leadSentence(plainText(this.review().text));
    return line && this.masked() ? scramble(line, this.review().id) : line;
  });
  protected readonly bonuses = computed(() => sortBonuses(this.review().bonuses));
  /**
   * No máximo quatro adesivos na ficha, para ela não virar álbum. Escolhe alternando a favor e
   * contra, para o limite nunca esconder todos de um lado; o resto vira a contagem "mais +1 −1".
   */
  protected readonly shownBonuses = computed(() => {
    const all = this.bonuses();
    if (all.length <= MAX_STICKERS) return { shown: all, hidden: [] as Bonus[] };
    // sem spoilers todos são iguais: os primeiros quatro bastam, e a escolha não denuncia o lado
    if (this.masked()) return { shown: all.slice(0, MAX_STICKERS), hidden: all.slice(MAX_STICKERS) };
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
    if (!k || k === 'final' || this.masked()) return null;
    const c = this.cells().find((x) => x.key === k);
    return c && !c.off ? c : null;
  });

  /** O que o leitor de tela diz ao chegar no botão da ficha. */
  protected readonly spoken = computed(() => {
    const r = this.review();
    if (isNote(r)) {
      const cats = r.bonuses.map((b) => b.label).join(', ');
      const when = r.completedAt === null ? NO_DAY_LABEL.toLowerCase() : formatReviewDate(r.completedAt);
      const rank = r.noteRank === 'fixada' ? 'fixada' : r.noteRank === 'sub' ? 'sub-nota' : '';
      const done = r.doneAt ? `finalizada em ${doneDayLong(r.doneAt)}` : '';
      return `Abrir anotação: ${[r.game.name, rank, done, cats, when, r.private ? 'privada' : ''].filter(Boolean).join(', ')}`;
    }
    const parts = [r.game.name];
    if (this.masked()) {
      if (r.bonuses.length) parts.push(`${r.bonuses.length} bônus`);
    } else {
      parts.push(`média ${formatScore(r.scores.final)}`);
      if (r.verdict) parts.push(VERDICT_LABEL[r.verdict]);
      if (r.bonuses.length) parts.push(spokenTally(r.bonuses));
    }
    const p = this.profile();
    parts.push(p.status[r.status]);
    if (r.difficulty !== 'nenhuma' && p.difficulty && !this.masked()) parts.push(`${p.difficulty.toLowerCase()} ${DIFFICULTY_LABEL[r.difficulty].toLowerCase()}`);
    parts.push(
      r.completedAt === null
        ? NO_DAY_LABEL.toLowerCase()
        : `${dayLabel(r.kind, r.status).toLowerCase()} ${formatReviewDate(r.completedAt)}`,
    );
    return r.revisitOf ? `Abrir ${p.revisit.one}: ${parts.join(', ')}` : `Abrir resenha: ${parts.join(', ')}`;
  });

  protected readonly labels = SCORE_LABEL;

  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    effect(() => {
      if (this.stamping()) untracked(() => this.leaveAfterStamp(el));
      else this.stampRun++;
    });
    let unwatch = () => {};
    afterNextRender(() => (unwatch = watchDistance(el)));
    inject(DestroyRef).onDestroy(() => unwatch());
  }
}
