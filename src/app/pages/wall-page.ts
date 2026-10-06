import { ChangeDetectionStrategy, Component, DestroyRef, computed, effect, inject, untracked } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { Desk } from '../core/desk';
import { Mural } from '../core/mural';
import { Settings } from '../core/settings';
import { SideBySide } from '../core/side-by-side';
import { WallMotion } from '../core/wall-motion';
import { FilterTag } from '../core/wall-filter';
import { WallView } from '../core/wall-view';
import { FilterTags } from '../ui/filter-sheet';
import { Pin } from '../ui/pin';
import { PickTray } from '../ui/pick-tray';
import { WallToolbar } from '../ui/wall-toolbar';
import { WallCardPool, WallCardProps, WallCards } from './wall-cards';

/** O mural: só a busca, os filtros e as fichas. Todo o resto mora nas outras abas. */
@Component({
  selector: 'app-wall-page',
  imports: [FilterTags, LucideAngularModule, PickTray, Pin, RouterLink, WallCards, WallToolbar],
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
  private readonly motion = inject(WallMotion);
  private readonly pool = inject(WallCardPool);

  protected readonly PlusIcon = Plus;
  protected readonly ghosts = [0, 1, 2];
  protected readonly highlight = computed(() => (this.view.shownSort() === 'nota' ? this.view.activeScore() : null));
  /** O que todas as fichas da parede recebem igual (ver WallCardPool). */
  private readonly cardProps = computed<WallCardProps>(() => ({
    landingId: this.desk.landingId(),
    highlight: this.highlight(),
    compact: this.view.density() === 'simples',
    capas: this.view.density() === 'capas',
    dayOnly: this.view.shownSort() === 'data',
    picking: this.side.picking(),
    picked: this.side.order(),
    masked: this.settings.noSpoilers(),
    times: this.times(),
  }));
  /** As obras com rejogada: a original fica sabendo quantas vezes está no mural. */
  private readonly times = computed(() => {
    const out = new Map<string, number>();
    for (const r of this.mural.wall()) if (r.revisitOf) out.set(r.revisitOf, (out.get(r.revisitOf) ?? 1) + 1);
    return out;
  });

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
    this.motion.run(() => this.view.clearFilters());
  }

  protected removeTag(t: FilterTag): void {
    this.motion.run(() => this.view.toggle(t.key, t.value));
  }
}
