import { Affinity, affinity } from './comparison-stats';
import { compareCollections } from './comparison';
import { measuresFor } from './higher-lower';
import { Kind } from './kinds';
import { Mark, compare } from './muraldle';
import { DailyGame, DailyStats } from './muraldle-save';
import { SavedKnockout } from './knockout-save';
import { Review, formatScore, scoreOf } from './review';
import { playOut } from './tournament';

/**
 * As prévias da página de Extras (PLANO-EXTRAS.md): como cada jogo e cada número está, sem abrir. Só contas: quem
 * usa lê o que os jogos já guardam e passa aqui. Tudo do seu mural, o aberto no seletor (D1).
 */

/** Quantas fichas cada jogo pede (as mesmas das páginas dos jogos). */
export const MURALDLE_MIN = 3;
export const KNOCKOUT_MIN = 2;
export const HIGHER_LOWER_MIN = 2;

// ---------- Muraldle ----------

export interface MuraldlePreview {
  /** `pouco`: o mural não tem fichas para jogar; `novo`: a de hoje ainda não foi aberta. */
  state: 'pouco' | 'novo' | 'jogando' | 'acertou' | 'desistiu';
  guesses: number;
  /** Os dias seguidos acertados (zerada se o último acerto foi antes de ontem). */
  streak: number;
  /** O último chute de hoje, coluna a coluna (só as marcas: nada da secreta). */
  last: Mark[] | null;
}

export function muraldlePreview(pool: readonly Review[], daily: DailyGame | null, stats: DailyStats, today: string): MuraldlePreview {
  const streak = stats.streak;
  if (pool.length < MURALDLE_MIN) return { state: 'pouco', guesses: 0, streak, last: null };
  if (!daily || daily.day !== today) return { state: 'novo', guesses: 0, streak, last: null };
  const byId = new Map(pool.map((r) => [r.id, r]));
  const secret = byId.get(daily.secretId);
  const guesses = daily.guesses.filter((id) => byId.has(id));
  const lastGuess = guesses.length ? byId.get(guesses[guesses.length - 1])! : null;
  const last = secret && lastGuess ? compare(lastGuess, secret).map((c) => c.mark) : null;
  const state = daily.done === 'acertou' ? 'acertou' : daily.done === 'desistiu' ? 'desistiu' : guesses.length ? 'jogando' : 'novo';
  return { state, guesses: guesses.length, streak, last };
}

// ---------- Mata-mata ----------

export interface KnockoutPreview {
  state: 'pouco' | 'nenhum' | 'jogando' | 'acabou';
  /** A rodada da vez ("Quartas de final"). */
  round: string | null;
  /** O duelo da vez (de 1 a `total`) e quantos o torneio tem. */
  duel: number;
  total: number;
  played: number;
  /** O nome da campeã, quando acabou. */
  champion: string | null;
}

export function knockoutPreview(pool: readonly Review[], saved: SavedKnockout | null, names: (id: string) => string | undefined): KnockoutPreview {
  const none: KnockoutPreview = { state: pool.length < KNOCKOUT_MIN ? 'pouco' : 'nenhum', round: null, duel: 0, total: 0, played: 0, champion: null };
  if (!saved || !saved.slots.length) return none;
  // como a página do Mata-mata mostra o torneio guardado (os sorteios que faltam, ela faz ao continuar)
  const out = playOut(saved.slots, saved.picks, saved.draws ?? []);
  if (!out.total) return none;
  if (out.champion) return { state: 'acabou', round: null, duel: out.total, total: out.total, played: out.played, champion: names(out.champion) ?? null };
  const current = out.current;
  return {
    state: 'jogando',
    round: current ? out.rounds[current.round].name : null,
    duel: current ? current.number : out.played + 1,
    total: out.total,
    played: out.played,
    champion: null,
  };
}

// ---------- Maior ou menor ----------

export interface RecordPreview {
  state: 'pouco' | 'nenhum' | 'recorde';
  best: number;
  /** Em que se jogou o recorde ("Média", "Diversão", "Horas"). */
  measure: string | null;
}

/** O maior recorde do seu mural entre as medidas do jogo (a Média, cada nota, a quantidade). */
export function recordPreview(kind: Kind, pool: readonly Review[], record: (measure: string) => number): RecordPreview {
  if (pool.length < HIGHER_LOWER_MIN) return { state: 'pouco', best: 0, measure: null };
  let best = 0;
  let measure: string | null = null;
  for (const m of measuresFor(kind)) {
    const n = record(m.key);
    if (n > best) {
      best = n;
      measure = m.label;
    }
  }
  return best ? { state: 'recorde', best, measure } : { state: 'nenhum', best: 0, measure: null };
}

// ---------- Números ----------

export interface StatsPreview {
  count: number;
  /** A média das médias, já escrita ("7,8"); null sem fichas. */
  mean: string | null;
  /** Quantas fichas em cada nota inteira, de 0 a 10. */
  histogram: number[];
}

export function statsPreview(reviews: readonly Review[]): StatsPreview {
  const histogram = Array.from({ length: 11 }, () => 0);
  const finals = reviews.map((r) => scoreOf(r.scores, 'final')).filter((v): v is number => v !== null);
  for (const v of finals) histogram[Math.min(10, Math.max(0, Math.round(v)))]++;
  const mean = finals.length ? formatScore(finals.reduce((s, v) => s + v, 0) / finals.length) : null;
  return { count: reviews.length, mean, histogram };
}

export interface RankedPreview {
  name: string;
  score: string;
}

/** As três de maior Média (empate: a de nome primeiro, como no Ranking). */
export function podiumPreview(reviews: readonly Review[]): RankedPreview[] {
  return reviews
    .filter((r) => scoreOf(r.scores, 'final') !== null)
    .sort((a, b) => scoreOf(b.scores, 'final')! - scoreOf(a.scores, 'final')! || a.game.name.localeCompare(b.game.name, 'pt-BR'))
    .slice(0, 3)
    .map((r) => ({ name: r.game.name, score: formatScore(scoreOf(r.scores, 'final')) }));
}

export interface FriendPreview {
  id: string;
  name: string;
  /** Quanto vocês combinam no mural aberto; null sem obra em comum. */
  percent: number | null;
}

/** Os amigos abertos em Comparar (o escolhido primeiro), com quanto combinam no mural aberto; até três. */
export function friendsPreview(
  mine: readonly Review[],
  friends: readonly { id: string; name: string; reviews: readonly Review[] }[],
  chosen: string | null,
): FriendPreview[] {
  const ordered = [...friends].sort((a, b) => Number(b.id === chosen) - Number(a.id === chosen));
  return ordered.slice(0, 3).map((f) => {
    const a: Affinity | null = f.reviews.length ? affinity(compareCollections(mine, f.reviews).pairs) : null;
    return { id: f.id, name: f.name, percent: a ? a.percent : null };
  });
}
