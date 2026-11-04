import { signal } from '@angular/core';
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

/**
 * O nome de um emoji do "+", lido do catálogo (core/emoji-catalog.ts). O catálogo fica fora do pacote
 * inicial do site (o "+" o traz num pedaço à parte): ele só vem quando a primeira reação do "+" aparece,
 * e quem leu o nome dentro de um computed (o botão, o balão, a folha) é refeito quando ele chega.
 */
const catalogName = signal<((e: string) => string | null) | null>(null);
let loading: Promise<void> | null = null;

/** Traz os nomes do catálogo (uma vez só). */
export function loadEmojiNames(): Promise<void> {
  // sem rede (ou com o pedaço trocado por um deploy), fica o desenho, e a próxima reação tenta de novo
  return (loading ??= import('./emoji-catalog').then(
    (m) => catalogName.set(m.emojiName),
    () => void (loading = null),
  ));
}

/**
 * A reação pelo id: uma das sete, ou o emoji escolhido no "+", com o nome dele no catálogo. Enquanto o
 * catálogo não chegou, ou se o emoji não está nele (escolhido num site mais novo), o nome é o próprio
 * desenho: o leitor de tela diz o nome dele, e a tela não o repete (ver `named`).
 */
export function reactionOf(id: ReactionId): ReactionKind {
  const quick = BY_ID.get(id);
  if (quick) return quick;
  const name = catalogName();
  if (!name) void loadEmojiNames();
  return { id, emoji: id, label: name?.(id) ?? id };
}

/** A reação tem um nome para escrever ao lado do desenho (e não só o próprio emoji). */
export function named(kind: ReactionKind): boolean {
  return kind.label !== kind.emoji;
}

/** Uma das sete da fileira? */
export function isQuickReaction(id: ReactionId): boolean {
  return BY_ID.has(id);
}

export function isReaction(v: unknown): v is ReactionId {
  return typeof v === 'string' && (BY_ID.has(v) || isEmoji(v));
}
