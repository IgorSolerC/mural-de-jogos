import { ChangeDetectionStrategy, Component, computed, effect, inject, input, signal, untracked } from '@angular/core';
import { ICON, IconModule } from './icons';
import { ZoomKnob } from './zoom-knob';
import { pieceLift } from './piece-lift';
import { Clock } from '../core/clock';
import { CountdownLook, Remaining, When, everyText, readCountdown, remaining, repeats, targetOf } from '../core/widgets';
import { cap } from '../core/text';
import { DAY_MS, MONTHS_LONG, MONTHS_SHORT } from '../core/dates';

const WEEKDAYS = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

type Unit = 'days' | 'hours' | 'minutes' | 'seconds';
const UNIT_NAMES: Record<Unit, [string, string]> = {
  days: ['dia', 'dias'],
  hours: ['hora', 'horas'],
  minutes: ['minuto', 'minutos'],
  seconds: ['segundo', 'segundos'],
};
const UNIT_SHORT: Record<Unit, string> = { days: 'd', hours: 'h', minutes: 'min', seconds: 's' };
/** Embaixo dos números do neon e do placar. */
const UNIT_BOARD: Record<Unit, [string, string]> = { days: ['dia', 'dias'], hours: ['hora', 'horas'], minutes: ['min', 'min'], seconds: ['seg', 'seg'] };
const ORDER: Unit[] = ['days', 'hours', 'minutes', 'seconds'];

const pad = (n: number) => String(n).padStart(2, '0');
const plural = (n: number, u: Unit) => `${n} ${UNIT_NAMES[u][n === 1 ? 0 : 1]}`;

/**
 * Os sete segmentos de um algarismo de relógio digital (a, b, c, d, e, f, g), num desenho de 12 × 20:
 * cada um é um sextavado comprido, com uma folga nas pontas, como nos mostradores de verdade.
 */
const H = (x1: number, x2: number, y: number) => `${x1},${y} ${x1 + 1},${y - 1} ${x2 - 1},${y - 1} ${x2},${y} ${x2 - 1},${y + 1} ${x1 + 1},${y + 1}`;
const V = (x: number, y1: number, y2: number) => `${x},${y1} ${x + 1},${y1 + 1} ${x + 1},${y2 - 1} ${x},${y2} ${x - 1},${y2 - 1} ${x - 1},${y1 + 1}`;
const SEGMENTS = [H(1.6, 10.4, 1.2), V(10.8, 1.6, 9.6), V(10.8, 10.4, 18.4), H(1.6, 10.4, 18.8), V(1.2, 10.4, 18.4), V(1.2, 1.6, 9.6), H(1.6, 10.4, 10)];
const LIT: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
/** Quais dos sete ficam acesos em cada algarismo. */
const DIGIT_SEGMENTS: Record<string, boolean[]> = Object.fromEntries(Object.entries(LIT).map(([d, on]) => [d, [...'abcdefg'].map((k) => on.includes(k))]));

/** Um pedaço do mostrador do neon e do placar: os algarismos de uma unidade e o nome dela embaixo. */
interface BoardGroup {
  text: string;
  label: string;
}
/** Uma plaquinha do placar: a que está à mostra e a de antes (diferentes enquanto ela vira). */
interface Flap {
  id: string;
  cur: string;
  old: string;
}

/**
 * O widget CONTADOR (ver core/widgets.ts), em quatro jeitos (o parâmetro "neon", "placar" ou
 * "riscado"; sem ele, o calendário). Todos contam em dias até o último: com menos de um dia, a conta
 * é "0 dias" (e as horas aparecem ao lado), para vários contadores juntos falarem sempre a mesma
 * unidade.
 *
 * - Calendário: um bloquinho de mesa, desses de destacar. O papelão diz "Faltam", a folha tem os dias
 *   e, quando o número muda, a de antes é arrancada e cai. Ao lado, só para quê é e o dia.
 * - Neon: o letreiro de relógio digital, num tubo azul: dias, horas, minutos e segundos nos sete
 *   segmentos vermelhos (os apagados aparecem de leve, como num mostrador de verdade).
 * - Placar: o quadro de plaquinhas que viram, de estação e aeroporto; cada algarismo que muda vira a
 *   plaquinha de cima para baixo.
 * - Riscado: um bloquinho adesivo onde a conta é escrita à caneta, com os números dos dias de antes
 *   riscados de vermelho ao lado do de hoje.
 *
 * Chegou: o calendário vira a folha daquele dia com o carimbo "Chegou!" ("É hoje!" no que se repete,
 * "É agora!" no de todo dia); o neon acende a palavra; o placar a soletra nas plaquinhas; no riscado
 * ela é escrita e circulada à caneta.
 */
@Component({
  selector: 'app-countdown',
  imports: [IconModule, ZoomKnob],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (state(); as s) {
      <div #contador class="contador amplia" data-zoom-max="2.5" [class]="'jeito-' + s.look" [class.chegou]="s.r.past" role="timer" [attr.aria-label]="spoken()">
        @switch (s.look) {
          @case ('neon') {
            <div class="neon" data-colado [style.--celas]="s.cells" aria-hidden="true">
              <div class="placa-topo">
                <span class="placa-nome">{{ s.title || s.name }}</span>
                @if (s.when || s.soon) {
                  <span class="placa-quando">{{ s.past1 ? 'Foi em ' : '' }}{{ s.when }}{{ s.soon && s.when ? ' · ' : '' }}{{ s.soon }}</span>
                }
              </div>
              @if (s.r.past) {
                <span class="neon-palavra">{{ s.stamp }}</span>
                @if (s.agoShort) {
                  <span class="placa-unid">{{ s.agoShort }}</span>
                }
              } @else {
                <div class="neon-mostrador">
                  @for (g of s.groups; track $index; let last = $last) {
                    <span class="placa-grupo">
                      <span class="neon-algs">
                        @for (d of g.text; track $index) {
                          <svg class="seg" viewBox="0 0 12 20">
                            @for (on of segmentsOf(d); track $index) {
                              <polygon [attr.points]="SEGMENTS[$index]" [class.aceso]="on" />
                            }
                          </svg>
                        }
                      </span>
                      <span class="placa-unid">{{ g.label }}</span>
                    </span>
                    @if (!last) {
                      <span class="neon-pontos"><i></i><i></i></span>
                    }
                  }
                </div>
              }
            </div>
          }
          @case ('placar') {
            <div class="placar" data-colado [style.--celas]="s.cells" aria-hidden="true">
              <div class="placa-topo">
                <span class="placa-nome">{{ s.title || s.name }}</span>
                @if (s.when || s.soon) {
                  <span class="placa-quando">{{ s.past1 ? 'Foi em ' : '' }}{{ s.when }}{{ s.soon && s.when ? ' · ' : '' }}{{ s.soon }}</span>
                }
              </div>
              <div class="placar-mostrador">
                @for (g of board(); track $index) {
                  <span class="placa-grupo">
                    <span class="placar-celas">
                      @for (c of g.cells; track c.id) {
                        <span class="cela" [class.vira]="c.cur !== c.old">
                          <span class="meia cima"><span class="letra">{{ c.cur }}</span></span>
                          <span class="meia baixo"><span class="letra">{{ c.cur }}</span></span>
                          @if (c.cur !== c.old) {
                            <span class="meia baixo velha"><span class="letra">{{ c.old }}</span></span>
                            <span class="meia baixo sobe"><span class="letra">{{ c.cur }}</span></span>
                            <span class="meia cima cai"><span class="letra">{{ c.old }}</span></span>
                          }
                        </span>
                      }
                    </span>
                    @if (g.label) {
                      <span class="placa-unid">{{ g.label }}</span>
                    }
                  </span>
                }
              </div>
              @if (s.r.past && s.agoShort) {
                <span class="placa-unid placar-ha">{{ s.agoShort }}</span>
              }
            </div>
          }
          @default {
            @if (s.look === 'riscado') {
              <div class="recado" data-colado aria-hidden="true">
                <span class="recado-falta">{{ s.r.past ? '' : s.big.n === 1 ? 'falta' : 'faltam' }}</span>
                <span class="recado-conta">
                  @for (p of s.crossed; track p; let i = $index) {
                    <span class="riscado" [class.outro]="i % 2 === 1">{{ p }}</span>
                  }
                  @if (s.r.past) {
                    <span class="recado-palavra">{{ s.stamp }}</span>
                  } @else {
                    <span class="recado-num">{{ s.big.text }}</span>
                  }
                </span>
                <span class="recado-unid">{{ s.r.past ? '' : s.big.unit }}</span>
              </div>
            } @else {
              <div class="bloco" data-colado aria-hidden="true">
                <span class="papelao">{{ s.r.past ? s.month : s.big.n === 1 ? 'Falta' : 'Faltam' }}</span>
                <span class="folhas">
                  <span class="folha" [class.longo]="s.big.text.length === 3" [class.longuissimo]="s.big.text.length > 3">
                    <span class="num">{{ s.big.text }}</span>
                    <span class="unid">{{ s.big.unit }}</span>
                  </span>
                  @if (fallen(); as f) {
                    <!-- a folha de antes, arrancada: cai na frente da nova -->
                    <span class="folha caindo" [class.longo]="f.text.length === 3" [class.longuissimo]="f.text.length > 3" (animationend)="fallen.set(null)">
                      <span class="num">{{ f.text }}</span>
                      <span class="unid">{{ f.unit }}</span>
                    </span>
                  }
                </span>
                @if (s.r.past) {
                  <span class="carimbo">{{ s.stamp }}</span>
                }
              </div>
            }
            <div class="lado" aria-hidden="true">
              <span class="nome">{{ s.title || s.name }}</span>
              <span class="quando">
                @if (s.past1) {
                  Foi em
                }
                {{ s.when }}
                @if (s.soon) {
                  <span class="logo">{{ s.soon }}</span>
                }
              </span>
              @if (s.r.past) {
                <span class="resto passado">{{ s.ago }}</span>
              } @else if (s.rest.length) {
                <!-- menos de um dia: as horas que faltam, andando -->
                <span class="resto">
                  @for (p of s.rest; track p.u) {
                    <span class="peca"><span class="n">{{ p.n }}</span><span class="u">{{ p.u }}</span></span>
                  }
                </span>
              }
            </div>
          }
        }
        <!-- o broche de ampliar, no canto de cima do quadro (fora dele: o quadro é aria-hidden), metade
             para fora, como o alto-falante da tira: o contador sobe para o meio da tela, andando -->
        <app-zoom-knob class="ampliar" [label]="'Ampliar o contador' + (s.title || s.name ? ': ' + (s.title || s.name) : '')" (pressed)="lift.toggle(contador)" />
      </div>
    } @else {
      <!-- sem uma data que exista: o contador em branco diz como escrever -->
      <div class="contador quebrado" role="note">
        <span class="vazio-icone" aria-hidden="true"><lucide-icon [img]="EmptyIcon" [size]="22" aria-hidden="true" /></span>
        <span class="lado">
          <span class="nome">Contador sem data</span>
          <span class="dica">
            @if (broken(); as b) {
              “{{ b }}” não é um dia que ele entenda.
            }
            Escreva assim: <code>19/11/2026 18:00</code>
          </span>
        </span>
      </div>
    }
  `,
  styles: `
    :host {
      /* a peça tem a altura do tamanho (ver note-widget.ts), em linhas inteiras da pauta: o texto de
         baixo continua em cima das linhas azuis */
      min-height: var(--widget-alto, calc(var(--line, 1.5em) * 4));
      container-type: inline-size;
      display: flex;
      align-items: center;
      white-space: normal;
    }
    .contador {
      position: relative;
      display: flex;
      align-items: center;
      gap: 0.85em;
      min-width: 0;
      max-width: 100%;
    }
    /* o broche de ampliar (ui/zoom-knob.ts), no canto de cima do quadro desenhado (o bloquinho, o
       recado, a placa), metade para fora dele, como o alto-falante da tira: o nome e os números
       ficam à mostra. O quadro é aria-hidden, então o broche fica fora dele e se prende no canto
       dele pela âncora; sem âncora no navegador, no canto do contador */
    .ampliar {
      position: absolute;
      z-index: 3;
      top: -11px;
      right: -11px;
    }
    @supports (anchor-name: --quadro) {
      .contador {
        anchor-scope: --quadro;
      }
      :is(.bloco, .recado, .neon, .placar) {
        anchor-name: --quadro;
      }
      .ampliar {
        position-anchor: --quadro;
        top: calc(anchor(top) - 11px);
        right: auto;
        left: calc(anchor(right) - 19px);
      }
    }

    /* ===== Calendário: papelão vermelho em cima, as folhas embaixo =====
       Tudo dentro dele mede em em: com as margens, ele tem 5,35em de alto, e a letra dele é a que
       faz essa altura dar a do tamanho */
    .bloco {
      /* (numa linha estreita, até 45% dela: o lado escrito precisa de lugar) */
      font-size: min(calc(var(--widget-alto, 5.35em) / 5.35), calc(100cqw * 0.45 / 4.4));
      position: relative;
      isolation: isolate;
      flex: none;
      display: grid;
      width: 4.4em;
      margin: 0.35em 0 0.55em 0.15em;
      rotate: -2.2deg;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.28)) drop-shadow(0 4px 5px rgb(0 0 0 / 0.2));
    }
    .papelao {
      position: relative;
      z-index: 2;
      display: block;
      padding: 0.4em 0.2em 0.32em;
      border-radius: 2px 2px 0 0;
      background:
        linear-gradient(rgb(255 255 255 / 0.12), transparent 40%),
        #a51c1b;
      color: #fbf6ea;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.6em;
      line-height: 1;
      letter-spacing: 0.14em;
      text-align: center;
      text-transform: uppercase;
      box-shadow: inset 0 -1px 0 rgb(0 0 0 / 0.25);
    }
    /* as folhas: a da frente e duas embaixo dela, que aparecem só na beirada (o bloco é grosso) */
    .folhas {
      position: relative;
      display: grid;
    }
    .folhas::before,
    .folhas::after {
      content: '';
      position: absolute;
      inset: 0;
      z-index: -1;
      border-radius: 0 0 2px 2px;
      background: #ece5d4;
      translate: 0.5px 2.5px;
      rotate: 0.8deg;
    }
    .folhas::after {
      z-index: -2;
      background: #ddd4bf;
      translate: -0.5px 5px;
      rotate: -1deg;
    }
    .folha {
      grid-area: 1 / 1;
      display: grid;
      justify-items: center;
      align-content: center;
      padding: 0.22em 0.15em 0.34em;
      border-radius: 0 0 2px 2px;
      background: #fffdf6;
      color: #151515;
      /* o picote de destacar, logo embaixo do papelão */
      border-top: 1.5px dotted rgb(21 21 21 / 0.3);
    }
    .num {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 2.15em;
      line-height: 1;
      letter-spacing: -0.02em;
      font-variant-numeric: tabular-nums;
    }
    .longo .num {
      font-size: 1.75em;
      line-height: 1.15;
    }
    .longuissimo .num {
      font-size: 1.38em;
      line-height: 1.45;
    }
    .unid {
      margin-top: 0.1em;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.58em;
      line-height: 1;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #6d2321;
    }

    /* ===== A folha arrancada: dobra no picote de cima e cai, girando ===== */
    .caindo {
      z-index: 1;
      transform-origin: 85% 0;
      animation: arranca 620ms cubic-bezier(0.5, 0, 0.75, 0) forwards;
      pointer-events: none;
    }
    @keyframes arranca {
      0% {
        transform: none;
        opacity: 1;
      }
      30% {
        transform: rotate(-7deg) translateY(1px);
        opacity: 1;
      }
      100% {
        transform: rotate(-24deg) translate(-0.6em, 2.6em);
        opacity: 0;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .caindo {
        display: none;
      }
    }

    /* ===== Chegou: a folha do dia, com o carimbo vermelho torto por cima ===== */
    .carimbo {
      position: absolute;
      left: 50%;
      top: 58%;
      z-index: 4;
      padding: 0.16em 0.32em 0.12em;
      translate: -50% -50%;
      rotate: -16deg;
      border: 2px solid rgb(184 29 28 / 0.88);
      border-radius: 3px;
      color: rgb(184 29 28 / 0.92);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.66em;
      line-height: 1;
      letter-spacing: 0.08em;
      text-transform: uppercase;
      white-space: nowrap;
      background: rgb(255 253 246 / 0.7);
      /* a tinta do carimbo falha um pouco, como borracha de verdade */
      -webkit-mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='24'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 1.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E");
      mask: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' width='60' height='24'%3E%3Cfilter id='f'%3E%3CfeTurbulence type='fractalNoise' baseFrequency='.9' numOctaves='2' seed='7'/%3E%3CfeColorMatrix values='0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 0 -2.4 1.9'/%3E%3C/filter%3E%3Crect width='100%25' height='100%25' filter='url(%23f)'/%3E%3C/svg%3E");
      animation: carimba 420ms var(--ease-physical) both;
    }
    @keyframes carimba {
      from {
        opacity: 0;
        scale: 1.5;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .carimbo {
        animation: none;
      }
    }
    /* o dia que passou fica apagado embaixo do carimbo, que é o que se lê */
    .chegou .num,
    .chegou .unid {
      opacity: 0.3;
    }

    /* ===== Riscado: o bloquinho adesivo com a conta à caneta =====
       Mede em em, como o calendário: 4,7em de alto com as margens */
    .recado {
      font-size: min(calc(var(--widget-alto, 4.7em) / 4.7), calc(100cqw * 0.5 / 5.4));
      position: relative;
      flex: none;
      display: grid;
      justify-items: center;
      align-content: center;
      min-width: 4.3em;
      min-height: 4.1em;
      margin: 0.25em 0 0.35em 0.15em;
      padding: 0.3em 0.5em 0.4em;
      rotate: 1.6deg;
      color: #151515;
      /* o papel amarelo de bloquinho adesivo, um pouco mais escuro no pé, onde ele descola */
      background:
        linear-gradient(172deg, rgb(255 255 255 / 0.22), transparent 38%),
        linear-gradient(to bottom, transparent 70%, rgb(150 110 0 / 0.08)),
        #fbe46f;
      border-radius: 1px 1px 2px 14px / 1px 1px 2px 4px;
      /* colado só em cima: o pé descola e faz mais sombra */
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.16),
        0 0.35em 0.4em -0.22em rgb(0 0 0 / 0.38);
    }
    /* a faixa de cola em cima, um pouco mais lisa */
    .recado::before {
      content: '';
      position: absolute;
      inset: 0 0 auto;
      height: 0.55em;
      background: linear-gradient(rgb(255 255 255 / 0.18), rgb(255 255 255 / 0.05));
      pointer-events: none;
    }
    .recado-falta,
    .recado-unid {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 0.62em;
      line-height: 1.15;
      min-height: 1.15em;
    }
    .recado-falta {
      justify-self: start;
      rotate: -3deg;
    }
    .recado-unid {
      justify-self: end;
      rotate: -2deg;
    }
    .recado-conta {
      display: flex;
      align-items: baseline;
      gap: 0.34em;
    }
    .recado-num {
      font-family: var(--f-marker);
      font-size: 2.1em;
      line-height: 1;
      font-variant-numeric: tabular-nums;
      rotate: -3deg;
    }
    /* os de antes, mais pequenos e riscados de vermelho, cada um de um jeito */
    .riscado {
      position: relative;
      font-family: var(--f-marker);
      font-size: 0.9em;
      line-height: 1;
      color: rgb(21 21 21 / 0.55);
      rotate: 4deg;
    }
    .riscado::after {
      content: '';
      position: absolute;
      inset: 22% -8% 16%;
      background: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 20' preserveAspectRatio='none'%3E%3Cpath d='M2 15 34 5M5 17 32 9' fill='none' stroke='%23e62e2d' stroke-width='2.4' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E")
        center / 100% 100% no-repeat;
    }
    .riscado.outro {
      rotate: -5deg;
    }
    .riscado.outro::after {
      background-image: url("data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 36 20' preserveAspectRatio='none'%3E%3Cpath d='M2 12c8-4 22 2 32-3M3 14c10-3 19 0 30-2' fill='none' stroke='%23e62e2d' stroke-width='2.6' stroke-linecap='round' vector-effect='non-scaling-stroke'/%3E%3C/svg%3E");
    }
    /* chegou: a palavra escrita e circulada à caneta */
    .recado-palavra {
      position: relative;
      padding: 0.25em 0.3em;
      font-family: var(--f-marker);
      font-size: 1.05em;
      line-height: 1;
      white-space: nowrap;
      rotate: -4deg;
    }
    .recado-palavra::before {
      content: '';
      position: absolute;
      inset: -0.1em -0.18em;
      background: var(--circulo-caneta) center / 100% 100% no-repeat;
    }

    /* ===== Ao lado do calendário e do riscado, na tinta da ficha: para quê e o dia ===== */
    /* (a letra de apoio cresce pouco com o tamanho, ver note-widget.ts) */
    .lado {
      display: grid;
      align-content: center;
      gap: 0.18em;
      min-width: 0;
      font-size: calc(1em * var(--letra-tam, 1));
    }
    .nome {
      display: -webkit-box;
      overflow: hidden;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      font-family: var(--f-marker);
      font-size: 1.08em;
      line-height: 1.12;
      overflow-wrap: anywhere;
      text-wrap: balance;
    }
    .quando {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.74em;
      line-height: 1.25;
      letter-spacing: 0.06em;
      text-transform: uppercase;
      opacity: 0.86;
    }
    .quando:empty {
      display: none;
    }
    /* "é hoje!", "amanhã!": escrito à mão do lado, meio torto */
    .logo {
      display: inline-block;
      margin-left: 0.35em;
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.32em;
      line-height: 1;
      letter-spacing: 0;
      text-transform: none;
      rotate: -4deg;
    }
    .resto {
      display: flex;
      flex-wrap: wrap;
      align-items: baseline;
      gap: 0 0.42em;
      font-family: var(--f-label);
      font-weight: 800;
      line-height: 1.15;
      font-variant-numeric: tabular-nums;
    }
    .peca .n {
      font-size: 1.12em;
    }
    .peca .u {
      margin-left: 0.08em;
      font-size: 0.72em;
      letter-spacing: 0.04em;
      text-transform: uppercase;
      opacity: 0.82;
    }
    .resto.passado {
      font-family: var(--f-hand);
      font-weight: 400;
      font-size: 0.95em;
    }

    /* ===== O neon e o placar: uma placa só, com o nome em cima e os números embaixo =====
       Medem em em: a altura da placa (--alto, com as margens) dá a letra; numa linha estreita, a
       largura (que depende de quantos algarismos ela tem, --celas) encolhe tudo junto */
    .neon,
    .placar {
      --alto: 5.2;
      --largo: calc(var(--celas, 8) * 1.36 + 3.3);
      font-size: min(calc(var(--widget-alto, 5.2em) / var(--alto)), calc(100cqw / var(--largo)));
      position: relative;
      flex: none;
      display: grid;
      justify-items: center;
      align-content: center;
      gap: 0.22em;
      max-width: 100%;
      margin: 0.25em 0.1em 0.35em;
      padding: 0.42em 0.62em 0.44em;
    }
    .placa-topo {
      display: flex;
      align-items: baseline;
      justify-content: space-between;
      gap: 0.3em 0.8em;
      width: 100%;
      min-width: 0;
    }
    .placa-nome {
      min-width: 0;
      overflow: hidden;
      white-space: nowrap;
      text-overflow: ellipsis;
    }
    .placa-quando {
      flex: none;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.42em;
      line-height: 1;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      white-space: nowrap;
    }
    .placa-grupo {
      display: grid;
      justify-items: center;
      gap: 0.12em;
    }
    .placa-unid {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.36em;
      line-height: 1;
      letter-spacing: 0.16em;
      text-transform: uppercase;
    }
    /* no mini não cabem a linha dos nomes nem o dia: ficam o título e os números */
    :host-context(.tam-mini) .neon,
    :host-context(.tam-mini) .placar {
      --alto: 4.3;
    }
    :host-context(.tam-mini) .placa-grupo .placa-unid,
    :host-context(.tam-mini) .placa-quando {
      display: none;
    }

    /* ===== Neon: o tubo azul em volta, os sete segmentos vermelhos ===== */
    .neon {
      border-radius: 0.42em;
      color: #ffe3f6;
      background:
        radial-gradient(120% 90% at 50% 40%, rgb(40 30 90 / 0.55), transparent 70%),
        linear-gradient(#0d0f22, #070812);
      /* o tubo: o miolo claro, o brilho dele no escuro e, por fora, a sombra da placa na anotação */
      border: 0.11em solid #b8f6ff;
      box-shadow:
        0 0 0.08em #4fdcff,
        0 0 0.45em rgb(25 184 255 / 0.85),
        inset 0 0 0.08em #4fdcff,
        inset 0 0 0.55em rgb(25 184 255 / 0.5),
        0 0.18em 0.3em 0.05em rgb(0 0 0 / 0.42);
    }
    .neon .placa-nome {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 0.62em;
      line-height: 1.1;
      color: #fff0fb;
      text-shadow:
        0 0 0.08em #ff6be0,
        0 0 0.35em rgb(255 60 210 / 0.8);
    }
    .neon .placa-quando,
    .neon .placa-unid {
      color: #9ff0ff;
      text-shadow: 0 0 0.4em rgb(40 200 255 / 0.7);
    }
    .neon-mostrador {
      display: flex;
      align-items: flex-start;
      gap: 0.16em;
      /* os algarismos dos relógios digitais são um pouco deitados */
      transform: skewX(-6deg);
    }
    .neon-algs {
      display: flex;
      gap: 0.12em;
      filter: drop-shadow(0 0 0.04em #ff2a3d) drop-shadow(0 0 0.22em rgb(255 30 60 / 0.75));
    }
    .seg {
      display: block;
      width: 1.12em;
      height: 1.86em;
      overflow: visible;
    }
    .seg polygon {
      fill: rgb(255 70 85 / 0.08);
    }
    .seg polygon.aceso {
      fill: #ff4a5a;
    }
    .neon-pontos {
      display: grid;
      align-content: center;
      gap: 0.5em;
      height: 1.86em;
      padding: 0 0.04em;
    }
    .neon-pontos i {
      width: 0.16em;
      height: 0.16em;
      border-radius: 1px;
      background: #ff4a5a;
      box-shadow: 0 0 0.2em rgb(255 30 60 / 0.9);
      animation: pisca 1s steps(1) infinite;
    }
    @keyframes pisca {
      50% {
        opacity: 0.18;
      }
    }
    .neon-palavra {
      font-family: var(--f-hand);
      font-weight: 700;
      font-size: 1.55em;
      line-height: 1.2;
      white-space: nowrap;
      color: #fff2f4;
      text-shadow:
        0 0 0.05em #ff2a3d,
        0 0 0.25em rgb(255 30 60 / 0.9),
        0 0 0.6em rgb(255 30 60 / 0.55);
      animation: acende 900ms steps(1) both;
    }
    /* o tubo novo acende engasgando */
    @keyframes acende {
      0%,
      12%,
      30% {
        opacity: 0.15;
      }
      8%,
      22%,
      40% {
        opacity: 1;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .neon-pontos i,
      .neon-palavra {
        animation: none;
      }
    }

    /* ===== Placar: as plaquinhas pretas com a dobradiça no meio ===== */
    .placar {
      border-radius: 0.3em;
      color: #f1ece0;
      background:
        linear-gradient(rgb(255 255 255 / 0.06), transparent 30%),
        #1b1b1e;
      box-shadow:
        inset 0 0 0 0.05em rgb(255 255 255 / 0.07),
        0 1px 1px rgb(0 0 0 / 0.3),
        0 0.18em 0.32em rgb(0 0 0 / 0.38);
    }
    .placar .placa-nome {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.5em;
      line-height: 1.15;
      letter-spacing: 0.08em;
      text-transform: uppercase;
    }
    .placar .placa-quando {
      color: #f6c64a;
    }
    .placar .placa-unid {
      color: #b9b3a5;
    }
    .placar-mostrador {
      display: flex;
      gap: 0.3em;
    }
    .placar-celas {
      display: flex;
      gap: 0.07em;
    }
    .cela {
      position: relative;
      width: 1.22em;
      height: 1.86em;
      perspective: 4em;
      font-family: var(--f-label);
      font-weight: 600;
      font-variant-numeric: tabular-nums;
    }
    .meia {
      position: absolute;
      left: 0;
      right: 0;
      height: 50%;
      overflow: hidden;
      background: #2b2b2f;
      backface-visibility: hidden;
    }
    .meia.cima {
      top: 0;
      border-radius: 0.1em 0.1em 0 0;
      transform-origin: bottom;
      background: linear-gradient(#323236, #2a2a2e);
    }
    .meia.baixo {
      bottom: 0;
      border-radius: 0 0 0.1em 0.1em;
      transform-origin: top;
      background: linear-gradient(#262629, #2d2d31);
    }
    /* a fresta da dobradiça, com os dois pinos nas pontas */
    .cela::after {
      content: '';
      position: absolute;
      inset: calc(50% - 0.025em) 0 auto;
      z-index: 4;
      height: 0.05em;
      background: #0b0b0c;
      box-shadow: 0 0.03em 0 rgb(255 255 255 / 0.06);
    }
    .letra {
      position: absolute;
      left: 0;
      right: 0;
      height: 200%;
      display: grid;
      place-items: center;
      font-size: 1.42em;
      line-height: 1;
    }
    .meia.baixo .letra {
      top: -100%;
    }
    .meia.cima .letra {
      top: 0;
    }
    /* virando: a de cima (a de antes) cai até deitar; depois a de baixo (a nova) desce até assentar */
    .velha {
      z-index: 1;
    }
    .sobe {
      z-index: 2;
      animation: sobe 520ms both;
    }
    .cai {
      z-index: 3;
      animation: cai 520ms both;
    }
    @keyframes cai {
      0% {
        transform: rotateX(0);
        animation-timing-function: cubic-bezier(0.55, 0, 0.9, 0.5);
      }
      50%,
      100% {
        transform: rotateX(-90deg);
      }
    }
    @keyframes sobe {
      0%,
      50% {
        transform: rotateX(90deg);
        animation-timing-function: cubic-bezier(0.2, 0.6, 0.35, 1.2);
      }
      100% {
        transform: rotateX(0);
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .velha,
      .sobe,
      .cai {
        display: none;
      }
    }
    .placar-ha {
      text-transform: none;
      letter-spacing: 0.06em;
    }

    /* ===== Sem data: o contorno tracejado de onde ele vai ficar ===== */
    .quebrado {
      gap: 0.7em;
      padding: 0.45em 0.8em 0.45em 0.6em;
      border: 2px dashed color-mix(in srgb, currentColor 45%, transparent);
      border-radius: 3px;
    }
    .vazio-icone {
      display: grid;
      opacity: 0.7;
    }
    .quebrado .nome {
      font-size: 0.98em;
    }
    .dica {
      font-family: var(--f-ui);
      font-size: 0.8em;
      line-height: 1.3;
      opacity: 0.86;
    }
    .dica code {
      font-family: var(--f-mono);
      font-weight: 700;
    }
  `,
})
export class Countdown {
  /** Os parâmetros como foram escritos no texto. */
  readonly args = input.required<readonly string[]>();

  protected readonly EmptyIcon = ICON.ampulheta;
  /** O contador no meio da tela (ui/piece-lift.ts). */
  protected readonly lift = pieceLift();
  protected readonly SEGMENTS = SEGMENTS;
  private readonly clock = inject(Clock);

  constructor() {
    this.clock.use();
    // o número da folha do calendário mudou: a de antes é arrancada (não na primeira vez, nem
    // trocando de contador ou de jeito)
    let last: { key: string; text: string; unit: string } | null = null;
    effect(() => {
      const s = this.state();
      const key = this.args().join('|');
      const now = s && !s.r.past && s.look === 'calendario' ? { key, text: s.big.text, unit: s.big.unit } : null;
      const prev = last;
      last = now;
      if (prev && now && prev.key === now.key && (prev.text !== now.text || prev.unit !== now.unit)) {
        untracked(() => this.fallen.set({ text: prev.text, unit: prev.unit }));
      }
    });
  }

  /** A folha que está caindo (a de antes). */
  protected readonly fallen = signal<{ text: string; unit: string } | null>(null);

  private readonly parsed = computed(() => readCountdown(this.args()));
  /** No contador sem data, o que está escrito no lugar dela (o primeiro parâmetro). */
  protected readonly broken = computed(() => this.args()[0] ?? '');

  protected readonly state = computed(() => {
    const { when, title, look } = this.parsed();
    if (!when) return null;
    const now = this.clock.now();
    const target = targetOf(when, now);
    const r = remaining(target, now);
    const at = new Date(target);
    const yearly = repeats(when);
    const big = this.bigOf(r, at);
    const dateShort = `${at.getDate()} ${MONTHS_SHORT[at.getMonth()]}` + (yearly ? '' : ` ${at.getFullYear()}`);
    const time = when.timed ? `${pad(when.hour)}:${pad(when.minute)}` : '';
    const stamp = when.every === 'dia' ? 'É agora!' : yearly ? 'É hoje!' : 'Chegou!';
    const groups = this.groupsOf(r);
    return {
      r,
      look,
      title,
      yearly,
      big,
      stamp,
      /** O de uma vez só, que já passou ("Foi em 19 nov 2026"). */
      past1: r.past && !yearly,
      month: MONTHS_SHORT[at.getMonth()],
      ...this.linesOf(when, !!title, dateShort, time),
      // só com menos de um dia: as horas, os minutos e os segundos que sobram
      rest: r.past || r.days > 0 ? [] : this.restOf(r),
      ago: r.past ? this.agoOf(r, when) : '',
      // no neon e no placar, chegou, só o "há 3 dias" do de uma vez (o resto o letreiro já diz)
      agoShort: r.past && !yearly ? this.agoOf(r, when) : '',
      // (o de todo dia é sempre hoje ou amanhã: dizer seria barulho)
      soon: r.past || when.every === 'dia' ? '' : this.soonOf(at, now),
      groups,
      flaps: r.past ? [{ text: stamp.replace(/!/g, '').toUpperCase(), label: '' }] : groups,
      cells: r.past ? stamp.replace(/!/g, '').length : groups.reduce((n, g) => n + g.text.length, 0),
      // os números dos dias de antes, riscados (os dois últimos; com três algarismos, só o último;
      // chegou, nenhum: a palavra circulada basta)
      crossed: r.past ? [] : big.n >= 99 ? [big.n + 1] : [big.n + 2, big.n + 1],
    };
  });

  /** As plaquinhas do placar, cada uma com a que estava antes: a que mudou vira. */
  private lastFlaps: string[] = [];
  protected readonly board = computed(() => {
    const s = this.state();
    if (!s || s.look !== 'placar') {
      this.lastFlaps = [];
      return [];
    }
    let i = 0;
    const groups = s.flaps.map((g) => ({
      label: g.label,
      cells: [...g.text].map((ch): Flap => {
        const k = i++;
        return { id: `${k}:${ch}`, cur: ch, old: this.lastFlaps[k] ?? ch };
      }),
    }));
    this.lastFlaps = groups.flatMap((g) => g.cells.map((c) => c.cur));
    return groups;
  });

  /** Os sete segmentos de um algarismo do neon. */
  protected segmentsOf(d: string): boolean[] {
    return DIGIT_SEGMENTS[d] ?? DIGIT_SEGMENTS['8'].map(() => false);
  }

  /**
   * O nome (sem título) e a linha do dia, ao lado do bloquinho. O de uma vez e o de todo ano: a data
   * ("19 nov 2026 · 18:00", "25 dez · todo ano"). O que se repete mais: a regra é o nome ("Toda
   * sexta"), e a linha diz o próximo ("24 out · 18:00"); o de todo dia, só a hora.
   */
  private linesOf(w: When, titled: boolean, dateShort: string, time: string): { name: string; when: string } {
    const join = (...parts: string[]) => parts.filter(Boolean).join(' · ');
    if (!w.every) return { name: dateShort, when: join(titled ? dateShort : '', time, w.year === null ? 'todo ano' : '') };
    const rule = everyText(w);
    const next = w.every === 'dia' ? '' : dateShort;
    return { name: cap(rule), when: join(titled ? rule : '', next, time) };
  }

  /** A folha: os dias que faltam (com menos de um, 0 dias); chegou, o dia do mês. */
  private bigOf(r: Remaining, at: Date): { n: number; text: string; unit: string } {
    if (r.past) return { n: at.getDate(), text: String(at.getDate()), unit: WEEKDAYS[at.getDay()] };
    return { n: r.days, text: String(r.days), unit: UNIT_NAMES.days[r.days === 1 ? 0 : 1] };
  }

  /** O que sobra do último dia, com dois algarismos: 07 h 23 min 12 s. */
  private restOf(r: Remaining): { n: string; u: string }[] {
    return ORDER.slice(1).map((k) => ({ n: pad(r[k]), u: UNIT_SHORT[k] }));
  }

  /** O mostrador do neon e do placar: dias (pelo menos dois algarismos), horas, minutos e segundos. */
  private groupsOf(r: Remaining): BoardGroup[] {
    return ORDER.map((k) => ({ text: pad(r[k]), label: UNIT_BOARD[k][r[k] === 1 ? 0 : 1] }));
  }

  private agoOf(r: Remaining, w: When): string {
    if (w.every === 'dia') return 'Agora. Daqui a pouco volta a contar para amanhã.';
    if (w.every === 'semana') return 'Hoje. Amanhã volta a contar para a semana que vem.';
    if (w.every === 'mes') return 'Hoje. Amanhã volta a contar para o mês que vem.';
    if (w.year === null) return 'Hoje. Amanhã volta a contar para o ano que vem.';
    const u = ORDER.find((k) => r[k] > 0 && k !== 'seconds');
    return u ? `há ${plural(r[u], u)}` : 'agora há pouco';
  }

  /** "é hoje!" e "amanhã!", pelo dia do calendário (não pelas 24 horas). */
  private soonOf(at: Date, now: number): string {
    const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime();
    const diff = Math.round((day(at) - day(new Date(now))) / DAY_MS);
    return diff === 0 ? 'é hoje!' : diff === 1 ? 'amanhã!' : '';
  }

  /** O que o leitor de tela diz: de minuto em minuto (não a cada segundo). */
  protected readonly spoken = computed(() => {
    const { when, title } = this.parsed();
    if (!when) return '';
    const now = Math.floor(this.clock.now() / 60_000) * 60_000;
    const target = targetOf(when, now);
    const r = remaining(target, now);
    const at = new Date(target);
    const hour = when.timed ? ` às ${pad(when.hour)}:${pad(when.minute)}` : '';
    const date = when.every === 'dia' ? `hoje${hour}` : `${at.getDate()} de ${MONTHS_LONG[at.getMonth()]}` + (repeats(when) ? '' : ` de ${at.getFullYear()}`) + hour;
    const name = title ? `Contador: ${title}. ` : 'Contador. ';
    if (r.past) return name + (when.every === 'dia' ? `É agora, ${pad(when.hour)}:${pad(when.minute)}.` : repeats(when) ? `É hoje, ${date}.` : `Chegou em ${date}.`);
    const parts = ORDER.filter((k) => k !== 'seconds' && r[k] > 0)
      .slice(0, 2)
      .map((k) => plural(r[k], k));
    const left = parts.length ? parts.join(' e ') : 'menos de 1 minuto';
    // concorda com o primeiro, como o papelão: "Falta 1 dia e 3 horas", "Faltam 2 dias"
    const one = !parts.length || parts[0].startsWith('1 ');
    // o de todo dia: "até as 07:00 (todo dia)"; os outros, a data e a regra
    const until = when.every === 'dia' ? `as ${pad(when.hour)}:${pad(when.minute)}` : date;
    return `${name}${one ? 'Falta' : 'Faltam'} ${left}, até ${until}${repeats(when) ? ` (${everyText(when)})` : ''}.`;
  });
}
