import { DAY_MS, localDay } from './dates';

/**
 * O FSRS-6, o algoritmo de repetição espaçada do Anki de hoje (PLANO-ESTUDOS.md, seção 5): decide quando
 * cada carta volta. Guarda em cada carta a **estabilidade** S (em quantos dias a chance de lembrar cai de
 * 100% para 90%) e a **dificuldade** D (de 1 a 10), e calcula a **chance de lembrar** R no dia da revisão.
 *
 * As contas são as do py-fsrs (a biblioteca de referência do FSRS), com os 21 parâmetros padrão, sem o
 * otimizador; `fsrs.spec.ts` confere passo a passo contra uma tabela tirada dele. A única diferença de
 * propósito é o dia: aqui o dia de estudo vira às 4h da manhã, como no Anki (`studyDay`), e a carta em
 * revisão vence no começo do dia dela, não na hora exata da última resposta.
 *
 * As notas do FSRS são 1 (Again), 2 (Hard), 3 (Good) e 4 (Easy). Os Estudos só usam duas: Errei é 1 e
 * Acertei é 3 (D11).
 *
 * Tudo puro: sem Angular, sem relógio (quem chama passa a hora).
 */

/** Os parâmetros padrão do FSRS-6 (os do py-fsrs). */
export const FSRS_W: readonly number[] = [
  0.212, 1.2931, 2.3065, 8.2956, 6.4133, 0.8334, 3.0194, 0.001, 1.8722, 0.1666, 0.796, 1.4835, 0.0614, 0.2629, 1.6483, 0.6014, 1.8729,
  0.5425, 0.0912, 0.0658, 0.1542,
];

export type Grade = 1 | 2 | 3 | 4;
export const AGAIN: Grade = 1;
export const GOOD: Grade = 3;

const W = FSRS_W;
const DECAY = -W[20];
const FACTOR = 0.9 ** (1 / DECAY) - 1;
const S_MIN = 0.001;
const D_MIN = 1;
const D_MAX = 10;

/** Onde a carta está: nunca respondida, nos passos do dia, em revisão, ou reaprendendo depois de errar. */
export type SrsState = 'nova' | 'aprendendo' | 'revisao' | 'reaprendendo';

export interface Srs {
  state: SrsState;
  /** O passo de aprendizado em que está (só em aprendendo e reaprendendo). */
  step: number;
  /** Estabilidade, em dias (0 na nova). */
  s: number;
  /** Dificuldade, de 1 a 10 (0 na nova). */
  d: number;
  /** Quando volta (ISO). Na nova, quando entrou. */
  due: string;
  /** A última resposta (ISO). */
  last: string | null;
  /** Quantas respostas: a semente do sorteio do intervalo. */
  reps: number;
}

export interface FsrsConfig {
  /** A retenção desejada, de 0,8 a 0,95 (D7). */
  retention: number;
  /** Os passos de aprendizado, em minutos. */
  learning: readonly number[];
  /** Os passos de reaprendizado, em minutos. */
  relearning: readonly number[];
  maxInterval: number;
  /** O sorteio do intervalo (o "fuzz" do Anki), para as cartas do mesmo dia não voltarem todas juntas. */
  fuzz: boolean;
}

/** O padrão do Anki e do py-fsrs: passos de 1 e 10 minutos, reaprender em 10, 90%. */
export const DEFAULT_FSRS: FsrsConfig = { retention: 0.9, learning: [1, 10], relearning: [10], maxInterval: 36500, fuzz: true };

/** A hora em que o dia de estudo vira (como o "o próximo dia começa às" do Anki). */
export const DAY_TURNS_AT = 4;

/** O dia de estudo de uma hora: até as 4h da manhã ainda é o dia de antes ('AAAA-MM-DD', fuso local). */
export function studyDay(at: Date): string {
  return localDay(new Date(at.getTime() - DAY_TURNS_AT * 3_600_000));
}

/** Quantos dias de estudo de um dia ao outro (sem o pulo do horário de verão). */
export function daysBetween(from: string, to: string): number {
  return Math.round((dayUtc(to) - dayUtc(from)) / DAY_MS);
}

function dayUtc(day: string): number {
  const [y, m, d] = day.split('-').map(Number);
  return Date.UTC(y, m - 1, d);
}

/** O começo de um dia de estudo: as 4h da manhã, no fuso local. */
export function dayStart(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d, DAY_TURNS_AT);
}

/** O dia de estudo `n` dias depois. */
export function addStudyDays(day: string, n: number): string {
  const [y, m, d] = day.split('-').map(Number);
  return localDay(new Date(y, m - 1, d + n, 12));
}

const clampD = (d: number) => Math.min(D_MAX, Math.max(D_MIN, d));
const clampS = (s: number) => Math.max(S_MIN, s);

/** O arredondamento do Python (o meio vai para o par): `round(2.5)` é 2, como no py-fsrs. */
export function roundHalfEven(x: number): number {
  const r = Math.round(x);
  return Math.abs(x % 1) === 0.5 && r % 2 !== 0 ? r - 1 : r;
}

/** A chance de lembrar depois de `t` dias com estabilidade `s`. */
export function retrievability(t: number, s: number): number {
  if (s <= 0) return 0;
  return (1 + (FACTOR * Math.max(0, t)) / s) ** DECAY;
}

/** Em quantos dias a chance de lembrar cai até a retenção desejada (de 1 até o máximo). */
export function nextInterval(s: number, retention: number, max = DEFAULT_FSRS.maxInterval): number {
  const days = roundHalfEven((s / FACTOR) * (retention ** (1 / DECAY) - 1));
  return Math.min(max, Math.max(1, days));
}

export function initStability(g: Grade): number {
  return clampS(W[g - 1]);
}

function rawInitDifficulty(g: Grade): number {
  return W[4] - Math.exp(W[5] * (g - 1)) + 1;
}

export function initDifficulty(g: Grade): number {
  return clampD(rawInitDifficulty(g));
}

export function nextDifficulty(d: number, g: Grade): number {
  const delta = -W[6] * (g - 3);
  const damped = d + ((10 - d) * delta) / 9;
  return clampD(W[7] * rawInitDifficulty(4) + (1 - W[7]) * damped);
}

/** A estabilidade depois de lembrar (Hard, Good ou Easy) numa revisão de outro dia. */
export function recallStability(d: number, s: number, r: number, g: Grade): number {
  const hard = g === 2 ? W[15] : 1;
  const easy = g === 4 ? W[16] : 1;
  return clampS(s * (1 + Math.exp(W[8]) * (11 - d) * s ** -W[9] * (Math.exp((1 - r) * W[10]) - 1) * hard * easy));
}

/** A estabilidade depois de esquecer numa revisão de outro dia. */
export function forgetStability(d: number, s: number, r: number): number {
  const long = W[11] * d ** -W[12] * ((s + 1) ** W[13] - 1) * Math.exp((1 - r) * W[14]);
  const short = s / Math.exp(W[17] * W[18]);
  return clampS(Math.min(long, short));
}

/** A estabilidade numa resposta do mesmo dia (os passos de aprendizado). */
export function shortTermStability(s: number, g: Grade): number {
  let inc = Math.exp(W[17] * (g - 3 + W[18])) * s ** -W[19];
  if (g >= 2) inc = Math.max(inc, 1);
  return clampS(s * inc);
}

/** Uma carta que nunca foi respondida, entrando agora. */
export function freshSrs(at: string): Srs {
  return { state: 'nova', step: 0, s: 0, d: 0, due: at, last: null, reps: 0 };
}

/** Um número de 0 a 1 que sai sempre igual da mesma semente (o mesmo intervalo em todo aparelho). */
export function seededRandom(seed: string): number {
  let h = 0x811c9dc5;
  for (let i = 0; i < seed.length; i++) h = Math.imul(h ^ seed.charCodeAt(i), 0x01000193);
  // mulberry32, um passo
  let t = (h += 0x6d2b79f5);
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** As faixas do sorteio do py-fsrs: quanto mais longe, menos ele mexe. */
const FUZZ_RANGES = [
  { start: 2.5, end: 7, factor: 0.15 },
  { start: 7, end: 20, factor: 0.1 },
  { start: 20, end: Infinity, factor: 0.05 },
];

/** O intervalo sorteado em volta do calculado, como o py-fsrs: só a partir de 2,5 dias, nunca menos de 2. */
export function fuzzedInterval(days: number, max: number, random: number): number {
  if (days < 2.5) return days;
  let delta = 1;
  for (const r of FUZZ_RANGES) delta += r.factor * Math.max(Math.min(days, r.end) - r.start, 0);
  let lo = roundHalfEven(days - delta);
  let hi = roundHalfEven(days + delta);
  lo = Math.max(2, lo);
  hi = Math.min(hi, max);
  lo = Math.min(lo, hi);
  return Math.min(roundHalfEven(Math.floor(random * (hi - lo + 1)) + lo), max);
}

/** Quanto falta (em minutos) no passo de aprendizado, pelas regras do py-fsrs para Hard. */
function hardStep(steps: readonly number[], step: number): number {
  if (step === 0 && steps.length === 1) return steps[0] * 1.5;
  if (step === 0 && steps.length >= 2) return (steps[0] + steps[1]) / 2;
  return steps[step];
}

/**
 * A carta depois de uma resposta, às `now`. `seed` (o id da anotação) faz o sorteio do intervalo sair
 * igual em todo aparelho. Devolve uma carta nova; a de antes não muda.
 */
export function review(card: Srs, g: Grade, now: Date, cfg: FsrsConfig = DEFAULT_FSRS, seed = ''): Srs {
  const today = studyDay(now);
  const elapsed = card.last ? Math.max(0, daysBetween(studyDay(new Date(card.last)), today)) : 0;
  const sameDay = !!card.last && elapsed < 1;
  let { s, d } = card;
  if (card.state === 'nova') {
    s = initStability(g);
    d = initDifficulty(g);
  } else {
    if (sameDay) s = shortTermStability(s, g);
    else {
      const r = retrievability(elapsed, s);
      s = g === 1 ? forgetStability(d, s, r) : recallStability(d, s, r, g);
    }
    d = nextDifficulty(d, g);
  }
  const reps = card.reps + 1;
  const at = now.toISOString();
  const minutes = (m: number) => new Date(now.getTime() + m * 60_000).toISOString();
  const graduate = (): Srs => {
    let days = nextInterval(s, cfg.retention, cfg.maxInterval);
    if (cfg.fuzz) days = fuzzedInterval(days, cfg.maxInterval, seededRandom(`${seed}:${reps}`));
    return { state: 'revisao', step: 0, s, d, due: dayStart(addStudyDays(today, days)).toISOString(), last: at, reps };
  };
  const stepping = (state: 'aprendendo' | 'reaprendendo', steps: readonly number[], step: number): Srs => {
    if (!steps.length || (step >= steps.length && g >= 2)) return graduate();
    if (g === 1) return { state, step: 0, s, d, due: minutes(steps[0]), last: at, reps };
    if (g === 2) return { state, step, s, d, due: minutes(hardStep(steps, step)), last: at, reps };
    if (g === 4 || step + 1 >= steps.length) return graduate();
    return { state, step: step + 1, s, d, due: minutes(steps[step + 1]), last: at, reps };
  };
  switch (card.state) {
    case 'nova':
      return stepping('aprendendo', cfg.learning, 0);
    case 'aprendendo':
      return stepping('aprendendo', cfg.learning, card.step);
    case 'reaprendendo':
      return stepping('reaprendendo', cfg.relearning, card.step);
    case 'revisao':
      if (g === 1 && cfg.relearning.length) return { state: 'reaprendendo', step: 0, s, d, due: minutes(cfg.relearning[0]), last: at, reps };
      return graduate();
  }
}

/** A chance de lembrar agora (0 na carta que nunca foi respondida). */
export function recallNow(card: Srs, now: Date): number {
  if (card.state === 'nova' || !card.last) return 0;
  return retrievability(Math.max(0, daysBetween(studyDay(new Date(card.last)), studyDay(now))), card.s);
}
