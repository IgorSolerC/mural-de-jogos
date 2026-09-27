import { Injectable, computed, effect, inject, signal } from '@angular/core';
import { Review, SCORE_KEYS, STATUS_RANK, ScoreKey, Status, fold } from './review';
import { ReviewStore } from './review-store';

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
      scoreKey: (SCORE_KEYS as readonly string[]).includes(raw.scoreKey)
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

/** Estado do mural: busca, filtro de status e ordenação. */
@Injectable({ providedIn: 'root' })
export class WallView {
  private readonly store = inject(ReviewStore);
  private readonly prefs = readPrefs();

  readonly query = signal('');
  readonly status = signal<Status | 'todos'>('todos');
  readonly sort = signal<SortKey>(this.prefs.sort);
  readonly scoreKey = signal<ScoreKey>(this.prefs.scoreKey);
  readonly direction = signal<Direction>(this.prefs.direction);
  readonly density = signal<Density>(this.prefs.density);

  readonly statusCounts = computed(() => {
    const counts: Record<Status | 'todos', number> = { todos: 0, incompleto: 0, finalizado: 0, platinado: 0 };
    for (const r of this.store.reviews()) {
      counts.todos++;
      counts[r.status]++;
    }
    return counts;
  });

  readonly isFiltered = computed(() => this.query().trim() !== '' || this.status() !== 'todos');

  readonly visible = computed<Review[]>(() => {
    const needle = fold(this.query().trim());
    const status = this.status();
    const list = this.store.reviews().filter(
      (r) =>
        (status === 'todos' || r.status === status) &&
        (!needle || fold(r.game.name).includes(needle) || fold(r.text).includes(needle)),
    );
    return list.sort(this.comparator());
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
    this.status.set('todos');
  }

  private comparator(): (a: Review, b: Review) => number {
    const sign = this.direction() === 'desc' ? -1 : 1;
    // Data de conclusão primeiro; no mesmo dia, a ficha criada por último vem antes.
    const byDate = (a: Review, b: Review) =>
      a.completedAt.localeCompare(b.completedAt) || Date.parse(a.createdAt) - Date.parse(b.createdAt);
    switch (this.sort()) {
      case 'alfabetica':
        return (a, b) => sign * collator.compare(a.game.name, b.game.name) || -byDate(a, b);
      case 'status':
        return (a, b) => sign * (STATUS_RANK[a.status] - STATUS_RANK[b.status]) || -byDate(a, b);
      case 'nota': {
        const key = this.scoreKey();
        return (a, b) => {
          const av = a.scores[key];
          const bv = b.scores[key];
          // Sem nota vai sempre para o fim, em qualquer direção.
          if (av === null && bv === null) return -byDate(a, b);
          if (av === null) return 1;
          if (bv === null) return -1;
          return sign * (av - bv) || -(a.scores.final - b.scores.final) || -byDate(a, b);
        };
      }
      default:
        return (a, b) => sign * byDate(a, b);
    }
  }
}
