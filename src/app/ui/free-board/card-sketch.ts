import { FbNote, noteFont, noteHasIcon, noteParts } from '../../core/free-board';
import { plainText } from '../../core/rich-text';
import { PieceLook } from './far-look';
import { SketchItem, measure } from './sketch-model';

/**
 * O card do texto em ponto pequeno, **em proporção** (PLANO-CAIXAS-DE-TEXTO.md, D5): o mesmo card da peça de perto
 * (free-board-piece.scss e ui/_formatado.scss), com as medidas em px do mundo, e cada linha de texto um traço da tinta
 * no lugar e do comprimento dela. O editor o usa no meio e na camada de longe: tirar o zoom só deixa o card menor, sem
 * trocar o respiro, a moldura, a faixa ou o tamanho da letra no caminho. A peça de perto fica no DOM até a letra do
 * corpo ter `cardTextNearPx()` na tela (scene.ts), onde ela já é um traço: a troca não se vê.
 *
 * A miniatura do mural continua a dela (sketch-model.ts, a letra em px da tela): lá o card é pequeno demais para isso.
 */

/** A letra do corpo do card, com a Média (`1.15rem` de free-board-piece.scss), em px do mundo. */
export const CARD_FONT = 18.4;
/**
 * Abaixo desta letra do corpo na tela (em pontos do aparelho: numa tela de densidade 2, a letra de 2,5 px ainda se
 * lê), o card do texto sai do DOM e vira o desenho em proporção, onde cada linha é um traço.
 */
export const CARD_TEXT_NEAR_DEVICE_PX = 5;

/** A letra do corpo na tela (px) a partir da qual o card do texto fica de perto, na densidade desta tela. */
export function cardTextNearPx(): number {
  const dpr = typeof devicePixelRatio === 'number' && devicePixelRatio > 0 ? devicePixelRatio : 1;
  return CARD_TEXT_NEAR_DEVICE_PX / Math.max(1, dpr);
}

// as medidas do card em em da letra do corpo (F), de ui/_formatado.scss e free-board-piece.scss
/** A moldura de papel em volta da folha clara (px, não escala com a letra). */
const FRAME = 5;
const RADIUS = 10;
const SHEET_RADIUS = 7;
/** A faixa: a letra dela é 1,12 F; a linha, 1,5 da letra dela; o respiro, 0,45 em cima e 0,5 embaixo. */
const TOPO = 1.12;
const TITLE_LINE = 1.5 * TOPO;
const TOPO_PAD = (0.45 + 0.5) * TOPO;
/** O título: a letra da cartolina (Caveat 700, 1,16 da letra da faixa). */
const TITLE_SIZE = TOPO * 1.16;
/** Onde o título começa: o lado de dentro (0,85 em da faixa), o desenho (1,02 em) e o vão (0,42 em); sem desenho, no lado. */
const TITLE_X = (0.85 + 1.02 + 0.42) * TOPO;
const TITLE_X_BARE = 0.85 * TOPO;
const titleX = (n: FbNote) => (noteHasIcon(n) ? TITLE_X : TITLE_X_BARE);
/** A folha clara: a linha do texto (1,35 F), o respiro de cima (0,4 F) e de baixo (0,5 F), o lado (0,85 F). */
const BODY_LINE = 1.35;
const BODY_PAD = 0.4 + 0.5;
const BODY_X = 0.85;

interface CardLayout {
  /** A largura de cada linha do título e do corpo, em px do mundo, já quebradas na largura do card. */
  title: number[];
  body: number[];
  /** Quanto cada linha do corpo entra, em px do mundo. */
  indent: number[];
}

/** O marcador da lista, da lista numerada e da tarefa no começo da linha. */
const MARKER = /^\s*(?:[-*+]\s+\[[ xX]?\]|[-*+]|\d+[.)])\s+/;
/** Onde o texto da lista e da tarefa começa, depois do marcador (em F). */
const LIST_X = 1.25;

/** A conta das linhas de cada card (pelo objeto dele: no arrasto só os cards que andaram são objetos novos). */
const layouts = new WeakMap<FbNote, CardLayout>();

/** As linhas do card quebradas na largura dele (com a letra dele), guardadas enquanto o card não muda. */
export function cardLayout(n: FbNote, title: string, fontsReady: boolean): CardLayout {
  const kept = layouts.get(n);
  if (kept) return kept;
  const F = CARD_FONT * noteFont(n);
  const titleFont = `700 ${TITLE_SIZE * F}px Caveat, Kalam`;
  const bodyFont = `400 ${F}px Kalam`;
  const titleRoom = n.w - FRAME - titleX(n) * F - (BODY_X * TOPO * F - FRAME);
  const bodyRoom = n.w - 2 * FRAME - 2 * (BODY_X * F - FRAME);
  // (até umas linhas a mais que cabem no card: o resto não aparece)
  const most = Math.ceil(n.h / (BODY_LINE * F)) + 1;
  const out: CardLayout = { title: wrapWidths(title, titleRoom, 3, (t) => measure(t, titleFont, 0)), body: [], indent: [] };
  for (const raw of noteParts(n.txt).body.split('\n')) {
    if (out.body.length >= most) break;
    const para = plainText(raw).replace(/\s+/g, ' ').trim();
    // a lista e a tarefa começam depois do marcador
    const indent = MARKER.test(raw) ? LIST_X * F : 0;
    const rows = para ? wrapWidths(para, bodyRoom - indent, most - out.body.length, (t) => measure(t, bodyFont, 0)) : [0];
    out.body.push(...rows);
    out.indent.push(...rows.map(() => indent));
  }
  while (out.body.length && !out.body[out.body.length - 1]) {
    out.body.pop();
    out.indent.pop();
  }
  // antes das letras chegarem, a conta é com a de reserva: não fica guardada
  if (fontsReady) layouts.set(n, out);
  return out;
}

/** As larguras das linhas do texto quebrado em `room`, até `rows` linhas (a última, até a ponta, se sobrou). */
function wrapWidths(text: string, room: number, rows: number, width: (t: string) => number): number[] {
  const out: number[] = [];
  let line = '';
  for (const word of text.split(/\s+/).filter(Boolean)) {
    const next = line ? `${line} ${word}` : word;
    if (!line || width(next) <= room) {
      line = next;
      continue;
    }
    out.push(Math.min(room, width(line)));
    if (out.length >= rows) return out;
    line = word;
  }
  if (line && out.length < rows) out.push(Math.min(room, width(line)));
  return out;
}

/**
 * O card do texto em proporção: o papel do jeito com a faixa, o desenho (um quadradinho da tinta), as linhas do título,
 * a folha clara e as linhas do corpo, com o mesmo "o que não cabe" da peça de perto (`fitCard`): o título encolhe para o
 * corpo ter uma linha; sem lugar, a folha sai. `k` (px da tela por px do mundo) só segura os traços que somem.
 */
export function cardItems(items: SketchItem[], n: FbNote, look: PieceLook, k: number, fontsReady: boolean): void {
  const F = CARD_FONT * noteFont(n);
  const { x, y, w, h } = n;
  const lay = cardLayout(n, look.title, fontsReady);
  const hasBody = lay.body.length > 0;
  const paper = look.band?.color ?? look.paper;
  items.push({ t: 'r', x, y, w, h, rx: Math.min(RADIUS, w / 4, h / 4), fill: paper });
  const titleLine = TITLE_LINE * F;
  const bodyLine = BODY_LINE * F;
  const oneBody = bodyLine + BODY_PAD * F + FRAME;
  // as linhas do título que cabem (até 3; menos, para o corpo ter uma linha)
  const fit = (room: number) => Math.max(1, Math.min(lay.title.length, Math.floor((room - TOPO_PAD * F) / titleLine)));
  let titleRows = fit(h);
  let showBody = hasBody;
  if (hasBody) {
    titleRows = fit(h - oneBody);
    if (TOPO_PAD * F + titleRows * titleLine + oneBody > h + 0.5) showBody = false;
    if (!showBody) titleRows = fit(h);
  }
  const bandH = Math.min(h, TOPO_PAD * F + titleRows * titleLine);
  // o desenho da faixa (se tem): um quadradinho da tinta da faixa, no meio da primeira linha
  const icon = 1.02 * TOPO * F;
  const iconX = x + BODY_X * TOPO * F;
  const firstMid = y + 0.45 * TOPO * F + titleLine / 2;
  const bar = (bx: number, mid: number, bw: number, bh: number, fill: string, op: number) => {
    if (bw <= 0) return;
    const hh = Math.max(bh, 0.6 / k);
    items.push({ t: 'r', x: bx, y: mid - hh / 2, w: bw, h: hh, rx: hh / 2, fill, op });
  };
  if (noteHasIcon(n) && icon * k >= 1.5) items.push({ t: 'r', x: iconX + icon * 0.1, y: firstMid - icon * 0.4, w: icon * 0.8, h: icon * 0.8, rx: icon * 0.3, fill: look.ink, op: 0.35 });
  const tx = x + titleX(n) * F;
  lay.title.slice(0, titleRows).forEach((tw, i) => bar(tx, firstMid + i * titleLine, Math.min(tw, x + w - FRAME - tx), TITLE_SIZE * F * 0.42, look.ink, 0.72));
  if (!showBody) return;
  // a folha clara, com a moldura do papel em volta, e as linhas que cabem nela
  const sheet = { x: x + FRAME, y: y + bandH, w: w - 2 * FRAME, h: h - bandH - FRAME };
  if (sheet.h <= 0) return;
  items.push({ t: 'r', ...sheet, rx: Math.min(SHEET_RADIUS, sheet.w / 4, sheet.h / 4), fill: look.paper });
  const rows = Math.max(0, Math.floor((sheet.h - BODY_PAD * F + 0.3 * bodyLine) / bodyLine));
  const textX = x + BODY_X * F;
  const top = sheet.y + 0.4 * F;
  lay.body.slice(0, rows).forEach((bw, i) => bar(textX + lay.indent[i], top + (i + 0.5) * bodyLine, bw, F * 0.36, look.bodyInk, 0.32));
}
