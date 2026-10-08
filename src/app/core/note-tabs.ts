import { Review, fold } from './review';

/**
 * As abas do mural de anotações: as divisórias de fichário, uma por categoria. A categoria é uma só
 * por anotação, então ela já é a pasta: a aba só mostra as anotações dela (as fixadas também, no
 * topo da aba), e "Tudo" mostra o mural inteiro, como antes.
 *
 * - Toda categoria tem a sua aba, de A a Z (a ordem não muda sozinha, para a mão aprender onde cada
 *   uma está); as sem categoria ganham a aba "Sem categoria", depois das outras.
 * - Cabem no máximo `MAX_TABS` abas em pé, contando Tudo, e só as que couberem na largura: as que
 *   sobram (as com menos anotações) vão para o "Mais" (ver `splitTabs` e NoteTabsBar).
 * - O número da aba é o de anotações à mostra; `total` conta as finalizadas também (é por ele que a
 *   aba que sobra é escolhida, e finalizar não muda a aba de lugar).
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
  /** As abas das categorias, de A a Z, e "Sem categoria" no fim (vazio: nada a separar). */
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
  let none: NoteTab | null = null;
  for (const [key, b] of buckets) {
    if (key === NO_CATEGORY_TAB) {
      none = { key, label: 'Sem categoria', n: b.n, total: b.total };
      continue;
    }
    // a grafia mais usada (no empate, a primeira que apareceu)
    const label = [...b.spellings.entries()].reduce((best, e) => (e[1] > best[1] ? e : best))[0];
    tabs.push({ key, label, n: b.n, total: b.total });
  }
  tabs.sort((a, b) => collator.compare(a.label, b.label));
  if (none) tabs.push(none);
  return { tabs, all };
}

/** A aba existe no mural? (a guardada pode ter sumido: a categoria foi trocada ou apagada) */
export function hasTab(tabs: NoteTabs, key: string): boolean {
  return key === ALL_TAB || tabs.tabs.some((t) => t.key === key);
}

/**
 * Quais abas ficam em pé e quais vão para o "Mais". `fits(n)`: cabem n abas de categoria em pé (as n
 * escolhidas), além de Tudo e, se sobrar alguma, do "Mais". Ficam as com mais anotações (e a aberta,
 * sempre), no máximo `MAX_TABS` contando Tudo; em pé, continuam de A a Z.
 */
export function splitTabs(tabs: readonly NoteTab[], active: string, fits: (shown: readonly NoteTab[], more: boolean) => boolean = () => true): { shown: NoteTab[]; more: NoteTab[] } {
  // a ordem de quem fica: a aberta primeiro, depois as maiores (no empate, a de A a Z)
  const byWeight = [...tabs].sort((a, b) => (b.key === active ? 1 : 0) - (a.key === active ? 1 : 0) || b.total - a.total || tabs.indexOf(a) - tabs.indexOf(b));
  let keep = Math.min(tabs.length, MAX_TABS - 1);
  const pick = (k: number) => new Set(byWeight.slice(0, k).map((t) => t.key));
  while (keep > 0 && !fits(tabs.filter((t) => pick(keep).has(t.key)), keep < tabs.length)) keep--;
  const kept = pick(keep);
  return { shown: tabs.filter((t) => kept.has(t.key)), more: tabs.filter((t) => !kept.has(t.key)) };
}
