/** Cada ficha tem um jeito próprio de estar pregada: inclinação, cor e posição do pin.
 *  Derivado do id, então é aleatório mas estável entre visitas. */

import { ROTATION_STOCKS, Stock } from './review';

export const PINS = ['#e62e2d', '#ffd23f', '#2f6bff', '#1fb65a', '#f4f4f0', '#ff7a1a'] as const;

function hash(s: string): number {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) {
    h ^= s.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/** splitmix32: um número bem misturado por (semente, n). */
function rand(seed: number, n: number): number {
  let z = (seed + Math.imul(n, 0x9e3779b9)) >>> 0;
  z = Math.imul(z ^ (z >>> 16), 0x85ebca6b) >>> 0;
  z = Math.imul(z ^ (z >>> 13), 0xc2b2ae35) >>> 0;
  z = (z ^ (z >>> 16)) >>> 0;
  return z / 4294967296;
}

export interface Pinning {
  tilt: number;
  pinX: number;
  pinColor: string;
  stock: Stock;
  dropY: number;
}

/** Nas fichas do mural a caixinha só tem tachinha vermelha e branca: seis cores de pin por cima das
 *  cartolinas viravam confete. O vermelho some no vermelho, no rosa e no laranja; lá vai sempre a branca. */
const WALL_PINS: Record<Stock, readonly string[]> = {
  vermelho: [PINS[4]],
  rosa: [PINS[4]],
  laranja: [PINS[4]],
  amarelo: [PINS[0], PINS[4]],
  verde: [PINS[0], PINS[4]],
  azul: [PINS[0], PINS[4]],
  lilas: [PINS[0], PINS[4]],
  cinza: [PINS[0], PINS[4]],
  branco: [PINS[0], PINS[4]],
  // nas escuras a branca acende; a vermelha só onde não some no vinho, no marrom e na berinjela
  'vermelho-escuro': [PINS[4]],
  'rosa-escuro': [PINS[4]],
  'laranja-escuro': [PINS[4]],
  'amarelo-escuro': [PINS[0], PINS[4]],
  'verde-escuro': [PINS[0], PINS[4]],
  'azul-escuro': [PINS[0], PINS[4]],
  'lilas-escuro': [PINS[4]],
  'cinza-escuro': [PINS[0], PINS[4]],
  preto: [PINS[0], PINS[4]],
};

export function pinningFor(id: string, stock?: Stock): Pinning {
  const h = hash(id);
  const sideSign = rand(h, 1) < 0.5 ? -1 : 1;
  // Nunca reta: entre 0,8° e 3,4° para um dos lados.
  const tilt = sideSign * (0.8 + rand(h, 2) * 2.6);
  const s = stock ?? ROTATION_STOCKS[Math.floor(rand(h, 5) * ROTATION_STOCKS.length)];
  const pins = WALL_PINS[s];
  return {
    tilt: Math.round(tilt * 10) / 10,
    pinX: Math.round(40 + rand(h, 3) * 20),
    pinColor: pins[Math.floor(rand(h, 4) * pins.length)],
    stock: s,
    dropY: Math.round(rand(h, 6) * 14),
  };
}

/** Um número de 0 a 1, estável para o id: o n-ésimo sorteio daquele papel (o corte da tesoura, a caneta). */
export function wobble(id: string, n: number): number {
  return rand(hash(id), 100 + n);
}
