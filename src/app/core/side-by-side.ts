import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { KINDS, isKind } from './kinds';
import { Mural } from './mural';
import { Kind, Review, ScoreKey } from './review';

const KEY = 'mural-de-jogos:lado-a-lado:v1';

/** Ordem das fichas no lado a lado: como foram marcadas, por data, por lançamento ou por uma nota. */
export type SideSort = 'marcada' | 'data' | 'ano' | ScoreKey;

type Picks = Record<Kind, string[]>;

/** Uma seleção guardada para o Desfazer, com o mural a que ela pertence (o aviso sobrevive à troca de mural). */
export interface PickSnapshot {
  kind: Kind;
  ids: string[];
}

function empty(): Picks {
  return Object.fromEntries(KINDS.map((k) => [k, []])) as unknown as Picks;
}

function readIds(): Picks {
  const out = empty();
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '[]');
    const ids = (v: unknown) => (Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : []);
    // antes dos murais a seleção era uma lista só, de jogos
    if (Array.isArray(raw)) out.jogos = ids(raw);
    else if (raw && typeof raw === 'object') for (const [k, v] of Object.entries(raw)) if (isKind(k)) out[k] = ids(v);
  } catch {
    /* seleção vazia */
  }
  return out;
}

/**
 * Lado a lado: as fichas tiradas da parede para comparar na mesa. Uma seleção por mural (não dá
 * para comparar um livro com um jogo), na ordem em que foram marcadas, guardada só neste navegador
 * (não entra no backup).
 */
@Injectable({ providedIn: 'root' })
export class SideBySide {
  private readonly mural = inject(Mural);

  private readonly ids = signal<Picks>(readIds());
  /** O mural está no modo de marcar fichas. */
  readonly picking = signal(false);
  readonly sort = signal<SideSort>('marcada');

  /** As fichas marcadas no mural aberto que ainda existem, na ordem em que foram marcadas. */
  readonly reviews = computed<Review[]>(() => {
    const byId = new Map(this.mural.reviews().map((r) => [r.id, r]));
    return this.ids()
      [this.mural.kind()].map((id) => byId.get(id))
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
    this.set(this.has(id) ? this.live().filter((x) => x !== id) : [...this.live(), id]);
  }

  /** Marca várias de uma vez (as que a busca mostra), sem mexer na ordem das que já estavam. */
  add(ids: string[]): void {
    const live = this.live();
    this.set([...live, ...ids.filter((id) => !live.includes(id))]);
  }

  /** Limpa e devolve o que havia, para o Desfazer. */
  clear(): PickSnapshot {
    const before = this.snapshot();
    this.set([]);
    return before;
  }

  /** A seleção como está agora, para desfazer uma mudança sem perder a ordem. */
  snapshot(): PickSnapshot {
    return { kind: this.mural.kind(), ids: this.live() };
  }

  /** Volta a seleção guardada para o mural dela, mesmo que outro mural esteja aberto agora. */
  restore(before: PickSnapshot): void {
    this.ids.update((all) => ({ ...all, [before.kind]: before.ids }));
  }

  /** A original da obra trocou (ver ReviewStore.settle): quem estava marcada dá o lugar à nova original, na mesma posição. */
  swap(from: string, to: string): void {
    this.ids.update((all) => {
      const next = { ...all };
      for (const k of KINDS) if (next[k].includes(from)) next[k] = [...new Set(next[k].map((id) => (id === from ? to : id)))];
      return next;
    });
  }

  private set(list: string[]): void {
    const k = this.mural.kind();
    this.ids.update((all) => ({ ...all, [k]: list }));
  }

  /** Só os ids de fichas que ainda estão no mural: uma ficha removida sai da seleção. */
  private live(): string[] {
    return this.reviews().map((r) => r.id);
  }
}
