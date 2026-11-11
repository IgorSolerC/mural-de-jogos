import { ChangeDetectionStrategy, Component, computed, inject, input, output } from '@angular/core';
import { RouterLink } from '@angular/router';
import { visitKanbanPath } from '../core/areas';
import { categoryColorHex } from '../core/category-looks';
import { KanbanCard, KanbanColumn, cardsIn, freshBoard } from '../core/kanban';
import { Review } from '../core/review';
import { groupKey, studyGroupId } from '../core/study';
import { VisitGroups } from '../core/visit-groups';
import { KanbanColumnHead } from './kanban-column-head';
import { KanbanNote } from './kanban-note';
import { StudyGroupTabs, StudyTab } from './study-group-tabs';

/**
 * O Kanban dos grupos públicos de quem você visita (PLANO-COMPARTILHAR.md, 4.6; a regra "Visita: as mesmas
 * peças do dono", no CLAUDE.md): as mesmas abas de grupo, a mesma etiqueta de coluna (ui/kanban-column-head.ts)
 * e o mesmo cartão (ui/kanban-note.ts, sem as etiquetas de ação) do quadro do dono, só para ver. Arrastar, a
 * seta, adicionar e os ajustes da coluna são do dono e nem existem aqui. Nada aqui escreve.
 */
@Component({
  selector: 'app-visit-kanban',
  imports: [KanbanColumnHead, KanbanNote, RouterLink, StudyGroupTabs],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <app-study-group-tabs [label]="'Grupos públicos de ' + name()" [tabs]="tabs()" [active]="group()?.id ?? null" [path]="groupPath" />
    @if (group(); as g) {
      <div class="quadro-moldura">
        <div class="quadro" [attr.aria-label]="'Kanban de ' + g.nome + ', só para ler'">
          @for (v of view(); track v.col.id) {
            <section class="coluna" [class.finaliza]="v.col.finishes" [attr.aria-labelledby]="'col-' + v.col.id">
              <app-kanban-column-head [col]="v.col" [total]="v.items.length" />
              <div class="caixa">
                <div class="rolo">
                  <ol class="fichas" [attr.aria-label]="'Anotações em ' + v.col.name">
                    @for (it of v.items; track it.card.note) {
                      <li class="lugar" [attr.data-nota]="it.card.note">
                        <app-kanban-note [review]="it.note" [card]="it.card" [still]="true" (opened)="opened.emit({ note: it.note, pool: g.notes })" />
                      </li>
                    } @empty {
                      <li class="vazia" aria-hidden="true">Nenhuma anotação ainda</li>
                    }
                  </ol>
                </div>
              </div>
            </section>
          }
        </div>
      </div>
    } @else {
      <section class="vazio cartolina" aria-labelledby="kb-vazio-titulo">
        <span class="fita-vazio" aria-hidden="true"></span>
        <h2 id="kb-vazio-titulo">{{ name() }} não tem grupos públicos</h2>
        <p>Os Kanbans de {{ name() }} ficam só com quem está neles. As anotações públicas estão no mural.</p>
        <a class="btn-ink" routerLink="/comparar/mural">Ver o mural</a>
      </section>
    }
  `,
  styleUrl: '../pages/kanban-page.scss',
})
export class VisitKanban {
  readonly name = input.required<string>();
  /** O grupo aberto (o id do endereço, `studyGroupId`); sem ele, o primeiro. */
  readonly groupId = input<string | null>(null);
  /** Abriu uma anotação: a leitura da visita (com as outras do grupo, para andar entre elas). */
  readonly opened = output<{ note: Review; pool: Review[] }>();

  protected readonly groups = inject(VisitGroups);
  protected readonly groupPath = (g?: string | null): string => visitKanbanPath(g);

  protected readonly tabs = computed<StudyTab[]>(() =>
    this.groups.groups().map((g) => ({
      id: studyGroupId(g.nome),
      key: groupKey(g.nome),
      label: g.nome,
      look: g.look,
      color: categoryColorHex(g.look.color),
      today: g.notes.length,
      say: `${g.notes.length} ${g.notes.length === 1 ? 'anotação' : 'anotações'}`,
      quiet: false,
      n: g.notes.length,
      total: g.notes.length,
    })),
  );
  protected readonly group = computed(() => {
    const list = this.groups.groups();
    const id = this.groupId();
    return (id ? list.find((g) => studyGroupId(g.nome) === id) : undefined) ?? list[0] ?? null;
  });
  /** As colunas do quadro e, em cada uma, as anotações dele que estão à mostra (na ordem do quadro). */
  protected readonly view = computed<{ col: KanbanColumn; items: { card: KanbanCard; note: Review }[] }[]>(() => {
    const g = this.group();
    if (!g) return [];
    const board = g.board ?? freshBoard(g.nome);
    const byId = new Map(g.notes.map((n) => [n.id, n]));
    return board.columns.map((col) => ({
      col,
      items: cardsIn(board, col.id)
        .filter((c) => byId.has(c.note))
        .map((card) => ({ card, note: byId.get(card.note)! })),
    }));
  });
}
