import { fold } from './review';

/**
 * O jeito de uma categoria das anotações: o desenho e a cor que a pessoa escolheu para ela (ver
 * `Settings.categoryLooks`). Vale para todas as anotações daquela categoria, na orelha da ficha e na
 * aba da pasta. Sem escolha, fica como sempre foi: o desenho da cartela (ou a pasta, na escrita à
 * mão) e o manilha liso. Com cor, o nome ganha uma etiqueta de borda colorida dentro da orelha.
 */
export interface CategoryLook {
  icon?: CategoryIconId;
  color?: CategoryColorId;
}

/** Os desenhos que dá para escolher (o desenho de cada um fica em ui/category-label.ts). */
export const CATEGORY_ICONS = [
  'maleta',
  'capelo',
  'carrinho',
  'lista',
  'lampada',
  'sino',
  'chapeu',
  'alvo',
  'aviao',
  'caderno',
  'coracao',
  'musica',
  'filme',
  'pessoas',
  'cerebro',
  'paleta',
  'moedas',
  'mundo',
  'predio',
  'coroa',
  'brilho',
  'marcador',
  'livro',
  'pena',
  'camera',
  'quebra-cabeca',
  'bandeira',
  'relogio',
  'microscopio',
  'megafone',
  'etiqueta',
  'chip',
  'inseto',
  'raio',
  'pasta',
] as const;
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

/** Categorias e tags demais viram lixo guardado: no máximo estas com jeito próprio. */
export const MAX_CATEGORY_LOOKS = 500;

/** A chave de uma categoria nos jeitos guardados (a mesma das abas, sem o "c:"). */
export function lookKey(category: string): string {
  return fold(category.trim());
}

/**
 * A chave de uma tag nos mesmos jeitos guardados: "#" e a tag sem acento nem caixa. A tag nunca
 * começa com "#" (ver `cleanTag`), então a chave dela não esbarra na de nenhuma tag. A tag só tem cor
 * (o desenho é sempre a etiqueta de papel pardo). Morar junto com as categorias leva a cor para a
 * nuvem, para o mural público e para o mural dos amigos pelo mesmo caminho.
 */
export function tagLookKey(tag: string): string {
  return `#${lookKey(tag)}`;
}

/** O hex da cor da tag nos jeitos, ou null (a etiqueta de sempre). */
export function tagColorHex(looks: CategoryLooks, tag: string): string | null {
  return categoryColorHex(looks[tagLookKey(tag)]?.color);
}

/** Os jeitos de um backup ou da nuvem: só desenhos e cores conhecidos, sem os vazios. */
export function sanitizeCategoryLooks(raw: unknown): Record<string, CategoryLook> {
  const out: Record<string, CategoryLook> = {};
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return out;
  let n = 0;
  for (const [k, v] of Object.entries(raw as Record<string, unknown>)) {
    if (n >= MAX_CATEGORY_LOOKS) break;
    const key = lookKey(k).slice(0, 64);
    if (!key || !v || typeof v !== 'object') continue;
    const { icon, color } = v as Record<string, unknown>;
    const look: CategoryLook = {};
    if ((CATEGORY_ICONS as readonly unknown[]).includes(icon)) look.icon = icon as CategoryIconId;
    if (CATEGORY_COLORS.some((c) => c.id === color)) look.color = color as CategoryColorId;
    if (look.icon || look.color) {
      out[key] = look;
      n++;
    }
  }
  return out;
}
