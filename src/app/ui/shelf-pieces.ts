import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { PixelArt } from '../core/pixel-art';
import { PixelThumb } from './pixel-thumb';

/**
 * As coisas da prateleira de Outros (PLANO-OUTROS.md, D7), cada uma com o visual da sua página. Só desenho: o link,
 * a fita Dymo e o nome acessível ficam com a página (pages/extras-page). A sombra de cada uma fica no host.
 */

/**
 * As Pixel arts: o monitor CRT bege de computador antigo, com a obra mais nova na tela. A tela é a de um tubo: o
 * chiado bem fraco atrás da arte, o escuro nas beiradas, as linhas e o brilho do vidro. Sem obra, a tela diz
 * "desenhe a primeira".
 */
@Component({
  selector: 'app-crt-monitor',
  imports: [PixelThumb],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="caixa">
      <span class="tela">
        @if (art(); as a) {
          <app-pixel-thumb [art]="a" />
        } @else {
          <span class="primeira">desenhe a primeira</span>
        }
      </span>
      <span class="queixo"><i class="grade"></i><i class="luz"></i><i class="botao"></i></span>
    </span>
    <span class="pescoco"></span>
    <span class="base"></span>
  `,
  styles: `
    :host {
      position: relative;
      display: grid;
      justify-items: center;
      filter: drop-shadow(-6px 9px 7px rgb(0 0 0 / 0.45));
    }
    .caixa {
      position: relative;
      z-index: 1;
      display: grid;
      justify-items: center;
      gap: 8px;
      padding: 14px 14px 8px;
      border-radius: 8px 8px 6px 6px;
      background: linear-gradient(180deg, #e9e2cf, #d6ccb2);
      box-shadow:
        inset 0 2px 0 rgb(255 255 255 / 0.6),
        inset 0 -3px 0 rgb(120 100 60 / 0.25),
        inset 3px 0 0 rgb(255 255 255 / 0.25),
        inset -3px 0 0 rgb(120 100 60 / 0.15);
    }
    /* o tubo, afundado na moldura bege */
    .tela {
      position: relative;
      /* a arte estica na área da tela (o desenho fica inteiro e no meio, ui/pixel-thumb.ts) */
      display: grid;
      box-sizing: border-box;
      width: 132px;
      height: 104px;
      padding: 12px 22px;
      border-radius: 14px / 12px;
      background-color: #16181c;
      background-image:
        radial-gradient(ellipse at 50% 45%, rgb(120 140 170 / 0.18), transparent 75%),
        repeating-conic-gradient(rgb(255 255 255 / 0.05) 0 25%, transparent 0 50%);
      background-size: auto, 4px 4px;
      box-shadow:
        0 0 0 3px #26282c,
        0 0 0 6px #b9ae92,
        0 0 0 8px #8f8468,
        inset 0 0 14px rgb(0 0 0 / 0.8);
      overflow: hidden;
    }
    /* as linhas do tubo e o brilho do vidro, por cima da arte */
    .tela::after {
      content: '';
      position: absolute;
      inset: 0;
      background:
        repeating-linear-gradient(0deg, rgb(0 0 0 / 0.18) 0 1px, transparent 1px 3px),
        radial-gradient(ellipse 50% 30% at 26% 16%, rgb(255 255 255 / 0.16), transparent 70%);
      pointer-events: none;
    }
    .primeira {
      place-self: center;
      color: rgb(225 236 250 / 0.78);
      font-family: var(--f-hand);
      font-size: 1rem;
      line-height: 1.15;
      text-align: center;
    }
    /* o queixo: a grade de ventilação, a luzinha verde e o botão de ligar */
    .queixo {
      display: flex;
      align-items: center;
      gap: 8px;
      justify-self: stretch;
      padding: 0 4px;
    }
    .grade {
      flex: 1;
      height: 8px;
      background: repeating-linear-gradient(90deg, rgb(120 100 60 / 0.4) 0 2px, transparent 2px 5px);
    }
    .luz {
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: #33e07a;
      box-shadow: 0 0 5px #33e07a;
    }
    .botao {
      width: 14px;
      height: 9px;
      border-radius: 2px;
      background: #cfc5a9;
      box-shadow: inset 0 -2px 0 rgb(120 100 60 / 0.35);
    }
    .pescoco {
      width: 46px;
      height: 10px;
      background: linear-gradient(180deg, #b9ae92, #cfc5a9);
    }
    .base {
      width: 110px;
      height: 12px;
      border-radius: 50% 50% 3px 3px / 100% 100% 3px 3px;
      background: linear-gradient(180deg, #e2dac4, #c4b998);
    }
  `,
})
export class CrtMonitor {
  /** A obra mais nova da galeria; `null` sem nenhuma. */
  readonly art = input.required<Pick<PixelArt, 'w' | 'h' | 'rows' | 'palette' | 'colors'> | null>();
}
