import { Kind, cap, profileOf } from '../core/kinds';
import { Review, fold } from '../core/review';
import { KIND_ICON } from './kind-switcher';

/** As abas de mural dos seletores de fichas: os murais (na ordem dada) que têm alguma das fichas, com quantas. */
export function kindTabs(cards: readonly Review[], order: readonly Kind[]) {
  return order
    .map((kind) => ({ kind, label: cap(profileOf(kind).plural), icon: KIND_ICON[kind], count: cards.filter((r) => r.kind === kind).length }))
    .filter((k) => k.count > 0);
}

/** As fichas do mural escolhido (null: todos) com a busca no nome, sem ligar para acento nem caixa. */
export function matchingCards(cards: readonly Review[], kind: Kind | null, query: string): Review[] {
  const q = fold(query.trim());
  return cards.filter((r) => (!kind || r.kind === kind) && (!q || fold(r.game.name).includes(q)));
}
