import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, input, output, signal } from '@angular/core';
import { LucideAngularModule, Sticker } from 'lucide-angular';
import { CUTOUT_STYLES, placeFor, stickerFor, titleFor } from '../core/clipping';
import { RELEVANCES, Relevance, Wish, initialOf, relevanceLabel, relevanceOf } from '../core/review';
import { SHAPE_RATIO, stripFor, tearFor } from '../core/tear';
import { pinningFor } from '../core/wall-physics';
import { RelevanceSticker } from './relevance-sticker';

/**
 * Um desejo da wishlist: a capa arrancada de uma revista e colada na parede. Cada uma de um jeito
 * (rasgada à mão, cortada à tesoura, com a tesoura de picotar, destacada do picote, às vezes com o
 * canto dobrado ou um pedaço da página junto) e de uma revista diferente (couché, velha, retícula
 * grossa). O nome vem depois, colado por cima: numa tirinha escrita a caneta, numa manchete
 * recortada de outra página, numa tarja de cor, ou palavra por palavra, como bilhete de resgate.
 * Não é cartolina (ainda não foi resenhado) nem folha de caderno (não espera opinião).
 */
@Component({
  selector: 'app-wish-clip',
  imports: [LucideAngularModule, RelevanceSticker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-landing]': 'landing()',
    '[class.is-preview]': 'preview()',
    '[class.com-menu]': 'menu()',
    '(document:pointerdown)': 'onOutside($event)',
    '[style.--tilt]': 'tilt()',
    '[style.--rasgo]': 'tear().paper',
    '[style.--rasgo-foto]': 'tear().photo',
    '[style.--tira]': 'strip().paper',
    '[style.--tira-miolo]': 'strip().core',
    '[style.--nome-x]': 'look().inset + "px"',
    '[style.--nome-tilt]': 'look().tilt',
    '[style.--largura]': 'place().width',
    '[style.--desvio]': 'place().shift',
    '[style.--vao]': 'place().gap + "px"',
    '[style.view-transition-name]': 'preview() ? null : "desejo-" + wish().id',
  },
  template: `
    <div class="peca" [class]="'pagina-' + tear().page + ' corte-' + tear().kind + ' revista-' + tear().print">
      @if (tear().page === 'lado') {
        <span class="pagina coluna" aria-hidden="true"></span>
      }
      <div class="foto-caixa">
        @if (tear().page === 'cabeca') {
          <span class="pagina cabeca" aria-hidden="true"></span>
        }
        <div class="foto" [style.aspect-ratio]="ratio()">
          @if (wish().game.coverUrl && failed() !== wish().game.coverUrl) {
            <img
              [src]="wish().game.coverUrl"
              alt=""
              loading="lazy"
              decoding="async"
              referrerpolicy="no-referrer"
              (error)="failed.set(wish().game.coverUrl)"
            />
          } @else {
            <div class="blank" aria-hidden="true">
              <span class="initial">{{ initial() }}</span>
              <span class="note">sem capa</span>
            </div>
          }
        </div>
      </div>
      @if (tear().page === 'baixo') {
        <span class="pagina pe" aria-hidden="true"></span>
      }
    </div>

    @if (tear().fold; as f) {
      <!-- a quina dobrada, por cima do papel: o verso virado (orelha, curva) ou só a marca da dobra -->
      <svg class="dobra" [class]="'dobra-' + f.style" viewBox="0 0 100 100" preserveAspectRatio="none" aria-hidden="true">
        @if (f.style === 'orelha' || f.style === 'curva') {
          <defs>
            <linearGradient
              [attr.id]="gid('luz')"
              gradientUnits="userSpaceOnUse"
              [attr.x1]="f.shade[0]"
              [attr.y1]="f.shade[1]"
              [attr.x2]="f.shade[2]"
              [attr.y2]="f.shade[3]"
            >
              @for (st of stops(); track $index) {
                <stop [attr.offset]="st[0]" [attr.stop-color]="st[1]" [attr.stop-opacity]="st[2]" />
              }
            </linearGradient>
            <clipPath [attr.id]="gid('aba')"><polygon [attr.points]="f.flap" /></clipPath>
          </defs>
          <polygon [attr.points]="f.flap" [attr.fill]="f.back === 'cor' ? f.tint : backPaper()" />
          @if (f.back === 'texto') {
            <g [attr.clip-path]="'url(#' + gid('aba') + ')'">
              @for (l of f.lines; track $index) {
                <line class="verso-texto" [attr.x1]="l[0]" [attr.y1]="l[1]" [attr.x2]="l[2]" [attr.y2]="l[3]" />
              }
            </g>
          }
          <polygon [attr.points]="f.flap" [attr.fill]="'url(#' + gid('luz') + ')'" />
          <polygon class="aba-beira" [attr.points]="f.flap" />
          <line class="dobra-luz" [attr.x1]="f.line[0]" [attr.y1]="f.line[1]" [attr.x2]="f.line[2]" [attr.y2]="f.line[3]" />
        } @else {
          @if (f.style === 'vinco') {
            <polygon class="vinco-quina" [attr.points]="f.area" />
          }
          <line class="dobra-sombra" [attr.x1]="f.line[0]" [attr.y1]="f.line[1]" [attr.x2]="f.line[2]" [attr.y2]="f.line[3]" transform="translate(0.35 0.35)" />
          <line class="dobra-luz" [attr.x1]="f.line[0]" [attr.y1]="f.line[1]" [attr.x2]="f.line[2]" [attr.y2]="f.line[3]" />
        }
      </svg>
    }

    @if (wish().game.name.trim()) {
      @switch (look().kind) {
        @case ('tira') {
          <!-- a tirinha de papel rasgada à mão, o nome a caneta -->
          <h3 class="nome-colado tira" [class]="'papel-' + look().paper + ' ' + spot()">
            <span class="papel" aria-hidden="true"><span class="miolo"></span></span>
            <span class="nome"><span dir="auto">{{ wish().game.name }}</span></span>
          </h3>
        }
        @case ('manchete') {
          <!-- o nome impresso, recortado de outra página da revista -->
          <h3 class="nome-colado manchete" [class]="'face-' + look().face + ' ' + spot()" [class.fio]="look().rule">
            <span class="corte" [style.clip-path]="look().clip"><span dir="auto">{{ wish().game.name }}</span></span>
          </h3>
        }
        @case ('tarja') {
          <!-- o nome numa tarja de cor chapada, impressa em retícula -->
          <h3 class="nome-colado tarja" [class]="'tinta-' + look().tint + ' ' + spot()" [class.beirada]="look().rim">
            <span class="corte" [style.clip-path]="look().clip"><span>{{ wish().game.name }}</span></span>
          </h3>
        }
        @case ('resgate') {
          <!-- palavra por palavra, cada uma de uma revista -->
          <h3 class="nome-colado resgate" dir="auto" [class]="spot()" [class.picada]="look().words[1]?.joined" [class.longa]="wish().game.name.length > 9">
            <span class="sr-only">{{ wish().game.name }}</span>
            @for (w of look().words; track $index) {
              <span
                class="palavra"
                [class]="'fonte-' + styles[w.style].font"
                [class.caps]="styles[w.style].caps"
                [class.beirada]="w.rim"
                [class.emenda]="w.joined"
                [style.--cor]="styles[w.style].bg"
                [style.color]="styles[w.style].ink"
                [style.clip-path]="w.clip"
                [style.rotate.deg]="w.tilt"
                [style.translate]="'0 ' + w.dy + 'px'"
                [style.font-size.em]="w.scale"
                aria-hidden="true"
                >{{ w.text }}</span
              >
            }
          </h3>
        }
      }
    }

    @if (!preview()) {
      <button type="button" class="hit" (click)="opened.emit(wish().id)">
        <span class="sr-only">Começar a resenha de {{ wish().game.name }}</span>
      </button>
    }

    <!-- a vontade: um adesivo de capa de revista numa quina livre, meio para fora do papel (o oval do
         LATER, baixo, entra mais, para não boiar); Comum não tem: na parede, o lugar dele aparece
         quando a mão chega, para escolher -->
    @if (rel() !== 'comum' || !preview()) {
      <div
        class="vontade"
        [class]="'quina-' + sticker().corner + ' vontade-' + rel()"
        [style.--ax.px]="rel() === 'later' ? sticker().dx * 0.55 : sticker().dx"
        [style.--ay.px]="rel() === 'later' ? sticker().dy * 0.5 : sticker().dy"
        [style.--at]="sticker().tilt"
      >
        @if (preview()) {
          <app-relevance-sticker class="adesivo" [relevance]="rel()" [kind]="wish().kind" />
        } @else {
          <button
            type="button"
            class="adesivo-btn"
            (click)="toggleMenu()"
            (keydown.escape)="closeMenu($event)"
            [attr.aria-expanded]="menu()"
            [attr.aria-label]="'Quanta vontade de ' + wish().game.name + ': ' + label() + '. Mudar'"
            title="Quanta vontade?"
          >
            @if (rel() === 'comum') {
              <span class="fantasma" aria-hidden="true">
                <lucide-icon [img]="StickerIcon" [size]="16" [strokeWidth]="2.4" />
              </span>
            } @else {
              <app-relevance-sticker class="adesivo" [relevance]="rel()" [kind]="wish().kind" />
            }
          </button>
          @if (menu()) {
            <div
              class="vontade-menu"
              role="group"
              [attr.aria-label]="'Quanta vontade de ' + wish().game.name + '?'"
              (keydown.escape)="closeMenu($event)"
            >
              <p class="vontade-titulo" aria-hidden="true">Quanta vontade?</p>
              <div class="vontade-opcoes">
                @for (o of options; track o) {
                  <button
                    type="button"
                    class="opcao"
                    [class.on]="rel() === o"
                    [attr.aria-pressed]="rel() === o"
                    [attr.aria-label]="labelOf(o)"
                    (click)="pick(o)"
                  >
                    <app-relevance-sticker size="mini" [relevance]="o" [kind]="wish().kind" />
                  </button>
                }
              </div>
            </div>
          }
        }
      </div>
    }
  `,
  styles: `
    :host {
      --revista: #f5f2ea;
      position: relative;
      display: block;
      padding-bottom: 16px;
      rotate: calc(var(--tilt) * 1deg);
      /* colado com cola bastão: rente à parede, a sombra é curta e segue o recorte */
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.36)) drop-shadow(0 5px 6px rgb(0 0 0 / 0.34));
      transition:
        rotate var(--t-physical) var(--ease-physical),
        translate var(--t-physical) var(--ease-physical),
        scale var(--t-physical) var(--ease-physical),
        opacity var(--t-physical) var(--ease-physical),
        filter var(--t-ui) var(--ease-ui);
    }
    /* a ponta descola um pouco da cola quando a mão chega */
    :host(:hover),
    :host(:focus-within) {
      rotate: calc(var(--tilt) * 0.35deg);
      translate: 0 -3px;
      filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.3)) drop-shadow(0 14px 14px rgb(0 0 0 / 0.46));
    }

    /* o pedaço de revista, no contorno do rasgo ou do corte */
    .peca {
      position: relative;
      display: flex;
      flex-direction: column;
      background:
        radial-gradient(circle, rgb(0 0 0 / 0.05) 0.6px, transparent 1px) 0 0 / 3px 3px,
        var(--revista);
      -webkit-mask: var(--rasgo) 0 0 / 100% 100% no-repeat;
      mask: var(--rasgo) 0 0 / 100% 100% no-repeat;
    }
    .peca.pagina-lado {
      flex-direction: row;
    }
    /* revista velha: o papel amarelou na gaveta */
    .peca.revista-velha {
      --revista: #ede2c4;
    }
    .peca.revista-reticula {
      --revista: #f0ede4;
    }

    .foto-caixa {
      position: relative;
      flex: 1;
      min-width: 0;
    }
    /* a foto impressa; a fibra branca aparece onde rasgou */
    .foto {
      position: relative;
      overflow: hidden;
      background: #1c1a19;
      -webkit-mask: var(--rasgo-foto) 0 0 / 100% 100% no-repeat;
      mask: var(--rasgo-foto) 0 0 / 100% 100% no-repeat;
    }
    .foto::after {
      content: '';
      position: absolute;
      inset: 0;
      pointer-events: none;
    }
    /* couché: retícula fina e o brilho do papel */
    .revista-brilho .foto::after {
      background:
        linear-gradient(120deg, transparent 30%, rgb(255 255 255 / 0.2) 40%, rgb(255 255 255 / 0.05) 48%, transparent 56%),
        radial-gradient(circle, rgb(0 0 0 / 0.22) 0.55px, transparent 0.95px) 0 0 / 3px 3px;
    }
    /* revista velha: a cor desbotou para o amarelo e as beiradas escureceram */
    .revista-velha img {
      filter: sepia(0.3) saturate(0.78) contrast(0.93) brightness(1.03);
    }
    .revista-velha .foto::after {
      background:
        radial-gradient(ellipse at 50% 45%, transparent 52%, rgb(110 70 20 / 0.22)),
        radial-gradient(circle, rgb(60 40 10 / 0.2) 0.6px, transparent 1px) 0 0 / 3px 3px;
      mix-blend-mode: multiply;
    }
    /* gráfica barata: pontos de retícula grandes, cor carregada, papel fosco */
    .revista-reticula img {
      filter: saturate(1.18) contrast(1.08);
    }
    .revista-reticula .foto::after {
      background:
        radial-gradient(circle, rgb(0 0 0 / 0.26) 0.9px, transparent 1.5px) 0 0 / 4.5px 4.5px,
        radial-gradient(circle, rgb(255 255 255 / 0.1) 0.9px, transparent 1.5px) 2.25px 2.25px / 4.5px 4.5px;
    }
    img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: 50% 20%;
    }
    img[src*='/library_600x900.'] {
      object-position: 50% 50%;
    }
    .blank {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 2px;
      background: repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.04) 0 8px, transparent 8px 16px), #2a2725;
      color: rgb(245 242 234 / 0.72);
    }
    .initial {
      font-family: var(--f-didone);
      font-size: 4.6rem;
      line-height: 1;
    }
    .note {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.78rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }

    /* o que veio junto da página: o título e as colunas da matéria, pequenos demais para ler */
    .pagina {
      --linha: rgb(40 38 36 / 0.4);
      flex: none;
      display: block;
    }
    .pagina.pe {
      height: 46px;
      margin-top: 7px;
      background:
        linear-gradient(rgb(24 22 21 / 0.82) 0 0) 8% 4px / 46% 5px no-repeat,
        repeating-linear-gradient(to bottom, var(--linha) 0 1.5px, transparent 1.5px 4.5px) 8% 15px / 40% calc(100% - 15px) no-repeat,
        repeating-linear-gradient(to bottom, var(--linha) 0 1.5px, transparent 1.5px 4.5px) 54% 15px / 38% calc(100% - 15px) no-repeat;
    }
    .pagina.coluna {
      width: 19%;
      margin-right: 6px;
      background:
        linear-gradient(var(--red) 0 0) 30% 14px / 55% 4px no-repeat,
        repeating-linear-gradient(to bottom, var(--linha) 0 1.5px, transparent 1.5px 4.5px) 30% 28px / 62% calc(100% - 44px) no-repeat;
    }
    /* a cabeça da matéria: o fio da seção, o título em duas linhas grossas, e a foto logo embaixo */
    .pagina.cabeca {
      height: 30px;
      margin-bottom: 6px;
      background:
        linear-gradient(var(--red) 0 0) 7% 7px / 18% 3px no-repeat,
        linear-gradient(rgb(24 22 21 / 0.84) 0 0) 7% 14px / 74% 5px no-repeat,
        linear-gradient(rgb(24 22 21 / 0.84) 0 0) 7% 22px / 48% 5px no-repeat;
    }

    /* ===== A quina dobrada: uma camada por cima do papel, do tamanho dele (sem a folga de baixo) ===== */
    .dobra {
      position: absolute;
      z-index: 1;
      left: 0;
      top: 0;
      width: 100%;
      height: calc(100% - 16px);
      overflow: visible;
      pointer-events: none;
    }
    /* o verso achatado por cima faz uma sombra curta na foto; o rolo, mais alta */
    .dobra-orelha {
      filter: drop-shadow(0 1.5px 1.5px rgb(0 0 0 / 0.34)) drop-shadow(0 3px 5px rgb(0 0 0 / 0.18));
    }
    .dobra-curva {
      filter: drop-shadow(0 3px 3px rgb(0 0 0 / 0.38)) drop-shadow(0 8px 9px rgb(0 0 0 / 0.26));
    }
    .dobra line {
      vector-effect: non-scaling-stroke;
      stroke-linecap: round;
    }
    /* o texto da matéria do outro lado da página */
    .verso-texto {
      stroke: rgb(40 38 36 / 0.26);
      stroke-width: 1.5;
    }
    /* a luz batendo no vinco da dobra */
    .dobra-luz {
      stroke: rgb(255 255 255 / 0.7);
      stroke-width: 1;
    }
    .dobra-sombra {
      stroke: rgb(0 0 0 / 0.32);
      stroke-width: 1;
    }
    /* a beirada do pedaço virado: o fio de papel pegando luz, para ele se descolar da foto */
    .aba-beira {
      fill: none;
      stroke: rgb(255 255 255 / 0.55);
      stroke-width: 0.8;
      vector-effect: non-scaling-stroke;
    }
    /* o vinco: a quina que já foi dobrada ficou mais clara e amassada, com a marca funda da dobra */
    .vinco-quina {
      fill: rgb(255 255 255 / 0.22);
    }
    .dobra-vinco .dobra-luz {
      stroke: rgb(255 255 255 / 0.9);
      stroke-width: 1.8;
    }
    .dobra-vinco .dobra-sombra {
      stroke: rgb(0 0 0 / 0.55);
      stroke-width: 1.8;
    }
    /* dobrada para trás: a beirada da dobra, a espessura do papel pegando luz */
    .dobra-atras .dobra-luz {
      stroke: rgb(255 255 255 / 0.85);
      stroke-width: 1.4;
    }

    /* ===== O nome, colado depois por cima do recorte ===== */
    .nome-colado {
      position: absolute;
      z-index: 2;
      margin: 0;
      max-width: calc(100% - var(--nome-x) - 4px);
      rotate: calc(var(--nome-tilt) * 1deg);
      pointer-events: none;
      /* colado rente: sombra curta, que segue o corte */
      filter: drop-shadow(0 1px 0.5px rgb(0 0 0 / 0.38)) drop-shadow(0 4px 4px rgb(0 0 0 / 0.24));
    }
    .nome-colado.pe {
      bottom: 5px;
    }
    .nome-colado.topo {
      top: -7px;
    }
    .nome-colado.esq {
      left: var(--nome-x);
    }
    .nome-colado.dir {
      right: var(--nome-x);
    }

    /* A tirinha: papel de papelaria (creme, ou kraft), rasgado à mão nas duas pontas, com a fibra
       clara aparecendo onde rasgou; o nome a caneta, com folga nas pontas para o rasgo não comer as letras. */
    .tira {
      --fibra: #fdfaf2;
      --miolo: #efe6d1;
      --tinta: #2c2119;
    }
    .tira.papel-kraft {
      --fibra: #ecdfc5;
      --miolo: #c9a472;
      --tinta: #22190f;
    }
    .papel {
      position: absolute;
      inset: 0;
      background: var(--fibra);
      -webkit-mask: var(--tira) 0 0 / 100% 100% no-repeat;
      mask: var(--tira) 0 0 / 100% 100% no-repeat;
    }
    .miolo {
      position: absolute;
      inset: 0;
      background:
        linear-gradient(100deg, rgb(255 255 255 / 0.22), transparent 38%, transparent 70%, rgb(90 60 30 / 0.06)),
        var(--miolo);
      -webkit-mask: var(--tira-miolo) 0 0 / 100% 100% no-repeat;
      mask: var(--tira-miolo) 0 0 / 100% 100% no-repeat;
    }
    /* a fibra da folha, rala: por inteiro ela encardia o creme até virar kraft */
    .miolo::after {
      content: '';
      position: absolute;
      inset: 0;
      background: var(--paper-grain) 0 0 / 160px 160px;
      mix-blend-mode: multiply;
      opacity: 0.3;
    }
    .tira.papel-kraft .miolo::after {
      opacity: 0.55;
    }
    .nome {
      position: relative;
      display: block;
      padding: 8px 26px 7px 25px;
      color: var(--tinta);
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.1rem;
      line-height: 1.12;
      letter-spacing: 0.005em;
    }
    /* o corte das três linhas fica no texto, não no papel: a quarta não vaza pela margem */
    .nome span,
    .corte span {
      display: -webkit-box;
      -webkit-line-clamp: 3;
      -webkit-box-orient: vertical;
      overflow: hidden;
      overflow-wrap: anywhere;
      text-wrap: balance;
    }

    /* A manchete: uma tira de papel de revista cortada à tesoura em volta do título impresso */
    .corte {
      display: block;
    }
    .manchete .corte {
      padding: 6px 11px 7px;
      background: #fbfaf6;
      color: #161413;
    }
    .manchete.fio .corte {
      padding-top: 11px;
      background:
        linear-gradient(var(--red-deep) 0 0) 11px 5px / 34px 3px no-repeat,
        #fbfaf6;
    }
    .manchete.face-didone .corte {
      font-family: var(--f-didone);
      font-size: 1.24rem;
      line-height: 1;
      letter-spacing: 0.004em;
    }
    .manchete.face-italico .corte {
      font-family: var(--f-serif);
      font-style: italic;
      font-size: 1.36rem;
      line-height: 0.98;
    }

    /* A tarja: cor chapada, retícula de gráfica, letra de manchete esportiva */
    .tarja .corte {
      --tarja: #161413;
      padding: 6px 11px 5px;
      background:
        radial-gradient(circle, rgb(0 0 0 / 0.16) 0.8px, transparent 1.2px) 0 0 / 4px 4px,
        var(--tarja);
      color: #fbfaf6;
      font-family: var(--f-label);
      font-style: italic;
      font-weight: 800;
      font-size: 1.14rem;
      line-height: 1;
      letter-spacing: 0.01em;
      text-transform: uppercase;
    }
    .tarja.tinta-vermelho .corte {
      --tarja: var(--red-deep);
    }
    .tarja.tinta-amarelo .corte {
      --tarja: #ffd23a;
      color: #161413;
    }
    /* a tesoura passou um tico por fora da cor: sobra uma beiradinha branca da página */
    .tarja.beirada .corte {
      border: 3px solid transparent;
      background:
        radial-gradient(circle, rgb(0 0 0 / 0.16) 0.8px, transparent 1.2px) 0 0 / 4px 4px padding-box,
        linear-gradient(var(--tarja) 0 0) padding-box,
        #fbfaf6 border-box;
    }

    /* O bilhete de resgate: cada palavra num pedacinho de revista, colada torta ao lado da outra */
    .resgate {
      display: flex;
      flex-wrap: wrap;
      align-items: center;
      gap: 3px 6px;
      font-size: 1.12rem;
      filter: none;
    }
    .resgate.pe {
      bottom: 3px;
    }
    .palavra {
      display: inline-block;
      padding: 3px 6px 2px;
      background: var(--cor);
      line-height: 1;
      white-space: nowrap;
      filter: drop-shadow(0 1px 0.5px rgb(0 0 0 / 0.4));
    }
    .palavra.fonte-didone {
      font-family: var(--f-didone);
      font-size: 1.12em;
    }
    .palavra.fonte-serif {
      font-family: var(--f-serif);
      font-size: 1.16em;
    }
    .palavra.fonte-serif-it {
      font-family: var(--f-serif);
      font-style: italic;
      font-size: 1.18em;
    }
    .palavra.fonte-label {
      font-family: var(--f-label);
      font-weight: 800;
      font-style: italic;
      padding-top: 4px;
    }
    /* uma palavra só, picada em pedaços: fica numa linha, e encolhe um tico quando é comprida */
    .resgate.picada {
      flex-wrap: nowrap;
    }
    .resgate.picada.longa {
      font-size: 0.98rem;
    }
    /* um pedaço da mesma palavra encosta no anterior */
    .palavra.emenda {
      margin-left: -5px;
    }
    .palavra.beirada {
      border: 2px solid transparent;
      background:
        linear-gradient(var(--cor) 0 0) padding-box,
        #fbfaf6 border-box;
    }
    .palavra.caps {
      text-transform: uppercase;
    }

    /* no celular o recorte tem uns 160px: as folgas e as letras encolhem para o nome não virar coluna */
    @media (max-width: 559px) {
      .nome {
        padding: 7px 19px 6px 18px;
        font-size: 1.02rem;
      }
      .manchete.face-didone .corte {
        font-size: 1.1rem;
      }
      .manchete.face-italico .corte {
        font-size: 1.2rem;
      }
      .tarja .corte {
        font-size: 1.02rem;
      }
      .resgate {
        font-size: 1rem;
      }
      .resgate.picada.longa {
        font-size: 0.88rem;
      }
    }

    .hit {
      position: absolute;
      inset: 0;
      z-index: 4;
      border: 0;
      padding: 0;
      background: transparent;
      border-radius: 2px;
    }
    .hit:focus-visible {
      outline-offset: 4px;
    }

    /* Chegada: o recorte é colado, depois o nome é pressionado por cima */
    :host(.is-landing) {
      animation: glue 520ms var(--ease-physical) both;
    }
    :host(.is-landing) .nome-colado {
      animation: press 360ms 640ms var(--ease-physical) both;
    }
    @keyframes press {
      0% {
        translate: 0 -10px;
        opacity: 0;
      }
    }
    @keyframes glue {
      0% {
        translate: 0 -36px;
        scale: 1.05;
        opacity: 0;
      }
      45% {
        opacity: 1;
      }
    }

    /* Sorteio: o sorteado sobe para perto da luz, os outros ficam na sombra */
    :host(.sorteado) {
      z-index: 5;
      rotate: calc(var(--tilt) * 0.2deg);
      translate: 0 -6px;
      scale: 1.07;
      filter: drop-shadow(0 3px 3px rgb(0 0 0 / 0.3)) drop-shadow(0 22px 22px rgb(0 0 0 / 0.55));
    }
    :host(.na-sombra) {
      opacity: 0.32;
    }
    :host(.na-sombra:hover),
    :host(.na-sombra:focus-within) {
      opacity: 0.8;
    }

    :host(.is-preview) {
      rotate: calc(var(--tilt) * 0.5deg);
    }

    /* ===== A vontade: o adesivo numa quina, meio para fora do papel ===== */
    .vontade {
      position: absolute;
      z-index: 5;
    }
    .quina-0 {
      top: calc(var(--ay) * -1);
      left: calc(var(--ax) * -1);
    }
    .quina-1 {
      top: calc(var(--ay) * -1);
      right: calc(var(--ax) * -1);
    }
    .quina-2 {
      bottom: calc(16px - var(--ay));
      right: calc(var(--ax) * -1);
    }
    .quina-3 {
      bottom: calc(16px - var(--ay));
      left: calc(var(--ax) * -1);
    }
    .adesivo {
      rotate: calc(var(--at) * 15deg);
    }
    .vontade-later .adesivo {
      rotate: calc(var(--at) * 9deg);
    }
    /* o recorte menor, no celular: o adesivo acompanha */
    @media (max-width: 559px) {
      .adesivo {
        font-size: 13.5px;
      }
    }
    .adesivo-btn {
      display: block;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
      transition:
        scale var(--t-ui) var(--ease-ui),
        opacity var(--t-ui) var(--ease-ui);
    }
    .adesivo-btn:hover {
      scale: 1.06;
    }
    .adesivo-btn:focus-visible {
      outline-offset: 3px;
      border-radius: 4px;
    }
    /* Comum: o lugar do adesivo, vazio, que aparece quando a mão chega no recorte */
    .fantasma {
      display: grid;
      place-items: center;
      width: 32px;
      height: 32px;
      margin: 6px;
      border-radius: 7px;
      background: rgb(253 252 249 / 0.94);
      box-shadow:
        inset 0 0 0 1.5px rgb(21 21 21 / 0.45),
        0 2px 4px rgb(0 0 0 / 0.3);
      color: var(--ink);
      rotate: calc(var(--at) * 8deg);
    }
    .vontade-comum .adesivo-btn {
      opacity: 0;
    }
    :host(:hover) .vontade-comum .adesivo-btn,
    :host(:focus-within) .vontade-comum .adesivo-btn,
    :host(.com-menu) .vontade-comum .adesivo-btn {
      opacity: 1;
    }
    /* sem mouse, o lugar fica sempre à vista, bem discreto */
    @media (hover: none) {
      .vontade-comum .adesivo-btn {
        opacity: 0.6;
      }
      .fantasma {
        width: 28px;
        height: 28px;
      }
    }

    /* o menu: um pedacinho de página de revista com as três vontades */
    :host(.com-menu) {
      z-index: 6;
    }
    .vontade-menu {
      position: absolute;
      top: calc(100% + 4px);
      display: grid;
      gap: 8px;
      padding: 10px 12px 12px;
      border-radius: 2px;
      background: #fdfcf9;
      color: var(--ink);
      box-shadow: var(--shadow-lift);
      rotate: calc(var(--tilt) * -1deg);
      animation: menu-in var(--t-ui) var(--ease-ui);
    }
    .quina-0 .vontade-menu,
    .quina-3 .vontade-menu {
      left: 4px;
    }
    .quina-1 .vontade-menu,
    .quina-2 .vontade-menu {
      right: 4px;
    }
    .quina-2 .vontade-menu,
    .quina-3 .vontade-menu {
      top: auto;
      bottom: calc(100% + 4px);
    }
    @keyframes menu-in {
      from {
        opacity: 0;
        translate: 0 -4px;
      }
    }
    .vontade-titulo {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.72rem;
      letter-spacing: 0.14em;
      line-height: 1;
      text-transform: uppercase;
      color: var(--ink-2);
      white-space: nowrap;
    }
    .vontade-opcoes {
      display: flex;
      align-items: center;
      gap: 4px;
    }
    .opcao {
      display: grid;
      place-items: center;
      min-width: 44px;
      min-height: 52px;
      padding: 2px 3px;
      border: 0;
      border-radius: 3px;
      background: none;
      cursor: pointer;
      transition:
        translate var(--t-ui) var(--ease-ui),
        opacity var(--t-ui) var(--ease-ui),
        filter var(--t-ui) var(--ease-ui);
    }
    /* como as capas: as não escolhidas ficam apagadas, a escolhida salta */
    .opcao:not(.on) {
      opacity: 0.62;
      filter: saturate(0.6);
    }
    .opcao:hover {
      opacity: 1;
      filter: none;
    }
    .opcao.on {
      translate: 0 -2px;
    }
    .opcao:focus-visible {
      outline: 2px dashed var(--ink);
      outline-offset: 1px;
    }

    /* chegando na parede: o adesivo é o último a ser colado, com um tapa */
    :host(.is-landing) .adesivo {
      animation: tapa 300ms 980ms var(--ease-physical) both;
    }
    @keyframes tapa {
      0% {
        scale: 1.4;
        opacity: 0;
      }
    }
  `,
})
export class WishClip {
  readonly wish = input.required<Wish>();
  readonly landing = input(false);
  /** A prévia do diálogo de adicionar: sem botão, quase reta. */
  readonly preview = input(false);
  readonly opened = output<string>();
  /** Escolheu outra vontade no adesivo. */
  readonly relevance = output<Relevance>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  protected readonly StickerIcon = Sticker;
  protected readonly options = RELEVANCES;
  protected readonly menu = signal(false);
  protected readonly rel = computed(() => relevanceOf(this.wish()));
  protected readonly label = computed(() => relevanceLabel(this.wish().kind, this.rel()));

  protected readonly styles = CUTOUT_STYLES;
  /** A capa que não abriu (a prévia troca de capa: outra pode abrir). */
  protected readonly failed = signal<string | null>(null);
  protected readonly initial = computed(() => initialOf(this.wish().game.name));

  protected readonly tear = computed(() => tearFor(this.wish().id));
  protected readonly ratio = computed(() => SHAPE_RATIO[this.tear().shape]);
  protected readonly look = computed(() => titleFor(this.wish().id, this.wish().game.name, this.tear()));
  protected readonly spot = computed(() => `${this.look().place} ${this.look().side}`);
  protected readonly place = computed(() => placeFor(this.wish().id));
  /** Colado, não pregado: entorta menos que a cartolina. */
  protected readonly tilt = computed(() => Math.round(pinningFor(this.wish().id).tilt * 7) / 10);
  protected readonly strip = computed(() => stripFor(this.wish().id));
  protected readonly sticker = computed(() => stickerFor(this.wish().id, this.tear(), this.look()));

  protected labelOf(r: Relevance): string {
    return relevanceLabel(this.wish().kind, r);
  }

  protected toggleMenu(): void {
    const open = !this.menu();
    this.menu.set(open);
    if (open) setTimeout(() => this.host.nativeElement.querySelector<HTMLElement>('.opcao.on')?.focus());
  }

  protected closeMenu(e?: Event): void {
    if (!this.menu()) return;
    e?.stopPropagation();
    this.menu.set(false);
    this.host.nativeElement.querySelector<HTMLElement>('.adesivo-btn')?.focus();
  }

  protected pick(r: Relevance): void {
    this.menu.set(false);
    if (r !== this.rel()) this.relevance.emit(r);
    else this.host.nativeElement.querySelector<HTMLElement>('.adesivo-btn')?.focus();
  }

  /** Clicou fora do recorte com o menu aberto: fecha, sem roubar o foco de onde a pessoa clicou. */
  protected onOutside(e: PointerEvent): void {
    if (this.menu() && !this.host.nativeElement.contains(e.target as Node)) this.menu.set(false);
  }

  /** Um id de SVG só deste recorte (a prévia e o mural podem estar na tela juntos). */
  protected gid(name: string): string {
    return `dobra-${name}-${this.uid}`;
  }
  private readonly uid = `${Math.random().toString(36).slice(2, 8)}`;

  /** O verso da página: do mesmo papel da revista, um tico mais cinza (a luz vem pela frente). */
  protected readonly backPaper = computed(() => ({ brilho: '#ece7dc', velha: '#e2d4b2', reticula: '#e6e1d5' })[this.tear().print]);

  /**
   * A luz do verso, do vinco até a ponta: achatada, escura rente à dobra e clara na ponta; em rolo,
   * um brilho no alto da curva e a sombra por baixo dela.
   */
  protected readonly stops = computed<[number, string, number][]>(() =>
    this.tear().fold?.style === 'curva'
      ? [
          [0, '#000000', 0.3],
          [0.18, '#ffffff', 0.7],
          [0.45, '#ffffff', 0.1],
          [0.8, '#000000', 0.22],
          [1, '#000000', 0.45],
        ]
      : [
          [0, '#000000', 0.2],
          [0.3, '#000000', 0.04],
          [1, '#ffffff', 0.28],
        ],
  );
}
