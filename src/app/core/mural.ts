import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { KINDS, KindProfile, SCORED_KINDS, isKind, isNotes, profileOf } from './kinds';
import { Bonus, Draft, Kind, Review, Wish, originalsOf } from './review';
import { ReviewStore } from './review-store';

const KEY = 'mural-de-jogos:mural:v1';
/** O último mural de resenhas aberto: o das Análises e de Extras, mesmo depois de passar pelas anotações. */
const REVIEW_KEY = 'mural-de-jogos:analises:v1';

function read(key: string): Kind | null {
  try {
    const v = JSON.parse(localStorage.getItem(key) ?? 'null');
    return isKind(v) ? v : null;
  } catch {
    return null;
  }
}

function readReviewKind(): Kind {
  const scored = (k: Kind | null) => (k && !isNotes(k) ? k : null);
  // o mural aberto, se for de resenhas, é o último deles
  return scored(read(KEY)) ?? scored(read(REVIEW_KEY)) ?? 'jogos';
}

/**
 * O mural aberto (o de anotações ou um de resenhas: jogos, livros, filmes, séries, animes, músicas) e
 * só o que é dele. Toda página lê as fichas por aqui: um mural nunca vê as fichas, a fila ou os bônus
 * de outro. Quem escolhe é o endereço (`/anotacoes`, `/analises/livros/…`, ver core/areas.ts) e, nas
 * páginas sem o mural no endereço (Extras, Amigos), o seletor da própria página. Lembrado para a
 * próxima visita.
 */
@Injectable({ providedIn: 'root' })
export class Mural {
  private readonly store = inject(ReviewStore);

  readonly kind = signal<Kind>(read(KEY) ?? 'jogos');
  /**
   * O último mural de resenhas aberto. As Análises sem mural no endereço e os Extras abrem nele, e o
   * botão de nova resenha fora das Análises escreve nele. Anda junto com `kind`, na hora (ver o
   * construtor).
   */
  readonly reviewKind = signal<Kind>(readReviewKind());
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

  /** Quantas fichas cada mural tem, para o seletor de mural. */
  readonly counts = computed(() => {
    const out = Object.fromEntries(KINDS.map((k) => [k, 0])) as Record<Kind, number>;
    // a anotação finalizada saiu do mural (ver WallView.showDone): o número é o das que estão nele
    for (const r of this.store.reviews()) if (!r.revisitOf && !r.doneAt) out[r.kind]++;
    return out;
  });

  constructor() {
    // abrir um mural de resenhas já o faz o último, na mesma hora: quem lê logo depois (a guarda da
    // rota, o botão de adicionar) vê o novo, sem esperar um efeito
    const set = this.kind.set.bind(this.kind);
    this.kind.set = (k: Kind) => {
      set(k);
      if ((SCORED_KINDS as readonly Kind[]).includes(k)) this.reviewKind.set(k);
    };
    this.kind.update = (fn: (k: Kind) => Kind) => this.kind.set(fn(this.kind()));
    effect(() => {
      const k = this.kind();
      try {
        localStorage.setItem(KEY, JSON.stringify(k));
      } catch {
        /* vale só nesta sessão */
      }
    });
    effect(() => {
      const k = this.reviewKind();
      try {
        localStorage.setItem(REVIEW_KEY, JSON.stringify(k));
      } catch {
        /* vale só nesta sessão */
      }
    });
  }
}
