import { hash, rng } from './paper';

/**
 * Como cada capa entra na Grade da Wishlist (PLANO-WISHLIST.md, P8 e A3): todas do mesmo tamanho, recortadas
 * da revista à tesoura, sem margem. O contorno é feito de cortes retos, cada lado em dois ou três golpes um
 * tico fora do esquadro, e as quinas nunca batem certinho; sorteado pelo id (o mesmo em toda visita,
 * congelado em `frozen-looks`). Um quinto delas é de revista velha (a foto amarelada), e cada uma fica um tico
 * fora do prumo.
 */
export interface CoverLook {
  /** A inclinação, em graus (de -0,8 a 0,8). */
  tilt: number;
  /** Revista velha. */
  old: boolean;
  /** O contorno dos cortes da tesoura (`clip-path`). */
  clip: string;
}

/** Um ponto do contorno, em porcentagem da capa mais uns pixels para dentro. */
function pt(xPct: number, yPct: number, dx: number, dy: number): string {
  const x = dx ? `calc(${xPct}% ${dx < 0 ? '-' : '+'} ${Math.abs(dx).toFixed(1)}px)` : `${xPct}%`;
  const y = dy ? `calc(${yPct}% ${dy < 0 ? '-' : '+'} ${Math.abs(dy).toFixed(1)}px)` : `${yPct}%`;
  return `${x} ${y}`;
}

/**
 * Os cortes da tesoura: as quatro quinas entram de 0 a 2,6px (cada uma do seu jeito), e cada lado ganha um ou
 * dois pontos no meio, onde a tesoura parou e mudou um tico de direção (até 1,4px para dentro).
 */
function scissorCut(r: () => number): string {
  const corner = () => r() * 2.6;
  const tl = [corner(), corner()];
  const tr = [corner(), corner()];
  const br = [corner(), corner()];
  const bl = [corner(), corner()];
  const mids = (from: number, to: number) => {
    const n = r() < 0.5 ? 1 : 2;
    const out: [number, number][] = [];
    for (let i = 1; i <= n; i++) out.push([from + ((to - from) * i) / (n + 1) + (r() - 0.5) * 12, r() * 1.4]);
    return out;
  };
  const pts: string[] = [pt(0, 0, tl[0], tl[1])];
  for (const [at, d] of mids(0, 100)) pts.push(pt(at, 0, 0, d));
  pts.push(pt(100, 0, -tr[0], tr[1]));
  for (const [at, d] of mids(0, 100)) pts.push(pt(100, at, -d, 0));
  pts.push(pt(100, 100, -br[0], -br[1]));
  for (const [at, d] of mids(100, 0)) pts.push(pt(at, 100, 0, -d));
  pts.push(pt(0, 100, bl[0], -bl[1]));
  for (const [at, d] of mids(100, 0)) pts.push(pt(0, at, d, 0));
  return `polygon(${pts.join(', ')})`;
}

/** O jeito da capa na Grade: o mesmo para o mesmo id, sempre (barato: a capa guarda o dela num computed). */
export function coverFor(id: string): CoverLook {
  // a semente tem o prefixo próprio: o sorteio da grade nunca anda junto com o do recorte
  const r = rng(hash(`capa:${id}`));
  return {
    tilt: Math.round((r() * 1.6 - 0.8) * 10) / 10,
    old: r() < 0.2,
    clip: scissorCut(r),
  };
}
