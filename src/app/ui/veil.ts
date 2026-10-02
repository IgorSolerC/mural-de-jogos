/**
 * O véu das fichas: a ficha cujo papel ainda não está pronto no tamanho dela não aparece com o
 * desenho velho. No lugar dela fica a vaga, a marca tracejada na parede com o furo da tachinha
 * (`data-veu`, ver review-card.ts), e a ficha entra por cima da marca com um fade quando o papel novo
 * fica pronto (ver a fila do papel em paper-layer.ts).
 *
 * Esconder é `visibility: hidden` no corpo da ficha, não opacidade: a ficha escondida não é pintada
 * (nem rasterizada, o caro dos filtros do papel) e não recebe clique. Entrar é só opacidade (no corpo)
 * e escala (na ficha), no compositor. As fichas que ficam prontas juntas entram uma depois da outra,
 * na ordem em que ficaram prontas (a fila trabalha de cima para baixo), como cartas sendo distribuídas.
 */

/** O intervalo entre uma ficha e a seguinte entrando. */
const STAGGER = 28;
/**
 * A primeira ficha da cascata espera ao menos isto, já pintada mas quase transparente. Com a
 * opacidade em zero, o navegador não espera a rasterização para mostrar a camada, e a ficha aparecia
 * pela metade no começo do fade (só a textura do papel, a capa e o texto chegando depois).
 */
const MIN_DELAY = 50;
/** A cascata nunca atrasa uma ficha mais que isto: com muitas prontas juntas, elas se sobrepõem. */
const MAX_DELAY = 420;
const DURATION = 380;
const EASE = 'cubic-bezier(0.16, 1, 0.3, 1)';
/** Quase invisível, mas não zero (ver MIN_DELAY). */
const FAINT = 0.02;

const entering = new WeakMap<Element, Animation[]>();
let nextAt = 0;

function reduced(): boolean {
  return typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** O que entra com fade: o corpo da ficha (a vaga tracejada fica na própria ficha, por baixo). */
function bodyOf(card: HTMLElement): HTMLElement {
  return card.querySelector<HTMLElement>(':scope > .corpo') ?? card;
}

function stopEntering(card: HTMLElement): void {
  for (const a of entering.get(card) ?? []) a.cancel();
  entering.delete(card);
  card.removeAttribute('data-entrando');
}

/** Esconde a ficha até o papel dela ficar pronto: no lugar dela, só a vaga. */
export function veil(card: HTMLElement): void {
  stopEntering(card);
  card.setAttribute('data-veu', '');
}

export function isVeiled(card: Element): boolean {
  return card.hasAttribute('data-veu');
}

/**
 * Tira o véu. Na tela, a ficha entra por cima da vaga: aparece e assenta, crescendo a partir da
 * tachinha (a origem da ficha é a tachinha). Longe da tela, só deixa de estar escondida.
 */
export function reveal(card: HTMLElement, onScreen: boolean): void {
  if (!isVeiled(card)) return;
  card.removeAttribute('data-veu');
  if (!onScreen || reduced() || typeof card.animate !== 'function') return;
  const now = performance.now();
  const delay = Math.min(Math.max(MIN_DELAY, nextAt - now), MAX_DELAY);
  nextAt = now + delay + STAGGER;
  // a vaga continua marcada por baixo enquanto a ficha entra
  card.setAttribute('data-entrando', '');
  const timing: KeyframeAnimationOptions = { duration: DURATION, delay, easing: EASE, fill: 'backwards' };
  const fade = bodyOf(card).animate([{ opacity: FAINT }, { opacity: 1 }], timing);
  const settle = card.animate([{ scale: '0.965' }, { scale: '1' }], timing);
  entering.set(card, [fade, settle]);
  fade.finished.then(
    () => {
      if (entering.get(card)?.includes(fade)) {
        entering.delete(card);
        card.removeAttribute('data-entrando');
      }
    },
    () => {},
  );
}
