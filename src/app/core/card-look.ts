import { Review, sanitizeReview } from './review';

/**
 * O visual de uma ficha (a cartolina e o que vai nela), à parte do resto: a cor, o papel, a estampa e
 * os ajustes dela, o rabisco, o estrago, as manchas e as decorações, cada um com o sorteio dele. É o
 * que o "Card padrão" de uma coluna do Kanban guarda e veste nas anotações que chegam (ver
 * core/kanban.ts, `dressBoard`).
 *
 * O desenho de cada sorteio sai também do id da ficha (ver `artIdOf`): o mesmo rabisco, em duas
 * anotações, cai em lugares diferentes de cada uma, como feito à mão; a estampa sai igual.
 */
export const LOOK_FIELDS = [
  'stock',
  'paper',
  'paperSeed',
  'pattern',
  'patternSpacing',
  'patternSize',
  'patternJitter',
  'patternInk',
  'patternSeed',
  'scribble',
  'scribbleSeed',
  'scribbleInk',
  'damage',
  'damageSeed',
  'stains',
  'decors',
] as const;
export type LookField = (typeof LOOK_FIELDS)[number];
export type CardLook = Partial<Pick<Review, LookField>>;

/** O visual da ficha: só os campos que ela tem, na ordem de `LOOK_FIELDS`. */
export function lookFrom(r: CardLook): CardLook {
  const out: Record<string, unknown> = {};
  for (const k of LOOK_FIELDS) if (r[k] !== undefined) out[k] = r[k];
  return out as CardLook;
}

/** Um visual que veio guardado ou da nuvem: passa pelo mesmo saneamento das fichas. */
export function sanitizeLook(raw: unknown): CardLook {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) return {};
  const shell = sanitizeReview({ kind: 'anotacoes', game: { name: 'x' }, ...lookFrom(raw as CardLook) });
  return shell ? lookFrom(shell) : {};
}

/** O mesmo visual? (campo a campo, as listas também) */
export function sameLook(a: CardLook, b: CardLook): boolean {
  return JSON.stringify(lookFrom(a)) === JSON.stringify(lookFrom(b));
}

/** A ficha com o visual trocado por `look` (o que `look` não tem volta ao de sempre). */
export function withLook<T extends CardLook>(r: T, look: CardLook): T {
  const out: Record<string, unknown> = { ...r };
  for (const k of LOOK_FIELDS) delete out[k];
  return { ...out, ...lookFrom(look) } as T;
}
