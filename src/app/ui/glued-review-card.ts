import { ChangeDetectionStrategy, Component, computed } from '@angular/core';
import { lookOf } from '../core/paper';
import { ownPaperVars } from '../core/paper-art';
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
         fica reta, rente ao alto do lugar, onde foi colada, com a sombra curta e sutil do vinil do
         widget de música (ver audio-track.ts), em drop-shadow: serve também para o papel recortado. */
      :host,
      :host(.recortada),
      :host(.recortada:hover),
      :host(.recortada:active) {
        margin-top: 0;
        rotate: none;
        translate: none;
        box-shadow: none;
        filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 3px 4px rgb(0 0 0 / 0.28));
        transition:
          translate var(--t-ui) var(--ease-ui),
          filter var(--t-ui) var(--ease-ui);
      }
      /* Quando abre (sem quem abra, ela fica inert e o mouse não a pega), sobe um pouco, reta, e a
         orelha sobe junto (a regra da ficha do mural) */
      :host(:hover:not([data-quieta])),
      :host(:has(:focus-visible)),
      :host(.recortada:hover:not([data-quieta])),
      :host(.recortada:has(:focus-visible)) {
        rotate: none;
        translate: 0 -3px;
        box-shadow: none;
        filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3)) drop-shadow(0 7px 9px rgb(0 0 0 / 0.26));
      }
      @media (prefers-reduced-motion: reduce) {
        :host {
          transition: none;
        }
      }
      .pin {
        display: none;
      }
    `,
    `
      /* O papel próprio: a cartolina escura em volta pinta tudo o que está dentro com o papel escuro, e
         a clara com o reforço da fibra (styles.scss); a colada desfaz o que não é dela, pela cor dela
         (o mesmo para a tira e a faixa, em ui/linked-card.ts) */
      :host(.cartolina:not([data-cor$='-escuro']):not([data-cor='preto'])),
      :host(.cartolina:not([data-cor$='-escuro']):not([data-cor='preto'])) ::ng-deep .papel,
      :host(.cartolina:not([data-cor$='-escuro']):not([data-cor='preto'])) ::ng-deep .head {
        --textura-uso: var(--textura, none);
        --realce: none;
        --grao-img: var(--grao-claro-img);
        --estampa-uso: var(--estampa, none);
        --estampa-mistura: multiply;
      }
      :host(.cartolina),
      :host(.cartolina) ::ng-deep .papel,
      :host(.cartolina) ::ng-deep .head {
        --realce-grao: none;
      }
      :host(.cartolina[data-cor='amarelo']),
      :host(.cartolina[data-cor='amarelo']) ::ng-deep .papel,
      :host(.cartolina[data-cor='amarelo']) ::ng-deep .head,
      :host(.cartolina[data-cor='verde']),
      :host(.cartolina[data-cor='verde']) ::ng-deep .papel,
      :host(.cartolina[data-cor='verde']) ::ng-deep .head,
      :host(.cartolina[data-cor='azul']),
      :host(.cartolina[data-cor='azul']) ::ng-deep .papel,
      :host(.cartolina[data-cor='azul']) ::ng-deep .head,
      :host(.cartolina[data-cor='branco']),
      :host(.cartolina[data-cor='branco']) ::ng-deep .papel,
      :host(.cartolina[data-cor='branco']) ::ng-deep .head {
        --realce-grao: var(--grao-realce, var(--grao-realce-img, none));
      }
    `,
  ],
})
export class GluedReviewCard extends ReviewCard {
  /** O papel dela, inteiro: o que ela não tem não vem da ficha em volta (ver `ownPaperVars`). */
  protected override readonly paperVars = computed(() => ownPaperVars(this.review().paper, this.review().pattern, lookOf(this.review()), this.review().patternSeed, this.dark()));
}
