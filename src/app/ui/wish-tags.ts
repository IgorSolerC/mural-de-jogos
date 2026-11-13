import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import type { Kind } from '../core/kinds';
import { Settings } from '../core/settings';
import { wishTagHex } from '../core/wishlist-view';

/**
 * As tags de um desejo da Wishlist, embaixo do recorte e da capa da Grade (PLANO-WISHLIST.md, D2): a legenda
 * impressa da revista, em caixa alta miúda na tinta da parede, cada tag com o quadradinho na cor que o dono
 * deu a ela; sem cor, só o contorno (um quadradinho pardo pareceria uma cor). Quieta, para não competir com
 * o recorte. O leitor de tela ouve "Tags: co-op, curto".
 */
@Component({
  selector: 'app-wish-tags',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="sr-only">Tags: {{ tags().join(', ') }}</span>
    @for (t of items(); track t.label) {
      <span class="tag" [class.sem-cor]="!t.color" [style.--t]="t.color" aria-hidden="true">{{ t.label }}</span>
    }
  `,
  styles: `
    :host {
      position: relative;
      z-index: 5;
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 2px 9px;
      pointer-events: none;
      /* a tinta da parede um pouco mais clara que a de apoio: a letra miúda passa de 4,5:1 */
      color: #d3ccbf;
    }
    .tag {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.78rem;
      line-height: 1.3;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      overflow-wrap: anywhere;
    }
    .tag::before {
      content: '';
      flex: none;
      width: 7px;
      height: 7px;
      border-radius: 1px;
      background: var(--t);
      box-shadow: 0 0 0 1px rgb(0 0 0 / 0.3);
    }
    .sem-cor::before {
      background: none;
      box-shadow: inset 0 0 0 1.25px currentColor;
    }
  `,
})
export class WishTags {
  readonly tags = input.required<readonly string[]>();
  readonly kind = input.required<Kind>();

  private readonly settings = inject(Settings);
  protected readonly items = computed(() => {
    const colors = this.settings.notesConfig().wishTagColors;
    return this.tags().map((label) => ({ label, color: wishTagHex(colors, this.kind(), label) }));
  });
}
