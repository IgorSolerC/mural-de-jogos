import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
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
import { WallToolbar } from '../ui/wall-toolbar';
import { WallCardPool, WallCardProps, WallCards } from './wall-cards';

/** O mural: só a busca, os filtros e as fichas. Todo o resto mora nas outras abas. */
@Component({
  selector: 'app-wall-page',
  imports: [LucideAngularModule, PickTray, Pin, RouterLink, WallCards, WallToolbar],
  providers: [WallCardPool],
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
  private readonly pool = inject(WallCardPool);

  protected readonly PlusIcon = Plus;
  protected readonly ghosts = [0, 1, 2];
  protected readonly highlight = computed(() => (this.view.sort() === 'nota' ? this.view.activeScore() : null));
  /** O que todas as fichas da parede recebem igual (ver WallCardPool). */
  private readonly cardProps = computed<WallCardProps>(() => ({
    landingId: this.desk.landingId(),
    highlight: this.highlight(),
    compact: this.view.density() === 'simples',
    capas: this.view.density() === 'capas',
    dayOnly: this.view.sort() === 'data',
    picking: this.side.picking(),
    picked: this.side.order(),
  }));

  constructor() {
    // sair do mural encerra a marcação
    inject(DestroyRef).onDestroy(() => this.side.picking.set(false));
    this.pool.props = this.cardProps;
    this.pool.onOpen = (id) => this.desk.openReview(id);
    this.pool.onToggle = (id) => this.side.toggle(id);
    // a ficha que saiu do mural (filtro, apagada) vai embora; as outras ficam, prontas
    effect(() => {
      const visible = this.view.visible();
      untracked(() => this.pool.keepOnly(visible));
    });
  }

  protected clearFilters(): void {
    this.vt.run(() => this.view.clearFilters(), () => this.view.snapshot());
  }
}
