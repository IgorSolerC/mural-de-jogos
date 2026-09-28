import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { Draft } from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { CoverSleeve } from './cover-sleeve';

/**
 * Jogo guardado para resenhar depois: não é cartolina ainda, é uma folha de caderno arrancada
 * às pressas, presa com fita-crepe na bandeja do topo. O nome vai a lápis.
 */
@Component({
  selector: 'app-draft-card',
  imports: [CoverSleeve],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-landing]': 'landing()',
    '[style.--tilt]': 'pin().tilt',
    '[style.--tape-tilt]': 'tapeTilt()',
    '[style.--drop-y]': 'pin().dropY + "px"',
    '[style.view-transition-name]': '"pendente-" + draft().id',
  },
  template: `
    <span class="tape" aria-hidden="true"></span>

    <div class="sheet">
      <div class="cover-wrap">
        <app-cover-sleeve [game]="draft().game" />
      </div>
      <h3 class="title">{{ draft().game.name }}</h3>
    </div>

    <button type="button" class="hit" (click)="opened.emit(draft().id)">
      <span class="sr-only">Terminar a resenha de {{ draft().game.name }}</span>
    </button>
  `,
  styles: `
    /* Folha pequena de propósito: a fila é bandeja de entrada, não parte do mural */
    :host {
      --rule: 20px;
      --margin-x: 14px;
      --graphite: #43454d;
      position: relative;
      display: block;
      flex: none;
      width: 128px;
      margin-top: calc(var(--drop-y) * 0.5);
      rotate: calc(var(--tilt) * 1deg);
      transform-origin: 50% 0;
      /* a folha é recortada pela máscara: a sombra vem de filtro, não de box-shadow */
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 8px 9px rgb(0 0 0 / 0.42));
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical),
        filter var(--t-ui) var(--ease-ui);
    }

    /* Mexe como papel solto: gira em volta da fita e desgruda um pouco */
    :host(:hover),
    :host(:focus-within) {
      rotate: calc(var(--tilt) * 0.3deg);
      translate: 0 -3px;
      filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.28)) drop-shadow(0 14px 14px rgb(0 0 0 / 0.5));
    }

    .sheet {
      display: flex;
      flex-direction: column;
      padding: 16px 10px 10px calc(var(--margin-x) + 8px);
      color: var(--graphite);
      /* folha de caderno: margem vermelha, pauta azul contada a partir do pé da folha,
         para o nome sempre cair em cima das linhas */
      background:
        linear-gradient(90deg, transparent var(--margin-x), rgb(230 46 45 / 0.5) var(--margin-x) calc(var(--margin-x) + 1.5px), transparent 0),
        repeating-linear-gradient(to top, transparent 0 14px, rgb(70 120 200 / 0.3) 14px 15.5px, transparent 15.5px var(--rule)),
        #fbfaf3;
      /* picote do espiral: meias-luas mordidas na borda esquerda */
      -webkit-mask: radial-gradient(circle at 0 50%, #0000 3.5px, #000 4px) 0 0 / 100% 13px repeat-y;
      mask: radial-gradient(circle at 0 50%, #0000 3.5px, #000 4px) 0 0 / 100% 13px repeat-y;
    }

    /* fita-crepe segurando a folha pelo topo, em vez de tachinha */
    .tape {
      position: absolute;
      z-index: 2;
      top: -8px;
      left: calc(50% - 24px);
      width: 48px;
      height: 17px;
      rotate: calc(var(--tape-tilt) * 1deg);
      background: rgb(222 205 160 / 0.86);
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.2);
    }
    :host-context(body.has-tape) .tape {
      background: url('textures/fita-crepe.png') center / 100% 100% no-repeat;
      box-shadow: none;
    }

    .cover-wrap {
      margin-bottom: 8px;
    }
    /* capa sem nota ainda: um pouco apagada, como foto colada de rascunho */
    app-cover-sleeve {
      padding: 3px;
      rotate: -1.5deg;
      filter: saturate(0.55) contrast(0.95);
      transition: filter var(--t-ui) var(--ease-ui);
    }
    :host(:hover) app-cover-sleeve,
    :host(:focus-within) app-cover-sleeve {
      filter: none;
    }

    /* o nome escrito a lápis, na pauta */
    .title {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 0.98rem;
      line-height: var(--rule);
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }

    .hit {
      position: absolute;
      inset: -8px 0 0;
      z-index: 4;
      border: 0;
      padding: 0;
      background: transparent;
      border-radius: 2px;
    }
    .hit:focus-visible {
      outline-offset: 3px;
    }

    /* Chegada: a folha é colada às pressas, a fita bate por cima */
    :host(.is-landing) {
      animation: stick 560ms var(--ease-physical) both;
    }
    :host(.is-landing) .tape {
      animation: tape 460ms 220ms var(--ease-physical) both;
    }
    @keyframes stick {
      0% {
        translate: 0 -40px;
        rotate: calc(var(--tilt) * -3deg);
        opacity: 0;
      }
      50% {
        opacity: 1;
      }
    }
    @keyframes tape {
      0% {
        scale: 1.6 1.2;
        opacity: 0;
      }
    }

    @media (max-width: 559px) {
      :host {
        width: 116px;
      }
    }
  `,
})
export class DraftCard {
  readonly draft = input.required<Draft>();
  readonly landing = input(false);
  readonly opened = output<string>();

  protected readonly pin = computed(() => pinningFor(this.draft().id));
  /** A fita vai torta para o lado contrário da folha. */
  protected readonly tapeTilt = computed(() => Math.round(-this.pin().tilt * 2.2 * 10) / 10);
}
