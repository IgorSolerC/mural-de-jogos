import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, computed, effect, inject, input, output, untracked, viewChild } from '@angular/core';
import { Check, CheckCheck, CornerDownRight, Eye, ListChecks, LockKeyhole, LucideAngularModule, Pin as PinGlyph, Repeat, Undo2, UsersRound } from 'lucide-angular';
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
  audienceOf,
} from '../core/review';
import { cutsPaper, decorCuts, lookOf } from '../core/paper';
import { paperVars } from '../core/paper-art';
import { pinningFor } from '../core/wall-physics';
import { scramble } from '../core/spoiler';
import { checkCount, hasInteractive, plainText } from '../core/rich-text';
import { Rabisco } from './rabisco';
import { BonusSticker, BonusTally, spokenTally } from './bonus';
import { CategoryLabel } from './category-label';
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
import { NoteLinks, backlinksOf, parentNoteOf, resolveNote } from '../core/note-links';
import { NoteBacklinks } from './note-backlinks';
import { Desk } from '../core/desk';
import { NoteDone } from '../core/note-done';
import { NotePin } from '../core/note-pin';
import { WallMotion } from '../core/wall-motion';
import { WallView } from '../core/wall-view';
import { DoneStamp, doneDayLong } from './done-stamp';
import { NoteTag } from './note-tag';
import { categoryBonus } from '../core/note-labels';
import { Settings } from '../core/settings';
import { categoryColorHex } from '../core/category-looks';
import type { ReactionTarget } from '../core/reactions';
import { parseWidgetLine, readAudio } from '../core/widgets';

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
  imports: [LucideAngularModule, Rabisco, PaperArtLayer, Pin, PenMark, StatusLabel, CoverSleeve, BonusSticker, BonusTally, JudgeLabel, Boletim, Skulls, ReactionBubble, RichText, Corta, DoneStamp, NoteTag, CategoryLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a luz da lâmpada segue o ponteiro nas folhas holográficas da ficha levantada
  hostDirectives: [Luz],
  host: {
    class: 'cartolina',
    '[class.is-landing]': 'landing()',
    '[class.compact]': 'compact()',
    '[class.capas]': 'capas()',
    '[class.inteira]': 'full()',
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
    // a anotação: sem nota, as categorias no lugar da etiqueta, o texto à mostra
    '[class.nota]': 'note()',
    '[class.sem-capa]': 'note() && !review().game.coverUrl',
    // a anotação com o check: a caixinha no canto; acabou de ganhar, o carimbo bate
    '[class.fixada]': 'note() && review().noteRank === "fixada"',
    '[class.carimbando]': 'stamping()',
    '[class.feita]': '!capas() && !!doneAt()',
  },
  template: `
    <!-- tudo o que está na ficha, junto: é o que entra com fade quando o papel fica pronto (ver
         ui/veil.ts); a marca tracejada da vaga fica na própria ficha, por baixo -->
    <div class="corpo">
    <!-- o papel da ficha: a cartolina, o rabisco e o estrago, por baixo da foto e dos adesivos -->
    <app-paper-art [id]="artId()" [scribble]="review().scribble" [scribbleSeed]="review().scribbleSeed" [scribbleInk]="review().scribbleInk" [damage]="review().damage" [seed]="review().damageSeed" [stain]="review().stain" [stainSeed]="review().stainSeed" [decor]="review().decor" [decorSeed]="review().decorSeed" [glitter]="review().paper === 'glitter'" [dark]="dark()" [content]="review()" />
    <app-pin class="pin" [color]="pin().pinColor" />
    <!-- a categoria da anotação: a orelha de divisória de papel manilha, colada atrás da cartolina e
         saindo pela beirada de cima, como as abas do mural (o nome vai também na lista das tags,
         para o leitor de tela) -->
    @if (note() && !capas() && noteLabels().category; as c) {
      <span #abaCat class="aba-cat" [class.com-selo]="publicBadge() || visibleBadge()" [class.orelha-cor]="!!catColor()" [style.--cat-cor]="catColor()" aria-hidden="true">
        <app-cat-label [label]="c.label" [look]="catLook()" [iconSize]="compact() ? 12 : 13" />
      </span>
    }

    <div class="head">
      @if (!note() || review().game.coverUrl) {
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
          @if ((lockBadge() || publicBadge() || visibleBadge() || (capas() && (review().revisitOf || doneAt()))) && !bare()) {
            <span class="selos">
              @if (lockBadge()) {
                <span class="selo privada-selo" title="Privada: só você vê">
                  <lucide-icon [img]="PrivateIcon" [size]="compact() || capas() ? 13 : 15" [strokeWidth]="2.8" aria-hidden="true" />
                  <span class="sr-only">Privada: só você vê</span>
                </span>
              }
              @if (publicBadge()) {
                <span class="selo publica-selo" title="Publicada: quem abre o seu mural vê">
                  <lucide-icon [img]="PublicIcon" [size]="compact() || capas() ? 13 : 15" [strokeWidth]="2.8" aria-hidden="true" />
                  <span class="sr-only">Publicada: quem abre o seu mural vê</span>
                </span>
              }
              @if (visibleBadge()) {
                <span class="selo visivel-selo" title="Visível: está no seu mural, sem aviso no Feed">
                  <lucide-icon [img]="VisibleIcon" [size]="compact() || capas() ? 13 : 15" [strokeWidth]="2.8" aria-hidden="true" />
                  <span class="sr-only">Visível: está no seu mural, sem aviso no Feed</span>
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
      } @else if ((publicBadge() || visibleBadge() || (capas() && doneAt())) && !bare()) {
        <!-- anotação sem capa: os selinhos ficam no canto da ficha. A anotação nasce privada: o
             cadeado em todas não diria nada, então quem ganha selo é a publicada -->
        <span class="selos selos-ficha">
          @if (publicBadge()) {
            <span class="selo publica-selo" title="Publicada: quem abre o seu mural vê">
              <lucide-icon [img]="PublicIcon" [size]="13" [strokeWidth]="2.8" aria-hidden="true" />
              <span class="sr-only">Publicada: quem abre o seu mural vê</span>
            </span>
          }
          @if (visibleBadge()) {
            <span class="selo visivel-selo" title="Visível: está no seu mural, sem aviso no Feed">
              <lucide-icon [img]="VisibleIcon" [size]="13" [strokeWidth]="2.8" aria-hidden="true" />
              <span class="sr-only">Visível: está no seu mural, sem aviso no Feed</span>
            </span>
          }
          @if (capas() && doneAt()) {
            <span class="selo feito-selo" aria-hidden="true"><lucide-icon [img]="DoneIcon" [size]="13" [strokeWidth]="3" /></span>
          }
        </span>
      }

      <div class="words">
        <h4 class="title" data-queima>{{ empty() || bare() ? emptyName() : review().game.name }}</h4>
        @if (bare()) {
          <!-- só a cartolina: a linha de data fica como no molde, sem dizer nada -->
          <p class="meta molde" data-queima>{{ bareMeta() }}</p>
        } @else if (!capas() && note()) {
          <p class="meta" data-queima>
            <!-- a sub-nota diz de qual anotação ela é parte (a que tem o link para ela), antes da data -->
            @if (review().noteRank === 'sub') {
              <span class="sub-marca">{{ parent() ? 'Parte de ' + parent()!.game.name : 'Sub-nota' }}</span><span aria-hidden="true"> · </span>
            }
            @if (review().completedAt; as day) {
              <time [attr.datetime]="day">{{ date() }}</time>
            } @else {
              <span>{{ date() }}</span>
            }
            <!-- as tarefas: quantas já foram feitas -->
            @if (tasks(); as t) {
              <span aria-hidden="true"> · </span><span class="tarefas-conta" [class.todas]="t.done === t.total"><lucide-icon class="tarefas-icone" [img]="TasksIcon" [size]="compact() ? 13 : 14" [strokeWidth]="2.8" aria-hidden="true" />{{ t.done }}/{{ t.total }}<span class="sr-only"> tarefas feitas</span></span>
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
        <!-- a categoria (o adesivo) e as tags (as etiquetas de papel pardo), no lugar da etiqueta da
             nota: o espaço ao lado da foto é delas -->
        @if (!capas() && (noteLabels().category || noteLabels().tags.length)) {
          <ul class="judge categorias" data-colado aria-label="Categoria e tags">
            <!-- a categoria está na orelha de cima; aqui, só para o leitor de tela -->
            @if (noteLabels().category; as c) {
              <li class="sr-only">{{ c.label }} (categoria)</li>
            }
            @for (t of noteLabels().tags; track t; let i = $index) {
              <li><app-note-tag [label]="t" [index]="i + 1" [size]="compact() ? 'mini' : 'card'" /><span class="sr-only"> (tag)</span></li>
            }
            @if (noteLabels().hidden) {
              <li class="mais">+{{ noteLabels().hidden }}</li>
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
    <!-- o alfinete e o check da anotação: duas etiquetas de tinta presas na beirada de cima, que
         aparecem com o mouse em cima da ficha (ou o foco do teclado); no toque, ficam sempre -->
    @if (canFinish()) {
      <div class="acoes">
        <button
          type="button"
          class="feito"
          [class.marcado]="!!review().doneAt"
          [attr.aria-label]="(review().doneAt ? 'Reabrir: ' : 'Finalizar: ') + review().game.name"
          [title]="review().doneAt ? 'Abrir a anotação de novo' : 'Finalizar a anotação (bate o carimbo)'"
          (click)="finish()"
        >
          <lucide-icon [img]="review().doneAt ? ReopenIcon : FinishIcon" [size]="16" [strokeWidth]="3" aria-hidden="true" />
          <span class="acao-nome" aria-hidden="true">{{ review().doneAt ? 'Reabrir' : 'Finalizar' }}</span>
        </button>
        <button
          type="button"
          class="fixar"
          [class.marcado]="review().noteRank === 'fixada'"
          [attr.aria-pressed]="review().noteRank === 'fixada'"
          [attr.aria-label]="'Fixar no topo: ' + review().game.name"
          [title]="review().noteRank === 'fixada' ? 'Desafixar' : 'Fixar no topo do mural'"
          (click)="togglePin($event)"
        >
          <lucide-icon [img]="PinIcon" [size]="16" [strokeWidth]="2.4" aria-hidden="true" />
        </button>
        <!-- a sub-nota: a seta de item de dentro, sempre à mostra (como o alfinete da fixada); abre
             a lista das anotações que apontam para ela -->
        @if (subMark(); as s) {
          <button
            type="button"
            class="sub-ind"
            [attr.aria-label]="'Sub-nota: ver ' + (s.count === 1 ? 'a anotação que aponta' : 'as ' + s.count + ' anotações que apontam') + ' para ' + review().game.name"
            [title]="s.count === 1 ? 'Sub-nota: ver de onde ela é parte' : 'Sub-nota: citada em ' + s.count + ' anotações'"
            (click)="backlinks.open(review().id)"
          >
            <lucide-icon [img]="SubIcon" [size]="16" [strokeWidth]="2.8" aria-hidden="true" />
            @if (s.count) {
              <span class="sub-n" aria-hidden="true">{{ s.count }}</span>
            }
          </button>
        }
      </div>
    }
    @if (note() && !compact() && !capas()) {
      @if (review().text.trim()) {
        <!-- o começo da anotação, já formatado (listas, tarefas): a parede mostra o que tem nela -->
        <!-- o estrago queima o texto de dentro: o esmaecido do fim fica na caixa (os dois juntos) -->
        <div class="nota-texto" [class.marcavel]="interactive()" [class.com-faixa]="hasTrack()" appCorta>
          <app-rich-text data-queima [text]="review().text" [fold]="true" [checkable]="checkable()" [links]="noteLinks()" (toggled)="toggleTask($event)" />
        </div>
      }
    } @else if (!compact() && !capas()) {
      @if (full() && !bare() && review().text.trim()) {
        <!-- a ficha inteira: o texto todo, formatado, na letra de quem escreveu -->
        @if (masked()) {
          <p class="texto-inteiro" data-queima><app-rabisco [text]="fullMasked()" /><span class="sr-only">Texto escondido</span></p>
        } @else {
          <div class="texto-inteiro" data-queima><app-rich-text [text]="review().text" /></div>
        }
      } @else if (lead(); as line) {
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

    <!-- finalizada: o carimbo redondo batido no canto da ficha, por cima do papel (some com o estrago) -->
    @if (!capas() && doneAt(); as at) {
      <span class="carimbo" [class.clara]="dark()" data-queima>
        <app-done-stamp [at]="at" [size]="compact() ? 'compact' : 'card'" [dark]="dark()" [hit]="stamping()" />
      </span>
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
      /* onde a tachinha fura: o --pin-x da ficha, ou logo depois da orelha da categoria, se o nome
         dela for até lá (--aba-fim: onde a orelha acaba, medido no construtor) */
      --tachinha: max(var(--pin-x), calc(var(--aba-fim, 0px) + 17px));
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
      /* --inclina: na colagem das fichas inteiras, a ficha comprida endireita (ver keptTilt, em pages/wall-cards.ts) */
      rotate: calc(var(--tilt) * var(--inclina, 1) * 1deg);
      transform-origin: var(--tachinha) 12px;
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
    :host(.recortada:has(:focus-visible)),
    :host(.recortada:active) {
      box-shadow: none;
      /* na ficha inteira, e não no papel: o filtro vem antes da máscara, e a máscara do papel cortaria a sombra */
      filter: var(--sombra-papel);
    }
    :host(.recortada:hover),
    :host(.recortada:has(:focus-visible)) {
      --sombra-papel: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3)) drop-shadow(0 16px 16px rgb(0 0 0 / 0.5)) drop-shadow(0 32px 32px rgb(0 0 0 / 0.45));
    }

    /* Empurrãozinho: a ficha gira em volta da tachinha e desgruda da parede. Pelo teclado também, com
       o foco que aparece (:focus-visible), e não com qualquer foco: o clique deixa o foco na ficha (e a
       leitura, ao fechar, devolve o foco a ela), e a ficha ficava levantada com o mouse já longe */
    :host(:hover),
    :host(:has(:focus-visible)) {
      rotate: calc(var(--tilt) * var(--inclina, 1) * 0.35deg);
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
      left: calc(var(--tachinha) - 13px);
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
      /* tinta preta de verdade, sem contorno, em qualquer cartolina: na escura a tinta da ficha é
         clara e o selo virava um disco cinza */
      background: #151515;
      color: var(--hi);
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

    /* ===== Anotação: a categoria na orelha de divisória =====
       Papel manilha colado atrás da cartolina, como a divisória de matéria do caderno: o papel da ficha
       (camadas -3 e -2) cobre o pé da orelha, que só aparece saindo pela beirada de cima, entre o canto
       e a tachinha, com o desenho e o nome a pincel atômico, como as abas do mural. O nome vai inteiro:
       com um nome comprido, a tachinha é que vai para depois da orelha (ver --aba-fim). Só não passa
       do canto da direita, que é do Finalizar e do Fixar. */
    .aba-cat {
      position: absolute;
      top: -29px;
      left: 14px;
      z-index: -4;
      display: inline-flex;
      align-items: center;
      gap: 5px;
      max-width: calc(100% - 14px - 60px);
      height: 44px;
      padding: 5px 11px 12px 9px;
      border-radius: 8px 8px 0 0;
      background-color: #f3e5bb;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      /* a tinta preta fixa: na cartolina escura, a tinta da ficha clareia e sumia no manilha */
      color: #151515;
      box-shadow:
        0 -1px 0 rgb(255 255 255 / 0.35) inset,
        0 2px 6px rgb(0 0 0 / 0.45);
      pointer-events: none;
      transition: translate var(--t-ui) var(--ease-ui);
    }
    /* com o mouse na ficha, a orelha sobe mais um pouco, como a divisória puxada para achar a matéria */
    :host(:hover) .aba-cat,
    :host(:has(:focus-visible)) .aba-cat {
      translate: 0 -6px;
    }
    :host(:active) .aba-cat {
      translate: 0 0;
    }
    /* com os selos no canto, a orelha começa depois deles */
    .aba-cat.com-selo {
      left: 30px;
      max-width: calc(100% - 30px - 60px);
    }
    .aba-cat app-cat-label {
      font-family: var(--f-marker);
      font-size: 0.94rem;
      line-height: 1.2;
    }
    :host(.compact) .aba-cat {
      top: -24px;
      height: 38px;
      padding: 4px 9px 10px 8px;
    }
    :host(.compact) .aba-cat app-cat-label {
      font-size: 0.84rem;
    }
    /* com cor, a borda colorida corre por dentro da orelha inteira (ver .orelha-cor em styles.scss)
       e o pé dela fica atrás da cartolina: a orelha sobe um pouco, para o nome caber no meio dela */
    .aba-cat.orelha-cor {
      top: -32px;
      height: 47px;
      padding: 9px 13px 19px 11px;
    }
    :host(.compact) .aba-cat.orelha-cor {
      top: -27px;
      height: 41px;
      padding: 8px 11px 17px 10px;
    }
    @media (prefers-reduced-motion: reduce) {
      .aba-cat {
        transition: none;
      }
    }

    /* ===== Anotação: as tags no lugar da etiqueta, e o texto à mostra ===== */
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
      /* a imagem e o vídeo colados no texto cabem na ficha, com a faixa da polaroide e uma linha de folga */
      --midia-max: calc(var(--line) * (var(--linhas) - 3.2));
    }
    /* com uma faixa de áudio, a ficha mostra mais linhas: a fita e o vinil ficam quase do tamanho da
       leitura (nove linhas), e ainda sobram linhas para o texto em volta. A foto colada fica como era. */
    .nota-texto.com-faixa {
      --linhas: 14;
      --faixa-max: calc(var(--line) * 9);
      --midia-max: calc(var(--line) * 4.8);
    }
    /* o texto de dentro é o que o estrago queima (ver paper-layer.ts) */
    .nota-texto app-rich-text {
      display: block;
    }
    /* na ficha a tabela não rola: o que passa da largura some na beirada, como o resto do texto
       (a leitura é que rola de lado) */
    .nota-texto ::ng-deep .tabela-rolo {
      overflow: clip;
    }
    /* só o texto que passou da ficha esmaece no fim (ver ui/clamp.ts) */
    .nota-texto[data-corta] {
      -webkit-mask-image: linear-gradient(to bottom, #000 calc(100% - var(--line) * 1.2), transparent);
      mask-image: linear-gradient(to bottom, #000 calc(100% - var(--line) * 1.2), transparent);
    }
    /* a ficha inteira: o texto todo, sem corte nem esmaecido no fim */
    :host(.inteira) .nota-texto {
      max-height: none;
      /* sem corte, a faixa fica do tamanho que tem na leitura */
      --faixa-max: 22em;
    }
    :host(.inteira) .nota-texto[data-corta] {
      -webkit-mask-image: none;
      mask-image: none;
    }
    /* a resenha inteira: o texto todo no lugar da primeira frase, na mesma letra da anotação */
    .texto-inteiro {
      margin-top: 14px;
      font-family: var(--f-hand);
      font-size: 1.04rem;
      line-height: 1.4rem;
      white-space: pre-wrap;
      overflow-wrap: anywhere;
    }
    .texto-inteiro app-rich-text {
      display: block;
    }
    /* com tarefas ou links: o texto fica por cima do botão da ficha, mas só as caixinhas e os links
       pegam o toque; o resto do texto deixa o toque passar e abre a leitura como sempre */
    .nota-texto.marcavel {
      z-index: 5;
      pointer-events: none;
    }
    .nota-texto.marcavel ::ng-deep input[type='checkbox'],
    .nota-texto.marcavel ::ng-deep .elo[tabindex],
    .nota-texto.marcavel ::ng-deep a.url,
    .nota-texto.marcavel ::ng-deep .tocavel {
      pointer-events: auto;
    }

    /* ===== O alfinete e o check da anotação: duas etiquetas de tinta, presas na beirada de cima =====
       Ficam metade para fora da ficha (como o balão das reações embaixo), então não cobrem o título.
       Aparecem com o mouse em cima da ficha ou com o foco do teclado nelas; a fixada mantém o
       alfinete vermelho à vista, que é o estado dela. No toque, sem mouse, ficam sempre. Pretas em
       toda cartolina, clara ou escura (metade delas fica na parede). */
    .acoes {
      --etiqueta: #151515;
      --etiqueta-tinta: #f1f1ec;
      --etiqueta-verde: #8fe3ad;
      --etiqueta-vermelho: #ff8f80;
      position: absolute;
      top: -15px;
      right: 12px;
      z-index: 6;
      display: flex;
      gap: 4px;
      rotate: -1.5deg;
    }
    .fixar,
    .feito {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 5px;
      height: 30px;
      padding: 0;
      border: 0;
      border-radius: 3px;
      background: var(--etiqueta);
      color: var(--etiqueta-tinta);
      box-shadow:
        0 1px 2px rgb(0 0 0 / 0.4),
        0 4px 8px -3px rgb(0 0 0 / 0.4);
      cursor: pointer;
      opacity: 0;
      translate: 0 5px;
      pointer-events: none;
      transition:
        opacity var(--t-ui) var(--ease-ui),
        translate var(--t-ui) var(--ease-ui),
        scale var(--t-ui) var(--ease-ui);
    }
    .fixar {
      width: 30px;
    }
    /* a sub-nota: sempre à mostra, como o alfinete da fixada (é o estado dela) */
    .sub-ind {
      position: relative;
      display: inline-flex;
      align-items: center;
      justify-content: center;
      gap: 3px;
      min-width: 30px;
      height: 30px;
      padding: 0 7px;
      border: 0;
      border-radius: 3px;
      background: var(--etiqueta);
      color: var(--etiqueta-tinta);
      box-shadow:
        0 1px 2px rgb(0 0 0 / 0.4),
        0 4px 8px -3px rgb(0 0 0 / 0.4);
      cursor: pointer;
      transition: scale var(--t-ui) var(--ease-ui);
    }
    .sub-ind::before {
      content: '';
      position: absolute;
      inset: -7px -2px;
    }
    .sub-ind lucide-icon {
      display: inline-flex;
    }
    .sub-n {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.82rem;
      font-variant-numeric: tabular-nums;
    }
    .sub-ind:focus-visible {
      outline: 2.5px solid var(--etiqueta);
      outline-offset: 2px;
      box-shadow:
        0 0 0 6px rgb(241 241 236 / 0.85),
        0 1px 2px rgb(0 0 0 / 0.4);
    }
    @media (hover: hover) {
      .sub-ind:hover {
        scale: 1.06;
      }
    }
    :host(.carimbando) .sub-ind {
      opacity: 0;
      pointer-events: none;
    }
    .feito {
      padding: 0 10px 0 8px;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }
    /* o check na tinta verde do carimbo que ele bate */
    .feito lucide-icon {
      display: inline-flex;
      color: var(--etiqueta-verde);
    }
    .feito.marcado lucide-icon {
      color: inherit;
    }
    /* a área de toque passa da etiqueta, mas só até o meio do vão entre as duas (o alfinete fica no
       canto, então a fixada, sem o mouse, mostra só ele, no lugar de sempre) */
    .fixar::before,
    .feito::before {
      content: '';
      position: absolute;
      inset: -7px -2px -7px -2px;
    }
    :host(:hover) :is(.fixar, .feito),
    .acoes:has(:focus-visible) :is(.fixar, .feito),
    .fixar.marcado {
      opacity: 1;
      translate: 0 0;
      pointer-events: auto;
    }
    /* o foco na tinta da etiqueta, com folga e o halo claro: aparece na cartolina clara e na escura */
    .fixar:focus-visible,
    .feito:focus-visible {
      outline: 2.5px solid var(--etiqueta);
      outline-offset: 2px;
      box-shadow:
        0 0 0 6px rgb(241 241 236 / 0.85),
        0 1px 2px rgb(0 0 0 / 0.4);
    }
    @media (hover: hover) {
      .fixar:hover,
      .feito:hover {
        scale: 1.06;
      }
      .fixar:not(.marcado):hover {
        color: var(--etiqueta-vermelho);
      }
    }
    /* fixada: o alfinete cravado, vermelho e cheio */
    .fixar.marcado {
      color: var(--etiqueta-vermelho);
      animation: crava 320ms var(--ease-physical);
    }
    .fixar lucide-icon {
      display: inline-flex;
      rotate: 18deg;
      transition: rotate var(--t-physical) var(--ease-physical);
    }
    .fixar.marcado lucide-icon {
      rotate: 38deg;
    }
    .fixar.marcado ::ng-deep svg {
      fill: currentColor;
      fill-opacity: 0.85;
    }
    @keyframes crava {
      from {
        scale: 1.3;
        translate: 3px -5px;
      }
    }
    /* o carimbo batendo: as etiquetas saem da frente, a vez é dele */
    :host(.carimbando) :is(.fixar, .feito) {
      opacity: 0;
      pointer-events: none;
    }
    /* sem mouse, as etiquetas não esperam o mouse passar: ficam, só com o desenho (o nome vai para o
       leitor de tela e para a dica), um pouco maiores para o dedo */
    @media (hover: none) {
      .fixar,
      .feito {
        opacity: 1;
        translate: 0 0;
        pointer-events: auto;
        width: 34px;
        height: 34px;
        padding: 0;
      }
      .acoes {
        top: -17px;
        gap: 6px;
      }
      .sub-ind {
        min-width: 34px;
        height: 34px;
      }
      .acao-nome {
        display: none;
      }
      .fixar::before,
      .feito::before {
        inset: -5px -3px;
      }
    }
    .sub-marca {
      opacity: 0.7;
    }
    /* as tarefas da anotação: o desenho do checklist e a conta; todas feitas, o verde do carimbo */
    .tarefas-conta {
      white-space: nowrap;
    }
    .tarefas-icone {
      display: inline-block;
      vertical-align: -2px;
      margin-right: 3px;
    }
    .tarefas-conta.todas {
      color: #1f7a45;
    }
    :host([data-cor$='escuro']) .tarefas-conta.todas,
    :host([data-cor='preto']) .tarefas-conta.todas {
      color: #8fe3ad;
    }
    /* o selo da anotação publicada e o da ficha só visível: o mesmo selinho de tinta, com o desenho de pessoas ou o olho */
    .publica-selo,
    .visivel-selo {
      color: #f7f4ec;
    }

    /* ===== Só capa e nome, na anotação sem capa: o título é a ficha ===== */
    :host(.capas.sem-capa) .head {
      grid-template-areas: 'words';
      /* a altura de uma ficha com capa (a foto 4:5 e o nome embaixo), para a fileira não desencontrar */
      aspect-ratio: 4 / 5.6;
      align-content: center;
    }
    :host(.capas.sem-capa) .words {
      padding: 0 4px;
    }
    :host(.capas.sem-capa) .title {
      min-height: 0;
      font-size: 1.12rem;
      line-height: 1.12;
      text-wrap: balance;
      -webkit-line-clamp: 5;
    }

    /* O carimbo da finalizada: batido no canto de baixo, por cima do que está escrito (a tinta
       escurece o papel e a letra continua lendo-se por baixo). Não pega toque: a ficha abre. */
    .carimbo {
      position: absolute;
      right: 14px;
      bottom: 12px;
      z-index: 3;
      mix-blend-mode: multiply;
      pointer-events: none;
    }
    .carimbo.clara {
      mix-blend-mode: normal;
    }
    /* a finalizada curta (só o título) cresce o bastante para o carimbo caber embaixo do título */
    :host(.feita:not(.compact)) {
      min-height: 150px;
    }
    /* na ficha simples (uma tira baixa), no canto do pé da tira; o título não passa por baixo */
    :host(.compact) .carimbo {
      right: 12px;
      bottom: 6px;
    }
    :host(.compact.feita) .words > :first-child {
      margin-right: 72px;
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
      .fixar.marcado {
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
        rotate: calc(var(--tilt) * var(--inclina, 1) * 0.5deg);
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
  /** A ficha inteira (o tipo "Fichas inteiras"): a completa com o texto todo, sem cortar. */
  readonly full = input(false);
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
  /** A ficha é sua (o seu mural, o editor): a orelha leva o desenho e a cor que você escolheu para a categoria. */
  readonly own = input(false);
  readonly opened = output<string>();
  readonly toggled = output<string>();

  private readonly store = inject(ReviewStore);

  /** Marcou uma tarefa na ficha do mural: a anotação é salva com ela marcada, sem abrir nada. */
  protected toggleTask(line: number): void {
    const r = this.store.get(this.review().id);
    if (!r || !this.checkable()) return;
    const text = toggleCheck(r.text, line);
    if (text === r.text) return;
    this.store.update({ ...r, text, updatedAt: new Date().toISOString() });
    // a tarefa com link para outra anotação: oferece finalizar aquela também
    void this.noteDone.offerLinked(r.id, text, line);
  }

  private readonly desk = inject(Desk);
  private readonly noteDone = inject(NoteDone);
  private readonly view = inject(WallView);
  private readonly motion = inject(WallMotion);
  private readonly settings = inject(Settings);

  /** Quando a anotação foi finalizada (o carimbo), ou null. */
  protected readonly doneAt = computed(() => (this.note() && !this.bare() ? (this.review().doneAt ?? null) : null));
  /** O cadeado das resenhas privadas (a anotação nasce privada: nela, quem ganha selo é a publicada). */
  protected readonly lockBadge = computed(() => !this.note() && !!this.review().private);
  /** A anotação publicada, no seu mural: quem abre o seu mural vê, e ela foi para o Feed. */
  protected readonly publicBadge = computed(() => this.note() && audienceOf(this.review()) === 'publicar' && this.checkable());
  /** A ficha só visível, no seu mural: está no mural que os outros veem, mas não foi para o Feed. */
  protected readonly visibleBadge = computed(() => audienceOf(this.review()) === 'visivel' && this.checkable());
  protected readonly PublicIcon = UsersRound;
  protected readonly VisibleIcon = Eye;
  protected readonly TasksIcon = ListChecks;
  /** As tarefas do texto da anotação: quantas feitas de quantas (null: sem tarefas). */
  protected readonly tasks = computed(() => {
    if (!this.note()) return null;
    const c = checkCount(this.review().text);
    return c.total ? c : null;
  });
  /**
   * A anotação de que a sub-nota é parte: a que tem o link para ela (a mais antiga, se forem várias).
   * Só no seu mural (nos outros, a ficha não conhece as outras anotações).
   */
  protected readonly parent = computed<Review | null>(() => {
    const r = this.review();
    if (!this.note() || r.noteRank !== 'sub' || !this.checkable()) return null;
    return parentNoteOf(r, this.store.notes());
  });

  protected readonly backlinks = inject(NoteBacklinks);
  protected readonly SubIcon = CornerDownRight;
  /**
   * O indicador de sub-nota (também na fixada que era sub-nota), com quantas anotações apontam para
   * ela. Só onde a ficha tem as etiquetas de cima (no seu mural).
   */
  protected readonly subMark = computed(() => {
    const r = this.review();
    if (!this.canFinish() || (r.noteRank !== 'sub' && !r.pinnedSub)) return null;
    return { count: backlinksOf(r, this.store.notes()).length };
  });

  /** O check e o alfinete da anotação: só no seu mural (e não na ficha de só capa e nome, pequena demais). */
  protected readonly canFinish = computed(() => this.note() && this.checkable() && !this.preview() && !this.capas());
  protected readonly DoneIcon = CheckCheck;
  /**
   * Tem uma fita cassete ou um vinil? A ficha mostra mais linhas, para eles caberem num tamanho de
   * tocar (o simples é uma tira baixa: cabe como está).
   */
  protected readonly hasTrack = computed(() =>
    this.review()
      .text.split('\n')
      .some((l) => {
        const w = parseWidgetLine(l);
        return w?.name === 'audio' && readAudio(w.args).look !== 'simples';
      }),
  );
  /**
   * O texto tem o que tocar (tarefas, links)? Só então ele sobe por cima do botão da ficha; sem nada
   * para tocar, fica no lugar de sempre, por baixo do que o papel põe por cima dele.
   */
  protected readonly interactive = computed(() => {
    const t = this.review().text;
    // os links para fora abrem em qualquer mural; as tarefas e os links entre anotações, só no seu
    return hasInteractive(t) && (this.checkable() || /https?:\/\/|mailto:/.test(t));
  });
  /** Acabou de ganhar o check: o carimbo bate, e daqui a pouco a ficha sai do mural. */
  protected readonly stamping = computed(() => this.note() && !this.preview() && this.view.stamping().has(this.review().id));

  private readonly notePin = inject(NotePin);
  protected readonly PinIcon = PinGlyph;
  protected readonly FinishIcon = Check;
  protected readonly ReopenIcon = Undo2;
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
      create: (title) => this.desk.newNote(title, from),
    };
  });

  /** É uma anotação (mural de anotações): sem nota nem veredito; as categorias e o texto. */
  protected readonly note = computed(() => isNote(this.review()));
  /** A categoria (na orelha) e as tags que cabem ao lado da foto (até 4 na Completa, 2 na Simples); o resto vira "+N". */
  protected readonly noteLabels = computed(() => {
    const r = this.review();
    const tags = r.tags ?? [];
    // a categoria saiu para a orelha: a fileira é toda das tags
    const max = this.compact() ? 2 : 4;
    return { category: r.category ? categoryBonus(r.category) : null, tags: tags.slice(0, max), hidden: Math.max(0, tags.length - max) };
  });

  /** O desenho e a cor da categoria na orelha: os escolhidos, só nas suas fichas (nas dos outros, o de sempre). */
  protected readonly catLook = computed(() => {
    const c = this.review().category;
    return c && this.own() ? this.settings.categoryLook(c) : {};
  });
  protected readonly catColor = computed(() => categoryColorHex(this.catLook().color));

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
  /** A orelha da categoria (a tachinha vai para depois dela). */
  private readonly abaCat = viewChild<ElementRef<HTMLElement>>('abaCat');
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
  /** Sem spoilers, o texto todo da ficha inteira vira rabisco do mesmo tamanho. */
  protected readonly fullMasked = computed(() => scramble(plainText(this.review().text), this.review().id));
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
      const cats = [r.category ? `categoria ${r.category}` : '', ...(r.tags ?? []).map((t) => `tag ${t}`)].filter(Boolean).join(', ');
      const when = r.completedAt === null ? NO_DAY_LABEL.toLowerCase() : formatReviewDate(r.completedAt);
      const rank = r.noteRank === 'fixada' ? 'fixada' : r.noteRank === 'sub' ? 'sub-nota' : '';
      const done = r.doneAt ? `finalizada em ${doneDayLong(r.doneAt)}` : '';
      const tasks = this.tasks();
      const todo = tasks ? `${tasks.done} de ${tasks.total} tarefas feitas` : '';
      return `Abrir anotação: ${[r.game.name, rank, done, cats, todo, when, { publicar: 'publicada', visivel: 'visível', privada: '' }[audienceOf(r)]].filter(Boolean).join(', ')}`;
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
    // a orelha da categoria com o nome inteiro: a tachinha fura a ficha depois dela (ver --tachinha)
    effect((onCleanup) => {
      const aba = this.abaCat()?.nativeElement;
      // os selos no canto empurram a orelha para a direita
      this.publicBadge();
      this.visibleBadge();
      if (!aba) {
        el.style.removeProperty('--aba-fim');
        return;
      }
      const measure = () => el.style.setProperty('--aba-fim', `${aba.offsetLeft + aba.offsetWidth}px`);
      const ro = new ResizeObserver(measure);
      ro.observe(aba);
      measure();
      onCleanup(() => ro.disconnect());
    });
  }
}
