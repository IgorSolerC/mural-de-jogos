import { isEmoji } from './emoji';

/*
 * As reações em si, sem a nuvem: o que `Reactions` (core/reactions.ts) e o correio (core/follow.ts) usam
 * para ler e mostrar uma reação.
 */

/** Uma das sete da fileira ('amei', 'fogo'…) ou qualquer emoji escolhido no "+" (o próprio emoji). */
export type ReactionId = string;

export interface ReactionKind {
  id: ReactionId;
  emoji: string;
  /** O nome para quem não vê o desenho (leitor de tela, dica do botão). */
  label: string;
}

/** Na ordem do seletor. A API tem a mesma lista de ids. */
export const REACTIONS: readonly ReactionKind[] = [
  { id: 'amei', emoji: '❤️', label: 'Amei' },
  { id: 'fogo', emoji: '🔥', label: 'Fogo' },
  { id: 'rindo', emoji: '😂', label: 'Rindo' },
  { id: 'uau', emoji: '😮', label: 'Surpresa' },
  { id: 'chorei', emoji: '😢', label: 'Chorei' },
  { id: 'hmm', emoji: '🤔', label: 'Dúvida' },
  { id: 'nao-curti', emoji: '👎', label: 'Não curti' },
];

const BY_ID = new Map(REACTIONS.map((r) => [r.id, r]));

/** A reação pelo id: uma das sete, ou o emoji escolhido no "+" (que é o próprio nome). */
export function reactionOf(id: ReactionId): ReactionKind {
  return BY_ID.get(id) ?? { id, emoji: id, label: id };
}

/** Uma das sete da fileira? */
export function isQuickReaction(id: ReactionId): boolean {
  return BY_ID.has(id);
}

export function isReaction(v: unknown): v is ReactionId {
  return typeof v === 'string' && (BY_ID.has(v) || isEmoji(v));
}
