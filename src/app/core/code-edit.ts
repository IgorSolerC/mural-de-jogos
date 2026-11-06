import { codeLangOf } from './code-langs';

/**
 * As teclas do bloco de código, como num editor de código (o VS Code é a referência), iguais nos dois modos
 * do texto: o Visual (ui/visual-editor/keymap.ts) e o Markdown (ui/rich-editor.ts). Só contas: entra o texto
 * do bloco com a seleção, sai o texto novo com a seleção nova, e quem chamou troca só o que mudou
 * (`codeDiff`), para o desfazer e as cores andarem com as letras.
 *
 * - Tab: até a próxima parada do recuo que o bloco já usa (tabs, 4 ou 2 espaços; ver `indentUnit`). Com
 *   letras selecionadas, a linha inteira entra (as letras nunca são trocadas pelo recuo).
 * - Shift+Tab: o recuo volta uma parada, e a tecla nunca sai do bloco, mesmo sem nada para tirar.
 * - Enter: a linha nova com o recuo da de cima, e uma parada a mais depois de "{", "[", "(" (e do ":" em
 *   Python e YAML); entre "{}" o fecho desce para a linha dele.
 * - Backspace no recuo: volta uma parada de uma vez.
 * - Mover, duplicar e apagar a linha, comentar, e o Home que vai ao começo das letras.
 *
 * `margin` é o que vem na frente de toda linha e não é do código: no Markdown, o recuo da cerca e o "> " do
 * card. O código colado sem o recuo (a linha que não tem a margem) só perde o pedaço que não tem.
 */

export interface CodeState {
  text: string;
  from: number;
  to: number;
}

export interface CodeOptions {
  /** O que vem na frente de cada linha e não é do código (ver acima). */
  margin?: string;
  /** O que vem depois das crases ("js"): diz o jeito de comentar e o ":" que abre recuo. */
  lang?: string;
}

const TAB_SIZE = 4;

const lineStart = (text: string, at: number) => (at <= 0 ? 0 : text.lastIndexOf('\n', at - 1) + 1);
function lineEnd(text: string, at: number): number {
  const k = text.indexOf('\n', at);
  return k === -1 ? text.length : k;
}

/** Quantas letras do começo da linha são da margem. */
function marginOf(line: string, margin: string): number {
  let i = 0;
  while (i < margin.length && line[i] === margin[i]) i++;
  return i;
}

/** A largura de um começo de linha em colunas (o tab até a parada de 4). */
function widthOf(text: string): number {
  let w = 0;
  for (const ch of text) w += ch === '\t' ? TAB_SIZE - (w % TAB_SIZE) : 1;
  return w;
}

/** O recuo do código nesta linha: onde as letras dele começam, depois da margem. */
function leadOf(line: string, margin: string): { pre: number; lead: string } {
  const pre = marginOf(line, margin);
  return { pre, lead: /^[ \t]*/.exec(line.slice(pre))![0] };
}

/**
 * Uma parada do recuo no bloco: o tab, se alguma linha começa com ele; senão, o menor recuo que ele já usa
 * (4 espaços para quem escreve com 4), e 2 sem nenhum.
 */
export function indentUnit(text: string, margin = ''): string {
  let min = Infinity;
  for (const line of text.split('\n')) {
    const { pre, lead } = leadOf(line, margin);
    if (!line.slice(pre).trim()) continue;
    if (lead[0] === '\t') return '\t';
    if (lead.length >= 2) min = Math.min(min, lead.length);
  }
  return min === 4 || min === 8 ? '    ' : '  ';
}

// ===== As trocas em várias linhas =====

/** Uma troca no texto: `del` letras tiradas em `at`, `ins` postas ali. Em ordem, sem se cruzar. */
interface Swap {
  at: number;
  del: number;
  ins: string;
}

/** As trocas no texto, com a seleção andando junto. `keepFrom`: o começo da seleção fica antes do que entra nele. */
function swapAll(s: CodeState, swaps: readonly Swap[], keepFrom = false): CodeState {
  let text = '';
  let at = 0;
  for (const c of swaps) {
    text += s.text.slice(at, c.at) + c.ins;
    at = c.at + c.del;
  }
  text += s.text.slice(at);
  const map = (p: number, before: boolean) => {
    let out = p;
    for (const c of swaps) {
      if (p < c.at || (p === c.at && before)) break;
      out += p >= c.at + c.del ? c.ins.length - c.del : c.at + c.ins.length - p;
    }
    return out;
  };
  const empty = s.from === s.to;
  const from = map(s.from, keepFrom && !empty);
  return { text, from, to: empty ? from : map(s.to, false) };
}

/** As linhas que a seleção pega: o começo da primeira e o fim da última (a seleção que acaba no começo de uma linha não a pega). */
function rowsOf(s: CodeState): { first: number; last: number } {
  const first = lineStart(s.text, s.from);
  const to = s.to > s.from && lineStart(s.text, s.to) === s.to ? s.to - 1 : s.to;
  return { first, last: lineEnd(s.text, Math.max(first, to)) };
}

/** O começo de cada linha do trecho. */
function startsOf(text: string, first: number, last: number): number[] {
  const out = [first];
  for (let k = text.indexOf('\n', first); k !== -1 && k < last; k = text.indexOf('\n', k + 1)) out.push(k + 1);
  return out;
}

// ===== Tab =====

/** O recuo que sai de uma linha com o Shift+Tab: até a parada de antes (o tab da frente, inteiro). */
function outdentSize(lead: string, unit: string): number {
  if (!lead) return 0;
  if (lead[0] === '\t') return 1;
  const size = unit === '\t' ? TAB_SIZE : unit.length;
  const spaces = /^ */.exec(lead)![0].length;
  return Math.min(spaces, spaces % size || size);
}

/** Tab (`dir` 1) e Shift+Tab (-1). Sempre fica no bloco: sem nada para tirar, o texto volta igual. */
export function codeTab(s: CodeState, dir: 1 | -1, o: CodeOptions = {}): CodeState {
  const margin = o.margin ?? '';
  const unit = indentUnit(s.text, margin);
  if (dir > 0 && s.from === s.to) {
    const start = lineStart(s.text, s.from);
    const { pre } = leadOf(s.text.slice(start, lineEnd(s.text, s.from)), margin);
    // (o cursor em cima da margem conta como logo depois dela)
    const at = Math.max(s.from, start + pre);
    const ins = unit === '\t' ? '\t' : ' '.repeat(unit.length - (widthOf(s.text.slice(start + pre, at)) % unit.length));
    const caret = at + ins.length;
    return { text: s.text.slice(0, at) + ins + s.text.slice(at), from: caret, to: caret };
  }
  const { first, last } = rowsOf(s);
  const starts = startsOf(s.text, first, last);
  const single = starts.length === 1;
  const swaps: Swap[] = [];
  for (const start of starts) {
    const line = s.text.slice(start, lineEnd(s.text, start));
    const { pre, lead } = leadOf(line, margin);
    if (dir > 0) {
      // a linha em branco no meio da seleção fica como está
      if (single || line.slice(pre).trim()) swaps.push({ at: start + pre, del: 0, ins: unit });
    } else {
      const n = outdentSize(lead, unit);
      if (n) swaps.push({ at: start + pre, del: n, ins: '' });
    }
  }
  return swaps.length ? swapAll(s, swaps, true) : s;
}

// ===== Enter =====

const CLOSER: Record<string, string> = { '{': '}', '[': ']', '(': ')' };

/** Em Python e YAML, o ":" no fim da linha abre um nível. */
const COLON_LANGS = new Set(['python', 'yaml']);

/** A quebra de linha com o recuo. */
export function codeEnter(s: CodeState, o: CodeOptions = {}): CodeState {
  const margin = o.margin ?? '';
  const start = lineStart(s.text, s.from);
  const before = s.text.slice(start, s.from);
  const after = s.text.slice(s.to, lineEnd(s.text, s.to));
  const { pre, lead } = leadOf(before, margin);
  const own = before.slice(0, pre);
  const indent = own + lead;
  const put = (from: number, to: number, piece: string, caret = piece.length): CodeState => ({ text: s.text.slice(0, from) + piece + s.text.slice(to), from: from + caret, to: from + caret });
  // a linha só de recuo não fica com ele: ela sai em branco, e a nova mantém o recuo
  if (s.from === s.to && !before.slice(pre).trim() && !after) return put(start + pre, s.to, '\n' + indent);
  const code = before.slice(pre).trimEnd();
  const last = code.at(-1) ?? '';
  const lang = codeLangOf(o.lang ?? '')?.id ?? '';
  const opens = last in CLOSER || (last === ':' && COLON_LANGS.has(lang));
  if (!opens) return put(s.from, s.to, '\n' + indent);
  const inner = indent + indentUnit(s.text, margin);
  const head = '\n' + inner;
  // entre o par: o fecho desce para a linha dele, com o recuo da de cima
  if (last in CLOSER && after.trimStart()[0] === CLOSER[last]) return put(s.from, s.to, head + '\n' + indent, head.length);
  return put(s.from, s.to, head);
}

// ===== Backspace =====

/** O Backspace no recuo: até a parada de antes. Null fora dele (a letra de sempre). */
export function codeBackspace(s: CodeState, o: CodeOptions = {}): CodeState | null {
  if (s.from !== s.to) return null;
  const margin = o.margin ?? '';
  const start = lineStart(s.text, s.from);
  const before = s.text.slice(start, s.from);
  const pre = marginOf(before, margin);
  const lead = before.slice(pre);
  if (!lead || lead.trim()) return null;
  let n = 1;
  if (!lead.endsWith('\t')) {
    const unit = indentUnit(s.text, margin);
    const size = unit === '\t' ? TAB_SIZE : unit.length;
    const spaces = /( *)$/.exec(lead)![1].length;
    n = Math.min(spaces, widthOf(lead) % size || size);
  }
  return { text: s.text.slice(0, s.from - n) + s.text.slice(s.from), from: s.from - n, to: s.from - n };
}

// ===== As linhas inteiras =====

/** Alt+seta: as linhas da seleção sobem ou descem uma, levando a seleção. Null na ponta. */
export function codeMoveLines(s: CodeState, dir: 1 | -1): CodeState | null {
  const { first, last } = rowsOf(s);
  const block = s.text.slice(first, last);
  if (dir < 0) {
    if (first === 0) return null;
    const above = lineStart(s.text, first - 1);
    const other = s.text.slice(above, first - 1);
    const shift = other.length + 1;
    return { text: s.text.slice(0, above) + block + '\n' + other + s.text.slice(last), from: s.from - shift, to: s.to - shift };
  }
  if (last === s.text.length) return null;
  const below = lineEnd(s.text, last + 1);
  const other = s.text.slice(last + 1, below);
  const shift = other.length + 1;
  const text = s.text.slice(0, first) + other + '\n' + block + s.text.slice(below);
  // (a seleção que acabava no começo da linha de baixo: agora é a do fim do bloco, e o texto pode acabar ali)
  return { text, from: s.from + shift, to: Math.min(s.to + shift, text.length) };
}

/** Shift+Alt+seta: uma cópia das linhas da seleção embaixo; a seleção vai para a cópia de baixo (seta para baixo) ou fica na de cima. */
export function codeDuplicateLines(s: CodeState, dir: 1 | -1): CodeState {
  const { first, last } = rowsOf(s);
  const block = s.text.slice(first, last);
  const text = s.text.slice(0, last) + '\n' + block + s.text.slice(last);
  const shift = dir > 0 ? block.length + 1 : 0;
  return { text, from: s.from + shift, to: s.to + shift };
}

/** Ctrl+Shift+K: as linhas da seleção saem; o cursor fica na mesma coluna da linha que sobe (ou da de cima, no fim). */
export function codeDeleteLines(s: CodeState): CodeState {
  const { first, last } = rowsOf(s);
  const col = s.from - first;
  const atEnd = last === s.text.length;
  const text = atEnd ? s.text.slice(0, Math.max(0, first - 1)) : s.text.slice(0, first) + s.text.slice(last + 1);
  const start = atEnd ? lineStart(text, text.length) : first;
  const caret = Math.min(start + col, lineEnd(text, start));
  return { text, from: caret, to: caret };
}

// ===== Comentar =====

/** Como cada linguagem comenta uma linha (`id` de core/code-langs.ts); sem aqui, ela não tem comentário (o JSON). */
const COMMENTS: Readonly<Record<string, readonly [string, string?]>> = {
  javascript: ['//'],
  typescript: ['//'],
  csharp: ['//'],
  java: ['//'],
  c: ['//'],
  cpp: ['//'],
  go: ['//'],
  rust: ['//'],
  kotlin: ['//'],
  php: ['//'],
  scss: ['//'],
  swift: ['//'],
  dart: ['//'],
  python: ['#'],
  bash: ['#'],
  powershell: ['#'],
  ruby: ['#'],
  yaml: ['#'],
  ini: ['#'],
  dockerfile: ['#'],
  sql: ['--'],
  css: ['/*', '*/'],
  xml: ['<!--', '-->'],
  markdown: ['<!--', '-->'],
};

/**
 * Ctrl+/: comenta as linhas da seleção, ou tira o comentário se todas já têm, na coluna do menor recuo
 * delas. Null sem saber como a linguagem comenta (a tecla continua sendo a da Ajuda).
 */
export function codeComment(s: CodeState, o: CodeOptions = {}): CodeState | null {
  const look = COMMENTS[codeLangOf(o.lang ?? '')?.id ?? ''];
  if (!look) return null;
  const [open, close] = look;
  const margin = o.margin ?? '';
  const { first, last } = rowsOf(s);
  const rows = startsOf(s.text, first, last).map((start) => {
    const line = s.text.slice(start, lineEnd(s.text, start));
    const { pre, lead } = leadOf(line, margin);
    return { start, pre, lead, code: line.slice(pre + lead.length) };
  });
  const full = rows.filter((r) => r.code.trim());
  if (!full.length) return s;
  const commented = full.every((r) => r.code.startsWith(open) && (!close || r.code.trimEnd().endsWith(close)));
  const col = Math.min(...full.map((r) => r.lead.length));
  const swaps: Swap[] = [];
  for (const r of full) {
    const codeAt = r.start + r.pre + r.lead.length;
    if (commented) {
      const gap = r.code[open.length] === ' ' ? 1 : 0;
      swaps.push({ at: codeAt, del: open.length + gap, ins: '' });
      if (close) {
        // (o comentário vazio, "/* */": o espaço do meio só sai uma vez)
        const code = r.code.trimEnd();
        const end = codeAt + code.length;
        const spaced = code.at(-close.length - 1) === ' ' ? 1 : 0;
        const at = Math.max(end - close.length - spaced, codeAt + open.length + gap);
        swaps.push({ at, del: end - at, ins: '' });
      }
    } else {
      swaps.push({ at: r.start + r.pre + col, del: 0, ins: open + ' ' });
      if (close) swaps.push({ at: codeAt + r.code.trimEnd().length, del: 0, ins: ' ' + close });
    }
  }
  return swapAll(s, swaps, true);
}

// ===== Home =====

/** Home: o começo das letras da linha; de novo (ou já nele), o começo da linha. */
export function codeHome(text: string, head: number, margin = ''): number {
  const start = lineStart(text, head);
  const { pre, lead } = leadOf(text.slice(start, lineEnd(text, head)), margin);
  const letters = start + pre + lead.length;
  return head === letters ? start + pre : letters;
}

// ===== A troca mínima =====

/** O que mudou de `a` para `b`: de `de` a `ate` em `a`, trocado por `ins`. */
export function codeDiff(a: string, b: string): { de: number; ate: number; ins: string } {
  let de = 0;
  const max = Math.min(a.length, b.length);
  while (de < max && a[de] === b[de]) de++;
  let fim = 0;
  while (fim < max - de && a[a.length - 1 - fim] === b[b.length - 1 - fim]) fim++;
  return { de, ate: a.length - fim, ins: b.slice(de, b.length - fim) };
}
