import { previousDay } from './muraldle';

const KEY = 'mural-de-jogos:muraldle:v1';

/** O jogo do dia de um mural e dono ("jogos|eu"): a secreta, os chutes e como acabou. */
export interface DailyGame {
  day: string;
  secretId: string;
  /** Os ids chutados, na ordem. */
  guesses: string[];
  done: 'acertou' | 'desistiu' | null;
}

/** As contas de um mural e dono: quantos jogou, quantos acertou e a sequência de dias. */
export interface DailyStats {
  played: number;
  won: number;
  streak: number;
  best: number;
  /** O último dia acertado (para a sequência). */
  lastWon: string | null;
  /** As secretas dos últimos dias, para não repetir logo. */
  recent: string[];
}

interface Stored {
  games: Record<string, DailyGame>;
  stats: Record<string, DailyStats>;
}

const EMPTY_STATS: DailyStats = { played: 0, won: 0, streak: 0, best: 0, lastWon: null, recent: [] };

function read(): Stored {
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? '{}');
    return {
      games: raw && typeof raw.games === 'object' && raw.games ? raw.games : {},
      stats: raw && typeof raw.stats === 'object' && raw.stats ? raw.stats : {},
    };
  } catch {
    return { games: {}, stats: {} };
  }
}

function write(s: Stored): void {
  try {
    localStorage.setItem(KEY, JSON.stringify(s));
  } catch {
    /* sem armazenamento: vale até recarregar */
  }
}

export function loadDaily(slot: string): DailyGame | null {
  const g = read().games[slot];
  if (!g || typeof g.day !== 'string' || typeof g.secretId !== 'string' || !Array.isArray(g.guesses)) return null;
  return { day: g.day, secretId: g.secretId, guesses: g.guesses.filter((x) => typeof x === 'string'), done: g.done ?? null };
}

export function saveDaily(slot: string, game: DailyGame): void {
  const s = read();
  s.games[slot] = game;
  write(s);
}

/** As contas, com a sequência zerada se o último acerto foi antes de ontem. */
export function loadStats(slot: string, today: string): DailyStats {
  const st = { ...EMPTY_STATS, ...(read().stats[slot] ?? {}) };
  if (st.lastWon !== today && st.lastWon !== previousDay(today)) st.streak = 0;
  return st;
}

/** Fecha o dia: conta a partida, e o acerto entra na sequência. */
export function finishDay(slot: string, day: string, secretId: string, won: boolean): DailyStats {
  const s = read();
  const st: DailyStats = { ...EMPTY_STATS, ...(s.stats[slot] ?? {}) };
  st.played++;
  if (won) {
    st.won++;
    st.streak = st.lastWon === previousDay(day) ? st.streak + 1 : 1;
    st.best = Math.max(st.best, st.streak);
    st.lastWon = day;
  } else {
    st.streak = 0;
  }
  st.recent = [secretId, ...st.recent.filter((id) => id !== secretId)].slice(0, 14);
  s.stats[slot] = st;
  write(s);
  return st;
}
