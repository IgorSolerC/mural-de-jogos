import { ChangeDetectionStrategy, Component, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { Desk } from '../core/desk';
import { ReviewStore } from '../core/review-store';
import { ViewTransitions } from '../core/view-transitions';
import { WallView } from '../core/wall-view';
import { Pin } from '../ui/pin';
import { ReviewCard } from '../ui/review-card';
import { WallToolbar } from '../ui/wall-toolbar';

/** O mural: só a busca, os filtros e as fichas. Todo o resto mora nas outras abas. */
@Component({
  selector: 'app-wall-page',
  imports: [LucideAngularModule, Pin, ReviewCard, RouterLink, WallToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-page.html',
  styleUrl: './wall-page.scss',
})
export class WallPage {
  protected readonly store = inject(ReviewStore);
  protected readonly view = inject(WallView);
  protected readonly desk = inject(Desk);
  private readonly vt = inject(ViewTransitions);

  protected readonly PlusIcon = Plus;
  protected readonly ghosts = [0, 1, 2];
  protected readonly highlight = computed(() => (this.view.sort() === 'nota' ? this.view.scoreKey() : null));

  protected clearFilters(): void {
    this.vt.run(() => this.view.clearFilters());
  }
}
