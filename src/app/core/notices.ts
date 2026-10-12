import { FeedItem, Person } from './follow';
import { ReactionId, reactionOf } from './reaction-kinds';

/**
 * Os avisos de Amigos: o que aconteceu com você e com as suas fichas (alguém começou a seguir, reagiu
 * ou comentou). Ficam à parte do Feed, que é só o que os amigos pregaram. Tudo aqui é conta pura em
 * cima do correio (`core/follow.ts`); a tela está em `ui/notice-list.ts`.
 */

type Followed = Extract<FeedItem, { tipo: 'seguiu' }>;
type Reacted = Extract<FeedItem, { tipo: 'reagiu' }>;
type Commented = Extract<FeedItem, { tipo: 'comentou' }>;

export type Notice =
  | { tipo: 'seguiu'; key: string; item: Followed; people: Person[] }
  /** As reações seguidas à mesma ficha: cada pessoa uma vez, e as reações dadas, sem repetir. */
  | { tipo: 'reagiu'; key: string; item: Reacted; people: Person[]; reactions: ReactionId[] }
  /** Os comentários seguidos na mesma ficha: cada pessoa uma vez. */
  | { tipo: 'comentou'; key: string; item: Commented; people: Person[] };

/** Um aviso sobre uma ficha minha (o resto é quem começou a seguir). */
export type CardNotice = Exclude<Notice, { tipo: 'seguiu' }>;

/**
 * O correio sem as resenhas dos amigos, do mais novo para o mais velho, com os avisos seguidos do
 * mesmo tipo sobre a mesma ficha juntos num só ("Bia e Ana reagiram…"). O `item` de cada aviso é o
 * mais novo do grupo: é ele que dá a hora e o "Novo".
 */
export function groupNotices(items: readonly FeedItem[]): Notice[] {
  const out: Notice[] = [];
  for (const item of items) {
    if (item.tipo === 'resenha') continue;
    if (item.tipo === 'seguiu') {
      out.push({ tipo: 'seguiu', key: `seguiu:${item.pessoa.codigo}:${item.em}`, item, people: [item.pessoa] });
      continue;
    }
    const last = out[out.length - 1];
    const same = last && last.tipo !== 'seguiu' && last.tipo === item.tipo && last.item.ref === item.ref ? last : null;
    const fresh = !same?.people.some((p) => p.codigo === item.pessoa.codigo);
    if (item.tipo === 'reagiu') {
      if (same?.tipo === 'reagiu') {
        // a mesma pessoa aparece uma vez só, com a reação mais nova
        if (fresh) {
          same.people.push(item.pessoa);
          if (!same.reactions.includes(item.reacao)) same.reactions.push(item.reacao);
        }
      } else out.push({ tipo: 'reagiu', key: `reagiu:${item.ref}:${item.em}`, item, people: [item.pessoa], reactions: [item.reacao] });
      continue;
    }
    if (same?.tipo === 'comentou') {
      if (fresh) same.people.push(item.pessoa);
    } else out.push({ tipo: 'comentou', key: `comentou:${item.ref}:${item.em}`, item, people: [item.pessoa] });
  }
  return out;
}

/** "Bia", "Bia e Caio", "Bia, Caio e mais 2". */
export function peopleNames(people: readonly Person[]): string {
  const names = people.map((p) => p.nome);
  if (names.length <= 2) return names.join(' e ');
  return `${names.slice(0, 2).join(', ')} e mais ${names.length - 2}`;
}

/** "começou a seguir você", "reagiu" / "reagiram", "comentou" / "comentaram". */
export function noticeVerb(n: Notice): string {
  if (n.tipo === 'seguiu') return 'começou a seguir você';
  const many = n.people.length > 1;
  return n.tipo === 'reagiu' ? (many ? 'reagiram' : 'reagiu') : many ? 'comentaram' : 'comentou';
}

/** "à sua ficha de" (Hades), "à sua anotação" (Compras); com comentário, "na sua…". */
export function noticeWhere(n: CardNotice): string {
  const note = n.item.mural === 'anotacoes';
  if (n.tipo === 'reagiu') return note ? 'à sua anotação' : 'à sua ficha de';
  return note ? 'na sua anotação' : 'na sua ficha de';
}

/** O aviso inteiro, para o leitor de tela: "Bia reagiu com Fogo à sua ficha de Hades". */
export function noticeSpoken(n: Notice): string {
  const who = peopleNames(n.people);
  if (n.tipo === 'seguiu') return `${who} ${noticeVerb(n)}`;
  const how = n.tipo === 'reagiu' ? ` com ${n.reactions.map((r) => reactionOf(r).label).join(', ')}` : '';
  return `${who} ${noticeVerb(n)}${how} ${noticeWhere(n)} ${n.item.titulo}`;
}
