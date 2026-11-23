import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { MONTHS_SHORT, parseDay } from '../core/dates';
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

/** O dia da semana por extenso ("domingo"). */
const weekdayFmt = new Intl.DateTimeFormat('pt-BR', { weekday: 'long' });

/**
 * O Calendário: a folhinha de mesa, com o mês na tinta violeta do carimbo do logo, o dia de hoje e o dia da semana.
 * Um adesivo amarelo diz quantos lembretes hoje tem (sem lembrete, sem adesivo).
 */
@Component({
  selector: 'app-desk-calendar',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="argolas"><i></i><i></i></span>
    <span class="mes">{{ month() }}</span>
    <span class="dia">{{ dayNumber() }}</span>
    <span class="semana">{{ weekday() }}</span>
    @if (count()) {
      <span class="adesivo">{{ count() }}</span>
    }
  `,
  styles: `
    :host {
      position: relative;
      display: grid;
      justify-items: center;
      width: 96px;
      padding: 0 0 10px;
      border-radius: 3px;
      background: var(--paper-grain), #fbfaf5;
      background-blend-mode: multiply;
      color: #2a2338;
      rotate: -1.5deg;
      filter: drop-shadow(-4px 7px 5px rgb(0 0 0 / 0.35));
    }
    /* as argolas de arame que prendem as folhas */
    .argolas {
      position: absolute;
      top: -8px;
      inset-inline: 0;
      display: flex;
      justify-content: space-around;
      padding: 0 18px;
    }
    .argolas i {
      width: 8px;
      height: 16px;
      box-sizing: border-box;
      border: 2.5px solid #9a9ea4;
      border-radius: 5px;
    }
    .mes {
      justify-self: stretch;
      padding: 9px 0 5px;
      border-radius: 3px 3px 0 0;
      background: #5b3c9e;
      color: #f4effb;
      text-align: center;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .dia {
      margin-top: 4px;
      font-family: var(--f-didone);
      font-size: 3rem;
      line-height: 1;
      font-variant-numeric: tabular-nums;
    }
    .semana {
      color: #5b3c9e;
      font-family: var(--f-hand);
      font-size: 0.95rem;
    }
    /* quantos lembretes hoje: um adesivo redondo na ponta da folha */
    .adesivo {
      position: absolute;
      top: 32px;
      right: -9px;
      display: grid;
      place-items: center;
      min-width: 24px;
      height: 24px;
      box-sizing: border-box;
      padding: 0 5px;
      border-radius: 12px;
      background: var(--pin-yellow, #ffd23f);
      color: #2a2338;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      box-shadow: 0 2px 3px rgb(0 0 0 / 0.4);
      rotate: 8deg;
    }
  `,
})
export class DeskCalendar {
  /** Hoje, `AAAA-MM-DD`. */
  readonly day = input.required<string>();
  /** Quantos lembretes hoje tem. */
  readonly count = input(0);

  protected readonly month = computed(() => MONTHS_SHORT[Number(this.day().slice(5, 7)) - 1]);
  protected readonly dayNumber = computed(() => Number(this.day().slice(8, 10)));
  protected readonly weekday = computed(() => weekdayFmt.format(parseDay(this.day())));
}

/**
 * Os Gastos: o livro-caixa do logo, de pé, de percalina verde com a lombada vermelha e o "Gastos" dourado. Do alto sai
 * o canhoto do mês com o saldo; mês sem lançamento, sem canhoto.
 */
@Component({
  selector: 'app-cash-book',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @if (stub(); as c) {
      <span class="canhoto"><b>{{ c.month }}</b>{{ c.word }}<br />{{ c.amount }}</span>
    }
    <span class="capa">
      <span class="lombada"></span>
      <span class="gravado"><span class="sobre">Livro caixa</span><span class="nome">Gastos</span></span>
    </span>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      rotate: 2deg;
      filter: drop-shadow(-5px 8px 6px rgb(0 0 0 / 0.4));
    }
    .capa {
      position: relative;
      display: flex;
      width: 92px;
      height: 128px;
      border-radius: 2px 4px 4px 2px;
      background:
        repeating-linear-gradient(45deg, rgb(255 255 255 / 0.05) 0 1px, transparent 1px 3px),
        repeating-linear-gradient(-45deg, rgb(0 0 0 / 0.12) 0 1px, transparent 1px 3px),
        linear-gradient(180deg, #1d5238, #163f2b);
    }
    .lombada {
      width: 14px;
      border-radius: 2px 0 0 2px;
      background: linear-gradient(90deg, rgb(0 0 0 / 0.25), transparent 40%, rgb(255 255 255 / 0.12) 70%, rgb(0 0 0 / 0.3)), #7d2a22;
    }
    .gravado {
      display: grid;
      align-content: center;
      justify-items: center;
      gap: 3px;
      flex: 1;
      margin: 14px 8px 30px;
      border: 1.5px solid #d9b25a;
      border-radius: 2px;
      box-shadow: inset 0 0 0 2px #1a4a32, inset 0 0 0 2.5px rgb(217 178 90 / 0.6);
    }
    .sobre,
    .nome {
      background: var(--foil-gold-word);
      -webkit-background-clip: text;
      background-clip: text;
      color: transparent;
      line-height: 1;
    }
    .sobre {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.45rem;
      letter-spacing: 0.2em;
      text-transform: uppercase;
    }
    .nome {
      font-family: var(--f-didone);
      font-size: 0.95rem;
      letter-spacing: 0.04em;
      text-transform: uppercase;
    }
    /* o canhoto do mês, saindo de dentro do livro, atrás da capa */
    .canhoto {
      position: absolute;
      top: -46px;
      right: 4px;
      z-index: -1;
      display: block;
      width: 62px;
      padding: 4px 5px 34px;
      background: #fffdf6;
      color: #163f2b;
      font-family: var(--f-hand);
      font-size: 0.72rem;
      line-height: 1.05;
      rotate: 7deg;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.3);
    }
    .canhoto b {
      display: block;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.6rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
    }
  `,
})
export class CashBook {
  /** O canhoto do mês ("nov", "sobra", "R$ 1.240"); `null`, sem canhoto. */
  readonly stub = input<{ month: string; word: string; amount: string } | null>(null);
}

/** O Cofre: a porta de aço do logo do cofre, com o disco do segredo e a maçaneta, de pé sobre dois pezinhos. */
@Component({
  selector: 'app-steel-safe',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="porta"><span class="disco"></span><span class="macaneta"></span></span>
    <span class="pe"></span><span class="pe"></span>
  `,
  styles: `
    :host {
      position: relative;
      display: block;
      width: 104px;
      height: 104px;
      filter: drop-shadow(-5px 8px 6px rgb(0 0 0 / 0.45));
    }
    .porta {
      position: absolute;
      inset: 0 0 6px;
      display: flex;
      align-items: center;
      justify-content: center;
      gap: 12px;
      border-radius: 6px;
      background:
        radial-gradient(circle at 9px 9px, #8c9096 0 1.8px, transparent 2.4px),
        radial-gradient(circle at calc(100% - 9px) 9px, #8c9096 0 1.8px, transparent 2.4px),
        radial-gradient(circle at 9px calc(100% - 9px), #8c9096 0 1.8px, transparent 2.4px),
        radial-gradient(circle at calc(100% - 9px) calc(100% - 9px), #8c9096 0 1.8px, transparent 2.4px),
        linear-gradient(170deg, #3b3f45, #23262a 55%, #1b1d20);
      box-shadow:
        inset 0 0 0 3px #1b1d20,
        inset 0 0 0 6px #f3efe6,
        inset 0 0 0 8px #1b1d20,
        inset 0 1px 0 9px rgb(255 255 255 / 0.06);
    }
    /* o disco do segredo: as marcas em volta, o miolo e o ponteiro */
    .disco {
      position: relative;
      width: 40px;
      height: 40px;
      border-radius: 50%;
      background:
        radial-gradient(circle, #6f747a 0 34%, #2a2d31 35% 40%, transparent 41%),
        repeating-conic-gradient(from 0deg, #d9dade 0 2deg, transparent 2deg 30deg),
        radial-gradient(circle, #9a9ea4 0 62%, #55595f 64% 100%);
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.6), inset 0 1px 1px rgb(255 255 255 / 0.35);
    }
    .disco::after {
      content: '';
      position: absolute;
      left: 50%;
      top: 3px;
      width: 3px;
      height: 9px;
      margin-left: -1.5px;
      border-radius: 2px;
      background: #e62e2d;
    }
    .macaneta {
      width: 8px;
      height: 30px;
      border-radius: 4px;
      background: linear-gradient(90deg, #6f747a, #c9ccd1 45%, #55595f);
      box-shadow: 0 2px 3px rgb(0 0 0 / 0.6);
    }
    .pe {
      position: absolute;
      bottom: 0;
      left: 12px;
      width: 14px;
      height: 7px;
      border-radius: 0 0 3px 3px;
      background: #1b1d20;
    }
    .pe + .pe {
      left: auto;
      right: 12px;
    }
  `,
})
export class SteelSafe {}
