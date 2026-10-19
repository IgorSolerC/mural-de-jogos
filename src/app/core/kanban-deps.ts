import { Injectable, computed, inject } from '@angular/core';
import { ICON } from '../ui/icons';
import { Confirm } from '../ui/confirm';
import { categoryKey, dependsOn, depProgress, setDeps } from './kanban';
import { KanbanStore } from './kanban-store';
import { Review } from './review';
import { ReviewStore } from './review-store';

/** Os nomes entre aspas, juntos como se fala: “A”, “B” e “C”. */
function names(list: readonly Review[]): string {
  const q = list.map((r) => `“${r.game.name}”`);
  return q.length < 2 ? (q[0] ?? '') : `${q.slice(0, -1).join(', ')} e ${q.at(-1)}`;
}

/**
 * As dependências das anotações no quadro (ver `KanbanCard.deps`): quais são, pôr e tirar, e a
 * pergunta antes de finalizar uma anotação que ainda depende de outra aberta. A pergunta vale por
 * qualquer caminho: arrastar ou a seta para uma coluna que finaliza, o check da ficha (no mural ou no
 * quadro) e o Finalizar da leitura. Ela não proíbe: a pessoa pode finalizar mesmo assim.
 */
@Injectable({ providedIn: 'root' })
export class KanbanDeps {
  private readonly kanban = inject(KanbanStore);
  private readonly store = inject(ReviewStore);
  private readonly confirm = inject(Confirm);

  /** As anotações pelo id, para a contagem. */
  private readonly notes = computed(() => new Map(this.store.notes().map((r) => [r.id, r])));

  /** As dependências guardadas da anotação (os ids), ou nenhuma. */
  idsOf(note: string): readonly string[] {
    return this.kanban.cardOf(note)?.card.deps ?? [];
  }

  /** Quantas finalizadas, de quantas, e quais (só as que ainda existem). */
  progress(deps: readonly string[] | undefined) {
    return depProgress(deps, this.notes());
  }

  /**
   * Onde está a dependência, dito para a anotação `from`: a coluna do quadro; de outro grupo, o grupo
   * também ("Estudos · Fazendo"); fora do quadro, isso.
   */
  whereOf(dep: Review, from: string): string {
    const mine = categoryKey(this.notes().get(from)?.category ?? '');
    const at = this.kanban.cardOf(dep.id);
    const column = at?.board.columns.find((c) => c.id === at.card.column)?.name;
    const group = dep.category?.trim() && categoryKey(dep.category) !== mine ? dep.category.trim() : '';
    return [group, column ?? 'Fora do quadro'].filter(Boolean).join(' · ');
  }

  /** Dá para pôr `other` como dependência de `note`? Não ela mesma, nem uma que depende dela (a roda). */
  canAdd(note: string, other: string): boolean {
    return other !== note && !dependsOn(this.kanban.boards(), other, note);
  }

  /** As anotações que não dá para pôr como dependência de `note` (ela, as que já são e as da roda). */
  excluded(note: string): string[] {
    const own = new Set(this.idsOf(note));
    return this.store
      .notes()
      .filter((r) => own.has(r.id) || !this.canAdd(note, r.id))
      .map((r) => r.id);
  }

  /** As dependências da anotação passam a ser `deps` (as da roda ficam de fora). */
  set(note: string, deps: readonly string[]): void {
    const at = this.kanban.cardOf(note);
    if (!at) return;
    const ok = deps.filter((d) => this.canAdd(note, d));
    this.kanban.update(at.board.id, (b, now) => setDeps(b, note, ok, now));
  }

  add(note: string, other: string): void {
    if (!this.canAdd(note, other)) return;
    this.set(note, [...this.idsOf(note), other]);
  }

  remove(note: string, other: string): void {
    this.set(note, this.idsOf(note).filter((d) => d !== other));
  }

  /**
   * As anotações de `notes` que vão ser finalizadas com alguma dependência ainda aberta, cada uma com
   * as abertas. As que finalizam juntas (arrastadas juntas para a coluna que finaliza) não contam como
   * abertas umas para as outras.
   */
  blockers(notes: readonly string[]): { note: Review; open: Review[] }[] {
    const together = new Set(notes);
    const out: { note: Review; open: Review[] }[] = [];
    for (const id of notes) {
      const note = this.notes().get(id);
      if (!note || note.doneAt) continue;
      const open = this.progress(this.idsOf(id)).open.filter((d) => !together.has(d.id));
      if (open.length) out.push({ note, open });
    }
    return out;
  }

  /**
   * Antes de finalizar `notes`: com alguma dependência aberta, pergunta se finaliza mesmo assim. Sem
   * nenhuma, devolve true na hora (sem esperar a pergunta: quem chama pode seguir no mesmo passo).
   */
  allowFinish(notes: readonly string[]): true | Promise<boolean> {
    const list = this.blockers(notes);
    if (!list.length) return true;
    const open = [...new Map(list.flatMap((b) => b.open).map((r) => [r.id, r])).values()];
    let text: string;
    if (list.length === 1) {
      const who = `“${list[0].note.game.name}”`;
      text =
        open.length === 1
          ? `${who} depende de ${names(open)}, que ainda não foi finalizada. Finalizar ${who} mesmo assim?`
          : `${who} depende de ${open.length} anotações que ainda não foram finalizadas: ${names(open)}. Finalizar ${who} mesmo assim?`;
    } else {
      text = `${names(list.map((b) => b.note))} dependem de anotações que ainda não foram finalizadas: ${names(open)}. Finalizar mesmo assim?`;
    }
    return this.confirm.ask({
      title: open.length === 1 ? 'Falta uma dependência' : 'Faltam dependências',
      text,
      confirm: 'Finalizar mesmo assim',
      cancel: 'Esperar',
      icon: ICON.feito,
      tone: 'neutro',
    });
  }
}
