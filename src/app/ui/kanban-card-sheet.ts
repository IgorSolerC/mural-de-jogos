import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { BookOpen, Check, LucideAngularModule, Plus, X } from 'lucide-angular';
import { IMPORTANCES, IMPORTANCE_LABEL, Importance, KanbanBoard, TRAIT_MAX, addTrait, setImportance, toggleTrait } from '../core/kanban';
import { KanbanActions } from '../core/kanban-actions';
import { KanbanStore } from '../core/kanban-store';
import { ReviewStore } from '../core/review-store';
import { pinningFor } from '../core/wall-physics';
import { BackdropClose } from './backdrop-close';
import { COLUMN_ICON, IMPORTANCE_LEVEL } from './kanban-icons';
import { Pin } from './pin';

/**
 * A folha de uma anotação no quadro (o botão da etiqueta, ou as etiquetas da ficha): em que etapa
 * ela está, a importância e as características. Tudo vale na hora (não tem "Salvar"); mudar de etapa
 * passa por `KanbanActions` (finaliza ou abre de novo, como arrastar). Ler a anotação fecha a folha
 * e abre a leitura; Tirar do quadro deixa a anotação no mural.
 */
@Component({
  selector: 'app-kanban-card-sheet',
  imports: [BackdropClose, LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet ficha-quadro" aria-labelledby="fq-titulo" (close)="closed.emit()" (backdropClose)="close()">
      @if (data(); as d) {
        <div class="ficha cartolina" [style.--stock]="'var(--stock-' + d.stock + ')'" [attr.data-cor]="d.stock">
          <app-pin class="pin" color="#e62e2d" />
          <header class="head">
            <div class="titulos">
              <h2 id="fq-titulo">{{ d.note.game.name }}</h2>
              <p class="sub">No quadro {{ d.board.name }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
          </header>

          <div class="body">
            <section class="grupo" aria-labelledby="fq-etapa">
              <h3 class="grupo-titulo" id="fq-etapa">Etapa</h3>
              <div class="etapas" role="radiogroup" aria-labelledby="fq-etapa">
                @for (c of d.board.columns; track c.id) {
                  @let on = c.id === d.card.column;
                  <button type="button" role="radio" class="etapa" [attr.aria-checked]="on" [style.--stock]="'var(--stock-' + c.color + ')'" (click)="moveTo(c.id)">
                    <lucide-icon [img]="iconOf[c.icon]" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
                    <span class="etapa-nome">{{ c.name }}</span>
                    @if (c.finishes) {
                      <span class="sr-only">(finaliza)</span>
                    }
                  </button>
                }
              </div>
              @if (finishHint(); as h) {
                <p class="dica">{{ h }}</p>
              }
            </section>

            <section class="grupo" aria-labelledby="fq-imp">
              <h3 class="grupo-titulo" id="fq-imp">Importância</h3>
              <div class="cartela" role="radiogroup" aria-labelledby="fq-imp">
                @for (i of importances; track i) {
                  @let on = d.card.importance === i;
                  <button type="button" role="radio" class="imp" [class.colado]="on" [attr.data-imp]="i" [attr.aria-checked]="on" (click)="setImp(on ? null : i)">
                    <span class="escala" aria-hidden="true">
                      @for (n of steps; track n) {
                        <i [class.acesa]="n <= level[i]"></i>
                      }
                    </span>
                    {{ impLabel[i] }}
                  </button>
                }
                <button type="button" role="radio" class="imp nenhuma" [class.colado]="!d.card.importance" [attr.aria-checked]="!d.card.importance" (click)="setImp(null)">Nenhuma</button>
              </div>
            </section>

            <section class="grupo" aria-labelledby="fq-car">
              <h3 class="grupo-titulo" id="fq-car">Características</h3>
              <p class="dica">Só deste quadro: não mudam as tags da anotação.</p>
              @if (d.board.traits.length) {
                <ul class="fitas" aria-labelledby="fq-car">
                  @for (t of d.board.traits; track t.id) {
                    @let on = d.card.traits.includes(t.id);
                    <li>
                      <button type="button" class="fita" [class.colada]="on" [attr.data-fita]="t.color" [attr.aria-pressed]="on" (click)="toggle(t.id)">
                        @if (on) {
                          <lucide-icon [img]="CheckIcon" [size]="12" [strokeWidth]="3.4" aria-hidden="true" />
                        }
                        {{ t.name }}
                      </button>
                    </li>
                  }
                </ul>
              }
              <form class="nova" (submit)="$event.preventDefault(); create()">
                <label class="campo">
                  <span class="sr-only">Nova característica</span>
                  <input
                    #campo
                    type="text"
                    autocomplete="off"
                    [maxLength]="traitMax"
                    placeholder="Nova: Correção, Sincronização…"
                    [value]="typed()"
                    (input)="typed.set($any($event.target).value)"
                  />
                </label>
                <button type="submit" class="papel" [disabled]="!typed().trim()">
                  <lucide-icon [img]="PlusIcon" [size]="16" [strokeWidth]="2.8" aria-hidden="true" />
                  Pôr
                </button>
              </form>
            </section>
          </div>

          <footer class="foot">
            <button type="button" class="papel perigo" (click)="removeFromBoard()">Tirar do quadro</button>
            <div class="actions">
              <button type="button" class="btn-ink" (click)="read()">
                <lucide-icon [img]="ReadIcon" [size]="18" [strokeWidth]="2.4" aria-hidden="true" />
                Ler a anotação
              </button>
            </div>
          </footer>
        </div>
      }
    </dialog>
  `,
  styleUrl: './kanban-card-sheet.scss',
})
export class KanbanCardSheet {
  readonly boardId = input.required<string>();
  readonly noteId = input.required<string>();
  readonly closed = output<void>();
  /** Ler a anotação: a página abre a leitura (a folha já fechou). */
  readonly reading = output<string>();

  protected readonly CloseIcon = X;
  protected readonly CheckIcon = Check;
  protected readonly PlusIcon = Plus;
  protected readonly ReadIcon = BookOpen;
  protected readonly iconOf = COLUMN_ICON;
  protected readonly importances = IMPORTANCES;
  protected readonly impLabel = IMPORTANCE_LABEL;
  protected readonly level = IMPORTANCE_LEVEL;
  protected readonly steps = [1, 2, 3, 4, 5];
  protected readonly traitMax = TRAIT_MAX;
  protected readonly typed = signal('');

  private readonly kanban = inject(KanbanStore);
  private readonly actions = inject(KanbanActions);
  private readonly store = inject(ReviewStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly data = computed(() => {
    const board = this.kanban.get(this.boardId());
    const note = this.store.get(this.noteId());
    const card = board?.cards.find((c) => c.note === this.noteId());
    if (!board || !note || !card) return null;
    return { board, note, card, stock: pinningFor(note.id, note.stock).stock };
  });

  /** O que a etapa de agora faz com a anotação, quando ela finaliza. */
  protected readonly finishHint = computed(() => {
    const d = this.data();
    const col = d?.board.columns.find((c) => c.id === d.card.column);
    if (!d || !col) return null;
    if (col.finishes) return `${col.name} finaliza a anotação. Levar para outra etapa abre ela de novo.`;
    const done = d.board.columns.filter((c) => c.finishes).map((c) => c.name);
    return done.length ? `Levar para ${done.join(' ou ')} finaliza a anotação.` : null;
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('.etapa[aria-checked="true"]')?.focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected moveTo(column: string): void {
    const d = this.data();
    if (!d || d.card.column === column) return;
    this.actions.move(d.board.id, d.note.id, column);
  }

  protected setImp(i: Importance | null): void {
    this.kanban.update(this.boardId(), (b, at) => setImportance(b, this.noteId(), i, at));
  }

  protected toggle(trait: string): void {
    this.kanban.update(this.boardId(), (b, at) => toggleTrait(b, this.noteId(), trait, at));
  }

  /** Uma característica nova (ou a que já tem o nome), já colada na anotação. */
  protected create(): void {
    const name = this.typed().trim();
    if (!name) return;
    const note = this.noteId();
    this.kanban.update(this.boardId(), (b, at) => {
      const { board, id } = addTrait(b, name, at);
      if (!id) return board;
      const card = board.cards.find((c) => c.note === note);
      return card?.traits.includes(id) ? board : toggleTrait(board, note, id, at);
    });
    this.typed.set('');
  }

  protected removeFromBoard(): void {
    const board: KanbanBoard | undefined = this.kanban.get(this.boardId());
    if (board) this.actions.remove(board, this.noteId());
    this.close();
  }

  protected read(): void {
    const id = this.noteId();
    this.close();
    this.reading.emit(id);
  }
}
