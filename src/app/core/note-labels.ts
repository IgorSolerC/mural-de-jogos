import { profileOf } from './kinds';
import { Bonus, Review, fold } from './review';
import { cleanLabel, slugOf } from './text';

/**
 * A categoria, o assunto e as tags de uma anotação.
 *
 * - A categoria é uma só: o assunto da anotação, o que ela é (Lista de compras, Estudos, Trabalho).
 *   Vem da cartela pronta do mural ou é escrita à mão. Ordena e agrupa o mural.
 * - O assunto é um só, um nível abaixo da categoria (no grupo Estudos: História, Geografia). É do
 *   grupo: cada grupo tem os seus, criados nas configurações do mural ou escritos no editor.
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
  return cleanLabel(raw, LABEL_MAX);
}

/** "  história  " → "História": o assunto, como a categoria. */
export function cleanSubject(raw: string): string {
  return cleanLabel(raw, LABEL_MAX);
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

/**
 * As categorias conhecidas do mural de anotações, com os desenhos delas. Só as de `DEFAULT_CATEGORIES`
 * vêm na cartela; as outras eram da cartela de antes e guardam o desenho de sempre em quem já usa.
 */
export function categoryPresets(): readonly Bonus[] {
  return profileOf('anotacoes').bonuses;
}

/** As categorias que vêm na cartela de quem ainda não escreveu nenhuma. */
export const DEFAULT_CATEGORIES: readonly string[] = ['trabalho', 'estudos'];

/**
 * A categoria como adesivo: a da cartela (com o desenho dela), ou a escrita à mão, com o desenho de
 * pasta (ver `bonusIcon`).
 */
export function categoryBonus(label: string): Bonus {
  const preset = categoryPresets().find((b) => fold(b.label) === fold(label));
  if (preset) return preset;
  const slug = slugOf(label);
  return { id: `cat-${slug || 'categoria'}`, label, kind: 'favor' };
}

/** A categoria da anotação, ou null. */
export function categoryOf(r: Pick<Review, 'category'>): string | null {
  return r.category ?? null;
}

/** O assunto da anotação, ou null. */
export function subjectOf(r: Pick<Review, 'subject'>): string | null {
  return r.subject ?? null;
}

/** Um assunto da biblioteca de um grupo: quantas anotações usam e se foi criado nas configurações. */
export interface SubjectEntry {
  label: string;
  n: number;
  /** Criado nas configurações do mural (fica à mão mesmo sem nenhuma anotação). */
  saved: boolean;
}

/**
 * Os assuntos de um grupo (`category`, null: sem grupo): os criados nas configurações e os usados nas
 * anotações do grupo, de A a Z (a mesma ordem do filtro da pasta, em todo lugar). Cada assunto aparece
 * uma vez, com a grafia mais usada. O assunto é do grupo: a "História" dos Estudos não é sugerida no
 * Trabalho.
 */
export function subjectLibrary(notes: readonly Review[], saved: readonly string[], category: string | null | undefined): SubjectEntry[] {
  const used = new Map<string, { spell: Map<string, number>; n: number }>();
  const group = fold(category ?? '');
  for (const n of notes) {
    const s = subjectOf(n);
    if (!s || fold(categoryOf(n) ?? '') !== group) continue;
    const k = fold(s);
    const e = used.get(k) ?? { spell: new Map<string, number>(), n: 0 };
    e.spell.set(s, (e.spell.get(s) ?? 0) + 1);
    e.n++;
    used.set(k, e);
  }
  const spelling = (k: string) => {
    const e = used.get(k);
    return e ? [...e.spell].reduce((a, x) => (x[1] > a[1] ? x : a))[0] : null;
  };
  const out: SubjectEntry[] = [];
  const seen = new Set<string>();
  for (const label of saved) {
    const k = fold(label);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push({ label: spelling(k) ?? label, n: used.get(k)?.n ?? 0, saved: true });
  }
  const rest = [...used.keys()].filter((k) => !seen.has(k)).map((k) => ({ label: spelling(k)!, n: used.get(k)!.n, saved: false }));
  return [...out, ...rest].sort((a, b) => a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));
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
 *
 * Com `category` (null: sem categoria), as usadas são só as das anotações daquela categoria: a
 * "Bugfix" do Trabalho não é sugerida na Lista de compras. As fixas valem para todas.
 */
export function tagLibrary(notes: readonly Review[], pinned: readonly string[], category?: string | null): TagEntry[] {
  const used = new Map<string, { label: string; n: number }>();
  const same = (n: Review) => category === undefined || fold(categoryOf(n) ?? '') === fold(category ?? '');
  for (const n of notes) {
    if (!same(n)) continue;
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

/** As categorias à mão no editor: a cartela pronta e, depois, as usadas nas anotações (de A a Z). */
export function categoryLibrary(notes: readonly Review[]): Bonus[] {
  const presets = DEFAULT_CATEGORIES.map((id) => categoryPresets().find((b) => b.id === id)!);
  const known = new Set(presets.map((b) => fold(b.label)));
  const custom = new Map<string, string>();
  for (const n of notes) {
    const c = categoryOf(n);
    if (c && !known.has(fold(c)) && !custom.has(fold(c))) custom.set(fold(c), c);
  }
  return [...presets, ...[...custom.values()].sort((a, b) => a.localeCompare(b, 'pt-BR')).map(categoryBonus)];
}
