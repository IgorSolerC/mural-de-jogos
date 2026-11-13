import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Wish, relevanceLabel, relevanceOf } from '../core/review';
import { ICON, IconModule } from './icons';

/**
 * A etiqueta de hover de um desejo da Wishlist (PLANO-WISHLIST.md, D4), no padrão do Finalizar e do Fixar
 * (`ui/_etiqueta-acoes.scss`): Editar (o desenho dos ajustes, amarelo na mão) e Vontade (o adesivo, que abre o
 * menu do site com as três vontades). O Vontade fica na cor da vontade de agora: vermelho no MUST, azul no
 * LATER. A mesma peça no recorte e na capa da Grade; quem usa decide onde ela fica (acima do papel com o
 * mouse; embaixo da capa no toque) e a mostra com a mão em cima do card (`.desejo` e `app-wish-cover`).
 */
@Component({
  selector: 'app-wish-actions',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="acoes">
      @if (editable()) {
        <button type="button" class="botao editar" [attr.aria-label]="'Editar ' + wish().game.name" title="Editar" (click)="edit.emit()">
          <lucide-icon [img]="EditIcon" [size]="16" aria-hidden="true" />
        </button>
      }
      <button
        type="button"
        class="botao vontade"
        [class.vontade-must]="rel() === 'must'"
        [class.vontade-later]="rel() === 'later'"
        aria-haspopup="menu"
        [attr.aria-label]="'Quanta vontade de ' + wish().game.name + ': ' + label() + '. Mudar'"
        title="Quanta vontade?"
        (click)="vontade.emit({ el: $any($event.currentTarget), keyboard: $event.detail === 0 })"
      >
        <lucide-icon [img]="StickerIcon" [size]="16" aria-hidden="true" />
      </button>
    </div>
  `,
  styles: `
    @use 'etiqueta-acoes' as et;

    :host {
      display: block;
    }
    .acoes {
      @include et.grupo;
    }
    .botao {
      @include et.botao;
    }
    .editar {
      @include et.cor-na-mao(var(--etiqueta-amarelo));
    }
    .vontade {
      @include et.cor-na-mao(var(--etiqueta-vermelho));
    }
    /* a vontade de agora, na cor dela */
    .vontade-must {
      color: var(--etiqueta-vermelho);
    }
    .vontade-later {
      color: var(--etiqueta-azul);
    }
    :host-context(.desejo:hover) .botao,
    :host-context(app-wish-cover:hover) .botao,
    .acoes:has(:focus-visible) .botao {
      @include et.mostra;
    }
  `,
})
export class WishActions {
  readonly wish = input.required<Wish>();
  /** Com o Editar (o editar sem resenhar). */
  readonly editable = input(true);
  /** O Editar: abre a folha do desejo. */
  readonly edit = output<void>();
  /** O Vontade: abre o menu das vontades embaixo do botão (pelo teclado, o foco desce para ele). */
  readonly vontade = output<{ el: HTMLElement; keyboard: boolean }>();

  protected readonly EditIcon = ICON.ajustar;
  protected readonly StickerIcon = ICON.adesivo;
  protected readonly rel = computed(() => relevanceOf(this.wish()));
  protected readonly label = computed(() => relevanceLabel(this.wish().kind, this.rel()));
}
