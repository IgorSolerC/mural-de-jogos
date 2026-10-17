import { Review } from './review';
import { labelKey, nameCollator } from './text';

/**
 * As abas do mural de anotações: as divisórias de fichário, uma por categoria. A categoria é uma só
 * por anotação, então ela já é a pasta: a aba só mostra as anotações dela (as fixadas também, no
 * topo da aba), e "Tudo" mostra o mural inteiro, como antes.
 *
 * O mural de músicas usa as mesmas abas, uma por artista (a categoria da ficha de música é o
 * artista): tudo o que vale para "categoria" aqui vale para "artista" lá.
 *
 * - Toda categoria tem a sua aba, e as sem categoria ganham a aba "Sem categoria". Vão da que tem
 *   mais anotações para a que tem menos, pelo número que aparece nelas (o de anotações à mostra);
 *   no empate, a com mais anotações contando as finalizadas escondidas, depois as categorias antes
 *   de "Sem categoria", e então de A a Z.
 * - Cabem no máximo `MAX_TABS` abas em pé, contando Tudo, e só as que couberem na largura: as que
 *   sobram (as com menos anotações) vão para o "Mais" (ver `splitTabs` e NoteTabsBar).
 * - O número da aba é o de anotações à mostra; `total` conta as finalizadas também.
 * - Com tudo numa categoria só (ou tudo sem), não há o que separar: as abas não aparecem.
 * - Com a ordem montada à mão (a engrenagem do mural, ver core/mural-config.ts), as categorias vão
 *   nela; as que ficaram de fora (novas) vêm depois, pela quantidade, e "Sem categoria" fecha a fila.
 *   Para o "Mais" vão as últimas da ordem, não as menores.
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


/** A aba de uma anotação. O "c:" na frente: uma categoria chamada "Sem" não cai na aba das sem categoria. */
export function noteTabKey(r: Pick<Review, 'category'>): string {
  return r.category ? `c:${labelKey(r.category)}` : NO_CATEGORY_TAB;
}

/**
 * As abas do mural. `shown`: a anotação está à mostra (as finalizadas escondidas não contam no
 * número). `noneLabel`: o nome da aba de quem não tem categoria ("Sem artista", nas músicas).
 */
export function noteTabsOf(
  notes: readonly Review[],
  shown: (r: Review) => boolean = () => true,
  noneLabel = 'Sem categoria',
  order: readonly string[] | null = null,
): NoteTabs {
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
    const label = key === NO_CATEGORY_TAB ? noneLabel : [...b.spellings.entries()].reduce((best, e) => (e[1] > best[1] ? e : best))[0];
    tabs.push({ key, label, n: b.n, total: b.total });
  }
  const none = (t: NoteTab) => (t.key === NO_CATEGORY_TAB ? 1 : 0);
  tabs.sort((a, b) => b.n - a.n || b.total - a.total || none(a) - none(b) || nameCollator.compare(a.label, b.label));
  if (order) {
    // na ordem montada: as que têm lugar nele, depois as novas (já pela quantidade), "Sem categoria" no fim
    const at = new Map(order.map((k, i) => [`c:${k}`, i]));
    const place = (t: NoteTab) => (t.key === NO_CATEGORY_TAB ? Infinity : (at.get(t.key) ?? order.length));
    tabs.sort((a, b) => place(a) - place(b));
  }
  return { tabs, all };
}

/** A aba existe no mural? (a guardada pode ter sumido: a categoria foi trocada ou apagada) */
export function hasTab(tabs: NoteTabs, key: string): boolean {
  return key === ALL_TAB || tabs.tabs.some((t) => t.key === key);
}

/**
 * Quais abas ficam em pé e quais vão para o "Mais". `fits(n)`: cabem n abas de categoria em pé (as n
 * escolhidas), além de Tudo e, se sobrar alguma, do "Mais". Ficam as com mais anotações (e a aberta,
 * sempre), no máximo `MAX_TABS` contando Tudo; em pé, continuam na ordem de `noteTabsOf`. `ordered`:
 * as abas vêm na ordem montada à mão, e ficam em pé as primeiras dela (e a aberta). `hidden`: as abas
 * das categorias escondidas (na engrenagem do mural), que vão sempre para o "Mais", mesmo abertas (o
 * "Mais" mostra o nome da aberta).
 */
export function splitTabs(
  tabs: readonly NoteTab[],
  active: string,
  fits: (shown: readonly NoteTab[], more: boolean) => boolean = () => true,
  ordered = false,
  hidden: ReadonlySet<string> = new Set(),
): { shown: NoteTab[]; more: NoteTab[] } {
  const standing = tabs.filter((t) => !hidden.has(t.key));
  const anyHidden = standing.length < tabs.length;
  // a ordem de quem fica: a aberta primeiro, depois as maiores (no empate, a que vem antes); com a
  // ordem montada à mão, as primeiras dela
  const at = new Map(standing.map((t, i) => [t.key, i]));
  const byWeight = [...standing].sort(
    (a, b) => (b.key === active ? 1 : 0) - (a.key === active ? 1 : 0) || (ordered ? at.get(a.key)! - at.get(b.key)! : b.n - a.n || b.total - a.total),
  );
  let keep = Math.min(standing.length, MAX_TABS - 1);
  const pick = (k: number) => new Set(byWeight.slice(0, k).map((t) => t.key));
  while (keep > 0 && !fits(standing.filter((t) => pick(keep).has(t.key)), anyHidden || keep < standing.length)) keep--;
  const kept = pick(keep);
  return { shown: standing.filter((t) => kept.has(t.key)), more: tabs.filter((t) => !kept.has(t.key)) };
}
