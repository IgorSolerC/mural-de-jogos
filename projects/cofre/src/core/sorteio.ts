/**
 * Sorteios do cofre: a frase de palavras da senha mestra (seção 8.3 do PLANO-COFRE.md) e o número
 * sem viés que ela usa.
 *
 * Sem viés quer dizer que toda palavra da lista tem exatamente a mesma chance. O jeito ingênuo
 * (`aleatório % tamanho`) favorece as primeiras palavras quando 2³² não é múltiplo do tamanho da
 * lista; aqui os sorteios que cairiam nessa sobra são jogados fora e refeitos (rejeição).
 */
import { ErroCofre } from './crypto';

/** Quantas palavras a frase sugerida tem: com 7.776 palavras, 6 dão ~77 bits. */
export const PALAVRAS_DA_FRASE = 6;
/** O tamanho da lista (o mesmo do Diceware: 6⁵). */
export const TAMANHO_DA_LISTA = 7776;
const SEPARADOR = '-';

/** Um número inteiro de 0 a `n - 1`, todos com a mesma chance. */
export function sortearAte(n: number): number {
  if (!Number.isSafeInteger(n) || n < 1 || n > 2 ** 32) throw new RangeError('n fora do intervalo');
  const limite = Math.floor(2 ** 32 / n) * n;
  const caixa = new Uint32Array(1);
  for (;;) {
    crypto.getRandomValues(caixa);
    if (caixa[0] < limite) return caixa[0] % n;
  }
}

/**
 * Confere uma lista de palavras: o tamanho exato, só letras de a a z (sem acento nem cedilha), de
 * 3 a 9 letras, e nenhuma repetida. Uma lista errada enfraqueceria toda frase sorteada dela.
 */
export function conferirLista(lista: readonly string[]): void {
  if (lista.length !== TAMANHO_DA_LISTA) throw new ErroCofre('formato', `a lista tem ${lista.length} palavras, e não ${TAMANHO_DA_LISTA}`);
  const vistas = new Set<string>();
  for (const palavra of lista) {
    if (!/^[a-z]{3,9}$/.test(palavra)) throw new ErroCofre('formato', `palavra fora do formato: "${palavra}"`);
    if (vistas.has(palavra)) throw new ErroCofre('formato', `palavra repetida: "${palavra}"`);
    vistas.add(palavra);
  }
}

/** A frase sugerida: palavras sorteadas da lista, com hífens entre elas. */
export function sortearFrase(lista: readonly string[], palavras = PALAVRAS_DA_FRASE): string {
  conferirLista(lista);
  if (!Number.isSafeInteger(palavras) || palavras < 1) throw new RangeError('quantidade de palavras inválida');
  return Array.from({ length: palavras }, () => lista[sortearAte(lista.length)]).join(SEPARADOR);
}

/** Os bits de uma frase sorteada (o que um atacante que conhece a lista teria de adivinhar). */
export function bitsDaFrase(palavras = PALAVRAS_DA_FRASE, tamanhoDaLista = TAMANHO_DA_LISTA): number {
  return palavras * Math.log2(tamanhoDaLista);
}
