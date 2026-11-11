import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { IconChart } from './icon-chart';
import { ICON, ICON_CHOICE, IconModule } from './icons';
import { IconChoice } from '../core/icon-choices';
import { LIGHT_STOCKS, LightStock } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { CARD_LOOKS, CARD_LOOK_LABEL, CardLook, DECK_NAME_MAX, cardFace, deckLook, frontTitle } from '../core/study';
import { StudyStore } from '../core/study-store';
import { pinningFor } from '../core/wall-physics';
import { BackdropClose } from './backdrop-close';
import { Choice, Confirm } from './confirm';
import { CloudAccount } from '../core/cloud-account';
import { Pin } from './pin';
import { RemoveAsking } from './remove-asking';
import { StudyCard } from './study-card';
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
 * (a da orelha da aba e do elástico da pilha), o estilo das cartas (cada opção é a primeira carta do baralho
 * naquele desenho, em miniatura), o lugar na fileira e apagar o baralho; a cartela
 * dos ícones, com mais de cem, fica por último, para não empurrar o resto. A mesma
 * ficha da coluna do Kanban (ui/kanban-column-sheet.ts), com o mesmo desenho; vale na hora.
 */
@Component({
  selector: 'app-study-deck-sheet',
  imports: [BackdropClose, IconChart, IconModule, Pin, StudyCard],
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
              <p class="sub">Baralho {{ d.index + 1 }} de {{ d.total }} · {{ d.count === 1 ? '1 flashcard' : d.count + ' flashcards' }}@if (d.deck.group) { · do grupo {{ d.deck.group }}}</p>
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

            <!-- quem vê: as duas etiquetas do Público e do Privado do editor da anotação; o baralho público mostra
                 a quem visita o seu mural as cartas de anotações públicas (PLANO-BARALHOS-PUBLICOS.md) -->
            <section class="grupo" aria-labelledby="ba-quem-t">
              <h3 class="grupo-titulo" id="ba-quem-t">Quem vê</h3>
              <div class="quem-opts" role="radiogroup" aria-labelledby="ba-quem-t" aria-describedby="ba-quem-dica">
                <button type="button" role="radio" class="quem-tag" [attr.aria-checked]="!!d.deck.public" [disabled]="asking()" (click)="setPublic(true)">
                  <lucide-icon [img]="PublicIcon" [size]="16" aria-hidden="true" />
                  Público
                </button>
                <button type="button" role="radio" class="quem-tag" [attr.aria-checked]="!d.deck.public" [disabled]="asking()" (click)="setPublic(false)">
                  <lucide-icon [img]="PrivateIcon" [size]="16" aria-hidden="true" />
                  Privado
                </button>
              </div>
              <p class="quem-dica" id="ba-quem-dica">{{ shareHint() }}</p>
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

            <section class="grupo" aria-labelledby="ba-estilo-t">
              <h3 class="grupo-titulo" id="ba-estilo-t">Estilo dos flashcards</h3>
              <div class="ops estilos" role="radiogroup" aria-labelledby="ba-estilo-t">
                @if (sample(); as s) {
                  @for (l of looks; track l) {
                    <button type="button" role="radio" class="op estilo" [attr.aria-checked]="current() === l" (click)="setLook(l)">
                      <span class="miniatura" aria-hidden="true">
                        <app-study-card [title]="s.title" [subtitle]="s.subtitle" [image]="s.image" [stock]="s.stock" [deck]="d.deck" [look]="l" [face]="s.face" />
                      </span>
                      <span class="estilo-nome">{{ lookLabel[l] }}</span>
                    </button>
                  }
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
              <app-icon-chart [value]="d.deck.icon" none="Sem ícone" [heading]="'Ícone do baralho ' + d.deck.name" [hint]="d.deck.icon ? 'Antes do nome do baralho, na fileira.' : 'O baralho aparece só com o nome.'" (pick)="set({ icon: $event })" />
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
    /* quem vê: as etiquetas do editor da anotação (ui/review-editor.scss, "Quem vê"), iguais; a escolhida sai
       colada em tinta. Aqui são botões (role=radio), para a escolha só mudar quando o baralho muda (a pergunta
       do "Tornar todas públicas" pode ser cancelada) */
    .quem-opts {
      display: flex;
      flex-wrap: wrap;
      gap: 8px 12px;
    }
    .quem-tag {
      display: inline-flex;
      align-items: center;
      gap: 6px;
      min-height: 44px;
      padding: 8px 14px 7px;
      border: 0;
      border-radius: 2px;
      outline: 1.5px dashed rgb(21 21 21 / 0.45);
      outline-offset: -1.5px;
      background: transparent;
      color: inherit;
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.9rem;
      letter-spacing: 0.09em;
      text-transform: uppercase;
      line-height: 1;
      cursor: pointer;
      transition:
        rotate var(--t-ui) var(--ease-ui),
        background-color var(--t-ui) var(--ease-ui);
    }
    .quem-tag:hover:not([aria-checked='true']) {
      background: rgb(21 21 21 / 0.07);
    }
    .quem-tag[aria-checked='true'] {
      outline: 0;
      background: var(--ink);
      color: var(--paper);
      rotate: -2deg;
      box-shadow: 0 1px 2px rgb(0 0 0 / 0.35), 0 4px 8px -3px rgb(0 0 0 / 0.35);
    }
    .quem-tag:focus-visible {
      box-shadow: 0 0 0 3px var(--paper), 0 0 0 6px var(--focus);
    }
    .quem-tag:disabled {
      cursor: progress;
    }
    .quem-dica {
      margin: 12px 0 0;
      max-width: 52ch;
      font-size: 0.92rem;
      line-height: 1.45;
      color: var(--ink-2);
    }


    /* o estilo das cartas: a primeira carta do baralho em miniatura (desenhada a 120px e reduzida, para a
       letra miúda do desenho continuar do tamanho dela), com o nome embaixo; a escolhida, o adesivo de tinta */
    .estilos {
      gap: 10px 8px;
    }
    .op.estilo {
      width: 84px;
      height: auto;
      padding: 12px 0 6px;
      gap: 6px;
      align-content: start;
    }
    .miniatura {
      display: block;
      width: 66px;
      height: 92.4px;
    }
    .miniatura app-study-card {
      width: 120px;
      scale: 0.55;
      transform-origin: 0 0;
      pointer-events: none;
    }
    .estilo-nome {
      max-width: 80px;
      padding: 3px 5px 2px;
      border-radius: 2px;
      font: 800 0.72rem / 1.05 var(--f-label);
      letter-spacing: 0.04em;
      text-transform: uppercase;
      text-align: center;
      text-wrap: balance;
    }
    .op.estilo[aria-checked='true'] {
      outline: 2px solid var(--ink);
      outline-offset: -2px;
      background: rgb(21 21 21 / 0.06);
    }
    .op.estilo[aria-checked='true'] .estilo-nome {
      background: var(--ink);
      color: var(--hi);
      rotate: -3deg;
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
  protected readonly PublicIcon = ICON.pessoas;
  protected readonly PrivateIcon = ICON.privada;
  protected readonly iconOf = ICON_CHOICE;
  protected readonly stocks = LIGHT_STOCKS;
  protected readonly stockLabel = STOCK_LABEL;
  protected readonly nameMax = DECK_NAME_MAX;
  protected readonly looks = CARD_LOOKS;
  protected readonly lookLabel = CARD_LOOK_LABEL;

  private readonly study = inject(StudyStore);
  private readonly store = inject(ReviewStore);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  private readonly removal = inject(RemoveAsking);
  private readonly account = inject(CloudAccount);
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

  protected readonly current = computed(() => deckLook(this.data()?.deck));

  /** A pergunta do "Tornar todas públicas" está aberta: as etiquetas esperam. */
  protected readonly asking = signal(false);

  /** O que a escolha quer dizer agora: quem vê o baralho e quantas cartas. */
  protected readonly shareHint = computed(() => {
    const d = this.data();
    if (!d) return '';
    if (!d.deck.public) return 'Só você vê este baralho.';
    const s = this.study.share(d.deck.id);
    const cards = (n: number) => (n === 1 ? '1 flashcard' : `${n} flashcards`);
    const who =
      s.total === 0
        ? 'Quem visita o seu mural vê o baralho, ainda sem flashcards.'
        : s.shown === s.total
          ? `Quem visita o seu mural vê o baralho e ${s.total === 1 ? 'o flashcard' : `os ${s.total} flashcards`}.`
          : s.shown === 0
            ? `Quem visita o seu mural vê o baralho, mas nenhum dos ${cards(s.total)}: são de anotações privadas, e ficam só com você.`
            : `Quem visita vê ${s.shown} dos ${cards(s.total)}. Os de anotações privadas ficam só com você.`;
    return this.account.signedIn() ? who : `${who} Para alguém ver, entre na sua conta.`;
  });

  /** A carta das miniaturas: a primeira do baralho, como ela é; sem nenhuma, o nome do baralho. */
  protected readonly sample = computed(() => {
    const d = this.data();
    if (!d) return null;
    const card = this.study
      .cards()
      .filter((c) => c.decks.includes(d.deck.id) && this.study.live(c.note))
      .sort((a, b) => a.added.localeCompare(b.added))[0];
    const note = card ? this.store.get(card.note) : undefined;
    if (!card || !note) return { title: d.deck.name, subtitle: undefined, image: undefined, stock: d.deck.color, face: null };
    return {
      title: frontTitle(card, note.game.name),
      subtitle: card.front.subtitle,
      image: card.front.image,
      stock: pinningFor(note.id, note.stock).stock,
      face: cardFace(card, this.study.now(), 1),
    };
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

  /** A Clássica é o padrão: escolhida, o baralho fica sem o campo. */
  protected setLook(look: CardLook): void {
    this.study.updateDeck(this.deckId(), { look: look === 'classica' ? undefined : look });
  }

  protected rename(name: string): void {
    if (!name.trim()) return;
    this.study.updateDeck(this.deckId(), { name });
  }

  /**
   * Público ou Privado. Tornar público com cartas de anotações privadas pergunta antes (o pedido, com a
   * porcentagem de verdade): tornar todas públicas (fora do Feed), só o baralho, ou nada.
   */
  protected async setPublic(on: boolean): Promise<void> {
    const d = this.data();
    if (!d || !!d.deck.public === on || this.asking()) return;
    if (!on) {
      this.study.updateDeck(d.deck.id, { public: undefined });
      return;
    }
    const share = this.study.share(d.deck.id);
    if (!share.hidden.length) {
      this.study.updateDeck(d.deck.id, { public: true });
      return;
    }
    this.asking.set(true);
    let choice: Choice;
    try {
      choice = await this.confirm.choose({
        title: 'Tornar o baralho público',
        text: `Gostaria de tornar públicos todos os flashcards deste baralho? ${share.percent}% dos flashcards dele são públicos atualmente.`,
        confirm: 'Tornar todas públicas',
        secondary: 'Só o baralho',
        cancel: 'Cancelar',
      });
    } finally {
      this.asking.set(false);
    }
    // o baralho pode ter sumido (apagado noutro aparelho) enquanto a pergunta estava aberta
    if (!choice || !this.study.deck(d.deck.id)) return;
    const name = d.deck.name;
    this.study.updateDeck(d.deck.id, { public: true });
    if (choice === 'secondary') return;
    const out = this.study.publishNotes(share.hidden);
    const after = this.study.share(d.deck.id);
    const rest = out.skipped
      ? ` ${out.skipped === 1 ? '1 compartilhada continua privada' : `${out.skipped} compartilhadas continuam privadas`}: quem vê nelas muda em Compartilhar.`
      : '';
    const undo = () => {
      out.undo();
      if (this.study.deck(d.deck.id)?.public) this.study.updateDeck(d.deck.id, { public: undefined });
    };
    this.toasts.show(`${name} ficou público, com ${after.shown === 1 ? '1 flashcard' : `${after.shown} flashcards`}.${rest}`, { label: 'Desfazer', run: undo }, 8000);
  }

  protected shift(by: number): void {
    const d = this.data();
    if (d) this.study.moveDeck(d.deck.id, d.index + by);
  }

  /** Apaga o baralho, com a pergunta e o Desfazer (ver ui/remove-asking.ts); a página volta para o grupo. */
  protected async remove(): Promise<void> {
    if (await this.removal.deck(this.deckId(), () => this.close())) this.removed.emit();
  }
}
