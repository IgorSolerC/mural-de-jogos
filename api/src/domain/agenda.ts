import { HttpError } from '../errors';
import { base64url } from './bytes';

/**
 * O Google Agenda do Calendário: a cifra do refresh token e o que passa entre o site e o Google. A API é
 * só um intermediário com a permissão guardada: quem converte lembrete em evento (e de volta) é o site,
 * que sabe o fuso de quem usa (ver src/app/core/google-agenda.ts no site).
 */

/** A permissão pedida ao Google: ver e mudar eventos (o site usa só a agenda principal). */
export const AGENDA_SCOPE = 'https://www.googleapis.com/auth/calendar.events';
export const GOOGLE_AUTH_URL = 'https://accounts.google.com/o/oauth2/v2/auth';
export const GOOGLE_TOKEN_URL = 'https://oauth2.googleapis.com/token';
export const GOOGLE_REVOKE_URL = 'https://oauth2.googleapis.com/revoke';
export const CALENDAR_URL = 'https://www.googleapis.com/calendar/v3/calendars/primary/events';

/** Os secrets do Worker (ou variáveis do Node). Sem os dois, o Google Agenda fica indisponível. */
export interface AgendaKeys {
  /** O client secret do cliente OAuth do site (o mesmo client ID do login). */
  clientSecret: string;
  /** 32 bytes em base64 (ou base64url): a chave que cifra o refresh token no banco. */
  key: string;
  /**
   * Só estas contas (pelo código) veem o Google Agenda: enquanto o app está "em teste" no Google, só os
   * usuários de teste conseguem dar a permissão. Vazio: ninguém; `*`: todo mundo (depois da verificação).
   */
  codes: string[];
}

export function readAgendaKeys(env: Record<string, unknown>): AgendaKeys {
  const text = (k: string) => (typeof env[k] === 'string' ? (env[k] as string).trim() : '');
  // o código como aparece (K7QF-M2XA) ou como fica no banco (K7QFM2XA): vale sem o traço
  const codes = text('AGENDA_CODIGOS')
    .split(',')
    .map((c) => (c.trim() === '*' ? '*' : plainCode(c)))
    .filter(Boolean);
  return { clientSecret: text('GOOGLE_CLIENT_SECRET'), key: text('AGENDA_CHAVE'), codes };
}

/** O código da conta sem o traço e em maiúsculas, para comparar. */
export function plainCode(code: string): string {
  return code.toUpperCase().replace(/[^0-9A-Z]/g, '');
}

function fromBase64(text: string): Uint8Array<ArrayBuffer> {
  const b64 = text.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  const out = new Uint8Array(new ArrayBuffer(bin.length));
  for (let i = 0; i < bin.length; i++) out[i] = bin.charCodeAt(i);
  return out;
}

async function aesKey(secret: string): Promise<CryptoKey> {
  const raw = fromBase64(secret);
  if (raw.length !== 32) throw new HttpError(503, 'agenda-indisponivel', 'O Google Agenda não está configurado no servidor.');
  return crypto.subtle.importKey('raw', raw, 'AES-GCM', false, ['encrypt', 'decrypt']);
}

/** Cifra um texto: o iv e o resultado, em base64url, separados por um ponto. */
export async function seal(secret: string, text: string): Promise<string> {
  const iv = crypto.getRandomValues(new Uint8Array(12));
  const data = await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await aesKey(secret), new TextEncoder().encode(text));
  return `${base64url(iv)}.${base64url(new Uint8Array(data))}`;
}

export async function open(secret: string, sealed: string): Promise<string> {
  const [iv = '', data = ''] = sealed.split('.');
  const plain = await crypto.subtle.decrypt({ name: 'AES-GCM', iv: fromBase64(iv) }, await aesKey(secret), fromBase64(data));
  return new TextDecoder().decode(plain);
}

// ===== O que vai para o Google =====

const EVENT_ID = /^[a-v0-9]{5,1024}$/;
/** Uma vez de um evento que repete: o id dele, o dia e, com horário, a hora do começo em UTC (`abc123_20261027T120000Z`). */
const INSTANCE_ID = /^[a-v0-9]{5,1000}_\d{8}(T\d{6}Z)?$/;
const DAY = /^\d{4}-\d{2}-\d{2}$/;
const DATE_TIME = /^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}(:\d{2})?$/;
const TIME_ZONE = /^[A-Za-z_]+(\/[A-Za-z0-9_+-]+){0,2}$/;

export function isEventId(v: unknown): v is string {
  return typeof v === 'string' && EVENT_ID.test(v);
}

/** Uma vez só de um evento que repete (a que se tira de um dia, ou a mudada só nele). */
export function isInstanceId(v: unknown): v is string {
  return typeof v === 'string' && INSTANCE_ID.test(v);
}

type When = { date: string } | { dateTime: string; timeZone: string };

function when(v: unknown): When | null {
  if (!v || typeof v !== 'object') return null;
  const r = v as Record<string, unknown>;
  if (typeof r['date'] === 'string' && DAY.test(r['date'])) return { date: r['date'] };
  if (typeof r['dateTime'] === 'string' && DATE_TIME.test(r['dateTime']) && typeof r['timeZone'] === 'string' && TIME_ZONE.test(r['timeZone'])) {
    return { dateTime: r['dateTime'], timeZone: r['timeZone'] };
  }
  return null;
}

/**
 * O evento que o site manda, só com os campos que o Murall escreve (nada de convidados, lugar ou
 * conferência): o nome, quando começa e acaba, a repetição (RRULE e EXDATE), a cor e a descrição.
 */
export function cleanEvent(raw: unknown): Record<string, unknown> {
  const bad = () => new HttpError(400, 'evento-invalido', 'O lembrete não virou um evento válido.');
  if (!raw || typeof raw !== 'object') throw bad();
  const r = raw as Record<string, unknown>;
  const start = when(r['start']);
  const end = when(r['end']);
  if (!start || !end || ('date' in start) !== ('date' in end)) throw bad();
  const summary = typeof r['summary'] === 'string' ? r['summary'].slice(0, 1024) : '';
  const out: Record<string, unknown> = { summary, start, end, status: 'confirmed' };
  if (r['recurrence'] !== undefined) {
    const list = r['recurrence'];
    if (!Array.isArray(list) || list.length > 10 || !list.every((x) => typeof x === 'string' && x.length <= 4000 && /^(RRULE|EXDATE)[:;]/.test(x))) throw bad();
    out['recurrence'] = list;
  }
  if (r['colorId'] !== undefined) {
    if (r['colorId'] !== null && !(typeof r['colorId'] === 'string' && /^(1[01]?|[2-9])$/.test(r['colorId']))) throw bad();
    out['colorId'] = r['colorId'];
  }
  if (typeof r['description'] === 'string') out['description'] = r['description'].slice(0, 8000);
  return out;
}

// ===== O que volta do Google =====

/** O evento como o site precisa: os campos do Murall e o que diz se ele pode mexer. */
export function trimEvent(raw: Record<string, unknown>): Record<string, unknown> {
  const organizer = raw['organizer'] as { self?: boolean } | undefined;
  const attendees = Array.isArray(raw['attendees']) ? raw['attendees'] : [];
  const pick = (k: string) => (raw[k] === undefined ? {} : { [k]: raw[k] });
  return {
    id: raw['id'],
    status: raw['status'],
    ...pick('summary'),
    ...pick('start'),
    ...pick('end'),
    ...pick('recurrence'),
    ...pick('recurringEventId'),
    ...pick('originalStartTime'),
    ...pick('colorId'),
    ...pick('updated'),
    ...pick('etag'),
    ...pick('htmlLink'),
    tipo: typeof raw['eventType'] === 'string' ? raw['eventType'] : 'default',
    // sem organizador, ou o próprio: é seu; um convite de outra pessoa só se muda lá
    seu: !organizer || organizer.self === true,
    convidados: attendees.length,
  };
}
