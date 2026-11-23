import { Audience, Review, Stock, audienceFields, isNote, sanitizeReview } from './review';
import { BUILD } from './build';
import { LINK, lineKind, linesOf, noteLinksOf, parseInline, proseLines, replaceNoteLinks, splitLink, tasksOf } from './rich-text';
import { nameKey } from './text';
import { retitleCardLine } from './widgets';
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
 * - Trocou o título? Os links das outras anotações que apontavam para ela mudam junto, sem mudar uma
 *   letra do que se lê: "[[Paris]]" vira "[[Saiba tudo sobre a capital da França|Paris]]" (ver
 *   `renameLinks` e `relinkAfterRename`).
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

/**
 * Troca, no texto, os links para `from` por links para `to`, sem mudar o que se lê: o link continua
 * mostrando o que mostrava, e só o título por trás dele muda. "[[Paris]]" vira "[[Título novo|Paris]]" (o
 * texto que se lia era o título, como foi escrito), e "[[Paris|a capital]]" vira "[[Título novo|a capital]]".
 * Pedido do dono: renomear uma anotação nunca pode mudar o texto de outra ("Eu fui para PARIS" não vira
 * "Eu fui para Saiba tudo sobre a capital da França!"). O resto fica como estava. A nota colada escrita à
 * mão só com o título ("{{nota: título}}", que abre como um link) muda junto: ela mostra a ficha, não o
 * texto (ver `retitleCardLine`).
 */
export function renameLinks(text: string, from: string, to: string): string {
  const key = linkKey(from);
  const same = (title: string) => linkKey(title) === key;
  const rename = (inner: string, all: string) => {
    const bar = inner.indexOf('|');
    const title = bar === -1 ? inner : inner.slice(0, bar);
    if (!same(title)) return all;
    // o que a leitura mostrava (o título, sem texto depois da barra), como estava escrito
    const shown = splitLink(inner).label;
    // o que se lê já é o título novo (o desfazer de uma troca, "[[Paris, França|Paris]]" voltando a Paris): o
    // link simples, que lê igual e abre a mesma anotação
    if (linkKey(shown) === linkKey(to) && linkableTitle(shown)) return `[[${shown}]]`;
    return bar === -1 || !inner.slice(bar + 1).trim() ? `[[${to.trim()}|${shown}]]` : `[[${to.trim()}${inner.slice(bar)}]]`;
  };
  // só os links que a leitura mostra (ver `linksIn`): o código e os escapados ficam como estão; a linha
  // de dentro de um card vem sem o "> " da frente, que fica
  const prose = new Map(proseLines(text).map((l) => [l.at, l.line]));
  const lines = linesOf(text);
  const out = lines
    .map((line, i) => {
      const read = prose.get(i);
      if (read === undefined) return line;
      const card = retitleCardLine(read, same, to);
      return card !== null && line.endsWith(read) ? line.slice(0, line.length - read.length) + card : replaceNoteLinks(line, rename);
    })
    .join('\n');
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
  /** O grupo e a pasta (o id) da anotação que está sendo escrita (a resenha não passa nenhum). */
  category?: string | null;
  folder?: string | null;
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
 * O que a folha da nota nova (ui/quick-note-sheet.ts) já põe na anotação criada por um link: o texto, as tags e a
 * cartolina sorteada quando a folha abriu (a folha é pintada nela).
 */
export interface LinkedNoteExtra {
  text?: string;
  tags?: readonly string[];
  stock?: Stock;
}

/**
 * A anotação nova que um link para um título que não existe cria na hora (sem abrir o editor): só o
 * título, vazia, no grupo e no assunto de onde o link saiu, como o mural manda (ver `linkedAudience`).
 * O resto (a cartolina sorteada, a pauta) é o de toda anotação nova: o `ReviewStore.add` e a leitura
 * (`sanitizeReview`) completam. null se o título não cabe num link (ver `linkableTitle`).
 */
export function linkedNote(title: string, from: LinkedNoteFrom, id: string, now: string, today: string, extra: LinkedNoteExtra = {}): Review | null {
  const name = linkTitleOf(title);
  if (!name) return null;
  const category = from.category?.trim();
  const folder = from.folder?.trim();
  return sanitizeReview(
    {
      id,
      kind: 'anotacoes',
      game: { name, coverUrl: null, source: 'manual' },
      text: extra.text ?? '',
      completedAt: today,
      ...(category ? { category } : {}),
      ...(folder ? { folder } : {}),
      ...(extra.tags?.length ? { tags: [...extra.tags] } : {}),
      ...(extra.stock ? { stock: extra.stock } : {}),
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
  // a linha como a leitura a lê: a de dentro de um card, sem o "> " da frente
  const prose = proseLines(text).find((p) => p.at === line);
  const k = prose && lineKind(prose.line);
  if (k?.kind !== 'check') return [];
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

// ===== A nota nova a partir de um trecho da leitura (PLANO-NOTA-DE-REFERENCIA.md) =====

/** O trecho mais comprido que vira título: o mesmo do campo de título do editor. */
export const SPOT_MAX = 200;

/**
 * Um trecho selecionado na leitura: a linha do texto de onde ele saiu (a de `data-l`), o trecho como se lê, e qual
 * das vezes dele naquela linha foi a selecionada (`nth`, contando da esquerda) entre as `count` que a linha desenhada
 * mostra.
 */
export interface TextSpot {
  line: number;
  text: string;
  nth: number;
  count: number;
}

/** O trecho pode virar título e link: sem colchetes nem "|", e do tamanho de um título. */
export function spotTitle(text: string): boolean {
  return text.length <= SPOT_MAX && linkTitleOf(text) === text;
}

/**
 * O link que o trecho `piece` vira, para a anotação `title`: "[[trecho]]" quando o título é o trecho (sem diferença
 * de maiúsculas e acentos, ele abre a mesma); com outro título, "[[Título|trecho]]", e o que se lê não muda.
 */
export function spotLink(title: string, piece: string): string {
  return linkKey(title) === linkKey(piece) ? `[[${piece}]]` : `[[${title.trim()}|${piece}]]`;
}

/** Onde `piece` começa em `line`, da esquerda para a direita, sem uma vez pegar o pedaço da outra (a leitura conta igual). */
export function placesOf(line: string, piece: string): number[] {
  const out: number[] = [];
  for (let at = line.indexOf(piece); at !== -1; at = line.indexOf(piece, at + piece.length)) out.push(at);
  return out;
}

/**
 * A linha com o trecho em `at` trocado pelo `link`, se ali ele é texto comum: o link novo é lido como link
 * exatamente ali (fora de código, de um escapado, de outro link) e o resto da linha se lê como antes (fora de um
 * endereço, de um widget). Senão, null.
 */
function linkedLine(line: string, at: number, piece: string, link: string): string | null {
  const next = line.slice(0, at) + link + line.slice(at + piece.length);
  if (!noteLinksOf(next).some((l) => l.at === at && l.length === link.length)) return null;
  // o link se lê como o trecho (o texto depois da barra): a linha inteira se lê igual, letra a letra, com as mesmas
  // marcas (o trecho no meio de um endereço solto deixaria de ser endereço)
  const read = readOf(line);
  const after = readOf(next);
  return read.length === after.length && read.every((c, i) => c === after[i]) ? next : null;
}

/** Cada letra da linha como a leitura a mostra, com as marcas dela (menos a de link de anotação). */
function readOf(line: string): string[] {
  return parseInline(line).flatMap((s) => {
    const marks = [s.bold, s.italic, s.strike, s.mark, s.spoiler, s.subtle, s.code, s.href ?? ''].join(',');
    return [...s.text].map((c) => `${c}\u0000${marks}`);
  });
}

/**
 * A vez do trecho que a pessoa selecionou, na linha escrita: a mesma da linha desenhada quando as duas mostram o
 * trecho o mesmo número de vezes; senão, a única em que ele é texto comum. Na dúvida, null.
 */
function spotIn(line: string, spot: TextSpot, link: string): string | null {
  const places = placesOf(line, spot.text);
  if (places.length === spot.count && places[spot.nth] !== undefined) return linkedLine(line, places[spot.nth], spot.text, link);
  const ok = places.map((at) => linkedLine(line, at, spot.text, link)).filter((l): l is string => l !== null);
  return ok.length === 1 ? ok[0] : null;
}

/**
 * O texto `now` com o trecho `spot` (selecionado na leitura do texto `shown`) virado em `link`, ou null se não der.
 * A linha é achada em `now` pelo que ela diz (a nuvem pode ter trazido outra versão com a folha aberta): a mesma
 * linha, ou a k-ésima igual a ela. Só as linhas que a leitura lê como texto (fora dos blocos de código).
 */
export function linkSpot(shown: string, now: string, spot: TextSpot, link: string): string | null {
  if (!spotTitle(spot.text) || spot.nth < 0 || spot.nth >= spot.count) return null;
  const from = linesOf(shown);
  const want = from[spot.line];
  if (want === undefined) return null;
  const to = linesOf(now);
  let at: number | null = to[spot.line] === want ? spot.line : null;
  if (at === null) {
    const nth = from.slice(0, spot.line).filter((l) => l === want).length;
    at = to.map((l, i) => (l === want ? i : -1)).filter((i) => i !== -1)[nth] ?? null;
  }
  if (at === null || !proseLines(now).some((p) => p.at === at)) return null;
  const line = spotIn(to[at], spot, link);
  if (line === null) return null;
  to[at] = line;
  return to.join('\n');
}
