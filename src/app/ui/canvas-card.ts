import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { FreeBoard, shownNodes } from '../core/free-board';
import { PickedGame } from '../core/review';
import { CoverSleeve } from './cover-sleeve';
import { BoardSketch } from './free-board/board-sketch';

/**
 * O canvas na parede (PLANO-CANVAS.md, 2): um pedaço de eucatex numa moldura de alumínio, pendurado num prego por
 * um barbante, com o quadro desenhado em miniatura e o nome numa fita Dymo. Só o desenho: a ficha (ui/review-card.ts)
 * dá o lugar, o giro, o foco, o botão que abre e o que só o dono faz, e projeta dentro da moldura a orelha do grupo,
 * o carimbo, os botões de hover e as reações (o que fica preso na moldura, e não no prego).
 *
 * Tudo aqui é `aria-hidden`: quem lê a tela ouve o botão da ficha, que diz o nome, as peças, o grupo e o resto.
 */
@Component({
  selector: 'app-canvas-card',
  imports: [BoardSketch, CoverSleeve],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.geral]': 'overview()' },
  template: `
    <div class="pendurado">
      <!-- na Visão geral, deitado na mesa: sem o prego e o barbante -->
      @if (!overview()) {
        <span class="prego" aria-hidden="true"></span>
        <svg class="barbante" viewBox="0 0 100 40" preserveAspectRatio="none" aria-hidden="true"><path d="M6 40 L50 2 L94 40" /></svg>
      }
      <div class="moldura">
        <div class="eucatex" aria-hidden="true">
          @if (cover(); as game) {
            <app-cover-sleeve class="capa" [game]="game" [decorative]="true" />
          } @else if (board(); as b) {
            @if (pieces()) {
              <app-board-sketch [board]="b" />
            } @else {
              <span class="vazio">Canvas vazio</span>
            }
          }
        </div>
        <span class="dymo" aria-hidden="true">{{ name() }}</span>
        <!-- a orelha do grupo (atrás da moldura: o barbante passa por trás dela), o carimbo, os botões de hover, o
             adesivo de marcar e as reações: presos na moldura -->
        <ng-content />
      </div>
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
  /** A Visão geral: deitado na mesa, sem o prego. */
  readonly overview = input(false);

  protected readonly pieces = computed(() => canvasPieces(this.board()) ?? 0);

  protected readonly cover = computed(() => {
    const g = this.game();
    return g?.coverUrl ? g : null;
  });
}

/** Quantas peças o quadro tem (as que este site mostra), para o leitor de tela e a Lista. */
export function canvasPieces(board: FreeBoard | null): number | null {
  return board ? shownNodes(board).length : null;
}
