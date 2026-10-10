import { DestroyRef, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * A peça ocupa linhas inteiras da pauta: a altura do host (o que `selector` mede, mais o respiro de
 * cima e de baixo) sobe até a linha seguinte, e o texto de baixo continua em cima das linhas azuis.
 * Chame no construtor do componente.
 */
export function snapToLines(selector: string): void {
  const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  const destroy = inject(DestroyRef);
  afterNextRender(() => {
    const piece = host.querySelector<HTMLElement>(selector);
    if (!piece || typeof ResizeObserver === 'undefined') return;
    let frame = 0;
    const fit = () => {
      frame = 0;
      const cs = getComputedStyle(host);
      const line = parseFloat(cs.lineHeight);
      if (!line) return;
      const total = piece.offsetHeight + parseFloat(cs.paddingTop) + parseFloat(cs.paddingBottom);
      const h = `${Math.ceil(total / line - 0.01) * line}px`;
      if (host.style.minHeight !== h) host.style.minHeight = h;
    };
    // no quadro seguinte, e não dentro do aviso do observador (mudar a altura ali faz um laço)
    const ro = new ResizeObserver(() => {
      if (!frame) frame = requestAnimationFrame(fit);
    });
    ro.observe(piece);
    destroy.onDestroy(() => {
      ro.disconnect();
      cancelAnimationFrame(frame);
    });
  });
}
