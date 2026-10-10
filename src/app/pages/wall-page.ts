import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject } from '@angular/core';
import { RouterLink } from '@angular/router';
import { LucideAngularModule, Plus } from 'lucide-angular';
import { Desk } from '../core/desk';
import { isNotes } from '../core/kinds';
import { Mural } from '../core/mural';
import { Reactions } from '../core/reactions';
import { Settings } from '../core/settings';
import { SideBySide } from '../core/side-by-side';
import { PickTray } from '../ui/pick-tray';
import { Pin } from '../ui/pin';
import { WallToolbar } from '../ui/wall-toolbar';
import { WallAccess, WallBoard } from './wall-board';

/** O mural: só a busca, os filtros e as fichas. Todo o resto mora nas outras abas. */
@Component({
  selector: 'app-wall-page',
  imports: [LucideAngularModule, PickTray, Pin, RouterLink, WallBoard, WallToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-page.html',
  styleUrl: './wall-page.scss',
})
export class WallPage {
  protected readonly mural = inject(Mural);
  protected readonly desk = inject(Desk);
  protected readonly side = inject(SideBySide);
  private readonly settings = inject(Settings);
  private readonly reactions = inject(Reactions);

  protected readonly PlusIcon = Plus;
  /** O mural de anotações: o vazio fala de anotação, não de resenha. */
  protected readonly notes = computed(() => isNotes(this.mural.kind()));
  protected readonly ghosts = [0, 1, 2];
  /** O que o dono faz nas fichas: marcar para o lado a lado, marcar as tarefas, ver a chegada da nova. */
  protected readonly access = computed<WallAccess>(() => ({
    landingId: this.desk.landingId(),
    picking: this.side.picking(),
    picked: this.side.order(),
    masked: this.settings.noSpoilers(),
    secret: new Set(),
    reactCode: this.reactions.myCode(),
    // marcando para o lado a lado, o toque na ficha é para marcar
    checkable: !this.side.picking(),
    looks: this.settings.categoryLooks(),
  }));

  constructor() {
    // sair do mural encerra a marcação
    inject(DestroyRef).onDestroy(() => this.side.picking.set(false));
  }
}
