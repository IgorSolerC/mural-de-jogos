import { stickerEdge } from '../core/tear';

/**
 * Corta o papel do adesivo picotado no tamanho de `el` (ver `stickerEdge` em core/tear.ts): a
 * máscara vai na variável `--picote` dele, e o CSS de quem chama a aplica no papel. Refaz a conta
 * quando a peça muda de tamanho (a foto que chega, o tamanho trocado, a tela que gira), dentro do
 * aviso do observador, antes de pintar: a máscara não muda o tamanho de nada, e o papel nunca aparece
 * um quadro sem o corte. `scale` diz quanto os dentes crescem (1 = os 6px da tesoura de picotar).
 * Devolve o que desliga o observador.
 */
export function cutSticker(el: HTMLElement, seed: string, scale: () => number): () => void {
  if (typeof ResizeObserver === 'undefined') return () => {};
  let last = '';
  const ro = new ResizeObserver(() => {
    const w = el.offsetWidth;
    const h = el.offsetHeight;
    if (!w || !h) return;
    const k = scale() || 1;
    // o mesmo tamanho (a mesma conta) não regrava a máscara
    const at = `${w}x${h}@${k}`;
    if (at === last) return;
    last = at;
    el.style.setProperty('--picote', stickerEdge(seed, w, h, k));
  });
  ro.observe(el);
  return () => {
    ro.disconnect();
    el.style.removeProperty('--picote');
  };
}

/** Os dentes do picote pela letra da peça: 16px é a tesoura de sempre; a letra maior, dentes maiores. */
export function letterScale(el: HTMLElement): number {
  return (parseFloat(getComputedStyle(el).fontSize) || 16) / 16;
}
