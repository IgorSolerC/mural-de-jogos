import { Audience, Review, audienceFields, isNote, sanitizeReview } from './review';
import { BUILD } from './build';
import { LINK, lineKind, linesOf, noteLinksOf, proseLines, replaceNoteLinks, splitLink, tasksOf } from './rich-text';
import { nameKey } from './text';
import type { ReminderLinkInfo } from './reminder-links';

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
  return nameKey(title);
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
 * O título que um link escreve, do que foi digitado: sem os espaços das pontas nem os repetidos; null
 * se não cabe num link (vazio, com colchete ou "|", ver `linkableTitle`).
 */
export function linkTitleOf(raw: string): string | null {
  const t = raw.trim().replace(/\s+/g, ' ');
  return linkableTitle(t) ? t : null;
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

/** De onde vem a anotação criada por um link (ver `linkedNote`). */
export interface LinkedNoteFrom {
  /** O grupo e o assunto da anotação que está sendo escrita (a resenha não passa nenhum). */
  category?: string | null;
  subject?: string | null;
  /** Como nasce a anotação nova nesse grupo (os Padrões das configurações do mural). */
  audience: Audience;
  /** Escrita dentro de uma anotação compartilhada: a nova é só sua, privada. */
  shared?: boolean;
}

/**
 * Quem vê a anotação criada por um link: a do grupo, menos o Feed. Ela nasce vazia, sem ninguém ter
 * escrito nada nela, e não vira post para quem segue; a pública fica à mostra no mural (Disponível) e
 * vai para o Feed quando for pregada de verdade, pelo editor. Dentro de uma compartilhada, privada.
 */
export function linkedAudience(from: Pick<LinkedNoteFrom, 'audience' | 'shared'>): Audience {
  if (from.shared) return 'privada';
  return from.audience === 'publicar' ? 'visivel' : from.audience;
}

/**
 * A anotação nova que um link para um título que não existe cria na hora (sem abrir o editor): só o
 * título, vazia, no grupo e no assunto de onde o link saiu, como o mural manda (ver `linkedAudience`).
 * O resto (a cartolina sorteada, a pauta) é o de toda anotação nova: o `ReviewStore.add` e a leitura
 * (`sanitizeReview`) completam. null se o título não cabe num link (ver `linkableTitle`).
 */
export function linkedNote(title: string, from: LinkedNoteFrom, id: string, now: string, today: string): Review | null {
  const name = linkTitleOf(title);
  if (!name) return null;
  const category = from.category?.trim();
  const subject = from.subject?.trim();
  return sanitizeReview(
    {
      id,
      kind: 'anotacoes',
      game: { name, coverUrl: null, source: 'manual' },
      text: '',
      completedAt: today,
      ...(category ? { category } : {}),
      ...(subject ? { subject } : {}),
      ...audienceFields(linkedAudience(from), null, now),
      createdAt: now,
      updatedAt: now,
    },
    BUILD,
  );
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
  /** Abre a ficha colada no texto (o widget Nota), de qualquer mural. Sem ele, ela só se vê. */
  openCard?(card: Review): void;
  /**
   * O lembrete do link "[texto](murall://lembrete/ID)" (ver core/reminder-links.ts): o que mostrar dele, ou
   * null se ele não está no seu Calendário (o link sai tracejado). Sem ele (o mural de outra pessoa), o
   * link só aparece, sem dizer se existe.
   */
  reminder?(id: string): ReminderLinkInfo | null;
  /** Abre o Calendário no dia do lembrete, com ele em destaque. Sem ele, o link não abre nada. */
  openReminder?(id: string): void;
}
