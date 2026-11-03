import { Kind, cap, profileOf } from '../core/kinds';
import { Review } from '../core/review';
import { KIND_ICON } from './kind-switcher';

/** As abas de mural dos seletores de fichas: os murais (na ordem dada) que têm alguma das fichas, com quantas. */
export function kindTabs(cards: readonly Review[], order: readonly Kind[]) {
  return order
    .map((kind) => ({ kind, label: cap(profileOf(kind).plural), icon: KIND_ICON[kind], count: cards.filter((r) => r.kind === kind).length }))
    .filter((k) => k.count > 0);
}
