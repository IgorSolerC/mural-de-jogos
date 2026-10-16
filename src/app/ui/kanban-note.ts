import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LucideAngularModule, Tags } from 'lucide-angular';
import { IMPORTANCE_LABEL, KanbanCard, KanbanTrait } from '../core/kanban';
import { Review } from '../core/review';
import { Settings } from '../core/settings';
import { IMPORTANCE_LEVEL } from './kanban-icons';
import { CARD_IMPORTS, CARD_STYLES, CARD_TEMPLATE, ReviewCard } from './review-card';

/**
 * A ficha simples da anotação pregada numa coluna do quadro: o mesmo molde e os mesmos estilos da
 * ficha do mural (como a ficha colada do widget Nota, ver ui/glued-review-card.ts), num componente
 * à parte, para os estilos da página não pegarem nela. Pregada na tira de papel pardo da coluna: com
 * a tachinha, quase reta (40% da inclinação dela no mural) e sem a queda da parede.
 */
@Component({
  selector: 'app-review-card',
  imports: CARD_IMPORTS,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: CARD_TEMPLATE,
  styles: [
    CARD_STYLES,
    `
      :host {
        --inclina: 0.4;
        margin-top: 0;
        max-width: none;
      }
    `,
  ],
})
export class KanbanReviewCard extends ReviewCard {}

/**
 * Uma anotação no quadro (ver pages/kanban-page.ts): a ficha simples dela e, colados na beirada de
 * baixo, a etiqueta de importância e as fitas Dymo das características. O botão da etiqueta (e as
 * próprias etiquetas) abre a folha da anotação no quadro; tocar na ficha abre a leitura.
 */
@Component({
  selector: 'app-kanban-note',
  imports: [KanbanReviewCard, LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-ficha]': 'review().id' },
  template: `
    <app-review-card [review]="review()" [compact]="true" [preview]="true" [checkable]="true" [looks]="looks()" (opened)="opened.emit(review().id)" />
    <div class="pe">
      @if (card().importance; as imp) {
        <button type="button" class="imp" [attr.data-imp]="imp" [attr.aria-label]="'Importância: ' + label[imp] + '. Mudar'" (click)="details.emit()">
          <span class="escala" aria-hidden="true">
            @for (n of steps; track n) {
              <i [class.acesa]="n <= level[imp]"></i>
            }
          </span>
          {{ label[imp] }}
        </button>
      }
      @for (t of traits(); track t.id) {
        <button type="button" class="dymo" [attr.data-fita]="t.color" [attr.aria-label]="'Característica: ' + t.name + '. Mudar'" (click)="details.emit()">{{ t.name }}</button>
      }
      <button type="button" class="mexer" [attr.aria-label]="'Importância e características de ' + review().game.name" title="Importância e características" (click)="details.emit()">
        <lucide-icon [img]="TagsIcon" [size]="15" [strokeWidth]="2.5" aria-hidden="true" />
      </button>
    </div>
  `,
  styleUrl: './kanban-note.scss',
})
export class KanbanNote {
  readonly review = input.required<Review>();
  readonly card = input.required<KanbanCard>();
  /** As características do quadro (as da anotação saem daqui, na ordem do quadro). */
  readonly boardTraits = input<readonly KanbanTrait[]>([]);
  readonly opened = output<string>();
  readonly details = output<void>();

  protected readonly TagsIcon = Tags;
  protected readonly label = IMPORTANCE_LABEL;
  protected readonly level = IMPORTANCE_LEVEL;
  protected readonly steps = [1, 2, 3, 4, 5];
  protected readonly looks = inject(Settings).categoryLooks;
  protected readonly traits = computed(() => {
    const on = new Set(this.card().traits);
    return this.boardTraits().filter((t) => on.has(t.id));
  });
}
