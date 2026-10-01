/**
 * O véu das fichas: a ficha cujo papel ainda não está pronto no tamanho dela fica escondida
 * (`data-veu`, ver styles.scss) em vez de aparecer com o desenho velho, e entra com um fade quando
 * o papel novo fica pronto (ver a fila do papel em paper-layer.ts).
 *
 * Esconder é `visibility: hidden`, não opacidade: a ficha escondida não é pintada (nem rasterizada,
 * o caro dos filtros do papel) e não recebe clique. Entrar é só opacidade e escala, no compositor.
 * As fichas que ficam prontas juntas entram uma depois da outra, na ordem em que ficaram prontas
 * (a fila trabalha de cima para baixo), como cartas sendo distribuídas.
 */

/** O intervalo entre uma ficha e a seguinte entrando. */
const STAGGER = 28;
/** A cascata nunca atrasa uma ficha mais que isto: com muitas prontas juntas, elas se sobrepõem. */
const MAX_DELAY = 420;
const DURATION = 380;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';

const entering = new WeakMap<Element, Animation>();
let nextAt = 0;

function reduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Esconde a ficha até o papel dela ficar pronto. */
export function veil(card: HTMLElement): void {
  entering.get(card)?.cancel();
  entering.delete(card);
  card.setAttribute('data-veu', '');
}

export function isVeiled(card: Element): boolean {
  return card.hasAttribute('data-veu');
}

/**
 * Tira o véu. Na tela, a ficha entra: aparece e assenta, crescendo a partir da tachinha (a origem
 * da ficha é a tachinha). Longe da tela, só deixa de estar escondida.
 */
export function reveal(card: HTMLElement, onScreen: boolean): void {
  if (!isVeiled(card)) return;
  card.removeAttribute('data-veu');
  if (!onScreen || reduced() || typeof card.animate !== 'function') return;
  const now = performance.now();
  const delay = Math.min(Math.max(0, nextAt - now), MAX_DELAY);
  nextAt = now + delay + STAGGER;
  // `backwards`: durante a espera a ficha já está transparente (e já vai sendo rasterizada)
  const a = card.animate(
    [
      { opacity: 0, scale: '0.965' },
      { opacity: 1, scale: '1' },
    ],
    { duration: DURATION, delay, easing: EASE, fill: 'backwards' },
  );
  entering.set(card, a);
  a.finished.then(
    () => entering.get(card) === a && entering.delete(card),
    () => {},
  );
}
