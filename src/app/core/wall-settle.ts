/**
 * O mural só monta as fichas perto da tela (ver pages/wall-cards.ts); as outras são vagas, e viram
 * ficha quando a rolagem chega perto. Dois pedidos de fora chegam ao mural por aqui, num módulo sem
 * dependências (para o mural, o movimento e os diálogos não importarem um ao outro):
 *
 * - `settleWall`: quem troca a ordem ou o tipo de ficha às escondidas e mede onde cada uma foi parar
 *   (core/wall-motion.ts) precisa das fichas da tela montadas já, e não no quadro seguinte;
 * - `napWall`: quem abre um diálogo por cima do mural avisa antes. Abrir (e fechar) um diálogo modal
 *   faz o navegador recalcular o estilo da página inteira; as fichas montadas em volta da tela, que
 *   ninguém vê, dormem antes disso e acordam quando o diálogo fecha.
 */
export interface WallHandle {
  settle(): void;
  nap(): void;
}

const walls = new Set<WallHandle>();

/** O mural se registra para atender aos pedidos; devolve como sair. */
export function onWallSettle(wall: WallHandle): () => void {
  walls.add(wall);
  return () => walls.delete(wall);
}

/** Monta agora as fichas que estão na tela (as de perto vêm nos quadros seguintes). */
export function settleWall(): void {
  for (const wall of walls) wall.settle();
}

/** Um diálogo vai abrir por cima do mural: as fichas fora da tela dormem até ele fechar. */
export function napWall(): void {
  for (const wall of walls) wall.nap();
}
