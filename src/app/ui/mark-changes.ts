import { commonPairs } from '../core/merge3';

/**
 * As diferenças entre dois textos marcadas no texto formatado (ui/rich-text.ts com `anchors`), para a
 * folha do conflito (ui/conflict-sheet.ts): a linha que mudou ganha a classe `mudou` (a faixa clara de
 * marca-texto), e as palavras que só um lado tem, o marca-texto forte, pela Highlight API do CSS
 * (`::highlight(conflito)`, em styles.scss). O HTML do Angular não muda: só a classe na linha.
 *
 * As linhas que mudaram saem do texto escrito (como na junção, por linhas); as palavras, do texto
 * desenhado (sem as marcas: "**sacolão**" e "sacolão" são a mesma palavra, e o negrito já se vê).
 */

/** O nome do realce no CSS: `::highlight(conflito)`. */
export const CHANGE_HIGHLIGHT = 'conflito';

/** Um trecho que mudou: as linhas de cada lado (do texto escrito) entre duas linhas iguais. */
export interface Hunk {
  a: number[];
  b: number[];
}

const range = (from: number, to: number) => Array.from({ length: Math.max(0, to - from) }, (_, i) => from + i);

/**
 * Os trechos que mudaram entre os dois textos (as linhas que só um tem, juntas entre as iguais). A linha
 * em branco não conta: não se vê, e marcá-la marcaria o que vem antes dela (o desenho de cada linha é o
 * do bloco onde ela cai).
 */
export function changedHunks(a: string, b: string): Hunk[] {
  const la = a.split('\n');
  const lb = b.split('\n');
  const pairs: [number, number][] = [...commonPairs(la, lb), [la.length, lb.length]];
  const out: Hunk[] = [];
  let pi = -1;
  let pj = -1;
  for (const [i, j] of pairs) {
    const ha = range(pi + 1, i).filter((k) => la[k].trim());
    const hb = range(pj + 1, j).filter((k) => lb[k].trim());
    if (ha.length || hb.length) out.push({ a: ha, b: hb });
    pi = i;
    pj = j;
  }
  return out;
}

/** O que está desenhado de cada linha: o elemento mais fundo com o maior `data-l` até ela. */
function lineElements(root: HTMLElement): { l: number; el: HTMLElement }[] {
  return [...root.querySelectorAll<HTMLElement>('[data-l]')].map((el) => ({ l: Number(el.dataset['l']), el })).filter((x) => Number.isFinite(x.l));
}

function elementFor(list: readonly { l: number; el: HTMLElement }[], line: number): HTMLElement | null {
  let best: { l: number; el: HTMLElement } | null = null;
  // na ordem do documento: com o mesmo número, vale o de dentro (que vem depois)
  for (const x of list) if (x.l <= line && (!best || x.l >= best.l)) best = x;
  return best?.el ?? null;
}

interface Token {
  text: string;
  node: Text;
  start: number;
  end: number;
}

/** Os ideogramas e os kanas um a um (o japonês não tem espaço); o resto, palavra a palavra. */
const TOKEN = /[\p{Script=Han}\p{Script=Hiragana}\p{Script=Katakana}]|[\p{L}\p{N}]+|[^\s\p{L}\p{N}]/gu;
/**
 * O spoiler ainda escondido (o marca-texto contaria o segredo) e o que só o leitor de tela ouve ("A fazer:").
 * A leitura em voz alta também não lê nada disso (ui/voz-frases.ts).
 */
export const HIDDEN = '.spoiler-texto[inert], [aria-hidden="true"], .sr-only';
/** Trechos grandes demais ficam só com a faixa da linha (a conta das palavras seria cara). */
const MAX_TOKENS = 3000;

function tokensOf(elements: readonly HTMLElement[]): Token[] {
  const out: Token[] = [];
  const seen = new Set<Text>();
  for (const el of elements) {
    const walk = el.ownerDocument.createTreeWalker(el, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
      if (seen.has(n) || n.parentElement?.closest(HIDDEN)) continue;
      seen.add(n);
      for (const m of n.data.matchAll(TOKEN)) out.push({ text: m[0], node: n, start: m.index!, end: m.index! + m[0].length });
    }
  }
  return out;
}

/** Os elementos das linhas do trecho, sem repetir (as letras de um dentro do outro contam uma vez, ver `tokensOf`). */
function elementsOf(list: readonly { l: number; el: HTMLElement }[], lines: readonly number[]): HTMLElement[] {
  return [...new Set(lines.map((l) => elementFor(list, l)).filter((e): e is HTMLElement => !!e))];
}

/**
 * Marca as diferenças nos dois textos desenhados. Devolve os trechos de palavras (os `Range`) para o
 * realce; quem chama junta e pinta (`paintChanges`). Chamar de novo refaz tudo (as classes velhas saem).
 */
export function markChanges(rootA: HTMLElement | null, rootB: HTMLElement | null, hunks: readonly Hunk[]): Range[] {
  const listA = rootA ? lineElements(rootA) : [];
  const listB = rootB ? lineElements(rootB) : [];
  const onA = new Set<HTMLElement>();
  const onB = new Set<HTMLElement>();
  const ranges: Range[] = [];
  for (const h of hunks) {
    const ea = elementsOf(listA, h.a);
    const eb = elementsOf(listB, h.b);
    ea.forEach((e) => onA.add(e));
    eb.forEach((e) => onB.add(e));
    const ta = tokensOf(ea);
    const tb = tokensOf(eb);
    if (ta.length > MAX_TOKENS || tb.length > MAX_TOKENS) continue;
    const pairs = commonPairs(
      ta.map((t) => t.text),
      tb.map((t) => t.text),
    );
    const keptA = new Set(pairs.map(([i]) => i));
    const keptB = new Set(pairs.map(([, j]) => j));
    const doc = (rootA ?? rootB)!.ownerDocument;
    const add = (t: Token) => {
      const r = doc.createRange();
      r.setStart(t.node, t.start);
      r.setEnd(t.node, t.end);
      ranges.push(r);
    };
    ta.forEach((t, i) => !keptA.has(i) && add(t));
    tb.forEach((t, j) => !keptB.has(j) && add(t));
  }
  for (const [list, on] of [
    [listA, onA],
    [listB, onB],
  ] as const) {
    for (const { el } of list) el.classList.toggle('mudou', on.has(el));
  }
  return ranges;
}

/** As palavras de cada folha aberta: o realce do CSS é um só na página, com as de todas juntas. */
const live = new Map<object, readonly Range[]>();

function repaint(): void {
  if (typeof CSS === 'undefined' || !('highlights' in CSS)) return;
  const all = [...live.values()].flat();
  if (all.length) CSS.highlights.set(CHANGE_HIGHLIGHT, new Highlight(...all));
  else CSS.highlights.delete(CHANGE_HIGHLIGHT);
}

/** Pinta as palavras de `owner` (ou apaga as dele, com a lista vazia); as das outras folhas ficam. */
export function paintChanges(owner: object, ranges: readonly Range[]): void {
  if (ranges.length) live.set(owner, ranges);
  else live.delete(owner);
  repaint();
}

/** Apaga as palavras de `owner` (a folha fechou). */
export function clearChanges(owner: object): void {
  if (live.delete(owner)) repaint();
}
