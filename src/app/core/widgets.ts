import { DAY_MS } from './dates';
import { DEFAULT_TABLE_LOOK, TABLE_LOOKS, parseTableText, tableIsEmpty, tableLookOf, tableLookWord, writeTable } from './tables';
import { cap } from './text';
import { localImageId } from './images';
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
 *
 * A REGRA DO PDF: todo widget novo (ou jeito novo de um) precisa sair com a cara dele no "Salvar como
 * PDF" (ui/pdf-sheet.ts): a amostra em ui/pdf-sheet.samples.ts (o spec falha sem ela) e as páginas
 * conferidas com `node scripts/pdf-amostra.mjs` (ver DESIGN.md, "Salvar como PDF").
 */

/** Um campo do formulário do widget, no editor. */
export interface WidgetField {
  key: string;
  label: string;
  kind: 'text' | 'url' | 'date' | 'time' | 'number' | 'toggle' | 'choice' | 'card' | 'table';
  placeholder?: string;
  /** O campo só aparece (e só é pedido) quando isto diz que sim, pelos valores de agora; sem ele, sempre. */
  shown?(values: WidgetValues): boolean;
  /** O menor e o maior de um `number`. */
  range?: readonly [number, number];
  /** Sem ele, o widget não sai (o editor leva o foco para o primeiro que falta). */
  required?: true;
  /** As escolhas de `choice` (a primeira é a de quando nada foi escolhido). */
  options?: readonly { value: string; label: string }[];
  /** Uma linha miúda embaixo do campo (ou ao lado da caixinha). */
  hint?: string;
  /** Até quantas letras (os textos). */
  max?: number;
  /**
   * Como a folha do widget mostra a escolha: `tiles`, as miniaturas desenhadas de cada jeito (vão para a
   * parte "Aparência"); `segments`, os recortes do tamanho, também na Aparência; `select`, uma lista
   * que abre; `days`, os dias da semana em bolinhas. Sem ele, o seletor de recortes.
   */
  display?: 'tiles' | 'select' | 'days' | 'segments';
  /** Os campos com o mesmo `row` ficam lado a lado, numa linha só (o repete, o dia e a hora do contador). */
  row?: string;
  /** O que a folha diz quando ele falta ("Falta o dia"). */
  missing?: string;
  /** O link também pode ser uma imagem do aparelho (colada, solta ou escolhida): a folha oferece "Do aparelho". */
  upload?: true;
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
  /** Poucas palavras do que ele faz, na etiqueta do índice da folha ("Quanto falta para um dia"). */
  hint: string;
  /** O nome do que ele mostra, no alto dos campos ("O contador", "A imagem"). */
  what: string;
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
  /**
   * O que vai dentro de "{nome: …}" quando a anotação é copiada como texto (Ctrl+C nas marcadas, ver
   * `widgetCopy`): o que importa dele para quem lê fora do site (o link, quanto falta, o título da
   * nota). Todo widget novo precisa dizer o dele.
   */
  copy(args: readonly string[], ctx: CopyContext): string;
  /** O que está errado nos campos já preenchidos (um link que não serve), para o editor dizer. */
  problem?(values: WidgetValues): string | null;
  /** O que deu certo no link ("Vídeo do YouTube"), para a folha confirmar embaixo dele; null, nada a dizer. */
  found?(values: WidgetValues): string | null;
  /**
   * O jeito escolhido não tem tamanho (ele tem o do que mostra, como o texto inteiro da nota): a
   * frase que a folha diz no lugar do tamanho. Sem ele (ou null), o tamanho vale como sempre.
   */
  fixedSize?(values: WidgetValues): string | null;
  /** O widget nunca tem tamanho (a tabela tem a altura das linhas dela): a folha nem mostra a parte do tamanho. */
  unsized?: true;
  /**
   * O widget que mora em várias linhas (a tabela): as linhas que vão embaixo da marca dele. A marca
   * sem parâmetros não se escreve (a tabela branca é só o markdown dela; ver `widgetLines`).
   */
  body?(values: WidgetValues): string[] | null;
  /** O que a tirinha do editor diz do widget tocado, quando não é o texto dele (a tabela: "3 colunas, 4 linhas"). */
  summary?(values: WidgetValues): string;
}

/** Os campos que o painel mostra agora (os de `shown` só quando valem para os valores de agora). */
export function fieldsFor(def: WidgetDef, values: WidgetValues): WidgetField[] {
  return def.fields.filter((f) => !f.shown || f.shown(values));
}

/** O que a cópia do widget pode precisar saber de fora: a hora (o contador) e o título de uma ficha (a nota). */
export interface CopyContext {
  now: number;
  /** O título de agora da ficha com esse id (ela pode ter sido renomeada depois de colada); null, não achou. */
  cardTitle?(id: string): string | null;
}

/**
 * O widget como texto, para colar fora do site: "{audio: https://…}", "{contador: 34 dias e 12h
 * faltantes | Viagem}", "{nota: Lista de compras}". Uma chave só (com duas, colado de volta aqui, ele
 * viraria o widget de novo, sem o que faltou).
 */
export function widgetCopy(name: string, args: readonly string[], ctx: CopyContext): string {
  const def = widgetDef(name);
  if (!def) return '';
  const body = def.copy(args, ctx).replace(/\s+/g, ' ').trim();
  return body ? `{${def.name}: ${body}}` : `{${def.name}}`;
}

/** Os pedaços da cópia, separados por " | " como na marca (os vazios saem). */
function joinCopy(...parts: string[]): string {
  return parts.filter(Boolean).join(' | ');
}

/**
 * Uma linha que é só um widget: "{{nome: a | b}}" (ou "{{nome}}"). Os parâmetros vão até o último
 * "}}" (os espaços do fim saem em `splitArgs`): com o fim procurado a cada letra, uma linha longa sem
 * o "}}" travava a página.
 */
const LINE = /^\s*\{\{\s*([\p{L}][\p{L}\p{N}_-]*)\s*(?::([^\n]*))?\}\}\s*$/u;

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

// ===== O tamanho, que vale para todo widget =====

/**
 * O tamanho do widget, o mesmo para todos: cada tamanho é uma altura em linhas da pauta, e toda peça
 * (a foto, o vídeo, o bloquinho do contador, a fita, o disco, a tira) cresce até ela. Um vinil
 * pequeno ocupa o mesmo que uma imagem ou um contador pequenos. O médio é o de quando não se escreve.
 */
export type WidgetSize = 'mini' | 'pequeno' | 'medio' | 'grande';
export const WIDGET_SIZES: readonly { value: WidgetSize; label: string; hint: string }[] = [
  { value: 'mini', label: 'Mini', hint: 'Ocupa três linhas do texto.' },
  { value: 'pequeno', label: 'Pequeno', hint: 'Ocupa cinco linhas do texto.' },
  { value: 'medio', label: 'Médio', hint: 'Ocupa sete linhas do texto (o de quando não se escolhe).' },
  { value: 'grande', label: 'Grande', hint: 'Ocupa dez linhas do texto; na ficha do mural, até o fim dela.' },
];
/** Quantas linhas da pauta cada tamanho ocupa (ver ui/note-widget.ts). */
export const WIDGET_LINES: Readonly<Record<WidgetSize, number>> = { mini: 3, pequeno: 5, medio: 7, grande: 10 };
/** Os nomes que valem para cada tamanho, escritos à mão (sem acento, em minúsculas). */
const SIZE_WORDS: Record<string, WidgetSize> = {
  mini: 'mini',
  minimo: 'mini',
  minima: 'mini',
  minusculo: 'mini',
  minuscula: 'mini',
  pequeno: 'pequeno',
  pequena: 'pequeno',
  medio: 'medio',
  media: 'medio',
  grande: 'grande',
};
function sizeWord(a: string): WidgetSize | null {
  const k = key(a);
  return Object.hasOwn(SIZE_WORDS, k) ? SIZE_WORDS[k] : null;
}

/**
 * A linha é um widget conhecido? O nome (o do registro), os parâmetros e o tamanho. O tamanho é a
 * primeira palavra de tamanho entre os parâmetros, em qualquer lugar ("grande"), e sai deles: cada
 * widget lê só os dele.
 */
export function parseWidgetLine(line: string): { name: string; args: string[]; size: WidgetSize } | null {
  const m = LINE.exec(line);
  if (!m) return null;
  const def = widgetDef(m[1]);
  if (!def) return null;
  const args = splitArgs(m[2] ?? '');
  const at = args.findIndex((a) => sizeWord(a));
  const size = at === -1 ? 'medio' : sizeWord(args[at])!;
  if (at !== -1) args.splice(at, 1);
  return { name: def.name, args, size };
}

/**
 * A marca inteira de um widget, para pôr no texto. O tamanho vai no fim ("| grande"); o médio, que é
 * o de sempre, não se escreve, a não ser que um parâmetro seja uma palavra de tamanho (um contador
 * chamado "Grande"): aí ele vai antes dela, porque a primeira palavra de tamanho é o tamanho.
 */
export function widgetLine(name: string, args: readonly string[], size: WidgetSize = 'medio'): string {
  const parts = args.map(escapeArg);
  while (parts.length && !parts.at(-1)) parts.pop();
  const clash = parts.findIndex((a) => sizeWord(a));
  if (clash !== -1) parts.splice(clash, 0, size);
  else if (size !== 'medio') parts.push(size);
  return parts.length ? `{{${name}: ${parts.join(' | ')}}}` : `{{${name}}}`;
}

/**
 * As linhas que o widget ocupa no texto: a marca e, no que mora em várias linhas (a tabela), as de
 * baixo. A marca de um desses sem parâmetros não se escreve: a tabela de sempre é só o markdown dela.
 */
export function widgetLines(name: string, args: readonly string[], size: WidgetSize = 'medio', body?: readonly string[] | null): string[] {
  const def = widgetDef(name);
  if (!def?.body) return [widgetLine(name, args, size)];
  return [...(args.length ? [widgetLine(def.name, args)] : []), ...(body ?? [])];
}

// ===== O contador =====

/**
 * De quanto em quanto um contador que se repete volta: todo dia (só a hora), toda semana (o dia da
 * semana e a hora) ou todo mês (o dia do mês e a hora). O de todo ano é a data sem o ano.
 */
export type Every = 'dia' | 'semana' | 'mes';

/** A data de um contador. Sem ano, ele volta todo ano (aniversário, Natal); com `every`, mais vezes. */
export interface When {
  year: number | null;
  month: number;
  /** O dia do mês (no de todo mês, o dia em que ele volta; no de todo dia e de toda semana, 0). */
  day: number;
  hour: number;
  minute: number;
  /** A hora foi escrita (sem ela, meia-noite, e a data aparece sem hora). */
  timed: boolean;
  /** O que se repete mais que todo ano (sem ele, a data é uma só, ou a de todo ano). */
  every?: Every;
  /** O dia da semana do de toda semana: 0 é domingo, como no `Date`. */
  weekday?: number;
}

/** Os dias da semana como se escrevem: o nome por extenso e o "todo"/"toda" que vem antes dele. */
export const WEEKDAY_NAMES: readonly { name: string; short: string; every: string }[] = [
  { name: 'domingo', short: 'dom', every: 'todo domingo' },
  { name: 'segunda', short: 'seg', every: 'toda segunda' },
  { name: 'terça', short: 'ter', every: 'toda terça' },
  { name: 'quarta', short: 'qua', every: 'toda quarta' },
  { name: 'quinta', short: 'qui', every: 'toda quinta' },
  { name: 'sexta', short: 'sex', every: 'toda sexta' },
  { name: 'sábado', short: 'sáb', every: 'todo sábado' },
];

/** "todo dia" / "toda sexta" / "todo dia 5" / "todo ano": a regra do contador que se repete, em palavras. */
export function everyText(w: When): string {
  if (w.every === 'dia') return 'todo dia';
  if (w.every === 'semana') return WEEKDAY_NAMES[w.weekday ?? 0].every;
  if (w.every === 'mes') return `todo dia ${w.day}`;
  return w.year === null ? 'todo ano' : '';
}

/** O contador volta depois de chegar (todo dia, toda semana, todo mês ou todo ano)? */
export function repeats(w: When): boolean {
  return !!w.every || w.year === null;
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
  if (/^tod/i.test(t) || /^diariamente\b/i.test(key(t))) return parseEvery(t);
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

/** Os dias da semana como ficam sem acento, para ler o que foi escrito. */
const WEEKDAY_KEYS = WEEKDAY_NAMES.map((d) => key(d.name));

/** A hora que vem depois da regra ("18:00", "18h", ", às 18h30"); nada, meia-noite. null se não for hora. */
function readTime(rest: string): { hour: number; minute: number; timed: boolean } | null {
  const r = rest.replace(/^[\s,]+/, '');
  if (!r) return { hour: 0, minute: 0, timed: false };
  const h = TIME.exec(r);
  if (!h) return null;
  const hour = Number(h[1]);
  const minute = Number(h[2] ?? h[3] ?? 0);
  return hour > 23 || minute > 59 ? null : { hour, minute, timed: true };
}

/**
 * O contador que se repete, escrito em palavras:
 * - todo mês: "todo dia 5", "todo dia 5 18:00", "todo mês, dia 5 às 18h";
 * - todo dia (só a hora, que é obrigatória): "todo dia 18:00", "todos os dias às 7h", "diariamente 7h";
 * - toda semana: "toda sexta 18:00", "todas as segundas-feiras às 9h", "todo domingo".
 * "todo dia 18" é o dia 18 de todo mês; "todo dia 18h", às 18h de todo dia, como se fala.
 */
function parseEvery(raw: string): When | null {
  const s = key(raw).replace(/\s+/g, ' ').trim();
  const at = (every: Every, rest: string, extra: Partial<When>): When | null => {
    const time = readTime(rest);
    if (!time || (every === 'dia' && !time.timed)) return null;
    return { year: null, month: 0, day: 0, ...time, every, ...extra };
  };
  let m = /^(?:todo dia|todos os dias|todo mes,? (?:no )?dia|todos os meses,? (?:no )?dia) (\d{1,2})(?![\d:h])(.*)$/.exec(s);
  if (m) {
    const day = Number(m[1]);
    return day >= 1 && day <= 31 ? at('mes', m[2], { day }) : null;
  }
  m = /^(?:todo dia|todos os dias|diariamente|diario),?((?: .*)?)$/.exec(s);
  if (m) return at('dia', m[1], {});
  m = /^tod[oa]s? (?:os |as )?(domingo|segunda|terca|quarta|quinta|sexta|sabado)s?(?:[- ]feiras?)?((?:[ ,].*)?)$/.exec(s);
  if (m) return at('semana', m[2], { weekday: WEEKDAY_KEYS.indexOf(m[1]) });
  return null;
}

const pad = (n: number) => String(n).padStart(2, '0');

/**
 * A data escrita de volta, do jeito daqui: "19/11/2026 18:00", "19/11/2026" ou "25/12"; o que se
 * repete, em palavras: "todo dia 07:00", "toda sexta 18:00", "todo dia 5".
 */
export function writeWhen(w: When): string {
  if (w.every) {
    const time = w.timed ? ` ${pad(w.hour)}:${pad(w.minute)}` : '';
    return everyText(w) + time;
  }
  const date = `${pad(w.day)}/${pad(w.month)}` + (w.year === null ? '' : `/${w.year}`);
  return w.timed ? `${date} ${pad(w.hour)}:${pad(w.minute)}` : date;
}

/** Um dia inteiro: um contador de todo ano fica "chegou" até o fim do dia, e só então vira o ano. */

/**
 * Até quando o contador que se repete fica "chegou" antes de voltar a contar: o de todo dia, uma
 * hora (às 7h do remédio, logo depois já conta para amanhã); o de toda semana e o de todo mês, até o
 * fim daquele dia ("É hoje!").
 */
const EVERY_DAY_HOLD = 3_600_000;
function heldUntil(w: When, t: number): number {
  if (w.every === 'dia') return t + EVERY_DAY_HOLD;
  const d = new Date(t);
  return new Date(d.getFullYear(), d.getMonth(), d.getDate() + 1).getTime();
}

/** O próximo do contador que se repete (ou o de agora, enquanto ele ainda está "chegou"). */
function nextEvery(w: When, now: number): number {
  const base = new Date(now);
  const y = base.getFullYear();
  if (w.every === 'mes') {
    // num mês sem o dia (31 em abril), o último dia dele
    for (let i = -1; i < 3; i++) {
      const last = new Date(y, base.getMonth() + i + 1, 0).getDate();
      const t = new Date(y, base.getMonth() + i, Math.min(w.day, last), w.hour, w.minute).getTime();
      if (now < heldUntil(w, t)) return t;
    }
  }
  // todo dia: cada um dos dias; toda semana: só os do dia da semana dela
  for (let i = -7; i <= 8; i++) {
    const d = new Date(y, base.getMonth(), base.getDate() + i, w.hour, w.minute);
    if (w.every === 'semana' && d.getDay() !== w.weekday) continue;
    if (now < heldUntil(w, d.getTime())) return d.getTime();
  }
  return now;
}

/** O instante que o contador espera (o de todo ano: o próximo, ou o de hoje enquanto ele ainda é hoje). */
export function targetOf(w: When, now: number): number {
  if (w.every) return nextEvery(w, now);
  const at = (y: number) => new Date(y, w.month - 1, w.day, w.hour, w.minute).getTime();
  if (w.year !== null) return at(w.year);
  let y = new Date(now).getFullYear() - 1;
  // o de todo ano: o primeiro que ainda não passou de um dia (o 29/02 pula os anos sem ele)
  for (let i = 0; i < 10; i++, y++) {
    if (!validDay(y, w.month, w.day)) continue;
    const t = at(y);
    if (now < t + DAY_MS) return t;
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

/**
 * O jeito do contador: o bloquinho de calendário de destacar (o de sempre), o letreiro de neon com
 * números de relógio digital, o placar de plaquinhas que viram (de estação e aeroporto) ou o
 * bloquinho adesivo onde a conta é escrita à mão e os números de antes vão sendo riscados.
 */
export type CountdownLook = 'calendario' | 'neon' | 'placar' | 'riscado';
export const COUNTDOWN_LOOKS: readonly { value: CountdownLook; label: string }[] = [
  { value: 'calendario', label: 'Calendário' },
  { value: 'neon', label: 'Neon' },
  { value: 'placar', label: 'Placar' },
  { value: 'riscado', label: 'Riscado' },
];
/** Os nomes que valem para cada jeito, escritos à mão (sem acento, em minúsculas). */
const COUNTDOWN_LOOK_WORDS: Record<string, CountdownLook> = {
  calendario: 'calendario',
  bloquinho: 'calendario',
  neon: 'neon',
  digital: 'neon',
  placar: 'placar',
  letreiro: 'placar',
  aeroporto: 'placar',
  riscado: 'riscado',
  riscadinho: 'riscado',
  'post-it': 'riscado',
  postit: 'riscado',
  recado: 'riscado',
};
function countdownLookWord(a: string): CountdownLook | null {
  const k = key(a.trim());
  return Object.hasOwn(COUNTDOWN_LOOK_WORDS, k) ? COUNTDOWN_LOOK_WORDS[k] : null;
}

/**
 * Os parâmetros do contador em qualquer ordem: o que é data é a data; o primeiro que é o nome de um
 * jeito ("neon"), o jeito; o primeiro outro, o título.
 */
export function readCountdown(args: readonly string[]): { when: When | null; title: string; look: CountdownLook } {
  let when: When | null = null;
  let title = '';
  let look: CountdownLook | null = null;
  for (const a of args) {
    const w: When | null = when ? null : parseWhen(a);
    const l: CountdownLook | null = look ? null : countdownLookWord(a);
    if (w) when = w;
    else if (l) look = l;
    else if (!title && a) title = a;
  }
  return { when, title, look: look ?? 'calendario' };
}

/** De quanto em quanto o contador volta, no painel: o primeiro (uma vez só) é o de quando nada foi escolhido. */
const REPEAT_OPTIONS = [
  { value: '', label: 'Uma vez' },
  { value: 'dia', label: 'Todo dia' },
  { value: 'semana', label: 'Toda semana' },
  { value: 'mes', label: 'Todo mês' },
  { value: 'ano', label: 'Todo ano' },
] as const;
/** Os dias da semana no painel, de segunda a domingo (o valor é o do `Date`: 0 é domingo). */
const WEEKDAY_OPTIONS = [1, 2, 3, 4, 5, 6, 0].map((d) => ({ value: String(d), label: cap(WEEKDAY_NAMES[d].short) }));
const COUNTDOWN: WidgetDef = {
  name: 'contador',
  aliases: ['contagem', 'countdown'],
  label: 'Contador',
  about: 'Conta o tempo que falta até um dia e uma hora, uma vez só ou repetindo.',
  hint: 'Quanto falta para um dia',
  what: 'O contador',
  put: 'Pôr o contador',
  swap: 'Salvar o contador',
  fields: [
    { key: 'title', label: 'Título', kind: 'text', placeholder: 'Embarque, aniversário, lançamento…', max: 80 },
    { key: 'repeat', label: 'Repete', kind: 'choice', options: REPEAT_OPTIONS, display: 'select', row: 'quando' },
    { key: 'date', label: 'Dia', kind: 'date', required: true, missing: 'Falta o dia', row: 'quando', shown: (v) => !v['repeat'] || v['repeat'] === 'ano' },
    { key: 'weekday', label: 'Dia da semana', kind: 'choice', options: WEEKDAY_OPTIONS, display: 'days', shown: (v) => v['repeat'] === 'semana' },
    { key: 'monthDay', label: 'Dia do mês', kind: 'number', range: [1, 31], placeholder: '5', required: true, missing: 'Falta o dia do mês', row: 'quando', shown: (v) => v['repeat'] === 'mes', hint: 'Num mês sem esse dia (31 em abril), conta até o último dia dele.' },
    { key: 'time', label: 'Hora', kind: 'time', hint: 'Sem hora, conta até a meia-noite.', row: 'quando', shown: (v) => v['repeat'] !== 'dia' },
    // o de todo dia é só a hora: ela é obrigatória
    { key: 'time', label: 'Hora', kind: 'time', required: true, missing: 'Falta a hora', hint: 'Conta até essa hora, todo dia.', row: 'quando', shown: (v) => v['repeat'] === 'dia' },
    { key: 'look', label: 'Jeito', kind: 'choice', options: COUNTDOWN_LOOKS, display: 'tiles' },
  ],
  read(args) {
    const { when, title, look } = readCountdown(args);
    const none = { title, repeat: '', date: '', weekday: '', monthDay: '', time: '', look };
    if (!when) return none;
    const time = when.timed ? `${pad(when.hour)}:${pad(when.minute)}` : '';
    if (when.every === 'dia') return { ...none, repeat: 'dia', time };
    if (when.every === 'semana') return { ...none, repeat: 'semana', weekday: String(when.weekday ?? 1), time };
    if (when.every === 'mes') return { ...none, repeat: 'mes', monthDay: String(when.day), time };
    // o de todo ano aparece no campo com o ano que vem pela frente (o campo de data pede um ano)
    const year = when.year ?? new Date(targetOf(when, Date.now())).getFullYear();
    return { ...none, repeat: when.year === null ? 'ano' : '', date: `${year}-${pad(when.month)}-${pad(when.day)}`, time };
  },
  write(v) {
    const t = /^(\d{2}):(\d{2})/.exec(v['time'] ?? '');
    const time = { hour: t ? Number(t[1]) : 0, minute: t ? Number(t[2]) : 0, timed: !!t };
    const title = (v['title'] ?? '').trim();
    // como a faixa: o jeito de sempre (o calendário) não se escreve, a não ser que o título seja o
    // nome de um jeito (um contador chamado "Neon"), que aí precisa vir antes dele
    const look = countdownLookWord(v['look'] ?? '') ?? 'calendario';
    const named = !!title && !!countdownLookWord(title);
    const out = (w: When) => [writeWhen(w), named || look !== 'calendario' ? look : '', title].filter(Boolean);
    const repeat = v['repeat'] ?? '';
    if (repeat === 'dia') return t ? out({ year: null, month: 0, day: 0, ...time, every: 'dia' }) : null;
    if (repeat === 'semana') return out({ year: null, month: 0, day: 0, ...time, every: 'semana', weekday: Number(v['weekday'] || WEEKDAY_OPTIONS[0].value) });
    if (repeat === 'mes') {
      const day = Number((v['monthDay'] ?? '').trim());
      return Number.isInteger(day) && day >= 1 && day <= 31 ? out({ year: null, month: 0, day, ...time, every: 'mes' }) : null;
    }
    const d = /^(\d{4})-(\d{2})-(\d{2})$/.exec(v['date'] ?? '');
    if (!d) return null;
    const when: When = {
      year: repeat === 'ano' ? null : Number(d[1]),
      month: Number(d[2]),
      day: Number(d[3]),
      ...time,
    };
    if (!validDay(when.year ?? 2024, when.month, when.day)) return null;
    return out(when);
  },
  problem(v) {
    const day = (v['monthDay'] ?? '').trim();
    if (v['repeat'] !== 'mes' || !day) return null;
    const n = Number(day);
    return Number.isInteger(n) && n >= 1 && n <= 31 ? null : 'O dia do mês vai de 1 a 31.';
  },
  plain(args) {
    return readCountdown(args).title;
  },
  copy(args, { now }) {
    const { when, title } = readCountdown(args);
    // sem data, o que estiver escrito no lugar dela
    if (!when) return joinCopy(...args);
    return joinCopy(countdownLeft(when, now), title);
  },
};

/**
 * Quanto falta, em palavras curtas, para a cópia: as duas maiores unidades ("34 dias e 12h
 * faltantes", "3h e 20min faltantes"); chegou, "chegou em 19/11/2026" ("é hoje", o de todo ano).
 */
export function countdownLeft(w: When, now: number): string {
  const target = targetOf(w, now);
  const r = remaining(target, now);
  if (r.past) {
    if (w.every === 'dia') return 'é agora';
    if (repeats(w)) return 'é hoje';
    const at = new Date(target);
    return `chegou em ${pad(at.getDate())}/${pad(at.getMonth() + 1)}/${at.getFullYear()}` + (w.timed ? ` ${pad(w.hour)}:${pad(w.minute)}` : '');
  }
  const parts = [r.days && `${r.days} ${r.days === 1 ? 'dia' : 'dias'}`, r.hours && `${r.hours}h`, r.minutes && `${r.minutes}min`].filter(
    (x): x is string => !!x,
  );
  if (!parts.length) return 'menos de 1min faltante';
  const two = parts.slice(0, 2);
  const one = two.length === 1 && /^1\D/.test(two[0]);
  return `${two.join(' e ')} ${one ? 'faltante' : 'faltantes'}`;
}

// ===== A imagem e o vídeo: uma foto colada na cartolina =====

/** O jeito da foto colada: com a borda branca da foto revelada, polaroide ou recortada rente. */
export type Frame = 'foto' | 'polaroid' | 'recorte';
export const FRAMES: readonly { value: Frame; label: string }[] = [
  { value: 'foto', label: 'Foto' },
  { value: 'polaroid', label: 'Polaroide' },
  { value: 'recorte', label: 'Recorte' },
];
/** Os nomes que valem para cada moldura, escritos à mão (sem acento, em minúsculas). */
const FRAME_WORDS: Record<string, Frame> = { foto: 'foto', polaroid: 'polaroid', polaroide: 'polaroid', recorte: 'recorte', recortada: 'recorte' };
/** A moldura que uma palavra nomeia, ou null (só as palavras da lista: "constructor" não é moldura). */
function frameWord(a: string): Frame | null {
  const k = key(a);
  return Object.hasOwn(FRAME_WORDS, k) ? FRAME_WORDS[k] : null;
}

/** Um link com cara de link (o "https://" é conferido por quem usa). */
const LINKY = /^[a-z][a-z0-9+.-]*:\/\/\S+$/i;

/** O site de um link, sem o "www." ("youtube.com"); vazio se não for um link. */
export function hostOf(url: string): string {
  try {
    return new URL(url).hostname.replace(/^www\./, '');
  } catch {
    return '';
  }
}

/** A imagem: um link https, ou uma guardada pelo Murall (`murall://imagem/ID`, ver core/images.ts). */
export function imageUrlOk(url: string): boolean {
  return !!httpsUrl(url) || localImageId(url) !== null;
}

/** Só https: a imagem e o vídeo vêm de qualquer lugar da internet, mas nunca de um endereço sem cadeado. */
export function httpsUrl(raw: string): string | null {
  const t = raw.trim();
  if (!/^https:\/\/[^\s/]+\.[^\s/]+(\/\S*)?$/i.test(t)) return null;
  try {
    return new URL(t).href;
  } catch {
    return null;
  }
}

/** Os parâmetros da foto colada em qualquer ordem: o link, a moldura (uma das palavras) e a legenda. */
export function readMedia(args: readonly string[]): { url: string; frame: Frame; caption: string } {
  let url = '';
  let frame: Frame | null = null;
  let caption = '';
  for (const a of args) {
    const f = frameWord(a);
    if (!url && LINKY.test(a)) url = a;
    else if (!frame && f) frame = f;
    else if (!caption && a) caption = a;
  }
  return { url, frame: frame ?? 'foto', caption };
}

/** De onde o vídeo toca: YouTube e Vimeo pelo player deles, ou um arquivo de vídeo direto. */
export type VideoSource = { kind: 'youtube'; id: string; start: number } | { kind: 'vimeo'; id: string; hash: string | null } | { kind: 'file'; url: string };

/** "90", "1m30s", "1h2m3s" → segundos. */
function seconds(raw: string | null): number {
  if (!raw) return 0;
  if (/^\d+$/.test(raw)) return Number(raw);
  const m = /^(?:(\d+)h)?(?:(\d+)m)?(?:(\d+)s)?$/.exec(raw);
  return m ? Number(m[1] ?? 0) * 3600 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0) : 0;
}

/** O vídeo de um link (null: não é um vídeo que o site saiba tocar). */
export function parseVideo(raw: string): VideoSource | null {
  const href = httpsUrl(raw);
  if (!href) return null;
  const u = new URL(href);
  const host = u.hostname.replace(/^(www|m|music)\./, '');
  const path = u.pathname.split('/').filter(Boolean);
  const start = seconds(u.searchParams.get('t') ?? u.searchParams.get('start'));
  const yt = (id: string | null | undefined) => (id && /^[\w-]{11}$/.test(id) ? { kind: 'youtube' as const, id, start } : null);
  if (host === 'youtu.be') return yt(path[0]);
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    if (path[0] === 'watch') return yt(u.searchParams.get('v'));
    if (['shorts', 'embed', 'live', 'v'].includes(path[0])) return yt(path[1]);
    return null;
  }
  if (host === 'vimeo.com' || host === 'player.vimeo.com') {
    const at = path[0] === 'video' ? 1 : 0;
    const id = path[at];
    if (!id || !/^\d{4,12}$/.test(id)) return null;
    const hash = path[at + 1] && /^[\da-f]{6,20}$/i.test(path[at + 1]) ? path[at + 1] : u.searchParams.get('h');
    return { kind: 'vimeo', id, hash: hash && /^[\da-f]{6,20}$/i.test(hash) ? hash : null };
  }
  if (/\.(mp4|m4v|webm|ogv|ogg)$/i.test(u.pathname)) return { kind: 'file', url: href };
  return null;
}

const MEDIA_FIELDS = (link: WidgetField): readonly WidgetField[] => [
  link,
  { key: 'caption', label: 'Legenda', kind: 'text', placeholder: 'Opcional', max: 120 },
  { key: 'frame', label: 'Moldura', kind: 'choice', options: FRAMES, display: 'tiles' },
];

/** De onde vem o vídeo ou o som ("do YouTube", "de um arquivo .mp3"), para a folha confirmar o link. */
function sourceName(src: VideoSource | AudioSource): string {
  if (src.kind === 'youtube') return 'do YouTube';
  if (src.kind === 'vimeo') return 'do Vimeo';
  const ext = /\.([a-z0-9]+)$/i.exec(new URL(src.url).pathname)?.[1]?.toLowerCase();
  return ext ? `de um arquivo .${ext}` : 'de um arquivo';
}

/**
 * Os campos da foto colada viram os parâmetros: o link, a legenda e a moldura (a foto, que é a de
 * sempre, não se escreve). Uma legenda que é o nome de uma moldura ("Recorte") vai depois da
 * moldura, escrita mesmo quando é a foto: a primeira palavra de moldura é a moldura.
 */
function writeMedia(v: WidgetValues, ok: (url: string) => boolean): string[] | null {
  const url = (v['url'] ?? '').trim();
  if (!ok(url)) return null;
  const caption = (v['caption'] ?? '').trim();
  if (frameWord(caption)) return [url, v['frame'] || 'foto', caption];
  const frame = v['frame'] && v['frame'] !== 'foto' ? v['frame'] : '';
  return [url, caption, frame].filter(Boolean);
}

function readMediaValues(args: readonly string[]): WidgetValues {
  const { url, frame, caption } = readMedia(args);
  return { url, caption, frame };
}

/** A imagem e o vídeo copiados: o link e, se tiver, a legenda. */
function copyMedia(args: readonly string[]): string {
  const { url, caption } = readMedia(args);
  return joinCopy(url, caption);
}

const IMAGE: WidgetDef = {
  name: 'imagem',
  aliases: ['foto', 'image', 'img'],
  label: 'Imagem',
  about: 'Uma imagem do aparelho ou de um link, colada como foto.',
  hint: 'Uma foto do aparelho ou de um link',
  what: 'A imagem',
  put: 'Colar a imagem',
  swap: 'Salvar a imagem',
  fields: MEDIA_FIELDS({ key: 'url', label: 'Link da imagem', kind: 'url', placeholder: 'https://…/foto.jpg', required: true, missing: 'Falta a imagem', upload: true }),
  read: readMediaValues,
  write: (v) => writeMedia(v, imageUrlOk),
  plain: (args) => readMedia(args).caption,
  copy(args) {
    const { url, caption } = readMedia(args);
    // a guardada pelo Murall não abre fora dele: o endereço murall:// não diria nada a quem lê
    return joinCopy(localImageId(url) ? 'imagem guardada no Murall' : url, caption);
  },
  problem(v) {
    const url = (v['url'] ?? '').trim();
    return url && !imageUrlOk(url) ? 'O link precisa começar com https://' : null;
  },
  found(v) {
    if (localImageId(v['url'] ?? '')) return 'Imagem guardada no Murall';
    const url = httpsUrl(v['url'] ?? '');
    return url ? `Imagem de ${hostOf(url)}` : null;
  },
};

const VIDEO: WidgetDef = {
  name: 'video',
  aliases: ['filme', 'youtube'],
  label: 'Vídeo',
  about: 'Um vídeo do YouTube, do Vimeo ou um arquivo .mp4, que toca ali mesmo.',
  hint: 'YouTube, Vimeo ou .mp4',
  what: 'O vídeo',
  put: 'Colar o vídeo',
  swap: 'Salvar o vídeo',
  fields: MEDIA_FIELDS({ key: 'url', label: 'Link do vídeo', kind: 'url', placeholder: 'YouTube, Vimeo ou um .mp4', required: true, missing: 'Falta o link' }),
  read: readMediaValues,
  write: (v) => writeMedia(v, (url) => !!parseVideo(url)),
  plain: (args) => readMedia(args).caption,
  copy: copyMedia,
  problem(v) {
    const url = (v['url'] ?? '').trim();
    if (!url || parseVideo(url)) return null;
    return httpsUrl(url) ? 'Esse link não é de um vídeo que dê para tocar aqui: use um do YouTube, do Vimeo ou um arquivo .mp4.' : 'O link precisa começar com https://';
  },
  found(v) {
    const src = parseVideo(v['url'] ?? '');
    return src ? `Vídeo ${sourceName(src)}, toca aqui mesmo` : null;
  },
};

// ===== O áudio: uma faixa para tocar ali mesmo (de um arquivo de som ou do som de um vídeo) =====

/** O jeito da faixa: a fita cassete, o player simples (tocar e a barra) ou o vinil saindo da capa. */
export type AudioLook = 'fita' | 'simples' | 'vinil';
export const AUDIO_LOOKS: readonly { value: AudioLook; label: string }[] = [
  { value: 'fita', label: 'Fita cassete' },
  { value: 'simples', label: 'Simples' },
  { value: 'vinil', label: 'Vinil' },
];
/** Os nomes que valem para cada jeito, escritos à mão (sem acento, em minúsculas). */
const LOOK_WORDS: Record<string, AudioLook> = {
  fita: 'fita',
  cassete: 'fita',
  cassette: 'fita',
  k7: 'fita',
  'fita cassete': 'fita',
  simples: 'simples',
  player: 'simples',
  vinil: 'vinil',
  vinyl: 'vinil',
  disco: 'vinil',
  lp: 'vinil',
};
function lookWord(a: string): AudioLook | null {
  const k = key(a);
  return Object.hasOwn(LOOK_WORDS, k) ? LOOK_WORDS[k] : null;
}

/** De onde o som vem: um arquivo (de som ou de vídeo, que o navegador toca direto) ou o player do YouTube ou do Vimeo. */
export type AudioSource = Exclude<VideoSource, { kind: 'file' }> | { kind: 'file'; url: string };

const AUDIO_FILE = /\.(mp3|m4a|aac|oga|ogg|opus|wav|flac|weba|mp4|m4v|webm|mov)$/i;

/** O som de um link (null: não é um som que o site saiba tocar). */
export function parseAudio(raw: string): AudioSource | null {
  const href = httpsUrl(raw);
  if (!href) return null;
  if (AUDIO_FILE.test(new URL(href).pathname)) return { kind: 'file', url: href };
  const v = parseVideo(href);
  return v && v.kind !== 'file' ? v : null;
}

/** Os parâmetros da faixa em qualquer ordem: o link, o jeito (uma das palavras) e o nome da faixa. */
export function readAudio(args: readonly string[]): { url: string; look: AudioLook; title: string } {
  let url = '';
  let look: AudioLook | null = null;
  let title = '';
  for (const a of args) {
    const l = lookWord(a);
    if (!url && LINKY.test(a)) url = a;
    else if (!look && l) look = l;
    else if (!title && a) title = a;
  }
  return { url, look: look ?? 'fita', title };
}

const AUDIO: WidgetDef = {
  name: 'audio',
  aliases: ['som', 'musica', 'faixa', 'track'],
  label: 'Áudio',
  about: 'Uma faixa de som de um link (ou o som de um vídeo), para tocar ali mesmo.',
  hint: 'Uma faixa para tocar',
  what: 'A faixa',
  put: 'Pôr a faixa',
  swap: 'Salvar a faixa',
  fields: [
    { key: 'url', label: 'Link do som', kind: 'url', placeholder: 'Um .mp3, YouTube, Vimeo ou um .mp4', required: true, missing: 'Falta o link' },
    { key: 'title', label: 'Nome da faixa', kind: 'text', placeholder: 'Opcional: a música, o episódio…', max: 80 },
    { key: 'look', label: 'Jeito', kind: 'choice', options: AUDIO_LOOKS, display: 'tiles' },
  ],
  read(args) {
    const { url, look, title } = readAudio(args);
    return { url, title, look };
  },
  // como a foto colada: o jeito de sempre (a fita) não se escreve, a não ser que o nome seja uma das palavras
  write(v) {
    const url = (v['url'] ?? '').trim();
    if (!parseAudio(url)) return null;
    const title = (v['title'] ?? '').trim();
    if (lookWord(title)) return [url, v['look'] || 'fita', title];
    const look = v['look'] && v['look'] !== 'fita' ? v['look'] : '';
    return [url, title, look].filter(Boolean);
  },
  plain: (args) => readAudio(args).title,
  copy(args) {
    const { url, title } = readAudio(args);
    return joinCopy(url, title);
  },
  problem(v) {
    const url = (v['url'] ?? '').trim();
    if (!url || parseAudio(url)) return null;
    return httpsUrl(url)
      ? 'Esse link não é de um som que dê para tocar aqui: use um arquivo de áudio (.mp3, .ogg, .wav…), um vídeo do YouTube ou do Vimeo, ou um .mp4.'
      : 'O link precisa começar com https://';
  },
  found(v) {
    const src = parseAudio(v['url'] ?? '');
    return src ? `Som ${sourceName(src)}, toca aqui mesmo` : null;
  },
};

// ===== A nota: outra ficha, de qualquer mural, colada na cartolina =====

/**
 * O id de uma ficha escrito no widget: "#r…" (o "#" diz que é o id, e não o título). O id não muda
 * quando a ficha é renomeada; o título vai junto só para quem lê o texto (a busca) e para dizer qual
 * era, se ela sumir.
 */
const CARD_ID = /^#([A-Za-z0-9_-]{1,64})$/;

/**
 * A marca que vai no lugar do título quando a nota colada é uma ficha privada (ver `hideCardTitles`):
 * quem visita vê o aviso de que ela é privada, e não o de uma ficha apagada. Um cadeado: um site de
 * antes, que não conhece a marca, mostra o cadeado como o nome da ficha que sumiu.
 */
export const PRIVATE_CARD = '🔒';

/**
 * Os jeitos da nota colada. A ficha (o de sempre) e a capa têm o tamanho do widget; a tira e o texto
 * inteiro têm o do que mostram (uma linha; o texto todo da nota).
 * - `ficha`: a ficha simples do mural, encolhida;
 * - `capa`: só a capa e o nome, a ficha da vista "Só capa e nome" do mural;
 * - `tira`: só o nome, numa tira da cartolina dela (a ficha do Kanban em "Só os títulos");
 * - `inteira`: o nome e o texto todo, a nota como fica aberta, colada inteira na de fora.
 */
export type CardLook = 'ficha' | 'capa' | 'tira' | 'inteira';
export const CARD_LOOKS: readonly { value: CardLook; label: string }[] = [
  { value: 'ficha', label: 'Ficha' },
  { value: 'capa', label: 'Capa e título' },
  { value: 'tira', label: 'Só o título' },
  { value: 'inteira', label: 'Texto inteiro' },
];
/** Os jeitos sem tamanho: têm a altura do que mostram. */
const UNSIZED_LOOKS: readonly CardLook[] = ['tira', 'inteira'];
/** As palavras que valem como o jeito, escritas à mão (sem acento, em minúsculas). */
const CARD_LOOK_WORDS: Record<string, CardLook> = { ficha: 'ficha', capa: 'capa', tira: 'tira', inteira: 'inteira' };
function cardLookWord(a: string): CardLook | null {
  const k = key(a.trim());
  return Object.hasOwn(CARD_LOOK_WORDS, k) ? CARD_LOOK_WORDS[k] : null;
}

/**
 * Como o texto inteiro começa: aberto (o de sempre, não se escreve) ou fechado, só com o nome na
 * faixa (a seta da faixa abre e fecha, ali mesmo). Só vale para o texto inteiro.
 */
export type CardFold = 'aberta' | 'fechada';
export const CARD_FOLDS: readonly { value: CardFold; label: string }[] = [
  { value: 'aberta', label: 'Aberta' },
  { value: 'fechada', label: 'Fechada' },
];
const CARD_FOLD_WORDS: Record<string, CardFold> = { aberta: 'aberta', fechada: 'fechada' };
function cardFoldWord(a: string): CardFold | null {
  const k = key(a.trim());
  return Object.hasOwn(CARD_FOLD_WORDS, k) ? CARD_FOLD_WORDS[k] : null;
}

/**
 * Os parâmetros da nota em qualquer ordem: o id ("#r…"), o título, o jeito (a primeira palavra de
 * jeito: "capa", "tira", "inteira") e, no texto inteiro, como ele começa (a primeira palavra "aberta"
 * ou "fechada"). Escrita à mão, só com o título ("{{nota: Comprar um console}}"), ela é a anotação com
 * esse título, como um link "[[…]]". Com a marca `PRIVATE_CARD`, `hidden`: a ficha é privada (o texto
 * como foi para quem visita).
 */
export function readCardRef(args: readonly string[]): { id: string; title: string; hidden: boolean; look: CardLook; fold: CardFold } {
  let id = '';
  let title = '';
  let hidden = false;
  let look: CardLook | null = null;
  let fold: CardFold | null = null;
  for (const a of args) {
    const m = CARD_ID.exec(a);
    const l: CardLook | null = look ? null : cardLookWord(a);
    const f: CardFold | null = fold ? null : cardFoldWord(a);
    if (!id && m) id = m[1];
    else if (a === PRIVATE_CARD) hidden = true;
    else if (l) look = l;
    else if (f) fold = f;
    else if (!title && a) title = a;
  }
  return { id, title, hidden, look: look ?? 'ficha', fold: fold ?? 'aberta' };
}

/** O jeito tem o tamanho do widget? A tira e o texto inteiro, não (têm o do que mostram). */
export function cardLookSized(look: CardLook): boolean {
  return !UNSIZED_LOOKS.includes(look);
}

/**
 * Os parâmetros escritos da nota: o id, o título, o jeito (a ficha, o de sempre, não se escreve) e,
 * no texto inteiro, "fechada" (aberto é o de sempre). Um título que é uma dessas palavras ("Capa",
 * "Fechada") vai depois delas, que então se escrevem sempre: a primeira palavra de cada uma é ela.
 */
function cardArgs(id: string, title: string, look: CardLook, fold: CardFold = 'aberta'): string[] {
  const head = id ? [`#${id}`] : [];
  if (title && (cardLookWord(title) || cardFoldWord(title))) return [...head, look, fold, title];
  return [...head, title, look === 'ficha' ? '' : look, look === 'inteira' && fold === 'fechada' ? fold : ''].filter(Boolean);
}

/** As fichas coladas no texto (o id e o título de cada uma), na ordem. */
export function cardRefsIn(text: string): { id: string; title: string }[] {
  const out: { id: string; title: string }[] = [];
  for (const line of text.split(/\r?\n/)) {
    if (!line.includes('{{')) continue;
    const w = parseWidgetLine(line);
    if (w?.name !== 'nota') continue;
    const { id, title } = readCardRef(w.args);
    out.push({ id, title });
  }
  return out;
}

/**
 * O texto como vai para quem visita: a nota colada que é uma ficha sua que não está à mostra (privada)
 * perde o título, que ia escrito na marca só para você reconhecer; fica o id e, no lugar do título, a
 * marca `PRIVATE_CARD`: quem visita vê que a nota colada é privada (e não que ela foi apagada). A
 * escrita à mão, só com o título, é o que você escreveu, e fica como está (como um link "[[…]]").
 *
 * `hidden`: os ids fora da vista, ou quem diz se um id está fora (o envio do mural esconde tudo o que
 * não está à mostra, até a ficha apagada ou a de outra pessoa colada numa compartilhada). As linhas
 * são as da leitura (um "\r" sozinho também separa, ver `linesOf` em core/rich-text.ts), e o recuo da
 * linha fica (a nota colada embaixo de um item continua no item).
 */
export function hideCardTitles(text: string, hidden: ReadonlySet<string> | ((id: string) => boolean)): string {
  if (!text.includes('{{') || (typeof hidden !== 'function' && !hidden.size)) return text;
  const isHidden = typeof hidden === 'function' ? hidden : (id: string) => hidden.has(id);
  let changed = false;
  const next = text.replace(/[^\r\n]+/g, (line) => {
    if (!line.includes('{{')) return line;
    const w = parseWidgetLine(line);
    if (w?.name !== 'nota') return line;
    const ref = readCardRef(w.args);
    if (!ref.id || !isHidden(ref.id) || (ref.hidden && !ref.title)) return line;
    changed = true;
    const indent = /^\s*/.exec(line)![0];
    // o jeito vai junto (a privada colada como tira continua uma tira)
    return indent + widgetLine('nota', [`#${ref.id}`, PRIVATE_CARD, ...(ref.look === 'ficha' ? [] : [ref.look]), ...(ref.look === 'inteira' && ref.fold === 'fechada' ? [ref.fold] : [])], w.size);
  });
  return changed ? next : text;
}

const CARD: WidgetDef = {
  name: 'nota',
  aliases: ['ficha', 'anotacao', 'card', 'note'],
  label: 'Nota',
  about: 'Outra anotação ou ficha, de qualquer mural, colada aqui em miniatura.',
  hint: 'Outra ficha, colada aqui',
  what: 'A ficha',
  put: 'Colar a nota',
  swap: 'Salvar a nota',
  fields: [
    { key: 'id', label: 'Qual ficha', kind: 'card', required: true, missing: 'Falta escolher a ficha' },
    { key: 'look', label: 'Jeito', kind: 'choice', options: CARD_LOOKS, display: 'tiles' },
    {
      key: 'fold',
      label: 'Começa',
      kind: 'choice',
      options: CARD_FOLDS,
      display: 'segments',
      shown: (v) => cardLookWord(v['look'] ?? '') === 'inteira',
      hint: 'Fechada, mostra só o nome na faixa. A seta da faixa abre e fecha o texto ali mesmo.',
    },
  ],
  read(args) {
    const { id, title, look, fold } = readCardRef(args);
    return { id, title, look, fold };
  },
  write(v) {
    const id = (v['id'] ?? '').trim();
    const title = (v['title'] ?? '').trim();
    const look = cardLookWord(v['look'] ?? '') ?? 'ficha';
    const fold = cardFoldWord(v['fold'] ?? '') ?? 'aberta';
    if (id) return CARD_ID.test(`#${id}`) ? cardArgs(id, title, look, fold) : null;
    // a escrita à mão, só com o título, continua do jeito que estava
    return title ? cardArgs('', title, look, fold) : null;
  },
  fixedSize(v) {
    const look = cardLookWord(v['look'] ?? '') ?? 'ficha';
    if (look === 'tira') return 'Só o título ocupa duas linhas do texto, como a anotação no Kanban em "Só os títulos".';
    if (look === 'inteira') return 'O texto inteiro tem a altura do texto da nota: cresce e diminui com ele.';
    return null;
  },
  plain: (args) => readCardRef(args).title,
  copy(args, { cardTitle }) {
    const { id, title, hidden } = readCardRef(args);
    // o título de agora (renomeada depois de colada), o escrito na marca, ou o aviso de privada
    const now = id ? cardTitle?.(id)?.trim() : '';
    return now || title || (hidden ? 'nota privada' : '');
  },
};

// ===== A tabela: as linhas e colunas do markdown, editadas como numa planilha =====

/**
 * A tabela mora em várias linhas: a marca "{{tabela: listrada}}" (só o jeito, e só quando não é o de
 * sempre) e, logo embaixo, a tabela do markdown (ver core/tables.ts). Na folha, o campo `table` guarda
 * o markdown dela inteiro; quem lê a marca e a tabela do texto é o editor.
 */
const TABLE: WidgetDef = {
  name: 'tabela',
  aliases: ['table', 'tabelas', 'planilha'],
  label: 'Tabela',
  about: 'Linhas e colunas, escritas como numa planilha, em cinco jeitos.',
  hint: 'Linhas e colunas',
  what: 'A tabela',
  put: 'Pôr a tabela',
  swap: 'Salvar a tabela',
  fields: [
    { key: 'table', label: 'A tabela', kind: 'table', required: true, missing: 'Falta escrever na tabela' },
    { key: 'look', label: 'Jeito', kind: 'choice', options: TABLE_LOOKS, display: 'tiles' },
  ],
  read(args) {
    return { look: tableLookOf(args) };
  },
  write(v) {
    if (tableIsEmpty(parseTableText(v['table'] ?? ''))) return null;
    const look = tableLookWord(v['look'] ?? '') ?? DEFAULT_TABLE_LOOK;
    return look === DEFAULT_TABLE_LOOK ? [] : [look];
  },
  body(v) {
    const t = parseTableText(v['table'] ?? '');
    return tableIsEmpty(t) ? null : writeTable(t);
  },
  unsized: true,
  summary(v) {
    const t = parseTableText(v['table'] ?? '');
    const cols = t.head.length;
    const rows = t.rows.length + 1;
    const look = TABLE_LOOKS.find((o) => o.value === (tableLookWord(v['look'] ?? '') ?? DEFAULT_TABLE_LOOK))?.label ?? '';
    return `${cols} ${cols === 1 ? 'coluna' : 'colunas'}, ${rows} ${rows === 1 ? 'linha' : 'linhas'} · ${look}`;
  },
  // o texto dela é lido pela própria tabela (ver `plainText` em core/rich-text.ts); a marca sozinha não diz nada
  plain: () => '',
  copy: () => '',
};

/** Todos os widgets, na ordem da régua. */
export const WIDGETS: readonly WidgetDef[] = [COUNTDOWN, IMAGE, VIDEO, AUDIO, CARD, TABLE];

/** O widget por um dos nomes dele (com ou sem acento, maiúsculas). */
export function widgetDef(name: string): WidgetDef | null {
  const k = key(name);
  return WIDGETS.find((w) => w.name === k || w.aliases?.includes(k)) ?? null;
}
