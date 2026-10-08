/**
 * O texto das fichas com um pouco de formatação, guardado como texto simples com marcas leves (um
 * markdown pequeno): **negrito**, *itálico*, listas ("- item", "1. item") e checklists ("- [ ] tarefa",
 * "- [x] feita") e, nas anotações, links para outras anotações ("[[Título]]", ver core/note-links.ts).
 * O texto continua sendo uma string: as resenhas antigas não mudam, o backup e a nuvem
 * não mudam, e um site antigo mostra as marcas cruas. Nunca vira HTML: quem desenha é o próprio
 * Angular, a partir destes blocos (ver ui/rich-text.ts).
 */

/** Um pedaço de texto corrido, com ou sem ênfase. */
export interface Span {
  text: string;
  bold?: true;
  italic?: true;
  /** Um link "[[título]]": `text` é o título, sem os colchetes. */
  link?: true;
}

/** "[[título]]": sem colchetes nem quebra de linha dentro, e com algo além de espaços. */
export const LINK = /\[\[([^[\]\n]*[^[\]\s][^[\]\n]*)\]\]/g;
export const HAS_LINK = new RegExp(LINK.source);
/** Cada link vira um caractere de uso privado enquanto as marcas são lidas (o título não ganha ênfase). */
const SLOT = 0xe000;

/** Uma linha de lista; `line` é o número da linha no texto (para marcar a tarefa no lugar certo). */
export interface ListItem {
  spans: Span[];
  line: number;
  /** Só nos checklists: a tarefa feita. */
  done?: boolean;
}

/**
 * Os blocos do texto. O de texto corrido guarda cada linha como foi escrita, as em branco também
 * (uma linha da pauta cada): sem marcas, a leitura sai igual à de sempre.
 */
export type Block =
  | { kind: 'p'; lines: Span[][] }
  | { kind: 'ul'; items: ListItem[] }
  | { kind: 'ol'; items: ListItem[]; start: number }
  | { kind: 'check'; items: ListItem[] };

const CHECK = /^\s*[-*•]\s+\[([ xX])\]\s?(.*)$/;
const BULLET = /^\s*[-*•]\s+(.*)$/;
const NUMBER = /^\s*(\d{1,4})[.)]\s+(.*)$/;

type LineKind = { kind: 'check'; done: boolean; rest: string } | { kind: 'ul'; rest: string } | { kind: 'ol'; n: number; rest: string } | { kind: 'p'; rest: string };

/** Que tipo de linha é: tarefa, item de lista, item numerado ou texto. */
export function lineKind(line: string): LineKind {
  let m = CHECK.exec(line);
  if (m) return { kind: 'check', done: m[1] !== ' ', rest: m[2] };
  m = NUMBER.exec(line);
  if (m) return { kind: 'ol', n: Number(m[1]), rest: m[2] };
  m = BULLET.exec(line);
  // "**negrito** no começo" não é item de lista: o marcador precisa de um espaço depois
  if (m && !/^\s*\*\*/.test(line)) return { kind: 'ul', rest: m[1] };
  return { kind: 'p', rest: line };
}

/**
 * Negrito, itálico e links de uma linha. As marcas só valem fechadas na mesma linha e coladas no
 * texto ("2 * 3 * 4" não é itálico); o que sobra fica como foi escrito. O link pode estar dentro de
 * um negrito ("**veja [[Compras]]**"), mas o título dele fica como foi escrito.
 */
export function parseInline(text: string): Span[] {
  const titles = [...text.matchAll(LINK)].map((m) => m[1].trim());
  if (!titles.length) return parseMarks(text);
  // cada link vira um caractere de uso privado, de uma faixa que não aparece no texto (um emoji
  // antigo de celular japonês, por exemplo, mora nessa área)
  let base = SLOT;
  while ([...text].some((ch) => ch.charCodeAt(0) >= base && ch.charCodeAt(0) < base + titles.length)) base += titles.length;
  let at = 0;
  const slotted = text.replace(LINK, () => String.fromCharCode(base + at++));
  const out: Span[] = [];
  for (const s of parseMarks(slotted)) {
    let plain = '';
    const flush = () => {
      if (plain) out.push({ ...s, text: plain });
      plain = '';
    };
    for (const ch of s.text) {
      const i = ch.charCodeAt(0) - base;
      if (i >= 0 && i < titles.length) {
        flush();
        out.push({ ...s, text: titles[i], link: true });
      } else plain += ch;
    }
    flush();
  }
  return out;
}

/** Negrito e itálico (os links já viraram um caractere só). */
function parseMarks(text: string): Span[] {
  const out: Span[] = [];
  const push = (t: string, bold?: boolean, italic?: boolean) => {
    if (!t) return;
    const last = out.at(-1);
    if (last && !!last.bold === !!bold && !!last.italic === !!italic) last.text += t;
    else out.push({ text: t, ...(bold ? { bold: true as const } : {}), ...(italic ? { italic: true as const } : {}) });
  };
  // ***os dois***, **negrito**, *itálico* ou _itálico_
  const re = /\*\*\*(?=\S)(.+?)(?<=\S)\*\*\*|\*\*(?=\S)(.+?)(?<=\S)\*\*|\*(?=[^\s*])(.+?)(?<=[^\s*])\*|(?<![\p{L}\p{N}])_(?=\S)(.+?)(?<=\S)_(?![\p{L}\p{N}])/gu;
  let at = 0;
  for (const m of text.matchAll(re)) {
    push(text.slice(at, m.index));
    if (m[1] !== undefined) push(m[1], true, true);
    else if (m[2] !== undefined) {
      // itálico dentro do negrito: "**muito *bom***" não precisa de tanto; vale o negrito com o itálico de dentro
      for (const s of parseMarks(m[2])) push(s.text, true, s.italic);
    } else push(m[3] ?? m[4], false, true);
    at = m.index! + m[0].length;
  }
  push(text.slice(at));
  return out;
}

/** O texto em blocos: o texto corrido (linha a linha) e as listas seguidas. */
export function parseRich(text: string): Block[] {
  const blocks: Block[] = [];
  const lines = text.replace(/\r\n?/g, '\n').split('\n');
  lines.forEach((line, i) => {
    const k = lineKind(line);
    const last = blocks.at(-1);
    if (k.kind === 'p') {
      const spans = parseInline(line);
      if (last?.kind === 'p') last.lines.push(spans);
      else blocks.push({ kind: 'p', lines: [spans] });
      return;
    }
    const item: ListItem = { spans: parseInline(k.rest), line: i, ...(k.kind === 'check' ? { done: k.done } : {}) };
    if (last?.kind === k.kind) last.items.push(item);
    else if (k.kind === 'ol') blocks.push({ kind: 'ol', items: [item], start: k.n });
    else blocks.push({ kind: k.kind, items: [item] } as Block);
  });
  return blocks;
}

/** O texto tem alguma formatação (ou link)? Sem ela, a leitura fica como sempre foi (texto corrido). */
export function hasFormatting(text: string): boolean {
  return HAS_LINK.test(text) || text.split('\n').some((l) => lineKind(l).kind !== 'p' || parseInline(l).some((s) => s.bold || s.italic));
}

/**
 * O texto sem as marcas, para o que lê palavras: a frase da ficha, as dicas do Muraldle, a contagem
 * de palavras, o embaralhado do modo sem spoilers. Cada item de lista vira uma linha.
 */
export function plainText(text: string): string {
  return text
    .replace(/\r\n?/g, '\n')
    .split('\n')
    .map((l) => parseInline(lineKind(l).rest).map((s) => s.text).join(''))
    .join('\n');
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
