import { ChangeDetectionStrategy, Component, computed, inject, input } from '@angular/core';
import { Router, RouterLink } from '@angular/router';
import { VisitBoards } from '../core/visit-boards';
import { FreeBoardTop } from './free-board/board-top';
import { FreeBoardView } from './free-board/free-board-view';

/** A volta do canvas aberto na visita: o mural da pessoa. */
const WALL = '/comparar/mural';

/**
 * Um canvas público de quem você visita, aberto (PLANO-CANVAS.md, rodada 5; a regra "Visita: as mesmas peças do
 * dono", no CLAUDE.md): o quadro dele em tela cheia, na mesma peça do quadro do dono, com o mesmo topo, só para ver
 * (sem `owner`, ela nem mostra o editar). O quadro vem dos quadros públicos da pessoa (`VisitBoards`). Nada aqui
 * escreve. Fechar (o voltar do topo, o Esc) volta para o mural dela.
 */
@Component({
  selector: 'app-visit-canvas',
  imports: [FreeBoardTop, FreeBoardView, RouterLink],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown.escape)': 'escape($any($event))' },
  template: `
    <div class="tela-cheia" role="dialog" aria-modal="true" [attr.aria-label]="'Canvas ' + (title() ?? '')">
      @if (board(); as b) {
        <app-free-board class="quadro" [board]="b" [autofocus]="true" />
        <app-free-board-top [name]="title() ?? b.nome" [backPath]="wall" />
      } @else if (visit.loading()) {
        <p class="aviso">Trazendo o canvas…</p>
      } @else {
        <div class="aviso">
          <p>Este canvas não é público.</p>
          <a class="btn-ink" [routerLink]="wall">Ver o mural de {{ name() }}</a>
        </div>
      }
    </div>
  `,
  // a tela cheia do quadro é a do dono (pages/board-screen.ts)
  styleUrl: '../pages/board-screen.scss',
})
export class VisitCanvasView {
  /** De quem é o mural. */
  readonly name = input.required<string>();
  /** O quadro do canvas aberto. */
  readonly boardId = input.required<string>();
  /** O nome do canvas (o título da anotação); sem ela à mostra, o do quadro. */
  readonly title = input<string | null>(null);

  protected readonly visit = inject(VisitBoards);
  private readonly router = inject(Router);
  protected readonly wall = WALL;
  /** Abriu: confere a lista dos quadros públicos (passados uns minutos; só os mudados descem). */
  private readonly refresh = void this.visit.load(this.visit.code());

  protected readonly board = computed(() => {
    const id = this.boardId();
    return this.visit.boards().find((b) => b.id === id) ?? null;
  });

  protected escape(e: KeyboardEvent): void {
    if (e.defaultPrevented || document.querySelector(':popover-open, dialog[open]')) return;
    e.preventDefault();
    void this.router.navigateByUrl(WALL);
  }
}
