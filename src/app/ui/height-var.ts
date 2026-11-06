import { DestroyRef, Directive, ElementRef, afterNextRender, inject, input } from '@angular/core';

/**
 * A altura do elemento (a parte de dentro, sem a borda) numa variável do CSS dele, em px, refeita quando ele
 * muda de tamanho: quem está dentro pode se limitar a ela. Usada no lugar de `container-type: size`, que faria
 * do elemento o lugar do `position: fixed` de tudo o que tem dentro (a régua presa em cima do teclado, a tira
 * das dependências do Kanban) e os prenderia nele.
 */
@Directive({ selector: '[appHeightVar]' })
export class HeightVar {
  /** O nome da variável, com os dois traços. */
  readonly appHeightVar = input.required<string>();

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.host.style.setProperty(this.appHeightVar(), `${this.host.clientHeight}px`));
      observer.observe(this.host);
      destroy.onDestroy(() => observer.disconnect());
    });
  }
}
