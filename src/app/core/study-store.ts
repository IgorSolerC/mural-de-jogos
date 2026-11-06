import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { IconChoice } from './icon-choices';
import { LightStock, audienceFields } from './review';
import { ReviewStore } from './review-store';
import { onOtherTab, writeJson } from './storage';
import { fromOtherTab } from './tab-join';
import {
  CardFront,
  Deck,
  DeckPatch,
  GroupOf,
  StudyCard,
  StudyConfig,
  StudyState,
  addCard,
  addDeck,
  answer,
  convertGroups,
  deckShare,
  decksInGroup,
  emptyStudy,
  groupKey,
  keepRicher,
  liveStudy,
  mergeStudy,
  moveDeck,
  moveGroup,
  removeCard,
  removeDeck,
  resetCard,
  sameView,
  restoreCard,
  restoreDeck,
  sanitizeStudy,
  studyGroupId,
  setCardWall,
  setConfig,
  setDecks,
  studyOnWall,
  updateDeck,
  updateFront,
} from './study';

/** Os Estudos deste navegador (saem com a limpeza do logout, pelo prefixo, e com "Apagar o save"). */
export const STUDY_KEY = 'meu-mural:estudos:v1';

/** O grupo para onde vai o baralho sem outro: o segundo grupo padrão das anotações. */
const STUDY_GROUP = 'Estudos';

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
 * baralho, ver core/cloud-sync.ts). No mural público, só os baralhos que a pessoa torna públicos, com as
 * cartas de anotações públicas (core/public-study.ts, PLANO-BARALHOS-PUBLICOS.md).
 *
 * Todo baralho é de um grupo das anotações, e a carta só vale nos baralhos do grupo da anotação dela
 * (PLANO-ESTUDOS-GRUPOS.md). `state` é o guardado (o que vai para a nuvem); `view` é como vale agora, e é
 * dele que saem as cartas (`cards`, `cardOf`), as filas e os números. A carta de uma anotação que mudou
 * de grupo dorme ali, com `decks` vazio.
 *
 * Cada mudança devolve o que precisa para o Desfazer (o estado de antes, ou o que saiu), como os quadros
 * do Kanban.
 */
@Injectable({ providedIn: 'root' })
export class StudyStore {
  private readonly store = inject(ReviewStore);

  /** O guardado, com os baralhos de cada carta como estão (inclusive os de outro grupo). */
  readonly state = signal<StudyState>(read());
  /** As anotações que existem (a carta de uma apagada não aparece nem entra na fila). */
  private readonly notesById = computed(() => new Map(this.store.notes().map((n) => [n.id, n])));
  /** O grupo da anotação (o seu, nas compartilhadas); `undefined`: ela não existe. */
  readonly groupOf: GroupOf = (note) => {
    const n = this.notesById().get(note);
    return n ? (n.category ?? null) : undefined;
  };
  /** Os Estudos como valem agora: cada carta só nos baralhos do grupo dela (ver `liveStudy`). */
  readonly view = computed(() => liveStudy(this.state(), this.groupOf), { equal: sameView });
  readonly decks = computed(() => this.state().decks);
  readonly cards = computed(() => this.view().cards);
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

  /** As cartas pelo id da anotação (como valem agora: a que dorme, com `decks` vazio). */
  readonly cardOf = computed(() => new Map(this.cards().map((c) => [c.note, c])));
  readonly live = (note: string): boolean => this.notesById().has(note);

  /**
   * O grupo para o baralho que não tem outro (o baralho vazio de antes dos grupos, o criado sem grupo
   * escolhido): o grupo Estudos, se alguma anotação está nele; senão, o grupo com mais anotações; sem
   * nenhum, "Estudos".
   */
  readonly fallbackGroup = computed(() => {
    const count = new Map<string, { label: string; n: number }>();
    for (const n of this.store.notes()) {
      const key = groupKey(n.category);
      if (!key) continue;
      const slot = count.get(key) ?? { label: n.category!.trim(), n: 0 };
      slot.n++;
      count.set(key, slot);
    }
    const study = count.get(groupKey(STUDY_GROUP));
    if (study) return study.label;
    let best: { label: string; n: number } | null = null;
    for (const slot of count.values()) if (!best || slot.n > best.n) best = slot;
    return best?.label ?? STUDY_GROUP;
  });

  /**
   * O voto dos Estudos sobre o mural, pelo id da anotação (PLANO-ESTUDOS.md, 4.4): `true` no mural
   * também, `false` só nos Estudos. A anotação sem carta (ou de carta que dorme, ou sem baralho que
   * exista) não vota: volta ao mural.
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
    inject(DestroyRef).onDestroy(onOtherTab(STUDY_KEY, (before) => this.fromOtherTab(before)));
    // os baralhos de antes dos grupos, assim que existem (ao abrir, da nuvem, de outra aba), e de novo
    // quando chegam as anotações que eles esperavam
    effect(() => {
      if (!this.state().decks.some((d) => !d.group)) return;
      this.notesById();
      untracked(() => this.convertGroups());
    });
  }

  /**
   * Outra aba gravou: vale o dela, menos o que ela devolveu na mesma hora e com menos campos (ver
   * `keepRicher`). Igual ao daqui, nada muda e nada é gravado, para as duas abas não ficarem gravando uma
   * por cima da outra. Sem nada guardado (a limpeza ao sair da conta), fica sem nada.
   */
  private fromOtherTab(before: string | null = null): void {
    // com mudança daqui ainda por gravar, as duas se juntam (ver core/tab-join.ts)
    const next = keepRicher(fromOtherTab(STUDY_KEY, before, this.state(), read, sanitizeStudy), this.state());
    if (JSON.stringify(next) !== JSON.stringify(this.state())) this.state.set(next);
  }

  /**
   * Cada baralho de antes num grupo (ver `convertGroups`); a anotação de carta que estava sem grupo ganha
   * o do baralho dela, logo depois da versão daqui (como as tags do Kanban em `attachLegacy`: a versão
   * escrita depois noutro aparelho vale mais que esta).
   */
  private convertGroups(): void {
    const out = convertGroups(this.state(), this.groupOf, this.fallbackGroup(), this.stamp(), this.store.notes().length > 0);
    if (!out) return;
    for (const [id, group] of out.noteGroups) {
      const r = this.store.get(id);
      if (!r || groupKey(r.category)) continue;
      this.store.update({ ...r, category: group, updatedAt: new Date(Date.parse(r.updatedAt) + 1).toISOString() });
    }
    this.set(out.state);
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

  /** Os baralhos do grupo do endereço (o id de `studyGroupId`), na ordem das abas. */
  decksOfGroup(groupId: string): Deck[] {
    return this.decks().filter((d) => !!d.group && studyGroupId(d.group) === groupId);
  }

  /**
   * Um baralho novo do grupo `group` (sem ele, o `fallbackGroup`), no fim da fileira; devolve o id ('' sem
   * lugar para mais). `id`: o que já nasceu fora (um pedido da API).
   */
  addDeck(name: string, color: LightStock, icon: IconChoice | null = null, id?: string, group?: string | null): string {
    const { state, id: made } = addDeck(this.state(), name, color, this.stamp(), icon, id, group?.trim() || this.fallbackGroup());
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

  updateDeck(id: string, patch: Partial<DeckPatch>): void {
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

  /** O grupo `from` foi renomeado para `to`, juntado a ele ou apagado (null), nas configurações do mural. */
  moveGroup(from: string, to: string | null): void {
    this.set(moveGroup(this.state(), from, to, this.stamp()));
  }

  /** Os baralhos `ids` que a anotação pode ter: os que existem e são do grupo dela. */
  decksFor(note: string, ids: readonly string[]): string[] {
    return decksInGroup(this.state(), ids, this.groupOf(note));
  }

  /**
   * A anotação vira carta (ou entra em mais baralhos). `wall`: a escolha "no mural" (D4). Só nos baralhos
   * do grupo dela: os de outro grupo do pedido ficam de fora, e os de outro grupo em que ela dormia saem.
   * Nenhum do grupo, nada muda.
   */
  addCard(note: string, decks: readonly string[], front: CardFront = {}, wall?: boolean): void {
    const ids = this.decksFor(note, decks);
    if (!ids.length) return;
    const st = this.state();
    const before = st.cards.find((c) => c.note === note);
    if (before) this.set(setDecks(st, note, this.decksFor(note, [...before.decks, ...ids]), this.stamp()));
    else this.set(addCard(st, note, ids, front, this.stamp(), wall));
  }

  updateFront(note: string, front: CardFront): void {
    this.set(updateFront(this.state(), note, front, this.stamp()));
  }

  /**
   * Os baralhos da carta, só os do grupo dela (os de outro grupo em que ela dormia saem). Sem nenhum, ela
   * sai dos Estudos; com baralhos pedidos e nenhum do grupo, nada muda (não tira a carta por engano).
   */
  setDecks(note: string, decks: readonly string[]): void {
    const ids = this.decksFor(note, decks);
    if (decks.length && !ids.length) return;
    this.set(setDecks(this.state(), note, ids, this.stamp()));
  }

  /**
   * A anotação sem grupo que vai virar carta de `decks` (um pedido da API sem grupo, como a "Nova carta"
   * da tela): ganha o grupo do primeiro baralho. A que já tem grupo fica com o dela.
   */
  adoptGroup(note: string, decks: readonly string[]): void {
    const r = this.store.get(note);
    if (!r || groupKey(r.category)) return;
    const group = decks.map((id) => this.deck(id)?.group).find((g) => !!g);
    if (group) this.store.update({ ...r, category: group, updatedAt: new Date().toISOString() });
  }

  /**
   * As cartas do baralho como quem visita as vê (PLANO-BARALHOS-PUBLICOS.md): quantas valem, quantas são de
   * anotação pública e quais ficam com o dono.
   */
  share(deck: string): ReturnType<typeof deckShare> {
    return deckShare(this.view(), deck, this.live, (note) => !this.notesById().get(note)?.private);
  }

  /**
   * A anotação privada acabou de entrar num baralho público (`before`: os baralhos de antes): quem visita não
   * vê essa carta, e o dono pode não saber. A compartilhada não conta: `publishNotes` não muda quem vê nela.
   */
  privateInPublic(note: string, before: readonly string[]): boolean {
    if (!this.notesById().get(note)?.private || this.store.sharedIds().has(note)) return false;
    const decks = this.cardOf().get(note)?.decks ?? [];
    return decks.some((id) => !before.includes(id) && !!this.deck(id)?.public);
  }

  /**
   * As anotações `ids` viram públicas fora do Feed (a escolha do dono, D1: "Pregar sem publicar no Feed"),
   * para o baralho público mostrar as cartas delas. A compartilhada fica como está: quem vê nela muda em
   * Compartilhar, e só o dono e os gestores mudam (`skipped`). Devolve o Desfazer: as que mudaram voltam a
   * privadas (a que alguém mudou de novo depois fica como está).
   */
  publishNotes(ids: readonly string[]): { changed: number; skipped: number; undo: () => void } {
    const shared = this.store.sharedIds();
    const now = new Date().toISOString();
    const changed: string[] = [];
    let skipped = 0;
    for (const id of ids) {
      const r = this.store.get(id);
      if (!r?.private) continue;
      if (shared.has(id)) {
        skipped++;
        continue;
      }
      const { private: _p, quiet: _q, publishedAt: _w, ...rest } = r;
      this.store.update({ ...rest, ...audienceFields('visivel', r, now), updatedAt: now }, r);
      changed.push(id);
    }
    const undo = () => {
      const back = new Date().toISOString();
      for (const id of changed) {
        const r = this.store.get(id);
        if (!r || r.private) continue;
        const { quiet: _q, publishedAt: _w, ...rest } = r;
        this.store.update({ ...rest, ...audienceFields('privada', r, back), updatedAt: back }, r);
      }
    };
    return { changed: changed.length, skipped, undo };
  }

  setWall(note: string, wall: boolean | undefined): void {
    this.set(setCardWall(this.state(), note, wall, this.stamp()));
  }

  /** Tira a carta dos Estudos e devolve o Desfazer (ou null, se ela não existia). */
  removeCard(note: string): (() => void) | null {
    const card = this.state().cards.find((c) => c.note === note);
    if (!card) return null;
    this.set(removeCard(this.state(), note, this.stamp()));
    return () => this.set(restoreCard(this.state(), card, this.stamp()));
  }

  /** A carta volta a Desconhecida, sem respostas; devolve o Desfazer (ou null, se ela não existia). */
  resetCard(note: string): (() => void) | null {
    const before = this.state().cards.find((c) => c.note === note);
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
    const before = st.cards.find((c) => c.note === note);
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
