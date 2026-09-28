import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { KindProfile, isKind, profileOf } from './kinds';
import { Bonus, Draft, Kind, Review } from './review';
import { ReviewStore } from './review-store';

const KEY = 'mural-de-jogos:mural:v1';

function readKind(): Kind {
  try {
    const v = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    return isKind(v) ? v : 'jogos';
  } catch {
    return 'jogos';
  }
}

/**
 * O mural aberto (jogos, livros, filmes, séries ou animes) e só o que é dele. Toda página lê as
 * fichas por aqui: um mural nunca vê as fichas, a fila ou os bônus de outro. A escolha é de cada
 * aba, lembrada para a próxima visita.
 */
@Injectable({ providedIn: 'root' })
export class Mural {
  private readonly store = inject(ReviewStore);

  readonly kind = signal<Kind>(readKind());
  readonly profile = computed<KindProfile>(() => profileOf(this.kind()));

  readonly reviews = computed<Review[]>(() => this.store.reviews().filter((r) => r.kind === this.kind()));
  readonly count = computed(() => this.reviews().length);
  readonly drafts = computed<Draft[]>(() => this.store.drafts().filter((d) => d.kind === this.kind()));
  readonly draftCount = computed(() => this.drafts().length);
  /** Os bônus escritos à mão nas fichas deste mural. */
  readonly customBonuses = computed<Bonus[]>(() => this.store.customBonuses()[this.kind()]);

  /** Quantas fichas cada mural tem, para o seletor do cartaz. */
  readonly counts = computed(() => {
    const out = { jogos: 0, livros: 0, filmes: 0, series: 0, animes: 0 } as Record<Kind, number>;
    for (const r of this.store.reviews()) out[r.kind]++;
    return out;
  });

  constructor() {
    effect(() => {
      const k = this.kind();
      try {
        localStorage.setItem(KEY, JSON.stringify(k));
      } catch {
        /* vale só nesta sessão */
      }
    });
  }
}
