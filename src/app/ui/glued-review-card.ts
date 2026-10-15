import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CARD_IMPORTS, CARD_STYLES, CARD_TEMPLATE, ReviewCard } from './review-card';

/**
 * A ficha colada no texto de outra (o widget Nota, ver ui/linked-card.ts): o mesmo molde e os mesmos
 * estilos da ficha do mural, num componente à parte. Os estilos do Angular ficam presos ao componente
 * pelo atributo dele: dentro da ficha de fora (o mesmo componente), as regras dela ("a anotação sem
 * capa", "a finalizada"…) pegariam também os pedaços desta. Com outro componente, cada uma tem o seu
 * atributo. A luz da lâmpada e o que vai no elemento vêm da ReviewCard (herdados).
 *
 * Ela é colada (ver LinkedCard), e não pregada: sem a tachinha, com a sombra curta do papel
 * encostado. Mora num arquivo só dela, que chega junto com a ficha colada: a cópia dos estilos não
 * pesa no carregamento do site.
 */
@Component({
  selector: 'app-review-card',
  imports: CARD_IMPORTS,
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: CARD_TEMPLATE,
  styles: [
    CARD_STYLES,
    `
      /* Colada, ela não cai nem gira em volta da tachinha (o --drop-y e o --tilt do papel dela):
         fica reta, rente ao alto do lugar, onde foi colada. E não se mexe com o mouse: nem
         desgruda, nem puxa a orelha (o foco do teclado continua no contorno). */
      :host,
      :host(:hover:not([data-quieta])),
      :host(:has(:focus-visible)),
      :host(:active) {
        margin-top: 0;
        rotate: none;
        translate: none;
        /* a sombra curta e sutil do vinil do widget de música (ver audio-track.ts), em drop-shadow:
           serve também para o papel recortado */
        box-shadow: none;
        filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 3px 4px rgb(0 0 0 / 0.28));
        transition: none;
      }
      :host(.recortada),
      :host(.recortada:hover),
      :host(.recortada:hover:not([data-quieta])),
      :host(.recortada:has(:focus-visible)),
      :host(.recortada:active) {
        filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 3px 4px rgb(0 0 0 / 0.28));
      }
      :host(:hover:not([data-quieta])) .aba-cat,
      :host(:has(:focus-visible)) .aba-cat,
      :host(:active) .aba-cat {
        translate: none;
      }
      .pin {
        display: none;
      }
    `,
  ],
})
export class GluedReviewCard extends ReviewCard {}
