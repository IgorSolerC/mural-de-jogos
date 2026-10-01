import { ApplicationRef, Injectable, inject } from '@angular/core';

/** Folga em volta da tela: a sombra, a tachinha e os enfeites passam da caixa da ficha. */
const MARGIN = 240;

type Box = { top: number; left: number; bottom: number; right: number };

/**
 * As fichas andando para o lugar novo quando o mural muda de ordem, de filtro ou de tipo de ficha.
 * Mede onde cada ficha está, troca, mede de novo e faz cada uma deslizar do lugar antigo para o novo
 * (só translação, que roda no compositor). Antes era uma view transition, que fotografava as fichas
 * antes e depois: com o papel cheio de filtros, a foto levava quase um segundo para ficar pronta, e a
 * capinha estreita esticada na ficha larga ficava enorme no meio do caminho.
 */
@Injectable({ providedIn: 'root' })
export class WallMotion {
  private readonly appRef = inject(ApplicationRef);

  run(change: () => void): void {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof Element.prototype.animate !== 'function') {
      change();
      return;
    }
    const before = places();
    change();
    this.appRef.tick();
    const after = places();

    const css = getComputedStyle(document.documentElement);
    const duration = parseFloat(css.getPropertyValue('--t-physical')) || 380;
    const easing = css.getPropertyValue('--ease-physical').trim() || 'ease-out';
    const screen: Box = { top: -MARGIN, left: -MARGIN, bottom: innerHeight + MARGIN, right: innerWidth + MARGIN };

    for (const [key, now] of after) {
      const was = before.get(key);
      if (!was) {
        // chegou agora (o filtro mostrou de novo): aparece no lugar, como a troca de antes
        if (crosses(now.box, screen)) now.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'linear' });
        continue;
      }
      const dx = was.box.left - now.box.left;
      const dy = was.box.top - now.box.top;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) continue;
      // longe da tela o caminho todo: ninguém vê, e não vale uma camada no compositor
      if (!crosses(cover(was.box, now.box), screen)) continue;
      // a ficha está inclinada: o deslocamento vai no sentido da inclinação, para andar em linha reta na tela
      const a = (-angleOf(now.el) * Math.PI) / 180;
      const x = dx * Math.cos(a) - dy * Math.sin(a);
      const y = dx * Math.sin(a) + dy * Math.cos(a);
      now.el.animate([{ transform: `translate(${x}px, ${y}px)` }, { transform: 'none' }], { duration, easing });
    }
  }
}

interface Place {
  el: HTMLElement;
  box: Box;
}

/** As fichas e as etiquetas das seções do mural, onde estão agora. */
function places(): Map<string, Place> {
  const out = new Map<string, Place>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('app-wall-page [data-ficha], app-wall-page .grupo-head .tape-label'))) {
    const key = el.dataset['ficha'] ? `f:${el.dataset['ficha']}` : `g:${el.id}`;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    out.set(key, { el, box: { top: r.top, left: r.left, bottom: r.bottom, right: r.right } });
  }
  return out;
}

function angleOf(el: HTMLElement): number {
  const r = getComputedStyle(el).rotate;
  return r && r !== 'none' ? parseFloat(r) || 0 : 0;
}

function cover(a: Box, b: Box): Box {
  return {
    top: Math.min(a.top, b.top),
    left: Math.min(a.left, b.left),
    bottom: Math.max(a.bottom, b.bottom),
    right: Math.max(a.right, b.right),
  };
}

function crosses(a: Box, b: Box): boolean {
  return a.top < b.bottom && a.bottom > b.top && a.left < b.right && a.right > b.left;
}
