import { shelfCompare } from './clipping';
import { RELEVANCES, RELEVANCE_RANK, Relevance, Wish, fold, relevanceLabel, relevanceOf } from './review';
import type { Kind } from './kinds';
import { CategoryColorId, categoryColorHex } from './category-looks';
import { wishTagKey } from './mural-config';

/**
 * A vista da Wishlist (PLANO-WISHLIST.md, 3.3, P5–P7): como a parede aparece (Recortes ou Grade), em que
 * ordem, e o que a busca e os filtros deixam à mostra. A vista e a ordem são do aparelho, como a vista do
 * mural (`meu-mural:wishlist:v1`, saem na limpeza do logout); a busca e os filtros valem só na visita.
 */

export type WishView = 'recortes' | 'grade';
export type WishOrder = 'recentes' | 'nome' | 'ano';
export type WishDirection = 'desc' | 'asc';

export interface WishlistPrefs {
  vista: WishView;
  ordem: WishOrder;
  direcao: WishDirection;
  /** MUST PLAY na frente e LATER no fim, antes da ordem (como as fixadas no topo das Anotações). */
  vontadePrimeiro: boolean;
}

export const WISHLIST_PREFS_KEY = 'meu-mural:wishlist:v1';

export const WISHLIST_PREFS_DEFAULT: WishlistPrefs = { vista: 'recortes', ordem: 'recentes', direcao: 'desc', vontadePrimeiro: true };

export const WISH_ORDERS: readonly { value: WishOrder; label: string }[] = [
  { value: 'recentes', label: 'Quando entrou' },
  { value: 'nome', label: 'Nome' },
  { value: 'ano', label: 'Lançamento' },
];

/** O que está guardado, conferido campo a campo (o que não serve volta ao padrão). */
export function sanitizeWishlistPrefs(raw: unknown): WishlistPrefs {
  const r = raw && typeof raw === 'object' && !Array.isArray(raw) ? (raw as Record<string, unknown>) : {};
  const d = WISHLIST_PREFS_DEFAULT;
  return {
    vista: r['vista'] === 'grade' || r['vista'] === 'recortes' ? r['vista'] : d.vista,
    ordem: WISH_ORDERS.some((o) => o.value === r['ordem']) ? (r['ordem'] as WishOrder) : d.ordem,
    direcao: r['direcao'] === 'asc' || r['direcao'] === 'desc' ? r['direcao'] : d.direcao,
    vontadePrimeiro: typeof r['vontadePrimeiro'] === 'boolean' ? r['vontadePrimeiro'] : d.vontadePrimeiro,
  };
}

/** A direção de cada ordem quando ela é escolhida: os mais novos e os lançamentos novos primeiro, os nomes de A a Z. */
export function naturalDirection(o: WishOrder): WishDirection {
  return o === 'nome' ? 'asc' : 'desc';
}

/** O que a direção quer dizer, na ordem escolhida (o nome do botão de inverter). */
export function wishDirectionLabel(o: WishOrder, d: WishDirection): string {
  const desc = d === 'desc';
  switch (o) {
    case 'recentes':
      return desc ? 'Os que entraram há pouco primeiro' : 'Os que entraram há mais tempo primeiro';
    case 'nome':
      return desc ? 'De Z a A' : 'De A a Z';
    case 'ano':
      return desc ? 'Lançamentos mais novos primeiro' : 'Lançamentos mais antigos primeiro';
  }
}

/** O ano do catálogo, como número (sem ano: null, vai para o fim nas duas direções). */
function yearOf(w: Wish): number | null {
  const n = parseInt(w.game.year ?? '', 10);
  return Number.isFinite(n) ? n : null;
}

/** A Wishlist na ordem escolhida; empate fica pela entrada mais nova. */
export function sortWishes(list: readonly Wish[], p: Pick<WishlistPrefs, 'ordem' | 'direcao' | 'vontadePrimeiro'>): Wish[] {
  const sign = p.direcao === 'desc' ? 1 : -1;
  const newest = shelfCompare('recentes');
  const byName = shelfCompare('az');
  const within = (a: Wish, b: Wish): number => {
    switch (p.ordem) {
      case 'recentes':
        return sign * newest(a, b);
      case 'nome':
        return -sign * byName(a, b) || newest(a, b);
      case 'ano': {
        const ya = yearOf(a);
        const yb = yearOf(b);
        if (ya === null || yb === null) return ya === yb ? newest(a, b) : ya === null ? 1 : -1;
        return sign * (yb - ya) || newest(a, b);
      }
    }
  };
  const rank = (w: Wish) => (p.vontadePrimeiro ? RELEVANCE_RANK[relevanceOf(w)] : 0);
  return [...list].sort((a, b) => rank(a) - rank(b) || within(a, b));
}

/** O que a busca e a folha dos filtros pedem. As tags vêm sem caixa e sem acento (`fold`). */
export interface WishFilter {
  query: string;
  vontade: Relevance | null;
  /** As tags ligadas: o desejo com qualquer uma delas fica (como nas Anotações). */
  on: ReadonlySet<string>;
  /** As escondidas: o desejo com alguma delas sai. */
  out: ReadonlySet<string>;
}

export const NO_WISH_FILTER: WishFilter = { query: '', vontade: null, on: new Set(), out: new Set() };

/** Algum filtro ou a busca está ligado. */
export function wishFiltering(f: WishFilter): boolean {
  return !!f.query.trim() || !!f.vontade || f.on.size > 0 || f.out.size > 0;
}

/** O desejo passa: a busca acha no nome (ou no lembrete), na vontade escolhida, com uma tag ligada e nenhuma escondida. */
export function wishMatches(w: Wish, f: WishFilter): boolean {
  const needle = fold(f.query.trim());
  if (needle && !fold(w.game.name).includes(needle) && !fold(w.note ?? '').includes(needle)) return false;
  if (f.vontade && relevanceOf(w) !== f.vontade) return false;
  const tags = (w.tags ?? []).map(fold);
  if (tags.some((t) => f.out.has(t))) return false;
  if (f.on.size && !tags.some((t) => f.on.has(t))) return false;
  return true;
}

/** A busca achou o desejo só pelo lembrete (o nome não tem o que se procura). */
export function foundByNote(w: Wish, query: string): boolean {
  const needle = fold(query.trim());
  return !!needle && !fold(w.game.name).includes(needle) && fold(w.note ?? '').includes(needle);
}

/** Uma tag da Wishlist do mural: a grafia mais usada e em quantos desejos está. */
export interface WishTagCount {
  key: string;
  label: string;
  n: number;
}

/** As tags dos desejos, as mais usadas primeiro (empate: de A a Z). */
export function wishTagCounts(list: readonly Wish[]): WishTagCount[] {
  const by = new Map<string, { n: number; spell: Map<string, number> }>();
  for (const w of list)
    for (const t of new Set(w.tags ?? [])) {
      const k = fold(t);
      const e = by.get(k) ?? { n: 0, spell: new Map() };
      e.n++;
      e.spell.set(t, (e.spell.get(t) ?? 0) + 1);
      by.set(k, e);
    }
  return [...by.entries()]
    .map(([key, e]) => ({ key, n: e.n, label: [...e.spell.entries()].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0], 'pt-BR'))[0][0] }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pt-BR'));
}

/** A primeira linha da folha dos filtros: as três vontades, com quantos tem cada uma. */
export function wishVontadeOptions(list: readonly Wish[], kind: Kind, chosen: Relevance | null): { value: Relevance; label: string; n: number; on: boolean }[] {
  return RELEVANCES.map((r) => ({ value: r, label: relevanceLabel(kind, r), n: list.filter((w) => relevanceOf(w) === r).length, on: chosen === r }));
}

/** A cor que o dono deu à tag na Wishlist do mural (`NotesConfig.wishTagColors`), em hex; sem cor, null. */
export function wishTagHex(colors: Readonly<Record<string, CategoryColorId>>, kind: Kind, tag: string): string | null {
  return categoryColorHex(colors[wishTagKey(kind, tag)]);
}
