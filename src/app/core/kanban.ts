import { LIGHT_STOCKS, LightStock, fold, newId } from './review';

/**
 * Os quadros Kanban das anotações (`/anotacoes/kanban`): cada quadro tem colunas (as etapas: "A
 * fazer", "Fazendo", "Feito"…) e, nelas, anotações de verdade. A anotação continua sendo a mesma do
 * mural; o quadro só guarda onde ela está, a importância e as características dela ali. Uma anotação
 * pode estar em mais de um quadro, cada um com a sua importância e as suas características.
 *
 * As características são as "tags" do quadro: só existem nele (nunca aparecem no mural nem mudam as
 * tags da anotação), cada uma numa fita Dymo da cor dela.
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

/** As cores das fitas Dymo das características (a fita de plástico em relevo vem nestas cores). */
export type TraitColor = 'preta' | 'vermelha' | 'azul' | 'verde' | 'amarela' | 'laranja' | 'roxa' | 'rosa';
export const TRAIT_COLORS: readonly TraitColor[] = ['azul', 'vermelha', 'verde', 'preta', 'amarela', 'roxa', 'laranja', 'rosa'];
export const TRAIT_COLOR_LABEL: Record<TraitColor, string> = {
  preta: 'Preta',
  vermelha: 'Vermelha',
  azul: 'Azul',
  verde: 'Verde',
  amarela: 'Amarela',
  laranja: 'Laranja',
  roxa: 'Roxa',
  rosa: 'Rosa',
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

/** Uma característica do quadro: o nome e a cor da fita. */
export interface KanbanTrait {
  id: string;
  name: string;
  color: TraitColor;
}

/** Uma anotação no quadro. A ordem dentro da coluna é a ordem em `cards`. */
export interface KanbanCard {
  /** O id da anotação. */
  note: string;
  column: string;
  importance: Importance | null;
  /** Os ids das características do quadro. */
  traits: string[];
}

export interface KanbanBoard {
  id: string;
  name: string;
  /** Quando o quadro mudou pela última vez (ISO): na junção de dois aparelhos, o mais novo vale. */
  at: string;
  columns: KanbanColumn[];
  traits: KanbanTrait[];
  cards: KanbanCard[];
}

export interface KanbanState {
  boards: KanbanBoard[];
  /** Os quadros apagados (id → quando): a junção não os traz de volta de outro aparelho. */
  removed: Record<string, string>;
}

export const EMPTY_KANBAN: KanbanState = { boards: [], removed: {} };

export const MAX_BOARDS = 40;
export const MAX_COLUMNS = 20;
export const MAX_CARDS = 1000;
export const MAX_TRAITS = 60;
export const MAX_CARD_TRAITS = 12;
export const NAME_MAX = 40;
export const TRAIT_MAX = 28;

const isIso = (v: unknown): v is string => typeof v === 'string' && Number.isFinite(Date.parse(v));
const cleanId = (v: unknown) => (typeof v === 'string' ? v.replace(/[^A-Za-z0-9_-]/g, '').slice(0, 40) : '');
const cleanName = (v: unknown, max: number) => (typeof v === 'string' ? v.replace(/\s+/g, ' ').trim().slice(0, max) : '');
const asList = (v: unknown): unknown[] => (Array.isArray(v) ? v : []);
const rec = (v: unknown): Record<string, unknown> => (v && typeof v === 'object' && !Array.isArray(v) ? (v as Record<string, unknown>) : {});

/** As colunas de todo quadro novo: A fazer, Fazendo e Feito (a que finaliza). */
export function defaultColumns(): KanbanColumn[] {
  return [
    { id: newId(), name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
    { id: newId(), name: 'Fazendo', icon: 'lapis', color: 'amarelo', finishes: false },
    { id: newId(), name: 'Feito', icon: 'check', color: 'verde', finishes: true },
  ];
}

export function newBoard(name: string, at = new Date().toISOString()): KanbanBoard {
  return { id: newId(), name: cleanName(name, NAME_MAX) || 'Quadro', at, columns: defaultColumns(), traits: [], cards: [] };
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

function sanitizeTrait(raw: unknown): KanbanTrait | null {
  const r = rec(raw);
  const id = cleanId(r['id']);
  const name = cleanName(r['name'], TRAIT_MAX);
  if (!id || !name) return null;
  return { id, name, color: (TRAIT_COLORS as readonly string[]).includes(r['color'] as string) ? (r['color'] as TraitColor) : 'azul' };
}

/** Um quadro que veio guardado ou da nuvem: só valores conhecidos, nada sem dono (coluna, característica). */
export function sanitizeBoard(raw: unknown): KanbanBoard | null {
  const r = rec(raw);
  const id = cleanId(r['id']);
  if (!id || !isIso(r['at'])) return null;
  const columns: KanbanColumn[] = [];
  for (const c of asList(r['columns'])) {
    const col = sanitizeColumn(c);
    if (col && !columns.some((x) => x.id === col.id) && columns.length < MAX_COLUMNS) columns.push(col);
  }
  const traits: KanbanTrait[] = [];
  for (const t of asList(r['traits'])) {
    const tr = sanitizeTrait(t);
    if (tr && !traits.some((x) => x.id === tr.id) && traits.length < MAX_TRAITS) traits.push(tr);
  }
  const cards: KanbanCard[] = [];
  for (const c of asList(r['cards'])) {
    const cr = rec(c);
    const note = cleanId(cr['note']);
    const column = cleanId(cr['column']);
    if (!note || !columns.some((x) => x.id === column) || cards.some((x) => x.note === note) || cards.length >= MAX_CARDS) continue;
    const ids = asList(cr['traits']).map(cleanId);
    cards.push({
      note,
      column,
      importance: (IMPORTANCES as readonly string[]).includes(cr['importance'] as string) ? (cr['importance'] as Importance) : null,
      traits: [...new Set(ids)].filter((t) => traits.some((x) => x.id === t)).slice(0, MAX_CARD_TRAITS),
    });
  }
  // um quadro sem coluna nenhuma não tem onde pôr nada: volta com as três de sempre
  return { id, name: cleanName(r['name'], NAME_MAX) || 'Quadro', at: r['at'] as string, columns: columns.length ? columns : defaultColumns(), traits, cards };
}

export function sanitizeKanban(raw: unknown): KanbanState {
  const r = rec(raw);
  const boards: KanbanBoard[] = [];
  for (const b of asList(r['boards'])) {
    const board = sanitizeBoard(b);
    if (board && !boards.some((x) => x.id === board.id) && boards.length < MAX_BOARDS) boards.push(board);
  }
  const removed: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(r['removed']))) {
    const id = cleanId(k);
    if (id && isIso(v)) removed[id] = v;
  }
  // um quadro apagado depois da última mudança dele continua apagado
  return { boards: boards.filter((b) => !(removed[b.id] && removed[b.id] >= b.at)), removed };
}

/**
 * Junta os quadros de dois aparelhos: cada quadro inteiro vem de quem o mudou por último (mexer em
 * quadros diferentes nunca briga); um quadro apagado depois da última mudança dele fica apagado. A
 * ordem é a daqui, com os que só existem lá no fim, na ordem de lá.
 */
export function mergeKanban(here: KanbanState, there: KanbanState): KanbanState {
  const removed: Record<string, string> = { ...here.removed };
  for (const [id, at] of Object.entries(there.removed)) if (!removed[id] || removed[id] < at) removed[id] = at;
  const theirs = new Map(there.boards.map((b) => [b.id, b]));
  const boards: KanbanBoard[] = [];
  for (const b of here.boards) {
    const t = theirs.get(b.id);
    boards.push(t && t.at > b.at ? t : b);
  }
  for (const t of there.boards) if (!boards.some((b) => b.id === t.id)) boards.push(t);
  return { boards: boards.filter((b) => !(removed[b.id] && removed[b.id] >= b.at)), removed };
}

/** O que muda um quadro: o resultado com `at` novo (a mudança mais nova, na junção). */
function touch(b: KanbanBoard, patch: Partial<KanbanBoard>, at: string): KanbanBoard {
  return { ...b, ...patch, at: at > b.at ? at : new Date(Date.parse(b.at) + 1).toISOString() };
}

/** As anotações de uma coluna, na ordem. */
export function cardsIn(b: KanbanBoard, column: string): KanbanCard[] {
  return b.cards.filter((c) => c.column === column);
}

export function renameBoard(b: KanbanBoard, name: string, at: string): KanbanBoard {
  return touch(b, { name: cleanName(name, NAME_MAX) || b.name }, at);
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
 * estava no quadro: muda de lugar, com a importância e as características dela.
 */
export function placeCard(b: KanbanBoard, note: string, column: string, at: string, index?: number): KanbanBoard {
  if (!b.columns.some((c) => c.id === column)) return b;
  const old = b.cards.find((c) => c.note === note);
  if (!old && b.cards.length >= MAX_CARDS) return b;
  const card: KanbanCard = old ? { ...old, column } : { note, column, importance: null, traits: [] };
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

export function removeCard(b: KanbanBoard, note: string, at: string): KanbanBoard {
  if (!b.cards.some((c) => c.note === note)) return b;
  return touch(b, { cards: b.cards.filter((c) => c.note !== note) }, at);
}

export function setImportance(b: KanbanBoard, note: string, importance: Importance | null, at: string): KanbanBoard {
  return touch(b, { cards: b.cards.map((c) => (c.note === note ? { ...c, importance } : c)) }, at);
}

/** Liga ou desliga uma característica na anotação. */
export function toggleTrait(b: KanbanBoard, note: string, trait: string, at: string): KanbanBoard {
  if (!b.traits.some((t) => t.id === trait)) return b;
  const cards = b.cards.map((c) => {
    if (c.note !== note) return c;
    const has = c.traits.includes(trait);
    if (!has && c.traits.length >= MAX_CARD_TRAITS) return c;
    return { ...c, traits: has ? c.traits.filter((t) => t !== trait) : [...c.traits, trait] };
  });
  return touch(b, { cards }, at);
}

/** A característica do quadro com esse nome (sem acento nem caixa), se houver. */
export function traitNamed(b: KanbanBoard, name: string): KanbanTrait | null {
  const key = fold(cleanName(name, TRAIT_MAX));
  return (key && b.traits.find((t) => fold(t.name) === key)) || null;
}

/**
 * Uma característica nova no quadro (ou a que já tem esse nome), na próxima cor da roda das fitas.
 * Devolve o id ("" quando não cabe ou o nome está vazio).
 */
export function addTrait(b: KanbanBoard, name: string, at: string, color?: TraitColor): { board: KanbanBoard; id: string } {
  const clean = cleanName(name, TRAIT_MAX);
  if (!clean) return { board: b, id: '' };
  const same = traitNamed(b, clean);
  if (same) return { board: b, id: same.id };
  if (b.traits.length >= MAX_TRAITS) return { board: b, id: '' };
  const trait: KanbanTrait = { id: newId(), name: clean, color: color ?? TRAIT_COLORS[b.traits.length % TRAIT_COLORS.length] };
  return { board: touch(b, { traits: [...b.traits, trait] }, at), id: trait.id };
}

export function updateTrait(b: KanbanBoard, id: string, patch: Partial<Omit<KanbanTrait, 'id'>>, at: string): KanbanBoard {
  const traits = b.traits.map((t) => (t.id === id ? (sanitizeTrait({ ...t, ...patch }) ?? t) : t));
  return touch(b, { traits }, at);
}

/** Tira a característica do quadro e de todas as anotações dele. */
export function removeTrait(b: KanbanBoard, id: string, at: string): KanbanBoard {
  return touch(b, { traits: b.traits.filter((t) => t.id !== id), cards: b.cards.map((c) => (c.traits.includes(id) ? { ...c, traits: c.traits.filter((t) => t !== id) } : c)) }, at);
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
