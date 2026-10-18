import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CARD_IMPORTS, CARD_STYLES, CARD_TEMPLATE, ReviewCard } from './review-card';

/**
 * A anotação anexada a um lembrete, no dia aberto do Calendário: a ficha simples dela (o mesmo molde
 * e os mesmos estilos da ficha do mural, num componente à parte, como a do Kanban e a do widget Nota,
 * para os estilos da página não pegarem nela). Ela não é pregada: está presa ao lembrete por um clipe
 * (desenhado pela página), então fica sem a tachinha, quase reta e sem a queda da parede.
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
        --inclina: 0.35;
        margin-top: 0;
        max-width: none;
      }
      :host(.compact) {
        --title-fs: 1.12rem;
        --strip-h: 92px;
        padding: 13px 13px 11px;
      }
      :host(.compact) .words {
        padding-top: 0;
      }
      .pin {
        display: none;
      }
    `,
  ],
})
export class ClippedReviewCard extends ReviewCard {}
