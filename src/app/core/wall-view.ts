import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { KindProfile, countOf } from './kinds';
import { Mural } from './mural';
import { Settings } from './settings';
import {
  NO_DAY_LABEL,
  RATED_KEYS,
  Review,
  SCORE_LABEL,
  STATUS_RANK,
  ScoreKey,
  fold,
  parseDay,
  scoreKeys,
  scoreOf,
} from './review';
import { FacetKey, NO_FILTER, WallFilter, facetsOf, filterSize, matchesFilter, matchesQuery, tagsOf, toggleOption } from './wall-filter';

export type SortKey = 'data' | 'nota' | 'alfabetica' | 'status';
export type Direction = 'desc' | 'asc';
/** Completa (tudo), simples (a tira com a nota) ou capas (só a foto e o nome, para ver o máximo de fichas). */
export type Density = 'completa' | 'simples' | 'capas';

const KEY = 'mural-de-jogos:vista:v1';

/** Os grupos da cartela de filtros que contam o que a pessoa achou: somem no modo sem spoilers. */
const SPOILER_FACETS: readonly FacetKey[] = ['verdict', 'grade', 'difficulty'];

interface ViewPrefs {
  sort: SortKey;
  scoreKey: ScoreKey;
  direction: Direction;
  density: Density;
}

const DEFAULT_DIRECTION: Record<SortKey, Direction> = {
  data: 'desc',
  nota: 'desc',
  alfabetica: 'asc',
  status: 'desc',
};

function readPrefs(): ViewPrefs {
  const fallback: ViewPrefs = { sort: 'data', scoreKey: 'final', direction: 'desc', density: 'completa' };
  try {
    const raw = JSON.parse(localStorage.getItem(KEY) ?? 'null');
    if (!raw) return fallback;
    return {
      sort: ['data', 'nota', 'alfabetica', 'status'].includes(raw.sort) ? raw.sort : fallback.sort,
      scoreKey: raw.scoreKey === 'final' || (RATED_KEYS as readonly string[]).includes(raw.scoreKey)
        ? raw.scoreKey
        : fallback.scoreKey,
      direction: raw.direction === 'asc' ? 'asc' : 'desc',
      density: raw.density === 'simples' || raw.density === 'capas' ? raw.density : 'completa',
    };
  } catch {
    return fallback;
  }
}

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });

/** A letra da seção na ordem alfabética: A a Z sem acento, e "#" para número, símbolo e outras escritas. */
function letterOf(name: string): string {
  const c = fold(name.trim()).charAt(0).toUpperCase();
  return /[A-Z]/.test(c) ? c : '#';
}
const monthFmt = new Intl.DateTimeFormat('pt-BR', { month: 'long', year: 'numeric' });
const avgFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** Uma seção do mural: fichas vizinhas na ordem atual que dividem a mesma etiqueta. */
export interface WallGroup {
  key: string;
  label: string;
  summary: string;
  reviews: Review[];
}

/** Estado do mural aberto: busca, filtros e ordenação. */
@Injectable({ providedIn: 'root' })
export class WallView {
  private readonly mural = inject(Mural);
  private readonly settings = inject(Settings);
  private readonly prefs = readPrefs();

  readonly query = signal('');
  /** Os filtros da cartela. Valem só nesta visita, como a busca. */
  readonly filter = signal<WallFilter>(NO_FILTER);
  readonly sort = signal<SortKey>(this.prefs.sort);
  /** A nota escolhida para ordenar. Guardada mesmo que o mural aberto não tenha ela (ver `activeScore`). */
  readonly scoreKey = signal<ScoreKey>(this.prefs.scoreKey);
  /** A nota que ordena de fato: a escolhida, se o mural aberto tem ela; senão, a Média. */
  readonly activeScore = computed<ScoreKey>(() => {
    const k = this.scoreKey();
    return scoreKeys(this.mural.kind()).includes(k) ? k : 'final';
  });
  readonly direction = signal<Direction>(this.prefs.direction);
  readonly density = signal<Density>(this.prefs.density);

  /**
   * A ordem que vale de fato. Sem spoilers, ordenar por nota entregaria o ranking mesmo com as notas
   * escondidas: o mural fica por data, e a escolha guardada volta quando o modo desliga.
   */
  readonly shownSort = computed<SortKey>(() => (this.settings.noSpoilers() && this.sort() === 'nota' ? 'data' : this.sort()));
  /** Os filtros que valem de fato: sem spoilers, filtrar por veredito, nota ou dificuldade entregaria o que está escondido. */
  private readonly activeFilter = computed<WallFilter>(() => {
    const f = this.filter();
    return this.settings.noSpoilers() && (f.verdict.length || f.grade.length || f.difficulty.length)
      ? { ...f, verdict: [], grade: [], difficulty: [] }
      : f;
  });

  /** As fichas que a busca encontra, antes dos filtros: é sobre elas que a cartela conta. */
  private readonly searched = computed<Review[]>(() => {
    const needle = fold(this.query().trim());
    return this.mural.reviews().filter((r) => matchesQuery(r, needle));
  });

  /** Os grupos da cartela, com quantas fichas cada opção mostraria. */
  readonly facets = computed(() => {
    const all = facetsOf(this.searched(), this.activeFilter(), this.mural.profile());
    return this.settings.noSpoilers() ? all.filter((f) => !SPOILER_FACETS.includes(f.key)) : all;
  });
  /** Os filtros ligados, como etiquetas. */
  readonly tags = computed(() => tagsOf(this.activeFilter(), this.mural.profile()));
  readonly filterCount = computed(() => filterSize(this.activeFilter()));

  readonly isFiltered = computed(() => this.query().trim() !== '' || this.filterCount() > 0);

  readonly visible = computed<Review[]>(() => {
    const f = this.activeFilter();
    const list = this.searched().filter((r) => matchesFilter(r, f));
    return list.sort(comparatorOf(this.order()));
  });

  private readonly order = computed<WallOrder>(() => ({
    sort: this.shownSort(),
    key: this.activeScore(),
    direction: this.direction(),
    profile: this.mural.profile(),
  }));

  readonly groups = computed<WallGroup[]>(() => groupWall(this.visible(), this.order(), this.settings.noSpoilers()));

  constructor() {
    effect(() => {
      const prefs: ViewPrefs = {
        sort: this.sort(),
        scoreKey: this.scoreKey(),
        direction: this.direction(),
        density: this.density(),
      };
      try {
        localStorage.setItem(KEY, JSON.stringify(prefs));
      } catch {
        /* preferências valem só nesta sessão */
      }
    });
  }

  setSort(sort: SortKey): void {
    if (this.sort() === sort) return;
    this.sort.set(sort);
    this.direction.set(DEFAULT_DIRECTION[sort]);
  }

  toggleDirection(): void {
    this.direction.update((d) => (d === 'desc' ? 'asc' : 'desc'));
  }

  toggle(key: FacetKey, value: string): void {
    this.filter.update((f) => toggleOption(f, key, value));
  }

  clearFacet(key: FacetKey): void {
    this.filter.update((f) => (f[key].length ? { ...f, [key]: [] } : f));
  }

  clearFilters(): void {
    this.query.set('');
    this.filter.set(NO_FILTER);
  }

  /** Guarda a busca, o filtro e a ordem, e devolve como voltar a eles (ver ViewTransitions.run). */
  snapshot(): () => void {
    const query = this.query(),
      filter = this.filter(),
      sort = this.sort(),
      scoreKey = this.scoreKey(),
      direction = this.direction(),
      density = this.density();
    return () => {
      this.query.set(query);
      this.filter.set(filter);
      this.sort.set(sort);
      this.scoreKey.set(scoreKey);
      this.direction.set(direction);
      this.density.set(density);
    };
  }
}


/** Como o mural está ordenado: serve ao seu mural e ao mural de um colega. */
export interface WallOrder {
  sort: SortKey;
  /** A nota que ordena (só vale com `sort: 'nota'`). */
  key: ScoreKey;
  direction: Direction;
  profile: KindProfile;
}

/** As fichas na ordem pedida. */
export function sortWall(list: readonly Review[], o: WallOrder): Review[] {
  return [...list].sort(comparatorOf(o));
}

/**
 * O mural agrupado pelo que ordena: mês, faixa de nota, letra ou status. A lista já vem ordenada,
 * então cada grupo é só uma sequência de fichas com a mesma chave.
 */
export function groupWall(sorted: readonly Review[], o: WallOrder, hideAverage = false): WallGroup[] {
  const keyOf = groupKeyOf(o);
  const groups: WallGroup[] = [];
  for (const r of sorted) {
    const [key, label] = keyOf(r);
    const last = groups.at(-1);
    if (last?.key === key) last.reviews.push(r);
    else groups.push({ key, label, summary: '', reviews: [r] });
  }
  const showAvg = o.sort !== 'nota' && !hideAverage;
  for (const g of groups) {
    const n = g.reviews.length;
    const parts = [countOf(o.profile, n)];
    if (showAvg && n > 1) parts.push(`média ${avgFmt.format(g.reviews.reduce((s, r) => s + r.scores.final, 0) / n)}`);
    g.summary = parts.join(' · ');
  }
  return groups;
}

function groupKeyOf(o: WallOrder): (r: Review) => [string, string] {
  switch (o.sort) {
    case 'alfabetica':
      return (r) => {
        const c = letterOf(r.game.name);
        return c === '#' ? ['num', '#'] : [c, c];
      };
    case 'status': {
      const groups = o.profile.statusGroup;
      return (r) => [r.status, groups[r.status]];
    }
    case 'nota': {
      const k = o.key;
      if (k === 'final') {
        return (r) => {
          const band = Math.min(9, Math.floor(r.scores.final));
          if (band < 5) return ['b-low', 'Abaixo de 5'];
          return [`b${band}`, band === 9 ? '9 ou mais' : `Na casa do ${band}`];
        };
      }
      const name = SCORE_LABEL[k];
      return (r) => {
        const v = scoreOf(r.scores, k);
        return v === null ? ['none', `Sem nota de ${name}`] : [`v${v}`, `${name} ${String(v).replace('.', ',')}`];
      };
    }
    default:
      return (r) => {
        if (r.completedAt === null) return ['sem-data', NO_DAY_LABEL];
        if (r.completedAt.length === 4) return [r.completedAt, `${r.completedAt}, mês não lembrado`];
        const month = r.completedAt.slice(0, 7);
        const label = monthFmt.format(parseDay(month + '-01'));
        return [month, label.charAt(0).toUpperCase() + label.slice(1)];
      };
  }
}

function comparatorOf(o: WallOrder): (a: Review, b: Review) => number {
  const sign = o.direction === 'desc' ? -1 : 1;
  // Data de conclusão primeiro; no mesmo dia, a ficha criada por último vem antes. Sem data conta
  // como a mais antiga, então fica no fim quando a data só desempata.
  const byDate = (a: Review, b: Review) =>
    (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || Date.parse(a.createdAt) - Date.parse(b.createdAt);
  switch (o.sort) {
    case 'alfabetica':
      // a seção manda primeiro (o "#" antes do A), senão o Ø, o Ł ou um nome em japonês, que o
      // collator põe no meio do alfabeto, abririam outra seção "#" no meio das letras
      return (a, b) =>
        sign * (letterOf(a.game.name).localeCompare(letterOf(b.game.name)) || collator.compare(a.game.name, b.game.name)) ||
        -byDate(a, b);
    case 'status':
      return (a, b) => sign * (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || -byDate(a, b);
    case 'nota': {
      const key = o.key;
      return (a, b) => {
        const av = scoreOf(a.scores, key);
        const bv = scoreOf(b.scores, key);
        // Sem nota vai sempre para o fim, em qualquer direção.
        if (av === null && bv === null) return -byDate(a, b);
        if (av === null) return 1;
        if (bv === null) return -1;
        return sign * (av - bv) || -(a.scores.final - b.scores.final) || -byDate(a, b);
      };
    }
    default:
      return (a, b) => {
        // Sem data vai sempre para o fim, em qualquer direção.
        if ((a.completedAt === null) !== (b.completedAt === null)) return a.completedAt === null ? 1 : -1;
        return sign * byDate(a, b);
      };
  }
}
