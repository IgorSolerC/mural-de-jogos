import csv from './vocabulario-japones.csv' with { loader: 'text' };
import { Word, WordKeys, keysOf, lookupWords, readWords } from './dictionary';

/**
 * As palavras do Dicionário Japonês (PLANO-DICIONARIO.md), lidas do CSV do dono, que mora ao lado e entra como
 * texto no pedaço da página (nunca no bundle inicial). Trocar a lista é trocar o arquivo. Lidas na primeira vez
 * que alguém pede, não na importação.
 */
let cache: { words: Word[]; keys: Map<string, WordKeys> } | null = null;

export function dictionaryWords(): { words: Word[]; keys: Map<string, WordKeys> } {
  if (!cache) {
    const words = readWords(csv);
    cache = { words, keys: new Map(words.map((w) => [w.id, keysOf(w)])) };
  }
  return cache;
}

/**
 * As palavras que um trecho selecionado é (a seleção da leitura, PLANO-DICIONARIO.md, 4.3). Quem chama importa este
 * arquivo sob demanda: a leitura não carrega o dicionário até alguém selecionar alguma coisa.
 */
export function findWords(text: string): Word[] {
  const { words, keys } = dictionaryWords();
  return lookupWords(words, keys, text);
}
