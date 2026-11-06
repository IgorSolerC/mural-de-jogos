import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/**
 * Os botões da régua do texto que cabem (pedido do usuário: com a tela menor, o marca-texto sumia antes de
 * outros que ele usa menos). Cada botão que pode sair leva `data-sai` com a vez dele (1 sai primeiro); sem
 * lugar, saem por vez, até caber: primeiro as tarefas e a lista numerada, depois o riscado, a lista, o
 * sutil, o itálico, o marca-texto e, por último, o negrito. Desfazer e refazer nunca saem. Nada some de
 * verdade: tudo continua no "Formatar". Se nem assim couber (a letra ou o zoom muito grandes), os botões
 * rolam de lado, com a ponta esmaecida (`.rola`).
 *
 * Vai na fileira dos botões, que tem a largura do que sobra na régua (não a dos botões): mede de novo
 * quando ela muda (a folha, a janela, um menu a mais na régua, como o do código) e quando a letra chega.
 */
@Directive({ selector: '[appFitTools]' })
export class FitTools {
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private frame = 0;

  constructor() {
    const destroy = inject(DestroyRef);
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.schedule());
      observer.observe(this.host);
      // o observador já mede uma vez ao começar
      void document.fonts?.ready.then(() => this.schedule());
      destroy.onDestroy(() => {
        observer.disconnect();
        cancelAnimationFrame(this.frame);
      });
    });
  }

  private schedule(): void {
    cancelAnimationFrame(this.frame);
    this.frame = requestAnimationFrame(() => this.fit());
  }

  /** A conta, agora (os testes chamam sem esperar o quadro). */
  fit(): void {
    const row = this.host;
    const all = [...row.querySelectorAll<HTMLElement>('[data-sai]')];
    const turns = [...new Set(all.map((el) => Number(el.dataset['sai'])))].sort((a, b) => a - b);
    const overflows = () => row.scrollWidth > row.clientWidth + 1;
    let out = 0;
    const apply = () => all.forEach((el) => el.classList.toggle('fora', Number(el.dataset['sai']) <= out));
    apply();
    for (const turn of turns) {
      if (!overflows()) break;
      out = turn;
      apply();
    }
    row.classList.toggle('rola', overflows());
  }
}
