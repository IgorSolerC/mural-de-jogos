/**
 * O texto das fichas com formatação, guardado como texto simples com marcas leves (um markdown):
 *
 * - Na linha: **negrito** (ou __negrito__), *itálico* (ou _itálico_), ~~riscado~~, ==marca-texto==,
 *   ||spoiler|| (ou >!spoiler!<, como no Reddit), `código`,
 *   [texto](https://endereço), <https://endereço>, endereços soltos (https://… ou www.…) e, nas
 *   anotações, links para outras anotações ("[[Título]]", ver core/note-links.ts). Uma barra antes de
 *   qualquer sinal o escreve como é ("\*" é um asterisco, "1\." não começa lista).
 * - Os símbolos escritos com sinais: "->" →, "<-" ←, "<->" ↔, "-->" ⟶, "<--" ⟵, "=>" ⇒, "<=>" ⇔,
 *   "==>" ⟹, "<==" ⟸, "!=" ≠, ">=" ≥, "<=" ≤, "~=" ≈ e "+-" ±. Fora do código e dos links; com a
 *   barra antes do último sinal ("-\>"), ficam como são.
 * - Em blocos: títulos ("# ", "## ", "### "; do quarto ao sexto, como o terceiro), listas ("- item",
 *   "+ item", "1. item" e, dentro de um, "1.1. item"), checklists ("- [ ] tarefa", "- [x] feita"), citações ("> "), a divisória
 *   ("---"), tabelas (as linhas com "|", a segunda só de traços), blocos de código (entre "```" ou
 *   "~~~") e os widgets das anotações ("{{contador: 19/11/2026 | Lançamento}}", numa linha só dele;
 *   ver core/widgets.ts), e o texto sutil ("-# texto", como no Discord: menor e mais claro).
 * - O que vem embaixo de um item, recuado dois espaços ou mais, é dele, como no markdown: a
 *   descrição em várias linhas, outra lista, um widget (ver `ListItem.body`).
 *
 * O texto continua sendo uma string: as resenhas antigas não mudam, o backup e a nuvem não mudam, e
 * um site antigo mostra as marcas cruas. Nunca vira HTML: quem desenha é o próprio Angular, a partir
 * destes blocos (ver ui/rich-text.ts).
 */

import { CopyContext, WidgetSize, parseWidgetLine, widgetCopy, widgetDef } from './widgets';

/** Um pedaço de texto corrido, com as marcas que valem para ele. */
export interface Span {
  text: string;
  bold?: true;
  italic?: true;
  strike?: true;
  /** ==marca-texto== */
  mark?: true;
  /** ||spoiler||: escondido num bloco preto até alguém tocar (ver ui/rich-text.ts). */
  spoiler?: true;
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
/** Um endereço para fora: [texto](https://…), <https://…> ou um https:// (ou www.) solto. */
const HAS_URL = /\]\((?:https?:\/\/|mailto:)|<(?:https?:\/\/|mailto:)|https?:\/\/\S|(?<![\w@./-])www\.\S/;
/** Cada pedaço lido inteiro (link, código, marca escapada) vira um caractere de uso privado enquanto as ênfases são lidas. */
const SLOT = 0xe000;

/** Uma linha de lista; `line` é o número da linha no texto (para marcar a tarefa no lugar certo). */
export interface ListItem {
  spans: Span[];
  line: number;
  /** Só nos checklists: a tarefa feita. */
  done?: boolean;
  /**
   * O que vem embaixo do item, recuado (as linhas com dois espaços ou mais além do começo do item,
   * como no markdown): a descrição, outra lista, um widget. Lido como um texto à parte; feita a
   * tarefa, ele é riscado junto.
   */
  body?: Block[];
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
  // pre: o número do pai escrito antes do de cada item ("1." em "1.1.", "1.2."); sem ele, 1, 2, 3
  | { kind: 'ol'; items: ListItem[]; start: number; pre?: string }
  // folded: quantas feitas a sequência esconde; seq: a linha da primeira tarefa dela (ver `foldDone`)
  | { kind: 'check'; items: ListItem[]; folded?: number; seq?: number }
  | { kind: 'h'; level: 1 | 2 | 3; spans: Span[] }
  | { kind: 'quote'; lines: Span[][] }
  /** "-# texto": as linhas seguidas de texto sutil, menor e mais claro. */
  | { kind: 'subtle'; lines: Span[][] }
  | { kind: 'hr' }
  | { kind: 'code'; text: string }
  /** Um widget (ver core/widgets.ts): o nome do registro, os parâmetros como foram escritos e o tamanho. */
  | { kind: 'widget'; name: string; args: string[]; size: WidgetSize }
  | { kind: 'table'; align: Align[]; head: Span[][]; rows: Span[][][] };

const CHECK = /^\s*[-*+•]\s+\[([ xX])\]\s?(.*)$/;
const BULLET = /^\s*[-*+•]\s+(.*)$/;
// "1. item" e, dentro dele, "1.1. item" (o número do pai na frente, e o ponto no fim: "1.5 kg" é texto)
const NUMBER = /^\s*((?:\d{1,4}\.)*)(\d{1,4})[.)]\s+(.*)$/;
/** O número escrito no começo da linha numerada ("1.2" de "  1.2. item"), com o recuo antes dele. */
const NUMBER_AT = /^(\s*)(\d{1,4}(?:\.\d{1,4})*)/;
// do "####" ao "######" (o markdown tem seis níveis), com a cara do terceiro; os "#" do fim saem
const HEADING = /^(#{1,6})\s+(.*?\S)(?:\s+#+)?\s*$/;
/** O texto sutil, como o "-# " do Discord: a linha menor e mais clara (o "-" sem espaço depois não é item). */
const SUBTLE = /^\s*-#(?:[ \t]+(.*))?$/;
// (">!spoiler!<" no começo da linha é um spoiler, não uma citação)
const QUOTE = /^\s*>(?!!\S.*!<)\s?(.*)$/;
const RULE = /^\s*([-*_])(?:\s*\1){2,}\s*$/;
/** A cerca do bloco de código: três crases ou três tis (fecha com a mesma). */
const FENCE = /^\s*(`{3,}|~{3,})/;

/** A cerca que a linha abre ("```", "~~~~"), ou null. */
function fenceOf(line: string): string | null {
  return FENCE.exec(line)?.[1] ?? null;
}

/** A linha fecha o bloco aberto por `open`: a mesma marca, pelo menos do mesmo tamanho. */
function closes(line: string, open: string): boolean {
  const f = fenceOf(line);
  return !!f && f[0] === open[0] && f.length >= open.length;
}

/** A largura do recuo da linha (o tab vai até a próxima parada de 4, como no markdown). */
function indentOf(line: string): number {
  let w = 0;
  for (const ch of line) {
    if (ch === ' ') w++;
    else if (ch === '\t') w += 4 - (w % 4);
    else break;
  }
  return w;
}

/** A linha sem `n` colunas de recuo (o tab vira espaços antes). */
function dedent(line: string, n: number): string {
  const lead = /^[ \t]*/.exec(line)![0];
  let spaces = '';
  for (const ch of lead) spaces += ch === ' ' ? ' ' : ' '.repeat(4 - (spaces.length % 4));
  return spaces.slice(n) + line.slice(lead.length);
}

/**
 * As linhas embaixo do item da linha `i` que são dele: as recuadas pelo menos dois espaços além do
 * começo do item e as em branco entre elas (a em branco seguida de uma linha sem o recuo termina o
 * item). Onde elas acabam (a última delas) e o recuo que todas têm; null, o item não tem nada embaixo.
 */
function bodyOf(lines: readonly string[], i: number): { end: number; indent: number } | null {
  const min = indentOf(lines[i]) + 2;
  let end = i;
  let indent = Infinity;
  for (let j = i + 1; j < lines.length; j++) {
    if (!lines[j].trim()) continue;
    if (indentOf(lines[j]) < min) break;
    end = j;
    indent = Math.min(indent, indentOf(lines[j]));
  }
  return end === i ? null : { end, indent };
}
/**
 * O item de quem a linha `i` é: ela mesma, se é um item, ou o item em cujo corpo ela está (ver
 * `bodyOf`; uma linha só de espaços conta pelo recuo dela). Null se a linha não é de item nenhum.
 */
export function ownerItem(lines: readonly string[], i: number): number | null {
  if (lineKind(lines[i]).kind !== 'p') return i;
  const probe = [...lines];
  // a linha só de espaços (acabou de ser aberta) conta como se já tivesse texto
  if (!probe[i].trim()) {
    if (!probe[i]) return null;
    probe[i] += '.';
  }
  for (let j = i - 1; j >= 0; j--) {
    if (!probe[j].trim()) continue;
    if (lineKind(probe[j]).kind !== 'p') {
      if ((bodyOf(probe, j)?.end ?? j) >= i) return j;
    } else if (indentOf(probe[j]) === 0) {
      return null;
    }
  }
  return null;
}

/** A última linha do item da linha `i`, com o que vem embaixo dele (sem nada embaixo, ela mesma). */
export function itemEnd(lines: readonly string[], i: number): number {
  return bodyOf(lines, i)?.end ?? i;
}

/**
 * O recuo de uma linha nova aberta embaixo da `i` que continua no mesmo item: embaixo do item, o da
 * coluna do texto dele ("- [ ] " são seis espaços); no corpo, o da própria linha. Null fora de item.
 */
export function bodyIndent(lines: readonly string[], i: number): string | null {
  const owner = ownerItem(lines, i);
  if (owner === null) return null;
  if (owner === i) return ' '.repeat(indentOf(lines[i]) + (lines[i].trimStart().length - lineKind(lines[i]).rest.length));
  return /^[ \t]*/.exec(lines[i])![0];
}

/** A linha numerada com outro número ("2.1. item" com "3.1" vira "3.1. item"); a que não é numerada fica. */
export function withNumber(line: string, num: string): string {
  return lineKind(line).kind === 'ol' ? line.replace(NUMBER_AT, (_, sp: string) => sp + num) : line;
}

/** O número do item seguinte ao da linha numerada: "3" depois de "2.", "1.3" depois de "1.2.". */
export function nextNumber(line: string): string {
  const k = lineKind(line);
  return k.kind === 'ol' ? k.pre + (k.n + 1) : '1';
}

/**
 * Depois de um item numerado entrar na linha `i` (o Enter que criou o "3." entre o "2." e o "3."),
 * os de baixo da mesma lista que vinham na sequência descem um número ("3." vira "4.", "4." vira
 * "5."), e os de dentro deles com o número do pai na frente vão junto ("3.1." vira "4.1."). Para no
 * primeiro fora da sequência (a lista "1. 1. 1." fica como está), numa linha menos recuada ou num
 * texto no mesmo recuo. `was`: o número que a própria linha `i` tinha, quando foi ela que desceu
 * (os de dentro dela também mudam).
 */
export function renumberAfter(lines: readonly string[], i: number, was?: string): string[] {
  const out = [...lines];
  const k = lineKind(out[i] ?? '');
  if (k.kind !== 'ol') return out;
  const indent = indentOf(out[i]);
  let old = k.n - 1;
  let next = k.n + 1;
  let parent = was && was !== k.pre + k.n ? { from: was, to: k.pre + k.n } : null;
  for (let j = i + 1; j < out.length; j++) {
    const line = out[j];
    if (!line.trim()) continue;
    const w = indentOf(line);
    if (w > indent) {
      // dentro do item de cima: o número que começa com o do pai segue o pai
      const s = lineKind(line);
      const num = s.kind === 'ol' ? s.pre + s.n : '';
      if (parent && num.startsWith(parent.from + '.')) out[j] = withNumber(line, parent.to + num.slice(parent.from.length));
      continue;
    }
    if (w < indent) break;
    const s = lineKind(line);
    if (s.kind !== 'ol' || s.pre !== k.pre || s.n !== old + 1) break;
    old = s.n;
    parent = { from: k.pre + s.n, to: k.pre + next };
    out[j] = withNumber(line, parent.to);
    next++;
  }
  return out;
}

/** A linha de traços embaixo do cabeçalho da tabela: "| --- | :-: |". */
const TABLE_SEP = /^\s*\|?\s*:?-+:?\s*(\|\s*:?-+:?\s*)*\|?\s*$/;

/** A linha de traços da tabela ("| --- | :-: |"). */
export function isTableSep(line: string): boolean {
  return line.includes('-') && TABLE_SEP.test(line);
}

/** No item numerado, `pre` é o número do pai escrito antes do dele: "1." em "1.2. item" ("" em "2. item"). */
type LineKind = { kind: 'check'; done: boolean; rest: string } | { kind: 'ul'; rest: string } | { kind: 'ol'; n: number; pre: string; rest: string } | { kind: 'p'; rest: string };

/** Que tipo de linha de lista é: tarefa, item de lista, item numerado ou texto. */
export function lineKind(line: string): LineKind {
  let m = CHECK.exec(line);
  if (m) return { kind: 'check', done: m[1] !== ' ', rest: m[2] };
  m = NUMBER.exec(line);
  if (m) return { kind: 'ol', n: Number(m[2]), pre: m[1], rest: m[3] };
  // "* * *" é a divisória, não um item
  if (RULE.test(line)) return { kind: 'p', rest: line };
  m = BULLET.exec(line);
  // "**negrito** no começo" não é item de lista: o marcador precisa de um espaço depois
  if (m && !/^\s*\*\*/.test(line)) return { kind: 'ul', rest: m[1] };
  return { kind: 'p', rest: line };
}

/**
 * Os pedaços lidos inteiros, antes das ênfases: a marca escapada (qualquer sinal, como no markdown:
 * "1\." não é lista), o código (entre crases; entre duas, pode ter uma dentro), o link de anotação,
 * o link para fora (o endereço pode ter parênteses, como os da Wikipédia, e um "título" no fim, que
 * fica de fora), o endereço entre "<>" e o endereço solto (https:// ou www.).
 */
const ATOMS =
  /\\(?<lit>[!-/:-@[-`{-~])|(?<!`)(?<tick>`+)(?!`)(?<code>[^\n]+?)(?<!`)\k<tick>(?!`)|\[\[(?<note>[^[\]\n]*[^[\]\s][^[\]\n]*)\]\]|\[(?<label>[^[\]\n]+)\]\((?<href>(?:https?:\/\/|mailto:)(?:[^\s()]|\([^\s()]*\))+)(?:\s+"[^"\n]*")?\)|<(?<auto>(?:https?:\/\/|mailto:)[^\s<>]+)>|(?<bare>(?:https?:\/\/|(?<![\w@./-])www\.)(?:[^\s<>()[\]]|\([^\s<>()[\]]*\))*(?:[^\s<>()[\].,;:!?'"’”]|\([^\s<>()[\]]*\)))/g;

type AtomGroups = Partial<Record<'lit' | 'tick' | 'code' | 'note' | 'label' | 'href' | 'auto' | 'bare', string>>;

/** O endereço solto como link: o "www." ganha o https://. */
function bareHref(bare: string): string {
  return /^www\./i.test(bare) ? 'https://' + bare : bare;
}

/** O código entre crases: um espaço de cada ponta sai (para escrever "`` `x` ``"), se as duas têm. */
function codeText(code: string): string {
  return code.length > 2 && code.startsWith(' ') && code.endsWith(' ') && code.trim() ? code.slice(1, -1) : code;
}

type Atom = { kind: 'lit'; text: string } | { kind: 'code'; text: string } | { kind: 'note'; title: string; label: string } | { kind: 'url'; text: string; href: string };

/** Um link escrito na linha: onde começa e termina (`end` exclusivo) e o que ele é. */
export type LinkAt =
  | { kind: 'note'; start: number; end: number; title: string; label: string }
  | { kind: 'url'; start: number; end: number; text: string; href: string };

/**
 * O link da linha em que a posição `at` cai (de dentro dele ou colada nas beiradas): o
 * "[[título|texto]]", o "[texto](endereço)" ou o endereço solto. Os de dentro de um `código` ou
 * escapados não contam, como na leitura. Null se ali não tem link.
 */
export function linkAt(line: string, at: number): LinkAt | null {
  for (const m of line.matchAll(ATOMS)) {
    const g = m.groups as AtomGroups;
    const start = m.index;
    const end = start + m[0].length;
    if (at < start) return null;
    if (at > end || g.lit !== undefined || g.code !== undefined) continue;
    if (g.note !== undefined) return { kind: 'note', start, end, ...splitLink(g.note) };
    if (g.label !== undefined) return { kind: 'url', start, end, text: g.label, href: g.href! };
    return { kind: 'url', start, end, text: '', href: g.auto ?? bareHref(g.bare!) };
  }
  return null;
}

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
    const g = m.groups as AtomGroups;
    if (g.lit !== undefined) atoms.push({ kind: 'lit', text: g.lit });
    else if (g.code !== undefined) atoms.push({ kind: 'code', text: codeText(g.code) });
    else if (g.note !== undefined) atoms.push({ kind: 'note', ...splitLink(g.note) });
    else if (g.label !== undefined) atoms.push({ kind: 'url', text: g.label, href: g.href! });
    else if (g.auto !== undefined) atoms.push({ kind: 'url', text: g.auto, href: g.auto });
    else atoms.push({ kind: 'url', text: g.bare!, href: bareHref(g.bare!) });
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
        if (a.kind === 'code') out.push({ ...pick(marks, 'bold', 'italic', 'strike', 'mark', 'spoiler'), text: a.text, code: true });
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

const FLAGS = ['bold', 'italic', 'strike', 'mark', 'spoiler'] as const;

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
  // ***os dois*** (ou ___), **negrito** (ou __), ~~riscado~~, ==marca-texto==, *itálico* (ou _),
  // ||spoiler|| (ou >!…!<). O "_" só vale fora das palavras ("snake_case" e "a__b__c" ficam); o "*"
  // que fecha não pode ser metade de outra marca ("*um **dois** três*" é um itálico só, com o negrito
  // dentro, e "**muito *bom***", um negrito com o itálico no fim)
  const re =
    /\*\*\*(?=\S)(?<bi>.+?)(?<=\S)\*\*\*|(?<![\p{L}\p{N}_])___(?=\S)(?<bi2>.+?)(?<=\S)___(?![\p{L}\p{N}_])|\*\*(?=\S)(?<b>.+?)(?<=\S)\*\*(?!\*)|(?<![\p{L}\p{N}_])__(?=\S)(?<b2>.+?)(?<=\S)__(?![\p{L}\p{N}_])|~~(?=\S)(?<s>.+?)(?<=\S)~~|==(?=\S)(?<m>.+?)(?<=\S)==|\*(?=[^\s*])(?<i>.+?)(?<=[^\s*])\*(?!\*)|(?<![\p{L}\p{N}_])_(?=[^\s_])(?<i2>.+?)(?<=[^\s_])_(?![\p{L}\p{N}_])|\|\|(?=\S)(?<sp>.+?)(?<=\S)\|\||>!(?=\S)(?<sp2>.+?)(?<=\S)!</gu;
  let at = 0;
  for (const m of text.matchAll(re)) {
    push(text.slice(at, m.index), inherit);
    const g = m.groups as Partial<Record<'bi' | 'bi2' | 'b' | 'b2' | 's' | 'm' | 'i' | 'i2' | 'sp' | 'sp2', string>>;
    const [inner, add]: [string, Marks] =
      (g.bi ?? g.bi2) !== undefined
        ? [(g.bi ?? g.bi2)!, { bold: true, italic: true }]
        : (g.b ?? g.b2) !== undefined
          ? [(g.b ?? g.b2)!, { bold: true }]
          : g.s !== undefined
            ? [g.s, { strike: true }]
            : g.m !== undefined
              ? [g.m, { mark: true }]
              : (g.sp ?? g.sp2) !== undefined
                ? [(g.sp ?? g.sp2)!, { spoiler: true }]
                : [(g.i ?? g.i2)!, { italic: true }];
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
  return parseLines(linesOf(text), 0);
}

/** As linhas em blocos; `base` é o número no texto da primeira (o que vem embaixo de um item é lido à parte). */
function parseLines(lines: readonly string[], base: number): Block[] {
  const blocks: Block[] = [];
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const last = blocks.at(-1);
    // o bloco de código vai até a cerca que fecha (ou até o fim)
    const open = fenceOf(line);
    if (open) {
      const body: string[] = [];
      while (++i < lines.length && !closes(lines[i], open)) body.push(lines[i]);
      blocks.push({ kind: 'code', text: body.join('\n') });
      continue;
    }
    const w = parseWidgetLine(line);
    if (w) {
      blocks.push({ kind: 'widget', ...w });
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
      blocks.push({ kind: 'h', level: Math.min(3, h[1].length) as 1 | 2 | 3, spans: parseInline(h[2].trim()) });
      continue;
    }
    const q = QUOTE.exec(line);
    if (q) {
      if (last?.kind === 'quote') last.lines.push(parseInline(q[1]));
      else blocks.push({ kind: 'quote', lines: [parseInline(q[1])] });
      continue;
    }
    const sub = SUBTLE.exec(line);
    if (sub) {
      const spans = parseInline(sub[1] ?? '');
      if (last?.kind === 'subtle') last.lines.push(spans);
      else blocks.push({ kind: 'subtle', lines: [spans] });
      continue;
    }
    const k = lineKind(line);
    if (k.kind === 'p') {
      const spans = parseInline(line);
      if (last?.kind === 'p') last.lines.push(spans);
      else blocks.push({ kind: 'p', lines: [spans] });
      continue;
    }
    const item: ListItem = { spans: parseInline(k.rest), line: base + i, ...(k.kind === 'check' ? { done: k.done } : {}) };
    // as linhas recuadas embaixo são do item: a descrição, outra lista, um widget
    const body = bodyOf(lines, i);
    if (body) {
      const inner = lines.slice(i + 1, body.end + 1).map((l) => (l.trim() ? dedent(l, body.indent) : ''));
      item.body = parseLines(inner, base + i + 1);
      i = body.end;
    }
    // a numerada com outro número de pai na frente ("1." e depois "1.1.") é outra lista
    if (last?.kind === k.kind && (k.kind !== 'ol' || (last.kind === 'ol' && (last.pre ?? '') === k.pre))) last.items.push(item);
    else if (k.kind === 'ol') blocks.push({ kind: 'ol', items: [item], start: k.n, ...(k.pre ? { pre: k.pre } : {}) });
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

/** Os pedaços de texto de um bloco (de todas as linhas, itens, células e o que vem embaixo dos itens). */
function spansOf(b: Block): Span[] {
  switch (b.kind) {
    case 'p':
    case 'quote':
    case 'subtle':
      return b.lines.flat();
    case 'h':
      return b.spans;
    case 'ul':
    case 'ol':
    case 'check':
      return b.items.flatMap((it) => [...it.spans, ...(it.body ?? []).flatMap(spansOf)]);
    case 'table':
      return [...b.head, ...b.rows.flat()].flat();
    default:
      return [];
  }
}

/** O texto tem um spoiler ("||…||" ou ">!…!<") para tocar e revelar? (Só lê as marcas quando pode haver um.) */
export function hasSpoiler(text: string): boolean {
  if (!text.includes('||') && !text.includes('>!')) return false;
  return parseRich(text).some((b) => spansOf(b).some((s) => s.spoiler));
}

/**
 * O texto sem as marcas, para o que lê palavras: a frase da ficha, as dicas do Muraldle, a contagem
 * de palavras, o embaralhado do modo sem spoilers. Cada item de lista, título, linha de citação e
 * linha de tabela vira uma linha (as células separadas por " · "); a divisória some.
 */
export function plainText(text: string): string {
  return textOf(text, (name, args) => widgetDef(name)?.plain(args) ?? '', 'hide');
}

/** O spoiler no texto sem marcas (a frase da ficha no mural, as dicas do Muraldle): nunca o que ele esconde. */
export const SPOILER_PLAIN = '[spoiler]';

/**
 * O texto para copiar e colar fora do site: como `plainText`, mas cada widget vira a marca dele em
 * palavras ("{imagem: https://…}", "{contador: 3 dias e 4h faltantes}", ver `widgetCopy`).
 */
export function copyText(text: string, ctx: CopyContext): string {
  return textOf(text, (name, args) => widgetCopy(name, args, ctx), 'mark');
}

/**
 * `spoiler`: o que fazer com o trecho escondido. 'hide' põe `SPOILER_PLAIN` no lugar (o que é lido sem
 * o bloco preto não pode contar o segredo); 'mark' deixa o texto entre "||", como se escreve no
 * Discord (a cópia).
 */
function textOf(text: string, widget: (name: string, args: readonly string[]) => string, spoiler: 'hide' | 'mark'): string {
  const join = (spans: readonly Span[]) => {
    let out = '';
    for (let i = 0; i < spans.length; i++) {
      const s = spans[i];
      if (!s.spoiler) {
        out += s.text;
        continue;
      }
      // os pedaços seguidos do mesmo spoiler (um negrito dentro dele) são um trecho só
      let hidden = s.text;
      while (spans[i + 1]?.spoiler) hidden += spans[++i].text;
      out += spoiler === 'hide' ? SPOILER_PLAIN : `||${hidden}||`;
    }
    return out;
  };
  const out: string[] = [];
  const read = (blocks: readonly Block[]) => {
    for (const b of blocks) {
      switch (b.kind) {
        case 'p':
        case 'quote':
        case 'subtle':
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
        case 'widget': {
          const t = widget(b.name, b.args);
          if (t) out.push(t);
          break;
        }
        case 'hr':
          break;
        default:
          // o que vem embaixo do item, logo depois dele
          for (const it of b.items) {
            out.push(join(it.spans));
            if (it.body) read(it.body);
          }
      }
    }
  };
  read(parseRich(text));
  return out.join('\n');
}

/** Marca ou desmarca a tarefa da linha `line`. Devolve o texto igual se a linha não é tarefa. */
export function toggleCheck(text: string, line: number): string {
  const lines = linesOf(text);
  const l = lines[line];
  if (l === undefined || !CHECK.test(l)) return text;
  lines[line] = l.replace(/\[([ xX])\]/, (_, c: string) => (c === ' ' ? '[x]' : '[ ]'));
  return lines.join('\n');
}

/** As linhas do texto, contadas como a leitura conta (um texto de fora pode vir com \r). */
export function linesOf(text: string): string[] {
  return text.replace(/\r\n?/g, '\n').split('\n');
}

/**
 * As linhas fora dos blocos de código, com o número de cada uma: as que a leitura lê como texto (ver
 * `parseRich`). Dentro de um bloco, nem tarefa nem link valem.
 */
export function proseLines(text: string): { line: string; at: number }[] {
  const out: { line: string; at: number }[] = [];
  const lines = linesOf(text);
  for (let i = 0; i < lines.length; i++) {
    const open = fenceOf(lines[i]);
    if (open) {
      while (++i < lines.length && !closes(lines[i], open));
      continue;
    }
    out.push({ line: lines[i], at: i });
  }
  return out;
}

/** As tarefas do texto, pelo número da linha: feita ou não (as de dentro de um bloco de código não contam). */
export function tasksOf(text: string): Map<number, boolean> {
  const out = new Map<number, boolean>();
  for (const { line, at } of proseLines(text)) {
    const k = lineKind(line);
    if (k.kind === 'check') out.set(at, k.done);
  }
  return out;
}

/**
 * Os links de anotação de uma linha como a leitura os lê: fora do `código` e sem os escapados
 * ("\[[x]]"). `inner` é o que está entre os colchetes; `at` e `length`, onde o link está na linha.
 */
export function noteLinksOf(line: string): { inner: string; at: number; length: number }[] {
  const out: { inner: string; at: number; length: number }[] = [];
  for (const m of line.matchAll(ATOMS)) {
    const note = (m.groups as AtomGroups).note;
    if (note !== undefined) out.push({ inner: note, at: m.index, length: m[0].length });
  }
  return out;
}

/** A linha com cada link de anotação trocado por `swap(inner)` (o resto, o código e os escapados ficam). */
export function replaceNoteLinks(line: string, swap: (inner: string, all: string) => string): string {
  // com grupos com nome, o último argumento são eles
  return line.replace(ATOMS, (all: string, ...rest: unknown[]) => {
    const note = (rest.at(-1) as AtomGroups).note;
    return note !== undefined ? swap(note, all) : all;
  });
}

/** Quantas tarefas o texto tem e quantas estão feitas. */
export function checkCount(text: string): { done: number; total: number } {
  const tasks = [...tasksOf(text).values()];
  return { done: tasks.filter(Boolean).length, total: tasks.length };
}

/**
 * As linhas das tarefas feitas. Junto com `uncheckedKey`, é o retrato que a parede tira quando a
 * ficha aparece: só as feitas de então se escondem (ver `foldDone`).
 */
export function doneLines(text: string): Set<number> {
  return new Set([...tasksOf(text)].filter(([, done]) => done).map(([line]) => line));
}

/** O texto com todas as tarefas por fazer: dois textos com a mesma chave só diferem nas marcas. */
export function uncheckedKey(text: string): string {
  const tasks = tasksOf(text);
  return linesOf(text)
    .map((l, i) => (tasks.has(i) ? l.replace(/\[[xX]\]/, '[ ]') : l))
    .join('\n');
}

/** O retrato das tarefas feitas de um texto (ver `snapshotDone`). */
export interface DoneSnapshot {
  key: string;
  lines: ReadonlySet<number>;
}

/**
 * O retrato das feitas, para um `linkedSignal` do texto: refeito só quando o texto muda além das
 * marcas (outra anotação, uma edição). Marcar uma tarefa guarda o retrato de antes (a marcada agora
 * continua à vista); desmarcar tira a tarefa do retrato, então marcada de novo ela também continua
 * à vista, até o retrato ser refeito.
 */
export function snapshotDone(text: string, prev?: { value: DoneSnapshot }): DoneSnapshot {
  const key = uncheckedKey(text);
  if (prev?.value.key !== key) return { key, lines: doneLines(text) };
  const done = doneLines(text);
  const lines = [...prev.value.lines].filter((i) => done.has(i));
  return lines.length === prev.value.lines.size ? prev.value : { key, lines: new Set(lines) };
}

/** Quantas tarefas `foldDone` esconde. */
export function foldedCount(blocks: readonly Block[]): number {
  return blocks.reduce((n, b) => n + (b.kind === 'check' ? (b.folded ?? 0) : 0), 0);
}

type CheckBlock = Extract<Block, { kind: 'check' }>;

/** Só linhas em branco (ou de espaços). */
function isBlank(b: Block | undefined): boolean {
  return b?.kind === 'p' && b.lines.every((l) => l.every((s) => !s.text.trim()));
}

/**
 * Cada sequência de tarefas sem as feitas de `hide` (as que continuam feitas): elas viram uma
 * conta só, no fim da sequência (`folded`). Listas separadas só por linhas em branco são a mesma
 * sequência (só um texto entre elas separa as contas). Uma lista que fica sem nenhuma tarefa sai
 * com a linha em branco de antes dela; a sequência toda feita fica só com a conta.
 *
 * A conta leva `seq`, a linha da primeira tarefa da sequência: é como ela se chama em `show`, as
 * sequências que a pessoa abriu tocando na conta (essas ficam como são, com as feitas à vista).
 */
export function foldDone(blocks: readonly Block[], hide: ReadonlySet<number>, show: ReadonlySet<number> = new Set()): Block[] {
  const out: Block[] = [];
  for (let i = 0; i < blocks.length; i++) {
    const b = blocks[i];
    if (b.kind !== 'check') {
      out.push(b);
      continue;
    }
    // a sequência: esta lista e as que vêm depois de linhas em branco
    const lists: CheckBlock[] = [b];
    const gaps: Block[] = [];
    while (isBlank(blocks[i + 1]) && blocks[i + 2]?.kind === 'check') {
      gaps.push(blocks[i + 1]);
      lists.push(blocks[i + 2] as CheckBlock);
      i += 2;
    }
    const seq = lists[0].items[0]?.line ?? -1;
    let folded = 0;
    const kept: Block[] = [];
    let last: CheckBlock | null = null;
    for (let n = 0; n < lists.length; n++) {
      const items = show.has(seq) ? lists[n].items : lists[n].items.filter((it) => !(it.done && hide.has(it.line)));
      folded += lists[n].items.length - items.length;
      if (!items.length) continue;
      if (last) kept.push(gaps[n - 1]);
      last = { kind: 'check', items };
      kept.push(last);
    }
    if (!folded) {
      out.push(lists[0], ...lists.slice(1).flatMap((l, n) => [gaps[n], l]));
      continue;
    }
    if (last) Object.assign(last, { folded, seq });
    else kept.push({ kind: 'check', items: [], folded, seq });
    out.push(...kept);
  }
  return out;
}
