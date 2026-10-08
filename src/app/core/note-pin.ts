import { Injectable, inject } from '@angular/core';
import { Review, isNote, isPinnedNote, withPin } from './review';
import { ReviewStore } from './review-store';
import { WallMotion } from './wall-motion';
import { Toasts } from '../ui/toast';

/**
 * Fixar a anotação no topo do mural (o alfinete da ficha, da leitura e do editor). A ficha desliza
 * para a seção Fixadas; desafixada, volta ao lugar de antes (comum, ou sub-nota se era). O bilhete
 * tem Desfazer.
 */
@Injectable({ providedIn: 'root' })
export class NotePin {
  private readonly store = inject(ReviewStore);
  private readonly motion = inject(WallMotion);
  private readonly toasts = inject(Toasts);

  /** `quiet`: sem o bilhete (a leitura aberta por cima o esconderia; lá o próprio botão desfaz). */
  set(id: string, pinned: boolean, opts: { quiet?: boolean } = {}): void {
    const r = this.store.get(id);
    if (!r || !isNote(r) || isPinnedNote(r) === pinned) return;
    this.motion.run(() => this.store.update(withPin(r, pinned, new Date().toISOString())));
    if (opts.quiet) return;
    this.toasts.show(pinned ? `“${r.game.name}” fixada no topo do mural.` : `“${r.game.name}” não está mais fixada.`, {
      label: 'Desfazer',
      run: () => this.restore(r),
    });
  }

  /** Desfazer: o lugar de antes, como estava. */
  private restore(before: Review): void {
    const now = this.store.get(before.id);
    if (!now) return;
    const { noteRank: _r, pinnedSub: _s, ...rest } = now;
    const back: Review = {
      ...rest,
      ...(before.noteRank ? { noteRank: before.noteRank } : {}),
      ...(before.pinnedSub ? { pinnedSub: true as const } : {}),
      updatedAt: new Date().toISOString(),
    };
    this.motion.run(() => this.store.update(back));
  }
}
