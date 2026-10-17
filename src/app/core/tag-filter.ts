import { tagLookKey } from './category-looks';
import { fold } from './review';

/**
 * As tags escondidas do filtro das anotações (o do mural e o do Kanban): "quero ver tudo, menos as
 * de Desabafo". O clique direito numa tag do filtro esconde as anotações que têm a tag (a tag fica
 * riscada); um clique nela mostra de novo. Esconder vale mais que ligar: a anotação com uma tag
 * ligada e outra escondida fica escondida.
 *
 * Além do que a pessoa esconde na hora, cada tag de cada categoria pode nascer escondida (o "Filtro
 * padrão: Excluído" das configurações do mural, `NotesConfig.hiddenTags`, pelas chaves de
 * `tagLookKey(tag, categoria)`): toda visita ao mural ou ao quadro começa sem as anotações dela, até a
 * pessoa mostrar a tag de novo (só naquela visita, como os outros filtros).
 */

/** O que a pessoa mudou nesta visita (as tags sem acento nem caixa, como as do filtro). */
export interface TagOuts {
  /** Escondidas à mão. */
  readonly out: readonly string[];
  /** Escondidas pelo padrão, que a pessoa mostrou de novo. */
  readonly free: readonly string[];
}

export const NO_TAG_OUTS: TagOuts = { out: [], free: [] };

/** O que importa da anotação: a categoria (o padrão é por categoria) e as tags. */
interface Tagged {
  category?: string | null;
  tags?: readonly string[];
}

/** A tag está escondida nas anotações desta categoria? */
export function tagIsOut(tag: string, category: string | null | undefined, outs: TagOuts, defaults: ReadonlySet<string>): boolean {
  const k = fold(tag);
  if (outs.out.includes(k)) return true;
  return defaults.has(tagLookKey(tag, category ?? '')) && !outs.free.includes(k);
}

/** A anotação fica de fora: alguma tag dela está escondida. */
export function hiddenByTags(r: Tagged, outs: TagOuts, defaults: ReadonlySet<string>): boolean {
  return !!r.tags?.some((t) => tagIsOut(t, r.category, outs, defaults));
}

/** Esconde a tag (o clique direito): sai do "mostrei de novo", se estava lá. */
export function excludeTag(outs: TagOuts, tag: string): TagOuts {
  const k = fold(tag);
  return { out: outs.out.includes(k) ? outs.out : [...outs.out, k], free: outs.free.filter((x) => x !== k) };
}

/**
 * Mostra a tag de novo (o clique na riscada): sai das escondidas à mão e, se o padrão a esconde em
 * alguma das anotações, entra no "mostrei de novo".
 */
export function releaseTag(outs: TagOuts, tag: string, byDefault: boolean): TagOuts {
  const k = fold(tag);
  return {
    out: outs.out.filter((x) => x !== k),
    free: byDefault && !outs.free.includes(k) ? [...outs.free, k] : outs.free,
  };
}

/**
 * Limpar o filtro: nada escondido, nem pelo padrão (as tags que o padrão esconderia nestas anotações
 * entram no "mostrei de novo").
 */
export function showAllTags(notes: readonly Tagged[], defaults: ReadonlySet<string>): TagOuts {
  const free = new Set<string>();
  if (defaults.size) for (const r of notes) for (const t of r.tags ?? []) if (defaults.has(tagLookKey(t, r.category ?? ''))) free.add(fold(t));
  return { out: [], free: [...free] };
}

/** Alguma das anotações está escondida pelo padrão por causa desta tag? (para o clique saber o que soltar) */
export function outByDefault(tag: string, notes: readonly Tagged[], defaults: ReadonlySet<string>): boolean {
  if (!defaults.size) return false;
  const k = fold(tag);
  return notes.some((r) => r.tags?.some((t) => fold(t) === k && defaults.has(tagLookKey(t, r.category ?? ''))));
}

/**
 * As tags escondidas destas anotações, com quantas cada uma esconde (a grafia mais usada). Uma tag
 * conta como escondida quando esconde alguma das anotações.
 */
export function outTags(notes: readonly Tagged[], outs: TagOuts, defaults: ReadonlySet<string>): Map<string, { label: string; n: number }> {
  const seen = new Map<string, { spell: Map<string, number>; n: number }>();
  for (const r of notes) {
    const counted = new Set<string>();
    for (const t of r.tags ?? []) {
      if (!tagIsOut(t, r.category, outs, defaults)) continue;
      const k = fold(t);
      const e = seen.get(k) ?? { spell: new Map<string, number>(), n: 0 };
      e.spell.set(t, (e.spell.get(t) ?? 0) + 1);
      if (!counted.has(k)) e.n++;
      counted.add(k);
      seen.set(k, e);
    }
  }
  return new Map([...seen].map(([k, e]) => [k, { label: [...e.spell].reduce((a, x) => (x[1] > a[1] ? x : a))[0], n: e.n }]));
}
