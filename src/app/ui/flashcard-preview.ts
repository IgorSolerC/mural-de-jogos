import { ChangeDetectionStrategy, Component, booleanAttribute, computed, input, output } from '@angular/core';
import { CardFront } from '../core/study';
import { Review, Stock } from '../core/review';
import { ICON, IconModule } from './icons';
import { CardDeck, StudyCard } from './study-card';
import { StudyCardBack } from './study-card-back';

/**
 * O flashcard no palco do editor, na aba Flashcard: a frente e o verso lado a lado, como vão ficar, com o que
 * está no editor agora (ainda sem salvar). Mostrar os dois explica o que é um flashcard sem nenhuma frase. O
 * nome de cada lado leva a quem o edita: a frente, ao título; o verso, à aba Anotação, que é o verso.
 */
@Component({
  selector: 'app-flashcard-preview',
  imports: [IconModule, StudyCard, StudyCardBack],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="par" [class.ainda-nao]="!on()">
      <div class="lado">
        @if (on()) {
          <button type="button" class="rotulo-lado" (click)="editFront.emit()">
            Frente
            <lucide-icon [img]="EditIcon" [size]="13" aria-hidden="true" />
          </button>
        } @else {
          <span class="rotulo-lado">Frente</span>
        }
        <app-study-card class="carta-lado" [title]="title()" [subtitle]="front().subtitle" [image]="front().image" [stock]="stock()" [deck]="deck()" />
      </div>
      <div class="lado">
        @if (on() && canEditBack()) {
          <button type="button" class="rotulo-lado" (click)="editBack.emit()">
            Verso
            <lucide-icon [img]="EditIcon" [size]="13" aria-hidden="true" />
          </button>
        } @else {
          <span class="rotulo-lado">Verso</span>
        }
        <article appStudyBack class="carta-lado verso cartolina" [note]="note().id" [draft]="draft()" [still]="true" [fitMin]="0.75"></article>
      </div>
    </div>
  `,
  styleUrl: './flashcard-preview.scss',
})
export class FlashcardPreview {
  /** A anotação como está no editor: o verso sai dela, e o nome dela é a frente sem título próprio. */
  readonly note = input.required<Review>();
  /** A frente como está na aba. */
  readonly front = input.required<CardFront>();
  /** A cartolina de verdade da anotação (sem cor escolhida, a sorteada pelo id). */
  readonly stock = input.required<Stock>();
  readonly deck = input<CardDeck | null>(null);
  /** A anotação é (ou vai ser, ao salvar) um flashcard; ainda não sendo, os dois lados ficam apagados. */
  readonly on = input(false, { transform: booleanAttribute });
  /** Quem só lê uma compartilhada não tem a aba Anotação. */
  readonly canEditBack = input(true, { transform: booleanAttribute });

  readonly editFront = output<void>();
  readonly editBack = output<void>();

  protected readonly EditIcon = ICON.editar;

  protected readonly title = computed(() => this.front().title?.trim() || this.note().game.name.trim() || 'Sem nome');
  protected readonly draft = computed(() => ({ note: this.note(), front: this.front() }));
}
