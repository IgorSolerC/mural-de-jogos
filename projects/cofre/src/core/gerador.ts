/**
 * O gerador de senhas do cofre (seção 10, "Gerador"): uma frase de palavras da lista do cofre ou
 * caracteres sorteados, os dois sem viés (`sortearAte` rejeita a sobra). Com caracteres, a senha tem pelo
 * menos um de cada tipo escolhido: uma sorteada sem algum é jogada fora e sorteada de novo (o que mantém
 * todas as que sobram com a mesma chance).
 */
import { PALAVRAS } from './palavras';
import { sortearAte, sortearFrase, TAMANHO_DA_LISTA } from './sorteio';

export const TIPOS = {
  minusculas: 'abcdefghijkmnopqrstuvwxyz',
  maiusculas: 'ABCDEFGHJKLMNPQRSTUVWXYZ',
  numeros: '23456789',
  simbolos: '!#$%&*+-=?@_~',
} as const;

export type Tipo = keyof typeof TIPOS;

export interface PedidoDeCaracteres {
  readonly tamanho: number;
  readonly tipos: readonly Tipo[];
}

export const TAMANHO_MINIMO = 8;
export const TAMANHO_MAXIMO = 64;
export const PALAVRAS_MINIMAS = 4;
export const PALAVRAS_MAXIMAS = 10;

/** Caracteres sorteados (sem os parecidos: l, I, O, 0, 1), com pelo menos um de cada tipo pedido. */
export function gerarCaracteres(pedido: PedidoDeCaracteres): string {
  const tipos = [...new Set(pedido.tipos)];
  if (!tipos.length) throw new RangeError('escolha pelo menos um tipo de caractere');
  if (!Number.isInteger(pedido.tamanho) || pedido.tamanho < Math.max(TAMANHO_MINIMO, tipos.length) || pedido.tamanho > TAMANHO_MAXIMO) {
    throw new RangeError('tamanho fora do intervalo');
  }
  const alfabeto = tipos.map((t) => TIPOS[t]).join('');
  for (;;) {
    const senha = Array.from({ length: pedido.tamanho }, () => alfabeto[sortearAte(alfabeto.length)]).join('');
    if (tipos.every((t) => [...senha].some((c) => TIPOS[t].includes(c)))) return senha;
  }
}

/** Uma frase de palavras sorteadas da lista do cofre, com hífens. */
export function gerarFrase(palavras: number): string {
  if (!Number.isInteger(palavras) || palavras < PALAVRAS_MINIMAS || palavras > PALAVRAS_MAXIMAS) throw new RangeError('quantidade de palavras fora do intervalo');
  return sortearFrase(PALAVRAS, palavras);
}

/** Os bits de uma senha gerada (o que um atacante que conhece o gerador teria de adivinhar). */
export function bitsGerados(pedido: { readonly frase: number } | PedidoDeCaracteres): number {
  if ('frase' in pedido) return Math.floor(pedido.frase * Math.log2(TAMANHO_DA_LISTA));
  const alfabeto = [...new Set(pedido.tipos)].reduce((n, t) => n + TIPOS[t].length, 0);
  return Math.floor(pedido.tamanho * Math.log2(alfabeto));
}
