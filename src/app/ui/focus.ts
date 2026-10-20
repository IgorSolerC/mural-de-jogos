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

/**
 * As setas (e Home, End) andam entre os `[role=radio]` do grupo onde o evento caiu (`currentTarget`),
 * levando só o foco: quem escolhe é o Enter ou o espaço. Para os grupos de botões-rádio do editor.
 */
export function roveRadios(e: KeyboardEvent): void {
  const group = e.currentTarget as HTMLElement;
  const radios = Array.from(group.querySelectorAll<HTMLElement>('[role="radio"]'));
  const i = radios.indexOf(document.activeElement as HTMLElement);
  if (i < 0) return;
  const next = tabStep(e.key, i, radios.length);
  if (next < 0) return;
  e.preventDefault();
  radios[next].focus();
}

/**
 * Engole o clique que o navegador manda logo depois de soltar um arrasto (em `target`, ou na página),
 * para o arrasto não escolher nem abrir o que estava embaixo do ponteiro. Se não vier clique, nada fica preso.
 */
export function swallowNextClick(target: EventTarget = window): void {
  const swallow = (e: Event) => {
    e.stopPropagation();
    e.preventDefault();
  };
  target.addEventListener('click', swallow, { capture: true, once: true });
  setTimeout(() => target.removeEventListener('click', swallow, { capture: true }));
}
