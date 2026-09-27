export type Status = 'incompleto' | 'finalizado' | 'platinado';

export type Difficulty = 'nenhuma' | 'facil' | 'media' | 'dificil' | 'impossivel';

export type Verdict = 'masterpiece' | 'recomendo' | 'legalzinho' | 'meh' | 'chato';

export type Stock = 'rosa' | 'amarelo' | 'verde' | 'laranja' | 'azul' | 'lilas';

/** Ordem do rodízio de cartolinas: vizinhas nunca repetem cor e as seis aparecem. */
export const STOCKS: readonly Stock[] = ['rosa', 'verde', 'amarelo', 'azul', 'laranja', 'lilas'];

/** As notas que a pessoa dá. */
export type RatedKey = 'historia' | 'diversao' | 'jogabilidade' | 'visual';

/** 'final' é a média ponderada das notas dadas, nunca digitada. */
export type ScoreKey = 'final' | RatedKey;

/** Quanto cada categoria conta para a média desta resenha. 'nao-tem' tira a categoria da conta. */
export type Weight = 'nao-tem' | 'pouco' | 'normal' | 'relevante';

export type Weights = Partial<Record<RatedKey, Weight>>;

export const WEIGHTS: readonly Weight[] = ['relevante', 'normal', 'pouco', 'nao-tem'];

export const WEIGHT_LABEL: Record<Weight, string> = {
  relevante: 'Relevante',
  normal: 'Normal',
  pouco: 'Pouco importante',
  'nao-tem': 'Não tem',
};

/** Multiplicador sobre o peso-base da categoria. */
export const WEIGHT_FACTOR: Record<Weight, number> = {
  relevante: 2,
  normal: 1,
  pouco: 0.5,
  'nao-tem': 0,
};

/** Notas de 0 a 10. `final` é calculada por `computeFinal` e guardada com uma casa decimal. */
export interface Scores {
  final: number;
  historia: number | null;
  diversao: number | null;
  jogabilidade: number | null;
  visual: number | null;
}

export type GameSource = 'wikipedia' | 'rawg' | 'manual';

export interface PickedGame {
  name: string;
  coverUrl: string | null;
  source: GameSource;
  sourceId?: string;
  year?: string;
}

export interface Review {
  id: string;
  game: PickedGame;
  scores: Scores;
  status: Status;
  difficulty: Difficulty;
  /** O carimbo de veredito; opcional. */
  verdict: Verdict | null;
  /** Peso de cada categoria nesta resenha; ausente = normal. */
  weights: Weights;
  /** Horas jogadas; opcional. */
  hoursPlayed: number | null;
  /** Cor da cartolina, escolhida uma vez quando a ficha é criada. */
  stock?: Stock;
  text: string;
  /** Dia em que o jogo foi concluído (ou jogado pela última vez), 'AAAA-MM-DD'. Editável para cadastros antigos. */
  completedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** Jogo guardado para resenhar depois: só nome e capa, fora do mural. */
export interface Draft {
  id: string;
  game: PickedGame;
  createdAt: string;
  updatedAt: string;
}

export const STATUSES: readonly Status[] = ['incompleto', 'finalizado', 'platinado'];

export const STATUS_LABEL: Record<Status, string> = {
  incompleto: 'Incompleto',
  finalizado: 'Finalizado',
  platinado: 'Platinado',
};

export const STATUS_RANK: Record<Status, number> = { incompleto: 1, finalizado: 2, platinado: 3 };

export const DIFFICULTIES: readonly Difficulty[] = ['nenhuma', 'facil', 'media', 'dificil', 'impossivel'];

export const DIFFICULTY_LABEL: Record<Difficulty, string> = {
  nenhuma: 'Nenhuma',
  facil: 'Fácil',
  media: 'Média',
  dificil: 'Difícil',
  impossivel: 'Impossível',
};

/** Quantas caveirinhas cada dificuldade ganha na ficha. */
export const DIFFICULTY_SKULLS: Record<Difficulty, number> = {
  nenhuma: 0,
  facil: 1,
  media: 2,
  dificil: 3,
  impossivel: 4,
};

export const RATED_KEYS: readonly RatedKey[] = ['historia', 'diversao', 'jogabilidade', 'visual'];

export const VERDICTS: readonly Verdict[] = ['masterpiece', 'recomendo', 'legalzinho', 'meh', 'chato'];

export const VERDICT_LABEL: Record<Verdict, string> = {
  masterpiece: 'Masterpiece',
  recomendo: 'Recomendo',
  legalzinho: 'Legalzinho',
  meh: 'Meh',
  chato: 'Chato',
};

export const SCORE_KEYS: readonly ScoreKey[] = ['final', ...RATED_KEYS];

/** Diversão pesa o dobro na média. */
export const SCORE_WEIGHT: Record<RatedKey, number> = {
  historia: 1,
  diversao: 2,
  jogabilidade: 1,
  visual: 1,
};

export const SCORE_LABEL: Record<ScoreKey, string> = {
  final: 'Média',
  historia: 'História',
  diversao: 'Diversão',
  jogabilidade: 'Jogabilidade',
  visual: 'Visual',
};

export const SCORE_SHORT: Record<ScoreKey, string> = {
  final: 'Média',
  historia: 'História',
  diversao: 'Diversão',
  jogabilidade: 'Jogabilidade',
  visual: 'Visual',
};

/** Rótulo de casinha no boletim da ficha. */
export const SCORE_ABBR: Record<RatedKey, string> = {
  historia: 'His',
  diversao: 'Div',
  jogabilidade: 'Jog',
  visual: 'Vis',
};

export function weightOf(weights: Weights | undefined, k: RatedKey): Weight {
  return weights?.[k] ?? 'normal';
}

/** A categoria entra na média desta resenha? */
export function counts(weights: Weights | undefined, k: RatedKey): boolean {
  return weightOf(weights, k) !== 'nao-tem';
}

/**
 * Média ponderada das notas dadas, com uma casa decimal. Diversão tem peso-base 2x; cada categoria
 * ainda pode valer o dobro (Relevante), metade (Pouco importante) ou sair da conta (Não tem).
 * Null se nenhuma nota que conta foi dada.
 */
export function computeFinal(scores: Pick<Scores, RatedKey>, weights?: Weights): number | null {
  let sum = 0;
  let weight = 0;
  for (const k of RATED_KEYS) {
    const v = scores[k];
    const w = SCORE_WEIGHT[k] * WEIGHT_FACTOR[weightOf(weights, k)];
    if (v === null || w === 0) continue;
    sum += v * w;
    weight += w;
  }
  return weight ? Math.round((sum / weight) * 10) / 10 : null;
}

const hoursFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** 42 → "42 h"; 1.5 → "1,5 h". */
export function formatHours(h: number | null): string {
  return h === null ? '' : `${hoursFmt.format(h)} h`;
}

const scoreFmt = new Intl.NumberFormat('pt-BR', { maximumFractionDigits: 1 });

/** 8.4 → "8,4"; 9 → "9". */
export function formatScore(v: number | null): string {
  return v === null ? '–' : scoreFmt.format(v);
}

/** Uma data no fuso local, 'AAAA-MM-DD'. */
export function localDay(d: Date): string {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}

/** Hoje no fuso local, 'AAAA-MM-DD'. */
export function todayISO(): string {
  return localDay(new Date());
}

/** 'AAAA-MM-DD' → Date à meia-noite local (sem o pulo de fuso de `new Date('AAAA-MM-DD')`). */
export function parseDay(day: string): Date {
  const [y, m, d] = day.split('-').map(Number);
  return new Date(y, m - 1, d);
}

export function isValidDay(v: unknown): v is string {
  if (typeof v !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(v)) return false;
  const d = parseDay(v);
  return !Number.isNaN(d.getTime()) && d.getFullYear() > 1970;
}

/** Rótulo da data conforme o status: quem não terminou só "jogou até" aquele dia. */
export function dayLabel(status: Status): string {
  return status === 'incompleto' ? 'Jogado até' : 'Concluído em';
}

export function newId(): string {
  const rand =
    typeof crypto !== 'undefined' && 'randomUUID' in crypto
      ? crypto.randomUUID().replace(/-/g, '').slice(0, 12)
      : Math.random().toString(36).slice(2, 14);
  return `r${Date.now().toString(36)}${rand}`;
}

function clampScore(v: unknown): number | null {
  if (v === null || v === undefined || v === '') return null;
  const n = Math.round(Number(v));
  if (!Number.isFinite(n)) return null;
  return Math.min(10, Math.max(0, n));
}

function str(v: unknown, max = 20000): string {
  return typeof v === 'string' ? v.slice(0, max) : '';
}

function isoOr(v: unknown, fallback: string): string {
  if (typeof v !== 'string') return fallback;
  const t = Date.parse(v);
  return Number.isNaN(t) ? fallback : new Date(t).toISOString();
}

function sanitizeGame(raw: unknown): PickedGame | null {
  const g = (raw ?? {}) as Record<string, any>;
  const name = str(g['name'], 200).trim();
  if (!name) return null;
  const cover = str(g['coverUrl'], 2000);
  const source: GameSource = ['wikipedia', 'rawg', 'manual'].includes(g['source']) ? g['source'] : 'manual';
  return {
    name,
    coverUrl: /^https:\/\//.test(cover) ? cover : null,
    source,
    sourceId: str(g['sourceId'], 100) || undefined,
    year: str(g['year'], 10) || undefined,
  };
}

function sanitizeId(v: unknown): string {
  return typeof v === 'string' && /^[\w-]{4,64}$/.test(v) ? v : newId();
}

/** Aceita um pendente vindo do localStorage ou de um backup (ou null se não serve). */
export function sanitizeDraft(raw: unknown): Draft | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const game = sanitizeGame(r['game']);
  if (!game) return null;
  const createdAt = isoOr(r['createdAt'], new Date().toISOString());
  return { id: sanitizeId(r['id']), game, createdAt, updatedAt: isoOr(r['updatedAt'], createdAt) };
}

/** Aceita dados vindos do localStorage ou de um backup e devolve uma resenha válida (ou null). */
export function sanitizeReview(raw: unknown): Review | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, any>;
  const game = sanitizeGame(r['game']);
  if (!game) return null;
  const s = (r['scores'] ?? {}) as Record<string, any>;
  const rated = {
    historia: clampScore(s['historia']),
    diversao: clampScore(s['diversao']),
    jogabilidade: clampScore(s['jogabilidade']),
    // resenhas antigas chamavam Visual de "grafico"
    visual: clampScore(s['visual'] ?? s['grafico']),
  };
  const rawWeights = (r['weights'] ?? {}) as Record<string, unknown>;
  const weights: Weights = {};
  for (const k of RATED_KEYS) {
    const w = rawWeights[k];
    if (typeof w === 'string' && (WEIGHTS as readonly string[]).includes(w) && w !== 'normal') weights[k] = w as Weight;
  }
  for (const k of RATED_KEYS) if (weights[k] === 'nao-tem') rated[k] = null;
  const hours = Number(r['hoursPlayed']);
  // A média vem das notas; resenhas antigas que só tinham a nota final mantêm a delas.
  const legacyFinal = Number(s['final']);
  const final =
    computeFinal(rated, weights) ??
    (Number.isFinite(legacyFinal) ? Math.round(Math.min(10, Math.max(0, legacyFinal)) * 10) / 10 : null);
  if (final === null) return null;
  const status: Status = STATUSES.includes(r['status']) ? r['status'] : 'finalizado';
  const difficulty: Difficulty = DIFFICULTIES.includes(r['difficulty']) ? r['difficulty'] : 'nenhuma';
  const now = new Date().toISOString();
  const createdAt = isoOr(r['createdAt'], now);
  return {
    id: sanitizeId(r['id']),
    game,
    scores: { final, ...rated },
    status,
    difficulty,
    verdict: VERDICTS.includes(r['verdict']) ? r['verdict'] : null,
    weights,
    hoursPlayed:
      r['hoursPlayed'] !== null && r['hoursPlayed'] !== undefined && r['hoursPlayed'] !== '' && Number.isFinite(hours) && hours >= 0
        ? Math.round(Math.min(hours, 99999) * 10) / 10
        : null,
    stock: STOCKS.includes(r['stock']) ? r['stock'] : undefined,
    text: str(r['text']),
    completedAt: isValidDay(r['completedAt']) ? r['completedAt'] : localDay(new Date(createdAt)),
    createdAt,
    updatedAt: isoOr(r['updatedAt'], createdAt),
  };
}

/** Normaliza texto para busca: sem acento, minúsculo. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}
