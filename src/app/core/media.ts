import { DestroyRef, Signal, inject, signal } from '@angular/core';

/**
 * Um sinal que acompanha uma media query. Só para o que o CSS não alcança (a entrada de um componente,
 * como a ficha compacta no celular): o layout em si continua nas folhas de estilo.
 */
export function mediaSignal(query: string): Signal<boolean> {
  const mq = matchMedia(query);
  const matches = signal(mq.matches);
  const sync = () => matches.set(mq.matches);
  mq.addEventListener('change', sync);
  inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', sync));
  return matches.asReadonly();
}
