/**
 * O que todo o site faz com texto do mesmo jeito: dobrar para comparar e buscar, e pôr nomes em
 * ordem. Não importa nada: qualquer módulo pode usar, até os que `review.ts` importa, sem ciclo.
 */

/** Normaliza texto para busca: sem acento, minúsculo. */
export function fold(s: string): string {
  return s.normalize('NFD').replace(/[̀-ͯ]/g, '').toLowerCase();
}

/**
 * A ordem dos nomes em todo o site: sem ligar para caixa e acento, e com os números na ordem deles
 * ("Jogo 2" antes de "Jogo 10"). Desempate (id, data) fica com quem ordena.
 */
export const nameCollator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
