import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  linkedSignal,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { BackdropClose } from './backdrop-close';
import { ArrowLeft, ChevronLeft, ChevronRight, Eye, EyeOff, LockKeyhole, LucideAngularModule, LucideIconData, PenLine, Pin as PinGlyph, PinOff, Repeat, RotateCcw, Square, SquareCheckBig, Trash2, X } from 'lucide-angular';
import { cap, g, profileOf } from '../core/kinds';
import { BONUS_KIND_LABEL, NO_DAY_LABEL, Review, isNote, computeBase, computeFinal, dayLabel, formatAmount, formatReviewDate, formatReviewDateLong, formatScore, isDarkStock, sortBonuses, timesOf } from '../core/review';
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
import { Skulls } from './difficulty';
import { JudgeLabel } from './judge-label';
import { Luz } from './luz';
import { Pin } from './pin';
import { StatusLabel } from './status-label';
import { RichText } from './rich-text';
import { ReactionBubble, ReactionPicker } from './reactions';
import { ReactionTarget, Reactions } from '../core/reactions';
import { foldDone, foldedCount, parseRich, plainText, snapshotDone, toggleCheck } from '../core/rich-text';
import { NoteLinks, backlinksOf, notesOf, resolveNote } from '../core/note-links';
import { NoteBacklinks } from './note-backlinks';
import { NoteDone } from '../core/note-done';
import { NotePin } from '../core/note-pin';
import { WallView } from '../core/wall-view';
import { DoneStamp } from './done-stamp';
import { NoteTag } from './note-tag';
import { categoryIcon } from './category-label';
import { categoryBonus } from '../core/note-labels';


@Component({
  selector: 'app-review-reader',
  imports: [BackdropClose, LucideAngularModule, Rabisco, Boletim, BonusSticker, CoverSleeve, DoneStamp, NoteTag, JudgeLabel, Luz, Pin, ReactionBubble, ReactionPicker, RichText, Skulls, StatusLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet reader" aria-labelledby="leitura-titulo" (backdropClose)="close()" (keydown)="onKey($event)" (close)="review.set(null)">
      @if (review(); as r) {
        <article class="ficha cartolina" [style.--stock]="'var(--stock-' + pin().stock + ')'" [attr.data-cor]="pin().stock">
          <app-pin class="pin" [color]="pin().pinColor" />
          <!-- a cor da cartolina fica só na faixa do cabeçalho, como ficha de fichário -->
          <header class="head" [style]="headPaper()">
            <button type="button" class="icon-btn" (click)="close()" aria-label="Fechar">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" />
            </button>
          </header>

          <div class="body" appLuz>
            <!-- veio por um link de outra anotação: o caminho de volta -->
            @if (trail().at(-1); as from) {
              <button type="button" class="btn-quiet voltar-elo" (click)="back()">
                <lucide-icon [img]="BackIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
                <span class="voltar-txt">Voltar para “{{ from.game.name }}”</span>
              </button>
            }
            <!-- A obra jogada mais de uma vez: as vezes viram páginas, a original e cada rejogada -->
            @if (times().length > 1) {
              <nav class="vezes" [attr.aria-label]="'As vezes de ' + r.game.name">
                <button type="button" class="vez-seta" [disabled]="at() === 0" (click)="go(-1)" [attr.aria-label]="prevLabel()">
                  <lucide-icon [img]="PrevIcon" [size]="22" [strokeWidth]="2.8" aria-hidden="true" />
                </button>
                <p class="vez" aria-live="polite">
                  <span class="vez-nome">{{ timeLabel(at()) }}</span>
                  <span class="vez-conta">{{ at() + 1 }} de {{ times().length }}</span>
                </p>
                <button type="button" class="vez-seta" [disabled]="at() === times().length - 1" (click)="go(1)" [attr.aria-label]="nextLabel()">
                  <lucide-icon [img]="NextIcon" [size]="22" [strokeWidth]="2.8" aria-hidden="true" />
                </button>
              </nav>
            }

            <!-- A mesma ficha do mural, vista de perto: foto colada, nome, data e a etiqueta do julgamento -->
            <div class="top" [class.sem-capa]="note() && !r.game.coverUrl" [class.feita]="note() && !!r.doneAt">
              <!-- finalizada: o carimbo redondo batido no canto, como na ficha -->
              @if (note() && r.doneAt) {
                <span class="carimbo"><app-done-stamp size="big" [at]="r.doneAt" [hit]="stampedNow()" /></span>
              }
              @if (!note() || r.game.coverUrl) {
              <div class="cover">
                <app-cover-sleeve [game]="r.game" size="big">
                  @if (r.status !== 'finalizado' && !note()) {
                    <app-status-label class="faixa" [status]="r.status" [kind]="r.kind" [band]="true" />
                  }
                </app-cover-sleeve>
              </div>
              }

              <div class="words">
                <h2 id="leitura-titulo" class="title" tabindex="-1">{{ r.game.name }}</h2>
                @if (r.game.by) {
                  <p class="meta by">de {{ r.game.by }}</p>
                }
                <p class="meta">
                  <!-- o lugar da anotação no mural vem antes da data, com ou sem data -->
                  @if (note() && r.noteRank === 'fixada') {
                    Fixada<span aria-hidden="true"> · </span>
                  } @else if (note() && r.noteRank === 'sub') {
                    <!-- a sub-nota diz de qual anotação é parte, e abre ela; com várias, quantas são, e
                         no seu mural o número abre a lista delas -->
                    @let ps = parents();
                    @if (ps.length === 1) {
                      Parte de <button type="button" class="parte-de" (click)="openParent(ps[0])">{{ ps[0].game.name }}</button><span aria-hidden="true"> · </span>
                    } @else if (ps.length && owner() === null) {
                      Parte de <button type="button" class="parte-de" aria-haspopup="dialog" (click)="openParents(r)">{{ ps.length }} notas</button><span aria-hidden="true"> · </span>
                    } @else if (ps.length) {
                      Parte de {{ ps.length }} notas<span aria-hidden="true"> · </span>
                    } @else {
                      Sub-nota<span aria-hidden="true"> · </span>
                    }
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
                </p>
                @if (r.game.year) {
                  <p class="meta year">{{ profile().released }} {{ r.game.year }}</p>
                }
                @if (r.private && owner() === null) {
                  <p class="privada">
                    <lucide-icon [img]="PrivateIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
                    Privada: só você vê. Ninguém foi avisado.
                  </p>
                } @else if (r.quiet && owner() === null) {
                  <p class="privada">
                    <lucide-icon [img]="VisibleIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
                    Visível: está no seu mural, mas não foi para o Feed.
                  </p>
                }
              </div>

              @if (note()) {
                <!-- a categoria e as tags da anotação, no lugar da nota -->
                @if (r.category || r.tags?.length) {
                  <ul class="judgement categorias" aria-label="Categoria e tags">
                    @if (r.category) {
                      <li><app-bonus-sticker [bonus]="categorySticker(r.category)" [glyph]="categoryGlyph(r.category)" [index]="0" [seed]="r.id" /><span class="sr-only"> (categoria)</span></li>
                    }
                    @for (t of r.tags ?? []; track t; let i = $index) {
                      <li><app-note-tag [label]="t" [index]="i + 1" /><span class="sr-only"> (tag)</span></li>
                    }
                  </ul>
                }
              } @else {
              <div class="judgement">
                <app-judge-label [value]="r.scores.final" [verdict]="r.verdict" size="big" [masked]="masked()" />
                <!-- a ficha de outra pessoa em segredo: revelada aqui, fica revelada no mural de quem abriu (ver revealedChange) -->
                @if (forceMask()) {
                  <button type="button" class="btn-quiet revelar" [attr.aria-pressed]="revealed()" (click)="toggleReveal()">
                    <lucide-icon [img]="revealed() ? HideIcon : RevealIcon" [size]="18" [strokeWidth]="2.6" aria-hidden="true" />
                    {{ revealed() ? 'Esconder a nota' : 'Revelar a nota' }}
                  </button>
                }
                @if (!masked() && handAverage(); as avg) {
                  <p class="na-mao">Nota dada na mão · a média daria {{ avg }}</p>
                }
                @if (profile().difficulty && !masked()) {
                  <app-skulls class="skulls" [value]="r.difficulty" [size]="18" />
                }
              </div>
              }
            </div>

            <!-- Os bônus: os mesmos adesivos da ficha, todos, com a conta sem eles logo abaixo -->
            @if (bonuses().length && !note()) {
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

            @if (!note()) {
              <app-boletim [review]="r" size="big" [masked]="masked()" />
            }

            @if (r.text.trim()) {
              @if (masked()) {
                <div class="text"><app-rabisco [text]="text()" /><span class="sr-only">Texto escondido</span></div>
              } @else {
                <!-- as tarefas feitas viram uma conta, como no mural; aqui dá para ver a anotação como ela é -->
                @if (foldable(); as n) {
                  <div class="feitas-linha">
                    <button type="button" class="btn-quiet feitas-btn" [attr.aria-pressed]="showDone()" (click)="showDone.set(!showDone())">
                      <lucide-icon [img]="showDone() ? HideIcon : RevealIcon" [size]="17" [strokeWidth]="2.6" aria-hidden="true" />
                      {{ showDone() ? 'Esconder as feitas' : n === 1 ? 'Mostrar a tarefa feita' : 'Mostrar as ' + n + ' tarefas feitas' }}
                    </button>
                  </div>
                }
                <!-- com a formatação do editor; as tarefas se marcam aqui mesmo, na sua ficha -->
                <div class="text"><app-rich-text [text]="r.text" [fold]="note() && !showDone()" [checkable]="owner() === null" [links]="noteLinks()" (toggled)="toggleTask($event)" /></div>
              }
            } @else if (!note()) {
              <!-- a anotação pode ser só o título: sem aviso de texto em branco -->
              <p class="no-text">{{ owner() ? 'Sem texto nessa ficha.' : 'Sem texto nessa ficha. Dá para escrever depois, em Editar.' }}</p>
            }

            <!-- as reações: o balão com quem reagiu e, na ficha de quem você segue, o reagir -->
            @if (reactTarget(); as t) {
              @if (reactions.canReact(t.code) || reactions.of(t.code, t.ref).length) {
                <div class="reagir-linha">
                  @if (reactions.canReact(t.code)) {
                    <app-reaction-picker [target]="t" />
                  }
                  <app-reaction-bubble [target]="t" />
                </div>
              }
            }
          </div>

          <footer class="foot">
            @if (owner(); as name) {
              <p>{{ name === 'Você' ? (note() ? 'Sua anotação' : 'Sua resenha') : (note() ? 'Anotação de ' : 'Resenha de ') + name }}</p>
              <button type="button" class="btn-ink" (click)="close()">Fechar</button>
            } @else {
            <button type="button" class="btn-quiet danger" (click)="remove.emit(r.id)">
              <lucide-icon [img]="TrashIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
              <!-- a anotação finalizada também sai do mural; apagar é outra coisa -->
              {{ note() ? 'Apagar anotação' : 'Remover do mural' }}
            </button>
            <div class="actions">
              @if (!note()) {
              <button type="button" class="btn-quiet" (click)="revisit.emit(r.id)">
                <lucide-icon [img]="RevisitIcon" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
                Escrever {{ profile().revisit.one }}
              </button>
              }
              <!-- as rejogadas não entram no lado a lado: lá é uma ficha por obra (e anotação não se compara) -->
              @if (!r.revisitOf && !note()) {
              <button
                type="button"
                class="btn-quiet side"
                [attr.aria-pressed]="side.has(r.id)"
                (click)="side.toggle(r.id)"
                [title]="'Marcar pra comparar com ' + others()"
              >
                <lucide-icon [img]="side.has(r.id) ? CheckedIcon : UncheckedIcon" [size]="19" [strokeWidth]="2.6" aria-hidden="true" />
                Lado a lado
              </button>
              }
              <!-- o check da anotação inteira: finaliza (e ela sai do mural com o carimbo) ou abre de novo -->
              @if (note()) {
                <!-- fixar no topo do mural -->
                <button type="button" class="btn-quiet" [attr.aria-pressed]="r.noteRank === 'fixada'" (click)="togglePin()">
                  <lucide-icon [img]="r.noteRank === 'fixada' ? UnpinIcon : PinIcon" [size]="19" [strokeWidth]="2.6" aria-hidden="true" />
                  {{ r.noteRank === 'fixada' ? 'Desafixar' : 'Fixar' }}
                </button>
                <button type="button" class="btn-quiet" [attr.aria-pressed]="!!r.doneAt" (click)="finish()">
                  <lucide-icon [img]="r.doneAt ? ReopenIcon : CheckedIcon" [size]="19" [strokeWidth]="2.6" aria-hidden="true" />
                  {{ r.doneAt ? 'Abrir de novo' : 'Finalizar' }}
                </button>
              }
              <button type="button" class="btn-ink" (click)="edit.emit(r.id)">
                <lucide-icon [img]="EditIcon" [size]="20" [strokeWidth]="2.4" aria-hidden="true" />
                Editar
              </button>
            </div>
            }
          </footer>
        </article>
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
  protected readonly CloseIcon = X;
  protected readonly CheckedIcon = SquareCheckBig;
  protected readonly UncheckedIcon = Square;
  protected readonly EditIcon = PenLine;
  protected readonly TrashIcon = Trash2;
  protected readonly RevisitIcon = Repeat;
  protected readonly PrevIcon = ChevronLeft;
  protected readonly NextIcon = ChevronRight;
  protected readonly RevealIcon = Eye;
  protected readonly HideIcon = EyeOff;
  protected readonly PrivateIcon = LockKeyhole;
  protected readonly VisibleIcon = Eye;
  protected readonly BackIcon = ArrowLeft;
  protected readonly ReopenIcon = RotateCcw;
  protected readonly categorySticker = categoryBonus;
  /** O desenho escolhido para a categoria, só nas suas anotações (ver core/category-looks.ts). */
  protected categoryGlyph(category: string): LucideIconData | null {
    const look = this.owner() === null ? this.settings.categoryLook(category) : {};
    return look.icon ? categoryIcon(category, look) : null;
  }
  protected readonly PinIcon = PinGlyph;
  protected readonly UnpinIcon = PinOff;
  private readonly store = inject(ReviewStore);
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
  private readonly ownerCode = signal<string | null>(null);
  protected readonly reactions = inject(Reactions);
  /** A ficha aberta como alvo das reações: a de quem tem código, ou a sua com a conta aberta. */
  protected readonly reactTarget = computed<ReactionTarget | null>(() => {
    const r = this.review();
    const code = this.owner() === null ? this.reactions.myCode() : this.ownerCode();
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
  /** As tarefas feitas quando a anotação abriu: as que o texto esconde (o mesmo retrato dele, ver RichText). */
  private readonly doneThen = linkedSignal({ source: () => this.review()?.text ?? '', computation: snapshotDone });
  protected readonly foldable = computed(() => (this.note() ? foldedCount(foldDone(parseRich(this.review()!.text), this.doneThen().lines)) : 0));
  /** A anotação aberta. Num `computed`: marcar uma tarefa troca a `review` (salva), mas não a anotação. */
  private readonly reviewId = computed(() => this.review()?.id);
  /**
   * Mostrando as tarefas feitas: só até trocar de anotação (cada uma abre com elas escondidas).
   * Marcar e desmarcar não mexem nele: a fonte é o id, e não a `review`, que o linkedSignal refaria.
   */
  protected readonly showDone = linkedSignal({ source: this.reviewId, computation: () => false });
  /** O texto embaralhado do mesmo tamanho, sem as marcas de formatação, para o modo sem spoilers. */
  protected readonly text = computed(() => {
    const r = this.review();
    return r ? scramble(plainText(r.text), r.id) : '';
  });

  /** Marcou uma tarefa do texto na leitura: a ficha (sua) é salva com ela marcada, sem abrir o editor. */
  protected toggleTask(line: number): void {
    // a anotação como está agora (a nuvem pode ter trazido uma versão mais nova com a leitura aberta)
    const r = this.review() && (this.store.get(this.review()!.id) ?? this.review());
    if (!r || this.owner() !== null) return;
    const text = toggleCheck(r.text, line);
    if (text === r.text) return;
    const next: Review = { ...r, text, updatedAt: new Date().toISOString() };
    this.store.update(next);
    this.review.set(next);
    // a tarefa com link para outra anotação: oferece finalizar aquela também (o bilhete ficaria por baixo da leitura)
    if (this.note()) void this.noteDone.offerLinked(r.id, text, line, { quiet: true });
  }
  private readonly noteDone = inject(NoteDone);
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
    if (!r || this.owner() !== null || !this.note()) return;
    const done = !r.doneAt;
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

  /** Os links da anotação aberta: abrem aqui mesmo; no seu mural, o que não existe se cria. */
  protected readonly noteLinks = computed<NoteLinks | null>(() => {
    if (!this.note()) return null;
    const notes = this.linkable();
    const mine = this.owner() === null;
    return {
      resolve: (title) => resolveNote(notes, title),
      open: (n) => this.follow(n),
      // a anotação aberta é de onde o link veio: depois de criar a nova, a leitura volta para ela
      ...(mine ? { create: (title: string) => this.createNote.emit({ title, from: this.review()!.id }) } : {}),
    };
  });

  /** As anotações de que a sub-nota aberta é parte (as que têm o link para ela), das mais antigas para as mais novas. */
  protected readonly parents = computed(() => {
    const r = this.review();
    return r && this.note() && r.noteRank === 'sub' ? backlinksOf(r, this.linkable()) : [];
  });
  protected readonly backlinks = inject(NoteBacklinks);

  /** A lista das anotações de que esta é parte; a escolhida abre aqui, com o "Voltar" para esta. */
  protected openParents(r: Review): void {
    this.backlinks.open(r.id, (id) => {
      const n = this.parents().find((p) => p.id === id);
      if (n) this.follow(n);
    });
  }

  /** Abre a anotação de que esta é parte, com o "Voltar" para esta. */
  protected openParent(p: Review): void {
    this.follow(p);
  }

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
  ): void {
    // tocou num link na ficha do mural: a anotação de onde veio é o "Voltar"
    this.trail.set(from ? [from] : []);
    this.ownerCode.set(owner === null ? null : code);
    if (code && owner !== null) void this.reactions.load(code);
    this.forceMask.set(masked);
    this.revealed.set(masked && revealed);
    this.owner.set(owner);
    this.pool.set(pool);
    this.review.set(review);
    this.showDone.set(false);
    this.stampedNow.set(false);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

}
