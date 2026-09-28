import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { Router } from '@angular/router';
import {
  ArrowDown,
  ArrowUp,
  ChevronDown,
  LayoutGrid,
  LucideAngularModule,
  Plus,
  Rows3,
  SquareCheckBig,
  X,
} from 'lucide-angular';
import { Desk } from '../core/desk';
import {
  DIFFICULTY_LABEL,
  RATED_KEYS,
  RatedKey,
  Review,
  SCORE_LABEL,
  ScoreKey,
  WEIGHT_LABEL,
  formatHours,
  formatScore,
  parseDay,
  sortBonuses,
  weightOf,
} from '../core/review';
import { ReviewStore } from '../core/review-store';
import { SideBySide, SideSort } from '../core/side-by-side';
import { ViewTransitions } from '../core/view-transitions';
import { Density, WallView } from '../core/wall-view';
import { BonusSticker } from '../ui/bonus';
import { CoverSleeve } from '../ui/cover-sleeve';
import { Skulls } from '../ui/difficulty';
import { PenMark } from '../ui/pen-mark';
import { Pin } from '../ui/pin';
import { ReviewCard } from '../ui/review-card';
import { StatusLabel } from '../ui/status-label';
import { Toasts } from '../ui/toast';
import { VerdictStamp } from '../ui/verdict';

const SORT_OPTIONS: { value: SideSort; label: string }[] = [
  { value: 'marcada', label: 'Como marquei' },
  { value: 'ano', label: 'Lançamento' },
  { value: 'data', label: 'Data' },
];

const SCORE_OPTIONS: { value: SideSort; label: string }[] = [
  { value: 'final', label: 'Média' },
  ...RATED_KEYS.map((k) => ({ value: k as SideSort, label: SCORE_LABEL[k] })),
];

const collator = new Intl.Collator('pt-BR', { sensitivity: 'base', numeric: true });
const dateFmt = new Intl.DateTimeFormat('pt-BR', { day: '2-digit', month: 'short', year: 'numeric' });
const avgFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });

/** As linhas do quadro: as notas primeiro, os fatos da ficha depois. */
type RowKind = 'final' | 'score' | 'bonus' | 'verdict' | 'hours' | 'status' | 'difficulty' | 'date' | 'year';

interface Row {
  id: string;
  label: string;
  kind: RowKind;
  score?: RatedKey;
  /** É o que está ordenando as fichas: ganha o risco de caneta no nome. */
  sorted: boolean;
  /** Primeira linha dos fatos: um traço mais forte a separa das notas. */
  split?: boolean;
}

/**
 * Lado a lado: só as fichas marcadas, numa fileira sem seções, e embaixo a folha "Nota a nota"
 * com uma coluna por jogo e a melhor nota de cada linha circulada a caneta.
 */
@Component({
  selector: 'app-side-by-side-page',
  imports: [BonusSticker, CoverSleeve, LucideAngularModule, PenMark, Pin, ReviewCard, Skulls, StatusLabel, VerdictStamp],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './side-by-side-page.html',
  styleUrl: './side-by-side-page.scss',
})
export class SideBySidePage {
  protected readonly store = inject(ReviewStore);
  protected readonly side = inject(SideBySide);
  protected readonly view = inject(WallView);
  protected readonly desk = inject(Desk);
  private readonly router = inject(Router);
  private readonly toasts = inject(Toasts);
  private readonly vt = inject(ViewTransitions);

  protected readonly ChevronIcon = ChevronDown;
  protected readonly FullIcon = Rows3;
  protected readonly CompactIcon = LayoutGrid;
  protected readonly PlusIcon = Plus;
  protected readonly MarkIcon = SquareCheckBig;
  protected readonly RemoveIcon = X;
  protected readonly UpIcon = ArrowUp;
  protected readonly DownIcon = ArrowDown;
  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly scoreOptions = SCORE_OPTIONS;
  protected readonly weightLabels = WEIGHT_LABEL;
  protected readonly difficultyLabel = DIFFICULTY_LABEL;
  protected readonly weightOf = weightOf;
  protected readonly fmt = formatScore;

  protected readonly sortLabel = computed(
    () => [...SORT_OPTIONS, ...SCORE_OPTIONS].find((o) => o.value === this.side.sort())?.label ?? '',
  );

  /** As fichas na ordem escolhida. Sem nota, sem data ou sem ano vai para o fim. */
  protected readonly games = computed<Review[]>(() => {
    const list = [...this.side.reviews()];
    const s = this.side.sort();
    if (s === 'marcada') return list;
    if (s === 'data') {
      return list.sort((a, b) =>
        a.completedAt === null || b.completedAt === null
          ? Number(a.completedAt === null) - Number(b.completedAt === null)
          : a.completedAt.localeCompare(b.completedAt),
      );
    }
    if (s === 'ano') {
      const year = (r: Review) => Number.parseInt(r.game.year ?? '', 10);
      return list.sort((a, b) => {
        const ay = year(a);
        const by = year(b);
        if (Number.isNaN(ay) || Number.isNaN(by)) return Number.isNaN(ay) ? (Number.isNaN(by) ? 0 : 1) : -1;
        return ay - by || collator.compare(a.game.name, b.game.name);
      });
    }
    return list.sort((a, b) => {
      const av = a.scores[s];
      const bv = b.scores[s];
      if (av === null || bv === null) return av === null ? (bv === null ? 0 : 1) : -1;
      return bv - av || b.scores.final - a.scores.final;
    });
  });

  /** A nota que ordena as fichas, para o risco de caneta nelas. */
  protected readonly highlight = computed<ScoreKey | null>(() => {
    const s = this.side.sort();
    return s === 'marcada' || s === 'data' || s === 'ano' ? null : s;
  });

  protected readonly summary = computed(() => {
    const list = this.side.reviews();
    const n = list.length;
    const parts = [`${n} ${n === 1 ? 'jogo' : 'jogos'}`];
    if (n > 1) parts.push(`média ${avgFmt.format(list.reduce((s, r) => s + r.scores.final, 0) / n)}`);
    return parts.join(' · ');
  });

  protected readonly rows = computed<Row[]>(() => {
    const s = this.side.sort();
    return [
      { id: 'final', label: 'Média', kind: 'final', sorted: s === 'final' },
      { id: 'verdict', label: 'Veredito', kind: 'verdict', sorted: false },
      ...RATED_KEYS.map<Row>((k) => ({ id: k, label: SCORE_LABEL[k], kind: 'score', score: k, sorted: s === k })),
      // os bônus só entram quando algum jogo marcado tem: senão seria uma linha só de traços
      ...(this.side.reviews().some((r) => r.bonuses.length)
        ? [{ id: 'bonus', label: 'Bônus', kind: 'bonus', sorted: false } as Row]
        : []),
      { id: 'hours', label: 'Horas', kind: 'hours', sorted: false, split: true },
      { id: 'status', label: 'Status', kind: 'status', sorted: false },
      { id: 'difficulty', label: 'Dificuldade', kind: 'difficulty', sorted: false },
      { id: 'date', label: 'Jogado em', kind: 'date', sorted: s === 'data' },
      { id: 'year', label: 'Lançamento', kind: 'year', sorted: s === 'ano' },
    ];
  });

  /**
   * Quem leva cada linha de nota: a maior, com empate valendo para todos. Se todos empatam, ou só
   * um jogo tem a nota, ninguém é circulado (não há o que comparar).
   */
  protected readonly winners = computed(() => {
    const games = this.side.reviews();
    const out = new Map<string, Set<string>>();
    for (const k of ['final', ...RATED_KEYS] as ScoreKey[]) {
      const scored = games.filter((r) => r.scores[k] !== null && (k === 'final' || weightOf(r.weights, k) !== 'nao-tem'));
      if (scored.length < 2) continue;
      const max = Math.max(...scored.map((r) => r.scores[k]!));
      const top = scored.filter((r) => r.scores[k] === max);
      if (top.length < scored.length) out.set(k, new Set(top.map((r) => r.id)));
    }
    return out;
  });

  protected won(key: string, id: string): boolean {
    return this.winners().get(key)?.has(id) ?? false;
  }

  /** "8,8" → 8 e 8, escritos como na etiqueta da ficha. */
  protected grade(v: number): { int: string; dec: string } {
    const [int, dec = ''] = formatScore(v).split(',');
    return { int, dec };
  }

  protected bonuses(r: Review) {
    return sortBonuses(r.bonuses);
  }

  protected hours(r: Review): string {
    return r.hoursPlayed === null ? '' : formatHours(r.hoursPlayed);
  }

  protected date(r: Review): string {
    return r.completedAt === null ? 'Sem data' : dateFmt.format(parseDay(r.completedAt)).replace(/\./g, '');
  }

  protected setSort(v: string): void {
    this.vt.run(() => this.side.sort.set(v as SideSort));
  }

  protected setDensity(d: Density): void {
    if (this.view.density() === d) return;
    this.vt.run(() => this.view.density.set(d));
  }

  protected remove(r: Review): void {
    const before = this.side.snapshot();
    this.vt.run(() => this.side.toggle(r.id));
    this.toasts.show(`“${r.game.name}” saiu do lado a lado`, {
      label: 'Desfazer',
      run: () => this.vt.run(() => this.side.restore(before)),
    });
  }

  protected clear(): void {
    const before = this.side.clear();
    this.toasts.show('Lado a lado limpo', { label: 'Desfazer', run: () => this.side.restore(before) });
  }

  /** Volta ao mural já no modo de marcar. */
  protected pickMore(): void {
    void this.router.navigateByUrl('/').then(() => this.side.picking.set(true));
  }
}
