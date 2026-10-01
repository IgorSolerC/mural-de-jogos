import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import {
  ArrowDownWideNarrow,
  ArrowUpNarrowWide,
  ChevronDown,
  Grid3x3,
  LayoutGrid,
  LucideAngularModule,
  Rows3,
  SquareCheckBig,
} from 'lucide-angular';
import { Mural } from '../core/mural';
import { SCORE_LABEL, ScoreKey, VERDICTS, VERDICT_LABEL, scoreKeys } from '../core/review';
import { SideBySide } from '../core/side-by-side';
import { WallMotion } from '../core/wall-motion';
import { Density, SortKey, VerdictFilter, WallView } from '../core/wall-view';
import { SearchStrip } from './search-strip';

/** Ordenar é um controle só: data, nome, status ou uma das notas. */
const SORT_OPTIONS: { value: string; label: string }[] = [
  { value: 'data', label: 'Data' },
  { value: 'alfabetica', label: 'Nome' },
  { value: 'status', label: 'Status' },
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
  private readonly mural = inject(Mural);
  protected readonly side = inject(SideBySide);
  private readonly motion = inject(WallMotion);

  protected readonly DescIcon = ArrowDownWideNarrow;
  protected readonly AscIcon = ArrowUpNarrowWide;
  protected readonly FullIcon = Rows3;
  protected readonly CompactIcon = LayoutGrid;
  protected readonly CoversIcon = Grid3x3;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly MarkIcon = SquareCheckBig;

  protected readonly sortOptions = SORT_OPTIONS;
  /** A Média e as quatro notas do mural aberto. */
  protected readonly scoreOptions = computed(() =>
    scoreKeys(this.mural.kind()).map((k) => ({ value: `nota:${k}`, label: SCORE_LABEL[k] })),
  );
  /** Os cinco vereditos; "Sem veredito" só entra quando alguma ficha não tem um. */
  protected readonly verdictTabs = computed<VerdictFilter[]>(() =>
    this.view.verdictCounts().sem > 0 || this.view.verdict() === 'sem' ? [...VERDICTS, 'sem'] : [...VERDICTS],
  );

  protected readonly sortValue = computed(() =>
    this.view.sort() === 'nota' ? `nota:${this.view.activeScore()}` : this.view.sort(),
  );

  protected readonly sortLabel = computed(() => {
    const v = this.sortValue();
    const opt = [...SORT_OPTIONS, ...this.scoreOptions()].find((o) => o.value === v);
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
      case 'status': {
        const groups = this.mural.profile().statusGroup;
        return `${desc ? groups.platinado : groups.incompleto} primeiro`;
      }
      default:
        return desc ? 'Maiores notas primeiro' : 'Menores notas primeiro';
    }
  }

  protected setVerdict(v: VerdictFilter): void {
    this.motion.run(() => this.view.verdict.set(v));
  }

  protected setSortValue(v: string): void {
    this.motion.run(() => {
      if (v.startsWith('nota:')) {
        this.view.setSort('nota');
        this.view.scoreKey.set(v.slice(5) as ScoreKey);
      } else {
        this.view.setSort(v as SortKey);
      }
    });
  }

  protected setDensity(d: Density): void {
    // (com uma troca esperando, voltar ao tipo de agora também conta: a troca esperando é desfeita)
    if (this.view.density() === d && !this.motion.swapping) return;
    this.motion.swap(() => this.view.density.set(d));
  }

  protected flip(): void {
    this.motion.run(() => this.view.toggleDirection());
  }
}
