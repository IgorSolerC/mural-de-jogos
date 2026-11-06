import { Directive, ElementRef, OnDestroy, afterNextRender, inject, input } from '@angular/core';

/**
 * A barra de rolar de lado na pauta: o bloco de código e a tabela larga rolam de lado, e onde a barra
 * ocupa lugar (no Windows, no Chrome e no Edge) ela soma uns 10px ao bloco, e todo o texto de baixo saía
 * das linhas. Com a barra, o bloco ganha embaixo o que falta para ela fechar linhas inteiras da pauta
 * (`--sobra-barra`), e a barra fica numa linha só dela. Sem barra (ou com a que flutua por cima, no
 * celular e no Mac), nada muda.
 *
 * Onde a sobra entra é de quem usa (ver ui/rich-text-codigo.scss, a tabela em ui/_formatado.scss e o
 * modo Visual em ui/visual-editor/):
 * - `dentro` (o código da leitura): no padding de baixo de quem rola, e a barra fica no pé do papel;
 * - `fora` (a tabela, que tem margem negativa embaixo para a sombra do papel): na margem de baixo, que
 *   passa a ser `sobra - a margem do desenho`; a conta garante que a barra, no pé da caixa, nunca passa
 *   por cima da linha de baixo;
 * - `pai` (o código do Visual, que rola no `<code>` de dentro do `<pre>`): no padding de baixo do pai.
 */
export type BarPlace = 'dentro' | 'fora' | 'pai';

@Directive({ selector: '[appBarOnRuling]' })
export class BarOnRuling implements OnDestroy {
  /** Onde a sobra entra: no padding de baixo (`dentro`) ou na margem (`fora`). */
  readonly appBarOnRuling = input<'dentro' | 'fora' | ''>('dentro');
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    afterNextRender(() => watchBar(this.el, this.appBarOnRuling() === 'fora' ? 'fora' : 'dentro'));
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
export function watchBar(scroller: HTMLElement, place: BarPlace = 'dentro'): void {
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
  due.delete(target(scroller));
}

/** Onde a sobra é escrita: em quem rola, ou no pai (`pai`). */
function target(scroller: HTMLElement): HTMLElement {
  return places.get(scroller) === 'pai' ? (scroller.parentElement ?? scroller) : scroller;
}

function fit(e: ResizeObserverEntry): void {
  const el = e.target as HTMLElement;
  const border = e.borderBoxSize?.[0];
  const content = e.contentBoxSize?.[0];
  if (!border || !content) return;
  const place = places.get(el) ?? 'dentro';
  const to = target(el);
  const s = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  const now = px(getComputedStyle(to).getPropertyValue('--sobra-barra'));
  // tirada a sobra de agora (quando ela está em quem rola), ficam o padding e a margem do desenho
  const inPadding = place === 'dentro' ? now : 0;
  const pads = px(s.paddingTop) + px(s.paddingBottom) - inPadding + px(s.borderTopWidth) + px(s.borderBottomWidth);
  const margin = px(s.marginBottom) - (place === 'fora' ? now : 0);
  const bar = border.blockSize - inPadding - content.blockSize - pads;
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
