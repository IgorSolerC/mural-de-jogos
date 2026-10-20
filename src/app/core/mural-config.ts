import type { Audience } from './review';
import { lookKey, tagLookKey } from './category-looks';

/**
 * As configurações do mural de anotações (a engrenagem da pasta, ver ui/mural-config.ts): o que
 * vale para o mural inteiro e o que cada categoria muda em cima disso. Uma categoria sem escolha
 * segue o mural; o mural sem escolha fica como o site sempre foi (anotação nasce privada, as abas da
 * maior para a menor). A cor da sub-nota (`subColor`) saiu com a sub-nota, na build 443: o que vier
 * guardado com ela é ignorado.
 *
 * O ícone e a cor de cada categoria moram à parte (`Settings.categoryLooks`, ver category-looks.ts),
 * porque vão também no mural público; isto aqui é só da pessoa e nunca sai do mural privado.
 *
 * Para crescer: um ajuste novo do mural entra em `NotesConfig` (com o padrão em
 * `NOTES_CONFIG_DEFAULT` e a leitura em `sanitizeNotesConfig`); um por categoria, em `CategoryPrefs`
 * (vazio = segue o mural) e em `sanitizePrefs`. A folha da engrenagem mostra cada um numa linha.
 */

/** Como as abas (e a ordem por categoria) se arrumam: pela quantidade ou na ordem que a pessoa montou. */
export type CategoryOrderBy = 'quantidade' | 'minha';

const AUDIENCES: readonly Audience[] = ['privada', 'visivel', 'publicar'];

/** O que uma categoria muda em cima do mural. Sem o campo: segue o mural. */
export interface CategoryPrefs {
  /** Como nasce a anotação nova desta categoria: Privada, Disponível (pública, fora do Feed) ou Publicar. */
  audience?: Audience;
  /** Perguntar antes de salvar uma anotação desta categoria sem nenhuma tag. */
  askTag?: boolean;
  /** Escondida: a aba dela fica sempre no "Mais", nunca em pé lá em cima. Guardado só quando `true`. */
  hidden?: boolean;
  /**
   * As anotações do quadro Kanban do grupo ficam só no Kanban, fora do mural (cada uma pode escolher
   * o contrário, ver `KanbanCard.wall`). Guardado só quando `true`.
   */
  kanbanOnly?: boolean;
}

export interface NotesConfig {
  /** Como nasce toda anotação nova (a categoria pode mudar). */
  audience: Audience;
  orderBy: CategoryOrderBy;
  /**
   * A ordem montada à mão: as categorias pela chave (sem acento nem caixa, a de `lookKey`). Fica
   * guardada mesmo com `orderBy: 'quantidade'`, para voltar a ela sem perder nada. A categoria que
   * não está aqui (nova) entra no fim, pela quantidade.
   */
  order: string[];
  /** O que cada categoria muda, pela chave. */
  categories: Record<string, CategoryPrefs>;
  /**
   * As tags com "Filtro padrão: Excluído": cada visita ao mural e ao quadro começa sem as anotações
   * delas (ver core/tag-filter.ts). Pelas chaves de `tagLookKey(tag, categoria)`, então a mesma tag
   * pode ser escondida numa categoria e não em outra; "" é a categoria das anotações sem categoria.
   */
  hiddenTags: string[];
}

export const NOTES_CONFIG_DEFAULT: NotesConfig = { audience: 'privada', orderBy: 'quantidade', order: [], categories: {}, hiddenTags: [] };

/** Tags demais viram lixo guardado: no máximo estas com o filtro padrão Excluído. */
export const MAX_HIDDEN_TAGS = 500;

/** Categorias demais viram lixo guardado: no máximo estas (como os jeitos das categorias). */
export const MAX_CONFIG_CATEGORIES = 200;

function sanitizePrefs(raw: unknown): CategoryPrefs {
  const out: CategoryPrefs = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  const { audience, askTag, hidden, kanbanOnly } = raw as Record<string, unknown>;
  if (AUDIENCES.includes(audience as Audience)) out.audience = audience as Audience;
  if (typeof askTag === 'boolean') out.askTag = askTag;
  if (hidden === true) out.hidden = true;
  if (kanbanOnly === true) out.kanbanOnly = true;
  return out;
}

const isEmpty = (p: CategoryPrefs) => p.audience === undefined && p.askTag === undefined && !p.hidden && !p.kanbanOnly;

/** O que veio guardado (ou da nuvem): só valores conhecidos, sem as categorias vazias. */
export function sanitizeNotesConfig(raw: unknown): NotesConfig {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return { ...NOTES_CONFIG_DEFAULT, order: [], categories: {}, hiddenTags: [] };
  const r = raw as Record<string, unknown>;
  const order: string[] = [];
  if (Array.isArray(r['order'])) {
    for (const k of r['order']) {
      if (order.length >= MAX_CONFIG_CATEGORIES) break;
      const key = typeof k === 'string' ? lookKey(k).slice(0, 64) : '';
      if (key && !order.includes(key)) order.push(key);
    }
  }
  const categories: Record<string, CategoryPrefs> = {};
  if (r['categories'] && typeof r['categories'] === 'object' && !Array.isArray(r['categories'])) {
    let n = 0;
    for (const [k, v] of Object.entries(r['categories'] as Record<string, unknown>)) {
      if (n >= MAX_CONFIG_CATEGORIES) break;
      const key = lookKey(k).slice(0, 64);
      const prefs = sanitizePrefs(v);
      if (!key || isEmpty(prefs)) continue;
      categories[key] = prefs;
      n++;
    }
  }
  const hiddenTags: string[] = [];
  if (Array.isArray(r['hiddenTags'])) {
    for (const k of r['hiddenTags']) {
      if (hiddenTags.length >= MAX_HIDDEN_TAGS) break;
      // só chaves de tag numa categoria ("##categoria#tag"), do tamanho que se guarda
      if (typeof k === 'string' && /^##.*#[^#]/.test(k) && k.length <= 160 && !hiddenTags.includes(k)) hiddenTags.push(k);
    }
  }
  return {
    audience: AUDIENCES.includes(r['audience'] as Audience) ? (r['audience'] as Audience) : NOTES_CONFIG_DEFAULT.audience,
    orderBy: r['orderBy'] === 'minha' ? 'minha' : 'quantidade',
    order,
    categories,
    hiddenTags,
  };
}

/** A tag nasce escondida no filtro das anotações desta categoria ("" ou null: as sem categoria)? */
export function tagHiddenByDefault(cfg: NotesConfig, tag: string, category: string | null | undefined): boolean {
  return cfg.hiddenTags.includes(tagLookKey(tag, category ?? ''));
}

/** O filtro padrão da tag na categoria: escondida (Excluído) ou não (Disponível). */
export function withTagHidden(cfg: NotesConfig, tag: string, category: string | null | undefined, hidden: boolean): NotesConfig {
  const key = tagLookKey(tag, category ?? '');
  const rest = cfg.hiddenTags.filter((k) => k !== key);
  return { ...cfg, hiddenTags: hidden ? [...rest, key] : rest };
}

/** O que a categoria muda (vazio: segue o mural, e sem categoria também). */
export function prefsOf(cfg: NotesConfig, category: string | null | undefined): CategoryPrefs {
  const key = category ? lookKey(category) : '';
  return (key && cfg.categories[key]) || {};
}

/** Como nasce uma anotação nova nesta categoria (ou sem nenhuma). */
export function newNoteAudience(cfg: NotesConfig, category: string | null | undefined): Audience {
  return prefsOf(cfg, category).audience ?? cfg.audience;
}

/** Perguntar antes de salvar sem tag uma anotação desta categoria? `mural`: a escolha do mural inteiro. */
export function asksTag(cfg: NotesConfig, category: string | null | undefined, mural: boolean): boolean {
  return prefsOf(cfg, category).askTag ?? mural;
}

/**
 * Muda o que a categoria muda: um campo `undefined` volta a seguir o mural; a categoria sem nada
 * deixa de ser guardada.
 */
export function withPrefs(cfg: NotesConfig, category: string, patch: CategoryPrefs): NotesConfig {
  const key = lookKey(category);
  if (!key) return cfg;
  const { [key]: old, ...rest } = cfg.categories;
  const merged: CategoryPrefs = { ...old, ...patch };
  for (const k of Object.keys(merged) as (keyof CategoryPrefs)[]) if (merged[k] === undefined || ((k === 'hidden' || k === 'kanbanOnly') && !merged[k])) delete merged[k];
  return { ...cfg, categories: isEmpty(merged) ? rest : { ...rest, [key]: merged } };
}

/**
 * A ordem montada à mão para as categorias de agora (`keys`, já na ordem por quantidade): as que já
 * têm lugar, nele; as novas, no fim, na ordem em que vieram.
 */
export function arrangedKeys(order: readonly string[], keys: readonly string[]): string[] {
  const at = new Map(order.map((k, i) => [k, i]));
  const placed = keys.filter((k) => at.has(k)).sort((a, b) => at.get(a)! - at.get(b)!);
  return [...placed, ...keys.filter((k) => !at.has(k))];
}

/** Leva a categoria `key` para a posição `to` da lista (as de fora da lista não mudam de lugar). */
export function moveKey(list: readonly string[], key: string, to: number): string[] {
  const from = list.indexOf(key);
  if (from < 0) return [...list];
  const out = list.filter((k) => k !== key);
  out.splice(Math.max(0, Math.min(to, out.length)), 0, key);
  return out;
}

/**
 * A ordem que vale nas abas e na ordem por categoria: a montada à mão, ou null (pela quantidade).
 * Guardar a lista inteira da pasta: as que ficaram de fora vão para o fim.
 */
export function activeOrder(cfg: NotesConfig): readonly string[] | null {
  return cfg.orderBy === 'minha' ? cfg.order : null;
}

/** As categorias escondidas (pela chave, a de `lookKey`): as abas delas ficam sempre no "Mais". */
export function hiddenKeys(cfg: NotesConfig): ReadonlySet<string> {
  return new Set(Object.entries(cfg.categories).flatMap(([k, p]) => (p.hidden ? [k] : [])));
}


/** As anotações do quadro Kanban deste grupo ficam só no Kanban (cada uma pode escolher o contrário)? */
export function kanbanOnly(cfg: NotesConfig, category: string | null | undefined): boolean {
  return !!prefsOf(cfg, category).kanbanOnly;
}
