import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';
import { ArrowLeft, ArrowRight, Check, LucideAngularModule, Trash2, X } from 'lucide-angular';
import { COLUMN_ICONS, ColumnIcon, NAME_MAX, cardsIn, moveColumn, removeColumn, updateColumn } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { LIGHT_STOCKS, LightStock } from '../core/review';
import { BackdropClose } from './backdrop-close';
import { Confirm } from './confirm';
import { COLUMN_ICON, COLUMN_ICON_LABEL } from './kanban-icons';
import { Pin } from './pin';
import { Toasts } from './toast';

/** O nome de cada cartolina, para o leitor de tela e a dica. */
const STOCK_LABEL: Record<LightStock, string> = {
  vermelho: 'Vermelho',
  laranja: 'Laranja',
  amarelo: 'Amarelo',
  verde: 'Verde',
  azul: 'Azul',
  lilas: 'Lilás',
  rosa: 'Rosa',
  cinza: 'Cinza',
  branco: 'Branco',
};

/**
 * Os ajustes de uma coluna do quadro (o lápis no alto dela): o nome, o ícone e a cor da etiqueta,
 * "Finalizar tarefas movidas para cá", a posição e tirar a coluna. Vale na hora; a etiqueta de prévia
 * em cima é a mesma da coluna.
 */
@Component({
  selector: 'app-kanban-column-sheet',
  imports: [BackdropClose, LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet coluna-ajustes" aria-labelledby="ca-titulo" (close)="closed.emit()" (backdropClose)="close()">
      @if (data(); as d) {
        <div class="ficha cartolina" [style.--stock]="'var(--stock-' + d.col.color + ')'" [attr.data-cor]="d.col.color">
          <app-pin class="pin" color="#f4f4f0" />
          <header class="head">
            <div class="titulos">
              <h2 id="ca-titulo">
                <lucide-icon class="titulo-icone" [img]="iconOf[d.col.icon]" [size]="26" [strokeWidth]="2.6" aria-hidden="true" />
                {{ d.col.name }}
              </h2>
              <p class="sub">Coluna {{ d.index + 1 }} de {{ d.board.columns.length }} · {{ d.count === 1 ? '1 anotação' : d.count + ' anotações' }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
          </header>

          <div class="body">
            <section class="grupo" aria-labelledby="ca-nome-t">
              <h3 class="grupo-titulo" id="ca-nome-t">Nome</h3>
              <label class="campo">
                <span class="sr-only">Nome da coluna</span>
                <input #nome type="text" autocomplete="off" [maxLength]="nameMax" [value]="d.col.name" (change)="rename($any($event.target).value)" (keydown.enter)="$any($event.target).blur()" />
              </label>
            </section>

            <section class="grupo" aria-labelledby="ca-fin-t">
              <h3 class="grupo-titulo" id="ca-fin-t">Ao chegar</h3>
              <div class="linha">
                <div class="linha-texto">
                  <p class="linha-nome" id="ca-fin">Finalizar tarefas movidas para cá</p>
                  <p class="linha-desc">A anotação que chega aqui ganha o carimbo de finalizada; saindo para uma coluna que não finaliza, abre de novo.</p>
                </div>
                <button type="button" class="interruptor" role="switch" [attr.aria-checked]="d.col.finishes" aria-labelledby="ca-fin" (click)="set({ finishes: !d.col.finishes })">
                  <span class="bolinha"></span>
                </button>
              </div>
            </section>

            <section class="grupo" aria-labelledby="ca-icone-t">
              <h3 class="grupo-titulo" id="ca-icone-t">Ícone</h3>
              <div class="ops" role="radiogroup" aria-labelledby="ca-icone-t">
                @for (i of icons; track i) {
                  <button type="button" role="radio" class="op icone" [attr.aria-checked]="d.col.icon === i" [attr.aria-label]="iconLabel[i]" [title]="iconLabel[i]" (click)="set({ icon: i })">
                    <lucide-icon [img]="iconOf[i]" [size]="19" [strokeWidth]="2.4" aria-hidden="true" />
                  </button>
                }
              </div>
            </section>

            <section class="grupo" aria-labelledby="ca-cor-t">
              <h3 class="grupo-titulo" id="ca-cor-t">Cor da etiqueta</h3>
              <div class="ops" role="radiogroup" aria-labelledby="ca-cor-t">
                @for (s of stocks; track s) {
                  <button type="button" role="radio" class="op cor" [style.--stock]="'var(--stock-' + s + ')'" [attr.aria-checked]="d.col.color === s" [attr.aria-label]="stockLabel[s]" [title]="stockLabel[s]" (click)="set({ color: s })">
                    @if (d.col.color === s) {
                      <lucide-icon [img]="CheckIcon" [size]="18" [strokeWidth]="3" aria-hidden="true" />
                    }
                  </button>
                }
              </div>
            </section>

            <section class="grupo" aria-labelledby="ca-lugar-t">
              <h3 class="grupo-titulo" id="ca-lugar-t">Lugar no quadro</h3>
              <div class="lugar">
                <button type="button" class="papel" [disabled]="d.index === 0" (click)="shift(-1)">
                  <lucide-icon [img]="LeftIcon" [size]="16" [strokeWidth]="2.8" aria-hidden="true" />
                  Para a esquerda
                </button>
                <button type="button" class="papel" [disabled]="d.index === d.board.columns.length - 1" (click)="shift(1)">
                  Para a direita
                  <lucide-icon [img]="RightIcon" [size]="16" [strokeWidth]="2.8" aria-hidden="true" />
                </button>
              </div>
            </section>
          </div>

          <footer class="foot">
            <button type="button" class="papel perigo" [disabled]="d.board.columns.length <= 1" (click)="remove()">
              <lucide-icon [img]="TrashIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
              Tirar a coluna
            </button>
            <div class="actions">
              <button type="button" class="btn-ink" (click)="close()">Pronto</button>
            </div>
          </footer>
        </div>
      }
    </dialog>
  `,
  styleUrl: './kanban-column-sheet.scss',
})
export class KanbanColumnSheet {
  readonly boardId = input.required<string>();
  readonly columnId = input.required<string>();
  /** Abriu para dar nome a uma coluna nova: o campo já vem selecionado. */
  readonly fresh = input(false);
  readonly closed = output<void>();

  protected readonly CloseIcon = X;
  protected readonly CheckIcon = Check;
  protected readonly LeftIcon = ArrowLeft;
  protected readonly RightIcon = ArrowRight;
  protected readonly TrashIcon = Trash2;
  protected readonly icons = COLUMN_ICONS;
  protected readonly iconOf = COLUMN_ICON;
  protected readonly iconLabel = COLUMN_ICON_LABEL;
  protected readonly stocks = LIGHT_STOCKS;
  protected readonly stockLabel = STOCK_LABEL;
  protected readonly nameMax = NAME_MAX;

  private readonly kanban = inject(KanbanStore);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nome = viewChild<ElementRef<HTMLInputElement>>('nome');

  protected readonly data = computed(() => {
    const board = this.kanban.get(this.boardId());
    const index = board?.columns.findIndex((c) => c.id === this.columnId()) ?? -1;
    if (!board || index < 0) return null;
    const col = board.columns[index];
    return { board, col, index, count: cardsIn(board, col.id).length };
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      const input = this.nome()?.nativeElement;
      if (this.fresh() && input) {
        input.focus();
        input.select();
      } else {
        el.querySelector<HTMLElement>('.fecha')?.focus();
      }
    });
  }

  close(): void {
    // o nome digitado e ainda não confirmado (sem Enter nem sair do campo) também vale
    const input = this.nome()?.nativeElement;
    if (input && input.value !== this.data()?.col.name) this.rename(input.value);
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected set(patch: { icon?: ColumnIcon; color?: LightStock; finishes?: boolean }): void {
    this.kanban.update(this.boardId(), (b, at) => updateColumn(b, this.columnId(), patch, at));
  }

  protected rename(name: string): void {
    if (!name.trim()) return;
    this.kanban.update(this.boardId(), (b, at) => updateColumn(b, this.columnId(), { name }, at));
  }

  protected shift(by: number): void {
    const d = this.data();
    if (!d) return;
    this.kanban.update(d.board.id, (b, at) => moveColumn(b, d.col.id, d.index + by, at));
  }

  /** Tira a coluna: as anotações dela vão para a vizinha (a da esquerda, ou a da direita), com Desfazer. */
  protected async remove(): Promise<void> {
    const d = this.data();
    if (!d || d.board.columns.length <= 1) return;
    const into = d.board.columns[d.index - 1] ?? d.board.columns[d.index + 1];
    const yes = await this.confirm.ask({
      title: `Tirar a coluna ${d.col.name}?`,
      text: d.count
        ? `${d.count === 1 ? 'A anotação dela vai' : `As ${d.count} anotações dela vão`} para ${into.name}. Nenhuma anotação sai do mural.`
        : 'Ela está vazia. Nenhuma anotação sai do mural.',
      confirm: 'Tirar a coluna',
      cancel: 'Deixar',
      icon: Trash2,
    });
    if (!yes) return;
    const before = this.kanban.get(d.board.id);
    this.close();
    this.kanban.update(d.board.id, (b, at) => removeColumn(b, d.col.id, into.id, at));
    if (before) this.toasts.show(`A coluna ${d.col.name} saiu do quadro`, { label: 'Desfazer', run: () => this.kanban.update(before.id, (_, at) => ({ ...before, at })) });
  }
}
