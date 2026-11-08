import { seededRandom, studyDay } from './fsrs';
import { Deck, StudyCard, StudyState, todayOf } from './study';

/**
 * A fila do dia dos Estudos (PLANO-ESTUDOS.md, 5.4), como a do Anki: as cartas em aprendizado que já
 * venceram, as revisões vencidas (da que venceu há mais tempo para a mais nova) e as novas, até o limite
 * do dia de cada baralho. Os números que a tela mostra (na pilha, na aba, no topo) saem daqui, os mesmos
 * da sessão: o que entraria se a pessoa apertasse Estudar agora.
 *
 * A sessão não guarda a fila: depois de cada resposta, pergunta de novo (`nextUp`). A carta respondida
 * sai sozinha (vence noutro dia, ou daqui a 1 ou 10 minutos), e a nova que entrou conta no limite.
 *
 * Tudo puro: quem chama passa a hora e quais anotações existem.
 */

/** Quanto antes a carta em aprendizado pode aparecer quando não há mais nada (o "aprender adiantado"). */
export const LEARN_AHEAD_MS = 20 * 60_000;

export type QueueKind = 'nova' | 'aprender' | 'revisao';

export interface QueueItem {
  note: string;
  /** O baralho que traz a carta (na nova, o que conta no limite). */
  deck: string;
  kind: QueueKind;
}

export interface QueueCounts {
  novas: number;
  aprender: number;
  revisar: number;
}

export interface DayQueue {
  /** As em aprendizado que vencem até `LEARN_AHEAD_MS` depois de agora, da que vence antes. */
  learning: QueueItem[];
  /** Revisões e novas intercaladas, na ordem em que aparecem. */
  rest: QueueItem[];
  counts: QueueCounts;
}

const EMPTY: QueueCounts = { novas: 0, aprender: 0, revisar: 0 };

/**
 * O que se estuda: um baralho (o id), os baralhos de um grupo (os ids, o Estudar o grupo), ou todos (sem
 * nada: o Estudar tudo). Nos dois últimos, a carta de dois baralhos aparece uma vez só.
 */
export type StudyScope = string | readonly string[] | undefined;

/** Os baralhos do escopo, na ordem das abas. */
function scopeDecks(st: StudyState, scope: StudyScope): Deck[] {
  if (scope === undefined) return st.decks;
  const ids = typeof scope === 'string' ? [scope] : scope;
  return st.decks.filter((d) => ids.includes(d.id));
}

/**
 * As cartas do escopo, cada uma uma vez só, com o baralho que a traz: o primeiro dela (na ordem das abas)
 * entre os estudados. `live` diz se a anotação da carta existe. A fila do dia e o treino
 * (core/study-drill.ts) partem daqui.
 */
export function scopeCards(st: StudyState, scope: StudyScope, live: (note: string) => boolean = () => true): { card: StudyCard; deck: Deck }[] {
  const decks = scopeDecks(st, scope);
  if (!decks.length) return [];
  const order = new Map(decks.map((d, i) => [d.id, i]));
  const out: { card: StudyCard; deck: Deck }[] = [];
  for (const card of st.cards) {
    if (!live(card.note)) continue;
    let best = -1;
    for (const id of card.decks) {
      const i = order.get(id);
      if (i !== undefined && (best < 0 || i < best)) best = i;
    }
    if (best >= 0) out.push({ card, deck: decks[best] });
  }
  return out;
}

/** A fila de hoje do escopo (ver `StudyScope`). `live` diz se a anotação da carta existe. */
export function dayQueue(st: StudyState, now: Date, scope?: StudyScope, live: (note: string) => boolean = () => true): DayQueue {
  const decks = scopeDecks(st, scope);
  if (!decks.length) return { learning: [], rest: [], counts: { ...EMPTY } };
  const today = todayOf(st, now);
  const day = studyDay(now);
  const nowMs = now.getTime();
  const learning: (QueueItem & { due: number })[] = [];
  const reviews: (QueueItem & { due: string })[] = [];
  const fresh: StudyCard[] = [];
  for (const { card: c, deck } of scopeCards(st, scope, live)) {
    const { state, due } = c.srs;
    if (state === 'aprendendo' || state === 'reaprendendo') {
      const t = Date.parse(due);
      if (t <= nowMs + LEARN_AHEAD_MS) learning.push({ note: c.note, deck: deck.id, kind: 'aprender', due: t });
    } else if (state === 'revisao') {
      if (studyDay(new Date(due)) <= day) reviews.push({ note: c.note, deck: deck.id, kind: 'revisao', due });
    } else fresh.push(c);
  }
  learning.sort((a, b) => a.due - b.due || a.note.localeCompare(b.note));
  // revisões: a que venceu há mais tempo primeiro; no mesmo dia, um sorteio do dia (o mesmo em todo aparelho)
  const tie = (note: string) => seededRandom(`${day}:${note}`);
  reviews.sort((a, b) => a.due.localeCompare(b.due) || tie(a.note) - tie(b.note));
  const reviewRoom = Math.max(0, st.config.maxReviews - today.reviews);
  const dueReviews = reviews.slice(0, reviewRoom);
  // novas: cada baralho, na ordem das abas, pega as suas até o que sobra do limite de hoje; a carta de
  // dois baralhos conta no primeiro que ainda tem vaga
  const byEntry = (a: StudyCard, b: StudyCard) => a.added.localeCompare(b.added) || a.note.localeCompare(b.note);
  const shuffled = (a: StudyCard, b: StudyCard) => tie(a.note) - tie(b.note) || byEntry(a, b);
  fresh.sort(st.config.newOrder === 'sorteio' ? shuffled : byEntry);
  const taken = new Set<string>();
  const news: QueueItem[] = [];
  for (const d of decks) {
    let room = Math.max(0, d.newPerDay - (today.news[d.id] ?? 0));
    for (const c of fresh) {
      if (!room) break;
      if (taken.has(c.note) || !c.decks.includes(d.id)) continue;
      taken.add(c.note);
      news.push({ note: c.note, deck: d.id, kind: 'nova' });
      room--;
    }
  }
  const rest = interleave(
    dueReviews.map(({ note, deck, kind }) => ({ note, deck, kind })),
    news,
  );
  return {
    learning: learning.map(({ note, deck, kind }) => ({ note, deck, kind })),
    rest,
    counts: { novas: news.length, aprender: learning.length, revisar: dueReviews.length },
  };
}

/** As novas espalhadas entre as revisões, por igual (como o Anki faz), e não todas no fim. */
export function interleave<T>(reviews: readonly T[], news: readonly T[]): T[] {
  const placed = [
    ...reviews.map((x, i) => ({ x, at: (i + 0.5) / reviews.length, review: 0 })),
    ...news.map((x, i) => ({ x, at: (i + 0.5) / news.length, review: 1 })),
  ];
  return placed.sort((a, b) => a.at - b.at || a.review - b.review).map((p) => p.x);
}

export interface NextUp {
  item: QueueItem | null;
  /** Sem nada para agora: quando a próxima carta em aprendizado de hoje volta (ISO), ou null. */
  later: string | null;
}

/**
 * A próxima carta da sessão: primeiro a em aprendizado que já venceu; depois revisões e novas; sem mais
 * nada, a em aprendizado que vence nos próximos 20 minutos. Se não sobrar nada, `later` diz quando volta a
 * próxima de hoje (a sessão termina dizendo isso).
 */
export function nextUp(st: StudyState, now: Date, scope?: StudyScope, live?: (note: string) => boolean): NextUp {
  const q = dayQueue(st, now, scope, live);
  const byNote = new Map(st.cards.map((c) => [c.note, c]));
  const dueNow = q.learning.find((i) => Date.parse(byNote.get(i.note)!.srs.due) <= now.getTime());
  if (dueNow) return { item: dueNow, later: null };
  if (q.rest.length) return { item: q.rest[0], later: null };
  if (q.learning.length) return { item: q.learning[0], later: null };
  const day = studyDay(now);
  const ids = new Set(scopeDecks(st, scope).map((d) => d.id));
  let later: string | null = null;
  for (const c of st.cards) {
    if ((c.srs.state !== 'aprendendo' && c.srs.state !== 'reaprendendo') || (live && !live(c.note))) continue;
    if (!c.decks.some((d) => ids.has(d))) continue;
    if (studyDay(new Date(c.srs.due)) === day && (!later || c.srs.due < later)) later = c.srs.due;
  }
  return { item: null, later };
}

/** Os números de cada baralho e o de todos juntos (o Estudar tudo, sem contar duas vezes). */
export function allCounts(st: StudyState, now: Date, live?: (note: string) => boolean): { total: QueueCounts; byDeck: Map<string, QueueCounts> } {
  const byDeck = new Map(st.decks.map((d) => [d.id, dayQueue(st, now, d.id, live).counts]));
  return { total: dayQueue(st, now, undefined, live).counts, byDeck };
}

/** Quantas cartas para hoje, somando os três montes. */
export function countTotal(c: QueueCounts): number {
  return c.novas + c.aprender + c.revisar;
}
