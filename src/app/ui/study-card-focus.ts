import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, effect, inject, input, output, signal, viewChild } from '@angular/core';
import { reducedMotion } from '../core/motion';
import { Deck, frontTitle } from '../core/study';
import { STUDY_SOURCE } from '../core/study-source';
import { pinningFor } from '../core/wall-physics';
import { ICON, IconModule } from './icons';
import { StudyCard } from './study-card';
import { StudyCardBack } from './study-card-back';

/**
 * A carta maximizada: o botão preto de maximizar da parede do baralho abre a carta em foco e grande, a mesma
 * mesa da sessão de estudo (a mesma folha de estilos, a mesma carta, o mesmo verso), só para ver, nos seus
 * Flashcards e nos de quem se visita. Tocar na
 * carta vira, o "Virar a carta" e o Espaço também; sem Errei nem Acertei, e nada aqui conta como estudo.
 */
@Component({
  selector: 'app-study-card-focus',
  imports: [IconModule, StudyCard, StudyCardBack],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '(document:keydown)': 'onKey($event)' },
  template: `
    <dialog #dialog class="sessao" [attr.aria-label]="deck().name + ': ' + (card()?.title ?? 'flashcard')" (close)="closed.emit()">
      <header class="topo">
        <button type="button" class="parar" aria-label="Fechar o flashcard" title="Fechar (Esc)" (click)="close()">
          <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
        </button>
        <h2 class="baralho">{{ deck().name }} · só para ver</h2>
      </header>

      @if (card(); as c) {
        <div class="mesa">
          <div class="area">
            <div class="giro" [class.virada]="turned()" [class.calma]="calm">
              <!-- o toque na frente é só do mouse e do dedo: no teclado e no leitor de tela, o botão do pé -->
              <div class="face frente" [attr.inert]="turned() ? '' : null" (click)="turn()">
                <app-study-card [title]="c.title" [subtitle]="c.subtitle" [image]="c.image" [stock]="c.stock" [deck]="deck()" />
              </div>
              <article appStudyBack class="face verso cartolina" [note]="note()" [attr.inert]="turned() ? null : ''" [attr.aria-hidden]="turned() ? null : 'true'" (turn)="turn()"></article>
            </div>
          </div>
        </div>
        <div class="botoes">
          <button type="button" class="mostrar" aria-keyshortcuts="Space Enter" (click)="turn()">
            Virar o flashcard
            <span class="tecla" aria-hidden="true">Espaço</span>
          </button>
        </div>
      }

      <p class="sr-only" aria-live="polite">{{ spoken() }}</p>
    </dialog>
  `,
  styleUrl: './study-session.scss',
  styles: `
    .frente,
    .verso {
      cursor: pointer;
    }
  `,
})
export class StudyCardFocus {
  /** A anotação da carta. */
  readonly note = input.required<string>();
  /** O baralho aberto na parede: o desenho da frente e o nome em cima. */
  readonly deck = input.required<Deck>();
  /** A carta já vem virada: estava com o verso à mostra na parede. */
  readonly back = input(false);
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly calm = reducedMotion();

  /** As suas cartas, ou as de quem se visita (core/study-source.ts). */
  private readonly source = inject(STUDY_SOURCE);
  private readonly dialog = viewChild<ElementRef<HTMLDialogElement>>('dialog');

  /** O lado mudado aqui, enquanto a folha está aberta (null: o que a parede mostrava). */
  private readonly side = signal<boolean | null>(null);
  protected readonly turned = computed(() => this.side() ?? this.back());
  /** O que a voz do leitor de tela diz ao virar. */
  protected readonly spoken = signal('');

  /** A frente, como na mesa de estudo (sem o progresso, que é da parede). */
  protected readonly card = computed(() => {
    const card = this.source.card(this.note());
    const note = this.source.note(this.note());
    if (!card || !note) return null;
    return { title: frontTitle(card, note.game.name), subtitle: card.front.subtitle, image: card.front.image, stock: pinningFor(note.id, note.stock).stock };
  });

  constructor() {
    afterNextRender(() => {
      // saiu dos Estudos enquanto a folha chegava: não há o que abrir
      if (!this.card()) {
        this.closed.emit();
        return;
      }
      this.dialog()?.nativeElement.showModal();
      this.foot()?.focus();
      if (this.back()) this.spoken.set(`Verso de ${this.card()?.title ?? 'flashcard'}`);
    });
    // a carta saiu dos Estudos (em outro aparelho, por exemplo) com a folha aberta: não sobra nada para ver
    effect(() => {
      if (!this.card()) this.close();
    });
  }

  close(): void {
    const el = this.dialog()?.nativeElement;
    if (el?.open) el.close();
  }

  private foot(): HTMLElement | null | undefined {
    return this.dialog()?.nativeElement.querySelector<HTMLElement>('.mostrar');
  }

  protected turn(): void {
    const next = !this.turned();
    // o foco dentro do verso que vai ficar de costas cairia na página
    if (!next && document.activeElement?.closest('.verso')) this.foot()?.focus();
    this.side.set(next);
    this.spoken.set(`${next ? 'Verso' : 'Frente'} de ${this.card()?.title ?? 'flashcard'}`);
  }

  /**
   * Espaço e Enter viram. Num botão, no que se toca no texto do verso e na rolagem do verso, são deles. Vale
   * também com o foco solto na página (o texto pode tirar de baixo dele o que tinha o foco), nunca com outra
   * folha aberta por cima desta. Segurar a tecla vira uma vez só.
   */
  protected onKey(e: KeyboardEvent): void {
    if ((e.key !== ' ' && e.key !== 'Enter') || e.repeat || e.ctrlKey || e.metaKey || e.altKey) return;
    const own = this.dialog()?.nativeElement;
    if ([...document.querySelectorAll('dialog:modal, :popover-open')].some((d) => d !== own)) return;
    const at = e.target instanceof Element ? e.target : null;
    if (at?.closest('input, textarea, select, [contenteditable="true"], button, a[href], summary, [role="button"], [role="link"], .verso-conteudo')) return;
    e.preventDefault();
    this.turn();
  }
}
