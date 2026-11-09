import { ChangeDetectionStrategy, Component, booleanAttribute, computed, inject, input } from '@angular/core';
import { withLook } from '../core/card-look';
import { FRESH_AT, Importance, KanbanBoard, KanbanCard, belongs, cardsIn, readDense } from '../core/kanban';
import { sortCards } from '../core/kanban-sort';
import { Review } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { ICON, ICON_CHOICE, IconModule } from './icons';
import { KanbanNote } from './kanban-note';

/** O lugar escolhido na aba Kanban, como está agora (ainda sem salvar). */
export interface KanbanPlace {
  /** A coluna; null: ainda não é tarefa no quadro. */
  column: string | null;
  importance: Importance | null;
  status: string;
  deps: readonly string[];
}

/**
 * A anotação no palco do editor, na aba Kanban: a coluna escolhida do quadro do grupo, com a etiqueta
 * dela (o desenho, o nome, a conta e o selo "Finaliza"), e a anotação nela como vai ficar, com a
 * importância, a observação e as dependências de agora, no lugar da coluna onde vai cair (a ordem dela,
 * ou o fim), entre as vizinhas apagadas. A coluna que veste o card padrão já a mostra vestida. Ainda não
 * sendo tarefa, a coluna onde ela entraria, apagada; sem grupo, só a ficha. Mostrar a coluna de verdade
 * explica a aba sem nenhuma frase, como a frente e o verso na aba Flashcard (ui/flashcard-preview.ts).
 */
@Component({
  selector: 'app-kanban-preview',
  imports: [IconModule, KanbanNote],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.ainda-nao]': '!on()', '[class.titulos]': 'dense()', '[class.continua]': 'more()' },
  template: `
    @if (column(); as col) {
      <section class="coluna" [class.finaliza]="col.finishes" [attr.aria-label]="'Coluna ' + col.name" inert>
        <header class="etiqueta" [attr.data-cor]="col.color">
          <lucide-icon class="etiqueta-icone" [img]="iconOf[col.icon]" [size]="20" aria-hidden="true" />
          <p class="etiqueta-nome">
            {{ col.name }}
            <span class="etiqueta-n">{{ items().length }}</span>
          </p>
          @if (col.finishes) {
            <span class="carimbo"><lucide-icon [img]="DoneIcon" [size]="12" aria-hidden="true" />Finaliza</span>
          }
        </header>
        <ol class="fichas">
          @if (at() > 0) {
            <!-- as de cima, que não cabem: a beirada de baixo delas, saindo de trás da etiqueta (no estreito, também a de logo antes) -->
            <li class="pilha" [class.so-estreito]="at() === 1" aria-hidden="true"><i></i><i></i></li>
          }
          @for (it of shown(); track it.card.note) {
            <li [class.vizinha]="!it.me" [class.antes]="it.before">
              <app-kanban-note [review]="it.note" [card]="it.card" [dense]="dense()" [still]="true" />
            </li>
          }
        </ol>
      </section>
    } @else {
      <div class="sozinha" inert>
        <app-kanban-note [review]="dressed()" [card]="card()" [dense]="dense()" [still]="true" />
      </div>
    }
  `,
  styleUrl: './kanban-preview.scss',
})
export class KanbanPreview {
  private readonly store = inject(ReviewStore);

  /** O quadro do grupo da anotação; null sem grupo. */
  readonly board = input<KanbanBoard | null>(null);
  /** A anotação como está no editor. */
  readonly note = input.required<Review>();
  readonly place = input.required<KanbanPlace>();
  /** A coluna onde ela estava ao abrir: chegando numa coluna com card padrão, ela já aparece vestida. */
  readonly from = input<string | null>(null);
  /** A coluna onde entraria, ainda não sendo tarefa (a pedida pela coluna de onde a nova veio, ou a primeira). */
  readonly firstColumn = input<string | null>(null);

  protected readonly DoneIcon = ICON.pronto;
  protected readonly iconOf = ICON_CHOICE;

  /** É (ou vai ser, ao salvar) tarefa no quadro. */
  protected readonly on = computed(() => this.place().column !== null);
  /** O quadro na vista "Só os títulos" neste aparelho: a tira, no lugar da ficha. */
  private readonly denseBoards = readDense();
  protected readonly dense = computed(() => {
    const b = this.board();
    return !!b && this.denseBoards.includes(b.id);
  });

  protected readonly column = computed(() => {
    const b = this.board();
    if (!b) return null;
    const id = this.place().column ?? this.firstColumn() ?? b.columns[0]?.id;
    return b.columns.find((c) => c.id === id) ?? null;
  });

  /** A anotação vestida pelo card padrão da coluna onde chega (a que já estava nela fica como está). */
  protected readonly dressed = computed(() => {
    const col = this.column();
    const n = this.note();
    return this.on() && col?.dresses && col.look && col.id !== this.from() ? withLook(n, col.look) : n;
  });

  protected readonly card = computed<KanbanCard>(() => {
    const p = this.place();
    return { note: this.note().id, column: this.column()?.id ?? '', importance: p.importance, status: p.status, ...(p.deps.length ? { deps: [...p.deps] } : {}), at: FRESH_AT };
  });

  /** As anotações do quadro que estão nele de verdade (as do grupo dele), como na página. */
  private readonly notes = computed(() => {
    const b = this.board();
    const out = new Map<string, Review>();
    if (b) for (const r of this.store.notes()) if (belongs(b, r)) out.set(r.id, r);
    return out;
  });

  /** A coluna inteira, com esta no lugar dela: onde já estava, senão no fim; com a ordem da coluna, onde a ordem a põe. */
  protected readonly items = computed(() => {
    const b = this.board();
    const col = this.column();
    if (!b || !col) return [];
    const me = this.card();
    const notes = this.notes();
    const here = cardsIn(b, col.id).filter((c) => c.note === me.note || notes.has(c.note));
    const at = here.findIndex((c) => c.note === me.note);
    const list = here.filter((c) => c.note !== me.note);
    list.splice(at < 0 ? list.length : at, 0, me);
    const self = this.dressed();
    return col.sort?.length ? sortCards(list, col.sort, (id) => (id === me.note ? self : notes.get(id))) : list;
  });

  /** O lugar dela na coluna (0: a primeira). */
  protected readonly at = computed(() => Math.max(0, this.items().findIndex((c) => c.note === this.card().note)));
  /** Há mais embaixo do que está à vista: a coluna continua, sumindo no pé do palco. */
  protected readonly more = computed(() => this.at() + 2 < this.items().length);

  /** O que cabe no palco: ela, a de antes e a de depois (apagadas). */
  protected readonly shown = computed(() => {
    const all = this.items();
    const me = this.card().note;
    const at = this.at();
    const notes = this.notes();
    return all
      .slice(Math.max(0, at - 1), at + 2)
      .map((card) => (card.note === me ? { card, note: this.dressed(), me: true, before: false } : { card, note: notes.get(card.note)!, me: false, before: all.indexOf(card) < at }));
  });
}
