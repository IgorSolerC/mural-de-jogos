import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ImageStore } from '../core/image-store';
import { ImageProblem, localImageUrl } from '../core/images';
import { Stock } from '../core/review';
import { CardFront, StudyCard as Card, SUBTITLE_MAX, TITLE_MAX, cleanFront, cleanImage, studyOnWall } from '../core/study';
import { StudyStore } from '../core/study-store';
import { Confirm } from './confirm';
import { ICON, IconModule } from './icons';
import { StudyCard } from './study-card';
import { StudyDeckPicker } from './study-deck-picker';

/**
 * A aba Flashcard do editor (PLANO-ESTUDOS.md, 6.5): a frente da carta (título, subtítulo e imagem), os
 * baralhos e se ela aparece no mural também, com a carta viva ao lado. Normalmente vazia: "Criar a frente"
 * faz da anotação uma carta. Nada muda até salvar a anotação (`apply`), como a parte Kanban.
 *
 * O título é opcional: vazio, a frente usa o nome da anotação (D8). A anotação que já estava no mural
 * continua lá ao virar carta (D4: nada some sem a pessoa mandar); a nascida de dentro dos Estudos segue os
 * baralhos ("Só nos Estudos", o padrão).
 */
@Component({
  selector: 'app-flashcard-tab',
  imports: [IconModule, StudyCard, StudyDeckPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flashcard-tab.html',
  styleUrl: './flashcard-tab.scss',
})
export class FlashcardTab {
  /** O nome da anotação (a frente sem título próprio usa ele). */
  readonly noteTitle = input('');
  /** A cartolina escolhida no editor: a moldura da carta sai dela. */
  readonly stock = input<Stock>('amarelo');

  protected readonly CardIcon = ICON.camadas;
  protected readonly ImageIcon = ICON.imagem;
  protected readonly TrashIcon = ICON.apagar;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly titleMax = TITLE_MAX;
  protected readonly subtitleMax = SUBTITLE_MAX;

  private readonly study = inject(StudyStore);
  private readonly images = inject(ImageStore);
  private readonly confirm = inject(Confirm);

  /** A anotação é (ou vai ser, ao salvar) uma carta. */
  readonly on = signal(false);
  protected readonly title = signal('');
  protected readonly subtitle = signal('');
  protected readonly image = signal('');
  readonly decks = signal<string[]>([]);
  /** O "No mural" escolhido aqui (null: o que já vale). */
  private readonly wallChoice = signal<boolean | null>(null);
  /** Faltou o baralho ao salvar. */
  protected readonly missingDeck = signal(false);
  protected readonly imageProblem = signal('');
  protected readonly busy = signal(false);

  /** A carta como está guardada (null: a anotação ainda não é carta). */
  private card(): Card | null {
    return this.study.cardOf().get(this.noteId()) ?? null;
  }

  /** A anotação aberta no editor, e se ela é nova. */
  private readonly noteId = signal('');
  private readonly freshNote = signal(true);

  /** "No mural": o escolhido; senão o da carta; senão, para a anotação que já existia, sim; senão, o dos baralhos. */
  protected readonly wall = computed(() => {
    const chosen = this.wallChoice();
    if (chosen !== null) return chosen;
    const decks = this.study.decks();
    const card = this.study.cardOf().get(this.noteId());
    if (card && card.wall !== undefined) return card.wall;
    if (!this.freshNote() && !card) return true;
    return studyOnWall({ decks: this.decks(), wall: undefined }, decks) ?? false;
  });

  /** O naipe da carta viva: o ícone do primeiro baralho. */
  protected readonly suit = computed(() => this.study.deck(this.decks()[0] ?? '')?.icon ?? null);
  protected readonly previewTitle = computed(() => this.title().trim() || this.noteTitle().trim() || 'Sem nome');

  /**
   * O editor abriu (`id`, nova ou não): a carta como está, ou a pedida de dentro de um baralho, ou nada.
   * Devolve se a aba deve abrir sozinha (a "Nova carta" e o "Editar a frente").
   */
  reset(id: string, isNew: boolean): boolean {
    this.noteId.set(id);
    this.freshNote.set(isNew);
    this.wallChoice.set(null);
    this.missingDeck.set(false);
    this.imageProblem.set('');
    const card = this.card();
    const pending = isNew ? this.study.pending() : null;
    this.on.set(!!card || !!pending);
    this.title.set(card?.front.title ?? '');
    this.subtitle.set(card?.front.subtitle ?? '');
    this.image.set(card?.front.image ?? '');
    this.decks.set(card ? [...card.decks] : pending ? [...pending.decks] : []);
    const asked = this.study.openFront() === id;
    if (asked) this.study.openFront.set(null);
    return !!pending || asked;
  }

  /** O que está escolhido, para o editor saber se algo mudou. */
  snapshot(): string {
    return JSON.stringify([this.on(), this.title().trim(), this.subtitle().trim(), this.image(), this.decks(), this.wallChoice()]);
  }

  /** Pronta para salvar: sem carta, ou com pelo menos um baralho. */
  valid(): boolean {
    const ok = !this.on() || this.decks().some((d) => !!this.study.deck(d));
    this.missingDeck.set(!ok);
    return ok;
  }

  /** A carta nova que fica só nos Estudos: o editor não pergunta pelo grupo nem pela tag (servem ao mural). */
  studyOnly(): boolean {
    return this.on() && this.freshNote() && !this.wall();
  }

  /** "Criar a frente": a anotação vira carta, com o último baralho usado (se ainda existir). */
  protected start(): void {
    const last = this.study.lastDeck();
    this.on.set(true);
    if (!this.decks().length && last && this.study.deck(last)) this.decks.set([last]);
    else if (!this.decks().length && this.study.decks().length === 1) this.decks.set([this.study.decks()[0].id]);
  }

  /** "Deixar de ser carta": vale ao salvar; a que já tinha progresso pergunta antes. */
  protected async stop(): Promise<void> {
    const card = this.card();
    if (card?.stats.seen) {
      const yes = await this.confirm.ask({
        title: 'Tirar dos Estudos?',
        text: `Ela já foi vista ${card.stats.seen === 1 ? '1 vez' : `${card.stats.seen} vezes`}; o progresso sai junto ao salvar. A anotação continua.`,
        confirm: 'Tirar dos Estudos',
        cancel: 'Deixar',
        icon: ICON.apagar,
      });
      if (!yes) return;
    }
    this.on.set(false);
  }

  protected setDecks(decks: string[]): void {
    this.decks.set(decks);
    if (decks.length) this.missingDeck.set(false);
  }

  protected setWall(wall: boolean): void {
    this.wallChoice.set(wall);
  }

  /** A imagem por link: só https vale (ver `cleanImage`). */
  protected setLink(value: string): void {
    const v = value.trim();
    if (!v) return;
    const ok = cleanImage(v);
    this.imageProblem.set(ok ? '' : 'O link precisa começar com https://');
    if (ok) this.image.set(ok);
  }

  /** A imagem do aparelho (escolhida ou colada): encolhida e guardada como as coladas no texto. */
  protected async useFile(file: Blob | undefined | null): Promise<void> {
    if (!file || !file.type.startsWith('image/')) return;
    this.busy.set(true);
    this.imageProblem.set('');
    try {
      const stored = await this.images.add(file);
      this.image.set(localImageUrl(stored.id));
    } catch (e) {
      this.imageProblem.set(e instanceof ImageProblem ? e.message : 'Essa imagem não abriu. Tente outra.');
    } finally {
      this.busy.set(false);
    }
  }

  protected onPaste(e: ClipboardEvent): void {
    const file = [...(e.clipboardData?.files ?? [])].find((f) => f.type.startsWith('image/'));
    if (!file) return;
    e.preventDefault();
    void this.useFile(file);
  }

  protected setTitle(v: string): void {
    this.title.set(v);
  }

  protected setSubtitle(v: string): void {
    this.subtitle.set(v);
  }

  protected clearImage(): void {
    this.image.set('');
  }

  /**
   * Salvou a anotação `id`: a carta como ficou aqui. A nova anotação de dentro dos Estudos segue os
   * baralhos; a que já existia, virando carta, continua no mural (a escolha vai guardada).
   */
  apply(id: string): void {
    const card = this.study.cardOf().get(id);
    if (!this.on()) {
      if (card) this.study.removeCard(id);
      this.study.pending.set(null);
      return;
    }
    const decks = this.decks().filter((d) => !!this.study.deck(d));
    if (!decks.length) return;
    const front: CardFront = cleanFront({ title: this.title(), subtitle: this.subtitle(), image: this.image() });
    const chosen = this.wallChoice();
    const byDecks = studyOnWall({ decks, wall: undefined }, this.study.decks()) ?? false;
    if (card) {
      if (JSON.stringify(cleanFront(card.front)) !== JSON.stringify(front)) this.study.updateFront(id, front);
      if (card.decks.join() !== decks.join()) this.study.setDecks(id, decks);
      if (chosen !== null && chosen !== (card.wall ?? byDecks)) this.study.setWall(id, chosen === byDecks ? undefined : chosen);
    } else {
      // a escolha igual à dos baralhos não é guardada (segue os baralhos); a anotação que já existia guarda "no mural"
      const fresh = this.freshNote();
      const wall = chosen ?? (fresh ? undefined : true);
      this.study.addCard(id, decks, front, wall === undefined || (fresh && wall === byDecks) ? undefined : wall);
    }
    this.study.lastDeck.set(decks[0]);
    this.study.pending.set(null);
  }
}
