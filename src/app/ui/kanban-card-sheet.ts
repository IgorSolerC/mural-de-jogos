import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, linkedSignal, output, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { tagColorHex } from '../core/category-looks';
import { Importance, KanbanBoard, setImportance, setStatus } from '../core/kanban';
import { KanbanActions } from '../core/kanban-actions';
import { KanbanDeps } from '../core/kanban-deps';
import { KanbanStore } from '../core/kanban-store';
import { cleanSubject, sanitizeTags, subjectLibrary, tagLibrary } from '../core/note-labels';
import { savedSubjects } from '../core/mural-config';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { canManage } from '../core/shared-notes';
import { SharedStore } from '../core/shared-store';
import { pinningFor } from '../core/wall-physics';
import { BackdropClose } from './backdrop-close';
import { KanbanProps } from './kanban-props';
import { NoteTag } from './note-tag';
import { Pin } from './pin';
import { SubjectPicker } from './subject-picker';
import { TagPicker } from './tag-picker';

/**
 * A folha de uma anotação no quadro (o botão de ajustes, ou a importância da ficha): as coisas dela no
 * quadro em linhas (ver ui/kanban-props.ts: a etapa, a importância, a observação e as dependências), o
 * assunto e as tags dela (as do mural, com o seletor do editor). Tudo vale na hora (não tem "Salvar"; o status, ao
 * terminar de escrever); mudar de etapa passa por `KanbanActions` (finaliza ou abre de novo, como
 * arrastar). Ler a anotação fecha a folha e abre a leitura; Tirar do quadro deixa a anotação no mural
 * (também a que estava só no Kanban: ela volta para lá).
 */
@Component({
  selector: 'app-kanban-card-sheet',
  imports: [BackdropClose, IconModule, KanbanProps, NoteTag, Pin, SubjectPicker, TagPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet ficha-quadro" aria-labelledby="fq-titulo" (close)="props()?.flush(); closed.emit()" (backdropClose)="close()">
      @if (data(); as d) {
        <div class="ficha cartolina" [style.--stock]="'var(--stock-' + d.stock + ')'" [attr.data-cor]="d.stock">
          <app-pin class="pin" />
          <header class="head">
            <div class="titulos">
              <h2 id="fq-titulo">{{ d.note.game.name }}</h2>
              <p class="sub"><lucide-icon [img]="BoardIcon" [size]="14" aria-hidden="true" />No quadro de {{ d.label }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
            </button>
          </header>

          <div class="body">
            <app-kanban-props
              [board]="d.board"
              [noteId]="d.note.id"
              [title]="d.note.game.name"
              [column]="column()"
              (columnChange)="moveTo($event)"
              [importance]="d.card.importance"
              (importanceChange)="setImp($event)"
              [status]="d.card.status ?? ''"
              (statusChange)="saveStatus($event)"
              [deps]="d.card.deps ?? []"
              (depsChange)="setDeps($event)"
              [wall]="d.onWall"
              (wallChange)="setWall($event)"
            >
              <!-- o assunto da anotação (um nível abaixo do grupo do quadro) e as tags, as últimas linhas -->
              <div class="linha assunto-linha">
                <span class="nome" id="fq-assunto"><lucide-icon [img]="SubjectIcon" [size]="16" aria-hidden="true" />Assunto</span>
                @if (locked()) {
                  <div class="valor">
                    <span class="vazio">{{ d.note.subject ?? 'Nenhum' }}</span>
                    <p class="dica">Só o dono e os gestores mudam o assunto.</p>
                  </div>
                } @else {
                  <app-subject-picker class="valor" [subject]="d.note.subject ?? null" (subjectChange)="setSubject($event)" [subjects]="subjectLib()" [group]="d.note.category ?? null" />
                }
              </div>

              <div class="linha tags-linha">
                <span class="nome" id="fq-tags"><lucide-icon [img]="TagsIcon" [size]="16" aria-hidden="true" />Tags</span>
                @if (locked()) {
                  <div class="valor">
                    @for (t of d.note.tags ?? []; track t; let i = $index) {
                      <app-note-tag [label]="t" [index]="i" [color]="colorOf(t)" />
                    } @empty {
                      <span class="vazio">Nenhuma</span>
                    }
                    <p class="dica">Só o dono e os gestores mudam as tags.</p>
                  </div>
                } @else {
                  <app-tag-picker class="valor" [tags]="d.note.tags ?? []" (tagsChange)="setTags($event)" [library]="tagLib()" [category]="d.note.category ?? null" />
                }
              </div>
            </app-kanban-props>
          </div>

          <footer class="foot">
            <button type="button" class="papel perigo" (click)="removeFromBoard()">
              <lucide-icon [img]="OutIcon" [size]="16" aria-hidden="true" />
              Tirar do quadro
            </button>
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
  protected readonly ReadIcon = ICON.livros;
  protected readonly BoardIcon = ICON.colunas;
  protected readonly TagsIcon = ICON.etiquetas;
  protected readonly SubjectIcon = ICON.assunto;
  protected readonly OutIcon = ICON.sair;

  private readonly kanban = inject(KanbanStore);
  private readonly actions = inject(KanbanActions);
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly shared = inject(SharedStore);
  private readonly deps = inject(KanbanDeps);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  protected readonly props = viewChild(KanbanProps);

  protected readonly data = computed(() => {
    const board = this.kanban.get(this.boardId());
    const note = this.store.get(this.noteId());
    const card = board?.cards.find((c) => c.note === this.noteId());
    if (!board || !note || !card) return null;
    return {
      board,
      note,
      card,
      label: this.kanban.labelOf(board) ?? note.category ?? '',
      stock: pinningFor(note.id, note.stock).stock,
      onWall: this.kanban.isOnWall(card, note.category),
    };
  });

  /**
   * A etapa na tira: a guardada. Ir para uma que finaliza com dependência aberta pergunta antes: até a
   * resposta (e sem o sim), a tira volta a mostrar a de agora.
   */
  protected readonly column = linkedSignal(() => this.data()?.card.column ?? null);

  /** Numa compartilhada, só o dono e os gestores mudam as tags (como no editor). */
  protected readonly locked = computed(() => {
    const role = this.shared.role(this.noteId());
    return !!role && !canManage(role);
  });

  /** As tags à mão: as fixas e as das outras anotações do grupo do quadro. */
  protected readonly tagLib = computed(() => tagLibrary(this.store.notes(), this.settings.pinnedTags(), this.data()?.note.category ?? null));

  /** Os assuntos à mão: os criados nas configurações e os das outras anotações do grupo do quadro. */
  protected readonly subjectLib = computed(() => {
    const category = this.data()?.note.category ?? null;
    return subjectLibrary(this.store.notes(), savedSubjects(this.settings.notesConfig(), category), category);
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('app-kanban-props select')?.focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected moveTo(column: string | null): void {
    const d = this.data();
    if (!d || !column || d.card.column === column) return;
    this.actions.move(d.board.id, d.note.id, column);
    this.column.set(this.data()?.card.column ?? null);
  }

  protected setImp(i: Importance | null): void {
    this.kanban.update(this.boardId(), (b, at) => setImportance(b, this.noteId(), i, at));
  }

  protected saveStatus(status: string): void {
    this.kanban.update(this.boardId(), (b, at) => setStatus(b, this.noteId(), status, at));
  }

  /** Também no mural, ou só no Kanban: vale na hora, como o resto da folha. */
  protected setWall(wall: boolean): void {
    this.kanban.setOnWall(this.noteId(), wall);
  }

  protected setDeps(list: readonly string[]): void {
    this.deps.set(this.noteId(), list);
  }

  protected colorOf(tag: string): string | null {
    return tagColorHex(this.settings.categoryLooks(), tag, this.store.get(this.noteId())?.category ?? '');
  }

  /** As tags da anotação (as do mural: mudam na anotação mesmo, como no editor). */
  protected setTags(tags: string[]): void {
    const r = this.store.get(this.noteId());
    if (!r) return;
    const next = sanitizeTags(tags);
    const { tags: _, ...rest } = r;
    this.store.update({ ...rest, ...(next.length ? { tags: next } : {}), updatedAt: new Date().toISOString() }, r);
  }

  /** O assunto da anotação (muda na anotação mesmo, como as tags). */
  protected setSubject(subject: string | null): void {
    const r = this.store.get(this.noteId());
    if (!r) return;
    const next = subject ? cleanSubject(subject) : '';
    if (next === (r.subject ?? '')) return;
    const { subject: _, ...rest } = r;
    this.store.update({ ...rest, ...(next ? { subject: next } : {}), updatedAt: new Date().toISOString() }, r);
  }

  protected removeFromBoard(): void {
    const board: KanbanBoard | undefined = this.kanban.get(this.boardId());
    if (board) this.actions.remove(board, this.noteId());
    this.close();
  }

  /** Ler a anotação: a folha fecha e a leitura abre. */
  protected read(id = this.noteId()): void {
    this.close();
    this.reading.emit(id);
  }
}
