import { Injectable, inject } from '@angular/core';
import { CheckCheck } from 'lucide-angular';
import { linkedOnCheckedTask } from './note-links';
import { isDone, isNote, withDone } from './review';
import { ReviewStore } from './review-store';
import { WallMotion } from './wall-motion';
import { WallView } from './wall-view';
import { Confirm } from '../ui/confirm';
import { Toasts } from '../ui/toast';

/** Sem uma ficha no mural para levar a anotação embora, ela sai sozinha depois deste tempo. */
const FALLBACK_RELEASE = 8000;

/**
 * O check da anotação inteira (da ficha ou da leitura): guarda o dia em `doneAt`, o carimbo bate na
 * ficha e ela sai do mural (ver ReviewCard), a não ser com "Mostrar finalizadas". O bilhete tem
 * Desfazer, também ao abrir de novo (que devolve o dia em que tinha sido finalizada).
 */
@Injectable({ providedIn: 'root' })
export class NoteDone {
  private readonly store = inject(ReviewStore);
  private readonly view = inject(WallView);
  private readonly motion = inject(WallMotion);
  private readonly toasts = inject(Toasts);
  private readonly confirm = inject(Confirm);
  private readonly fallbacks = new Map<string, ReturnType<typeof setTimeout>>();

  /**
   * Finaliza (com o carimbo) ou abre de novo a sua anotação. `quiet`: sem o bilhete (a leitura
   * aberta por cima o esconderia; lá o próprio botão desfaz).
   */
  set(id: string, done: boolean, opts: { quiet?: boolean } = {}): void {
    const r = this.store.get(id);
    if (!r || !isNote(r) || isDone(r) === done) return;
    const was = r.doneAt;
    this.store.update(withDone(r, done, new Date().toISOString()));
    clearTimeout(this.fallbacks.get(id));
    if (!done) {
      this.view.release(id);
      if (!opts.quiet) this.toasts.show(`“${r.game.name}” aberta de novo.`, { label: 'Desfazer', run: () => this.restore(id, was!) });
      return;
    }
    this.view.stamp(id);
    this.fallbacks.set(id, setTimeout(() => this.view.release(id), FALLBACK_RELEASE));
    if (opts.quiet) return;
    const where = this.view.showDone() ? '' : ' Ela fica em Mostrar finalizadas.';
    this.toasts.show(`“${r.game.name}” finalizada.${where}`, { label: 'Desfazer', run: () => this.undo(id) });
  }

  /**
   * Uma tarefa da anotação `fromId` acabou de ser marcada (`text` é o texto já com ela marcada): se
   * a linha tem links para anotações ainda abertas, pergunta se finaliza elas também (a tarefa
   * "- [ ] [[Corrigir o login]]" feita costuma querer dizer que a anotação dela acabou). `quiet`:
   * sem o bilhete (com a leitura aberta por cima).
   */
  async offerLinked(fromId: string, text: string, line: number, opts: { quiet?: boolean } = {}): Promise<void> {
    const linked = linkedOnCheckedTask(text, line, this.store.notes(), fromId);
    if (!linked.length) return;
    const names = linked.map((n) => `“${n.game.name}”`);
    const one = linked.length === 1;
    const list = one ? names[0] : `${names.slice(0, -1).join(', ')} e ${names.at(-1)}`;
    const yes = await this.confirm.ask({
      title: one ? 'Finalizar a anotação também?' : 'Finalizar as anotações também?',
      text: one
        ? `A tarefa que você marcou aponta para ${list}. Finalizar ela também?`
        : `A tarefa que você marcou aponta para ${linked.length} anotações: ${list}. Finalizar todas elas também?`,
      confirm: one ? 'Finalizar' : `Finalizar as ${linked.length}`,
      cancel: 'Agora não',
      icon: CheckCheck,
      tone: 'neutro',
    });
    if (!yes) return;
    // a pergunta demorou: só as que continuam abertas
    for (const n of linked) if (!isDone(this.store.get(n.id) ?? n)) this.set(n.id, true, linked.length > 1 ? { quiet: true } : opts);
    if (linked.length > 1 && !opts.quiet) this.toasts.show(`${linked.length} anotações finalizadas.`, { label: 'Desfazer', run: () => linked.forEach((n) => this.undo(n.id)) });
  }

  /** Desfazer o check: a anotação volta sem ele, para o lugar dela no mural. */
  private undo(id: string): void {
    this.motion.run(() => this.set(id, false, { quiet: true }));
  }

  /** Desfazer o "abrir de novo": finalizada outra vez, no dia de antes, sem carimbo nem saída animada. */
  private restore(id: string, doneAt: string): void {
    const r = this.store.get(id);
    if (!r || isDone(r)) return;
    this.motion.run(() => this.store.update({ ...withDone(r, true, new Date().toISOString()), doneAt }));
  }
}
