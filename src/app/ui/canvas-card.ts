import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { CardFinder } from '../core/card-finder';
import { FbFrame, FreeBoard, shownNodes } from '../core/free-board';
import { PickedGame } from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { CoverSleeve } from './cover-sleeve';
import { BoardSketch } from './free-board/board-sketch';
import { CardOf } from './free-board/far-look';

/**
 * O canvas na parede (PLANO-CANVAS.md, 2): um pedaço de eucatex numa moldura de alumínio, com o quadro desenhado em
 * miniatura e o nome numa fita Dymo. O prego e o barbante que fingiam pendurá-lo saíram em 25/nov/2026, a pedido do
 * dono, e o eucatex cresceu para o lugar deles (3:2, era 16:9). Só o desenho: a ficha (ui/review-card.ts) dá o lugar,
 * o giro, o foco, o botão que abre e o que só o dono faz, e projeta dentro da moldura a orelha do grupo, o carimbo,
 * os botões de hover e as reações.
 *
 * Tudo aqui é `aria-hidden`: quem lê a tela ouve o botão da ficha, que diz o nome, as peças, o grupo e o resto.
 */
@Component({
  selector: 'app-canvas-card',
  imports: [BoardSketch, CoverSleeve],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.geral]': 'overview()' },
  template: `
    <div class="moldura">
      <div class="eucatex" aria-hidden="true">
        @if (cover(); as game) {
          <app-cover-sleeve class="capa" [game]="game" [decorative]="true" />
        } @else if (board(); as b) {
          @if (pieces()) {
            <app-board-sketch [board]="b" [cards]="cards" />
          } @else {
            <span class="vazio">Canvas vazio</span>
          }
        }
      </div>
      <span class="dymo" aria-hidden="true">{{ name() }}</span>
      <!-- a orelha do grupo (atrás da moldura), o carimbo, os botões de hover, o adesivo de marcar e as reações:
           presos na moldura -->
      <ng-content />
    </div>
  `,
  styleUrl: './canvas-card.scss',
})
export class CanvasCard {
  /** O quadro (null: ainda não chegou, ou não é desta pessoa ver). */
  readonly board = input<FreeBoard | null>(null);
  readonly name = input.required<string>();
  /** A anotação com capa: a foto no lugar da miniatura. */
  readonly game = input<PickedGame | null>(null);
  /** A Visão geral: deitado na mesa, mais baixo. */
  readonly overview = input(false);

  protected readonly pieces = computed(() => canvasPieces(this.board()) ?? 0);

  private readonly finder = inject(CardFinder);
  /**
   * As fichas coladas no quadro (o widget Nota), pelo id, como o widget as acha: as suas e as do mural aberto de outra
   * pessoa. Na visita, a privada não vem (a miniatura a deixa sem nome, nunca com o título escrito na linha).
   */
  protected readonly cards: CardOf = (id) => {
    const r = this.finder.find(id)?.review;
    return r ? { stock: pinningFor(r.id, r.stock).stock, name: r.game.name, folder: !!r.category } : null;
  };

  protected readonly cover = computed(() => {
    const g = this.game();
    return g?.coverUrl ? g : null;
  });
}

/**
 * As regiões do quadro (as molduras com nome, de cima para baixo e da esquerda para a direita), para o leitor de tela
 * dizer o que tem dentro, como o desenho diz a quem vê: "3 regiões: Lisboa, Porto, Antes de ir".
 */
export function canvasRegions(board: FreeBoard | null): string {
  if (!board) return '';
  const names = shownNodes(board)
    .filter((n): n is FbFrame => n.t === 'm' && !!n.nome?.trim())
    .sort((a, b) => a.y - b.y || a.x - b.x)
    .map((n) => n.nome!.trim());
  if (!names.length) return '';
  const shown = names.slice(0, 6).join(', ') + (names.length > 6 ? ' e outras' : '');
  return `${names.length} ${names.length === 1 ? 'região' : 'regiões'}: ${shown}`;
}

/** Quantas peças o quadro tem (as que este site mostra), para o leitor de tela e a Lista. */
export function canvasPieces(board: FreeBoard | null): number | null {
  return board ? shownNodes(board).length : null;
}
