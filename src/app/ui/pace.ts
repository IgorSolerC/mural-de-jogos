/**
 * O fôlego do aparelho: quanto trabalho de montar e desenhar fichas cabe num quadro. Quem monta as
 * fichas (pages/wall-cards.ts) e a fila do papel (ui/paper-layer.ts) contam aqui cada quadro em que
 * trabalharam; se os quadros começam a atrasar, o próximo leva menos fichas, e uma de cada vez no
 * aparelho que não dá conta. Antes o intervalo entre uma ficha e outra era fixo: sobrava num
 * computador bom e faltava num fraco, que travava a cada leva.
 */

import type { IdleDeadlineLike } from '../core/idle';

/** Um quadro a 60 Hz: o ponto de partida, até a tela mostrar o ritmo dela. */
const SIXTY = 1000 / 60;
/** A média pesa os quadros recentes: reage rápido a uma travada e volta em poucos quadros bons. */
const WEIGHT = 0.3;
/** Dois quadros de trabalho muito longe um do outro não são um quadro lento: ninguém estava trabalhando. */
const IDLE_GAP = 250;
/** Passou disto do quadro da tela, os quadros estão atrasando. */
const SLOW = 1.6;
/** Passou disto, mal estão saindo. */
const STRUGGLING = 3;

/** O quadro da tela: 16,7ms a 60 Hz, 8,3ms a 120 Hz (o menor intervalo visto; nunca mais que 60 Hz). */
let frame = SIXTY;
let average = SIXTY;
let last = 0;
let forcedSlow = false;
/** O quadro em que alguém trabalhou por último e quanto dele já foi gasto (ver `spend`). */
let spentAt = 0;
let spent = 0;

/** Conta mais um quadro de trabalho (chamar no começo do quadro, com a hora dele). */
export function tick(now: number): void {
  const gap = last ? now - last : 0;
  // o mesmo quadro, contado pelos dois (quem monta e quem desenha)
  if (last && gap <= 0) return;
  last = now;
  if (gap <= 0 || gap > IDLE_GAP) return;
  // a tela mais rápida que 60 Hz mostra o quadro dela no menor intervalo (com folga para o relógio)
  if (gap < frame && gap > 3) frame = Math.max(4, gap);
  average += (gap - average) * WEIGHT;
}

/**
 * O próximo quadro de trabalho não vem logo em seguida (a fila acabou, ou deu um quadro de folga): a
 * distância até ele não conta como quadro lento. Sem fôlego, cada folga afrouxa um pouco a média, para
 * o ritmo ser tentado de novo daqui a pouco: o aparelho que só travou na chegada não fica lento para sempre.
 */
export function rest(): void {
  last = 0;
  if (average > frame * SLOW) average -= (average - frame) * 0.08;
}

/** "Menos fichas prontas" (Ajustes) trata o aparelho como lento desde o começo, sem esperar o primeiro engasgo. */
export function setForcedSlow(slow: boolean): void {
  forcedSlow = slow;
}

/** Os quadros estão atrasando (ou os Ajustes pediram): uma ficha por quadro. */
export function slow(): boolean {
  return forcedSlow || average > frame * SLOW;
}

/** Quantas fichas a esteira prepara ao mesmo tempo, normalmente (ver `esteira`). */
const ESTEIRA = 5;

/**
 * Quantas fichas ficam na esteira ao mesmo tempo: montada, com o papel desenhado e assada, ainda com o
 * véu (a vaga no lugar). A próxima só é montada quando uma delas aparece. Cinco; uma com "Menos fichas
 * prontas" (Ajustes) ou com os quadros mal saindo, para não pesar num aparelho velho.
 */
export function esteira(): number {
  return forcedSlow || struggling() ? 1 : ESTEIRA;
}

/** Os quadros mal estão saindo: além de uma por vez, um quadro de folga entre uma e outra. */
export function struggling(): boolean {
  return average > frame * STRUGGLING;
}

/**
 * Quanto do quadro (em ms) dá para gastar agora: `share` é a parte do quadro da tela que cabe a quem
 * pede (0 a 1), menos o que já foi gasto neste quadro por quem trabalhou antes, e menos ainda com os
 * quadros atrasando. Numa tela de 120 Hz o quadro tem metade do tempo, e o trabalho por quadro também.
 */
export function budget(share: number, now = 0): number {
  const base = frame * share * (struggling() ? 0.25 : slow() ? 0.5 : 1);
  return Math.max(1, base - (now && now === spentAt ? spent : 0));
}

/**
 * Quantas fichas pesadas (montar, desenhar o papel) cabem num quadro: `max` numa tela de 60 Hz com
 * folga, uma só com os quadros atrasando ou numa tela rápida (a 120 Hz o quadro tem 8ms, e uma ficha
 * com o estilo, o layout e a pintura dela já o enche).
 */
export function perFrame(max: number): number {
  return slow() || frame < 12 ? 1 : max;
}

/**
 * O navegador à toa deu folga para `ms` de trabalho (ou o prazo venceu). Pede no máximo metade do quadro
 * da tela: numa tela de 120 Hz o quadro inteiro tem 8,3 ms, e com qualquer coisa animando (os brilhos das
 * notas altas) a folga entre um quadro e outro fica em 1 a 7 ms. Pedir 8 ms ali era esperar para sempre:
 * o forno nunca assava e as fichas de mais adiante nunca eram preparadas.
 */
export function idleFits(deadline: IdleDeadlineLike, ms: number): boolean {
  watchScreen();
  return !!deadline.didTimeout || deadline.timeRemaining() >= Math.min(ms, frame / 2);
}

/** Quantos quadros seguidos olhar para saber o ritmo da tela. */
const SCREEN_FRAMES = 12;
let watching = false;
let watched = false;
let listening = false;

/**
 * Mede o quadro da tela sozinho, uma dúzia de quadros seguidos: quem trabalha só conta os quadros em que
 * trabalhou, e um mural pequeno (todas as fichas desenhadas num quadro ou dois) nunca mostrava o ritmo de
 * uma tela rápida. De novo quando a janela muda de tamanho (pode ter ido para outra tela) ou volta a aparecer.
 */
function watchScreen(): void {
  if (watched || watching || typeof requestAnimationFrame !== 'function') return;
  watching = true;
  if (!listening && typeof addEventListener === 'function') {
    listening = true;
    const again = () => (watched = false);
    addEventListener('resize', again, { passive: true });
    addEventListener('visibilitychange', again);
  }
  let prev = 0;
  let n = 0;
  const look = (t: number) => {
    const gap = prev ? t - prev : 0;
    prev = t;
    if (gap > 3 && gap < frame) frame = Math.max(4, gap);
    if (++n < SCREEN_FRAMES) requestAnimationFrame(look);
    else {
      watching = false;
      watched = true;
    }
  };
  requestAnimationFrame(look);
}

/** Avisa quanto do quadro `now` foi gasto (quem trabalhar depois, no mesmo quadro, leva menos). */
export function spend(now: number, ms: number): void {
  if (now !== spentAt) {
    spentAt = now;
    spent = 0;
  }
  spent += ms;
}

/** Só para os testes: volta ao começo. */
export function resetPace(): void {
  frame = SIXTY;
  average = SIXTY;
  last = 0;
  forcedSlow = false;
  spentAt = 0;
  spent = 0;
  watched = false;
}
