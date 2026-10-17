import { ElementRef, effect } from '@angular/core';

/**
 * Fecha o menu (ou o bilhete) aberto quando a pessoa aperta fora do componente, sem roubar o foco de
 * onde ela apertou. Só ouve a página com ele aberto: cada recorte da wishlist e cada balão de reação
 * ouvindo todo toque fazia o Angular conferir todos eles a cada clique. Chame no construtor.
 */
export function closeOnOutsidePress(isOpen: () => boolean, host: ElementRef<HTMLElement>, close: () => void): void {
  effect((onCleanup) => {
    if (!isOpen()) return;
    const outside = (e: PointerEvent) => {
      if (!host.nativeElement.contains(e.target as Node)) close();
    };
    document.addEventListener('pointerdown', outside);
    onCleanup(() => document.removeEventListener('pointerdown', outside));
  });
}
