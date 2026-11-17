import { Injectable, computed, inject, signal } from '@angular/core';
import { Review } from './review';
import { SharedStore } from './shared-store';
import { FICHA_PART_LABEL } from './ficha-merge';
import { SyncConflicts, conflictKey, splitTarget } from './sync-conflicts';

/**
 * Tudo o que espera a pessoa escolher a versão, numa fila só (PLANO-CONFLITOS.md, rodada 3): os
 * conflitos da própria conta (ver core/sync-conflicts.ts) e os das anotações compartilhadas em que
 * ela escreve (ver core/shared-store.ts), os mais novos primeiro.
 *
 * A fila é de onde a folha do conflito abre por cima de qualquer página (app.ts): o bilhete de um ajuste
 * ou de um quadro, o selo do botton de Ajustes e a lista em Ajustes › Conta. Depois de escolher, a
 * folha passa para a próxima, sem voltar à lista. A fila só aponta: escolher continua sendo das lojas
 * (`SyncConflicts.resolve`, `SharedStore.resolve`).
 */

/** Como a folha acha o conflito: a ficha (ou a compartilhada) pelo id, ou o da conta pela chave. */
export type ConflictRef = { noteId: string; chave?: undefined } | { chave: string; noteId?: undefined };

export interface QueuedConflict {
  ref: ConflictRef;
  /** Estável enquanto o conflito espera (para o `track` e para achar o próximo). */
  key: string;
  /** O nome do que está em conflito: “Lista do mercado”, "As tags fixas". */
  name: string;
  /** O tipo, nas palavras da lista: "Anotação", "Compartilhada", "Kanban", "Ajuste". */
  what: 'ficha' | 'compartilhada' | 'kanban' | 'ajuste';
  /** O que mudou, numa frase curta: "o texto e as tags". */
  parts: string;
  /** Quando foi achado (ISO). */
  em: string;
  /** A ficha em conflito (para o desenho do mural dela na lista). */
  ficha: Review | null;
}

/** "o texto, as tags e o título". */
export function joinWords(list: readonly string[]): string {
  if (list.length <= 1) return list[0] ?? '';
  return `${list.slice(0, -1).join(', ')} e ${list.at(-1)}`;
}

@Injectable({ providedIn: 'root' })
export class ConflictQueue {
  private readonly conflicts = inject(SyncConflicts);
  private readonly shared = inject(SharedStore);

  readonly list = computed<QueuedConflict[]>(() => {
    const out: QueuedConflict[] = [];
    for (const e of this.shared.conflicts()) {
      const c = e.conflito!;
      out.push({ ref: { noteId: e.id }, key: `compartilhada:${e.id}@${c.em}`, name: e.view.game.name, what: 'compartilhada', parts: '', em: c.em, ficha: e.view });
    }
    const sharedIds = new Set(out.map((q) => q.ref.noteId));
    for (const c of this.conflicts.pending()) {
      const [tipo, id] = splitTarget(c.alvo);
      if (tipo === 'ficha') {
        // a ficha com o conflito mais novo dela só (a folha mostra esse, e escolher fecha os de antes)
        if (sharedIds.has(id) || out.some((q) => q.what === 'ficha' && q.ref.noteId === id)) continue;
        out.push({
          ref: { noteId: id },
          key: conflictKey(c),
          name: this.conflicts.titleOf(c),
          what: 'ficha',
          parts: c.a === null || c.b === null ? 'apagada num aparelho e mudada no outro' : joinWords(c.partes.map((p) => FICHA_PART_LABEL[p])),
          em: c.em,
          ficha: (c.a ?? c.b) as Review,
        });
      } else out.push({ ref: { chave: conflictKey(c) }, key: conflictKey(c), name: this.conflicts.titleOf(c), what: tipo === 'kanban' ? 'kanban' : 'ajuste', parts: '', em: c.em, ficha: null });
    }
    return out.sort((p, q) => (p.em !== q.em ? (p.em < q.em ? 1 : -1) : p.key < q.key ? -1 : 1));
  });

  /** O conflito aberto na folha que fica por cima de qualquer página (null: fechada). */
  readonly opened = signal<ConflictRef | null>(null);

  /** Abre a folha num conflito (sem nenhum: no primeiro da fila). */
  open(ref?: ConflictRef): void {
    const r = ref ?? this.list()[0]?.ref ?? null;
    this.opened.set(r ? { ...r } : null);
  }

  close(): void {
    this.opened.set(null);
  }

  /** O próximo depois de `ref` (o que ainda espera), ou null: a fila acabou. */
  nextAfter(ref: ConflictRef | null): ConflictRef | null {
    const rest = this.list().filter((q) => !ref || q.ref.noteId !== ref.noteId || q.ref.chave !== ref.chave);
    return rest[0]?.ref ?? null;
  }

  /** Quantos esperam, sem contar `ref`. */
  remaining(ref: ConflictRef | null): number {
    return this.list().filter((q) => !ref || q.ref.noteId !== ref.noteId || q.ref.chave !== ref.chave).length;
  }
}
