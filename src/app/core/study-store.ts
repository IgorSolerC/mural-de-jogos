import { DestroyRef, Injectable, computed, effect, inject, signal, untracked } from '@angular/core';
import { IconChoice } from './icon-choices';
import { LightStock, audienceFields } from './review';
import { ReviewStore } from './review-store';
import { GroupStudies } from './group-studies';
import { GroupStudy, knownDecks, overlayStudy, personalCopy, samePart, sameDecks, studyPart } from './shared-study';
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
  frozenSince,
  groupKey,
  hasProgress,
  inGroup,
  keepRicher,
  liveStudy,
  mergeStudy,
  moveDeck,
  moveGroup,
  pauseDeck,
  removeCard,
  removeDeck,
  resetCard,
  sameView,
  restoreCard,
  resetDeck,
  restoreDeck,
  resumeDeck,
  sanitizeStudy,
  studyGroupId,
  setCardWall,
  setConfig,
  setDecks,
  studyOnWall,
  thawSrs,
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
 *
 * Num grupo compartilhado (PLANO-FLASHCARDS-GRUPO.md), os baralhos e as cartas são do grupo: moram no documento dele
 * (`SharedGroupsStore.studies`, pela ponte core/group-studies.ts), os mesmos para todos. `saved` é o guardado aqui (o progresso, a pausa, as novas por
 * dia, e uma cópia do resto); `state` é ele com o documento de cada grupo por cima (`overlayStudy`). Toda mudança
 * passa por `set`: vai inteira para o guardado e, no que é de um grupo em que você escreve, para o documento dele.
 */
@Injectable({ providedIn: 'root' })
export class StudyStore {
  private readonly store = inject(ReviewStore);
  private readonly groups = inject(GroupStudies);

  /** O guardado neste aparelho (o que vai para a nuvem, no mural privado): o progresso e uma cópia do resto. */
  readonly saved = signal<StudyState>(read());
  /** Os grupos compartilhados com os Flashcards deles (só os que já guardam a parte no documento contam por cima). */
  private readonly shared = computed(() => this.groups.studies());
  /** Já há anotações lidas (sem ler a lista inteira a cada letra escrita numa anotação). */
  private readonly hasNotes = computed(() => this.store.notes().length > 0);
  /**
   * Os Estudos como valem aqui: o guardado, com os baralhos e as cartas de cada grupo compartilhado vindos do
   * documento dele (ver `overlayStudy`), com os baralhos de cada carta como estão (inclusive os de outro grupo).
   */
  readonly state = computed<StudyState>(() => {
    const st = overlayStudy(this.saved(), this.shared());
    // os baralhos iguais aos de antes ficam os mesmos (a resposta muda só as cartas): sem isso, a vista, as filas e
    // as contas se refariam a cada resposta num grupo compartilhado
    const before = this.lastDecks;
    if (st.decks !== before && sameDecks(st.decks, before)) return { ...st, decks: before };
    this.lastDecks = st.decks;
    return st;
  });
  private lastDecks: Deck[] = [];
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
    effect(() => writeJson(STUDY_KEY, this.saved()));
    // os baralhos seus de um grupo compartilhado que ainda não estão no documento dele vão para ele (D4): o de antes
    // desta build, o feito num aparelho que ainda não sabia do grupo. Só com as anotações lidas e os grupos conferidos:
    // antes disso, o nome que o grupo tem aqui pode ainda não ser o certo ("Trabalho" no lugar de "Trabalho · Ana")
    effect(() => {
      const st = this.state();
      const groups = this.shared();
      if (!this.groups.synced() || !this.hasNotes()) return;
      untracked(() => this.toGroups(st, groups));
    });
    // o grupo que sai deste aparelho: o dono fica com os baralhos como estavam no grupo; quem não é o dono, sem eles
    this.groups.beforeLeave((id, keep) => this.leaveGroup(id, keep));
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
    const next = keepRicher(fromOtherTab(STUDY_KEY, before, this.saved(), read, sanitizeStudy), this.saved());
    if (JSON.stringify(next) !== JSON.stringify(this.saved())) this.saved.set(next);
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
    const thawed = this.thawLeaving(this.state(), next);
    // (o baralho novo de um grupo só vai para ele com o nome do grupo aqui já certo, como no efeito de levar)
    this.toGroups(thawed, this.shared(), this.groups.synced() && this.hasNotes());
    // (os flashcards do grupo nunca estudados aqui não ficam no guardado: a vista os traz do documento)
    this.saved.set(personalCopy(thawed, this.shared()));
    this.changedAt.set(Date.now());
  }

  /**
   * O que é dos grupos compartilhados em que você escreve, nos Estudos `st`, vai para o documento de cada um (só o
   * que mudou: a resposta, a pausa e as novas por dia ficam aqui). No grupo em que você só lê, nada sobe, e a vista
   * continua com o do documento.
   */
  private toGroups(st: StudyState, groups: readonly GroupStudy[], seed = true): void {
    if (!groups.some((g) => g.write)) return;
    const known = groups.map((g) => knownDecks(g));
    let at: string | null = null;
    groups.forEach((g, i) => {
      if (!g.write) return;
      const others = new Set(known.filter((_, j) => j !== i).flatMap((k) => [...k]));
      at ??= this.stamp();
      const part = studyPart(st, g, others, at, seed);
      if (!samePart(g.part, part)) this.groups.update(g.id, part);
    });
  }

  /**
   * O grupo compartilhado `id` sai deste aparelho (ver `GroupStudies.beforeLeave`). O dono (`keep`) fica com os
   * baralhos e as cartas como estavam no grupo, e o progresso dele (o guardado passa a ser a vista de agora); quem não
   * é o dono perde as anotações do grupo, e os baralhos dele saem dos Estudos (D6).
   */
  private leaveGroup(id: string, keep: boolean): void {
    const g = this.shared().find((x) => x.id === id);
    if (!g?.part) return;
    if (keep) {
      this.saved.set(this.state());
    } else {
      const at = this.stamp();
      let st = this.saved();
      // os do documento e os seus de antes no grupo (que só você via): as anotações deles saíram junto
      const leaving = st.decks.filter((d) => knownDecks(g).has(d.id) || inGroup(d, g.name));
      for (const d of leaving) st = removeDeck(st, d.id, at).state;
      if (st === this.saved()) return;
      this.saved.set(st);
    }
    this.changedAt.set(Date.now());
  }

  /**
   * A carta que estava parada (só em baralhos pausados) e deixa de estar por uma mudança daqui (entrou num baralho em
   * estudo, o pausado saiu dela) anda o tempo em que ficou parada, como no retomar: senão voltaria atrasada a pausa
   * inteira. A que a própria mudança já andou (o `resumeDeck`, uma resposta) fica como veio.
   */
  private thawLeaving(prev: StudyState, next: StudyState): StudyState {
    if (!prev.decks.some((d) => d.paused)) return next;
    const before = new Map(liveStudy(prev, this.groupOf).cards.map((c) => [c.note, c]));
    const after = new Map(liveStudy(next, this.groupOf).cards.map((c) => [c.note, c]));
    const now = new Date();
    let changed = false;
    const cards = next.cards.map((c) => {
      const was = before.get(c.note);
      const since = was ? frozenSince(was, prev.decks) : null;
      if (!since || was!.srs !== c.srs || frozenSince(after.get(c.note) ?? c, next.decks)) return c;
      const srs = thawSrs(c.srs, since, now);
      if (srs === c.srs) return c;
      changed = true;
      return { ...c, srs };
    });
    return changed ? { ...next, cards } : next;
  }

  deck(id: string): Deck | undefined {
    return this.decks().find((d) => d.id === id);
  }

  /**
   * O grupo compartilhado do baralho (PLANO-FLASHCARDS-GRUPO.md): o que tem o baralho no documento, ou, para o que
   * ainda não foi para ele, o de mesmo nome. undefined: o baralho é só seu.
   */
  sharedOf(id: string): GroupStudy | undefined {
    const groups = this.shared();
    if (!groups.length) return undefined;
    const inDoc = groups.find((g) => knownDecks(g).has(id));
    if (inDoc) return inDoc;
    const key = groupKey(this.deck(id)?.group);
    return key ? groups.find((g) => groupKey(g.name) === key) : undefined;
  }

  /** O grupo é compartilhado e você só lê nele: nada de baralho novo nem flashcard novo nele (D3). */
  readOnlyGroup(group: string | null | undefined): boolean {
    const key = groupKey(group);
    return !!key && this.shared().some((g) => !g.write && groupKey(g.name) === key);
  }

  /**
   * O baralho é de um grupo em que você só lê: só o que é seu muda (a pausa, o recomeçar, as novas por dia). O que você
   * já tinha no grupo antes de ele ser compartilhado, e que nunca foi para o documento, continua seu (D4).
   */
  readOnlyDeck(id: string): boolean {
    return this.shared().some((g) => !g.write && knownDecks(g).has(id));
  }

  /** Quem vê o baralho só muda com quem gere o grupo dele (D3): o Editor vê, mas não muda. */
  audienceLocked(id: string): boolean {
    const g = this.sharedOf(id);
    return !!g && !g.manage;
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
    const st = this.thawed(note, when);
    const next = answer(st, note, ok, when, deck, this.stamp());
    this.set(st.today && next.today && next.today.day < st.today.day ? { ...next, today: st.today } : next);
  }

  /**
   * Os Estudos com a carta `note` andada o tempo em que ela ficou parada até `when`, se ela está só em baralhos
   * pausados (uma resposta vinda da API): o FSRS conta o intervalo como se a pausa não tivesse existido, e o retomar
   * depois não a anda de novo (ela foi respondida depois da pausa).
   */
  private thawed(note: string, when: Date): StudyState {
    const st = this.state();
    const card = this.cardOf().get(note);
    const since = card ? frozenSince(card, st.decks) : null;
    if (!since) return st;
    return { ...st, cards: st.cards.map((c) => (c.note === note ? { ...c, srs: thawSrs(c.srs, since, when) } : c)) };
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

  /** Pausa o baralho: nada dele chama para estudar até ele ser retomado (ver `pauseDeck`). */
  pauseDeck(id: string): void {
    this.set(pauseDeck(this.state(), id, this.stamp()));
  }

  /** Retoma o baralho pausado: as cartas dele voltam como estavam, com as datas andando o tempo da pausa (ver `resumeDeck`). */
  resumeDeck(id: string): void {
    const at = this.stamp();
    this.set(resumeDeck(this.state(), this.view(), id, new Date(at), at));
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

  /**
   * A carta como as telas mostram (`card`, da vista): a parada num baralho pausado, com a volta de quando ele for
   * retomado agora (`thawSrs`): a que faltavam 3 dias continua faltando 3 dias, a pausa inteira.
   */
  shown(card: StudyCard, now = this.now()): StudyCard {
    const since = frozenSince(card, this.decks());
    return since ? { ...card, srs: thawSrs(card.srs, since, now) } : card;
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
   * Tira a carta de um baralho só, sem mexer nos outros dela, nem nos de outro grupo em que ela dorme (o
   * "Tirar de" do menu do flashcard). Sem baralho nenhum, ela sai dos Estudos.
   */
  leaveDeck(note: string, deck: string): void {
    const card = this.state().cards.find((c) => c.note === note);
    if (card) this.set(setDecks(this.state(), note, card.decks.filter((d) => d !== deck), this.stamp()));
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
   * Recomeça o progresso de todas as cartas do baralho (ver `resetDeck`); devolve quantas recomeçaram e o Desfazer (o
   * progresso de cada uma volta como estava, sem mexer no resto da carta; false quando não dá mais: o baralho foi
   * pausado ou retomado depois), ou null sem nada a recomeçar.
   */
  resetDeck(id: string): { count: number; undo: () => boolean } | null {
    const out = resetDeck(this.state(), this.view(), id, this.live, this.stamp());
    if (!out.before.length) return null;
    this.set(out.state);
    const before = new Map(out.before.map((c) => [c.note, c]));
    const pauseAt = this.deck(id)?.pauseAt;
    return {
      count: before.size,
      // só as que continuam recomeçadas (a respondida de novo fica com a resposta nova), e não depois de pausar ou
      // retomar o baralho: o progresso de antes não andou o tempo da pausa
      undo: () => {
        if (this.deck(id)?.pauseAt !== pauseAt) return false;
        const at = this.stamp();
        const now = this.state();
        const back = (c: StudyCard) => before.has(c.note) && !hasProgress(c);
        this.set({ ...now, cards: now.cards.map((c) => (back(c) ? { ...c, srs: before.get(c.note)!.srs, stats: before.get(c.note)!.stats, at } : c)) });
        return true;
      },
    };
  }

  /** Quantas cartas do baralho têm progresso para recomeçar, e quantas delas também estão em outro baralho. */
  progressIn(id: string): { count: number; shared: number } {
    let count = 0;
    let shared = 0;
    for (const c of this.cards()) {
      if (!c.decks.includes(id) || !this.live(c.note) || !hasProgress(c)) continue;
      count++;
      if (c.decks.length > 1) shared++;
    }
    return { count, shared };
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
    const when = new Date(this.stamp());
    this.set(answer(this.thawed(note, when), note, ok, when, deck));
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
    const next = mergeStudy(this.saved(), remote);
    if (JSON.stringify(next) !== JSON.stringify(this.saved())) this.saved.set(next);
  }
}
