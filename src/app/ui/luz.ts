import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** Quem usa a posição da lâmpada: a folha holográfica do Platinado (ver ui/status-label.ts). */
const HOLO = 'app-status-label.platinado';

/**
 * Onde a luz bate: enquanto o ponteiro passa por cima, escreve a posição dele (medida na ficha) nas
 * folhas holográficas que estão nela, em `--luz-x` / `--luz-y` (0% a 100%) e `--luz-n` (0 a 1, da
 * esquerda para a direita). Elas usam isso para mudar de cor e acender o reflexo como um adesivo
 * inclinado debaixo da lâmpada. Só mexe em variáveis de CSS, fora da detecção de mudanças, um quadro
 * por vez, e só nas folhas: escrita na ficha, a posição era herdada por tudo o que está nela, e o
 * navegador recalculava a ficha inteira a cada quadro de mouse, mesmo sem nenhuma folha para acender.
 */
@Directive({ selector: '[appLuz]' })
export class Luz {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      let frame = 0;
      let last: PointerEvent | null = null;
      /** As folhas desta ficha, procuradas quando o ponteiro entra (null: ainda não entrou). */
      let foils: HTMLElement[] | null = null;
      const paint = () => {
        frame = 0;
        if (!last || !foils?.length) return;
        const r = el.getBoundingClientRect();
        const x = Math.min(1, Math.max(0, (last.clientX - r.left) / r.width));
        const y = Math.min(1, Math.max(0, (last.clientY - r.top) / r.height));
        for (const foil of foils) {
          foil.style.setProperty('--luz-x', `${(x * 100).toFixed(1)}%`);
          foil.style.setProperty('--luz-y', `${(y * 100).toFixed(1)}%`);
          foil.style.setProperty('--luz-n', x.toFixed(3));
        }
      };
      const enter = () => (foils = null);
      const move = (e: PointerEvent) => {
        if (e.pointerType !== 'mouse') return;
        foils ??= Array.from(el.querySelectorAll<HTMLElement>(HOLO));
        if (!foils.length) return;
        last = e;
        frame ||= requestAnimationFrame(paint);
      };
      el.addEventListener('pointerenter', enter, { passive: true });
      el.addEventListener('pointermove', move, { passive: true });
      destroy.onDestroy(() => {
        el.removeEventListener('pointerenter', enter);
        el.removeEventListener('pointermove', move);
        cancelAnimationFrame(frame);
      });
    });
  }
}
