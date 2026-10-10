import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { KINDS, KindProfile, isKind, profileOf } from './kinds';
import { Bonus, Draft, Kind, Review, Wish, originalsOf } from './review';
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

  /** Tudo o que vai na parede deste mural: as fichas e as rejogadas (releituras, reassistidas). */
  readonly wall = computed<Review[]>(() => this.store.reviews().filter((r) => r.kind === this.kind()));
  readonly wallCount = computed(() => this.wall().length);
  /**
   * As fichas originais, uma por obra: é o que entra no ranking, nos jogos de Extras, nas comparações
   * e nas contas de nota. As rejogadas ficam só na parede e no tempo (ver `wall`).
   */
  readonly reviews = computed<Review[]>(() => originalsOf(this.wall()));
  readonly count = computed(() => this.reviews().length);
  /** Quantas fichas o mural tem à mostra: sem as anotações finalizadas, que saem dele. */
  readonly openCount = computed(() => this.reviews().filter((r) => !r.doneAt).length);
  /** Só as rejogadas deste mural. */
  readonly revisitCount = computed(() => this.wallCount() - this.count());
  readonly drafts = computed<Draft[]>(() => this.store.drafts().filter((d) => d.kind === this.kind()));
  readonly draftCount = computed(() => this.drafts().length);
  readonly wishes = computed<Wish[]>(() => this.store.wishes().filter((w) => w.kind === this.kind()));
  readonly wishCount = computed(() => this.wishes().length);
  /** Os bônus escritos à mão nas fichas deste mural. */
  readonly customBonuses = computed<Bonus[]>(() => this.store.customBonuses()[this.kind()]);

  /** Quantas fichas cada mural tem, para o seletor do cartaz. */
  readonly counts = computed(() => {
    const out = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
    // a anotação finalizada saiu do mural (ver WallView.showDone): o número é o das que estão nele
    for (const r of this.store.reviews()) if (!r.revisitOf && !r.doneAt) out[r.kind]++;
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
