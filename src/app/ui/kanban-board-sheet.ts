import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';
import { LucideAngularModule, RotateCcw, X } from 'lucide-angular';
import { tagColorHex } from '../core/category-looks';
import { belongs } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { fold } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Settings } from '../core/settings';
import { BackdropClose } from './backdrop-close';
import { Confirm } from './confirm';
import { NoteTag } from './note-tag';
import { Pin } from './pin';
import { TagColors } from './tag-colors';

/**
 * Os ajustes do quadro de uma categoria (a engrenagem da pasta): a cor de cada tag das anotações da
 * categoria (vale em todo o mural, como a cor da categoria) e recomeçar o quadro. O nome do quadro é
 * o da categoria: muda junto com ela. Recomeçar não mexe em nenhuma anotação; a página dá o Desfazer.
 */
@Component({
  selector: 'app-kanban-board-sheet',
  imports: [BackdropClose, LucideAngularModule, NoteTag, Pin, TagColors],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet quadro-ajustes" aria-labelledby="qa-titulo" (close)="closed.emit()" (backdropClose)="close()">
      @if (board(); as b) {
        <div class="ficha cartolina" data-cor="azul">
          <app-pin class="pin" />
          <header class="head">
            <div class="titulos">
              <h2 id="qa-titulo">Ajustes do quadro</h2>
              <p class="sub">{{ category() }} · {{ count() === 1 ? '1 anotação' : count() + ' anotações' }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
          </header>

          <div class="body">
            <section class="grupo" aria-labelledby="qa-tags-t">
              <h3 class="grupo-titulo" id="qa-tags-t">Cor das tags</h3>
              <p class="dica">As tags das anotações de {{ category() }}. A cor de cada uma vale só nesta categoria, no mural e no quadro.</p>
              @if (tags().length) {
                <ul class="lista">
                  @for (t of tags(); track t.key) {
                    <li class="item">
                      <app-note-tag class="previa" [label]="t.label" [color]="colorOf(t.label)" />
                      <span class="usos">{{ t.n === 1 ? '1 anotação' : t.n + ' anotações' }}</span>
                      <app-tag-colors class="cores" [tag]="t.label" [category]="category()" />
                    </li>
                  }
                </ul>
              } @else {
                <p class="vazio">Nenhuma anotação de {{ category() }} tem tag ainda. Ponha as tags pela folha de uma anotação no quadro, ou no editor.</p>
              }
            </section>
          </div>

          <footer class="foot">
            <button type="button" class="papel perigo" (click)="reset()">
              <lucide-icon [img]="ResetIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
              Recomeçar o quadro
            </button>
            <div class="actions">
              <button type="button" class="btn-ink" (click)="close()">Pronto</button>
            </div>
          </footer>
        </div>
      }
    </dialog>
  `,
  styleUrl: './kanban-board-sheet.scss',
})
export class KanbanBoardSheet {
  readonly boardId = input.required<string>();
  /** O nome da categoria do quadro. */
  readonly category = input.required<string>();
  readonly closed = output<void>();
  /** Recomeçar o quadro: a página recomeça (com o Desfazer) depois da pergunta. */
  readonly resetting = output<string>();

  protected readonly CloseIcon = X;
  protected readonly ResetIcon = RotateCcw;

  private readonly kanban = inject(KanbanStore);
  private readonly store = inject(ReviewStore);
  private readonly settings = inject(Settings);
  private readonly confirm = inject(Confirm);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly board = computed(() => this.kanban.get(this.boardId()) ?? null);
  protected readonly count = computed(() => {
    const b = this.board();
    return b ? this.kanban.live(b).length : 0;
  });

  /** As tags das anotações da categoria (a grafia mais usada), das mais usadas para as menos. */
  protected readonly tags = computed(() => {
    const b = this.board();
    if (!b) return [];
    const seen = new Map<string, { n: number; spellings: Map<string, number> }>();
    for (const r of this.store.notes()) {
      if (!belongs(b, r)) continue;
      for (const t of r.tags ?? []) {
        const e = seen.get(fold(t)) ?? { n: 0, spellings: new Map<string, number>() };
        e.n++;
        e.spellings.set(t, (e.spellings.get(t) ?? 0) + 1);
        seen.set(fold(t), e);
      }
    }
    return [...seen]
      .map(([key, e]) => ({ key, n: e.n, label: [...e.spellings].reduce((a, x) => (x[1] > a[1] ? x : a))[0] }))
      .sort((a, b) => b.n - a.n || a.label.localeCompare(b.label, 'pt-BR', { sensitivity: 'base' }));
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('.fecha')?.focus();
    });
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected colorOf(tag: string): string | null {
    return tagColorHex(this.settings.categoryLooks(), tag, this.category());
  }

  protected async reset(): Promise<void> {
    const b = this.board();
    if (!b) return;
    const n = this.count();
    const yes = await this.confirm.ask({
      title: `Recomeçar o quadro de ${this.category()}?`,
      text: n
        ? `As colunas voltam a ser A fazer, Fazendo e Feito, e as anotações saem do quadro. ${n === 1 ? 'Ela continua' : `As ${n} continuam`} no mural, como ${n === 1 ? 'está' : 'estão'}.`
        : 'As colunas voltam a ser A fazer, Fazendo e Feito. Nenhuma anotação muda.',
      confirm: 'Recomeçar',
      cancel: 'Deixar',
      icon: RotateCcw,
    });
    if (!yes) return;
    this.close();
    this.resetting.emit(b.id);
  }
}
