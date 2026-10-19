import { BUILD } from './build';
import { canonicalJson } from './canonical-json';
import { mergeJson } from './merge-json';
import { mergeText } from './merge3';
import { Review, sanitizeReview } from './review';
import { CONFLICT_PART_LABEL, ConflictPart } from './shared-notes';

/**
 * A junção de três vias de uma ficha da própria conta mexida em dois aparelhos (ver core/cloud-sync.ts),
 * do mesmo jeito que a das anotações compartilhadas (`mergeNote`, em core/shared-notes.ts): o texto por
 * linhas e, no trecho em briga, por palavras (`mergeText`); o título e a capa cada um por si; as tags
 * como um conjunto (o que um pôs fica, o que um tirou sai); a aparência e quem vê em grupos que mudam
 * juntos; e o resto campo a campo (as notas de cada critério, cada uma por si). Vale para resenhas,
 * músicas e anotações, com o lugar no mural (fixada no topo), que aqui é da pessoa.
 *
 * `a` é a versão que estava na nuvem e `b` a deste aparelho: o que brigou fica, na ficha do mural, do
 * jeito de `a` até a pessoa escolher.
 */

/** O que mudou dos dois lados de jeitos diferentes, nas palavras da tela (as das compartilhadas e mais estas). */
export type FichaPart = ConflictPart | 'nota' | 'lugar';

export const FICHA_PART_LABEL: Record<FichaPart, string> = { ...CONFLICT_PART_LABEL, nota: 'a nota', lugar: 'o lugar no mural' };

export interface FichaMerge {
  /** A junção, com os trechos em conflito do jeito de `a`. */
  merged: Review;
  /** Com conflito: a mesma junção com os trechos do jeito de `b`. Sem conflito, null. */
  other: Review | null;
  parts: FichaPart[];
}

/** O que muda junto: mudar um pedaço do grupo é mudar o grupo (como nas compartilhadas). */
const GROUPS: readonly { keys: readonly string[]; part: FichaPart }[] = [
  { keys: ['stock'], part: 'aparencia' },
  { keys: ['paper', 'paperSeed'], part: 'aparencia' },
  { keys: ['pattern', 'patternSpacing', 'patternSize', 'patternJitter', 'patternInk', 'patternSeed'], part: 'aparencia' },
  { keys: ['scribble', 'scribbleSeed', 'scribbleInk'], part: 'aparencia' },
  { keys: ['damage', 'damageSeed'], part: 'aparencia' },
  { keys: ['stains'], part: 'aparencia' },
  { keys: ['decors'], part: 'aparencia' },
  { keys: ['private', 'quiet', 'publishedAt'], part: 'publico' },
  { keys: ['noteRank'], part: 'lugar' },
];
const GROUPED = new Set(GROUPS.flatMap((g) => g.keys));
/** Os campos tratados à parte; o resto vai por `mergeJson`, campo a campo. */
const SPECIAL = new Set(['id', 'kind', 'text', 'doneAt', 'createdAt', 'updatedAt', ...GROUPED]);

const SCORE_FIELDS = new Set(['scores', 'weights', 'bonuses', 'finalOverride', 'verdict']);

/** Em que parte da tela cai uma briga num campo (o caminho de `mergeJson`). */
function partOf(path: readonly string[]): FichaPart {
  const [field, sub] = path;
  if (field === 'game') return sub === 'name' ? 'titulo' : sub === 'coverUrl' ? 'capa' : 'outros';
  if (field === 'category') return 'categoria';
  if (field === 'completedAt') return 'data';
  if (SCORE_FIELDS.has(field)) return 'nota';
  return 'outros';
}

type Obj = Record<string, unknown>;
const pick = (o: Obj, keys: readonly string[]): Obj => Object.fromEntries(keys.filter((k) => o[k] !== undefined).map((k) => [k, o[k]]));
const same = (x: unknown, y: unknown) => canonicalJson(x ?? null) === canonicalJson(y ?? null);

/** Junta duas versões de uma ficha que partiram de `o` (ver o topo do arquivo). */
export function mergeFicha(o: Review, a: Review, b: Review): FichaMerge {
  const O = o as unknown as Obj;
  const A = a as unknown as Obj;
  const B = b as unknown as Obj;
  const parts = new Set<FichaPart>();
  const left: Obj = {};
  const right: Obj = {};
  const set = (key: string, va: unknown, vb: unknown = va) => {
    if (va !== undefined) left[key] = va;
    if (vb !== undefined) right[key] = vb;
  };

  set('id', A['id']);
  set('kind', A['kind']);
  set('createdAt', O['createdAt'] ?? A['createdAt']);

  const text = mergeText(String(O['text'] ?? ''), String(A['text'] ?? ''), String(B['text'] ?? ''));
  if (!text.clean) parts.add('texto');
  set('text', text.a, text.b);

  // finalizada: é sim ou não; os dois finalizaram, fica a data mais antiga (nunca briga)
  const done = (x: Obj) => typeof x['doneAt'] === 'string';
  if (done(A) && done(B)) set('doneAt', [A['doneAt'] as string, B['doneAt'] as string].sort()[0]);
  else if (done(A) !== done(B)) {
    const changed = done(A) !== done(O) ? A : B;
    if (done(changed)) set('doneAt', changed['doneAt']);
  }

  for (const g of GROUPS) {
    const go = pick(O, g.keys);
    const ga = pick(A, g.keys);
    const gb = pick(B, g.keys);
    const clash = !same(ga, gb) && !same(gb, go) && !same(ga, go);
    if (clash) parts.add(g.part);
    Object.assign(left, same(ga, go) ? gb : ga);
    Object.assign(right, clash || same(ga, go) ? gb : ga);
  }

  // o resto (o item, as notas, a categoria, as tags, a data…), campo a campo
  for (const key of new Set([...Object.keys(O), ...Object.keys(A), ...Object.keys(B)])) {
    if (SPECIAL.has(key)) continue;
    const m = mergeJson(O[key], A[key], B[key]);
    for (const path of m.conflicts) parts.add(partOf([key, ...path]));
    set(key, m.a, m.b);
  }

  const updatedAt = [a.updatedAt, b.updatedAt].sort().at(-1)!;
  set('updatedAt', updatedAt);

  // os dois lados já estão no formato desta build: nenhuma conversão roda de novo
  const merged = sanitizeReview(left, BUILD) ?? a;
  const other = parts.size ? (sanitizeReview(right, BUILD) ?? b) : null;
  return { merged, other, parts: [...parts] };
}
