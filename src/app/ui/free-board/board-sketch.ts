import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FreeBoard, shownEdges, shownNodes } from '../../core/free-board';
import { boundsOf, center, paintOrder } from '../../core/free-board-geometry';
import { DEFAULT_FRAME, FELT_HEX, STOCK_HEX, farColor } from './far-layer';
import { pieceInfo } from './scene';

/** Quantas peças a miniatura desenha (as primeiras na ordem de desenhar: as molduras, depois o resto). */
const MAX_SHAPES = 400;
const MAX_LINES = 300;

interface Shape {
  x: number;
  y: number;
  w: number;
  h: number;
  fill: string;
  r: number;
  stitch: string | null;
}

/**
 * A miniatura de um quadro na lista (PLANO-QUADRO-LIVRE.md, 4.2 e D15): desenhada a partir dos dados, nada de
 * foto guardada. As molduras como manchas de feltro com o pesponto, as peças como retalhos de papel da cor
 * delas (a foto, um retalho escuro) e as setas como riscos de giz retos de meio a meio. Um SVG só, que escala
 * com a folha.
 */
@Component({
  selector: 'app-board-sketch',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (sketch(); as s) {
      <svg [attr.viewBox]="s.box" preserveAspectRatio="xMidYMid meet" aria-hidden="true">
        @for (r of s.shapes; track $index) {
          <rect [attr.x]="r.x" [attr.y]="r.y" [attr.width]="r.w" [attr.height]="r.h" [attr.rx]="r.r" [attr.fill]="r.fill" />
          @if (r.stitch) {
            <rect
              class="pesponto"
              [attr.x]="r.x + s.unit * 1.2"
              [attr.y]="r.y + s.unit * 1.2"
              [attr.width]="r.w - s.unit * 2.4"
              [attr.height]="r.h - s.unit * 2.4"
              [attr.rx]="r.r * 0.6"
              [attr.stroke]="r.stitch"
              [attr.stroke-width]="s.unit * 0.35"
              [attr.stroke-dasharray]="s.unit * 0.9 + ' ' + s.unit * 0.6"
            />
          }
        }
        <path class="giz" [attr.d]="s.lines" [attr.stroke-width]="s.unit * 0.45" />
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
    .pesponto {
      fill: none;
      stroke-opacity: 0.7;
    }
    .giz {
      fill: none;
      stroke: var(--sketch-giz, #f3efe6);
      stroke-opacity: 0.7;
      stroke-linecap: round;
    }
    .vazio {
      font: 400 0.95rem var(--f-hand);
      color: var(--wall-ink-2);
    }
  `,
})
export class BoardSketch {
  readonly board = input.required<FreeBoard>();

  protected readonly sketch = computed(() => {
    const board = this.board();
    const nodes = shownNodes(board);
    const box = boundsOf(nodes);
    if (!box) return null;
    // uma unidade de desenho proporcional ao quadro: o pesponto e o giz ficam do mesmo jeito em qualquer tamanho
    const unit = Math.max(box.w, box.h) / 120;
    const pad = unit * 2;
    const shapes: Shape[] = paintOrder(nodes)
      .slice(0, MAX_SHAPES)
      .map((n) => {
        const frame = n.t === 'm';
        const c = n.c ?? DEFAULT_FRAME;
        return {
          x: n.x,
          y: n.y,
          w: n.w,
          h: n.h,
          fill: frame ? FELT_HEX[c] : farColor(n, pieceInfo(n)),
          r: frame ? unit * 2 : 0,
          stitch: frame ? STOCK_HEX[c] : null,
        };
      });
    const byId = new Map(nodes.map((n) => [n.i, n]));
    const lines = shownEdges(board)
      .slice(0, MAX_LINES)
      .map((e) => {
        const a = center(byId.get(e.a)!);
        const b = center(byId.get(e.b)!);
        return `M${Math.round(a.x)} ${Math.round(a.y)}L${Math.round(b.x)} ${Math.round(b.y)}`;
      })
      .join('');
    return { box: `${box.x - pad} ${box.y - pad} ${box.w + 2 * pad} ${box.h + 2 * pad}`, shapes, lines, unit };
  });
}
