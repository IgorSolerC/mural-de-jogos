import { Router } from '@angular/router';
import { NoteFolders } from '../core/note-folders';
import { NO_FOLDERS, pathLabel } from '../core/folders';
import {
  ApplicationRef,
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  EnvironmentInjector,
  Injector,
  afterNextRender,
  computed,
  effect,
  forwardRef,
  inject,
  input,
  linkedSignal,
  untracked,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BackdropClose } from './backdrop-close';
import { ROOM, Room } from './room';
import { LucideIconData } from 'lucide-angular';
import { ICON, ICON_CHOICE, IconModule } from './icons';
import { NOTES, cap, g, profileOf } from '../core/kinds';
import { BONUS_KIND_LABEL, MUSIC_FORM_LABEL, NO_DAY_LABEL, Review, SCORE_LABEL, VERDICT_LABEL, ratedKeys, scoreOf, weightOf, isCanvas, isMusicReview, isNote, musicFormOf, dayLabel, formatAmount, formatReviewDate, formatReviewDateLong, formatScore, isDarkStock, isPrivate, sortBonuses, timesOf } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SideBySide } from '../core/side-by-side';
import { lookOf } from '../core/paper';
import { paperVars } from '../core/paper-art';
import { pinningFor } from '../core/wall-physics';
import { Settings } from '../core/settings';
import { scramble } from '../core/spoiler';
import { Rabisco } from './rabisco';
import { Boletim } from './boletim';
import { BonusSticker } from './bonus';
import { CoverSleeve } from './cover-sleeve';
import { RecordCover } from './record-cover';
import { Skulls } from './difficulty';
import { JudgeLabel } from './judge-label';
import { Luz } from './luz';
import { Pin } from './pin';
import { MoreItem, MoreMenu } from './more-menu';
import type { PdfDoc } from './pdf-sheet';
import { Toasts } from './toast';
import { StatusLabel } from './status-label';
import { RichText } from './rich-text';
import { ReviewCard } from './review-card';
import { ReactionBubble, ReactionPicker } from './reactions';
import { ReactionTarget, Reactions } from '../core/reactions';
import { checkCount, plainText, tickTask } from '../core/rich-text';
import { SpoilerShield } from '../core/spoiler-shield';
import { NoteLinks, TextSpot, linkSpot, notesOf, placesOf, resolveNote, spotTitle, tableRowLine } from '../core/note-links';
import { ReminderLinks } from '../core/reminder-links';
import { KanbanDeps } from '../core/kanban-deps';
import { KanbanStore } from '../core/kanban-store';
import { CalendarStore } from '../core/calendar-store';
import { nearDayLabel, remindersOfNote, timeLabel } from '../core/calendar';
import { KanbanDepsBadge } from './kanban-deps';
import { NoteDone } from '../core/note-done';
import { NotePin } from '../core/note-pin';
import { napWall } from '../core/wall-settle';
import { WallState, WallView } from '../core/wall-view';
import { DoneStamp } from './done-stamp';
import { categoryColorHex, tagColorHex } from '../core/category-looks';
import { CloudAccount } from '../core/cloud-account';
import { CommentTarget, Comments, QuoteRequest } from '../core/comments';
// só usada dentro do @defer do molde, e num import só dela: assim a folha (com o editor) chega num pedaço à parte
import { CommentsPanel } from './comments-panel';
// as folhas das anotações compartilhadas, também em pedaços à parte (cada uma num import só dela)
import { ShareSheet } from './share-sheet';
// o "Escolher a nota" do "+" (abrir outra ao lado), num pedaço à parte, só quando abre
import { CardPicker } from './card-picker';
// a folhinha da nota nova a partir de um trecho (PLANO-NOTA-DE-REFERENCIA.md), num pedaço à parte, só quando abre
import { QuickNoteSheet } from './quick-note-sheet';
import type { Word } from '../core/dictionary/dictionary';
import { DictionaryMarks } from '../core/dictionary/marks-store';
import { markLearned } from './word-marking';
import { WordSheet } from './word-sheet';
import type { QuickNoteLinked } from './quick-note-sheet';
import { ConflictSheet } from './conflict-sheet';
import { LinkSheet } from './link-sheet';
import { CardConfig } from './card-config';
import { VozFita } from './voz-fita';
import { Voz } from '../core/voz';
import { CALENDAR_PATH, canvasPath, studyPath, wallPath } from '../core/areas';
import { FreeBoardStore } from '../core/free-board-store';
import type { FreeBoard } from '../core/free-board';
import { boardIdOfNote } from '../core/canvas-id';
import { FreeBoardView } from './free-board/free-board-view';
import { DictionaryView } from './dictionary-view';
import { LEVEL_LABEL, cardDecks, levelOf, studyGroupId, whenLabel } from '../core/study';
import { StudyStore } from '../core/study-store';
import { FichaLinks } from '../core/ficha-link';
import { OrganizeSheet } from './organize-sheet';
import { ReviewEditor, SavedEvent } from './review-editor';
import { SharedStore } from '../core/shared-store';
import { SyncConflicts } from '../core/sync-conflicts';
import { accessSummary, namesOf } from '../core/access';
import { DetailsPerson, ReaderDetails, ReaderDetailsData, tapeDate } from './reader-details';
import { SharedGroupsStore } from '../core/shared-groups-store';
import { canManage, canWrite, removalOf } from '../core/shared-notes';


/** O vão entre o trecho selecionado e o remendo "Citar" (e entre o remendo e o rodapé). */
const PATCH_GAP = 8;

/** As linhas do texto onde se lê (as de dentro de uma lista também), para guardar o trecho no alto da folha. */
const LINES = ':is(.linha, pre, .widget, .tabela-peca)';

/**
 * Onde cabem duas anotações lado a lado (PLANO-DUAS-NOTAS.md): a medida da folha de comentários ao lado. A
 * tela que estreita para menos fecha a segunda.
 */
export const BESIDE_MEDIA = '(min-width: 1180px)';

/**
 * Como a ficha aberta se mostra: a leitura (com a medida da tela cheia de antes:
 * a faixa fina e a coluna larga, PLANO-LEITURA-UNIFICADA.md); ou só a cartolina, a ficha como fica pregada no mural, grande, para ver o
 * papel dela. Cada ficha abre na leitura (nada fica guardado).
 */
export type ReaderView = 'leitura' | 'cartolina';

/** Só a cartolina: até quanto a ficha do mural cresce, e o menos que ela encolhe para caber inteira. */
export const CARD_ZOOM_MAX = 1.8;
export const CARD_ZOOM_MIN = 0.5;

/**
 * O zoom que põe a ficha do mural (de `w` × `h` px) do maior tamanho que cabe em `roomW` × `roomH`,
 * entre CARD_ZOOM_MIN e CARD_ZOOM_MAX, em centésimos (a medida que volta igual não muda nada).
 */
export function cardZoomFor(w: number, h: number, roomW: number, roomH: number): number {
  if (!(w > 0) || !(h > 0)) return 1;
  const fit = Math.min(roomW / w, roomH / h, CARD_ZOOM_MAX);
  return Math.max(CARD_ZOOM_MIN, Math.floor(fit * 100) / 100);
}

/** Onde se lia: o trecho do texto no alto da folha, onde ele estava e a rolagem de então. */
/** Uma anotação do caminho dos links da leitura (ver `trail`): a sua volta como está agora, ou some se foi apagada. */
interface TrailStop {
  review: Review;
  own: boolean;
}

interface ReadingPlace {
  block: HTMLElement | null;
  /**
   * A posição da linha entre as do texto, para achá-la em outra folha com o mesmo texto (a segunda anotação
   * que fica sozinha: a folha dela some, e a de fora desenha o mesmo texto); -1 sem linha.
   */
  index: number;
  /** A distância do alto da folha até o começo da linha (a linha que começa abaixo do alto). */
  offset: number;
  /** Quanto da linha já passou do alto, de 0 a 1 (a linha alta, que começa acima dele). */
  passed: number;
  scrollTop: number;
}

/** O trecho selecionado e os remendos dele (ver `picked`). */
interface PickedPiece {
  text: string;
  left: number;
  top: number;
  quote: boolean;
  spot: TextSpot | null;
  /** As palavras do Dicionário Japonês que o trecho é (vazio: não é nenhuma). */
  words: Word[];
}

/** A folhinha da nota nova pedida: onde o trecho está, o texto em que ele foi achado e a anotação de onde saiu. */
interface QuickNoteAsk {
  spot: TextSpot;
  shown: string;
  from: Review;
  shared: boolean;
}

/**
 * A segunda anotação como está, para ficar sozinha no lugar da primeira que fechou (PLANO-LADO-A-LADO.md, D2): ela, o
 * caminho dos links por onde chegou, o jeito, o trecho onde se lia, a folha aberta e o segredo da nota.
 */
interface Handover {
  review: Review;
  trail: readonly TrailStop[];
  view: ReaderView;
  place: ReadingPlace | null;
  comments: boolean;
  /** O trecho que ela mandou citar, ainda na folha de comentários. */
  quote: string | null;
  details: boolean;
  masked: boolean;
  revealed: boolean;
}

@Component({
  selector: 'app-review-reader',
  imports: [BackdropClose, CardConfig, CardPicker, DictionaryView, FreeBoardView, ReviewEditor, QuickNoteSheet, WordSheet, CommentsPanel, ReaderDetails, ConflictSheet, LinkSheet, ShareSheet, OrganizeSheet, IconModule, KanbanDepsBadge, MoreMenu, Rabisco, Boletim, BonusSticker, CoverSleeve, RecordCover, DoneStamp, JudgeLabel, Luz, Pin, ReactionBubble, ReactionPicker, RichText, ReviewCard, Skulls, StatusLabel, VozFita],
  changeDetection: ChangeDetectionStrategy.OnPush,
  // cada leitura é a sala das peças ampliadas dela (ui/room.ts): com duas abertas, o zoom fica no lado dela
  providers: [{ provide: ROOM, useExisting: forwardRef(() => ReviewReader) }],
  template: `
    <dialog
      #dialog
      class="sheet reader"
      [class.com-lado]="sideOpen()"
      [class.solta]="!!solta()"
      [class.lendo]="lendo()"
      [class.so-a-cartolina]="vista() === 'cartolina'"
      [class.dupla]="!!segunda() && !!review()"
      [class.so-o-lado]="!!segunda() && !review()"
      [class.lado-primeiro]="sideFirst() && !!segunda() && !!review()"
      [class.e-dicionario]="dictionary()"
      [class.editando]="editingHere()"
      [class.ao-lado]="aoLado()"
      [attr.aria-labelledby]="review() || dictionary() ? 'leitura-titulo' + sufixo() : null"
      [attr.aria-label]="review() || dictionary() ? null : 'Lado a lado'"
      (backdropClose)="solta() || aoLado() || close()"
      (cancel)="onCancel($event)"
      (keydown)="onKey($event)"
      (close)="onClosed()"
    >
      @if (review(); as r) {
        <!-- a ficha e, puxada de baixo dela pela orelha, a folha de comentários (só a cartolina: a dupla
             fica guardada, escondida, com o lugar onde se lia) -->
        <div class="par">
        <article class="ficha cartolina" [class.e-canvas]="!!canvasBoard() && lendo()" [style.--stock]="'var(--stock-' + pin().stock + ')'" [attr.data-cor]="pin().stock">
          <app-pin class="pin" [color]="pin().pinColor" />
          <!-- a faixa da cartolina é a orelha da ficha de fichário: o nome vai escrito nela, a pincel, e
               o resto da folha fica para o que se lê -->
          <header class="head faixa-nome" [class.feita]="note() && !!r.doneAt && lendo()" [class.com-volta]="!!backTo()" [style]="headPaper()">
            <!-- veio por um link de outra anotação: o caminho de volta, na ponta da faixa -->
            @if (backTo(); as from) {
              <button type="button" class="icon-btn voltar-elo" (click)="back()" [attr.aria-label]="'Voltar para “' + from.game.name + '”'" [title]="'Voltar para “' + from.game.name + '”'">
                <lucide-icon [img]="BackIcon" [size]="22" aria-hidden="true" />
              </button>
            }
            <h2 #nomeFicha [id]="'leitura-titulo' + sufixo()" class="title" [title]="r.game.name" [class.longo]="r.game.name.length > 44" tabindex="-1">{{ r.game.name }}</h2>
            <!-- finalizada: o carimbo redondo batido na emenda da faixa com a folha -->
            @if (note() && r.doneAt && lendo()) {
              <span class="carimbo"><app-done-stamp size="big" [at]="r.doneAt" [hit]="stampedNow()" /></span>
            }
            <!-- o jeito de ver a ficha, pequeno, antes do X: só a cartolina (como fica no mural). A
                 ficha aberta pelo link é a página inteira: não há para onde fechar, então não tem o X, e
                 o botão é o minimizar dela (a página mostra a ficha pregada no mural de quem
                 escreveu), no mesmo lugar e do mesmo jeito que o "só a cartolina" -->
            <!-- ouvir a nota em voz alta (PLANO-VOZ.md): o menu das três línguas abre sempre; a fita vai ao pé
                 da folha. Sem texto, ou com o texto escondido, ou num navegador sem voz, não aparece -->
            @if (voz.speaks() && r.text.trim() && !masked() && vista() !== 'cartolina') {
              <button #ouvir type="button" class="icon-btn vista-btn ouvir" aria-haspopup="menu" [class.ligado]="!!fita()?.reading()" aria-label="Ouvir a nota" title="Ouvir a nota" (click)="fita()?.choose($event, ouvir)">
                <lucide-icon [img]="ListenIcon" [size]="16" aria-hidden="true" />
              </button>
            }
            <div class="vistas" role="group" aria-label="Jeito de ver a ficha">
              @if (solta()) {
                <button type="button" class="icon-btn vista-btn minimizar" (click)="minimize()" aria-label="Minimizar: ver como fica no mural" title="Ver como fica no mural">
                  <lucide-icon [img]="MinimizeIcon" [size]="16" aria-hidden="true" />
                </button>
              } @else {
                <button type="button" class="icon-btn vista-btn ver-cartolina" (click)="setView('cartolina')" aria-label="Ver só a cartolina" title="Ver só a cartolina">
                  <lucide-icon [img]="MinimizeIcon" [size]="16" aria-hidden="true" />
                </button>
              }
            </div>
            @if (!solta()) {
              <!-- com duas abertas, o X de cada uma fecha só ela, e a outra fica sozinha (PLANO-LADO-A-LADO.md, D2) -->
              @let rotulo = split() ? 'Fechar só esta' : 'Fechar';
              <button type="button" class="icon-btn fecha" (click)="closeOwn()" [attr.aria-label]="rotulo" [attr.title]="split() ? rotulo : null">
                <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
              </button>
            }
          </header>

          <div #corpo class="body" appLuz (scroll)="watchSelection()">
            <!-- na leitura, o aviso, as vezes, a resenha (a capa, as notas) e o texto; os dados da anotação ficam nos
                 Detalhes (PLANO-LEITURA-UNIFICADA.md) -->
            @if (lendo()) {
            <!-- duas versões brigando (de duas pessoas numa compartilhada, ou de dois aparelhos seus): escolher uma -->
            @if (conflictHere()) {
              <div class="aviso-conflito" role="status">
                <lucide-icon class="aviso-icone" [img]="ConflictIcon" [size]="22" aria-hidden="true" />
                <p class="aviso-texto"><strong>Duas versões.</strong> {{ conflictLine() }}</p>
                <button type="button" class="btn-ink aviso-btn" aria-haspopup="dialog" (click)="openConflict()">Escolher a versão</button>
              </div>
            }
            <!-- A obra jogada mais de uma vez: as vezes viram páginas, a original e cada rejogada -->
            @if (times().length > 1) {
              <nav class="vezes" [attr.aria-label]="'As vezes de ' + r.game.name">
                <button type="button" class="vez-seta" [disabled]="at() === 0" (click)="go(-1)" [attr.aria-label]="prevLabel()">
                  <lucide-icon [img]="PrevIcon" [size]="22" aria-hidden="true" />
                </button>
                <p class="vez" aria-live="polite">
                  <span class="vez-nome">{{ timeLabel(at()) }}</span>
                  <span class="vez-conta">{{ at() + 1 }} de {{ times().length }}</span>
                </p>
                <button type="button" class="vez-seta" [disabled]="at() === times().length - 1" (click)="go(1)" [attr.aria-label]="nextLabel()">
                  <lucide-icon [img]="NextIcon" [size]="22" aria-hidden="true" />
                </button>
              </nav>
            }

            <!-- A ficha vista de perto. A análise: a foto colada e, ao lado, a data, a etiqueta do julgamento
                 e os bônus, em equilíbrio com a foto. A anotação: uma linha só (a data, o grupo e as tags),
                 e o texto logo embaixo, que é o que importa -->
            <!-- a anotação: só a capa, se tiver (a data, o grupo, as tags e os lugares estão nos Detalhes, PLANO-LEITURA-UNIFICADA.md) -->
            @if (!note() || r.game.coverUrl) {
            <div class="top" [class.nota]="note()" [class.com-carimbo]="note() && !!r.doneAt">
              @if (!note() || r.game.coverUrl) {
              <div class="cover" [class.disco]="music()">
                @if (music()) {
                  <!-- a música: o vinil que toca a amostra, com a barra de arrastar quando começa -->
                  <app-record-cover [game]="r.game" [bar]="true" />
                  @if (r.status !== 'finalizado') {
                    <app-status-label class="faixa faixa-disco" [status]="r.status" [kind]="r.kind" [band]="true" />
                  }
                } @else {
                <app-cover-sleeve [game]="r.game" [size]="note() ? 'card' : 'big'">
                  @if (r.status !== 'finalizado' && !note()) {
                    <app-status-label class="faixa" [status]="r.status" [kind]="r.kind" [band]="true" />
                  }
                </app-cover-sleeve>
                }
              </div>
              }

              @if (!note()) {
              <div class="words">
                @if (music()) {
                  <!-- o que é e de quem: "Álbum de Radiohead"; a música solta diz de qual álbum saiu -->
                  <p class="by">{{ formLabel() }}@if (artist()) { de {{ artist() }} }</p>
                  @if (r.game.album) {
                    <p class="meta">Do álbum {{ r.game.album }}</p>
                  }
                  @if (r.game.sampleTitle) {
                    <p class="meta">No vinil: {{ r.game.sampleTitle }}</p>
                  }
                } @else if (r.game.by) {
                  <p class="by">de {{ r.game.by }}</p>
                }
                <p class="meta">
                  <!-- quem vê, como na ficha do mural: só o desenho antes da data (o que ele quer dizer fica
                       no título e para o leitor de tela) -->
                  @if (audience(); as a) {
                    <span class="quem-ve" [title]="a.title"><lucide-icon class="quem-ve-icone" [img]="a.icon" [size]="15" aria-hidden="true" /><span class="sr-only">{{ a.title }}. </span></span>
                  }
                  @if (r.completedAt === null) {
                    {{ noDay }}
                  } @else {
                    {{ dayLabel(r.kind, r.status) }} {{ date() }}
                  }
                  @if (!masked() && hours(); as h) {
                    <span aria-hidden="true"> · </span>{{ h }}
                  }
                  @if (sharedHere(); as s) {
                    <!-- compartilhada: com quem (ou de quem) e o seu papel; o nome abre a folha das pessoas -->
                    <span aria-hidden="true"> · </span>
                    <span class="compartilhada">
                      <lucide-icon class="quem-ve-icone" [img]="SharedIcon" [size]="15" aria-hidden="true" />
                      <button type="button" class="parte-de" aria-haspopup="dialog" [title]="s.title" (click)="openShare()">{{ s.line }}<span class="sr-only">. {{ s.title }}</span></button>
                    </span>
                  }
                </p>
                @if (r.game.year) {
                  <p class="meta year">{{ profile().released }} {{ r.game.year }}</p>
                }
              </div>

              <div class="judgement">
                <app-judge-label [value]="r.scores.final" [verdict]="r.verdict" size="big" [masked]="masked()" />
                @if (profile().difficulty && !masked()) {
                  <app-skulls class="skulls" [value]="r.difficulty" [size]="18" />
                }
                <!-- a ficha de outra pessoa em segredo: revelada aqui, fica revelada no mural de quem abriu (ver revealedChange) -->
                @if (forceMask()) {
                  <button type="button" class="btn-quiet revelar" [attr.aria-pressed]="revealed()" (click)="toggleReveal()">
                    <lucide-icon [img]="revealed() ? HideIcon : RevealIcon" [size]="18" aria-hidden="true" />
                    {{ revealed() ? 'Esconder a nota' : 'Revelar a nota' }}
                  </button>
                }
              </div>

              <!-- Os bônus: os mesmos adesivos da ficha, todos. Sem a conta sem eles nem a média que a nota dada na mão
                   trocou (pedido do dono: "Quero apenas que minha nota seja minha nota"); essas ficam só no editor -->
              @if (bonuses().length) {
                <div class="bonus-block">
                  <ul class="bonus" aria-label="Bônus">
                    @for (b of bonuses(); track b.id; let i = $index) {
                      <li>
                        <app-bonus-sticker [bonus]="b" [index]="i" [masked]="masked()" [seed]="r.id" />
                        @if (!masked()) {
                          <span class="sr-only">({{ kindLabels[b.kind].toLowerCase() }})</span>
                        }
                      </li>
                    }
                  </ul>
                </div>
              }
              }
            </div>
            }

            @if (!note()) {
              <app-boletim [review]="r" size="big" [masked]="masked()" />
            }
            }

            @if (canvasBoard(); as board) {
              <!-- o canvas: o quadro dele, só de ver (o arrastar, o zoom e o Ver tudo; editar é na página dele), do
                   tamanho da folha (PLANO-LADO-A-LADO.md, D4) -->
              <div class="canvas-leitura">
                @defer (on immediate) {
                  <app-free-board #quadroLeitura class="quadro-leitura" [board]="board" [links]="noteLinks()" />
                } @placeholder {
                  <p class="abrindo" role="status"><span class="carregando" aria-hidden="true"></span>Abrindo o canvas…</p>
                }
              </div>
            } @else if (canvas()) {
              <p class="no-text">O quadro deste canvas ainda não chegou.</p>
            } @else if (r.text.trim()) {
              @if (masked()) {
                <div class="text"><app-rabisco [text]="text()" /><span class="sr-only">Texto escondido</span></div>
              } @else {
                <!-- com a formatação do editor; as tarefas se marcam aqui mesmo, na sua ficha. As feitas viram
                     uma conta, como no mural, e tocar nela mostra a sequência -->
                <div #textoFicha class="text" data-citavel><app-rich-text [text]="r.text" [fold]="true" [foldKey]="r.id" [checkable]="owner() === null && writable() && !editedAside()" [links]="noteLinks()" [anchors]="true" (toggled)="toggleTask($event)" /></div>
              }
            } @else if (!note()) {
              <!-- a anotação pode ser só o título: sem aviso de texto em branco -->
              <p class="no-text">{{ owner() ? 'Sem texto nessa ficha.' : 'Sem texto nessa ficha. Dá para escrever depois, em Editar.' }}</p>
            }

            <!-- as reações: o balão com quem reagiu e, na ficha de quem você segue, o reagir; e a porta dos comentários -->
            @if (lendo() && reactTarget(); as t) {
              @if (reactions.canReact(t.code) || reactions.of(t.code, t.ref).length) {
                <div class="reagir-linha">
                  @if (reactions.canReact(t.code)) {
                    <app-reaction-picker [target]="t" />
                  }
                  <app-reaction-bubble [target]="t" />
                </div>
              }
            }
            <!-- a fita da voz que lê a nota, presa ao pé da folha (só aparece lendo) -->
            <app-voz-fita #vozFita [roots]="voiceRoots()" [scroller]="bodyEl()" [key]="r.id" [active]="vista() !== 'cartolina'" />
          </div>

          @if (lendo()) {
          <footer class="foot">
            <!-- o trilho (PLANO-LEITURA-UNIFICADA.md, D5): as etiquetas de tinta que abrem a folha ao lado. Mora no pé: no
                 computador sai pela beirada direita da ficha; no celular (e com duas anotações) fica deitado nele -->
            @if (rail().length) {
              <nav class="trilho" [attr.aria-label]="note() ? 'Mais da anotação' : 'Mais da ficha'">
                @for (x of rail(); track x.id) {
                  <button
                    type="button"
                    class="etq-trilho"
                    [attr.data-trilho]="x.id"
                    [attr.aria-pressed]="x.id === 'ao-lado' ? null : sideShown() === x.id"
                    [attr.aria-haspopup]="x.id === 'ao-lado' ? 'dialog' : null"
                    [attr.aria-controls]="x.id === 'ao-lado' ? null : 'leitura-' + x.id + sufixo()"
                    [attr.aria-label]="x.label"
                    (click)="railPicked(x.id)"
                  >
                    <lucide-icon [img]="x.icon" [size]="18" aria-hidden="true" />
                    <span class="etq-nome" aria-hidden="true">{{ x.name }}</span>
                    @if (x.count; as n) {
                      <span class="etq-n" aria-hidden="true">{{ n }}</span>
                    }
                  </button>
                }
              </nav>
            }
            @if (owner(); as ownerName) {
              @let name = r.sharedBy?.nome ?? ownerName;
              @if (name === 'Você') {
                <p>{{ note() ? 'Sua anotação' : 'Sua resenha' }}</p>
              } @else if (solta() !== 'visita' && (r.sharedBy?.codigo ?? ownerCode()); as code) {
                <!-- o nome leva ao perfil de quem escreveu (a compartilhada, ao do dono dela) -->
                <p>
                  {{ note() ? 'Anotação de' : 'Resenha de' }}
                  <button type="button" class="dono-link" [attr.aria-label]="'Ver o perfil de ' + name" (click)="openOwner(code)">{{ name }}</button>
                </p>
              } @else {
                <p>{{ (note() ? 'Anotação de ' : 'Resenha de ') + name }}</p>
              }
              @if (!solta()) {
                <button type="button" class="btn-ink" (click)="closeOwn()">Fechar</button>
              }
            } @else {
            <!-- o que se faz de vez em quando (fixar, compartilhar, escrever outra vez, lado a lado, apagar)
                 fica guardado no bilhete do "Mais"; no pé, só o que se usa toda hora -->
            <app-more-menu class="mais-menu com-nome" [items]="moreItems()" [label]="note() ? 'Mais ações da anotação' : 'Mais ações da ficha'" (picked)="onMore($event)" />
            <div class="actions">
              <!-- o check da anotação inteira: finaliza (e ela sai do mural com o carimbo) ou abre de novo -->
              @if (note() && writable()) {
                <button type="button" class="btn-quiet finalizar" [attr.aria-pressed]="!!r.doneAt" (click)="finish()">
                  <lucide-icon [img]="r.doneAt ? ReopenIcon : CheckedIcon" [size]="19" aria-hidden="true" />
                  <span class="nome-acao">{{ r.doneAt ? 'Abrir de novo' : 'Finalizar' }}</span>
                </button>
              }
              @if (canvas()) {
                <!-- o canvas se edita na página dele (aqui ele só se vê) -->
                <button type="button" class="btn-ink" (click)="openCanvas()">
                  <lucide-icon [img]="CanvasIcon" [size]="20" aria-hidden="true" />
                  Abrir o canvas
                </button>
              } @else if (writable()) {
                <button type="button" class="btn-ink" (click)="editHere()">
                  <lucide-icon [img]="EditIcon" [size]="20" aria-hidden="true" />
                  Editar
                </button>
              } @else {
                <p class="so-leitura">Você só lê esta anotação</p>
              }
            </div>
            }
          </footer>
          }
        </article>

        <!-- a folha ao lado (PLANO-LEITURA-UNIFICADA.md, D6): os Detalhes da anotação, do trilho -->
        @if (lendo() && detailsOpen() && details(); as dt) {
          <aside [id]="'leitura-detalhes' + sufixo()" class="ficha cartolina lado detalhes-lado" tabindex="-1" [style.--stock]="'var(--stock-' + pin().stock + ')'" [attr.data-cor]="pin().stock" [attr.aria-labelledby]="'detalhes-titulo' + sufixo()">
            <app-pin class="pin" [color]="pin().pinColor" />
            <header class="head" [style]="headPaper()">
              <button type="button" class="btn-quiet volta-ficha" (click)="toggleDetails(false)">
                <lucide-icon [img]="BackIcon" [size]="18" aria-hidden="true" />
                Voltar para a ficha
              </button>
              <h3 class="lado-titulo" [id]="'detalhes-titulo' + sufixo()">Detalhes</h3>
              <button type="button" class="icon-btn fecha-lado" (click)="toggleDetails(false)" aria-label="Fechar os detalhes">
                <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
              </button>
            </header>
            <app-reader-details
              class="lado-corpo"
              [data]="dt"
              (folderOpened)="openFolder($event)"
              (peopleOpened)="openShare()"
              (boardOpened)="openBoard($event)"
              (deckOpened)="openDeck($event)"
              (dayOpened)="openDay($event)"
              (moreReminders)="allRemindersShown.set(true)"
            >
              @if (board(); as b) {
                @if (b.deps; as deps) {
                  <app-kanban-deps detalhes-deps class="dependencias" [noteId]="r.id" [owner]="r.game.name" [deps]="deps" (opened)="openDep($event)" (edit)="editHere('kanban')" />
                }
              }
            </app-reader-details>
          </aside>
        }
        @if (lendo() && commentable()) {
          @if (commentTarget(); as ct) {
            @if (commentsOpen()) {
              <aside [id]="'leitura-comentarios' + sufixo()" class="ficha cartolina lado" tabindex="-1" [style.--stock]="'var(--stock-' + pin().stock + ')'" [attr.data-cor]="pin().stock" aria-labelledby="comentarios-titulo">
                <app-pin class="pin" [color]="pin().pinColor" />
                <header class="head" [style]="headPaper()">
                  <!-- em tela estreita a folha cobre a ficha: o caminho de volta fica à esquerda, escrito -->
                  <button type="button" class="btn-quiet volta-ficha" (click)="toggleComments(false)">
                    <lucide-icon [img]="BackIcon" [size]="18" aria-hidden="true" />
                    Voltar para a ficha
                  </button>
                  <button type="button" class="icon-btn fecha-lado" (click)="toggleComments(false)" aria-label="Fechar os comentários">
                    <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
                  </button>
                </header>
                @if (masked() && !spoilersOk()) {
                  <!-- a ficha está em segredo: a conversa sobre ela conta o que a ficha esconde -->
                  <div class="guarda">
                    <p>Os comentários podem contar o que esta ficha está escondendo.</p>
                    <button type="button" class="btn-ink" (click)="spoilersOk.set(true)">
                      <lucide-icon [img]="RevealIcon" [size]="19" aria-hidden="true" />
                      Ver os comentários
                    </button>
                  </div>
                } @else {
                  <!-- a folha em si (com o editor de texto) chega num pedaço à parte, só para quem abre -->
                  @defer (on immediate) {
                    <app-comments-panel [target]="ct" [ownerName]="commentOwner()" [own]="(owner() === null && !leaves()) || (!!ownerCode() && ownerCode() === comments.myCode())" [audience]="commentAudience()" [quote]="quote()" (leave)="leaveTo($event)" />
                  } @placeholder {
                    <p class="abrindo" role="status"><span class="carregando" aria-hidden="true"></span>Abrindo os comentários…</p>
                  }
                }
              </aside>
            }
          }
        }

        <!-- selecionou um trecho do texto: os remendos aparecem no fim da seleção, cada um o seu. O "Citar" (só na
             leitura de sempre, com a folha de comentários aberta ao lado; na tela estreita, com ela fechada) leva o trecho aos comentários; o "Nova nota" (na anotação em
             que você escreve) cria uma anotação sobre ele, e o trecho vira link para ela (PLANO-NOTA-DE-REFERENCIA.md) -->
        @if (vista() !== 'cartolina' && picked(); as p) {
          <div class="remendos" [style.left.px]="p.left" [style.top.px]="p.top">
            @if (p.quote) {
              <button type="button" class="citar" (pointerdown)="$event.preventDefault()" (click)="quoteSelection()">
                <lucide-icon [img]="QuoteIcon" [size]="17" aria-hidden="true" />
                Citar
              </button>
            }
            @if (p.spot) {
              <button type="button" class="anotar" (pointerdown)="$event.preventDefault()" (click)="referSelection()" title="Criar uma anotação sobre o trecho, que vira um link para ela">
                <lucide-icon [img]="NewNoteIcon" [size]="17" aria-hidden="true" />
                Nova nota
              </button>
            }
            <!-- o trecho é uma palavra do Dicionário Japonês: o resumo dela e, se é uma só e falta aprender, marcar -->
            @if (p.words.length) {
              <button type="button" class="consultar" (pointerdown)="$event.preventDefault()" (click)="consultSelection()" title="Ver o que o Dicionário Japonês sabe sobre a palavra">
                <lucide-icon [img]="DictIcon" [size]="17" aria-hidden="true" />
                No dicionário
              </button>
              @if (toLearn(p.words); as w) {
                <button type="button" class="aprender" (pointerdown)="$event.preventDefault()" (click)="learnSelection(w)" [title]="'Marcar ' + w.text + ' como aprendida'">
                  <span class="mini-selo" lang="ja" aria-hidden="true">済</span>
                  Aprendida
                </button>
              }
            }
          </div>
        }
        <!-- a folhinha do verbete do trecho, num pedaço à parte, só quando abre -->
        @if (wordSheet(); as ws) {
          @defer (on immediate) {
            <app-word-sheet [words]="ws.words" [query]="ws.query" (closed)="wordSheet.set(null)" />
          }
        }
        </div>

        <!-- com duas abertas, o Editar abre o editor aqui, no lugar da ficha (PLANO-LADO-A-LADO.md, D7): o mesmo
             editor, sem o modal, com o jeito pela largura do lado; salvar ou fechar volta à leitura -->
        @if (editingHere()) {
          <app-review-editor #editorLado class="editor-lado" [embedded]="true" (saved)="editorSaved($event)" (closed)="editorClosed()" />
        }

        <!-- só a cartolina: a ficha como fica pregada no mural, grande, no meio da tela, com os mesmos
             botões da faixa em cima dela (o primeiro volta à leitura). Um toque na ficha também volta, e
             o toque no escuro em volta fecha, como na leitura. Com duas abertas, ela fica no lado dela (PLANO-LADO-A-LADO.md,
             D1), e o toque no vazio em volta não fecha nada -->
        @if (vista() === 'cartolina') {
          <div class="na-parede" (backdropClose)="split() || close()">
            <div class="em-pe">
              <div class="vistas vistas-giz" role="group" aria-label="Jeito de ver a ficha">
                <button type="button" class="giz-btn ver-cartolina" (click)="setView('leitura')" aria-label="Voltar à leitura" title="Voltar à leitura">
                  <lucide-icon [img]="ReadIcon" [size]="20" aria-hidden="true" />
                </button>
                <button type="button" class="giz-btn fecha" (click)="closeOwn()" [attr.aria-label]="split() ? 'Fechar só esta' : 'Fechar'" [title]="split() ? 'Fechar só esta' : 'Fechar'">
                  <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
                </button>
              </div>
              <div class="cartolina-grande" [style.zoom]="cardZoom()">
                <app-review-card [review]="r" [canvasBoard]="canvasBoard()" [preview]="true" [masked]="masked()" [looks]="cardLooks()" [times]="r.revisitOf ? 1 : times().length || 1" (opened)="setView('leitura')" />
              </div>
            </div>
          </div>
        }

        <!-- a folhinha da nota nova (o trecho é o título), num pedaço à parte, só quando abre -->
        @if (quickNote(); as qn) {
          @defer (on immediate) {
            <app-quick-note-sheet [piece]="qn.spot.text" [from]="qn.from" [shared]="qn.shared" (linked)="linkPiece($event)" (closed)="quickNoteClosed()" />
          }
        }
        <!-- o que a nota nova fez, para o leitor de tela (os olhos veem o link aparecer no texto) -->
        <p class="sr-only" role="status">{{ said() }}</p>

        <!-- a ficha aberta pelo link: a assinatura do site, a giz na parede, embaixo dela -->
        @if (solta() && vista() === 'leitura') {
          <a class="assinatura" href="./">feito no <span class="assinatura-nome">Murall</span></a>
        }
        <!-- quem abriu pelo link não tem o Mais: o PDF é um remendo de feltro (o do menu da anotação)
             pregado no canto da página -->
        @if (solta() && !masked() && vista() === 'leitura') {
          <button type="button" class="baixar-pdf" [attr.aria-busy]="pdfBusy()" title="Abre a impressão: escolha “Salvar como PDF”" (click)="savePdf()">
            <lucide-icon class="baixar-pdf-ico" [img]="PdfIcon" [size]="18" aria-hidden="true" />
            <span class="baixar-pdf-nome">{{ pdfBusy() ? 'Preparando…' : 'Baixar em PDF' }}</span>
          </button>
        }

        <!-- o link da ficha, num pedaço à parte, só quando abre -->
        @if (linkOpen()) {
          @defer (on immediate) {
            <app-link-sheet [review]="r" [code]="linkCode()" (closed)="linkOpen.set(false)" (left)="close()" />
          }
        }

        <!-- as configurações da ficha (os comentários), num pedaço à parte, só quando abre -->
        @if (configOpen()) {
          @defer (on immediate) {
            <app-card-config [review]="r" (closed)="configOpen.set(false)" />
          }
        }

        <!-- as folhas das compartilhadas: cada uma num pedaço à parte, só quando abre -->
        @if (shareOpen()) {
          @defer (on immediate) {
            <app-share-sheet [noteId]="r.id" (closed)="closeShare()" (left)="leave()" />
          }
        }
        @if (conflictOpen()) {
          @defer (on immediate) {
            <app-conflict-sheet [noteId]="r.id" (closed)="conflictOpen.set(false)" (resolved)="afterConflict()" />
          }
        }
        @if (organizeOpen()) {
          @defer (on immediate) {
            <app-organize-sheet [noteId]="r.id" (closed)="closeOrganize()" />
          }
        }
      } @else if (dictionary()) {
        <!-- o Dicionário Japonês ao lado (PLANO-LADO-A-LADO.md, D5): a ficha de fichário dele, com a faixa (o nome e o X),
             e a mesma peça da página, com o estado só dela; sozinho (a primeira saiu), o trilho com o Ao lado -->
        <div class="par">
          <article class="ficha cartolina dicionario-lado" style="--stock: var(--stock-rosa-escuro)" data-cor="rosa-escuro">
            <app-pin class="pin" color="#f4f4f0" />
            <header class="head faixa-nome">
              <h2 [id]="'leitura-titulo' + sufixo()" class="title" tabindex="-1"><span class="selo-dic" lang="ja" aria-hidden="true">辞</span>Dicionário Japonês</h2>
              <button type="button" class="icon-btn fecha" (click)="closeOwn()" [attr.aria-label]="dictionaryAlone() ? 'Fechar' : 'Fechar só esta'" [attr.title]="dictionaryAlone() ? null : 'Fechar só esta'">
                <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
              </button>
            </header>
            <div class="body corpo-dicionario">
              @defer (on immediate) {
                <app-dictionary-view [local]="true" />
              } @placeholder {
                <p class="abrindo" role="status"><span class="carregando" aria-hidden="true"></span>Abrindo o dicionário…</p>
              }
            </div>
            @if (dictionaryAlone()) {
              <footer class="foot">
                <nav class="trilho" aria-label="Mais do dicionário">
                  <button type="button" class="etq-trilho" data-trilho="ao-lado" aria-haspopup="dialog" aria-label="Abrir outra coisa ao lado" (click)="askBeside()">
                    <lucide-icon [img]="AddIcon" [size]="18" aria-hidden="true" />
                    <span class="etq-nome" aria-hidden="true">Ao lado</span>
                  </button>
                </nav>
              </footer>
            }
          </article>
        </div>
      }
        <!-- o "Escolher a nota" do Ao lado (PLANO-LADO-A-LADO.md, D3): as fichas de quem é a leitura (as suas, ou as que
             a pessoa visitada publicou), sem a aberta, e, em cima, o Dicionário Japonês (quando ele ainda não está
             aberto). Fora da ficha: com o dicionário sozinho (a primeira saiu), é ele quem o abre -->
        @if (pickBeside()) {
          @defer (on immediate) {
            <app-card-picker
              [(open)]="pickBeside"
              [withCanvas]="true"
              [selfId]="review()?.id ?? null"
              [source]="owner() === null ? null : pool()"
              [folderTree]="owner() === null ? null : folderTree()"
              [extra]="segunda() === 'dicionario' ? null : dictionaryRow"
              heading="Abrir ao lado"
              [hint]="segunda() === 'dicionario' ? 'Uma anotação, análise ou canvas, para ver ao lado do dicionário.' : 'Uma anotação, análise, canvas ou o dicionário, para ver ao lado desta.'"
              footHint="Toque numa para abrir ao lado."
              [emptyText]="owner() === null ? 'Você ainda não tem outras fichas.' : 'Não há outras fichas à mostra aqui.'"
              (picked)="pickedBeside($event)"
              (extraPicked)="pickedDictionary()"
            />
          }
        }
        <!-- a segunda anotação, lado a lado (PLANO-DUAS-NOTAS.md): a mesma leitura, no modo ao lado, dentro
             desta. O que ela faz que é da página (o editor, apagar) passa por aqui; as folhas, a cartolina e o
             zoom dela ficam nela (PLANO-LADO-A-LADO.md, D1). Fora da ficha desta: se esta sai com a segunda editando
             (D8), a segunda fica, sozinha, sem perder o que se escreve -->
        @if (segunda()) {
          <app-review-reader
            #ladoB
            [aoLado]="true"
            (edit)="edit.emit($event)"
            (editBoard)="editBoard.emit($event)"
            (saved)="sideSaved($event)"
            (remove)="sideRemove($event)"
            (revisit)="sideRevisit($event)"
            (createNote)="sideCreate($event)"
            (revealedChange)="revealedChange.emit($event)"
            (closeAll)="close()"
            (left)="closeBeside()"
          />
        }

    </dialog>
  `,
  styleUrl: './review-reader.scss',
})
export class ReviewReader implements Room {
  readonly edit = output<string>();
  /** "Mudar as dependências": o editor da anotação, na aba Kanban. */
  readonly editBoard = output<string>();
  readonly remove = output<string>();
  /** Pediu para escrever mais uma vez da obra (rejogada, releitura, reassistida). */
  readonly revisit = output<string>();
  /** Tocou num link para uma anotação que não existe: criar uma com esse título. */
  readonly createNote = output<{ title: string; from: string }>();
  /** "Revelar a nota" (ou "Esconder a nota") na ficha em segredo: as vezes da obra, para o mural de quem abriu seguir. */
  readonly revealedChange = output<{ ids: string[]; revealed: boolean }>();

  // ===== Duas anotações lado a lado (PLANO-DUAS-NOTAS.md) =====
  /**
   * A segunda anotação, aberta à direita da primeira: esta leitura é ela, dentro da de fora (um `<dialog>`
   * aberto sem ser modal, no fluxo do de fora). O que ela faz que é da página passa pela de fora.
   */
  readonly aoLado = input(false);
  /** (Ao lado) A leitura inteira fecha, as duas (um caminho para fora dela: o quadro, a pasta, o perfil). */
  readonly closeAll = output<void>();
  /** (Ao lado) Só ela sai (o X dela, finalizada, saiu do mural, a pessoa saiu da compartilhada): a primeira fica. */
  readonly left = output<void>();
  /**
   * Há duas abertas e esta é uma delas (PLANO-LADO-A-LADO.md): cada uma é um lugar, e o que ela abre (as folhas, a
   * cartolina, o zoom) fica no lado dela; o X dela fecha só ela.
   */
  protected readonly split = computed(() => this.aoLado() || !!this.segunda());

  // ===== Editar ao lado (PLANO-LADO-A-LADO.md, D7 e D8) =====
  /** Salvou no editor ao lado: quem usa faz o que faz com o editor de sempre (a ficha cai no mural, o aviso). */
  readonly saved = output<SavedEvent>();
  /** O editor está aberto aqui, no lugar da ficha (só com duas abertas). */
  protected readonly editingHere = signal(false);
  private readonly editorRef = viewChild<ReviewEditor>('editorLado');
  /** (Ao lado) A leitura de fora, onde esta mora. */
  private readonly outer = inject(ReviewReader, { skipSelf: true, optional: true });
  /** A anotação aberta no editor daqui, ou null. */
  editingId(): string | null {
    return this.editingHere() ? (this.editorRef()?.openId() ?? this.review()?.id ?? null) : null;
  }
  /** A outra das duas: a de fora (desta, ao lado) ou a de dentro (da de fora). */
  private other(): ReviewReader | null {
    return this.aoLado() ? this.outer : (this.ladoB() ?? null);
  }

  /**
   * O Editar: sozinha, o editor de sempre (quem usa fecha a leitura e abre o editor); com duas abertas, o editor aqui,
   * no lugar da ficha, e a outra continua. A mesma anotação não se edita nos dois lados: o foco vai para o editor que
   * já está aberto, com o aviso.
   */
  protected editHere(tab?: 'kanban'): void {
    const r = this.review();
    if (!r) return;
    if (!this.split()) return tab ? this.editBoard.emit(r.id) : this.edit.emit(r.id);
    const other = this.other();
    if (other?.editingId() === r.id) {
      other.focusEditor();
      this.toasts.show('Esta anotação já está aberta para editar no outro lado.');
      return;
    }
    this.fita()?.stop();
    this.picked.set(null);
    this.commentsOpen.set(false);
    this.detailsOpen.set(false);
    this.quickNote.set(null);
    this.editingHere.set(true);
    afterNextRender(() => this.editorRef()?.openAt(this.store.get(r.id) ?? r, tab), { injector: this.injector });
  }

  /** O foco no editor aberto aqui. */
  focusEditor(): void {
    this.editorRef()?.focusSheet();
  }

  /** Salvou aqui: a leitura e a outra mostram a anotação de agora; quem usa ouve como no editor de sempre. */
  protected editorSaved(e: SavedEvent): void {
    if (this.aoLado()) this.saved.emit(e);
    else this.sideSaved(e);
  }

  /** Um dos editores ao lado salvou: as duas leituras mostram a de agora (a que lê a mesma, também). */
  protected sideSaved(e: SavedEvent): void {
    this.refreshFrom(e.id);
    this.ladoB()?.refreshFrom(e.id);
    this.saved.emit(e);
  }

  /** A anotação `id` mudou (salva no editor do lado): se é a aberta aqui, só lendo, ela passa a ser a de agora. */
  refreshFrom(id: string): void {
    const r = this.review();
    if (!r || r.id !== id || this.owner() !== null || this.editingHere()) return;
    const now = this.store.get(id);
    if (now && now !== r) this.review.set(now);
  }

  /**
   * O editor daqui fechou (salvou, descartou, o X): a ficha volta à leitura, com a anotação de agora e o foco no nome.
   * Se ela foi apagada, este lado sai.
   */
  protected editorClosed(): void {
    this.editingHere.set(false);
    const r = this.review();
    const now = r && this.store.get(r.id);
    if (!now) return this.closeOwn();
    this.review.set(now);
    afterNextRender(() => this.focusName(), { injector: this.injector });
  }

  /** Os editores abertos ao lado (este e o da outra), para perguntar antes de fechar a leitura inteira. */
  private openEditors(): ReviewEditor[] {
    return [this.editorRef(), this.ladoB()?.editorRef()].filter((e): e is ReviewEditor => !!e);
  }

  /**
   * Faz `then` (fechar a leitura, abrir outro editor por cima) depois de perguntar a cada editor ao lado com coisa
   * por salvar (D8); sem nenhum, na hora. Da segunda, quem pergunta é a de fora.
   */
  protected whenFree(then: () => void): void {
    if (this.aoLado() && this.outer) return this.outer.whenFree(then);
    const editors = this.openEditors();
    if (!editors.length) return then();
    void (async () => {
      for (const e of editors) if (!(await e.canLeave())) return;
      then();
    })();
  }

  /** O que a segunda pede e fecha a leitura (apagar, escrever outra vez, criar a nota do link), depois de perguntar. */
  protected sideRemove(id: string): void {
    this.whenFree(() => this.remove.emit(id));
  }
  protected sideRevisit(id: string): void {
    this.whenFree(() => this.revisit.emit(id));
  }
  protected sideCreate(e: { title: string; from: string }): void {
    this.whenFree(() => this.createNote.emit(e));
  }

  /**
   * A primeira sai da frente da segunda que está editando (o X dela, a tela que estreitou): a segunda fica sozinha,
   * com o editor e o que se escrevia; quando ele fechar, ela vira a leitura de sempre (ver `adoptWhenSettled`).
   */
  private stepAside(): void {
    this.fita()?.stop();
    this.commentsOpen.set(false);
    this.detailsOpen.set(false);
    this.quote.set(null);
    this.picked.set(null);
    this.quickNote.set(null);
    this.editingHere.set(false);
    this.vista.set('leitura');
    this.place = null;
    this.trail.set([]);
    this.review.set(null);
    this.watchShared(null);
    afterNextRender(() => this.ladoB()?.focusEditor(), { injector: this.injector });
  }

  /** Sozinha com a segunda (ver `stepAside`): o editor dela fechou, e ela vira a leitura de sempre, aqui. */
  private readonly adoptWhenSettled = effect(() => {
    // (o dicionário fica sozinho como está: ele não vira uma ficha)
    if (this.review() || !this.segunda() || this.segunda() === 'dicionario') return;
    const b = this.ladoB();
    if (!b || b.editingHere()) return;
    untracked(() => {
      const other = b.handOver();
      if (other) this.takeOver(other);
      else this.close();
    });
  });
  /**
   * A sala desta anotação (ui/room.ts): com duas abertas, o lado dela (a ficha, ou a parede da cartolina), onde a peça
   * e a foto ampliadas ficam (PLANO-LADO-A-LADO.md, D9); sozinha, nenhuma (o zoom vai para o meio da tela).
   */
  room(): HTMLElement | null {
    if (!this.split()) return null;
    const dialog = this.dialog().nativeElement;
    return dialog.querySelector<HTMLElement>(':scope > .na-parede') ?? dialog.querySelector<HTMLElement>(':scope > .par');
  }
  // ===== O canvas na leitura (PLANO-LADO-A-LADO.md, D4) =====
  /** A ficha aberta é um canvas. */
  protected readonly canvas = computed(() => isCanvas(this.review()));
  private readonly freeBoards = inject(FreeBoardStore);
  /** O quadro do canvas aberto: o seu (FreeBoardStore), ou o público de quem você visita (a vista da visita). */
  protected readonly canvasBoard = computed<FreeBoard | null>(() => {
    const r = this.review();
    if (!r || !isCanvas(r)) return null;
    const id = r.canvas ?? boardIdOfNote(r.id);
    if (!id) return null;
    if (this.owner() !== null) return this.visitFolders?.canvasBoard()(id) ?? null;
    this.freeBoards.boards();
    return this.freeBoards.get(id);
  });
  protected readonly CanvasIcon = ICON.canvas;
  private readonly boardView = viewChild<FreeBoardView>('quadroLeitura');
  /**
   * A outra abrindo ou fechando muda a largura do lado: depois que ela assenta (a leitura anda 320 ms), o quadro volta ao
   * Ver tudo, para o canvas inteiro caber no lugar novo.
   */
  private readonly refitBoard = effect((onCleanup) => {
    this.split();
    const view = untracked(this.boardView);
    if (!view) return;
    const timer = setTimeout(() => this.boardView()?.fitAll(), 360);
    onCleanup(() => clearTimeout(timer));
  });
  /** "Abrir o canvas": a leitura fecha e a página do canvas abre (onde ele se edita); fechar ali volta para cá. */
  protected openCanvas(): void {
    const r = this.review();
    if (!r) return;
    const back = this.router.url;
    this.whenFree(() => {
      this.close();
      void this.router.navigateByUrl(canvasPath(r.id), { state: { voltar: back } });
    });
  }
  /** O "Escolher a nota" do "+" está aberto. */
  protected readonly pickBeside = signal(false);
  protected readonly AddIcon = ICON.adicionar;
  /**
   * O "+" aparece: na leitura de sempre de uma anotação (as resenhas têm o Lado a lado delas), na primeira e só
   * com ela sozinha, fora da ficha aberta pelo link. A largura (onde cabem as duas) fica no CSS.
   */
  protected readonly canBeside = computed(() => {
    // (a análise e o canvas também, e há sempre o dicionário para abrir: PLANO-LADO-A-LADO.md, D3)
    return this.lendo() && !this.aoLado() && !this.segunda() && !this.solta();
  });
  /** As pastas de quem é a ficha: as suas, ou as de quem você visita. */
  protected readonly folderTree = computed(() => (this.owner() === null ? this.ownFolders.tree() : (this.visitFolders?.folders() ?? NO_FOLDERS)));
  /** Ainda cabem duas: a tela pode ter estreitado com o seletor aberto. */
  protected fitsBeside(): boolean {
    return typeof matchMedia === 'undefined' || matchMedia(BESIDE_MEDIA).matches;
  }
  /** Escolheu no seletor do "+": abre ao lado, se ainda couber; senão, abre no lugar desta. */
  protected pickedBeside(r: Review): void {
    // o dicionário sozinho: a escolhida entra à direita dele (D6)
    if (!this.review() && this.segunda() === 'dicionario') return this.adoptBesideDictionary(r);
    if (this.fitsBeside()) this.openBeside(r);
    else this.followCard(r);
  }

  /** Com o dicionário sozinho, a escolhida vira a leitura desta, à direita dele. */
  private adoptBesideDictionary(r: Review): void {
    const owner = this.owner();
    this.forceMask.set(owner !== null && this.shield.hiddenIn([r]).has(r.id));
    this.revealed.set(false);
    this.trail.set([]);
    this.vista.set('leitura');
    this.place = null;
    this.sideFirst.set(true);
    this.review.set(r);
    this.stampedNow.set(false);
    this.watchShared(owner === null ? r.id : null);
    afterNextRender(() => this.focusName(), { injector: this.injector });
  }
  /** Os ids da página: os da segunda ganham o "-2" (o nome dela é quem a anuncia). */
  protected readonly sufixo = computed(() => (this.aoLado() ? '-2' : ''));
  /** O que está aberto ao lado desta (só na de fora): uma ficha, o Dicionário Japonês, ou nada. */
  protected readonly segunda = signal<Review | 'dicionario' | null>(null);
  /**
   * O lado de dentro vem antes, à esquerda (PLANO-LADO-A-LADO.md, D6): o dicionário ficou sozinho e a escolhida entrou
   * à direita dele (a ficha desta leitura, desenhada depois dele).
   */
  protected readonly sideFirst = signal(false);

  // ===== O Dicionário Japonês ao lado (PLANO-LADO-A-LADO.md, D5) =====
  /** (Ao lado) Esta mostra o dicionário, e não uma ficha. */
  protected readonly dictionary = signal(false);
  /** A linha do dicionário no seletor do Ao lado. */
  protected readonly dictionaryRow = { label: 'Dicionário Japonês', hint: 'Procurar palavras, filtrar e ver a escrita dos kanji ao lado', seal: '辞' };
  /** (Ao lado) O dicionário está sozinho (a primeira saiu da frente dele): tem o Ao lado para escolher outra coisa. */
  protected readonly dictionaryAlone = computed(() => this.dictionary() && !!this.outer && !this.outer.review());
  /** (Ao lado) Abre o dicionário aqui (no lugar de uma ficha). */
  openDictionary(): void {
    this.review.set(null);
    this.dictionary.set(true);
    this.vista.set('leitura');
    this.trail.set([]);
    this.watchShared(null);
    const el = this.dialog().nativeElement;
    if (!el.open) el.show();
    afterNextRender(() => el.querySelector<HTMLElement>('#leitura-titulo-2')?.focus({ preventScroll: true }), { injector: this.injector });
  }
  /** (Ao lado, sozinho) O Ao lado do dicionário: o seletor é o da leitura de fora. */
  protected askBeside(): void {
    this.outer?.pickBeside.set(true);
  }
  /** Escolheu o dicionário no seletor: ele abre ao lado desta. */
  protected pickedDictionary(): void {
    const a = this.review();
    if (!a || this.segunda() === 'dicionario' || this.vista() !== 'leitura' || this.solta()) return;
    this.commentsOpen.set(false);
    this.detailsOpen.set(false);
    this.picked.set(null);
    this.quote.set(null);
    this.sideFirst.set(false);
    this.segunda.set('dicionario');
    afterNextRender(() => this.ladoB()?.openDictionary(), { injector: this.injector });
  }
  private readonly ladoB = viewChild<ReviewReader>('ladoB');

  protected readonly side = inject(SideBySide);
  private readonly settings = inject(Settings);
  protected readonly CloseIcon = ICON.fechar;
  protected readonly CheckedIcon = ICON.marcado;
  protected readonly UncheckedIcon = ICON.desmarcado;
  protected readonly EditIcon = ICON.editar;
  protected readonly TrashIcon = ICON.apagar;
  protected readonly RevisitIcon = ICON.repetir;
  protected readonly PrevIcon = ICON.anterior;
  protected readonly NextIcon = ICON.proximo;
  protected readonly RevealIcon = ICON.ver;
  protected readonly HideIcon = ICON.esconder;
  protected readonly PrivateIcon = ICON.privada;
  protected readonly PublicIcon = ICON.publica;
  protected readonly QuietIcon = ICON.silenciar;
  protected readonly BackIcon = ICON.voltar;
  protected readonly ReopenIcon = ICON.recomecar;
  /**
   * A orelha do grupo da anotação: o nome, o desenho e a cor dele, os que você escolheu (só nas suas;
   * nas dos outros, o desenho de sempre), como a orelha da ficha no mural.
   */
  protected readonly groupEar = computed(() => {
    const r = this.review();
    const label = r && this.note() ? r.category?.trim() : '';
    if (!label) return null;
    const look = this.owner() === null ? this.settings.categoryLook(label) : {};
    return { label, look, color: categoryColorHex(look.color) };
  });
  /** A cor da tag, só nas suas anotações (como o desenho da categoria). */
  protected tagColor(tag: string): string | null {
    return this.owner() === null ? tagColorHex(this.settings.categoryLooks(), tag, this.review()?.category ?? '') : null;
  }
  protected readonly PinIcon = ICON.fixar;
  protected readonly UnpinIcon = ICON.desafixar;
  protected readonly SharedIcon = ICON.pessoas;
  protected readonly GroupIcon = ICON.pasta;
  protected readonly LeaveIcon = ICON.sair;
  protected readonly ConflictIcon = ICON.aviso;
  protected readonly LinkIcon = ICON.link;
  protected readonly PdfIcon = ICON.pdf;
  protected readonly ConfigIcon = ICON.configurar;
  protected readonly MinimizeIcon = ICON.diminuir;
  /** Voltar à leitura, da cartolina: a folha escrita (os cantos eram da tela cheia, que virou a leitura). */
  protected readonly ReadIcon = ICON.documento;
  protected readonly ListenIcon = ICON.fones;
  protected readonly voz = inject(Voz);
  protected readonly fita = viewChild<VozFita>('vozFita');
  private readonly nameEl = viewChild<ElementRef<HTMLElement>>('nomeFicha');
  private readonly textEl = viewChild<ElementRef<HTMLElement>>('textoFicha');
  protected readonly bodyEl = computed(() => this.bodyRef()?.nativeElement ?? null);
  private readonly bodyRef = viewChild<ElementRef<HTMLElement>>('corpo');
  /** O que a voz lê: o nome da ficha e o texto desenhado (ver ui/voz-fita.ts). */
  protected readonly voiceRoots = computed(() => [this.nameEl()?.nativeElement, this.textEl()?.nativeElement]);
  private readonly fichaLinks = inject(FichaLinks);
  private readonly store = inject(ReviewStore);

  // ===== As anotações compartilhadas (ver core/shared-store.ts) =====
  private readonly shared = inject(SharedStore);
  private readonly syncConflicts = inject(SyncConflicts);
  /** A anotação aberta é compartilhada, no seu mural: como ela está aqui. */
  protected readonly sharedEntry = computed(() => {
    const r = this.review();
    return r && this.owner() === null ? (this.shared.get(r.id) ?? null) : null;
  });
  private readonly sharedGroups = inject(SharedGroupsStore);
  /** Quem abriu escreve nela (a sua, ou a compartilhada em que você é dono, gestor ou editor). */
  protected readonly writable = computed(() => {
    const e = this.sharedEntry();
    return !e || canWrite(e.papel);
  });
  /**
   * O pedaço da linha da data: quem vê, no resumo curto (com quem está, ou de quem é e o que você pode, e se é
   * pública), e a frase inteira no título (ver core/access.ts).
   */
  protected readonly sharedHere = computed(() => {
    const e = this.sharedEntry();
    if (!e) return null;
    const s = accessSummary(this.sharedGroups.accessOf(e, this.account.account()?.codigo ?? null));
    return { line: s.short, title: s.line, manages: canManage(e.papel) };
  });
  /**
   * Quem vê, como na ficha do mural: só um desenho antes da data, e o que ele quer dizer no título e
   * para o leitor de tela. Em toda ficha, anotação ou análise: o cadeado da privada, o olho da
   * publicada; a sem aviso, o sino cortado. Só no seu mural; a compartilhada diz com quem está na
   * mesma linha.
   */
  protected readonly audience = computed<{ icon: LucideIconData; title: string } | null>(() => {
    const r = this.review();
    if (!r || this.owner() !== null || this.sharedEntry()) return null;
    if (r.quiet) return { icon: this.QuietIcon, title: 'Pública, sem aviso: está no seu mural, mas não foi para o Feed' };
    if (isPrivate(r)) return { icon: this.PrivateIcon, title: 'Privada: só você vê' };
    return { icon: this.PublicIcon, title: 'Publicada: quem abre o seu mural vê' };
  });

  // ===== Onde mais a anotação está: o quadro do Kanban e os dias do Calendário =====
  private readonly kanban = inject(KanbanStore);
  private readonly calendar = inject(CalendarStore);
  private readonly study = inject(StudyStore);
  protected readonly CalendarIcon = ICON.calendario;
  /** O desenho de cada escolha da cartela (o ícone do lembrete, no lugar do calendário). */
  protected readonly choiceIcon = ICON_CHOICE;
  /** As tarefas do texto da anotação: quantas já foram feitas (como na linha da data da ficha do mural). */
  protected readonly tasks = computed(() => {
    const r = this.review();
    if (!r || !this.note()) return null;
    const c = checkCount(r.text);
    return c.total ? c : null;
  });
  /**
   * A anotação no quadro do grupo dela (no seu mural): a coluna (com o desenho e a cor dela), a
   * importância, a observação e as dependências, as mesmas etiquetas da ficha no quadro.
   */
  protected readonly board = computed(() => {
    const r = this.review();
    if (!r || !this.note() || this.owner() !== null) return null;
    const spot = this.kanban.cardOf(r.id);
    if (!spot) return null;
    const column = spot.board.columns.find((c) => c.id === spot.card.column) ?? null;
    return {
      id: spot.board.id,
      column: column?.name ?? 'No quadro',
      // a coluna que não está mais no quadro (ou um desenho que não existe): o do quadro, nunca o do Calendário ao lado
      icon: (column && ICON_CHOICE[column.icon]) || ICON.colunas,
      color: column?.color ?? null,
      importance: spot.card.importance,
      status: spot.card.status ?? null,
      deps: this.deps.progress(spot.card.deps).total ? spot.card.deps! : null,
    };
  });
  /**
   * A carta dos Estudos (PLANO-ESTUDOS.md, 6.9): o primeiro baralho dela (e quantos mais), o nível e quando
   * volta. Só na sua anotação, como o Kanban.
   */
  protected readonly studyCard = computed(() => {
    const r = this.review();
    if (!r || !this.note() || this.owner() !== null) return null;
    const card = this.study.cardOf().get(r.id);
    const decks = card ? cardDecks(card, this.study.decks()) : [];
    if (!card || !decks.length) return null;
    const level = levelOf(card.srs);
    // (a parada num baralho pausado: a volta de quando ele for retomado)
    const when = card.srs.state === 'nova' ? 'ainda não estudado' : `revisão ${whenLabel(this.study.shown(card).srs, this.study.now())}`;
    return {
      deckId: decks[0].id,
      deck: decks[0].name,
      more: decks.length - 1,
      icon: (decks[0].icon && ICON_CHOICE[decks[0].icon]) || ICON.camadas,
      color: decks[0].color,
      level,
      levelLabel: LEVEL_LABEL[level],
      when,
      fresh: card.srs.state === 'nova',
    };
  });
  /** Os lembretes do Calendário com a anotação presa: até dois, os mais perto primeiro, e quantos mais há. */
  private readonly allReminders = computed(() => {
    const r = this.review();
    return r && this.note() && this.owner() === null ? remindersOfNote(this.calendar.reminders(), r.id, this.calendar.today()) : [];
  });
  /** Todos os lembretes à mostra (o "+2"), só até trocar de anotação. */
  protected readonly allRemindersShown = linkedSignal({ source: () => this.reviewId(), computation: () => false });
  /** Os lembretes à mostra: o mais perto (todos, depois do "+2"), com o dia dito perto de quem lê. */
  protected readonly reminders = computed(() =>
    this.allReminders()
      .slice(0, this.allRemindersShown() ? undefined : 1)
      .map((x) => ({ ...x, when: `${nearDayLabel(x.day, this.calendar.today())}${x.time ? `, ${timeLabel(x.time)}` : ''}` })),
  );
  protected readonly moreReminders = computed(() => (this.allRemindersShown() ? 0 : Math.max(0, this.allReminders().length - 1)));

  /** O quadro do grupo da anotação, no Kanban: a leitura fecha e o quadro abre. */
  protected openBoard(id: string): void {
    this.close();
    void this.router.navigate(['/anotacoes/kanban', id]);
  }

  /** O baralho da carta, nos Estudos (no grupo dele). */
  protected openDeck(id: string): void {
    this.close();
    const group = this.study.deck(id)?.group;
    void this.router.navigateByUrl(group ? studyPath(studyGroupId(group), id) : studyPath());
  }

  private readonly reminderLinks = inject(ReminderLinks);

  /** O link de lembrete do texto: a leitura fecha e o Calendário abre no dia dele, com ele em destaque. */
  private openReminder(id: string): void {
    if (!this.reminderLinks.info(id)) return;
    this.close();
    this.reminderLinks.open(id);
  }

  /** O dia do lembrete, no Calendário (na vista do dia). */
  protected openDay(day: string): void {
    this.close();
    void this.router.navigate([CALENDAR_PATH], { queryParams: { vista: 'dia', dia: day } });
  }

  /** Uma dependência tocada na tira do selo: ela abre aqui mesmo, com o "Voltar" para esta. */
  protected openDep(id: string): void {
    const n = this.store.get(id);
    if (n) this.follow(n);
  }

  /** O bilhete do "Mais": o que se faz de vez em quando com a ficha aberta, o que apaga por último. */
  protected readonly moreItems = computed<MoreItem[]>(() => {
    const r = this.review();
    if (!r) return [];
    // a anotação finalizada também sai do mural; apagar é outra coisa (ver `removalOf`)
    const removal = removalOf(this.sharedEntry(), this.note());
    const remove: MoreItem = { id: 'remover', label: removal.label, icon: removal.leaves ? this.LeaveIcon : this.TrashIcon, danger: true };
    // o link que abre só esta ficha, para quem não usa o Murall (a privada diz por que não tem)
    const link: MoreItem = { id: 'link', label: this.note() ? 'Link da anotação' : 'Link da ficha', icon: this.LinkIcon, dialog: true };
    // a ficha como documento, pela impressão do navegador (ver ui/pdf-sheet.ts); a ficha em segredo
    // (a nota e o texto riscados aqui) não sai no papel: revelada, sim
    const pdf: MoreItem[] = this.masked() ? [] : [{ id: 'pdf', label: 'Salvar como PDF', icon: this.PdfIcon, hint: 'Abre a impressão: escolha “Salvar como PDF”' }];
    // o que vale só para esta ficha (aceitar comentários): de quem é dono dela, com a conta aberta
    const config: MoreItem[] = this.configurable() ? [{ id: 'configurar', label: 'Configurações', icon: this.ConfigIcon, dialog: true }] : [];
    if (this.note()) {
      const pinned = r.noteRank === 'fixada';
      const shared = this.sharedHere();
      return [
        { id: 'fixar', label: pinned ? 'Desafixar' : 'Fixar no topo', icon: pinned ? this.UnpinIcon : this.PinIcon },
        // quem só lê não abre o editor: o grupo, o assunto e as tags (que são de cada um) mudam numa folha
        ...(this.writable() ? [] : [{ id: 'organizar', label: 'Grupo e tags', icon: this.GroupIcon, dialog: true }]),
        // dividir com outras pessoas (ou ver quem está, para quem não gere a anotação)
        { id: 'compartilhar', label: !shared || shared.manages ? 'Compartilhar' : 'Pessoas', icon: this.SharedIcon, dialog: true },
        link,
        ...pdf,
        ...config,
        remove,
      ];
    }
    return [
      { id: 'outra-vez', label: `Escrever ${this.profile().revisit.one}`, icon: this.RevisitIcon },
      // as rejogadas não entram no lado a lado: lá é uma ficha por obra
      ...(r.revisitOf ? [] : [{ id: 'lado-a-lado', label: 'Lado a lado', icon: this.side.has(r.id) ? this.CheckedIcon : this.UncheckedIcon, pressed: this.side.has(r.id), hint: `Marcar pra comparar com ${this.others()}` }]),
      link,
      ...pdf,
      ...config,
      remove,
    ];
  });

  protected onMore(id: string): void {
    const r = this.review();
    if (!r) return;
    if (id === 'fixar') this.togglePin();
    else if (id === 'compartilhar') this.openShare();
    else if (id === 'link') this.linkOpen.set(true);
    else if (id === 'organizar') this.organizeOpen.set(true);
    else if (id === 'outra-vez') this.whenFree(() => this.revisit.emit(r.id));
    else if (id === 'lado-a-lado') this.side.toggle(r.id);
    else if (id === 'remover') this.whenFree(() => this.remove.emit(r.id));
    else if (id === 'pdf') void this.savePdf();
    else if (id === 'configurar') this.configOpen.set(true);
  }

  private readonly env = inject(EnvironmentInjector);
  private readonly app = inject(ApplicationRef);
  private readonly toasts = inject(Toasts);
  /** A folha do PDF está sendo montada (um segundo pedido espera; o botão da ficha pelo link diz). */
  protected readonly pdfBusy = signal(false);

  /**
   * Salva a ficha aberta em PDF: a folha (ui/pdf-sheet.ts, num pedaço à parte, carregado só agora)
   * com o que se lê aqui: o nome, quem fez, as informações, as tags e o texto com os widgets.
   */
  protected async savePdf(): Promise<void> {
    const r = this.review();
    if (!r || this.pdfBusy()) return;
    this.pdfBusy.set(true);
    this.toasts.show('Preparando o PDF…', undefined, 20000);
    try {
      const m = await import('./pdf-sheet');
      await m.exportPdf(this.pdfDoc(r), this.env, this.app, () => this.toasts.dismiss());
    } catch {
      this.toasts.show('Não deu para preparar o PDF. Tente de novo.');
    } finally {
      this.pdfBusy.set(false);
    }
  }

  /** A ficha aberta, como o PDF a mostra. */
  private pdfDoc(r: Review): PdfDoc {
    const note = isNote(r);
    const meta: string[] = [];
    if (note && this.folderPath()) meta.push(this.folderPath()!.label);
    if (r.completedAt === null) meta.push(this.noDay);
    else meta.push(note ? this.date() : `${dayLabel(r.kind, r.status)} ${this.date()}`);
    if (this.hours()) meta.push(this.hours());
    const g = this.groupEar();
    const by = this.music() ? `${this.formLabel()}${this.artist() ? ` de ${this.artist()}` : ''}` : r.game.by ? `de ${r.game.by}` : '';
    const notes = this.linkable();
    return {
      title: r.game.name,
      by: note ? '' : by,
      meta,
      group: g ? { label: g.label, color: g.color } : null,
      tags: note ? (r.tags ?? []).map((t) => ({ label: t, color: this.tagColor(t) })) : [],
      score: note
        ? null
        : {
            value: formatScore(r.scores.final),
            verdict: r.verdict ? VERDICT_LABEL[r.verdict] : null,
            marks: ratedKeys(r.kind)
              .filter((k) => weightOf(r.weights, k) !== 'nao-tem')
              .map((k) => ({ label: SCORE_LABEL[k], value: formatScore(scoreOf(r.scores, k)) })),
          },
      cover: r.game.coverUrl || null,
      text: r.text,
      stock: this.pin().stock,
      // os links entre anotações só se mostram (no papel não se toca); o de lembrete leva a data
      links: { resolve: (title) => resolveNote(notes, title), ...(this.owner() === null ? { reminder: (id: string) => this.reminderLinks.info(id) } : {}) },
    };
  }

  /** Quem não é o dono sai da anotação (em vez de apagar). */
  protected readonly leaves = computed(() => removalOf(this.sharedEntry(), true).leaves);
  /** Há um conflito que quem abriu pode resolver. */
  protected readonly conflictHere = computed(() => {
    const e = this.sharedEntry();
    if (e) return !!e.conflito && canWrite(e.papel);
    return !!this.ownConflict();
  });
  /** O conflito da conta nesta ficha (ela mudou em dois aparelhos seus; ver core/sync-conflicts.ts). */
  private readonly ownConflict = computed(() => {
    const r = this.review();
    return r && this.owner() === null ? this.syncConflicts.forFicha(r.id) : null;
  });
  /** A frase do aviso, de quem é o conflito. */
  protected readonly conflictLine = computed(() => {
    const c = this.ownConflict();
    const what = this.review() && isNote(this.review()!) ? 'esta anotação' : 'esta ficha';
    if (!c) return 'Esta anotação mudou de dois jeitos ao mesmo tempo: falta escolher qual versão fica.';
    if (c.a === null || c.b === null) return `Você apagou ${what} num aparelho e mudou no outro: falta escolher qual fica.`;
    return `${what.charAt(0).toUpperCase()}${what.slice(1)} mudou em dois aparelhos seus ao mesmo tempo: falta escolher qual versão fica.`;
  });
  /**
   * A ficha aberta, pelo id: as folhas fecham quando abre outra ficha, não quando chega uma versão nova
   * da mesma (a compartilhada que mudou na nuvem ou no seu mural).
   */
  private readonly openId = computed(() => this.review()?.id);
  protected readonly shareOpen = linkedSignal({ source: this.openId, computation: () => false });
  protected readonly conflictOpen = linkedSignal({ source: this.openId, computation: () => false });
  /** A folha do grupo, do assunto e das tags de quem só lê a compartilhada. */
  protected readonly organizeOpen = linkedSignal({ source: this.openId, computation: () => false });
  /** As configurações da ficha (ver ui/card-config.ts). */
  protected readonly configOpen = linkedSignal({ source: this.openId, computation: () => false });
  /**
   * A ficha tem Configurações: é sua (no seu mural, e não a compartilhada de outra pessoa) e a conta
   * está aberta (os comentários moram na nuvem).
   */
  protected readonly configurable = computed(() => this.owner() === null && !this.leaves() && !!this.comments.myCode());
  /** A folha do link da ficha (ver ui/link-sheet.ts). */
  protected readonly linkOpen = linkedSignal({ source: this.openId, computation: () => false });
  /** De quem é o link: o dono da compartilhada de outra pessoa, ou você. */
  protected readonly linkCode = computed(() => {
    const e = this.sharedEntry();
    return e && e.papel !== 'dono' ? e.dono.codigo : this.reactions.myCode();
  });

  protected closeOrganize(): void {
    this.organizeOpen.set(false);
    // a orelha do grupo e as tags mostram os de agora
    const r = this.review();
    if (r && this.owner() === null) this.review.set(this.store.get(r.id) ?? r);
  }

  protected openShare(): void {
    this.shareOpen.set(true);
  }

  protected closeShare(): void {
    this.shareOpen.set(false);
    // a anotação pode ter mudado (privada, pública): a leitura mostra a de agora
    const r = this.review();
    if (r && this.owner() === null) this.review.set(this.store.get(r.id) ?? r);
  }

  protected openConflict(): void {
    this.conflictOpen.set(true);
  }

  /** Escolheu uma versão: a leitura mostra a de agora (e fecha, se a escolhida foi apagar). */
  protected afterConflict(): void {
    const r = this.review();
    if (!r || this.owner() !== null) return;
    const now = this.store.get(r.id);
    if (now) this.review.set(now);
    else this.leave();
  }

  /** A compartilhada aberta acompanha o que chega da nuvem (outra pessoa escrevendo). */
  private readonly followShared = effect(() => {
    const e = this.sharedEntry();
    if (!e) return;
    untracked(() => {
      const r = this.review();
      if (r && r.id === e.id && r !== e.view && this.store.get(e.id) === e.view) this.review.set(e.view);
    });
  });
  /** A anotação aberta é conferida mais seguido enquanto está aberta. */
  private watched: string | null = null;
  private watchShared(id: string | null): void {
    if (this.watched) this.shared.watch(this.watched, false);
    this.watched = id && this.shared.get(id) ? id : null;
    if (this.watched) this.shared.watch(this.watched, true);
  }
  protected readonly profile = computed(() => profileOf(this.review()?.kind ?? 'jogos'));
  protected readonly hours = computed(() => {
    const r = this.review();
    return r ? formatAmount(r.kind, r.hoursPlayed, true) : '';
  });
  /** "outros jogos", "outras séries". */
  protected readonly others = computed(() => `${g(this.profile(), 'outros', 'outras')} ${this.profile().plural}`);
  protected readonly bonuses = computed(() => sortBonuses(this.review()?.bonuses ?? []));
  protected readonly kindLabels = BONUS_KIND_LABEL;
  protected readonly dayLabel = dayLabel;
  protected readonly noDay = NO_DAY_LABEL;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly review = signal<Review | null>(null);
  /** Backups de colegas são somente leitura e nunca acionam as ações do mural pessoal. */
  protected readonly owner = signal<string | null>(null);
  /** As pastas de quem é a ficha: as suas, ou as públicas de quem você visita (a vista da visita). */
  private readonly visitFolders = inject(WallState, { optional: true });
  private readonly ownFolders = inject(NoteFolders);
  /** A pasta da anotação aberta (o id, o nome e o caminho, "Programação › Funcional"), ou null solta na raiz. */
  protected readonly folderPath = computed(() => {
    const r = this.review();
    if (!r || !isNote(r)) return null;
    const tree = this.folderTree();
    const path = tree.path(tree.of(r));
    const last = path.at(-1);
    return last ? { id: last.id, name: last.name, label: pathLabel(path), parts: path.map((f) => f.name) } : null;
  });

  /** Tocou no caminho: a leitura fecha e a parede abre naquela pasta (no seu mural, ou no de quem você visita). */
  protected openFolder(id: string): void {
    this.close();
    if (this.owner() === null) void this.router.navigate([wallPath(NOTES)], { queryParams: { pasta: id } });
    else this.visitFolders?.openFolderFrom(id);
  }
  /** O código na nuvem do dono da ficha de outra pessoa (para as reações); null num backup. */
  protected readonly ownerCode = signal<string | null>(null);
  private readonly injector = inject(Injector);
  /** Aberta pelo link: a página é só ela (`conta`: quem abriu tem conta; `visita`: não tem). */
  protected readonly solta = signal<'conta' | 'visita' | null>(null);
  private readonly router = inject(Router);

  /** O perfil de quem escreveu a ficha: a leitura fecha e a página da pessoa abre. */
  protected openOwner(code: string): void {
    this.close();
    void this.router.navigate(['/perfil', code]);
  }
  protected readonly reactions = inject(Reactions);
  /** A ficha aberta como alvo das reações: a de quem tem código, ou a sua com a conta aberta. */
  protected readonly reactTarget = computed<ReactionTarget | null>(() => {
    const r = this.review();
    // a compartilhada de outra pessoa: as reações e os comentários são os da ficha do dono
    const e = this.sharedEntry();
    const code = e && e.papel !== 'dono' ? e.dono.codigo : this.owner() === null ? this.reactions.myCode() : (r?.sharedBy?.codigo ?? this.ownerCode());
    // pelo link, sem conta: só a ficha (nem as reações nem os comentários)
    if (this.solta() === 'visita') return null;
    return r && code ? { code, ref: r.id, titulo: r.game.name, mural: r.kind } : null;
  });
  /** Pedido por quem abriu: a ficha de outra pessoa sobre algo que você ainda não avaliou ("Evitar spoilers de outros murais"). */
  protected readonly forceMask = signal(false);
  /** "Revelar a nota": a ficha em segredo à mostra (quem abriu guarda, ver `revealedChange`). */
  protected readonly revealed = signal(false);

  protected toggleReveal(): void {
    const r = this.review();
    if (!r) return;
    const revealed = !this.revealed();
    this.revealed.set(revealed);
    // as setas andam entre as vezes da obra com a nota à mostra: todas ficam reveladas
    const ids = this.times().map((x) => x.id);
    this.revealedChange.emit({ ids: ids.length ? ids : [r.id], revealed });
  }
  /** Sem spoilers, a leitura do seu mural esconde o mesmo que a ficha. O mural de um colega não, a não ser quando pedido. */
  protected readonly masked = computed(
    () => !this.note() && ((this.forceMask() && !this.revealed()) || (this.settings.noSpoilers() && this.owner() === null)),
  );
  /** Uma anotação: sem nota, veredito, rejogada nem lado a lado; as categorias e o texto. */
  protected readonly note = computed(() => !!this.review() && isNote(this.review()!));
  /** Uma ficha de música: o vinil no lugar da foto, e o artista embaixo do nome. */
  protected readonly music = computed(() => !!this.review() && isMusicReview(this.review()!));
  /** "Álbum" ou "Música". */
  protected readonly formLabel = computed(() => (this.review() ? MUSIC_FORM_LABEL[musicFormOf(this.review()!.game)] : ''));
  /** De quem é a música: o crédito inteiro do catálogo ("Milton Nascimento & Lô Borges"); sem ele, o artista da aba. */
  protected readonly artist = computed(() => this.review()?.game.by ?? this.review()?.category ?? '');
  /** A anotação aberta. Num `computed`: marcar uma tarefa troca a `review` (salva), mas não a anotação. */
  private readonly reviewId = computed(() => this.review()?.id);

  // ===== Os comentários: a folha presa ao lado da ficha (ver ui/comments-panel.ts) =====
  protected readonly comments = inject(Comments);
  private readonly account = inject(CloudAccount);
  protected readonly CommentIcon = ICON.comentar;
  protected readonly QuoteIcon = ICON.citacao;
  /**
   * A ficha aberta como alvo dos comentários: a de quem tem código (ou a sua, com a conta aberta). A
   * privada também: o dono escreve nela para si, e numa anotação compartilhada fala com quem está nela.
   */
  protected readonly commentTarget = computed<CommentTarget | null>(() => this.reactTarget());
  /** Quem lê os comentários de uma ficha privada, para a folha dizer (null: a ficha está à mostra). */
  protected readonly commentAudience = computed(() => {
    if (!this.review()?.private) return null;
    const e = this.sharedEntry();
    return e && (e.papel !== 'dono' || e.membros.length) ? 'Anotação privada: só quem está nela vê os comentários.' : 'Ficha privada: só você vê os comentários.';
  });
  protected readonly commentCount = computed(() => {
    const t = this.commentTarget();
    return t ? this.comments.countOf(t.code, t.ref) : 0;
  });
  /** A folha de comentários à mostra; trocar de ficha (as vezes da obra, um link) fecha. */
  protected readonly commentsOpen = linkedSignal({ source: this.reviewId, computation: () => false });
  /**
   * Os comentários têm porta nesta ficha: há algum para ler, ou você tem conta para escrever o
   * primeiro (na ficha de outra pessoa ou na sua: o dono também comenta nas dele).
   */
  protected readonly commentable = computed(() => {
    const t = this.commentTarget();
    if (!t) return false;
    // fechados pelo dono: só ele, e só para ler (e apagar) os que já estavam
    if (this.commentsClosed()) return t.code === this.comments.myCode() && (this.commentCount() > 0 || this.commentsOpen());
    return this.commentCount() > 0 || this.commentsOpen() || !!this.comments.myCode();
  });
  /** O dono fechou os comentários desta ficha (Configurações, no Mais). */
  protected readonly commentsClosed = computed(() => {
    const t = this.commentTarget();
    return !!t && this.comments.closedOf(t.code, t.ref);
  });
  /** Quem escreveu a ficha, para a folha dizer quem precisa ser seguido. */
  protected readonly commentOwner = computed(() => this.owner() ?? this.account.account()?.nome ?? 'Você');
  /** A ficha em segredo: a pessoa aceitou ver os comentários mesmo assim (só nesta ficha). */
  protected readonly spoilersOk = linkedSignal({ source: this.reviewId, computation: () => false });
  /** O trecho que a pessoa mandou citar, para a folha pôr no comentário. */
  protected readonly quote = linkedSignal<string | undefined, QuoteRequest | null>({ source: this.reviewId, computation: () => null });
  private quoteCount = 0;
  /**
   * O trecho selecionado no texto da ficha e onde ficam os remendos (em px, dentro da dupla): o "Citar" (`quote`) e o
   * "Nova nota" (`spot`, onde o trecho está escrito), cada um só quando vale.
   */
  protected readonly picked = signal<PickedPiece | null>(null);
  /**
   * Dá para citar: há porta para os comentários, você tem conta e o texto não está em segredo; e a folha de comentários
   * está aberta ao lado (pedido do dono, 24/nov: fechada, o "Citar" só atrapalhava quem selecionava para ler ou procurar
   * no dicionário). Na tela estreita (abaixo de BESIDE_MEDIA), a folha aberta cobre a ficha e não há texto para
   * selecionar: ali o "Citar" continua com a folha fechada, e tocar nele a abre com o trecho. Lido na hora da seleção
   * (a largura da tela não é um sinal).
   */
  private canQuote(): boolean {
    if (!this.lendo() || !this.commentable() || this.commentsClosed() || !this.comments.myCode() || this.masked()) return false;
    // com duas abertas, a folha cobre a ficha do lado dela, como na tela estreita
    return this.fitsBeside() && !this.split() ? this.sideShown() === 'comentarios' : !this.sideOpen();
  }
  /**
   * Dá para criar uma nota a partir do trecho (PLANO-NOTA-DE-REFERENCIA.md, D1): na leitura de uma
   * anotação do seu mural em que você escreve, fora do link solto e com o texto à mostra.
   */
  private readonly canRefer = computed(
    () => this.lendo() && this.note() && this.owner() === null && !this.solta() && this.writable() && !this.masked(),
  );
  protected readonly NewNoteIcon = ICON.novaNota;
  protected readonly DictIcon = ICON.livros;
  // ===== O Dicionário Japonês na seleção (PLANO-DICIONARIO.md, 4.3) =====
  private readonly dictMarks = inject(DictionaryMarks);
  /** Achar as palavras de um trecho: o dicionário chega sob demanda, na primeira seleção (ver loadDictionary). */
  private readonly findWords = signal<((text: string) => Word[]) | null>(null);
  private dictionaryAsked = false;
  /** A folhinha do verbete aberta: as palavras e o trecho (trocar de ficha fecha). */
  protected readonly wordSheet = linkedSignal<string | undefined, { words: Word[]; query: string } | null>({ source: this.reviewId, computation: () => null });
  /** A folhinha da nota nova aberta: o trecho, o texto de onde ele saiu e a anotação (trocar de ficha fecha). */
  protected readonly quickNote = linkedSignal<string | undefined, QuickNoteAsk | null>({ source: this.reviewId, computation: () => null });
  /** O que a nota nova fez, dito ao leitor de tela. */
  protected readonly said = signal('');
  private selectionTimer: ReturnType<typeof setTimeout> | undefined;
  /** A seleção de texto da página, ouvida só com a leitura aberta (ver `open`). */
  private readonly onSelectionChange = () => this.watchSelection();
  /** A página saiu com a leitura aberta: a seleção deixa de ser ouvida. */
  private readonly stopWatching = inject(DestroyRef).onDestroy(() => {
    document.removeEventListener('selectionchange', this.onSelectionChange);
    clearTimeout(this.selectionTimer);
    // a segunda anotação some sem fechar: a compartilhada dela deixa de ser olhada por ela
    this.watchShared(null);
  });

  /** Quem abriu a folha de comentários (a etiqueta do trilho): é para onde o foco volta ao fechar. */
  private commentsOpener: HTMLElement | null = null;

  // ===== O trilho e os Detalhes (PLANO-LEITURA-UNIFICADA.md, D5–D7) =====
  /** A folha dos Detalhes à mostra; trocar de ficha fecha, como a dos comentários. */
  protected readonly detailsOpen = linkedSignal({ source: this.reviewId, computation: () => false });
  /** Alguma folha ao lado está aberta (os Detalhes ou os comentários). */
  protected readonly sideOpen = computed(() => this.commentsOpen() || this.detailsOpen());
  /** Qual: a etiqueta do trilho dela fica acesa. */
  protected readonly sideShown = computed<'detalhes' | 'comentarios' | null>(() => (this.detailsOpen() ? 'detalhes' : this.commentsOpen() ? 'comentarios' : null));
  protected readonly InfoIcon = ICON.informacao;
  /**
   * As etiquetas do trilho: Detalhes (só nas anotações), Comentários (com quantos, quando há porta para eles) e Ao lado
   * (o "+" de antes: só onde cabem duas, o CSS esconde abaixo de 1180px).
   */
  protected readonly rail = computed(() => {
    const out: { id: 'detalhes' | 'comentarios' | 'ao-lado'; label: string; name: string; icon: LucideIconData; count: number }[] = [];
    if (this.note()) out.push({ id: 'detalhes', label: 'Detalhes da anotação', name: 'Detalhes', icon: this.InfoIcon, count: 0 });
    if (this.commentable() && this.commentTarget()) {
      const n = this.commentCount();
      out.push({ id: 'comentarios', label: n ? `Comentários: ${n}` : 'Comentários', name: 'Comentários', icon: this.CommentIcon, count: n });
    }
    if (this.canBeside()) out.push({ id: 'ao-lado', label: 'Abrir outra coisa ao lado', name: 'Ao lado', icon: this.AddIcon, count: 0 });
    return out;
  });

  protected railPicked(id: 'detalhes' | 'comentarios' | 'ao-lado'): void {
    if (id === 'detalhes') this.toggleDetails();
    else if (id === 'comentarios') this.toggleComments();
    else this.pickBeside.set(true);
  }

  /** Abre ou fecha a folha dos Detalhes (fecha a dos comentários): o foco vai para ela e, fechando, volta à etiqueta. */
  protected toggleDetails(open = !this.detailsOpen()): void {
    // (com duas abertas, a folha cobre a ficha do lado dela, e a outra fica: PLANO-LADO-A-LADO.md, D1)
    if (open) {
      this.commentsOpen.set(false);
      this.quote.set(null);
    }
    this.detailsOpen.set(open);
    this.picked.set(null);
    const dialog = this.dialog().nativeElement;
    setTimeout(() => {
      if (open) return dialog.querySelector<HTMLElement>(`#leitura-detalhes${this.sufixo()}`)?.focus({ preventScroll: true });
      const active = document.activeElement;
      if (active instanceof HTMLElement && active.isConnected && dialog.contains(active) && !active.closest('.detalhes-lado')) return;
      dialog.querySelector<HTMLElement>('.etq-trilho[data-trilho="detalhes"]')?.focus({ preventScroll: true });
    });
  }

  /**
   * Quem vê, nos Detalhes: a sua anotação diz se é só sua ou pública; a compartilhada, as pessoas (com a foto delas) e
   * a frase de quem vê e quem edita. A de outra pessoa (a visita, o link) não diz: é a que ela publicou.
   */
  private readonly who = computed<ReaderDetailsData['who']>(() => {
    const r = this.review();
    if (!r || this.owner() !== null) return null;
    const e = this.sharedEntry();
    if (!e) {
      if (isPrivate(r)) return { icon: this.PrivateIcon, line: 'Só você', people: [], sub: null, opens: false };
      return { icon: r.quiet ? this.QuietIcon : this.PublicIcon, line: 'Qualquer pessoa vê no seu mural', people: [], sub: r.quiet ? 'sem ir para o Feed' : null, opens: false };
    }
    const me = this.account.account()?.codigo ?? null;
    const state = this.sharedGroups.accessOf(e, me);
    const seen = new Set<string>();
    const all = [...(e.papel !== 'dono' ? [{ codigo: e.dono.codigo, nome: e.dono.nome }] : []), ...state.members];
    // a foto do perfil de cada uma (o emoji na cartolina) vem com a anotação; quem entrou pelo grupo e não está nela, a inicial
    const faces = new Map([e.dono, ...e.membros].flatMap((x) => (x.foto ? [[x.codigo, x.foto] as const] : [])));
    const people: DetailsPerson[] = [];
    for (const m of all) {
      if (m.codigo === me || seen.has(m.codigo)) continue;
      seen.add(m.codigo);
      people.push({ code: m.codigo, name: m.nome, face: faces.get(m.codigo) ?? null });
    }
    const summary = accessSummary(state);
    // embaixo, curto: se é privada ou pública, e o seu papel nela (a frase inteira fica na folha das pessoas)
    const sub = `${state.public ? 'pública' : 'privada'} · você é ${e.papel}`;
    return { icon: this.SharedIcon, line: namesOf(people.map((x) => x.name)) || summary.short, people, sub, opens: true };
  });
  /** O que os Detalhes mostram (só nas anotações). */
  protected readonly details = computed<ReaderDetailsData | null>(() => {
    const r = this.review();
    if (!r || !this.note()) return null;
    const folder = this.folderPath();
    const notes: string[] = [];
    if (r.doneAt) notes.push(`finalizada em ${formatReviewDateLong(r.doneAt.slice(0, 10))}`);
    const b = this.board();
    const s = this.studyCard();
    return {
      group: this.groupEar(),
      folder: folder ? { id: folder.id, label: folder.label, parts: folder.parts, opens: !this.solta() } : null,
      date: { tape: tapeDate(r.completedAt), long: r.completedAt === null ? this.noDay : this.date(), pinned: this.owner() === null && r.noteRank === 'fixada', notes },
      who: this.who(),
      tasks: this.tasks(),
      tags: (r.tags ?? []).map((t) => ({ label: t, color: this.tagColor(t) })),
      board: b ? { id: b.id, column: b.column, color: b.color, importance: b.importance ?? null, status: b.status, deps: !!b.deps } : null,
      study: s ? { deckId: s.deckId, deck: s.deck, more: s.more, icon: s.icon, color: s.color, level: s.level, levelLabel: s.levelLabel, when: s.when, fresh: s.fresh } : null,
      reminders: this.reminders().map((x) => ({ id: x.id, day: x.day, when: x.when, title: x.title, past: x.past, icon: x.icon ? this.choiceIcon[x.icon] : this.CalendarIcon, color: x.color ?? null })),
      moreReminders: this.moreReminders(),
    };
  });

  /**
   * Abre ou fecha a folha de comentários. O foco vai para a folha ao abrir e, ao fechar, volta para
   * quem a abriu, sempre sem rolar a ficha: ela fica onde a pessoa estava lendo.
   */
  protected toggleComments(open = !this.commentsOpen()): void {
    // (com duas abertas, a folha cobre a ficha do lado dela, e a outra fica: PLANO-LADO-A-LADO.md, D1)
    if (open) this.detailsOpen.set(false);
    const dialog = this.dialog().nativeElement;
    const active = document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement) ? document.activeElement : null;
    if (open) this.commentsOpener = active?.matches('.etq-trilho') ? active : null;
    this.commentsOpen.set(open);
    this.picked.set(null);
    if (!open) this.quote.set(null);
    setTimeout(() => {
      if (open) return dialog.querySelector<HTMLElement>(`#leitura-comentarios${this.sufixo()}`)?.focus({ preventScroll: true });
      // fechou pela própria porta (a etiqueta do trilho): o foco já está nela, e fica
      if (active?.isConnected && !active.closest(`#leitura-comentarios${this.sufixo()}`)) return;
      // o foco estava dentro da folha, que sumiu: volta para quem abriu; sem saber quem foi (a ficha
      // já abriu com os comentários), para a etiqueta dos comentários
      const doors = [...dialog.querySelectorAll<HTMLElement>('.etq-trilho[data-trilho="comentarios"]')];
      const opener = this.commentsOpener?.isConnected ? this.commentsOpener : null;
      (opener ?? doors.find((d) => d.offsetParent !== null) ?? doors[0])?.focus({ preventScroll: true });
    });
  }

  /**
   * Com a folha de comentários ao lado, a faixa dela tem a altura da faixa da ficha (que cresce com o
   * nome escrito nela): a emenda das duas fica sem degrau.
   */
  private readonly bandSync = effect((onCleanup) => {
    if (!this.sideOpen()) return;
    const dialog = this.dialog().nativeElement;
    const measure = () => {
      const head = dialog.querySelector<HTMLElement>('.par > article > .head');
      const pair = dialog.querySelector<HTMLElement>('.par');
      if (head && pair) pair.style.setProperty('--faixa-h', `${head.offsetHeight}px`);
    };
    const watcher = new ResizeObserver(measure);
    // a faixa e a folha só existem depois do desenho
    const timer = setTimeout(() => {
      const head = dialog.querySelector('.par > article > .head');
      if (head) watcher.observe(head);
    });
    onCleanup(() => {
      clearTimeout(timer);
      watcher.disconnect();
    });
  });

  /** A seleção mudou (ou a ficha rolou): confere daqui a pouco, quando a pessoa parar de arrastar. */
  protected watchSelection(): void {
    if (!this.review()) return;
    clearTimeout(this.selectionTimer);
    this.selectionTimer = setTimeout(() => {
      this.picked.set(this.readSelection());
      if (this.picked()) afterNextRender(() => this.fitPatches(), { injector: this.injector });
    }, 180);
  }

  /** O trecho selecionado dentro do texto da ficha (e só dele), com o lugar dos remendos logo abaixo do fim. */
  private readSelection(rescrolled = false): PickedPiece | null {
    const quote = this.canQuote();
    // o dicionário vale em toda leitura com o texto à mostra (marcar como aprendida é do leitor, não da ficha), e só
    // para um trecho do tamanho de uma palavra: selecionar um parágrafo não baixa o dicionário
    const dictionary = this.lendo() && !this.masked() && (document.getSelection()?.toString().trim().length ?? 99) <= 40;
    if (!quote && !this.canRefer() && !dictionary) return null;
    const sel = document.getSelection();
    if (!sel || sel.isCollapsed || !sel.rangeCount) return null;
    const range = sel.getRangeAt(0);
    const dialog = this.dialog().nativeElement;
    const zone = dialog.querySelector('[data-citavel]');
    const pair = dialog.querySelector('.par');
    const text = sel.toString().trim();
    if (!zone || !pair || !text || !zone.contains(range.startContainer) || !zone.contains(range.endContainer)) return null;
    const rects = range.getClientRects();
    const last = rects[rects.length - 1];
    const body = zone.closest<HTMLElement>('.body');
    const view = body?.getBoundingClientRect();
    // o fim da seleção rolou para fora da ficha: o remendo não fica solto no ar
    if (!last || !body || !view || last.bottom < view.top || last.bottom > view.bottom) return null;
    // o remendo vai logo abaixo do fim do trecho, e nunca em cima do rodapé: se não cabe ali, a ficha
    // rola o que falta; no fim da ficha (sem mais o que rolar), ele sobe para cima da última linha
    const height = (matchMedia('(pointer: coarse)').matches ? 44 : 36) + PATCH_GAP;
    const lack = last.bottom + PATCH_GAP + height - view.bottom;
    let top = last.bottom + PATCH_GAP;
    // (meio pixel de sobra não conta: a rolagem anda em pixels inteiros)
    if (lack > 1) {
      const canScroll = body.scrollHeight - body.clientHeight - body.scrollTop;
      if (canScroll >= lack && !rescrolled) {
        body.scrollTop += Math.ceil(lack);
        return this.readSelection(true);
      }
      top = last.top - height;
    }
    const spot = this.canRefer() ? this.spotOf(range) : null;
    const find = this.findWords();
    if (dictionary && !find) this.loadDictionary();
    const words = dictionary && find ? find(text) : [];
    if (!quote && !spot && !words.length) return null;
    const box = pair.getBoundingClientRect();
    const article = zone.closest('.ficha')?.getBoundingClientRect() ?? box;
    // a largura dos remendos à mostra (medida de novo depois de desenhar, ver `fitPatches`)
    const widths = [quote ? 104 : 0, spot ? 136 : 0, words.length ? 170 : 0, this.toLearn(words) ? 140 : 0].filter(Boolean);
    const width = widths.reduce((a, b) => a + b, 0) + Math.max(widths.length - 1, 0) * 8;
    const left = Math.max(Math.min(last.right - box.left - 44, article.right - box.left - width), 8);
    return { text, left, top: top - box.top, quote, spot, words };
  }

  /**
   * Onde o trecho selecionado está escrito, se ele pode virar título e link (PLANO-NOTA-DE-REFERENCIA.md, D2): numa
   * linha só do texto (o título de um card e a célula de uma tabela também: eles desenham links), fora de link, código
   * e widget, e escrito no texto (a mesma vez dele na linha; o "→" lido pode estar escrito "->"). Senão, null.
   */
  private spotOf(range: Range): TextSpot | null {
    const r = this.review();
    if (!r) return null;
    const el = (n: Node) => (n instanceof Element ? n : n.parentElement);
    const start = el(range.startContainer);
    const end = el(range.endContainer);
    // numa célula de tabela, a linha é a fileira dela (a tabela inteira leva o `data-l` da primeira linha); o trecho
    // fica numa célula só
    const cell = start?.closest('td, th');
    let lineEl: HTMLElement | null;
    let line: number | null;
    if (cell) {
      const table = cell.closest<HTMLElement>('.tabela-peca[data-l]');
      const tr = cell.closest('tr');
      if (!table || !tr?.parentElement || end?.closest('td, th') !== cell) return null;
      const row = tr.closest('thead') ? 0 : [...tr.parentElement.children].indexOf(tr) + 1;
      lineEl = tr as HTMLElement;
      line = tableRowLine(r.text, Number(table.dataset['l']), row);
    } else {
      lineEl = start?.closest<HTMLElement>('[data-l]') ?? null;
      if (!lineEl || !lineEl.matches('.linha') || end?.closest('[data-l]') !== lineEl) return null;
      line = Number(lineEl.dataset['l']);
    }
    // dentro de um link, de um código, de um widget, do corpo de uma tarefa: não é texto comum da linha. O spoiler
    // revelado vale (o link fica dentro dele); o coberto não: não dá para ver o que se selecionou
    const inside = el(range.commonAncestorContainer)?.closest('.elo, a, code, pre, .spoiler:not(.revelado), .widget, app-note-widget, .corpo');
    if (inside && lineEl.contains(inside)) return null;
    const raw = range.toString();
    const text = raw.trim();
    if (!text || !spotTitle(text)) return null;
    // a linha como se lê (sem o corpo da tarefa, que são outras linhas) e onde o trecho começa nela
    const all = document.createRange();
    all.selectNodeContents(lineEl);
    const body = lineEl.querySelector(':scope > .corpo');
    if (body) all.setEndBefore(body);
    const before = document.createRange();
    before.setStart(all.startContainer, all.startOffset);
    before.setEnd(range.startContainer, range.startOffset);
    const at = before.toString().length + (raw.length - raw.trimStart().length);
    const places = placesOf(all.toString(), text);
    const nth = places.indexOf(at);
    if (nth === -1 || line === null || !Number.isInteger(line)) return null;
    const spot: TextSpot = { line, text, nth, count: places.length };
    return linkSpot(r.text, r.text, spot, text) === null ? null : spot;
  }

  /** Os remendos desenhados: se passaram da beirada da ficha (a letra é outra), voltam para dentro dela. */
  private fitPatches(): void {
    const dialog = this.dialog().nativeElement;
    const patches = dialog.querySelector<HTMLElement>('.par > .remendos');
    const article = dialog.querySelector('.par > .ficha');
    if (!patches || !article) return;
    const over = patches.getBoundingClientRect().right - article.getBoundingClientRect().right;
    if (over > 0) patches.style.left = `${Math.max(patches.offsetLeft - over, 8)}px`;
  }

  /**
   * O Dicionário Japonês, carregado uma vez (o pedaço com o CSV), na primeira seleção da leitura: quando chega, a
   * seleção de agora é lida de novo, e o "No dicionário" aparece se o trecho é uma palavra.
   */
  private loadDictionary(): void {
    if (this.dictionaryAsked) return;
    this.dictionaryAsked = true;
    import('../core/dictionary/words')
      .then((m) => {
        this.findWords.set(m.findWords);
        this.watchSelection();
      })
      .catch(() => (this.dictionaryAsked = false));
  }

  /** A palavra para o "Aprendida": só quando o trecho é uma palavra só, e ela ainda falta aprender. */
  protected toLearn(words: readonly Word[]): Word | null {
    return words.length === 1 && !this.dictMarks.learned(words[0]) ? words[0] : null;
  }

  /** "No dicionário": a folhinha com o verbete inteiro do trecho. */
  protected consultSelection(): void {
    const p = this.picked();
    if (!p?.words.length) return;
    this.picked.set(null);
    document.getSelection()?.removeAllRanges();
    this.wordSheet.set({ words: p.words, query: p.text });
  }

  /** "Aprendida": marca na hora, com o Desfazer no bilhete. */
  protected learnSelection(w: Word): void {
    markLearned(this.dictMarks, this.toasts, w, true);
    this.picked.set(null);
    document.getSelection()?.removeAllRanges();
  }

  /** "Nova nota": a folhinha abre com o trecho como título; o link só entra quando ela cria (ou liga). */
  protected referSelection(): void {
    const p = this.picked();
    const r = this.review();
    if (!p?.spot || !r || !this.canRefer()) return;
    this.picked.set(null);
    document.getSelection()?.removeAllRanges();
    this.said.set('');
    this.quickNote.set({ spot: p.spot, shown: r.text, from: r, shared: !!this.sharedEntry() });
  }

  /**
   * A folhinha criou a anotação (ou escolheu uma que já existia): o trecho vira o link para ela, na versão de agora da
   * anotação aberta (a nuvem pode ter trazido outra com a folha aberta), sem sair do lugar onde se lia.
   */
  protected linkPiece(e: QuickNoteLinked): void {
    const ask = this.quickNote();
    const shown = this.review();
    const r = shown && (this.store.get(shown.id) ?? shown);
    if (!ask || !r || r.id !== ask.from.id || this.owner() !== null || !this.writable()) return;
    const text = linkSpot(ask.shown, r.text, ask.spot, e.title);
    if (text === null) {
      if (r !== shown) this.review.set(r);
      this.said.set(e.created ? `Anotação “${e.title}” criada. O trecho mudou no texto e ficou sem o link.` : 'O trecho mudou no texto: não deu para ligar.');
      return;
    }
    const next: Review = { ...r, text, updatedAt: new Date().toISOString() };
    this.store.update(next);
    this.review.set(next);
    this.said.set(e.created ? `Anotação “${e.title}” criada e ligada ao trecho.` : `Trecho ligado a “${e.title}”.`);
  }

  /** A folhinha fechou (criando ou não): o foco volta para o nome da ficha, sem rolar o texto de onde se lia. */
  protected quickNoteClosed(): void {
    this.quickNote.set(null);
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>(`#leitura-titulo${this.sufixo()}`)?.focus({ preventScroll: true }), { injector: this.injector });
  }

  /** "Citar": o trecho vai para o campo da folha de comentários, que abre se estava fechada (na tela estreita). */
  protected quoteSelection(): void {
    const p = this.picked();
    if (!p) return;
    this.picked.set(null);
    document.getSelection()?.removeAllRanges();
    this.detailsOpen.set(false);
    this.commentsOpen.set(true);
    this.quote.set({ text: p.text, n: ++this.quoteCount });
  }

  /** Um caminho para fora da leitura, tocado na folha de comentários (o perfil de alguém, Ajustes › Conta). */
  protected leaveTo(commands: string[]): void {
    this.close();
    void this.router.navigate(commands, commands[0] === '/ajustes' ? { queryParams: { aba: 'conta' } } : {});
  }

  /** A leitura fechou (pelo X, por Esc ou pelo fundo): a ficha sai e a seleção deixa de ser ouvida. */
  protected onClosed(): void {
    // o aviso de que fechou chega depois: se outra ficha já abriu no lugar, ele não é dela
    const el = this.dialog().nativeElement;
    if (el.open) return;
    // a ficha aberta pelo link é a página: o Esc logo ao abrir (o Chrome só deixa recusar o cancel
    // depois de um toque) ou o voltar do Android não a fecham. Só fecha quem pediu (`close`)
    if (this.solta() && !this.closing) {
      el.showModal();
      return;
    }
    this.closing = false;
    this.fita()?.stop();
    this.editingHere.set(false);
    this.dictionary.set(false);
    this.sideFirst.set(false);
    this.segunda.set(null);
    this.pickBeside.set(false);
    this.solta.set(null);
    this.vista.set('leitura');
    this.place = null;
    document.removeEventListener('selectionchange', this.onSelectionChange);
    clearTimeout(this.selectionTimer);
    this.picked.set(null);
    this.quickNote.set(null);
    this.said.set('');
    this.review.set(null);
    this.watchShared(null);
  }
  /** O texto embaralhado do mesmo tamanho, sem as marcas de formatação, para o modo sem spoilers. */
  protected readonly text = computed(() => {
    const r = this.review();
    return r ? scramble(plainText(r.text), r.id) : '';
  });

  /** Marcou uma tarefa do texto na leitura: a ficha (sua) é salva com ela marcada, sem abrir o editor. */
  /**
   * A anotação daqui está aberta no editor do outro lado (D8): daqui ela só se lê. Marcar uma tarefa, fixar ou finalizar
   * gravaria por baixo do editor, e o Salvar dele gravaria por cima, com a versão que ele abriu.
   */
  protected readonly editedAside = computed(() => {
    const id = this.review()?.id;
    if (!id) return false;
    const other = this.aoLado() ? this.outer : this.ladoB();
    return !!other && other.editingHere() && other.editingId() === id;
  });

  /** Fixar ou finalizar com a anotação no editor do outro lado: o aviso, e nada muda. */
  private blockedAside(): boolean {
    if (!this.editedAside()) return false;
    this.toasts.show('Esta anotação está aberta para editar no outro lado: salve ou feche o editor antes.');
    return true;
  }

  protected toggleTask(line: number): void {
    if (this.editedAside()) return;
    const shown = this.review();
    // a anotação como está agora (a nuvem pode ter trazido uma versão mais nova com a leitura aberta)
    const r = shown && (this.store.get(shown.id) ?? shown);
    if (!shown || !r || this.owner() !== null || !this.writable()) return;
    // a linha é a do texto desenhado: a tarefa tocada, achada no de agora pelo que ela diz
    const text = tickTask(r.text, shown.text, line);
    if (text === r.text) {
      // nada a marcar (já estava, ou sumiu na versão nova): a leitura mostra a de agora
      if (r !== shown) this.review.set(r);
      return;
    }
    const next: Review = { ...r, text, updatedAt: new Date().toISOString() };
    this.store.update(next);
    this.review.set(next);
    // a tarefa com link para outra anotação: oferece finalizar aquela também (o bilhete ficaria por baixo da leitura)
    void this.noteDone.offerLinked(r.id, text, line, { quiet: true });
  }
  private readonly noteDone = inject(NoteDone);
  private readonly deps = inject(KanbanDeps);
  private readonly notePin = inject(NotePin);
  /** Fixa (ou desafixa) a sua anotação no topo do mural; a leitura continua aberta. */
  protected togglePin(): void {
    if (this.blockedAside()) return;
    const r = this.review();
    if (!r || this.owner() !== null || !this.note()) return;
    // o bilhete com Desfazer ficaria por baixo da leitura: o próprio botão desfaz
    this.notePin.set(r.id, r.noteRank !== 'fixada', { quiet: true });
    this.review.set(this.store.get(r.id) ?? r);
  }
  /**
   * O check da sua anotação inteira. Finalizar fecha a leitura: a ficha ganha o carimbo no mural e sai
   * dele (ver ReviewCard). Abrir de novo fica aqui, com a anotação sem o carimbo.
   */
  protected finish(): void {
    if (this.blockedAside()) return;
    const r = this.review();
    if (!r || this.owner() !== null || !this.note() || !this.writable()) return;
    const done = !r.doneAt;
    // finalizar com dependência ainda aberta (no quadro) pergunta antes; sem o sim, nada muda
    const ok = done ? this.deps.allowFinish([r.id]) : true;
    if (ok === true) this.applyFinish(r, done);
    else void ok.then((yes) => yes && this.applyFinish(this.store.get(r.id) ?? r, done));
  }

  private applyFinish(r: Review, done: boolean): void {
    if (!!r.doneAt === done) return;
    // mostrando as finalizadas, ela fica no mural: o carimbo bate aqui mesmo, e a leitura continua
    const stay = !done || this.view.showDone();
    // veio por um link: volta para a anotação de antes (o bilhete com Desfazer ficaria por baixo da leitura)
    const backTo = !stay && !!this.backTo();
    // a segunda que sai deixa a primeira aberta: o bilhete com Desfazer também ficaria por baixo dela
    this.noteDone.set(r.id, done, { quiet: stay || backTo || this.aoLado() });
    if (stay) {
      this.review.set(this.store.get(r.id) ?? r);
      this.stampedNow.set(done);
    } else if (backTo) this.back();
    else this.leave();
  }
  /** Acabou de finalizar com a leitura aberta: o carimbo bate. */
  protected readonly stampedNow = signal(false);
  private readonly view = inject(WallView);
  /**
   * As anotações por onde se chegou até aqui, pelos links (a última é a de "Voltar"). Abrir a
   * leitura de novo começa do zero.
   */
  protected readonly trail = signal<readonly TrailStop[]>([]);
  /**
   * Para onde o "Voltar" leva: a última do caminho, como ela está agora. A sua que foi apagada no
   * caminho (em outro aparelho, por quem divide a compartilhada) fica de fora: voltar para ela abriria
   * uma anotação que não existe mais; sem nenhuma, não há "Voltar". (A de outra pessoa, colada numa sua,
   * volta como foi vista.)
   */
  private readonly backAt = computed(() => {
    const t = this.trail();
    let i = t.length - 1;
    while (i >= 0 && t[i].own && !this.store.get(t[i].review.id)) i--;
    return i;
  });
  protected readonly backTo = computed<Review | null>(() => {
    const stop = this.trail()[this.backAt()];
    if (!stop) return null;
    return stop.own ? (this.store.get(stop.review.id) ?? null) : stop.review;
  });
  /** Uma parada do caminho dos links: é sua se está no seu mural (no da leitura aberta para `owner`). */
  private stop(review: Review, owner = this.owner()): TrailStop {
    return { review, own: owner === null && !!this.store.get(review.id) };
  }

  /** As anotações que os links do texto podem abrir: as suas, ou as que a pessoa publicou. */
  private readonly linkable = computed(() => notesOf(this.owner() === null ? this.store.reviews() : this.pool()));

  /** Os links da ficha aberta (anotação ou resenha) para anotações: abrem aqui mesmo; no seu mural, o que não existe se cria. */
  protected readonly noteLinks = computed<NoteLinks | null>(() => {
    if (!this.review()) return null;
    const notes = this.linkable();
    const mine = this.owner() === null;
    return {
      resolve: (title) => resolveNote(notes, title),
      open: (n) => this.follow(n),
      // a ficha colada no texto (o widget Nota), de qualquer mural: abre aqui mesmo, com o "Voltar"
      openCard: (card) => this.followCard(card),
      // a anotação aberta é de onde o link veio: depois de criar a nova, a leitura volta para ela
      ...(mine ? { create: (title: string) => this.whenFree(() => this.createNote.emit({ title, from: this.review()!.id })) } : {}),
      // o link de lembrete (só no seu mural: o Calendário é seu): a leitura fecha e o dia dele abre
      ...(mine ? { reminder: (id: string) => this.reminderLinks.info(id), openReminder: (id: string) => this.openReminder(id) } : {}),
    };
  });

  /**
   * Abre a ficha colada no texto (o widget Nota), de qualquer mural, com o "Voltar". No mural de outra
   * pessoa, a obra que você ainda não resenhou abre com a nota escondida, como no mural dela.
   */
  private followCard(card: Review): void {
    if (this.owner() !== null) {
      const secret = this.shield.hiddenIn([card]).has(card.id);
      this.forceMask.set(secret);
      this.revealed.set(false);
    }
    this.follow(card);
  }
  private readonly shield = inject(SpoilerShield);

  /** Segue um link: a anotação de agora vira o "Voltar". */
  private follow(n: Review): void {
    const r = this.review();
    if (!r || n.id === r.id) return;
    this.trail.update((t) => [...t, this.stop(r)]);
    this.show(n);
  }

  /** Volta pelo caminho dos links, para a anotação como ela está agora. */
  protected back(): void {
    const prev = this.backTo();
    if (!prev) return;
    // (as apagadas depois dela saem do caminho junto)
    this.trail.set(this.trail().slice(0, this.backAt()));
    this.show(prev);
  }

  /** Troca a anotação da leitura, do alto, com o foco no título (ou no "Voltar"). */
  private show(n: Review): void {
    this.review.set(n);
    this.stampedNow.set(false);
    // a conferida mais seguido passa para a que abriu (a de antes, fora da tela, volta ao normal)
    this.watchShared(this.owner() === null ? n.id : null);
    const dialog = this.dialog().nativeElement;
    dialog.scrollTop = 0;
    // o foco no título: o leitor de tela anuncia a anotação que abriu
    setTimeout(() => dialog.querySelector<HTMLElement>(`#leitura-titulo${this.sufixo()}`)?.focus());
  }

  protected readonly pin = computed(() => pinningFor(this.review()?.id ?? 'x', this.review()?.stock));
  /** A faixa do cabeçalho é a cartolina da ficha, no papel dela. */
  protected readonly headPaper = computed(() => paperVars(this.review()?.paper, this.review()?.pattern, lookOf(this.review() ?? {}), this.review()?.patternSeed, isDarkStock(this.pin().stock), this.review()?.id));
  protected readonly date = computed(() => {
    const r = this.review();
    return formatReviewDateLong(r?.completedAt ?? null);
  });

  /** As fichas de um colega, para andar entre as vezes de uma obra no mural dele. */
  protected readonly pool = signal<readonly Review[]>([]);
  /** Todas as vezes da obra aberta: a original e as rejogadas, na ordem. */
  protected readonly times = computed(() => {
    const r = this.review();
    if (!r) return [];
    return timesOf(this.owner() === null ? this.store.reviews() : this.pool(), r);
  });
  protected readonly at = computed(() => Math.max(0, this.times().findIndex((x) => x.id === this.review()?.id)));

  /** "Original", "Rejogada" ou, com mais de uma, "Rejogada 2". */
  protected timeLabel(i: number): string {
    const list = this.times();
    const x = list[i];
    if (!x) return '';
    if (!x.revisitOf) return 'Original';
    const word = cap(this.profile().revisit.one);
    const revisits = list.filter((y) => y.revisitOf);
    return revisits.length > 1 ? `${word} ${revisits.indexOf(x) + 1}` : word;
  }

  protected readonly prevLabel = computed(() => this.stepLabel(this.at() - 1));
  protected readonly nextLabel = computed(() => this.stepLabel(this.at() + 1));

  private stepLabel(i: number): string {
    const x = this.times()[i];
    if (!x) return '';
    return x.completedAt ? `${this.timeLabel(i)}, ${formatReviewDate(x.completedAt)}` : this.timeLabel(i);
  }

  /** Vira a página: a vez anterior ou a seguinte da mesma obra. */
  protected go(step: number): void {
    const next = this.times()[this.at() + step];
    if (!next) return;
    this.review.set(next);
    const dialog = this.dialog().nativeElement;
    dialog.scrollTop = 0;
    // a seta da ponta some de uso: o foco fica na outra, para seguir virando pelo teclado
    setTimeout(() => {
      const arrows = dialog.querySelectorAll<HTMLButtonElement>(':scope > .par .vez-seta');
      if (document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled) arrows[step < 0 ? 1 : 0]?.focus();
    });
  }

  /** As setas do teclado viram a página, fora de um campo de texto. */
  protected onKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    // com a fita da voz à mostra (nesta ficha ou na do lado), as setas andam as frases dela (ui/voz-fita.ts)
    if (this.voz.owner() !== null && !this.voz.saysTitle()) return;
    // as teclas de dentro da segunda anotação são dela (ela as ouve no diálogo dela)
    if (!this.aoLado() && (e.target as HTMLElement | null)?.closest?.('dialog.ao-lado')) return;
    // as da folhinha da nota nova (o texto dela, no Visual) são dela
    if ((e.target as HTMLElement | null)?.closest?.('app-quick-note-sheet')) return;
    // só na leitura de sempre, onde a tira das vezes mostra qual é a de agora
    if (!this.lendo()) return;
    if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
    if (this.times().length < 2) return;
    e.preventDefault();
    this.go(e.key === 'ArrowLeft' ? -1 : 1);
  }

  // ===== Os jeitos de ver: a leitura e só a cartolina =====
  /** O jeito de agora (ver ReaderView). Abrir outra ficha (ou a mesma de novo) volta à leitura. */
  protected readonly vista = signal<ReaderView>('leitura');
  /** A leitura de sempre, com tudo: a data, as notas, as reações, os comentários e o pé. */
  protected readonly lendo = computed(() => this.vista() === 'leitura');
  /** Só a cartolina: o zoom da ficha do mural, medido para ela caber inteira na tela (ver fitCard). */
  protected readonly cardZoom = signal(1);
  /** O desenho e a cor dos grupos na ficha do mural: os seus, nas suas; nas dos outros, os de sempre. */
  protected readonly cardLooks = computed(() => (this.owner() === null ? this.settings.categoryLooks() : {}));
  /** Onde se lia, guardado ao ir para só a cartolina (a folha escondida), para voltar ao mesmo lugar. */
  private place: ReadingPlace | null = null;

  /**
   * Troca o jeito de ver. Da leitura para a cartolina e de volta, o trecho que estava no alto da folha
   * continua no alto (a folha muda de largura e o texto quebra em outras linhas); a cartolina guarda o
   * lugar e o devolve na volta. O foco fica no botão que foi tocado ou no que faz o caminho de volta.
   */
  protected setView(next: ReaderView, given?: ReadingPlace | null): void {
    const now = this.vista();
    if (next === now || !this.review()) return;
    // (com duas abertas, cada uma muda de jeito no lado dela, e a outra fica: PLANO-LADO-A-LADO.md, D1)
    if (now !== 'cartolina') this.place = given !== undefined ? given : this.readingPlace();
    // os remendos do trecho ficariam no lugar de antes (o texto quebra em outras linhas)
    this.picked.set(null);
    // a folha de comentários e o "Citar" são da leitura de sempre
    if (next !== 'leitura') {
      this.commentsOpen.set(false);
      this.detailsOpen.set(false);
      this.picked.set(null);
      this.quote.set(null);
    }
    this.vista.set(next);
    const place = this.place;
    afterNextRender(
      () => {
        const dialog = this.dialog().nativeElement;
        if (next === 'cartolina') this.fitCardNow();
        else this.restorePlace(place);
        // o foco: na cartolina, o "Voltar à leitura"; dela de volta, o botão que leva a ela de novo
        const target = next === 'cartolina' ? '.na-parede .ver-cartolina' : now === 'cartolina' ? '.faixa-nome .ver-cartolina' : null;
        if (target) dialog.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
      },
      { injector: this.injector },
    );
  }

  /** A folha que rola, à mostra (na cartolina ela está escondida). */
  private sheetBody(): HTMLElement | null {
    const body = this.dialog().nativeElement.querySelector<HTMLElement>('.par > article > .body');
    return body && body.clientHeight > 0 ? body : null;
  }

  /** A escala da folha na tela (uma entrada que cresce de 0,97): as medidas voltam ao layout. */
  private sheetScale(body: HTMLElement): number {
    return body.getBoundingClientRect().height / body.offsetHeight || 1;
  }

  /**
   * O trecho do texto no alto da folha (ou null: a folha está no começo). É a linha mais de dentro que
   * está ali (o item de uma lista, não a lista inteira com os de dentro). Se ela começa acima do alto
   * (um parágrafo comprido, quebrado em muitas linhas), guarda quanto dela já passou, em proporção:
   * na outra largura, ela quebra em outras linhas.
   */
  private readingPlace(): ReadingPlace | null {
    const body = this.sheetBody();
    if (!body || body.scrollTop < 2) return null;
    const top = body.getBoundingClientRect().top;
    const scale = this.sheetScale(body);
    const first = (lines: readonly HTMLElement[]): HTMLElement | null => lines.find((b) => b.getBoundingClientRect().bottom > top + 1) ?? null;
    const all = [...(body.querySelector('.text') ?? body).querySelectorAll<HTMLElement>(LINES)];
    let block = first(all);
    // desce para a linha de dentro que está no alto, enquanto houver
    const inside = (b: HTMLElement) => first([...b.querySelectorAll<HTMLElement>(LINES)]);
    for (let inner = block && inside(block); inner; inner = inside(inner)) block = inner;
    if (!block) return { block: null, index: -1, offset: 0, passed: 0, scrollTop: body.scrollTop };
    const box = block.getBoundingClientRect();
    const passed = box.top < top && box.height > 0 ? (top - box.top) / box.height : 0;
    const index = all.indexOf(block);
    return { block, index, offset: passed ? 0 : (box.top - top) / scale, passed, scrollTop: body.scrollTop };
  }

  /**
   * Põe a folha de volta no trecho guardado: à mesma distância do alto ou, se ele já tinha começado acima
   * do alto, na mesma proporção, arredondada para linhas inteiras (na outra largura, a proporção cairia no
   * meio de uma linha, e a primeira ficaria cortada).
   */
  private restorePlace(place: ReadingPlace | null): void {
    const body = this.sheetBody();
    if (!body) return;
    if (!place) {
      body.scrollTop = 0;
      return;
    }
    // a linha guardada é de outra folha (a segunda anotação que ficou sozinha): a mesma linha, achada nesta
    const block = place.block?.isConnected
      ? place.block
      : place.index >= 0
        ? ([...(body.querySelector('.text') ?? body).querySelectorAll<HTMLElement>(LINES)][place.index] ?? null)
        : null;
    if (!block) {
      body.scrollTop = place.scrollTop;
      return;
    }
    const scale = this.sheetScale(body);
    const box = block.getBoundingClientRect();
    const at = (box.top - body.getBoundingClientRect().top) / scale;
    const line = parseFloat(getComputedStyle(block).lineHeight);
    const lines = place.passed * (box.height / scale);
    const passed = line > 0 ? Math.round(lines / line) * line : lines;
    body.scrollTop += at + passed - place.offset;
  }

  /**
   * Só a cartolina: a ficha do mural do maior tamanho que cabe inteira na tela (até 1,8 vez a da
   * parede), medida de novo quando a tela muda ou a ficha muda de altura (a foto que chega).
   */
  private readonly fitCard = effect((onCleanup) => {
    if (this.vista() !== 'cartolina' || !this.review()) return;
    // com a outra chegando ou saindo, o lugar muda (o lado, ou a tela inteira): mede de novo
    this.split();
    const dialog = this.dialog().nativeElement;
    let frame = 0;
    const fit = () => {
      cancelAnimationFrame(frame);
      frame = requestAnimationFrame(() => this.fitCardNow());
    };
    const watcher = new ResizeObserver(fit);
    // a ficha só existe depois do desenho
    const timer = setTimeout(() => {
      const card = dialog.querySelector(':scope > .na-parede .cartolina-grande app-review-card');
      if (card) watcher.observe(card);
      fit();
    });
    addEventListener('resize', fit);
    onCleanup(() => {
      clearTimeout(timer);
      cancelAnimationFrame(frame);
      watcher.disconnect();
      removeEventListener('resize', fit);
    });
  });

  /** Mede a ficha do mural e põe o zoom que a faz caber inteira na tela (ver cardZoomFor). */
  private fitCardNow(): void {
    const dialog = this.dialog().nativeElement;
    const box = dialog.querySelector<HTMLElement>(':scope > .na-parede .cartolina-grande');
    const bar = dialog.querySelector<HTMLElement>(':scope > .na-parede .vistas-giz');
    if (!box) return;
    // a medida da ficha na parede: a da caixa sem o zoom dela e sem a escala da entrada (o offset* é
    // o do layout, antes de um e de outra)
    const zoom = untracked(this.cardZoom);
    // com duas abertas, o lugar é o do lado dela (PLANO-LADO-A-LADO.md, D1); sozinha, a tela
    const wall = this.split() ? dialog.querySelector<HTMLElement>(':scope > .na-parede') : null;
    // (no celular, a folga leva em conta o giro da ficha, que põe um canto para fora)
    const gutter = wall ? 16 : innerWidth < 600 ? 20 : 32;
    const roomW = (wall?.clientWidth ?? document.documentElement.clientWidth) - 2 * gutter;
    const roomH = (wall?.clientHeight ?? innerHeight) - (bar?.offsetHeight ?? 44) - 2 * gutter - 16;
    const next = cardZoomFor(box.offsetWidth, box.offsetHeight, roomW, roomH);
    if (Math.abs(next - zoom) >= 0.01) this.cardZoom.set(next);
  }

  /**
   * Abre a ficha. A de um colega (`owner`) pode vir com as outras fichas dele (`pool`), para andar
   * entre as vezes; `masked` esconde notas, bônus e texto, como no modo sem spoilers, e `revealed` é
   * a ficha em segredo que já foi revelada (abre à mostra, com "Esconder a nota").
   */
  open(
    review: Review,
    owner: string | null = null,
    pool: readonly Review[] = [],
    masked = false,
    code: string | null = null,
    from: Review | null = null,
    revealed = false,
    solta: 'conta' | 'visita' | null = null,
  ): void {
    this.solta.set(solta);
    // abrir de novo (a mesma, ou outra) é com uma só, e lendo
    this.segunda.set(null);
    this.editingHere.set(false);
    this.dictionary.set(false);
    this.sideFirst.set(false);
    // toda ficha abre na leitura de sempre
    this.vista.set('leitura');
    this.place = null;
    this.cardZoom.set(1);
    // pediram a ficha já com os comentários (o remendo da ficha, o "Comentar" do Feed)
    const withComments = this.comments.take(review.id);
    // tocou num link na ficha do mural: a anotação de onde veio é o "Voltar"
    this.trail.set(from ? [this.stop(from, owner)] : []);
    this.ownerCode.set(owner === null ? null : code);
    if (code && owner !== null) {
      void this.reactions.load(code);
      void this.comments.loadCounts(code);
    }
    // a compartilhada: as reações e os comentários são os da ficha do dono
    const dono = owner === null ? this.shared.get(review.id)?.dono.codigo : review.sharedBy?.codigo;
    if (dono && dono !== code) {
      void this.reactions.load(dono);
      void this.comments.loadCounts(dono);
    }
    this.forceMask.set(masked);
    this.revealed.set(masked && revealed);
    this.owner.set(owner);
    this.pool.set(pool);
    this.review.set(review);
    this.stampedNow.set(false);
    this.commentsOpen.set(withComments && this.commentTarget() !== null);
    this.spoilersOk.set(false);
    this.quote.set(null);
    this.picked.set(null);
    // a seleção de texto (para o "Citar") só é ouvida com a leitura aberta, e sem passar pelo Angular:
    // ela muda a cada tecla em qualquer campo do site
    document.removeEventListener('selectionchange', this.onSelectionChange);
    document.addEventListener('selectionchange', this.onSelectionChange);
    // as fichas montadas fora da tela dormem: o navegador recalcula a página inteira quando um diálogo abre
    napWall();
    const el = this.dialog().nativeElement;
    if (!this.aoLado()) el.showModal();
    else {
      // ao lado: no fluxo do diálogo de fora (que é o modal), com o foco no nome dela
      if (!el.open) el.show();
      afterNextRender(() => el.querySelector<HTMLElement>('#leitura-titulo-2')?.focus({ preventScroll: true }), { injector: this.injector });
    }
    this.watchShared(owner === null ? review.id : null);
    // uma compartilhada com conflito: a pergunta abre já (para quem escreve nela)
    if (this.conflictHere()) setTimeout(() => this.conflictOpen.set(true), 120);
  }

  /**
   * Abre `review` ao lado da anotação aberta (PLANO-DUAS-NOTAS.md): a segunda leitura, com o mesmo dono, as
   * mesmas fichas para os links e o mesmo código (na visita, as da pessoa). Só na leitura de sempre.
   */
  openBeside(review: Review): void {
    const a = this.review();
    if (this.aoLado() || !a || review.id === a.id || this.vista() !== 'leitura' || this.solta()) return;
    // a folha ao lado e o "Citar" são da anotação sozinha
    this.commentsOpen.set(false);
    this.detailsOpen.set(false);
    this.picked.set(null);
    this.quote.set(null);
    const owner = this.owner();
    const pool = this.pool();
    const code = this.ownerCode();
    // a análise de outra pessoa sobre o que você ainda não avaliou abre em segredo, como no mural dela
    const masked = owner !== null && this.shield.hiddenIn([review]).has(review.id);
    this.sideFirst.set(false);
    this.segunda.set(review);
    afterNextRender(() => this.ladoB()?.open(review, owner, pool, masked, code), { injector: this.injector });
  }

  /** Só a segunda sai (ela pediu, ou a tela estreitou): a primeira fica, com o foco nela. */
  protected closeBeside(): void {
    if (!this.segunda()) return;
    this.segunda.set(null);
    // sozinha (a primeira saiu da frente dela): sem ela, a leitura fecha
    if (!this.review()) return this.close();
    afterNextRender(() => this.focusName(), { injector: this.injector });
  }

  /** O foco no nome da anotação (na cartolina, no "Voltar à leitura"), sem rolar a folha. */
  private focusName(): void {
    const dialog = this.dialog().nativeElement;
    const target = this.vista() === 'cartolina' ? ':scope > .na-parede .ver-cartolina' : `#leitura-titulo${this.sufixo()}`;
    dialog.querySelector<HTMLElement>(target)?.focus({ preventScroll: true });
  }

  /**
   * O X desta anotação (PLANO-LADO-A-LADO.md, D2): sozinha, fecha a leitura; com duas, fecha só esta. A segunda sai
   * (`left`); a primeira dá o lugar à segunda, que fica sozinha como estava (o jeito, o trecho, a folha aberta).
   */
  protected closeOwn(): void {
    if (this.aoLado()) return this.leave();
    if (!this.segunda()) return this.close();
    // a segunda está editando, ou é o dicionário: ela fica, e esta sai da frente (D8, D5)
    if (this.ladoB()?.editingHere() || this.segunda() === 'dicionario') return this.stepAside();
    const other = this.ladoB()?.handOver();
    // (a segunda ainda nem se desenhou: ela só sai, e esta fica)
    if (other) this.takeOver(other);
    else this.closeBeside();
  }

  /** (Ao lado) Como esta anotação está, para ficar sozinha no lugar da primeira (ver `closeOwn`). */
  handOver(): Handover | null {
    const r = this.review();
    if (!r) return null;
    this.fita()?.stop();
    const cartolina = this.vista() === 'cartolina';
    return {
      review: r,
      trail: this.trail(),
      view: this.vista(),
      place: cartolina ? this.place : this.readingPlace(),
      comments: this.commentsOpen(),
      quote: this.quote()?.text ?? null,
      details: this.detailsOpen(),
      masked: this.forceMask(),
      revealed: this.revealed(),
    };
  }

  /** Esta anotação sai da leitura sem fechar a outra (a segunda: o X dela, finalizada), ou fecha a leitura (a primeira). */
  protected leave(): void {
    if (this.aoLado()) this.left.emit();
    else this.close();
  }

  /**
   * A primeira fechou com a segunda aberta: a segunda fica sozinha, aqui, no lugar dela (PLANO-LADO-A-LADO.md, D2), no
   * jeito e no trecho em que estava, com a folha que estava aberta.
   */
  private takeOver(p: Handover): void {
    this.fita()?.stop();
    this.segunda.set(null);
    this.trail.set(p.trail);
    this.forceMask.set(p.masked);
    this.revealed.set(p.revealed);
    this.review.set(p.review);
    this.stampedNow.set(false);
    this.watchShared(this.owner() === null ? p.review.id : null);
    this.picked.set(null);
    this.quickNote.set(null);
    // começa da leitura (a primeira podia estar na cartolina) e vai para o jeito em que a segunda estava
    this.vista.set('leitura');
    this.place = null;
    if (p.view !== 'leitura') {
      this.setView(p.view, p.place);
      return;
    }
    // as folhas são as da segunda (com a mesma anotação nas duas, as desta não se desligariam sozinhas)
    this.commentsOpen.set(false);
    this.detailsOpen.set(false);
    this.quote.set(null);
    afterNextRender(
      () => {
        this.restorePlace(p.place);
        if (!p.comments && !p.details) this.focusName();
      },
      { injector: this.injector },
    );
    if (p.comments) {
      this.toggleComments(true);
      if (p.quote) this.quote.set({ text: p.quote, n: ++this.quoteCount });
    } else if (p.details) this.toggleDetails(true);
  }

  /** A tela estreitou para não caberem duas: a segunda fecha (PLANO-DUAS-NOTAS.md, D6). */
  private readonly narrowCloses = effect((onCleanup) => {
    if (!this.segunda() || typeof matchMedia === 'undefined') return;
    const mq = matchMedia(BESIDE_MEDIA);
    // (o lado que está editando não fecha: D8)
    const check = () => {
      if (mq.matches || !this.review()) return;
      const sideEdits = !!this.ladoB()?.editingHere();
      if (sideEdits && !this.editingHere()) this.stepAside();
      else if (!sideEdits) this.closeBeside();
    };
    mq.addEventListener('change', check);
    onCleanup(() => mq.removeEventListener('change', check));
  });

  close(): void {
    // da segunda, o caminho para fora da leitura fecha as duas (o X dela fecha só ela: `leave`, PLANO-DUAS-NOTAS.md, D5)
    if (this.aoLado()) return this.closeAll.emit();
    const el = this.dialog().nativeElement;
    if (!el.open) return;
    // um editor ao lado com coisa por salvar pergunta antes (D8)
    if (!this.leaving && this.openEditors().length) {
      this.whenFree(() => {
        this.leaving = true;
        try {
          this.close();
        } finally {
          this.leaving = false;
        }
      });
      return;
    }
    this.closing = true;
    el.close();
  }
  /** Já perguntou aos editores ao lado: fecha de vez. */
  private leaving = false;
  /** Quem fechou foi o site (`close`), não o Esc nem o voltar: a ficha aberta pelo link pode sair. */
  private closing = false;

  /**
   * A ficha aberta pelo link (ver pages/ficha-page.ts): ela é a página inteira, sem fechar. `signedIn`:
   * quem abriu tem conta, e vê as reações e os comentários; sem, só a ficha. As outras fichas do dono
   * (`pool`) servem aos links e às notas coladas no texto.
   */
  openLoose(review: Review, owner: string, pool: readonly Review[], code: string, signedIn: boolean): void {
    this.open(review, owner, pool, false, code, null, false, signedIn ? 'conta' : 'visita');
    // sem o X, o foco começaria num link do texto (ou na assinatura): começa pelo nome da ficha
    afterNextRender(() => this.dialog().nativeElement.querySelector<HTMLElement>('#leitura-titulo')?.focus({ preventScroll: true }), { injector: this.injector });
  }

  /** A ficha aberta pelo link vira a ficha do mural (ver pages/ficha-page.ts), que abre de novo num toque. */
  protected minimize(): void {
    this.fichaLinks.minimized.set(true);
    this.close();
  }

  /** O Esc não fecha a ficha aberta pelo link (só as folhas e os menus de cima dela). */
  protected onCancel(e: Event): void {
    // com um editor ao lado, o Esc fecha a leitura só depois de perguntar (D8)
    if (!this.solta() && this.openEditors().length) {
      e.preventDefault();
      this.close();
      return;
    }
    if (!this.solta()) return;
    e.preventDefault();
    // a que não fecha: o Esc sai de só a cartolina, de volta à leitura
    this.setView('leitura');
  }

}
