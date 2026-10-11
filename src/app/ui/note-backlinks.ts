import { Injectable, signal } from '@angular/core';

/** Qual sub-nota está com a lista das anotações que apontam para ela aberta (o id), ou nenhuma. */
@Injectable({ providedIn: 'root' })
export class NoteBacklinks {
  readonly current = signal<string | null>(null);
  /** Aberta de uma leitura: a anotação escolhida abre nela (com o "Voltar"); sem isso, na leitura do mural. */
  pick: ((id: string) => void) | null = null;

  open(id: string, pick: ((id: string) => void) | null = null): void {
    this.pick = pick;
    this.current.set(id);
  }

  close(): void {
    this.current.set(null);
  }
}
