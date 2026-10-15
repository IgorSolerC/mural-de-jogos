/**
 * As conversões do que um site mais antigo guardou: cada uma diz a partir de qual build (ver
 * `build.ts`) o formato mudou. O backup e o mural da nuvem levam a build que os gravou; o que não diz a
 * build (os backups de antes da 301, o que está guardado neste navegador, o mural de quem você segue)
 * passa por todas.
 *
 * Por isso toda conversão tem que deixar como está o que já veio no formato novo: passar duas vezes
 * dá o mesmo que passar uma. Elas mexem no objeto cru, antes de `sanitizeReview` conferir os campos,
 * e nunca no desenho: a ficha convertida sai igualzinha.
 */
import { AGED_PAPERS, STAINS } from './paper';

type Raw = Record<string, unknown>;

interface Migration {
  /** A primeira build que já grava no formato novo. */
  build: number;
  /** O que mudou, em português. */
  what: string;
  review: (raw: Raw) => Raw;
}

/** Sem uma chave (as ausentes não viram `undefined`, para a ficha sair igual à de antes). */
function without(raw: Raw, ...keys: string[]): Raw {
  const out = { ...raw };
  for (const k of keys) delete out[k];
  return out;
}

/**
 * Desbotada no sol e Carregou pela metade eram estragos e viraram papéis, com o mesmo sorteio. Se a
 * ficha também tinha um papel, o desbotado (ou o carregando) fica no lugar dele.
 */
function agedPaper(raw: Raw): Raw {
  const d = raw['damage'];
  if (!(AGED_PAPERS as readonly unknown[]).includes(d)) return raw;
  const seed = raw['damageSeed'];
  return { ...without(raw, 'damage', 'damageSeed', 'paper', 'paperSeed'), paper: d, ...(seed !== undefined ? { paperSeed: seed } : {}) };
}

/**
 * A mancha e a decoração eram uma só, e viraram listas (até três). As fichas de antes de 2026-09-29
 * guardavam a mancha no lugar do estrago: ela vem de lá, com o sorteio do estrago, se a ficha não
 * tinha a própria.
 */
function markLists(raw: Raw): Raw {
  let out = raw;
  if (!('stains' in out)) {
    const own = (STAINS as readonly unknown[]).includes(out['stain']);
    const legacy = !own && (STAINS as readonly unknown[]).includes(out['damage']);
    const stain = own ? out['stain'] : legacy ? out['damage'] : undefined;
    const seed = own ? out['stainSeed'] : legacy ? out['damageSeed'] : undefined;
    out = without(out, 'stain', 'stainSeed', ...(legacy ? ['damage', 'damageSeed'] : []));
    if (stain !== undefined) out['stains'] = [{ stain, ...(seed !== undefined ? { seed } : {}) }];
  }
  if (!('decors' in out) && ('decor' in out || 'decorSeed' in out)) {
    const decor = out['decor'],
      seed = out['decorSeed'];
    out = without(out, 'decor', 'decorSeed');
    if (typeof decor === 'string') out['decors'] = [{ decor, ...(seed !== undefined ? { seed } : {}) }];
  }
  return out;
}

const MIGRATIONS: readonly Migration[] = [
  { build: 301, what: 'Desbotada no sol e Carregou pela metade saem dos estragos e viram papéis', review: agedPaper },
  { build: 301, what: 'A mancha e a decoração viram listas, de até três', review: markLists },
];

/** A build que gravou um backup (ou o mural da nuvem); 0 quando ele é de antes do campo. */
export function buildOf(data: unknown): number {
  const b = data && typeof data === 'object' ? (data as Raw)['build'] : undefined;
  return Number.isInteger(b) && (b as number) > 0 ? (b as number) : 0;
}

/** Uma ficha crua, gravada pela build `from`, no formato desta build. */
export function migrateReview(raw: Raw, from = 0): Raw {
  let out = raw;
  for (const m of MIGRATIONS) if (m.build > from) out = m.review(out);
  return out;
}
