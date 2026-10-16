import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { LucideAngularModule, Plus, Trash2, X } from 'lucide-angular';
import { NAME_MAX, TRAIT_COLORS, TRAIT_COLOR_LABEL, TRAIT_MAX, TraitColor, addTrait, removeTrait, renameBoard, updateTrait } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { BackdropClose } from './backdrop-close';
import { Confirm } from './confirm';
import { Pin } from './pin';

/**
 * Os ajustes do quadro (a engrenagem da pasta): o nome, as características (o nome e a cor da fita de
 * cada uma, tirar) e apagar o quadro. Apagar não mexe em nenhuma anotação; a página dá o Desfazer.
 */
@Component({
  selector: 'app-kanban-board-sheet',
  imports: [BackdropClose, LucideAngularModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet quadro-ajustes" aria-labelledby="qa-titulo" (close)="closed.emit()" (backdropClose)="close()">
      @if (board(); as b) {
        <div class="ficha cartolina" data-cor="azul">
          <app-pin class="pin" color="#e62e2d" />
          <header class="head">
            <div class="titulos">
              <h2 id="qa-titulo">Ajustes do quadro</h2>
              <p class="sub">{{ b.name }} · {{ b.cards.length === 1 ? '1 anotação' : b.cards.length + ' anotações' }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" [strokeWidth]="2.6" aria-hidden="true" />
            </button>
          </header>

          <div class="body">
            <section class="grupo" aria-labelledby="qa-nome-t">
              <h3 class="grupo-titulo" id="qa-nome-t">Nome do quadro</h3>
              <label class="campo">
                <span class="sr-only">Nome do quadro</span>
                <input #nome type="text" autocomplete="off" [maxLength]="nameMax" [value]="b.name" (change)="rename($any($event.target).value)" (keydown.enter)="$any($event.target).blur()" />
              </label>
            </section>

            <section class="grupo" aria-labelledby="qa-car-t">
              <h3 class="grupo-titulo" id="qa-car-t">Características</h3>
              <p class="dica">As etiquetas deste quadro: “Correção”, “Sincronização”, “Decorações”… Só aparecem aqui, nunca no mural.</p>
              @if (b.traits.length) {
                <ul class="lista">
                  @for (t of b.traits; track t.id) {
                    <li class="item">
                      <label class="cor-escolha" [attr.data-fita]="t.color">
                        <span class="sr-only">Cor da fita de {{ t.name }}</span>
                        <select (change)="recolor(t.id, $any($event.target).value)">
                          @for (c of colors; track c) {
                            <option [value]="c" [selected]="c === t.color">{{ colorLabel[c] }}</option>
                          }
                        </select>
                      </label>
                      <label class="fita-nome" [attr.data-fita]="t.color">
                        <span class="sr-only">Nome da característica</span>
                        <input type="text" autocomplete="off" [maxLength]="traitMax" [value]="t.name" (change)="renameTrait(t.id, $any($event.target).value)" (keydown.enter)="$any($event.target).blur()" />
                      </label>
                      <span class="usos">{{ uses()[t.id] || 0 }}</span>
                      <button type="button" class="tirar" [attr.aria-label]="'Tirar ' + t.name" title="Tirar do quadro" (click)="dropTrait(t.id, t.name)">
                        <lucide-icon [img]="TrashIcon" [size]="17" [strokeWidth]="2.5" aria-hidden="true" />
                      </button>
                    </li>
                  }
                </ul>
              }
              <form class="nova" (submit)="$event.preventDefault(); create()">
                <label class="campo">
                  <span class="sr-only">Nova característica</span>
                  <input type="text" autocomplete="off" [maxLength]="traitMax" placeholder="Nova característica" [value]="typed()" (input)="typed.set($any($event.target).value)" />
                </label>
                <button type="submit" class="papel" [disabled]="!typed().trim()">
                  <lucide-icon [img]="PlusIcon" [size]="16" [strokeWidth]="2.8" aria-hidden="true" />
                  Criar
                </button>
              </form>
            </section>
          </div>

          <footer class="foot">
            <button type="button" class="papel perigo" (click)="removeBoard()">
              <lucide-icon [img]="TrashIcon" [size]="16" [strokeWidth]="2.6" aria-hidden="true" />
              Apagar o quadro
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
  readonly closed = output<void>();
  /** Apagar o quadro: a página apaga (com o Desfazer) depois da pergunta. */
  readonly removing = output<string>();

  protected readonly CloseIcon = X;
  protected readonly PlusIcon = Plus;
  protected readonly TrashIcon = Trash2;
  protected readonly colors = TRAIT_COLORS;
  protected readonly colorLabel = TRAIT_COLOR_LABEL;
  protected readonly nameMax = NAME_MAX;
  protected readonly traitMax = TRAIT_MAX;
  protected readonly typed = signal('');

  private readonly kanban = inject(KanbanStore);
  private readonly confirm = inject(Confirm);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nome = viewChild<ElementRef<HTMLInputElement>>('nome');

  protected readonly board = computed(() => this.kanban.get(this.boardId()) ?? null);
  /** Em quantas anotações cada característica está. */
  protected readonly uses = computed(() => {
    const out: Record<string, number> = {};
    for (const c of this.board()?.cards ?? []) for (const t of c.traits) out[t] = (out[t] ?? 0) + 1;
    return out;
  });

  constructor() {
    afterNextRender(() => {
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('.fecha')?.focus();
    });
  }

  close(): void {
    const input = this.nome()?.nativeElement;
    if (input && input.value.trim() && input.value !== this.board()?.name) this.rename(input.value);
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected rename(name: string): void {
    if (!name.trim()) return;
    this.kanban.update(this.boardId(), (b, at) => renameBoard(b, name, at));
  }

  protected create(): void {
    const name = this.typed().trim();
    if (!name) return;
    this.kanban.update(this.boardId(), (b, at) => addTrait(b, name, at).board);
    this.typed.set('');
  }

  protected renameTrait(id: string, name: string): void {
    if (!name.trim()) return;
    this.kanban.update(this.boardId(), (b, at) => updateTrait(b, id, { name }, at));
  }

  protected recolor(id: string, color: TraitColor): void {
    this.kanban.update(this.boardId(), (b, at) => updateTrait(b, id, { color }, at));
  }

  protected async dropTrait(id: string, name: string): Promise<void> {
    const n = this.uses()[id] ?? 0;
    if (n) {
      const yes = await this.confirm.ask({
        title: `Tirar ${name}?`,
        text: `Ela sai ${n === 1 ? 'da anotação' : `das ${n} anotações`} deste quadro que a têm. As anotações continuam como estão.`,
        confirm: 'Tirar',
        cancel: 'Deixar',
        icon: Trash2,
      });
      if (!yes) return;
    }
    this.kanban.update(this.boardId(), (b, at) => removeTrait(b, id, at));
  }

  protected async removeBoard(): Promise<void> {
    const b = this.board();
    if (!b) return;
    const yes = await this.confirm.ask({
      title: `Apagar o quadro ${b.name}?`,
      text: b.cards.length
        ? `As colunas, a importância e as características somem. As ${b.cards.length === 1 ? 'anotação continua' : `${b.cards.length} anotações continuam`} no mural, como estão.`
        : 'Ele está vazio. Nenhuma anotação muda.',
      confirm: 'Apagar o quadro',
      cancel: 'Deixar',
      icon: Trash2,
    });
    if (!yes) return;
    this.close();
    this.removing.emit(b.id);
  }
}
