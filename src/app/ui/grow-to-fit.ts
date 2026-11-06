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
 * Enquanto mede, o texto leva esta marca, e nada dentro dele quebra palavra no meio (a regra está em
 * src/styles.scss: o texto é de outros componentes).
 */
const MEASURING = 'data-medindo';
/** O degrau do zoom onde o texto também diminui (a parede): um oitavo. */
const WALL_STEP = 0.125;
/** Uma linha que cresceu mais que isto, além do zoom, quebrou em duas (uma linha a mais é o dobro). */
const LINE_SLACK = 1.3;
/** As linhas do texto (cada parágrafo, item e título de card) que cabem numa linha só, com a altura delas. */
function singleLines(lines: readonly HTMLElement[]): [HTMLElement, number][] {
  const out: [HTMLElement, number][] = [];
  for (const line of lines) {
    // quantas linhas, pelo layout (sem o giro nem a escala da carta); a altura guardada é a da tela, para
    // comparar com a da tela depois do zoom (o giro e a escala são os mesmos nas duas)
    const lh = parseFloat(getComputedStyle(line).lineHeight);
    const h = line.getBoundingClientRect().height;
    // a que tem algo embaixo (a descrição de um item, o corpo de um card) não é uma linha só
    if (h > 0 && lh > 0 && line.offsetHeight < lh * 1.5) out.push([line, h]);
  }
  return out;
}

/**
 * A resposta curta do verso da carta cresce para ser lida (pedido do usuário: "muito difícil de ler, a troco
 * de nada"): um "Romaji → e" não fica miúdo no alto de uma carta vazia. O texto inteiro cresce junto, com
 * `zoom`: a letra, os recuos, o card e o rasgo dele, na mesma proporção.
 *
 * Vai no elemento em volta do texto, sem zoom, cujo primeiro filho é o texto (é ele quem cresce): o maior zoom
 * entre 1 e `GROW_MAX` (ou, onde não cabe nem no 1, entre `appGrowToFitMin` e 1) em que tudo cabe no espaço que sobra no pai, sem rolar, sem quebrar palavra no meio
 * (nem a do título do card, que tem a regra própria de quebrar) e sem a linha que cabia inteira virar duas
 * (pedido do usuário: na parede, o "Hiragana" do card quebrava em "Hiragan" e "a", o "Romaji → ka" descia
 * o "ka", e a última linha ficava cortada). O texto que já não cabe fica como é, e rola. A conta é feita com a carta ainda de costas, antes de virar;
 * mede pelo layout, que o giro da carta não muda. Refaz quando o texto muda, quando ele ou a carta mudam de
 * tamanho (a imagem que chega, o card que abre) e quando a letra chega.
 */
@Directive({ selector: '[appGrowToFit]' })
export class GrowToFit {
  /** O texto (só para refazer a conta quando ele muda). */
  readonly appGrowToFit = input<string>('');
  /**
   * Até quanto o texto pode diminuir para caber inteiro (1: não diminui, o de sempre). A carta pequena da
   * parede diminui um pouco: lá, nem o tamanho de sempre cabia, e a última linha sumia na rolagem.
   */
  readonly appGrowToFitMin = input(1);

  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef);
  private readonly destroy = inject(DestroyRef);
  private frame = 0;

  constructor() {
    effect(() => {
      this.appGrowToFit();
      this.appGrowToFitMin();
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
    // com movimento reduzido, o site dá 1 ms de transição a tudo: o zoom medido seria o de antes
    text.style.transitionProperty = 'none';
    text.style.removeProperty('zoom');
    // o que sobra no pai, do alto do texto até o respiro do pé (1 px de folga: as medidas são arredondadas)
    const room = area.clientHeight - parseFloat(getComputedStyle(area).paddingBottom) - (box.offsetTop - area.offsetTop) - 1;
    if (room <= 0 || text.querySelector(LIFTS_ITSELF)) return;
    // sem deixar quebrar a palavra (em nenhum lugar do texto: o título do card tem o "anywhere" dele), a
    // palavra larga demais aparece na medida (no fim, volta o do CSS)
    text.setAttribute(MEASURING, '');
    // as linhas que cabem numa linha só, com a altura de agora: crescendo, cada uma cresce junto, sem quebrar
    const lines = [...text.querySelectorAll<HTMLElement>('.linha')];
    const single = singleLines(lines);
    // cabe na altura, e nenhuma linha que era uma só virou duas
    const whole = (zoom: number): boolean => {
      text.style.setProperty('zoom', String(zoom));
      return box.offsetHeight <= room && single.every(([line, h]) => line.getBoundingClientRect().height <= h * zoom * LINE_SLACK);
    };
    // e nenhuma palavra passa da largura (nem dentro de uma linha que não deixa passar, o título do card)
    const fits = (zoom: number): boolean =>
      whole(zoom) && box.scrollWidth <= box.clientWidth + 1 && lines.every((line) => line.scrollWidth <= line.clientWidth + 1);
    // a maior entre `lo` (que cabe) e `hi`, a menos de um passo
    const search = (lo: number, hi: number): number => {
      if (fits(hi)) return hi;
      let best = lo;
      while (hi - best > GROW_STEP) {
        const mid = (best + hi) / 2;
        if (fits(mid)) best = mid;
        else hi = mid;
      }
      return best;
    };
    const min = Math.min(1, this.appGrowToFitMin());
    let best = 1;
    // cabe: cresce; não cabe e diminuindo cabe (só onde deixam): diminui; nem assim, fica como é, e rola
    if (fits(1)) best = fits(1 + GROW_STEP) ? search(1 + GROW_STEP, GROW_MAX) : 1;
    else if (min < 1 && fits(min)) best = search(min, 1 - GROW_STEP);
    text.removeAttribute(MEASURING);
    // com o CSS de volta, a conferência: a palavra que cabia raspando (o meio pixel) pode quebrar agora, e
    // o zoom desce até ela não quebrar
    const floor = best < 1 ? min : 1;
    while (best > floor && !whole(best)) best = Math.max(floor, best - GROW_STEP);
    if (best < 1 && !whole(best)) best = 1;
    // onde pode diminuir (a parede), em degraus: as cartas quase iguais, lado a lado, saem do mesmo tamanho
    // (a crítica do Impeccable: o "Katakana" e o "Hiragana" saíam com 1,27 e 1,32, e a fileira ficava torta)
    if (min < 1 && best !== 1) best = Math.max(min, Math.floor(best / WALL_STEP) * WALL_STEP);
    if (best !== 1) text.style.setProperty('zoom', String(best));
    else text.style.removeProperty('zoom');
  }
}
