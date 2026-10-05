/**
 * O mata-mata: fichas sorteadas num chaveamento, duelando de duas em duas até sobrar uma.
 *
 * O chaveamento tem sempre o tamanho de uma potência de 2 (8, 16, 32…). Quando as fichas não
 * enchem a chave, algumas passam direto da primeira rodada (o "bye" dos torneios), sorteadas. Assim
 * N fichas dão sempre N − 1 duelos: 5 duelos são 6 fichas (2 passam direto das quartas), 15 são 16
 * fichas (oitavas, sem ninguém de folga), 30 são 31.
 *
 * O estado é só o chaveamento sorteado e a lista de escolhas, na ordem em que foram feitas: o resto
 * (rodadas, duelo da vez, campeã) sai de `playOut`. Desfazer é tirar a última escolha.
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

/**
 * A ordem das cabeças de chave numa chave de `size` vagas, como nos torneios de tênis: a 1ª pega a
 * última, a 1ª e a 2ª ficam em metades opostas, as quatro primeiras em quartos diferentes, e assim
 * por diante. Para 8: [1, 8, 4, 5, 2, 7, 3, 6].
 */
export function seedOrder(size: number): number[] {
  let order = [1, 2];
  while (order.length < size) {
    const n = order.length * 2;
    order = order.flatMap((s) => [s, n + 1 - s]);
  }
  return order.slice(0, size);
}

/**
 * Monta a chave. Cada par de vagas (0-1, 2-3…) é um duelo da primeira rodada; null é a folga.
 *
 * Com `score`, as fichas viram cabeças de chave pela nota, para uma ficha muito boa não cair cedo
 * contra outra parecida: a de nota mais alta pega a mais baixa na primeira rodada, as duas
 * primeiras só se cruzam na final e as quatro primeiras só na semifinal. Quando as fichas não
 * enchem a chave, as de nota mais alta passam direto para a segunda rodada. Para a chave não sair
 * sempre igual, a ordem é sorteada dentro de cada faixa (a 1ª e a 2ª, da 3ª à 4ª, da 5ª à 8ª…,
 * separando quem tem folga de quem joga), e os empates de nota também.
 *
 * Sem `score`, tudo é sorteado.
 */
export function makeBracket(entrants: readonly string[], rng: () => number = Math.random, score?: (id: string) => number): Slot[] {
  if (entrants.length < 2) throw new Error('O mata-mata precisa de pelo menos duas fichas.');
  let size = 2;
  while (size < entrants.length) size *= 2;

  if (score) {
    // a ordem pela nota, com os empates sorteados (o sort é estável sobre a ordem embaralhada)
    const ranked = shuffle(entrants, rng).sort((a, b) => score(b) - score(a));
    // sorteia dentro de cada faixa de cabeças de chave: [1-2], [3-4], [5-8], [9-16]… A faixa é
    // partida onde acabam as folgas: quem passa direto são exatamente as `byes` de nota mais alta.
    const byes = size - entrants.length;
    const cuts = new Set<number>([byes]);
    for (let b = 2; b < ranked.length; b *= 2) cuts.add(b);
    const bounds = [0, ...[...cuts].filter((c) => c > 0 && c < ranked.length).sort((a, b) => a - b), ranked.length];
    const seeds: string[] = [];
    for (let i = 0; i < bounds.length - 1; i++) seeds.push(...shuffle(ranked.slice(bounds[i], bounds[i + 1]), rng));
    return seedOrder(size).map((s) => seeds[s - 1] ?? null);
  }

  const byes = size - entrants.length;
  const order = shuffle(entrants, rng);
  const pairs: Slot[][] = [];
  for (let i = 0; i < byes; i++) pairs.push([order[i], null]);
  for (let i = byes; i < order.length; i += 2) pairs.push([order[i], order[i + 1]]);
  return shuffle(pairs, rng).flat();
}

/** Joga a chave com as escolhas feitas até aqui. Uma escolha que não serve para o duelo da vez para a conta ali. */
export function playOut(slots: readonly Slot[], picks: readonly string[]): PlayOut {
  const total = slots.filter((s) => s !== null).length - 1;
  const rounds: Round[] = [];
  let entrants: Slot[] = [...slots];
  let pick = 0;
  let number = 0;
  let current: Duel | null = null;

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
    entrants = next;
  }

  return {
    rounds,
    current,
    total,
    played: pick,
    champion: current === null && entrants.length === 1 ? entrants[0] : null,
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
