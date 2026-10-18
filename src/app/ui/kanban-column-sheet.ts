import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import {
  ArrowLeft,
  ArrowRight,
  CalendarPlus,
  CaseSensitive,
  ChartNoAxesColumnIncreasing,
  Check,
  Columns3,
  Hand,
  History,
  Palette,
  ListTodo,
  LucideAngularModule,
  LucideIconData,
  Tag,
  Trash2,
  X,
} from 'lucide-angular';
import { COLUMN_ICONS, ColumnIcon, NAME_MAX, cardsIn, moveColumn, removeColumn, sortAllColumns, updateColumn } from '../core/kanban';
import { SORT_DIRS, SORT_KEYS, SORT_LABEL, SortKey, SortRule, sameSort, sortSentence } from '../core/kanban-sort';
import { KanbanStore } from '../core/kanban-store';
import { LIGHT_STOCKS, LightStock } from '../core/review';
import { BackdropClose } from './backdrop-close';
import { KanbanReviewCard } from './kanban-note';
import { KanbanTemplateSheet, sampleNote } from './kanban-template-sheet';
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

/** O desenho de cada critério de ordem. */
const SORT_ICON: Record<SortKey, LucideIconData> = {
  importancia: ChartNoAxesColumnIncreasing,
  criacao: CalendarPlus,
  alteracao: History,
  titulo: CaseSensitive,
  tag: Tag,
  tarefas: ListTodo,
};

/**
 * Os ajustes de uma coluna do quadro (o lápis no alto dela): o nome, o ícone e a cor da etiqueta,
 * "Finalizar tarefas movidas para cá", a ordem das anotações (À mão, ou por um critério e, no
 * empate, por outro, cada um no seu sentido), a posição e tirar a coluna. Vale na hora; a etiqueta de prévia
 * em cima é a mesma da coluna.
 */
@Component({
  selector: 'app-kanban-column-sheet',
  imports: [BackdropClose, KanbanReviewCard, KanbanTemplateSheet, LucideAngularModule, Pin],
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
                  <p class="linha-desc" id="ca-fin-d">A anotação que chega aqui ganha o carimbo de finalizada; saindo para uma coluna que não finaliza, abre de novo.</p>
                </div>
                <button type="button" class="interruptor" role="switch" [attr.aria-checked]="d.col.finishes" aria-labelledby="ca-fin" aria-describedby="ca-fin-d" (click)="set({ finishes: !d.col.finishes })">
                  <span class="bolinha"></span>
                </button>
              </div>
              <!-- o card padrão: a anotação que chega veste o visual dele, e fica com ele ao sair -->
              <div class="linha">
                <div class="linha-texto">
                  <p class="linha-nome" id="ca-card">Card padrão</p>
                  <p class="linha-desc" id="ca-card-d">
                    A anotação que chega aqui veste a cor, o papel e os enfeites do card padrão, e fica com eles depois de sair. As compartilhadas ficam como estão.
                  </p>
                </div>
                <button type="button" class="interruptor" role="switch" [attr.aria-checked]="!!d.col.dresses" aria-labelledby="ca-card" aria-describedby="ca-card-d" (click)="toggleDress()">
                  <span class="bolinha"></span>
                </button>
              </div>
              @if (d.col.dresses) {
                <div class="padrao">
                  <div class="padrao-previa" aria-hidden="true">
                    <app-review-card [review]="sample()!" [compact]="true" [preview]="true" />
                  </div>
                  <button type="button" class="papel montar" (click)="templating.set(true)">
                    <lucide-icon [img]="PaletteIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
                    Montar o card padrão
                  </button>
                </div>
              }
            </section>

            <!-- a ordem: à mão, ou por um critério e o desempate; a frase em cima diz o que vale agora -->
            <section class="grupo" aria-labelledby="ca-ordem-t">
              <h3 class="grupo-titulo" id="ca-ordem-t">Ordem das anotações</h3>
              <p class="ordem-frase" aria-live="polite">{{ sentence() }}</p>

              <fieldset class="nivel">
                <legend class="nivel-nome">Primeiro por</legend>
                <div class="ordem-ops">
                  <label class="ordem-op">
                    <input type="radio" name="ca-ordem-1" [checked]="!first()" (change)="setFirst(null)" />
                    <lucide-icon [img]="HandIcon" [size]="17" [strokeWidth]="2.4" aria-hidden="true" />
                    À mão
                  </label>
                  @for (k of sortKeys; track k) {
                    <label class="ordem-op">
                      <input type="radio" name="ca-ordem-1" [checked]="first()?.by === k" (change)="setFirst(k)" />
                      <lucide-icon [img]="sortIcon[k]" [size]="17" [strokeWidth]="2.4" aria-hidden="true" />
                      {{ sortLabel[k] }}
                    </label>
                  }
                </div>
                @if (first(); as f) {
                  <div class="segmentos dois" role="radiogroup" [attr.aria-label]="'Sentido da ordem por ' + sortLabel[f.by]">
                    @for (dir of sortDirs[f.by]; track $index) {
                      <label class="segmento">
                        <input type="radio" name="ca-sentido-1" [checked]="!!f.reverse === ($index === 1)" (change)="setReverse(0, $index === 1)" />
                        <span class="seg-nome">{{ dir }}</span>
                      </label>
                    }
                  </div>
                }
              </fieldset>

              @if (first(); as f) {
                <fieldset class="nivel">
                  <legend class="nivel-nome">No empate, por</legend>
                  <div class="ordem-ops">
                    <label class="ordem-op">
                      <input type="radio" name="ca-ordem-2" [checked]="!second()" (change)="setSecond(null)" />
                      Nenhum
                    </label>
                    @for (k of sortKeys; track k) {
                      @if (k !== f.by) {
                        <label class="ordem-op">
                          <input type="radio" name="ca-ordem-2" [checked]="second()?.by === k" (change)="setSecond(k)" />
                          <lucide-icon [img]="sortIcon[k]" [size]="17" [strokeWidth]="2.4" aria-hidden="true" />
                          {{ sortLabel[k] }}
                        </label>
                      }
                    }
                  </div>
                  @if (second(); as s) {
                    <div class="segmentos dois" role="radiogroup" [attr.aria-label]="'Sentido do desempate por ' + sortLabel[s.by]">
                      @for (dir of sortDirs[s.by]; track $index) {
                        <label class="segmento">
                          <input type="radio" name="ca-sentido-2" [checked]="!!s.reverse === ($index === 1)" (change)="setReverse(1, $index === 1)" />
                          <span class="seg-nome">{{ dir }}</span>
                        </label>
                      }
                    </div>
                  }
                </fieldset>
              }

              @if (othersDiffer()) {
                <div class="ordem-todas">
                  <button type="button" class="papel" (click)="sortAll()">
                    <lucide-icon [img]="ColumnsIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
                    Usar esta ordem nas outras colunas
                  </button>
                </div>
              }
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
    @if (templating()) {
      <app-kanban-template-sheet [boardId]="boardId()" [columnId]="columnId()" (closed)="templating.set(false)" />
    }
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
  protected readonly HandIcon = Hand;
  protected readonly ColumnsIcon = Columns3;
  protected readonly PaletteIcon = Palette;
  /** A folha "Card padrão" aberta por cima desta. */
  protected readonly templating = signal(false);
  protected readonly sortKeys = SORT_KEYS;
  protected readonly sortLabel = SORT_LABEL;
  protected readonly sortDirs = SORT_DIRS;
  protected readonly sortIcon = SORT_ICON;
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

  /** A ficha do quadro vestida com o card padrão da coluna (a prévia em miniatura). */
  protected readonly sample = computed(() => {
    const d = this.data();
    if (!d?.col.look) return null;
    const first = d.board.cards.find((c) => c.column === d.col.id);
    const name = (first && this.kanban.notesById().get(first.note)?.game.name) || 'Anotação de exemplo';
    return sampleNote(`modelo${d.col.id}`.slice(0, 40), name, d.col.look);
  });

  /** A regra da ordem e a do desempate (null: à mão / nenhum). */
  protected readonly first = computed(() => this.data()?.col.sort?.[0] ?? null);
  protected readonly second = computed(() => this.data()?.col.sort?.[1] ?? null);
  protected readonly sentence = computed(() => sortSentence(this.data()?.col.sort ?? []));
  /** Alguma outra coluna está noutra ordem? (só então dá para levar esta a todas) */
  protected readonly othersDiffer = computed(() => {
    const d = this.data();
    return !!d && d.board.columns.some((c) => c.id !== d.col.id && !sameSort(c.sort, d.col.sort));
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

  /**
   * Liga ou desliga o card padrão. Ligado pela primeira vez, ele começa na cor da etiqueta da coluna;
   * desligado, o card fica guardado para a próxima vez. Ligado, as anotações da coluna vestem na hora,
   * com Desfazer; desligado, elas continuam vestidas (o visual já é delas) e só as que chegarem depois
   * não vestem mais.
   */
  protected toggleDress(): void {
    const d = this.data();
    if (!d) return;
    const before = d.board;
    const on = !d.col.dresses;
    this.kanban.update(d.board.id, (b, at) => updateColumn(b, d.col.id, on ? { look: d.col.look ?? { stock: d.col.color }, dresses: true } : { dresses: undefined }, at));
    if (!d.count || !on) return;
    const who = d.count === 1 ? 'A anotação' : `As ${d.count} anotações`;
    this.toasts.show(`${who} de ${d.col.name} ${d.count === 1 ? 'vestiu' : 'vestiram'} o card padrão`, { label: 'Desfazer', run: () => this.kanban.restore(before) });
  }

  private setSort(sort: SortRule[]): void {
    this.kanban.update(this.boardId(), (b, at) => updateColumn(b, this.columnId(), { sort }, at));
  }

  /**
   * A ordem: null volta para à mão. Escolher o critério que estava no desempate troca os dois de lugar
   * (por importância e tag → por tag e importância), cada um com o seu sentido.
   */
  protected setFirst(by: SortKey | null): void {
    const cur = this.data()?.col.sort ?? [];
    if (!by) return this.setSort([]);
    if (cur[0]?.by === by) return;
    const picked = cur.find((r) => r.by === by) ?? { by };
    const rest = cur[1]?.by === by ? cur[0] : cur[1];
    this.setSort(rest ? [picked, rest] : [picked]);
  }

  /** O desempate (null: nenhum). */
  protected setSecond(by: SortKey | null): void {
    const cur = this.data()?.col.sort ?? [];
    if (!cur[0]) return;
    this.setSort(by ? [cur[0], cur.find((r) => r.by === by) ?? { by }] : [cur[0]]);
  }

  protected setReverse(level: number, reverse: boolean): void {
    const cur = this.data()?.col.sort ?? [];
    if (!cur[level]) return;
    this.setSort(cur.map((r, i) => (i === level ? (reverse ? { by: r.by, reverse: true } : { by: r.by }) : r)));
  }

  /** A ordem desta coluna vale em todas, com Desfazer. */
  protected sortAll(): void {
    const d = this.data();
    if (!d) return;
    const before = d.board;
    this.kanban.update(d.board.id, (b, at) => sortAllColumns(b, d.col.sort ?? [], at));
    this.toasts.show(`A ordem de ${d.col.name} vale em todas as colunas`, { label: 'Desfazer', run: () => this.kanban.restore(before) });
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
    if (before) this.toasts.show(`A coluna ${d.col.name} saiu do quadro`, { label: 'Desfazer', run: () => this.kanban.restore(before) });
  }
}
