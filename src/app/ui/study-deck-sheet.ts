import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';
import { ICON, ICON_CHOICE, ICON_CHOICE_LABEL, IconModule } from './icons';
import { ICON_CHOICES, IconChoice } from '../core/icon-choices';
import { LIGHT_STOCKS, LightStock } from '../core/review';
import { DECK_NAME_MAX } from '../core/study';
import { StudyStore } from '../core/study-store';
import { BackdropClose } from './backdrop-close';
import { Confirm } from './confirm';
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
 * Os ajustes de um baralho dos Estudos (o lápis da pasta, e o "+ Novo baralho"): o nome, o ícone e a cor
 * (a do fio da carta de cima da pilha e da orelha da aba), o lugar na fileira e apagar o baralho; a cartela
 * dos ícones, com mais de cem, fica por último, para não empurrar o resto. A mesma
 * ficha da coluna do Kanban (ui/kanban-column-sheet.ts), com o mesmo desenho; vale na hora.
 */
@Component({
  selector: 'app-study-deck-sheet',
  imports: [BackdropClose, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet coluna-ajustes baralho-ajustes" aria-labelledby="ba-titulo" (close)="closed.emit()" (backdropClose)="close()">
      @if (data(); as d) {
        <div class="ficha cartolina" [style.--stock]="'var(--stock-' + d.deck.color + ')'" [attr.data-cor]="d.deck.color">
          <app-pin class="pin" color="#f4f4f0" />
          <header class="head">
            <div class="titulos">
              <h2 id="ba-titulo">
                @if (d.deck.icon) {
                  <lucide-icon class="titulo-icone" [img]="iconOf[d.deck.icon]" [size]="26" aria-hidden="true" />
                }
                {{ d.deck.name }}
              </h2>
              <p class="sub">Baralho {{ d.index + 1 }} de {{ d.total }} · {{ d.count === 1 ? '1 carta' : d.count + ' cartas' }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
            </button>
          </header>

          <div class="body">
            <section class="grupo" aria-labelledby="ba-nome-t">
              <h3 class="grupo-titulo" id="ba-nome-t">Nome</h3>
              <label class="campo">
                <span class="sr-only">Nome do baralho</span>
                <input #nome type="text" autocomplete="off" [maxLength]="nameMax" [value]="d.deck.name" (change)="rename($any($event.target).value)" (keydown.enter)="$any($event.target).blur()" />
              </label>
            </section>

            <section class="grupo" aria-labelledby="ba-cor-t">
              <h3 class="grupo-titulo" id="ba-cor-t">Cor</h3>
              <div class="ops" role="radiogroup" aria-labelledby="ba-cor-t">
                @for (s of stocks; track s) {
                  <button type="button" role="radio" class="op cor" [style.--stock]="'var(--stock-' + s + ')'" [attr.aria-checked]="d.deck.color === s" [attr.aria-label]="stockLabel[s]" [title]="stockLabel[s]" (click)="set({ color: s })">
                    @if (d.deck.color === s) {
                      <lucide-icon [img]="CheckIcon" [size]="18" aria-hidden="true" />
                    }
                  </button>
                }
              </div>
            </section>

            <section class="grupo" aria-labelledby="ba-lugar-t">
              <h3 class="grupo-titulo" id="ba-lugar-t">Lugar na fileira</h3>
              <div class="lugar">
                <button type="button" class="papel" [disabled]="d.index === 0" (click)="shift(-1)">
                  <lucide-icon [img]="LeftIcon" [size]="16" aria-hidden="true" />
                  Para a esquerda
                </button>
                <button type="button" class="papel" [disabled]="d.index === d.total - 1" (click)="shift(1)">
                  Para a direita
                  <lucide-icon [img]="RightIcon" [size]="16" aria-hidden="true" />
                </button>
              </div>
            </section>
            <section class="grupo" aria-labelledby="ba-icone-t">
              <h3 class="grupo-titulo" id="ba-icone-t">Ícone</h3>
              <div class="ops" role="radiogroup" aria-labelledby="ba-icone-t">
                <button type="button" role="radio" class="op icone sem-icone" [attr.aria-checked]="!d.deck.icon" aria-label="Sem ícone" title="Sem ícone" (click)="set({ icon: null })"></button>
                @for (i of icons; track i) {
                  <button type="button" role="radio" class="op icone" [attr.aria-checked]="d.deck.icon === i" [attr.aria-label]="iconLabel[i]" [title]="iconLabel[i]" (click)="set({ icon: i })">
                    <lucide-icon [img]="iconOf[i]" [size]="19" aria-hidden="true" />
                  </button>
                }
              </div>
            </section>

          </div>

          <footer class="foot">
            <button type="button" class="papel perigo" (click)="remove()">
              <lucide-icon [img]="TrashIcon" [size]="16" aria-hidden="true" />
              Apagar o baralho
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
  // o "Sem ícone": o recorte com o risco, como na folha do lembrete (ui/reminder-sheet.scss)
  styles: `
    .op.sem-icone::before {
      content: '';
      width: 22px;
      height: 1.5px;
      border-radius: 1px;
      background: currentColor;
      rotate: -45deg;
      opacity: 0.55;
    }
    .op.sem-icone[aria-checked='true']::before {
      opacity: 1;
    }
  `,
})
export class StudyDeckSheet {
  readonly deckId = input.required<string>();
  /** Abriu para dar nome a um baralho novo: o campo já vem selecionado. */
  readonly fresh = input(false);
  readonly closed = output<void>();
  /** O baralho foi apagado (a página volta para Tudo). */
  readonly removed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly CheckIcon = ICON.pronto;
  protected readonly LeftIcon = ICON.voltar;
  protected readonly RightIcon = ICON.ir;
  protected readonly TrashIcon = ICON.apagar;
  protected readonly icons = ICON_CHOICES;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly iconLabel = ICON_CHOICE_LABEL;
  protected readonly stocks = LIGHT_STOCKS;
  protected readonly stockLabel = STOCK_LABEL;
  protected readonly nameMax = DECK_NAME_MAX;

  private readonly study = inject(StudyStore);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly nome = viewChild<ElementRef<HTMLInputElement>>('nome');

  protected readonly data = computed(() => {
    const decks = this.study.decks();
    const index = decks.findIndex((d) => d.id === this.deckId());
    if (index < 0) return null;
    const deck = decks[index];
    const count = this.study.cards().filter((c) => c.decks.includes(deck.id) && this.study.live(c.note)).length;
    return { deck, index, total: decks.length, count };
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
    if (input && input.value !== this.data()?.deck.name) this.rename(input.value);
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected set(patch: { icon?: IconChoice | null; color?: LightStock }): void {
    this.study.updateDeck(this.deckId(), patch);
  }

  protected rename(name: string): void {
    if (!name.trim()) return;
    this.study.updateDeck(this.deckId(), { name });
  }

  protected shift(by: number): void {
    const d = this.data();
    if (d) this.study.moveDeck(d.deck.id, d.index + by);
  }

  /**
   * Apaga o baralho, com a pergunta e o Desfazer: as cartas saem dele, e a que não está em nenhum outro
   * sai dos Estudos (a anotação continua no mural, com o progresso guardado para o Desfazer).
   */
  protected async remove(): Promise<void> {
    const d = this.data();
    if (!d) return;
    const only = this.study.cards().filter((c) => c.decks.length === 1 && c.decks[0] === d.deck.id && this.study.live(c.note)).length;
    const yes = await this.confirm.ask({
      title: `Apagar o baralho ${d.deck.name}?`,
      text: d.count
        ? `${d.count === 1 ? 'A carta sai' : `As ${d.count} cartas saem`} dele${only ? `; ${only === d.count ? (only === 1 ? 'ela não está' : 'elas não estão') : `${only} não ${only === 1 ? 'está' : 'estão'}`} em outro baralho e ${only === 1 ? 'sai' : 'saem'} dos Estudos, com o progresso` : ''}. Nenhuma anotação é apagada.`
        : 'Ele está vazio. Nenhuma anotação é apagada.',
      confirm: 'Apagar o baralho',
      cancel: 'Deixar',
      icon: ICON.apagar,
    });
    if (!yes) return;
    this.close();
    const undo = this.study.removeDeck(d.deck.id);
    this.removed.emit();
    if (undo) this.toasts.show(`O baralho ${d.deck.name} foi apagado`, { label: 'Desfazer', run: undo });
  }
}
