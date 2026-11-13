import { hash, rng } from './paper';

/**
 * Como cada capa entra na Grade da Wishlist (PLANO-WISHLIST.md, P8): todas do mesmo tamanho, numa margem de
 * papel de revista, e uns poucos acidentes de quem destacou a página, sorteados pelo id (os mesmos em toda
 * visita, congelados em `frozen-looks`):
 * - `rasgo`: a beirada de baixo rasgada à mão;
 * - `canto`: a quina de cima arrancada, numa diagonal torta;
 * - `picote`: o lado esquerdo destacado do picote do bloco;
 * - `dobra`: a orelha dobrada na quina de cima;
 * - `''`: lisa (a maioria).
 * Um quinto delas é de revista velha (o papel amarelado), e cada uma fica um tico fora do prumo.
 */
export type CoverAccident = '' | 'rasgo' | 'canto' | 'picote' | 'dobra';

export interface CoverLook {
  kind: CoverAccident;
  /** A inclinação, em graus (de -0,8 a 0,8). */
  tilt: number;
  /** Papel de revista velha. */
  old: boolean;
  /** O contorno do rasgo e do canto arrancado (`clip-path`); null nos outros. */
  clip: string | null;
}

/** Dez casas: seis lisas e um de cada acidente (um terço com acidente, mais ou menos). */
const KINDS: readonly CoverAccident[] = ['', '', '', 'rasgo', '', 'canto', '', 'picote', '', 'dobra'];

/** A beirada de baixo rasgada à mão: a linha sobe e desce uns pixels. */
function tornBottom(r: () => number): string {
  const pts = ['0 0', '100% 0'];
  const n = 12;
  for (let i = n; i >= 0; i--) pts.push(`${((i / n) * 100).toFixed(1)}% calc(100% - ${(r() * 7).toFixed(1)}px)`);
  return `polygon(${pts.join(', ')})`;
}

/** A quina de cima arrancada: uma diagonal torta. */
function tornCorner(r: () => number): string {
  const a = 66 + r() * 12;
  const b = 14 + r() * 10;
  const pts = ['0 0', `${a.toFixed(1)}% 0`];
  const n = 6;
  for (let i = 1; i < n; i++) {
    const x = a + ((100 - a) * i) / n + (r() - 0.5) * 3;
    const y = (b * i) / n + (r() - 0.5) * 3;
    pts.push(`${x.toFixed(1)}% ${Math.max(0, y).toFixed(1)}%`);
  }
  pts.push(`100% ${b.toFixed(1)}%`, '100% 100%', '0 100%');
  return `polygon(${pts.join(', ')})`;
}

/** O jeito da capa na Grade: o mesmo para o mesmo id, sempre (barato: a capa guarda o dela num computed). */
export function coverFor(id: string): CoverLook {
  // a semente tem o prefixo próprio: o sorteio da grade nunca anda junto com o do recorte
  const r = rng(hash(`capa:${id}`));
  const kind = KINDS[Math.floor(r() * KINDS.length)];
  return {
    kind,
    tilt: Math.round((r() * 1.6 - 0.8) * 10) / 10,
    old: r() < 0.2,
    clip: kind === 'rasgo' ? tornBottom(r) : kind === 'canto' ? tornCorner(r) : null,
  };
}
