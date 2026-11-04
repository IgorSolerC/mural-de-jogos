import { DestroyRef, Directive, ElementRef, afterNextRender, effect, inject, input } from '@angular/core';

/** Até quanto a resposta curta cresce: o dobro (pedido do usuário, com o desenho do tamanho). */
export const GROW_MAX = 2;
/** A precisão da conta: abaixo disso, a diferença não se vê. */
const GROW_STEP = 0.05;
/**
 * A peça que sobe para o meio da tela já tem o zoom dela (ui/piece-lift.ts): dentro de outro, os dois se
 * multiplicariam e ela passaria da tela. O texto com uma delas fica do tamanho de sempre, e ela tem o Ampliar.
 */
const LIFTS_ITSELF = 'app-zoom-knob';

/**
 * A resposta curta do verso da carta cresce para ser lida (pedido do usuário: "muito difícil de ler, a troco
 * de nada"): um "Romaji → e" não fica miúdo no alto de uma carta vazia. O texto inteiro cresce junto, com
 * `zoom`: a letra, os recuos, o card e o rasgo dele, na mesma proporção.
 *
 * Vai no elemento em volta do texto, sem zoom, cujo primeiro filho é o texto (é ele quem cresce): o maior zoom
 * entre 1 e `GROW_MAX` em que tudo cabe no espaço que sobra no pai, sem rolar e sem quebrar palavra no meio.
 * O texto que já não cabe fica como é, e rola. A conta é feita com a carta ainda de costas, antes de virar;
 * mede pelo layout, que o giro da carta não muda. Refaz quando o texto muda, quando ele ou a carta mudam de
 * tamanho (a imagem que chega, o card que abre) e quando a letra chega.
 */
@Directive({ selector: '[appGrowToFit]' })
export class GrowToFit {
  /** O texto (só para refazer a conta quando ele muda). */
  readonly appGrowToFit = input<string>('');

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroy = inject(DestroyRef);
  private frame = 0;

  constructor() {
    effect(() => {
      this.appGrowToFit();
      this.schedule();
    });
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.schedule());
      const box = this.host.nativeElement;
      observer.observe(box);
      if (box.parentElement) observer.observe(box.parentElement);
      void document.fonts?.ready.then(() => this.schedule());
      this.destroy.onDestroy(() => {
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
    const box = this.host.nativeElement;
    const text = box.firstElementChild as HTMLElement | null;
    const area = box.parentElement;
    if (!text || !area) return;
    text.style.removeProperty('zoom');
    // o que sobra no pai, do alto do texto até o respiro do pé (1 px de folga: as medidas são arredondadas)
    const room = area.clientHeight - parseFloat(getComputedStyle(area).paddingBottom) - (box.offsetTop - area.offsetTop) - 1;
    if (room <= 0 || text.querySelector(LIFTS_ITSELF)) return;
    // sem deixar quebrar a palavra, a palavra larga demais aparece na medida (no fim, volta o do CSS)
    text.style.overflowWrap = 'normal';
    const fits = (zoom: number): boolean => {
      text.style.setProperty('zoom', String(zoom));
      return box.offsetHeight <= room && box.scrollWidth <= box.clientWidth + 1;
    };
    let best = 1;
    if (fits(GROW_MAX)) best = GROW_MAX;
    else if (fits(1 + GROW_STEP)) {
      best = 1 + GROW_STEP;
      let hi = GROW_MAX;
      while (hi - best > GROW_STEP) {
        const mid = (best + hi) / 2;
        if (fits(mid)) best = mid;
        else hi = mid;
      }
    }
    text.style.overflowWrap = '';
    if (best > 1) text.style.setProperty('zoom', String(best));
    else text.style.removeProperty('zoom');
  }
}
