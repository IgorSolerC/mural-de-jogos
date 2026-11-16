import { Signal, computed, inject, signal } from '@angular/core';
import { CategoryColorId, categoryColorHex } from '../core/category-looks';
import { wishTagKey } from '../core/mural-config';
import { PIXEL_TAG_SPACE } from '../core/pixel-gallery';
import { Settings } from '../core/settings';
import { wishTagHex } from '../core/wishlist-view';
import type { TagColors } from './tag-picker';

/**
 * As cores das tags da galeria de pixel arts numa folha aberta (a ficha da obra e a das marcadas): as guardadas
 * (nas cores das tags da Wishlist, no espaço `pixel`) e as sorteadas para as tags novas, que só vão para as
 * configurações ao salvar, e só as das tags que ficaram (cancelar não deixa cor de tag que nenhuma obra tem). A
 * regra da folha do recorte da Wishlist. Criada no construtor (precisa do contexto de injeção).
 */
export class PixelTagColors {
  private readonly settings = inject(Settings);
  private readonly fresh = signal<ReadonlyMap<string, CategoryColorId>>(new Map());

  /** Para o `TagPicker` e a legenda (`WishTags`). */
  readonly colors: Signal<TagColors> = computed(() => {
    const saved = this.settings.notesConfig().wishTagColors;
    const fresh = this.fresh();
    const key = (tag: string) => wishTagKey(PIXEL_TAG_SPACE, tag);
    return {
      hex: (tag) => wishTagHex(saved, PIXEL_TAG_SPACE, tag) ?? categoryColorHex(fresh.get(key(tag))),
      has: (tag) => !!saved[key(tag)] || fresh.has(key(tag)),
      set: (tag, color) => this.fresh.update((m) => new Map(m).set(key(tag), color)),
    };
  });

  /** Esquece as sorteadas (a folha abriu de novo). */
  reset(): void {
    this.fresh.set(new Map());
  }

  /** Guarda as sorteadas das tags que ficaram, numa mudança só. */
  keep(tags: readonly string[]): void {
    const fresh = this.fresh();
    const out = new Map<string, CategoryColorId>();
    for (const tag of tags) {
      const c = fresh.get(wishTagKey(PIXEL_TAG_SPACE, tag));
      if (c) out.set(tag, c);
    }
    this.settings.setWishTagColors(PIXEL_TAG_SPACE, out);
    this.fresh.set(new Map());
  }
}
