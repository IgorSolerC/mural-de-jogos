import { HIDDEN } from './mark-changes';

/**
 * As frases para ler em voz alta (PLANO-VOZ.md), tiradas do texto que a folha desenha, e não do markdown:
 * as marcas (`**`, `==`, `((`) nunca são lidas, e só o que está à mostra entra, na ordem da tela. Cada
 * frase guarda os pedaços dos nós de texto de onde veio, para o marca-texto (`rangesOf`) e para achar a
 * frase onde a pessoa tocou (`sentenceAt`).
 *
 * Fica de fora: o que só o leitor de tela ouve e o spoiler fechado (o mesmo `HIDDEN` das diferenças da
 * folha de conflito), os botões (Copiar do código, "3 tarefas feitas"), os widgets (foto, vídeo, som,
 * contador), o que está dentro de um card fechado e o que o CSS esconde.
 *
 * Cada linha da folha (`.linha`), célula de tabela e linha de código é um pedaço à parte: a frase nunca
 * passa de uma para a outra. Uma frase longa demais se parte (nas vírgulas, senão nos espaços): as vozes
 * do Google no Chrome se calam depois de uns 14 segundos de fala seguida.
 */

/** Um trecho de um nó de texto: de `from` até `to` (sem incluir). */
export interface Piece {
  node: Text;
  from: number;
  to: number;
}

/** Uma frase: o que a voz fala (os espaços juntos) e de onde ela veio na tela. */
export interface Sentence {
  text: string;
  pieces: readonly Piece[];
}

export interface SentenceOptions {
  /** A língua (BCP 47, "ja-JP"): onde a frase acaba depende dela. */
  lang: string;
  /** O máximo de letras de uma fala (ver `maxSpeech`). */
  max: number;
}

/**
 * O máximo de letras de uma fala na língua, para caber em uns 10 segundos na velocidade: o japonês fala
 * umas 6 letras por segundo (cada kanji leva mais de um som); o português e o inglês, umas 14. De 0,75×
 * para cima, o tamanho de 0,75×; abaixo, menor na mesma proporção (a 0,25×, um terço).
 */
export function maxSpeech(lang: string, rate = 1): number {
  const at075 = lang.toLowerCase().startsWith('ja') ? 50 : 120;
  return Math.round(at075 * Math.min(1, rate / 0.75));
}

/** Fora da leitura: o que o leitor de tela ouve, o spoiler fechado, os botões, os widgets e o desenho. */
const SKIP = `${HIDDEN}, button, input, svg, app-note-widget, details:not([open]) > :not(summary)`;
/** Onde uma frase acaba à força: cada linha da folha, cada célula e cada linha de código são um pedaço só. */
const BLOCK = '.linha, th, td, pre, h1, h2, h3, h4, h5, h6, p, li';
/** Sem letra nem número, não há o que falar ("---", "…", "→"). */
const SPEAKS = /[\p{L}\p{N}]/u;
/** Onde partir uma frase longa, de preferência: depois de uma vírgula, ponto e vírgula, dois pontos ou a vírgula japonesa. */
const SOFT_STOP = /[,;:、，；：]\s*/gu;

/** Um pedaço da tela: o texto seguido e o começo de cada nó de texto dentro dele. */
interface Flow {
  text: string;
  nodes: { node: Text; at: number }[];
}

/** O CSS esconde? (`checkVisibility` olha o display, o content-visibility e o visibility). */
function shown(el: Element, memo: Map<Element, boolean>): boolean {
  let v = memo.get(el);
  if (v === undefined) {
    v = typeof el.checkVisibility === 'function' ? el.checkVisibility({ visibilityProperty: true }) : true;
    memo.set(el, v);
  }
  return v;
}

/** Os pedaços da tela, na ordem: um novo a cada vez que o texto muda de linha, de célula ou de raiz. */
function flowsOf(roots: readonly Element[]): Flow[] {
  const flows: Flow[] = [];
  const memo = new Map<Element, boolean>();
  for (const root of roots) {
    let block: Element | null = null;
    let flow: Flow | null = null;
    const walk = root.ownerDocument.createTreeWalker(root, NodeFilter.SHOW_TEXT);
    for (let n = walk.nextNode() as Text | null; n; n = walk.nextNode() as Text | null) {
      const parent = n.parentElement;
      if (!n.data || !parent || parent.closest(SKIP) || !shown(parent, memo)) continue;
      const near = parent.closest(BLOCK);
      const here = near && root.contains(near) ? near : root;
      if (!flow || here !== block) {
        block = here;
        flow = { text: '', nodes: [] };
        flows.push(flow);
      }
      flow.nodes.push({ node: n, at: flow.text.length });
      flow.text += n.data;
    }
  }
  return flows;
}

/** O trecho [from, to) do pedaço, nos nós de texto de onde ele veio. */
function piecesOf(flow: Flow, from: number, to: number): Piece[] {
  const out: Piece[] = [];
  for (const { node, at } of flow.nodes) {
    const a = Math.max(from, at);
    const b = Math.min(to, at + node.data.length);
    if (a < b) out.push({ node, from: a - at, to: b - at });
  }
  return out;
}

/** As duas ferramentas de partir texto da língua, feitas uma vez por leitura (e não uma por linha). */
interface Cutters {
  sentence: Intl.Segmenter;
  word: Intl.Segmenter;
}

/** O corte não cai no meio de um caractere de dois pedaços (um emoji, um kanji raro como 𠮷). */
function whole(text: string, i: number): number {
  const c = text.charCodeAt(i - 1);
  return c >= 0xd800 && c <= 0xdbff ? i - 1 || i + 1 : i;
}

/** Onde partir uma frase longa: depois da última vírgula que deixa a fala com um terço do máximo ou mais; senão, no último espaço; senão, numa palavra (o japonês não tem espaço); senão, no máximo. */
function cutAt(text: string, max: number, word: Intl.Segmenter): number {
  const head = text.slice(0, max + 1);
  let best = -1;
  for (const m of head.matchAll(SOFT_STOP)) {
    const end = m.index! + m[0].length;
    if (end <= max && end >= max / 3) best = end;
  }
  if (best > 0) return best;
  const space = head.lastIndexOf(' ', max);
  if (space >= max / 3) return space + 1;
  let at = -1;
  for (const s of word.segment(head)) if (s.index > 0 && s.index <= max) at = s.index;
  return whole(text, at >= max / 3 ? at : max);
}

/** As frases de um trecho do pedaço ([from, to), sem quebra de linha dentro), cada uma com no máximo `max` letras. */
function pushSentences(out: Sentence[], flow: Flow, from: number, to: number, max: number, cut: Cutters): void {
  const text = flow.text.slice(from, to);
  for (const seg of cut.sentence.segment(text)) {
    let a = seg.index;
    const b = seg.index + seg.segment.length;
    while (a < b) {
      // sem os espaços das pontas (o marca-texto pega só as letras)
      while (a < b && /\s/u.test(text[a])) a++;
      let e = b;
      while (e > a && /\s/u.test(text[e - 1])) e--;
      if (a >= e) break;
      const end = e - a > max ? a + cutAt(text.slice(a, e), max, cut.word) : e;
      // o espaço depois da vírgula onde partiu fica para a próxima, fora do marca-texto
      let last = end;
      while (last > a && /\s/u.test(text[last - 1])) last--;
      const said = text.slice(a, last).replace(/\s+/gu, ' ');
      if (SPEAKS.test(said)) out.push({ text: said, pieces: piecesOf(flow, from + a, from + last) });
      a = end;
    }
  }
}

/**
 * As frases das raízes (o nome da ficha e o texto desenhado), na ordem. Chamar de novo depois que a folha
 * se desenha outra vez (a nota mudou) dá as frases novas; `findAgain` acha onde a leitura estava.
 */
export function sentencesOf(roots: readonly Element[], opts: SentenceOptions): Sentence[] {
  const out: Sentence[] = [];
  const cut: Cutters = {
    sentence: new Intl.Segmenter(opts.lang, { granularity: 'sentence' }),
    word: new Intl.Segmenter(opts.lang, { granularity: 'word' }),
  };
  for (const flow of flowsOf(roots)) {
    // a quebra de linha (dentro do bloco de código) acaba a frase
    let start = 0;
    for (const m of flow.text.matchAll(/\n/gu)) {
      pushSentences(out, flow, start, m.index!, opts.max, cut);
      start = m.index! + 1;
    }
    pushSentences(out, flow, start, flow.text.length, opts.max, cut);
  }
  return out;
}

/**
 * As palavras à mostra, na ordem da tela, cada uma com os pedaços dos nós de texto de onde veio (a palavra
 * com um pedaço em negrito tem dois): o modo estudo da voz as cobre de rabisco (ui/voz-estudo.ts). Só o que
 * tem letra ou número (kana e kanji são letras); a pontuação, os espaços, os símbolos e os emojis ficam de
 * fora. O japonês, sem espaços, se parte em palavras pelo dicionário do navegador (私|の|ケーキ|です).
 */
export function wordsOf(roots: readonly Element[], lang: string): Piece[][] {
  const out: Piece[][] = [];
  const word = new Intl.Segmenter(lang, { granularity: 'word' });
  for (const flow of flowsOf(roots)) {
    for (const s of word.segment(flow.text)) {
      if (SPEAKS.test(s.segment)) out.push(piecesOf(flow, s.index, s.index + s.segment.length));
    }
  }
  return out;
}

/** Os trechos da frase (ou da palavra) na tela, para o marca-texto. O nó que saiu da folha fica de fora. */
export function rangesOf(s: Pick<Sentence, 'pieces'>): Range[] {
  const out: Range[] = [];
  for (const p of s.pieces) {
    if (!p.node.isConnected || p.to > p.node.data.length) continue;
    const r = p.node.ownerDocument.createRange();
    r.setStart(p.node, p.from);
    r.setEnd(p.node, p.to);
    out.push(r);
  }
  return out;
}

/**
 * As letras [from, to) do texto falado da frase (os espaços juntos num só, como em `text`) na tela: a
 * palavra que a voz avisa que está dizendo. Vazio fora da frase.
 */
export function rangesOfChars(s: Sentence, from: number, to: number): Range[] {
  // onde cada letra falada está: o nó e a letra nele (um espaço seguido conta uma vez só)
  const at: { node: Text; i: number }[] = [];
  let space = false;
  for (const p of s.pieces) {
    if (!p.node.isConnected || p.to > p.node.data.length) return [];
    for (let i = p.from; i < p.to; i++) {
      const isSpace = /\s/u.test(p.node.data[i]);
      if (!isSpace || !space) at.push({ node: p.node, i });
      space = isSpace;
    }
  }
  const a = Math.max(0, from);
  const b = Math.min(to, at.length);
  const out: Range[] = [];
  let r: Range | null = null;
  for (let k = a; k < b; k++) {
    const { node, i } = at[k];
    if (r && r.endContainer === node && r.endOffset === i) r.setEnd(node, i + 1);
    else {
      r = node.ownerDocument.createRange();
      r.setStart(node, i);
      r.setEnd(node, i + 1);
      out.push(r);
    }
  }
  return out;
}

/**
 * A frase do ponto (o nó e a letra onde a pessoa tocou): a que tem o ponto dentro (as pontas contam: tocar
 * na metade direita da última letra dá a letra depois dela) ou, entre duas, a de depois; -1 depois da
 * última. Quem chama só pergunta por pontos dentro das raízes lidas.
 */
export function sentenceAt(list: readonly Sentence[], node: Node, offset: number): number {
  for (let i = 0; i < list.length; i++) {
    const ps = list[i].pieces.filter((p) => p.node.isConnected);
    if (!ps.length) continue;
    const last = ps[ps.length - 1];
    const r = node.ownerDocument!.createRange();
    r.setStart(ps[0].node, ps[0].from);
    r.setEnd(last.node, Math.min(last.to, last.node.data.length));
    if (r.comparePoint(node, offset) <= 0) return i;
  }
  return -1;
}

/**
 * Onde a leitura estava, nas frases novas (a nota mudou enquanto era lida: outra pessoa escreveu na
 * compartilhada, ou o spoiler se abriu): a frase igual mais perto de onde estava; sem ela, a mesma posição
 * (ou a última). -1 sem frase nenhuma.
 */
export function findAgain(text: string, near: number, list: readonly Sentence[]): number {
  if (!list.length) return -1;
  let best = -1;
  for (let i = 0; i < list.length; i++) {
    if (list[i].text === text && (best < 0 || Math.abs(i - near) < Math.abs(best - near))) best = i;
  }
  return best >= 0 ? best : Math.min(Math.max(near, 0), list.length - 1);
}
