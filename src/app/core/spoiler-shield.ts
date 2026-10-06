import { Injectable, computed, inject } from '@angular/core';
import { unseenOf } from './comparison';
import { Review } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';

const NONE: ReadonlySet<string> = new Set();

/**
 * "Evitar spoilers de outros murais": a nota de outra pessoa sobre uma obra que eu ainda não
 * resenhei fica em segredo, em toda tela que mostra fichas alheias (Amigos, o mural de alguém,
 * Comparar). O que eu já resenhei aparece. Revelar é sempre da tela, por um momento: nada disso fica
 * guardado, e a tela seguinte volta a seguir Ajustes.
 */
@Injectable({ providedIn: 'root' })
export class SpoilerShield {
  private readonly settings = inject(Settings);
  private readonly store = inject(ReviewStore);

  /** Ligado em Ajustes. */
  readonly on = computed(() => this.settings.friendSpoilers());
  private readonly mine = computed(() => this.store.reviews());

  /** Os ids das fichas de `theirs` que ficam em segredo (vazio com a opção desligada). Use dentro de um computed. */
  hiddenIn(theirs: readonly Review[]): ReadonlySet<string> {
    if (!this.on() || !theirs.length) return NONE;
    return unseenOf(this.mine(), theirs);
  }
}
