import { localDay } from './dates';

/**
 * As regras do Pomodoro (PLANO-POMODORO.md): turnos de estudo e de pausa, contados sempre pelo relógio do
 * aparelho. O que falta é `fim − agora`, e nada conta segundos por conta própria: várias abas, e uma aba que
 * dormiu, mostram o mesmo tempo. Tudo aqui é puro (recebe o `agora`), para os testes e para o serviço
 * (core/pomodoro-store.ts), que grava e acompanha as outras abas.
 */

/** A chave do aparelho (o prefixo é o que a limpeza do logout procura, ver core/browser-reset.ts). */
export const POMODORO_KEY = 'meu-mural:pomodoro';

export type PomodoroPhase = 'estudo' | 'pausa';
export type PomodoroCorner = 'se' | 'sd' | 'ie' | 'id';

/** As skins do relógio do canto, na ordem da cartela. */
export const POMODORO_SKINS = [
  { value: 'tomate', label: 'Tomate' },
  { value: 'bilhete', label: 'Bilhete' },
  { value: 'placar', label: 'Placar' },
  { value: 'neon', label: 'Neon' },
  { value: 'lcd', label: 'Relógio de pulso' },
  { value: 'lousa', label: 'Lousa' },
  { value: 'ampulheta', label: 'Ampulheta' },
  { value: 'cassete', label: 'Cassete' },
  { value: 'vinil', label: 'Vinil' },
  { value: 'disco', label: 'Disco' },
  { value: 'dymo', label: 'Dymo' },
  { value: 'broche', label: 'Broche' },
] as const;
export type PomodoroSkin = (typeof POMODORO_SKINS)[number]['value'];

export const POMODORO_CORNERS: readonly { value: PomodoroCorner; label: string }[] = [
  { value: 'se', label: 'Em cima, à esquerda' },
  { value: 'sd', label: 'Em cima, à direita' },
  { value: 'ie', label: 'Embaixo, à esquerda' },
  { value: 'id', label: 'Embaixo, à direita' },
];

/** Os atalhos de tempo da página. */
export const POMODORO_PRESETS: readonly { study: number; rest: number; label: string }[] = [
  { study: 25, rest: 5, label: 'Clássico' },
  { study: 50, rest: 10, label: 'Longo' },
  { study: 90, rest: 20, label: 'Profundo' },
];

/** A música de quem não escolhe outra (pedido do dono): a rádio dela continua depois da primeira faixa. */
export const DEFAULT_MUSIC = 'https://www.youtube.com/watch?v=XaWjY0pGhFs&list=RDXaWjY0pGhFs&start_radio=1';

export const MIN_MINUTES = 5;
export const MAX_MINUTES = 120;
export const MINUTE_STEP = 5;
const MIN = 60_000;

/** Um trecho andado de uma fase (ms): a régua do dia (ui/pomodoro-day.ts) pinta cada um. */
export interface PomodoroRun {
  /** Quando começou. */
  a: number;
  /** Quando parou (pausou, pulou, desligou ou acabou). */
  b: number;
  f: PomodoroPhase;
}

/** Quantos trechos ficam guardados (só os de hoje; um dia inteiro de 25/5 tem 58). */
export const MAX_RUNS = 96;
/** Um trecho mais curto que isto (o pausar e continuar logo depois) não entra na régua. */
const MIN_RUN = 5000;

export interface PomodoroSave {
  v: 1;
  study: number;
  rest: number;
  skin: PomodoroSkin;
  corner: PomodoroCorner;
  /** Tocar música no estudo. */
  music: boolean;
  /**
   * O link da música única de antes da lista (BUILD 983 e antes). Só é lido, para virar o primeiro item da
   * lista (core/pomodoro-tracks.ts), e fica guardado como estava, para um site mais velho ainda tocá-lo.
   */
  musicUrl: string;
  on: boolean;
  /** A rodada de estudo: soma 1 a cada estudo que começa (a música de cada uma é sorteada uma vez). */
  session: number;
  phase: PomodoroPhase;
  /** Quando a fase começou (ms), descontadas as pausas. */
  startedAt: number;
  /** Pausado desde (ms); null: andando. */
  pausedAt: number | null;
  /** O dia do aparelho (AAAA-MM-DD) dos tomatinhos. */
  day: string;
  /** Estudos completos no dia. */
  done: number;
  /** Os trechos andados hoje, do mais velho ao mais novo (os de antes de hoje saem a cada um que fecha). */
  log: PomodoroRun[];
  /** Quando começou o trecho que está andando; null pausado ou desligado. */
  runAt: number | null;
}

export const POMODORO_DEFAULT: PomodoroSave = {
  v: 1,
  study: 25,
  rest: 5,
  skin: 'tomate',
  corner: 'id',
  music: true,
  musicUrl: '',
  on: false,
  session: 0,
  phase: 'estudo',
  startedAt: 0,
  pausedAt: null,
  day: '',
  done: 0,
  log: [],
  runAt: null,
};

/** Os minutos de um tempo: o múltiplo de 5 mais perto, de 5 a 120 (o que não é número, o padrão). */
export function clampMinutes(n: unknown, fallback = POMODORO_DEFAULT.study): number {
  if (typeof n !== 'number' || !Number.isFinite(n)) return fallback;
  return Math.min(MAX_MINUTES, Math.max(MIN_MINUTES, Math.round(n / MINUTE_STEP) * MINUTE_STEP));
}

const isSkin = (v: unknown): v is PomodoroSkin => POMODORO_SKINS.some((s) => s.value === v);
const isCorner = (v: unknown): v is PomodoroCorner => POMODORO_CORNERS.some((c) => c.value === v);
const isTime = (v: unknown): v is number => typeof v === 'number' && Number.isFinite(v) && v >= 0;

function readRuns(v: unknown): PomodoroRun[] {
  if (!Array.isArray(v)) return [];
  const out: PomodoroRun[] = [];
  for (const r of v.slice(-MAX_RUNS)) {
    if (!r || typeof r !== 'object') continue;
    const { a, b, f } = r as Partial<Record<keyof PomodoroRun, unknown>>;
    if (isTime(a) && isTime(b) && b >= a && (f === 'estudo' || f === 'pausa')) out.push({ a, b, f });
  }
  return out;
}

/** O guardado, conferido campo a campo: o que estiver estranho cai no padrão. */
export function readPomodoro(raw: unknown): PomodoroSave {
  const d = POMODORO_DEFAULT;
  if (!raw || typeof raw !== 'object') return { ...d };
  const r = raw as Partial<Record<keyof PomodoroSave, unknown>>;
  const on = r.on === true && isTime(r.startedAt);
  const pausedAt = on && isTime(r.pausedAt) ? r.pausedAt : null;
  // andando sem o começo do trecho (guardado por um site de antes da régua do dia): conta do começo da fase
  // (empurrado pelas pausas), sem passar para antes do último trecho guardado
  const running = on && pausedAt === null;
  const log = readRuns(r.log);
  return {
    v: 1,
    study: clampMinutes(r.study, d.study),
    rest: clampMinutes(r.rest, d.rest),
    skin: isSkin(r.skin) ? r.skin : d.skin,
    corner: isCorner(r.corner) ? r.corner : d.corner,
    music: typeof r.music === 'boolean' ? r.music : d.music,
    musicUrl: typeof r.musicUrl === 'string' ? r.musicUrl.trim().slice(0, 2000) : '',
    on,
    session: typeof r.session === 'number' && Number.isInteger(r.session) && r.session > 0 ? r.session : 0,
    phase: r.phase === 'pausa' ? 'pausa' : 'estudo',
    startedAt: on ? (r.startedAt as number) : 0,
    pausedAt,
    day: typeof r.day === 'string' && /^\d{4}-\d{2}-\d{2}$/.test(r.day) ? r.day : '',
    done: typeof r.done === 'number' && Number.isInteger(r.done) && r.done > 0 ? Math.min(r.done, 999) : 0,
    log,
    runAt: running ? (isTime(r.runAt) ? r.runAt : Math.max(r.startedAt as number, log.at(-1)?.b ?? 0)) : null,
  };
}

/** A meia-noite do dia do aparelho em `at`. */
export function dayStart(at: number): number {
  const d = new Date(at);
  d.setHours(0, 0, 0, 0);
  return d.getTime();
}

/** Os trechos de hoje (o que passa da meia-noite fica). */
function keepToday(log: readonly PomodoroRun[], at: number): PomodoroRun[] {
  const from = dayStart(at);
  return log.filter((r) => r.b > from).slice(-MAX_RUNS);
}

/** Fecha o trecho que está andando em `at` (o curto demais não entra). */
function closeRun(s: PomodoroSave, at: number): Pick<PomodoroSave, 'log' | 'runAt'> {
  const run: PomodoroRun[] = s.runAt !== null && at - s.runAt >= MIN_RUN ? [{ a: s.runAt, b: at, f: s.phase }] : [];
  return { log: keepToday([...s.log, ...run], at), runAt: null };
}

/** Os trechos de hoje para a régua do dia, com o que está andando até `now` (sem passar do fim da fase). */
export function todayRuns(s: PomodoroSave, now: number): PomodoroRun[] {
  const runs = keepToday(s.log, now);
  if (s.on && s.pausedAt === null && s.runAt !== null && now > s.runAt) runs.push({ a: s.runAt, b: Math.min(now, phaseEnd(s)), f: s.phase });
  return runs;
}

/** O tempo de estudo dos trechos (ms), só o de hoje (o que veio de ontem conta da meia-noite). */
export function focusMs(runs: readonly PomodoroRun[], now: number): number {
  const from = dayStart(now);
  return runs.reduce((t, r) => (r.f === 'estudo' ? t + Math.max(0, r.b - Math.max(r.a, from)) : t), 0);
}

/** A duração da fase (ms). */
export function phaseMs(s: PomodoroSave, phase: PomodoroPhase = s.phase): number {
  return (phase === 'estudo' ? s.study : s.rest) * MIN;
}

/** Quando a fase acaba (ms), contando o que ficou pausado até agora. */
export function phaseEnd(s: PomodoroSave): number {
  return s.startedAt + phaseMs(s);
}

/**
 * O que falta da fase (ms), entre zero e a fase inteira. Pausado, o tempo não anda. O teto cobre o `agora` do
 * relógio do site, que é o do último segundo: logo depois de começar, ele ainda é de antes do começo.
 */
export function remainingMs(s: PomodoroSave, now: number): number {
  return Math.min(phaseMs(s), Math.max(0, phaseEnd(s) - (s.pausedAt ?? now)));
}

/** Quanto da fase já foi, de 0 a 1. Desligado, nada. */
export function progressOf(s: PomodoroSave, now: number): number {
  if (!s.on) return 0;
  const total = phaseMs(s);
  return total > 0 ? Math.min(1, Math.max(0, 1 - remainingMs(s, now) / total)) : 0;
}

/** Os tomatinhos de hoje (zeram quando o dia do aparelho vira). */
export function doneToday(s: PomodoroSave, now: number): number {
  return s.day === localDay(new Date(now)) ? s.done : 0;
}

function countDone(s: PomodoroSave, at: number): Pick<PomodoroSave, 'day' | 'done'> {
  return { day: localDay(new Date(at)), done: doneToday(s, at) + 1 };
}

/** Liga: começa um estudo agora. */
export function start(s: PomodoroSave, now: number): PomodoroSave {
  return { ...s, on: true, session: nextSession(s), phase: 'estudo', startedAt: now, pausedAt: null, log: keepToday(s.log, now), runAt: now };
}

/** Desliga: o turno some, os ajustes, os tomatinhos e os trechos de hoje ficam. */
export function stop(s: PomodoroSave, now: number): PomodoroSave {
  return { ...s, ...closeRun(s, now), on: false, phase: 'estudo', startedAt: 0, pausedAt: null };
}

export function pause(s: PomodoroSave, now: number): PomodoroSave {
  return !s.on || s.pausedAt !== null ? s : { ...s, ...closeRun(s, now), pausedAt: now };
}

/** Continua de onde parou: o tempo pausado não conta (a fase começa mais tarde). */
export function resume(s: PomodoroSave, now: number): PomodoroSave {
  return !s.on || s.pausedAt === null ? s : { ...s, startedAt: s.startedAt + (now - s.pausedAt), pausedAt: null, runAt: now };
}

const other = (p: PomodoroPhase): PomodoroPhase => (p === 'estudo' ? 'pausa' : 'estudo');

/** A rodada do próximo estudo (o contador dá a volta bem antes de perder a conta). */
export function nextSession(s: PomodoroSave): number {
  return s.session >= 1e9 ? 1 : s.session + 1;
}

/** Pula a fase: a próxima começa agora (pular o estudo não conta tomatinho). Pausado, continua pausado. */
export function skip(s: PomodoroSave, now: number): PomodoroSave {
  if (!s.on) return s;
  const phase = other(s.phase);
  const running = s.pausedAt === null;
  return {
    ...s,
    ...(running ? { ...closeRun(s, now), runAt: now } : {}),
    phase,
    session: phase === 'estudo' ? nextSession(s) : s.session,
    startedAt: now,
    pausedAt: running ? null : now,
  };
}

/**
 * O turno no `agora`: as fases que acabaram viram as próximas, cada uma começando no fim da de antes (e não
 * agora), para duas abas que avançam juntas gravarem o mesmo. Se o Murall ficou fechado por mais de uma fase
 * inteira depois do fim, o turno não fica girando sozinho: vai para o começo do estudo, pausado.
 * Devolve o mesmo objeto quando nada mudou.
 */
export function advance(s: PomodoroSave, now: number): PomodoroSave {
  if (!s.on || s.pausedAt !== null) return s;
  const end = phaseEnd(s);
  if (now < end) return s;
  const counted = s.phase === 'estudo' ? countDone(s, end) : {};
  const phase = other(s.phase);
  // o trecho fecha no fim exato da fase (e não agora): duas abas gravam o mesmo
  const next: PomodoroSave = { ...s, ...counted, ...closeRun(s, end), runAt: end, phase, session: phase === 'estudo' ? nextSession(s) : s.session, startedAt: end };
  if (now < phaseEnd(next)) return next;
  // ficou fechado: a pausa que viria também passou (ou o estudo seguinte); para no começo de um estudo (a régua
  // fica só com a fase que acabou: o resto ninguém viu andar)
  return { ...next, runAt: null, phase: 'estudo', session: next.phase === 'estudo' ? next.session : nextSession(next), startedAt: now, pausedAt: now };
}

/**
 * Um tempo mudou com o turno andando: vale para a fase de agora, guardando o que já passou (de 25 para 30 com
 * 10 corridos, faltam 20). Se o tempo novo já passou, a fase acaba agora (e não no passado, que o `advance`
 * tomaria por Murall fechado).
 */
export function setMinutes(s: PomodoroSave, which: PomodoroPhase, minutes: number, now: number): PomodoroSave {
  const m = clampMinutes(minutes, which === 'estudo' ? s.study : s.rest);
  const next = which === 'estudo' ? { ...s, study: m } : { ...s, rest: m };
  if (!next.on || next.phase !== which) return next;
  const at = next.pausedAt ?? now;
  return phaseEnd(next) < at ? { ...next, startedAt: at - phaseMs(next) } : next;
}

/** "24:59", "120:00": os minutos podem passar de 99. Arredonda o segundo para cima (0,2 s é "0:01"). */
export function clockText(ms: number): string {
  const total = Math.ceil(Math.max(0, ms) / 1000);
  const m = Math.floor(total / 60);
  const sec = total % 60;
  return `${String(m).padStart(2, '0')}:${String(sec).padStart(2, '0')}`;
}

/** O que o leitor de tela diz (por minuto, para não falar sem parar). */
export function spokenTime(s: PomodoroSave, now: number): string {
  const min = Math.ceil(remainingMs(s, now) / MIN);
  const left = min <= 1 ? 'falta menos de um minuto' : `faltam ${min} minutos`;
  const phase = s.phase === 'estudo' ? 'Estudo' : 'Pausa';
  return s.pausedAt !== null ? `${phase} pausado: ${left}` : `${phase}: ${left}`;
}
