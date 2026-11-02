import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { IconChoice } from './icon-choices';
import { LightStock } from './review';
import { ReviewStore } from './review-store';
import { onOtherTab, writeJson } from './storage';
import {
  CardFront,
  Deck,
  StudyConfig,
  StudyState,
  addCard,
  addDeck,
  answer,
  emptyStudy,
  mergeStudy,
  moveDeck,
  removeCard,
  removeDeck,
  resetCard,
  restoreCard,
  restoreDeck,
  sanitizeStudy,
  setCardWall,
  setConfig,
  setDecks,
  studyOnWall,
  updateDeck,
  updateFront,
} from './study';

/** Os Estudos deste navegador (saem com a limpeza do logout, pelo prefixo, e com "Apagar o save"). */
export const STUDY_KEY = 'meu-mural:estudos:v1';

function read(): StudyState {
  try {
    return sanitizeStudy(JSON.parse(localStorage.getItem(STUDY_KEY) ?? 'null'));
  } catch {
    return emptyStudy();
  }
}

/**
 * Os Estudos (ver core/study.ts): os baralhos, as cartas e o progresso de cada uma, guardados neste
 * navegador e, com conta, no mural privado da nuvem (`estudos`, juntado carta a carta e baralho a
 * baralho, ver core/cloud-sync.ts). Nunca no mural público: os Estudos são só seus, mesmo com a anotação
 * pública.
 *
 * Cada mudança devolve o que precisa para o Desfazer (o estado de antes, ou o que saiu), como os quadros
 * do Kanban.
 */
@Injectable({ providedIn: 'root' })
export class StudyStore {
  private readonly store = inject(ReviewStore);

  readonly state = signal<StudyState>(read());
  readonly decks = computed(() => this.state().decks);
  readonly cards = computed(() => this.state().cards);
  readonly config = computed(() => this.state().config);
  /** Quando os Estudos mudaram aqui (para a sincronização enviar). */
  readonly changedAt = signal(0);
  /**
   * Agora, para os números do dia (as cartas nos passos vencem sozinhas): a página dos Estudos chama
   * `tick` de minuto em minuto, e a barra e a página leem daqui.
   */
  readonly now = signal(new Date());

  /** As cartas pelo id da anotação. */
  readonly cardOf = computed(() => new Map(this.cards().map((c) => [c.note, c])));
  /** As anotações que existem (a carta de uma apagada não aparece nem entra na fila). */
  private readonly notesById = computed(() => new Map(this.store.notes().map((n) => [n.id, n])));
  readonly live = (note: string): boolean => this.notesById().has(note);

  /**
   * O voto dos Estudos sobre o mural, pelo id da anotação (PLANO-ESTUDOS.md, 4.4): `true` no mural
   * também, `false` só nos Estudos. A anotação sem carta (ou de carta sem baralho que exista) não vota.
   */
  readonly votes = computed<ReadonlyMap<string, boolean>>(() => {
    const out = new Map<string, boolean>();
    const decks = this.decks();
    for (const c of this.cards()) {
      if (!this.live(c.note)) continue;
      const vote = studyOnWall(c, decks);
      if (vote !== null) out.set(c.note, vote);
    }
    return out;
  });

  /** A hora da última mudança: duas no mesmo milissegundo continuam em ordem. */
  private lastAt = 0;

  constructor() {
    effect(() => writeJson(STUDY_KEY, this.state()));
    // outra aba mexeu: esta acompanha, sem gravar o de antes por cima
    inject(DestroyRef).onDestroy(onOtherTab(STUDY_KEY, () => this.state.set(read())));
  }

  tick(): void {
    this.now.set(new Date());
  }

  private stamp(): string {
    this.lastAt = Math.max(Date.now(), this.lastAt + 1);
    return new Date(this.lastAt).toISOString();
  }

  private set(next: StudyState): void {
    if (next === this.state()) return;
    this.state.set(next);
    this.changedAt.set(Date.now());
  }

  deck(id: string): Deck | undefined {
    return this.decks().find((d) => d.id === id);
  }

  /** Um baralho novo, no fim da fileira; devolve o id ('' sem lugar para mais). */
  addDeck(name: string, color: LightStock, icon: IconChoice | null = null): string {
    const { state, id } = addDeck(this.state(), name, color, this.stamp(), icon);
    this.set(state);
    return id;
  }

  updateDeck(id: string, patch: Partial<Omit<Deck, 'id' | 'at' | 'order'>>): void {
    this.set(updateDeck(this.state(), id, patch, this.stamp()));
  }

  moveDeck(id: string, to: number): void {
    this.set(moveDeck(this.state(), id, to, this.stamp()));
  }

  /** Apaga o baralho e devolve o Desfazer (ou null, se ele não existia). */
  removeDeck(id: string): (() => void) | null {
    const out = removeDeck(this.state(), id, this.stamp());
    if (!out.deck) return null;
    this.set(out.state);
    const { deck, cards } = out;
    return () => this.set(restoreDeck(this.state(), deck, cards, this.stamp()));
  }

  /** A anotação vira carta (ou entra em mais baralhos). `wall`: a escolha "no mural" (D4). */
  addCard(note: string, decks: readonly string[], front: CardFront = {}, wall?: boolean): void {
    this.set(addCard(this.state(), note, decks, front, this.stamp(), wall));
  }

  updateFront(note: string, front: CardFront): void {
    this.set(updateFront(this.state(), note, front, this.stamp()));
  }

  setDecks(note: string, decks: readonly string[]): void {
    this.set(setDecks(this.state(), note, decks, this.stamp()));
  }

  setWall(note: string, wall: boolean | undefined): void {
    this.set(setCardWall(this.state(), note, wall, this.stamp()));
  }

  /** Tira a carta dos Estudos e devolve o Desfazer (ou null, se ela não existia). */
  removeCard(note: string): (() => void) | null {
    const card = this.cardOf().get(note);
    if (!card) return null;
    this.set(removeCard(this.state(), note, this.stamp()));
    return () => this.set(restoreCard(this.state(), card, this.stamp()));
  }

  resetCard(note: string): void {
    this.set(resetCard(this.state(), note, this.stamp()));
  }

  /**
   * A resposta da sessão (Errei ou Acertei), no baralho `deck` que trouxe a carta. Devolve o Desfazer da
   * sessão: a carta e o dia voltam como estavam antes dela (ou null, se a carta não existia).
   */
  answer(note: string, ok: boolean, deck?: string): (() => void) | null {
    const st = this.state();
    const before = this.cardOf().get(note);
    if (!before) return null;
    const today = st.today;
    this.set(answer(st, note, ok, new Date(this.stamp()), deck));
    return () => {
      const now = this.state();
      const at = this.stamp();
      this.set({ ...now, cards: now.cards.map((c) => (c.note === note ? { ...before, at } : c)), today: today && { ...today, at } });
    };
  }

  setConfig(patch: Partial<Omit<StudyConfig, 'at'>>): void {
    this.set(setConfig(this.state(), patch, this.stamp()));
  }

  /** Os Estudos de outro aparelho, juntos com os daqui (ver `mergeStudy`). */
  merge(remote: StudyState): void {
    const next = mergeStudy(this.state(), remote);
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }
}
