import { DestroyRef, Directive, ElementRef, afterNextRender, inject } from '@angular/core';

/** A altura de uma linha da grade da colagem: cada peça ocupa quantas couberem na altura dela. */
export const COLLAGE_ROW = 4;
/** O vão embaixo de cada peça, o mesmo entre as colunas (a peça pode pedir mais com `--colagem-pe`, como a fita serrilhada). */
export const COLLAGE_GAP = 20;

/** Quantas linhas uma peça desta altura ocupa, com o vão de baixo. */
export function collageRows(height: number, extra = 0): number {
  return Math.max(1, Math.ceil((height + COLLAGE_GAP + extra) / COLLAGE_ROW));
}

/**
 * A colagem das peças de uma página (os Gastos), como as fichas inteiras do mural de anotações: a grade
 * tem colunas da mesma largura (quantas couberem) e linhas de 4px, e cada peça ocupa as linhas da altura
 * dela, então a seguinte cai no primeiro lugar livre, embaixo da coluna que acabou antes, sem buraco. A
 * diretiva mede cada filho direto (e de novo quando ele muda de tamanho, ou quando entra outro) e escreve
 * `--linhas` nele; quem usa põe na grade `grid-auto-rows: 4px` e, nos filhos, `grid-row-end: span
 * var(--linhas)` e `align-self: start`. A grade só ganha a classe `colagem-medida` depois da primeira
 * medida: sem ela, quem usa deixa a grade comum (as peças nunca se sobrepõem).
 *
 * Uma peça com `data-colagem-segura` só cresce: enquanto ela tem a marca, encolher não devolve as linhas
 * (a fita filtrada fica curta, mas as peças ao lado não pulam de lugar debaixo do dedo); sem a marca,
 * ela volta a ter a altura dela.
 */
@Directive({ selector: '[appColagem]' })
export class Collage {
  constructor() {
    const host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
    if (typeof ResizeObserver === 'undefined') return;
    const fit = (el: HTMLElement, height: number) => {
      const extra = parseFloat(getComputedStyle(el).getPropertyValue('--colagem-pe')) || 0;
      let rows = collageRows(height, extra);
      const before = Number(el.style.getPropertyValue('--linhas')) || 0;
      if (el.hasAttribute('data-colagem-segura')) rows = Math.max(rows, before);
      if (rows !== before) el.style.setProperty('--linhas', String(rows));
    };
    const sizes = new ResizeObserver((entries) => {
      for (const e of entries) fit(e.target as HTMLElement, e.borderBoxSize?.[0]?.blockSize ?? (e.target as HTMLElement).offsetHeight);
      host.classList.add('colagem-medida');
    });
    const watched = new Set<Element>();
    const watch = () => {
      for (const el of host.children) {
        if (watched.has(el)) continue;
        watched.add(el);
        sizes.observe(el);
      }
      for (const el of [...watched]) {
        if (el.parentElement === host) continue;
        watched.delete(el);
        sizes.unobserve(el);
      }
    };
    const children = new MutationObserver(watch);
    // a peça largou a marca de segura: volta à altura dela
    const marks = new MutationObserver((changes) => {
      for (const c of changes) if ((c.target as Element).parentElement === host) fit(c.target as HTMLElement, (c.target as HTMLElement).offsetHeight);
    });
    afterNextRender(() => {
      watch();
      children.observe(host, { childList: true });
      marks.observe(host, { subtree: true, attributeFilter: ['data-colagem-segura'] });
    });
    inject(DestroyRef).onDestroy(() => {
      sizes.disconnect();
      children.disconnect();
      marks.disconnect();
    });
  }
}
