import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { Desk } from '../core/desk';
import { Mural } from '../core/mural';
import { Settings } from '../core/settings';
import { SideBySide } from '../core/side-by-side';
import { ViewTransitions } from '../core/view-transitions';
import { WallView } from '../core/wall-view';
import { Pin } from '../ui/pin';
import { PickTray } from '../ui/pick-tray';
import { ReviewCard } from '../ui/review-card';
import { WallToolbar } from '../ui/wall-toolbar';

/** O mural: só a busca, os filtros e as fichas. Todo o resto mora nas outras abas. */
@Component({
  selector: 'app-wall-page',
  imports: [LucideAngularModule, PickTray, Pin, ReviewCard, RouterLink, WallToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-page.html',
  styleUrl: './wall-page.scss',
})
export class WallPage {
  protected readonly mural = inject(Mural);
  protected readonly view = inject(WallView);
  protected readonly desk = inject(Desk);
  protected readonly settings = inject(Settings);
  protected readonly side = inject(SideBySide);
  private readonly vt = inject(ViewTransitions);

  constructor() {
    // sair do mural encerra a marcação
    inject(DestroyRef).onDestroy(() => this.side.picking.set(false));
  }

  protected readonly PlusIcon = Plus;
  protected readonly ghosts = [0, 1, 2];
  protected readonly highlight = computed(() => (this.view.sort() === 'nota' ? this.view.activeScore() : null));

  protected clearFilters(): void {
    this.vt.run(() => this.view.clearFilters());
  }
}
