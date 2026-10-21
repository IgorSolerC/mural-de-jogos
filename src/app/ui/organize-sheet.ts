import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';
import { ICON, IconModule } from './icons';
import { lookKey, randomCategoryColor } from '../core/category-looks';
import { savedSubjects } from '../core/mural-config';
import { categoryLibrary, cleanCategory, cleanSubject, sanitizeTags, subjectLibrary, tagLibrary } from '../core/note-labels';
import { Review, fold } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { pinningFor } from '../core/wall-physics';
import { BackdropClose } from './backdrop-close';
import { GroupPicker } from './group-picker';
import { Pin } from './pin';
import { SubjectPicker } from './subject-picker';
import { TagPicker } from './tag-picker';

/**
 * Onde uma anotação compartilhada mora no seu mural: o grupo, o assunto e as tags, que são de cada um
 * (ver core/shared-notes.ts). É a folha de quem só lê a anotação (o editor fica fechado para ela); quem
 * escreve muda os três no editor. Tudo vale na hora, só no mural de quem está aqui, como na folha do
 * quadro (ui/kanban-card-sheet.ts), com os mesmos seletores do editor.
 */
@Component({
  selector: 'app-organize-sheet',
  imports: [BackdropClose, GroupPicker, IconModule, Pin, SubjectPicker, TagPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet ficha-lugar" aria-labelledby="fl-titulo" aria-describedby="fl-sub" (close)="closed.emit()" (backdropClose)="close()">
      @if (note(); as r) {
        <div class="ficha cartolina" [style.--stock]="'var(--stock-' + stock() + ')'" [attr.data-cor]="stock()">
          <app-pin class="pin" />
          <header class="head">
            <div class="titulos">
              <h2 id="fl-titulo">{{ r.game.name }}</h2>
              <p class="sub" id="fl-sub"><lucide-icon [img]="MineIcon" [size]="14" aria-hidden="true" />Só no seu mural; os outros não veem</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
            </button>
          </header>

          <div class="body">
            <div class="linha" role="group" aria-labelledby="fl-grupo">
              <span class="nome" id="fl-grupo"><lucide-icon [img]="GroupIcon" [size]="16" aria-hidden="true" />Grupo</span>
              <app-group-picker class="valor" [category]="r.category ?? null" (categoryChange)="setGroup($event)" [categories]="groupLib()" />
            </div>
            <div class="linha" role="group" aria-labelledby="fl-assunto">
              <span class="nome" id="fl-assunto"><lucide-icon [img]="SubjectIcon" [size]="16" aria-hidden="true" />Assunto</span>
              <app-subject-picker class="valor" [subject]="r.subject ?? null" (subjectChange)="setSubject($event)" [subjects]="subjectLib()" [group]="r.category ?? null" />
            </div>
            <div class="linha" role="group" aria-labelledby="fl-tags">
              <span class="nome" id="fl-tags"><lucide-icon [img]="TagsIcon" [size]="16" aria-hidden="true" />Tags</span>
              <app-tag-picker class="valor" [tags]="r.tags ?? []" (tagsChange)="setTags($event)" [library]="tagLib()" [category]="r.category ?? null" />
            </div>
          </div>

          <footer class="foot">
            <div class="actions">
              <button type="button" class="btn-ink" (click)="close()">Pronto</button>
            </div>
          </footer>
        </div>
      }
    </dialog>
  `,
  styleUrl: './organize-sheet.scss',
})
export class OrganizeSheet {
  readonly noteId = input.required<string>();
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly MineIcon = ICON.privada;
  protected readonly GroupIcon = ICON.pasta;
  protected readonly SubjectIcon = ICON.assunto;
  protected readonly TagsIcon = ICON.etiquetas;

  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly note = computed(() => this.store.get(this.noteId()) ?? null);
  protected readonly stock = computed(() => {
    const r = this.note();
    return r ? pinningFor(r.id, r.stock).stock : null;
  });

  protected readonly groupLib = computed(() => categoryLibrary(this.store.notes()));
  protected readonly tagLib = computed(() => tagLibrary(this.store.notes(), this.settings.pinnedTags(), this.note()?.category ?? null));
  protected readonly subjectLib = computed(() => {
    const category = this.note()?.category ?? null;
    return subjectLibrary(this.store.notes(), savedSubjects(this.settings.notesConfig(), category), category);
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('app-group-picker input')?.focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  /** Outro grupo: o assunto, que é do grupo, sai; um grupo novo ganha uma cor sorteada, como no editor. */
  protected setGroup(category: string | null): void {
    const r = this.note();
    if (!r) return;
    const next = category ? cleanCategory(category) : '';
    if (fold(next) === fold(r.category ?? '')) return;
    if (next && !this.settings.categoryLook(next).color && !this.store.notes().some((n) => !!n.category && lookKey(n.category) === lookKey(next))) {
      this.settings.setCategoryLook(next, { ...this.settings.categoryLook(next), color: randomCategoryColor() });
    }
    const { category: _c, subject: _s, ...rest } = r;
    this.save({ ...rest, ...(next ? { category: next } : {}) } as Review, r);
  }

  protected setSubject(subject: string | null): void {
    const r = this.note();
    if (!r) return;
    const next = subject ? cleanSubject(subject) : '';
    if (next === (r.subject ?? '')) return;
    const { subject: _, ...rest } = r;
    this.save({ ...rest, ...(next ? { subject: next } : {}) } as Review, r);
  }

  protected setTags(tags: string[]): void {
    const r = this.note();
    if (!r) return;
    const next = sanitizeTags(tags);
    const { tags: _, ...rest } = r;
    this.save({ ...rest, ...(next.length ? { tags: next } : {}) } as Review, r);
  }

  private save(next: Review, before: Review): void {
    this.store.update({ ...next, updatedAt: new Date().toISOString() }, before);
  }
}
