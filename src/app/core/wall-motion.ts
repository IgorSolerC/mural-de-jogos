import { ApplicationRef, Injectable, inject } from '@angular/core';
import { repaint } from '../ui/paper-layer';
import { isVeiled, veil } from '../ui/veil';

/** Folga em volta da tela: a sombra, a tachinha e os enfeites passam da caixa da ficha. */
const MARGIN = 240;
/** O sumiço das fichas antes de trocar o tipo de ficha. */
const FADE_OUT = 130;
const WALL = 'app-wall-board [data-ficha]';
const HEADS = 'app-wall-board .grupo-head, app-wall-board .showing';

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
  /** A troca de tipo de ficha esperando as fichas sumirem (a mais nova, se a pessoa clicou de novo). */
  private pendingSwap: (() => void) | null = null;

  /** Uma troca de tipo de ficha esperando as fichas sumirem. */
  get swapping(): boolean {
    return this.pendingSwap !== null;
  }

  /**
   * Trocar o tipo de ficha (completa, simples, só capa): a ficha muda de forma, e o papel dela tem
   * que ser desenhado de novo no tamanho novo. Deslizar não ajuda (a forma de antes não é a de
   * depois) e o papel novo não fica pronto no mesmo quadro. Então as fichas da tela somem rápido, a
   * troca acontece com todas escondidas (o recálculo de estilo do mural inteiro trava um instante,
   * mas não tem nada na tela para engasgar), a rolagem volta para a mesma ficha que estava no alto, e
   * cada ficha entra quando o papel dela fica pronto, de cima para baixo (ver a fila do papel).
   */
  swap(change: () => void): void {
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduced || typeof Element.prototype.animate !== 'function') {
      change();
      return;
    }
    const fading = this.pendingSwap !== null;
    this.pendingSwap = change;
    // já estão sumindo: a troca mais nova entra no lugar quando acabarem
    if (fading) return;

    const shown = Array.from(document.querySelectorAll<HTMLElement>(`${WALL}, ${HEADS}`)).filter(
      (el) => !isVeiled(el) && onScreen(el.getBoundingClientRect()),
    );
    const from = shown.map((el) => getComputedStyle(el).opacity);
    const out = shown.map((el, i) =>
      el.animate([{ opacity: from[i] }, { opacity: 0 }], { duration: FADE_OUT, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }),
    );
    setTimeout(() => this.swapNow(out), shown.length ? FADE_OUT : 0);
  }

  private swapNow(out: Animation[]): void {
    const change = this.pendingSwap;
    this.pendingSwap = null;
    if (!change) return;
    const anchor = window.scrollY > 0 ? topCard() : null;
    const cards = Array.from(document.querySelectorAll<HTMLElement>(WALL));
    // todas escondidas até o papel ficar pronto no tamanho novo; as que não mudam também, para a
    // entrada ser uma só, de cima para baixo
    for (const el of cards) veil(el);
    for (const a of out) a.cancel();
    change();
    this.appRef.tick();
    if (anchor?.el.isConnected) {
      const dy = anchor.el.getBoundingClientRect().top - anchor.top;
      if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: 'instant' });
    }
    // as etiquetas das seções não têm papel: voltam já, um pouco antes das fichas
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(HEADS))) {
      if (onScreen(el.getBoundingClientRect()))
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
    repaint(document.querySelectorAll(WALL));
  }

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
        // (a que nasceu agora entra sozinha quando o papel fica pronto, ver veil.ts)
        if (crosses(now.box, screen) && !isVeiled(now.el)) now.el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 120, easing: 'linear' });
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
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('app-wall-board [data-ficha], app-wall-board .grupo-head .tape-label'))) {
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

function onScreen(r: DOMRect): boolean {
  return r.bottom > 0 && r.top < innerHeight && r.right > 0 && r.left < innerWidth && (r.width > 0 || r.height > 0);
}

/** A primeira ficha que aparece no alto da tela, e onde ela está: a rolagem volta para ela. */
function topCard(): { el: HTMLElement; top: number } | null {
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(WALL))) {
    const r = el.getBoundingClientRect();
    if (r.bottom > 0 && r.top < innerHeight) return { el, top: r.top };
  }
  return null;
}
