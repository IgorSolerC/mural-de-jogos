import { Injectable, inject } from '@angular/core';
import { isNote, isPinnedNote, withRank } from './review';
import { ReviewStore } from './review-store';
import { WallMotion } from './wall-motion';
import { Toasts } from '../ui/toast';

/**
 * Fixar a anotação no topo do mural (o alfinete da ficha, da leitura e do editor). A ficha desliza
 * para a seção Fixadas; desafixada, volta a ser uma anotação comum. O bilhete tem Desfazer.
 */
@Injectable({ providedIn: 'root' })
export class NotePin {
  private readonly store = inject(ReviewStore);
  private readonly motion = inject(WallMotion);
  private readonly toasts = inject(Toasts);

  set(id: string, pinned: boolean): void {
    const r = this.store.get(id);
    if (!r || !isNote(r) || isPinnedNote(r) === pinned) return;
    const before = r.noteRank ?? null;
    this.motion.run(() => this.store.update(withRank(r, pinned ? 'fixada' : null, new Date().toISOString())));
    this.toasts.show(pinned ? `“${r.game.name}” fixada no topo do mural.` : `“${r.game.name}” não está mais fixada.`, {
      label: 'Desfazer',
      run: () => {
        const now = this.store.get(id);
        if (now) this.motion.run(() => this.store.update(withRank(now, before, new Date().toISOString())));
      },
    });
  }
}
