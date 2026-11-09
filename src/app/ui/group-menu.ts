import { LocationStrategy } from '@angular/common';
import { Injectable, inject } from '@angular/core';
import { Router } from '@angular/router';
import { kanbanPath, studyPath, wallPath } from '../core/areas';
import { KanbanStore } from '../core/kanban-store';
import { prefsOf } from '../core/mural-config';
import { noteTabKey } from '../core/note-tabs';
import { Settings } from '../core/settings';
import { studyGroupId } from '../core/study';
import { StudyStore } from '../core/study-store';
import { WallView } from '../core/wall-view';
import { MenuItem, MenuSections } from './context-menu';
import { ICON } from './icons';
import { Toasts } from './toast';

/** Onde fica a aba do grupo: o mural de anotações, o Kanban ou os Flashcards. */
export type GroupPlace = 'mural' | 'kanban' | 'flashcards';

export interface GroupMenuOptions {
  /** O nome do grupo, como nas abas. */
  label: string;
  here: GroupPlace;
  /**
   * O endereço do grupo na página (o Kanban, os Flashcards: a aba é um link): "Abrir em outra aba", no lugar
   * do menu do navegador, também na linha do "Mais" (o mesmo grupo, o mesmo menu, caiba ou não em pé).
   */
  path?: string | null;
  /** O menu abriu numa linha do "Mais" (o grupo não está em pé): esconder vira "Deixar sempre no Mais". */
  inMore?: boolean;
  /** O que só a página tem, antes dos caminhos para os outros lugares (Nova anotação, Estudar, Novo baralho). */
  lead?: readonly MenuItem[];
  /** "Ajustes do grupo": a página abre as configurações do mural já no grupo. */
  adjust: () => void;
  /** Depois de esconder: a aba saiu da fileira, e a página leva o foco para o "Mais". */
  hidden?: () => void;
  /** Depois de mostrar em cima: a aba voltou, e a página leva o foco para ela (o "Mais" pode ter sumido). */
  shown?: () => void;
}

/**
 * O menu do botão direito de um grupo (ui/context-menu.ts), o mesmo na aba do mural, na do Kanban e na dos
 * Flashcards, e nas linhas do "Mais" delas: o que só a página tem; o mesmo grupo nos outros dois lugares
 * (os Flashcards só com baralho); os ajustes do grupo e o olho das configurações do mural (Esconder no
 * Mais, ou Mostrar em cima na escondida), que vale nos três, com o Desfazer.
 */
@Injectable({ providedIn: 'root' })
export class GroupMenu {
  private readonly router = inject(Router);
  private readonly location = inject(LocationStrategy);
  private readonly kanban = inject(KanbanStore);
  private readonly settings = inject(Settings);
  private readonly study = inject(StudyStore);
  private readonly wall = inject(WallView);
  private readonly toasts = inject(Toasts);

  sections(o: GroupMenuOptions): MenuSections {
    const { label, here } = o;
    const group = studyGroupId(label);
    const path = o.path;
    const open: MenuItem[] = path ? [{ id: 'aba', label: 'Abrir em outra aba', icon: ICON.abrirFora, run: () => void window.open(this.href(path), '_blank', 'noopener') }] : [];
    const go: MenuItem[] = [];
    // o mural só abre o grupo que tem algo à mostra nele (o de anotações só no Kanban, com os vazios
    // escondidos, ficaria fora: o mural abriria em outro grupo)
    if (here !== 'mural' && !this.wall.emptyTabs().has(noteTabKey({ category: label }))) go.push({ id: 'mural', label: 'Ver no mural', icon: ICON.anotacoes, hint: `As anotações de ${label}`, run: () => this.toWall(label) });
    if (here !== 'kanban') go.push({ id: 'kanban', label: 'Ver no Kanban', icon: ICON.colunas, hint: `O quadro de ${label}`, run: () => void this.router.navigateByUrl(kanbanPath(this.kanban.boardFor(label).id)) });
    if (here !== 'flashcards' && this.study.decksOfGroup(group).length) {
      go.push({ id: 'flashcards', label: 'Ver nos Flashcards', icon: ICON.camadas, hint: `Os baralhos de ${label}`, run: () => void this.router.navigateByUrl(studyPath(group)) });
    }
    const hidden = !!prefsOf(this.settings.notesConfig(), label).hidden;
    // como no menu do baralho: abrir sozinho, depois o que fazer, depois os ajustes
    return [
      open,
      [...(o.lead ?? []), ...go],
      [
        { id: 'ajustes', label: 'Ajustes do grupo', icon: ICON.editar, dialog: true, hint: 'O nome, o desenho, a cor e os padrões', run: o.adjust },
        hidden
          ? { id: 'mostrar', label: 'Mostrar em cima', icon: ICON.ver, hint: 'A aba volta para cima, ao lado das outras, quando couber', run: () => this.setHidden(label, false, o.shown) }
          : o.inMore
            ? { id: 'esconder', label: 'Deixar sempre no Mais', icon: ICON.esconder, hint: 'Mesmo quando couber em cima', run: () => this.setHidden(label, true, o.hidden) }
            : { id: 'esconder', label: 'Esconder no Mais', icon: ICON.esconder, hint: 'A aba sai de cima e fica no Mais', run: () => this.setHidden(label, true, o.hidden) },
      ],
    ];
  }

  /** O endereço inteiro de um caminho do site, como o do link da aba (no site, as rotas vão depois do #). */
  private href(path: string): string {
    return new URL(this.location.prepareExternalUrl(this.router.serializeUrl(this.router.parseUrl(path))), location.href).href;
  }

  /** O mural de anotações já na aba do grupo (como o quadro aberto no Kanban faz). */
  private toWall(label: string): void {
    this.wall.openGroup(label);
    void this.router.navigateByUrl(wallPath('anotacoes'));
  }

  /** O olho das configurações do mural (vale no mural, no Kanban e nos Flashcards), com o Desfazer. */
  private setHidden(label: string, hide: boolean, after?: () => void): void {
    this.settings.setCategoryPrefs(label, { hidden: hide || undefined });
    this.toasts.show(hide ? `${label} fica sempre no Mais` : `${label} volta para cima quando couber`, {
      label: 'Desfazer',
      run: () => this.settings.setCategoryPrefs(label, { hidden: hide ? undefined : true }),
    });
    after?.();
  }
}

/**
 * O menu aberto numa linha do "Mais" (ui/tab-more.ts): a lista de feltro fecha (dois remendos não ficam
 * juntos), e o foco volta para a orelha do "Mais". Fora da lista, a própria caixa.
 */
export function backFromList(box: HTMLElement): HTMLElement {
  const list = box.closest<HTMLElement>('app-tab-more [popover]');
  if (!list) return box;
  const owner = list.parentElement?.querySelector<HTMLElement>(`[aria-controls="${CSS.escape(list.id)}"]`) ?? list.parentElement?.querySelector<HTMLElement>('button');
  if (typeof list.hidePopover === 'function' && list.matches(':popover-open')) list.hidePopover();
  return owner ?? box;
}
