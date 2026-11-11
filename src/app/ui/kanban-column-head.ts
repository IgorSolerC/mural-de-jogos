import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { KanbanColumn } from '../core/kanban';
import { sortSentence, sortShort } from '../core/kanban-sort';
import { ICON, ICON_CHOICE, IconModule } from './icons';

/**
 * A etiqueta de uma coluna do Kanban: o desenho e o nome na cor da coluna, quantas anotações ela tem, a ordem
 * dela (quando não é à mão) e o selo "Finaliza". A peça que o quadro do dono e o da visita montam (a regra
 * "Visita: as mesmas peças do dono"); o lápis dos ajustes da coluna só para quem mexe (`editable`).
 */
@Component({
  selector: 'app-kanban-column-head',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <!-- a roda do mouse na etiqueta rola a lista da coluna, e não a página (quem monta põe appColumnWheel em volta) -->
    <header class="etiqueta" [attr.data-cor]="col().color">
      <lucide-icon class="etiqueta-icone" [img]="iconOf[col().icon]" [size]="20" aria-hidden="true" />
      <h2 class="etiqueta-nome" [attr.id]="ids() ? 'col-' + col().id : null">
        {{ col().name }}
        <!-- quantas: impresso miúdo na ponta da etiqueta, sempre no mesmo lugar, como nas abas dos quadros -->
        <span class="etiqueta-n"
          ><span class="sr-only">, </span>{{ total() }}<span class="sr-only">{{ total() === 1 ? ' anotação' : ' anotações' }}</span></span
        >
      </h2>
      @if (editable()) {
        <button
          type="button"
          class="etiqueta-btn"
          [attr.aria-label]="'Ajustes da coluna ' + col().name"
          title="Ajustes da coluna"
          aria-haspopup="dialog"
          (click)="edit.emit()"
        >
          <lucide-icon [img]="PencilIcon" [size]="16" aria-hidden="true" />
        </button>
      }
      @if (col().sort?.length) {
        <!-- a ordem da coluna, impressa miúdo embaixo do nome: diz por que as anotações estão assim -->
        <p class="etiqueta-ordem" [title]="sortSentence(col().sort!)">
          <lucide-icon [img]="SortIcon" [size]="13" aria-hidden="true" />
          {{ sortShort(col().sort!) }}
        </p>
      }
      @if (col().finishes) {
        <!-- o carimbo de quem finaliza -->
        <span class="carimbo" title="Finaliza as anotações que chegam aqui">
          <lucide-icon [img]="DoneIcon" [size]="12" aria-hidden="true" />
          Finaliza
        </span>
      }
    </header>
  `,
  styleUrl: './kanban-column-head.scss',
})
export class KanbanColumnHead {
  readonly col = input.required<KanbanColumn>();
  readonly total = input(0);
  /** O lápis dos ajustes da coluna (o dono do quadro; nunca na visita nem para quem só lê). */
  readonly editable = input(false);
  /** O id do nome (a coluna aponta para ele); fora do quadro (o palco da aba Kanban do editor), sem, para não repetir. */
  readonly ids = input(true);
  readonly edit = output<void>();

  protected readonly PencilIcon = ICON.editar;
  protected readonly DoneIcon = ICON.feito;
  protected readonly SortIcon = ICON.ordenarDecrescente;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly sortShort = sortShort;
  protected readonly sortSentence = sortSentence;
}
