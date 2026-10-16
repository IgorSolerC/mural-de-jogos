import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { LucideAngularModule, SlidersHorizontal } from 'lucide-angular';
import { IMPORTANCE_LABEL, KanbanCard } from '../core/kanban';
import { Review } from '../core/review';
import { Settings } from '../core/settings';
import { pinningFor } from '../core/wall-physics';
import { IMPORTANCE_LEVEL } from './kanban-icons';
import { CARD_IMPORTS, CARD_STYLES, CARD_TEMPLATE, ReviewCard } from './review-card';

/**
 * A ficha simples da anotação pregada numa coluna do quadro: o mesmo molde e os mesmos estilos da
 * ficha do mural (como a ficha colada do widget Nota, ver ui/glued-review-card.ts), num componente
 * à parte, para os estilos da página não pegarem nela. Na tira de papel pardo da coluna, quase reta
 * (40% da inclinação dela no mural) e sem a queda da parede. Mais enxuta que a do mural: sem a
 * tachinha, o nome menor, sem a orelha da categoria e sem o "Parte de…" da sub-nota (`onBoard`).
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
      :host(.compact) {
        --title-fs: 1.04rem;
        /* a faixa mais baixa: a capa (que tem a altura dela) fica pequena, um lembrete do que é */
        --strip-h: 76px;
        padding: 12px 12px 10px;
      }
      :host(.compact) .words {
        padding-top: 0;
      }
      /* no quadro, sem tachinha: uma em cada ficha era só barulho */
      .pin {
        display: none;
      }
      :host(.compact) .meta {
        margin-top: 2px;
        font-size: 0.76rem;
        line-height: 18px;
      }
    `,
  ],
})
export class KanbanReviewCard extends ReviewCard {
  protected override readonly onBoard = true;
}

/**
 * Uma anotação no quadro (ver pages/kanban-page.ts), numa de duas vistas:
 * - **fichas**: a ficha simples dela (com as tags dela, cada uma na sua cor) e, colada na beirada
 *   de baixo, a etiqueta de importância; tocar na ficha abre a leitura.
 * - **títulos** (`dense`): só uma tira da cartolina dela com o nome e a escala da importância, para
 *   caber o quadro inteiro na tela.
 * Nas duas, a etiqueta de tinta dos ajustes (como o Fixar e o Finalizar do mural) aparece com o mouse
 * em cima ou o foco do teclado, e abre a folha da anotação no quadro; no toque, fica sempre (na tira,
 * só o desenho, na ponta dela).
 */
@Component({
  selector: 'app-kanban-note',
  imports: [KanbanReviewCard, LucideAngularModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-ficha]': 'review().id', '[class.titulo]': 'dense()' },
  template: `
    @if (dense()) {
      <div class="tira cartolina" [attr.data-cor]="pin().stock" [style.--stock]="'var(--stock-' + pin().stock + ')'" [style.--tilt]="pin().tilt">
        <button type="button" class="hit tira-nome" [attr.aria-label]="spoken()" (click)="opened.emit(review().id)">{{ review().game.name }}</button>
        @if (card().importance; as imp) {
          <span class="imp-mini" [attr.data-imp]="imp" [title]="'Importância: ' + label[imp]" aria-hidden="true">
            <span class="escala">
              @for (n of steps; track n) {
                <i [class.acesa]="n <= level[imp]"></i>
              }
            </span>
          </span>
        }
        <ng-container [ngTemplateOutlet]="adjust" />
      </div>
    } @else {
      <app-review-card [review]="review()" [compact]="true" [preview]="true" [checkable]="true" [looks]="looks()" (opened)="opened.emit(review().id)" />
      @if (card().importance; as imp) {
        <div class="pe">
          <button type="button" class="imp" [attr.data-imp]="imp" [attr.aria-label]="'Importância: ' + label[imp] + '. Mudar'" (click)="details.emit()">
            <span class="escala" aria-hidden="true">
              @for (n of steps; track n) {
                <i [class.acesa]="n <= level[imp]"></i>
              }
            </span>
            {{ label[imp] }}
          </button>
        </div>
      }
      <ng-container [ngTemplateOutlet]="adjust" />
    }
    <ng-template #adjust>
      <button type="button" class="mexer" [attr.aria-label]="'Etapa, importância e tags de ' + review().game.name" title="Etapa, importância e tags" aria-haspopup="dialog" (click)="details.emit()">
        <lucide-icon [img]="AdjustIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
      </button>
    </ng-template>
  `,
  styleUrl: './kanban-note.scss',
})
export class KanbanNote {
  readonly review = input.required<Review>();
  readonly card = input.required<KanbanCard>();
  /** A vista "Só os títulos": a tira com o nome e a importância, no lugar da ficha. */
  readonly dense = input(false);
  readonly opened = output<string>();
  readonly details = output<void>();

  protected readonly AdjustIcon = SlidersHorizontal;
  protected readonly label = IMPORTANCE_LABEL;
  protected readonly level = IMPORTANCE_LEVEL;
  protected readonly steps = [1, 2, 3, 4, 5];
  protected readonly looks = inject(Settings).categoryLooks;
  /** A cartolina e a inclinação da ficha no mural: a tira é do mesmo papel. */
  protected readonly pin = computed(() => pinningFor(this.review().id, this.review().stock));
  /** O que o leitor de tela diz da tira: o nome, a importância e se está finalizada. */
  protected readonly spoken = computed(() => {
    const r = this.review();
    const imp = this.card().importance;
    return [r.game.name, imp ? `importância ${IMPORTANCE_LABEL[imp].toLowerCase()}` : '', r.doneAt ? 'finalizada' : ''].filter(Boolean).join(', ');
  });
}
