import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON_CHOICE, IconModule } from './icons';
import { CategoryLook } from '../core/category-looks';
import { categoryBonus } from '../core/note-labels';
import { bonusIcon } from './bonus';

/** O desenho da categoria: o escolhido, ou o de sempre (o da cartela, ou a pasta). */
export function categoryIcon(category: string, look: CategoryLook = {}): LucideIconData {
  return look.icon ? ICON_CHOICE[look.icon] : bonusIcon(categoryBonus(category));
}

/**
 * O desenho e o nome da categoria, como na orelha da ficha e na aba da pasta. A letra e o tamanho
 * vêm de quem usa (herdados); a borda da cor é da orelha (ver .orelha-cor em styles.scss), e o
 * desenho, dentro de uma orelha com cor, pega a cor dela.
 */
@Component({
  selector: 'app-cat-label',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `<lucide-icon class="icone" [img]="icon()" [size]="iconSize()" aria-hidden="true" /><span class="nome">{{ label() }}</span>`,
  styles: `
    :host {
      display: inline-flex;
      align-items: center;
      gap: 5px;
      min-width: 0;
      max-width: 100%;
    }
    .icone {
      flex: none;
      display: inline-flex;
      opacity: 0.8;
    }
    /* na orelha com cor, o desenho é da cor dela, cheio (o nome continua na tinta preta) */
    :host-context(.orelha-cor) .icone {
      color: var(--cat-cor);
      opacity: 1;
    }
    /* a linha de base do rótulo é a do nome: ao lado de um número (nas abas), os dois se alinham */
    .nome {
      align-self: baseline;
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
  `,
})
export class CategoryLabel {
  readonly label = input.required<string>();
  readonly look = input<CategoryLook>({});
  readonly iconSize = input(13);
  /** O desenho de quem não é categoria de anotação (o artista, nas músicas): vale no lugar do dela. */
  readonly glyph = input<LucideIconData | null>(null);

  protected readonly icon = computed(() => this.glyph() ?? categoryIcon(this.label(), this.look()));
}
