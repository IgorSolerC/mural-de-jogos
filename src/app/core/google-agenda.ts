import { GoogleLink, Reminder, Repeat, addDays, dayNumber, isDay, endAfter, occursOn, sanitizeReminder, spanOf, weekday } from './calendar';
import { localDay } from './dates';
import { LightStock } from './review';

/**
 * O lembrete do Calendário e o evento do Google Agenda, de um para o outro (puro; quem conversa com o
 * Google é a API, e quem decide o que vai e o que vem é `GoogleAgenda`, em core/google-agenda-sync.ts).
 *
 * Os ids não repetem entre aparelhos: o evento de um lembrete do Murall tem o id `mu` + o id do lembrete
 * em hexadecimal (dois aparelhos que mandam o mesmo lembrete batem no mesmo evento), e o lembrete de um
 * evento que nasceu no Google tem o id `g` + o id do evento. O horário é o deste aparelho: o evento vai
 * com o fuso dele, e o que vem do Google é lido no fuso daqui.
 */

/** O evento como a API devolve (ver api/src/domain/agenda.ts, `trimEvent`). */
export interface GEvent {
  id: string;
  status?: string;
  summary?: string;
  start?: { date?: string; dateTime?: string; timeZone?: string };
  end?: { date?: string; dateTime?: string; timeZone?: string };
  recurrence?: string[];
  recurringEventId?: string;
  originalStartTime?: { date?: string; dateTime?: string };
  colorId?: string;
  updated?: string;
  etag?: string;
  htmlLink?: string;
  tipo?: string;
  seu?: boolean;
  convidados?: number;
}

/** O evento que vai para o Google (a API confere de novo e só deixa estes campos). */
export interface GEventBody {
  summary: string;
  start: { date: string } | { dateTime: string; timeZone: string };
  end: { date: string } | { dateTime: string; timeZone: string };
  recurrence?: string[];
  colorId?: string;
  description?: string;
}

/** As cores de evento do Google mais perto de cada cartolina (o branco fica na cor da agenda). */
const COLOR_OF: Record<LightStock, string | null> = {
  vermelho: '11',
  laranja: '6',
  amarelo: '5',
  verde: '2',
  azul: '7',
  lilas: '1',
  rosa: '4',
  cinza: '8',
  branco: null,
};
const STOCK_OF: Record<string, LightStock> = { '1': 'lilas', '2': 'verde', '3': 'lilas', '4': 'rosa', '5': 'amarelo', '6': 'laranja', '7': 'azul', '8': 'cinza', '9': 'azul', '10': 'verde', '11': 'vermelho' };
/** Sem cor no Google (a da agenda): azul, a cor de sempre da agenda principal. */
const DEFAULT_STOCK: LightStock = 'azul';

/** Os tipos de evento que não são lembrete (onde está trabalhando, ausente, foco). */
const NOT_REMINDERS = ['workingLocation', 'outOfOffice', 'focusTime'];

const FREQ: Record<Repeat, string> = { dia: 'DAILY', semana: 'WEEKLY', mes: 'MONTHLY', ano: 'YEARLY' };
const REPEAT_OF: Record<string, Repeat> = { DAILY: 'dia', WEEKLY: 'semana', MONTHLY: 'mes', YEARLY: 'ano' };
const BYDAY = ['SU', 'MO', 'TU', 'WE', 'TH', 'FR', 'SA'];

const EVENT_ID = /^[a-v0-9]{5,1024}$/;
const REMINDER_ID = /^[\w-]{1,64}$/;

/** Até quanto tempo atrás um evento do Google vem para o Murall (o que acabou antes disso fica lá). */
export const IMPORT_DAYS = 30;

// ===== Ids =====

function hex(text: string): string {
  return Array.from(new TextEncoder().encode(text), (b) => b.toString(16).padStart(2, '0')).join('');
}

function unhex(text: string): string | null {
  if (text.length % 2 || !/^[0-9a-f]+$/.test(text)) return null;
  const bytes = new Uint8Array(text.length / 2);
  for (let i = 0; i < bytes.length; i++) bytes[i] = parseInt(text.slice(2 * i, 2 * i + 2), 16);
  try {
    return new TextDecoder('utf-8', { fatal: true }).decode(bytes);
  } catch {
    return null;
  }
}

/** Um resumo curto e fixo de um texto (para o id do lembrete de um evento de id comprido). */
function digest(text: string): string {
  let a = 0x811c9dc5;
  let b = 0x1000193;
  for (let i = 0; i < text.length; i++) {
    a = Math.imul(a ^ text.charCodeAt(i), 16777619);
    b = Math.imul(b + text.charCodeAt(i), 2246822519);
  }
  return (a >>> 0).toString(36) + (b >>> 0).toString(36);
}

/** O id do evento do Google de um lembrete. */
export function eventIdFor(reminderId: string): string {
  const own = /^g([a-v0-9]{5,63})$/.exec(reminderId);
  return own ? own[1] : 'mu' + hex(reminderId);
}

/** O id do lembrete de um evento do Google. */
export function reminderIdFor(eventId: string): string {
  if (eventId.startsWith('mu')) {
    const back = unhex(eventId.slice(2));
    if (back && REMINDER_ID.test(back)) return back;
  }
  return eventId.length <= 63 ? 'g' + eventId : 'g' + digest(eventId);
}

/**
 * O id de uma vez de um evento que repete, como o Google dá (`abc123_20261027` no dia todo, e com horário
 * a hora do começo em UTC, `abc123_20261027T120000Z`): é por ele que se tira só um dia, como o "Só este
 * evento" do Google. O horário do lembrete é o deste aparelho (o fuso com que o evento foi mandado).
 */
export function instanceIdFor(eventId: string, r: Pick<Reminder, 'time'>, day: string): string {
  if (!r.time) return `${eventId}_${compact(day)}`;
  const [y, m, d] = day.split('-').map(Number);
  const [h, mi] = r.time.split(':').map(Number);
  const utc = new Date(y, m - 1, d, h, mi).toISOString();
  return `${eventId}_${utc.slice(0, 19).replace(/[-:]/g, '')}Z`;
}

/** O evento nasceu no Murall (a descrição com as anotações é dele). */
export function isMuralEvent(eventId: string): boolean {
  return eventId.startsWith('mu');
}

// ===== Horas =====

function pad(n: number): string {
  return String(n).padStart(2, '0');
}

/** 'AAAA-MM-DD' e 'HH:MM' de um instante, no fuso deste aparelho. */
function localParts(iso: string): { day: string; time: string } | null {
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  return { day: localDay(d), time: `${pad(d.getHours())}:${pad(d.getMinutes())}` };
}

/** "AAAA-MM-DDTHH:MM:00" mais `minutes` minutos, sem fuso (o relógio de parede). */
function addMinutes(day: string, time: string, minutes: number): string {
  const [h, m] = time.split(':').map(Number);
  const base = Date.UTC(Number(day.slice(0, 4)), Number(day.slice(5, 7)) - 1, Number(day.slice(8, 10)), h, m) + minutes * 60_000;
  const d = new Date(base);
  return `${d.getUTCFullYear()}-${pad(d.getUTCMonth() + 1)}-${pad(d.getUTCDate())}T${pad(d.getUTCHours())}:${pad(d.getUTCMinutes())}:00`;
}

/** O fuso deste aparelho ("America/Sao_Paulo"). */
export function deviceTimeZone(): string {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'UTC';
  } catch {
    return 'UTC';
  }
}

const compact = (day: string) => day.replace(/-/g, '');

// ===== Do lembrete para o evento =====

/** A regra de repetição (RRULE) do lembrete. */
export function ruleOf(r: Reminder): string | null {
  if (!r.repeat) return null;
  const parts = [`FREQ=${FREQ[r.repeat]}`];
  if ((r.every ?? 1) > 1) parts.push(`INTERVAL=${r.every}`);
  const d = Number(r.date.slice(8));
  const m = Number(r.date.slice(5, 7));
  if (r.repeat === 'semana' && r.days?.length) parts.push(`BYDAY=${r.days.map((x) => BYDAY[x]).join(',')}`);
  // o 29 a 31 caem no último dia dos meses mais curtos (o Google pularia esses meses)
  if (r.repeat === 'mes' && d >= 29) parts.push(`BYMONTHDAY=${Array.from({ length: d - 27 }, (_, i) => 28 + i).join(',')}`, 'BYSETPOS=-1');
  if (r.repeat === 'ano' && m === 2 && d === 29) parts.push('BYMONTH=2', 'BYMONTHDAY=28,29', 'BYSETPOS=-1');
  if (r.until) {
    if (r.time) {
      const [y, mo, dd] = r.until.split('-').map(Number);
      const end = new Date(y, mo - 1, dd, 23, 59, 59);
      parts.push(`UNTIL=${end.toISOString().replace(/[-:]/g, '').replace(/\.\d{3}/, '')}`);
    } else parts.push(`UNTIL=${compact(r.until)}`);
  }
  return parts.join(';');
}

/** O evento do Google de um lembrete. `notes`: os nomes das anotações, para a descrição (só nos eventos do Murall). */
export function toEvent(r: Reminder, tz: string, notes: readonly string[] = []): GEventBody {
  // vários dias: até a hora do fim no último dia (sem ela, até o fim dele); um dia só: até a hora do fim, ou
  // uma hora; o fim do dia todo é o dia seguinte ao último
  const many = spanOf(r) > 1 ? r.end! : null;
  const endAt = many ? (r.endTime ? `${many}T${r.endTime}:00` : `${addDays(many, 1)}T00:00:00`) : r.endTime ? `${r.date}T${r.endTime}:00` : null;
  const when = r.time
    ? { start: { dateTime: `${r.date}T${r.time}:00`, timeZone: tz }, end: { dateTime: endAt ?? addMinutes(r.date, r.time, 60), timeZone: tz } }
    : { start: { date: r.date }, end: { date: addDays(many ?? r.date, 1) } };
  const rule = ruleOf(r);
  const recurrence = rule ? [`RRULE:${rule}`] : undefined;
  if (recurrence && r.skip.length) {
    recurrence.push(r.time ? `EXDATE;TZID=${tz}:${r.skip.map((s) => `${compact(s)}T${r.time!.replace(':', '')}00`).join(',')}` : `EXDATE;VALUE=DATE:${r.skip.map(compact).join(',')}`);
  }
  const color = COLOR_OF[r.color];
  return {
    summary: r.title,
    ...when,
    ...(recurrence ? { recurrence } : {}),
    ...(color ? { colorId: color } : {}),
    ...(notes.length ? { description: `Anotações no Murall: ${notes.join(', ')}` } : {}),
  };
}

// ===== Do evento para o lembrete =====

interface ParsedRule {
  repeat: Repeat;
  every?: number;
  days?: number[];
  until?: string;
  skip: string[];
}

/** O dia de um valor de data do iCalendar ('20261020', '20261020T150000', '20261020T180000Z'), no fuso daqui. */
function icalDay(value: string): string | null {
  const m = /^(\d{4})(\d{2})(\d{2})(?:T(\d{2})(\d{2})(\d{2})(Z)?)?$/.exec(value.trim());
  if (!m) return null;
  if (m[7]) {
    const local = localParts(`${m[1]}-${m[2]}-${m[3]}T${m[4]}:${m[5]}:${m[6]}Z`);
    return local?.day ?? null;
  }
  const day = `${m[1]}-${m[2]}-${m[3]}`;
  return isDay(day) ? day : null;
}

/**
 * A repetição do evento, se o Murall sabe mostrar: todo dia, semana (com os dias), mês ou ano, a cada N,
 * até um dia (ou N vezes), e os dias tirados. Null: um jeito que só o Google sabe (o segundo sábado do
 * mês, várias regras, datas a mais). Undefined: o evento não repete.
 */
export function parseRecurrence(lines: readonly string[] | undefined, date: string): ParsedRule | null | undefined {
  if (!lines?.length) return undefined;
  let rule: Record<string, string> | null = null;
  const skip: string[] = [];
  for (const line of lines) {
    const [head, value = ''] = line.split(/:(.*)/s);
    const name = head.split(';')[0].toUpperCase();
    if (name === 'RRULE') {
      if (rule) return null; // duas regras
      rule = Object.fromEntries(value.split(';').map((p) => p.split('=') as [string, string]).map(([k, v]) => [k.toUpperCase(), v ?? '']));
    } else if (name === 'EXDATE') {
      for (const v of value.split(',')) {
        const day = icalDay(v);
        if (day) skip.push(day);
      }
    } else return null; // RDATE e o resto
  }
  if (!rule) return null;
  const repeat = REPEAT_OF[rule['FREQ']];
  if (!repeat) return null;
  const known = ['FREQ', 'INTERVAL', 'BYDAY', 'BYMONTHDAY', 'BYMONTH', 'BYSETPOS', 'UNTIL', 'COUNT', 'WKST'];
  if (Object.keys(rule).some((k) => !known.includes(k))) return null;
  const every = rule['INTERVAL'] ? Number(rule['INTERVAL']) : 1;
  if (!Number.isInteger(every) || every < 1 || every > 99) return null;
  const d = Number(date.slice(8));
  const m = Number(date.slice(5, 7));
  let days: number[] | undefined;
  if (rule['BYDAY']) {
    if (repeat !== 'semana') return null;
    const list = rule['BYDAY'].split(',').map((x) => BYDAY.indexOf(x.trim().toUpperCase()));
    if (list.some((x) => x < 0)) return null;
    days = [...new Set(list)].sort();
    if (days.length === 1 && days[0] === weekday(date)) days = undefined;
  }
  const monthDays = rule['BYMONTHDAY'];
  const setPos = rule['BYSETPOS'];
  const lastOfShort = (top: number) => monthDays === Array.from({ length: top - 27 }, (_, i) => 28 + i).join(',') && setPos === '-1';
  if (repeat === 'dia' && (monthDays || rule['BYMONTH'] || setPos)) return null;
  if (repeat === 'semana' && (monthDays || rule['BYMONTH'] || setPos)) return null;
  if (repeat === 'mes') {
    if (rule['BYMONTH']) return null;
    if (monthDays && !(monthDays === String(d) && !setPos) && !(d >= 29 && lastOfShort(d))) return null;
    if (setPos && !monthDays) return null;
  }
  if (repeat === 'ano') {
    if (rule['BYMONTH'] && rule['BYMONTH'] !== String(m)) return null;
    if (monthDays && !(monthDays === String(d) && !setPos) && !(m === 2 && d === 29 && lastOfShort(29))) return null;
    if (setPos && !monthDays) return null;
  }
  let until: string | undefined;
  if (rule['UNTIL']) {
    const day = icalDay(rule['UNTIL']);
    if (!day) return null;
    until = day;
  }
  const base: ParsedRule = { repeat, skip: [...new Set(skip)].sort(), ...(every > 1 ? { every } : {}), ...(days ? { days } : {}), ...(until ? { until } : {}) };
  if (rule['COUNT']) {
    const count = Number(rule['COUNT']);
    if (!Number.isInteger(count) || count < 1) return null;
    // N vezes: o último dia é o da N-ésima vez (os dias tirados contam, como no Google)
    const probe = { date, repeat, every: base.every, days: base.days, until: base.until, skip: [] as string[] };
    let seen = 0;
    let day = date;
    for (let i = 0; i < 40 * 366 && seen < count; i++, day = addDays(day, 1)) {
      if (occursOn(probe, day)) {
        seen++;
        if (seen === count) base.until = day;
      }
    }
    if (seen < count) return null;
  }
  return base;
}

/** O que fazer com um evento que veio do Google. */
export type Incoming =
  | { kind: 'upsert'; reminder: Reminder }
  | { kind: 'remove' }
  | { kind: 'skipDay'; masterEventId: string; day: string }
  | { kind: 'ignore'; reason: 'excecao' | 'repeticao' | 'tipo' | 'antigo' | 'invalido' };

/** O lembrete de um evento do Google (com as anotações e o que mais é só do Murall do lembrete que já existia). */
export function fromEvent(ev: GEvent, existing: Reminder | undefined, today: string): Incoming {
  if (ev.status === 'cancelled') {
    if (ev.recurringEventId) {
      const o = ev.originalStartTime;
      const day = o?.date ?? (o?.dateTime ? localParts(o.dateTime)?.day : undefined);
      return day ? { kind: 'skipDay', masterEventId: ev.recurringEventId, day } : { kind: 'ignore', reason: 'invalido' };
    }
    return { kind: 'remove' };
  }
  // uma vez de um evento que repete, mudada só nela: o Murall não sabe mostrar
  if (ev.recurringEventId) return { kind: 'ignore', reason: 'excecao' };
  if (ev.tipo && NOT_REMINDERS.includes(ev.tipo)) return { kind: 'ignore', reason: 'tipo' };
  let date: string;
  let time: string | undefined;
  /** Vários dias: o último (e, com horário, a hora em que acaba nele). */
  let end: string | undefined;
  let endTime: string | undefined;
  if (ev.start?.date && isDay(ev.start.date)) {
    date = ev.start.date;
    // o fim do dia todo é o dia seguinte ao último
    const days = ev.end?.date && isDay(ev.end.date) ? dayNumber(ev.end.date) - dayNumber(date) : 1;
    if (days > 1) end = addDays(date, days - 1);
  } else if (ev.start?.dateTime) {
    const s = localParts(ev.start.dateTime);
    if (!s) return { kind: 'ignore', reason: 'invalido' };
    date = s.day;
    time = s.time;
    const minutes = ev.end?.dateTime ? Math.round((Date.parse(ev.end.dateTime) - Date.parse(ev.start.dateTime)) / 60_000) : 60;
    // uma hora é o de sempre (sem fim guardado); o resto guarda onde acaba
    if (minutes > 0 && minutes !== 60) ({ end, endTime } = endAfter(date, time, minutes));
  } else return { kind: 'ignore', reason: 'invalido' };
  const rule = parseRecurrence(ev.recurrence, date);
  if (rule === null) return { kind: 'ignore', reason: 'repeticao' };
  // o que acabou faz tempo fica só no Google (o que já está no Murall continua acompanhando)
  if (!existing) {
    const last = rule ? (rule.until ?? null) : (end ?? date);
    if (last && last < addDays(today, -IMPORT_DAYS)) return { kind: 'ignore', reason: 'antigo' };
  }
  // os dias tirados lá como "só este evento" não estão na repetição: vêm de cada vez tirada, e ficam
  const known = rule ? [...new Set([...rule.skip, ...(existing?.google?.skip ?? [])])].sort() : [];
  const skip = rule ? [...new Set([...known, ...(existing?.repeat ? existing.skip : [])])].sort() : [];
  const updated = ev.updated && Number.isFinite(Date.parse(ev.updated)) ? new Date(ev.updated).toISOString() : new Date().toISOString();
  const lock: GoogleLink['lock'] =
    ev.seu === false ? 'convite' : ev.tipo && ev.tipo !== 'default' ? 'google' : rule && ((rule.every ?? 1) > 1 || rule.days?.length) ? 'repeticao' : undefined;
  const google: GoogleLink = {
    id: ev.id,
    ...(ev.etag ? { etag: ev.etag } : {}),
    at: updated,
    ...(ev.htmlLink ? { link: ev.htmlLink } : {}),
    ...(lock ? { lock } : {}),
    ...(rule ? { skip: known } : {}),
  };
  const reminder = sanitizeReminder({
    id: existing?.id ?? reminderIdFor(ev.id),
    title: ev.summary?.trim() || '(Sem título)',
    date,
    ...(time ? { time } : {}),
    ...(end ? { end } : {}),
    ...(endTime ? { endTime } : {}),
    ...(rule ? { repeat: rule.repeat, every: rule.every, days: rule.days, until: rule.until, skip } : {}),
    color: ev.colorId && STOCK_OF[ev.colorId] ? STOCK_OF[ev.colorId] : (existing?.color ?? DEFAULT_STOCK),
    notes: existing?.notes ?? [],
    createdAt: existing?.createdAt ?? updated,
    at: updated,
    google,
  });
  return reminder ? { kind: 'upsert', reminder } : { kind: 'ignore', reason: 'invalido' };
}
