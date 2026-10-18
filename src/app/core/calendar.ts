import { DAY_MS, MONTHS_LONG, MONTHS_SHORT } from './dates';
import { LIGHT_STOCKS, LightStock } from './review';
import { nameCollator } from './text';

/**
 * O Calendário das anotações (`/anotacoes/calendario`): lembretes, de uma vez só ou que se repetem,
 * cada um com a cor de uma cartolina e, se quiser, anotações anexadas ("Fazer o bolo dia 23/08",
 * com a receita do bolo e a da calda presas nele por um clipe).
 *
 * Tudo aqui é puro: os dias são 'AAAA-MM-DD' e as contas são em dias inteiros (UTC), sem fuso nem
 * horário de verão no meio. O lembrete guarda o primeiro dia (`date`) e como se repete; os dias em que
 * ele aparece saem de `occursOn`. Feito e "só neste dia não" são marcas por dia (`done`, `skip`).
 *
 * Guardado neste navegador e no mural privado da nuvem (`calendario`), lembrete a lembrete: vale o
 * mudado por último, e os apagados são lembrados (ver `mergeCalendar`). Nunca no mural público nem no
 * arquivo de backup, como os quadros do Kanban.
 */

/** Como o lembrete se repete; sem nada, ele é de um dia só. */
export type Repeat = 'dia' | 'semana' | 'mes' | 'ano';
export const REPEATS: readonly Repeat[] = ['dia', 'semana', 'mes', 'ano'];

export const TITLE_MAX = 120;
/** Quantas anotações cabem num lembrete. */
export const MAX_NOTES = 12;
/** Quantos dias marcados (feitos, pulados) um lembrete guarda: os mais recentes. */
const MAX_MARKS = 500;
const MAX_REMINDERS = 3000;

export interface Reminder {
  id: string;
  title: string;
  /** O dia (o primeiro, quando se repete). */
  date: string;
  /** 'HH:MM'; sem horário, é o dia todo. */
  time?: string;
  repeat?: Repeat;
  color: LightStock;
  /** As anotações anexadas, na ordem em que foram presas. */
  notes: string[];
  /** Os dias em que ele foi feito (num lembrete de um dia só, no máximo o dele). */
  done: string[];
  /** Os dias tirados de um lembrete que se repete ("Apagar só neste dia"). */
  skip: string[];
  createdAt: string;
  /** Quando mudou por último (a junção entre aparelhos fica com o mais novo). */
  at: string;
}

export interface CalendarState {
  reminders: Reminder[];
  /** Os apagados: id → quando. Um lembrete mais velho que isso não volta de outro aparelho. */
  removed: Record<string, string>;
}

export const EMPTY_CALENDAR: CalendarState = { reminders: [], removed: {} };

// ===== Dias =====

const DAY_RE = /^(\d{4})-(\d{2})-(\d{2})$/;
const TIME_RE = /^([01]\d|2[0-3]):[0-5]\d$/;

/** Um dia de verdade, 'AAAA-MM-DD' (o 31 de fevereiro não é). */
export function isDay(v: unknown): v is string {
  const m = typeof v === 'string' ? DAY_RE.exec(v) : null;
  if (!m) return false;
  const [y, mo, d] = [Number(m[1]), Number(m[2]), Number(m[3])];
  return y >= 1000 && mo >= 1 && mo <= 12 && d >= 1 && d <= daysInMonth(y, mo);
}

export function isTime(v: unknown): v is string {
  return typeof v === 'string' && TIME_RE.test(v);
}

function parts(day: string): [number, number, number] {
  return [Number(day.slice(0, 4)), Number(day.slice(5, 7)), Number(day.slice(8, 10))];
}

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** Quantos dias tem o mês (`month` de 1 a 12). */
export function daysInMonth(year: number, month: number): number {
  return new Date(Date.UTC(year, month, 0)).getUTCDate();
}

/** O dia como número de dias desde 1970 (para contar e andar sem fuso). */
export function dayNumber(day: string): number {
  const [y, m, d] = parts(day);
  return Math.round(Date.UTC(y, m - 1, d) / DAY_MS);
}

export function dayFromNumber(n: number): string {
  const d = new Date(n * DAY_MS);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}`;
}

export function addDays(day: string, n: number): string {
  return dayFromNumber(dayNumber(day) + n);
}

/** 0 é domingo (o 1º de janeiro de 1970 foi uma quinta). */
export function weekday(day: string): number {
  return (((dayNumber(day) + 4) % 7) + 7) % 7;
}

/** O mesmo dia `n` meses depois (ou antes); o 31 vira o último dia de um mês mais curto. */
export function addMonths(day: string, n: number): string {
  const [y, m, d] = parts(day);
  const total = y * 12 + (m - 1) + n;
  const ny = Math.floor(total / 12);
  const nm = (total % 12) + 1;
  return `${ny}-${pad(nm)}-${pad(Math.min(d, daysInMonth(ny, nm)))}`;
}

/** 'AAAA-MM' do dia. */
export function monthOf(day: string): string {
  return day.slice(0, 7);
}

/** O domingo da semana do dia. */
export function startOfWeek(day: string): string {
  return addDays(day, -weekday(day));
}

/** Os sete dias da semana do dia, de domingo a sábado (a folhinha brasileira começa no domingo). */
export function weekDays(day: string): string[] {
  const first = startOfWeek(day);
  return Array.from({ length: 7 }, (_, i) => addDays(first, i));
}

/** As semanas da folha do mês ('AAAA-MM'): de domingo a sábado, com os dias de fora nas pontas. */
export function monthGrid(month: string): string[][] {
  const first = `${month}-01`;
  const [y, m] = parts(first);
  const last = `${month}-${pad(daysInMonth(y, m))}`;
  const weeks: string[][] = [];
  for (let start = startOfWeek(first); start <= last; start = addDays(start, 7)) weeks.push(weekDays(start));
  return weeks;
}

// ===== Como se escreve =====

export const WEEKDAYS_LONG: readonly string[] = ['domingo', 'segunda-feira', 'terça-feira', 'quarta-feira', 'quinta-feira', 'sexta-feira', 'sábado'];
/** As três letras impressas no alto da folhinha. */
export const WEEKDAYS_SHORT: readonly string[] = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

/** "23 de agosto de 2027". */
export function longDay(day: string): string {
  const [y, m, d] = parts(day);
  return `${d} de ${MONTHS_LONG[m - 1]} de ${y}`;
}

/** "23 de agosto". */
export function dayAndMonth(day: string): string {
  const [, m, d] = parts(day);
  return `${d} de ${MONTHS_LONG[m - 1]}`;
}

/** "outubro de 2026". */
export function monthLabel(month: string): string {
  const [y, m] = parts(`${month}-01`);
  return `${MONTHS_LONG[m - 1]} de ${y}`;
}

/** A semana, curta: "18 a 24 de outubro de 2026", "27 de set. a 3 de out. de 2026", "28 de dez. de 2026 a 3 de jan. de 2027". */
export function weekLabel(day: string): string {
  const days = weekDays(day);
  const [ay, am, ad] = parts(days[0]);
  const [by, bm, bd] = parts(days[6]);
  if (ay !== by) return `${ad} de ${MONTHS_SHORT[am - 1]}. de ${ay} a ${bd} de ${MONTHS_SHORT[bm - 1]}. de ${by}`;
  if (am !== bm) return `${ad} de ${MONTHS_SHORT[am - 1]}. a ${bd} de ${MONTHS_SHORT[bm - 1]}. de ${by}`;
  return `${ad} a ${bd} de ${MONTHS_LONG[am - 1]} de ${by}`;
}

/** O horário como o site escreve: "9h", "9h30", "21h05". */
export function timeLabel(time: string): string {
  const [h, m] = time.split(':').map(Number);
  return m ? `${h}h${pad(m)}` : `${h}h`;
}

/** O nome curto de cada jeito de repetir. */
export const REPEAT_LABEL: Record<Repeat | 'nunca', string> = {
  nunca: 'Não repete',
  dia: 'Todo dia',
  semana: 'Toda semana',
  mes: 'Todo mês',
  ano: 'Todo ano',
};

/** "Toda quinta-feira", "Todo sábado". */
function everyWeekday(day: string): string {
  const w = weekday(day);
  return `${w === 0 || w === 6 ? 'Todo' : 'Toda'} ${WEEKDAYS_LONG[w]}`;
}

/** Como ele se repete, por extenso, para o lembrete aberto: "Todo ano, em 23 de agosto." */
export function repeatSentence(repeat: Repeat | undefined, date: string): string {
  const [, m, d] = parts(date);
  switch (repeat) {
    case 'dia':
      return `Todo dia, a partir de ${longDay(date)}.`;
    case 'semana':
      return `${everyWeekday(date)}, a partir de ${longDay(date)}.`;
    case 'mes':
      return d > 28 ? `Todo dia ${d} de cada mês (no último dia, nos meses mais curtos).` : `Todo dia ${d} de cada mês.`;
    case 'ano':
      return m === 2 && d === 29 ? 'Todo ano, em 29 de fevereiro (no dia 28, nos anos que não são bissextos).' : `Todo ano, em ${dayAndMonth(date)}.`;
    default:
      return `Só em ${longDay(date)}.`;
  }
}

/** Como ele se repete, curto, para a linha impressa embaixo do nome: "todo ano", "toda quinta". */
export function repeatShort(r: Pick<Reminder, 'repeat' | 'date'>): string {
  switch (r.repeat) {
    case 'dia':
      return 'todo dia';
    case 'semana': {
      const w = weekday(r.date);
      return `${w === 0 || w === 6 ? 'todo' : 'toda'} ${WEEKDAYS_LONG[w].replace('-feira', '')}`;
    }
    case 'mes':
      return `todo dia ${Number(r.date.slice(8))}`;
    case 'ano':
      return 'todo ano';
    default:
      return '';
  }
}

// ===== Quando ele aparece =====

/** O lembrete aparece neste dia? */
export function occursOn(r: Pick<Reminder, 'date' | 'repeat' | 'skip'>, day: string): boolean {
  if (day < r.date || r.skip.includes(day)) return false;
  if (!r.repeat) return day === r.date;
  const [, am, ad] = parts(r.date);
  const [y, m, d] = parts(day);
  switch (r.repeat) {
    case 'dia':
      return true;
    case 'semana':
      return (dayNumber(day) - dayNumber(r.date)) % 7 === 0;
    case 'mes':
      return d === Math.min(ad, daysInMonth(y, m));
    case 'ano':
      return m === am && d === Math.min(ad, daysInMonth(y, m));
  }
}

/** A próxima vez dele a partir do dia (o próprio dia vale), ou null se não há mais. */
export function nextOccurrence(r: Pick<Reminder, 'date' | 'repeat' | 'skip'>, from: string): string | null {
  if (!r.repeat) return r.date >= from && !r.skip.includes(r.date) ? r.date : null;
  let day = from < r.date ? r.date : from;
  // o que mais demora é o 29 de fevereiro (um ano) e alguns dias pulados depois dele
  for (let i = 0; i < 3 * 366; i++, day = addDays(day, 1)) if (occursOn(r, day)) return day;
  return null;
}

/** A ordem dentro de um dia: o dia todo primeiro, depois pelo horário, depois pelo nome. */
export function compareInDay(a: Reminder, b: Reminder): number {
  if (!a.time !== !b.time) return a.time ? 1 : -1;
  return (a.time ?? '').localeCompare(b.time ?? '') || nameCollator.compare(a.title, b.title) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Os lembretes do dia, na ordem dele. */
export function remindersOn(list: readonly Reminder[], day: string): Reminder[] {
  return list.filter((r) => occursOn(r, day)).sort(compareInDay);
}

/** Os lembretes de cada dia de uma lista de dias (a folha do mês, a semana). */
export function remindersByDay(list: readonly Reminder[], days: readonly string[]): Map<string, Reminder[]> {
  const out = new Map<string, Reminder[]>();
  for (const day of days) out.set(day, remindersOn(list, day));
  return out;
}

export function isDone(r: Pick<Reminder, 'done'>, day: string): boolean {
  return r.done.includes(day);
}

// ===== Mudanças (devolvem o lembrete novo) =====

/** Marca (ou desmarca) o lembrete como feito naquele dia. */
export function toggleDone(r: Reminder, day: string, at: string): Reminder {
  const done = r.done.includes(day) ? r.done.filter((d) => d !== day) : marks([...r.done, day]);
  return { ...r, done, at };
}

/** Tira um dia de um lembrete que se repete (o resto continua). */
export function skipDay(r: Reminder, day: string, at: string): Reminder {
  return { ...r, skip: marks([...r.skip, day]), done: r.done.filter((d) => d !== day), at };
}

/** A cor do lembrete novo: sorteada entre as cartolinas (sem o branco), nunca a do último criado. */
export function drawColor(list: readonly Reminder[], random = Math.random): LightStock {
  const last = list.reduce<Reminder | null>((a, r) => (!a || r.createdAt > a.createdAt ? r : a), null);
  const pool = LIGHT_STOCKS.filter((s) => s !== 'branco' && s !== last?.color);
  return pool[Math.floor(random() * pool.length)] ?? 'amarelo';
}

/** Ordem guardada: a de criação (a mesma em todo aparelho, para as impressões baterem). */
function byCreation(a: Reminder, b: Reminder): number {
  return a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

function marks(days: string[]): string[] {
  return [...new Set(days.filter(isDay))].sort().slice(-MAX_MARKS);
}

// ===== Guardar e juntar =====

const ID_RE = /^[\w-]{1,64}$/;

function isStamp(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
}

export function sanitizeReminder(raw: unknown): Reminder | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r['title'] === 'string' ? r['title'].replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) : '';
  if (typeof r['id'] !== 'string' || !ID_RE.test(r['id']) || !title || !isDay(r['date'])) return null;
  const notes = Array.isArray(r['notes']) ? [...new Set(r['notes'].filter((n): n is string => typeof n === 'string' && ID_RE.test(n)))].slice(0, MAX_NOTES) : [];
  const repeat = (REPEATS as readonly unknown[]).includes(r['repeat']) ? (r['repeat'] as Repeat) : undefined;
  const createdAt = isStamp(r['createdAt']) ? r['createdAt'] : new Date(0).toISOString();
  return {
    id: r['id'],
    title,
    date: r['date'],
    ...(isTime(r['time']) ? { time: r['time'] } : {}),
    ...(repeat ? { repeat } : {}),
    color: (LIGHT_STOCKS as readonly unknown[]).includes(r['color']) ? (r['color'] as LightStock) : 'amarelo',
    notes,
    done: Array.isArray(r['done']) ? marks(r['done'] as string[]) : [],
    skip: repeat && Array.isArray(r['skip']) ? marks(r['skip'] as string[]) : [],
    createdAt,
    at: isStamp(r['at']) ? r['at'] : createdAt,
  };
}

export function sanitizeCalendar(raw: unknown): CalendarState {
  if (!raw || typeof raw !== 'object') return { reminders: [], removed: {} };
  const r = raw as Record<string, unknown>;
  const removed: Record<string, string> = {};
  if (r['removed'] && typeof r['removed'] === 'object') {
    for (const [id, at] of Object.entries(r['removed'] as Record<string, unknown>)) if (ID_RE.test(id) && isStamp(at)) removed[id] = at;
  }
  const byId = new Map<string, Reminder>();
  for (const item of Array.isArray(r['reminders']) ? r['reminders'].slice(0, MAX_REMINDERS) : []) {
    const rem = sanitizeReminder(item);
    if (rem && !(removed[rem.id] && removed[rem.id] >= rem.at)) byId.set(rem.id, rem);
  }
  return { reminders: [...byId.values()].sort(byCreation), removed };
}

/**
 * Os lembretes de dois aparelhos juntos: cada um vem de onde mudou por último, e um apagado (depois
 * da última mudança dele) fica apagado. O mesmo resultado dos dois lados, em qualquer ordem.
 */
export function mergeCalendar(here: CalendarState, there: CalendarState): CalendarState {
  const removed: Record<string, string> = { ...here.removed };
  for (const [id, at] of Object.entries(there.removed)) if (!removed[id] || at > removed[id]) removed[id] = at;
  const byId = new Map<string, Reminder>();
  for (const r of [...here.reminders, ...there.reminders]) {
    const before = byId.get(r.id);
    // no empate de horário, o maior texto vence (os dois aparelhos escolhem o mesmo)
    if (!before || r.at > before.at || (r.at === before.at && JSON.stringify(r) > JSON.stringify(before))) byId.set(r.id, r);
  }
  const reminders = [...byId.values()].filter((r) => !(removed[r.id] && removed[r.id] >= r.at)).sort(byCreation);
  return { reminders, removed };
}

/** O que vai para a nuvem: null sem nada (o mural de antes do Calendário fica com a mesma impressão). */
export function calendarToSync(state: CalendarState): CalendarState | null {
  return state.reminders.length || Object.keys(state.removed).length ? state : null;
}
