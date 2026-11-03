import { DestroyRef, Directive, ElementRef, afterNextRender, effect, inject, input } from '@angular/core';

/** O menor tamanho do título, em px: abaixo disso ele não cabe mais, e quebra as linhas que precisar. */
export const FIT_MIN_PX = 12;
/**
 * O piso da frase que nem a 12 px cabe na área (pedido do usuário: a pergunta comprida cortava a última
 * palavra no meio): ela desce até aqui; se nem assim couber, a última linha termina em reticências.
 */
export const FIT_FLOOR_PX = 10;
/** Até quantas linhas o título vai, antes de diminuir mais. */
export const FIT_MAX_LINES = 4;

/**
 * As contas já feitas (o texto, a letra, a área → o tamanho e se precisou quebrar a palavra): a mesma carta
 * na mesma área não mede de novo (cada medida força o navegador a refazer o desenho, e a parede de um baralho
 * tem centenas). Guarda as últimas 600.
 */
const MEMORY = new Map<string, { px: number; anywhere: boolean; clamp: number }>();
const MEMORY_MAX = 600;

/**
 * O título da frente da carta com a letra do tamanho do espaço que sobra (PLANO-ESTUDOS.md, 6.1; pedido do
 * usuário: "A ideia é sempre ocupar uma quantidade semelhante de espaço", e o mesmo com subtítulo e imagem).
 * Não são degraus fixos: um caractere só fica enorme, uma frase de duas linhas fica menor, e o título sozinho
 * cresce mais do que o título com subtítulo ou imagem, porque a área dele é o que sobra deles.
 *
 * Vai no elemento que é a área do título (com altura e largura definidas pelo resto da carta) e mede o
 * primeiro filho, o texto: a letra é a maior que cabe na área, achada por busca binária, sem quebrar palavra
 * no meio e com até quatro linhas, entre 12 px e `appFitTitleMax` da altura da área (1 = a área inteira).
 * Refaz quando a área muda de tamanho (uma medida por quadro), quando o texto muda e quando a letra chega.
 */
@Directive({ selector: '[appFitTitle]' })
export class FitTitle {
  /** O texto (só para refazer a conta quando ele muda). */
  readonly appFitTitle = input<string>('');
  /** O teto, em fração da altura da área. */
  readonly appFitTitleMax = input(1);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroy = inject(DestroyRef);
  private frame = 0;

  constructor() {
    effect(() => {
      this.appFitTitle();
      this.appFitTitleMax();
      this.schedule();
    });
    afterNextRender(() => {
      const observer = new ResizeObserver(() => this.schedule());
      observer.observe(this.host.nativeElement);
      // a letra manuscrita chega depois: o tamanho medido com a de reserva seria outro
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
    const area = this.host.nativeElement;
    const text = area.firstElementChild as HTMLElement | null;
    if (!text) return;
    // a palavra só quebra no meio quando nem a menor letra a faz caber, e as reticências só quando nem o
    // piso cabe (ver o fim): a conta começa sem nenhum dos dois
    text.style.overflowWrap = '';
    clamp(text, 0);
    const width = area.clientWidth;
    const height = area.clientHeight;
    if (!width || !height) return;
    const key = `${text.textContent}|${getComputedStyle(text).fontFamily}|${width}|${height}|${this.appFitTitleMax()}`;
    const known = MEMORY.get(key);
    if (known) {
      text.style.overflowWrap = known.anywhere ? 'anywhere' : '';
      text.style.fontSize = `${known.px}px`;
      clamp(text, known.clamp);
      return;
    }
    const lineHeight = parseFloat(getComputedStyle(text).lineHeight) / parseFloat(getComputedStyle(text).fontSize) || 1.1;
    const top = Math.max(FIT_MIN_PX, Math.floor(height * this.appFitTitleMax()));
    const search = (maxLines: number, min = FIT_MIN_PX): number | null => {
      const fits = (px: number): boolean => {
        text.style.fontSize = `${px}px`;
        const h = text.scrollHeight;
        return h <= height + 0.5 && text.scrollWidth <= width + 0.5 && Math.round(h / (px * lineHeight)) <= maxLines;
      };
      if (fits(top)) return top;
      if (!fits(min)) return null;
      // a maior que cabe, ao meio pixel
      let lo = min;
      let hi = top;
      while (hi - lo > 0.5) {
        const mid = (lo + hi) / 2;
        if (fits(mid)) lo = mid;
        else hi = mid;
      }
      return lo;
    };
    // até quatro linhas; um título que nem com a menor letra cabe nelas usa as linhas que precisar; o que
    // nem assim cabe na área desce até o piso; a palavra mais larga que a carta, mesmo no piso, quebra onde
    // precisar; e o que nem quebrando cabe termina em reticências, nunca cortado no meio da linha
    let px = search(FIT_MAX_LINES) ?? search(Infinity) ?? search(Infinity, FIT_FLOOR_PX);
    const anywhere = px === null;
    if (anywhere) {
      text.style.overflowWrap = 'anywhere';
      px = search(Infinity, FIT_FLOOR_PX);
    }
    let lines = 0;
    if (px === null) {
      px = FIT_FLOOR_PX;
      lines = Math.max(1, Math.floor(height / (px * lineHeight)));
    }
    text.style.fontSize = `${px}px`;
    clamp(text, lines);
    if (MEMORY.size >= MEMORY_MAX) MEMORY.delete(MEMORY.keys().next().value!);
    MEMORY.set(key, { px, anywhere, clamp: lines });
  }
}

/** Até `lines` linhas, a última com reticências (0: sem limite). */
function clamp(text: HTMLElement, lines: number): void {
  const on = lines > 0;
  text.style.display = on ? '-webkit-box' : '';
  text.style.setProperty('-webkit-box-orient', on ? 'vertical' : '');
  text.style.setProperty('-webkit-line-clamp', on ? String(lines) : '');
  text.style.overflow = on ? 'hidden' : '';
}
