import { Directive, ElementRef, OnDestroy, afterNextRender, inject, input } from '@angular/core';

/**
 * A barra de rolar de lado na pauta: o bloco de código e a tabela larga rolam de lado, e onde a barra
 * ocupa lugar (no Windows, no Chrome e no Edge) ela soma uns 10px ao bloco, e todo o texto de baixo saía
 * das linhas. Com a barra, o bloco ganha embaixo o que falta para ela fechar linhas inteiras da pauta
 * (`--sobra-barra`), e a barra fica numa linha só dela. Sem barra (ou com a que flutua por cima, no
 * celular e no Mac), nada muda.
 *
 * Onde a sobra entra é de quem usa (ver ui/rich-text-codigo.scss e a tabela em ui/_formatado.scss):
 * - `dentro` (o código): no padding de baixo, e a barra fica no pé do papel;
 * - `fora` (a tabela, que tem margem negativa embaixo para a sombra do papel): na margem de baixo, que
 *   passa a ser `sobra - a margem do desenho`; a conta garante que a barra, no pé da caixa, nunca passa
 *   por cima da linha de baixo.
 */
@Directive({ selector: '[appBarOnRuling]' })
export class BarOnRuling implements OnDestroy {
  /** Onde a sobra entra: no padding de baixo (`dentro`) ou na margem (`fora`). */
  readonly appBarOnRuling = input<'dentro' | 'fora' | ''>('dentro');
  private readonly el = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;

  constructor() {
    afterNextRender(() => {
      places.set(this.el, this.appBarOnRuling() === 'fora' ? 'fora' : 'dentro');
      watch(this.el);
    });
  }

  ngOnDestroy(): void {
    observer?.unobserve(this.el);
    due.delete(this.el);
  }
}

// um observador para todos (as fichas do mural podem ter muitos blocos)
let observer: ResizeObserver | null = null;
const places = new WeakMap<Element, 'dentro' | 'fora'>();
// as sobras novas, escritas no quadro seguinte: mudar o tamanho de quem está sendo observado dentro do
// aviso do observador faz o navegador acusar "ResizeObserver loop completed with undelivered notifications"
const due = new Map<HTMLElement, number>();
let frame = 0;

function watch(el: HTMLElement): void {
  if (typeof ResizeObserver === 'undefined') return;
  observer ??= new ResizeObserver((entries) => {
    for (const e of entries) fit(e);
  });
  observer.observe(el, { box: 'border-box' });
}

function fit(e: ResizeObserverEntry): void {
  const el = e.target as HTMLElement;
  const border = e.borderBoxSize?.[0];
  const content = e.contentBoxSize?.[0];
  if (!border || !content) return;
  const s = getComputedStyle(el);
  const px = (v: string) => parseFloat(v) || 0;
  const now = px(s.getPropertyValue('--sobra-barra'));
  const inside = places.get(el) !== 'fora';
  // tirada a sobra de agora, ficam o padding e a margem do desenho
  const pads = px(s.paddingTop) + px(s.paddingBottom) - (inside ? now : 0) + px(s.borderTopWidth) + px(s.borderBottomWidth);
  const margin = px(s.marginBottom) - (inside ? 0 : now);
  const bar = border.blockSize - (inside ? now : 0) - content.blockSize - pads;
  const next = barSpare(bar, px(s.lineHeight), margin);
  if (Math.abs(next - now) < 0.05) {
    due.delete(el);
    return;
  }
  due.set(el, next);
  frame ||= requestAnimationFrame(() => {
    frame = 0;
    for (const [target, spare] of due) {
      if (spare) target.style.setProperty('--sobra-barra', `${spare}px`);
      else target.style.removeProperty('--sobra-barra');
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
