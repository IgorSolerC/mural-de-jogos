import { FbFrame, FbNode, noteColor, noteLook, noteParts } from '../../core/free-board';
import { calloutFallbackTitle, calloutPaper } from '../../core/callouts';
import { PixelArt, readPixelArt } from '../../core/pixel-art';
import { Stock, isDarkStock } from '../../core/review';
import { plainText } from '../../core/rich-text';
import { TableLook, parseTableText, tableLookOf } from '../../core/tables';
import { Frame, When, parseWidgetLine, readAudio, readCardRef, readCountdown, readMedia } from '../../core/widgets';
import { localImageId } from '../../core/images';
import { DEFAULT_FRAME, FELT_HEX, STOCK_HEX } from './far-layer';
import { cardPaper, jeitoInks, lightness, manilha, rootColor, stockColor } from './far-palette';
import { PieceInfo, pieceInfo } from './scene';

/**
 * A aparência de cada peça do Quadro livre em ponto pequeno (PLANO-MINIATURA-CANVAS.md, D1 e D3): o papel, a faixa
 * de cima, a tinta, o título e o que a peça tem de próprio (os pontos da pixel art, a foto, as linhas da tabela).
 * Uma função só para os três desenhos: a miniatura do canvas no mural (board-sketch.ts), o assado dela e a camada de
 * longe do editor (far-layer.ts), e o nível meio das peças (free-board-piece.ts). Assim a nota colada amarela é
 * amarela em todo zoom.
 *
 * Pura, a não ser pelas cores, que vêm do CSS (far-palette.ts).
 */

/** O que se sabe da ficha colada (o widget Nota), achada pelo id. */
export interface CardInfo {
  stock: Stock;
  /** O nome da ficha achada (nunca o título escrito na linha: na visita, a privada não aparece). */
  name: string;
  /** Ela tem pasta (a orelhinha de manilha). */
  folder: boolean;
}

/** Acha a ficha colada pelo id (null: não está aqui, ou não é desta pessoa ver). */
export type CardOf = (id: string) => CardInfo | null;

export type FarInner =
  /** Os pontos do desenho. */
  | { kind: 'pixels'; art: PixelArt }
  /** A foto guardada no Murall (o id), ou null (a de fora, que não vem). */
  | { kind: 'image'; id: string | null; frame: Frame }
  /** As fileiras da tabela: o cabeçalho, as listras, os fios. */
  | { kind: 'rows'; look: TableLook; rows: number; cols: number; head: string | null; stripe: string | null; rule: string }
  /** O contador: o dia que ele conta (o assado escreve quanto falta). */
  | { kind: 'days'; when: When | null }
  /** O vídeo e o som: o ícone claro no escuro. */
  | { kind: 'play'; icon: 'video' | 'audio' };

export interface PieceLook {
  /** O papel (o fundo da peça); '' sem papel (a tabela a caneta é giz na parede). */
  paper: string;
  /** A faixa de cima (o título do card, o alto do calendário), em fração da altura. */
  band: { color: string; frac: number } | null;
  /** A tinta do título (sobre a faixa, se houver, senão sobre o papel). */
  ink: string;
  /** A tinta do texto sobre o papel (o corpo, as linhas). */
  bodyInk: string;
  /** O título, uma linha ('' sem título). */
  title: string;
  /** O começo do que tem dentro, em texto corrido (o assado mostra duas linhas). */
  body: string;
  /** A beirada (o branco da polaroide, o aro do neon), em fração do lado menor. */
  edge: { color: string; frac: number } | null;
  inner: FarInner | null;
  /** A orelhinha da pasta (a ficha colada que tem grupo), da cor dela. */
  tab: string | null;
}

export interface FrameLook {
  felt: string;
  /** O pesponto e a fita do nome: a cartolina da moldura. */
  stitch: string;
  /** A tinta das letras da fita. */
  tapeInk: string;
  name: string;
}

/** A tinta escura e a clara de cima dos papéis. */
const INK = '#1b1916';
const INK_LIGHT = '#f3efe6';
/** A foto que não chegou (a mesma cor da peça do meio que espera). */
export const PHOTO_WAIT = '#5d5954';

/**
 * As cores de cada jeito do contador, de ui/countdown.ts: o calendário de destacar (a folha creme com o alto
 * vermelho), o letreiro de neon (o azul da noite com o aro ciano), o placar de plaquinhas (preto, letra amarela) e o
 * bloquinho adesivo amarelo.
 */
const COUNTDOWN = {
  calendario: { paper: '#fffdf6', band: '#a51c1b', ink: '#fbf6ea', body: '#151515', edge: null },
  neon: { paper: '#0d0f22', band: null, ink: '#ffe3f6', body: '#9ff0ff', edge: '#b8f6ff' },
  placar: { paper: '#1b1b1e', band: null, ink: '#f6c64a', body: '#f1ece0', edge: null },
  riscado: { paper: '#fbe46f', band: null, ink: '#151515', body: '#151515', edge: null },
} as const;

/** Os papéis da tabela, de ui/_formatado.scss (`branca-listrada-papel`, `listrada-cabeca`, `recibo-papel`…). */
const TABLE: Record<TableLook, { paper: string; head: string | null; stripe: string | null; rule: string; ink: string }> = {
  branca: { paper: '#fffefb', head: null, stripe: null, rule: 'rgb(34 32 29 / 0.22)', ink: '#22201d' },
  listrada: { paper: '#fffefb', head: '#22201d', stripe: '#f1ebde', rule: 'transparent', ink: '#22201d' },
  quadriculada: { paper: '#f8fbff', head: null, stripe: null, rule: 'rgb(64 110 190 / 0.45)', ink: '#1d2a46' },
  caneta: { paper: '', head: null, stripe: null, rule: 'rgb(243 239 230 / 0.55)', ink: INK_LIGHT },
  recibo: { paper: '#fbfaf4', head: null, stripe: null, rule: 'rgb(43 42 40 / 0.3)', ink: '#2b2a28' },
};

/** O escuro do vídeo e do som. */
const PLAYER = '#2b2a28';

/** A moldura: o feltro escuro da cor, o pesponto e a fita da cartolina, o nome. */
export function frameLook(node: FbFrame): FrameLook {
  const c = node.c ?? DEFAULT_FRAME;
  return { felt: FELT_HEX[c], stitch: STOCK_HEX[c], tapeInk: INK, name: (node.nome ?? '').trim() };
}

const plain = (s: string, max: number) => plainText(s).replace(/\s+/g, ' ').trim().slice(0, max);

/** Uma peça que não é moldura. */
export function pieceLook(node: FbNode, cards: CardOf | null, info: PieceInfo = pieceInfo(node)): PieceLook {
  const base: PieceLook = { paper: cardPaper(), band: null, ink: INK, bodyInk: INK, title: '', body: '', edge: null, inner: null, tab: null };
  if (node.t === 'x') {
    // o card do texto: a faixa do jeito (o título) e a folha clara (o resto)
    const look = noteLook(node);
    const inks = jeitoInks(calloutPaper(look, noteColor(node)));
    const parts = noteParts(node.txt);
    const title = plain(parts.title, 120) || calloutFallbackTitle(look);
    const body = plain(parts.body, 160);
    // só o título: a faixa enche o card, como na peça (o papel do jeito, sem a folha clara)
    return { ...base, paper: body ? inks.miolo : inks.papel, band: body ? { color: inks.papel, frac: 0.24 } : null, ink: inks.tinta, bodyInk: INK, title, body };
  }
  if (node.t !== 'w') return base;
  const parsed = parseWidgetLine(node.src.split('\n')[0]);
  const args = parsed?.args ?? [];
  switch (info.kind === 'widget' ? (parsed?.name ?? 'tabela') : info.kind) {
    case 'nota': {
      const ref = readCardRef(args);
      const card = ref.id && cards ? cards(ref.id) : null;
      if (!card) return { ...base, paper: cardPaper(), ink: '#6d675d', title: '' };
      const paper = stockColor(card.stock);
      const ink = isDarkStock(card.stock) || lightness(paper) < 0.18 ? INK_LIGHT : INK;
      return { ...base, paper, ink, bodyInk: ink, title: card.name, tab: card.folder ? manilha() : null };
    }
    case 'imagem': {
      const m = readMedia(args);
      const white = m.frame === 'recorte' ? null : { color: '#fbfaf5', frac: m.frame === 'polaroid' ? 0.07 : m.frame === 'adesivo' ? 0.05 : 0.035 };
      return { ...base, paper: PHOTO_WAIT, edge: white, inner: { kind: 'image', id: info.image ?? localImageId(m.url), frame: m.frame } };
    }
    case 'pixel': {
      const art = readPixelArt(args);
      return { ...base, paper: '', title: art.caption, inner: { kind: 'pixels', art } };
    }
    case 'contador': {
      const c = readCountdown(args);
      const k = COUNTDOWN[c.look];
      return {
        ...base,
        paper: k.paper,
        band: k.band ? { color: k.band, frac: 0.3 } : null,
        ink: k.ink,
        bodyInk: k.body,
        title: c.title,
        edge: k.edge ? { color: k.edge, frac: 0.04 } : null,
        inner: { kind: 'days', when: c.when },
      };
    }
    case 'video':
    case 'audio': {
      const title = parsed?.name === 'audio' ? readAudio(args).title : readMedia(args).caption;
      return { ...base, paper: PLAYER, ink: INK_LIGHT, bodyInk: INK_LIGHT, title, inner: { kind: 'play', icon: parsed?.name === 'audio' ? 'audio' : 'video' } };
    }
    case 'tabela': {
      // a marca (o jeito) e, nas linhas de baixo, a tabela do markdown
      const look = tableLookOf(args);
      const t = TABLE[look];
      const table = parseTableText(node.src.split('\n').slice(parsed ? 1 : 0).join('\n'));
      const cols = Math.max(1, table.head.length);
      return {
        ...base,
        paper: t.paper,
        ink: t.ink,
        bodyInk: t.ink,
        title: table.head.map((h) => plain(h, 40)).filter(Boolean).join(' · '),
        inner: { kind: 'rows', look, rows: table.rows.length, cols, head: t.head, stripe: t.stripe, rule: t.rule },
      };
    }
    default:
      // um widget que este site não conhece: o papel de ficha, a tinta de sempre
      return { ...base, ink: rootColor('--ink-2', '#4b463e') };
  }
}
