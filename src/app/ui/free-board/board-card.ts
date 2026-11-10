import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { RouterLink } from '@angular/router';
import { FreeBoard, pieceCount } from '../../core/free-board';
import { agoLabel, fullWhen } from '../../core/follow';
import { Pin } from '../pin';
import { BoardSketch } from './board-sketch';

/**
 * Um quadro na lista do Quadro livre (PLANO-QUADRO-LIVRE.md, 4.2): uma folha de papel kraft presa por
 * tachinha, com a miniatura desenhada dos dados (board-sketch.ts), o nome numa fita-crepe e, embaixo, quantas
 * peças e quando mudou. A peça só lê: o menu (Renomear, Apagar...) é da página do dono, pelo botão direito em
 * cima do link (`data-quadro`). A visita monta a mesma folha.
 */
@Component({
  selector: 'app-free-board-card',
  imports: [BoardSketch, Pin, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <a class="folha" [routerLink]="path()" [attr.data-quadro]="board().id" [attr.aria-label]="spoken()">
      <app-pin class="tacha" color="#f4f4f0" />
      <app-board-sketch class="miniatura" [board]="board()" />
      <span class="nome">{{ board().nome }}</span>
      <span class="pe" aria-hidden="true">
        <span>{{ countText() }}</span>
        <span [title]="whenFull()">{{ when() }}</span>
      </span>
    </a>
  `,
  styles: `
    :host {
      display: block;
    }
    .folha {
      position: relative;
      display: grid;
      grid-template-rows: auto auto auto;
      gap: 10px;
      padding: 22px 16px 14px;
      background-color: #c9a472;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: var(--ink);
      text-decoration: none;
      rotate: var(--torto, -0.6deg);
      box-shadow: var(--shadow-card);
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical),
        box-shadow var(--t-ui) var(--ease-ui);
    }
    .folha:hover {
      rotate: 0deg;
      translate: 0 -3px;
      box-shadow: var(--shadow-lift);
    }
    .folha:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 4px;
    }
    .tacha {
      top: -9px;
      left: calc(50% - 13px);
    }
    /* a miniatura: um pedaço da parede, o quadro em ponto pequeno */
    .miniatura {
      aspect-ratio: 16 / 10;
      padding: 8px;
      background-color: var(--wall);
      box-shadow: inset 0 1px 3px rgb(0 0 0 / 0.6);
    }
    .nome {
      justify-self: start;
      max-width: 100%;
      padding: 5px 14px 4px;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
      background-color: rgb(222 205 160 / 0.94);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      font: 400 1.2rem / 1.15 var(--f-marker);
      rotate: -1.2deg;
      clip-path: polygon(0 6%, 5px 30%, 1px 52%, 6px 76%, 0 96%, 100% 100%, calc(100% - 4px) 72%, 100% 48%, calc(100% - 6px) 24%, 100% 2%);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3));
    }
    .pe {
      display: flex;
      justify-content: space-between;
      gap: 8px;
      font: 800 0.8rem / 1 var(--f-label);
      letter-spacing: 0.06em;
      text-transform: uppercase;
      color: rgb(21 21 21 / 0.78);
      font-variant-numeric: tabular-nums;
    }
    @media (prefers-reduced-motion: reduce) {
      .folha {
        transition: none;
      }
    }
  `,
})
export class FreeBoardCard {
  readonly board = input.required<FreeBoard>();
  readonly path = input.required<string>();

  private readonly count = computed(() => pieceCount(this.board()));
  protected readonly countText = computed(() => `${this.count()} ${this.count() === 1 ? 'peça' : 'peças'}`);
  protected readonly when = computed(() => agoLabel(this.board().em));
  protected readonly whenFull = computed(() => fullWhen(this.board().em));
  protected readonly spoken = computed(() => `Quadro ${this.board().nome}, ${this.countText()}, mudou ${this.when()}`);
}
