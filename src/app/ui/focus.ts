import { Injector, afterNextRender } from '@angular/core';

/**
 * O foco num elemento depois que a tela se redesenha. Com a mudança de agora, ele ainda nem existe (o
 * placar da partida que começou, o resultado, o formulário que abriu): uma microtarefa rodaria antes
 * do desenho e acharia o elemento velho, que some logo depois, e o foco cairia no vazio.
 */
export function focusAfterRender(injector: Injector, find: () => HTMLElement | null | undefined, options?: FocusOptions): void {
  afterNextRender({ write: () => find()?.focus(options) }, { injector });
}
