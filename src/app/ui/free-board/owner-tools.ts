/**
 * O que só o dono faz no Quadro livre e a peça do quadro não sabe fazer sozinha (a regra "Visita: as mesmas
 * peças do dono", no CLAUDE.md): escolher uma anotação, guardar imagens, abrir a folha de um widget, abrir uma
 * nota. A página do dono dá isto à peça (`owner`); a visita não dá, e a peça nem mostra o editar.
 */
export interface FreeBoardOwner {
  /** O seletor de fichas com o grupo do quadro na frente; devolve a anotação escolhida, ou null. */
  pickNote(group: string): Promise<{ id: string; title: string } | null>;
  /** A anotação de um título ([[Título]] colado), ou null. */
  findNote(title: string): { id: string; title: string } | null;
  /**
   * Guarda as imagens coladas ou soltas (encolhe a 900 px, sem repetir a mesma); devolve o id e o tamanho de cada,
   * e se ela tem partes transparentes (o PNG sem fundo entra no Recorte, sem o papel branco da foto).
   */
  storeImages(files: readonly Blob[]): Promise<{ id: string; w: number; h: number; alpha?: boolean }[]>;
  /**
   * A folha do widget das anotações, com a linha de agora (ou só o nome, `{{contador}}`, para um novo). Devolve a
   * linha nova, '' se ele foi tirado, ou null se cancelou.
   */
  editWidget(line: string): Promise<string | null>;
  /** Abre a nota (a leitura). */
  openNote(id: string): void;
}
