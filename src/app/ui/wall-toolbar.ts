import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  LayoutGrid,
  LucideAngularModule,
  Rows3,
} from 'lucide-angular';
import { RATED_KEYS, SCORE_LABEL, ScoreKey, VERDICTS, VERDICT_LABEL } from '../core/review';
import { ViewTransitions } from '../core/view-transitions';
import { Density, SortKey, VerdictFilter, WallView } from '../core/wall-view';
import { SearchStrip } from './search-strip';

/** Ordenar é um controle só: data, nome, status ou uma das notas. */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'data', label: 'Data' },
  { value: 'alfabetica', label: 'Nome' },
  { value: 'status', label: 'Status' },
];

const SCORE_OPTIONS: { value: string; label: string }[] = [
  { value: 'nota:final', label: 'Média' },
  ...RATED_KEYS.map((k) => ({ value: `nota:${k}`, label: SCORE_LABEL[k] })),
];

@Component({
  selector: 'app-wall-toolbar',
  imports: [LucideAngularModule, SearchStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-toolbar.html',
  styleUrl: './wall-toolbar.scss',
})
export class WallToolbar {
  protected readonly view = inject(WallView);
  private readonly vt = inject(ViewTransitions);

  protected readonly DescIcon = ArrowDownWideNarrow;
  protected readonly AscIcon = ArrowUpNarrowWide;
  protected readonly FullIcon = Rows3;
  protected readonly CompactIcon = LayoutGrid;
  protected readonly ChevronIcon = ChevronDown;

  protected readonly sortOptions = SORT_OPTIONS;
  protected readonly scoreOptions = SCORE_OPTIONS;
  /** Os cinco vereditos; "Sem veredito" só entra quando alguma ficha não tem um. */
  protected readonly verdictTabs = computed<VerdictFilter[]>(() =>
    this.view.verdictCounts().sem > 0 || this.view.verdict() === 'sem' ? [...VERDICTS, 'sem'] : [...VERDICTS],
  );

  protected readonly sortValue = computed(() =>
    this.view.sort() === 'nota' ? `nota:${this.view.scoreKey()}` : this.view.sort(),
  );

  protected readonly sortLabel = computed(() => {
    const v = this.sortValue();
    const opt = [...SORT_OPTIONS, ...SCORE_OPTIONS].find((o) => o.value === v);
    return opt?.label ?? 'Data';
  });

  protected readonly verdictText = computed(() => this.labelOf(this.view.verdict()));

  protected labelOf(v: VerdictFilter): string {
    return v === 'todos' ? 'Todos' : v === 'sem' ? 'Sem veredito' : VERDICT_LABEL[v];
  }

  protected directionLabel(): string {
    const desc = this.view.direction() === 'desc';
    switch (this.view.sort()) {
      case 'data':
        return desc ? 'Mais recentes primeiro' : 'Mais antigas primeiro';
      case 'alfabetica':
        return desc ? 'De Z a A' : 'De A a Z';
      case 'status':
        return desc ? 'Platinados primeiro' : 'Incompletos primeiro';
      default:
        return desc ? 'Maiores notas primeiro' : 'Menores notas primeiro';
    }
  }

  protected setVerdict(v: VerdictFilter): void {
    this.vt.run(() => this.view.verdict.set(v));
  }

  protected setSortValue(v: string): void {
    this.vt.run(() => {
      if (v.startsWith('nota:')) {
        this.view.setSort('nota');
        this.view.scoreKey.set(v.slice(5) as ScoreKey);
      } else {
        this.view.setSort(v as SortKey);
      }
    });
  }

  protected setDensity(d: Density): void {
    if (this.view.density() === d) return;
    this.vt.run(() => this.view.density.set(d));
  }

  protected flip(): void {
    this.vt.run(() => this.view.toggleDirection());
  }
}
