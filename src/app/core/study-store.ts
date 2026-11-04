import { DestroyRef, Injectable, computed, effect, inject, signal } from '@angular/core';
import { IconChoice } from './icon-choices';
import { LightStock } from './review';
import { ReviewStore } from './review-store';
import { onOtherTab, writeJson } from './storage';
import {
  CardFront,
  Deck,
  StudyCard,
  StudyConfig,
  StudyState,
  addCard,
  addDeck,
  answer,
  emptyStudy,
  keepRicher,
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
  /**
   * Uma carta nova pedida de dentro de um baralho ("Nova carta"): o editor abre na aba Flashcard com o
   * baralho escolhido, e a anotação salva vira carta lá. Fechar o editor sem salvar esquece.
   */
  readonly pending = signal<{ decks: string[] } | null>(null);
  /** O editor desta anotação deve abrir na aba Flashcard (o "Editar a frente" da folha da carta). */
  readonly openFront = signal<string | null>(null);
  /** O último baralho escolhido para uma carta: o próximo "Criar a frente" já vem com ele. */
  readonly lastDeck = signal<string | null>(null);

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
    inject(DestroyRef).onDestroy(onOtherTab(STUDY_KEY, () => this.fromOtherTab()));
  }

  /**
   * Outra aba gravou: vale o dela, menos o que ela devolveu na mesma hora e com menos campos (ver
   * `keepRicher`). Igual ao daqui, nada muda e nada é gravado, para as duas abas não ficarem gravando uma
   * por cima da outra. Sem nada guardado (a limpeza ao sair da conta), fica sem nada.
   */
  private fromOtherTab(): void {
    const next = keepRicher(read(), this.state());
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
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

  /** Um baralho novo, no fim da fileira; devolve o id ('' sem lugar para mais). `id`: o que já nasceu fora (um pedido da API). */
  addDeck(name: string, color: LightStock, icon: IconChoice | null = null, id?: string): string {
    const { state, id: made } = addDeck(this.state(), name, color, this.stamp(), icon, id);
    this.set(state);
    return made;
  }

  /** O baralho apagado (ou mudado) volta como estava, com as cartas que saíram junto (o Desfazer de um pedido). */
  restoreDeck(deck: Deck, cards: readonly StudyCard[]): void {
    this.set(restoreDeck(this.state(), deck, cards, this.stamp()));
  }

  /** A carta volta como estava (tirada, mudada ou respondida), com a hora de agora (o Desfazer de um pedido). */
  restoreCard(card: StudyCard): void {
    this.set(restoreCard(this.state(), card, this.stamp()));
  }

  /**
   * A resposta de um pedido da API, contada na hora `when` (quando a pessoa respondeu) e gravada agora. Um
   * pedido de um dia de estudo que já passou não mexe nos números de hoje.
   */
  answerAt(note: string, ok: boolean, when: Date, deck?: string): void {
    const st = this.state();
    const next = answer(st, note, ok, when, deck, this.stamp());
    this.set(st.today && next.today && next.today.day < st.today.day ? { ...next, today: st.today } : next);
  }

  /** Desconta uma resposta do dia (o Desfazer de um pedido): a nova do baralho `deck`, ou a revisão. */
  uncount(day: string, deck: string | null, review: boolean): void {
    const st = this.state();
    const t = st.today;
    if (!t || t.day !== day || (!review && !deck)) return;
    const at = this.stamp();
    const today = review ? { ...t, reviews: Math.max(0, t.reviews - 1), at } : { ...t, news: { ...t.news, [deck!]: Math.max(0, (t.news[deck!] ?? 0) - 1) }, at };
    this.set({ ...st, today });
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

  /** A carta volta a Desconhecida, sem respostas; devolve o Desfazer (ou null, se ela não existia). */
  resetCard(note: string): (() => void) | null {
    const before = this.cardOf().get(note);
    if (!before) return null;
    this.set(resetCard(this.state(), note, this.stamp()));
    return () => {
      const at = this.stamp();
      this.set({ ...this.state(), cards: this.state().cards.map((c) => (c.note === note ? { ...before, at } : c)) });
    };
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
