import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LucideIconData } from 'lucide-angular';
import { ICON, ICON_CHOICE, IconModule } from './icons';
import { CategoryLook, lookKey } from '../core/category-looks';
import { categoryBonus } from '../core/note-labels';
import { SHARED_GROUP } from '../core/shared-notes';
import { bonusIcon } from './bonus';

/**
 * O desenho da categoria: o escolhido, ou o de sempre (o da cartela, ou a pasta). O de sempre do grupo
 * Compartilhadas, onde chega a anotação que alguém compartilhou, é o de duas pessoas.
 */
export function categoryIcon(category: string, look: CategoryLook = {}): LucideIconData {
  if (look.icon) return ICON_CHOICE[look.icon];
  return lookKey(category) === lookKey(SHARED_GROUP) ? ICON.pessoas : bonusIcon(categoryBonus(category));
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
  host: { '[class.tingido]': 'tint()' },
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
    /* na orelha com cor, o desenho é da cor dela, cheio (o nome continua na tinta preta); tingido: o
       mesmo fora de uma orelha (o menu "Mais", ver ui/tab-more.ts) */
    :host(.tingido) .icone,
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
  /** O desenho na cor de `--cat-cor` sem estar numa orelha com cor (o menu "Mais"). */
  readonly tint = input(false);
  /** O desenho de quem não é categoria de anotação (o artista, nas músicas): vale no lugar do dela. */
  readonly glyph = input<LucideIconData | null>(null);

  protected readonly icon = computed(() => this.glyph() ?? categoryIcon(this.label(), this.look()));
}
