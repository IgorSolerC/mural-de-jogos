import { InjectionToken } from '@angular/core';

/**
 * A sala de quem amplia (PLANO-LADO-A-LADO.md, D9): com duas coisas abertas lado a lado, o lado em que a peça está.
 * A peça ampliada (ui/piece-lift.ts) e a foto ampliada (ui/image-viewer.ts) crescem só até o tamanho dele, o véu cobre
 * só ele, e o outro lado continua à vista e se toca. A leitura (ui/review-reader.ts) é a sala de cada lado; sem sala
 * (o mural, a leitura sozinha), a peça vai para o meio da tela, como sempre.
 */
export interface Room {
  /** O lado, quando há dois abertos; null: a tela inteira. Lido na hora de ampliar. */
  room(): HTMLElement | null;
}

export const ROOM = new InjectionToken<Room>('ROOM');

/** O retângulo da sala na tela, e quanto falta dela até cada beirada da janela (para um `inset`). */
export function roomBox(room: HTMLElement): { top: number; left: number; width: number; height: number; right: number; bottom: number } {
  const r = room.getBoundingClientRect();
  const vw = document.documentElement.clientWidth;
  const vh = document.documentElement.clientHeight;
  return { top: r.top, left: r.left, width: r.width, height: r.height, right: vw - r.right, bottom: vh - r.bottom };
}
