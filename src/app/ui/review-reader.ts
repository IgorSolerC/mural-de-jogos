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
import { LucideAngularModule, PenLine, Square, SquareCheckBig, Trash2, X } from 'lucide-angular';
import { g, profileOf } from '../core/kinds';
import { BONUS_KIND_LABEL, NO_DAY_LABEL, Review, computeBase, computeFinal, dayLabel, formatAmount, formatReviewDateLong, formatScore, isDarkStock, sortBonuses } from '../core/review';
import { SideBySide } from '../core/side-by-side';
import { lookOf } from '../core/paper';
import { paperVars } from '../core/paper-art';
import { pinningFor } from '../core/wall-physics';
import { Boletim } from './boletim';
import { BonusSticker } from './bonus';
import { CoverSleeve } from './cover-sleeve';
import { Skulls } from './difficulty';
import { JudgeLabel } from './judge-label';
import { Luz } from './luz';
import { Pin } from './pin';
import { StatusLabel } from './status-label';


@Component({
  selector: 'app-review-reader',
  imports: [LucideAngularModule, Boletim, BonusSticker, CoverSleeve, JudgeLabel, Luz, Pin, Skulls, StatusLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet reader" aria-labelledby="leitura-titulo" (pointerdown)="onPointerDown($event)" (click)="onBackdrop($event)" (close)="review.set(null)">
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
            <!-- A mesma ficha do mural, vista de perto: foto colada, nome, data e a etiqueta do julgamento -->
            <div class="top">
              <div class="cover">
                <app-cover-sleeve [game]="r.game" size="big">
                  @if (r.status !== 'finalizado') {
                    <app-status-label class="faixa" [status]="r.status" [kind]="r.kind" [band]="true" />
                  }
                </app-cover-sleeve>
              </div>

              <div class="words">
                <h2 id="leitura-titulo" class="title">{{ r.game.name }}</h2>
                @if (r.game.by) {
                  <p class="meta by">de {{ r.game.by }}</p>
                }
                <p class="meta">
                  @if (r.completedAt === null) {
                    {{ noDay }}
                  } @else {
                    {{ dayLabel(r.kind, r.status) }} {{ date() }}
                  }
                  @if (hours(); as h) {
                    <span aria-hidden="true"> · </span>{{ h }}
                  }
                </p>
                @if (r.game.year) {
                  <p class="meta year">{{ profile().released }} {{ r.game.year }}</p>
                }
              </div>

              <div class="judgement">
                <app-judge-label [value]="r.scores.final" [verdict]="r.verdict" size="big" />
                @if (handAverage(); as avg) {
                  <p class="na-mao">Nota dada na mão · a média daria {{ avg }}</p>
                }
                @if (profile().difficulty) {
                  <app-skulls class="skulls" [value]="r.difficulty" [size]="18" />
                }
              </div>
            </div>

            <!-- Os bônus: os mesmos adesivos da ficha, todos, com a conta sem eles logo abaixo -->
            @if (bonuses().length) {
              <div class="bonus-block">
                <ul class="bonus" aria-label="Bônus">
                  @for (b of bonuses(); track b.id; let i = $index) {
                    <li>
                      <app-bonus-sticker [bonus]="b" [index]="i" />
                      <span class="sr-only">({{ kindLabels[b.kind].toLowerCase() }})</span>
                    </li>
                  }
                </ul>
                <p class="sem">{{ withoutBonus() }}</p>
              </div>
            }

            <app-boletim [review]="r" size="big" />

            @if (r.text.trim()) {
              <div class="text">{{ r.text }}</div>
            } @else {
              <p class="no-text">{{ owner() ? 'Sem texto nessa ficha.' : 'Sem texto nessa ficha. Dá para escrever depois, em Editar.' }}</p>
            }
          </div>

          <footer class="foot">
            @if (owner(); as name) {
              <p>{{ name === 'Você' ? 'Sua resenha' : 'Resenha de ' + name }}</p>
              <button type="button" class="btn-ink" (click)="close()">Fechar</button>
            } @else {
            <button type="button" class="btn-quiet danger" (click)="remove.emit(r.id)">
              <lucide-icon [img]="TrashIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
              Remover do mural
            </button>
            <div class="actions">
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

  protected readonly side = inject(SideBySide);
  protected readonly CloseIcon = X;
  protected readonly CheckedIcon = SquareCheckBig;
  protected readonly UncheckedIcon = Square;
  protected readonly EditIcon = PenLine;
  protected readonly TrashIcon = Trash2;
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
  protected readonly pin = computed(() => pinningFor(this.review()?.id ?? 'x', this.review()?.stock));
  /** A faixa do cabeçalho é a cartolina da ficha, no papel dela. */
  protected readonly headPaper = computed(() => paperVars(this.review()?.paper, this.review()?.pattern, lookOf(this.review() ?? {}), this.review()?.patternSeed, isDarkStock(this.pin().stock)));
  protected readonly date = computed(() => {
    const r = this.review();
    return formatReviewDateLong(r?.completedAt ?? null);
  });

  open(review: Review, owner: string | null = null): void {
    this.owner.set(owner);
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
