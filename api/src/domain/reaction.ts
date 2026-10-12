import { isEmoji } from './emoji';

/** As sete da fileira do site (core/reaction-kinds.ts); fora elas, vale qualquer emoji sozinho (o "+"). */
const REACTIONS: readonly string[] = ['amei', 'fogo', 'rindo', 'uau', 'chorei', 'hmm', 'nao-curti'];

/** Uma reação que a nuvem aceita, numa ficha ou num comentário: uma das sete, ou um emoji só. */
export function isReaction(v: unknown): v is string {
  return typeof v === 'string' && (REACTIONS.includes(v) || isEmoji(v));
}
