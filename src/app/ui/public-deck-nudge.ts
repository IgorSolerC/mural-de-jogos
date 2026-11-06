import { Injectable, inject } from '@angular/core';
import { ReviewStore } from '../core/review-store';
import { StudyStore } from '../core/study-store';
import { Toasts } from './toast';

/**
 * A carta nova de um baralho público que quem visita não vê (PLANO-BARALHOS-PUBLICOS.md, seção 9): a anotação
 * é privada, e a carta é a anotação. O baralho público pergunta das cartas de antes só ao virar público; das
 * que entram depois, pergunta este aviso, uma vez, na hora em que ela entra. Tornar pública é o mesmo da
 * pergunta do baralho: fora do Feed, com Desfazer.
 */
@Injectable({ providedIn: 'root' })
export class PublicDeckNudge {
  private readonly study = inject(StudyStore);
  private readonly store = inject(ReviewStore);
  private readonly toasts = inject(Toasts);

  /** Pergunta se a anotação privada acabou de entrar num baralho público (`before`: os baralhos de antes). */
  afterEntering(note: string, before: readonly string[]): boolean {
    if (!this.study.privateInPublic(note, before)) return false;
    this.ask(note);
    return true;
  }

  ask(note: string): void {
    this.toasts.show('Esta anotação é privada, mas o baralho dela é público. Quer deixá-la pública?', { label: 'Tornar pública', run: () => this.publish(note) }, 12000);
  }

  private publish(note: string): void {
    const { changed, undo } = this.study.publishNotes([note]);
    if (!changed) return;
    const name = this.store.get(note)?.game.name ?? '';
    this.toasts.show(`“${name}” agora é pública, fora do Feed`, { label: 'Desfazer', run: undo }, 8000);
  }
}
