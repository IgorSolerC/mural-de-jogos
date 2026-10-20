import { ChangeDetectionStrategy, Component, input, model } from '@angular/core';
import { ICON_CHOICE, IconModule } from './icons';
import { IMPORTANCES, IMPORTANCE_LABEL, Importance, KanbanBoard, STATUS_MAX } from '../core/kanban';
import { IMPORTANCE_LEVEL } from './kanban-icons';
import { roveRadios } from './focus';

let uid = 0;

/**
 * O lugar da anotação no quadro do grupo dela, no editor (a parte Quadro): a etapa (ou fora do
 * quadro), a importância e o status. Os mesmos recortes da folha da anotação no quadro
 * (ui/kanban-card-sheet.ts), mas nada vale na hora: o editor guarda o que foi escolhido e aplica ao
 * salvar (ver `ReviewEditor.applyBoard`).
 */
@Component({
  selector: 'app-board-place',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="grupo" role="radiogroup" [attr.aria-labelledby]="id + '-etapa'" (keydown)="rove($event)">
      <p class="grupo-titulo" [id]="id + '-etapa'">Etapa</p>
      <div class="etapas">
        <button type="button" role="radio" class="etapa fora" [attr.aria-checked]="column() === null" (click)="column.set(null)">Fora do quadro</button>
        @for (c of board().columns; track c.id) {
          <button type="button" role="radio" class="etapa" [attr.aria-checked]="c.id === column()" [attr.data-cor]="c.color" (click)="column.set(c.id)">
            <lucide-icon [img]="iconOf[c.icon]" [size]="16" aria-hidden="true" />
            <span class="etapa-nome">{{ c.name }}</span>
            @if (c.finishes) {
              <span class="sr-only">(finaliza)</span>
            }
          </button>
        }
      </div>
    </div>
    @if (column() !== null) {
      <div class="grupo" role="radiogroup" [attr.aria-labelledby]="id + '-imp'" (keydown)="rove($event)">
        <p class="grupo-titulo" [id]="id + '-imp'">Importância</p>
        <div class="cartela">
          @for (i of importances; track i) {
            @let on = importance() === i;
            <button type="button" role="radio" class="imp" [class.colado]="on" [attr.data-imp]="i" [attr.aria-checked]="on" (click)="importance.set(on ? null : i)">
              <span class="escala" aria-hidden="true">
                @for (n of steps; track n) {
                  <i [class.acesa]="n <= level[i]"></i>
                }
              </span>
              {{ impLabel[i] }}
            </button>
          }
          <button type="button" role="radio" class="imp nenhuma" [class.colado]="!importance()" [attr.aria-checked]="!importance()" (click)="importance.set(null)">Nenhuma</button>
        </div>
      </div>
      <label class="grupo">
        <span class="grupo-titulo">Status</span>
        <span class="campo">
          <input type="text" autocomplete="off" enterkeyhint="done" [maxLength]="statusMax" placeholder="Em revisão, Com o Sérgio…" [value]="status()" (input)="status.set($any($event.target).value)" (keydown.enter)="$event.preventDefault()" />
        </span>
      </label>
    }
  `,
  styleUrl: './board-place.scss',
})
export class BoardPlace {
  readonly board = input.required<KanbanBoard>();
  /** A coluna; null: fora do quadro. */
  readonly column = model<string | null>(null);
  readonly importance = model<Importance | null>(null);
  readonly status = model('');

  protected readonly id = `quadro-${++uid}`;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly importances = IMPORTANCES;
  protected readonly impLabel = IMPORTANCE_LABEL;
  protected readonly level = IMPORTANCE_LEVEL;
  protected readonly steps = [1, 2, 3, 4, 5];
  protected readonly statusMax = STATUS_MAX;
  protected readonly rove = roveRadios;
}
