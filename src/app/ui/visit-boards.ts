import { ChangeDetectionStrategy, Component, ElementRef, Injector, afterNextRender, computed, effect, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { visitBoardPath } from '../core/areas';
import { FreeBoard, boardInGroup } from '../core/free-board';
import { groupKey, studyGroupId } from '../core/study';
import { VisitBoards } from '../core/visit-boards';
import { FreeBoardCard } from './free-board/board-card';
import { FreeBoardTop } from './free-board/board-top';
import { FreeBoardView } from './free-board/free-board-view';
import { StudyGroupTabs, StudyTab } from './study-group-tabs';

/**
 * O Quadro livre de quem você visita (PLANO-QUADRO-LIVRE.md, 4.8; a regra "Visita: as mesmas peças do dono", no
 * CLAUDE.md): os quadros públicos da pessoa nas mesmas abas de grupo, nas mesmas folhas kraft e, aberto, na mesma
 * peça do quadro do dono, só para ver (sem `owner`, ela nem mostra o editar). Nada aqui escreve.
 */
@Component({
  selector: 'app-visit-boards',
  imports: [FreeBoardCard, FreeBoardTop, FreeBoardView, RouterLink, StudyGroupTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'escape($any($event))' },
  template: `
    <app-study-group-tabs [label]="'Grupos do Quadro livre de ' + name()" [tabs]="tabs()" [active]="group()?.id ?? null" [path]="groupPath" />
    <div class="pasta">
      <p class="resumo">
        @if (visit.loading()) {
          Trazendo os quadros…
        } @else if (visit.failed()) {
          Os quadros de {{ name() }} não vieram agora (sem internet?).
          <button type="button" class="btn-quiet" (click)="retry()">Tentar de novo</button>
        } @else {
          <strong>{{ shown().length }} {{ shown().length === 1 ? "quadro público" : "quadros públicos" }}</strong>
          {{ group() ? "em " + group()!.label : "de " + name() }}
        }
      </p>
    </div>
    <ul class="folhas" role="list" [attr.aria-label]="'Quadros de ' + name()">
      @for (b of shown(); track b.id) {
        <li><app-free-board-card [board]="b" [path]="boardPath(b)" /></li>
      }
    </ul>
    @if (boardId()) {
      <div class="tela-cheia" role="dialog" aria-modal="true" [attr.aria-label]="open() ? 'Quadro ' + open()!.nome : 'Quadro'">
        @if (open(); as b) {
          <app-free-board class="quadro" [board]="b" [autofocus]="true" />
          <app-free-board-top [name]="b.nome" [backPath]="groupPath(group()?.id)" />
        } @else if (visit.loading()) {
          <p class="aviso">Trazendo o quadro…</p>
        } @else {
          <div class="aviso">
            <p>Este quadro não é público.</p>
            <a class="btn-ink" [routerLink]="groupPath()">Ver os quadros de {{ name() }}</a>
          </div>
        }
      </div>
    }
  `,
  styleUrl: '../pages/free-boards-page.scss',
})
export class VisitBoardsView {
  readonly name = input.required<string>();
  readonly groupId = input<string | null>(null);
  readonly boardId = input<string | null>(null);

  protected readonly visit = inject(VisitBoards);
  private readonly router = inject(Router);
  private readonly host = inject<ElementRef<HTMLElement>>(ElementRef).nativeElement;
  private readonly injector = inject(Injector);
  /** Fechou o quadro: o foco volta para a folha dele na lista (como no seu Quadro livre). */
  private openedBoard: string | null = null;
  private readonly focusBack = effect(() => {
    const id = this.boardId();
    const closed = this.openedBoard;
    this.openedBoard = id;
    if (id || !closed) return;
    afterNextRender(() => this.host.querySelector<HTMLElement>(`[data-quadro="${closed}"]`)?.focus(), { injector: this.injector });
  });
  /** A seção apareceu: confere a lista de novo (passados uns minutos; só os quadros mudados descem). */
  private readonly refresh = void this.visit.load(this.visit.code());
  protected readonly groupPath = (g?: string | null): string => visitBoardPath(g);

  private readonly groups = computed(() => {
    const labels = new Map<string, string>();
    for (const b of this.visit.boards()) if (!labels.has(groupKey(b.grupo))) labels.set(groupKey(b.grupo), b.grupo);
    return [...labels].map(([key, label]) => ({ id: studyGroupId(label), key, label, boards: this.visit.boards().filter((b) => boardInGroup(b, label)) }));
  });
  protected readonly tabs = computed<StudyTab[]>(() =>
    this.groups().map((g) => ({
      id: g.id,
      key: g.key,
      label: g.label,
      look: {},
      color: null,
      today: g.boards.length,
      say: `${g.boards.length} ${g.boards.length === 1 ? 'quadro' : 'quadros'}`,
      quiet: false,
      n: g.boards.length,
      total: g.boards.length,
    })),
  );
  protected readonly group = computed(() => {
    const id = this.groupId();
    return id ? (this.groups().find((g) => g.id === id) ?? null) : null;
  });
  protected readonly shown = computed(() => this.group()?.boards ?? this.visit.boards());
  protected readonly open = computed(() => {
    const id = this.boardId();
    return id ? (this.visit.boards().find((b) => b.id === id) ?? null) : null;
  });

  protected retry(): void {
    void this.visit.load(this.visit.code(), true);
  }

  protected boardPath(b: FreeBoard): string {
    return visitBoardPath(studyGroupId(b.grupo), b.id);
  }

  protected escape(e: KeyboardEvent): void {
    if (!this.boardId() || e.defaultPrevented || document.querySelector(':popover-open, dialog[open]')) return;
    e.preventDefault();
    void this.router.navigateByUrl(visitBoardPath(this.groupId()));
  }
}
