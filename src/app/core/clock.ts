import { DestroyRef, Injectable, Signal, inject, signal } from '@angular/core';

/**
 * Um relógio só para o site inteiro: os contadores das anotações leem `now`, que anda de segundo em
 * segundo, na virada de cada segundo do relógio do aparelho. Ele só anda enquanto alguém está usando
 * (`use`): sem contador na tela, nada fica rodando.
 */
@Injectable({ providedIn: 'root' })
export class Clock {
  private readonly tick = signal(Date.now());
  readonly now: Signal<number> = this.tick.asReadonly();
  private users = 0;
  private timer: ReturnType<typeof setTimeout> | null = null;
  private readonly onVisible = () => {
    // a aba volta: o navegador segurou os tiques enquanto ela estava escondida
    if (document.visibilityState === 'visible') this.tick.set(Date.now());
  };

  /** Liga o relógio enquanto quem chamou existir (desliga sozinho no fim). */
  use(destroy = inject(DestroyRef)): void {
    if (this.users++ === 0) this.start();
    destroy.onDestroy(() => {
      if (--this.users === 0) this.stop();
    });
  }

  private start(): void {
    this.tick.set(Date.now());
    document.addEventListener('visibilitychange', this.onVisible);
    const next = () => {
      // na virada do segundo, e não a cada 1000 ms de quando ligou: os contadores andam juntos
      this.timer = setTimeout(() => {
        this.tick.set(Date.now());
        next();
      }, 1000 - (Date.now() % 1000) + 5);
    };
    next();
  }

  private stop(): void {
    if (this.timer !== null) clearTimeout(this.timer);
    this.timer = null;
    document.removeEventListener('visibilitychange', this.onVisible);
  }
}
