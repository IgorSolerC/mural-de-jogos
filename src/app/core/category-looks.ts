import { ICON_CHOICES } from './icon-choices';
import { labelKey } from './text';

/**
 * O jeito de uma categoria das anotações: o desenho e a cor que a pessoa escolheu para ela (ver
 * `Settings.categoryLooks`). Vale para todas as anotações daquela categoria, na orelha da ficha e na
 * aba da pasta. Sem escolha, fica como sempre foi: o desenho da cartela (ou a pasta, na escrita à
 * mão) e o manilha liso. Com cor, o nome ganha uma etiqueta de borda colorida dentro da orelha.
 */
export interface CategoryLook {
  icon?: CategoryIconId;
  color?: CategoryColorId;
  /**
   * Só nas tags de uma categoria (ver `tagLookKey`): "Sem cor" escolhido ali, que vale mais que a cor
   * de sempre da tag. Sem ele, a categoria sem cor própria mostra a de sempre.
   */
  none?: true;
}

/** Os desenhos que dá para escolher: a cartela do site, a mesma das colunas do Kanban (ver core/icon-choices.ts). */
export const CATEGORY_ICONS = ICON_CHOICES;
export type CategoryIconId = (typeof CATEGORY_ICONS)[number];

/** As cores da etiqueta: tintas fortes, para a borda fina continuar à vista no manilha. */
export const CATEGORY_COLORS = [
  { id: 'vermelho', label: 'Vermelho', hex: '#d63a2f' },
  { id: 'laranja', label: 'Laranja', hex: '#e46f0c' },
  { id: 'amarelo', label: 'Amarelo', hex: '#cf9d00' },
  { id: 'verde', label: 'Verde', hex: '#5e9c1c' },
  { id: 'azul', label: 'Azul', hex: '#2d8bd6' },
  { id: 'roxo', label: 'Roxo', hex: '#8c58d8' },
  { id: 'rosa', label: 'Rosa', hex: '#e2579f' },
  { id: 'vinho', label: 'Vinho', hex: '#ad2463' },
] as const;
export type CategoryColorId = (typeof CATEGORY_COLORS)[number]['id'];

/** O hex da cor, ou null. */
export function categoryColorHex(id: CategoryColorId | undefined): string | null {
  return CATEGORY_COLORS.find((c) => c.id === id)?.hex ?? null;
}

/** Uma das cores, sorteada: a de toda categoria nova das anotações (ver `ReviewEditor`). */
export function randomCategoryColor(random = Math.random): CategoryColorId {
  return CATEGORY_COLORS[Math.floor(random() * CATEGORY_COLORS.length) % CATEGORY_COLORS.length].id;
}

/**
 * A cor da orelha e da aba de um artista no mural de músicas: tirada do nome (sem acento nem caixa),
 * então sai a mesma em todo aparelho e no mural dos amigos, sem guardar nada. Parece sorteada, e
 * dois artistas de nomes parecidos quase sempre ficam com cores diferentes.
 */
export function bandColor(artist: string): CategoryColorId {
  let h = 0x811c9dc5;
  for (const ch of lookKey(artist)) {
    h ^= ch.codePointAt(0)!;
    h = Math.imul(h, 0x01000193);
  }
  return CATEGORY_COLORS[(h >>> 0) % CATEGORY_COLORS.length].id;
}

/** Os jeitos guardados: a categoria sem acento nem caixa → o jeito dela. */
export type CategoryLooks = Readonly<Record<string, CategoryLook>>;

/** Categorias e tags demais viram lixo guardado: no máximo estas com jeito próprio (as tags contam uma vez por categoria). */
export const MAX_CATEGORY_LOOKS = 2000;

/** A chave de uma categoria nos jeitos guardados (a mesma das abas, sem o "c:"). */
export function lookKey(category: string): string {
  return labelKey(category);
}

/**
 * A chave de uma tag nos mesmos jeitos guardados. A tag só tem cor (o desenho é sempre a etiqueta de
 * papel pardo). Morar junto com as categorias leva a cor para a nuvem, para o mural público e para o
 * mural dos amigos pelo mesmo caminho.
 *
 * - Sem `category`: "#" e a tag sem acento nem caixa, a cor de sempre da tag (a de antes de cada
 *   categoria ter a sua). A tag nunca começa com "#" (ver `cleanTag`), então a chave dela não esbarra
 *   na de nenhuma tag. Nada novo grava aqui: ela fica como a cor de partida da tag em toda categoria.
 * - Com `category` (a da anotação; "" para a anotação sem categoria): "##", a categoria (com cada "#"
 *   dobrado), "#" e a tag. A mesma tag pode ter uma cor em cada categoria.
 */
export function tagLookKey(tag: string, category?: string | null): string {
  if (category === undefined || category === null) return `#${lookKey(tag)}`;
  return `##${lookKey(category).replace(/#/g, '##')}#${lookKey(tag)}`;
}

/** A cor da tag na categoria (a dela, ou a de sempre da tag), ou undefined: a etiqueta de sempre. */
export function tagColorOf(looks: CategoryLooks, tag: string, category: string | null | undefined): CategoryColorId | undefined {
  const own = looks[tagLookKey(tag, category ?? '')];
  if (own) return own.none ? undefined : own.color;
  return looks[tagLookKey(tag)]?.color;
}

/** O hex da cor da tag na categoria da anotação, ou null (a etiqueta de sempre). */
export function tagColorHex(looks: CategoryLooks, tag: string, category: string | null | undefined): string | null {
  return categoryColorHex(tagColorOf(looks, tag, category));
}

/**
 * A tag já tem jeito na categoria: uma cor (dela ou a de sempre da tag) ou um "Sem cor" escolhido. A
 * tag nova que ainda não tem nenhum dos dois ganha uma cor sorteada, como a categoria nova.
 */
export function tagHasLook(looks: CategoryLooks, tag: string, category: string | null | undefined): boolean {
  return !!looks[tagLookKey(tag, category ?? '')] || !!looks[tagLookKey(tag)]?.color;
}

/** As chaves das cores das tags de uma categoria ("" é a da anotação sem categoria) começam assim. */
export function tagKeyPrefix(category: string): string {
  return `##${lookKey(category).replace(/#/g, '##')}#`;
}

/** Os jeitos de um backup ou da nuvem: só desenhos e cores conhecidos, sem os vazios. */
export function sanitizeCategoryLooks(raw: unknown): Record<string, CategoryLook> {
  const out: Record<string, CategoryLook> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_CATEGORY_LOOKS) break;
    // a cor de uma tag numa categoria leva o nome das duas: cabe mais
    const key = lookKey(k).slice(0, k.startsWith('##') ? 140 : 64);
    if (!key || !v || typeof v !== 'object') continue;
    const { icon, color, none } = v as Record<string, unknown>;
    const look: CategoryLook = {};
    if ((CATEGORY_ICONS as readonly unknown[]).includes(icon)) look.icon = icon as CategoryIconId;
    if (CATEGORY_COLORS.some((c) => c.id === color)) look.color = color as CategoryColorId;
    else if (none === true && key.startsWith('##')) look.none = true;
    if (look.icon || look.color || look.none) {
      out[key] = look;
      n++;
    }
  }
  return out;
}
