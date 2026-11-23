/**
 * As folhas de letra que ficam fora da página (angular.json, `inject: false`): o <link> entra na primeira vez que
 * alguém precisa, e o navegador só baixa as fatias (`unicode-range`) dos caracteres que estiverem na tela.
 */
function loadSheet(id: string, href: string): void {
  if (typeof document === 'undefined' || document.getElementById(id)) return;
  const link = document.createElement('link');
  link.id = id;
  link.rel = 'stylesheet';
  link.href = href;
  document.head.append(link);
}

/** A Klee One (src/klee-one.scss), o japonês escrito a lápis das cartas de estudo e do Dicionário Japonês. */
export function loadKleeOne(): void {
  loadSheet('folha-klee-one', 'klee-one.css');
}

/** A Yuji Syuku (src/yuji-syuku.scss), o japonês a pincel da lousa do Dicionário Japonês. */
export function loadYujiSyuku(): void {
  loadSheet('folha-yuji-syuku', 'yuji-syuku.css');
}
