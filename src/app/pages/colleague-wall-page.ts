import { ChangeDetectionStrategy, Component, computed, inject, signal, viewChild } from '@angular/core';
import { RouterLink } from '@angular/router';
import { ArrowLeft, ArrowDownWideNarrow, ArrowUpNarrowWide, ChevronDown, Grid3x3, LayoutGrid, LucideAngularModule, Rows3 } from 'lucide-angular';
import { ColleagueStore } from '../core/colleague-store';
import { KINDS, Kind, cap, countOf, profileOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { Review, VERDICTS, VERDICT_LABEL, fold } from '../core/review';
import { SideBySide } from '../core/side-by-side';
import { ViewTransitions } from '../core/view-transitions';
import { Direction, SortKey, VerdictFilter, WallView, groupWall, sortWall } from '../core/wall-view';
import { ReviewCard } from '../ui/review-card';
import { ReviewReader } from '../ui/review-reader';
import { SearchStrip } from '../ui/search-strip';

const avgFmt = new Intl.NumberFormat('pt-BR', { minimumFractionDigits: 1, maximumFractionDigits: 1 });
const DEFAULT_DIRECTION: Record<SortKey, Direction> = { data: 'desc', nota: 'desc', alfabetica: 'asc', status: 'desc' };

/**
 * O mural do colega, só dele: as fichas do backup aberto na comparação, pregadas em seções como no
 * seu mural, sem nenhuma informação sua. Só se lê; tocar numa ficha abre a leitura com o nome dele.
 * Segue o mural aberto no cartaz (jogos, livros…), como as outras páginas.
 */
@Component({
  selector: 'app-colleague-wall-page',
  imports: [LucideAngularModule, ReviewCard, ReviewReader, RouterLink, SearchStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './colleague-wall-page.html',
  styleUrl: './colleague-wall-page.scss',
})
export class ColleagueWallPage {
  protected readonly colleagues = inject(ColleagueStore);
  protected readonly mural = inject(Mural);
  protected readonly view = inject(WallView);
  private readonly vt = inject(ViewTransitions);
  private readonly side = inject(SideBySide);
  private readonly reader = viewChild.required(ReviewReader);

  protected readonly BackIcon = ArrowLeft;
  protected readonly ChevronIcon = ChevronDown;
  protected readonly FullIcon = Rows3;
  protected readonly CompactIcon = LayoutGrid;
  protected readonly CoversIcon = Grid3x3;
  protected readonly DescIcon = ArrowDownWideNarrow;
  protected readonly AscIcon = ArrowUpNarrowWide;
  protected readonly verdictLabel = VERDICT_LABEL;

  protected readonly colleague = this.colleagues.selected;
  protected readonly name = computed(() => this.colleague()?.name ?? 'Colega');
  protected readonly profile = this.mural.profile;

  protected readonly query = signal('');
  protected readonly verdict = signal<VerdictFilter>('todos');
  protected readonly sort = signal<SortKey>('data');
  protected readonly direction = signal<Direction>('desc');
  protected readonly simple = computed(() => this.view.density() === 'simples');
  protected readonly capas = computed(() => this.view.density() === 'capas');

  protected readonly sorts: readonly { value: SortKey; label: string }[] = [
    { value: 'data', label: 'Data' },
    { value: 'nota', label: 'Nota' },
    { value: 'alfabetica', label: 'A–Z' },
    { value: 'status', label: 'Status' },
  ];
  protected readonly sortLabel = computed(() => this.sorts.find((s) => s.value === this.sort())!.label);

  /** As fichas do colega no mural aberto. */
  protected readonly reviews = computed(() => (this.colleague()?.reviews ?? []).filter((r) => r.kind === this.mural.kind()));

  protected readonly verdicts = computed(() => {
    const list = this.reviews();
    const tabs: { value: VerdictFilter; label: string; n: number }[] = [
      { value: 'todos', label: 'Todos', n: list.length },
      ...VERDICTS.map((v) => ({ value: v as VerdictFilter, label: VERDICT_LABEL[v], n: list.filter((r) => r.verdict === v).length })),
      { value: 'sem', label: 'Sem veredito', n: list.filter((r) => !r.verdict).length },
    ];
    return tabs.filter((t) => t.value === 'todos' || t.n);
  });

  protected readonly verdictShown = computed(() => this.verdicts().find((t) => t.value === this.verdict())?.label ?? 'Todos');

  protected readonly visible = computed(() => {
    const needle = fold(this.query().trim());
    const v = this.verdict();
    return this.reviews().filter(
      (r) =>
        (v === 'todos' || (r.verdict ?? 'sem') === v) &&
        (!needle ||
          fold(r.game.name).includes(needle) ||
          fold(r.text).includes(needle) ||
          r.bonuses.some((b) => fold(b.label).includes(needle))),
    );
  });

  protected readonly groups = computed(() => {
    const order = { sort: this.sort(), key: 'final' as const, direction: this.direction(), profile: this.profile() };
    return groupWall(sortWall(this.visible(), order), order);
  });

  /** "34 jogos · média 7,1 · 9 platinados". */
  protected readonly summary = computed(() => {
    const list = this.reviews();
    if (!list.length) return '';
    const avg = list.reduce((s, r) => s + r.scores.final, 0) / list.length;
    return `${countOf(this.profile(), list.length)} · média ${avgFmt.format(avg)}`;
  });

  /** Os outros murais onde o colega tem fichas. */
  protected readonly otherWalls = computed(() => {
    const c = this.colleague();
    if (!c) return [];
    return KINDS.filter((k) => k !== this.mural.kind())
      .map((kind) => ({ kind, label: cap(profileOf(kind).plural), n: c.reviews.filter((r) => r.kind === kind).length }))
      .filter((w) => w.n);
  });

  protected setSort(sort: SortKey): void {
    this.vt.run(() => {
      this.sort.set(sort);
      this.direction.set(DEFAULT_DIRECTION[sort]);
    });
  }

  protected toggleDirection(): void {
    this.vt.run(() => this.direction.update((d) => (d === 'desc' ? 'asc' : 'desc')));
  }

  protected setVerdict(v: VerdictFilter): void {
    this.vt.run(() => this.verdict.set(v));
  }

  protected clear(): void {
    this.query.set('');
    this.verdict.set('todos');
  }

  protected switchWall(kind: Kind): void {
    this.vt.run(() => {
      this.side.picking.set(false);
      this.view.clearFilters();
      this.clear();
      this.mural.kind.set(kind);
    });
  }

  protected open(review: Review): void {
    this.reader().open(review, this.name());
  }
}
