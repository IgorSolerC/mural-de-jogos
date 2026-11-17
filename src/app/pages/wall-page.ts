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
  protected readonly flow = new SelectionFlow(
    () => this.board()?.selection,
    this.byId,
    // com pastas marcadas, a folha muda também as de dentro delas (PLANO-MARCAR-PASTAS.md, D9)
    () => this.board()?.markedForEdit() ?? null,
  );

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

  /** As marcadas (ui/note-selection.ts, na parede): as fichas e as pastas. */
  protected readonly marks = computed(() => this.board()?.selection.ids() ?? []);
  protected readonly markedFolders = computed(() => this.board()?.selection.folders() ?? []);
  /** As marcadas que a busca, o filtro, a aba ou a pasta aberta escondem agora. */
  protected readonly hiddenMarks = computed(() => {
    const shown = new Set(this.view.visible().map((r) => r.id));
    const kids = new Set(this.view.folderKids().map((f) => f.id));
    return this.marks().filter((id) => !shown.has(id)).length + this.markedFolders().filter((id) => !kids.has(id)).length;
  });
  /** O que a tira diz sem nada marcado: nas anotações com pastas à mostra, que elas também marcam. */
  protected readonly trayHint = computed(() => {
    if (!this.notes()) return 'Toque nas fichas que vão pro lado a lado';
    return this.view.folderKids().length ? 'Toque nas anotações e nas pastas para marcar; dois toques abrem a pasta' : 'Toque nas anotações para marcar';
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
    const n = this.board()?.selection.count() ?? 0;
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
      out.push(this.flow.editAction(this.markedFolders().length ? 'Também as de dentro das pastas: grupo, pasta, tags…' : 'Grupo, pasta, tags, quem vê, cartolina…'));
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
    // de volta de outra página, a aba aberta abre no padrão dela (os filtros e o "Mostrar também" do grupo)
    this.view.enterWall();
    // sair do mural encerra a marcação
    inject(DestroyRef).onDestroy(() => this.side.picking.set(false));
  }

  private openSide(): void {
    this.side.picking.set(false);
    void this.router.navigateByUrl(reviewPath(this.mural.kind(), 'lado-a-lado'));
  }
}
