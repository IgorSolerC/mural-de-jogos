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

/** A chave de uma categoria ou tag: sem acento e sem caixa, sem espaço nas pontas ("  Estudos " → "estudos"). */
export function labelKey(label: string): string {
  return fold(label.trim());
}

/** A chave de um nome que conta como o mesmo: sem acento, sem caixa e sem espaços a mais ("A  Obra " → "a obra"). */
export function nameKey(name: string): string {
  return fold(name).trim().replace(/\s+/g, ' ');
}

/** O nome como pedaço de id: "Muitos inimigos!" → "muitos-inimigos" (até 48 letras; vazio se não sobrar nada). */
export function slugOf(label: string): string {
  return fold(label)
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48);
}

/** Primeira letra maiúscula: "Séries", "Livro". */
export function cap(s: string): string {
  return s.charAt(0).toUpperCase() + s.slice(1);
}

/** Um rótulo escrito à mão, limpo: "  lista   de compras " → "Lista de compras", com no máximo `max` letras. */
export function cleanLabel(raw: string, max: number): string {
  return cap(raw.replace(/\s+/g, ' ').trim().slice(0, max).trim());
}
