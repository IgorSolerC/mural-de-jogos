import { Kind, profileOf } from './kinds';
import { RatedKey, Review, SCORE_LABEL, counts, formatAmount, formatScore, ratedKeys, scoreOf, shownScore } from './review';

/**
 * O Maior ou menor: uma ficha aparece com o valor à mostra, a próxima vem escondida, e a pessoa diz se
 * o valor dela é maior ou menor. Vale a sequência de acertos; o primeiro erro acaba a partida.
 *
 * O valor pode ser a Média, uma das quatro notas do mural ou a quantidade (horas, páginas). As notas
 * valem como aparecem (Ajustes › Nota): com "Inteiros", um 7,9 e um 8,2 são dois 8, um empate.
 * Empate vale como acerto, chute o que chutar; mas o jogo evita empates, sorteando a próxima entre as
 * de valor diferente sempre que existe alguma.
 */

export type Guess = 'maior' | 'menor';

export interface Measure {
  /** 'final', uma das notas do mural ou 'quantidade'. */
  key: 'final' | RatedKey | 'quantidade';
  /** "Média", "Diversão", "Tempo jogado". */
  label: string;
  /** "a média", "a nota de Diversão", "o tempo jogado": para a pergunta. */
  phrase: string;
  /** O valor da ficha, ou null quando ela não tem (sem horas, categoria "Não tem"). */
  value(r: Review): number | null;
  format(v: number): string;
}

/** O que dá para comparar em cada mural: a Média, as quatro notas e a quantidade, se o mural tiver. */
export function measuresFor(kind: Kind): Measure[] {
  const p = profileOf(kind);
  const out: Measure[] = [
    {
      key: 'final',
      label: 'Média',
      phrase: 'a média',
      value: (r) => scoreOf(r.scores, 'final'),
      format: (v) => formatScore(v),
    },
    ...ratedKeys(kind).map<Measure>((k) => ({
      key: k,
      label: SCORE_LABEL[k],
      phrase: `a nota de ${SCORE_LABEL[k]}`,
      value: (r) => {
        const v = counts(r.weights, k) ? scoreOf(r.scores, k) : null;
        return v === null ? null : shownScore(v);
      },
      format: (v) => formatScore(v),
    })),
  ];
  if (p.amount) {
    const amount = p.amount;
    out.push({
      key: 'quantidade',
      label: amount.label,
      phrase: amount.label.toLowerCase().startsWith('tempo') ? `o ${amount.label.toLowerCase()}` : `o número de ${amount.unit}`,
      value: (r) => r.hoursPlayed,
      format: (v) => formatAmount(kind, v),
    });
  }
  return out;
}

/** As fichas que têm valor para essa medida. */
export function playable(reviews: readonly Review[], m: Measure): Review[] {
  return reviews.filter((r) => m.value(r) !== null);
}

/** O chute está certo? Empate vale como acerto. */
export function isRight(current: number, next: number, guess: Guess): boolean {
  if (next === current) return true;
  return guess === 'maior' ? next > current : next < current;
}

/**
 * A próxima ficha: uma ainda não vista, de valor diferente da atual sempre que houver alguma (um
 * empate não é pergunta). Null quando acabaram as fichas: a pessoa zerou o mural.
 */
export function pickNext(
  pool: readonly Review[],
  used: ReadonlySet<string>,
  current: number,
  m: Measure,
  rng: () => number = Math.random,
): Review | null {
  const fresh = pool.filter((r) => !used.has(r.id) && m.value(r) !== null);
  if (!fresh.length) return null;
  const different = fresh.filter((r) => m.value(r) !== current);
  const list = different.length ? different : fresh;
  return list[Math.floor(rng() * list.length)];
}
