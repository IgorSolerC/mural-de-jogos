import { ApplicationRef, Injectable, inject } from '@angular/core';
import { ReviewStore } from './review-store';

/** Anima a troca de lugar das fichas com a View Transitions API, quando dá. */
@Injectable({ providedIn: 'root' })
export class ViewTransitions {
  private readonly appRef = inject(ApplicationRef);
  private readonly store = inject(ReviewStore);

  run(change: () => void): void {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => unknown };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Muitas fichas: trocar direto é mais rápido que animar cada uma.
    if (!doc.startViewTransition || reduced || this.store.count() > 160) {
      change();
      return;
    }
    doc.startViewTransition(() => {
      change();
      this.appRef.tick();
    });
  }
}
