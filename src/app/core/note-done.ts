import { Injectable, inject } from '@angular/core';
import { isDone, isNote, withDone } from './review';
import { ReviewStore } from './review-store';
import { WallMotion } from './wall-motion';
import { WallView } from './wall-view';
import { Toasts } from '../ui/toast';

/** Sem uma ficha no mural para levar a anotação embora, ela sai sozinha depois deste tempo. */
const FALLBACK_RELEASE = 8000;

/**
 * O check da anotação inteira (da ficha ou da leitura): guarda o dia em `doneAt`, o carimbo bate na
 * ficha e ela sai do mural (ver ReviewCard), a não ser com "Mostrar finalizadas". O bilhete tem
 * Desfazer.
 */
@Injectable({ providedIn: 'root' })
export class NoteDone {
  private readonly store = inject(ReviewStore);
  private readonly view = inject(WallView);
  private readonly motion = inject(WallMotion);
  private readonly toasts = inject(Toasts);
  private readonly fallbacks = new Map<string, ReturnType<typeof setTimeout>>();

  /** Finaliza (com o carimbo) ou abre de novo a sua anotação. */
  set(id: string, done: boolean): void {
    const r = this.store.get(id);
    if (!r || !isNote(r) || isDone(r) === done) return;
    this.store.update(withDone(r, done, new Date().toISOString()));
    clearTimeout(this.fallbacks.get(id));
    if (!done) {
      this.view.release(id);
      return;
    }
    this.view.stamp(id);
    this.fallbacks.set(id, setTimeout(() => this.view.release(id), FALLBACK_RELEASE));
    const where = this.view.showDone() ? '' : ' Ela fica em Mostrar finalizadas.';
    this.toasts.show(`“${r.game.name}” finalizada.${where}`, { label: 'Desfazer', run: () => this.undo(id) });
  }

  /** Desfazer: a anotação volta sem o check, para o lugar dela no mural. */
  private undo(id: string): void {
    this.motion.run(() => this.set(id, false));
  }
}
