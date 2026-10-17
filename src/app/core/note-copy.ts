import { Review } from './review';
import { plainText } from './rich-text';

/**
 * As anotações marcadas no mural (Ctrl+clique), como texto para colar em outro lugar: numeradas na
 * ordem em que foram marcadas, cada uma com o título e o texto sem as marcas de formatação.
 *
 * ```
 * 1.
 * TÍTULO: Lista de compras
 * DESCRIÇÃO: Pão
 * Café
 * ```
 */
export function notesAsText(notes: readonly Pick<Review, 'game' | 'text'>[]): string {
  return notes
    .map((n, i) => {
      const text = plainText(n.text ?? '').trim();
      return `${i + 1}.\nTÍTULO: ${n.game.name.trim()}\nDESCRIÇÃO:${text ? ` ${text}` : ''}`;
    })
    .join('\n\n');
}
