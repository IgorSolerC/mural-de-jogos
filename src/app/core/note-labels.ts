import { profileOf } from './kinds';
import { Bonus, Review, fold } from './review';

/**
 * A categoria e as tags de uma anotação.
 *
 * - A categoria é uma só: o assunto da anotação, o que ela é (Lista de compras, Estudos, Trabalho).
 *   Vem da cartela pronta do mural ou é escrita à mão. Ordena e agrupa o mural.
 * - As tags são várias, sempre escritas à mão: informam ("Bugfix", "Feature", "Urgente"). As tags
 *   fixas (Ajustes, ver `Settings.pinnedTags`) ficam sempre à mão no editor, mesmo sem nenhuma
 *   anotação usando.
 *
 * As anotações de antes guardavam várias "categorias" (os adesivos, em `bonuses`): a primeira virou
 * a categoria e as outras viraram tags (ver `sanitizeNote`).
 */

/** O tamanho de uma categoria ou tag: cabe num adesivo da ficha. */
export const LABEL_MAX = 32;
/** Tags demais viram ruído: no máximo estas por anotação. */
export const MAX_TAGS = 12;
/** Quantas tags fixas cabem (ver `Settings.pinnedTags`). */
export const MAX_PINNED_TAGS = 40;

/** "  lista   de compras " → "Lista de compras". */
export function cleanCategory(raw: string): string {
  const flat = raw.replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX).trim();
  return flat.charAt(0).toUpperCase() + flat.slice(1);
}

/** A tag como foi escrita ("BugFix" continua BugFix), sem espaços a mais nem "#" na frente. */
export function cleanTag(raw: string): string {
  return raw.trim().replace(/^#+/, '').replace(/\s+/g, ' ').trim().slice(0, LABEL_MAX).trim();
}

/** As tags de um backup ou do editor: limpas, sem repetir (sem ligar para caixa e acento), no máximo `max`. */
export function sanitizeTags(raw: unknown, max = MAX_TAGS): string[] {
  if (!Array.isArray(raw)) return [];
  const out = new Map<string, string>();
  for (const t of raw) {
    if (typeof t !== 'string') continue;
    const tag = cleanTag(t);
    if (tag && !out.has(fold(tag))) out.set(fold(tag), tag);
    if (out.size >= max) break;
  }
  return [...out.values()];
}

/** As categorias prontas do mural de anotações (a cartela), com os desenhos delas. */
export function categoryPresets(): readonly Bonus[] {
  return profileOf('anotacoes').bonuses;
}

/**
 * A categoria como adesivo: a da cartela (com o desenho dela), ou a escrita à mão, com o desenho de
 * pasta (ver `bonusIcon`).
 */
export function categoryBonus(label: string): Bonus {
  const preset = categoryPresets().find((b) => fold(b.label) === fold(label));
  if (preset) return preset;
  const slug = fold(label).replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 48);
  return { id: `cat-${slug || 'categoria'}`, label, kind: 'favor' };
}

/** A categoria da anotação, ou null. */
export function categoryOf(r: Pick<Review, 'category'>): string | null {
  return r.category ?? null;
}

/** As tags da anotação. */
export function tagsOfNote(r: Pick<Review, 'tags'>): readonly string[] {
  return r.tags ?? [];
}

/** Uma tag da biblioteca: quantas anotações usam e se é fixa. */
export interface TagEntry {
  label: string;
  n: number;
  pinned: boolean;
}

/**
 * As tags à mão no editor: as fixas primeiro (na ordem em que foram fixadas), depois as mais usadas
 * nas anotações (e, no empate, de A a Z). Cada tag aparece uma vez, com a grafia mais usada.
 */
export function tagLibrary(notes: readonly Review[], pinned: readonly string[]): TagEntry[] {
  const used = new Map<string, { label: string; n: number }>();
  for (const n of notes) {
    for (const t of tagsOfNote(n)) {
      const k = fold(t);
      const e = used.get(k);
      if (e) e.n++;
      else used.set(k, { label: t, n: 1 });
    }
  }
  const pins = new Set(pinned.map(fold));
  const fixed = pinned.map((label) => ({ label: used.get(fold(label))?.label ?? label, n: used.get(fold(label))?.n ?? 0, pinned: true }));
  const rest = [...used.entries()]
    .filter(([k]) => !pins.has(k))
    .map(([, e]) => ({ ...e, pinned: false }))
    .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pt-BR'));
  return [...fixed, ...rest];
}

/** As categorias à mão no editor: a cartela pronta e, depois, as escritas à mão nas anotações (de A a Z). */
export function categoryLibrary(notes: readonly Review[]): Bonus[] {
  const presets = categoryPresets();
  const known = new Set(presets.map((b) => fold(b.label)));
  const custom = new Map<string, string>();
  for (const n of notes) {
    const c = categoryOf(n);
    if (c && !known.has(fold(c)) && !custom.has(fold(c))) custom.set(fold(c), c);
  }
  return [...presets, ...[...custom.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(categoryBonus)];
}
