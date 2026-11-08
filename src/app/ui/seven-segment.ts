/**
 * O algarismo de relógio digital, de sete segmentos: o desenho mora aqui e serve ao Contador neon
 * (ui/countdown.ts) e às skins Neon e Relógio de pulso do Pomodoro (ui/pomodoro-dial.ts). Só dados.
 */

/**
 * Os sete segmentos de um algarismo de relógio digital (a, b, c, d, e, f, g), num desenho de 12 × 20:
 * cada um é um sextavado comprido, com uma folga nas pontas, como nos mostradores de verdade.
 */
const H = (x1: number, x2: number, y: number) => `${x1},${y} ${x1 + 1},${y - 1} ${x2 - 1},${y - 1} ${x2},${y} ${x2 - 1},${y + 1} ${x1 + 1},${y + 1}`;
const V = (x: number, y1: number, y2: number) => `${x},${y1} ${x + 1},${y1 + 1} ${x + 1},${y2 - 1} ${x},${y2} ${x - 1},${y2 - 1} ${x - 1},${y1 + 1}`;
export const SEGMENTS = [H(1.6, 10.4, 1.2), V(10.8, 1.6, 9.6), V(10.8, 10.4, 18.4), H(1.6, 10.4, 18.8), V(1.2, 10.4, 18.4), V(1.2, 1.6, 9.6), H(1.6, 10.4, 10)];
const LIT: Record<string, string> = { '0': 'abcdef', '1': 'bc', '2': 'abged', '3': 'abgcd', '4': 'fgbc', '5': 'afgcd', '6': 'afgedc', '7': 'abc', '8': 'abcdefg', '9': 'abcdfg' };
/** Quais dos sete ficam acesos em cada algarismo. */
export const DIGIT_SEGMENTS: Record<string, boolean[]> = Object.fromEntries(Object.entries(LIT).map(([d, on]) => [d, [...'abcdefg'].map((k) => on.includes(k))]));

/** Os sete segmentos de um algarismo (o que não é algarismo fica todo apagado). */
export function segmentsOf(d: string): boolean[] {
  return DIGIT_SEGMENTS[d] ?? DIGIT_SEGMENTS['8'].map(() => false);
}
