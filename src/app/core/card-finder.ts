import { Injectable, inject } from '@angular/core';
import { CategoryLooks } from './category-looks';
import { ColleagueStore } from './colleague-store';
import { Review } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { SpoilerShield } from './spoiler-shield';

/** Uma ficha colada no texto (o widget Nota, ver core/widgets.ts), achada, e como ela aparece. */
export interface FoundCard {
  review: Review;
  /** É uma ficha sua (e não de um mural aberto de outra pessoa). */
  mine: boolean;
  /** As notas ficam em "?" (o seu modo sem spoilers, ou a obra que você ainda não resenhou, no mural de outra pessoa). */
  masked: boolean;
  /** O ícone e a cor das categorias do dono da ficha. */
  looks: CategoryLooks;
}

/**
 * Acha uma ficha pelo id, em qualquer mural: as suas primeiro, depois as do mural de outra pessoa
 * que está aberto e, por fim, as dos outros murais guardados. O id é único (ver `newId`), então a
 * ficha colada numa anotação é sempre a mesma, de qualquer mural (anotações, jogos, livros…), e
 * continua a mesma quando é renomeada. Use dentro de um computed: as listas são sinais.
 */
@Injectable({ providedIn: 'root' })
export class CardFinder {
  private readonly store = inject(ReviewStore);
  private readonly colleagues = inject(ColleagueStore);
  private readonly settings = inject(Settings);
  private readonly shield = inject(SpoilerShield);

  find(id: string): FoundCard | null {
    if (!id) return null;
    const own = this.store.get(id);
    if (own) return { review: own, mine: true, masked: this.settings.noSpoilers(), looks: this.settings.categoryLooks() };
    const open = this.colleagues.selected();
    const people = open ? [open, ...this.colleagues.colleagues().filter((c) => c.id !== open.id)] : this.colleagues.colleagues();
    for (const c of people) {
      const r = c.reviews.find((x) => x.id === id);
      if (r) return { review: r, mine: false, masked: this.shield.hiddenIn([r]).has(r.id), looks: c.categoryLooks ?? {} };
    }
    return null;
  }
}
