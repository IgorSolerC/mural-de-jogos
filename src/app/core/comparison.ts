import { Review, fold } from './review';

export interface ReviewPair {
  key: string;
  mine: Review;
  theirs: Review;
  /** Minha nota menos a nota do colega, arredondada para evitar ruído de ponto flutuante. */
  difference: number;
}

const titleKey = (r: Review) =>
  fold(r.game.name)
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim();
const yearOf = (r: Review) =>
  r.game.year?.match(/\d{4}/)?.[0] ?? r.game.name.match(/\((\d{4})\)\s*$/)?.[1];
const catalogKey = (r: Review) =>
  r.game.source !== 'manual' && r.game.sourceId
    ? `${r.kind}:${r.game.source}:${r.game.sourceId}`
    : null;

function compatible(a: Review, b: Review): boolean {
  // IDs distintos no mesmo catálogo são obras distintas, ainda que tenham o mesmo título.
  if (a.game.source === b.game.source && catalogKey(a) && catalogKey(b))
    return catalogKey(a) === catalogKey(b);
  if (a.kind === 'livros') {
    // Edições do mesmo livro podem ter anos diferentes; autoria conhecida protege homônimos.
    return (
      !a.game.by ||
      !b.game.by ||
      fold(a.game.by).trim() === fold(b.game.by).trim()
    );
  }
  return !yearOf(a) || !yearOf(b) || yearOf(a) === yearOf(b);
}

function latestFirst(list: readonly Review[]): Review[] {
  return [...list].sort(
    (a, b) =>
      Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
      a.id.localeCompare(b.id),
  );
}

/** Uma avaliação por obra, a mais recente. Nunca compara adaptações entre murais. */
function distinctWorks(list: readonly Review[]): Review[] {
  const keys = new Set<string>();
  return latestFirst(list).filter((r) => {
    const key =
      catalogKey(r) ??
      `${r.kind}:name:${titleKey(r)}:${r.kind === 'livros' ? fold(r.game.by ?? '') : (yearOf(r) ?? '')}`;
    if (keys.has(key)) return false;
    keys.add(key);
    return true;
  });
}

export interface Collections {
  /** As obras que os dois resenharam, uma ficha de cada lado. */
  pairs: ReviewPair[];
  /** O que só eu resenhei. Homônimos ambíguos ficam de fora: talvez o colega tenha a obra. */
  onlyMine: Review[];
  /** O que só o colega resenhou, com a mesma cautela. */
  onlyTheirs: Review[];
}

/** IDs de fichas não identificam obras; colegas podem ter importado o mesmo backup antigo. */
export function compareCollections(
  mine: readonly Review[],
  theirs: readonly Review[],
): Collections {
  const own = distinctWorks(mine);
  const other = distinctWorks(theirs);
  const byCatalog = new Map<string, Review>();
  const byTitle = new Map<string, Review[]>();
  for (const r of other) {
    const catalog = catalogKey(r);
    if (catalog) byCatalog.set(catalog, r);
    const title = `${r.kind}:${titleKey(r)}`;
    byTitle.set(title, [...(byTitle.get(title) ?? []), r]);
  }
  const matches = new Map<Review, Review>();
  const used = new Set<Review>();
  // Catálogo primeiro: a correspondência exata tem prioridade sobre uma ficha manual homônima.
  for (const r of own) {
    const key = catalogKey(r);
    const match = key ? byCatalog.get(key) : undefined;
    if (match && !used.has(match)) {
      matches.set(r, match);
      used.add(match);
    }
  }
  const proposals = new Map<Review, Review[]>();
  for (const r of own) {
    if (matches.has(r)) continue;
    const candidates = (byTitle.get(`${r.kind}:${titleKey(r)}`) ?? []).filter(
      (t) => !used.has(t) && compatible(r, t),
    );
    if (candidates.length !== 1) continue;
    const match = candidates[0];
    proposals.set(match, [...(proposals.get(match) ?? []), r]);
  }
  for (const [match, candidates] of proposals) {
    // Ano/autoria ausente com vários homônimos não adivinha qual das obras é.
    if (candidates.length === 1) {
      matches.set(candidates[0], match);
      used.add(match);
    }
  }
  const pairs = [...matches].map(([mine, theirs]) => ({
    key: `${mine.id}:${theirs.id}`,
    mine,
    theirs,
    difference: Math.round((mine.scores.final - theirs.scores.final) * 10) / 10,
  }));
  // "Só um tem" é uma dica: na dúvida (um homônimo que não casou), não afirma que o outro não tem.
  const ownTitles = new Set(own.map((r) => `${r.kind}:${titleKey(r)}`));
  const otherTitles = new Set(byTitle.keys());
  return {
    pairs,
    onlyMine: own.filter(
      (r) => !matches.has(r) && !otherTitles.has(`${r.kind}:${titleKey(r)}`) && !(catalogKey(r) && byCatalog.has(catalogKey(r)!)),
    ),
    onlyTheirs: other.filter(
      (r) => !used.has(r) && !ownTitles.has(`${r.kind}:${titleKey(r)}`),
    ),
  };
}

export function commonReviews(
  mine: readonly Review[],
  theirs: readonly Review[],
): ReviewPair[] {
  return compareCollections(mine, theirs).pairs;
}

/** Uma ficha por obra: a mesma regra da comparação, para contar e ranquear sem repetir. */
export function distinctReviews(list: readonly Review[]): Review[] {
  return distinctWorks(list);
}
