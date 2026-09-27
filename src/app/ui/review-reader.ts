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
import { ArrowDown, ArrowUp, LucideAngularModule, PenLine, Square, SquareCheckBig, Trash2, X } from 'lucide-angular';
import {
  RATED_KEYS,
  RatedKey,
  Review,
  SCORE_LABEL,
  WEIGHT_LABEL,
  dayLabel,
  formatHours,
  formatScore,
  parseDay,
  weightOf,
} from '../core/review';
import { SideBySide } from '../core/side-by-side';
import { pinningFor } from '../core/wall-physics';
import { CoverSleeve } from './cover-sleeve';
import { Skulls } from './difficulty';
import { Pin } from './pin';
import { ScoreBurst } from './score-burst';
import { StatusLabel } from './status-label';
import { VerdictStamp } from './verdict';

const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: 'numeric', month: 'long', year: 'numeric' });

@Component({
  selector: 'app-review-reader',
  imports: [LucideAngularModule, CoverSleeve, Pin, Skulls, VerdictStamp, ScoreBurst, StatusLabel],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet reader" aria-labelledby="leitura-titulo" (click)="onBackdrop($event)" (close)="review.set(null)">
      @if (review(); as r) {
        <article class="ficha cartolina" [style.--stock]="'var(--stock-' + pin().stock + ')'">
          <app-pin class="pin" [color]="pin().pinColor" />
          <header class="head">
            <h2 id="leitura-titulo">{{ r.game.name }}</h2>
            <button type="button" class="icon-btn" (click)="close()" aria-label="Fechar">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" />
            </button>
          </header>

          <div class="body">
            <div class="top">
              <div class="cover-col">
                <app-cover-sleeve [game]="r.game" size="big" />
              </div>
              <div class="facts">
                <p class="meta">
                  @if (r.game.year) {
                    Lançado em {{ r.game.year }} ·
                  }
                  {{ dayLabel(r.status) }} {{ date() }}
                  @if (r.hoursPlayed !== null) {
                    · {{ hours() }} jogadas
                  }
                </p>
                <!-- A sentença do jogo: média e veredito juntos, status e dificuldade logo abaixo -->
                <div class="verdict">
                  <app-score-burst class="verdict-burst" size="big" [value]="r.scores.final" />
                  <div class="verdict-side">
                    @if (r.verdict; as v) {
                      <app-verdict-stamp class="verdict-stamp" [value]="v" size="big" />
                    }
                    <div class="tags">
                      <app-status-label [status]="r.status" />
                      <app-skulls [value]="r.difficulty" [size]="17" />
                    </div>
                  </div>
                </div>
                <dl class="scores">
                  @for (k of keys(); track k) {
                    <div class="row">
                      <dt>
                        {{ labels[k] }}
                        @switch (weightOf(r.weights, k)) {
                          @case ('relevante') {
                            <lucide-icon class="w" [img]="UpIcon" [size]="14" [strokeWidth]="3" [title]="weightLabels.relevante" />
                          }
                          @case ('pouco') {
                            <lucide-icon class="w" [img]="DownIcon" [size]="14" [strokeWidth]="3" [title]="weightLabels.pouco" />
                          }
                        }
                      </dt>
                      <dd>
                        <span class="bar" aria-hidden="true">
                          <span class="fill" [style.width.%]="(r.scores[k] ?? 0) * 10"></span>
                        </span>
                        <span class="num">{{ fmt(r.scores[k]) }}</span>
                      </dd>
                    </div>
                  }
                </dl>
              </div>
            </div>

            @if (r.text.trim()) {
              <div class="text">{{ r.text }}</div>
            } @else {
              <p class="no-text">Sem texto nessa ficha. Dá para escrever depois, em Editar.</p>
            }
          </div>

          <footer class="foot">
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
                title="Marcar pra comparar com outros jogos"
              >
                <lucide-icon [img]="side.has(r.id) ? CheckedIcon : UncheckedIcon" [size]="19" [strokeWidth]="2.6" aria-hidden="true" />
                Lado a lado
              </button>
              <button type="button" class="btn-ink" (click)="edit.emit(r.id)">
                <lucide-icon [img]="EditIcon" [size]="20" [strokeWidth]="2.4" aria-hidden="true" />
                Editar
              </button>
            </div>
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
  protected readonly labels = SCORE_LABEL;
  /** As categorias que contam para este jogo (a média tem bloco próprio). */
  protected readonly keys = computed<RatedKey[]>(() => {
    const r = this.review();
    return RATED_KEYS.filter((k) => weightOf(r?.weights, k) !== 'nao-tem');
  });
  protected readonly hours = computed(() => formatHours(this.review()?.hoursPlayed ?? null));
  protected readonly weightOf = weightOf;
  protected readonly weightLabels = WEIGHT_LABEL;
  protected readonly UpIcon = ArrowUp;
  protected readonly DownIcon = ArrowDown;
  protected readonly fmt = formatScore;
  protected readonly dayLabel = dayLabel;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly review = signal<Review | null>(null);
  protected readonly pin = computed(() => pinningFor(this.review()?.id ?? 'x', this.review()?.stock));
  protected readonly date = computed(() => {
    const r = this.review();
    return r ? dateFmt.format(parseDay(r.completedAt)) : '';
  });

  open(review: Review): void {
    this.review.set(review);
    this.dialog().nativeElement.showModal();
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement) this.close();
  }
}
