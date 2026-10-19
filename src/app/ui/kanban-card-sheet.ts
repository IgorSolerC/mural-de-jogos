import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { ICON, ICON_CHOICE, IconModule } from './icons';
import { randomCategoryColor, tagColorHex, tagHasLook } from '../core/category-looks';
import { IMPORTANCES, IMPORTANCE_LABEL, Importance, KanbanBoard, MAX_DEPS, belongs, setImportance } from '../core/kanban';
import { KanbanActions } from '../core/kanban-actions';
import { KanbanDeps } from '../core/kanban-deps';
import { NOTES } from '../core/kinds';
import { KanbanStore } from '../core/kanban-store';
import { LABEL_MAX, MAX_TAGS, cleanTag, sanitizeTags } from '../core/note-labels';
import { fold } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { canManage } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';
import { pinningFor } from '../core/wall-physics';
import { BackdropClose } from './backdrop-close';
import { CardPicker } from './card-picker';
import { IMPORTANCE_LEVEL } from './kanban-icons';
import { NoteTag } from './note-tag';
import { Pin } from './pin';

/**
 * A folha de uma anotação no quadro (o botão de ajustes, ou a importância da ficha): em que etapa
 * ela está, a importância, as dependências (as anotações que precisam estar finalizadas antes, ver
 * `KanbanDeps`) e as tags (as da anotação mesmo). Tudo vale na hora (não tem "Salvar"); mudar de etapa
 * passa por `KanbanActions` (finaliza ou abre de novo, como arrastar). Ler a anotação fecha a folha
 * e abre a leitura; Tirar do quadro deixa a anotação no mural.
 */
@Component({
  selector: 'app-kanban-card-sheet',
  imports: [BackdropClose, CardPicker, IconModule, NoteTag, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet ficha-quadro" aria-labelledby="fq-titulo" (close)="closed.emit()" (backdropClose)="close()">
      @if (data(); as d) {
        <div class="ficha cartolina" [style.--stock]="'var(--stock-' + d.stock + ')'" [attr.data-cor]="d.stock">
          <app-pin class="pin" />
          <header class="head">
            <div class="titulos">
              <h2 id="fq-titulo">{{ d.note.game.name }}</h2>
              <p class="sub">No quadro de {{ d.label }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
            </button>
          </header>

          <div class="body">
            <section class="grupo" aria-labelledby="fq-etapa">
              <h3 class="grupo-titulo" id="fq-etapa">Etapa</h3>
              <div class="etapas" role="radiogroup" aria-labelledby="fq-etapa">
                @for (c of d.board.columns; track c.id) {
                  @let on = c.id === d.card.column;
                  <button type="button" role="radio" class="etapa" [attr.aria-checked]="on" [attr.data-cor]="c.color" (click)="moveTo(c.id)">
                    <lucide-icon [img]="iconOf[c.icon]" [size]="16" aria-hidden="true" />
                    <span class="etapa-nome">{{ c.name }}</span>
                    @if (c.finishes) {
                      <span class="sr-only">(finaliza)</span>
                    }
                  </button>
                }
              </div>
              @if (finishHint(); as h) {
                <p class="dica">{{ h }}</p>
              }
            </section>

            <section class="grupo" aria-labelledby="fq-imp">
              <h3 class="grupo-titulo" id="fq-imp">Importância</h3>
              <div class="cartela" role="radiogroup" aria-labelledby="fq-imp">
                @for (i of importances; track i) {
                  @let on = d.card.importance === i;
                  <button type="button" role="radio" class="imp" [class.colado]="on" [attr.data-imp]="i" [attr.aria-checked]="on" (click)="setImp(on ? null : i)">
                    <span class="escala" aria-hidden="true">
                      @for (n of steps; track n) {
                        <i [class.acesa]="n <= level[i]"></i>
                      }
                    </span>
                    {{ impLabel[i] }}
                  </button>
                }
                <button type="button" role="radio" class="imp nenhuma" [class.colado]="!d.card.importance" [attr.aria-checked]="!d.card.importance" (click)="setImp(null)">Nenhuma</button>
              </div>
            </section>

            <section class="grupo" aria-labelledby="fq-deps">
              <h3 class="grupo-titulo" id="fq-deps">Dependências</h3>
              <p class="dica">As anotações que precisam estar finalizadas antes desta. Finalizar com alguma aberta pergunta antes.</p>
              @if (depRows().length) {
                <ul class="deps" aria-labelledby="fq-deps">
                  @for (d of depRows(); track d.note.id) {
                    <li class="dep" [class.feita]="d.done">
                      <span class="caixa" [class.marcada]="d.done" aria-hidden="true">
                        @if (d.done) {
                          <lucide-icon [img]="CheckIcon" [size]="13" aria-hidden="true" />
                        }
                      </span>
                      <span class="dep-texto">
                        <button type="button" class="dep-nome" (click)="read(d.note.id)">
                          {{ d.note.game.name }}<span class="sr-only">{{ d.done ? ', finalizada' : ', aberta' }}</span>
                        </button>
                        <span class="dep-onde">{{ d.where }}</span>
                      </span>
                      <button type="button" class="icon-btn dep-tirar" [attr.aria-label]="'Tirar ' + d.note.game.name + ' das dependências'" title="Tirar das dependências" (click)="removeDep(d.note.id)">
                        <lucide-icon [img]="CloseIcon" [size]="16" aria-hidden="true" />
                      </button>
                    </li>
                  }
                </ul>
              }
              <button type="button" class="papel por-dep" [disabled]="depsFull()" (click)="pickingDep.set(true)">
                <lucide-icon [img]="DepsIcon" [size]="16" aria-hidden="true" />
                Pôr dependência
              </button>
              @if (depsFull()) {
                <p class="dica">Esta anotação já tem {{ maxDeps }} dependências: tire uma para pôr outra.</p>
              }
            </section>

            <section class="grupo" aria-labelledby="fq-tags">
              <h3 class="grupo-titulo" id="fq-tags">Tags</h3>
              @if (locked()) {
                <p class="dica">Nesta anotação compartilhada, só o dono e os gestores mudam as tags.</p>
                @if (d.note.tags?.length) {
                  <ul class="tags" aria-labelledby="fq-tags">
                    @for (t of d.note.tags; track t; let i = $index) {
                      <li><app-note-tag [label]="t" [index]="i" [color]="colorOf(t)" /></li>
                    }
                  </ul>
                }
              } @else {
                <p class="dica">As tags da anotação, as mesmas do mural. Toque para pôr ou tirar.</p>
                @if (tagChoices().length) {
                  <ul class="tags" aria-labelledby="fq-tags">
                    @for (t of tagChoices(); track t.key; let i = $index) {
                      <li>
                        <button type="button" class="tag-op" [attr.aria-pressed]="t.on" [attr.aria-label]="t.label" (click)="toggleTag(t.label)">
                          <app-note-tag [label]="t.label" [ghost]="!t.on" [index]="t.on ? i : null" [color]="colorOf(t.label)" />
                        </button>
                      </li>
                    }
                  </ul>
                }
                <form class="nova" (submit)="$event.preventDefault(); create()">
                  <label class="campo">
                    <span class="sr-only">Nova tag</span>
                    <input
                      #campo
                      type="text"
                      autocomplete="off"
                      [maxLength]="tagMax"
                      placeholder="Nova tag: Correção, Urgente…"
                      [value]="typed()"
                      (input)="typed.set($any($event.target).value)"
                    />
                  </label>
                  <button type="submit" class="papel" [disabled]="!typed().trim() || full()">
                    <lucide-icon [img]="PlusIcon" [size]="16" aria-hidden="true" />
                    Pôr
                  </button>
                </form>
                @if (full()) {
                  <p class="dica">Esta anotação já tem {{ maxTags }} tags: tire uma para pôr outra.</p>
                }
              }
            </section>
          </div>

          <footer class="foot">
            <button type="button" class="papel perigo" (click)="removeFromBoard()">Tirar do quadro</button>
            <div class="actions">
              <button type="button" class="btn-ink" (click)="read()">
                <lucide-icon [img]="ReadIcon" [size]="18" aria-hidden="true" />
                Ler a anotação
              </button>
            </div>
          </footer>
        </div>
      }
    </dialog>

    @if (data(); as d) {
      <app-card-picker
        [(open)]="pickingDep"
        [onlyKind]="notesKind"
        [doneOption]="true"
        [exclude]="depExcluded()"
        heading="Pôr dependência"
        [hint]="'Uma anotação que precisa estar finalizada antes de “' + d.note.game.name + '”. Pode ser de outro grupo.'"
        footHint="Toque numa anotação para pôr como dependência."
        emptyText="Não há outra anotação que possa ser dependência desta."
        (picked)="addDep($event.id)"
      />
    }
  `,
  styleUrl: './kanban-card-sheet.scss',
})
export class KanbanCardSheet {
  readonly boardId = input.required<string>();
  readonly noteId = input.required<string>();
  readonly closed = output<void>();
  /** Ler a anotação: a página abre a leitura (a folha já fechou). */
  readonly reading = output<string>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly PlusIcon = ICON.adicionar;
  protected readonly ReadIcon = ICON.livros;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly importances = IMPORTANCES;
  protected readonly impLabel = IMPORTANCE_LABEL;
  protected readonly level = IMPORTANCE_LEVEL;
  protected readonly steps = [1, 2, 3, 4, 5];
  protected readonly tagMax = LABEL_MAX;
  protected readonly maxTags = MAX_TAGS;
  protected readonly typed = signal('');
  protected readonly DepsIcon = ICON.dependencias;
  protected readonly CheckIcon = ICON.pronto;
  protected readonly maxDeps = MAX_DEPS;
  protected readonly notesKind = NOTES;
  /** O seletor da dependência nova aberto. */
  protected readonly pickingDep = signal(false);

  private readonly kanban = inject(KanbanStore);
  private readonly actions = inject(KanbanActions);
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly shared = inject(SharedStore);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly deps = inject(KanbanDeps);

  /** As dependências guardadas (as que ainda existem): finalizada ou não e onde estão. */
  protected readonly depRows = computed(() => {
    const d = this.data();
    if (!d) return [];
    return this.deps
      .progress(d.card.deps)
      .all.map((note) => ({ note, done: !!note.doneAt, where: this.deps.whereOf(note, d.note.id) }));
  });
  protected readonly depsFull = computed(() => (this.data()?.card.deps?.length ?? 0) >= MAX_DEPS);
  /** Fora do seletor: ela mesma, as que já são, e as que dependem dela (fariam uma roda). */
  protected readonly depExcluded = computed(() => this.deps.excluded(this.noteId()));

  /** Numa compartilhada, só o dono e os gestores mudam as tags (como no editor). */
  protected readonly locked = computed(() => {
    const role = this.shared.role(this.noteId());
    return !!role && !canManage(role);
  });

  /** As tags que dá para pôr: as das anotações da categoria (as mais usadas primeiro) e as fixas. */
  private readonly library = computed(() => {
    const d = this.data();
    if (!d) return [];
    const count = new Map<string, { label: string; n: number }>();
    for (const r of this.store.notes()) {
      if (!belongs(d.board, r)) continue;
      for (const t of r.tags ?? []) {
        const e = count.get(fold(t));
        if (e) e.n++;
        else count.set(fold(t), { label: t, n: 1 });
      }
    }
    const used = [...count.values()].sort((a, b) => b.n - a.n).map((e) => e.label);
    const pinned = this.settings.pinnedTags().filter((t) => !count.has(fold(t)));
    return [...used, ...pinned];
  });

  /** As da anotação primeiro (coladas, na ordem dela), depois as outras, em contorno. */
  protected readonly tagChoices = computed(() => {
    const own = this.data()?.note.tags ?? [];
    const on = new Set(own.map(fold));
    return [
      ...own.map((label) => ({ key: fold(label), label, on: true })),
      ...this.library()
        .filter((t) => !on.has(fold(t)))
        .slice(0, 16)
        .map((label) => ({ key: fold(label), label, on: false })),
    ];
  });
  protected readonly full = computed(() => (this.data()?.note.tags?.length ?? 0) >= MAX_TAGS);

  protected readonly data = computed(() => {
    const board = this.kanban.get(this.boardId());
    const note = this.store.get(this.noteId());
    const card = board?.cards.find((c) => c.note === this.noteId());
    if (!board || !note || !card) return null;
    return { board, note, card, label: this.kanban.labelOf(board) ?? note.category ?? '', stock: pinningFor(note.id, note.stock).stock };
  });

  /** O que a etapa de agora faz com a anotação, quando ela finaliza. */
  protected readonly finishHint = computed(() => {
    const d = this.data();
    const col = d?.board.columns.find((c) => c.id === d.card.column);
    if (!d || !col) return null;
    if (col.finishes) return `${col.name} finaliza a anotação. Levar para outra etapa abre ela de novo.`;
    const done = d.board.columns.filter((c) => c.finishes).map((c) => c.name);
    return done.length ? `Levar para ${done.join(' ou ')} finaliza a anotação.` : null;
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('.etapa[aria-checked="true"]')?.focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected moveTo(column: string): void {
    const d = this.data();
    if (!d || d.card.column === column) return;
    this.actions.move(d.board.id, d.note.id, column);
  }

  protected setImp(i: Importance | null): void {
    this.kanban.update(this.boardId(), (b, at) => setImportance(b, this.noteId(), i, at));
  }

  /** A categoria da anotação: a cor de cada tag é a dela ali. */
  private category(): string {
    return this.store.get(this.noteId())?.category ?? '';
  }

  protected colorOf(tag: string): string | null {
    return tagColorHex(this.settings.categoryLooks(), tag, this.category());
  }

  /** Põe ou tira a tag da anotação (a do mural: muda na anotação mesmo, como no editor). */
  protected toggleTag(tag: string): void {
    const r = this.store.get(this.noteId());
    if (!r) return;
    const has = (r.tags ?? []).some((t) => fold(t) === fold(tag));
    const next = has ? (r.tags ?? []).filter((t) => fold(t) !== fold(tag)) : sanitizeTags([...(r.tags ?? []), tag]);
    if (!has && next.length === (r.tags ?? []).length) return;
    const { tags: _, ...rest } = r;
    this.store.update({ ...rest, ...(next.length ? { tags: next } : {}), updatedAt: new Date().toISOString() }, r);
  }

  /**
   * Uma tag escrita: a que já existe com esse nome (na grafia dela), ou uma nova, que ganha uma cor
   * sorteada como a categoria nova. Já colada na anotação.
   */
  protected create(): void {
    const tag = cleanTag(this.typed());
    this.typed.set('');
    if (!tag) return;
    const known = this.library().find((t) => fold(t) === fold(tag));
    if (!known && !tagHasLook(this.settings.categoryLooks(), tag, this.category())) this.settings.setTagColor(tag, randomCategoryColor(), this.category());
    const r = this.store.get(this.noteId());
    if (r && !(r.tags ?? []).some((t) => fold(t) === fold(tag))) this.toggleTag(known ?? tag);
  }

  protected addDep(id: string): void {
    this.deps.add(this.noteId(), id);
  }

  protected removeDep(id: string): void {
    this.deps.remove(this.noteId(), id);
  }

  protected removeFromBoard(): void {
    const board: KanbanBoard | undefined = this.kanban.get(this.boardId());
    if (board) this.actions.remove(board, this.noteId());
    this.close();
  }

  /** Ler a anotação (ou uma dependência dela): a folha fecha e a leitura abre. */
  protected read(id = this.noteId()): void {
    this.close();
    this.reading.emit(id);
  }
}
