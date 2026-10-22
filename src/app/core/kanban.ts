import { CardLook, lookFrom, sameLook, sanitizeLook } from './card-look';
import { canonicalJson } from './canonical-json';
import { CategoryColorId, lookKey } from './category-looks';
import { ICON_CHOICES } from './icon-choices';
import { SortRule, sanitizeSort } from './kanban-sort';
import { mergeFields, mergeOrder } from './merge-parts';
import { cleanTag } from './note-labels';
import { LIGHT_STOCKS, LightStock, fold, newId } from './review';
import { nameCollator } from './text';

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

/** Os desenhos de uma coluna: a cartela do site, a mesma dos grupos das anotações (ver core/icon-choices.ts). */
export const COLUMN_ICONS = ICON_CHOICES;
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
  /**
   * A ordem das anotações na coluna (até duas regras, a segunda desempata; ver core/kanban-sort.ts).
   * Sem o campo, a ordem em que foram arrastadas.
   */
  sort?: SortRule[];
  /**
   * O card padrão da coluna: o visual (a cor, o papel, a estampa, o rabisco, o estrago, as manchas e
   * as decorações) que a anotação que chega veste. Fica guardado mesmo desligado, para voltar a ele.
   */
  look?: CardLook;
  /** O card padrão ligado: as anotações da coluna vestem `look` (ver `dressBoard`). */
  dresses?: true;
  /**
   * A seta de avançar das colunas da esquerda pula esta (uma coluna de entrada, como "Bugs" ao lado de
   * "Features"): a anotação vai para a próxima coluna que não é pulada (ver `nextStop`). Arrastar
   * continua trazendo para cá.
   */
  skip?: true;
}

/**
 * A anotação vestida pelo card padrão de uma coluna: qual coluna, qual versão do card (para vestir de
 * novo quando ele muda) e o visual dela antes de vestir (para voltar a ele num Desfazer; saindo da
 * coluna, ela continua vestida, ver `dressBoard`).
 */
export interface Dress {
  col: string;
  v: string;
  own: CardLook;
}

/** Uma anotação no quadro. A ordem dentro da coluna é a ordem em `cards`. */
export interface KanbanCard {
  /** O id da anotação. */
  note: string;
  column: string;
  importance: Importance | null;
  /** Vestida pelo card padrão da coluna (ver `dressBoard`). */
  dress?: Dress;
  /**
   * As dependências: as anotações (de qualquer grupo, pelo id) que precisam estar finalizadas antes
   * desta ser finalizada. Finalizar com alguma ainda aberta pergunta antes (ver `KanbanDeps`). Nunca
   * em roda: uma anotação não depende de outra que, por algum caminho, depende dela (`dependsOn`).
   */
  deps?: string[];
  /**
   * O status: umas palavras soltas, escritas à mão, ao lado da importância ("Em revisão", "Aguardando
   * cliente", "Com o Sérgio"). Livre, sem lista de onde escolher: vale só para esta anotação.
   */
  status?: string;
  /**
   * Onde mais a anotação aparece: `false`, só no Kanban (fora do mural de anotações); `true`, também
   * no mural, mesmo com o grupo pedindo "só no Kanban". Sem o campo, segue o grupo (ver
   * `CategoryPrefs.kanbanOnly` e `onWall`). Saindo do quadro, a anotação volta para o mural: nunca fica
   * sem lugar.
   */
  wall?: boolean;
  /**
   * Quando a pessoa a pôs no lugar (ou mudou a importância ou o status) pela última vez: na junção de dois
   * aparelhos que mexeram na mesma anotação, vale a mexida por último (e não o quadro mexido por último).
   */
  at?: string;
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
  /**
   * Para onde foi o quadro de uma categoria renomeada (id de antes → id novo; ver
   * `moveBoardCategory`): o que outro aparelho mexeu no quadro de antes, sem saber da troca, vai para o
   * novo na junção em vez de se perder num quadro sem categoria.
   */
  movedTo?: Record<string, string>;
}

export const EMPTY_KANBAN: KanbanState = { boards: [], removed: {}, legacy: [] };

/** Um quadro por categoria: tantos quanto as categorias que dá para guardar. */
export const MAX_BOARDS = 200;
export const MAX_COLUMNS = 20;
export const MAX_CARDS = 1000;
/** Quantas dependências uma anotação pode ter. */
export const MAX_DEPS = 30;
export const NAME_MAX = 40;
/** O tamanho do status de uma anotação no quadro: curto, um adendo ao lado da importância. */
export const STATUS_MAX = 28;
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

/**
 * O último quadro aberto neste aparelho (o id), para `/anotacoes/kanban` sem quadro abrir nele. O
 * grupo aberto no mural também escreve aqui (ver WallView): mural e Kanban ficam no mesmo grupo.
 */
export const KANBAN_LAST_KEY = 'meu-mural:kanban-aberto:v1';

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
  const sort = sanitizeSort(r['sort']);
  const look = r['look'] && typeof r['look'] === 'object' ? sanitizeLook(r['look']) : null;
  return {
    id,
    name: cleanName(r['name'], NAME_MAX) || 'Coluna',
    icon: (COLUMN_ICONS as readonly string[]).includes(r['icon'] as string) ? (r['icon'] as ColumnIcon) : 'circulo',
    color: (LIGHT_STOCKS as readonly string[]).includes(r['color'] as string) ? (r['color'] as LightStock) : 'cinza',
    finishes: r['finishes'] === true,
    ...(sort.length ? { sort } : {}),
    ...(look ? { look } : {}),
    ...(look && r['dresses'] === true ? { dresses: true as const } : {}),
    ...(r['skip'] === true ? { skip: true as const } : {}),
  };
}

/**
 * Para onde a seta de avançar leva uma anotação da coluna `from`: a primeira coluna à direita que a
 * seta não pula (ver `KanbanColumn.skip`), ou null quando não há nenhuma (a seta some).
 */
export function nextStop(columns: readonly KanbanColumn[], from: string): KanbanColumn | null {
  const at = columns.findIndex((c) => c.id === from);
  if (at < 0) return null;
  return columns.slice(at + 1).find((c) => !c.skip) ?? null;
}

/**
 * A marca de vestida que veio guardada: de coluna que existe (ou "por refazer", sem coluna nem versão,
 * ver `restoredBoard`), com o visual de antes.
 */
function sanitizeDress(raw: unknown, columns: readonly KanbanColumn[]): Dress | undefined {
  const r = rec(raw);
  if (!r['own'] || typeof r['own'] !== 'object') return undefined;
  const col = cleanId(r['col']);
  const v = typeof r['v'] === 'string' ? r['v'].replace(/[^0-9a-f]/g, '').slice(0, 16) : '';
  if (col && !columns.some((c) => c.id === col)) return undefined;
  return { col, v, own: sanitizeLook(r['own']) };
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

/** O status escrito ou guardado de uma anotação: numa linha só, sem espaço sobrando, do tamanho que se guarda. */
export function cleanStatus(v: unknown): string {
  return [...cleanName(v, STATUS_MAX * 2)].slice(0, STATUS_MAX).join('').trim();
}

/** As dependências guardadas de uma anotação: ids, sem repetir, sem ela mesma. */
function sanitizeDeps(raw: unknown, note: string): string[] {
  return [...new Set(asList(raw).map(cleanId))].filter((d) => d && d !== note).slice(0, MAX_DEPS);
}

/** As anotações guardadas de um quadro (com o que veio delas): só as de coluna que existe, uma vez cada. */
function sanitizeCards(raw: unknown, columns: readonly KanbanColumn[]): { card: KanbanCard; raw: Record<string, unknown> }[] {
  const out: { card: KanbanCard; raw: Record<string, unknown> }[] = [];
  for (const c of asList(raw)) {
    const cr = rec(c);
    const note = cleanId(cr['note']);
    const column = cleanId(cr['column']);
    if (!note || !columns.some((x) => x.id === column) || out.some((x) => x.card.note === note) || out.length >= MAX_CARDS) continue;
    const dress = sanitizeDress(cr['dress'], columns);
    const deps = sanitizeDeps(cr['deps'], note);
    const status = cleanStatus(cr['status']);
    out.push({
      card: {
        note,
        column,
        importance: importanceOf(cr['importance']),
        ...(status ? { status } : {}),
        ...(typeof cr['wall'] === 'boolean' ? { wall: cr['wall'] } : {}),
        ...(dress ? { dress } : {}),
        ...(deps.length ? { deps } : {}),
        ...(isIso(cr['at']) ? { at: cr['at'] } : {}),
      },
      raw: cr,
    });
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
  const movedTo: Record<string, string> = {};
  for (const [k, v] of Object.entries(rec(r['movedTo']))) {
    const from = cleanId(k);
    const to = cleanId(v);
    if (from && to && from !== to && removed[from]) movedTo[from] = to;
  }
  // um quadro apagado depois da última mudança dele continua apagado
  return { boards: alive(boards, removed), removed, legacy: alive(legacy, removed), ...(Object.keys(movedTo).length ? { movedTo } : {}) };
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
 * Junta os quadros de dois aparelhos. Com a base (`base`: os quadros que este aparelho e a nuvem tinham
 * juntos na última sincronização), um quadro mexido dos dois lados se junta por partes (`mergeBoards`):
 * cada um move uma anotação, renomeia uma coluna, muda a ordem de outra, e tudo fica. Sem a base (a
 * primeira vez depois do site de antes dela), o quadro inteiro vem de quem o mudou por último. Mexer em
 * quadros diferentes nunca briga; um quadro apagado depois da última mudança dele fica apagado; o
 * quadro de antes de uma categoria renomeada, mexido em outro aparelho sem saber da troca, vai para o
 * quadro do nome novo (ver `movedTo`). A ordem é a daqui, com os que só existem lá no fim, na ordem de
 * lá. Os quadros de antes também se juntam (e a conversão deles roda depois, ver `KanbanStore`).
 * `byParts` falso: a junção por partes já foi feita antes (a sincronização junta em `planBoards`), e a
 * base só serve para levar o quadro de antes de uma categoria renomeada para o novo.
 */
export function mergeKanban(here: KanbanState, there: KanbanState, base: KanbanState | null = null, byParts = true): KanbanState {
  const removed: Record<string, string> = { ...here.removed };
  for (const [id, at] of Object.entries(there.removed)) if (!removed[id] || removed[id] < at) removed[id] = at;
  const movedTo = { ...there.movedTo, ...here.movedTo };
  const theirs = new Map(there.boards.map((b) => [b.id, b]));
  // o quadro na base; sem ele (nasceu depois da última sincronização), o de sempre da categoria, de onde todo quadro parte
  const origin = (b: KanbanBoard) => (base ? (base.boards.find((x) => x.id === b.id) ?? freshBoard(b.category)) : null);
  const boards = here.boards.map((h) => {
    const t = theirs.get(h.id);
    if (!t) return h;
    const o = byParts ? origin(h) : null;
    return o ? mergeBoards(o, h, t) : t.at > h.at ? t : h;
  });
  for (const t of there.boards) if (!boards.some((b) => b.id === t.id)) boards.push(t);
  for (const [from, to] of Object.entries(movedTo)) {
    // só de um lado: o outro trocou a categoria; mexido aqui depois da última sincronização, vai para o novo
    const mine = here.boards.find((b) => b.id === from);
    const other = there.boards.find((b) => b.id === from);
    if (!mine === !other) continue;
    const [side, mover] = mine ? [here, there] : [there, here];
    const old = (mine ?? other)!;
    // quem tem o quadro já sabia da troca (o quadro foi feito de novo depois dela): fica como está
    if (!mover.movedTo?.[from] || side.removed[from] === mover.removed[from]) continue;
    const o = base ? (base.boards.find((x) => x.id === from) ?? freshBoard(old.category)) : null;
    const changed = o ? !sameBoard(o, old) : old.at > (removed[from] ?? '');
    const i = boards.indexOf(old);
    const j = boards.findIndex((b) => b.id === followMoves(movedTo, to, from, boards));
    // sem o quadro novo (apagado depois), o de antes mexido fica pela hora, como um apagado
    if (i < 0 || (changed && j < 0)) continue;
    if (changed) boards[j] = rebase(o ?? freshBoard(old.category), old, boards[j]);
    boards.splice(i, 1);
    if (old.at > removed[from]) removed[from] = old.at;
  }
  return {
    boards: alive(boards, removed),
    removed,
    legacy: alive(newest(here.legacy, there.legacy), removed),
    ...(Object.keys(movedTo).length ? { movedTo } : {}),
  };
}

/** O quadro em que um quadro movido está agora (seguindo as trocas de nome), ou null. */
function followMoves(movedTo: Record<string, string>, to: string, from: string, boards: readonly KanbanBoard[]): string | null {
  const seen = new Set([from]);
  let id: string | undefined = to;
  while (id && !seen.has(id)) {
    if (boards.some((b) => b.id === id)) return id;
    seen.add(id);
    id = movedTo[id];
  }
  return null;
}

/**
 * O que mudou no quadro de antes de uma categoria renomeada (`old`, partindo de `o`), posto no quadro
 * para onde ele foi (`target`). Renomeada para um nome novo, o quadro é o mesmo (as colunas foram
 * junto) e se junta inteiro; juntada com uma categoria que já tinha quadro, só as anotações vão, para
 * a coluna de mesmo nome (senão a primeira), como em `moveBoardCategory`.
 */
function rebase(o: KanbanBoard, old: KanbanBoard, target: KanbanBoard): KanbanBoard {
  const m = rebased(o, old, target);
  if (m === target || boardContent(m) === boardContent(target)) return target;
  // mais novo que os dois: quem já tem o quadro novo fica com este na junção de sempre
  const at = [target.at, old.at].sort().at(-1)!;
  return { ...m, at: new Date(Date.parse(at) + 1).toISOString() };
}

function rebased(o: KanbanBoard, old: KanbanBoard, target: KanbanBoard): KanbanBoard {
  const as = (b: KanbanBoard): KanbanBoard => ({ ...b, id: target.id, category: target.category });
  if (o.columns.every((c) => target.columns.some((t) => t.id === c.id))) return mergeBoards(as(o), target, as(old));
  const byName = new Map(target.columns.map((c) => [fold(c.name), c.id]));
  const mapped = (b: KanbanBoard): KanbanBoard => {
    const nameOf = new Map(b.columns.map((c) => [c.id, fold(c.name)]));
    const column = (id: string) => (target.columns.some((c) => c.id === id) ? id : (byName.get(nameOf.get(id) ?? '') ?? target.columns[0].id));
    return { ...as(b), columns: target.columns, cards: b.cards.map((c) => ({ ...c, column: column(c.column) })) };
  };
  return mergeBoards(mapped(o), target, mapped(old));
}

/** O que importa de um quadro na junção (as colunas e as anotações; a hora não). */
const boardContent = (b: KanbanBoard) => canonicalJson({ columns: b.columns, cards: b.cards });
const sameBoard = (x: KanbanBoard, y: KanbanBoard) => boardContent(x) === boardContent(y);

/**
 * Junta duas versões do mesmo quadro (`a`, a daqui; `b`, a de lá) que partiram de `o`, como o git:
 * - as colunas, cada uma campo a campo (o nome num aparelho e a cor no outro ficam as duas); a coluna
 *   nova de cada lado entra, a tirada de um lado sai; a ordem delas junta o que cada lado mudou;
 * - as anotações, cada uma campo a campo (a coluna, a importância, o card padrão); a posta de um lado
 *   entra, a tirada de um lado sai (a não ser que o outro a tenha mexido depois); a ordem junta o que
 *   cada lado arrastou;
 * - o que os dois mudaram de jeitos diferentes fica com o quadro mexido por último.
 * A anotação de uma coluna que saiu vai para a coluna em que estava do outro lado (ou na base), senão
 * para a primeira: nunca some do quadro por causa da junção.
 */
export function mergeBoards(o: KanbanBoard, a: KanbanBoard, b: KanbanBoard): KanbanBoard {
  const ca = boardContent(a);
  const cb = boardContent(b);
  if (ca === cb) return a.at >= b.at ? a : b;
  if (ca === boardContent(o)) return b;
  if (cb === boardContent(o)) return a;
  // o desempate não depende de quem junta: dois aparelhos chegam no mesmo quadro
  const preferA = a.at > b.at || (a.at === b.at && ca > cb);
  const at = a.at > b.at ? a.at : b.at;

  const colsO = new Map(o.columns.map((c) => [c.id, c]));
  const colsA = new Map(a.columns.map((c) => [c.id, c]));
  const colsB = new Map(b.columns.map((c) => [c.id, c]));
  const liveCols = new Set([...colsA.keys(), ...colsB.keys()].filter((id) => !(colsO.has(id) && (!colsA.has(id) || !colsB.has(id)))));
  let columns = mergeOrder(
    o.columns.map((c) => c.id),
    a.columns.map((c) => c.id),
    b.columns.map((c) => c.id),
    preferA,
    liveCols,
  ).map((id) => {
    const x = colsA.get(id);
    const y = colsB.get(id);
    if (!x || !y) return (x ?? y)!;
    return sanitizeColumn(mergeFields(colsO.get(id), x, y, preferA)) ?? (preferA ? x : y);
  });
  if (!columns.length) columns = preferA ? a.columns : b.columns;
  const colIds = new Set(columns.map((c) => c.id));

  const cardsO = new Map(o.cards.map((c) => [c.note, c]));
  const cardsA = new Map(a.cards.map((c) => [c.note, c]));
  const cardsB = new Map(b.cards.map((c) => [c.note, c]));
  const merged = new Map<string, KanbanCard>();
  for (const note of new Set([...cardsA.keys(), ...cardsB.keys()])) {
    const x = cardsA.get(note);
    const y = cardsB.get(note);
    const z = cardsO.get(note);
    let card: KanbanCard;
    if (x && y) {
      // a mesma anotação mexida dos dois lados: vale a mexida por último (sem a hora dela, o quadro)
      const tx = x.at ?? '';
      const ty = y.at ?? '';
      card = mergeFields(z, x, y, tx !== ty ? tx > ty : preferA);
      const at = tx > ty ? x.at : y.at;
      if (at) card = { ...card, at };
    } else {
      const only = (x ?? y)!;
      // tirada do outro lado: sai, a não ser que este lado a tenha mexido depois de o outro mexer no quadro
      if (z && (sameCard(z, only) || (only.at ?? (x ? a.at : b.at)) <= (x ? b.at : a.at))) continue;
      card = only;
    }
    if (!colIds.has(card.column)) {
      const where = [x?.column, y?.column, z?.column].find((c) => c && colIds.has(c));
      card = { ...card, column: where ?? columns[0].id };
    }
    merged.set(note, card);
  }
  const order = mergeOrder(
    o.cards.map((c) => c.note),
    a.cards.map((c) => c.note),
    b.cards.map((c) => c.note),
    preferA,
    new Set(merged.keys()),
  );
  const cards = sanitizeCards(
    order.map((n) => merged.get(n)),
    columns,
  ).map((c) => c.card);
  return { id: a.id, category: a.category, at, columns, cards };
}

const sameCard = (x: KanbanCard, y: KanbanCard) => canonicalJson(x) === canonicalJson(y);

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

/**
 * A categoria `from` mudou de nome para `to` (as chaves de `lookKey`; null: apagada): o quadro dela
 * passa para o nome novo, e o de antes sai (fica em `removed`, para a junção não o trazer de volta).
 * Se a categoria nova já tem quadro guardado, as anotações do de antes vão para ele: na coluna de
 * mesmo nome, senão na primeira. Sem quadro guardado (o de sempre), nada muda.
 */
export function moveBoardCategory(st: KanbanState, from: string, to: string | null, at: string): KanbanState {
  const fromId = boardIdFor(from);
  const old = st.boards.find((b) => b.id === fromId);
  if (!old || (to !== null && boardIdFor(to) === fromId)) return st;
  let boards = st.boards.filter((b) => b.id !== fromId);
  if (to !== null) {
    const toId = boardIdFor(to);
    const target = boards.find((b) => b.id === toId);
    if (!target) boards.push({ ...old, id: toId, category: categoryKey(to), at });
    else {
      const byName = new Map(target.columns.map((c) => [fold(c.name), c.id]));
      const nameOf = new Map(old.columns.map((c) => [c.id, fold(c.name)]));
      const there = new Set(target.cards.map((c) => c.note));
      const moved = old.cards
        .filter((c) => !there.has(c.note))
        .map((c) => ({ ...c, column: byName.get(nameOf.get(c.column) ?? '') ?? target.columns[0].id }));
      boards = boards.map((b) => (b === target ? { ...b, cards: [...b.cards, ...moved], at } : b));
    }
  }
  // para a junção levar ao quadro novo o que outro aparelho mexer no de antes sem saber da troca
  const movedTo = to === null ? st.movedTo : { ...st.movedTo, [fromId]: boardIdFor(to) };
  return { ...st, boards, removed: { ...st.removed, [fromId]: at }, ...(movedTo ? { movedTo } : {}) };
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

/** A ordem de todas as colunas do quadro passa a ser `sort` (vazia: todas à mão). */
export function sortAllColumns(b: KanbanBoard, sort: readonly SortRule[], at: string): KanbanBoard {
  return touch(b, { columns: b.columns.map((c) => sanitizeColumn({ ...c, sort }) ?? c) }, at);
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
  const card: KanbanCard = old ? { ...old, column, at } : { note, column, importance: null, at };
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
  return touch(b, { cards: b.cards.map((c) => (c.note === note ? { ...c, importance, at } : c)) }, at);
}

/** O status da anotação passa a ser `status` (vazio: sem status). */
export function setStatus(b: KanbanBoard, note: string, status: string, at: string): KanbanBoard {
  const card = b.cards.find((c) => c.note === note);
  const next = cleanStatus(status);
  if (!card || next === (card.status ?? '')) return b;
  return touch(
    b,
    {
      cards: b.cards.map((c) => {
        if (c.note !== note) return c;
        const { status: _, ...plain } = c;
        return { ...plain, ...(next ? { status: next } : {}), at };
      }),
    },
    at,
  );
}

/**
 * A anotação aparece também no mural? `wall`: `false` só no Kanban, `true` também no mural, `undefined`
 * segue o grupo (ver `onWall`).
 */
export function setWall(b: KanbanBoard, note: string, wall: boolean | undefined, at: string): KanbanBoard {
  const card = b.cards.find((c) => c.note === note);
  if (!card || card.wall === wall) return b;
  return touch(
    b,
    {
      cards: b.cards.map((c) => {
        if (c.note !== note) return c;
        const { wall: _, ...plain } = c;
        return { ...plain, ...(wall === undefined ? {} : { wall }), at };
      }),
    },
    at,
  );
}

/**
 * A anotação do quadro aparece no mural? A escolha dela, ou a do grupo (`kanbanOnly`: as do quadro
 * ficam só no Kanban).
 */
export function onWall(card: Pick<KanbanCard, 'wall'>, kanbanOnly: boolean): boolean {
  return card.wall ?? !kanbanOnly;
}

/**
 * As dependências da anotação passam a ser `deps` (na ordem dada; vazia: nenhuma). As que fariam uma
 * roda (ver `dependsOn`) ficam de fora. Quem confere a roda pelos quadros todos é quem chama; aqui,
 * só pelo quadro.
 */
export function setDeps(b: KanbanBoard, note: string, deps: readonly string[], at: string): KanbanBoard {
  const card = b.cards.find((c) => c.note === note);
  if (!card) return b;
  const next = sanitizeDeps(deps, note).filter((d) => !dependsOn([b], d, note));
  if (canonicalJson(next) === canonicalJson(card.deps ?? [])) return b;
  return touch(
    b,
    {
      cards: b.cards.map((c) => {
        if (c.note !== note) return c;
        const { deps: _, ...plain } = c;
        return { ...plain, ...(next.length ? { deps: next } : {}), at };
      }),
    },
    at,
  );
}

/**
 * A anotação `note` depende de `other`, direto ou por algum caminho (pelas dependências guardadas
 * nos quadros)? Pôr `other` como dependência de uma anotação de que ela depende faria uma roda: nenhuma
 * das duas poderia ser finalizada primeiro.
 */
export function dependsOn(boards: readonly KanbanBoard[], note: string, other: string): boolean {
  const deps = new Map<string, readonly string[]>();
  for (const b of boards) for (const c of b.cards) if (c.deps?.length) deps.set(c.note, [...(deps.get(c.note) ?? []), ...c.deps]);
  const seen = new Set<string>();
  const stack = [note];
  while (stack.length) {
    const at = stack.pop()!;
    if (seen.has(at)) continue;
    seen.add(at);
    for (const d of deps.get(at) ?? []) {
      if (d === other) return true;
      stack.push(d);
    }
  }
  return false;
}

/** Quantas dependências já foram finalizadas, de quantas (só as que ainda existem), e as abertas. */
export function depProgress<T extends { id: string; doneAt?: string | null }>(deps: readonly string[] | undefined, notes: ReadonlyMap<string, T>): { done: number; total: number; open: T[]; all: T[] } {
  const all = (deps ?? []).map((d) => notes.get(d)).filter((n): n is T => !!n);
  const open = all.filter((n) => !n.doneAt);
  return { done: all.length - open.length, total: all.length, open, all };
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

/** A versão do card padrão: muda quando o visual muda, e então as anotações vestem de novo. */
export function lookVersion(look: CardLook): string {
  return hash64(JSON.stringify(lookFrom(look)));
}

/**
 * O quadro de um Desfazer (`before`, como era), sem perder o visual de antes das anotações vestidas:
 * cada marca fica "por refazer" (sem coluna nem versão), com o visual de antes mais antigo que se
 * conhece (o de agora, ou o de `before`), e o vestidor veste ou despe cada anotação de novo conforme
 * a coluna em que ela volta a estar. Com `at`, as anotações que voltam para outro lugar (ou outra
 * importância, ou outro status) ficam com essa hora: desfazer é mexer agora.
 */
export function restoredBoard(before: KanbanBoard, now: KanbanBoard | undefined, at?: string): KanbanBoard {
  const current = new Map((now?.cards ?? []).map((c) => [c.note, c]));
  const cards = before.cards.map((c) => {
    const was = current.get(c.note);
    const own = was?.dress?.own ?? c.dress?.own;
    const { dress: _, ...plain } = c;
    const moved = at && (!was || was.column !== c.column || was.importance !== c.importance || was.status !== c.status || was.wall !== c.wall) ? { at } : {};
    return own ? { ...plain, ...moved, dress: { col: '', v: '', own } } : { ...plain, ...moved };
  });
  return { ...before, cards };
}

/**
 * As anotações `notes` (as vestidas) ficam com a marca "por refazer", como no Desfazer de um quadro
 * inteiro: o Desfazer de uma mudança de lugar devolve o visual de antes dela, e não só o lugar.
 */
export function redressCards(b: KanbanBoard, notes: readonly string[]): KanbanBoard {
  if (!b.cards.some((c) => c.dress && notes.includes(c.note))) return b;
  return { ...b, cards: b.cards.map((c) => (c.dress && notes.includes(c.note) ? { ...c, dress: { col: '', v: '', own: c.dress.own } } : c)) };
}

/** A anotação que o vestidor vê: o id, a categoria (do quadro) e o visual dela. */
export type DressNote = BoardNote & CardLook;

/**
 * Veste as anotações do quadro conforme o card padrão das colunas, e devolve o quadro com as marcas e
 * o visual novo de cada anotação que muda:
 * - numa coluna com o card padrão ligado, a anotação que ainda não vestiu esta versão dele (acabou de
 *   chegar, ou o card mudou) veste: fica com o visual do card, e o visual de antes fica guardado (o
 *   de antes de chegar na coluna; com o card mudado, o de antes de vestir o primeiro);
 * - o visual fica dela: saindo para uma coluna sem card padrão (ou com o card desligado, ou saindo do
 *   quadro), ela continua vestida e só perde a marca;
 * - só a marca "por refazer" (de um Desfazer, ver `restoredBoard` e `redressCards`) numa coluna sem
 *   card devolve o visual de antes.
 * Só na hora da mudança: a anotação vestida que a pessoa repinta no editor fica como ela deixou, até
 * mudar de coluna ou o card mudar. `skip` diz quais não se tocam (as compartilhadas). Sem nada para
 * fazer, devolve o mesmo quadro.
 */
export function dressBoard(
  b: KanbanBoard,
  notes: ReadonlyMap<string, DressNote>,
  at: string,
  skip: (note: string) => boolean = () => false,
): { board: KanbanBoard; looks: { note: string; look: CardLook }[] } {
  const looks: { note: string; look: CardLook }[] = [];
  const versions = new Map(b.columns.filter((c) => c.dresses && c.look).map((c) => [c.id, lookVersion(c.look!)]));
  let changed = false;
  const cards = b.cards.map((c) => {
    const n = notes.get(c.note);
    if (!n || !belongs(b, n) || skip(c.note)) return c;
    const v = versions.get(c.column);
    if (v) {
      if (c.dress?.col === c.column && c.dress.v === v) return c;
      const look = b.columns.find((x) => x.id === c.column)!.look!;
      if (!sameLook(lookFrom(n), look)) looks.push({ note: c.note, look });
      changed = true;
      // chegando de outra coluna com card, o que ela vestiu lá já é dela: o visual de antes é o de agora
      const own = c.dress && (c.dress.col === c.column || c.dress.col === '') ? c.dress.own : lookFrom(n);
      return { ...c, dress: { col: c.column, v, own } };
    }
    if (!c.dress) return c;
    if (c.dress.col === '' && !sameLook(lookFrom(n), c.dress.own)) looks.push({ note: c.note, look: c.dress.own });
    changed = true;
    const { dress: _, ...plain } = c;
    return plain;
  });
  return { board: changed ? touch(b, { cards }, at) : b, looks };
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
  out.sort((a, b) => b.notes - a.notes || nameCollator.compare(a.label, b.label));
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
  /**
   * Quando as cores foram escolhidas: no mais tarde, quando mudou o quadro de antes mais novo que deu
   * uma delas ("" sem nenhuma). Não é a hora da conversão: no aparelho que ficou fechado desde antes
   * dos quadros por categoria, os jeitos escolhidos depois em outro aparelho valem mais.
   */
  colorsAt: string;
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
  let colorsAt = '';
  if (!state.legacy.length) return { state, tags, colors, colorsAt };
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
        if (color && ![...colors.keys()].some((x) => fold(x) === fold(trait.name))) {
          colors.set(trait.name, color);
          if (lb.at > colorsAt) colorsAt = lb.at;
        }
      }
    }
  }
  const kept = new Set(boards.map((b) => b.id));
  const removed = { ...state.removed };
  for (const lb of state.legacy) if (!kept.has(lb.id)) removed[lb.id] = at > lb.at ? at : new Date(Date.parse(lb.at) + 1).toISOString();
  return { state: { ...state, boards, removed, legacy: [] }, tags, colors, colorsAt };
}
