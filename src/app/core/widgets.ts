/**
 * Os widgets das anotações: peças vivas que moram no próprio texto, numa linha só delas, como as
 * outras marcas (ver core/rich-text.ts):
 *
 *   {{contador: 19/11/2026 18:00 | Lançamento do GTA VI}}
 *
 * O nome do widget vem antes dos dois-pontos; depois, os parâmetros separados por "|" (um "\|" fica
 * no parâmetro). Só parâmetros leves: textos, números, datas, links. Nada de arquivo.
 *
 * Cada widget diz quais campos tem (o editor monta o formulário com eles), como lê os parâmetros
 * escritos e como os escreve de volta. Um nome que este site não conhece fica como texto: um site
 * mais novo pode ter widgets que um antigo ainda não sabe desenhar, e o texto continua lá.
 */

/** Um campo do formulário do widget, no editor. */
export interface WidgetField {
  key: string;
  label: string;
  kind: 'text' | 'date' | 'time' | 'toggle';
  placeholder?: string;
  /** Uma linha miúda embaixo do campo (ou ao lado da caixinha). */
  hint?: string;
  /** Até quantas letras (os textos). */
  max?: number;
}

export type WidgetValues = Record<string, string>;

export interface WidgetDef {
  /** O nome escrito no texto ("contador"). */
  name: string;
  /** Outros nomes que também valem ("contagem"), sem acento e em minúsculas. */
  aliases?: readonly string[];
  /** O nome na régua e no título do painel. */
  label: string;
  /** Uma frase do que ele faz. */
  about: string;
  /** O botão que põe no texto ("Pôr o contador") e o que troca o que já estava ("Trocar o contador"). */
  put: string;
  swap: string;
  fields: readonly WidgetField[];
  /** Os parâmetros escritos viram os valores dos campos. */
  read(args: readonly string[]): WidgetValues;
  /** Os valores dos campos viram os parâmetros escritos; null, falta o que ele precisa. */
  write(values: WidgetValues): string[] | null;
  /** O texto do widget para o que lê palavras (a busca, a contagem de palavras). */
  plain(args: readonly string[]): string;
}

/** Uma linha que é só um widget: "{{nome: a | b}}" (ou "{{nome}}"). */
const LINE = /^\s*\{\{\s*([\p{L}][\p{L}\p{N}_-]*)\s*(?::([^\n]*?))?\s*\}\}\s*$/u;

/** "Contagem" → "contagem": sem acento, em minúsculas. */
function key(name: string): string {
  return name.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase();
}

/** Os parâmetros de "a | b \| c" → ["a", "b | c"]. */
export function splitArgs(raw: string): string[] {
  if (!raw.trim()) return [];
  return raw.split(/(?<!\\)\|/).map((a) => a.replace(/\\\|/g, '|').trim());
}

/** O parâmetro escrito de volta: sem quebra de linha, o "|" escapado e sem "}}", que fecharia a marca. */
function escapeArg(v: string): string {
  return v
    .replace(/\s+/g, ' ')
    .replace(/\}\}/g, '} }')
    .replace(/\|/g, '\\|')
    .trim();
}

/** A linha é um widget conhecido? O nome (o do registro) e os parâmetros. */
export function parseWidgetLine(line: string): { name: string; args: string[] } | null {
  const m = LINE.exec(line);
  if (!m) return null;
  const def = widgetDef(m[1]);
  return def ? { name: def.name, args: splitArgs(m[2] ?? '') } : null;
}

/** A marca inteira de um widget, para pôr no texto. */
export function widgetLine(name: string, args: readonly string[]): string {
  const parts = args.map(escapeArg);
  while (parts.length && !parts.at(-1)) parts.pop();
  return parts.length ? `{{${name}: ${parts.join(' | ')}}}` : `{{${name}}}`;
}

// ===== O contador =====

/** A data de um contador. Sem ano, ele volta todo ano (aniversário, Natal). */
export interface When {
  year: number | null;
  month: number;
  day: number;
  hour: number;
  minute: number;
  /** A hora foi escrita (sem ela, meia-noite, e a data aparece sem hora). */
  timed: boolean;
}

const PT_DATE = /^(\d{1,2})[/.-](\d{1,2})(?:[/.-](\d{4}|\d{2}))?(?!\d)/;
const ISO_DATE = /^(\d{4})-(\d{1,2})-(\d{1,2})/;
/** A hora depois da data: "18:00", "18h", "18h30", "às 18h", "T18:00". */
const TIME = /^(?:\s*(?:,|às|as|a|-|T)?\s*)(\d{1,2})(?::(\d{2})|h(\d{2})?)$/i;

function validDay(year: number, month: number, day: number): boolean {
  const d = new Date(year, month - 1, day);
  return d.getFullYear() === year && d.getMonth() === month - 1 && d.getDate() === day;
}

/**
 * "19/11/2026 18:00", "19/11/2026", "19/11" (todo ano), "2026-11-19T18:00", "19/11/26 às 18h"…
 * null se não for uma data que existe.
 */
export function parseWhen(raw: string): When | null {
  const t = raw.trim();
  let year: number | null;
  let month: number;
  let day: number;
  let rest: string;
  let m = ISO_DATE.exec(t);
  if (m) {
    [year, month, day] = [Number(m[1]), Number(m[2]), Number(m[3])];
    rest = t.slice(m[0].length);
  } else {
    m = PT_DATE.exec(t);
    if (!m) return null;
    day = Number(m[1]);
    month = Number(m[2]);
    year = m[3] === undefined ? null : m[3].length === 2 ? 2000 + Number(m[3]) : Number(m[3]);
    rest = t.slice(m[0].length);
  }
  let hour = 0;
  let minute = 0;
  let timed = false;
  if (rest.trim()) {
    const h = TIME.exec(rest);
    if (!h) return null;
    hour = Number(h[1]);
    minute = Number(h[2] ?? h[3] ?? 0);
    if (hour > 23 || minute > 59) return null;
    timed = true;
  }
  // sem ano, o dia precisa existir em algum ano (29/02 existe nos bissextos)
  if (!validDay(year ?? 2024, month, day)) return null;
  return { year, month, day, hour, minute, timed };
}

const pad = (n: number) => String(n).padStart(2, '0');

/** A data escrita de volta, do jeito daqui: "19/11/2026 18:00", "19/11/2026" ou "25/12". */
export function writeWhen(w: When): string {
  const date = `${pad(w.day)}/${pad(w.month)}` + (w.year === null ? '' : `/${w.year}`);
  return w.timed ? `${date} ${pad(w.hour)}:${pad(w.minute)}` : date;
}

/** Um dia inteiro: um contador de todo ano fica "chegou" até o fim do dia, e só então vira o ano. */
const DAY = 86_400_000;

/** O instante que o contador espera (o de todo ano: o próximo, ou o de hoje enquanto ele ainda é hoje). */
export function targetOf(w: When, now: number): number {
  const at = (y: number) => new Date(y, w.month - 1, w.day, w.hour, w.minute).getTime();
  if (w.year !== null) return at(w.year);
  let y = new Date(now).getFullYear() - 1;
  // o de todo ano: o primeiro que ainda não passou de um dia (o 29/02 pula os anos sem ele)
  for (let i = 0; i < 10; i++, y++) {
    if (!validDay(y, w.month, w.day)) continue;
    const t = at(y);
    if (now < t + DAY) return t;
  }
  return at(y);
}

/** Quanto falta (ou, passado, quanto passou), em dias, horas, minutos e segundos. */
export interface Remaining {
  past: boolean;
  days: number;
  hours: number;
  minutes: number;
  seconds: number;
}

export function remaining(target: number, now: number): Remaining {
  const past = now >= target;
  // quanto falta conta para cima (faltam 0,4 s: ainda 1 segundo); quanto passou, para baixo
  const ms = past ? now - target : target - now;
  let s = past ? Math.floor(ms / 1000) : Math.ceil(ms / 1000);
  const days = Math.floor(s / 86400);
  s -= days * 86400;
  const hours = Math.floor(s / 3600);
  s -= hours * 3600;
  const minutes = Math.floor(s / 60);
  return { past, days, hours, minutes, seconds: s - minutes * 60 };
}

/** Os parâmetros do contador em qualquer ordem: o que é data é a data; o primeiro outro, o título. */
export function readCountdown(args: readonly string[]): { when: When | null; title: string } {
  let when: When | null = null;
  let title = '';
  for (const a of args) {
    const w: When | null = when ? null : parseWhen(a);
    if (w) when = w;
    else if (!title && a) title = a;
  }
  return { when, title };
}

const COUNTDOWN: WidgetDef = {
  name: 'contador',
  aliases: ['contagem', 'countdown'],
  label: 'Contador',
  about: 'Conta o tempo que falta até um dia e uma hora.',
  put: 'Pôr o contador',
  swap: 'Trocar o contador',
  fields: [
    { key: 'title', label: 'Para quê', kind: 'text', placeholder: 'Lançamento, aniversário, viagem…', max: 80 },
    { key: 'date', label: 'Dia', kind: 'date' },
    { key: 'time', label: 'Hora', kind: 'time', hint: 'Sem hora, conta até a meia-noite.' },
    { key: 'yearly', label: 'Todo ano', kind: 'toggle', hint: 'Aniversário, Natal: no dia seguinte, volta a contar para o próximo ano.' },
  ],
  read(args) {
    const { when, title } = readCountdown(args);
    if (!when) return { title, date: '', time: '', yearly: '' };
    // o de todo ano aparece no campo com o ano que vem pela frente (o campo de data pede um ano)
    const year = when.year ?? new Date(targetOf(when, Date.now())).getFullYear();
    return {
      title,
      date: `${year}-${pad(when.month)}-${pad(when.day)}`,
      time: when.timed ? `${pad(when.hour)}:${pad(when.minute)}` : '',
      yearly: when.year === null ? '1' : '',
    };
  },
  write(v) {
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v['date'] ?? '');
    if (!d) return null;
    const t = /^(\d{2}):(\d{2})/.exec(v['time'] ?? '');
    const when: When = {
      year: v['yearly'] ? null : Number(d[1]),
      month: Number(d[2]),
      day: Number(d[3]),
      hour: t ? Number(t[1]) : 0,
      minute: t ? Number(t[2]) : 0,
      timed: !!t,
    };
    if (!validDay(when.year ?? 2024, when.month, when.day)) return null;
    const title = (v['title'] ?? '').trim();
    return title ? [writeWhen(when), title] : [writeWhen(when)];
  },
  plain(args) {
    return readCountdown(args).title;
  },
};

/** Todos os widgets, na ordem da régua. */
export const WIDGETS: readonly WidgetDef[] = [COUNTDOWN];

/** O widget por um dos nomes dele (com ou sem acento, maiúsculas). */
export function widgetDef(name: string): WidgetDef | null {
  const k = key(name);
  return WIDGETS.find((w) => w.name === k || w.aliases?.includes(k)) ?? null;
}
