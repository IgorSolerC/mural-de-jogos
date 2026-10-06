import { Kind, KindProfile, profileOf } from './kinds';
import { DECOR_LABEL, DAMAGE_LABEL, PAPER_LABEL, PATTERN_LABEL, SCRIBBLE_LABEL, STAIN_LABEL } from './paper';
import {
  Bonus,
  BonusKind,
  DIFFICULTIES,
  DIFFICULTY_LABEL,
  Difficulty,
  Draft,
  GameSource,
  RatedKey,
  Relevance,
  Review,
  SCORE_LABEL,
  STATUSES,
  STOCK_LABEL,
  Status,
  Stock,
  VERDICTS,
  VERDICT_LABEL,
  Verdict,
  Wish,
  computeBase,
  counts,
  fold,
  isCatalogBonus,
  isValidDay,
  isYearMonth,
  parseDay,
  ratedKeys,
  relevanceOf,
  scoreOf,
  shownFinal,
  shownScore,
  weightOf,
} from './review';
import { pinningFor } from './wall-physics';

/**
 * As Estatísticas do mural: tudo o que dá para tirar das fichas de um mural (o seu ou o de um colega),
 * em funções puras. A página só lê e desenha. Nada aqui grava: são contas.
 *
 * Duas regras valem em tudo:
 * - A Média que decide faixa, histograma, maior e menor é a nota como aparece (`shownFinal`), a mesma
 *   do ranking e dos grupos do mural. As médias de médias usam a nota guardada.
 * - Uma ficha sem a informação (sem data, sem horas, sem veredito) fica fora só da conta que precisa
 *   dela, e a página diz quantas ficaram de fora quando isso muda a leitura.
 */

// ======================= peças =======================

/** Uma ficha com o número que a pôs ali (a maior nota, as horas, as palavras). */
export interface Pick {
  review: Review;
  value: number;
}

/** Uma barra de um gráfico: rótulo, quantas e, quando faz sentido, a média das fichas dela. */
export interface Bar {
  key: string;
  label: string;
  n: number;
  avg: number | null;
}

export interface Count<T> {
  value: T;
  label: string;
  n: number;
  avg: number | null;
}

const mean = (xs: readonly number[]): number | null => (xs.length ? xs.reduce((s, v) => s + v, 0) / xs.length : null);

/** O quantil q (0 a 1) de uma lista já ordenada, com interpolação linear. */
export function quantile(sorted: readonly number[], q: number): number | null {
  if (!sorted.length) return null;
  const pos = (sorted.length - 1) * q;
  const lo = Math.floor(pos);
  const hi = Math.ceil(pos);
  return sorted[lo] + (sorted[hi] - sorted[lo]) * (pos - lo);
}

export function stdev(xs: readonly number[]): number | null {
  const m = mean(xs);
  if (m === null || xs.length < 2) return null;
  return Math.sqrt(xs.reduce((s, v) => s + (v - m) ** 2, 0) / xs.length);
}

/** Correlação de Pearson; null com menos de 4 pares ou sem variação. */
export function pearson(pairs: readonly [number, number][]): number | null {
  if (pairs.length < 4) return null;
  const mx = mean(pairs.map((p) => p[0]))!;
  const my = mean(pairs.map((p) => p[1]))!;
  let sxy = 0;
  let sxx = 0;
  let syy = 0;
  for (const [x, y] of pairs) {
    sxy += (x - mx) * (y - my);
    sxx += (x - mx) ** 2;
    syy += (y - my) ** 2;
  }
  if (!sxx || !syy) return null;
  return sxy / Math.sqrt(sxx * syy);
}

/** Como uma correlação se lê: "anda junto", "anda um pouco junto", "nem liga". */
export function strength(r: number | null): 'forte' | 'media' | 'fraca' | null {
  if (r === null) return null;
  const a = Math.abs(r);
  return a >= 0.6 ? 'forte' : a >= 0.3 ? 'media' : 'fraca';
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const byName = (a: Review, b: Review) => collator.compare(a.game.name, b.game.name);

function tally<T extends string>(list: readonly Review[], pick: (r: Review) => T | undefined | null, label: (v: T) => string): Count<T>[] {
  const map = new Map<T, Review[]>();
  for (const r of list) {
    const v = pick(r);
    if (v === undefined || v === null) continue;
    const arr = map.get(v);
    if (arr) arr.push(r);
    else map.set(v, [r]);
  }
  return [...map]
    .map(([value, rs]) => ({ value, label: label(value), n: rs.length, avg: mean(rs.map((r) => r.scores.final)) }))
    .sort((a, b) => b.n - a.n || collator.compare(a.label, b.label));
}

// ======================= datas =======================

/** O ano de conclusão, ou null sem data. */
export function yearOf(r: Review): number | null {
  return r.completedAt ? Number(r.completedAt.slice(0, 4)) : null;
}

/** O mês de conclusão (1 a 12), só quando o mês foi lembrado. */
export function monthOf(r: Review): number | null {
  const d = r.completedAt;
  return d && (isYearMonth(d) || isValidDay(d)) ? Number(d.slice(5, 7)) : null;
}

/** O dia de conclusão, só quando o dia foi lembrado. */
export function dayOf(r: Review): Date | null {
  return r.completedAt && isValidDay(r.completedAt) ? parseDay(r.completedAt) : null;
}

/** Os anos em que há fichas terminadas, do mais novo para o mais velho. */
export function yearsIn(list: readonly Review[]): number[] {
  return [...new Set(list.map(yearOf).filter((y): y is number => y !== null))].sort((a, b) => b - a);
}

/** As fichas de um ano de conclusão; sem ano, todas. */
export function inYear(list: readonly Review[], year: number | null): Review[] {
  return year === null ? [...list] : list.filter((r) => yearOf(r) === year);
}

/** O ano de lançamento, quando o catálogo trouxe um ano que faz sentido. */
export function releaseOf(r: Review): number | null {
  const y = Number(r.game.year?.match(/\d{4}/)?.[0]);
  return y > 1800 && y < 2200 ? y : null;
}

const MONTHS = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const MONTHS_LONG = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
/** Começa na segunda, como a folhinha da parede. */
export const WEEKDAYS = ['seg', 'ter', 'qua', 'qui', 'sex', 'sáb', 'dom'];
export const WEEKDAYS_LONG = ['segunda', 'terça', 'quarta', 'quinta', 'sexta', 'sábado', 'domingo'];

export const monthName = (m: number) => MONTHS[m - 1];
export const monthLong = (m: number) => MONTHS_LONG[m - 1];

/** As quatro partes do dia em que as fichas foram pregadas. */
export const DAY_PARTS = [
  { key: 'madrugada', label: 'Madrugada', from: 0, to: 6 },
  { key: 'manha', label: 'Manhã', from: 6, to: 12 },
  { key: 'tarde', label: 'Tarde', from: 12, to: 18 },
  { key: 'noite', label: 'Noite', from: 18, to: 24 },
] as const;

const DAY_MS = 86_400_000;

// ======================= o retrato =======================

export interface CategoryStat {
  key: RatedKey;
  label: string;
  /** Quantas fichas têm essa nota contando na média. */
  n: number;
  avg: number | null;
  median: number | null;
  max: Pick | null;
  min: Pick | null;
  /** Quantos 10 (como aparece). */
  tens: number;
  /** Quantas vezes cada peso foi escolhido. */
  naoTem: number;
  relevante: number;
  pouco: number;
  /** O quanto essa nota anda junto com a Média (Pearson). */
  corr: number | null;
}

export interface MonthCell {
  month: number;
  n: number;
  avg: number | null;
}

export interface YearRow {
  year: number;
  months: MonthCell[];
  /** Fichas do ano sem o mês lembrado. */
  loose: number;
  n: number;
}

export interface Franchise {
  name: string;
  reviews: Review[];
  avg: number;
}

export interface Incoherence {
  review: Review;
  verdict: Verdict;
  /** "Masterpiece com 7,4", sem o número (a página formata). */
  why: 'baixa' | 'alta';
}

export interface WallStats {
  kind: Kind;
  /** As fichas originais, uma por obra. */
  count: number;
  /** As rejogadas (releituras, reassistidas): contam no tempo, na quantidade e nas palavras. */
  revisits: number;
  // ----- notas -----
  average: number | null;
  median: number | null;
  spread: number | null;
  p10: number | null;
  p25: number | null;
  p75: number | null;
  p90: number | null;
  /** As Médias como aparecem, da menor para a maior. */
  finals: number[];
  best: Pick | null;
  worst: Pick | null;
  top: Review[];
  bottom: Review[];
  /** De 0 a 10 (e 11, se alguém deu 11 na mão): a Média de cada ficha, pela casa inteira. */
  histogram: Bar[];
  /** A Média que mais se repete, se repete pelo menos duas vezes. */
  repeated: { value: number; n: number } | null;
  tens: number;
  below4: number;
  categories: CategoryStat[];
  /** A categoria que puxa mais a Média (a de maior correlação). */
  driver: CategoryStat | null;
  bonusShift: { n: number; avg: number; up: Pick | null; down: Pick | null } | null;
  overrides: { n: number; avg: number; biggest: Pick | null };
  // ----- tempo -----
  byYear: Bar[];
  calendar: YearRow[];
  calendarMax: number;
  weekdays: Bar[];
  weekdayKnown: number;
  dayParts: Bar[];
  hours: number[];
  first: Review | null;
  last: Review | null;
  busiestMonth: { year: number; month: number; n: number } | null;
  busiestYear: Bar | null;
  /** Fichas por mês, entre o primeiro e o último mês com ficha. */
  perMonth: number | null;
  monthsSpan: number;
  longestGap: { from: Review; to: Review; days: number } | null;
  monthStreak: { best: number; bestEnd: string | null };
  /** Quantas foram pregadas mais de 60 dias depois de terminadas (resenhas de memória). */
  retro: number;
  precision: { dia: number; mes: number; ano: number; sem: number };
  busiestDay: { day: string; reviews: Review[] } | null;
  /** Primeira e última metade do mural: a média ficou mais alta ou mais baixa? */
  drift: { before: number; after: number; split: number } | null;
  // ----- hábitos -----
  statuses: Count<Status>[];
  finishRate: number | null;
  difficulties: Count<Difficulty>[] | null;
  amount: {
    n: number;
    /** O total de tudo, com as rejogadas (o tempo gasto de verdade). O resto é só das originais. */
    total: number;
    /** Quanto do total veio das rejogadas. */
    revisitTotal: number;
    avg: number;
    median: number;
    longest: Pick;
    shortest: Pick;
    hist: Bar[];
    corr: number | null;
    /** Nota por hora: a ficha 8+ mais curta. */
    quickJoy: Pick | null;
    /** A mais longa abaixo de 6. */
    longSlog: Pick | null;
    points: { review: Review; x: number; y: number }[];
  } | null;
  release: {
    n: number;
    byDecade: Bar[];
    oldest: Pick | null;
    newest: Pick | null;
    /** Quantos anos depois do lançamento, em média, a ficha foi terminada. */
    lag: number | null;
    /** Terminadas no próprio ano de lançamento. */
    fresh: number;
    topYear: { year: number; n: number } | null;
  };
  text: {
    withText: number;
    words: number;
    avgWords: number | null;
    longest: Pick | null;
    shortest: Pick | null;
  };
  // ----- vereditos e bônus -----
  verdicts: (Count<Verdict> & { min: number | null; max: number | null })[];
  noVerdict: number;
  incoherent: Incoherence[];
  bonuses: Record<BonusKind, Count<string>[]> & {
    /** O adesivo de cada contagem (para desenhar). */
    stickers: Map<string, Bonus>;
    withAny: number;
    total: number;
    favorTotal: number;
    contraTotal: number;
    perCard: number | null;
    most: Pick | null;
    custom: number;
    /** O bônus a favor que mais aparece nas fichas 9+. */
    inTop: Count<string> | null;
  };
  // ----- cartolinas -----
  stocks: Count<Stock>[];
  lucky: Count<Stock> | null;
  papers: Count<string>[];
  patterns: Count<string>[];
  scribbles: Count<string>[];
  damages: Count<string>[];
  stains: Count<string>[];
  decors: Count<string>[];
  decorated: number;
  /** Lisas contra enfeitadas: quantas e a média de cada jeito de enfeitar. */
  dressing: Count<string>[];
  covers: { missing: number; sources: Count<GameSource>[] };
  // ----- curiosidades -----
  franchises: Franchise[];
  authors: Count<string>[];
  initials: { letter: string; n: number }[];
  longestName: Review | null;
  shortestName: Review | null;
  createdFirst: Review | null;
}

const SOURCE_LABEL: Record<GameSource, string> = {
  wikipedia: 'Wikipedia',
  rawg: 'RAWG',
  openlibrary: 'Open Library',
  kitsu: 'Kitsu',
  anilist: 'AniList',
  tmdb: 'TMDB',
  manual: 'Digitado à mão',
};

/** Quantas palavras a resenha tem. */
export function wordsOf(text: string): number {
  const t = text.trim();
  return t ? t.split(/\s+/).length : 0;
}

/** As faixas da quantidade: horas e páginas têm réguas diferentes. */
function amountBins(kind: Kind): { label: string; to: number }[] {
  return profileOf(kind).amount?.decimals
    ? [
        { label: 'até 5 h', to: 5 },
        { label: '5–10', to: 10 },
        { label: '10–20', to: 20 },
        { label: '20–40', to: 40 },
        { label: '40–80', to: 80 },
        { label: '80+', to: Infinity },
      ]
    : [
        { label: 'até 150', to: 150 },
        { label: '150–300', to: 300 },
        { label: '300–450', to: 450 },
        { label: '450–600', to: 600 },
        { label: '600+', to: Infinity },
      ];
}

/** O que não bate entre carimbo e nota: a faixa que cada veredito costuma ter. */
const VERDICT_BAND: Record<Verdict, [number, number]> = {
  masterpiece: [8, 11],
  recomendo: [6.5, 11],
  legalzinho: [5, 9],
  meh: [3, 7.5],
  chato: [0, 6],
};

const ROMAN = /\s+(ii|iii|iv|v|vi|vii|viii|ix|x|xi|xii)$/;
const ARTICLES = new Set(['the', 'o', 'a', 'os', 'as', 'um', 'uma', 'el', 'la', 'le', 'les', 'de']);

/** O nome sem subtítulo, sem número de continuação e sem o ano entre parênteses: "God of War". */
function baseName(name: string): string {
  return name
    .replace(/\s*\(\d{4}\)\s*$/, '')
    .split(/\s*[:–—]\s+|\s+-\s+/)[0]
    .replace(/[\s,.:]+(\d+|part \d+|parte \d+)$/i, '')
    .trim();
}

function franchiseKeys(name: string): { full: string; prefix: string | null } {
  let full = fold(baseName(name)).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  full = full.replace(ROMAN, '').replace(/\s+\d+$/, '').trim();
  const words = full.split(' ').filter((w) => w && !ARTICLES.has(w) && !/^\d+$/.test(w));
  return { full, prefix: words.length >= 2 ? words.slice(0, 2).join(' ') : null };
}

/**
 * As franquias: fichas que dividem o nome-base ("God of War", "God of War II", "God of War: Ragnarök")
 * ou as duas primeiras palavras que importam ("Super Mario Odyssey" e "Super Mario Galaxy").
 */
export function franchisesOf(list: readonly Review[]): Franchise[] {
  const keyed = list.map((r) => ({ r, ...franchiseKeys(r.game.name) })).filter((x) => x.full.length >= 3);
  const prefixFulls = new Map<string, Set<string>>();
  for (const x of keyed) if (x.prefix) prefixFulls.set(x.prefix, (prefixFulls.get(x.prefix) ?? new Set()).add(x.full));
  const groups = new Map<string, Review[]>();
  for (const x of keyed) {
    const key = x.prefix && (prefixFulls.get(x.prefix)?.size ?? 0) >= 2 ? `p:${x.prefix}` : `f:${x.full}`;
    groups.set(key, [...(groups.get(key) ?? []), x.r]);
  }
  const out: Franchise[] = [];
  for (const [key, rs] of groups) {
    if (rs.length < 2) continue;
    let name: string;
    if (key.startsWith('p:')) {
      // as palavras do nome original até a segunda que importa: "The Witcher", "Super Mario"
      const words = rs[0].game.name.split(/\s+/);
      const kept: string[] = [];
      let seen = 0;
      for (const w of words) {
        kept.push(w);
        if (!ARTICLES.has(fold(w))) seen++;
        if (seen === 2) break;
      }
      name = kept.join(' ').replace(/[:,–—-]+$/, '');
    } else {
      name = [...rs].map((r) => baseName(r.game.name).replace(ROMAN, '').replace(/\s+\d+$/, '')).sort((a, b) => a.length - b.length)[0];
    }
    out.push({ name, reviews: [...rs].sort((a, b) => shownFinal(b) - shownFinal(a) || byName(a, b)), avg: mean(rs.map((r) => r.scores.final))! });
  }
  return out.sort((a, b) => b.reviews.length - a.reviews.length || b.avg - a.avg || collator.compare(a.name, b.name));
}

/**
 * Todas as contas de um mural. `list` já vem filtrada (mural e, se for o caso, ano) e tem só as fichas
 * originais, uma por obra: é sobre elas que valem as notas, os vereditos, os bônus e as curiosidades.
 * `sessions` são as originais e as rejogadas (releituras, reassistidas): o tempo (fichas por mês, por
 * ano, por dia da semana), a quantidade gasta e as palavras escritas contam todas as vezes.
 */
export function wallStats(list: readonly Review[], kind: Kind, sessions: readonly Review[] = list): WallStats {
  const profile = profileOf(kind);
  const n = list.length;
  const finalsRaw = list.map((r) => r.scores.final);
  const finals = list.map(shownFinal).sort((a, b) => a - b);
  const byScoreDesc = [...list].sort((a, b) => shownFinal(b) - shownFinal(a) || b.scores.final - a.scores.final || byName(a, b));
  const byScoreAsc = [...list].sort((a, b) => shownFinal(a) - shownFinal(b) || a.scores.final - b.scores.final || byName(a, b));

  // ----- histograma -----
  const topBin = finals.some((v) => v > 10) ? 11 : 10;
  const bins = Array.from({ length: topBin + 1 }, (_, i) => ({ key: String(i), label: String(i), n: 0, sum: 0 }));
  for (const r of list) {
    const v = shownFinal(r);
    const b = bins[Math.min(topBin, Math.floor(v))];
    b.n++;
    b.sum += r.scores.final;
  }
  const histogram = bins.map((b) => ({ key: b.key, label: b.label, n: b.n, avg: b.n ? b.sum / b.n : null }));

  const rep = new Map<number, number>();
  for (const v of finals) rep.set(v, (rep.get(v) ?? 0) + 1);
  const repeatedTop = [...rep].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];

  // ----- categorias -----
  const categories: CategoryStat[] = ratedKeys(kind).map((key) => {
    const counted = list.filter((r) => counts(r.weights, key) && scoreOf(r.scores, key) !== null);
    const vals = counted.map((r) => shownScore(scoreOf(r.scores, key)!));
    const sorted = [...vals].sort((a, b) => a - b);
    const pairs = counted.map((r) => [scoreOf(r.scores, key)!, r.scores.final] as [number, number]);
    const hi = [...counted].sort((a, b) => scoreOf(b.scores, key)! - scoreOf(a.scores, key)! || shownFinal(b) - shownFinal(a) || byName(a, b))[0];
    const lo = [...counted].sort((a, b) => scoreOf(a.scores, key)! - scoreOf(b.scores, key)! || shownFinal(a) - shownFinal(b) || byName(a, b))[0];
    return {
      key,
      label: SCORE_LABEL[key],
      n: counted.length,
      avg: mean(counted.map((r) => scoreOf(r.scores, key)!)),
      median: quantile(sorted, 0.5),
      max: hi ? { review: hi, value: scoreOf(hi.scores, key)! } : null,
      min: lo ? { review: lo, value: scoreOf(lo.scores, key)! } : null,
      tens: vals.filter((v) => v >= 10).length,
      naoTem: list.filter((r) => weightOf(r.weights, key) === 'nao-tem').length,
      relevante: list.filter((r) => weightOf(r.weights, key) === 'relevante').length,
      pouco: list.filter((r) => weightOf(r.weights, key) === 'pouco').length,
      corr: pearson(pairs),
    };
  });
  const driver = [...categories].filter((c) => c.corr !== null).sort((a, b) => b.corr! - a.corr!)[0] ?? null;

  // ----- bônus mexendo na média, e a nota na mão -----
  const shifts: Pick[] = [];
  const overrides: Pick[] = [];
  for (const r of list) {
    const base = computeBase(r);
    if (base === null) continue;
    if (r.finalOverride !== undefined) overrides.push({ review: r, value: r.finalOverride - base });
    else if (r.bonuses.length) shifts.push({ review: r, value: r.scores.final - base });
  }
  const shiftUp = [...shifts].sort((a, b) => b.value - a.value)[0];
  const shiftDown = [...shifts].sort((a, b) => a.value - b.value)[0];

  // ----- tempo -----
  const yearMap = new Map<number, Review[]>();
  for (const r of sessions) {
    const y = yearOf(r);
    if (y !== null) yearMap.set(y, [...(yearMap.get(y) ?? []), r]);
  }
  const years = [...yearMap.keys()].sort((a, b) => a - b);
  const fullYears = years.length ? Array.from({ length: years.at(-1)! - years[0] + 1 }, (_, i) => years[0] + i) : [];
  const byYear: Bar[] = fullYears.map((y) => {
    const rs = yearMap.get(y) ?? [];
    return { key: String(y), label: String(y), n: rs.length, avg: mean(rs.map((r) => r.scores.final)) };
  });
  const calendar: YearRow[] = [...fullYears].reverse().map((year) => {
    const rs = yearMap.get(year) ?? [];
    const months = Array.from({ length: 12 }, (_, i) => {
      const inMonth = rs.filter((r) => monthOf(r) === i + 1);
      return { month: i + 1, n: inMonth.length, avg: mean(inMonth.map((r) => r.scores.final)) };
    });
    return { year, months, loose: rs.filter((r) => monthOf(r) === null).length, n: rs.length };
  });
  const calendarMax = Math.max(0, ...calendar.flatMap((y) => y.months.map((m) => m.n)));
  let busiestMonth: WallStats['busiestMonth'] = null;
  for (const row of calendar)
    for (const m of row.months)
      if (m.n > (busiestMonth?.n ?? 0) || (m.n === busiestMonth?.n && m.n > 0 && row.year > busiestMonth.year)) busiestMonth = { year: row.year, month: m.month, n: m.n };
  const busiestYear = byYear.length ? [...byYear].sort((a, b) => b.n - a.n || Number(b.key) - Number(a.key))[0] : null;

  // meses seguidos com pelo menos uma ficha
  const monthKeys = new Set(sessions.filter((r) => monthOf(r) !== null).map((r) => yearOf(r)! * 12 + monthOf(r)! - 1));
  const sortedMonths = [...monthKeys].sort((a, b) => a - b);
  let best = 0;
  let bestEnd: number | null = null;
  let run = 0;
  for (let i = 0; i < sortedMonths.length; i++) {
    run = i && sortedMonths[i] === sortedMonths[i - 1] + 1 ? run + 1 : 1;
    if (run >= best) {
      best = run;
      bestEnd = sortedMonths[i];
    }
  }
  const monthsSpan = sortedMonths.length ? sortedMonths.at(-1)! - sortedMonths[0] + 1 : 0;

  const dated = sessions.filter((r) => dayOf(r)).sort((a, b) => dayOf(a)!.getTime() - dayOf(b)!.getTime() || byName(a, b));
  let longestGap: WallStats['longestGap'] = null;
  for (let i = 1; i < dated.length; i++) {
    const days = Math.round((dayOf(dated[i])!.getTime() - dayOf(dated[i - 1])!.getTime()) / DAY_MS);
    if (days > (longestGap?.days ?? 0)) longestGap = { from: dated[i - 1], to: dated[i], days };
  }
  const weekdayCount = Array.from({ length: 7 }, () => [] as Review[]);
  for (const r of dated) weekdayCount[(dayOf(r)!.getDay() + 6) % 7].push(r);
  const weekdays = weekdayCount.map((rs, i) => ({ key: String(i), label: WEEKDAYS[i], n: rs.length, avg: mean(rs.map((r) => r.scores.final)) }));

  const hours = Array.from({ length: 24 }, () => 0);
  for (const r of sessions) {
    const d = new Date(r.createdAt);
    if (!Number.isNaN(d.getTime())) hours[d.getHours()]++;
  }
  const dayParts = DAY_PARTS.map((p) => ({ key: p.key, label: p.label, n: hours.slice(p.from, p.to).reduce((s, v) => s + v, 0), avg: null }));

  const byDay = new Map<string, Review[]>();
  for (const r of dated) byDay.set(r.completedAt!, [...(byDay.get(r.completedAt!) ?? []), r]);
  const busiestDayEntry = [...byDay].sort((a, b) => b[1].length - a[1].length || b[0].localeCompare(a[0]))[0];

  // a ordem no tempo: dia, depois mês, depois ano (as sem data ficam de fora)
  const timeline = (rs: readonly Review[]) =>
    rs.filter((r) => r.completedAt).sort((a, b) => a.completedAt!.localeCompare(b.completedAt!) || a.createdAt.localeCompare(b.createdAt));
  const chrono = timeline(sessions);
  // a régua de nota apertou ou afrouxou: só nas originais, cada obra uma vez
  const chronoScored = timeline(list);
  let drift: WallStats['drift'] = null;
  if (chronoScored.length >= 8) {
    const half = Math.floor(chronoScored.length / 2);
    drift = {
      before: mean(chronoScored.slice(0, half).map((r) => r.scores.final))!,
      after: mean(chronoScored.slice(chronoScored.length - half).map((r) => r.scores.final))!,
      split: half,
    };
  }

  const precision = { dia: 0, mes: 0, ano: 0, sem: 0 };
  let retro = 0;
  for (const r of sessions) {
    const d = r.completedAt;
    if (d === null) precision.sem++;
    else if (isValidDay(d)) precision.dia++;
    else if (isYearMonth(d)) precision.mes++;
    else precision.ano++;
    const day = dayOf(r);
    const created = Date.parse(r.createdAt);
    if (day && !Number.isNaN(created) && created - day.getTime() > 60 * DAY_MS) retro++;
  }

  // ----- status, dificuldade, quantidade -----
  const statuses = STATUSES.map((s) => {
    const rs = list.filter((r) => r.status === s);
    return { value: s, label: profile.status[s], n: rs.length, avg: mean(rs.map((r) => r.scores.final)) };
  }).reverse();
  const finishRate = n ? Math.round((list.filter((r) => r.status !== 'incompleto').length / n) * 100) : null;
  const difficulties = profile.difficulty
    ? DIFFICULTIES.map((d) => {
        const rs = list.filter((r) => r.difficulty === d);
        return { value: d, label: DIFFICULTY_LABEL[d], n: rs.length, avg: mean(rs.map((r) => r.scores.final)) };
      })
    : null;

  let amount: WallStats['amount'] = null;
  const withAmount = list.filter((r) => r.hoursPlayed !== null && r.hoursPlayed > 0);
  if (profile.amount && withAmount.length) {
    const vals = withAmount.map((r) => r.hoursPlayed!).sort((a, b) => a - b);
    const longR = [...withAmount].sort((a, b) => b.hoursPlayed! - a.hoursPlayed! || byName(a, b))[0];
    const shortR = [...withAmount].sort((a, b) => a.hoursPlayed! - b.hoursPlayed! || byName(a, b))[0];
    const binsA = amountBins(kind);
    const binOf = (v: number) => binsA.findIndex((b) => v <= b.to);
    const hist: Bar[] = binsA.map((b, i) => {
      const rs = withAmount.filter((r) => binOf(r.hoursPlayed!) === i);
      return { key: String(i), label: b.label, n: rs.length, avg: mean(rs.map((r) => r.scores.final)) };
    });
    const quick = withAmount.filter((r) => shownFinal(r) >= 8).sort((a, b) => a.hoursPlayed! - b.hoursPlayed! || shownFinal(b) - shownFinal(a))[0];
    const slog = withAmount.filter((r) => shownFinal(r) < 6).sort((a, b) => b.hoursPlayed! - a.hoursPlayed! || shownFinal(a) - shownFinal(b))[0];
    const revisitTotal = sessions.reduce((s, r) => s + (r.revisitOf && r.hoursPlayed ? r.hoursPlayed : 0), 0);
    amount = {
      n: withAmount.length,
      total: vals.reduce((s, v) => s + v, 0) + revisitTotal,
      revisitTotal,
      avg: mean(vals)!,
      median: quantile(vals, 0.5)!,
      longest: { review: longR, value: longR.hoursPlayed! },
      shortest: { review: shortR, value: shortR.hoursPlayed! },
      hist,
      corr: pearson(withAmount.map((r) => [Math.log(r.hoursPlayed! + 1), r.scores.final])),
      quickJoy: quick ? { review: quick, value: quick.hoursPlayed! } : null,
      longSlog: slog ? { review: slog, value: slog.hoursPlayed! } : null,
      points: withAmount.map((r) => ({ review: r, x: r.hoursPlayed!, y: shownFinal(r) })),
    };
  }

  // ----- lançamento -----
  const released = list.filter((r) => releaseOf(r) !== null);
  const decades = new Map<number, Review[]>();
  for (const r of released) {
    const d = Math.floor(releaseOf(r)! / 10) * 10;
    decades.set(d, [...(decades.get(d) ?? []), r]);
  }
  const decadeKeys = [...decades.keys()].sort((a, b) => a - b);
  const byDecade: Bar[] = decadeKeys.length
    ? Array.from({ length: (decadeKeys.at(-1)! - decadeKeys[0]) / 10 + 1 }, (_, i) => {
        const d = decadeKeys[0] + i * 10;
        const rs = decades.get(d) ?? [];
        return { key: String(d), label: `${String(d).slice(2)}s`, n: rs.length, avg: mean(rs.map((r) => r.scores.final)) };
      })
    : [];
  const oldestR = [...released].sort((a, b) => releaseOf(a)! - releaseOf(b)! || byName(a, b))[0];
  const newestR = [...released].sort((a, b) => releaseOf(b)! - releaseOf(a)! || byName(a, b))[0];
  const lags = released.filter((r) => yearOf(r) !== null).map((r) => yearOf(r)! - releaseOf(r)!).filter((v) => v >= 0);
  const relYears = new Map<number, number>();
  for (const r of released) relYears.set(releaseOf(r)!, (relYears.get(releaseOf(r)!) ?? 0) + 1);
  const topRel = [...relYears].sort((a, b) => b[1] - a[1] || b[0] - a[0])[0];

  // ----- texto -----
  const texted = sessions.map((r) => ({ review: r, value: wordsOf(r.text) })).filter((p) => p.value > 0);
  const words = texted.reduce((s, p) => s + p.value, 0);

  // ----- vereditos -----
  const verdicts = VERDICTS.map((v) => {
    const rs = list.filter((r) => r.verdict === v);
    const vals = rs.map(shownFinal);
    return {
      value: v,
      label: VERDICT_LABEL[v],
      n: rs.length,
      avg: mean(rs.map((r) => r.scores.final)),
      min: vals.length ? Math.min(...vals) : null,
      max: vals.length ? Math.max(...vals) : null,
    };
  });
  const incoherent: Incoherence[] = list
    .filter((r) => r.verdict)
    .flatMap((r): Incoherence[] => {
      const [lo, hi] = VERDICT_BAND[r.verdict!];
      const v = shownFinal(r);
      return v < lo ? [{ review: r, verdict: r.verdict!, why: 'baixa' }] : v > hi ? [{ review: r, verdict: r.verdict!, why: 'alta' }] : [];
    })
    .sort((a, b) => VERDICTS.indexOf(a.verdict) - VERDICTS.indexOf(b.verdict) || byName(a.review, b.review));

  // ----- bônus -----
  const stickers = new Map<string, Bonus>();
  const bonusOf = (kindB: BonusKind) => {
    const map = new Map<string, Review[]>();
    for (const r of list)
      for (const b of r.bonuses) {
        if (b.kind !== kindB) continue;
        // o mesmo nome do mesmo lado é o mesmo bônus, da cartela ou escrito à mão
        const key = `${b.kind}:${fold(b.label)}`;
        if (!stickers.has(key)) stickers.set(key, b);
        map.set(key, [...(map.get(key) ?? []), r]);
      }
    return [...map]
      .map(([value, rs]) => ({ value, label: stickers.get(value)!.label, n: rs.length, avg: mean(rs.map((r) => r.scores.final)) }))
      .sort((a, b) => b.n - a.n || collator.compare(a.label, b.label));
  };
  const favor = bonusOf('favor');
  const contra = bonusOf('contra');
  const allBonuses = list.flatMap((r) => r.bonuses);
  const mostB = [...list].filter((r) => r.bonuses.length).sort((a, b) => b.bonuses.length - a.bonuses.length || byName(a, b))[0];
  const customSet = new Set(allBonuses.filter((b) => !isCatalogBonus(kind, b.id)).map((b) => `${b.kind}:${fold(b.label)}`));
  const topCards = list.filter((r) => shownFinal(r) >= 9);
  const inTop = topCards.length ? tallyBonus(topCards, stickers) : null;

  // ----- cartolinas e papelaria -----
  const stocks = tally(list, (r) => pinningFor(r.id, r.stock).stock, (s) => STOCK_LABEL[s]);
  const lucky = [...stocks].filter((s) => s.n >= 2).sort((a, b) => b.avg! - a.avg! || b.n - a.n)[0] ?? null;
  const decoratedOf = (r: Review) => !!(r.pattern || r.scribble || r.damage || r.stain || r.decor);

  return {
    kind,
    count: n,
    revisits: sessions.filter((r) => r.revisitOf).length,
    average: mean(finalsRaw),
    median: quantile(finals, 0.5),
    spread: stdev(finalsRaw),
    p10: quantile(finals, 0.1),
    p25: quantile(finals, 0.25),
    p75: quantile(finals, 0.75),
    p90: quantile(finals, 0.9),
    finals,
    best: byScoreDesc[0] ? { review: byScoreDesc[0], value: shownFinal(byScoreDesc[0]) } : null,
    worst: byScoreAsc[0] ? { review: byScoreAsc[0], value: shownFinal(byScoreAsc[0]) } : null,
    top: byScoreDesc.slice(0, 5),
    bottom: n >= 6 ? byScoreAsc.slice(0, 5) : [],
    histogram,
    repeated: repeatedTop && repeatedTop[1] >= 2 ? { value: repeatedTop[0], n: repeatedTop[1] } : null,
    tens: finals.filter((v) => v >= 10).length,
    below4: finals.filter((v) => v < 4).length,
    categories,
    driver,
    bonusShift: shifts.length
      ? {
          n: shifts.length,
          avg: mean(shifts.map((s) => s.value))!,
          up: shiftUp && shiftUp.value > 0 ? shiftUp : null,
          down: shiftDown && shiftDown.value < 0 ? shiftDown : null,
        }
      : null,
    overrides: {
      n: overrides.length,
      avg: mean(overrides.map((o) => o.value)) ?? 0,
      biggest: [...overrides].sort((a, b) => Math.abs(b.value) - Math.abs(a.value))[0] ?? null,
    },
    byYear,
    calendar,
    calendarMax,
    weekdays,
    weekdayKnown: dated.length,
    dayParts,
    hours,
    first: chrono[0] ?? null,
    last: chrono.at(-1) ?? null,
    busiestMonth: busiestMonth && busiestMonth.n > 0 ? busiestMonth : null,
    busiestYear: busiestYear && busiestYear.n > 0 ? busiestYear : null,
    perMonth: monthsSpan ? sessions.filter((r) => monthOf(r) !== null).length / monthsSpan : null,
    monthsSpan,
    longestGap,
    monthStreak: {
      best,
      bestEnd: bestEnd === null ? null : `${monthName((bestEnd % 12) + 1)} ${Math.floor(bestEnd / 12)}`,
    },
    retro,
    precision,
    busiestDay: busiestDayEntry && busiestDayEntry[1].length >= 2 ? { day: busiestDayEntry[0], reviews: busiestDayEntry[1] } : null,
    drift,
    statuses,
    finishRate,
    difficulties,
    amount,
    release: {
      n: released.length,
      byDecade,
      oldest: oldestR ? { review: oldestR, value: releaseOf(oldestR)! } : null,
      newest: newestR ? { review: newestR, value: releaseOf(newestR)! } : null,
      lag: mean(lags),
      fresh: lags.filter((v) => v === 0).length,
      topYear: topRel && topRel[1] >= 2 ? { year: topRel[0], n: topRel[1] } : null,
    },
    text: {
      withText: texted.length,
      words,
      avgWords: texted.length ? words / texted.length : null,
      longest: [...texted].sort((a, b) => b.value - a.value)[0] ?? null,
      shortest: texted.length >= 2 ? [...texted].sort((a, b) => a.value - b.value)[0] : null,
    },
    verdicts,
    noVerdict: list.filter((r) => !r.verdict).length,
    incoherent,
    bonuses: {
      favor,
      contra,
      stickers,
      withAny: list.filter((r) => r.bonuses.length).length,
      total: allBonuses.length,
      favorTotal: allBonuses.filter((b) => b.kind === 'favor').length,
      contraTotal: allBonuses.filter((b) => b.kind === 'contra').length,
      perCard: n ? allBonuses.length / n : null,
      most: mostB ? { review: mostB, value: mostB.bonuses.length } : null,
      custom: customSet.size,
      inTop,
    },
    stocks,
    lucky,
    papers: tally(list, (r) => (r.paper && r.paper !== 'cartolina' ? r.paper : null), (p) => PAPER_LABEL[p as keyof typeof PAPER_LABEL]),
    patterns: tally(list, (r) => r.pattern ?? null, (p) => PATTERN_LABEL[p as keyof typeof PATTERN_LABEL]),
    scribbles: tally(list, (r) => r.scribble ?? null, (p) => SCRIBBLE_LABEL[p as keyof typeof SCRIBBLE_LABEL]),
    damages: tally(list, (r) => r.damage ?? null, (p) => DAMAGE_LABEL[p as keyof typeof DAMAGE_LABEL]),
    stains: tally(list, (r) => r.stain ?? null, (p) => STAIN_LABEL[p as keyof typeof STAIN_LABEL]),
    decors: tally(list, (r) => r.decor ?? null, (p) => DECOR_LABEL[p as keyof typeof DECOR_LABEL]),
    decorated: list.filter(decoratedOf).length,
    dressing: (
      [
        ['lisa', 'Lisas', (r: Review) => !decoratedOf(r) && (!r.paper || r.paper === 'cartolina')],
        ['papel', 'Papel especial', (r: Review) => !!r.paper && r.paper !== 'cartolina'],
        ['estampa', 'Com estampa', (r: Review) => !!r.pattern],
        ['rabisco', 'Com rabisco', (r: Review) => !!r.scribble],
        ['estrago', 'Com estrago', (r: Review) => !!r.damage],
        ['mancha', 'Com mancha', (r: Review) => !!r.stain],
        ['decoracao', 'Com decoração', (r: Review) => !!r.decor],
      ] as const
    )
      .map(([value, label, test]) => {
        const rs = list.filter(test);
        return { value, label, n: rs.length, avg: mean(rs.map((r) => r.scores.final)) };
      })
      .filter((d) => d.n > 0),
    covers: {
      missing: list.filter((r) => !r.game.coverUrl).length,
      sources: tally(list, (r) => r.game.source, (s) => SOURCE_LABEL[s]),
    },
    franchises: franchisesOf(list),
    authors: tally(list, (r) => r.game.by?.trim() || null, (a) => a).filter((a) => a.n >= 2),
    initials: initialsOf(list),
    longestName: [...list].sort((a, b) => b.game.name.length - a.game.name.length || byName(a, b))[0] ?? null,
    shortestName: [...list].sort((a, b) => a.game.name.length - b.game.name.length || byName(a, b))[0] ?? null,
    createdFirst: [...list].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0] ?? null,
  };
}

/** O bônus a favor mais colado num grupo de fichas (só se aparece pelo menos duas vezes). */
function tallyBonus(list: readonly Review[], stickers: Map<string, Bonus>): Count<string> | null {
  const map = new Map<string, number>();
  for (const r of list)
    for (const b of r.bonuses) {
      if (b.kind !== 'favor') continue;
      const key = `favor:${fold(b.label)}`;
      map.set(key, (map.get(key) ?? 0) + 1);
    }
  const [key, n] = [...map].sort((a, b) => b[1] - a[1] || a[0].localeCompare(b[0]))[0] ?? [];
  return key && n >= 2 ? { value: key, label: stickers.get(key)?.label ?? key, n, avg: null } : null;
}

/** As letras iniciais, de A a Z (e # para número), todas, mesmo as que ninguém usou. */
function initialsOf(list: readonly Review[]): { letter: string; n: number }[] {
  const map = new Map<string, number>();
  for (const r of list) {
    const c = fold(r.game.name.replace(/^(the|o|a|os|as)\s+/i, '').trim()).charAt(0).toUpperCase();
    const k = /[A-Z]/.test(c) ? c : '#';
    map.set(k, (map.get(k) ?? 0) + 1);
  }
  return ['#', ...'ABCDEFGHIJKLMNOPQRSTUVWXYZ'].map((letter) => ({ letter, n: map.get(letter) ?? 0 }));
}

// ======================= fila e wishlist =======================

export interface QueueStats {
  drafts: number;
  oldestDraft: { draft: Draft; days: number } | null;
  wishes: number;
  byRelevance: Record<Relevance, number>;
  oldestWish: { wish: Wish; days: number } | null;
  /** Fichas por mês nos últimos 12 meses (pelo dia em que foram pregadas). */
  pace: number;
  /** No ritmo atual, quantos meses para a wishlist acabar. */
  monthsToClear: number | null;
}

export function queueStats(reviews: readonly Review[], drafts: readonly Draft[], wishes: readonly Wish[], now = new Date()): QueueStats {
  const age = (iso: string) => Math.max(0, Math.floor((now.getTime() - Date.parse(iso)) / DAY_MS));
  const oldestD = [...drafts].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const oldestW = [...wishes].sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
  const yearAgo = now.getTime() - 365 * DAY_MS;
  const recent = reviews.filter((r) => {
    const t = Date.parse(r.createdAt);
    return !Number.isNaN(t) && t >= yearAgo && t <= now.getTime();
  }).length;
  const pace = recent / 12;
  const byRelevance = { must: 0, comum: 0, later: 0 } as Record<Relevance, number>;
  for (const w of wishes) byRelevance[relevanceOf(w)]++;
  return {
    drafts: drafts.length,
    oldestDraft: oldestD ? { draft: oldestD, days: age(oldestD.createdAt) } : null,
    wishes: wishes.length,
    byRelevance,
    oldestWish: oldestW ? { wish: oldestW, days: age(oldestW.createdAt) } : null,
    pace,
    monthsToClear: wishes.length && pace > 0 ? Math.ceil(wishes.length / pace) : null,
  };
}

// ======================= o perfil em frases =======================

const one = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/**
 * O retrato em frases, tirado só dos números: "Você é exigente…", "Dá as maiores notas para Visual…".
 * Cada frase só aparece quando há fichas suficientes para ela não ser chute.
 */
export function portraitLines(s: WallStats, profile: KindProfile, who: { you: boolean; name: string }): string[] {
  const out: string[] = [];
  if (s.count < 3) return out;
  const subj = who.you ? 'Você' : who.name;
  const pl = profile.plural;
  const avg = s.average!;
  if (avg >= 8) out.push(`${subj} é de coração mole: a média do mural é ${one.format(avg)}, e quase tudo passa de ano.`);
  else if (avg >= 6.8) out.push(`Nas notas, ${subj.toLowerCase() === 'você' ? 'você fica' : subj + ' fica'} no meio-termo: a média do mural é ${one.format(avg)}.`);
  else out.push(`${subj} é exigente: a média do mural é ${one.format(avg)}, e um 8 ali vale ouro.`);

  if (s.spread !== null && s.p25 !== null && s.p75 !== null) {
    if (s.spread < 1) out.push(`As notas mudam pouco: metade fica entre ${one.format(s.p25)} e ${one.format(s.p75)}.`);
    else if (s.spread > 2) out.push(`As notas vão de um extremo ao outro: ${one.format(s.worst!.value)} até ${one.format(s.best!.value)}.`);
  }

  const cats = s.categories.filter((c) => c.avg !== null && c.n >= 3);
  if (cats.length >= 2) {
    const hi = [...cats].sort((a, b) => b.avg! - a.avg!)[0];
    const lo = [...cats].sort((a, b) => a.avg! - b.avg!)[0];
    if (hi.avg! - lo.avg! >= 0.4)
      out.push(`Dá as maiores notas para ${hi.label} (${one.format(hi.avg!)}) e as menores para ${lo.label} (${one.format(lo.avg!)}).`);
  }
  if (s.driver && strength(s.driver.corr) === 'forte') out.push(`É ${s.driver.label} que mais decide a Média: quando ela sobe, a Média vai junto.`);

  if (s.finishRate !== null) {
    const largados = s.statuses.find((x) => x.value === 'incompleto')!;
    if (s.finishRate >= 90) out.push(`Termina quase tudo o que começa (${s.finishRate}%).`);
    else if (s.finishRate <= 60) out.push(`Larga muita coisa no meio: ${largados.n} de ${s.count} ficaram como ${profile.status.incompleto.toLowerCase()}.`);
  }

  const fav = [...s.verdicts].sort((a, b) => b.n - a.n)[0];
  if (fav && fav.n >= 2) out.push(`O carimbo que mais usa é ${fav.label} (${fav.n} ${fav.n === 1 ? 'vez' : 'vezes'}).`);

  const bf = s.bonuses.favor[0];
  const bc = s.bonuses.contra[0];
  if (bf && bf.n >= 2) out.push(`O que mais conquista: “${bf.label}” (${bf.n}×).`);
  if (bc && bc.n >= 2) out.push(`O que mais irrita: “${bc.label}” (${bc.n}×).`);

  if (s.busiestMonth && s.busiestMonth.n >= 3)
    out.push(`O mês mais animado foi ${monthLong(s.busiestMonth.month)} de ${s.busiestMonth.year}, com ${s.busiestMonth.n} ${pl}.`);

  const part = [...s.dayParts].sort((a, b) => b.n - a.n)[0];
  if (part && part.n >= 3 && part.n / s.count >= 0.4) out.push(`Prega as fichas mais de ${part.label.toLowerCase()}.`);

  if (s.drift && Math.abs(s.drift.after - s.drift.before) >= 0.5)
    out.push(
      s.drift.after < s.drift.before
        ? `As notas caíram com o tempo: as ${s.drift.split} ${pl} mais recentes têm média ${one.format(s.drift.after)}, contra ${one.format(s.drift.before)} das primeiras.`
        : `As notas subiram com o tempo: as ${s.drift.split} ${pl} mais recentes têm média ${one.format(s.drift.after)}, contra ${one.format(s.drift.before)} das primeiras.`,
    );

  if (s.lucky && s.stocks.length >= 3) out.push(`A cartolina da sorte é ${s.lucky.label.toLowerCase()}: as fichas nela têm média ${one.format(s.lucky.avg!)}.`);

  if (s.franchises[0] && s.franchises[0].reviews.length >= 3)
    out.push(`A franquia do coração é ${s.franchises[0].name}, com ${s.franchises[0].reviews.length} ${pl} no mural.`);

  return out;
}

