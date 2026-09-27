import { ChangeDetectionStrategy, Component, ElementRef, inject, viewChild } from '@angular/core';
import { ArrowDownWideNarrow, ArrowUpNarrowWide, LayoutGrid, LucideAngularModule, Rows3, Search, X } from 'lucide-angular';
import { SCORE_KEYS, SCORE_SHORT, STATUSES, STATUS_LABEL, ScoreKey, Status } from '../core/review';
import { ViewTransitions } from '../core/view-transitions';
import { Density, SortKey, WallView } from '../core/wall-view';

const SORTS: { key: SortKey; label: string }[] = [
  { key: 'data', label: 'Data' },
  { key: 'nota', label: 'Nota' },
  { key: 'alfabetica', label: 'A–Z' },
  { key: 'status', label: 'Status' },
];

@Component({
  selector: 'app-wall-toolbar',
  imports: [LucideAngularModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-toolbar.html',
  styleUrl: './wall-toolbar.scss',
})
export class WallToolbar {
  protected readonly view = inject(WallView);
  private readonly vt = inject(ViewTransitions);

  protected readonly SearchIcon = Search;
  protected readonly ClearIcon = X;
  protected readonly DescIcon = ArrowDownWideNarrow;
  protected readonly AscIcon = ArrowUpNarrowWide;
  protected readonly FullIcon = Rows3;
  protected readonly CompactIcon = LayoutGrid;

  protected readonly sorts = SORTS;
  protected readonly scoreKeys = SCORE_KEYS;
  protected readonly scoreShort = SCORE_SHORT;
  protected readonly statuses = STATUSES;
  protected readonly statusLabel = STATUS_LABEL;

  private readonly searchField = viewChild.required<ElementRef<HTMLInputElement>>('search');

  focusSearch(): void {
    this.searchField().nativeElement.focus();
    this.searchField().nativeElement.select();
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

  protected setStatus(s: Status | 'todos'): void {
    this.vt.run(() => this.view.status.set(s));
  }

  protected setSort(s: SortKey): void {
    this.vt.run(() => this.view.setSort(s));
  }

  protected setScoreKey(k: ScoreKey): void {
    this.vt.run(() => this.view.scoreKey.set(k));
  }

  protected setDensity(d: Density): void {
    if (this.view.density() === d) return;
    this.vt.run(() => this.view.density.set(d));
  }

  protected flip(): void {
    this.vt.run(() => this.view.toggleDirection());
  }

  protected clearSearch(): void {
    this.view.query.set('');
    this.searchField().nativeElement.focus();
  }

  protected onSearchKey(e: KeyboardEvent): void {
    if (e.key === 'Escape' && this.view.query()) {
      e.preventDefault();
      this.view.query.set('');
    }
  }
}
