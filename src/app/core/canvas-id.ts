/**
 * O id da anotação de um canvas (PLANO-CANVAS.md, 4.1): `cv-` e o id do quadro dele. Sem import nenhum, para
 * review.ts e canvas-link.ts lerem daqui sem ciclo.
 *
 * O elo mora no id, e não só no campo `canvas`, de propósito: um site de antes do canvas (outra aba aberta antes
 * do deploy, outro aparelho) passa a anotação pelo saneamento dele, que não conhece o campo e o joga fora, mas
 * guarda o id. A anotação volta a ser canvas assim que um site novo a lê (`sanitizeNote`). E dois aparelhos que
 * convertem o mesmo quadro (rodada 5) chegam à mesma anotação, sem duplicar na junção.
 */
export const CANVAS_ID_PREFIX = 'cv-';

/** O id de um quadro: 22 letras (o mesmo `ID_RE` de core/free-board.ts). */
const BOARD_ID_RE = /^[A-Za-z0-9_-]{22}$/;

/** O id da anotação do canvas do quadro `boardId`. */
export function canvasNoteId(boardId: string): string {
  return CANVAS_ID_PREFIX + boardId;
}

/** O quadro do canvas, pelo id da anotação; null se o id não é de um canvas. */
export function boardIdOfNote(noteId: unknown): string | null {
  if (typeof noteId !== 'string' || !noteId.startsWith(CANVAS_ID_PREFIX)) return null;
  const board = noteId.slice(CANVAS_ID_PREFIX.length);
  return BOARD_ID_RE.test(board) ? board : null;
}
