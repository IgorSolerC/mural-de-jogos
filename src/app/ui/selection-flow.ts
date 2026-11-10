import { Signal, computed, inject, signal } from '@angular/core';
import { Review } from '../core/review';
import { ICON } from './icons';
import { COPY_KEY, NoteSelection } from './note-selection';
import { TrayAction } from './selection-tray';
import { Toasts } from './toast';

/**
 * O que as páginas que marcam (o mural, o Kanban, os Flashcards) fazem igual com as marcadas (PLANO-SELECAO.md):
 * a folha "Editar as marcadas" aberta com as que estavam marcadas, o Limpar da tira com o Desfazer, e o Copiar e o
 * Editar da tira. Cada página só acrescenta as ações dela. Criada no construtor da página (precisa do contexto
 * de injeção).
 */
export class SelectionFlow {
  private readonly toasts = inject(Toasts);

  /** As marcadas quando a folha abriu (null: fechada). */
  readonly editing = signal<readonly string[] | null>(null);
  /** As da folha aberta, como estão agora. */
  readonly editingNotes: Signal<Review[]>;

  /**
   * `selection`: a peça de marcar da página (a da parede, que pode ainda não existir); `notes`: as anotações
   * (ou fichas) pelo id, para a folha.
   */
  constructor(
    private readonly selection: () => NoteSelection | null | undefined,
    notes: () => ReadonlyMap<string, Review>,
  ) {
    this.editingNotes = computed(() => {
      const byId = notes();
      return (this.editing() ?? []).flatMap((id) => byId.get(id) ?? []);
    });
  }

  /** Abre a folha (a tira e o menu de uma marcada). */
  readonly open = (): void => {
    const ids = this.selection()?.ids() ?? [];
    if (ids.length) this.editing.set([...ids]);
  };

  /** Limpar: desmarca tudo (continua marcando), com o Desfazer. */
  clear(): void {
    const sel = this.selection();
    if (!sel) return;
    const before = [...sel.ids()];
    sel.clear();
    if (before.length) this.toasts.show('Seleção limpa', { label: 'Desfazer', run: () => sel.add(before) });
  }

  /** O Copiar da tira (o texto das marcadas, como o Ctrl+C), ou null sem nada marcado. */
  copyAction(): TrayAction | null {
    const sel = this.selection();
    if (!sel?.count()) return null;
    return { id: 'copiar', label: 'Copiar', icon: ICON.copiar, hint: `O texto das marcadas (${COPY_KEY})`, run: () => void sel.copy() };
  }

  /** O Editar da tira: a folha. `primary`: o botão de tinta. */
  editAction(hint: string, primary = true): TrayAction {
    return { id: 'editar', label: 'Editar', icon: ICON.editar, primary, hint, run: this.open };
  }
}
