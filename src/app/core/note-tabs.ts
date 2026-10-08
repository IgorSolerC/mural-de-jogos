import { Review, fold } from './review';

/**
 * As abas do mural de anotações: as divisórias de fichário, uma por categoria. A categoria é uma só
 * por anotação, então ela já é a pasta: a aba só mostra as anotações dela (as fixadas também, no
 * topo da aba), e "Tudo" mostra o mural inteiro, como antes.
 *
 * - As categorias com pelo menos `OWN_TAB_MIN` anotações têm aba própria, de A a Z (a ordem não muda
 *   sozinha, para a mão aprender onde cada uma está). As menores ficam no "Mais".
 * - As sem categoria ganham a aba "Sem categoria", depois das outras.
 * - A conta é sobre todas as anotações, finalizadas também: finalizar não faz uma aba sumir. O número
 *   da aba é o de anotações à mostra.
 * - Com tudo numa categoria só (ou tudo sem), não há o que separar: as abas não aparecem.
 */

/** A aba "Tudo": o mural inteiro. */
export const ALL_TAB = '';
/** A aba das anotações sem categoria. */
export const NO_CATEGORY_TAB = 'sem';
/** Quantas anotações uma categoria precisa ter para ganhar aba própria (as menores vão para o "Mais"). */
export const OWN_TAB_MIN = 3;

export interface NoteTab {
  /** `NO_CATEGORY_TAB`, ou "c:" e a categoria sem acento nem caixa. */
  key: string;
  label: string;
  /** Quantas anotações da aba estão à mostra (as finalizadas escondidas não contam). */
  n: number;
  /** A cor da etiquetinha da categoria (null: Sem categoria). */
  color: string | null;
}

export interface NoteTabs {
  /** As abas em pé: as categorias grandes de A a Z e, no fim, "Sem categoria". */
  main: NoteTab[];
  /** As categorias pequenas, de A a Z, no "Mais". */
  more: NoteTab[];
  /** Quantas anotações à mostra no mural inteiro (o número de "Tudo"). */
  all: number;
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/**
 * As cores das etiquetinhas de papel que vão dentro da janela de plástico da divisória, como nas
 * pastas suspensas e nas matérias do caderno: claras, para a tinta preta, e diferentes das
 * cartolinas neon das fichas.
 */
const LABEL_COLORS = ['#ffd95e', '#ffa9c0', '#9ad7ff', '#a6e8a0', '#ffbe7d', '#d2b5ff', '#8ee6d6', '#ff9a8b'] as const;

/**
 * A cor da categoria: sai do nome (sem acento nem caixa), então é sempre a mesma, na aba do mural, na
 * orelha da ficha e na lista, e não muda quando outra categoria aparece.
 */
export function categoryColor(label: string): string {
  let h = 2166136261;
  for (const ch of fold(label.trim())) h = Math.imul(h ^ ch.codePointAt(0)!, 16777619);
  return LABEL_COLORS[(h >>> 0) % LABEL_COLORS.length];
}

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
  if (buckets.size < 2) return { main: [], more: [], all };
  const main: NoteTab[] = [];
  const more: NoteTab[] = [];
  let none: NoteTab | null = null;
  for (const [key, b] of buckets) {
    if (key === NO_CATEGORY_TAB) {
      none = { key, label: 'Sem categoria', n: b.n, color: null };
      continue;
    }
    // a grafia mais usada (no empate, a primeira que apareceu)
    const label = [...b.spellings.entries()].reduce((best, e) => (e[1] > best[1] ? e : best))[0];
    (b.total >= OWN_TAB_MIN ? main : more).push({ key, label, n: b.n, color: categoryColor(label) });
  }
  const byLabel = (a: NoteTab, b: NoteTab) => collator.compare(a.label, b.label);
  main.sort(byLabel);
  more.sort(byLabel);
  if (none) main.push(none);
  return { main, more, all };
}

/** A aba existe no mural? (a guardada pode ter sumido: a categoria foi trocada ou apagada) */
export function hasTab(tabs: NoteTabs, key: string): boolean {
  return key === ALL_TAB ? true : tabs.main.some((t) => t.key === key) || tabs.more.some((t) => t.key === key);
}
