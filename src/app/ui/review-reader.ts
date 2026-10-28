import { Router } from '@angular/router';
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
  inject,
  linkedSignal,
  untracked,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BackdropClose } from './backdrop-close';
import { LucideIconData } from 'lucide-angular';
import { ICON, ICON_CHOICE, IconModule } from './icons';
import { cap, g, profileOf } from '../core/kinds';
import { BONUS_KIND_LABEL, MUSIC_FORM_LABEL, NO_DAY_LABEL, Review, SCORE_LABEL, VERDICT_LABEL, ratedKeys, scoreOf, weightOf, isMusicReview, isNote, musicFormOf, computeBase, computeFinal, dayLabel, formatAmount, formatReviewDate, formatReviewDateLong, formatScore, isDarkStock, isPrivate, sortBonuses, timesOf } from '../core/review';
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
import { ReactionBubble, ReactionPicker } from './reactions';
import { ReactionTarget, Reactions } from '../core/reactions';
import { checkCount, plainText, toggleCheck } from '../core/rich-text';
import { SpoilerShield } from '../core/spoiler-shield';
import { NoteLinks, notesOf, resolveNote } from '../core/note-links';
import { KanbanDeps } from '../core/kanban-deps';
import { KanbanStore } from '../core/kanban-store';
import { IMPORTANCE_LABEL } from '../core/kanban';
import { CalendarStore } from '../core/calendar-store';
import { nearDayLabel, remindersOfNote, timeLabel } from '../core/calendar';
import { KanbanDepsBadge } from './kanban-deps';
import { IMPORTANCE_LEVEL } from './kanban-icons';
import { NoteDone } from '../core/note-done';
import { NotePin } from '../core/note-pin';
import { napWall } from '../core/wall-settle';
import { WallView } from '../core/wall-view';
import { DoneStamp } from './done-stamp';
import { NoteTag } from './note-tag';
import { CategoryLabel } from './category-label';
import { categoryColorHex, tagColorHex } from '../core/category-looks';
import { CloudAccount } from '../core/cloud-account';
import { CommentTarget, Comments, QuoteRequest, spokenComments } from '../core/comments';
// só usada dentro do @defer do molde, e num import só dela: assim a folha (com o editor) chega num pedaço à parte
import { CommentsPanel } from './comments-panel';
// as folhas das anotações compartilhadas, também em pedaços à parte (cada uma num import só dela)
import { ShareSheet } from './share-sheet';
import { ConflictSheet } from './conflict-sheet';
import { LinkSheet } from './link-sheet';
import { FichaLinks } from '../core/ficha-link';
import { OrganizeSheet } from './organize-sheet';
import { SharedStore } from '../core/shared-store';
import { SyncConflicts } from '../core/sync-conflicts';
import { ROLE_LABEL, canManage, canWrite } from '../core/shared-notes';


/** O vão entre o trecho selecionado e o remendo "Citar" (e entre o remendo e o rodapé). */
const PATCH_GAP = 8;

@Component({
  selector: 'app-review-reader',
  imports: [BackdropClose, CategoryLabel, CommentsPanel, ConflictSheet, LinkSheet, ShareSheet, OrganizeSheet, IconModule, KanbanDepsBadge, MoreMenu, Rabisco, Boletim, BonusSticker, CoverSleeve, RecordCover, DoneStamp, NoteTag, JudgeLabel, Luz, Pin, ReactionBubble, ReactionPicker, RichText, Skulls, StatusLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet reader" [class.com-lado]="commentsOpen()" [class.solta]="!!solta()" aria-labelledby="leitura-titulo" (backdropClose)="solta() || close()" (cancel)="onCancel($event)" (keydown)="onKey($event)" (close)="onClosed()">
      @if (review(); as r) {
        <!-- a ficha e, puxada de baixo dela pela orelha, a folha de comentários -->
        <div class="par" [class.com-grupo]="!!groupEar()">
        <article class="ficha cartolina" [style.--stock]="'var(--stock-' + pin().stock + ')'" [attr.data-cor]="pin().stock">
          <app-pin class="pin" [color]="pin().pinColor" />
          <!-- a faixa da cartolina é a orelha da ficha de fichário: o nome vai escrito nela, a pincel, e
               o resto da folha fica para o que se lê -->
          <header class="head faixa-nome" [class.feita]="note() && !!r.doneAt" [class.com-volta]="!!trail().length" [style]="headPaper()">
            <!-- veio por um link de outra anotação: o caminho de volta, na ponta da faixa -->
            @if (trail().at(-1); as from) {
              <button type="button" class="icon-btn voltar-elo" (click)="back()" [attr.aria-label]="'Voltar para “' + from.game.name + '”'" [title]="'Voltar para “' + from.game.name + '”'">
                <lucide-icon [img]="BackIcon" [size]="22" aria-hidden="true" />
              </button>
            }
            <h2 id="leitura-titulo" class="title" [class.longo]="r.game.name.length > 44" tabindex="-1">{{ r.game.name }}</h2>
            <!-- finalizada: o carimbo redondo batido na emenda da faixa com a folha -->
            @if (note() && r.doneAt) {
              <span class="carimbo"><app-done-stamp size="big" [at]="r.doneAt" [hit]="stampedNow()" /></span>
            }
            <!-- a ficha aberta pelo link é a página inteira: não há para onde fechar, só minimizar (ela
                 vira a ficha pregada no mural, como fica na parede de quem escreveu) -->
            @if (solta()) {
              <button type="button" class="icon-btn fecha" (click)="minimize()" aria-label="Minimizar: ver como fica no mural" title="Ver como fica no mural">
                <lucide-icon [img]="MinimizeIcon" [size]="22" aria-hidden="true" />
              </button>
            } @else {
              <button type="button" class="icon-btn fecha" (click)="close()" aria-label="Fechar">
                <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
              </button>
            }
          </header>

          <div class="body" appLuz (scroll)="watchSelection()">
            <!-- duas versões brigando (de duas pessoas numa compartilhada, ou de dois aparelhos seus): escolher uma -->
            @if (conflictHere()) {
              <div class="aviso-conflito" role="status">
                <lucide-icon class="aviso-icone" [img]="ConflictIcon" [size]="22" aria-hidden="true" />
                <p class="aviso-texto"><strong>Conflito de sincronização.</strong> {{ conflictLine() }}</p>
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
            <div class="top" [class.nota]="note()" [class.sem-capa]="note() && !r.game.coverUrl" [class.com-carimbo]="note() && !!r.doneAt">
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
                  <!-- o assunto da anotação (o grupo é a orelha da ficha), primeiro -->
                  @if (note() && r.subject; as s) {
                    <span class="assunto"><lucide-icon class="quem-ve-icone" [img]="SubjectIcon" [size]="15" aria-hidden="true" /><span class="sr-only">Assunto: </span>{{ s }}</span><span aria-hidden="true"> · </span>
                  }
                  <!-- o lugar da anotação no mural vem antes da data, com ou sem data -->
                  @if (note() && r.noteRank === 'fixada') {
                    Fixada<span aria-hidden="true"> · </span>
                  }
                  @if (r.completedAt === null) {
                    {{ noDay }}
                  } @else if (note()) {
                    {{ date() }}
                  } @else {
                    {{ dayLabel(r.kind, r.status) }} {{ date() }}
                  }
                  @if (!masked() && hours(); as h) {
                    <span aria-hidden="true"> · </span>{{ h }}
                  }
                  <!-- as tarefas: quantas já foram feitas, como na ficha do mural -->
                  @if (tasks(); as t) {
                    <span class="tarefas-conta" [class.todas]="t.done === t.total"><span aria-hidden="true"> · </span><lucide-icon class="quem-ve-icone" [img]="TasksIcon" [size]="15" aria-hidden="true" />{{ t.done }}/{{ t.total }}<span class="sr-only"> tarefas feitas</span></span>
                  }
                  @if (sharedHere(); as s) {
                    <!-- compartilhada: com quem (ou de quem) e o seu papel; o nome abre a folha das pessoas -->
                    <span aria-hidden="true"> · </span>
                    <span class="compartilhada">
                      <lucide-icon class="quem-ve-icone" [img]="SharedIcon" [size]="15" aria-hidden="true" />
                      <button type="button" class="parte-de" aria-haspopup="dialog" [title]="s.manages ? 'Pessoas na anotação' : 'Quem está na anotação'" (click)="openShare()">{{ s.line }}</button>
                    </span>
                  }
                </p>
                @if (r.game.year && !note()) {
                  <p class="meta year">{{ profile().released }} {{ r.game.year }}</p>
                }
              </div>

              @if (note()) {
                <!-- as tags da anotação, no lugar da nota (o grupo é a orelha da ficha) -->
                @if (r.tags?.length) {
                  <ul class="judgement categorias" aria-label="Tags">
                    @for (t of r.tags ?? []; track t; let i = $index) {
                      <li><app-note-tag [label]="t" [index]="i + 1" [color]="tagColor(t)" /></li>
                    }
                  </ul>
                }
                <!-- onde mais ela está: o lugar no quadro do Kanban e os dias do Calendário em que foi presa -->
                @if (board() || reminders().length) {
                  <div class="lugares" [class.todos]="allRemindersShown()">
                    @if (board(); as b) {
                      <div class="lugar no-quadro" [attr.data-cor]="b.color">
                        <span class="sr-only">No Kanban: </span>
                        <lucide-icon class="lugar-icone" [img]="b.icon ?? CalendarIcon" [size]="16" aria-hidden="true" />
                        <button type="button" class="parte-de" [title]="'Abrir o quadro de ' + r.category + ' no Kanban'" (click)="openBoard(b.id)">{{ b.column }}</button>
                        @if (b.importance; as imp) {
                          <span class="etq imp" [attr.data-imp]="imp">
                            <span class="escala" aria-hidden="true">
                              @for (n of steps; track n) {
                                <i [class.acesa]="n <= importanceLevel[imp]"></i>
                              }
                            </span>
                            <span class="sr-only">Importância: </span>{{ importanceLabel[imp] }}
                          </span>
                        }
                        @if (b.status; as st) {
                          <span class="etq status" [title]="st"><span class="sr-only">Observação: </span>{{ st }}</span>
                        }
                        @if (b.deps; as deps) {
                          <app-kanban-deps class="dependencias" [noteId]="r.id" [owner]="r.game.name" [deps]="deps" (opened)="openDep($event)" (edit)="openBoard(b.id)" />
                        }
                      </div>
                    }
                    @for (x of reminders(); track x.id; let last = $last) {
                      <div class="lugar na-agenda" [class.passou]="x.past" [attr.data-cor]="x.color">
                        <span class="sr-only">No Calendário: </span>
                        <lucide-icon class="lugar-icone" [img]="CalendarIcon" [size]="16" aria-hidden="true" />
                        <button type="button" class="parte-de" [title]="'Abrir ' + x.when + ' no Calendário'" (click)="openDay(x.day)">{{ x.when }}</button>
                        <span class="lembrete">{{ x.title }}</span>
                        <!-- os outros lembretes ficam atrás de um "e mais 2", escrito à mão depois do nome, para a
                             linha não empurrar o texto -->
                        @if (last && moreReminders(); as more) {
                          <button type="button" class="mais-lembretes" [attr.aria-label]="'Mostrar mais ' + (more === 1 ? '1 lembrete' : more + ' lembretes')" (click)="allRemindersShown.set(true)">e mais {{ more }}</button>
                        }
                      </div>
                    }
                  </div>
                }
              } @else {
              <div class="judgement">
                <app-judge-label [value]="r.scores.final" [verdict]="r.verdict" size="big" [masked]="masked()" />
                @if (profile().difficulty && !masked()) {
                  <app-skulls class="skulls" [value]="r.difficulty" [size]="18" />
                }
                @if (!masked() && handAverage(); as avg) {
                  <p class="na-mao">Nota dada na mão · a média daria {{ avg }}</p>
                }
                <!-- a ficha de outra pessoa em segredo: revelada aqui, fica revelada no mural de quem abriu (ver revealedChange) -->
                @if (forceMask()) {
                  <button type="button" class="btn-quiet revelar" [attr.aria-pressed]="revealed()" (click)="toggleReveal()">
                    <lucide-icon [img]="revealed() ? HideIcon : RevealIcon" [size]="18" aria-hidden="true" />
                    {{ revealed() ? 'Esconder a nota' : 'Revelar a nota' }}
                  </button>
                }
              </div>

              <!-- Os bônus: os mesmos adesivos da ficha, todos, com a conta sem eles logo abaixo -->
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
                  @if (!masked()) {
                    <p class="sem">{{ withoutBonus() }}</p>
                  }
                </div>
              }
              }
            </div>

            @if (!note()) {
              <app-boletim [review]="r" size="big" [masked]="masked()" />
            }

            @if (r.text.trim()) {
              @if (masked()) {
                <div class="text"><app-rabisco [text]="text()" /><span class="sr-only">Texto escondido</span></div>
              } @else {
                <!-- com a formatação do editor; as tarefas se marcam aqui mesmo, na sua ficha. As feitas viram
                     uma conta, como no mural, e tocar nela mostra a sequência -->
                <div class="text" data-citavel><app-rich-text [text]="r.text" [fold]="true" [foldKey]="r.id" [checkable]="owner() === null && writable()" [links]="noteLinks()" (toggled)="toggleTask($event)" /></div>
              }
            } @else if (!note()) {
              <!-- a anotação pode ser só o título: sem aviso de texto em branco -->
              <p class="no-text">{{ owner() ? 'Sem texto nessa ficha.' : 'Sem texto nessa ficha. Dá para escrever depois, em Editar.' }}</p>
            }

            <!-- as reações: o balão com quem reagiu e, na ficha de quem você segue, o reagir; e a porta dos comentários -->
            @if (reactTarget(); as t) {
              @if (reactions.canReact(t.code) || reactions.of(t.code, t.ref).length || commentButton()) {
                <div class="reagir-linha">
                  @if (reactions.canReact(t.code)) {
                    <app-reaction-picker [target]="t" />
                  }
                  @if (commentButton()) {
                    <button type="button" class="acao-caneta comentar" [attr.aria-expanded]="commentsOpen()" aria-controls="leitura-comentarios" (click)="toggleComments()">
                      <lucide-icon [img]="CommentIcon" [size]="17" aria-hidden="true" />
                      {{ commentCount() ? commentsLabel() : 'Comentar' }}
                    </button>
                  }
                  <app-reaction-bubble [target]="t" />
                </div>
              }
            }
          </div>

          <footer class="foot">
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
                <button type="button" class="btn-ink" (click)="close()">Fechar</button>
              }
            } @else {
            <!-- o que se faz de vez em quando (fixar, compartilhar, escrever outra vez, lado a lado, apagar)
                 fica guardado no bilhete do "Mais"; no pé, só o que se usa toda hora -->
            <app-more-menu class="mais-menu" [items]="moreItems()" [label]="note() ? 'Mais ações da anotação' : 'Mais ações da ficha'" (picked)="onMore($event)" />
            <div class="actions">
              <!-- o check da anotação inteira: finaliza (e ela sai do mural com o carimbo) ou abre de novo -->
              @if (note() && writable()) {
                <button type="button" class="btn-quiet finalizar" [attr.aria-pressed]="!!r.doneAt" (click)="finish()">
                  <lucide-icon [img]="r.doneAt ? ReopenIcon : CheckedIcon" [size]="19" aria-hidden="true" />
                  {{ r.doneAt ? 'Abrir de novo' : 'Finalizar' }}
                </button>
              }
              @if (writable()) {
                <button type="button" class="btn-ink" (click)="edit.emit(r.id)">
                  <lucide-icon [img]="EditIcon" [size]="20" aria-hidden="true" />
                  Editar
                </button>
              } @else {
                <p class="so-leitura">Você só lê esta anotação</p>
              }
            </div>
            }
          </footer>
        </article>

        <!-- o grupo da anotação: a mesma orelha de divisória da ficha no mural, saindo pela beirada de
             cima, atrás da faixa -->
        @if (groupEar(); as g) {
          <span class="orelha-grupo" [class.orelha-cor]="!!g.color" [style.--cat-cor]="g.color">
            <span class="sr-only">Grupo: </span>
            <app-cat-label [label]="g.label" [look]="g.look" [iconSize]="13" />
          </span>
        }

        <!-- a orelha que puxa a folha de comentários, na beirada da direita -->
        <div class="orelhas">
          @if (commentable() && commentTarget()) {
            <!-- a orelha: um marcador na cor da cartolina, para fora da ficha, que puxa a folha de comentários -->
            <button
              type="button"
              class="orelha cartolina"
              [attr.data-cor]="pin().stock"
              [style]="headPaper()"
              [style.--stock]="'var(--stock-' + pin().stock + ')'"
              [attr.aria-expanded]="commentsOpen()"
              aria-controls="leitura-comentarios"
              [attr.aria-label]="commentCount() ? 'Comentários: ' + commentCount() : 'Comentários'"
              (click)="toggleComments()"
            >
              <lucide-icon [img]="CommentIcon" [size]="20" aria-hidden="true" />
              <span class="orelha-txt" aria-hidden="true">Comentários</span>
              @if (commentCount(); as n) {
                <span class="orelha-n" aria-hidden="true">{{ n }}</span>
              }
            </button>
          }
        </div>

        @if (commentable()) {
          @if (commentTarget(); as ct) {
            @if (commentsOpen()) {
              <aside id="leitura-comentarios" class="ficha cartolina lado" tabindex="-1" [style.--stock]="'var(--stock-' + pin().stock + ')'" [attr.data-cor]="pin().stock" aria-labelledby="comentarios-titulo">
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

        <!-- selecionou um trecho do texto: o remendo "Citar" aparece no fim da seleção -->
        @if (picked(); as p) {
          <button type="button" class="citar" [style.left.px]="p.left" [style.top.px]="p.top" (pointerdown)="$event.preventDefault()" (click)="quoteSelection()">
            <lucide-icon [img]="QuoteIcon" [size]="17" aria-hidden="true" />
            Citar
          </button>
        }
        </div>

        <!-- a ficha aberta pelo link: a assinatura do site, a giz na parede, embaixo dela -->
        @if (solta()) {
          <a class="assinatura" href="./">feito no <span class="assinatura-nome">Murall</span></a>
        }

        <!-- o link da ficha, num pedaço à parte, só quando abre -->
        @if (linkOpen()) {
          @defer (on immediate) {
            <app-link-sheet [review]="r" [code]="linkCode()" (closed)="linkOpen.set(false)" (left)="close()" />
          }
        }

        <!-- as folhas das compartilhadas: cada uma num pedaço à parte, só quando abre -->
        @if (shareOpen()) {
          @defer (on immediate) {
            <app-share-sheet [noteId]="r.id" (closed)="closeShare()" (left)="close()" />
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
      }
    </dialog>
  `,
  styleUrl: './review-reader.scss',
})
export class ReviewReader {
  readonly edit = output<string>();
  readonly remove = output<string>();
  /** Pediu para escrever mais uma vez da obra (rejogada, releitura, reassistida). */
  readonly revisit = output<string>();
  /** Tocou num link para uma anotação que não existe: criar uma com esse título. */
  readonly createNote = output<{ title: string; from: string }>();
  /** "Revelar a nota" (ou "Esconder a nota") na ficha em segredo: as vezes da obra, para o mural de quem abriu seguir. */
  readonly revealedChange = output<{ ids: string[]; revealed: boolean }>();

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
  protected readonly MinimizeIcon = ICON.diminuir;
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
  /** Quem abriu escreve nela (a sua, ou a compartilhada em que você é dono, gestor ou editor). */
  protected readonly writable = computed(() => {
    const e = this.sharedEntry();
    return !e || canWrite(e.papel);
  });
  /** O pedaço da linha da data: com quem está (ou de quem é, e o seu papel) e quem visita vê. */
  protected readonly sharedHere = computed(() => {
    const e = this.sharedEntry();
    if (!e) return null;
    const names = e.membros.map((m) => m.nome);
    const people = names.length <= 2 ? names.join(' e ') : `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;
    const who =
      e.papel === 'dono'
        ? names.length
          ? `Com ${people}`
          : 'Por enquanto, só com você'
        : `De ${e.dono.nome} · ${ROLE_LABEL[e.papel].toLowerCase()}`;
    const vis = e.view.private ? 'privada' : 'pública';
    return { line: `${who} · ${vis}`, manages: canManage(e.papel) };
  });
  /**
   * Quem vê, como na ficha do mural: só um desenho antes da data, e o que ele quer dizer no título e
   * para o leitor de tela. A análise mostra o cadeado quando é privada; a anotação (que nasce privada),
   * o olho quando foi publicada. A sem aviso, nas duas, o sino cortado. Só no seu mural; a
   * compartilhada diz com quem está na mesma linha.
   */
  protected readonly audience = computed<{ icon: LucideIconData; title: string } | null>(() => {
    const r = this.review();
    if (!r || this.owner() !== null || this.sharedEntry()) return null;
    if (r.quiet) return { icon: this.QuietIcon, title: 'Pública, sem aviso: está no seu mural, mas não foi para o Feed' };
    if (isPrivate(r)) return this.note() ? null : { icon: this.PrivateIcon, title: 'Privada: só você vê' };
    return this.note() ? { icon: this.PublicIcon, title: 'Publicada: quem abre o seu mural vê' } : null;
  });

  // ===== Onde mais a anotação está: o quadro do Kanban e os dias do Calendário =====
  private readonly kanban = inject(KanbanStore);
  private readonly calendar = inject(CalendarStore);
  protected readonly CalendarIcon = ICON.calendario;
  protected readonly TasksIcon = ICON.tarefas;
  protected readonly SubjectIcon = ICON.assunto;
  protected readonly importanceLabel = IMPORTANCE_LABEL;
  protected readonly importanceLevel = IMPORTANCE_LEVEL;
  protected readonly steps = [1, 2, 3, 4, 5];
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
      icon: column ? ICON_CHOICE[column.icon] : null,
      color: column?.color ?? null,
      importance: spot.card.importance,
      status: spot.card.status ?? null,
      deps: this.deps.progress(spot.card.deps).total ? spot.card.deps! : null,
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

  /** O dia do lembrete, no Calendário (na vista do dia). */
  protected openDay(day: string): void {
    this.close();
    void this.router.navigate(['/anotacoes/calendario'], { queryParams: { vista: 'dia', dia: day } });
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
    // a anotação finalizada também sai do mural; apagar é outra coisa. A compartilhada de outra
    // pessoa não se apaga: sai-se dela
    const remove: MoreItem = {
      id: 'remover',
      label: this.leaves() ? 'Sair da anotação' : this.sharedWithOthers() ? 'Apagar para todos' : this.note() ? 'Apagar anotação' : 'Remover do mural',
      icon: this.leaves() ? this.LeaveIcon : this.TrashIcon,
      danger: true,
    };
    // o link que abre só esta ficha, para quem não usa o Murall (a privada diz por que não tem)
    const link: MoreItem = { id: 'link', label: this.note() ? 'Link da anotação' : 'Link da ficha', icon: this.LinkIcon, dialog: true };
    // a ficha como documento, pela impressão do navegador (ver ui/pdf-sheet.ts); a ficha em segredo
    // (a nota e o texto riscados aqui) não sai no papel: revelada, sim
    const pdf: MoreItem[] = this.masked() ? [] : [{ id: 'pdf', label: 'Salvar como PDF', icon: this.PdfIcon, hint: 'Abre a impressão: escolha “Salvar como PDF”' }];
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
        remove,
      ];
    }
    return [
      { id: 'outra-vez', label: `Escrever ${this.profile().revisit.one}`, icon: this.RevisitIcon },
      // as rejogadas não entram no lado a lado: lá é uma ficha por obra
      ...(r.revisitOf ? [] : [{ id: 'lado-a-lado', label: 'Lado a lado', icon: this.side.has(r.id) ? this.CheckedIcon : this.UncheckedIcon, pressed: this.side.has(r.id), hint: `Marcar pra comparar com ${this.others()}` }]),
      link,
      ...pdf,
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
    else if (id === 'outra-vez') this.revisit.emit(r.id);
    else if (id === 'lado-a-lado') this.side.toggle(r.id);
    else if (id === 'remover') this.remove.emit(r.id);
    else if (id === 'pdf') void this.savePdf();
  }

  private readonly env = inject(EnvironmentInjector);
  private readonly app = inject(ApplicationRef);
  private readonly toasts = inject(Toasts);
  /** A folha do PDF está sendo montada (um segundo pedido espera). */
  private printing = false;

  /**
   * Salva a ficha aberta em PDF: a folha (ui/pdf-sheet.ts, num pedaço à parte, carregado só agora)
   * com o que se lê aqui: o nome, quem fez, as informações, as tags e o texto com os widgets.
   */
  protected async savePdf(): Promise<void> {
    const r = this.review();
    if (!r || this.printing) return;
    this.printing = true;
    this.toasts.show('Preparando o PDF…', undefined, 20000);
    try {
      const m = await import('./pdf-sheet');
      await m.exportPdf(this.pdfDoc(r), this.env, this.app, () => this.toasts.dismiss());
    } catch {
      this.toasts.show('Não deu para preparar o PDF. Tente de novo.');
    } finally {
      this.printing = false;
    }
  }

  /** A ficha aberta, como o PDF a mostra. */
  private pdfDoc(r: Review): PdfDoc {
    const note = isNote(r);
    const meta: string[] = [];
    if (note && r.subject) meta.push(r.subject);
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
      // os links entre anotações só se mostram (no papel não se toca)
      links: { resolve: (title) => resolveNote(notes, title) },
    };
  }

  /** Quem não é o dono sai da anotação (em vez de apagar). */
  protected readonly leaves = computed(() => {
    const e = this.sharedEntry();
    return !!e && e.papel !== 'dono';
  });
  /** O dono de uma anotação com mais gente: apagar é para todos. */
  protected readonly sharedWithOthers = computed(() => {
    const e = this.sharedEntry();
    return !!e && e.papel === 'dono' && e.membros.length > 0;
  });
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
    if (!c) return 'Duas versões desta anotação mudaram o mesmo trecho.';
    if (c.a === null || c.b === null) return `Você apagou ${what} num aparelho e mudou no outro.`;
    return `${what.charAt(0).toUpperCase()}${what.slice(1)} mudou em dois aparelhos seus ao mesmo tempo, no mesmo trecho.`;
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
    else this.close();
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
  /** "Sem eles, a média seria 7,6." Contra a média com eles, mesmo quando a nota final foi dada na mão. */
  protected readonly withoutBonus = computed(() => {
    const r = this.review();
    const base = r ? computeBase(r) : null;
    if (!r || base === null) return '';
    const withThem = computeFinal(r.kind, r.scores, r.weights, r.bonuses);
    return base === withThem ? 'Sem eles, a média seria a mesma.' : `Sem eles, a média seria ${formatScore(base)}.`;
  });
  /** A nota final dada na mão: a média que as notas dariam, para comparar. */
  protected readonly handAverage = computed(() => {
    const r = this.review();
    if (!r || r.finalOverride === undefined) return null;
    const avg = computeFinal(r.kind, r.scores, r.weights, r.bonuses);
    return avg === null ? null : formatScore(avg);
  });
  protected readonly dayLabel = dayLabel;
  protected readonly noDay = NO_DAY_LABEL;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly review = signal<Review | null>(null);
  /** Backups de colegas são somente leitura e nunca acionam as ações do mural pessoal. */
  protected readonly owner = signal<string | null>(null);
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
  protected readonly commentsLabel = computed(() => spokenComments(this.commentCount()));
  /** A folha de comentários à mostra; trocar de ficha (as vezes da obra, um link) fecha. */
  protected readonly commentsOpen = linkedSignal({ source: this.reviewId, computation: () => false });
  /**
   * Os comentários têm porta nesta ficha: há algum para ler, ou você tem conta para escrever o
   * primeiro (na ficha de outra pessoa ou na sua: o dono também comenta nas dele).
   */
  protected readonly commentable = computed(() => !!this.commentTarget() && (this.commentCount() > 0 || this.commentsOpen() || !!this.comments.myCode()));
  /**
   * O "Comentar" embaixo do texto: na anotação de que você é dono, só a orelha (o botão poluía a
   * leitura). Na compartilhada por outra pessoa e nas resenhas, os dois.
   */
  protected readonly commentButton = computed(() => this.commentable() && !(this.note() && this.owner() === null && (this.sharedEntry()?.papel ?? 'dono') === 'dono'));
  /** Quem escreveu a ficha, para a folha dizer quem precisa ser seguido. */
  protected readonly commentOwner = computed(() => this.owner() ?? this.account.account()?.nome ?? 'Você');
  /** A ficha em segredo: a pessoa aceitou ver os comentários mesmo assim (só nesta ficha). */
  protected readonly spoilersOk = linkedSignal({ source: this.reviewId, computation: () => false });
  /** O trecho que a pessoa mandou citar, para a folha pôr no comentário. */
  protected readonly quote = linkedSignal<string | undefined, QuoteRequest | null>({ source: this.reviewId, computation: () => null });
  private quoteCount = 0;
  /** O trecho selecionado no texto da ficha e onde fica o remendo "Citar" (em px, dentro da dupla). */
  protected readonly picked = signal<{ text: string; left: number; top: number } | null>(null);
  /** Dá para citar: há porta para os comentários, você tem conta e o texto não está em segredo. */
  private readonly canQuote = computed(() => this.commentable() && !!this.comments.myCode() && !this.masked());
  private selectionTimer: ReturnType<typeof setTimeout> | undefined;
  /** A seleção de texto da página, ouvida só com a leitura aberta (ver `open`). */
  private readonly onSelectionChange = () => this.watchSelection();
  /** A página saiu com a leitura aberta: a seleção deixa de ser ouvida. */
  private readonly stopWatching = inject(DestroyRef).onDestroy(() => {
    document.removeEventListener('selectionchange', this.onSelectionChange);
    clearTimeout(this.selectionTimer);
  });

  /** Quem abriu a folha de comentários (a orelha ou o "Comentar"): é para onde o foco volta ao fechar. */
  private commentsOpener: HTMLElement | null = null;

  /**
   * Abre ou fecha a folha de comentários. O foco vai para a folha ao abrir e, ao fechar, volta para
   * quem a abriu, sempre sem rolar a ficha: ela fica onde a pessoa estava lendo.
   */
  protected toggleComments(open = !this.commentsOpen()): void {
    const dialog = this.dialog().nativeElement;
    const active = document.activeElement instanceof HTMLElement && dialog.contains(document.activeElement) ? document.activeElement : null;
    if (open) this.commentsOpener = active?.matches('.orelha, .comentar') ? active : null;
    this.commentsOpen.set(open);
    this.picked.set(null);
    if (!open) this.quote.set(null);
    setTimeout(() => {
      if (open) return dialog.querySelector<HTMLElement>('#leitura-comentarios')?.focus({ preventScroll: true });
      // fechou pela própria porta (a orelha, o "Comentar"): o foco já está nela, e fica
      if (active?.isConnected && !active.closest('#leitura-comentarios')) return;
      // o foco estava dentro da folha, que sumiu: volta para quem abriu; sem saber quem foi (a ficha
      // já abriu com os comentários), para a porta que está à vista (a orelha some nas telas estreitas)
      const doors = [...dialog.querySelectorAll<HTMLElement>('.orelha, .comentar')];
      const opener = this.commentsOpener?.isConnected ? this.commentsOpener : null;
      (opener ?? doors.find((d) => d.offsetParent !== null) ?? doors[0])?.focus({ preventScroll: true });
    });
  }

  /**
   * Com a folha de comentários ao lado, a faixa dela tem a altura da faixa da ficha (que cresce com o
   * nome escrito nela): a emenda das duas fica sem degrau.
   */
  private readonly bandSync = effect((onCleanup) => {
    if (!this.commentsOpen()) return;
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
    this.selectionTimer = setTimeout(() => this.picked.set(this.readSelection()), 180);
  }

  /** O trecho selecionado dentro do texto da ficha (e só dele), com o lugar do remendo logo abaixo do fim. */
  private readSelection(rescrolled = false): { text: string; left: number; top: number } | null {
    if (!this.canQuote()) return null;
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
    const box = pair.getBoundingClientRect();
    const article = zone.closest('.ficha')?.getBoundingClientRect() ?? box;
    const left = Math.min(Math.max(last.right - box.left - 44, 8), article.right - box.left - 104);
    return { text, left, top: top - box.top };
  }

  /** "Citar": o trecho vai para a folha de comentários, que abre se estava fechada. */
  protected quoteSelection(): void {
    const p = this.picked();
    if (!p) return;
    this.picked.set(null);
    document.getSelection()?.removeAllRanges();
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
    this.solta.set(null);
    document.removeEventListener('selectionchange', this.onSelectionChange);
    clearTimeout(this.selectionTimer);
    this.picked.set(null);
    this.review.set(null);
    this.watchShared(null);
  }
  /** O texto embaralhado do mesmo tamanho, sem as marcas de formatação, para o modo sem spoilers. */
  protected readonly text = computed(() => {
    const r = this.review();
    return r ? scramble(plainText(r.text), r.id) : '';
  });

  /** Marcou uma tarefa do texto na leitura: a ficha (sua) é salva com ela marcada, sem abrir o editor. */
  protected toggleTask(line: number): void {
    // a anotação como está agora (a nuvem pode ter trazido uma versão mais nova com a leitura aberta)
    const r = this.review() && (this.store.get(this.review()!.id) ?? this.review());
    if (!r || this.owner() !== null || !this.writable()) return;
    const text = toggleCheck(r.text, line);
    if (text === r.text) return;
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
    const backTo = !stay && this.trail().length > 0;
    this.noteDone.set(r.id, done, { quiet: stay || backTo });
    if (stay) {
      this.review.set(this.store.get(r.id) ?? r);
      this.stampedNow.set(done);
    } else if (backTo) this.back();
    else this.close();
  }
  /** Acabou de finalizar com a leitura aberta: o carimbo bate. */
  protected readonly stampedNow = signal(false);
  private readonly view = inject(WallView);
  /**
   * As anotações por onde se chegou até aqui, pelos links (a última é a de "Voltar"). Abrir a
   * leitura de novo começa do zero.
   */
  protected readonly trail = signal<readonly Review[]>([]);

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
      ...(mine ? { create: (title: string) => this.createNote.emit({ title, from: this.review()!.id }) } : {}),
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
    this.trail.update((t) => [...t, r]);
    this.show(n);
  }

  /** Volta pelo caminho dos links, para a anotação como ela está agora. */
  protected back(): void {
    const t = this.trail();
    const prev = t.at(-1);
    if (!prev) return;
    this.trail.set(t.slice(0, -1));
    this.show((this.owner() === null ? this.store.get(prev.id) : null) ?? prev);
  }

  /** Troca a anotação da leitura, do alto, com o foco no título (ou no "Voltar"). */
  private show(n: Review): void {
    this.review.set(n);
    this.stampedNow.set(false);
    const dialog = this.dialog().nativeElement;
    dialog.scrollTop = 0;
    // o foco no título: o leitor de tela anuncia a anotação que abriu
    setTimeout(() => dialog.querySelector<HTMLElement>('#leitura-titulo')?.focus());
  }

  protected readonly pin = computed(() => pinningFor(this.review()?.id ?? 'x', this.review()?.stock));
  /** A faixa do cabeçalho é a cartolina da ficha, no papel dela. */
  protected readonly headPaper = computed(() => paperVars(this.review()?.paper, this.review()?.pattern, lookOf(this.review() ?? {}), this.review()?.patternSeed, isDarkStock(this.pin().stock)));
  protected readonly date = computed(() => {
    const r = this.review();
    return formatReviewDateLong(r?.completedAt ?? null);
  });

  /** As fichas de um colega, para andar entre as vezes de uma obra no mural dele. */
  private readonly pool = signal<readonly Review[]>([]);
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
      const arrows = dialog.querySelectorAll<HTMLButtonElement>('.vez-seta');
      if (document.activeElement instanceof HTMLButtonElement && document.activeElement.disabled) arrows[step < 0 ? 1 : 0]?.focus();
    });
  }

  /** As setas do teclado viram a página, fora de um campo de texto. */
  protected onKey(e: KeyboardEvent): void {
    if (e.key !== 'ArrowLeft' && e.key !== 'ArrowRight') return;
    if ((e.target as HTMLElement | null)?.closest('input, textarea, select')) return;
    if (this.times().length < 2) return;
    e.preventDefault();
    this.go(e.key === 'ArrowLeft' ? -1 : 1);
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
    // pediram a ficha já com os comentários (o remendo da ficha, o "Comentar" do Feed)
    const withComments = this.comments.take(review.id);
    // tocou num link na ficha do mural: a anotação de onde veio é o "Voltar"
    this.trail.set(from ? [from] : []);
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
    this.dialog().nativeElement.showModal();
    this.watchShared(owner === null ? review.id : null);
    // uma compartilhada com conflito: a pergunta abre já (para quem escreve nela)
    if (this.conflictHere()) setTimeout(() => this.conflictOpen.set(true), 120);
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (!el.open) return;
    this.closing = true;
    el.close();
  }
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
    if (this.solta()) e.preventDefault();
  }

}
