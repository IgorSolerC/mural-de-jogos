import { ChangeDetectionStrategy, Component, DestroyRef, computed, inject, signal, viewChild } from '@angular/core';
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
import { COPY_KEY } from '../ui/note-selection';
import { BulkEditSheet } from '../ui/bulk-edit-sheet';
import { Pin } from '../ui/pin';
import { SelectionTray, TrayAction } from '../ui/selection-tray';
import { Toasts } from '../ui/toast';
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
  private readonly toasts = inject(Toasts);
  protected readonly bulk = inject(NoteBulk);
  protected readonly board = viewChild(WallBoard);
  /** A folha "Editar as marcadas" aberta, com as que estavam marcadas quando abriu. */
  protected readonly editing = signal<readonly string[] | null>(null);
  /** As marcadas da folha aberta, como estão agora. */
  protected readonly editingNotes = computed(() => {
    const ids = this.editing();
    if (!ids) return [];
    const byId = new Map(this.mural.reviews().map((r) => [r.id, r]));
    return ids.flatMap((id) => byId.get(id) ?? []);
  });
  /** Abre a folha (a tira e o menu de uma marcada). */
  protected readonly openBulk = () => {
    const ids = this.marks();
    if (ids.length) this.editing.set([...ids]);
  };

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
      if (n) {
        out.push({
          id: 'copiar',
          label: 'Copiar',
          icon: ICON.copiar,
          hint: `O texto das marcadas (${COPY_KEY})`,
          run: () => void this.board()?.selection.copy(),
        });
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
      out.push({
        id: 'editar',
        label: 'Editar',
        icon: ICON.editar,
        primary: true,
        hint: 'Grupo, pasta, tags, quem vê, cartolina…',
        run: this.openBulk,
      });
    } else {
      if (n)
        out.push({
          id: 'editar',
          label: 'Editar',
          icon: ICON.editar,
          hint: 'Quem vê e a cartolina',
          run: this.openBulk,
        });
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

  /** Limpar: desmarca tudo (continua marcando), com o Desfazer. */
  protected clearMarks(): void {
    const sel = this.board()?.selection;
    if (!sel) return;
    const before = [...sel.ids()];
    sel.clear();
    if (before.length)
      this.toasts.show('Seleção limpa', {
        label: 'Desfazer',
        run: () => sel.add(before),
      });
  }

  private openSide(): void {
    this.side.picking.set(false);
    void this.router.navigateByUrl(reviewPath(this.mural.kind(), 'lado-a-lado'));
  }
}
