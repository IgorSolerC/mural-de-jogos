import { canonicalJson } from './canonical-json';
import { MONTHS_SHORT } from './dates';
import { DEFAULT_FSRS, FsrsConfig, Srs, SrsState, daysBetween, freshSrs, review, studyDay } from './fsrs';
import { IconChoice, isIconChoice } from './icon-choices';
import { localImageId } from './images';
import { LIGHT_STOCKS, LightStock, newId } from './review';
import { cleanLabel } from './text';

/**
 * Os Estudos das anotações (PLANO-ESTUDOS.md): flashcards como os do Anki, feitos das anotações que já
 * existem. Uma anotação vira **carta** quando ganha uma **frente** (título, subtítulo, imagem); o **verso**
 * é a própria anotação, inteira. As cartas se juntam em **baralhos**, uma palavra que só existe aqui (não
 * são as tags nem os grupos do mural). Uma carta pode estar em vários baralhos, com um progresso só
 * (D3): respondida num, vale em todos.
 *
 * Como o Kanban, tudo mora fora da anotação: a carta guarda o id dela (`note`), a frente, os baralhos,
 * onde ela aparece (`wall`) e o progresso do FSRS (core/fsrs.ts). A anotação apagada some dos Estudos
 * sozinha (quem desenha só mostra as cartas de anotações que existem); desfazer o apagar traz a carta.
 *
 * Tudo aqui é puro: o saneamento do que vem guardado ou da nuvem, as mudanças (sempre devolvendo um
 * estado novo, com `at` mais novo no que mudou), a junção de dois aparelhos (`mergeStudy`, carta a carta
 * e baralho a baralho, a mudança mais nova vence, D10), o nível de cada carta e as palavras de "quando
 * volta". A fila do dia mora em core/study-queue.ts; o serviço que guarda e sincroniza, em
 * core/study-store.ts.
 */

export const MAX_DECKS = 100;
export const MAX_CARDS = 5000;
/** Em quantos baralhos, no máximo, uma carta pode estar. */
export const MAX_DECKS_PER_CARD = 20;
export const DECK_NAME_MAX = 40;
export const TITLE_MAX = 80;
export const SUBTITLE_MAX = 160;
/** Quantas cartas novas entram por dia num baralho novo (D6, escolha do usuário). */
export const DEFAULT_NEW_PER_DAY = 5;
export const MAX_NEW_PER_DAY = 999;
/** Quantas revisões por dia, no máximo, somando os baralhos (o padrão do Anki). */
export const DEFAULT_MAX_REVIEWS = 200;
export const MAX_REVIEWS_CAP = 9999;
/** As respostas que o boletim guarda, da mais antiga para a mais nova. */
export const MARKS_MAX = 20;
/** A partir de quantos dias de intervalo a carta é Dominada (o corte do Anki entre jovem e madura). */
export const MASTERED_DAYS = 21;
export const RETENTION_MIN = 0.8;
export const RETENTION_MAX = 0.95;

export type NewOrder = 'entrada' | 'sorteio';

/**
 * O desenho da frente das cartas de um baralho (pedido do usuário: "poder escolher por baralho qual vai ser
 * o estilo do flashcard", com a Clássica de padrão). Cinco releituras da carta de baralho e cinco objetos de
 * papelaria; a ordem é a da folha do baralho.
 */
export const CARD_LOOKS = ['classica', 'faixa', 'cartolina', 'orelha', 'antigo', 'argola', 'selo', 'polaroid', 'ingresso', 'biblioteca'] as const;
export type CardLook = (typeof CARD_LOOKS)[number];
export const DEFAULT_CARD_LOOK: CardLook = 'classica';

export const CARD_LOOK_LABEL: Record<CardLook, string> = {
  classica: 'Clássica',
  faixa: 'Faixa de cor',
  cartolina: 'Cartolina inteira',
  orelha: 'Orelha',
  antigo: 'Baralho antigo',
  argola: 'Ficha de argola',
  selo: 'Selo',
  polaroid: 'Polaroid',
  ingresso: 'Ingresso',
  biblioteca: 'Ficha da biblioteca',
};

export function isCardLook(v: unknown): v is CardLook {
  return (CARD_LOOKS as readonly unknown[]).includes(v);
}

/** O desenho das cartas do baralho (sem o campo, a Clássica). */
export function deckLook(deck: { look?: CardLook } | null | undefined): CardLook {
  return deck?.look ?? DEFAULT_CARD_LOOK;
}

export interface Deck {
  id: string;
  name: string;
  /** O ícone da cartela única (shared/cartela-de-icones.ts), ou nenhum. */
  icon: IconChoice | null;
  color: LightStock;
  /** Quantas cartas novas entram por dia (0: nenhuma). */
  newPerDay: number;
  /** As cartas aparecem no mural de anotações também (sem o campo: só nos Estudos, o padrão; D4). */
  wall?: true;
  /** O desenho da frente das cartas (sem o campo: a Clássica, o padrão). */
  look?: Exclude<CardLook, 'classica'>;
  /** A posição na fileira das abas. */
  order: number;
  at: string;
}

export interface CardFront {
  /** Sem título próprio, a frente usa o nome da anotação (D8). */
  title?: string;
  subtitle?: string;
  /** `murall://imagem/ID` ou um link `https://`. */
  image?: string;
}

export interface CardStats {
  seen: number;
  right: number;
  wrong: number;
  /** As últimas respostas, da mais antiga para a mais nova: '1' acertou, '0' errou. */
  marks: string;
}

export interface StudyCard {
  /** O id da anotação. */
  note: string;
  /** Os baralhos, na ordem em que a carta entrou neles (pelo menos um). */
  decks: string[];
  front: CardFront;
  /**
   * Onde mais a anotação aparece: `false`, só nos Estudos; `true`, no mural também. Sem o campo, segue os
   * baralhos (no mural se algum deles pede o mural; ver `studyOnWall`).
   */
  wall?: boolean;
  srs: Srs;
  stats: CardStats;
  /** Quando virou carta (a ordem das novas). */
  added: string;
  /** A última mudança: na junção de dois aparelhos, a mais nova vence. */
  at: string;
}

/** O que já entrou hoje, para os limites do dia (o dia vira às 4h, como no Anki). */
export interface StudyDay {
  day: string;
  /** As novas que entraram hoje, por baralho. */
  news: Record<string, number>;
  reviews: number;
  at: string;
}

export interface StudyConfig {
  retention: number;
  maxReviews: number;
  newOrder: NewOrder;
  at: string;
}

export interface StudyState {
  decks: Deck[];
  cards: StudyCard[];
  /** Os apagados (`deck:ID`, `card:NOTA` → quando): a junção não os traz de volta de outro aparelho. */
  removed: Record<string, string>;
  today: StudyDay | null;
  config: StudyConfig;
}

/** A hora zero: a configuração de sempre nunca passa na frente de uma escolhida na junção. */
export const FRESH_AT = '1970-01-01T00:00:00.000Z';

export const DEFAULT_STUDY_CONFIG: StudyConfig = { retention: DEFAULT_FSRS.retention, maxReviews: DEFAULT_MAX_REVIEWS, newOrder: 'entrada', at: FRESH_AT };

export function emptyStudy(): StudyState {
  return { decks: [], cards: [], removed: {}, today: null, config: { ...DEFAULT_STUDY_CONFIG } };
}

/** O nível da carta (D5), as quatro palavras do pedido. */
export type Level = 'desconhecida' | 'nova' | 'aprendendo' | 'dominada';

export const LEVEL_LABEL: Record<Level, string> = {
  desconhecida: 'Desconhecida',
  nova: 'Nova',
  aprendendo: 'Aprendendo',
  dominada: 'Dominada',
};

/**
 * Desconhecida: nunca respondida. Nova: nos passos do dia (1 e 10 min), antes de se formar. Aprendendo:
 * formada com intervalo de menos de 21 dias, ou reaprendendo depois de errar. Dominada: 21 dias ou mais.
 */
export function levelOf(srs: Srs): Level {
  switch (srs.state) {
    case 'nova':
      return 'desconhecida';
    case 'aprendendo':
      return 'nova';
    case 'reaprendendo':
      return 'aprendendo';
    case 'revisao':
      return srs.last && daysBetween(studyDay(new Date(srs.last)), studyDay(new Date(srs.due))) >= MASTERED_DAYS ? 'dominada' : 'aprendendo';
  }
}

// ——— saneamento ———

const ID_RE = /^[\w-]{1,64}$/;
const STATES: readonly SrsState[] = ['nova', 'aprendendo', 'revisao', 'reaprendendo'];

function isStamp(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
}

const iso = (stamp: string) => new Date(stamp).toISOString();

function int(v: unknown, min: number, max: number, fallback: number): number {
  return typeof v === 'number' && Number.isFinite(v) ? Math.min(max, Math.max(min, Math.round(v))) : fallback;
}

/** O texto da frente: uma linha, sem espaço sobrando, cortado no tamanho (sem mexer na caixa: "x²", "日"). */
export function cleanFrontText(raw: unknown, max: number): string {
  return typeof raw === 'string' ? raw.replace(/\s+/g, ' ').trim().slice(0, max).trim() : '';
}

/** A imagem da frente: uma guardada pelo Murall ou um link https; o resto não vale. */
export function cleanImage(raw: unknown): string | undefined {
  if (typeof raw !== 'string') return undefined;
  const v = raw.trim();
  if (localImageId(v)) return v;
  if (v.length > 2000) return undefined;
  try {
    return new URL(v).protocol === 'https:' ? v : undefined;
  } catch {
    return undefined;
  }
}

export function cleanFront(raw: unknown): CardFront {
  const f = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const title = cleanFrontText(f['title'], TITLE_MAX);
  const subtitle = cleanFrontText(f['subtitle'], SUBTITLE_MAX);
  const image = cleanImage(f['image']);
  return { ...(title ? { title } : {}), ...(subtitle ? { subtitle } : {}), ...(image ? { image } : {}) };
}

export function sanitizeDeck(raw: unknown): Deck | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['id'] !== 'string' || !ID_RE.test(r['id']) || !isStamp(r['at'])) return null;
  const name = cleanLabel(typeof r['name'] === 'string' ? r['name'] : '', DECK_NAME_MAX);
  if (!name) return null;
  return {
    id: r['id'],
    name,
    icon: isIconChoice(r['icon']) ? r['icon'] : null,
    color: LIGHT_STOCKS.includes(r['color'] as LightStock) ? (r['color'] as LightStock) : 'amarelo',
    newPerDay: int(r['newPerDay'], 0, MAX_NEW_PER_DAY, DEFAULT_NEW_PER_DAY),
    ...(r['wall'] === true ? { wall: true as const } : {}),
    ...(isCardLook(r['look']) && r['look'] !== DEFAULT_CARD_LOOK ? { look: r['look'] as Exclude<CardLook, 'classica'> } : {}),
    order: int(r['order'], 0, MAX_DECKS * 10, 0),
    at: r['at'],
  };
}

function sanitizeSrs(raw: unknown, fallbackDue: string): Srs {
  if (!raw || typeof raw !== 'object') return freshSrs(fallbackDue);
  const r = raw as Record<string, unknown>;
  const state = STATES.includes(r['state'] as SrsState) ? (r['state'] as SrsState) : 'nova';
  if (state === 'nova') return { ...freshSrs(isStamp(r['due']) ? iso(r['due']) : fallbackDue), reps: int(r['reps'], 0, 1e6, 0) };
  const s = typeof r['s'] === 'number' && Number.isFinite(r['s']) && r['s'] > 0 ? Math.min(r['s'], 1e6) : 0;
  const d = typeof r['d'] === 'number' && Number.isFinite(r['d']) ? Math.min(10, Math.max(1, r['d'])) : 0;
  // respondida sem estabilidade, dificuldade ou hora: não dá para continuar a conta, recomeça
  if (!s || !d || !isStamp(r['due']) || !isStamp(r['last'])) return freshSrs(fallbackDue);
  // as horas no mesmo formato (a fila compara como texto)
  return { state, step: int(r['step'], 0, 20, 0), s, d, due: iso(r['due']), last: iso(r['last']), reps: int(r['reps'], 1, 1e6, 1) };
}

function sanitizeStats(raw: unknown): CardStats {
  const r = (raw && typeof raw === 'object' ? raw : {}) as Record<string, unknown>;
  const marks = typeof r['marks'] === 'string' ? r['marks'].replace(/[^01]/g, '').slice(-MARKS_MAX) : '';
  return { seen: int(r['seen'], 0, 1e7, 0), right: int(r['right'], 0, 1e7, 0), wrong: int(r['wrong'], 0, 1e7, 0), marks };
}

export function sanitizeCard(raw: unknown): StudyCard | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['note'] !== 'string' || !ID_RE.test(r['note']) || !isStamp(r['at'])) return null;
  const decks = [...new Set(Array.isArray(r['decks']) ? r['decks'].filter((d): d is string => typeof d === 'string' && ID_RE.test(d)) : [])].slice(0, MAX_DECKS_PER_CARD);
  if (!decks.length) return null;
  const added = isStamp(r['added']) ? r['added'] : r['at'];
  return {
    note: r['note'],
    decks,
    front: cleanFront(r['front']),
    ...(typeof r['wall'] === 'boolean' ? { wall: r['wall'] } : {}),
    srs: sanitizeSrs(r['srs'], added),
    stats: sanitizeStats(r['stats']),
    added,
    at: r['at'],
  };
}

function sanitizeDay(raw: unknown): StudyDay | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  if (typeof r['day'] !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(r['day']) || !isStamp(r['at'])) return null;
  const news: Record<string, number> = {};
  if (r['news'] && typeof r['news'] === 'object') {
    for (const [id, n] of Object.entries(r['news'] as Record<string, unknown>)) if (ID_RE.test(id)) news[id] = int(n, 0, MAX_NEW_PER_DAY * 10, 0);
  }
  return { day: r['day'], news, reviews: int(r['reviews'], 0, MAX_REVIEWS_CAP * 10, 0), at: r['at'] };
}

/** A retenção: entre 80% e 95%, de 1 em 1 ponto. */
export function cleanRetention(v: unknown): number {
  if (typeof v !== 'number' || !Number.isFinite(v)) return DEFAULT_STUDY_CONFIG.retention;
  return Math.round(Math.min(RETENTION_MAX, Math.max(RETENTION_MIN, v)) * 100) / 100;
}

function sanitizeConfig(raw: unknown): StudyConfig {
  if (!raw || typeof raw !== 'object') return { ...DEFAULT_STUDY_CONFIG };
  const r = raw as Record<string, unknown>;
  return {
    retention: cleanRetention(r['retention']),
    maxReviews: int(r['maxReviews'], 0, MAX_REVIEWS_CAP, DEFAULT_MAX_REVIEWS),
    newOrder: r['newOrder'] === 'sorteio' ? 'sorteio' : 'entrada',
    at: isStamp(r['at']) ? r['at'] : FRESH_AT,
  };
}

const deckKey = (id: string) => `deck:${id}`;
const cardKey = (note: string) => `card:${note}`;
const REMOVED_RE = /^(deck|card):[\w-]{1,64}$/;

/** Apagado depois da última mudança: fica apagado. */
function buried(removed: Record<string, string>, key: string, at: string): boolean {
  return !!removed[key] && removed[key] >= at;
}

const byOrder = (a: Deck, b: Deck) => a.order - b.order || a.at.localeCompare(b.at) || a.id.localeCompare(b.id);
const byAdded = (a: StudyCard, b: StudyCard) => a.added.localeCompare(b.added) || a.note.localeCompare(b.note);

export function sanitizeStudy(raw: unknown): StudyState {
  if (!raw || typeof raw !== 'object') return emptyStudy();
  const r = raw as Record<string, unknown>;
  const removed: Record<string, string> = {};
  if (r['removed'] && typeof r['removed'] === 'object') {
    for (const [k, at] of Object.entries(r['removed'] as Record<string, unknown>)) if (REMOVED_RE.test(k) && isStamp(at)) removed[k] = at;
  }
  const decks = new Map<string, Deck>();
  for (const item of Array.isArray(r['decks']) ? r['decks'].slice(0, MAX_DECKS) : []) {
    const d = sanitizeDeck(item);
    if (d && !buried(removed, deckKey(d.id), d.at)) decks.set(d.id, d);
  }
  const cards = new Map<string, StudyCard>();
  for (const item of Array.isArray(r['cards']) ? r['cards'].slice(0, MAX_CARDS) : []) {
    const c = sanitizeCard(item);
    if (c && !buried(removed, cardKey(c.note), c.at)) cards.set(c.note, c);
  }
  return { decks: [...decks.values()].sort(byOrder), cards: [...cards.values()].sort(byAdded), removed, today: sanitizeDay(r['today']), config: sanitizeConfig(r['config']) };
}

/** O que vai para a nuvem: null sem nada (o mural de antes dos Estudos fica com a mesma impressão). */
export function studyToSync(state: StudyState): StudyState | null {
  const touched = state.decks.length || state.cards.length || Object.keys(state.removed).length || state.config.at !== FRESH_AT;
  return touched ? state : null;
}

// ——— junção ———

/** O mais novo de dois; no empate de horário, o maior texto (os dois aparelhos escolhem o mesmo). */
function newer<T extends { at: string }>(a: T | undefined, b: T): T {
  if (!a || b.at > a.at) return b;
  if (b.at === a.at && canonicalJson(b) > canonicalJson(a)) return b;
  return a;
}

/**
 * Os Estudos de dois aparelhos juntos: cada baralho e cada carta vêm de onde mudaram por último, o
 * apagado (depois da última mudança) fica apagado; do dia, o maior de cada número no mesmo dia, ou o dia
 * mais novo; a configuração, a mudada por último. O mesmo resultado dos dois lados, em qualquer ordem.
 */
export function mergeStudy(here: StudyState, there: StudyState): StudyState {
  const removed: Record<string, string> = { ...here.removed };
  for (const [k, at] of Object.entries(there.removed)) if (!removed[k] || at > removed[k]) removed[k] = at;
  const decks = new Map<string, Deck>();
  for (const d of [...here.decks, ...there.decks]) decks.set(d.id, newer(decks.get(d.id), d));
  const cards = new Map<string, StudyCard>();
  for (const c of [...here.cards, ...there.cards]) cards.set(c.note, newer(cards.get(c.note), c));
  return {
    decks: [...decks.values()].filter((d) => !buried(removed, deckKey(d.id), d.at)).sort(byOrder),
    cards: [...cards.values()].filter((c) => !buried(removed, cardKey(c.note), c.at)).sort(byAdded),
    removed,
    today: mergeDay(here.today, there.today),
    config: newer(here.config, there.config),
  };
}

function mergeDay(a: StudyDay | null, b: StudyDay | null): StudyDay | null {
  if (!a || !b) return a ?? b;
  if (a.day !== b.day) return a.day > b.day ? a : b;
  const news: Record<string, number> = { ...a.news };
  for (const [id, n] of Object.entries(b.news)) news[id] = Math.max(news[id] ?? 0, n);
  return { day: a.day, news, reviews: Math.max(a.reviews, b.reviews), at: a.at > b.at ? a.at : b.at };
}

// ——— leitura ———

/** Os baralhos da carta que existem, na ordem das abas. */
export function cardDecks(card: Pick<StudyCard, 'decks'>, decks: readonly Deck[]): Deck[] {
  return decks.filter((d) => card.decks.includes(d.id));
}

/**
 * O voto dos Estudos sobre o mural (PLANO-ESTUDOS.md, 4.4): a escolha da carta, ou, sem ela, "no mural"
 * se algum dos baralhos dela pede o mural. A carta sem nenhum baralho que exista não vota.
 */
export function studyOnWall(card: Pick<StudyCard, 'decks' | 'wall'>, decks: readonly Deck[]): boolean | null {
  const mine = cardDecks(card, decks);
  if (!mine.length) return null;
  return card.wall ?? mine.some((d) => d.wall);
}

/** O título da frente: o da carta, ou o nome da anotação (D8). */
export function frontTitle(card: Pick<StudyCard, 'front'>, noteTitle: string): string {
  return card.front.title || noteTitle;
}

/** Quantos acertos de cada cem, ou null sem nenhuma resposta. */
export function hitRate(stats: CardStats): number | null {
  const total = stats.right + stats.wrong;
  return total ? Math.round((stats.right / total) * 100) : null;
}

// ——— mudanças ———

export function fsrsConfig(config: StudyConfig): FsrsConfig {
  return { ...DEFAULT_FSRS, retention: config.retention };
}

export function setConfig(st: StudyState, patch: Partial<Omit<StudyConfig, 'at'>>, at: string): StudyState {
  return { ...st, config: sanitizeConfig({ ...st.config, ...patch, at }) };
}

/** Um baralho novo, no fim da fileira. */
export function addDeck(st: StudyState, name: string, color: LightStock, at: string, icon: IconChoice | null = null, id = newId()): { state: StudyState; id: string } {
  const order = st.decks.reduce((m, d) => Math.max(m, d.order + 1), 0);
  const deck = sanitizeDeck({ id, name, color, icon, newPerDay: DEFAULT_NEW_PER_DAY, order, at });
  if (!deck || st.decks.length >= MAX_DECKS) return { state: st, id: '' };
  const removed = { ...st.removed };
  delete removed[deckKey(id)];
  return { state: { ...st, decks: [...st.decks, deck], removed }, id };
}

export function updateDeck(st: StudyState, id: string, patch: Partial<Omit<Deck, 'id' | 'at' | 'order'>>, at: string): StudyState {
  return {
    ...st,
    decks: st.decks.map((d) => {
      if (d.id !== id) return d;
      // o "no mural também" desligado (wall: undefined) volta ao padrão, que não é guardado
      return sanitizeDeck({ ...d, ...patch, at }) ?? d;
    }),
  };
}

/** O baralho para a posição `to` da fileira; os que mudaram de lugar ganham a hora. */
export function moveDeck(st: StudyState, id: string, to: number, at: string): StudyState {
  const list = [...st.decks];
  const from = list.findIndex((d) => d.id === id);
  if (from < 0) return st;
  const [deck] = list.splice(from, 1);
  list.splice(Math.max(0, Math.min(to, list.length)), 0, deck);
  return { ...st, decks: list.map((d, i) => (d.order === i ? d : { ...d, order: i, at })) };
}

/**
 * Apaga o baralho: as cartas saem dele, e a que não fica em nenhum outro sai dos Estudos (e volta ao
 * mural). O que saiu vai junto na volta, para o Desfazer (`restoreDeck`).
 */
export function removeDeck(st: StudyState, id: string, at: string): { state: StudyState; deck: Deck | null; cards: StudyCard[] } {
  const deck = st.decks.find((d) => d.id === id) ?? null;
  if (!deck) return { state: st, deck: null, cards: [] };
  const removed = { ...st.removed, [deckKey(id)]: at };
  const touched = st.cards.filter((c) => c.decks.includes(id));
  const cards: StudyCard[] = [];
  for (const c of st.cards) {
    if (!c.decks.includes(id)) cards.push(c);
    else if (c.decks.length > 1) cards.push({ ...c, decks: c.decks.filter((d) => d !== id), at });
    else removed[cardKey(c.note)] = at;
  }
  return { state: { ...st, decks: st.decks.filter((d) => d.id !== id), cards, removed }, deck, cards: touched };
}

/** O Desfazer do apagar: o baralho e as cartas como estavam, com a hora nova (vencem o apagado). */
export function restoreDeck(st: StudyState, deck: Deck, cards: readonly StudyCard[], at: string): StudyState {
  const removed = { ...st.removed };
  delete removed[deckKey(deck.id)];
  for (const c of cards) delete removed[cardKey(c.note)];
  const back = new Map(cards.map((c) => [c.note, { ...c, at }]));
  const kept = st.cards.filter((c) => !back.has(c.note));
  return {
    ...st,
    decks: [...st.decks.filter((d) => d.id !== deck.id), { ...deck, at }].sort(byOrder),
    cards: [...kept, ...back.values()].sort(byAdded),
    removed,
  };
}

/**
 * A anotação vira carta (ou entra em mais baralhos, se já era). `wall` é a escolha "no mural" dela: a
 * anotação que já estava no mural entra com `true` (nada some sem a pessoa mandar, D4).
 */
export function addCard(st: StudyState, note: string, decks: readonly string[], front: CardFront, at: string, wall?: boolean): StudyState {
  const before = st.cards.find((c) => c.note === note);
  if (before) return setDecks(st, note, [...before.decks, ...decks], at);
  if (st.cards.length >= MAX_CARDS) return st;
  const card = sanitizeCard({ note, decks, front, ...(wall === undefined ? {} : { wall }), srs: freshSrs(at), stats: {}, added: at, at });
  if (!card) return st;
  const removed = { ...st.removed };
  delete removed[cardKey(note)];
  return { ...st, cards: [...st.cards, card], removed };
}

function patchCard(st: StudyState, note: string, f: (c: StudyCard) => StudyCard | null): StudyState {
  return { ...st, cards: st.cards.map((c) => (c.note === note ? (f(c) ?? c) : c)) };
}

export function updateFront(st: StudyState, note: string, front: CardFront, at: string): StudyState {
  return patchCard(st, note, (c) => ({ ...c, front: cleanFront(front), at }));
}

/** Os baralhos da carta; sem nenhum, ela sai dos Estudos. */
export function setDecks(st: StudyState, note: string, decks: readonly string[], at: string): StudyState {
  const list = [...new Set(decks.filter((d) => ID_RE.test(d)))].slice(0, MAX_DECKS_PER_CARD);
  if (!list.length) return removeCard(st, note, at);
  return patchCard(st, note, (c) => ({ ...c, decks: list, at }));
}

/** "No mural": true, false, ou `undefined` para seguir os baralhos. */
export function setCardWall(st: StudyState, note: string, wall: boolean | undefined, at: string): StudyState {
  return patchCard(st, note, (c) => {
    const { wall: _, ...rest } = c;
    return wall === undefined ? { ...rest, at } : { ...rest, wall, at };
  });
}

export function removeCard(st: StudyState, note: string, at: string): StudyState {
  if (!st.cards.some((c) => c.note === note)) return st;
  return { ...st, cards: st.cards.filter((c) => c.note !== note), removed: { ...st.removed, [cardKey(note)]: at } };
}

/** O Desfazer de tirar a carta: ela volta como estava, com a hora nova. */
export function restoreCard(st: StudyState, card: StudyCard, at: string): StudyState {
  const removed = { ...st.removed };
  delete removed[cardKey(card.note)];
  return { ...st, cards: [...st.cards.filter((c) => c.note !== card.note), { ...card, at }].sort(byAdded), removed };
}

/** Recomeçar o progresso: a carta volta a Desconhecida, sem respostas. */
export function resetCard(st: StudyState, note: string, at: string): StudyState {
  return patchCard(st, note, (c) => ({ ...c, srs: freshSrs(at), stats: { seen: 0, right: 0, wrong: 0, marks: '' }, at }));
}

/** O dia de hoje, recomeçado quando o dia de estudo virou. */
export function todayOf(st: StudyState, now: Date): StudyDay {
  const day = studyDay(now);
  return st.today?.day === day ? st.today : { day, news: {}, reviews: 0, at: now.toISOString() };
}

/**
 * A resposta a uma carta: o FSRS decide quando ela volta, o boletim conta, e o dia anota a nova (no
 * baralho `deck`, o que a trouxe) ou a revisão. Errei é a nota 1, Acertei a 3.
 */
export function answer(st: StudyState, note: string, ok: boolean, now: Date, deck?: string): StudyState {
  const card = st.cards.find((c) => c.note === note);
  if (!card) return st;
  const at = now.toISOString();
  const srs = review(card.srs, ok ? 3 : 1, now, fsrsConfig(st.config), note);
  const stats: CardStats = {
    seen: card.stats.seen + 1,
    right: card.stats.right + (ok ? 1 : 0),
    wrong: card.stats.wrong + (ok ? 0 : 1),
    marks: (card.stats.marks + (ok ? '1' : '0')).slice(-MARKS_MAX),
  };
  const day = todayOf(st, now);
  // o baralho que trouxe a carta; senão, o primeiro dela que ainda existe (nunca um apagado noutro aparelho)
  const counted = deck && card.decks.includes(deck) ? deck : (cardDecks(card, st.decks)[0]?.id ?? card.decks[0]);
  const today: StudyDay =
    card.srs.state === 'nova'
      ? { ...day, news: { ...day.news, [counted]: (day.news[counted] ?? 0) + 1 }, at }
      : card.srs.state === 'revisao'
        ? { ...day, reviews: day.reviews + 1, at }
        : { ...day, at };
  return { ...patchCard(st, note, (c) => ({ ...c, srs, stats, at })), today };
}

// ——— palavras ———

const numberFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/**
 * Em quanto tempo, curto: "1 min", "10 min", "3 h", "1 dia", "40 dias", "2 meses", "1,5 ano". A carta em
 * revisão (`byDay`) conta em dias de estudo; nos passos, pela hora.
 */
export function intervalLabel(now: Date, due: Date, byDay: boolean): string {
  const ms = due.getTime() - now.getTime();
  if (!byDay) {
    const min = Math.max(1, Math.round(ms / 60_000));
    if (min < 60) return `${min} min`;
    const h = Math.round(min / 60);
    if (h < 24) return `${h} h`;
  }
  const days = byDay ? Math.max(0, daysBetween(studyDay(now), studyDay(due))) : Math.round(ms / 86_400_000);
  if (days < 1) return 'hoje';
  if (days < 45) return days === 1 ? '1 dia' : `${days} dias`;
  if (days < 365) return `${Math.round(days / 30)} meses`;
  const y = Math.round((days / 365) * 10) / 10;
  return `${numberFmt.format(y)} ${y >= 2 ? 'anos' : 'ano'}`;
}

/** Quando a carta volta, dito como gente: "hoje", "agora", "daqui a 8 min", "amanhã", "em 3 dias". */
export function whenLabel(srs: Srs, now: Date): string {
  const due = new Date(srs.due);
  if (srs.state === 'nova') return 'agora';
  if (srs.state === 'revisao') {
    // vencida (hoje ou antes): é para hoje
    const days = daysBetween(studyDay(now), studyDay(due));
    if (days <= 0 || due <= now) return 'hoje';
    if (days === 1) return 'amanhã';
    return `em ${intervalLabel(now, due, true)}`;
  }
  if (due <= now) return 'agora';
  return `daqui a ${intervalLabel(now, due, false)}`;
}

/**
 * O que a frente da carta mostra do progresso, nos desenhos que mostram (o nível, quando volta, o carimbo
 * da data, as últimas respostas e o número da carta no baralho).
 */
export interface CardFace {
  level: Level;
  /** As palavras de `whenLabel`. */
  when: string;
  /** O dia em que volta, como um carimbo: "06 NOV" (a vencida, o dia de hoje). */
  stamp: string;
  seen: number;
  /** As últimas respostas: '1' acertou, '0' errou. */
  marks: string;
  /** A posição da carta no baralho, na ordem em que entrou (1 é a primeira). */
  number?: number;
}

export function cardFace(card: Pick<StudyCard, 'srs' | 'stats'>, now: Date, number?: number): CardFace {
  const due = new Date(card.srs.due);
  const day = due < now ? now : due;
  return {
    level: levelOf(card.srs),
    when: whenLabel(card.srs, now),
    stamp: `${String(day.getDate()).padStart(2, '0')} ${MONTHS_SHORT[day.getMonth()].toUpperCase()}`,
    seen: card.stats.seen,
    marks: card.stats.marks,
    ...(number ? { number } : {}),
  };
}
