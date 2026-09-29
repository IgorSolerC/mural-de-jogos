import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { ageOf, daysWaiting, notebookDate, pageFor } from '../core/notebook';
import { Draft } from '../core/review';
import { pinningFor } from '../core/wall-physics';
import { CoverSleeve } from './cover-sleeve';

/**
 * Um título guardado para resenhar depois: ainda não é cartolina, é uma folha arrancada às pressas
 * e presa na parede. Cada uma de um papel (caderno de espiral, fichário, quadriculado, bloco de
 * recados, post-it), presa do seu jeito (fita no meio, nos dois cantos, num canto só; o post-it gruda
 * sozinho), com a capa colada, num clipe ou em cantoneiras de álbum. No cabeçalho, a lápis, o dia
 * em que foi guardado; e a folha amarela com o tempo, para quem espera há mais tempo saltar aos olhos.
 */
@Component({
  selector: 'app-draft-card',
  imports: [CoverSleeve],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-landing]': 'landing()',
    '[class.is-preview]': 'preview()',
    '[class]': '"papel-" + page().kind + " idade-" + age()',
    '[style.--tilt]': 'pin().tilt',
    '[style.--tape-tilt]': 'page().tapeTilt',
    '[style.--tape-x]': 'page().tapeX + "%"',
    '[style.--postit]': 'page().color',
    '[style.--drop-y]': 'pin().dropY + "px"',
    '[style.--largura]': 'page().width',
    '[style.--desvio]': 'page().shift',
    '[style.--vao]': 'page().gap + "px"',
    '[style.view-transition-name]': 'preview() ? null : "pendente-" + draft().id',
  },
  template: `
    @switch (page().hold) {
      @case ('fita') {
        <span class="tape meio" aria-hidden="true"></span>
      }
      @case ('fitas') {
        <span class="tape esq" aria-hidden="true"></span>
        <span class="tape dir" aria-hidden="true"></span>
      }
      @case ('canto') {
        <span class="tape esq" aria-hidden="true"></span>
      }
    }

    <div class="sheet">
      <p class="cabecalho" aria-hidden="true">
        @if (page().kind === 'espiral' || page().kind === 'fichario') {
          <span class="rotulo-data">Data</span>
        }
        <span class="data">{{ date() }}</span>
      </p>

      <div class="cover-wrap" [class]="'foto-' + page().photo">
        <app-cover-sleeve [game]="draft().game" [decorative]="true" />
        @if (page().photo === 'clipe') {
          <!-- um clipe de metal prendendo a capa na folha -->
          <svg class="clipe" viewBox="0 0 16 44" aria-hidden="true">
            <path d="M5.2 13 V34.5 a2.8 2.8 0 0 0 5.6 0 V7.5 a4.8 4.8 0 0 0 -9.6 0 V36 a6.8 6.8 0 0 0 13.6 0 V10" />
            <path d="M4.7 13 V34.5 M0.7 7.5 V36" />
          </svg>
        }
        @if (page().photo === 'cantos') {
          <span class="canto c1" aria-hidden="true"></span>
          <span class="canto c2" aria-hidden="true"></span>
          <span class="canto c3" aria-hidden="true"></span>
          <span class="canto c4" aria-hidden="true"></span>
        }
      </div>

      <h3 class="title">{{ draft().game.name }}</h3>
      @if (draft().game.by; as by) {
        <p class="autor">de {{ by }}</p>
      }
    </div>

    @if (!preview()) {
      <button type="button" class="hit" (click)="opened.emit(draft().id)">
        <span class="sr-only">Terminar a resenha de {{ draft().game.name }}, guardado {{ waited() }}</span>
      </button>
    }
  `,
  styles: `
    :host {
      --rule: 20px;
      --margin-x: 14px;
      --graphite: #43454d;
      --folha: #fbfaf3;
      --pauta: rgb(70 120 200 / 0.3);
      --margem: rgb(230 46 45 / 0.5);
      --idade: 0;
      position: relative;
      display: block;
      width: 100%;
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
    /* com o tempo a folha amarela na parede */
    :host(.idade-amarelando) {
      --idade: 0.11;
    }
    :host(.idade-velha) {
      --idade: 0.22;
    }

    /* Mexe como papel solto: gira em volta da fita e desgruda um pouco */
    :host(:hover),
    :host(:focus-within) {
      rotate: calc(var(--tilt) * 0.3deg);
      translate: 0 -3px;
      filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.28)) drop-shadow(0 14px 14px rgb(0 0 0 / 0.5));
    }

    .sheet {
      position: relative;
      display: flex;
      flex-direction: column;
      padding: 8px 10px 10px calc(var(--margin-x) + 8px);
      color: var(--graphite);
    }
    /* o amarelado do tempo, por cima de tudo (a capa também desbota), e as beiradas mais escuras */
    .sheet::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: 3;
      pointer-events: none;
      background:
        radial-gradient(ellipse at 50% 42%, transparent 55%, rgb(150 105 30 / calc(var(--idade) * 1.1))),
        linear-gradient(rgb(205 160 60 / var(--idade)) 0 0);
      mix-blend-mode: multiply;
    }

    /* ===== Os papéis ===== */

    /* caderno de espiral: margem vermelha, pauta azul contada do pé da folha (o nome cai na linha),
       e na esquerda as meias-luas mordidas onde a folha saiu da espiral */
    :host(.papel-espiral) .sheet {
      background:
        linear-gradient(90deg, transparent var(--margin-x), var(--margem) var(--margin-x) calc(var(--margin-x) + 1.5px), transparent 0),
        repeating-linear-gradient(to top, transparent 0 14px, var(--pauta) 14px 15.5px, transparent 15.5px var(--rule)),
        var(--folha);
      -webkit-mask: radial-gradient(circle at 0 50%, #0000 3.5px, #000 4px) 0 0 / 100% 13px repeat-y;
      mask: radial-gradient(circle at 0 50%, #0000 3.5px, #000 4px) 0 0 / 100% 13px repeat-y;
    }

    /* fichário: margem dupla e os três furos redondos (de verdade: a parede aparece por eles) */
    :host(.papel-fichario) {
      --margin-x: 24px;
    }
    :host(.papel-fichario) .sheet {
      background:
        linear-gradient(90deg, transparent 22px, var(--margem) 22px 23.5px, transparent 23.5px 25.5px, var(--margem) 25.5px 27px, transparent 0),
        repeating-linear-gradient(to top, transparent 0 14px, var(--pauta) 14px 15.5px, transparent 15.5px var(--rule)),
        var(--folha);
      -webkit-mask:
        radial-gradient(circle at 10px 17%, #0000 4.2px, #000 4.8px),
        radial-gradient(circle at 10px 50%, #0000 4.2px, #000 4.8px),
        radial-gradient(circle at 10px 83%, #0000 4.2px, #000 4.8px);
      -webkit-mask-composite: source-in;
      mask:
        radial-gradient(circle at 10px 17%, #0000 4.2px, #000 4.8px),
        radial-gradient(circle at 10px 50%, #0000 4.2px, #000 4.8px),
        radial-gradient(circle at 10px 83%, #0000 4.2px, #000 4.8px);
      mask-composite: intersect;
    }

    /* quadriculado: a grade azul clarinha, arrancado da espiral de cima */
    :host(.papel-quadriculada) {
      --margin-x: 2px;
    }
    :host(.papel-quadriculada) .sheet {
      padding-top: 12px;
      background:
        linear-gradient(rgb(70 120 200 / 0.2) 1px, transparent 1px) 0 0 / 10px 10px,
        linear-gradient(90deg, rgb(70 120 200 / 0.2) 1px, transparent 1px) 0 0 / 10px 10px,
        var(--folha);
      -webkit-mask: radial-gradient(circle at 50% 0, #0000 3.5px, #000 4px) 0 0 / 13px 100% repeat-x;
      mask: radial-gradient(circle at 50% 0, #0000 3.5px, #000 4px) 0 0 / 13px 100% repeat-x;
    }

    /* bloco de recados: papel amarelinho, pauta cinza, e no alto o restinho da cola vermelha do bloco */
    :host(.papel-bloco) {
      --margin-x: 2px;
    }
    :host(.papel-bloco) .sheet {
      padding-top: 13px;
      background:
        linear-gradient(rgb(190 62 52 / 0.78) 0 0) 0 0 / 100% 4px no-repeat,
        repeating-linear-gradient(to top, transparent 0 14px, rgb(90 90 90 / 0.2) 14px 15px, transparent 15px var(--rule)),
        #fdf6d6;
      /* arrancado do bloco: a beirada de cima picotada, onde a folha soltou da cola */
      -webkit-mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 6px 100%;
      mask: conic-gradient(from 135deg at top, #0000, #000 1deg 89deg, #0000 90deg) 50% / 6px 100%;
    }

    /* post-it: cor de papelaria, gruda sozinho, e a ponta de baixo levanta um pouco da parede */
    :host(.papel-postit) {
      --margin-x: 2px;
      --graphite: #34302b;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.28)) drop-shadow(0 12px 10px rgb(0 0 0 / 0.46));
    }
    :host(.papel-postit) .sheet {
      padding: 10px 11px 14px;
      background:
        linear-gradient(to bottom, rgb(0 0 0 / 0.07), transparent 16px) 0 0 / 100% 16px no-repeat,
        linear-gradient(172deg, transparent 72%, rgb(0 0 0 / 0.05) 88%, rgb(255 255 255 / 0.25) 100%),
        var(--postit);
      /* a ponta levantada: o canto de baixo à direita chanfrado, como papel que descolou */
      clip-path: polygon(0 0, 100% 0, 100% calc(100% - 10px), calc(100% - 14px) 100%, 0 100%);
    }

    /* ===== Fita-crepe segurando a folha pelo alto ===== */
    .tape {
      position: absolute;
      z-index: 5;
      top: -8px;
      width: 48px;
      height: 17px;
      background: rgb(222 205 160 / 0.86);
      box-shadow: 0 1px 1px rgb(0 0 0 / 0.2);
    }
    .tape.meio {
      left: calc(var(--tape-x) - 24px);
      rotate: calc(var(--tape-tilt) * 1deg);
    }
    .tape.esq {
      top: -2px;
      left: -14px;
      width: 44px;
      rotate: calc(-40deg + var(--tape-tilt) * 0.5deg);
    }
    .tape.dir {
      top: -2px;
      right: -14px;
      width: 44px;
      rotate: calc(38deg + var(--tape-tilt) * 0.5deg);
    }
    :host-context(body.has-tape) .tape {
      background: url('textures/fita-crepe.png') center / 100% 100% no-repeat;
      box-shadow: none;
    }

    /* ===== O cabeçalho da folha: o dia em que foi guardado, a lápis ===== */
    .cabecalho {
      display: flex;
      align-items: baseline;
      justify-content: flex-end;
      gap: 5px;
      min-height: var(--rule);
      margin-bottom: 4px;
      line-height: 1;
    }
    /* impresso na folha, como nos cadernos escolares */
    .rotulo-data {
      font-family: var(--f-label);
      font-weight: 600;
      font-size: 0.66rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: rgb(52 88 150 / 0.85);
    }
    .data {
      min-width: 3.4em;
      padding: 0 2px 1px;
      border-bottom: 1px solid rgb(52 88 150 / 0.4);
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 0.95rem;
      text-align: center;
      color: var(--graphite);
      font-variant-numeric: tabular-nums;
    }
    :host(.papel-quadriculada) .data,
    :host(.papel-bloco) .data,
    :host(.papel-postit) .data {
      min-width: 0;
      border-bottom: 0;
    }

    /* ===== A capa na folha ===== */
    .cover-wrap {
      position: relative;
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
    .foto-clipe app-cover-sleeve {
      rotate: 1.2deg;
    }
    .foto-cantos app-cover-sleeve {
      rotate: -0.5deg;
      margin: 3px;
    }

    /* o clipe: arame de aço dobrado, prendendo a capa pela beirada de cima */
    .clipe {
      position: absolute;
      z-index: 2;
      top: -17px;
      left: 14%;
      width: 19px;
      height: 52px;
      rotate: -7deg;
      overflow: visible;
      filter: drop-shadow(1px 2px 1px rgb(0 0 0 / 0.4));
    }
    /* o arame: cinza de aço, com um fio de brilho da luz de cima */
    .clipe path {
      fill: none;
      stroke: #8e949b;
      stroke-width: 2.1;
      stroke-linecap: round;
    }
    .clipe path + path {
      stroke: rgb(255 255 255 / 0.75);
      stroke-width: 0.7;
    }

    /* cantoneiras de álbum: quatro triângulos de papel preto segurando a capa pelas pontas */
    .canto {
      position: absolute;
      z-index: 2;
      width: 15px;
      height: 15px;
      background: linear-gradient(135deg, #2b2a2c, #141315);
      filter: drop-shadow(0 1px 0.5px rgb(0 0 0 / 0.4));
    }
    .c1 {
      top: 0;
      left: 0;
      clip-path: polygon(0 0, 100% 0, 0 100%);
    }
    .c2 {
      top: 0;
      right: 0;
      clip-path: polygon(0 0, 100% 0, 100% 100%);
    }
    .c3 {
      bottom: 0;
      right: 0;
      clip-path: polygon(100% 0, 100% 100%, 0 100%);
    }
    .c4 {
      bottom: 0;
      left: 0;
      clip-path: polygon(0 0, 100% 100%, 0 100%);
    }

    /* o nome escrito a lápis, na pauta */
    .title {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.02rem;
      line-height: var(--rule);
      overflow-wrap: anywhere;
      display: -webkit-box;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      overflow: hidden;
    }
    .autor {
      font-family: var(--f-hand);
      font-size: 0.9rem;
      line-height: var(--rule);
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }

    .hit {
      position: absolute;
      inset: -8px 0 0;
      z-index: 6;
      border: 0;
      padding: 0;
      background: transparent;
      border-radius: 2px;
    }
    .hit:focus-visible {
      outline-offset: 3px;
    }

    :host(.is-preview) {
      rotate: calc(var(--tilt) * 0.5deg);
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
  `,
})
export class DraftCard {
  readonly draft = input.required<Draft>();
  readonly landing = input(false);
  /** A prévia do diálogo de guardar: sem botão, quase reta. */
  readonly preview = input(false);
  readonly opened = output<string>();

  protected readonly pin = computed(() => pinningFor(this.draft().id));
  protected readonly page = computed(() => pageFor(this.draft().id));
  private readonly days = computed(() => daysWaiting(this.draft().createdAt));
  protected readonly age = computed(() => ageOf(this.days()));
  protected readonly date = computed(() => notebookDate(this.draft().createdAt));
  protected readonly waited = computed(() => {
    const d = this.days();
    return d === 0 ? 'hoje' : d === 1 ? 'ontem' : `há ${d} dias`;
  });
}
