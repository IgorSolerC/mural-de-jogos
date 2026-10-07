import {
  ChangeDetectionStrategy,
  Component,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { ChevronLeft, ChevronRight, Eye, EyeOff, LockKeyhole, LucideAngularModule, PenLine, Repeat, Square, SquareCheckBig, Trash2, X } from 'lucide-angular';
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
import { plainText, toggleCheck } from '../core/rich-text';


@Component({
  selector: 'app-review-reader',
  imports: [LucideAngularModule, Rabisco, Boletim, BonusSticker, CoverSleeve, JudgeLabel, Luz, Pin, ReactionBubble, ReactionPicker, RichText, Skulls, StatusLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet reader" aria-labelledby="leitura-titulo" (pointerdown)="onPointerDown($event)" (click)="onBackdrop($event)" (keydown)="onKey($event)" (close)="review.set(null)">
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
            <div class="top" [class.anotacao]="note()" [class.sem-capa]="note() && !r.game.coverUrl">
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
                <h2 id="leitura-titulo" class="title">{{ r.game.name }}</h2>
                @if (r.game.by) {
                  <p class="meta by">de {{ r.game.by }}</p>
                }
                <p class="meta">
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
                    {{ note() ? 'Privada: só você vê.' : 'Privada: só você vê. Ninguém foi avisado.' }}
                  </p>
                }
              </div>

              @if (note()) {
                <!-- as categorias da anotação, no lugar da nota -->
                @if (r.bonuses.length) {
                  <ul class="judgement categorias" aria-label="Categorias">
                    @for (b of r.bonuses; track b.id; let i = $index) {
                      <li><app-bonus-sticker [bonus]="b" [index]="i" [seed]="r.id" /></li>
                    }
                  </ul>
                }
              } @else {
              <div class="judgement">
                <app-judge-label [value]="r.scores.final" [verdict]="r.verdict" size="big" [masked]="masked()" />
                <!-- a ficha de outra pessoa em segredo: revelar é só desta vez, a próxima abre em segredo de novo -->
                @if (forceMask()) {
                  <button type="button" class="btn-quiet revelar" [attr.aria-pressed]="revealed()" (click)="revealed.set(!revealed())">
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
                <!-- com a formatação do editor; as tarefas se marcam aqui mesmo, na sua ficha -->
                <div class="text"><app-rich-text [text]="r.text" [checkable]="owner() === null" (toggled)="toggleTask($event)" /></div>
              }
            } @else {
              <p class="no-text">{{ note() ? 'Anotação em branco.' : owner() ? 'Sem texto nessa ficha.' : 'Sem texto nessa ficha. Dá para escrever depois, em Editar.' }}</p>
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
              Remover do mural
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
  /** "Revelar a nota": só enquanto esta leitura estiver aberta. */
  protected readonly revealed = signal(false);
  /** Sem spoilers, a leitura do seu mural esconde o mesmo que a ficha. O mural de um colega não, a não ser quando pedido. */
  protected readonly masked = computed(
    () => !this.note() && ((this.forceMask() && !this.revealed()) || (this.settings.noSpoilers() && this.owner() === null)),
  );
  /** Uma anotação: sem nota, veredito, rejogada nem lado a lado; as categorias e o texto. */
  protected readonly note = computed(() => !!this.review() && isNote(this.review()!));
  /** O texto embaralhado do mesmo tamanho, sem as marcas de formatação, para o modo sem spoilers. */
  protected readonly text = computed(() => {
    const r = this.review();
    return r ? scramble(plainText(r.text), r.id) : '';
  });

  /** Marcou uma tarefa do texto na leitura: a ficha (sua) é salva com ela marcada, sem abrir o editor. */
  protected toggleTask(line: number): void {
    const r = this.review();
    if (!r || this.owner() !== null) return;
    const text = toggleCheck(r.text, line);
    if (text === r.text) return;
    const next: Review = { ...r, text, updatedAt: new Date().toISOString() };
    this.store.update(next);
    this.review.set(next);
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
   * entre as vezes; `masked` esconde notas, bônus e texto, como no modo sem spoilers.
   */
  open(review: Review, owner: string | null = null, pool: readonly Review[] = [], masked = false, code: string | null = null): void {
    this.ownerCode.set(owner === null ? null : code);
    if (code && owner !== null) void this.reactions.load(code);
    this.forceMask.set(masked);
    this.revealed.set(false);
    this.owner.set(owner);
    this.pool.set(pool);
    this.review.set(review);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** O clique começou fora do cartão? Selecionar texto e soltar fora dele não fecha. */
  private downOnBackdrop = false;

  // sem devolver nada: um handler que devolve false ganha preventDefault do Angular, e o campo clicado não recebe o foco
  protected onPointerDown(e: PointerEvent): void {
    this.downOnBackdrop = e.target === e.currentTarget;
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement && this.downOnBackdrop) this.close();
  }
}
