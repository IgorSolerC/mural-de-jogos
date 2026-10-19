import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { ICON, IconModule } from './icons';
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
 * O que vem dentro dela (a etiqueta da importância) vai junto quando ela sobe com o mouse.
 */
@Component({
  selector: 'app-review-card',
  imports: CARD_IMPORTS,
  changeDetection: ChangeDetectionStrategy.OnPush,
  // a etiqueta da importância vem de fora, colada na ficha (ver KanbanNote)
  template: CARD_TEMPLATE + '<ng-content />',
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
 * Nas duas, a etiqueta de tinta das ações (como o Fixar e o Finalizar do mural) aparece com o mouse
 * em cima ou o foco do teclado: os ajustes, que abrem a folha da anotação no quadro, e, fora da última
 * coluna, a seta que a leva para a coluna seguinte (a ponta só, como a do iPhone); no toque, fica
 * sempre (na tira, só os desenhos, na ponta dela).
 */
@Component({
  selector: 'app-kanban-note',
  imports: [KanbanReviewCard, IconModule, NgTemplateOutlet],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[attr.data-ficha]': 'review().id', '[class.titulo]': 'dense()' },
  template: `
    @if (dense()) {
      <div class="tira cartolina" [attr.data-cor]="pin().stock" [style.--stock]="'var(--stock-' + pin().stock + ')'" [style.--tilt]="pin().tilt">
        <button type="button" class="hit tira-nome" [attr.aria-label]="spoken()" (click)="opened.emit(review().id)">{{ review().game.name }}</button>
        @if (noText()) {
          <!-- só o título, ainda sem descrição: o lápis na tinta da tira, antes da importância -->
          <span class="sem-texto" title="Sem descrição" aria-hidden="true">
            <lucide-icon [img]="NoTextIcon" [size]="15" aria-hidden="true" />
          </span>
        }
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
      <app-review-card [review]="review()" [compact]="true" [preview]="true" [checkable]="true" [looks]="looks()" (opened)="opened.emit(review().id)">
        <!-- dentro da ficha: sobe e gira com ela quando o mouse chega -->
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
      </app-review-card>
      <ng-container [ngTemplateOutlet]="adjust" />
    }
    <ng-template #adjust>
      <!-- as ações da anotação, juntas numa etiqueta de tinta: os ajustes e, fora da última coluna, a seta que a leva para a próxima -->
      <div class="acoes" [class.duas]="!!next()">
        <button type="button" class="mexer" [attr.aria-label]="'Etapa, importância e tags de ' + review().game.name" title="Etapa, importância e tags" aria-haspopup="dialog" (click)="details.emit()">
          <lucide-icon [img]="AdjustIcon" [size]="16" aria-hidden="true" />
        </button>
        @if (next(); as to) {
          <button type="button" class="avancar" [attr.aria-label]="'Levar ' + review().game.name + ' para ' + to" [title]="'Levar para ' + to" (click)="advanced.emit()">
            <lucide-icon [img]="NextIcon" [size]="19" aria-hidden="true" />
          </button>
        }
      </div>
    </ng-template>
  `,
  styleUrl: './kanban-note.scss',
})
export class KanbanNote {
  readonly review = input.required<Review>();
  readonly card = input.required<KanbanCard>();
  /** A vista "Só os títulos": a tira com o nome e a importância, no lugar da ficha. */
  readonly dense = input(false);
  /** O nome da coluna seguinte (a da direita), para a seta que leva a anotação para lá; null na última. */
  readonly next = input<string | null>(null);
  readonly opened = output<string>();
  readonly details = output<void>();
  /** A seta: levar a anotação para a coluna seguinte. */
  readonly advanced = output<void>();

  protected readonly AdjustIcon = ICON.ajustar;
  protected readonly NextIcon = ICON.proximo;
  protected readonly NoTextIcon = ICON.escrever;
  /** A anotação só com o título, sem descrição (a ficha diz na linha da data; a tira, com o lápis). */
  protected readonly noText = computed(() => !this.review().text.trim());
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
    return [r.game.name, imp ? `importância ${IMPORTANCE_LABEL[imp].toLowerCase()}` : '', this.noText() ? 'sem descrição' : '', r.doneAt ? 'finalizada' : ''].filter(Boolean).join(', ');
  });
}
