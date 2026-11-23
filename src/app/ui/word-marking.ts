import type { Word } from '../core/dictionary/dictionary';
import { DictionaryMarks } from '../core/dictionary/marks-store';
import { Toasts } from './toast';

/*
 * Marcar uma palavra do Dicionário Japonês com o Desfazer no bilhete: o verbete, a Tabela e a seleção da leitura. À
 * parte do verbete (ui/word-entry.ts) para a leitura marcar sem carregar o dicionário.
 */

/** Marca (ou desmarca) como aprendida. */
export function markLearned(marks: DictionaryMarks, toasts: Toasts, w: Word, on: boolean): void {
  const undo = marks.setLearned(w, on);
  toasts.show(on ? `“${w.text}” marcada como aprendida` : `“${w.text}” voltou para as que faltam aprender`, { label: 'Desfazer', run: undo });
}

/** Liga ou desliga a favorita. */
export function markFavorite(marks: DictionaryMarks, toasts: Toasts, w: Word, on: boolean): void {
  const undo = marks.setFavorite(w.id, on);
  toasts.show(on ? `“${w.text}” está nas favoritas` : `“${w.text}” saiu das favoritas`, { label: 'Desfazer', run: undo });
}
