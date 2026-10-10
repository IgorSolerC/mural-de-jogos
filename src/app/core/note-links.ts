import { Review, fold, isNote } from './review';
import { LINK, lineKind, linesOf, noteLinksOf, proseLines, replaceNoteLinks, splitLink, tasksOf } from './rich-text';

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

/**
 * Os títulos dos links do texto, como foram escritos ("[[Título|texto]]" conta o título). Só os que a
 * leitura mostra como link: os de dentro de um código ou escapados ("\[[x]]") são texto.
 */
export function linksIn(text: string): string[] {
  return proseLines(text)
    .flatMap(({ line }) => noteLinksOf(line))
    .map((l) => splitLink(l.inner).title)
    .filter(Boolean);
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
  const rename = (inner: string, all: string) => {
    const bar = inner.indexOf('|');
    const title = bar === -1 ? inner : inner.slice(0, bar);
    if (linkKey(title) !== key) return all;
    return bar === -1 ? `[[${to.trim()}]]` : `[[${to.trim()}${inner.slice(bar)}]]`;
  };
  // só os links que a leitura mostra (ver `linksIn`): o código e os escapados ficam como estão
  const prose = new Set(proseLines(text).map((l) => l.at));
  const lines = linesOf(text);
  const out = lines.map((line, i) => (prose.has(i) ? replaceNoteLinks(line, rename) : line)).join('\n');
  return out === lines.join('\n') ? text : out;
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
export function relinkAfterRename(notes: readonly Review[], before: Review, title: string, now: string, others: readonly Review[] = []): Review[] {
  const from = before.game.name;
  if (linkKey(from) === linkKey(title) || !linkableTitle(title) || resolveNote(notes, from)?.id !== before.id) return [];
  const renamed = notes.map((n) => (n.id === before.id ? { ...n, game: { ...n.game, name: title } } : n));
  if (resolveNote(renamed, title)?.id !== before.id) return [];
  const out: Review[] = [];
  // as outras anotações e as resenhas (`others`), que também apontam para anotações
  for (const n of [...notes, ...others]) {
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
    // no mesmo instante, a de menor id (a mesma ordem de `backlinksOf`)
    if (n.id === note.id || (best && (n.createdAt > best.createdAt || (n.createdAt === best.createdAt && n.id > best.id)))) continue;
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
 * O que a sub-nota diz de onde é parte, pelas anotações que apontam para ela (`backlinksOf`): o
 * nome da única ("Parte de Sprint 42"), quantas são ("Parte de 2 notas") ou, sem nenhuma, "Sub-nota".
 */
export function partOfLabel(from: readonly Review[]): string {
  if (from.length > 1) return `Parte de ${from.length} notas`;
  return from.length ? `Parte de ${from[0].game.name}` : 'Sub-nota';
}

/** Até quantas letras antes do link o trecho mostra (o começo de uma linha comprida vira "…"). */
const BEFORE_MAX = 40;

/**
 * A linha do texto de `from` onde está o link para `note`, para mostrar onde ela é citada, em três
 * pedaços: o que vem antes, o link (escrito como aparece: "[[Título|texto]]" vira "texto") e o que
 * vem depois. Sem a marca da lista ou da tarefa; os outros links da linha viram o texto deles, e um
 * começo comprido fica só com as últimas palavras antes do link. Null se nenhuma linha tem o link.
 */
export function backlinkLine(from: Review, note: Review, notes: readonly Review[]): { before: string; link: string; after: string } | null {
  const plain = (s: string) => s.replace(LINK, (_all, inner: string) => splitLink(inner).label);
  for (const { line: raw } of proseLines(from.text)) {
    const line = raw.replace(/^\s*(?:[-*•]\s+(?:\[[ xX]\]\s*)?|\d{1,4}[.)]\s+|#{1,3}\s+|>\s?)/, '');
    const hit = noteLinksOf(line).find((l) => resolveNote(notes, splitLink(l.inner).title)?.id === note.id);
    if (!hit) continue;
    let before = plain(line.slice(0, hit.at)).trimStart();
    if (before.length > BEFORE_MAX) before = '…' + before.slice(-BEFORE_MAX).replace(/^\S*\s/, '');
    return { before, link: splitLink(hit.inner).label, after: plain(line.slice(hit.at + hit.length)).trimEnd() };
  }
  return null;
}

/**
 * As anotações ligadas numa tarefa que acabou de ser marcada: os links da linha `line` de `text`,
 * se ela é uma tarefa feita, que abrem uma anotação ainda não finalizada (sem repetir, e nunca a
 * própria `selfId`). É o que a ficha oferece finalizar junto.
 */
export function linkedOnCheckedTask(text: string, line: number, notes: readonly Review[], selfId: string): Review[] {
  // uma tarefa feita (a de dentro de um bloco de código não é tarefa)
  if (!tasksOf(text).get(line)) return [];
  const k = lineKind(linesOf(text)[line]);
  if (k.kind !== 'check') return [];
  const out: Review[] = [];
  for (const title of linksIn(k.rest)) {
    const n = resolveNote(notes, title);
    if (n && n.id !== selfId && !n.doneAt && !out.includes(n)) out.push(n);
  }
  return out;
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
