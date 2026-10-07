import { Review, fold, isNote } from './review';
import { LINK } from './rich-text';

/**
 * Os links entre anotações: "[[Comprar um console]]" no texto de uma anotação aponta para a
 * anotação com esse título. O link é o próprio título, escrito no texto (como numa wiki): dá para
 * ler e digitar na folha, e o backup, a nuvem e a API não mudam. Cada anotação já tem um id único;
 * o título é só como o texto se refere a ela.
 *
 * - O título vale sem diferença de maiúsculas, acentos e espaços repetidos.
 * - Dois títulos iguais: o link abre a mais antiga, para uma anotação nova com o mesmo nome não
 *   roubar os links que já existiam (o editor avisa).
 * - Trocou o título? Os links das outras anotações que apontavam para ela mudam junto (ver
 *   `relinkAfterRename`).
 * - Um link para uma anotação que não existe (ainda, ou não mais) aparece tracejado; no seu mural,
 *   tocar nele cria a anotação com aquele título.
 */

/** A chave de um título: sem maiúsculas, acentos e espaços a mais. */
export function linkKey(title: string): string {
  return fold(title).trim().replace(/\s+/g, ' ');
}

/** Os títulos dos links do texto, como foram escritos. */
export function linksIn(text: string): string[] {
  return [...text.matchAll(LINK)].map((m) => m[1].trim());
}

/** As anotações de uma lista de fichas. */
export function notesOf(list: readonly Review[]): Review[] {
  return list.filter(isNote);
}

/** A anotação do título, entre `notes`: a mais antiga, se houver duas com o mesmo título. */
export function resolveNote(notes: readonly Review[], title: string): Review | null {
  const key = linkKey(title);
  if (!key) return null;
  let best: Review | null = null;
  for (const n of notes) {
    if (linkKey(n.game.name) !== key) continue;
    if (!best || n.createdAt < best.createdAt || (n.createdAt === best.createdAt && n.id < best.id)) best = n;
  }
  return best;
}

/** Troca, no texto, os links para `from` por links para `to` (o resto fica como estava). */
export function renameLinks(text: string, from: string, to: string): string {
  const key = linkKey(from);
  return text.replace(LINK, (all, title: string) => (linkKey(title) === key ? `[[${to.trim()}]]` : all));
}

/**
 * A anotação `before` vai ganhar o título `title`: as outras anotações com links que a abriam
 * passam a apontar para o título novo. Só quando era ela que o link abria (com dois títulos
 * iguais, renomear a mais nova não mexe nos links da mais antiga). Devolve só as que mudaram.
 */
export function relinkAfterRename(notes: readonly Review[], before: Review, title: string, now: string): Review[] {
  const from = before.game.name;
  if (linkKey(from) === linkKey(title) || resolveNote(notes, from)?.id !== before.id) return [];
  const out: Review[] = [];
  for (const n of notes) {
    if (n.id === before.id) continue;
    const text = renameLinks(n.text, from, title);
    if (text !== n.text) out.push({ ...n, text, updatedAt: now });
  }
  return out;
}

/** Outra anotação, que não a `id`, já tem esse título? */
export function sameTitle(notes: readonly Review[], title: string, id: string): Review | null {
  const key = linkKey(title);
  if (!key) return null;
  return notes.find((n) => n.id !== id && linkKey(n.game.name) === key) ?? null;
}

/**
 * O que o texto de uma ficha precisa para desenhar os links: achar a anotação de um título e, se
 * der, abrir (no seu mural ou na leitura) e criar a que não existe (só no seu). Sem `resolve`, o
 * link só aparece, sem saber aonde vai (a ficha no mural de outra pessoa: a leitura é que abre).
 */
export interface NoteLinks {
  resolve?(title: string): Review | null;
  open?(note: Review): void;
  create?(title: string): void;
}
