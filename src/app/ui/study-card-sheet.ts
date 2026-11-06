import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, viewChild } from '@angular/core';
import { ReviewStore } from '../core/review-store';
import { LEVEL_LABEL, levelOf, studyOnWall } from '../core/study';
import { StudyStore } from '../core/study-store';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';
import { StudyDeckPicker } from './study-deck-picker';
import { StudyReport } from './study-report';
import { PublicDeckNudge } from './public-deck-nudge';
import { Toasts } from './toast';

/**
 * A folha de uma carta dos Estudos (PLANO-ESTUDOS.md, 6.6): a etiqueta de preço da carta na parede do
 * baralho, ou a linha da carta na leitura. A mesma ficha da folha do Kanban (ui/kanban-card-sheet.ts):
 * os baralhos, "No mural" e uma linha do nível e de quando ela volta; no pé, tirar dos Estudos (com
 * Desfazer), editar a frente (o editor na aba Flashcard) e ler a anotação. Vale na hora.
 */
@Component({
  selector: 'app-study-card-sheet',
  imports: [BackdropClose, IconModule, Pin, StudyDeckPicker, StudyReport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet ficha-quadro ficha-carta" aria-labelledby="fc-titulo-folha" (close)="onClosed()" (backdropClose)="close()">
      @if (data(); as d) {
        <div class="ficha cartolina" [style.--stock]="'var(--stock-' + d.stock + ')'" [attr.data-cor]="d.stock">
          <app-pin class="pin" />
          <header class="head">
            <div class="titulos">
              <h2 id="fc-titulo-folha">{{ d.name }}</h2>
              <p class="sub"><lucide-icon [img]="CardsIcon" [size]="14" aria-hidden="true" />Carta dos Estudos · {{ d.level }}</p>
            </div>
            <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
              <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
            </button>
          </header>

          <div class="body">
            <div class="linha">
              <span class="nome"><lucide-icon [img]="CardsIcon" [size]="16" aria-hidden="true" />Baralhos</span>
              <app-study-deck-picker class="valor" [decks]="d.card.decks" [group]="d.group" (decksChange)="setDecks($event)" />
            </div>
            <div class="linha">
              <span class="nome" id="fc-mural-folha"><lucide-icon [img]="WallIcon" [size]="16" aria-hidden="true" />No mural</span>
              <div class="valor mural">
                <button type="button" class="interruptor" role="switch" [attr.aria-checked]="d.onWall" aria-labelledby="fc-mural-folha" (click)="setWall(!d.onWall)">
                  <span class="bolinha"></span>
                </button>
                <span class="mural-txt" [class.forte]="!d.onWall">{{ d.onWall ? 'Aparece no mural também' : 'Só nos Estudos' }}</span>
              </div>
            </div>
            <div class="linha">
              <span class="nome"><lucide-icon [img]="ClockIcon" [size]="16" aria-hidden="true" />Boletim</span>
              <app-study-report class="valor" [note]="d.card.note" />
            </div>
          </div>

          <footer class="foot">
            <button type="button" class="papel perigo" (click)="remove()">
              <lucide-icon [img]="OutIcon" [size]="16" aria-hidden="true" />
              Tirar dos Estudos
            </button>
            <div class="actions">
              <button type="button" class="papel" (click)="editFront()">
                <lucide-icon [img]="EditIcon" [size]="16" aria-hidden="true" />
                Editar a frente
              </button>
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
  styleUrls: ['./kanban-card-sheet.scss', './study-card-sheet.scss'],
})
export class StudyCardSheet {
  readonly noteId = input.required<string>();
  readonly closed = output<void>();
  /** Ler a anotação: a folha fecha e quem abriu mostra a leitura. */
  readonly reading = output<string>();
  /** Editar a frente: a folha fecha e quem abriu abre o editor na aba Flashcard. */
  readonly editing = output<string>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly CardsIcon = ICON.camadas;
  protected readonly WallIcon = ICON.publica;
  protected readonly ClockIcon = ICON.historico;
  protected readonly OutIcon = ICON.tirar;
  protected readonly EditIcon = ICON.editar;
  protected readonly ReadIcon = ICON.livros;

  private readonly study = inject(StudyStore);
  private readonly store = inject(ReviewStore);
  private readonly toasts = inject(Toasts);
  private readonly publicDeckNudge = inject(PublicDeckNudge);
  /** Os baralhos ao abrir: o aviso da carta privada num baralho público compara com eles ao fechar. */
  private decksAtOpen: readonly string[] = [];
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly data = computed(() => {
    const card = this.study.cardOf().get(this.noteId());
    const note = this.store.get(this.noteId());
    if (!card || !note) return null;
    const level = LEVEL_LABEL[levelOf(card.srs)];
    return {
      card,
      name: note.game.name,
      // o grupo da anotação: só os baralhos dele (ver ui/study-deck-picker.ts)
      group: note.category ?? null,
      stock: note.stock ?? 'amarelo',
      level,
      onWall: studyOnWall(card, this.study.decks()) ?? true,
    };
  });

  constructor() {
    afterNextRender(() => {
      this.decksAtOpen = this.study.cardOf().get(this.noteId())?.decks ?? [];
      const el = this.dialog().nativeElement;
      el.showModal();
      el.querySelector<HTMLElement>('.fecha')?.focus();
    });
  }

  /** Fechou: o aviso só agora, porque o bilhete fica atrás da folha aberta e ninguém alcançaria o botão. */
  protected onClosed(): void {
    this.publicDeckNudge.afterEntering(this.noteId(), this.decksAtOpen);
    this.closed.emit();
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }

  protected setDecks(decks: string[]): void {
    if (!decks.length) {
      this.remove();
      return;
    }
    this.study.setDecks(this.noteId(), decks);
  }

  /** "No mural": a escolha igual à dos baralhos não é guardada (a carta volta a seguir os baralhos). */
  protected setWall(wall: boolean): void {
    const card = this.study.cardOf().get(this.noteId());
    if (!card) return;
    const byDecks = studyOnWall({ decks: card.decks, wall: undefined }, this.study.decks()) ?? false;
    this.study.setWall(this.noteId(), wall === byDecks ? undefined : wall);
  }

  protected remove(): void {
    const name = this.data()?.name ?? '';
    const undo = this.study.removeCard(this.noteId());
    this.close();
    if (undo) this.toasts.show(`“${name}” saiu dos Estudos`, { label: 'Desfazer', run: undo });
  }

  protected editFront(): void {
    this.study.openFront.set(this.noteId());
    this.close();
    this.editing.emit(this.noteId());
  }

  protected read(): void {
    this.close();
    this.reading.emit(this.noteId());
  }
}
