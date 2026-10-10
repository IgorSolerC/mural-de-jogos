import { ReviewPair } from './comparison';
import { Kind } from './kinds';
import {
  Bonus,
  BonusKind,
  Review,
  STATUSES,
  Status,
  Stock,
  VERDICTS,
  Verdict,
  fold,
  shownFinal,
} from './review';
import { pinningFor } from './wall-physics';

/**
 * As respostas de cada um no caderno de perguntas: tudo o que a comparação mostra sobre o gosto de
 * uma pessoa, tirado só das fichas dela (nunca das obras em comum, que têm o seu próprio quadro).
 * Funções puras: a página só lê.
 */

export interface Tally<T> {
  value: T;
  n: number;
}

export interface Portrait {
  count: number;
  /** A média das notas finais, ou null sem fichas. */
  average: number | null;
  /** Todas as notas finais, da menor para a maior: as bolinhas na régua. */
  finals: number[];
  /** As três maiores notas; no empate, a ficha mais recente vem antes. */
  top: Review[];
  /** As cartolinas, da mais usada para a menos usada (fichas antigas sem cor contam a do rodízio). */
  stocks: Tally<Stock>[];
  /** Os cinco vereditos, na ordem do carimbo, e quantas fichas ficaram sem veredito. */
  verdicts: Tally<Verdict>[];
  noVerdict: number;
  statuses: Record<Status, number>;
  /** O bônus mais colado de cada lado, ou null. */
  bonus: Record<BonusKind, Tally<Bonus> | null>;
  /** A soma da quantidade do mural (horas, páginas) e a ficha com a maior. */
  amount: number;
  longest: Review | null;
}

const byScore = (a: Review, b: Review) =>
  shownFinal(b) - shownFinal(a) ||
  Date.parse(b.updatedAt) - Date.parse(a.updatedAt) ||
  a.id.localeCompare(b.id);

export function portrait(list: readonly Review[]): Portrait {
  const stockCount = new Map<Stock, number>();
  const verdictCount = new Map<Verdict, number>();
  const bonusCount = new Map<string, Tally<Bonus>>();
  const statuses = { incompleto: 0, finalizado: 0, platinado: 0 } as Record<Status, number>;
  let noVerdict = 0;
  let amount = 0;
  let longest: Review | null = null;
  for (const r of list) {
    const stock = pinningFor(r.id, r.stock).stock;
    stockCount.set(stock, (stockCount.get(stock) ?? 0) + 1);
    if (r.verdict) verdictCount.set(r.verdict, (verdictCount.get(r.verdict) ?? 0) + 1);
    else noVerdict++;
    statuses[r.status]++;
    for (const b of r.bonuses) {
      // o mesmo nome do mesmo lado é o mesmo bônus, venha da cartela ou da mão de quem escreveu
      const key = `${b.kind}:${fold(b.label)}`;
      const hit = bonusCount.get(key);
      if (hit) hit.n++;
      else bonusCount.set(key, { value: b, n: 1 });
    }
    if (r.hoursPlayed !== null) {
      amount += r.hoursPlayed;
      if (!longest || r.hoursPlayed > (longest.hoursPlayed ?? 0)) longest = r;
    }
  }
  const finals = list.map(shownFinal).sort((a, b) => a - b);
  const topBonus = (kind: BonusKind) =>
    [...bonusCount.values()]
      .filter((t) => t.value.kind === kind)
      .sort((a, b) => b.n - a.n || a.value.label.localeCompare(b.value.label, 'pt-BR'))[0] ?? null;
  return {
    count: list.length,
    average: list.length ? finals.reduce((s, v) => s + v, 0) / list.length : null,
    finals,
    top: [...list].sort(byScore).slice(0, 3),
    stocks: [...stockCount]
      .map(([value, n]) => ({ value, n }))
      .sort((a, b) => b.n - a.n || a.value.localeCompare(b.value)),
    verdicts: VERDICTS.map((value) => ({ value, n: verdictCount.get(value) ?? 0 })),
    noVerdict,
    statuses,
    bonus: { favor: topBonus('favor'), contra: topBonus('contra') },
    amount: Math.round(amount),
    longest,
  };
}

/** O veredito mais dado (no empate, o de cima do carimbo), ou null sem nenhum. */
export function favouriteVerdict(p: Portrait): Tally<Verdict> | null {
  const best = [...p.verdicts].sort((a, b) => b.n - a.n)[0];
  return best && best.n > 0 ? best : null;
}

/** Quanto termina do que começa: finalizado e platinado sobre o total, de 0 a 100. */
export function finishRate(p: Portrait): number | null {
  if (!p.count) return null;
  return Math.round(((p.statuses.finalizado + p.statuses.platinado) / p.count) * 100);
}

export const STATUS_ORDER: readonly Status[] = [...STATUSES].reverse();

export interface Affinity {
  /** De 0 a 100: 100 quando as notas são iguais; 0 quando ficam, em média, a 5 pontos ou mais. */
  percent: number;
  /** A distância média entre as duas notas finais. */
  distance: number;
  /** Quanto a minha nota fica acima da do colega, em média (negativo: abaixo). */
  lean: number;
  /** Pares com a mesma nota (até meio ponto) e com o mesmo veredito. */
  agree: number;
  sameVerdict: number;
  /** A maior briga (maior diferença) e a maior unanimidade (a maior nota em que os dois bateram). */
  fight: ReviewPair | null;
  harmony: ReviewPair | null;
  phrase: string;
}

/** A régua da sintonia: frases do caderno, da mais perto para a mais longe. */
const PHRASES: readonly [number, string][] = [
  [90, 'Almas gêmeas'],
  [75, 'Quase sempre de acordo'],
  [55, 'Combinam no geral'],
  [35, 'Cada um no seu canto'],
  [0, 'Gostos opostos'],
];

export function affinity(pairs: readonly ReviewPair[]): Affinity | null {
  if (!pairs.length) return null;
  const n = pairs.length;
  const distance = pairs.reduce((s, p) => s + Math.abs(p.difference), 0) / n;
  const lean = pairs.reduce((s, p) => s + p.difference, 0) / n;
  const percent = Math.round(100 * (1 - Math.min(distance, 5) / 5));
  const byName = (a: ReviewPair, b: ReviewPair) =>
    a.mine.game.name.localeCompare(b.mine.game.name, 'pt-BR') || a.key.localeCompare(b.key);
  const fight = [...pairs].sort((a, b) => Math.abs(b.difference) - Math.abs(a.difference) || byName(a, b))[0];
  const close = pairs
    .filter((p) => Math.abs(p.difference) <= 0.5)
    .sort(
      (a, b) =>
        shownFinal(b.mine) + shownFinal(b.theirs) - (shownFinal(a.mine) + shownFinal(a.theirs)) ||
        byName(a, b),
    );
  return {
    percent,
    distance,
    lean,
    agree: close.length,
    sameVerdict: pairs.filter((p) => p.mine.verdict && p.mine.verdict === p.theirs.verdict).length,
    fight: fight && fight.difference !== 0 ? fight : null,
    harmony: close[0] ?? null,
    phrase: PHRASES.find(([min]) => percent >= min)![1],
  };
}

/**
 * Um nome para o colega a partir do arquivo: "backup-da-marina.json.gz" vira "Marina". Datas,
 * números e as palavras do próprio app caem fora; se não sobrar um nome, fica vazio.
 */
export function nameFromFile(fileName: string): string {
  const noise = new Set(['meu', 'mural', 'murais', 'backup', 'de', 'da', 'do', 'dos', 'das', 'jogos', 'resenhas', 'copia', 'copy', 'json', 'gz', 'final', 'novo']);
  const words = fileName
    .replace(/\.(json|gz)/gi, ' ')
    .replace(/\(\d+\)/g, ' ')
    .split(/[\s_.\-]+/)
    .filter((w) => w && !/\d/.test(w) && !noise.has(fold(w)) && w.length > 1);
  const name = words.slice(0, 2).join(' ');
  if (!name || name.length > 30) return '';
  return name.replace(/(^|\s)\p{L}/gu, (c) => c.toUpperCase());
}
