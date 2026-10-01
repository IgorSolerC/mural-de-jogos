import { ApplicationRef, Injectable, inject } from '@angular/core';
import { Mural } from './mural';

/** Folga em volta da tela: a sombra, a tachinha e os enfeites passam da caixa da ficha. */
const MARGIN = 240;

type Box = { top: number; left: number; bottom: number; right: number };

/** Anima a troca de lugar das fichas com a View Transitions API, quando dá. */
@Injectable({ providedIn: 'root' })
export class ViewTransitions {
  private readonly appRef = inject(ApplicationRef);
  private readonly mural = inject(Mural);
  /** As fichas tiradas da transição em andamento, para devolver o nome delas no fim. */
  private offstage: { el: HTMLElement; name: string }[] = [];

  /**
   * Troca com animação. Com `snapshot` (que guarda o estado e devolve como voltar a ele), só entram na
   * transição as fichas que aparecem na tela antes, depois ou no caminho entre os dois lugares: a
   * troca é feita uma vez às escondidas, para medir onde cada ficha vai parar, e desfeita antes da
   * foto do "antes". As fichas que ficam longe da tela o tempo todo não são fotografadas, e a
   * animação que se vê é a mesma, sem o custo de fotografar o mural inteiro.
   */
  run(change: () => void, snapshot?: () => () => void): void {
    const doc = document as Document & { startViewTransition?: (cb: () => void) => { finished: Promise<unknown> } };
    const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches;
    // Muitas fichas: trocar direto é mais rápido que animar cada uma.
    if (!doc.startViewTransition || reduced || this.mural.count() > 160) {
      change();
      return;
    }
    this.giveNamesBack();
    const hide = snapshot ? this.farAway(change, snapshot) : null;
    if (hide) this.unname(hide);
    const transition = doc.startViewTransition(() => {
      change();
      this.appRef.tick();
      // as que nasceram agora (a etiqueta de uma seção nova) também ficam fora, se ficam longe
      if (hide) this.unname(hide);
    });
    const mine = this.offstage;
    transition.finished.finally(() => {
      if (this.offstage === mine) this.giveNamesBack();
    });
  }

  /** Os nomes das fichas que nem antes, nem depois, nem no caminho passam pela tela. */
  private farAway(change: () => void, snapshot: () => () => void): Set<string> {
    const before = named();
    const x = window.scrollX,
      y = window.scrollY;
    const restore = snapshot();
    change();
    this.appRef.tick();
    const after = named();
    restore();
    this.appRef.tick();
    window.scrollTo({ left: x, top: y, behavior: 'instant' });

    const screen: Box = { top: -MARGIN, left: -MARGIN, bottom: window.innerHeight + MARGIN, right: window.innerWidth + MARGIN };
    const hide = new Set<string>();
    for (const name of new Set([...before.keys(), ...after.keys()])) {
      // a ficha anda em linha reta do lugar antigo ao novo: a caixa que cobre os dois cobre o caminho
      const path = cover(before.get(name), after.get(name));
      if (!crosses(path, screen)) hide.add(name);
    }
    return hide;
  }

  private unname(hide: Set<string>): void {
    for (const el of Array.from(document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]'))) {
      const name = el.style.viewTransitionName;
      if (!name || name === 'none' || !hide.has(name)) continue;
      this.offstage.push({ el, name });
      el.style.viewTransitionName = 'none';
    }
  }

  private giveNamesBack(): void {
    for (const { el, name } of this.offstage) if (el.style.viewTransitionName === 'none') el.style.viewTransitionName = name;
    this.offstage = [];
  }
}

/** Onde está cada elemento com nome de transição, pelo nome. */
function named(): Map<string, Box> {
  const out = new Map<string, Box>();
  for (const el of Array.from(document.querySelectorAll<HTMLElement>('[style*="view-transition-name"]'))) {
    const name = el.style.viewTransitionName;
    if (!name || name === 'none') continue;
    const r = el.getBoundingClientRect();
    out.set(name, { top: r.top, left: r.left, bottom: r.bottom, right: r.right });
  }
  return out;
}

function cover(a: Box | undefined, b: Box | undefined): Box {
  if (!a) return b!;
  if (!b) return a;
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
