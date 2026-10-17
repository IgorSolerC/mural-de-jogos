import { Injector, afterNextRender } from '@angular/core';

/**
 * O foco num elemento depois que a tela se redesenha. Com a mudança de agora, ele ainda nem existe (o
 * placar da partida que começou, o resultado, o formulário que abriu): uma microtarefa rodaria antes
 * do desenho e acharia o elemento velho, que some logo depois, e o foco cairia no vazio.
 */
export function focusAfterRender(injector: Injector, find: () => HTMLElement | null | undefined, options?: FocusOptions): void {
  afterNextRender({ write: () => find()?.focus(options) }, { injector });
}

/**
 * Para onde a tecla leva numa fileira de abas (o padrão das abas para teclado): ← e → dão a volta, e
 * também ↑ e ↓ com `vertical`; Home e End vão às pontas. -1 quando a tecla não é de aba.
 */
export function tabStep(key: string, i: number, n: number, vertical = true): number {
  const forward = key === 'ArrowRight' || (vertical && key === 'ArrowDown');
  const back = key === 'ArrowLeft' || (vertical && key === 'ArrowUp');
  if (forward) return (i + 1) % n;
  if (back) return (i - 1 + n) % n;
  if (key === 'Home') return 0;
  if (key === 'End') return n - 1;
  return -1;
}
