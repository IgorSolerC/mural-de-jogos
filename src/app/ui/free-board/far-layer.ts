import { FbNode } from '../../core/free-board';
import { Rect } from '../../core/free-board-geometry';
import { PieceInfo, SceneEdge } from './scene';
import { CALLOUT_HEX, DEFAULT_FRAME, FELT_HEX, STOCK_HEX } from './far-palette';
import { CardOf, pieceLook } from './far-look';
import { SketchItem, frameItems, pieceItems, sketchFontsReady } from './sketch-model';
import { cardItems } from './card-sketch';
import { chalkPattern, paintItems } from './sketch-paint';

// (as tabelas de cor moram em far-palette.ts; daqui, para quem já as lia)
export { CALLOUT_HEX, DEFAULT_FRAME, FELT_HEX, STOCK_HEX };

/**
 * A camada de longe do Quadro livre (PLANO-QUADRO-LIVRE.md, seção 9.3): o que aparece pequeno demais para
 * valer o DOM vai para um canvas 2D que desenha todas de uma vez, cada peça na aparência dela de longe
 * (far-look.ts, a mesma da miniatura do canvas no mural: a nota colada na cor dela, o card com a faixa do jeito,
 * os pontos da pixel art, a miniatura da imagem, se já está pronta), e as molduras ganham o nome numa fita Dymo
 * do tamanho da tela, para a região ser achada de longe. O canvas mora no mundo (cobre a área da última conta da cena) e anda com a
 * câmera como as peças: é redesenhado só quando a cena é recontada, nunca a cada quadro.
 */

/** O giz branco: a tinta da parede (`--wall-ink`). */
const CHALK = '#f3efe6';

export interface FarFrame {
  /** A parte do mundo que o canvas cobre (ele mora no mundo e anda com a câmera). */
  area: Rect;
  /** Quantos px do canvas por px do mundo (o zoom da conta vezes a densidade da tela, com teto). */
  k: number;
  /** O zoom da conta (o título na tela e o traço fino das setas não escalam com ele). */
  z: number;
  far: readonly { node: FbNode; info: PieceInfo }[];
  /** Todas as setas da área (as de longe e as das peças montadas: o giz é da parede, fica por baixo do papel). */
  edges: readonly SceneEdge[];
  /** As molduras com o nome na tela (as montadas cujo título ficou pequeno demais, e as de longe). */
  labels: readonly FbNode[];
  thumb: (id: string) => ImageBitmap | null;
  /** Acha as fichas coladas (a cor e o nome); sem ele, a nota colada fica no papel de ficha. */
  cards?: CardOf | null;
  /**
   * As peças montadas no DOM (o nível meio e perto), que ficam por cima do canvas: a fita das molduras não vai para
   * onde uma delas a cobriria.
   */
  blockers?: readonly Rect[];
}

/** O maior lado do canvas da camada de longe, em px (acima disso ele perde resolução, não memória). */
export const FAR_MAX_PX = 6144;
/**
 * Quantos pixels o canvas pode ter: a área da conta é a tela com meia tela de folga para cada lado (quatro
 * telas); acima disso ele fica mais macio. Eram 4 milhões quando as peças de longe eram retângulos lisos; com a
 * aparência delas (a faixa, os pontos, a fita), a metade da resolução numa tela de densidade 2 borrava, ao lado das
 * peças do meio, nítidas no DOM (26/nov). Com 8 milhões, 2000 peças redesenham em ~17 ms (eram ~13), só na conta da
 * cena, nunca a cada quadro.
 */
export const FAR_MAX_PIXELS = 8_000_000;

/** A densidade do canvas para cobrir `area` com o zoom `z` numa tela de densidade `dpr`. */
export function farDensity(area: Rect, z: number, dpr: number): number {
  const w = Math.max(1, area.w);
  const h = Math.max(1, area.h);
  return Math.max(1e-4, Math.min(z * dpr, FAR_MAX_PX / w, FAR_MAX_PX / h, Math.sqrt(FAR_MAX_PIXELS / (w * h))));
}

/**
 * Desenha a camada de longe inteira no canvas (já do tamanho de `area` × `k`). Só na conta da cena (e quando
 * uma miniatura chega): no meio do gesto o canvas anda com o mundo, sem desenhar nada.
 */
export function drawFar(ctx: CanvasRenderingContext2D, f: FarFrame): void {
  const { area, k, z } = f;
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.clearRect(0, 0, ctx.canvas.width, ctx.canvas.height);
  if (!f.far.length && !f.edges.length && !f.labels.length) return;
  const base = new DOMMatrix([k, 0, 0, k, -area.x * k, -area.y * k]);
  ctx.setTransform(base);
  // cada peça na aparência dela de longe, na escala da tela (z): os cantos, a faixa, a beirada e os pontos
  const items: SketchItem[] = [];
  const photos = new Map<string, ImageBitmap>();
  for (const { node, info } of f.far) {
    // (sem a fita do desenho: o nome das molduras daqui é a fita do tamanho da tela, `drawLabels`)
    if (node.t === 'm') frameItems(items, node, z, false);
    // (o card do texto em proporção, como no meio: PLANO-CAIXAS-DE-TEXTO.md, D5)
    else if (node.t === 'x') cardItems(items, node, pieceLook(node, null, info), z, sketchFontsReady());
    else pieceItems(items, node, pieceLook(node, f.cards ?? null, info), z, null);
    const bmp = info.image ? f.thumb(info.image) : null;
    if (bmp) photos.set(info.image!, bmp);
  }
  paintItems(ctx, items, base, k, photos);
  ctx.setTransform(base);
  if (f.edges.length) drawEdges(ctx, f.edges, k, z);
  if (f.labels.length) drawLabels(ctx, f);
}

/** A grossura do giz no mundo: 2,6 px, mas nunca menos de 1,6 px na tela. */
export const chalkWidth = (z: number) => Math.max(2.6, 1.6 / z);
/** O tamanho da ponta da seta no mundo: 13 px, mas nunca menos de 9 px na tela. */
export const headSize = (z: number) => Math.max(13, 9 / z);

/**
 * As setas a giz: a curva e a ponta (um "v" aberto, como se risca à mão), com a textura do giz (o pó que não
 * pegou) num padrão de pixels, em vez de um tracejado (que custava caro a cada mudança de escala). Uma cor por
 * vez, num caminho só.
 */
function drawEdges(ctx: CanvasRenderingContext2D, edges: readonly SceneEdge[], k: number, z: number): void {
  const head = headSize(z);
  ctx.lineWidth = chalkWidth(z);
  ctx.lineCap = 'round';
  ctx.lineJoin = 'round';
  const byColor = new Map<string, SceneEdge[]>();
  for (const e of edges) {
    const c = e.edge.c ? STOCK_HEX[e.edge.c] : CHALK;
    byColor.set(c, [...(byColor.get(c) ?? []), e]);
  }
  for (const [color, list] of byColor) {
    const pattern = chalkPattern(ctx, color);
    pattern?.setTransform(new DOMMatrix([1 / k, 0, 0, 1 / k, 0, 0]));
    ctx.strokeStyle = pattern ?? color;
    ctx.beginPath();
    for (const { edge, path: p } of list) {
      ctx.moveTo(p.from.x, p.from.y);
      ctx.bezierCurveTo(p.c1.x, p.c1.y, p.c2.x, p.c2.y, p.to.x, p.to.y);
      const ends = edge.p ?? '>';
      if (ends === '>' || ends === '<>') arrowHead(ctx, p.to, p.endAngle, head);
      if (ends === '<' || ends === '<>') arrowHead(ctx, p.from, p.startAngle, head);
    }
    ctx.stroke();
  }
}

function arrowHead(ctx: CanvasRenderingContext2D, tip: { x: number; y: number }, angle: number, size: number): void {
  const a1 = angle + Math.PI - 0.45;
  const a2 = angle + Math.PI + 0.45;
  ctx.moveTo(tip.x + Math.cos(a1) * size, tip.y + Math.sin(a1) * size);
  ctx.lineTo(tip.x, tip.y);
  ctx.lineTo(tip.x + Math.cos(a2) * size, tip.y + Math.sin(a2) * size);
}

/** Uma fita com o nome de uma moldura, já posta (em px da tela, a partir do canto da área). */
export interface PlacedLabel {
  node: FbNode;
  text: string;
  font: number;
  x: number;
  y: number;
  w: number;
  h: number;
}

/** Os tamanhos da letra da fita, do maior: ela encolhe antes de cortar o nome. */
export const LABEL_FONTS = [13, 11, 9] as const;
/** O nome cortado mostra pelo menos isto de letras (menos que isso, "LI…", não diz qual é a região). */
const LABEL_MIN_CHARS = 3;

const labelH = (font: number) => Math.round(font * 1.55);
const labelPad = (font: number) => font * 0.55;
const labelTrack = (font: number) => font * 0.12;

/**
 * Onde vai a fita de cada moldura, na tela (pura, para os testes): as molduras maiores primeiro; a letra encolhe
 * (13, 11, 9 px) antes de cortar o nome, e cortado ele guarda pelo menos três letras; todas as fitas da conta ficam
 * na mesma letra. A fita vai meio para fora da borda de cima (dentro, as peças do alto a cobririam); se ali ela
 * cobriria outra moldura (a de cima, perto), outra fita ou uma peça montada no DOM, vai para a borda de baixo,
 * encostada por fora (dentro do feltro não: o canvas fica por baixo das peças, que a cobririam, e ela cobriria o que
 * está desenhado); se nem ali cabe, a moldura fica sem nome nesta conta. `width` mede o texto com a letra pedida, sem
 * o espaçamento.
 */
export function placeLabels(
  frames: readonly { node: FbNode; x: number; y: number; w: number; h: number }[],
  width: (text: string, font: number) => number,
  blockers: readonly Rect[] = [],
): PlacedLabel[] {
  const spaced = (t: string, font: number) => width(t, font) + t.length * labelTrack(font);
  const tape = (t: string, font: number) => spaced(t, font) + 2 * labelPad(font);
  const placed: PlacedLabel[] = [];
  const hits = (r: { x: number; y: number; w: number; h: number }, a: { x: number; y: number; w: number; h: number }) =>
    r.x < a.x + a.w && a.x < r.x + r.w && r.y < a.y + a.h && a.y < r.y + r.h;
  const inside = (a: { x: number; y: number; w: number; h: number }, b: { x: number; y: number; w: number; h: number }) =>
    a.x >= b.x && a.y >= b.y && a.x + a.w <= b.x + b.w && a.y + a.h <= b.y + b.h;
  const nameOf = (f: { node: FbNode }) => (typeof f.node['nome'] === 'string' ? (f.node['nome'] as string).trim().toUpperCase() : '');
  const shown = (f: { node: FbNode; w: number; h: number }) => !!nameOf(f) && f.w >= 40 && f.h >= 16;
  // uma letra só para as fitas da conta: a maior em que todos os nomes inteiros cabem (fitas lado a lado de
  // tamanhos diferentes parecem de quadros diferentes); o nome que não cabe inteiro nem na menor é cortado nela
  const fits = (f: { node: FbNode; w: number }, size: number) => tape(nameOf(f), size) <= f.w - 12;
  const whole = frames.filter(shown).filter((f) => fits(f, LABEL_FONTS[LABEL_FONTS.length - 1]));
  const common = LABEL_FONTS.find((size) => whole.every((f) => fits(f, size))) ?? LABEL_FONTS[LABEL_FONTS.length - 1];
  for (const f of [...frames].sort((a, b) => b.w * b.h - a.w * a.h)) {
    if (!shown(f)) continue;
    const name = nameOf(f);
    const room = f.w - 12;
    // as escolhas, da melhor: o nome inteiro na letra da conta; senão, cortado na menor
    const options: { text: string; font: number }[] = LABEL_FONTS.filter((size) => size <= common && tape(name, size) <= room).map((font) => ({ text: name, font }));
    const small = LABEL_FONTS[LABEL_FONTS.length - 1];
    if (!options.some((o) => o.font === small)) {
      let n = name.length - 1;
      while (n >= LABEL_MIN_CHARS && tape(name.slice(0, n).trimEnd() + '…', small) > room) n--;
      if (n >= LABEL_MIN_CHARS) options.push({ text: name.slice(0, n).trimEnd() + '…', font: small });
    }
    if (!options.length) continue;
    // as outras molduras que a fita não pode cobrir: as que não contêm esta (a de dentro de outra fica nela)
    const others = frames.filter((o) => o !== f && !inside(f, o));
    // (nem as peças montadas no DOM, que ficam por cima do canvas e a cobririam)
    const free = (r: { x: number; y: number; w: number; h: number }) => !others.some((o) => hits(r, o)) && !placed.some((p) => hits(r, p)) && !blockers.some((b) => hits(r, b));
    const rect = (o: { text: string; font: number }, edge: 'cima' | 'baixo') => {
      const w = tape(o.text, o.font);
      const h = labelH(o.font);
      // (embaixo, encostada por fora: as peças do pé da moldura não a tapam)
      return { x: f.x + 6, y: edge === 'cima' ? f.y - h * 0.7 : f.y + f.h - 2, w, h };
    };
    // meio para fora da borda de cima, na melhor letra; tapada, da de baixo
    const first = options[0];
    const spot = (['cima', 'baixo'] as const).map((edge) => rect(first, edge)).find(free);
    if (spot) placed.push({ node: f.node, ...first, ...spot });
  }
  return placed;
}

/** O título da moldura numa fita Dymo do tamanho da tela (ver `placeLabels`): a fita preta, as letras da cor dela. */
function drawLabels(ctx: CanvasRenderingContext2D, f: FarFrame): void {
  const { area, k, z } = f;
  // em px da tela: s px do canvas por px da tela
  const s = k / z;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.textBaseline = 'middle';
  const fontOf = (size: number) => `800 ${size}px "Barlow Condensed", "Arial Narrow", sans-serif`;
  const width = (t: string, size: number) => {
    ctx.font = fontOf(size);
    return ctx.measureText(t).width;
  };
  const frames = f.labels.map((node) => ({ node, x: (node.x - area.x) * z, y: (node.y - area.y) * z, w: node.w * z, h: node.h * z }));
  const blockers = (f.blockers ?? []).map((b) => ({ x: (b.x - area.x) * z, y: (b.y - area.y) * z, w: b.w * z, h: b.h * z }));
  for (const l of placeLabels(frames, width, blockers)) {
    ctx.fillStyle = '#121212';
    ctx.beginPath();
    ctx.roundRect(l.x, l.y, l.w, l.h, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(l.x, l.y, l.w, l.h * 0.35);
    ctx.fillStyle = STOCK_HEX[l.node.c ?? DEFAULT_FRAME];
    ctx.font = fontOf(l.font);
    let cx = l.x + labelPad(l.font);
    for (const ch of l.text) {
      ctx.fillText(ch, cx, l.y + l.h / 2 + 0.5);
      cx += ctx.measureText(ch).width + labelTrack(l.font);
    }
  }
}
