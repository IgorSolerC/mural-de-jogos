import { DestroyRef, inject, signal } from '@angular/core';
import { reducedMotion } from '../core/motion';

const DURATION = 380;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** O véu e o broche do X: o tempo das folhas (--t-ui). */
const FADE = 160;
/**
 * Até quanto a peça cresce (o vídeo, que enche a tela). A peça pode pedir menos com `data-zoom-max`
 * (o contador e a fita, 2,5; a ficha colada, até o tamanho dela no mural): mais que isso, o mini
 * vira letreiro e a capa pequena borra.
 */
const MAX_ZOOM = 4;
/** Até quanto cresce a peça mais alta que a tela (o texto inteiro de uma nota colada), que rola. */
const TALL_ZOOM = 1.5;
/** A folga até a beirada da tela (a da foto ampliada, ui/image-viewer.ts). */
const MARGIN = 36;
const MARGIN_PHONE = 22;
/**
 * A margem da folha creme por baixo da peça sem papel próprio (o contador, a fita, a ficha colada),
 * em pixels dela (cresce com o zoom): a letra que é tinta no papel não fica no escuro.
 */
const PAPER_PAD = 12;
/** O broche do X: 30 px, metade para fora do canto (13 px). */
const KNOB = 30;
const KNOB_OUT = 13;
const X_PATH = '<path d="M18 6 6 18"/><path d="m6 6 12 12"/>';

/** O que pega o foco do teclado dentro da peça (o Tab fica nela e no X enquanto ela está no alto). */
const FOCUSABLE = 'a[href], button:not([disabled]), input:not([disabled]), select:not([disabled]), textarea:not([disabled]), iframe, video[controls], audio[controls], [tabindex]:not([tabindex="-1"])';

/** Sobe uma peça do texto para o meio da tela; uma por widget (ver `PieceLift`). */
export function pieceLift(): PieceLift {
  const lift = new PieceLift();
  inject(DestroyRef).onDestroy(() => lift.close(true));
  return lift;
}

/**
 * Ampliar um widget que não é a foto (o vídeo, a fita, o contador, a nota colada): a própria peça
 * sobe para o meio da tela, sem sair do lugar dela no texto. Ela vira um `popover` (a camada de
 * cima, fora do corte e do giro da ficha) e cresce por inteiro com `zoom`, do maior tamanho que cabe
 * (até 4 vezes): a letra e os desenhos se redesenham grandes, não esticados. Como é a mesma peça,
 * o que ela fazia continua: o vídeo tocando, a fita girando, o contador andando. A foto tem o
 * visor dela (ui/image-viewer.ts), que mostra o arquivo no tamanho dele. A peça mais alta que a
 * tela (o texto inteiro de uma nota colada) cresce pouco e rola.
 *
 * O resto é o da foto ampliada: o véu escuro das folhas, o broche do X preso no canto de cima da
 * peça (outro popover, ao lado dela, por cima, para não rolar nem crescer junto), o voo do lugar dela até o
 * meio (desentortando) e de volta, e fechar no X, no Esc, tocando fora; o Tab anda só entre o X e o
 * que se toca na peça. O lugar dela no texto fica guardado, vazio, enquanto ela está fora. O jeito dela no alto (sem a borda e o fundo do popover,
 * reta, por cima) é o `.erguida` de styles.scss.
 *
 * A peça diz como subir: `data-ergue-justo` (a largura é a do que está desenhado dentro, marcado
 * com `data-ergue-largura`, não a da linha: a figura do vídeo ocupa a linha), `data-ergue-giro` no filho que é torto (o giro que o voo desfaz),
 * `data-ergue-canto` no filho em cujo canto vai o X (a foto, e não a etiqueta que passa dela),
 * `data-zoom-max` e `data-papel-proprio` (sem a folha creme).
 */
export class PieceLift {
  /** A peça está no meio da tela. */
  readonly open = signal(false);
  private piece: HTMLElement | null = null;
  private back: HTMLElement | null = null;
  private shut: HTMLButtonElement | null = null;
  /** Onde a peça estava, em relação ao canto do lugar dela (para voltar para lá). */
  private spot = { dx: 0, dy: 0, w: 0, h: 0, tilt: 'none' };
  /** O tamanho dela no alto, antes do zoom (com a folha creme, se ganhou uma). */
  private size = { w: 0, h: 0 };
  private restore: (() => void)[] = [];
  private closing = false;

  /** Sobe a peça (ou desce, se ela já está no alto). */
  toggle(piece: HTMLElement): void {
    if (this.open()) this.close();
    else this.lift(piece);
  }

  lift(piece: HTMLElement): void {
    if (this.piece || typeof piece.showPopover !== 'function') return;
    const parent = piece.parentElement;
    if (!parent) return;
    this.piece = piece;
    this.back = document.activeElement instanceof HTMLElement ? document.activeElement : null;
    this.closing = false;

    // onde ela está: o tamanho de verdade (o do layout, sem o giro) e o canto, em relação ao lugar
    const from = piece.getBoundingClientRect();
    const place = parent.getBoundingClientRect();
    const w = piece.hasAttribute('data-ergue-justo') ? contentWidth(piece) : piece.offsetWidth;
    const h = piece.offsetHeight;
    const tilt = getComputedStyle(piece.querySelector<HTMLElement>('[data-ergue-giro]') ?? piece).rotate;
    this.spot = { dx: from.left - place.left, dy: from.top - place.top, w, h, tilt };

    // a peça sem papel próprio ganha a folha creme por baixo, com a margem em volta
    const look = getComputedStyle(piece);
    // (`data-papel-proprio`: a peça transparente que é papel por inteiro, como a ficha colada)
    const bare = !piece.hasAttribute('data-papel-proprio') && look.backgroundColor === 'rgba(0, 0, 0, 0)' && look.backgroundImage === 'none';
    const pad = bare ? PAPER_PAD : 0;
    this.size = { w: w + 2 * pad, h: h + 2 * pad };

    // o lugar fica guardado (o texto não pula), e a peça fica do tamanho que tinha
    this.keep(parent, { minWidth: `${parent.offsetWidth}px`, minHeight: `${parent.offsetHeight}px` });
    this.keep(piece, { width: `${this.size.w}px`, height: `${this.size.h}px`, boxSizing: 'border-box' });
    if (bare) {
      const side = (k: 'Top' | 'Right' | 'Bottom' | 'Left') => `${(parseFloat(look[`padding${k}`]) || 0) + pad}px`;
      this.keep(piece, { padding: `${side('Top')} ${side('Right')} ${side('Bottom')} ${side('Left')}` });
      piece.classList.add('erguida-papel');
    }
    this.fit();
    piece.classList.add('erguida');
    piece.setAttribute('popover', 'manual');
    piece.showPopover();
    this.open.set(true);

    // o broche do X: outro popover, por cima da peça, preso no canto de cima dela. Fica ao lado da
    // peça (não no body): com a leitura aberta, o que está fora dela não se toca nem pega o foco
    const shut = document.createElement('button');
    shut.type = 'button';
    shut.className = 'erguida-fechar';
    shut.setAttribute('popover', 'manual');
    shut.setAttribute('aria-label', 'Voltar ao tamanho do texto');
    shut.title = 'Fechar';
    shut.innerHTML = `<span class="face"><svg viewBox="0 0 24 24" aria-hidden="true">${X_PATH}</svg></span>`;
    shut.addEventListener('click', this.onShut);
    piece.after(shut);
    shut.showPopover();
    this.shut = shut;
    this.pinShut();
    shut.focus({ preventScroll: true });

    document.addEventListener('keydown', this.onKey, true);
    document.addEventListener('click', this.onOutside, true);
    piece.addEventListener('click', this.onInside);
    window.addEventListener('resize', this.onResize);

    const flight = this.flight(from);
    if (flight) {
      piece.animate([{ transform: flight }, { transform: 'none' }], { duration: DURATION, easing: EASE });
      // o X é preso quando a peça chega
      shut.animate([{ opacity: 0 }, { opacity: 1 }], { duration: FADE, delay: DURATION - FADE, easing: 'linear', fill: 'backwards' });
    }
    this.fadeBackdrop(0, 1);
  }

  /** Desce a peça de volta para o lugar dela (`now`: sem o voo, como quando o widget sai da tela). */
  close(now = false): void {
    const piece = this.piece;
    if (!piece || this.closing) return;
    this.closing = true;
    document.removeEventListener('keydown', this.onKey, true);
    document.removeEventListener('click', this.onOutside, true);
    piece.removeEventListener('click', this.onInside);
    window.removeEventListener('resize', this.onResize);
    const done = (): void => {
      this.shut?.remove();
      this.shut = null;
      if (piece.matches(':popover-open')) piece.hidePopover();
      piece.removeAttribute('popover');
      piece.classList.remove('erguida', 'erguida-papel');
      for (const undo of this.restore.splice(0).reverse()) undo();
      this.piece = null;
      this.open.set(false);
      if (!now && this.back?.isConnected) this.back.focus({ preventScroll: true });
      this.back = null;
    };
    const parent = piece.parentElement;
    if (now || !parent || !piece.isConnected) return done();
    // o X sai primeiro; a peça volta para onde estava, se o lugar ainda está na tela
    this.shut?.animate([{ opacity: 1 }, { opacity: 0 }], { duration: 100, easing: 'linear', fill: 'forwards' });
    const place = parent.getBoundingClientRect();
    const flight = this.flight({ left: place.left + this.spot.dx, top: place.top + this.spot.dy });
    const away = flight
      ? piece.animate([{ transform: 'none' }, { transform: flight }], { duration: DURATION * 0.8, easing: EASE, fill: 'forwards' })
      : reducedMotion() || typeof piece.animate !== 'function'
        ? null
        : piece.animate([{ opacity: 1 }, { opacity: 0 }], { duration: FADE, easing: 'linear', fill: 'forwards' });
    if (!away) return done();
    this.fadeBackdrop(1, 0, Math.max(0, (away.effect?.getTiming().duration as number) - FADE));
    void away.finished.then(() => {
      done();
      away.cancel();
    }, done);
  }

  /**
   * O zoom que põe a peça do maior tamanho que cabe na tela (com a folga), até MAX_ZOOM. A mais alta
   * que a tela cresce até a largura (no máximo TALL_ZOOM) e rola.
   */
  private fit(): void {
    const piece = this.piece!;
    const { w, h } = this.size;
    const m = innerWidth <= 600 ? MARGIN_PHONE : MARGIN;
    const roomW = innerWidth - 2 * m;
    const roomH = innerHeight - 2 * m;
    const tall = h > roomH;
    const most = Math.min(MAX_ZOOM, Number(piece.dataset['zoomMax']) || MAX_ZOOM);
    const zoom = tall ? Math.min(roomW / w, TALL_ZOOM, most) : Math.min(roomW / w, roomH / h, most);
    const z = Math.max(0.25, Math.round(zoom * 1000) / 1000);
    piece.style.setProperty('--erguida-zoom', String(z));
    piece.style.setProperty('--erguida-alto', tall ? `${Math.floor(roomH / z)}px` : 'none');
    piece.classList.toggle('erguida-rola', tall);
  }

  /** O X no canto de cima da peça (ou do filho que ela marca com `data-ergue-canto`), metade para fora. */
  private pinShut(): void {
    const piece = this.piece;
    const shut = this.shut;
    if (!piece || !shut) return;
    const r = (piece.querySelector<HTMLElement>('[data-ergue-canto]') ?? piece).getBoundingClientRect();
    shut.style.top = `${Math.round(r.top - KNOB_OUT)}px`;
    shut.style.left = `${Math.round(r.right + KNOB_OUT - KNOB)}px`;
  }

  /**
   * O caminho da peça no meio da tela até `to` (o canto dela no texto), no tamanho e no giro de lá.
   * Sem movimento (pedido no sistema, ou o lugar fora da tela), nada: ela só aparece.
   */
  private flight(to: { left: number; top: number }): string | null {
    const piece = this.piece!;
    if (reducedMotion() || typeof piece.animate !== 'function') return null;
    const { w, h, tilt } = this.spot;
    if (to.top + h < 0 || to.top > innerHeight || to.left + w < 0 || to.left > innerWidth) return null;
    const now = piece.getBoundingClientRect();
    const zoom = Number(piece.style.getPropertyValue('--erguida-zoom')) || 1;
    // (o transform da peça com zoom anda em pixels dela: os da tela, divididos pelo zoom)
    const dx = (to.left + w / 2 - (now.left + now.width / 2)) / zoom;
    const dy = (to.top + h / 2 - (now.top + now.height / 2)) / zoom;
    return `translate(${dx}px, ${dy}px) rotate(${tilt === 'none' ? '0deg' : tilt}) scale(${1 / zoom})`;
  }

  private fadeBackdrop(start: number, end: number, delay = 0): void {
    try {
      this.piece?.animate([{ opacity: start }, { opacity: end }], { duration: FADE, delay, easing: 'linear', fill: 'both', pseudoElement: '::backdrop' });
    } catch {
      // sem animar o fundo (o navegador não deixa): ele só aparece
    }
  }

  /** Muda o estilo da peça (ou do lugar) até ela descer. */
  private keep(el: HTMLElement, styles: Partial<Record<'width' | 'height' | 'minWidth' | 'minHeight' | 'boxSizing' | 'padding', string>>): void {
    for (const [k, v] of Object.entries(styles) as [keyof typeof styles, string][]) {
      const before = el.style[k];
      el.style[k] = v;
      this.restore.push(() => (el.style[k] = before));
    }
    if (el === this.piece && !this.restore.some((u) => u === this.unfit))
      this.restore.push(this.unfit);
  }

  /** Tira o zoom e a rolagem da peça, quando ela desce. */
  private readonly unfit = (): void => {
    const el = this.piece;
    if (!el) return;
    el.style.removeProperty('--erguida-zoom');
    el.style.removeProperty('--erguida-alto');
    el.classList.remove('erguida-rola');
  };

  private readonly onShut = (e: Event): void => {
    e.stopPropagation();
    this.close();
  };

  private readonly onKey = (e: KeyboardEvent): void => {
    if (e.key === 'Tab') return this.trap(e);
    if (e.key !== 'Escape') return;
    // o Esc é da peça: a leitura por baixo não fecha
    e.preventDefault();
    e.stopPropagation();
    this.close();
  };

  /** O Tab dá a volta entre o X e o que se toca na peça: nunca vai para o que está atrás do véu. */
  private trap(e: KeyboardEvent): void {
    const piece = this.piece;
    const shut = this.shut;
    if (!piece || !shut) return;
    const inside = [...piece.querySelectorAll<HTMLElement>(FOCUSABLE)].filter((el) => el.getClientRects().length > 0 && !el.closest('[inert]'));
    const ring = [shut, ...inside];
    const at = ring.indexOf(document.activeElement as HTMLElement);
    const next = ring[(at + (e.shiftKey ? -1 : 1) + ring.length) % ring.length];
    e.preventDefault();
    e.stopPropagation();
    next.focus();
  }

  /** Um toque fora da peça (no véu) a desce, e não chega no que está por baixo. */
  private readonly onOutside = (e: MouseEvent): void => {
    const piece = this.piece;
    if (!piece) return;
    const at = e.target as Node | null;
    if (at === this.shut || (at && this.shut?.contains(at))) return;
    const r = piece.getBoundingClientRect();
    const inPiece = !!at && piece.contains(at) && (at !== piece || (e.clientX >= r.left && e.clientX <= r.right && e.clientY >= r.top && e.clientY <= r.bottom));
    if (inPiece) return;
    e.preventDefault();
    e.stopPropagation();
    this.close();
  };

  /** O que se toca dentro da peça fica nela (não sobe até a ficha de fora, que abriria a leitura). */
  private readonly onInside = (e: Event): void => e.stopPropagation();

  private readonly onResize = (): void => {
    if (!this.piece) return;
    this.fit();
    this.pinShut();
  };
}

/**
 * A largura do que está desenhado na peça (o que ela marca com `data-ergue-largura`: a foto, a
 * etiqueta), do canto esquerdo dela, sem o vazio da linha.
 */
function contentWidth(piece: HTMLElement): number {
  const left = piece.getBoundingClientRect().left;
  let w = 0;
  for (const part of piece.querySelectorAll<HTMLElement>('[data-ergue-largura]')) w = Math.max(w, part.getBoundingClientRect().right - left);
  return Math.ceil(w) || piece.offsetWidth;
}
