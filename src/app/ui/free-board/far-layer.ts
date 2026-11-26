import { FbNode } from '../../core/free-board';
import { Rect } from '../../core/free-board-geometry';
import { PieceInfo, SceneEdge } from './scene';
import { CALLOUT_HEX, DEFAULT_FRAME, FELT_HEX, STOCK_HEX } from './far-palette';
import { CardOf, pieceLook } from './far-look';
import { SketchItem, frameItems, pieceItems } from './sketch-model';
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
}

/** O maior lado do canvas da camada de longe, em px (acima disso ele perde resolução, não memória). */
export const FAR_MAX_PX = 4096;
/**
 * Quantos pixels o canvas pode ter: a área da conta é a tela com meia tela de folga para cada lado (quatro
 * telas); acima disso ele fica um pouco mais macio (o giz e os retângulos de longe não sentem), e redesenhá-lo
 * a cada conta da cena cabe num quadro.
 */
export const FAR_MAX_PIXELS = 4_000_000;

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

/** O título da moldura numa fita Dymo do tamanho da tela, colada no canto de cima, meio para fora da borda. */
function drawLabels(ctx: CanvasRenderingContext2D, f: FarFrame): void {
  const { area, k, z } = f;
  // em px da tela: s px do canvas por px da tela
  const s = k / z;
  ctx.setTransform(s, 0, 0, s, 0, 0);
  ctx.font = '800 13px "Barlow Condensed", "Arial Narrow", sans-serif';
  ctx.textBaseline = 'middle';
  for (const node of f.labels) {
    const name = typeof node['nome'] === 'string' ? (node['nome'] as string).toUpperCase() : '';
    const sx = (node.x - area.x) * z;
    const sy = (node.y - area.y) * z;
    const sw = node.w * z;
    if (!name || sw < 48 || node.h * z < 16) continue;
    const room = Math.max(0, sw - 16);
    let text = name;
    const spaced = (t: string) => ctx.measureText(t).width + t.length * 1.6;
    while (text.length > 1 && spaced(text) + 14 > room) text = text.slice(0, -2) + '…';
    const tw = spaced(text) + 14;
    if (tw > room) continue;
    // meio para fora da borda de cima: dentro da moldura, as peças do alto a cobriam (o canvas fica por baixo delas)
    const x = sx + 8;
    const y = sy - 14;
    ctx.fillStyle = '#121212';
    ctx.beginPath();
    ctx.roundRect(x, y, tw, 20, 2);
    ctx.fill();
    ctx.fillStyle = 'rgba(255,255,255,0.08)';
    ctx.fillRect(x, y, tw, 7);
    ctx.fillStyle = STOCK_HEX[node.c ?? DEFAULT_FRAME];
    let cx = x + 7;
    for (const ch of text) {
      ctx.fillText(ch, cx, y + 10.5);
      cx += ctx.measureText(ch).width + 1.6;
    }
  }
}
