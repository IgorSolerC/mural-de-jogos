import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { countOf } from './kinds';
import { Mural } from './mural';
import {
  NO_DAY_LABEL,
  RATED_KEYS,
  Review,
  SCORE_LABEL,
  STATUS_RANK,
  ScoreKey,
  VERDICTS,
  Verdict,
  fold,
  parseDay,
  scoreKeys,
  scoreOf,
} from './review';

export type SortKey = 'data' | 'nota' | 'alfabetica' | 'status';
export type Direction = 'desc' | 'asc';
export type Density = 'completa' | 'simples';

const KEY = 'mural-de-jogos:vista:v1';

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
      density: raw.density === 'simples' ? 'simples' : 'completa',
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

/** Filtro do mural: um veredito, as fichas sem veredito, ou todas. */
export type VerdictFilter = Verdict | 'sem' | 'todos';

/** Estado do mural aberto: busca, filtro de veredito e ordenação. */
@Injectable({ providedIn: 'root' })
export class WallView {
  private readonly mural = inject(Mural);
  private readonly prefs = readPrefs();

  readonly query = signal('');
  readonly verdict = signal<VerdictFilter>('todos');
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

  readonly verdictCounts = computed(() => {
    const counts = { todos: 0, sem: 0, ...Object.fromEntries(VERDICTS.map((v) => [v, 0])) } as Record<VerdictFilter, number>;
    for (const r of this.mural.reviews()) {
      counts.todos++;
      counts[r.verdict ?? 'sem']++;
    }
    return counts;
  });

  readonly isFiltered = computed(() => this.query().trim() !== '' || this.verdict() !== 'todos');

  readonly visible = computed<Review[]>(() => {
    const needle = fold(this.query().trim());
    const verdict = this.verdict();
    const list = this.mural.reviews().filter(
      (r) =>
        (verdict === 'todos' || (r.verdict ?? 'sem') === verdict) &&
        (!needle ||
          fold(r.game.name).includes(needle) ||
          fold(r.text).includes(needle) ||
          r.bonuses.some((b) => fold(b.label).includes(needle))),
    );
    return list.sort(this.comparator());
  });

  /**
   * O mural agrupado pelo que ordena: mês, faixa de nota, letra ou status. A lista já vem ordenada,
   * então cada grupo é só uma sequência de fichas com a mesma chave.
   */
  readonly groups = computed<WallGroup[]>(() => {
    const keyOf = this.groupKey();
    const groups: WallGroup[] = [];
    for (const r of this.visible()) {
      const [key, label] = keyOf(r);
      const last = groups.at(-1);
      if (last?.key === key) last.reviews.push(r);
      else groups.push({ key, label, summary: '', reviews: [r] });
    }
    const showAvg = this.sort() !== 'nota';
    for (const g of groups) {
      const n = g.reviews.length;
      const parts = [countOf(this.mural.profile(), n)];
      if (showAvg && n > 1) parts.push(`média ${avgFmt.format(g.reviews.reduce((s, r) => s + r.scores.final, 0) / n)}`);
      g.summary = parts.join(' · ');
    }
    return groups;
  });

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

  clearFilters(): void {
    this.query.set('');
    this.verdict.set('todos');
  }

  private groupKey(): (r: Review) => [string, string] {
    switch (this.sort()) {
      case 'alfabetica':
        return (r) => {
          const c = letterOf(r.game.name);
          return c === '#' ? ['num', '#'] : [c, c];
        };
      case 'status': {
        const groups = this.mural.profile().statusGroup;
        return (r) => [r.status, groups[r.status]];
      }
      case 'nota': {
        const k = this.activeScore();
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
          const month = r.completedAt.slice(0, 7);
          const label = monthFmt.format(parseDay(month + '-01'));
          return [month, label.charAt(0).toUpperCase() + label.slice(1)];
        };
    }
  }

  private comparator(): (a: Review, b: Review) => number {
    const sign = this.direction() === 'desc' ? -1 : 1;
    // Data de conclusão primeiro; no mesmo dia, a ficha criada por último vem antes. Sem data conta
    // como a mais antiga, então fica no fim quando a data só desempata.
    const byDate = (a: Review, b: Review) =>
      (a.completedAt ?? '').localeCompare(b.completedAt ?? '') || Date.parse(a.createdAt) - Date.parse(b.createdAt);
    switch (this.sort()) {
      case 'alfabetica':
        // a seção manda primeiro (o "#" antes do A), senão o Ø, o Ł ou um nome em japonês, que o
        // collator põe no meio do alfabeto, abririam outra seção "#" no meio das letras
        return (a, b) =>
          sign * (letterOf(a.game.name).localeCompare(letterOf(b.game.name)) || collator.compare(a.game.name, b.game.name)) ||
          -byDate(a, b);
      case 'status':
        return (a, b) => sign * (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || -byDate(a, b);
      case 'nota': {
        const key = this.activeScore();
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
}
