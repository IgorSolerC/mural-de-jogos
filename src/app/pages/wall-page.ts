import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, viewChild } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { ICON, IconModule } from '../ui/icons';
import { reviewPath } from '../core/areas';
import { Desk } from '../core/desk';
import { isNotes } from '../core/kinds';
import { Mural } from '../core/mural';
import { NoteBulk } from '../core/note-bulk';
import { NoteFolders } from '../core/note-folders';
import { Reactions } from '../core/reactions';
import { Settings } from '../core/settings';
import { SideBySide } from '../core/side-by-side';
import { WallView } from '../core/wall-view';
import { SelectionFlow } from '../ui/selection-flow';
import { BulkEditSheet } from '../ui/bulk-edit-sheet';
import { Pin } from '../ui/pin';
import { SelectionTray, TrayAction } from '../ui/selection-tray';
import { WallToolbar } from '../ui/wall-toolbar';
import { WallAccess, WallBoard } from './wall-board';

/** O mural: só a busca, os filtros e as fichas. Todo o resto mora nas outras abas. */
@Component({
  selector: 'app-wall-page',
  imports: [BulkEditSheet, IconModule, Pin, RouterLink, SelectionTray, WallBoard, WallToolbar],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './wall-page.html',
  styleUrl: './wall-page.scss',
})
export class WallPage {
  protected readonly mural = inject(Mural);
  protected readonly desk = inject(Desk);
  protected readonly side = inject(SideBySide);
  /** As pastas das anotações: arrastar, dar nome e os menus delas, só aqui no seu mural (a visita não tem). */
  protected readonly folders = inject(NoteFolders);
  private readonly settings = inject(Settings);
  private readonly reactions = inject(Reactions);
  private readonly view = inject(WallView);
  private readonly router = inject(Router);
  protected readonly bulk = inject(NoteBulk);
  protected readonly board = viewChild(WallBoard);
  private readonly byId = computed(() => new Map(this.mural.reviews().map((r) => [r.id, r])));
  /** A folha "Editar as marcadas", o Limpar e o Copiar e Editar da tira (ui/selection-flow.ts, igual nas três páginas). */
  protected readonly flow = new SelectionFlow(() => this.board()?.selection, this.byId);

  protected readonly PlusIcon = ICON.adicionar;
  /** O mural de anotações: o vazio fala de anotação, não de resenha. */
  protected readonly notes = computed(() => isNotes(this.mural.kind()));
  protected readonly ghosts = [0, 1, 2];
  /** O que o dono faz nas fichas: marcar (para o lado a lado, para editar juntas), as tarefas, a chegada da nova. */
  protected readonly access = computed<WallAccess>(() => ({
    landingId: this.desk.landingId(),
    picking: this.side.picking(),
    picked: this.side.order(),
    masked: this.settings.noSpoilers(),
    secret: new Set(),
    reactCode: this.reactions.myCode(),
    // marcando, o toque na ficha é para marcar
    checkable: !this.side.picking(),
    looks: this.settings.categoryLooks(),
  }));

  /** As marcadas (ui/note-selection.ts, na parede). */
  protected readonly marks = computed(() => this.board()?.selection.ids() ?? []);
  /** As marcadas que a busca, o filtro ou a aba escondem agora. */
  protected readonly hiddenMarks = computed(() => {
    const shown = new Set(this.view.visible().map((r) => r.id));
    return this.marks().filter((id) => !shown.has(id)).length;
  });
  /** As da parede que ainda não estão marcadas (o "Marcar as visíveis", com a busca ou o filtro ligado). */
  private readonly unmarked = computed(() => {
    const marked = new Set(this.marks());
    return this.view.visible().filter((r) => !marked.has(r.id) && !(r.revisitOf && !this.notes()));
  });

  /** O que a tira faz com as marcadas (PLANO-SELECAO.md, 1). */
  protected readonly trayActions = computed<TrayAction[]>(() => {
    const out: TrayAction[] = [];
    const rest = this.unmarked();
    if (rest.length && this.view.isFiltered()) {
      out.push({
        id: 'visiveis',
        label: rest.length === 1 ? 'Marcar a visível' : `Marcar as ${rest.length} visíveis`,
        run: () => this.board()?.selection.add(rest.map((r) => r.id)),
      });
    }
    const n = this.marks().length;
    if (this.notes()) {
      const copy = this.flow.copyAction();
      if (copy) out.push(copy);
      if (n) {
        const one = this.board()?.markedGroup() !== undefined;
        out.push({
          id: 'pasta',
          label: 'Mover para pasta',
          icon: ICON.guardarNaPasta,
          disabled: !one,
          hint: one ? undefined : 'Estão em grupos diferentes: a pasta é de um grupo',
          run: () => this.board()?.moveMarked(),
        });
      }
      out.push(this.flow.editAction('Grupo, pasta, tags, quem vê, cartolina…'));
    } else {
      if (n) out.push(this.flow.editAction('Quem vê e a cartolina', false));
      out.push({
        id: 'lado-a-lado',
        label: 'Ver lado a lado',
        icon: ICON.ir,
        primary: true,
        run: () => this.openSide(),
      });
    }
    return out;
  });

  constructor() {
    // sair do mural encerra a marcação
    inject(DestroyRef).onDestroy(() => this.side.picking.set(false));
  }

  private openSide(): void {
    this.side.picking.set(false);
    void this.router.navigateByUrl(reviewPath(this.mural.kind(), 'lado-a-lado'));
  }
}
