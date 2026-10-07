/**
 * Um emoji só (um grafema), para as reações fora da fileira pronta. Aceita os compostos (pele, família,
 * bandeira, teclas com número), nunca texto: o site confere do mesmo jeito (src/app/core/emoji.ts, no site).
 */
const PICTO = /\p{Extended_Pictographic}/u;
const FLAG = /^\p{Regional_Indicator}{2}$/u;
const KEYCAP = /^[0-9#*]\uFE0F?\u20E3$/u;
/** O que pode aparecer dentro de um emoji composto, além dos desenhos. */
const GLUE = /^(?:\p{Extended_Pictographic}|\p{Emoji_Modifier}|\p{Emoji_Component}|\uFE0F|\u200D|\u20E3|[\u{E0020}-\u{E007F}])+$/u;

export function isEmoji(v: unknown): v is string {
  if (typeof v !== 'string' || !v || v.length > 32) return false;
  const Seg = (Intl as unknown as { Segmenter?: new (l: string, o: object) => { segment(t: string): Iterable<unknown> } }).Segmenter;
  if (Seg && [...new Seg('pt-BR', { granularity: 'grapheme' }).segment(v)].length !== 1) return false;
  if (FLAG.test(v) || KEYCAP.test(v)) return true;
  return PICTO.test(v) && GLUE.test(v) && !/[\p{L}\p{N}]/u.test(v.replace(/[0-9#*]\uFE0F?\u20E3/gu, ''));
}
