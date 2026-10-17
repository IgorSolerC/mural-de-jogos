import { CategoryColorId, lookKey } from './category-looks';
import { cleanTag } from './note-labels';
import { LIGHT_STOCKS, LightStock, fold, newId } from './review';

/**
 * Os quadros Kanban das anotações (`/anotacoes/kanban`): **cada categoria das anotações tem o seu
 * quadro**, e só as anotações dela entram nele (não dá para pôr uma anotação de Estudos no quadro do
 * Trabalho). Não existe quadro solto, sem categoria. O quadro tem colunas (as etapas: "A fazer",
 * "Fazendo", "Feito"…) e, nelas, anotações de verdade: a anotação continua sendo a mesma do mural; o
 * quadro só guarda onde ela está e a importância dela ali. As etiquetas da anotação no quadro são as
 * tags dela mesma (as do mural), cada uma com a sua cor (ver `tagLookKey`).
 *
 * O id do quadro sai da categoria (`boardIdFor`): dois aparelhos que montam o quadro da mesma
 * categoria montam o mesmo quadro. Enquanto ninguém mexeu nele, o quadro de uma categoria é o de
 * sempre (`freshBoard`, com as três colunas e a hora zero, para nunca passar na frente de um de
 * verdade na junção) e nem é guardado.
 *
 * Os quadros de antes (com nome, sem categoria, e as "características" só deles) ficam em `legacy`
 * até `attachLegacy` espalhar as anotações deles pelos quadros das categorias delas e as
 * características virarem tags das anotações, com a cor da fita.
 *
 * Tudo aqui é puro (sem Angular): o saneamento do que vem guardado ou da nuvem, as mudanças (sempre
 * devolvendo um quadro novo, com `at` mais novo) e a junção de dois aparelhos (`mergeKanban`), quadro
 * a quadro, o mudado por último valendo. O serviço que guarda e sincroniza é `KanbanStore`.
 */

/** A importância de uma anotação no quadro, da mais alta para a mais baixa. */
export type Importance = 'critico' | 'importante' | 'medio' | 'baixo' | 'baixissimo';
export const IMPORTANCES: readonly Importance[] = ['critico', 'importante', 'medio', 'baixo', 'baixissimo'];
export const IMPORTANCE_LABEL: Record<Importance, string> = {
  critico: 'Crítico',
  importante: 'Importante',
  medio: 'Médio',
  baixo: 'Baixo',
  baixissimo: 'Baixíssimo',
};

/**
 * As cores das fitas Dymo das características de antes, na cor de tag que cada uma virou (a preta
 * vira a tag de sempre, sem cor: o papel pardo já é a etiqueta neutra).
 */
export const LEGACY_TRAIT_COLOR: Readonly<Record<string, CategoryColorId | null>> = {
  preta: null,
  vermelha: 'vermelho',
  azul: 'azul',
  verde: 'verde',
  amarela: 'amarelo',
  laranja: 'laranja',
  roxa: 'roxo',
  rosa: 'rosa',
};

/** Os desenhos de uma coluna (o desenho de cada um fica em ui/kanban-icons.ts). */
export const COLUMN_ICONS = [
  'circulo',
  'lista',
  'lapis',
  'martelo',
  'engrenagem',
  'olho',
  'ampulheta',
  'pausa',
  'bloqueio',
  'check',
  'trofeu',
  'foguete',
  'lampada',
  'inseto',
  'bandeira',
  'estrela',
  'caixa',
  'calendario',
  'pessoas',
  'chama',
] as const;
export type ColumnIcon = (typeof COLUMN_ICONS)[number];

/** Uma coluna (etapa) do quadro. */
export interface KanbanColumn {
  id: string;
  name: string;
  icon: ColumnIcon;
  /** A cartolina da etiqueta da coluna (as claras: a tinta do nome é sempre preta). */
  color: LightStock;
  /** Anotação que chega aqui é finalizada (e, saindo para uma coluna que não finaliza, aberta de novo). */
  finishes: boolean;
}

/** Uma anotação no quadro. A ordem dentro da coluna é a ordem em `cards`. */
export interface KanbanCard {
  /** O id da anotação. */
  note: string;
  column: string;
  importance: Importance | null;
}

export interface KanbanBoard {
  /** `boardIdFor(category)`. */
  id: string;
  /** A categoria do quadro, sem acento nem caixa (a chave de `categoryKey`). */
  category: string;
  /** Quando o quadro mudou pela última vez (ISO): na junção de dois aparelhos, o mais novo vale. */
  at: string;
  columns: KanbanColumn[];
  cards: KanbanCard[];
}

/** Uma característica de um quadro de antes: o nome e a cor da fita. */
export interface LegacyTrait {
  id: string;
  name: string;
  color: string;
}

/** Um quadro de antes, de nome livre e sem categoria, esperando `attachLegacy`. */
export interface LegacyBoard {
  id: string;
  name: string;
  at: string;
  columns: KanbanColumn[];
  traits: LegacyTrait[];
  cards: (KanbanCard & { traits: string[] })[];
}

export interface KanbanState {
  boards: KanbanBoard[];
  /** Os quadros apagados (id → quando): a junção não os traz de volta de outro aparelho. */
  removed: Record<string, string>;
  /** Os quadros de antes, ainda sem categoria (ver `attachLegacy`). */
  legacy: LegacyBoard[];
}

export const EMPTY_KANBAN: KanbanState = { boards: [], removed: {}, legacy: [] };

/** Um quadro por categoria: tantos quanto as categorias que dá para guardar. */
export const MAX_BOARDS = 200;
export const MAX_COLUMNS = 20;
export const MAX_CARDS = 1000;
export const NAME_MAX = 40;
/** A hora de um quadro em que ninguém mexeu: qualquer quadro de verdade passa na frente dele. */
export const FRESH_AT = '1970-01-01T00:00:00.000Z';

const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const cleanId = (v: unknown) => (typeof v === 'string' ? v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '');
const cleanName = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});
const importanceOf = (v: unknown): Importance | null => ((IMPORTANCES as readonly string[]).includes(v as string) ? (v as Importance) : null);

/** A chave da categoria de um quadro: a de `lookKey` (sem acento nem caixa), do tamanho que se guarda. */
export function categoryKey(category: string): string {
  return lookKey(category).slice(0, 64);
}

/** Dois FNV-1a de 32 bits misturados de jeitos diferentes, em hexadecimal: 64 bits, sem colisão na prática. */
function hash64(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x050c5d1f;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    a = Math.imul(a ^ c, 0x01000193);
    b = Math.imul(b ^ c, 0x01000193) ^ (b >>> 13);
  }
  return (a >>> 0).toString(16).padStart(8, '0') + (b >>> 0).toString(16).padStart(8, '0');
}

/** O id do quadro de uma categoria: o mesmo em todo aparelho. */
export function boardIdFor(category: string): string {
  return `kb${hash64(categoryKey(category))}`;
}

/**
 * As colunas de todo quadro novo: A fazer, Fazendo e Feito (a que finaliza). Com `prefix`, os ids
 * saem dele (o quadro de uma categoria em que ninguém mexeu é igual em todo aparelho); sem, sorteados.
 */
export function defaultColumns(prefix?: string): KanbanColumn[] {
  const id = (s: string) => (prefix ? `${prefix}-${s}` : newId());
  return [
    { id: id('afazer'), name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
    { id: id('fazendo'), name: 'Fazendo', icon: 'lapis', color: 'amarelo', finishes: false },
    { id: id('feito'), name: 'Feito', icon: 'check', color: 'verde', finishes: true },
  ];
}

/** O quadro de uma categoria em que ninguém mexeu: as três colunas de sempre, vazio, na hora zero. */
export function freshBoard(category: string): KanbanBoard {
  const id = boardIdFor(category);
  return { id, category: categoryKey(category), at: FRESH_AT, columns: defaultColumns(id), cards: [] };
}

function sanitizeColumn(raw: unknown): KanbanColumn | null {
  const r = rec(raw);
  const id = cleanId(r['id']);
  if (!id) return null;
  return {
    id,
    name: cleanName(r['name'], NAME_MAX) || 'Coluna',
    icon: (COLUMN_ICONS as readonly string[]).includes(r['icon'] as string) ? (r['icon'] as ColumnIcon) : 'circulo',
    color: (LIGHT_STOCKS as readonly string[]).includes(r['color'] as string) ? (r['color'] as LightStock) : 'cinza',
    finishes: r['finishes'] === true,
  };
}

/** As colunas guardadas, sem repetir; nenhuma: as três de sempre. */
function sanitizeColumns(raw: unknown, prefix?: string): KanbanColumn[] {
  const columns: KanbanColumn[] = [];
  for (const c of asList(raw)) {
    const col = sanitizeColumn(c);
    if (col && !columns.some((x) => x.id === col.id) && columns.length < MAX_COLUMNS) columns.push(col);
  }
  // um quadro sem coluna nenhuma não tem onde pôr nada: volta com as três de sempre
  return columns.length ? columns : defaultColumns(prefix);
}

/** As anotações guardadas de um quadro (com o que veio delas): só as de coluna que existe, uma vez cada. */
function sanitizeCards(raw: unknown, columns: readonly KanbanColumn[]): { card: KanbanCard; raw: Record<string, unknown> }[] {
  const out: { card: KanbanCard; raw: Record<string, unknown> }[] = [];
  for (const c of asList(raw)) {
    const cr = rec(c);
    const note = cleanId(cr['note']);
    const column = cleanId(cr['column']);
    if (!note || !columns.some((x) => x.id === column) || out.some((x) => x.card.note === note) || out.length >= MAX_CARDS) continue;
    out.push({ card: { note, column, importance: importanceOf(cr['importance']) }, raw: cr });
  }
  return out;
}

/**
 * Um quadro que veio guardado ou da nuvem: só valores conhecidos, nada sem dono. Sem categoria, é um
 * quadro de antes (ver `sanitizeLegacy`): null aqui.
 */
export function sanitizeBoard(raw: unknown): KanbanBoard | null {
  const r = rec(raw);
  const category = typeof r['category'] === 'string' ? categoryKey(r['category']) : '';
  if (!category || !isIso(r['at'])) return null;
  // o id sai da categoria: um id guardado diferente não vale
  const id = boardIdFor(category);
  const columns = sanitizeColumns(r['columns'], id);
  return { id, category, at: r['at'] as string, columns, cards: sanitizeCards(r['cards'], columns).map((c) => c.card) };
}

/** Um quadro de antes (nome livre, características só dele), ou null. */
export function sanitizeLegacy(raw: unknown): LegacyBoard | null {
  const r = rec(raw);
  const id = cleanId(r['id']);
  if (!id || typeof r['category'] === 'string' || !isIso(r['at'])) return null;
  const columns = sanitizeColumns(r['columns']);
  const traits: LegacyTrait[] = [];
  for (const t of asList(r['traits'])) {
    const tr = rec(t);
    const tid = cleanId(tr['id']);
    const name = cleanTag(typeof tr['name'] === 'string' ? tr['name'] : '');
    if (tid && name && !traits.some((x) => x.id === tid)) traits.push({ id: tid, name, color: typeof tr['color'] === 'string' ? tr['color'] : '' });
  }
  const cards = sanitizeCards(r['cards'], columns).map(({ card, raw: cr }) => ({
    ...card,
    traits: [...new Set(asList(cr['traits']).map(cleanId))].filter((t) => traits.some((x) => x.id === t)),
  }));
  return { id, name: cleanName(r['name'], NAME_MAX) || 'Quadro', at: r['at'] as string, columns, traits, cards };
}

/** Sem os apagados depois da última mudança deles. */
function alive<T extends { id: string; at: string }>(list: T[], removed: Record<string, string>): T[] {
  return list.filter((b) => !(removed[b.id] && removed[b.id] >= b.at));
}

export function sanitizeKanban(raw: unknown): KanbanState {
  const r = rec(raw);
  const boards: KanbanBoard[] = [];
  const legacy: LegacyBoard[] = [];
  // os de antes vêm na lista dos quadros (guardados antes da categoria) ou na deles
  for (const b of [...asList(r['boards']), ...asList(r['legacy'])]) {
    const board = sanitizeBoard(b);
    if (board) {
      if (!boards.some((x) => x.id === board.id) && boards.length < MAX_BOARDS) boards.push(board);
      continue;
    }
    const old = sanitizeLegacy(b);
    if (old && !legacy.some((x) => x.id === old.id) && legacy.length < MAX_BOARDS) legacy.push(old);
  }
  const removed: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(r['removed']))) {
    const id = cleanId(k);
    if (id && isIso(v)) removed[id] = v;
  }
  // um quadro apagado depois da última mudança dele continua apagado
  return { boards: alive(boards, removed), removed, legacy: alive(legacy, removed) };
}

/** Os daqui, cada um trocado pelo de lá quando o de lá é mais novo, e os só de lá no fim. */
function newest<T extends { id: string; at: string }>(here: readonly T[], there: readonly T[]): T[] {
  const theirs = new Map(there.map((b) => [b.id, b]));
  const out = here.map((b) => {
    const t = theirs.get(b.id);
    return t && t.at > b.at ? t : b;
  });
  for (const t of there) if (!out.some((b) => b.id === t.id)) out.push(t);
  return out;
}

/**
 * Junta os quadros de dois aparelhos: cada quadro inteiro vem de quem o mudou por último (mexer em
 * quadros diferentes nunca briga); um quadro apagado depois da última mudança dele fica apagado. A
 * ordem é a daqui, com os que só existem lá no fim, na ordem de lá. Os quadros de antes também se
 * juntam (e a conversão deles roda depois, ver `KanbanStore`).
 */
export function mergeKanban(here: KanbanState, there: KanbanState): KanbanState {
  const removed: Record<string, string> = { ...here.removed };
  for (const [id, at] of Object.entries(there.removed)) if (!removed[id] || removed[id] < at) removed[id] = at;
  return { boards: alive(newest(here.boards, there.boards), removed), removed, legacy: alive(newest(here.legacy, there.legacy), removed) };
}

/** O que muda um quadro: o resultado com `at` novo (a mudança mais nova, na junção). */
function touch<T extends { at: string }>(b: T, patch: Partial<T>, at: string): T {
  return { ...b, ...patch, at: at > b.at ? at : new Date(Date.parse(b.at) + 1).toISOString() };
}

/** As anotações de uma coluna, na ordem. */
export function cardsIn(b: KanbanBoard, column: string): KanbanCard[] {
  return b.cards.filter((c) => c.column === column);
}

/** Recomeça o quadro: as três colunas de sempre, sem nenhuma anotação. */
export function resetBoard(b: KanbanBoard, at: string): KanbanBoard {
  return touch(b, { columns: defaultColumns(), cards: [] }, at);
}

/** Uma coluna nova no fim (ou depois de `after`), com uma cor que ainda não está no quadro, se houver. */
export function addColumn(b: KanbanBoard, name: string, at: string, after?: string): { board: KanbanBoard; id: string } {
  if (b.columns.length >= MAX_COLUMNS) return { board: b, id: '' };
  const used = new Set(b.columns.map((c) => c.color));
  const color = LIGHT_STOCKS.find((s) => s !== 'branco' && !used.has(s)) ?? 'cinza';
  const col: KanbanColumn = { id: newId(), name: cleanName(name, NAME_MAX) || 'Nova coluna', icon: 'circulo', color, finishes: false };
  const at0 = after ? b.columns.findIndex((c) => c.id === after) : -1;
  const columns = [...b.columns];
  columns.splice(at0 >= 0 ? at0 + 1 : columns.length, 0, col);
  return { board: touch(b, { columns }, at), id: col.id };
}

export function updateColumn(b: KanbanBoard, id: string, patch: Partial<Omit<KanbanColumn, 'id'>>, at: string): KanbanBoard {
  const columns = b.columns.map((c) => {
    if (c.id !== id) return c;
    const next = { ...c, ...patch };
    return sanitizeColumn(next) ?? c;
  });
  return touch(b, { columns }, at);
}

/** Leva a coluna para a posição `to` (as outras andam). */
export function moveColumn(b: KanbanBoard, id: string, to: number, at: string): KanbanBoard {
  const from = b.columns.findIndex((c) => c.id === id);
  if (from < 0) return b;
  const columns = b.columns.filter((c) => c.id !== id);
  columns.splice(Math.max(0, Math.min(to, columns.length)), 0, b.columns[from]);
  return touch(b, { columns }, at);
}

/**
 * Tira a coluna; as anotações dela vão para o fim de `into` (a vizinha, normalmente). Sem `into`
 * (ou a última coluna do quadro), elas saem do quadro. O quadro nunca fica sem coluna.
 */
export function removeColumn(b: KanbanBoard, id: string, into: string | null, at: string): KanbanBoard {
  if (b.columns.length <= 1 || !b.columns.some((c) => c.id === id)) return b;
  const target = into && into !== id && b.columns.some((c) => c.id === into) ? into : null;
  const moved = b.cards.filter((c) => c.column === id);
  const rest = b.cards.filter((c) => c.column !== id);
  const cards = target ? [...rest, ...moved.map((c) => ({ ...c, column: target }))] : rest;
  return touch(b, { columns: b.columns.filter((c) => c.id !== id), cards }, at);
}

/**
 * Põe a anotação na coluna, na posição `index` entre as anotações dela (no fim, sem `index`). Já
 * estava no quadro: muda de lugar, com a importância dela. Quem confere se a anotação é da categoria
 * do quadro é quem chama (`KanbanActions.move`).
 */
export function placeCard(b: KanbanBoard, note: string, column: string, at: string, index?: number): KanbanBoard {
  if (!b.columns.some((c) => c.id === column)) return b;
  const old = b.cards.find((c) => c.note === note);
  if (!old && b.cards.length >= MAX_CARDS) return b;
  const card: KanbanCard = old ? { ...old, column } : { note, column, importance: null };
  const others = b.cards.filter((c) => c.note !== note);
  const inCol = others.filter((c) => c.column === column);
  const i = index === undefined ? inCol.length : Math.max(0, Math.min(index, inCol.length));
  // a posição na lista inteira: antes da anotação que ocupa o lugar `i` na coluna, ou depois da última dela
  let pos: number;
  if (i < inCol.length) pos = others.indexOf(inCol[i]);
  else if (inCol.length) pos = others.indexOf(inCol[inCol.length - 1]) + 1;
  else pos = others.length;
  const cards = [...others];
  cards.splice(pos, 0, card);
  // não saiu do lugar: nada muda (nem a hora do quadro)
  if (old && cards.every((c, k) => c.note === b.cards[k].note && c.column === b.cards[k].column)) return b;
  return touch(b, { cards }, at);
}

/**
 * Leva várias anotações de uma vez para a coluna, uma atrás da outra na ordem dada, antes da
 * anotação `before` (que fica na coluna e não está entre elas) ou, sem ela, no fim da coluna.
 */
export function placeCards(b: KanbanBoard, notes: readonly string[], column: string, at: string, before: string | null): KanbanBoard {
  let out = b;
  for (const note of notes) {
    const inCol = out.cards.filter((c) => c.column === column && c.note !== note);
    const i = before ? inCol.findIndex((c) => c.note === before) : -1;
    out = placeCard(out, note, column, at, i < 0 ? undefined : i);
  }
  // não saiu nada do lugar: nada muda (nem a hora do quadro)
  if (out.cards.length === b.cards.length && out.cards.every((c, k) => c.note === b.cards[k].note && c.column === b.cards[k].column)) return b;
  return out;
}

export function removeCard(b: KanbanBoard, note: string, at: string): KanbanBoard {
  if (!b.cards.some((c) => c.note === note)) return b;
  return touch(b, { cards: b.cards.filter((c) => c.note !== note) }, at);
}

export function setImportance(b: KanbanBoard, note: string, importance: Importance | null, at: string): KanbanBoard {
  return touch(b, { cards: b.cards.map((c) => (c.note === note ? { ...c, importance } : c)) }, at);
}

/**
 * Para onde vai uma anotação movida, e o que muda nela: chegando numa coluna que finaliza, vindo de
 * uma que não finaliza (ou de fora do quadro), ela é finalizada; saindo de uma que finaliza para uma
 * que não finaliza, ela abre de novo. Entre duas que finalizam (ou duas que não), nada muda.
 */
export function doneChange(b: KanbanBoard, from: string | null, to: string): 'finalizar' | 'abrir' | null {
  const f = from ? (b.columns.find((c) => c.id === from)?.finishes ?? false) : false;
  const t = b.columns.find((c) => c.id === to)?.finishes ?? false;
  if (t && !f) return 'finalizar';
  if (!t && f && from) return 'abrir';
  return null;
}

/** O que importa de uma anotação para os quadros: a categoria (que diz o quadro) e as tags. */
export interface BoardNote {
  id: string;
  category?: string;
  tags?: readonly string[];
}

/** A anotação pode estar no quadro? Só as da categoria dele. */
export function belongs(b: Pick<KanbanBoard, 'category'>, n: Pick<BoardNote, 'category'> | undefined): boolean {
  return !!n?.category?.trim() && categoryKey(n.category) === b.category;
}

/** As anotações do quadro que estão nele de verdade: existem e ainda são da categoria dele. */
export function liveCards(b: KanbanBoard, notes: ReadonlyMap<string, Pick<BoardNote, 'category'>>): KanbanCard[] {
  return b.cards.filter((c) => belongs(b, notes.get(c.note)));
}

/** Uma categoria com quadro: a chave, o nome (a grafia mais usada) e quantas anotações tem. */
export interface BoardCategory {
  key: string;
  label: string;
  notes: number;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/**
 * As categorias das anotações, cada uma com o seu quadro: da que tem mais anotações para a que tem
 * menos (no empate, de A a Z), como as abas do mural; com a ordem montada à mão (`order`, as chaves),
 * nela, e as novas no fim. As anotações sem categoria não têm quadro.
 */
export function boardCategories(notes: readonly Pick<BoardNote, 'category'>[], order: readonly string[] | null = null): BoardCategory[] {
  const buckets = new Map<string, { n: number; spellings: Map<string, number> }>();
  for (const r of notes) {
    const label = r.category?.trim();
    if (!label) continue;
    const key = categoryKey(label);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { n: 0, spellings: new Map() }));
    b.n++;
    b.spellings.set(label, (b.spellings.get(label) ?? 0) + 1);
  }
  const out: BoardCategory[] = [...buckets].map(([key, b]) => ({
    key,
    // a grafia mais usada (no empate, a primeira que apareceu)
    label: [...b.spellings.entries()].reduce((best, e) => (e[1] > best[1] ? e : best))[0],
    notes: b.n,
  }));
  out.sort((a, b) => b.notes - a.notes || collator.compare(a.label, b.label));
  if (order) {
    const at = new Map(order.map((k, i) => [k, i]));
    const place = (c: BoardCategory) => at.get(c.key) ?? order.length;
    out.sort((a, b) => place(a) - place(b));
  }
  return out;
}

/** O que a conversão dos quadros de antes pede para mudar fora dos quadros. */
export interface LegacyOutcome {
  state: KanbanState;
  /** As tags a pôr em cada anotação (as características que ela tinha). */
  tags: Map<string, string[]>;
  /** A cor de cada tag (a da fita da característica; a preta não ganha cor). */
  colors: Map<string, CategoryColorId>;
}

/**
 * Espalha as anotações dos quadros de antes pelos quadros das categorias delas: cada uma vai para o
 * quadro da sua categoria, na coluna de mesmo nome (ou na primeira), com a importância; as
 * características viram tags dela, com a cor da fita. O quadro de uma categoria nasce com as colunas
 * do quadro de antes que tinha o nome dela (ou, sem nenhum, do que tinha mais anotações dela). As
 * anotações sem categoria (ou que não existem mais) ficam de fora: não há quadro solto. Os quadros de
 * antes ficam lembrados como apagados, para a junção não trazê-los de volta. Sem quadro de antes,
 * nada muda. Rodar de novo com o resultado não muda mais nada.
 */
export function attachLegacy(state: KanbanState, notes: readonly BoardNote[], at: string): LegacyOutcome {
  const tags = new Map<string, string[]>();
  const colors = new Map<string, CategoryColorId>();
  if (!state.legacy.length) return { state, tags, colors };
  const byId = new Map(notes.map((n) => [n.id, n]));
  const keyOf = (note: string) => {
    const c = byId.get(note)?.category?.trim();
    return c ? categoryKey(c) : '';
  };
  // de que quadro de antes vêm as colunas de cada categoria: o de mesmo nome, ou o que tinha mais dela
  const source = new Map<string, LegacyBoard>();
  const keys = new Set(state.legacy.flatMap((lb) => lb.cards.map((c) => keyOf(c.note)).filter(Boolean)));
  for (const lb of state.legacy) {
    const k = categoryKey(lb.name);
    if (keys.has(k) && !source.has(k)) source.set(k, lb);
  }
  for (const k of keys) {
    if (source.has(k)) continue;
    let best: LegacyBoard | null = null;
    let most = 0;
    for (const lb of state.legacy) {
      const n = lb.cards.filter((c) => keyOf(c.note) === k).length;
      if (n > most) [best, most] = [lb, n];
    }
    if (best) source.set(k, best);
  }
  const boards = [...state.boards];
  const indexOf = new Map(boards.map((b, i) => [b.category, i]));
  for (const lb of state.legacy) {
    for (const c of lb.cards) {
      const key = keyOf(c.note);
      if (!key) continue;
      let i = indexOf.get(key);
      if (i === undefined) {
        const id = boardIdFor(key);
        const from = source.get(key);
        boards.push({ id, category: key, at: FRESH_AT, columns: from ? from.columns.map((x) => ({ ...x })) : defaultColumns(id), cards: [] });
        indexOf.set(key, (i = boards.length - 1));
      }
      const b = boards[i];
      if (b.cards.some((x) => x.note === c.note) || b.cards.length >= MAX_CARDS) continue;
      const name = fold(lb.columns.find((x) => x.id === c.column)?.name ?? '');
      const column = b.columns.find((x) => x.id === c.column) ?? b.columns.find((x) => fold(x.name) === name) ?? b.columns[0];
      boards[i] = touch(b, { cards: [...b.cards, { note: c.note, column: column.id, importance: c.importance }] }, at);
      for (const t of c.traits) {
        const trait = lb.traits.find((x) => x.id === t);
        if (!trait) continue;
        const list = tags.get(c.note) ?? [];
        if (!list.some((x) => fold(x) === fold(trait.name))) tags.set(c.note, [...list, trait.name]);
        const color = LEGACY_TRAIT_COLOR[trait.color];
        if (color && ![...colors.keys()].some((x) => fold(x) === fold(trait.name))) colors.set(trait.name, color);
      }
    }
  }
  const kept = new Set(boards.map((b) => b.id));
  const removed = { ...state.removed };
  for (const lb of state.legacy) if (!kept.has(lb.id)) removed[lb.id] = at > lb.at ? at : new Date(Date.parse(lb.at) + 1).toISOString();
  return { state: { boards, removed, legacy: [] }, tags, colors };
}
