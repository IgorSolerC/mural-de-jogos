/**
 * O mata-mata: fichas sorteadas num chaveamento, duelando de duas em duas até sobrar uma.
 *
 * O chaveamento tem sempre o tamanho de uma potência de 2 (8, 16, 32…). Quando as fichas não
 * enchem a chave, as de nota mais alta passam direto da primeira rodada (o "bye" dos torneios). Assim
 * N fichas dão sempre N − 1 duelos: 5 duelos são 6 fichas (2 passam direto das quartas), 15 são 16
 * fichas (oitavas, sem ninguém de folga), 30 são 31.
 *
 * O estado é o chaveamento da primeira rodada, o sorteio de cada rodada seguinte (feito quando a
 * anterior acaba, para os duelos terem distância de nota; ver `pairUp`) e a lista de escolhas, na
 * ordem em que foram feitas: o resto (rodadas, duelo da vez, campeã) sai de `playOut`. Desfazer é
 * tirar a última escolha.
 */

/** As opções de tamanho: quantos duelos, ou todas as fichas do mural. */
export type DuelOption = 5 | 15 | 30 | 'todos';
export const DUEL_OPTIONS: readonly DuelOption[] = [5, 15, 30, 'todos'];

/** Quantas fichas entram com essa opção, num mural com `available` fichas (0 = não dá). */
export function entrantsFor(option: DuelOption, available: number): number {
  if (option === 'todos') return available >= 2 ? available : 0;
  return available >= option + 1 ? option + 1 : 0;
}

/** Uma vaga do chaveamento: o id da ficha, ou null para a folga (quem cai com ela passa direto). */
export type Slot = string | null;

export interface Match {
  a: string;
  /** null: `a` passa direto, sem duelo. */
  b: string | null;
  /** Quem passou; null enquanto o duelo não foi decidido. */
  winner: string | null;
}

export interface Round {
  /** Quantas vagas a rodada tem (2 é a final, 4 a semifinal…): dá o nome. */
  size: number;
  name: string;
  matches: Match[];
}

export interface Duel {
  a: string;
  b: string;
  /** Qual rodada (índice em `rounds`). */
  round: number;
  /** O número deste duelo no torneio todo, de 1 a `total`. */
  number: number;
}

export interface PlayOut {
  rounds: Round[];
  /** O duelo da vez, ou null quando acabou. */
  current: Duel | null;
  /** Quantos duelos o torneio tem ao todo (fichas − 1). */
  total: number;
  /** Quantos já foram decididos. */
  played: number;
  champion: string | null;
  /** A primeira rodada que começou sem sorteio próprio (ver `ensureDraws`), ou null. */
  undrawn: number | null;
  /** As fichas dessa rodada. */
  undrawnEntrants: string[] | null;
}

/** O nome da rodada pelo tamanho dela. */
export function roundName(size: number): string {
  switch (size) {
    case 2:
      return 'Final';
    case 4:
      return 'Semifinal';
    case 8:
      return 'Quartas de final';
    case 16:
      return 'Oitavas de final';
    case 32:
      return '16 avos de final';
    case 64:
      return '32 avos de final';
    default:
      return 'Primeira fase';
  }
}

function shuffle<T>(list: readonly T[], rng: () => number): T[] {
  const out = [...list];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

/** Sorteia `count` fichas entre `ids` (todas, se faltar). */
export function drawEntrants(ids: readonly string[], count: number, rng: () => number = Math.random): string[] {
  return shuffle(ids, rng).slice(0, Math.min(count, ids.length));
}

/** A distância mínima de média entre as duas fichas de um duelo, sempre que der. */
export const MIN_GAP = 2;

/**
 * Forma os duelos de uma rodada: devolve as fichas numa ordem em que cada par (0-1, 2-3…) é um
 * duelo. Cada duelo junta fichas com pelo menos `gap` pontos de diferença na nota, para uma ficha
 * muito boa não cair contra outra parecida. O emparelhamento é sorteado entre os que respeitam a
 * distância, então a chave muda de uma partida para outra.
 *
 * Quando não há jeito de todos os duelos terem essa distância (as notas estão todas perto), fica o
 * emparelhamento que deixa a maior distância possível no duelo mais apertado: em ordem de nota, a
 * 1ª pega a do meio, a 2ª a seguinte, e assim por diante.
 */
export function pairUp(ids: readonly string[], score: (id: string) => number, rng: () => number = Math.random, gap = MIN_GAP): string[] {
  if (ids.length % 2) throw new Error('Para formar duelos, o número de fichas precisa ser par.');
  const eps = 1e-9;

  // em ordem de nota, a 1ª com a do meio: é o emparelhamento com a maior distância no duelo mais
  // apertado. Se nem ele chega a `gap`, nenhum chega, e é ele que fica.
  const ranked = shuffle(ids, rng).sort((a, b) => score(b) - score(a));
  const half = ranked.length / 2;
  const split = ranked.slice(0, half).map((a, i) => [a, ranked[half + i]]);
  const worst = Math.min(...split.map(([a, b]) => Math.abs(score(a) - score(b))));
  if (worst < gap - eps) return shuffle(split, rng).flat();

  // dá: sorteia um emparelhamento com a distância, emparelhando primeiro a ficha com menos parceiras
  for (let attempt = 0; attempt < 30; attempt++) {
    // as que faltam, em ordem de nota crescente (para contar parceiras por busca binária)
    let left = shuffle(ids, rng).sort((a, b) => score(a) - score(b));
    const out: string[] = [];
    while (left.length) {
      const scores = left.map(score);
      // quantas têm nota <= x (com folga de arredondamento)
      const atMost = (x: number) => {
        let lo = 0;
        let hi = scores.length;
        while (lo < hi) {
          const mid = (lo + hi) >> 1;
          if (scores[mid] <= x + eps) lo = mid + 1;
          else hi = mid;
        }
        return lo;
      };
      const options = (i: number) => atMost(scores[i] - gap) + (scores.length - atMost(scores[i] + gap - 2 * eps));
      // a mais apertada, com empate sorteado
      let best = -1;
      let bestCount = Infinity;
      const start = Math.floor(rng() * left.length);
      for (let k = 0; k < left.length; k++) {
        const i = (start + k) % left.length;
        const c = options(i);
        if (c < bestCount) {
          best = i;
          bestCount = c;
        }
      }
      if (bestCount === 0) break;
      const a = left[best];
      const partners = left.filter((_, j) => j !== best && Math.abs(scores[j] - scores[best]) >= gap - eps);
      const b = partners[Math.floor(rng() * partners.length)];
      out.push(a, b);
      left = left.filter((x) => x !== a && x !== b);
    }
    if (out.length === ids.length) {
      const pairs: string[][] = [];
      for (let i = 0; i < out.length; i += 2) pairs.push([out[i], out[i + 1]]);
      return shuffle(pairs, rng).flat();
    }
  }
  return shuffle(split, rng).flat();
}

/**
 * Monta a primeira rodada. Cada par de vagas (0-1, 2-3…) é um duelo; null é a folga.
 *
 * Com `score`: quando as fichas não enchem a chave (8, 16, 32…), as de nota mais alta passam
 * direto para a segunda rodada, e os duelos seguem `pairUp` (2 pontos de distância, se der). As
 * rodadas seguintes são sorteadas quando a anterior acaba (ver `ensureDraws`).
 *
 * Sem `score`, tudo é sorteado.
 */
export function makeBracket(entrants: readonly string[], rng: () => number = Math.random, score?: (id: string) => number): Slot[] {
  if (entrants.length < 2) throw new Error('O mata-mata precisa de pelo menos duas fichas.');
  let size = 2;
  while (size < entrants.length) size *= 2;
  const byes = size - entrants.length;

  if (score) {
    // a ordem pela nota, com os empates sorteados (o sort é estável sobre a ordem embaralhada)
    const ranked = shuffle(entrants, rng).sort((a, b) => score(b) - score(a));
    const passing = ranked.slice(0, byes);
    const playing = pairUp(ranked.slice(byes), score, rng);
    const pairs: Slot[][] = passing.map((id) => [id, null]);
    for (let i = 0; i < playing.length; i += 2) pairs.push([playing[i], playing[i + 1]]);
    return shuffle(pairs, rng).flat();
  }

  const order = shuffle(entrants, rng);
  const pairs: Slot[][] = [];
  for (let i = 0; i < byes; i++) pairs.push([order[i], null]);
  for (let i = byes; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return shuffle(pairs, rng).flat();
}

/** As rodadas sorteadas depois da primeira: `draws[r]` é a ordem da rodada r (a 0 é a chave). */
export type Draws = readonly (readonly string[] | null | undefined)[];

/** A ordem guardada serve para essas fichas? (as mesmas, cada uma uma vez) */
function fits(draw: readonly string[] | null | undefined, entrants: readonly string[]): draw is readonly string[] {
  if (!draw || draw.length !== entrants.length) return false;
  const want = new Set(entrants);
  return new Set(draw).size === draw.length && draw.every((id) => want.has(id));
}

/**
 * Sorteia, com `pairUp`, cada rodada que já pode começar e ainda não tem sorteio (ou tem um que não
 * serve mais, depois de um Desfazer). Devolve os sorteios, sem os de rodadas que ainda não começaram.
 */
export function ensureDraws(
  slots: readonly Slot[],
  picks: readonly string[],
  draws: Draws,
  score: (id: string) => number,
  rng: () => number = Math.random,
): (string[] | null)[] {
  const out: (string[] | null)[] = draws.map((d) => (d ? [...d] : null));
  for (;;) {
    const res = playOut(slots, picks, out);
    if (res.undrawn === null) return out.slice(0, res.rounds.length);
    out[res.undrawn] = pairUp(res.undrawnEntrants!, score, rng);
  }
}

/** Joga a chave com as escolhas feitas até aqui. Uma escolha que não serve para o duelo da vez para a conta ali. */
export function playOut(slots: readonly Slot[], picks: readonly string[], draws: Draws = []): PlayOut {
  const total = slots.filter((s) => s !== null).length - 1;
  const rounds: Round[] = [];
  let entrants: Slot[] = [...slots];
  let pick = 0;
  let number = 0;
  let current: Duel | null = null;
  let undrawn: number | null = null;
  let undrawnEntrants: string[] | null = null;

  while (entrants.length >= 2) {
    const matches: Match[] = [];
    const next: Slot[] = [];
    for (let i = 0; i < entrants.length; i += 2) {
      const a = entrants[i];
      const b = entrants[i + 1];
      if (a === null || b === null) {
        const solo = (a ?? b)!;
        matches.push({ a: solo, b: null, winner: solo });
        next.push(solo);
        continue;
      }
      number++;
      const chosen: string | undefined = current === null && pick < picks.length ? picks[pick] : undefined;
      if (chosen !== undefined && (chosen === a || chosen === b)) {
        pick++;
        matches.push({ a, b, winner: chosen });
        next.push(chosen);
      } else {
        current ??= { a, b, round: rounds.length, number };
        matches.push({ a, b, winner: null });
        next.push(null);
      }
    }
    rounds.push({ size: entrants.length, name: roundName(entrants.length), matches });
    if (current) break;
    // a rodada seguinte: na ordem sorteada para ela, se houver uma que sirva
    const winners = next as string[];
    const draw = draws[rounds.length];
    if (fits(draw, winners)) entrants = [...draw];
    else {
      if (winners.length >= 2 && undrawn === null) {
        undrawn = rounds.length;
        undrawnEntrants = winners;
      }
      entrants = winners;
    }
  }

  return {
    rounds,
    current,
    total,
    played: pick,
    champion: current === null && entrants.length === 1 ? entrants[0] : null,
    undrawn,
    undrawnEntrants,
  };
}

/**
 * Quem ficou em que lugar: a campeã, a vice e as que caíram na semifinal (na ordem da chave).
 * Só faz sentido com o torneio acabado.
 */
export function podium(out: PlayOut): { champion: string; runnerUp: string | null; semifinal: string[] } | null {
  if (!out.champion) return null;
  const final = out.rounds.at(-1)?.matches[0];
  const runnerUp = final && final.b !== null ? (final.winner === final.a ? final.b : final.a) : null;
  const semi = out.rounds.find((r) => r.size === 4);
  const semifinal = semi
    ? semi.matches.filter((m) => m.b !== null).map((m) => (m.winner === m.a ? m.b! : m.a))
    : [];
  return { champion: out.champion, runnerUp, semifinal };
}

/**
 * Em quantos duelos a escolhida tinha a nota maior (os empates não contam). Com as fichas de um
 * colega, é quantas vezes você acertou de qual ele gostou mais.
 */
export function agreement(out: PlayOut, score: (id: string) => number | undefined): { same: number; counted: number } {
  let same = 0;
  let counted = 0;
  for (const r of out.rounds) {
    for (const m of r.matches) {
      if (m.b === null || m.winner === null) continue;
      const loser = m.winner === m.a ? m.b : m.a;
      const w = score(m.winner);
      const l = score(loser);
      if (w === undefined || l === undefined || w === l) continue;
      counted++;
      if (w > l) same++;
    }
  }
  return { same, counted };
}
