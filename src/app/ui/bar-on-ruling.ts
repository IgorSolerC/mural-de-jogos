import { Directive, ElementRef, OnDestroy, afterNextRender, inject, input } from '@angular/core';

/**
 * A barra de rolar de lado na pauta: a tabela larga rola de lado, e onde a barra
 * ocupa lugar (no Windows, no Chrome e no Edge) ela soma uns 10px ao bloco, e todo o texto de baixo saía
 * das linhas. Com a barra, o bloco ganha embaixo o que falta para ela fechar linhas inteiras da pauta
 * (`--sobra-barra`), e a barra fica numa linha só dela. Sem barra (ou com a que flutua por cima, no
 * celular e no Mac), nada muda.
 *
 * O bloco de código não usa esta peça: a barra dele é a fina, desenhada por cima (ui/code-paper.ts).
 *
 * A sobra entra na margem de baixo (a tabela tem margem negativa embaixo para a sombra do papel, ver
 * ui/_formatado.scss e o modo Visual em ui/visual-editor/), que passa a ser `sobra - a margem do desenho`; a
 * conta garante que a barra, no pé da caixa, nunca passa por cima da linha de baixo.
 */
export type BarPlace = 'fora';

@Directive({ selector: '[appBarOnRuling]' })
export class BarOnRuling implements OnDestroy {
  /** Onde a sobra entra: na margem (`fora`, o único lugar hoje; o nome fica para quem já escreve). */
  readonly appBarOnRuling = input<'fora' | ''>('fora');
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    afterNextRender(() => watchBar(this.el, 'fora'));
  }

  ngOnDestroy(): void {
    unwatchBar(this.el);
  }
}

// um observador para todos (as fichas do mural podem ter muitos blocos)
let observer: ResizeObserver | null = null;
const places = new WeakMap<Element, BarPlace>();
// as sobras novas, escritas no quadro seguinte: mudar o tamanho de quem está sendo observado dentro do
// aviso do observador faz o navegador acusar "ResizeObserver loop completed with undelivered notifications"
const due = new Map<HTMLElement, number>();
let frame = 0;

/** Passa a cuidar da barra de rolar de lado de `scroller` (quem rola), com a sobra no lugar dito. */
export function watchBar(scroller: HTMLElement, place: BarPlace = 'fora'): void {
  if (typeof ResizeObserver === 'undefined') return;
  places.set(scroller, place);
  observer ??= new ResizeObserver((entries) => {
    for (const e of entries) fit(e);
  });
  observer.observe(scroller, { box: 'border-box' });
}

/** Para de cuidar (quem rola saiu da página). */
export function unwatchBar(scroller: HTMLElement): void {
  observer?.unobserve(scroller);
  due.delete(scroller);
}

function fit(e: ResizeObserverEntry): void {
  const el = e.target as HTMLElement;
  const border = e.borderBoxSize?.[0];
  const content = e.contentBoxSize?.[0];
  if (!border || !content) return;
  if (!places.has(el)) return;
  const to = el;
  const s = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  const now = px(getComputedStyle(to).getPropertyValue('--sobra-barra'));
  // tirada a sobra de agora (na margem), fica a margem do desenho
  const pads = px(s.paddingTop) + px(s.paddingBottom) + px(s.borderTopWidth) + px(s.borderBottomWidth);
  const margin = px(s.marginBottom) - now;
  const bar = border.blockSize - content.blockSize - pads;
  const next = barSpare(bar, px(s.lineHeight), margin);
  if (Math.abs(next - now) < 0.05) {
    due.delete(to);
    return;
  }
  due.set(to, next);
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    for (const [t, spare] of due) {
      if (spare) t.style.setProperty('--sobra-barra', `${spare}px`);
      else t.style.removeProperty('--sobra-barra');
    }
    due.clear();
  });
}

/**
 * Quanto o bloco ganha embaixo para a barra (de `bar` px) fechar linhas inteiras da pauta (de `line` px).
 * Com margem negativa embaixo (`marginBottom` < 0), a sobra cobre também ela: a barra, no pé da caixa,
 * não entra na linha de baixo. Sem barra, nada.
 */
export function barSpare(bar: number, line: number, marginBottom: number): number {
  if (bar < 0.5 || !(line > 0)) return 0;
  const lines = Math.ceil((bar + Math.max(0, -marginBottom)) / line - 0.001);
  return Math.round((lines * line - bar) * 100) / 100;
}
