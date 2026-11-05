/**
 * A rolagem que sobra de outro teste, nos testes do site.
 *
 * O teste que deixa a página rolada e tira a peça comprida no fim faz a página voltar para cima, e o evento
 * `scroll` dessa volta só chega num quadro depois, já dentro do teste seguinte. Para o menu da anotação, que
 * fecha quando a página rola (ui/note-menu.ts), é a pessoa rolando: ele abre e fecha sozinho, e o teste acha o
 * menu vazio, de vez em quando e conforme a ordem. Quem confere o que reage à rolagem espera este antes.
 *
 * (O arquivo termina em .spec.ts para ficar fora do build do site, que exclui os specs.)
 */

const frame = (): Promise<unknown> => new Promise((done) => requestAnimationFrame(done));

/**
 * Espera a rolagem pendente chegar. São dois quadros: a página só volta para cima na conta do layout de um
 * quadro, e o evento sai no começo do quadro seguinte.
 */
export async function scrollSettled(): Promise<void> {
  await frame();
  await frame();
}
