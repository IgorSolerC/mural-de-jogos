import { ChangeDetectionStrategy, Component, computed, inject, input, signal } from '@angular/core';
import { ImageStore } from '../core/image-store';
import { ImageProblem, localImageUrl } from '../core/images';
import { Stock } from '../core/review';
import { lookKey } from '../core/category-looks';
import { CardFront, Deck, StudyCard as Card, SUBTITLE_MAX, TITLE_MAX, cleanFront, cleanImage, groupKey, inGroup, studyOnWall } from '../core/study';
import { StudyStore } from '../core/study-store';
import { Confirm } from './confirm';
import { ICON, IconModule } from './icons';
import { StudyCard } from './study-card';
import { StudyDeckPicker } from './study-deck-picker';
import { StudyReport } from './study-report';
import { Toasts } from './toast';

/**
 * A aba Flashcard do editor (PLANO-ESTUDOS.md, 6.5): a frente da carta (título, subtítulo e imagem), os
 * baralhos e se ela aparece no mural também, com a carta viva ao lado. Normalmente vazia: "Criar a frente"
 * faz da anotação uma carta. Nada muda até salvar a anotação (`apply`), como a parte Kanban.
 *
 * O título é opcional: vazio, a frente usa o nome da anotação (D8). A anotação que já estava no mural
 * continua lá ao virar carta (D4: nada some sem a pessoa mandar); a nascida de dentro dos Estudos segue os
 * baralhos ("Só nos Estudos", o padrão).
 *
 * Só os baralhos do grupo que está no editor valem (PLANO-ESTUDOS-GRUPOS.md). A carta guarda também os de
 * outro grupo em que ela dorme: trocado o grupo no editor, salvar sem escolher baralho do grupo novo deixa a
 * carta dormindo nos de antes; escolhendo, ela passa para os do grupo novo. Se o grupo novo tem um baralho
 * de mesmo nome que um dos dela (o "Kana" de cada grupo, como a conversão dos baralhos mistos cria), a carta
 * guardada ganha o botão "Pôr no Kana de Idiomas" (`offers`): um toque, nunca sozinho (a carta que já existia
 * dorme, G1). A Nova carta, que ainda não tem progresso, segue sozinha para ele (`twins`), como a anotação do
 * Kanban cai na coluna de mesmo nome; tirado à mão, ele não volta.
 */
@Component({
  selector: 'app-flashcard-tab',
  imports: [IconModule, StudyCard, StudyDeckPicker, StudyReport],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './flashcard-tab.html',
  styleUrl: './flashcard-tab.scss',
})
export class FlashcardTab {
  /** O nome da anotação (a frente sem título próprio usa ele). */
  readonly noteTitle = input('');
  /** A cartolina escolhida no editor: a moldura da carta sai dela. */
  readonly stock = input<Stock>('amarelo');
  /** O grupo da anotação, como está no editor agora. */
  readonly group = input<string | null>(null);

  protected readonly CardIcon = ICON.camadas;
  protected readonly ImageIcon = ICON.imagem;
  protected readonly TrashIcon = ICON.apagar;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly RestartIcon = ICON.recomecar;
  protected readonly titleMax = TITLE_MAX;
  protected readonly subtitleMax = SUBTITLE_MAX;

  private readonly study = inject(StudyStore);
  private readonly images = inject(ImageStore);
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);

  /** A anotação é (ou vai ser, ao salvar) uma carta. */
  readonly on = signal(false);
  protected readonly title = signal('');
  protected readonly subtitle = signal('');
  protected readonly image = signal('');
  /** Os baralhos escolhidos, com os de outro grupo em que a carta dorme (ver `live`). */
  readonly decks = signal<string[]>([]);
  /** Os escolhidos que valem: os que existem e são do grupo do editor, e os de mesmo nome que a carta segue. */
  protected readonly live = computed(() => [
    ...this.decks().filter((id) => {
      const d = this.study.deck(id);
      return !!d && inGroup(d, this.group());
    }),
    ...this.twins().map((d) => d.id),
  ]);
  /** O grupo da anotação quando o editor abriu (o salvo; na Nova carta, o do baralho): os gêmeos só vêm de uma troca feita aqui. */
  private readonly startGroup = signal<string | null>(null);
  /** Os gêmeos tirados à mão (pelo id): não voltam enquanto o editor está aberto. */
  private readonly declined = signal<ReadonlySet<string>>(new Set());
  /** Os baralhos do grupo do editor com o mesmo nome (sem acento nem caixa) que um dos escolhidos de outro grupo. */
  private readonly sameNamed = computed<Deck[]>(() => {
    const g = this.group();
    if (!this.on() || !groupKey(g)) return [];
    const chosen = new Set(this.decks());
    const out: Deck[] = [];
    for (const id of this.decks()) {
      const d = this.study.deck(id);
      if (!d || inGroup(d, g)) continue;
      const twin = this.study.decks().find((x) => inGroup(x, g) && lookKey(x.name) === lookKey(d.name) && !chosen.has(x.id));
      if (twin && !out.includes(twin)) out.push(twin);
    }
    return out;
  });
  /**
   * Na Nova carta (ainda sem progresso) com o grupo trocado no editor: os baralhos de mesmo nome do grupo
   * novo, que ela segue sozinha; os tirados à mão não voltam.
   */
  protected readonly twins = computed<Deck[]>(() => {
    if (!this.freshNote() || groupKey(this.group()) === groupKey(this.startGroup())) return [];
    const declined = this.declined();
    return this.sameNamed().filter((d) => !declined.has(d.id));
  });
  /** Na carta guardada fora dos baralhos: os de mesmo nome do grupo de agora, oferecidos num toque ("Pôr no Kana de Idiomas"). */
  protected readonly offers = computed<Deck[]>(() => (this.asleep().length ? this.sameNamed() : []));
  /** O que o seletor mostra: os escolhidos e os gêmeos. */
  protected readonly shownDecks = computed(() => [...this.decks(), ...this.twins().map((d) => d.id)]);
  /** A frase dos gêmeos: para onde a carta vai no grupo novo. */
  protected readonly twinText = computed(() => {
    const twins = this.twins();
    if (!twins.length) return '';
    const names = twins.map((d) => d.name);
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
    const what = names.length === 1 ? 'o baralho de mesmo nome' : 'os baralhos de mesmo nome';
    return `Em ${this.group()}, a carta vai para ${list}, ${what}.`;
  });

  /** "Pôr no Kana de Idiomas": a carta guardada passa para o baralho de mesmo nome do grupo de agora. */
  protected adopt(id: string): void {
    this.decks.set([...this.decks(), id]);
    this.missingDeck.set(false);
  }
  /** O "No mural" escolhido aqui (null: o que já vale). */
  private readonly wallChoice = signal<boolean | null>(null);
  /** Faltou o baralho ao salvar. */
  protected readonly missingDeck = signal(false);
  /** O que dizer quando falta: sem grupo, não há baralho para escolher. */
  protected readonly missingText = computed(() =>
    this.hasGroup() ? 'Escolha um baralho para a carta.' : 'Esta anotação não tem grupo: escolha um na aba Anotação.',
  );
  protected readonly imageProblem = signal('');
  protected readonly busy = signal(false);

  /** A carta como está guardada (null: a anotação ainda não é carta). */
  private card(): Card | null {
    return this.study.cardOf().get(this.noteId()) ?? null;
  }

  /** A carta valia em algum baralho quando o editor abriu (salvar sem nenhum do grupo novo a guarda). */
  private wasLive = false;
  /** Os baralhos guardados da carta quando o editor abriu (os de outro grupo também). */
  private readonly storedDecks = signal<string[]>([]);

  /** A anotação aberta no editor, e se ela é nova. */
  protected readonly noteId = signal('');
  private readonly freshNote = signal(true);

  /** A anotação tem grupo no editor (sem ele, não vira carta: cada baralho é de um grupo). */
  protected readonly hasGroup = computed(() => !!groupKey(this.group()));

  /**
   * Os baralhos de outro grupo em que a carta fica guardada (PLANO-ESTUDOS-GRUPOS.md, G1): a carta que já
   * existia, sem nenhum baralho do grupo do editor. Vazio quando ela vale em algum.
   */
  protected readonly asleep = computed(() => {
    if (!this.study.cardOf().get(this.noteId()) || this.live().length) return [];
    // tirado à mão o último baralho do grupo (com outro escondido, de outro grupo), falta o baralho: não dorme
    if (this.decks().join() !== this.storedDecks().join()) return [];
    return this.decks().flatMap((id) => this.study.deck(id) ?? []);
  });

  /** A frase da carta guardada: de onde ela saiu e como volta. */
  protected readonly asleepText = computed(() => {
    const decks = this.asleep();
    if (!decks.length) return '';
    const names = decks.map((d) => d.name);
    const list = names.length === 1 ? names[0] : `${names.slice(0, -1).join(', ')} e ${names[names.length - 1]}`;
    const groups = [...new Set(decks.map((d) => d.group ?? ''))];
    const to = names.length === 1 ? 'ao baralho' : 'aos baralhos';
    if (groups.length > 1) return `Fora de ${list} enquanto a anotação não for do grupo deles: o progresso fica guardado, e a carta volta a cada um se ela voltar ao grupo dele.`;
    return `Fora de ${list} enquanto a anotação não for de ${groups[0]}: o progresso fica guardado, e a carta volta ${to} se ela voltar ao grupo.`;
  });

  /** "No mural": o escolhido; senão o da carta; senão, para a anotação que já existia, sim; senão, o dos baralhos. */
  protected readonly wall = computed(() => {
    const chosen = this.wallChoice();
    if (chosen !== null) return chosen;
    // guardada fora dos baralhos, ela não está nos Estudos: a anotação fica no mural (G8)
    if (this.asleep().length) return true;
    const decks = this.study.decks();
    const card = this.study.cardOf().get(this.noteId());
    if (card && card.wall !== undefined) return card.wall;
    if (!this.freshNote() && !card) return true;
    return studyOnWall({ decks: this.live(), wall: undefined }, decks) ?? false;
  });

  /** A carta já foi respondida alguma vez: o boletim aparece. */
  protected readonly studied = computed(() => (this.study.cardOf().get(this.noteId())?.stats.seen ?? 0) > 0);

  /** "Recomeçar o progresso": a carta volta a Desconhecida, sem respostas (pergunta antes; vale na hora, com Desfazer). */
  protected async restart(): Promise<void> {
    const card = this.card();
    if (!card) return;
    const yes = await this.confirm.ask({
      title: 'Recomeçar o progresso?',
      text: `A carta volta a ser Desconhecida: as ${card.stats.seen === 1 ? 'uma resposta' : `${card.stats.seen} respostas`} dela saem, e ela entra de novo como nova.`,
      confirm: 'Recomeçar',
      cancel: 'Deixar',
      icon: ICON.recomecar,
    });
    if (!yes) return;
    const undo = this.study.resetCard(card.note);
    if (undo) this.toasts.show('O progresso da carta recomeçou', { label: 'Desfazer', run: undo });
  }

  /** O naipe da carta viva: o ícone do primeiro baralho. */
  /** O primeiro baralho escolhido: a carta viva no desenho dele. */
  protected readonly deck = computed(() => this.study.deck(this.live()[0] ?? '') ?? null);
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
    // os guardados, com os de outro grupo em que ela dorme (voltando ao grupo no editor, voltam a valer)
    const stored = this.study.state().cards.find((c) => c.note === id);
    this.decks.set(stored ? [...stored.decks] : pending ? [...pending.decks] : []);
    this.storedDecks.set(stored ? [...stored.decks] : []);
    this.wasLive = !!card?.decks.length;
    this.declined.set(new Set());
    // o grupo de partida: o salvo da anotação; na Nova carta, o do baralho pedido
    this.startGroup.set(isNew ? (pending?.decks.map((d) => this.study.deck(d)?.group).find((g) => !!g) ?? null) : (this.study.groupOf(id) ?? null));
    const asked = this.study.openFront() === id;
    if (asked) this.study.openFront.set(null);
    return !!pending || asked;
  }

  /** O que está escolhido, para o editor saber se algo mudou. */
  snapshot(): string {
    return JSON.stringify([this.on(), this.title().trim(), this.subtitle().trim(), this.image(), this.decks(), this.wallChoice()]);
  }

  /**
   * Pronta para salvar: sem carta, ou com pelo menos um baralho do grupo; ou a carta que já existia e
   * dorme (os baralhos dela são de outro grupo, e nenhum do grupo novo foi escolhido).
   */
  valid(): boolean {
    const ok = !this.on() || this.live().length > 0 || this.asleep().length > 0;
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
    const mine = this.study.decks().filter((d) => inGroup(d, this.group()));
    const lastDeck = last ? this.study.deck(last) : undefined;
    if (!this.decks().length && lastDeck && inGroup(lastDeck, this.group())) this.decks.set([lastDeck.id]);
    else if (!this.decks().length && mine.length === 1) this.decks.set([mine[0].id]);
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

  /** O seletor mudou os baralhos (com os gêmeos à mostra): o gêmeo que saiu fica recusado; os que ficaram, escolhidos. */
  protected setDecks(decks: string[]): void {
    const out = this.twins().filter((d) => !decks.includes(d.id));
    if (out.length) this.declined.update((s) => new Set([...s, ...out.map((d) => d.id)]));
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
   * baralhos; a que já existia, virando carta, continua no mural (a escolha vai guardada). Devolve, quando
   * esta gravação guardou a carta fora dos baralhos (o grupo mudou), de onde ela saiu, para o aviso.
   */
  apply(id: string): { decks: string[]; group: string } | null {
    const card = this.study.cardOf().get(id);
    this.decksBefore = card?.decks ?? [];
    if (!this.on()) {
      if (card) this.study.removeCard(id);
      this.study.pending.set(null);
      return null;
    }
    const decks = this.live();
    const asleep = this.asleep();
    const slept = this.wasLive && !!card && !decks.length && asleep.length ? { decks: asleep.map((d) => d.name), group: asleep[0].group ?? '' } : null;
    // a que já existia e dorme (nenhum baralho do grupo novo): fica nos de antes, com a frente nova
    if (!decks.length && !card) return null;
    const front: CardFront = cleanFront({ title: this.title(), subtitle: this.subtitle(), image: this.image() });
    const chosen = this.wallChoice();
    const byDecks = studyOnWall({ decks, wall: undefined }, this.study.decks()) ?? false;
    if (card) {
      if (JSON.stringify(cleanFront(card.front)) !== JSON.stringify(front)) this.study.updateFront(id, front);
      if (decks.length && card.decks.join() !== decks.join()) this.study.setDecks(id, decks);
      if (chosen !== null && chosen !== (card.wall ?? byDecks)) this.study.setWall(id, chosen === byDecks ? undefined : chosen);
    } else {
      // a escolha igual à dos baralhos não é guardada (segue os baralhos); a anotação que já existia guarda "no mural"
      const fresh = this.freshNote();
      const wall = chosen ?? (fresh ? undefined : true);
      this.study.addCard(id, decks, front, wall === undefined || (fresh && wall === byDecks) ? undefined : wall);
    }
    if (decks.length) this.study.lastDeck.set(decks[0]);
    this.study.pending.set(null);
    return slept;
  }

  /** Os baralhos da carta antes do último `apply`. */
  private decksBefore: readonly string[] = [];

  /** O último `apply` pôs a anotação privada num baralho público (ver ui/public-deck-nudge.ts). */
  enteredPublicDeck(id: string): boolean {
    return this.study.privateInPublic(id, this.decksBefore);
  }
}
