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

/**
 * Abre uma folha (um `<dialog>`, a lousa do dicionário, as conjugações) no lado (PLANO-LADO-A-LADO.md, D5): em vez do
 * modal da tela inteira, um popover centrado no lado, com o véu só nele; o outro lado continua vivo. O toque no véu e
 * o Esc com o foco na folha chamam `onClose`. Devolve o esconder (quem usa chama ao fechar).
 */
export function showInRoom(dialog: HTMLDialogElement, room: HTMLElement, onClose: () => void): () => void {
  const veil = document.createElement('div');
  veil.className = 'sala-veu';
  veil.setAttribute('popover', 'manual');
  veil.setAttribute('aria-hidden', 'true');
  dialog.before(veil);
  const place = (): void => {
    const box = roomBox(room);
    for (const el of [veil, dialog]) {
      el.style.setProperty('--sala-top', `${box.top}px`);
      el.style.setProperty('--sala-left', `${box.left}px`);
      el.style.setProperty('--sala-w', `${box.width}px`);
      el.style.setProperty('--sala-h', `${box.height}px`);
    }
  };
  const onKey = (e: KeyboardEvent): void => {
    if (e.key !== 'Escape' || e.defaultPrevented || !dialog.contains(document.activeElement)) return;
    e.preventDefault();
    e.stopPropagation();
    onClose();
  };
  const onVeil = (): void => onClose();
  dialog.setAttribute('popover', 'manual');
  dialog.classList.add('na-sala');
  place();
  veil.showPopover();
  dialog.showPopover();
  // o foco entra na folha, como no modal (o [autofocus] dela, ou o primeiro botão): o Espaço e o Esc são dela
  if (!dialog.contains(document.activeElement)) {
    const first = dialog.querySelector<HTMLElement>('[autofocus]') ?? dialog.querySelector<HTMLElement>('button:not([disabled]), [href], input, [tabindex]:not([tabindex="-1"])');
    first?.focus({ preventScroll: true });
  }
  veil.addEventListener('click', onVeil);
  document.addEventListener('keydown', onKey, true);
  const watcher = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(place);
  watcher?.observe(room);
  addEventListener('resize', place);
  return () => {
    watcher?.disconnect();
    removeEventListener('resize', place);
    document.removeEventListener('keydown', onKey, true);
    veil.removeEventListener('click', onVeil);
    if (dialog.matches(':popover-open')) dialog.hidePopover();
    dialog.removeAttribute('popover');
    dialog.classList.remove('na-sala');
    veil.remove();
  };
}
