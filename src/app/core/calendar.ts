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
 * ele aparece saem de `occursOn`; "só neste dia não" é uma marca por dia (`skip`). O que já passou
 * sai riscado sozinho (`isPast`): ninguém marca nem desmarca.
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
/** Quantos dias tirados (pulados) um lembrete guarda: os mais recentes. */
const MAX_MARKS = 500;
const MAX_REMINDERS = 3000;
/** O maior intervalo de uma repetição (a cada 99 dias, semanas, meses ou anos). */
const MAX_EVERY = 99;
/** Quantos dias uma vez do lembrete pode durar (o Google deixa mais: o resto é cortado). */
export const MAX_SPAN = 366;

/**
 * O lembrete ligado a um evento do Google Agenda (ver core/google-agenda.ts): o id do evento, a versão
 * dele (`etag`), o `at` do lembrete quando os dois estavam iguais (diferente: há mudança daqui para
 * mandar), o endereço do evento no Google e, quando o Murall não pode mudar o evento, por quê.
 */
export interface GoogleLink {
  id: string;
  etag?: string;
  at?: string;
  link?: string;
  /** convite: o evento é de outra pessoa; google: um tipo especial do Google (aniversário). */
  lock?: 'convite' | 'google';
  /** O evento no Google não avisa (sem os avisos da agenda): o que o Google sabe da marcação (`quiet`). */
  quiet?: boolean;
  /** De antes do fim no lembrete (`end`, `endTime`): quanto o evento durava no Google. Lido só para converter. */
  dur?: number;
  /**
   * Os dias tirados que o Google já sabe (tirados lá, ou mandados daqui): os do lembrete que faltam aqui
   * vão ao Google como "tirar só esta vez", e os que saíram do lembrete (o Desfazer) voltam lá.
   */
  skip?: string[];
}

export interface Reminder {
  id: string;
  title: string;
  /** O dia (o primeiro, quando se repete). */
  date: string;
  /** 'HH:MM'; sem horário, é o dia todo. */
  time?: string;
  /** Mais de um dia: o último dia (de cada vez, quando se repete), depois do `date`. */
  end?: string;
  /**
   * Com horário, a hora em que acaba: no último dia, quando são vários (sem ela, vai até o fim dele); no
   * mesmo dia, depois do começo (sem ela, dura uma hora).
   */
  endTime?: string;
  repeat?: Repeat;
  /** A cada quantos dias, semanas, meses ou anos (sem o campo, 1). */
  every?: number;
  /** Na semana: os dias (0 é domingo). Sem eles, o dia da semana do `date`. */
  days?: number[];
  /**
   * No mês (ou no mês do ano): a vez do dia da semana do `date` dentro do mês, em vez do dia do mês ("a
   * terceira terça"): de 1 a 5, ou -1 para a última.
   */
  nth?: number;
  /**
   * No mês (ou no ano) a partir do dia 29: só nos meses (ou anos) que têm o dia, como o Google faz com o
   * "mensal no dia 31". Sem ele, cai no último dia dos mais curtos (o jeito do Murall).
   */
  strict?: true;
  /** Em que dia começa a semana para contar o "a cada 2 semanas" em vários dias (0, domingo; sem o campo, segunda). */
  weekStart?: 0;
  /** O último dia em que ele pode aparecer (a repetição acaba). Com `count`, é o da última vez. */
  until?: string;
  /** Quantas vezes ele acontece (o "depois de 10 vezes" do Google); o `until` sai daqui. */
  count?: number;
  /** Uma marcação, não um lembrete: fica no calendário, mas o Google Agenda não avisa. */
  quiet?: true;
  color: LightStock;
  /** As anotações anexadas, na ordem em que foram presas. */
  notes: string[];
  /** Os dias tirados de um lembrete que se repete ("Apagar só neste dia"). */
  skip: string[];
  createdAt: string;
  /** Quando mudou por último (a junção entre aparelhos fica com o mais novo). */
  at: string;
  /** O evento do Google Agenda ligado a ele. */
  google?: GoogleLink;
}

export interface CalendarState {
  reminders: Reminder[];
  /** Os apagados: id → quando. Um lembrete mais velho que isso não volta de outro aparelho. */
  removed: Record<string, string>;
  /** Os eventos do Google de lembretes apagados no Murall: id do evento → quando (para apagar lá). */
  googleTrash?: Record<string, string>;
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

/** O sábado e o domingo são masculinos ("todo sábado"); os outros, femininos ("toda quinta"). */
function masculine(w: number): boolean {
  return w === 0 || w === 6;
}

/** "Toda quinta-feira", "Todo sábado". */
function everyWeekday(day: string): string {
  const w = weekday(day);
  return `${masculine(w) ? 'Todo' : 'Toda'} ${WEEKDAYS_LONG[w]}`;
}

const WEEKDAYS_PLAIN = WEEKDAYS_LONG.map((w) => w.replace('-feira', ''));

/** "segunda e quarta", "segunda, quarta e sexta", "segunda a sexta". */
function joinDays(days: readonly number[]): string {
  const sorted = [...days].sort();
  if (sorted.join() === '1,2,3,4,5') return 'segunda a sexta';
  const names = sorted.map((d) => WEEKDAYS_PLAIN[d]);
  return names.length > 1 ? `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}` : (names[0] ?? '');
}

const UNIT: Record<Repeat, [string, string]> = { dia: ['dia', 'dias'], semana: ['semana', 'semanas'], mes: ['mês', 'meses'], ano: ['ano', 'anos'] };

/** O nome da unidade de um intervalo: "semana" ou "semanas". */
export function unitLabel(repeat: Repeat, n: number): string {
  return UNIT[repeat][n === 1 ? 0 : 1];
}

const ORDINAL_F = ['primeira', 'segunda', 'terceira', 'quarta', 'quinta'];
const ORDINAL_M = ['primeiro', 'segundo', 'terceiro', 'quarto', 'quinto'];

/** A vez do dia da semana do dia dentro do mês: 1 a 5 ("a terceira terça"). */
export function nthOf(day: string): number {
  return Math.ceil(Number(day.slice(8)) / 7);
}

/** O dia é o último daquele dia da semana no mês ("a última sexta")? */
export function isLastOfMonth(day: string): boolean {
  const [y, m, d] = parts(day);
  return d + 7 > daysInMonth(y, m);
}

/** "terceira terça-feira", "último sábado": o dia da semana do dia, na vez `nth` (−1, a última). */
export function nthLabel(day: string, nth: number, long = true): string {
  const w = weekday(day);
  const ord = nth < 0 ? (masculine(w) ? 'último' : 'última') : (masculine(w) ? ORDINAL_M : ORDINAL_F)[nth - 1];
  return `${ord} ${long ? WEEKDAYS_LONG[w] : WEEKDAYS_PLAIN[w]}`;
}

type Extra = Pick<Reminder, 'every' | 'days' | 'until' | 'end' | 'nth' | 'strict' | 'count'>;

/** Como ele se repete, por extenso, para o lembrete aberto: "Todo ano, em 23 de agosto." */
export function repeatSentence(repeat: Repeat | undefined, date: string, extra: Extra = {}): string {
  const span = spanOf({ date, end: extra.end });
  if (!repeat && span > 1) return `De ${rangeLabel(date, extra.end!)}${date.slice(0, 4) === extra.end!.slice(0, 4) ? ` de ${date.slice(0, 4)}` : ''}.`;
  const base = baseSentence(repeat, date, extra);
  const ending = !repeat ? '' : extra.count ? `, ${extra.count === 1 ? '1 vez' : `${extra.count} vezes`}` : extra.until ? `, até ${longDay(extra.until)}` : '';
  const withEnd = ending ? `${base.slice(0, -1)}${ending}.` : base;
  return repeat && span > 1 ? `${withEnd} Cada vez dura ${span} dias.` : withEnd;
}

function baseSentence(repeat: Repeat | undefined, date: string, extra: Extra): string {
  const [, m, d] = parts(date);
  const n = extra.every ?? 1;
  const nth = repeat === 'mes' || repeat === 'ano' ? extra.nth : undefined;
  const short = d > 28 ? (extra.strict ? ` (só nos meses que têm o dia ${d})` : ' (no último dia, nos meses mais curtos)') : '';
  if (nth) {
    const where = nthLabel(date, nth);
    const male = masculine(weekday(date));
    const month = repeat === 'ano' ? ` de ${MONTHS_LONG[m - 1]}` : '';
    if (n > 1) return `A cada ${n} ${UNIT[repeat!][1]}, ${male ? 'no' : 'na'} ${where}${month}.`;
    return repeat === 'mes' ? `${male ? 'Todo' : 'Toda'} ${where} do mês.` : `Todo ano, ${male ? 'no' : 'na'} ${where}${month}.`;
  }
  if (repeat && (n > 1 || extra.days?.length)) {
    const each = n > 1 ? `A cada ${n} ${UNIT[repeat][1]}` : repeat === 'semana' ? 'Toda semana' : '';
    switch (repeat) {
      case 'dia':
        return `${each}, a partir de ${longDay(date)}.`;
      case 'semana': {
        const list = extra.days?.length ? [...extra.days].sort() : [weekday(date)];
        const days = joinDays(list);
        // "na segunda e quarta", "no sábado e domingo", "de segunda a sexta"
        const prep = days === 'segunda a sexta' ? 'de' : masculine(list[0]) ? 'no' : 'na';
        return `${each}, ${prep} ${days}, a partir de ${longDay(date)}.`;
      }
      case 'mes':
        return `${each}, no dia ${d}${short}.`;
      case 'ano':
        return `${each}, em ${dayAndMonth(date)}.`;
    }
  }
  switch (repeat) {
    case 'dia':
      return `Todo dia, a partir de ${longDay(date)}.`;
    case 'semana':
      return `${everyWeekday(date)}, a partir de ${longDay(date)}.`;
    case 'mes':
      return `Todo dia ${d} de cada mês${short}.`;
    case 'ano':
      if (m === 2 && d === 29) return extra.strict ? 'Todo ano, em 29 de fevereiro (só nos anos bissextos).' : 'Todo ano, em 29 de fevereiro (no dia 28, nos anos que não são bissextos).';
      return `Todo ano, em ${dayAndMonth(date)}.`;
    default:
      return `Só em ${longDay(date)}.`;
  }
}

/** Como ele se repete, curto, para a linha impressa embaixo do nome: "todo ano", "toda quinta", "toda terceira terça". */
export function repeatShort(r: Pick<Reminder, 'repeat' | 'date' | 'every' | 'days' | 'nth'>): string {
  if (r.repeat && (r.every ?? 1) > 1) return `a cada ${r.every} ${UNIT[r.repeat][1]}`;
  if (r.repeat === 'semana' && r.days?.length) return joinDays(r.days);
  if (r.repeat === 'mes' && r.nth) return `${masculine(weekday(r.date)) ? 'todo' : 'toda'} ${nthLabel(r.date, r.nth, false)}`;
  switch (r.repeat) {
    case 'dia':
      return 'todo dia';
    case 'semana': {
      const w = weekday(r.date);
      return `${masculine(w) ? 'todo' : 'toda'} ${WEEKDAYS_PLAIN[w]}`;
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

/**
 * A semana do dia, para contar o "a cada 2 semanas" em vários dias: de segunda a domingo (o jeito do
 * iCalendar, sem dizer nada), ou de domingo a sábado (`weekStart` 0, o WKST=SU do Google).
 */
function weekIndex(day: string, start: 0 | 1): number {
  return Math.floor((dayNumber(day) + (start === 0 ? 4 : 3)) / 7);
}

/** O dia é a vez `nth` do dia da semana dele no mês (−1: a última)? */
function isNth(day: string, nth: number): boolean {
  return nth < 0 ? isLastOfMonth(day) : nthOf(day) === nth;
}

type Rule = Pick<Reminder, 'date' | 'repeat' | 'skip' | 'every' | 'days' | 'until' | 'nth' | 'strict' | 'weekStart'>;

/** O lembrete aparece neste dia? */
export function occursOn(r: Rule, day: string): boolean {
  if (day < r.date || r.skip.includes(day) || (r.until && day > r.until)) return false;
  if (!r.repeat) return day === r.date;
  const n = r.every ?? 1;
  const [ay, am, ad] = parts(r.date);
  const [y, m, d] = parts(day);
  // no mês (e no ano): a vez do dia da semana, o dia certo, ou o último dia dos meses mais curtos
  const inMonth = () => (r.nth ? weekday(day) === weekday(r.date) && isNth(day, r.nth) : r.strict ? d === ad : d === Math.min(ad, daysInMonth(y, m)));
  switch (r.repeat) {
    case 'dia':
      return (dayNumber(day) - dayNumber(r.date)) % n === 0;
    case 'semana':
      if (r.days?.length) return r.days.includes(weekday(day)) && (weekIndex(day, r.weekStart ?? 1) - weekIndex(r.date, r.weekStart ?? 1)) % n === 0;
      return (dayNumber(day) - dayNumber(r.date)) % (7 * n) === 0;
    case 'mes':
      return (y * 12 + m - (ay * 12 + am)) % n === 0 && inMonth();
    case 'ano':
      return (y - ay) % n === 0 && m === am && inMonth();
  }
}

/** A próxima vez dele a partir do dia (o próprio dia vale), ou null se não há mais. */
export function nextOccurrence(r: Rule, from: string): string | null {
  if (!r.repeat) return r.date >= from && !r.skip.includes(r.date) ? r.date : null;
  let day = from < r.date ? r.date : from;
  // o que mais demora é o 29 de fevereiro só nos bissextos (quatro anos, ou mais com o intervalo) e os dias pulados depois dele
  const limit = Math.min(9 * 366 * (r.every ?? 1), 40 * 366);
  for (let i = 0; i < limit; i++, day = addDays(day, 1)) {
    if (r.until && day > r.until) return null;
    if (occursOn(r, day)) return day;
  }
  return null;
}

/**
 * O dia da última de `count` vezes ("depois de 10 vezes"), ou null se elas não cabem em 40 anos. Os
 * dias tirados contam, como no Google (tirar uma vez não empurra o fim).
 */
export function countEnd(r: Omit<Rule, 'skip' | 'until'>, count: number): string | null {
  const probe: Rule = { ...r, skip: [], until: undefined };
  let seen = 0;
  let day = r.date;
  for (let i = 0; i < 40 * 366; i++, day = addDays(day, 1)) {
    if (occursOn(probe, day) && ++seen === count) return day;
  }
  return null;
}


// ===== Mais de um dia =====

type Spanned = Rule & Pick<Reminder, 'end'>;

/** Quantos dias cada vez do lembrete ocupa (1, quando acaba no dia em que começa). */
export function spanOf(r: Pick<Reminder, 'date' | 'end'>): number {
  return r.end && r.end > r.date ? Math.min(MAX_SPAN, dayNumber(r.end) - dayNumber(r.date) + 1) : 1;
}

/** O primeiro dia da vez do lembrete que passa por este dia (o próprio dia, num lembrete de um dia só), ou null. */
export function occurrenceStart(r: Spanned, day: string): string | null {
  const span = spanOf(r);
  if (span === 1) return occursOn(r, day) ? day : null;
  if (!r.repeat) return day >= r.date && dayNumber(day) - dayNumber(r.date) < span && !r.skip.includes(r.date) ? r.date : null;
  for (let k = 0; k < span; k++) {
    const start = addDays(day, -k);
    if (start < r.date) break;
    if (occursOn(r, start)) return start;
  }
  return null;
}

/** O lembrete está neste dia (começa nele, ou uma vez de vários dias passa por ele)? */
export function coversDay(r: Spanned, day: string): boolean {
  return occurrenceStart(r, day) !== null;
}

/** O pedaço de uma vez que cai neste dia: o primeiro dia dela, qual dia é (1 no primeiro) e de quantos. */
export interface Segment {
  start: string;
  n: number;
  total: number;
  first: boolean;
  last: boolean;
}

export function segmentOn(r: Spanned, day: string): Segment | null {
  const start = occurrenceStart(r, day);
  if (!start) return null;
  const total = spanOf(r);
  const n = dayNumber(day) - dayNumber(start) + 1;
  return { start, n, total, first: n === 1, last: n === total };
}

/** O horário do lembrete neste dia: o do começo no primeiro dia; nos outros de uma vez de vários dias, nenhum. */
export function timeOn(r: Reminder, day: string): string | undefined {
  if (!r.time) return undefined;
  return spanOf(r) === 1 || occurrenceStart(r, day) === day ? r.time : undefined;
}

/**
 * O horário curto do lembrete neste dia, para as tiras: "20h" (começa), "até 10h" (o último dia, que
 * acaba com hora), "continua" (o meio, ou o último dia inteiro) e "" (o dia todo).
 */
export function spanLabel(r: Reminder, day: string): string {
  const seg = spanOf(r) > 1 ? segmentOn(r, day) : null;
  if (!seg || seg.first) return r.time ? timeLabel(r.time) : '';
  if (seg.last && r.endTime) return `até ${timeLabel(r.endTime)}`;
  return 'continua';
}

/** De quando a quando vai uma vez: "20 a 22 de outubro", "30 de out. a 2 de nov.", "30 de dez. de 2026 a 2 de jan. de 2027". */
export function rangeLabel(start: string, end: string): string {
  const [ay, am, ad] = parts(start);
  const [by, bm, bd] = parts(end);
  if (ay !== by) return `${ad} de ${MONTHS_SHORT[am - 1]}. de ${ay} a ${bd} de ${MONTHS_SHORT[bm - 1]}. de ${by}`;
  if (am !== bm) return `${ad} de ${MONTHS_SHORT[am - 1]}. a ${bd} de ${MONTHS_SHORT[bm - 1]}.`;
  return `${ad} a ${bd} de ${MONTHS_LONG[am - 1]}`;
}

/**
 * A ordem dentro de um dia: primeiro o que dura vários dias (como as faixas do Google; o que começou
 * antes, e o mais comprido, em cima), depois o dia todo, depois pelo horário, depois pelo nome.
 */
export function compareInDay(a: Reminder, b: Reminder, day?: string): number {
  const sa = spanOf(a) > 1;
  const sb = spanOf(b) > 1;
  if (sa !== sb) return sa ? -1 : 1;
  if (sa && day) {
    const by = (occurrenceStart(a, day) ?? '').localeCompare(occurrenceStart(b, day) ?? '') || spanOf(b) - spanOf(a);
    if (by) return by;
  }
  const ta = day ? timeOn(a, day) : a.time;
  const tb = day ? timeOn(b, day) : b.time;
  if (!ta !== !tb) return ta ? 1 : -1;
  return (ta ?? '').localeCompare(tb ?? '') || nameCollator.compare(a.title, b.title) || a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id);
}

/** Os lembretes do dia (os de vários dias também nos dias do meio e no último), na ordem dele. */
export function remindersOn(list: readonly Reminder[], day: string): Reminder[] {
  return list.filter((r) => coversDay(r, day)).sort((a, b) => compareInDay(a, b, day));
}

/** Os lembretes de cada dia de uma lista de dias (a folha do mês, a semana). */
export function remindersByDay(list: readonly Reminder[], days: readonly string[]): Map<string, Reminder[]> {
  const out = new Map<string, Reminder[]>();
  for (const day of days) out.set(day, remindersOn(list, day));
  return out;
}

/**
 * Esta vez do lembrete já passou? O dia antes de hoje passou; hoje, só o que tem horário e o horário
 * já foi (o do dia todo passa à meia-noite). Sai do relógio do aparelho, sem marca guardada: um
 * lembrete marcado para trás já nasce riscado.
 */
export function isPast(r: Pick<Reminder, 'time'> & Partial<Reminder>, day: string, today: string, now: string): boolean {
  if (day !== today) return day < today;
  // vários dias: hoje só passa no último dia, quando a hora do fim já foi
  if (r.date && r.end && spanOf({ date: r.date, end: r.end }) > 1) {
    const seg = segmentOn({ date: r.date, end: r.end, repeat: r.repeat, skip: r.skip ?? [], every: r.every, days: r.days, until: r.until }, day);
    return !!seg?.last && !!r.endTime && r.endTime < now;
  }
  return !!r.time && r.time < now;
}

// ===== Mudanças (devolvem o lembrete novo) =====

/** Tira um dia de um lembrete que se repete (o resto continua). */
export function skipDay(r: Reminder, day: string, at: string): Reminder {
  return { ...r, skip: marks([...r.skip, day]), at };
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
const EVENT_ID_RE = /^[a-v0-9]{5,1024}$/;
/** (O `repeticao` de antes, a repetição que só o Google mudava, saiu: o Murall agora mostra e muda todas.) */
const LOCKS = ['convite', 'google'];
/** Quantas vezes, no máximo, no "depois de N vezes". */
export const MAX_COUNT = 999;

function isStamp(v: unknown): v is string {
  return typeof v === 'string' && v.length <= 40 && Number.isFinite(Date.parse(v));
}

function sanitizeLink(raw: unknown): GoogleLink | undefined {
  if (!raw || typeof raw !== 'object') return undefined;
  const g = raw as Record<string, unknown>;
  if (typeof g['id'] !== 'string' || !EVENT_ID_RE.test(g['id'])) return undefined;
  const link = typeof g['link'] === 'string' && /^https:\/\/(www\.)?google\.com\/calendar\//.test(g['link']) && g['link'].length <= 600 ? g['link'] : undefined;
  const dur = typeof g['dur'] === 'number' && Number.isInteger(g['dur']) && g['dur'] > 0 && g['dur'] <= 60 * 24 * 60 ? g['dur'] : undefined;
  const skip = Array.isArray(g['skip']) ? marks(g['skip'] as string[]) : [];
  return {
    id: g['id'],
    ...(typeof g['etag'] === 'string' && g['etag'].length <= 100 ? { etag: g['etag'] } : {}),
    ...(isStamp(g['at']) ? { at: g['at'] } : {}),
    ...(link ? { link } : {}),
    ...(LOCKS.includes(g['lock'] as string) ? { lock: g['lock'] as GoogleLink['lock'] } : {}),
    ...(dur ? { dur } : {}),
    ...(Array.isArray(g['skip']) ? { skip } : {}),
    ...(g['quiet'] === true ? { quiet: true } : {}),
  };
}

/**
 * O fim de uma vez que começa no dia e na hora e dura `minutes` minutos: a hora em que acaba e, passando
 * do dia, o último dia (acabar à meia-noite é ir até o fim do dia de antes, sem a hora).
 */
export function endAfter(date: string, time: string, minutes: number): { end?: string; endTime?: string } {
  const [h, m] = time.split(':').map(Number);
  const total = h * 60 + m + Math.max(1, minutes);
  const rest = total % 1440;
  const last = Math.floor(total / 1440) - (rest === 0 ? 1 : 0);
  const endTime = rest ? `${pad(Math.floor(rest / 60))}:${pad(rest % 60)}` : undefined;
  return last >= 1 ? { end: addDays(date, last), ...(endTime ? { endTime } : {}) } : { endTime: endTime ?? '23:59' };
}

export function sanitizeReminder(raw: unknown): Reminder | null {
  if (!raw || typeof raw !== 'object') return null;
  const r = raw as Record<string, unknown>;
  const title = typeof r['title'] === 'string' ? r['title'].replace(/\s+/g, ' ').trim().slice(0, TITLE_MAX) : '';
  if (typeof r['id'] !== 'string' || !ID_RE.test(r['id']) || !title || !isDay(r['date'])) return null;
  const notes = Array.isArray(r['notes']) ? [...new Set(r['notes'].filter((n): n is string => typeof n === 'string' && ID_RE.test(n)))].slice(0, MAX_NOTES) : [];
  const repeat = (REPEATS as readonly unknown[]).includes(r['repeat']) ? (r['repeat'] as Repeat) : undefined;
  const createdAt = isStamp(r['createdAt']) ? r['createdAt'] : new Date(0).toISOString();
  const every = repeat && typeof r['every'] === 'number' && Number.isInteger(r['every']) && r['every'] > 1 && r['every'] <= MAX_EVERY ? r['every'] : undefined;
  const days =
    repeat === 'semana' && Array.isArray(r['days'])
      ? [...new Set(r['days'].filter((d): d is number => typeof d === 'number' && Number.isInteger(d) && d >= 0 && d <= 6))].sort()
      : [];
  let until = repeat && isDay(r['until']) && r['until'] >= (r['date'] as string) ? (r['until'] as string) : undefined;
  let google = sanitizeLink(r['google']);
  const date = r['date'] as string;
  const time = isTime(r['time']) ? r['time'] : undefined;
  const rawEnd = r['end'];
  let end = isDay(rawEnd) && rawEnd > date ? rawEnd : undefined;
  const rawEndTime = r['endTime'];
  let endTime = time && isTime(rawEndTime) ? rawEndTime : undefined;
  // antes do fim no lembrete, o evento do Google que não durava uma hora (ou um dia) guardava só a duração
  if (google?.dur) {
    if (!end && !endTime) {
      const span = time ? endAfter(date, time, google.dur) : google.dur > 1 ? { end: addDays(date, google.dur - 1) } : {};
      end = span.end;
      endTime = time ? span.endTime : undefined;
    }
    const { dur: _, ...rest } = google;
    google = rest;
  }
  if (end && dayNumber(end) - dayNumber(date) + 1 > MAX_SPAN) end = addDays(date, MAX_SPAN - 1);
  // no mesmo dia, o fim vem depois do começo
  if (!end && endTime && endTime <= time!) endTime = undefined;
  // a vez do dia da semana no mês ("a terceira terça"), só no mês e no ano
  const rawNth = r['nth'];
  const nth = (repeat === 'mes' || repeat === 'ano') && typeof rawNth === 'number' && Number.isInteger(rawNth) && ((rawNth >= 1 && rawNth <= 5) || rawNth === -1) ? rawNth : undefined;
  const strict = (repeat === 'mes' || repeat === 'ano') && !nth && r['strict'] === true && Number(date.slice(8)) >= 29 ? (true as const) : undefined;
  const weekStart = repeat === 'semana' && r['weekStart'] === 0 ? (0 as const) : undefined;
  // "depois de N vezes": o último dia sai da conta
  const rawCount = r['count'];
  let count = repeat && typeof rawCount === 'number' && Number.isInteger(rawCount) && rawCount >= 1 && rawCount <= MAX_COUNT ? rawCount : undefined;
  if (count) {
    const last = countEnd({ date, repeat, every, days: days.length ? days : undefined, nth, strict, weekStart }, count);
    if (last) until = last;
    else count = undefined;
  }
  const at = isStamp(r['at']) ? r['at'] : createdAt;
  // a repetição que só o Google mudava agora se muda aqui: ela continua igual à de lá (nada a mandar)
  const rawLink = r['google'] as Record<string, unknown> | undefined;
  if (google && rawLink?.['lock'] === 'repeticao' && !google.lock) google = { ...google, at };
  return {
    id: r['id'],
    title,
    date,
    ...(time ? { time } : {}),
    ...(end ? { end } : {}),
    ...(endTime ? { endTime } : {}),
    ...(repeat ? { repeat } : {}),
    ...(every ? { every } : {}),
    ...(days.length ? { days } : {}),
    ...(nth ? { nth } : {}),
    ...(strict ? { strict } : {}),
    ...(weekStart === 0 ? { weekStart } : {}),
    ...(until ? { until } : {}),
    ...(count ? { count } : {}),
    ...(r['quiet'] === true ? { quiet: true as const } : {}),
    color: (LIGHT_STOCKS as readonly unknown[]).includes(r['color']) ? (r['color'] as LightStock) : 'amarelo',
    notes,
    skip: repeat && Array.isArray(r['skip']) ? marks(r['skip'] as string[]) : [],
    createdAt,
    at,
    ...(google ? { google } : {}),
  };
}

function sanitizeTrash(raw: unknown): Record<string, string> {
  const out: Record<string, string> = {};
  if (!raw || typeof raw !== 'object') return out;
  for (const [id, at] of Object.entries(raw as Record<string, unknown>).slice(0, MAX_REMINDERS)) if (EVENT_ID_RE.test(id) && isStamp(at)) out[id] = at;
  return out;
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
  const trash = sanitizeTrash(r['googleTrash']);
  return { reminders: [...byId.values()].sort(byCreation), removed, ...(Object.keys(trash).length ? { googleTrash: trash } : {}) };
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
  const trash: Record<string, string> = { ...here.googleTrash };
  for (const [id, at] of Object.entries(there.googleTrash ?? {})) if (!trash[id] || at > trash[id]) trash[id] = at;
  return { reminders, removed, ...(Object.keys(trash).length ? { googleTrash: trash } : {}) };
}

/** O que vai para a nuvem: null sem nada (o mural de antes do Calendário fica com a mesma impressão). */
export function calendarToSync(state: CalendarState): CalendarState | null {
  return state.reminders.length || Object.keys(state.removed).length ? state : null;
}
