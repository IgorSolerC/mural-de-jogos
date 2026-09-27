/** Cada ficha tem um jeito próprio de estar pregada: inclinação, cor e posição do pin.
 *  Derivado do id, então é aleatório mas estável entre visitas. */

import { STOCKS, Stock } from './review';

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

export function pinningFor(id: string, stock?: Stock): Pinning {
  const h = hash(id);
  const sideSign = rand(h, 1) < 0.5 ? -1 : 1;
  // Nunca reta: entre 0,8° e 3,4° para um dos lados.
  const tilt = sideSign * (0.8 + rand(h, 2) * 2.6);
  return {
    tilt: Math.round(tilt * 10) / 10,
    pinX: Math.round(40 + rand(h, 3) * 20),
    pinColor: PINS[Math.floor(rand(h, 4) * PINS.length)],
    stock: stock ?? STOCKS[Math.floor(rand(h, 5) * STOCKS.length)],
    dropY: Math.round(rand(h, 6) * 14),
  };
}
