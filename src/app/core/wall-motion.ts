import { ApplicationRef, Injectable, inject } from '@angular/core';
import { repaint } from '../ui/paper-layer';
import { settleWall } from './wall-settle';
import { isVeiled, veil } from '../ui/veil';
import { reducedMotion } from './motion';

/** Folga em volta da tela: a sombra, a tachinha e os enfeites passam da caixa da ficha. */
const MARGIN = 240;
/** O sumiço das fichas antes de trocar o tipo de ficha. */
const FADE_OUT = 130;
const WALL = 'app-wall-board [data-ficha]';
/** Quantas fichas andam até a pilha (e saem dela): a de cima e as quatro folhas de trás. */
const MOVERS = 5;
/** O intervalo entre uma ficha e a seguinte saindo da pilha. */
const STAGGER = 50;
/** A parte do caminho até a pilha em que a seção já fecha e as de baixo começam a subir. */
const GATHERED = 0.7;
/** Quanto a ficha encolhe no caminho (e o tamanho de onde ela parte, saindo da pilha). */
const SHRINK = 0.9;
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
  /** O sumiço das fichas antes da troca de tipo de ficha (ver `swap`). */
  private fadingOut: Animation[] = [];
  /** Um fechar de seção juntando as fichas: chamado, termina já (ver `fold`). */
  private pending: (() => void) | null = null;
  /** As fichas saindo da pilha (e as que esperam o papel para sair): cada uma, chamada, para no lugar. */
  private readonly flights = new Set<() => void>();

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
    this.settleFolds();
    if (!animates()) {
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
    this.fadingOut = out;
    setTimeout(() => this.swapNow(out), shown.length ? FADE_OUT : 0);
  }

  private swapNow(out: Animation[]): void {
    const change = this.pendingSwap;
    this.pendingSwap = null;
    this.fadingOut = [];
    if (!change) return;
    const anchor = window.scrollY > 0 ? topCard() : null;
    const cards = Array.from(document.querySelectorAll<HTMLElement>(WALL));
    // todas escondidas até o papel ficar pronto no tamanho novo; as que não mudam também, para a
    // entrada ser uma só, de cima para baixo
    for (const el of cards) veil(el);
    for (const a of out) a.cancel();
    change();
    this.appRef.tick();
    // as fichas da tela no tipo novo, montadas já (as que eram vaga), para a rolagem voltar ao lugar
    // com as alturas de verdade
    settleWall();
    if (anchor?.el.isConnected) keepAt(anchor.el, anchor.top);
    // as etiquetas das seções não têm papel: voltam já, um pouco antes das fichas
    for (const el of Array.from(document.querySelectorAll<HTMLElement>(HEADS))) {
      if (onScreen(el.getBoundingClientRect()))
        el.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 260, easing: 'cubic-bezier(0.16, 1, 0.3, 1)' });
    }
    repaint(document.querySelectorAll(WALL));
  }

  run(change: () => void): void {
    this.finish();
    if (!animates()) {
      change();
      return;
    }
    this.slide(change);
  }

  /**
   * Fecha as seções `folding` (os ids das cabeças, `data-secao`) e abre as `unfolding`, com `change` fazendo a
   * troca (PLANO-ETIQUETAS.md, 5). Fechar: as primeiras fichas da seção que estão na tela andam juntas até o
   * lugar da primeira, encolhendo no caminho e se empilhando com o deslocamento das folhas da pilha; as outras
   * esmaecem. Ao chegar, a seção fecha, a pilha assenta com um leve aperto e as seções seguintes deslizam.
   * Abrir: as seções seguintes deslizam e as primeiras fichas saem da pilha para o lugar delas, uma depois da
   * outra; as outras aparecem esmaecendo. Só o que está na tela anima; com "Movimento reduzido", troca direto.
   * Quem decide o que fecha lê o estado depois de `finish()` (um fechar pela metade conta como feito). `keep`: a
   * seção cuja cabeça se tocou, que fica no mesmo lugar da tela.
   */
  fold(folding: readonly string[], change: () => void, unfolding: readonly string[] = [], keep?: string): void {
    this.finish();
    if (!animates()) {
      change();
      return;
    }
    const { duration, easing } = timing();
    // primeiro, tudo o que se mede (medir depois de mexer no estilo de uma faria o navegador refazer a parede)
    const gathers = folding.map((id) => ({ id, g: gatherOf(id) }));
    const plans = gathers.flatMap(({ g }) =>
      g
        ? g.movers.map((box, k) => {
            const card = cardIn(box);
            const at = box.getBoundingClientRect();
            const turn = g.tilt - (card ? angleOf(card) : 0);
            const drop = g.drop - (card?.offsetTop ?? 0);
            return { box, k, mid: pileTransform(at, g.target, turn * 0.6, k * 0.6, SHRINK, drop, 0.6), end: pileTransform(at, g.target, turn, k, 1, drop) };
          })
        : [],
    );
    // onde cada pilha se forma (o lugar da primeira ficha): a pilha nova parte de lá
    const landing = new Map<string, DOMRect>();
    for (const { id, g } of gathers) if (g) landing.set(id, g.target);
    const anims: Animation[] = [];
    for (const { box, k, mid, end } of plans) {
      // (por cima das outras, e a de cima por cima de todas, como na pilha)
      box.style.zIndex = String(MOVERS + 1 - k);
      box.style.transformOrigin = '50% 12px';
      anims.push(box.animate([{ transform: 'none' }, { transform: mid, offset: 0.6 }, { transform: end }], { duration, easing, fill: 'forwards' }));
    }
    for (const { g } of gathers) {
      for (const box of g?.fading ?? []) anims.push(box.animate([{ opacity: 1 }, { opacity: 0 }], { duration: duration * 0.6, easing: 'cubic-bezier(0.4, 0, 1, 1)', fill: 'forwards' }));
    }
    let timer: ReturnType<typeof setTimeout> | undefined;
    const apply = () => {
      this.pending = null;
      clearTimeout(timer);
      for (const a of anims) a.cancel();
      for (const { box } of plans) unlift(box);
      this.settle(folding, unfolding, change, landing, keep);
    };
    if (!anims.length) {
      apply();
      return;
    }
    // (o relógio, e não o fim da animação: numa aba escondida, animação nenhuma termina). A troca vem quando as
    // fichas já estão quase empilhadas (a curva física chega lá cedo): esperar o fim deixava a parede vazia embaixo
    // da pilha antes de as seções de baixo começarem a subir
    timer = setTimeout(apply, Math.round(duration * GATHERED));
    this.pending = apply;
  }

  /** Abre as seções `unfolding` (ver `fold`); `keep`, a seção cuja cabeça fica no lugar da tela. */
  unfold(unfolding: readonly string[], change: () => void, keep?: string): void {
    this.fold([], change, unfolding, keep);
  }

  /**
   * Termina já o que ainda está andando: o fechar juntando as fichas, as fichas saindo da pilha e a troca de
   * tipo de ficha esperando o sumiço. Antes de outra troca começar (que mede a parede), e nos testes.
   */
  finish(): void {
    this.settleFolds();
    if (this.pendingSwap) this.swapNow(this.fadingOut);
  }

  /** O fechar pela metade termina, e as fichas que ainda saíam da pilha param no lugar delas. */
  private settleFolds(): void {
    for (const stop of [...this.flights]) stop();
    this.flights.clear();
    this.pending?.();
  }

  /** A troca das seções: as de baixo deslizam, a pilha nova assenta e as fichas da que abriu saem da pilha. */
  private settle(folding: readonly string[], unfolding: readonly string[], change: () => void, landing: ReadonlyMap<string, DOMRect>, keep?: string): void {
    // de onde as fichas da que abre saem: a ficha de cima da pilha, ainda na tela
    const piles = new Map<string, { box: DOMRect; tilt: number; drop: number }>();
    for (const id of unfolding) {
      const top = pileOf(id)?.querySelector<HTMLElement>('.pilha-ficha .lugar');
      const r = top?.getBoundingClientRect();
      const card = top ? cardIn(top) : null;
      if (top && r && onScreen(r)) piles.set(id, { box: r, tilt: angleOf(card ?? top), drop: card?.offsetTop ?? 0 });
    }
    const headOf = (id: string) => document.querySelector<HTMLElement>(`app-section-head[data-secao="${CSS.escape(id)}"]`);
    const heads = [...folding, ...unfolding].map(headOf);
    const sections = new Set(heads.flatMap((h) => h?.closest('section.grupo') ?? []));
    // a cabeça que se tocou (`keep`; sem ela, a primeira das tocadas na tela) fica no mesmo lugar da tela, com o
    // foco nela: a seção que fecha pode subir para a fileira de cima, e a que abre descer para uma só dela, ou as
    // de cima fecharem (Alt + clique); a rolagem acompanha, para ela não sair da tela
    const touched = keep ? headOf(keep) : null;
    const head = touched && onScreen(touched.getBoundingClientRect()) ? touched : heads.find((h) => h && onScreen(h.getBoundingClientRect()));
    // (a cabeça desliza como as outras; a pilha e as fichas das seções tocadas, este faz andar)
    this.slide(change, (el) => !el.matches('app-section-head') && sections.has(el.closest('section.grupo') as Element), head ?? undefined);
    const { duration, easing } = timing();
    // a pilha que acabou de fechar vai do lugar onde as fichas se juntaram para o lugar dela e assenta: um leve
    // aperto, como quem bate o maço na mesa
    for (const id of folding) {
      const pile = pileOf(id);
      const r = pile?.querySelector('.pilha-ficha .lugar')?.getBoundingClientRect();
      if (!pile || !r || !onScreen(pile.getBoundingClientRect())) continue;
      const was = landing.get(id);
      const dx = was ? was.left - r.left : 0;
      const dy = was ? was.top - r.top : 0;
      if (Math.abs(dx) < 1 && Math.abs(dy) < 1) {
        pile.animate([{ transform: 'none' }, { transform: 'scale(0.965)', offset: 0.35 }, { transform: 'none' }], { duration: 260, easing: 'cubic-bezier(0.33, 1, 0.68, 1)' });
        continue;
      }
      pile.animate([{ transform: `translate(${dx}px, ${dy}px)` }, { transform: 'scale(0.965)', offset: 0.75 }, { transform: 'none' }], { duration: duration + 80, easing });
    }
    for (const id of unfolding) {
      const from = piles.get(id);
      const boxes = sectionBoxes(id).filter((b) => onScreen(b.getBoundingClientRect()));
      if (!from) {
        for (const box of boxes) box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 160, easing: 'linear' });
        continue;
      }
      // as primeiras saem da pilha, uma depois da outra (a de cima, que já estava lá, quase não anda); as
      // outras aparecem esmaecendo. Primeiro o que se mede, depois o que se mexe.
      const starts = boxes.slice(0, MOVERS).map((box, i) => {
        const card = cardIn(box);
        return pileTransform(box.getBoundingClientRect(), from.box, from.tilt - (card ? angleOf(card) : 0), i, i ? SHRINK : 1, from.drop - (card?.offsetTop ?? 0));
      });
      boxes.forEach((box, i) => {
        if (i >= MOVERS) {
          box.animate([{ opacity: 0 }, { opacity: 1 }], { duration: 240, delay: MOVERS * STAGGER, easing: 'linear', fill: 'backwards' });
          return;
        }
        // a que ainda espera o papel (velada, ver veil.ts) sai da pilha quando ele fica pronto, junto com a entrada dela
        const card = cardIn(box);
        if (!card || isVeiled(card) || card.hasAttribute('data-vaga')) this.whenReady(box, (wait) => this.fly(box, i, starts[i], wait + i * STAGGER));
        else this.fly(box, i, starts[i], i * STAGGER);
      });
    }
  }

  /** Uma ficha saindo da pilha (`start`) para o lugar dela, depois de `delay`. */
  private fly(box: HTMLElement, i: number, start: string, delay: number): void {
    const { duration, easing } = timing();
    box.style.zIndex = String(MOVERS + 1 - i);
    box.style.transformOrigin = '50% 12px';
    const a = box.animate([{ transform: start }, { transform: 'none' }], { duration, delay, easing, fill: 'backwards' });
    // (o relógio também: a animação parada, numa aba escondida, não termina)
    const timer = setTimeout(() => stop(), delay + duration + 40);
    const stop = () => {
      if (!this.flights.delete(stop)) return;
      clearTimeout(timer);
      a.cancel();
      unlift(box);
    };
    this.flights.add(stop);
    a.finished.then(stop, stop);
  }

  /**
   * Espera a ficha do lugar ficar pronta (a vaga virar ficha e o véu sair, ver veil.ts) e chama `go` com o
   * atraso da entrada dela (`--entrada`), para sair da pilha junto com o fade. Desiste depois de um tempo, ou
   * quando outra troca começa: a ficha entra no lugar, sem sair da pilha.
   */
  private whenReady(box: HTMLElement, go: (wait: number) => void): void {
    const watch = new MutationObserver(() => {
      const card = cardIn(box);
      if (!card || isVeiled(card) || card.hasAttribute('data-vaga')) return;
      stop();
      go(parseFloat(card.style.getPropertyValue('--entrada')) || 0);
    });
    const timer = setTimeout(() => stop(), 1500);
    const stop = () => {
      this.flights.delete(stop);
      watch.disconnect();
      clearTimeout(timer);
    };
    this.flights.add(stop);
    watch.observe(box, { subtree: true, childList: true, attributes: true, attributeFilter: ['data-veu', 'data-vaga'] });
  }

  /**
   * Troca e faz o que mudou de lugar deslizar do lugar antigo para o novo; `skip`: o que outra animação cuida;
   * `keep`: o que fica no mesmo lugar da tela (a rolagem acompanha).
   */
  private slide(change: () => void, skip?: (el: HTMLElement) => boolean, keep?: HTMLElement): void {
    const before = places();
    const kept = keep?.getBoundingClientRect().top;
    change();
    this.appRef.tick();
    // as que vieram para a tela e ainda eram vaga viram ficha antes de medir o lugar de cada uma
    settleWall();
    if (keep?.isConnected && kept !== undefined) keepAt(keep, kept);
    const after = places();

    const { duration, easing } = timing();
    const screen: Box = { top: -MARGIN, left: -MARGIN, bottom: innerHeight + MARGIN, right: innerWidth + MARGIN };

    for (const [key, now] of after) {
      if (skip?.(now.el)) continue;
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

/**
 * As fichas, as cabeças das seções e as pilhas das fechadas, onde estão agora. A mesma ficha pode aparecer mais de
 * uma vez (ordenando por tag, uma em cada seção das tags dela): cada vez é uma, na ordem da página.
 */
function places(): Map<string, Place> {
  const out = new Map<string, Place>();
  const times = new Map<string, number>();
  const all = 'app-wall-board [data-ficha], app-wall-board .grupo-head[data-secao], app-wall-board .guardadas';
  for (const el of Array.from(document.querySelectorAll<HTMLElement>(all))) {
    const id = el.dataset['ficha'];
    const n = id ? (times.get(id) ?? 0) : 0;
    if (id) times.set(id, n + 1);
    // a ficha de cima de uma pilha anda com a pilha (que leva as folhas de trás junto): conta só a pilha. Ela
    // conta na vez dela, porém: ordenando por tag, a cópia da mesma ficha noutra seção continua com o número dela
    if (id && el.closest('.pilha-ficha')) continue;
    // a cabeça e a pilha de uma seção: pela chave da seção
    const key = id ? `f:${id}#${n}` : el.classList.contains('guardadas') ? `p:${el.dataset['pilha']}` : `g:${el.dataset['secao']}`;
    const r = el.getBoundingClientRect();
    if (!r.width && !r.height) continue;
    out.set(key, { el, box: { top: r.top, left: r.left, bottom: r.bottom, right: r.right } });
  }
  return out;
}

/** O tempo e a curva física do site (DESIGN.md: 380ms). */
function timing(): { duration: number; easing: string } {
  const css = getComputedStyle(document.documentElement);
  return { duration: parseFloat(css.getPropertyValue('--t-physical')) || 380, easing: css.getPropertyValue('--ease-physical').trim() || 'ease-out' };
}

/** Anima (sem "Movimento reduzido", num navegador que sabe). */
function animates(): boolean {
  return !reducedMotion() && typeof Element.prototype.animate === 'function';
}

/** Os lugares das fichas de uma seção aberta (a caixa reta de cada uma, ver wall-cards.ts), na ordem. */
function sectionBoxes(id: string): HTMLElement[] {
  const list = document.getElementById(`fichas-${id}`);
  return list ? Array.from(list.querySelectorAll<HTMLElement>(':scope > .lugar[data-lugar]')) : [];
}

/** A pilha de uma seção fechada. */
function pileOf(id: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(`.guardadas[data-pilha="${CSS.escape(id)}"]`);
}

/** A ficha (ou a vaga) dentro do lugar. */
function cardIn(box: HTMLElement): HTMLElement | null {
  return box.querySelector<HTMLElement>(':scope > [data-ficha]');
}

/**
 * O que fechar uma seção faz andar: até cinco fichas da tela (as primeiras que aparecem) vão para o lugar da
 * primeira da seção, onde a pilha fica; as outras da tela, e as que ainda esperam o papel, esmaecem.
 */
function gatherOf(id: string): { movers: HTMLElement[]; fading: HTMLElement[]; target: DOMRect; tilt: number; drop: number } | null {
  const boxes = sectionBoxes(id);
  const first = boxes[0];
  if (!first) return null;
  const movers: HTMLElement[] = [];
  const fading: HTMLElement[] = [];
  for (const box of boxes) {
    if (!onScreen(box.getBoundingClientRect())) continue;
    const card = cardIn(box);
    const ready = !!card && !isVeiled(card) && !card.hasAttribute('data-vaga');
    (ready && movers.length < MOVERS ? movers : fading).push(box);
  }
  if (!movers.length && !fading.length) return null;
  const top = cardIn(first);
  return { movers, fading, target: first.getBoundingClientRect(), tilt: angleOf(top ?? first), drop: top?.offsetTop ?? 0 };
}

/**
 * O caminho de uma ficha (a caixa em `box`) até a pilha em `pile`: a folha `k` da pilha fica mais para a
 * direita, mais para baixo e mais torta (como as folhas de trás, `--k` no wall-board.scss); `turn` é o quanto
 * ela gira para ficar como a de cima, `scale` o tamanho, `drop` a diferença entre o desnível da de cima e o
 * dela (cada ficha desce um tanto dentro do lugar), e `part` o quanto do caminho já andou.
 */
function pileTransform(box: DOMRect, pile: DOMRect, turn: number, k: number, scale: number, drop: number, part = 1): string {
  const depth = Math.min(k, MOVERS - 1);
  const dx = (pile.left + depth * 5 - box.left) * part;
  const dy = (pile.top + depth * 4 + drop - box.top) * part;
  return `translate(${dx}px, ${dy}px) rotate(${turn + depth * 0.9}deg) scale(${(pile.width / (box.width || 1)) * scale})`;
}

/** Tira de um lugar o que a ida para a pilha (ou a saída dela) pôs nele. */
function unlift(box: HTMLElement): void {
  box.style.removeProperty('z-index');
  box.style.removeProperty('transform-origin');
}

/** Rola a página para `el` voltar a ficar em `top` na tela. */
function keepAt(el: HTMLElement, top: number): void {
  const dy = el.getBoundingClientRect().top - top;
  if (Math.abs(dy) > 1) window.scrollBy({ top: dy, behavior: 'instant' });
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
