import { Review, fold } from './review';

/**
 * As abas do mural de anotações: as divisórias de fichário, uma por categoria. A categoria é uma só
 * por anotação, então ela já é a pasta: a aba só mostra as anotações dela (as fixadas também, no
 * topo da aba), e "Tudo" mostra o mural inteiro, como antes.
 *
 * - Toda categoria tem a sua aba, e as sem categoria ganham a aba "Sem categoria". Vão da que tem
 *   mais anotações para a que tem menos, pelo número que aparece nelas (o de anotações à mostra);
 *   no empate, a com mais anotações contando as finalizadas escondidas, depois as categorias antes
 *   de "Sem categoria", e então de A a Z.
 * - Cabem no máximo `MAX_TABS` abas em pé, contando Tudo, e só as que couberem na largura: as que
 *   sobram (as com menos anotações) vão para o "Mais" (ver `splitTabs` e NoteTabsBar).
 * - O número da aba é o de anotações à mostra; `total` conta as finalizadas também.
 * - Com tudo numa categoria só (ou tudo sem), não há o que separar: as abas não aparecem.
 */

/** A aba "Tudo": o mural inteiro. */
export const ALL_TAB = '';
/** A aba das anotações sem categoria. */
export const NO_CATEGORY_TAB = 'sem';
/** Quantas abas ficam em pé, contando Tudo (o "Mais" não conta). */
export const MAX_TABS = 8;

export interface NoteTab {
  /** `NO_CATEGORY_TAB`, ou "c:" e a categoria sem acento nem caixa. */
  key: string;
  label: string;
  /** Quantas anotações da aba estão à mostra (as finalizadas escondidas não contam). */
  n: number;
  /** Quantas anotações a aba tem, finalizadas também. */
  total: number;
}

export interface NoteTabs {
  /** As abas das categorias e "Sem categoria", das maiores para as menores (vazio: nada a separar). */
  tabs: NoteTab[];
  /** Quantas anotações à mostra no mural inteiro (o número de "Tudo"). */
  all: number;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** A aba de uma anotação. O "c:" na frente: uma categoria chamada "Sem" não cai na aba das sem categoria. */
export function noteTabKey(r: Pick<Review, 'category'>): string {
  return r.category ? `c:${fold(r.category.trim())}` : NO_CATEGORY_TAB;
}

/** As abas do mural. `shown`: a anotação está à mostra (as finalizadas escondidas não contam no número). */
export function noteTabsOf(notes: readonly Review[], shown: (r: Review) => boolean = () => true): NoteTabs {
  const buckets = new Map<string, { total: number; n: number; spellings: Map<string, number> }>();
  let all = 0;
  for (const r of notes) {
    const key = noteTabKey(r);
    let b = buckets.get(key);
    if (!b) buckets.set(key, (b = { total: 0, n: 0, spellings: new Map() }));
    b.total++;
    if (shown(r)) {
      b.n++;
      all++;
    }
    if (r.category) b.spellings.set(r.category, (b.spellings.get(r.category) ?? 0) + 1);
  }
  if (buckets.size < 2) return { tabs: [], all };
  const tabs: NoteTab[] = [];
  for (const [key, b] of buckets) {
    // a grafia mais usada (no empate, a primeira que apareceu)
    const label = key === NO_CATEGORY_TAB ? 'Sem categoria' : [...b.spellings.entries()].reduce((best, e) => (e[1] > best[1] ? e : best))[0];
    tabs.push({ key, label, n: b.n, total: b.total });
  }
  const none = (t: NoteTab) => (t.key === NO_CATEGORY_TAB ? 1 : 0);
  tabs.sort((a, b) => b.n - a.n || b.total - a.total || none(a) - none(b) || collator.compare(a.label, b.label));
  return { tabs, all };
}

/** A aba existe no mural? (a guardada pode ter sumido: a categoria foi trocada ou apagada) */
export function hasTab(tabs: NoteTabs, key: string): boolean {
  return key === ALL_TAB || tabs.tabs.some((t) => t.key === key);
}

/**
 * Quais abas ficam em pé e quais vão para o "Mais". `fits(n)`: cabem n abas de categoria em pé (as n
 * escolhidas), além de Tudo e, se sobrar alguma, do "Mais". Ficam as com mais anotações (e a aberta,
 * sempre), no máximo `MAX_TABS` contando Tudo; em pé, continuam na ordem de `noteTabsOf`.
 */
export function splitTabs(tabs: readonly NoteTab[], active: string, fits: (shown: readonly NoteTab[], more: boolean) => boolean = () => true): { shown: NoteTab[]; more: NoteTab[] } {
  // a ordem de quem fica: a aberta primeiro, depois as maiores (no empate, a que vem antes)
  const byWeight = [...tabs].sort((a, b) => (b.key === active ? 1 : 0) - (a.key === active ? 1 : 0) || b.n - a.n || b.total - a.total || tabs.indexOf(a) - tabs.indexOf(b));
  let keep = Math.min(tabs.length, MAX_TABS - 1);
  const pick = (k: number) => new Set(byWeight.slice(0, k).map((t) => t.key));
  while (keep > 0 && !fits(tabs.filter((t) => pick(keep).has(t.key)), keep < tabs.length)) keep--;
  const kept = pick(keep);
  return { shown: tabs.filter((t) => kept.has(t.key)), more: tabs.filter((t) => !kept.has(t.key)) };
}
