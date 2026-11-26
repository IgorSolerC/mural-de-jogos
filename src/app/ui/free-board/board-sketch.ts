import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, computed, inject, input, signal } from '@angular/core';
import { FbFrame, FbNode, FreeBoard, shownEdges } from '../../core/free-board';
import { Rect, boundsOf, paintOrder } from '../../core/free-board-geometry';
import { inkOf, inkPaths } from '../../core/pixel-art';
import { STOCK_HEX } from './far-layer';
import { CardInfo, CardOf, FarInner, PieceLook, frameLook, pieceLook } from './far-look';
import { Scene, pieceInfo } from './scene';
import { parseWidgetLine, readCardRef, remaining, targetOf } from '../../core/widgets';

/** Quantas peças a miniatura desenha (as primeiras na ordem de desenhar: as molduras, depois o resto). */
const MAX_SHAPES = 400;
const MAX_LINES = 300;
/** A pixel art maior que isto (em pontos) vira a cor da primeira tinta: os caminhos dela pesariam no mural. */
const MAX_PIXEL_CELLS = 128 * 128;
/** A largura de eucatex que se supõe antes da primeira medida (a da Comum no computador). */
const GUESS_PX = 380;

/** Os tamanhos na tela (px) a partir dos quais o desenho mostra cada coisa (PLANO-MINIATURA-CANVAS.md, D4). */
export const SKETCH_TEXT_W = 44;
export const SKETCH_TEXT_H = 14;
export const SKETCH_BARS_W = 24;
export const SKETCH_TAPE_W = 50;
const FONT_MIN = 7;
const FONT_MAX = 9;

/**
 * Uma peça do desenho, em unidades do mundo. `role` diz ao assado o que ela é (o feltro ganha a trama, o giz o pó);
 * a foto (`i`) só o assado desenha: no SVG, a peça fica no escuro com a beirada branca.
 */
export type SketchItem =
  | { t: 'r'; x: number; y: number; w: number; h: number; rx: number; fill: string; stroke?: string; sw?: number; dash?: string; op?: number; role?: 'feltro' }
  | { t: 'p'; d: string; fill: string; stroke?: string; sw?: number; op?: number; tr?: string; role?: 'giz' }
  | { t: 't'; x: number; y: number; size: number; fill: string; txt: string; font: 'mao' | 'dymo'; op?: number; anchor?: 'middle' }
  | { t: 'i'; x: number; y: number; w: number; h: number; rx: number; id: string };

/**
 * O desenho rico, o do assado (rodada 2): duas linhas do texto do card no lugar da barrinha e quanto falta no contador
 * no lugar do bloco. `now` é o instante de quem conta.
 */
export interface SketchRich {
  now: number;
}

/** O desenho pronto: a caixa do mundo, as peças em ordem e o giz. */
export interface SketchModel {
  box: string;
  items: SketchItem[];
}

/**
 * A miniatura de um quadro (PLANO-MINIATURA-CANVAS.md, rodada 1; antes PLANO-QUADRO-LIVRE.md, 4.2 e D15), desenhada a
 * partir dos dados, nada de foto guardada: as molduras de feltro com o pesponto e o nome na fita, o giz das setas por
 * baixo do papel, e cada peça na aparência dela de longe (far-look.ts): o card do texto com a faixa do jeito, a nota
 * colada na cartolina da ficha, o contador e a tabela nos jeitos deles, os pontos da pixel art. O texto se mede em px
 * da tela (um `ResizeObserver` diz o tamanho do desenho): só aparece onde a letra fica legível. Um SVG só.
 */
@Component({
  selector: 'app-board-sketch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sketch(); as s) {
      <svg [attr.viewBox]="s.box" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        @for (it of s.items; track $index) {
          @switch (it.t) {
            @case ('r') {
              <rect
                [attr.x]="it.x"
                [attr.y]="it.y"
                [attr.width]="it.w"
                [attr.height]="it.h"
                [attr.rx]="it.rx"
                [attr.fill]="it.fill"
                [attr.stroke]="it.stroke ?? null"
                [attr.stroke-width]="it.sw ?? null"
                [attr.stroke-dasharray]="it.dash ?? null"
                [attr.opacity]="it.op ?? null"
              />
            }
            @case ('p') {
              <path
                [attr.d]="it.d"
                [attr.fill]="it.fill"
                [attr.stroke]="it.stroke ?? null"
                [attr.stroke-width]="it.sw ?? null"
                [attr.opacity]="it.op ?? null"
                [attr.transform]="it.tr ?? null"
              />
            }
            @case ('t') {
              <text
                [class]="it.font"
                [attr.x]="it.x"
                [attr.y]="it.y"
                [attr.font-size]="it.size"
                [attr.fill]="it.fill"
                [attr.opacity]="it.op ?? null"
                [attr.text-anchor]="it.anchor ?? null"
              >{{ it.txt }}</text>
            }
          }
        }
      </svg>
    } @else {
      <span class="vazio">Quadro vazio</span>
    }
  `,
  styles: `
    /* o desenho nunca manda no tamanho de quem o mostra: um quadro mais alto que largo esticava a folha e
       empurrava o nome para fora dela. O SVG fica por cima, do tamanho da caixa (menos o respiro dela) */
    :host {
      position: relative;
      display: grid;
      place-items: center;
      min-width: 0;
      min-height: 0;
      overflow: hidden;
    }
    svg {
      position: absolute;
      inset: var(--sketch-respiro, 0px);
      width: calc(100% - 2 * var(--sketch-respiro, 0px));
      height: calc(100% - 2 * var(--sketch-respiro, 0px));
    }
    path,
    rect {
      stroke-linecap: round;
      stroke-linejoin: round;
    }
    /* o título das peças, a caneta como no card; o nome da moldura, as letras da fita Dymo */
    .mao {
      font-family: var(--f-hand);
      font-weight: 700;
    }
    .dymo {
      font-family: var(--f-label);
      font-weight: 800;
      letter-spacing: 0.1em;
    }
    .vazio {
      font: 400 0.95rem var(--f-hand);
      color: var(--wall-ink-2);
    }
  `,
})
export class BoardSketch {
  readonly board = input.required<FreeBoard>();
  /** Acha as fichas coladas (a cor e o nome); sem ele, a nota colada é o papel de ficha sem título. */
  readonly cards = input<CardOf | null>(null);

  /** O tamanho do desenho na tela (px), medido. */
  private readonly size = signal({ w: 0, h: 0 });

  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    if (typeof ResizeObserver === 'undefined') return;
    // o tamanho de layout, não a caixa na tela: a ficha gira e cresce com o mouse, e isso não muda o que cabe
    const ro = new ResizeObserver(() => {
      const svg = host.querySelector('svg');
      const w = svg?.clientWidth || host.clientWidth;
      const h = svg?.clientHeight || host.clientHeight;
      if (w && h && (w !== this.size().w || h !== this.size().h)) this.size.set({ w, h });
    });
    ro.observe(host);
    inject(DestroyRef).onDestroy(() => ro.disconnect());
  }

  /** O quadro sem a escala da tela (refeito só quando o quadro muda). */
  private readonly scene = computed(() => {
    const board = this.board();
    const scene = new Scene(board);
    const nodes = [...scene.nodes.values()];
    const box = boundsOf(nodes);
    return box ? { scene, nodes: paintOrder(nodes).slice(0, MAX_SHAPES), box } : null;
  });

  /**
   * As fichas coladas que o quadro cita, achadas: o desenho só é refeito quando uma delas muda (a cor, o nome), não a
   * cada mudança em qualquer ficha do mural (quem acha lê as listas inteiras).
   */
  private readonly found = computed(
    () => {
      const s = this.scene();
      const cards = this.cards();
      const out = new Map<string, CardInfo | null>();
      if (s && cards) for (const id of cardIds(s.nodes)) out.set(id, cards(id));
      return out;
    },
    { equal: sameCards },
  );

  protected readonly sketch = computed<SketchModel | null>(() => {
    const s = this.scene();
    if (!s) return null;
    const found = this.found();
    const { w, h } = this.size();
    return sketchModel(s.scene, s.nodes, s.box, (id) => found.get(id) ?? null, w || GUESS_PX, h || (GUESS_PX * 2) / 3);
  });
}

/** Os ids das fichas coladas (o widget Nota) entre as peças. */
function cardIds(nodes: readonly FbNode[]): Set<string> {
  const out = new Set<string>();
  for (const n of nodes) {
    if (n.t !== 'w' || pieceInfo(n).kind !== 'nota') continue;
    const id = readCardRef(parseWidgetLine(n.src.split('\n')[0])?.args ?? []).id;
    if (id) out.add(id);
  }
  return out;
}

function sameCards(a: ReadonlyMap<string, CardInfo | null>, b: ReadonlyMap<string, CardInfo | null>): boolean {
  if (a.size !== b.size) return false;
  for (const [id, x] of a) {
    const y = b.get(id);
    if (x === y) continue;
    if (!x || !y || x.stock !== y.stock || x.name !== y.name || x.folder !== y.folder) return false;
  }
  return true;
}

/**
 * O desenho de um quadro numa caixa de `screenW` × `screenH` px (exportado para os testes): a caixa do mundo, as
 * molduras, o giz e as peças.
 */
export function sketchModel(scene: Scene, nodes: readonly FbNode[], box: Rect, cards: CardOf | null, screenW: number, screenH: number, rich: SketchRich | null = null): SketchModel {
  const unit = Math.max(box.w, box.h) / 120;
  const pad = unit * 2;
  const vb = { x: box.x - pad, y: box.y - pad, w: box.w + 2 * pad, h: box.h + 2 * pad };
  // quantos px da tela por unidade do mundo
  const k = Math.max(1e-6, Math.min(screenW / vb.w, screenH / vb.h));
  const items: SketchItem[] = [];
  const frames = nodes.filter((n): n is FbFrame => n.t === 'm');
  const pieces = nodes.filter((n) => n.t !== 'm');
  for (const f of frames) frameItems(items, f, k);
  chalk(items, scene, new Set(nodes.map((n) => n.i)), k);
  for (const n of pieces) pieceItems(items, n, pieceLook(n, cards), k, rich);
  return { box: `${r2(vb.x)} ${r2(vb.y)} ${r2(vb.w)} ${r2(vb.h)}`, items };
}

const r2 = (v: number) => Math.round(v * 100) / 100;

/** A moldura: o feltro de cantos macios, o pesponto por dentro e o nome numa fita no canto de cima. */
function frameItems(items: SketchItem[], f: FbFrame, k: number): void {
  const look = frameLook(f);
  const rx = Math.min(4 / k, Math.min(f.w, f.h) / 5);
  items.push({ t: 'r', x: f.x, y: f.y, w: f.w, h: f.h, rx, fill: look.felt, role: 'feltro' });
  const inset = Math.min(3.5 / k, Math.min(f.w, f.h) / 6);
  if (Math.min(f.w, f.h) * k >= 14) {
    items.push({
      t: 'r',
      x: f.x + inset,
      y: f.y + inset,
      w: f.w - 2 * inset,
      h: f.h - 2 * inset,
      rx: rx * 0.6,
      fill: 'none',
      stroke: look.stitch,
      sw: 0.8 / k,
      dash: `${r2(2 / k)} ${r2(1.5 / k)}`,
      op: 0.7,
    });
  }
  if (!look.name || f.w * k < SKETCH_TAPE_W || f.h * k < 22) return;
  const font = 7;
  const padX = 3.5 / k;
  const room = f.w - 2 * (inset + 3 / k);
  const text = fit(look.name.toUpperCase(), room - 2 * padX, (t) => measure(t, `800 ${font}px "Barlow Condensed"`, 0.1) / k);
  if (!text) return;
  const tw = measure(text, `800 ${font}px "Barlow Condensed"`, 0.1) / k + 2 * padX;
  const x = f.x + inset + 2.5 / k;
  const y = f.y + inset + 2.5 / k;
  items.push({ t: 'r', x, y, w: tw, h: 10 / k, rx: 1 / k, fill: look.stitch });
  items.push({ t: 't', x: x + padX, y: y + 7.6 / k, size: font / k, fill: look.tapeInk, txt: text, font: 'dymo' });
}

/** O giz das setas: a mesma curva do quadro, com a ponta em "v", por baixo das peças. */
function chalk(items: SketchItem[], scene: Scene, drawn: ReadonlySet<string>, k: number): void {
  const byColor = new Map<string, string[]>();
  const head = 4.5 / k;
  let count = 0;
  for (const e of shownEdges(scene.board)) {
    if (count >= MAX_LINES) break;
    // (só entre peças desenhadas: passando do teto, a seta apontaria para o nada)
    const p = drawn.has(e.a) && drawn.has(e.b) ? scene.pathOf(e) : null;
    if (!p) continue;
    count++;
    let d = `M${r2(p.from.x)} ${r2(p.from.y)}C${r2(p.c1.x)} ${r2(p.c1.y)} ${r2(p.c2.x)} ${r2(p.c2.y)} ${r2(p.to.x)} ${r2(p.to.y)}`;
    const ends = e.p ?? '>';
    if (ends === '>' || ends === '<>') d += vee(p.to, p.endAngle, head);
    if (ends === '<' || ends === '<>') d += vee(p.from, p.startAngle, head);
    const c = e.c ? STOCK_HEX[e.c] : '#f3efe6';
    byColor.set(c, [...(byColor.get(c) ?? []), d]);
  }
  for (const [c, ds] of byColor) items.push({ t: 'p', d: ds.join(''), fill: 'none', stroke: c, sw: 1.1 / k, op: 0.75, role: 'giz' });
}

function vee(tip: { x: number; y: number }, angle: number, size: number): string {
  const a1 = angle + Math.PI - 0.45;
  const a2 = angle + Math.PI + 0.45;
  return `M${r2(tip.x + Math.cos(a1) * size)} ${r2(tip.y + Math.sin(a1) * size)}L${r2(tip.x)} ${r2(tip.y)}L${r2(tip.x + Math.cos(a2) * size)} ${r2(tip.y + Math.sin(a2) * size)}`;
}

/** Uma peça: a orelhinha, o papel, a beirada, a faixa, o que tem dentro e o título (ou as barrinhas). */
function pieceItems(items: SketchItem[], n: FbNode, look: PieceLook, k: number, rich: SketchRich | null): void {
  const { x, y, w, h } = n;
  const rx = Math.min(2 / k, Math.min(w, h) / 6);
  const sw = w * k;
  const sh = h * k;
  if (look.tab && sw >= 16) {
    const th = Math.max(2.5 / k, h * 0.08);
    items.push({ t: 'r', x: x + w * 0.06, y: y - th * 0.7, w: Math.min(w * 0.42, 46 / k), h: th * 1.5, rx: rx * 0.7, fill: look.tab });
  }
  let inner = { x, y, w, h };
  if (look.edge) {
    items.push({ t: 'r', x, y, w, h, rx, fill: look.edge.color });
    const e = Math.max(0.8 / k, Math.min(w, h) * look.edge.frac);
    inner = { x: x + e, y: y + e, w: w - 2 * e, h: h - 2 * e };
  }
  if (look.paper) items.push({ t: 'r', ...inner, rx: look.edge ? rx * 0.5 : rx, fill: look.paper });
  // a faixa: alta o bastante para o título, quando ele cabe
  // (a legenda da pixel art fica embaixo do desenho, na peça: aqui ela cairia por cima dos pontos)
  const title = look.inner?.kind === 'pixels' ? '' : look.title;
  const showText = !!title && sw >= SKETCH_TEXT_W && sh >= SKETCH_TEXT_H;
  const font = Math.max(FONT_MIN, Math.min(FONT_MAX, sh * 0.18));
  let bandH = 0;
  if (look.band) {
    bandH = Math.min(h * 0.6, Math.max(h * look.band.frac, 2 / k, showText ? (font + 5) / k : 0));
    items.push({ t: 'p', d: topRounded(inner.x, inner.y, inner.w, bandH, rx), fill: look.band.color });
  }
  innerItems(items, look.inner, inner, bandH, look, k, rich, showText ? font : 0);
  const textX = inner.x + 4 / k;
  const textY = look.band ? inner.y + bandH / 2 + (font * 0.36) / k : inner.y + (3 + font * 0.85) / k;
  if (showText) {
    const fontCss = `700 ${font}px Kalam`;
    const text = fit(title, inner.w - 8 / k, (t) => measure(t, fontCss, 0) / k);
    if (text) items.push({ t: 't', x: textX, y: textY, size: font / k, fill: look.ink, txt: text, font: 'mao' });
  } else if (title && sw >= SKETCH_BARS_W && sh >= 8) {
    // pequena demais para a letra: uma barrinha da tinta no lugar do título
    const bh = Math.max(1.2 / k, Math.min(2.2 / k, (look.band ? bandH : h) * 0.3));
    const by = look.band ? inner.y + (bandH - bh) / 2 : inner.y + 3 / k;
    items.push({ t: 'r', x: textX, y: by, w: Math.max(4 / k, (inner.w - 8 / k) * 0.62), h: bh, rx: bh / 2, fill: look.ink, op: 0.55 });
  }
}

/** O que a peça tem de próprio: os pontos, o escuro da foto, as fileiras, o número, o "play". */
function innerItems(items: SketchItem[], inner: FarInner | null, r: Rect, bandH: number, look: PieceLook, k: number, rich: SketchRich | null, font: number): void {
  if (!inner && rich && look.body && font) {
    // o assado: as duas primeiras linhas do texto, na tinta do papel, quando cabem
    const size = Math.max(FONT_MIN - 0.5, font * 0.85);
    const lh = (size * 1.25) / k;
    const top = r.y + bandH + (2 + size) / k;
    const rows = Math.min(2, Math.floor((r.y + r.h - top + lh * 0.2) / lh));
    const lines = wrap(look.body, r.w - 8 / k, rows, (t) => measure(t, `700 ${size}px Kalam`, 0) / k);
    lines.forEach((txt, i) => items.push({ t: 't', x: r.x + 4 / k, y: top + i * lh, size: size / k, fill: look.bodyInk, txt, font: 'mao', op: 0.82 }));
    if (lines.length) return;
  }
  if (!inner) {
    // o corpo do card do texto: uma linha de tinta clara, se couber
    if (look.body && r.w * k >= SKETCH_BARS_W && r.h * k >= 18) {
      const bh = Math.max(1 / k, 1.6 / k);
      const y0 = r.y + bandH + Math.max(3 / k, (r.h - bandH) * 0.3);
      if (y0 + bh < r.y + r.h - 2 / k) items.push({ t: 'r', x: r.x + 4 / k, y: y0, w: (r.w - 8 / k) * 0.7, h: bh, rx: bh / 2, fill: look.bodyInk, op: 0.25 });
    }
    return;
  }
  switch (inner.kind) {
    case 'pixels': {
      const art = inner.art;
      const s = Math.min(r.w / art.w, r.h / art.h);
      const ox = r.x + (r.w - art.w * s) / 2;
      const oy = r.y + (r.h - art.h * s) / 2;
      const inks = inkOf(art.palette, art.colors);
      if (art.w * art.h > MAX_PIXEL_CELLS) {
        const first = inks.find((c, i) => i > 0 && c);
        items.push({ t: 'r', x: ox, y: oy, w: art.w * s, h: art.h * s, rx: 0, fill: first ?? '#7d776d' });
        return;
      }
      const tr = `translate(${r2(ox)} ${r2(oy)}) scale(${s})`;
      for (const p of inkPaths(art.rows, 'pixel')) {
        const c = inks[p.ink];
        if (c) items.push({ t: 'p', d: p.d, fill: c, tr });
      }
      return;
    }
    case 'rows': {
      const lines = Math.min(inner.rows + 1, 12);
      const lh = (r.h - 2 / k) / Math.max(2, lines);
      if (lh * k < 2) return;
      for (let i = 0; i < lines; i++) {
        const y = r.y + 1 / k + i * lh;
        if (i === 0 && inner.head) items.push({ t: 'p', d: topRounded(r.x, r.y, r.w, lh + 1 / k, Math.min(2 / k, r.h / 6)), fill: inner.head });
        else if (i % 2 === 0 && inner.stripe) items.push({ t: 'r', x: r.x, y, w: r.w, h: lh, rx: 0, fill: inner.stripe });
        if (inner.rule !== 'transparent' && i > 0) items.push({ t: 'r', x: r.x + 2 / k, y: y - 0.3 / k, w: r.w - 4 / k, h: 0.6 / k, rx: 0, fill: inner.rule });
      }
      if (look.paper === '') items.push({ t: 'r', ...r, rx: Math.min(2 / k, r.h / 6), fill: 'none', stroke: inner.rule, sw: 0.8 / k });
      return;
    }
    case 'days': {
      // quanto falta, desenhado como um número grosso no meio do que sobra (no assado, o número de verdade)
      const top = r.y + bandH;
      const hh = r.h - bandH;
      if (r.w * k < 14 || hh * k < 8) return;
      if (rich && inner.when) {
        const left = remaining(targetOf(inner.when, rich.now), rich.now);
        const size = Math.min(hh * k * 0.62, 26);
        if (size >= FONT_MIN) {
          items.push({ t: 't', x: r.x + r.w / 2, y: top + hh / 2 + (size * 0.36) / k, size: size / k, fill: look.bodyInk, txt: String(left.days), font: 'dymo', anchor: 'middle' });
          return;
        }
      }
      const bw = Math.min(r.w * 0.42, hh * 0.9);
      const bh = Math.min(hh * 0.38, bw * 0.75);
      items.push({ t: 'r', x: r.x + (r.w - bw) / 2, y: top + (hh - bh) / 2, w: bw, h: bh, rx: Math.min(1.5 / k, bh / 3), fill: look.bodyInk, op: 0.85 });
      return;
    }
    case 'play': {
      const s = Math.min(r.w, r.h) * 0.32;
      if (s * k < 5) return;
      const cx = r.x + r.w / 2;
      const cy = r.y + r.h / 2;
      const d =
        inner.icon === 'video'
          ? `M${r2(cx - s * 0.35)} ${r2(cy - s * 0.45)}L${r2(cx + s * 0.5)} ${r2(cy)}L${r2(cx - s * 0.35)} ${r2(cy + s * 0.45)}Z`
          : `M${r2(cx - s * 0.5)} ${r2(cy - s * 0.15)}h${r2(s * 0.3)}l${r2(s * 0.4)} ${r2(-s * 0.3)}v${r2(s * 0.9)}l${r2(-s * 0.4)} ${r2(-s * 0.3)}h${r2(-s * 0.3)}Z`;
      items.push({ t: 'p', d, fill: look.ink, op: 0.85 });
      return;
    }
    case 'image':
      // a foto de verdade, só no assado (o SVG fica com o escuro da peça e a beirada branca)
      if (inner.id) items.push({ t: 'i', ...r, rx: Math.min(1 / k, r.w / 8), id: inner.id });
      return;
  }
}

/** Um retângulo de cantos de cima arredondados (a faixa). */
function topRounded(x: number, y: number, w: number, h: number, r: number): string {
  const rr = Math.max(0, Math.min(r, w / 2, h));
  return `M${r2(x)} ${r2(y + h)}V${r2(y + rr)}Q${r2(x)} ${r2(y)} ${r2(x + rr)} ${r2(y)}H${r2(x + w - rr)}Q${r2(x + w)} ${r2(y)} ${r2(x + w)} ${r2(y + rr)}V${r2(y + h)}Z`;
}

let ruler: CanvasRenderingContext2D | null | undefined;

/** A largura do texto em px da tela, com a letra pedida (e o espaçamento entre letras, em em). */
export function measure(text: string, font: string, tracking: number): number {
  if (ruler === undefined) ruler = typeof document === 'undefined' ? null : document.createElement('canvas').getContext('2d');
  const size = Number(/(\d+(?:\.\d+)?)px/.exec(font)?.[1] ?? 8);
  if (!ruler) return text.length * size * 0.55;
  ruler.font = font;
  return ruler.measureText(text).width + text.length * size * tracking;
}

/** O texto em até `rows` linhas de `room`, quebrado nas palavras; a última com reticências se sobrar. */
export function wrap(text: string, room: number, rows: number, width: (t: string) => number): string[] {
  const out: string[] = [];
  const words = text.split(/\s+/).filter(Boolean);
  let line = '';
  while (words.length && out.length < rows) {
    const next = line ? `${line} ${words[0]}` : words[0];
    if (width(next) <= room) {
      line = next;
      words.shift();
      continue;
    }
    if (!line) {
      // uma palavra maior que a linha: cortada
      out.push(fit(words.shift()!, room, width));
      continue;
    }
    out.push(line);
    line = '';
  }
  if (line && out.length < rows) out.push(line);
  if (words.length && out.length) out[out.length - 1] = fit(out[out.length - 1] + ' ' + words.join(' '), room, width);
  return out.filter(Boolean);
}

/** O texto que cabe em `room` (com reticências), ou '' se nem a primeira letra cabe. */
export function fit(text: string, room: number, width: (t: string) => number): string {
  if (room <= 0) return '';
  if (width(text) <= room) return text;
  let lo = 0;
  let hi = text.length;
  while (lo < hi) {
    const mid = Math.ceil((lo + hi) / 2);
    if (width(text.slice(0, mid).trimEnd() + '…') <= room) lo = mid;
    else hi = mid - 1;
  }
  return lo >= 2 ? text.slice(0, lo).trimEnd() + '…' : '';
}
