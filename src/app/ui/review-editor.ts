import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  inject,
  output,
  signal,
  viewChild,
} from '@angular/core';
import { Bookmark, LucideAngularModule, Pin as PinIcon, RefreshCw, Trash2, X } from 'lucide-angular';
import {
  Bonus,
  Difficulty,
  Draft,
  Kind,
  PickedGame,
  Rated,
  RatedKey,
  Review,
  SCORE_LABEL,
  STOCKS,
  STOCK_LABEL,
  Status,
  NO_DAY_LABEL,
  Stock,
  Verdict,
  Weight,
  Weights,
  Wish,
  computeFinal,
  counts,
  formatScore,
  formatShift,
  weightOf,
  dayLabel,
  isValidDay,
  newId,
  todayISO,
} from '../core/review';
import { GameLookup, LookupError, isSteamCover } from '../core/game-lookup';
import { g, profileOf } from '../core/kinds';
import { Mural } from '../core/mural';
import { ReviewStore } from '../core/review-store';
import { CoverSource, Settings } from '../core/settings';
import { pinningFor } from '../core/wall-physics';
import { BonusPicker } from './bonus';
import { CoverSleeve } from './cover-sleeve';
import { DifficultyPicker } from './difficulty';
import { GameSearch } from './game-search';
import { JudgeLabel } from './judge-label';
import { Pin } from './pin';
import { ReviewCard } from './review-card';
import { ScorePicker } from './score-picker';
import { StatusPicker } from './status-picker';
import { VerdictPicker } from './verdict';

export interface SavedEvent {
  id: string;
  isNew: boolean;
}

@Component({
  selector: 'app-review-editor',
  imports: [
    LucideAngularModule,
    BonusPicker,
    CoverSleeve,
    DifficultyPicker,
    GameSearch,
    JudgeLabel,
    Pin,
    ReviewCard,
    ScorePicker,
    StatusPicker,
    VerdictPicker,
  ],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './review-editor.html',
  styleUrl: './review-editor.scss',
})
export class ReviewEditor {
  protected readonly store = inject(ReviewStore);
  private readonly mural = inject(Mural);
  private readonly lookup = inject(GameLookup);
  protected readonly settings = inject(Settings);
  readonly saved = output<SavedEvent>();
  /** Guardou só o jogo (nome e capa) para resenhar depois. */
  readonly drafted = output<SavedEvent>();
  /** Pediu para tirar o pendente da fila. */
  readonly draftRemoved = output<string>();
  /** Pediu para tirar o desejo da wishlist. */
  readonly wishRemoved = output<string>();

  protected readonly CloseIcon = X;
  protected readonly LaterIcon = Bookmark;
  protected readonly TrashIcon = Trash2;
  protected readonly SwapIcon = RefreshCw;
  protected readonly PinIcon = PinIcon;
  protected readonly labels = SCORE_LABEL;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly search = viewChild(GameSearch);
  private readonly bonusPicker = viewChild(BonusPicker);

  protected readonly id = signal(newId());
  protected readonly editing = signal<Review | null>(null);
  /** O pendente que está sendo terminado, se a ficha veio da fila. */
  protected readonly fromDraft = signal<Draft | null>(null);
  /** O desejo da wishlist que virou resenha, se a ficha veio de lá. */
  protected readonly fromWish = signal<Wish | null>(null);
  /** O mural da ficha: o aberto, para uma ficha nova; o dela, para uma que já existe. */
  protected readonly kind = signal<Kind>('jogos');
  protected readonly profile = computed(() => profileOf(this.kind()));
  /** As quatro notas do mural, na ordem do boletim. */
  protected readonly categories = computed<RatedKey[]>(() => this.profile().categories.map((c) => c.key));
  /** "o jogo", "uma série": as palavras do editor no gênero do mural. */
  protected readonly words = computed(() => {
    const p = this.profile();
    return { o: `${g(p, 'o', 'a')} ${p.singular}`, um: `${g(p, 'um', 'uma')} ${p.singular}` };
  });
  protected readonly game = signal<PickedGame | null>(null);
  protected readonly scores = signal<Rated>({});
  protected readonly weights = signal<Weights>({});
  protected readonly bonuses = signal<Bonus[]>([]);
  /** A média se atualiza enquanto as notas, os pesos e os bônus mudam. */
  protected readonly final = computed(() => computeFinal(this.kind(), this.scores(), this.weights(), this.bonuses()));
  /** Só as notas, sem os bônus: a conta ao lado da estrela mostra quanto eles mexeram. */
  protected readonly base = computed(() => computeFinal(this.kind(), this.scores(), this.weights()));
  protected readonly shift = computed(() => {
    const f = this.final();
    const b = this.base();
    return f === null || b === null ? '' : formatShift(f - b);
  });
  protected readonly fmt = formatScore;
  protected readonly weightOf = weightOf;
  protected readonly isSteamCover = isSteamCover;
  protected readonly hours = signal('');
  /** A quantidade do mural (horas, páginas); null se vazia ou se o mural não tem; NaN se não é número. */
  protected readonly hoursValue = computed(() => {
    const a = this.profile().amount;
    const raw = this.hours().trim().replace(',', '.');
    if (!a || !raw) return null;
    const n = Number(raw);
    if (!Number.isFinite(n) || n < 0 || n > 99999 || (!a.decimals && !Number.isInteger(n))) return NaN;
    return Math.round(n * 10) / 10;
  });
  protected readonly hoursValid = computed(() => !Number.isNaN(this.hoursValue()));
  protected readonly coverLoading = signal<CoverSource | null>(null);
  protected readonly coverError = signal<string | null>(null);
  private coverAbort: AbortController | undefined;
  protected readonly status = signal<Status | null>(null);
  protected readonly verdict = signal<Verdict | null>(null);
  protected readonly completedAt = signal(todayISO());
  /** Jogou faz tanto tempo que não lembra o dia: a resenha fica sem data e vai para o fim da ordem por data. */
  protected readonly dateUnknown = signal(false);
  protected readonly noDay = NO_DAY_LABEL;
  protected readonly today = signal(todayISO());
  protected readonly dateLabel = computed(() => (this.status() ? dayLabel(this.kind(), this.status()!) : 'Data'));
  protected readonly dateValid = computed(
    () => this.dateUnknown() || (isValidDay(this.completedAt()) && this.completedAt() <= this.today()),
  );
  protected readonly difficulty = signal<Difficulty>('nenhuma');
  protected readonly text = signal('');
  protected readonly attempted = signal(false);
  protected readonly confirmingDiscard = signal(false);
  /** Já tem nota ou texto e a pessoa pediu para guardar só o jogo: confirma antes de perder. */
  protected readonly confirmingDraft = signal(false);
  /** Tirar da fila (ou da wishlist) com notas e texto já escritos: pergunta antes, o Desfazer não traz a resenha. */
  protected readonly confirmingRemove = signal(false);
  protected readonly draftError = signal(false);
  protected readonly searchSeed = signal('');

  /** A ficha em branco já nasce com uma cor sorteada; a pessoa troca pela que quiser. */
  protected readonly stock = signal<Stock>('amarelo');
  protected readonly stocks = STOCKS;
  protected readonly stockLabels = STOCK_LABEL;
  protected readonly pin = computed(() => pinningFor(this.id(), this.stock()));
  protected readonly library = computed(() => this.store.customBonuses()[this.kind()]);

  /** No celular a prévia é a ficha simples, que cabe no alto da tela sem empurrar o formulário. */
  protected readonly phone = signal(false);

  /** A ficha como ela vai para o mural, montada com o que já foi preenchido. */
  protected readonly preview = computed<Review>(() => {
    return {
      id: this.id(),
      kind: this.kind(),
      // sem jogo, a capa mostra um ponto de interrogação e o nome fica só marcado (ReviewCard.empty)
      game: this.game() ?? { name: '', coverUrl: null, source: 'manual' },
      // sem nota ainda, a etiqueta mostra o tracinho
      scores: { final: this.final() as number, ...this.counted() },
      status: this.status() ?? 'finalizado',
      difficulty: this.difficulty(),
      verdict: this.verdict(),
      weights: this.weights(),
      bonuses: this.bonuses(),
      hoursPlayed: this.hoursValid() ? this.hoursValue() : null,
      stock: this.stock(),
      text: this.text(),
      completedAt: this.dateUnknown() ? null : this.dateValid() ? this.completedAt() : this.today(),
      createdAt: '',
      updatedAt: '',
    };
  });

  constructor() {
    const mq = matchMedia('(max-width: 699px)');
    const sync = () => this.phone.set(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    inject(DestroyRef).onDestroy(() => mq.removeEventListener('change', sync));
  }

  /** As notas como vão para a ficha: a categoria que "não tem" vai sem nota. */
  private readonly counted = computed<Rated>(() => {
    const w = this.weights();
    const s = this.scores();
    return Object.fromEntries(this.categories().map((k) => [k, counts(w, k) ? (s[k] ?? null) : null]));
  });

  protected readonly missingScores = computed(() =>
    this.categories().filter((k) => counts(this.weights(), k) && (this.scores()[k] ?? null) === null),
  );

  /** Todas as categorias como "Não tem": sem nota que conte, não há média para pregar. */
  protected readonly noneCounts = computed(() => this.categories().every((k) => !counts(this.weights(), k)));

  protected readonly missing = computed(() => {
    const m: string[] = [];
    if (!this.game()) m.push(this.words().o);
    const scores = this.missingScores().map((k) => SCORE_LABEL[k]);
    if (scores.length === 1) m.push(`a nota de ${scores[0]}`);
    else if (scores.length > 1) m.push(`as notas de ${scores.slice(0, -1).join(', ')} e ${scores.at(-1)}`);
    else if (this.noneCounts()) m.push('ao menos uma categoria que conte na média');
    if (!this.status()) m.push('o status');
    if (!this.dateValid()) m.push('uma data válida');
    if (!this.hoursValid()) m.push(this.profile().amount?.missing ?? '');
    return m;
  });

  protected readonly missingText = computed(() => {
    const m = this.missing();
    if (!m.length) return '';
    const list = m.length > 1 ? `${m.slice(0, -1).join(', ')} e ${m.at(-1)}` : m[0];
    return `Falta escolher ${list}.`;
  });

  private snapshot = '';

  open(review?: Review, draft?: Draft, wish?: Wish): void {
    const kind = review?.kind ?? draft?.kind ?? wish?.kind ?? this.mural.kind();
    this.kind.set(kind);
    this.editing.set(review ?? null);
    this.fromDraft.set(review ? null : (draft ?? null));
    this.fromWish.set(review || draft ? null : (wish ?? null));
    // O pendente (ou o desejo) vira a resenha com o mesmo id.
    this.id.set(review?.id ?? draft?.id ?? wish?.id ?? newId());
    this.stock.set(review?.stock ?? this.store.nextStock(kind));
    this.game.set(review?.game ?? draft?.game ?? wish?.game ?? null);
    const { final: _final, ...rated } = review?.scores ?? { final: 0 };
    this.scores.set(rated);
    this.status.set(review?.status ?? null);
    this.verdict.set(review?.verdict ?? null);
    this.today.set(todayISO());
    this.completedAt.set(review?.completedAt ?? todayISO());
    this.dateUnknown.set(review?.completedAt === null);
    this.difficulty.set(review?.difficulty ?? 'nenhuma');
    this.weights.set({ ...(review?.weights ?? {}) });
    this.bonuses.set([...(review?.bonuses ?? [])]);
    this.bonusPicker()?.reset();
    this.hours.set(review?.hoursPlayed === null || review?.hoursPlayed === undefined ? '' : String(review.hoursPlayed).replace('.', ','));
    this.coverAbort?.abort();
    this.coverLoading.set(null);
    this.coverError.set(null);
    this.text.set(review?.text ?? '');
    this.searchSeed.set('');
    // a busca que ficou aberta da última vez (talvez de outro mural) volta vazia
    this.search()?.reset();
    this.attempted.set(false);
    this.confirmingDiscard.set(false);
    this.confirmingDraft.set(false);
    this.confirmingRemove.set(false);
    this.draftError.set(false);
    this.snapshot = this.serialize();
    const dialog = this.dialog().nativeElement;
    // O diálogo é sempre o mesmo: sem isso, abre rolado onde a resenha anterior ficou
    const toTop = () => {
      dialog.scrollTop = 0;
      dialog.querySelector('.body')?.scrollTo({ top: 0, behavior: 'instant' });
    };
    toTop();
    dialog.showModal();
    toTop();
    // e de novo depois que o conteúdo da resenha nova desenhar (e o foco ir para a busca)
    requestAnimationFrame(toTop);
    if (!review && !draft) queueMicrotask(() => this.search()?.focus());
  }

  protected pick(game: PickedGame): void {
    this.coverAbort?.abort();
    this.coverLoading.set(null);
    this.game.set(game);
    this.coverError.set(null);
    this.draftError.set(false);
    // Achou na RAWG: tenta logo a capa da Steam, que tem o título.
    if (game.source === 'rawg') void this.useCover('rawg', true);
  }

  /** Na RAWG, dá para pedir a capa da Steam se a atual ainda é a arte de fundo. */
  protected canUpgrade(g: PickedGame): boolean {
    return g.source === 'rawg' && !isSteamCover(g.coverUrl) && this.settings.hasRawg();
  }

  protected setWeight(k: RatedKey, w: Weight): void {
    this.weights.update((cur) => {
      const next = { ...cur };
      if (w === 'normal') delete next[k];
      else next[k] = w;
      return next;
    });
  }

  /**
   * Troca a capa pela da outra fonte, procurando o mesmo jogo lá. Na própria RAWG, só tenta a capa
   * da Steam; `quiet` não reclama se ela não existir (é a tentativa automática ao escolher o jogo).
   */
  protected async useCover(source: CoverSource, quiet = false): Promise<void> {
    const game = this.game();
    if (!game || this.coverLoading()) return;
    const upgradeOnly = game.source === source;
    if (upgradeOnly && !this.canUpgrade(game)) return;
    this.coverAbort?.abort();
    const ctrl = new AbortController();
    this.coverAbort = ctrl;
    this.coverLoading.set(source);
    this.coverError.set(null);
    try {
      if (upgradeOnly) {
        const found = await this.lookup.withSteamCover(game, ctrl.signal);
        if (ctrl.signal.aborted) return;
        if (isSteamCover(found.coverUrl)) this.game.set(found);
        else if (!quiet) this.coverError.set('Esse jogo não tem capa na Steam. Ficou a arte da RAWG.');
        return;
      }
      const found = await this.lookup.findCover(game, source, ctrl.signal);
      if (ctrl.signal.aborted) return;
      if (found) this.game.set(found);
      else this.coverError.set(`Não achei capa desse jogo na ${source === 'rawg' ? 'RAWG' : 'Wikipedia'}.`);
    } catch (e) {
      if (ctrl.signal.aborted || (e as Error).name === 'AbortError') return;
      this.coverError.set(e instanceof LookupError ? e.message : 'Não consegui trocar a capa agora.');
    } finally {
      if (!ctrl.signal.aborted) this.coverLoading.set(null);
    }
  }

  protected swapGame(): void {
    this.coverAbort?.abort();
    this.coverLoading.set(null);
    this.searchSeed.set(this.game()?.name ?? '');
    this.game.set(null);
    setTimeout(() => this.search()?.focus());
  }

  protected save(e: Event): void {
    e.preventDefault();
    this.attempted.set(true);
    const game = this.game();
    const final = this.final();
    const status = this.status();
    if (!game || final === null || this.missingScores().length || !status || !this.dateValid() || !this.hoursValid()) {
      this.focusFirstMissing();
      return;
    }
    const now = new Date().toISOString();
    const prev = this.editing();
    const review: Review = {
      id: this.id(),
      kind: this.kind(),
      game,
      scores: { final, ...this.counted() },
      weights: this.weights(),
      bonuses: this.bonuses(),
      hoursPlayed: this.hoursValue(),
      status,
      difficulty: this.profile().difficulty ? this.difficulty() : 'nenhuma',
      verdict: this.verdict(),
      stock: this.stock(),
      text: this.text().trim(),
      completedAt: this.dateUnknown() ? null : this.completedAt(),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    if (prev) this.store.update(review);
    else this.store.add(review);
    const draft = this.fromDraft();
    if (draft) this.store.removeDraft(draft.id, false);
    const wish = this.fromWish();
    if (wish) this.store.removeWish(wish.id, false);
    this.snapshot = this.serialize();
    this.dialog().nativeElement.close();
    this.saved.emit({ id: review.id, isNew: !prev });
  }

  /** Guarda só o nome e a capa, fora do mural, para terminar a resenha depois. */
  protected saveForLater(): void {
    const game = this.game();
    if (!game) {
      this.draftError.set(true);
      setTimeout(() => this.search()?.focus());
      return;
    }
    if (this.hasReviewContent() && !this.confirmingDraft()) {
      this.confirmingDraft.set(true);
      return;
    }
    const now = new Date().toISOString();
    const prev = this.fromDraft();
    this.store.saveDraft({ id: this.id(), kind: this.kind(), game, createdAt: prev?.createdAt ?? now, updatedAt: now });
    // da wishlist para a fila: o desejo sai de lá com o mesmo id, sem ficar marcado como apagado
    const wish = this.fromWish();
    if (wish) this.store.removeWish(wish.id, false);
    this.snapshot = this.serialize();
    this.dialog().nativeElement.close();
    this.drafted.emit({ id: this.id(), isNew: !prev });
  }

  /** Troca o campo de data pela tira "Data não definida" e volta, levando o foco junto. */
  protected setDateUnknown(unknown: boolean): void {
    this.dateUnknown.set(unknown);
    setTimeout(() => document.getElementById(unknown ? 'editor-data-escolher' : 'editor-data')?.focus());
  }

  protected cancelDraft(): void {
    this.confirmingDraft.set(false);
  }

  protected removeWish(): void {
    const wish = this.fromWish();
    if (!wish) return;
    if (this.hasReviewContent() && !this.confirmingRemove()) {
      this.confirmingRemove.set(true);
      return;
    }
    this.confirmingRemove.set(false);
    this.snapshot = this.serialize();
    this.dialog().nativeElement.close();
    this.wishRemoved.emit(wish.id);
  }

  protected removeDraft(): void {
    const draft = this.fromDraft();
    if (!draft) return;
    if (this.hasReviewContent() && !this.confirmingRemove()) {
      this.confirmingRemove.set(true);
      return;
    }
    this.confirmingRemove.set(false);
    this.snapshot = this.serialize();
    this.dialog().nativeElement.close();
    this.draftRemoved.emit(draft.id);
  }

  /** Esc, X ou Cancelar: se tem coisa escrita, pergunta antes. */
  protected requestClose(e?: Event): void {
    if (this.isDirty() && !this.confirmingDiscard()) {
      e?.preventDefault();
      this.confirmingDiscard.set(true);
      return;
    }
    // Esc de novo com a pergunta na tela é "voltar", não "descartar": só o botão Descartar joga fora
    if (e?.type === 'cancel' && this.isDirty()) {
      e.preventDefault();
      this.keepWriting();
      return;
    }
    if (e?.type !== 'cancel') this.dialog().nativeElement.close();
  }

  protected keepWriting(): void {
    this.confirmingDiscard.set(false);
  }

  protected discard(): void {
    this.snapshot = this.serialize();
    this.dialog().nativeElement.close();
  }

  /** O clique começou fora do cartão? Selecionar texto e soltar fora dele não fecha. */
  protected downOnBackdrop = false;

  protected onBackdrop(e: MouseEvent): void {
    if (e.target === this.dialog().nativeElement && this.downOnBackdrop) this.requestClose();
  }

  /** Algo além do jogo foi preenchido (e seria perdido num pendente)? */
  private hasReviewContent(): boolean {
    return (
      this.categories().some((k) => (this.scores()[k] ?? null) !== null) ||
      this.bonuses().length > 0 ||
      this.status() !== null ||
      this.verdict() !== null ||
      this.difficulty() !== 'nenhuma' ||
      this.hours().trim() !== '' ||
      this.text().trim() !== ''
    );
  }

  private isDirty(): boolean {
    return this.serialize() !== this.snapshot;
  }

  private serialize(): string {
    return JSON.stringify([
      this.game()?.name,
      this.stock(),
      this.categories().map((k) => this.scores()[k] ?? null),
      this.status(),
      this.verdict(),
      this.dateUnknown() ? null : this.completedAt(),
      this.weights(),
      this.bonuses().map((b) => b.id),
      this.hours().trim(),
      this.game()?.coverUrl,
      this.difficulty(),
      this.text().trim(),
    ]);
  }

  private focusFirstMissing(): void {
    const root = this.dialog().nativeElement;
    setTimeout(() => {
      if (!this.game()) this.search()?.focus();
      else if (this.missingScores().length)
        root.querySelector<HTMLInputElement>(`[data-nota="${this.missingScores()[0]}"] input`)?.focus();
      else if (this.noneCounts()) root.querySelector<HTMLSelectElement>('.subs select')?.focus();
      else if (!this.status()) root.querySelector<HTMLInputElement>('app-status-picker input')?.focus();
      else if (!this.dateValid()) root.querySelector<HTMLInputElement>('#editor-data')?.focus();
      else root.querySelector<HTMLInputElement>('#editor-horas')?.focus();
    });
  }

  protected scoreOf(k: RatedKey): number | null {
    return this.scores()[k] ?? null;
  }

  protected setScore(k: RatedKey, v: number | null): void {
    this.scores.update((cur) => ({ ...cur, [k]: v }));
  }
}
