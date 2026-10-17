import { Review } from './review';
import { copyText } from './rich-text';
import { CopyContext } from './widgets';

/**
 * As anotações marcadas no mural (Ctrl+clique), como texto para colar em outro lugar: numeradas na
 * ordem em que foram marcadas, cada uma com o título e o texto sem as marcas de formatação. Os
 * widgets viram a marca deles em palavras ("{audio: https://…}", "{nota: Mercado}", ver `widgetCopy`).
 *
 * ```
 * 1.
 * TÍTULO: Lista de compras
 * DESCRIÇÃO: Pão
 * Café
 * ```
 */
export function notesAsText(notes: readonly Pick<Review, 'game' | 'text'>[], ctx: CopyContext = { now: Date.now() }): string {
  return notes
    .map((n, i) => {
      const text = copyText(n.text ?? '', ctx).trim();
      return `${i + 1}.\nTÍTULO: ${n.game.name.trim()}\nDESCRIÇÃO:${text ? ` ${text}` : ''}`;
    })
    .join('\n\n');
}
