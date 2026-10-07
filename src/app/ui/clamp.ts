import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Marca o elemento com `data-corta` quando o conteúdo passa da altura dele (o resto fica escondido).
 * Serve para esmaecer o fim só de quem foi cortado: um texto que cabe não perde a última linha.
 */
@Directive({ selector: '[appCorta]' })
export class Corta {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    let observer: ResizeObserver | undefined;
    // uns pixels a mais são o pé das letras, não uma linha cortada
    const check = () => el.toggleAttribute('data-corta', el.scrollHeight > el.clientHeight + 8);
    afterNextRender(() => {
      check();
      if (typeof ResizeObserver === 'undefined') return;
      observer = new ResizeObserver(check);
      observer.observe(el);
      // o conteúdo muda de altura sem o elemento mudar (o texto editado, as fontes chegando)
      if (el.firstElementChild) observer.observe(el.firstElementChild);
    });
    inject(DestroyRef).onDestroy(() => observer?.disconnect());
  }
}
