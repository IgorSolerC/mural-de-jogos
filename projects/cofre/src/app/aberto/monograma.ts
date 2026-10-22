/** O endereço guardado, só se for http ou https (sem esquema, entende como https). */
export function urlSegura(texto: string): string | null {
  const t = texto.trim();
  if (!t) return null;
  try {
    const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(t) ? t : `https://${t}`);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
}

/** As cartolinas do Murall para o monograma de cada senha (a mesma senha cai sempre na mesma cor). */
export const CORES_DO_MONOGRAMA = ['amarelo', 'azul', 'verde', 'rosa', 'laranja', 'lilas'] as const;
export type CorDoMonograma = (typeof CORES_DO_MONOGRAMA)[number];

/** O nome que aparece de um item: o título, senão o site, senão "Sem título". */
export function nomeDoItem(item: { readonly titulo: string; readonly url: string }): string {
  return item.titulo.trim() || dominio(item.url) || item.url.trim() || 'Sem título';
}

/** A letra do monograma: a primeira letra ou número do nome (sem acento), senão "?". */
export function letraDoMonograma(nome: string): string {
  const letra = nome.normalize('NFD').replace(/\p{M}/gu, '').match(/[\p{L}\p{N}]/u)?.[0];
  return letra ? letra.toLocaleUpperCase('pt-BR') : '?';
}

/** A cor do monograma, sorteada pelo nome (sem maiúsculas nem acentos, para não mudar à toa). */
export function corDoMonograma(nome: string): CorDoMonograma {
  const simples = nome.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();
  let h = 0;
  for (const c of simples) h = (h * 31 + c.codePointAt(0)!) >>> 0;
  return CORES_DO_MONOGRAMA[h % CORES_DO_MONOGRAMA.length]!;
}

/** O endereço guardado só com o nome do site ("banco.exemplo"), sem o www; vazio se não for um site. */
export function dominio(url: string): string {
  const seguro = urlSegura(url);
  return seguro ? new URL(seguro).hostname.replace(/^www\./, '') : '';
}
