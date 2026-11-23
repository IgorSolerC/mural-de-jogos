/**
 * A folha da Klee One (src/klee-one.scss, fora da página): o <link> entra na primeira vez que uma carta de
 * estudo ou o Dicionário Japonês aparece, e o navegador só baixa as fatias da letra dos caracteres japoneses e chineses que estiverem na tela.
 */
export function loadKleeOne(): void {
  if (typeof document === 'undefined' || document.getElementById('folha-klee-one')) return;
  const link = document.createElement('link');
  link.id = 'folha-klee-one';
  link.rel = 'stylesheet';
  link.href = 'klee-one.css';
  document.head.append(link);
}
