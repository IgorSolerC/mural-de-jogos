/**
 * O pedaço da tela que o teclado do celular deixa à vista. O navegador do celular abre o teclado por
 * cima da página sem mudar o tamanho dela (só a parte visível encolhe e anda), então o que é fixo na
 * tela (os diálogos, a régua presa em cima do teclado) não sabe onde o teclado começa. Aqui a parte
 * visível vira variáveis no <html>, atualizadas a cada mudança:
 *
 * - `--vv-top`: quanto a parte visível desceu na página (o navegador rola para mostrar o campo);
 * - `--vv-h`: a altura dela (sem o teclado);
 * - a classe `teclado`, com o teclado aberto.
 *
 * No computador as variáveis acompanham a janela e a classe nunca liga.
 */
let watching = false;

export function watchVisualViewport(): void {
  if (watching || typeof window === 'undefined' || !window.visualViewport) return;
  watching = true;
  const vv = window.visualViewport;
  const root = document.documentElement;
  let frame = 0;
  const update = () => {
    frame = 0;
    root.style.setProperty('--vv-top', `${Math.round(vv.offsetTop)}px`);
    root.style.setProperty('--vv-h', `${Math.round(vv.height)}px`);
    root.classList.toggle('teclado', keyboardOpen(window.innerHeight, vv.height, vv.scale));
  };
  const schedule = () => {
    if (!frame) frame = requestAnimationFrame(update);
  };
  vv.addEventListener('resize', schedule);
  vv.addEventListener('scroll', schedule);
  update();
}

/**
 * O teclado está aberto: a parte visível ficou bem mais baixa que a página. Com zoom de pinça ela
 * também encolhe, mas aí não é o teclado.
 */
export function keyboardOpen(pageHeight: number, visibleHeight: number, scale: number): boolean {
  return scale < 1.05 && pageHeight - visibleHeight > 120;
}
