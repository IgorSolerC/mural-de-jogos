import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Review, ScoreKey } from './review';
import { ReviewStore } from './review-store';

const KEY = 'mural-de-jogos:lado-a-lado:v1';

/** Ordem das fichas no lado a lado: como foram marcadas, por data, por lançamento ou por uma nota. */
export type SideSort = 'marcada' | 'data' | 'ano' | ScoreKey;

function readIds(): string[] {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    return Array.isArray(raw) ? raw.filter((x): x is string => typeof x === 'string') : [];
  } catch {
    return [];
  }
}

/**
 * Lado a lado: as fichas tiradas da parede para comparar na mesa. Uma seleção por vez,
 * na ordem em que foram marcadas, guardada só neste navegador (não entra no backup).
 */
@Injectable({ providedIn: 'root' })
export class SideBySide {
  private readonly store = inject(ReviewStore);

  private readonly ids = signal<string[]>(readIds());
  /** O mural está no modo de marcar fichas. */
  readonly picking = signal(false);
  readonly sort = signal<SideSort>('marcada');

  /** As fichas marcadas que ainda existem, na ordem em que foram marcadas. */
  readonly reviews = computed<Review[]>(() => {
    const byId = new Map(this.store.reviews().map((r) => [r.id, r]));
    return this.ids()
      .map((id) => byId.get(id))
      .filter((r): r is Review => !!r);
  });
  readonly count = computed(() => this.reviews().length);
  /** id → posição (1, 2, 3…), para o adesivo numerado da ficha. */
  readonly order = computed(() => new Map(this.reviews().map((r, i) => [r.id, i + 1])));

  constructor() {
    effect(() => {
      const ids = this.ids();
      try {
        localStorage.setItem(KEY, JSON.stringify(ids));
      } catch {
        /* a seleção vale só nesta sessão */
      }
    });
    if (typeof window !== 'undefined') {
      window.addEventListener('storage', (e) => {
        if (e.key === KEY) this.ids.set(readIds());
      });
    }
  }

  has(id: string): boolean {
    return this.order().has(id);
  }

  toggle(id: string): void {
    this.ids.set(this.has(id) ? this.live().filter((x) => x !== id) : [...this.live(), id]);
  }

  /** Marca várias de uma vez (as que a busca mostra), sem mexer na ordem das que já estavam. */
  add(ids: string[]): void {
    const live = this.live();
    this.ids.set([...live, ...ids.filter((id) => !live.includes(id))]);
  }

  /** Limpa e devolve o que havia, para o Desfazer. */
  clear(): string[] {
    const before = this.live();
    this.ids.set([]);
    return before;
  }

  /** A seleção como está agora, para desfazer uma mudança sem perder a ordem. */
  snapshot(): string[] {
    return this.live();
  }

  restore(ids: string[]): void {
    this.ids.set(ids);
  }

  /** Só os ids de fichas que ainda estão no mural: uma ficha removida sai da seleção. */
  private live(): string[] {
    return this.reviews().map((r) => r.id);
  }
}
