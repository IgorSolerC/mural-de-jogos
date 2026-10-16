import { Db } from '../ports';
import { REF_RE } from './review';

/**
 * As fichas que o dono deixa à mostra (as do mural público). O servidor não abre o mural, então o
 * site manda a lista dos ids a cada envio (a parte `fichas`), e as reações, os comentários e os
 * avisos de uma ficha que virou privada (ou foi apagada) deixam de aparecer para os outros, sem sumir
 * do banco: voltando a ficar à mostra, voltam junto.
 *
 * Quem ainda não enviou o mural por um site que manda a lista fica sem ela (`null`), e aí vale tudo,
 * como antes. Um envio sem a parte (de um site antigo) não apaga a lista que já havia.
 */

/** Quantas fichas a lista aceita: o mural inteiro de alguém cabe com folga. */
export const MAX_SHOWN = 10_000;
export const MAX_SHOWN_CHARS = 700_000;

/** A parte `fichas` do envio: a lista limpa em JSON, ou null se não veio (ou não serve). */
export function parseShown(raw: unknown): string | null {
  if (typeof raw !== 'string' || raw.length > MAX_SHOWN_CHARS) return null;
  let data: unknown;
  try {
    data = JSON.parse(raw);
  } catch {
    return null;
  }
  if (!Array.isArray(data)) return null;
  const refs = new Set<string>();
  for (const ref of data) {
    if (refs.size >= MAX_SHOWN) break;
    if (typeof ref === 'string' && REF_RE.test(ref)) refs.add(ref);
  }
  return JSON.stringify([...refs]);
}

/** As fichas à mostra no mural de `ownerId`, ou null se ainda não há lista (vale tudo). */
export async function shownRefs(db: Db, ownerId: string): Promise<ReadonlySet<string> | null> {
  const row = await db.first<{ fichas_publicas: string | null }>('SELECT fichas_publicas FROM usuarios WHERE id = ?', [ownerId]);
  if (!row?.fichas_publicas) return null;
  try {
    const list: unknown = JSON.parse(row.fichas_publicas);
    return Array.isArray(list) ? new Set(list.filter((r): r is string => typeof r === 'string')) : null;
  } catch {
    return null;
  }
}

/** A ficha `ref` está à mostra (ou não há lista)? */
export const isShown = (shown: ReadonlySet<string> | null, ref: string): boolean => !shown || shown.has(ref);

/**
 * O pedaço do SQL que deixa passar só as fichas à mostra do autor (`author` é a tabela `usuarios`
 * dele na consulta, `ref` a coluna da ficha).
 */
export const shownSql = (author: string, ref: string): string =>
  `(${author}.fichas_publicas IS NULL OR ${ref} IN (SELECT value FROM json_each(${author}.fichas_publicas)))`;
