/**
 * O texto das fichas com formatação, guardado como texto simples com marcas leves (um markdown):
 *
 * - Na linha: **negrito**, *itálico* (ou _itálico_), ~~riscado~~, ==marca-texto==, `código`,
 *   [texto](https://endereço), endereços soltos (https://…) e, nas anotações, links para outras
 *   anotações ("[[Título]]", ver core/note-links.ts). Uma barra antes de uma marca a escreve como é
 *   ("\*" é um asterisco).
 * - Os símbolos escritos com sinais: "->" →, "<-" ←, "<->" ↔, "-->" ⟶, "<--" ⟵, "=>" ⇒, "<=>" ⇔,
 *   "==>" ⟹, "<==" ⟸, "!=" ≠, ">=" ≥, "<=" ≤, "~=" ≈ e "+-" ±. Fora do código e dos links; com a
 *   barra antes do último sinal ("-\>"), ficam como são.
 * - Em blocos: títulos ("# ", "## ", "### "), listas ("- item", "1. item"), checklists ("- [ ] tarefa",
 *   "- [x] feita"), citações ("> "), a divisória ("---"), tabelas (as linhas com "|", a segunda só de
 *   traços) e blocos de código (entre "```").
 *
 * O texto continua sendo uma string: as resenhas antigas não mudam, o backup e a nuvem não mudam, e
 * um site antigo mostra as marcas cruas. Nunca vira HTML: quem desenha é o próprio Angular, a partir
 * destes blocos (ver ui/rich-text.ts).
 */

/** Um pedaço de texto corrido, com as marcas que valem para ele. */
export interface Span {
  text: string;
  bold?: true;
  italic?: true;
  strike?: true;
  /** ==marca-texto== */
  mark?: true;
  /** `código`: o texto como foi escrito, sem marcas. */
  code?: true;
  /** Um link "[[título]]" (ou "[[título|texto]]"): `text` é o que aparece, sem os colchetes. */
  link?: true;
  /** No "[[título|texto]]": o título da anotação que o link abre (sem o campo, é o próprio `text`). */
  ref?: string;
  /** Um link para fora (https:, mailto:): o endereço; `text` é o que aparece. */
  href?: string;
}

/** "[[título]]": sem colchetes nem quebra de linha dentro, e com algo além de espaços. */
export const LINK = /\[\[([^[\]\n]*[^[\]\s][^[\]\n]*)\]\]/g;
export const HAS_LINK = new RegExp(LINK.source);
/** Um endereço para fora: [texto](https://…) ou um https:// solto. */
const HAS_URL = /\]\((?:https?:\/\/|mailto:)|https?:\/\/\S/;
/** Cada pedaço lido inteiro (link, código, marca escapada) vira um caractere de uso privado enquanto as ênfases são lidas. */
const SLOT = 0xe000;

/** Uma linha de lista; `line` é o número da linha no texto (para marcar a tarefa no lugar certo). */
export interface ListItem {
  spans: Span[];
  line: number;
  /** Só nos checklists: a tarefa feita. */
  done?: boolean;
}

/** O alinhamento de uma coluna da tabela (":--", ":-:", "--:"); null, o de sempre. */
export type Align = 'left' | 'center' | 'right' | null;

/**
 * Os blocos do texto. O de texto corrido guarda cada linha como foi escrita, as em branco também
 * (uma linha da pauta cada): sem marcas, a leitura sai igual à de sempre.
 */
export type Block =
  | { kind: 'p'; lines: Span[][] }
  | { kind: 'ul'; items: ListItem[] }
  | { kind: 'ol'; items: ListItem[]; start: number }
  | { kind: 'check'; items: ListItem[] }
  | { kind: 'h'; level: 1 | 2 | 3; spans: Span[] }
  | { kind: 'quote'; lines: Span[][] }
  | { kind: 'hr' }
  | { kind: 'code'; text: string }
  | { kind: 'table'; align: Align[]; head: Span[][]; rows: Span[][][] };

const CHECK = /^\s*[-*•]\s+\[([ xX])\]\s?(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*(\d{1,4})[.)]\s+(.*)$/;
const HEADING = /^(#{1,3})\s+(.*\S.*)$/;
const QUOTE = /^\s*>\s?(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
const FENCE = /^\s*```/;
/** A linha de traços embaixo do cabeçalho da tabela: "| --- | :-: |". */
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** A linha de traços da tabela ("| --- | :-: |"). */
export function isTableSep(line: string): boolean {
  return line.includes('-') && TABLE_SEP.test(line);
}

type LineKind = { kind: 'check'; done: boolean; rest: string } | { kind: 'ul'; rest: string } | { kind: 'ol'; n: number; rest: string } | { kind: 'p'; rest: string };

/** Que tipo de linha de lista é: tarefa, item de lista, item numerado ou texto. */
export function lineKind(line: string): LineKind {
  let m = CHECK.exec(line);
  if (m) return { kind: 'check', done: m[1] !== ' ', rest: m[2] };
  m = NUMBER.exec(line);
  if (m) return { kind: 'ol', n: Number(m[1]), rest: m[2] };
  // "* * *" é a divisória, não um item
  if (RULE.test(line)) return { kind: 'p', rest: line };
  m = BULLET.exec(line);
  // "**negrito** no começo" não é item de lista: o marcador precisa de um espaço depois
  if (m && !/^\s*\*\*/.test(line)) return { kind: 'ul', rest: m[1] };
  return { kind: 'p', rest: line };
}

/** Os pedaços lidos inteiros, antes das ênfases: a marca escapada, o código, o link de anotação, o link para fora e o endereço solto. */
const ATOMS = /\\([\\`*_~=[\]|#>-])|`([^`\n]+)`|\[\[([^[\]\n]*[^[\]\s][^[\]\n]*)\]\]|\[([^[\]\n]+)\]\(((?:https?:\/\/|mailto:)[^\s)]+)\)|(https?:\/\/[^\s<>()[\]]*[^\s<>()[\].,;:!?'"’”])/g;

type Atom = { kind: 'lit'; text: string } | { kind: 'code'; text: string } | { kind: 'note'; title: string; label: string } | { kind: 'url'; text: string; href: string };

/** "Título|texto" → o título da anotação e o que aparece (sem "|", os dois são o título). */
export function splitLink(inner: string): { title: string; label: string } {
  const bar = inner.indexOf('|');
  if (bar === -1) return { title: inner.trim(), label: inner.trim() };
  const title = inner.slice(0, bar).trim();
  const label = inner.slice(bar + 1).trim();
  return { title, label: label || title };
}

/** Os sinais que viram símbolo, do mais comprido para o mais curto ("<=>" antes de "<="). */
const SYMBOLS: Record<string, string> = {
  '<=>': '⇔',
  '<->': '↔',
  '-->': '⟶',
  '<--': '⟵',
  '==>': '⟹',
  '<==': '⟸',
  '=>': '⇒',
  '->': '→',
  '<-': '←',
  '!=': '≠',
  '>=': '≥',
  '<=': '≤',
  '~=': '≈',
  '+-': '±',
};
const SYMBOL = /<=>|<->|-->|<--|==>|<==|=>|->|<-|!=|>=|<=|~=|\+-/g;
const HAS_SYMBOL = new RegExp(SYMBOL.source);

/** Os sinais viram símbolos (o código e os links já viraram um caractere só, e ficam como são). */
function typeset(text: string): string {
  return text.replace(SYMBOL, (m) => SYMBOLS[m]);
}

type Marks = Omit<Span, 'text'>;

/**
 * Negrito, itálico, riscado, marca-texto, código e links de uma linha. As ênfases só valem fechadas na
 * mesma linha e coladas no texto ("2 * 3 * 4" não é itálico); o que sobra fica como foi escrito. O
 * link pode estar dentro de um negrito ("**veja [[Compras]]**"), mas o título dele fica como foi
 * escrito, e o código também.
 */
export function parseInline(text: string): Span[] {
  const atoms: Atom[] = [];
  for (const m of text.matchAll(ATOMS)) {
    if (m[1] !== undefined) atoms.push({ kind: 'lit', text: m[1] });
    else if (m[2] !== undefined) atoms.push({ kind: 'code', text: m[2] });
    else if (m[3] !== undefined) atoms.push({ kind: 'note', ...splitLink(m[3]) });
    else if (m[4] !== undefined) atoms.push({ kind: 'url', text: m[4], href: m[5] });
    else atoms.push({ kind: 'url', text: m[6], href: m[6] });
  }
  if (!atoms.length) return parseMarks(typeset(text));
  // cada pedaço vira um caractere de uso privado, de uma faixa que não aparece no texto (um emoji
  // antigo de celular japonês, por exemplo, mora nessa área)
  let base = SLOT;
  while ([...text].some((ch) => ch.charCodeAt(0) >= base && ch.charCodeAt(0) < base + atoms.length)) base += atoms.length;
  let at = 0;
  const slotted = text.replace(ATOMS, () => String.fromCharCode(base + at++));
  const out: Span[] = [];
  const push = (s: Span) => {
    const last = out.at(-1);
    if (last && sameMarks(last, s) && !s.link && !s.href && !s.code && !last.link && !last.href && !last.code) last.text += s.text;
    else out.push(s);
  };
  for (const s of parseMarks(typeset(slotted))) {
    const { text: t, ...marks } = s;
    let plain = '';
    const flush = () => {
      if (plain) push({ ...marks, text: plain });
      plain = '';
    };
    for (const ch of t) {
      const a = atoms[ch.charCodeAt(0) - base];
      if (!a) {
        plain += ch;
      } else if (a.kind === 'lit') {
        plain += a.text;
      } else {
        flush();
        if (a.kind === 'code') out.push({ ...pick(marks, 'bold', 'italic', 'strike', 'mark'), text: a.text, code: true });
        else if (a.kind === 'note') out.push({ ...marks, text: a.label, link: true, ...(a.label !== a.title ? { ref: a.title } : {}) });
        else out.push({ ...marks, text: a.text, href: a.href });
      }
    }
    flush();
  }
  return out;
}

function pick(m: Marks, ...keys: (keyof Marks)[]): Marks {
  const out: Marks = {};
  for (const k of keys) if (m[k]) (out as Record<string, unknown>)[k] = m[k];
  return out;
}

const FLAGS = ['bold', 'italic', 'strike', 'mark'] as const;

function sameMarks(a: Marks, b: Marks): boolean {
  return FLAGS.every((k) => !!a[k] === !!b[k]);
}

/** As ênfases (os pedaços inteiros já viraram um caractere só). */
function parseMarks(text: string, inherit: Marks = {}): Span[] {
  const out: Span[] = [];
  const push = (t: string, marks: Marks) => {
    if (!t) return;
    const last = out.at(-1);
    if (last && sameMarks(last, marks)) last.text += t;
    else out.push({ text: t, ...marks });
  };
  // ***os dois***, **negrito**, ~~riscado~~, ==marca-texto==, *itálico* ou _itálico_
  const re =
    /\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*|\*\*(?=\S)(.+?)(?<=\S)\*\*|~~(?=\S)(.+?)(?<=\S)~~|==(?=\S)(.+?)(?<=\S)==|\*(?=[^\s*])(.+?)(?<=[^\s*])\*|(?<![\p{L}\p{N}])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}])/gu;
  let at = 0;
  for (const m of text.matchAll(re)) {
    push(text.slice(at, m.index), inherit);
    const [inner, add]: [string, Marks] =
      m[1] !== undefined
        ? [m[1], { bold: true, italic: true }]
        : m[2] !== undefined
          ? [m[2], { bold: true }]
          : m[3] !== undefined
            ? [m[3], { strike: true }]
            : m[4] !== undefined
              ? [m[4], { mark: true }]
              : [m[5] ?? m[6], { italic: true }];
    // o que tem dentro pode ter outras ênfases: "**muito *bom***", "~~**caro**~~"
    for (const s of parseMarks(inner, { ...inherit, ...add })) {
      const { text: t, ...marks } = s;
      push(t, marks);
    }
    at = m.index! + m[0].length;
  }
  push(text.slice(at), inherit);
  return out;
}

/** As células de uma linha de tabela ("| a | b |" ou "a | b"), sem as barras das pontas; "\|" fica na célula. */
export function tableCells(line: string): string[] {
  const t = line.trim().replace(/^\|/, '').replace(/(?<!\\)\|$/, '');
  return t.split(/(?<!\\)\|/).map((c) => c.trim());
}

function alignOf(cell: string): Align {
  const l = cell.startsWith(':');
  const r = cell.endsWith(':');
  return l && r ? 'center' : r ? 'right' : l ? 'left' : null;
}

/** A linha começa uma tabela: ela tem "|" e a de baixo é a de traços, com o mesmo número de colunas. */
function startsTable(lines: readonly string[], i: number): boolean {
  const head = lines[i];
  const sep = lines[i + 1];
  return !!sep && head.includes('|') && sep.includes('|') && isTableSep(sep) && tableCells(head).length === tableCells(sep).length;
}

/** O texto em blocos: o texto corrido (linha a linha), as listas seguidas, os títulos, as citações, as tabelas… */
export function parseRich(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const last = blocks.at(-1);
    // o bloco de código vai até o "```" que fecha (ou até o fim)
    if (FENCE.test(line)) {
      const body: string[] = [];
      while (++i < lines.length && !FENCE.test(lines[i])) body.push(lines[i]);
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    if (startsTable(lines, i)) {
      const head = tableCells(line);
      const align = tableCells(lines[i + 1]).map(alignOf);
      const rows: Span[][][] = [];
      i += 2;
      for (; i < lines.length && lines[i].includes('|') && lines[i].trim(); i++) {
        // cada linha com o número de colunas do cabeçalho: a que tem menos ganha células vazias
        const cells = tableCells(lines[i]);
        rows.push(head.map((_, c) => parseInline(cells[c] ?? '')));
      }
      i--;
      blocks.push({ kind: 'table', align, head: head.map(parseInline), rows });
      continue;
    }
    if (RULE.test(line)) {
      blocks.push({ kind: 'hr' });
      continue;
    }
    const h = HEADING.exec(line);
    if (h) {
      blocks.push({ kind: 'h', level: h[1].length as 1 | 2 | 3, spans: parseInline(h[2].trim()) });
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      if (last?.kind === 'quote') last.lines.push(parseInline(q[1]));
      else blocks.push({ kind: 'quote', lines: [parseInline(q[1])] });
      continue;
    }
    const k = lineKind(line);
    if (k.kind === 'p') {
      const spans = parseInline(line);
      if (last?.kind === 'p') last.lines.push(spans);
      else blocks.push({ kind: 'p', lines: [spans] });
      continue;
    }
    const item: ListItem = { spans: parseInline(k.rest), line: i, ...(k.kind === 'check' ? { done: k.done } : {}) };
    if (last?.kind === k.kind) last.items.push(item);
    else if (k.kind === 'ol') blocks.push({ kind: 'ol', items: [item], start: k.n });
    else blocks.push({ kind: k.kind, items: [item] } as Block);
  }
  return blocks;
}

/** O texto tem alguma formatação (ou link, ou símbolo)? Sem ela, a leitura fica como sempre foi (texto corrido). */
export function hasFormatting(text: string): boolean {
  return HAS_SYMBOL.test(text) || parseRich(text).some((b) => b.kind !== 'p' || b.lines.some((l) => l.some((s) => s.link || s.href || s.code || FLAGS.some((f) => s[f]))));
}

/** O texto tem o que tocar: tarefas, links para outras anotações ou para fora. */
export function hasInteractive(text: string): boolean {
  return HAS_LINK.test(text) || HAS_URL.test(text) || checkCount(text).total > 0;
}

/**
 * O texto sem as marcas, para o que lê palavras: a frase da ficha, as dicas do Muraldle, a contagem
 * de palavras, o embaralhado do modo sem spoilers. Cada item de lista, título, linha de citação e
 * linha de tabela vira uma linha (as células separadas por " · "); a divisória some.
 */
export function plainText(text: string): string {
  const join = (spans: readonly Span[]) => spans.map((s) => s.text).join('');
  const out: string[] = [];
  for (const b of parseRich(text)) {
    switch (b.kind) {
      case 'p':
      case 'quote':
        out.push(...b.lines.map(join));
        break;
      case 'h':
        out.push(join(b.spans));
        break;
      case 'code':
        out.push(b.text);
        break;
      case 'table':
        out.push([b.head, ...b.rows].map((r) => r.map(join).filter(Boolean).join(' · ')).join('\n'));
        break;
      case 'hr':
        break;
      default:
        out.push(...b.items.map((it) => join(it.spans)));
    }
  }
  return out.join('\n');
}

/** Marca ou desmarca a tarefa da linha `line`. Devolve o texto igual se a linha não é tarefa. */
export function toggleCheck(text: string, line: number): string {
  // as linhas contadas como a leitura conta (ver parseRich): um texto de fora pode vir com \r
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  const l = lines[line];
  if (l === undefined || !CHECK.test(l)) return text;
  lines[line] = l.replace(/\[([ xX])\]/, (_, c: string) => (c === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

/** Quantas tarefas o texto tem e quantas estão feitas. */
export function checkCount(text: string): { done: number; total: number } {
  let done = 0;
  let total = 0;
  for (const l of text.replace(/\r\n?/g, '\n').split('\n')) {
    const k = lineKind(l);
    if (k.kind !== 'check') continue;
    total++;
    if (k.done) done++;
  }
  return { done, total };
}
