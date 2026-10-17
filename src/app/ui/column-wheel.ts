import {
  DestroyRef,
  Directive,
  ElementRef,
  afterNextRender,
  inject,
} from '@angular/core';
import { reducedMotion } from '../core/motion';

/** Quanto tempo depois de uma volta da roda a próxima ainda soma ao mesmo deslize (e não recomeça dele). */
const STREAK_MS = 260;
/** Uma linha da roda (`deltaMode` 1), em pixels, como o Chrome conta. */
const LINE_PX = 40;

/**
 * Uma parte da coluna do Kanban que não rola (a etiqueta do alto, o "Adicionar nota" do pé) passa a
 * roda do mouse para a lista da coluna: com o ponteiro em qualquer lugar da coluna a roda rola a coluna,
 * e nunca a página. A lista em si já não deixa a rolagem escapar para a página (`overscroll-behavior` no CSS).
 *
 * O ouvinte é preso só nesta parte, e não na coluna inteira: um ouvinte de roda que pode cancelar faz o
 * navegador esperar o JavaScript antes de rolar o que está embaixo dele, e a lista, que rola de verdade,
 * precisa continuar rolando sem esperar ninguém. Fora da detecção de mudanças.
 */
@Directive({ selector: '[appColumnWheel]' })
export class ColumnWheel {
  constructor() {
    const el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      /** Até onde o deslize em curso vai (a roda de mouse anda em degraus, e cada degrau soma ao anterior). */
      let target = 0;
      let last = 0;
      const wheel = (e: WheelEvent) => {
        // Ctrl + roda é o zoom do navegador; Shift + roda, e o gesto de lado do trackpad, são do quadro
        if (e.ctrlKey || e.shiftKey || Math.abs(e.deltaX) > Math.abs(e.deltaY))
          return;
        const list = el.closest('.coluna')?.querySelector<HTMLElement>('.rolo');
        if (!list) return;
        e.preventDefault();
        const dy =
          e.deltaMode === 1
            ? e.deltaY * LINE_PX
            : e.deltaMode === 2
              ? e.deltaY * list.clientHeight
              : e.deltaY;
        const max = list.scrollHeight - list.clientHeight;
        if (max <= 0) return;
        const now = performance.now();
        // o degrau da roda de mouse (100px ou mais) desliza; o trackpad, que manda passinhos, vai junto do dedo
        const glide = Math.abs(dy) >= 50 && !reducedMotion();
        const from = glide && now - last < STREAK_MS ? target : list.scrollTop;
        last = now;
        target = Math.max(0, Math.min(max, from + dy));
        list.scrollTo({ top: target, behavior: glide ? 'smooth' : 'instant' });
      };
      el.addEventListener('wheel', wheel, { passive: false });
      destroy.onDestroy(() => el.removeEventListener('wheel', wheel));
    });
  }
}
