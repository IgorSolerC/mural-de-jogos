import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Onde a luz bate: enquanto o ponteiro passa por cima, escreve a posição dele no elemento, em
 * `--luz-x` / `--luz-y` (0% a 100%) e `--luz-n` (0 a 1, da esquerda para a direita). As folhas
 * holográficas usam isso para mudar de cor e acender o reflexo como um adesivo inclinado debaixo
 * da lâmpada. Só mexe em variáveis de CSS, fora da detecção de mudanças, um quadro por vez.
 */
@Directive({ selector: '[appLuz]' })
export class Luz {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      let frame = 0;
      let last: PointerEvent | null = null;
      const paint = () => {
        frame = 0;
        if (!last) return;
        const r = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (last.clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (last.clientY - r.top) / r.height));
        el.style.setProperty('--luz-x', `${(x * 100).toFixed(1)}%`);
        el.style.setProperty('--luz-y', `${(y * 100).toFixed(1)}%`);
        el.style.setProperty('--luz-n', x.toFixed(3));
      };
      const move = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        last = e;
        frame ||= requestAnimationFrame(paint);
      };
      el.addEventListener('pointermove', move, { passive: true });
      destroy.onDestroy(() => {
        el.removeEventListener('pointermove', move);
        cancelAnimationFrame(frame);
      });
    });
  }
}
