import { Injectable, signal } from '@angular/core';

const NONE: ReadonlySet<number> = new Set();

/**
 * As tarefas feitas que a pessoa pediu para ver, tocando na conta "N tarefas feitas" (ver `foldDone`
 * em core/rich-text.ts): por anotação, as sequências abertas, pela linha da primeira tarefa de cada
 * uma. Só na memória: vale no mural e na leitura, mesmo com a ficha saindo da tela e voltando, até a
 * página recarregar.
 */
@Injectable({ providedIn: 'root' })
export class ShownDone {
  private readonly open = signal<ReadonlyMap<string, ReadonlySet<number>>>(new Map());

  /** As sequências abertas da anotação. */
  of(id: string): ReadonlySet<number> {
    return this.open().get(id) ?? NONE;
  }

  /** Abre a sequência (as feitas dela voltam a aparecer como são). */
  show(id: string, seq: number): void {
    const now = this.of(id);
    if (now.has(seq)) return;
    this.open.set(new Map(this.open()).set(id, new Set([...now, seq])));
  }
}
