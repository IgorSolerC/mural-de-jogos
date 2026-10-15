import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { lookOf } from '../core/paper';
import { paperVars } from '../core/paper-art';
import { Review, artIdOf, isDarkStock } from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { PaperArtLayer } from './paper-layer';

/**
 * A cartolina de uma ficha em miniatura, no lugar da capa que ela não tem (a anotação sem foto, nas
 * pastas do perfil): a cor, o papel, a estampa, o rabisco, o estrago, a mancha e a decoração, com
 * o título a pincel atômico, grande, cortado onde a folha acaba. É desenhada no tamanho de uma ficha (quatro vezes a caixa) e reduzida, para os
 * desenhos saírem como na ficha de verdade, só que pequenos. Enche a caixa em que for posta.
 */
@Component({
  selector: 'app-mini-cartolina',
  imports: [PaperArtLayer],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <div class="folha" [style]="vars()" [style.--stock]="'var(--stock-' + stock() + ')'" [attr.data-cor]="stock()">
      <app-paper-art [id]="artId()" [scribble]="review().scribble" [scribbleSeed]="review().scribbleSeed" [scribbleInk]="review().scribbleInk" [paper]="review().paper" [paperSeed]="review().paperSeed" [damage]="review().damage" [seed]="review().damageSeed" [stains]="review().stains" [decors]="review().decors" [glitter]="review().paper === 'glitter'" [dark]="dark()" [content]="review()" />
      <!-- o título, como na ficha: queima junto com o papel (data-queima) e não precisa caber -->
      <p class="titulo" data-queima>{{ review().game.name }}</p>
    </div>
  `,
  styles: `
    :host {
      position: absolute;
      inset: 0;
      overflow: hidden;
      container-type: size;
      pointer-events: none;
    }
    /* o papel mede a folha pelo tamanho sem a escala (offsetWidth): desenha como numa ficha */
    .folha {
      position: absolute;
      top: 0;
      left: 0;
      isolation: isolate;
      width: calc(100cqw * 4);
      height: calc(100cqh * 4);
      transform: scale(0.25);
      transform-origin: 0 0;
      color: var(--ink);
    }
    /* na cartolina escura, a tinta clara */
    .folha:is([data-cor$='-escuro'], [data-cor='preto']) {
      color: var(--ink-claro-solido);
    }
    .titulo {
      position: absolute;
      top: 7%;
      left: 9%;
      right: 4%;
      margin: 0;
      font-family: var(--f-marker);
      font-size: 3.1rem;
      line-height: 1;
      overflow-wrap: anywhere;
      rotate: -2deg;
    }
  `,
})
export class MiniCartolina {
  readonly review = input.required<Review>();

  /** O mesmo desenho da ficha: o rabisco e o estrago saem iguais (ver artIdOf). */
  protected readonly artId = computed(() => artIdOf(this.review()));
  /** A cartolina da ficha (a mesma do mural). */
  protected readonly stock = computed(() => pinningFor(this.review().id, this.review().stock).stock);
  protected readonly dark = computed(() => isDarkStock(this.stock()));
  protected readonly vars = computed(() => {
    const r = this.review();
    return paperVars(r.paper, r.pattern, lookOf(r), r.patternSeed, this.dark());
  });
}
