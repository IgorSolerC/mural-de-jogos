import { Review, fold, isNote } from './review';
import { LINK, lineKind, splitLink } from './rich-text';

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

/** Os títulos dos links do texto, como foram escritos ("[[Título|texto]]" conta o título). */
export function linksIn(text: string): string[] {
  return [...text.matchAll(LINK)].map((m) => splitLink(m[1]).title).filter(Boolean);
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

/** Troca, no texto, os links para `from` por links para `to`; o texto escolhido de cada um fica (o resto, como estava). */
export function renameLinks(text: string, from: string, to: string): string {
  const key = linkKey(from);
  return text.replace(LINK, (all, inner: string) => {
    const bar = inner.indexOf('|');
    const title = bar === -1 ? inner : inner.slice(0, bar);
    if (linkKey(title) !== key) return all;
    return bar === -1 ? `[[${to.trim()}]]` : `[[${to.trim()}${inner.slice(bar)}]]`;
  });
}

/** Um título que um link consegue escrever: "[[Compras [casa]]]" não seria lido como link (e "|" separa o texto). */
export function linkableTitle(title: string): boolean {
  return !!linkKey(title) && !/[[\]|]/.test(title);
}

/**
 * A anotação `before` vai ganhar o título `title`: as outras anotações com links que a abriam
 * passam a apontar para o título novo. Só quando era ela que o link abria (com dois títulos
 * iguais, renomear a mais nova não mexe nos links da mais antiga) e quando o link novo também vai
 * abrir ela: com o título de uma anotação mais antiga, o link levaria para aquela, e os links
 * ficam como estavam. Um título com colchetes não cabe num link: nada muda. Devolve só as que
 * mudaram.
 */
export function relinkAfterRename(notes: readonly Review[], before: Review, title: string, now: string): Review[] {
  const from = before.game.name;
  if (linkKey(from) === linkKey(title) || !linkableTitle(title) || resolveNote(notes, from)?.id !== before.id) return [];
  const renamed = notes.map((n) => (n.id === before.id ? { ...n, game: { ...n.game, name: title } } : n));
  if (resolveNote(renamed, title)?.id !== before.id) return [];
  const out: Review[] = [];
  for (const n of notes) {
    if (n.id === before.id) continue;
    const text = renameLinks(n.text, from, title);
    if (text !== n.text) out.push({ ...n, text, updatedAt: now });
  }
  return out;
}

/**
 * A anotação de que `note` é parte: a que tem um link que abre ela (a mais antiga, se forem várias).
 * É de onde a sub-nota nasceu, ou para onde ela foi ligada depois. Null se nenhuma aponta para ela.
 */
export function parentNoteOf(note: Review, notes: readonly Review[]): Review | null {
  let best: Review | null = null;
  for (const n of notes) {
    if (n.id === note.id || (best && n.createdAt >= best.createdAt)) continue;
    if (linksIn(n.text).some((t) => resolveNote(notes, t)?.id === note.id)) best = n;
  }
  return best;
}

/**
 * As anotações que apontam para `note`: as que têm no texto um link que abre ela, das mais antigas
 * para as mais novas (a primeira é a de que a sub-nota é parte, ver `parentNoteOf`).
 */
export function backlinksOf(note: Review, notes: readonly Review[]): Review[] {
  return notes
    .filter((n) => n.id !== note.id && linksIn(n.text).some((t) => resolveNote(notes, t)?.id === note.id))
    .sort((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id));
}

/**
 * A linha do texto de `from` onde está o link para `note`, para mostrar onde ela é citada: sem a
 * marca da lista ou da tarefa, e o link escrito como aparece ("[[Título|texto]]" vira "texto").
 * Null se nenhuma linha tem o link.
 */
export function backlinkLine(from: Review, note: Review, notes: readonly Review[]): string | null {
  for (const line of from.text.split('\n')) {
    const hit = [...line.matchAll(LINK)].some((m) => resolveNote(notes, splitLink(m[1]).title)?.id === note.id);
    if (!hit) continue;
    return line
      .replace(/^\s*(?:[-*•]\s+(?:\[[ xX]\]\s*)?|\d{1,4}[.)]\s+|#{1,3}\s+|>\s?)/, '')
      .replace(LINK, (_all, inner: string) => splitLink(inner).label)
      .trim();
  }
  return null;
}

/**
 * As anotações ligadas numa tarefa que acabou de ser marcada: os links da linha `line` de `text`,
 * se ela é uma tarefa feita, que abrem uma anotação ainda não finalizada (sem repetir, e nunca a
 * própria `selfId`). É o que a ficha oferece finalizar junto.
 */
export function linkedOnCheckedTask(text: string, line: number, notes: readonly Review[], selfId: string): Review[] {
  const l = text.replace(/\r\n?/g, '\n').split('\n')[line];
  const k = l === undefined ? null : lineKind(l);
  if (k?.kind !== 'check' || !k.done) return [];
  const out: Review[] = [];
  for (const title of linksIn(k.rest)) {
    const n = resolveNote(notes, title);
    if (n && n.id !== selfId && !n.doneAt && !out.includes(n)) out.push(n);
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
