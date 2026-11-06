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
      let frame = 0;
      const write = () => {
        frame = 0;
        this.host.style.setProperty(this.appHeightVar(), `${this.host.clientHeight}px`);
      };
      // a primeira na hora: quem está dentro não desenha um quadro sem o limite
      write();
      // no quadro seguinte, e não dentro do aviso do observador: quem está dentro muda de altura com a
      // variável, e mudar ali faz o navegador acusar "ResizeObserver loop completed"
      const observer = new ResizeObserver(() => {
        frame ||= requestAnimationFrame(write);
      });
      observer.observe(this.host);
      destroy.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(frame);
      });
    });
  }
}
