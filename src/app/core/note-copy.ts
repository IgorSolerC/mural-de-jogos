import { Review } from './review';
import { copyText } from './rich-text';
import { CopyContext } from './widgets';

/**
 * As anotações marcadas no mural (Ctrl+clique), como texto para colar em outro lugar: cada uma com o
 * título e o texto sem as marcas de formatação, na ordem em que foram marcadas. Duas ou mais saem
 * numeradas; uma só, sem número. Os widgets viram a marca deles em palavras ("{audio: https://…}",
 * "{nota: Mercado}", ver `widgetCopy`).
 *
 * ```
 * 1.
 * TÍTULO: Lista de compras
 * DESCRIÇÃO: Pão
 * Café
 *
 * 2.
 * TÍTULO: Farmácia
 * DESCRIÇÃO: Protetor
 * ```
 */
export function notesAsText(notes: readonly Pick<Review, 'game' | 'text'>[], ctx: CopyContext = { now: Date.now() }): string {
  return notes
    .map((n, i) => {
      const text = copyText(n.text ?? '', ctx).trim();
      const number = notes.length > 1 ? `${i + 1}.\n` : '';
      return `${number}TÍTULO: ${n.game.name.trim()}\nDESCRIÇÃO:${text ? ` ${text}` : ''}`;
    })
    .join('\n\n');
}
