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
import { Bookmark, Check, CopyCheck, CornerDownRight, Eye, Images, LockKeyhole, LucideAngularModule, Pin as PinIcon, RectangleHorizontal, RectangleVertical, RefreshCw, Repeat, Square, Trash2, UsersRound, X } from 'lucide-angular';
import { NgTemplateOutlet } from '@angular/common';
import {
  Bonus,
  Difficulty,
  Draft,
  Kind,
  PickedGame,
  NoteRank,
  NoteSize,
  Rated,
  RatedKey,
  Review,
  SCORE_LABEL,
  Status,
  NO_DAY_LABEL,
  Stock,
  Verdict,
  Weight,
  Weights,
  Wish,
  computeFinal,
  isDarkStock,
  artIdOf,
  formatScore,
  formatRawScore,
  counts,
  formatShift,
  weightOf,
  dayLabel,
  isValidReviewDate,
  isYearOnly,
  isYearMonth,
  formatReviewDateLong,
  formatReviewDate,
  newId,
  todayISO,
  Audience,
  audienceFields,
  audienceOf,
} from '../core/review';
import { GameLookup, isSteamCover } from '../core/game-lookup';
import { cap, g, isNotes, profileOf } from '../core/kinds';
import { Cloud } from '../core/cloud-config';
import { Mural } from '../core/mural';
import { OriginalSwap, ReviewStore } from '../core/review-store';
import { linkKey, linkableTitle, notesOf, relinkAfterRename, resolveNote } from '../core/note-links';
import { DEFAULT_LOOK, DEFAULT_PATTERN_INK, DEFAULT_SCRIBBLE_INK, Damage, Decor, Paper, Pattern, PatternLook, Scribble, Stain, lookOf } from '../core/paper';
import { paperVars } from '../core/paper-art';
import { pinningFor } from '../core/wall-physics';
import { BonusPicker } from './bonus';
import { NoteLabelsPicker } from './note-labels-picker';
import { categoryLibrary, tagLibrary } from '../core/note-labels';
import { Settings } from '../core/settings';
import { CardKit } from './card-kit';
import { Confirm } from './confirm';
import { CoverPicker } from './cover-picker';
import { CoverSleeve } from './cover-sleeve';
import { DifficultyPicker } from './difficulty';
import { GameSearch } from './game-search';
import { JudgeLabel } from './judge-label';
import { Pin } from './pin';
import { ReviewCard } from './review-card';
import { RichEditor } from './rich-editor';
import { ScorePicker } from './score-picker';
import { StatusPicker } from './status-picker';
import { VerdictPicker } from './verdict';

export interface SavedEvent {
  id: string;
  isNew: boolean;
  /** Salvar trocou a original da obra (uma rejogada mais antiga que ela virou a original). */
  swap?: OriginalSwap | null;
  /** A anotação mudou de título: em quantas outras os links para ela foram atualizados. */
  relinked?: number;
}

/** O ano mais antigo aceito na data (o mesmo limite da validação dos backups). */
const MIN_YEAR = 1971;

const MONTHS = ['janeiro', 'fevereiro', 'março', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];

@Component({
  selector: 'app-review-editor',
  imports: [
    LucideAngularModule,
    NgTemplateOutlet,
    BonusPicker,
    NoteLabelsPicker,
    CardKit,
    CoverPicker,
    CoverSleeve,
    DifficultyPicker,
    GameSearch,
    JudgeLabel,
    Pin,
    ReviewCard,
    RichEditor,
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
  private readonly confirm = inject(Confirm);
  /** "Publicar ou manter privado?" só aparece quando o site tem nuvem: sem ela, ninguém vê o mural mesmo. */
  protected readonly cloud = inject(Cloud);
  readonly saved = output<SavedEvent>();
  /** O editor fechou (salvando ou não). */
  readonly closed = output<void>();
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
  protected readonly CoversIcon = Images;
  protected readonly DoneIcon = Check;
  protected readonly RevisitIcon = Repeat;
  protected readonly KeepIcon = CopyCheck;
  protected readonly PrivateIcon = LockKeyhole;
  protected readonly EveryoneIcon = UsersRound;
  protected readonly VisibleIcon = Eye;
  /**
   * Quem vê: Publicar (o mural e o Feed de quem segue), Visível (só o mural, sem aviso) ou Privado
   * (fora do mural que os outros veem, e ninguém é avisado). Ver Review.private e Review.quiet.
   */
  protected readonly audience = signal<Audience>('publicar');
  protected readonly isPrivate = computed(() => this.audience() === 'privada');
  protected readonly audiences: readonly { value: Audience; label: string }[] = [
    { value: 'publicar', label: 'Publicar' },
    { value: 'visivel', label: 'Visível' },
    { value: 'privada', label: 'Privado' },
  ];
  protected readonly labels = SCORE_LABEL;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly previewSlot = viewChild.required<ElementRef<HTMLDivElement>>('previewSlot');
  private readonly previewFrame = viewChild.required<ElementRef<HTMLDivElement>>('previewFrame');
  private readonly search = viewChild(GameSearch);
  private readonly bonusPicker = viewChild(BonusPicker);
  private readonly labelsPicker = viewChild(NoteLabelsPicker);
  private readonly kit = viewChild(CardKit);
  private readonly writer = viewChild(RichEditor);

  protected readonly id = signal(newId());
  protected readonly editing = signal<Review | null>(null);
  /** O pendente que está sendo terminado, se a ficha veio da fila. */
  protected readonly fromDraft = signal<Draft | null>(null);
  /** O desejo da wishlist que virou resenha, se a ficha veio de lá. */
  protected readonly fromWish = signal<Wish | null>(null);
  /**
   * Escrevendo (ou editando) uma rejogada: o id da ficha original. O item é o dela, sem trocar; as
   * notas começam em branco, e "Manter notas" traz as de lá.
   */
  protected readonly revisitRoot = signal<string | null>(null);
  /** A ficha original da rejogada, se ela ainda está no mural. */
  protected readonly original = computed(() => {
    const id = this.revisitRoot();
    return id ? (this.store.get(id) ?? null) : null;
  });
  /** "Rejogada", "Releitura", "Reassistida". */
  protected readonly revisitWord = computed(() => cap(this.profile().revisit.one));
  /** As notas da original já foram copiadas nesta rejogada (o aviso troca o convite). */
  protected readonly keptNotes = signal(false);
  /** O cabeçalho do editor. */
  protected readonly title = computed(() => {
    if (this.revisitRoot()) return `${this.editing() ? 'Editar' : 'Nova'} ${this.profile().revisit.one}`;
    if (this.notes()) return this.editing() ? 'Editar anotação' : 'Nova anotação';
    return this.editing() ? 'Editar resenha' : this.fromDraft() ? 'Terminar resenha' : 'Nova resenha';
  });
  /** "de 12 mar 2024" (a data da original), para o convite de manter as notas. */
  protected readonly originalWhen = computed(() => {
    const o = this.original();
    return o?.completedAt ? `de ${formatReviewDate(o.completedAt)}` : 'da primeira vez';
  });
  /** O mural da ficha: o aberto, para uma ficha nova; o dela, para uma que já existe. */
  protected readonly kind = signal<Kind>('jogos');
  /** Uma anotação, não uma resenha: título escrito, capa opcional, categorias, sem notas (ver `isNotes`). */
  protected readonly notes = computed(() => isNotes(this.kind()));
  /** O título da anotação, como está sendo escrito (vai no `game.name`). */
  protected readonly noteTitle = computed(() => this.game()?.name ?? '');
  /** A anotação como "item", para a escolha da capa (só link colado ou sem capa: não há catálogo). */
  protected readonly noteGame = computed<PickedGame>(() => this.game() ?? { name: '', coverUrl: null, source: 'manual' });
  /** A tira da data aberta na anotação (fechada, é uma linha: "Data: hoje · Mudar"). */
  protected readonly noteDateOpen = signal(false);
  /** A data da anotação, em uma palavra ou por extenso. */
  protected readonly noteDateText = computed(() => {
    const v = this.dateValue();
    if (v === null) return 'Sem data';
    return this.isToday() ? 'Hoje' : formatReviewDateLong(v);
  });

  protected openNoteDate(): void {
    this.noteDateOpen.set(true);
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLInputElement>('#editor-data')?.focus());
  }

  /** O tamanho da anotação no mural; null, o de sempre. */
  protected readonly noteSize = signal<NoteSize | null>(null);
  protected readonly noteSizes: readonly { value: NoteSize | null; label: string; icon: typeof Square }[] = [
    { value: null, label: 'Normal', icon: Square },
    { value: 'larga', label: 'Larga', icon: RectangleHorizontal },
    { value: 'alta', label: 'Alta', icon: RectangleVertical },
  ];
  /** O lugar da anotação no mural: fixada no topo, comum (null) ou sub-nota, no fim. */
  protected readonly noteRank = signal<NoteRank | null>(null);
  protected readonly noteRanks: readonly { value: NoteRank | null; label: string; icon: typeof Square }[] = [
    { value: 'fixada', label: 'Fixada', icon: PinIcon },
    { value: null, label: 'Comum', icon: Square },
    { value: 'sub', label: 'Sub-nota', icon: CornerDownRight },
  ];
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
  /** Só as notas, sem os bônus, para o seletor mostrar o efeito deles na média. */
  protected readonly base = computed(() => computeFinal(this.kind(), this.scores(), this.weights()));
  /**
   * A nota final na mão: fechada por padrão (vale a média). Aberta, a pessoa escreve a nota que quiser
   * de 0 a 11, com uma casa, e ela vai para a ficha no lugar da média.
   */
  protected readonly overrideOn = signal(false);
  protected readonly overrideText = signal('');
  protected readonly overrideValue = computed(() => {
    const t = this.overrideText().trim().replace(',', '.');
    if (!/^\d{1,2}(\.\d+)?$/.test(t)) return null;
    const v = Number(t);
    return v >= 0 && v <= 11 ? Math.round(v * 10) / 10 : null;
  });
  /** A nota que vai para a ficha: a da mão, se aberta e válida; senão, a média. */
  protected readonly shown = computed(() => (this.overrideOn() ? this.overrideValue() : this.final()));
  protected readonly formatScore = formatScore;
  protected readonly shift = computed(() => {
    const f = this.final();
    const b = this.base();
    return f === null || b === null ? '' : formatShift(f - b);
  });
  protected readonly weightOf = weightOf;
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
  /** As capas do mesmo título abertas na ficha, para trocar a que veio. */
  protected readonly choosingCover = signal(false);
  /** A busca da capa da Steam, logo depois de escolher um jogo da RAWG. */
  private coverAbort: AbortController | undefined;
  protected readonly status = signal<Status | null>(null);
  protected readonly verdict = signal<Verdict | null>(null);
  /**
   * A data em três partes, e cada uma pode ficar em branco: com tudo, o dia certo; sem o dia, o mês;
   * só o ano; ou nada, a data não definida (vai para o fim da ordem por data).
   */
  protected readonly dateDay = signal('');
  protected readonly dateMonth = signal('');
  protected readonly dateYear = signal('');
  protected readonly noDay = NO_DAY_LABEL;
  protected readonly today = signal(todayISO());
  protected readonly dateLabel = computed(() => (this.status() ? dayLabel(this.kind(), this.status()!) : 'Data'));
  protected readonly months = MONTHS;
  protected readonly dateUnknown = computed(() => !this.dateDay().trim() && !this.dateMonth() && !this.dateYear().trim());
  /** A data montada com o que foi preenchido ('AAAA-MM-DD', 'AAAA-MM', 'AAAA'); null sem nada. */
  protected readonly dateValue = computed<string | null>(() => {
    if (this.dateUnknown()) return null;
    const y = this.dateYear().trim();
    const m = this.dateMonth();
    const d = this.dateDay().trim();
    return [y, m, d && d.padStart(2, '0')].filter(Boolean).join('-');
  });
  /** O que falta ou sobra na data, em uma frase; vazio quando ela vale. */
  protected readonly dateProblem = computed(() => {
    const value = this.dateValue();
    if (value === null) return '';
    const y = this.dateYear().trim();
    const top = this.today().slice(0, 4);
    if (!y) return this.dateDay().trim() || this.dateMonth() ? 'Falta o ano. Se não lembra nem o ano, deixe tudo em branco.' : '';
    if (!/^\d{4}$/.test(y) || Number(y) < MIN_YEAR || y > top) return `O ano vai de ${MIN_YEAR} a ${top}.`;
    if (this.dateDay().trim() && !this.dateMonth()) return 'Para o dia valer, escolha o mês também.';
    if (!isValidReviewDate(value)) return `${MONTHS[Number(this.dateMonth()) - 1]} de ${y} não tem dia ${Number(this.dateDay())}.`;
    if (value > this.today().slice(0, value.length)) return 'Essa data ainda não chegou.';
    return '';
  });
  protected readonly dateValid = computed(() => !this.dateProblem());
  /** Como a data vai ficar escrita na ficha, para conferir enquanto preenche. */
  protected readonly dateReading = computed(() => {
    const v = this.dateValue();
    if (v === null) return 'Sem data: a ficha vai para o fim quando o mural for ordenado por data.';
    if (isYearOnly(v)) return `Só o ano: ${v}.`;
    if (isYearMonth(v)) return `Só o mês: ${formatReviewDateLong(v)}.`;
    return `${formatReviewDateLong(v)}.`;
  });
  protected readonly isToday = computed(() => this.dateValue() === this.today());
  protected readonly difficulty = signal<Difficulty>('nenhuma');
  protected readonly text = signal('');
  protected readonly attempted = signal(false);
  protected readonly confirmingDiscard = signal(false);
  /** Já tem nota ou texto e a pessoa pediu para guardar só o jogo: confirma antes de perder. */
  protected readonly confirmingDraft = signal(false);
  protected readonly draftError = signal(false);
  protected readonly searchSeed = signal('');

  /** A ficha em branco já nasce com uma cor sorteada; a pessoa troca pela que quiser. */
  protected readonly stock = signal<Stock>('amarelo');
  /** O papel da cartolina, a estampa, o rabisco e o estrago: a ficha nova nasce na cartolina de sempre, sem nada. */
  protected readonly paper = signal<Paper>('cartolina');
  protected readonly pattern = signal<Pattern | null>(null);
  /** O espaço, o tamanho e o alinhamento dos desenhos da estampa. */
  protected readonly patternLook = signal<PatternLook>(DEFAULT_LOOK);
  /** O jeito da estampa que a pessoa sorteou (um clique a mais na estampa, outro deslocamento). */
  protected readonly patternSeed = signal<number | null>(null);
  protected readonly scribble = signal<Scribble | null>(null);
  /** O jeito do rabisco que a pessoa sorteou (um clique a mais no rabisco, outro jeito). */
  protected readonly scribbleSeed = signal<number | null>(null);
  /** A força do lápis do rabisco, um degrau de SCRIBBLE_INK. */
  protected readonly scribbleInk = signal(DEFAULT_SCRIBBLE_INK);
  protected readonly damage = signal<Damage | null>(null);
  /** O jeito do estrago que a pessoa sorteou (um clique a mais no estrago, outro jeito). */
  protected readonly damageSeed = signal<number | null>(null);
  /** A mancha por cima do papel, e o jeito dela que a pessoa sorteou. */
  protected readonly stain = signal<Stain | null>(null);
  protected readonly stainSeed = signal<number | null>(null);
  /** A decoração por cima de tudo, e o jeito dela que a pessoa sorteou. */
  protected readonly decor = signal<Decor | null>(null);
  protected readonly decorSeed = signal<number | null>(null);
  protected readonly headPaper = computed(() => paperVars(this.paper(), this.pattern() ?? undefined, this.patternLook(), this.patternSeed(), isDarkStock(this.stock())));
  protected readonly pin = computed(() => pinningFor(this.id(), this.stock()));
  protected readonly library = computed(() => this.store.customBonuses()[this.kind()]);
  /** A categoria e as tags da anotação (ver core/note-labels.ts). */
  protected readonly noteCategory = signal<string | null>(null);
  protected readonly noteTags = signal<string[]>([]);
  private readonly settings = inject(Settings);
  /** A cartela de categorias: a pronta e as escritas nas outras anotações. */
  protected readonly categoryLib = computed(() => categoryLibrary(this.store.notes()));
  /** As tags à mão: as fixas e as das outras anotações da mesma categoria. */
  protected readonly tagLib = computed(() => tagLibrary(this.store.notes(), this.settings.pinnedTags(), this.noteCategory()));

  /** No celular a prévia é a ficha simples, que cabe no alto da tela sem empurrar o formulário. */
  protected readonly phone = signal(false);
  protected readonly previewScale = signal(1);
  protected readonly previewRowHeight = signal(500);
  private previewObserver: ResizeObserver | null = null;

  /**
   * De onde sai o desenho do papel desta ficha (ver artIdOf): o da própria ficha, o da original numa
   * rejogada, ou o que ficou guardado depois que a original trocou.
   */
  protected readonly artId = signal('');
  /** `artFrom` só vai para a ficha quando não é o de sempre. */
  private artFields(): Pick<Review, 'artFrom'> {
    return this.artId() !== (this.revisitRoot() ?? this.id()) ? { artFrom: this.artId() } : {};
  }

  /** As outras anotações, para os links "[[Título]]" do texto (ver core/note-links.ts). */
  protected readonly otherNotes = computed(() => (this.notes() ? notesOf(this.store.reviews()).filter((n) => n.id !== this.id()) : null));

  /**
   * Outra anotação com o mesmo título: os links para esse título abrem a mais antiga das duas (o
   * editor avisa embaixo do título, dos dois jeitos). `mine`: os links passam a abrir esta.
   */
  protected readonly titleTwin = computed<{ twin: Review; mine: boolean } | null>(() => {
    const list = this.otherNotes();
    if (!list) return null;
    const title = this.noteTitle();
    const twin = resolveNote(list, title);
    if (!twin) return null;
    // a nova ainda não tem data de criação: ela é a mais nova de todas
    const me = { ...this.preview(), createdAt: this.editing()?.createdAt ?? '9999' };
    return { twin, mine: resolveNote([...list, me], title)?.id === me.id };
  });
  /** Um título com colchetes não cabe num link ("[[Compras [casa]]]" não seria lido como link). */
  protected readonly bracketTitle = computed(() => this.notes() && !!this.noteTitle().trim() && !linkableTitle(this.noteTitle()));
  /** O título do link que criou esta anotação (ver `openNote`): trocar o título leva o link junto. */
  private linkTitle: string | null = null;

  /**
   * Uma anotação nova já com o título: o link para uma anotação que ainda não existia. Nasce
   * sub-nota (ela faz parte da anotação de onde veio); dá para trocar no editor.
   */
  openNote(title: string, from: Review | null = null): void {
    // sempre no mural de anotações, de onde quer que venha o link
    this.open(undefined, undefined, undefined, undefined, 'anotacoes');
    this.setNoteTitle(title);
    this.noteRank.set('sub');
    // faz parte da anotação de onde veio: o mesmo assunto
    this.noteCategory.set(from?.category ?? null);
    this.linkTitle = title;
    // fechar sem mexer em nada não pergunta se quer descartar
    this.snapshot = this.serialize();
    // depois de desenhar: no primeiro uso, a folha da anotação ainda não existe neste instante
    setTimeout(() => this.writer()?.focus());
  }

  protected setNoteTitle(name: string): void {
    this.game.set({ name, coverUrl: this.game()?.coverUrl ?? null, source: 'manual' });
  }

  protected setNoteCover(coverUrl: string | null): void {
    this.game.set({ name: this.noteTitle(), coverUrl, source: 'manual' });
  }

  /** A ficha como ela vai para o mural, montada com o que já foi preenchido. */
  protected readonly preview = computed<Review>(() => {
    return {
      ...(this.notes() && this.noteSize() ? { noteSize: this.noteSize()! } : {}),
      ...(this.notes() && this.noteRank() ? { noteRank: this.noteRank()! } : {}),
      ...(this.notes() && this.noteCategory() ? { category: this.noteCategory()! } : {}),
      ...(this.notes() && this.noteTags().length ? { tags: [...this.noteTags()] } : {}),
      id: this.id(),
      kind: this.kind(),
      // sem jogo, a capa mostra um ponto de interrogação e o nome fica só marcado (ReviewCard.empty)
      game: this.game() ?? { name: '', coverUrl: null, source: 'manual' },
      // sem nota ainda, a etiqueta mostra o tracinho
      scores: { final: (this.shown() ?? this.final()) as number, ...this.counted() },
      status: this.status() ?? 'finalizado',
      difficulty: this.difficulty(),
      verdict: this.verdict(),
      weights: this.weights(),
      bonuses: this.bonuses(),
      hoursPlayed: this.hoursValid() ? this.hoursValue() : null,
      stock: this.stock(),
      paper: this.paper(),
      pattern: this.pattern() ?? undefined,
      ...this.lookFields(),
      patternSeed: this.patternSeed() ?? undefined,
      scribble: this.scribble() ?? undefined,
      scribbleSeed: this.scribbleSeed() ?? undefined,
      scribbleInk: this.scribbleInk(),
      damage: this.damage() ?? undefined,
      damageSeed: this.damageSeed() ?? undefined,
      stain: this.stain() ?? undefined,
      stainSeed: this.stainSeed() ?? undefined,
      decor: this.decor() ?? undefined,
      decorSeed: this.decorSeed() ?? undefined,
      text: this.text(),
      completedAt: this.dateValid() ? this.dateValue() : this.today(),
      ...(this.revisitRoot() ? { revisitOf: this.revisitRoot()! } : {}),
      ...this.artFields(),
      ...(this.isPrivate() ? { private: true as const } : this.audience() === 'visivel' ? { quiet: true as const } : {}),
      createdAt: '',
      updatedAt: '',
    };
  });

  constructor() {
    const mq = matchMedia('(max-width: 699px)');
    const sync = () => this.phone.set(mq.matches);
    sync();
    mq.addEventListener('change', sync);
    inject(DestroyRef).onDestroy(() => {
      mq.removeEventListener('change', sync);
      this.previewObserver?.disconnect();
    });
  }

  private fitPreview(): void {
    const slot = this.previewSlot().nativeElement;
    const frame = this.previewFrame().nativeElement;
    const pane = slot.parentElement;
    const body = pane?.parentElement;
    if (!pane || !body || !body.clientHeight || !frame.offsetHeight) return;
    const overhead = pane.clientHeight - slot.clientHeight;
    const desired = Math.ceil(frame.offsetHeight + overhead + 12);
    const cap = body.clientHeight * (innerWidth >= 1024 ? 0.6 : 0.45);
    this.previewRowHeight.set(desired);
    this.previewScale.set(Math.min(1, Math.max(0, Math.min(desired, cap) - overhead) / frame.offsetHeight));
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
    if (this.notes()) {
      // o texto é opcional: um lembrete pode ser só o título
      if (!this.noteTitle().trim()) m.push('o título');
      if (!this.dateValid()) m.push('uma data válida');
      return m;
    }
    // na ordem da ficha, de cima para baixo: o primeiro que falta é onde o foco cai
    if (!this.game()) m.push(this.words().o);
    if (!this.status()) m.push('o status');
    if (!this.dateValid()) m.push('uma data válida');
    if (!this.hoursValid()) m.push(this.profile().amount?.missing ?? '');
    const scores = this.missingScores().map((k) => SCORE_LABEL[k]);
    if (scores.length === 1) m.push(`a nota de ${scores[0]}`);
    else if (scores.length > 1) m.push(`as notas de ${scores.slice(0, -1).join(', ')} e ${scores.at(-1)}`);
    else if (this.noneCounts()) m.push('ao menos uma categoria que conte na média');
    if (this.overrideOn() && this.overrideValue() === null) m.push('uma nota final de 0 a 11');
    return m;
  });

  protected readonly missingText = computed(() => {
    const m = this.missing();
    if (!m.length) return '';
    const list = m.length > 1 ? `${m.slice(0, -1).join(', ')} e ${m.at(-1)}` : m[0];
    // na anotação nada se escolhe: se escreve
    return this.notes() ? `Falta ${list}.` : `Falta escolher ${list}.`;
  });

  private snapshot = '';

  /**
   * Abre o editor: uma ficha para editar, um pendente ou um desejo para terminar, ou nada (ficha
   * nova). Com `revisitOf`, uma rejogada nova da ficha original dada.
   */
  open(review?: Review, draft?: Draft, wish?: Wish, revisitOf?: Review, as?: Kind): void {
    const kind = review?.kind ?? draft?.kind ?? wish?.kind ?? revisitOf?.kind ?? as ?? this.mural.kind();
    this.linkTitle = null;
    this.kind.set(kind);
    this.editing.set(review ?? null);
    this.fromDraft.set(review ? null : (draft ?? null));
    this.fromWish.set(review || draft ? null : (wish ?? null));
    // a rejogada de uma rejogada é mais uma vez da mesma original
    const root = review ? (review.revisitOf ?? null) : revisitOf ? (revisitOf.revisitOf ?? revisitOf.id) : null;
    this.revisitRoot.set(root);
    this.keptNotes.set(false);
    // a anotação nasce privada; a resenha, publicada
    this.audience.set(review ? audienceOf(review) : isNotes(kind) ? 'privada' : 'publicar');
    this.noteSize.set(review?.noteSize ?? null);
    this.noteRank.set(review?.noteRank ?? null);
    this.noteDateOpen.set(false);
    // O pendente (ou o desejo) vira a resenha com o mesmo id.
    this.id.set(review?.id ?? draft?.id ?? wish?.id ?? newId());
    // a rejogada nova desenha como a original desenha hoje (que pode ser com o id de antes)
    const rootReview = root ? (this.store.get(root) ?? null) : null;
    this.artId.set(review ? artIdOf(review) : root ? (rootReview ? artIdOf(rootReview) : root) : this.id());
    // a rejogada nova já nasce com a cartolina da original, igualzinha (o papel é desenhado com o id
    // dela, ver artIdOf); a pessoa muda no estojo se quiser
    const look = review ?? (root ? (this.store.get(root) ?? revisitOf) : undefined);
    this.stock.set(look?.stock ?? this.store.nextStock(kind));
    this.paper.set(look?.paper ?? 'cartolina');
    this.pattern.set(look?.pattern ?? null);
    this.patternLook.set(lookOf(look ?? {}));
    this.patternSeed.set(look?.patternSeed ?? null);
    this.scribble.set(look?.scribble ?? null);
    this.scribbleSeed.set(look?.scribbleSeed ?? null);
    this.scribbleInk.set(look?.scribbleInk ?? DEFAULT_SCRIBBLE_INK);
    this.damage.set(look?.damage ?? null);
    this.damageSeed.set(look?.damageSeed ?? null);
    this.stain.set(look?.stain ?? null);
    this.overrideOn.set(review?.finalOverride !== undefined);
    // a nota como foi dada: com "Inteiros" em Ajustes, um 8,5 escrito como 9 viraria 9 ao salvar
    this.overrideText.set(review?.finalOverride !== undefined ? formatRawScore(review.finalOverride) : '');
    this.stainSeed.set(look?.stainSeed ?? null);
    this.decor.set(look?.decor ?? null);
    this.decorSeed.set(look?.decorSeed ?? null);
    this.kit()?.reset();
    this.game.set(review?.game ?? draft?.game ?? wish?.game ?? (root ? (this.store.get(root)?.game ?? revisitOf!.game) : null));
    const { final: _final, ...rated } = review?.scores ?? { final: 0 };
    this.scores.set(rated);
    this.status.set(review?.status ?? null);
    this.verdict.set(review?.verdict ?? null);
    this.today.set(todayISO());
    this.setDateParts(review ? review.completedAt : todayISO());
    this.difficulty.set(review?.difficulty ?? 'nenhuma');
    this.weights.set({ ...(review?.weights ?? {}) });
    this.bonuses.set([...(review?.bonuses ?? [])]);
    this.bonusPicker()?.reset();
    this.noteCategory.set(review?.category ?? null);
    this.noteTags.set([...(review?.tags ?? [])]);
    this.labelsPicker()?.reset();
    this.hours.set(review?.hoursPlayed === null || review?.hoursPlayed === undefined ? '' : String(review.hoursPlayed).replace('.', ','));
    this.coverAbort?.abort();
    this.choosingCover.set(false);
    this.text.set(review?.text ?? '');
    this.writer()?.reset();
    this.searchSeed.set('');
    // a busca que ficou aberta da última vez (talvez de outro mural) volta vazia
    this.search()?.reset();
    this.attempted.set(false);
    this.confirmingDiscard.set(false);
    this.confirmingDraft.set(false);
    this.draftError.set(false);
    this.snapshot = this.serialize();
    const dialog = this.dialog().nativeElement;
    // O diálogo é sempre o mesmo: sem isso, abre rolado onde a resenha anterior ficou
    const toTop = () => {
      dialog.scrollTop = 0;
      dialog.querySelectorAll('.editor-content, .kit-panel, .form, app-card-kit .painel').forEach((pane) => pane.scrollTo({ top: 0, behavior: 'instant' }));
    };
    toTop();
    this.previewScale.set(1);
    dialog.showModal();
    this.previewObserver?.disconnect();
    this.previewObserver = new ResizeObserver(() => this.fitPreview());
    this.previewObserver.observe(this.previewSlot().nativeElement);
    this.previewObserver.observe(this.previewFrame().nativeElement);
    this.fitPreview();
    toTop();
    // e de novo depois que o conteúdo da resenha nova desenhar (e o foco ir para a busca)
    requestAnimationFrame(toTop);
    if (!review && !draft && !root) {
      // depois de desenhar: trocando de mural, o campo do título ainda não existe neste instante
      setTimeout(() =>
        isNotes(kind) ? this.dialog().nativeElement.querySelector<HTMLInputElement>('#editor-titulo-nota')?.focus() : this.search()?.focus(),
      );
    }
  }

  /**
   * "Manter notas": a rejogada pega as notas da original (as quatro, os pesos, os bônus, a nota na
   * mão, o veredito, a dificuldade e o status). A data, a quantidade e o texto continuam desta vez.
   */
  protected keepNotes(): void {
    const o = this.original();
    if (!o) return;
    const { final: _final, ...rated } = o.scores;
    this.scores.set({ ...rated });
    this.weights.set({ ...o.weights });
    this.bonuses.set([...o.bonuses]);
    this.bonusPicker()?.reset();
    this.overrideOn.set(o.finalOverride !== undefined);
    this.overrideText.set(o.finalOverride !== undefined ? formatRawScore(o.finalOverride) : '');
    this.verdict.set(o.verdict);
    this.difficulty.set(this.profile().difficulty ? o.difficulty : 'nenhuma');
    this.status.set(o.status);
    this.keptNotes.set(true);
  }

  protected pick(game: PickedGame): void {
    this.coverAbort?.abort();
    this.choosingCover.set(false);
    this.game.set(game);
    this.draftError.set(false);
    // Achou na RAWG: tenta logo a capa da Steam, que tem o título.
    if (game.source === 'rawg') void this.steamCover(game);
  }

  /** A imagem da RAWG é uma arte de fundo: se o jogo está na Steam, a capa de lá entra no lugar. */
  private async steamCover(game: PickedGame): Promise<void> {
    const ctrl = new AbortController();
    this.coverAbort = ctrl;
    try {
      const found = await this.lookup.withSteamCover(game, ctrl.signal);
      // a pessoa já escolheu outra capa (ou outro jogo) enquanto procurava: fica a dela
      if (!ctrl.signal.aborted && this.game() === game && isSteamCover(found.coverUrl)) this.game.set(found);
    } catch {
      // sem a capa da Steam, a arte da RAWG serve
    }
  }

  protected openCovers(e: MouseEvent): void {
    this.choosingCover.set(true);
    // pelo teclado (Enter ou espaço não têm clique contado), o foco entra na capa escolhida
    if (e.detail === 0)
      setTimeout(() =>
        this.dialog().nativeElement.querySelector<HTMLInputElement>('.escolher-capa input:checked')?.focus({ preventScroll: true }),
      );
  }

  protected closeCovers(): void {
    this.choosingCover.set(false);
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>('.capa-btn')?.focus());
  }

  protected setWeight(k: RatedKey, w: Weight): void {
    this.weights.update((cur) => {
      const next = { ...cur };
      if (w === 'normal') delete next[k];
      else next[k] = w;
      return next;
    });
  }

  protected swapGame(): void {
    this.coverAbort?.abort();
    this.choosingCover.set(false);
    this.searchSeed.set(this.game()?.name ?? '');
    this.game.set(null);
    setTimeout(() => this.search()?.focus());
  }

  protected save(e: Event): void {
    e.preventDefault();
    this.attempted.set(true);
    if (this.notes()) {
      this.saveNote();
      return;
    }
    const game = this.game();
    const final = this.shown();
    const status = this.status();
    if (!game || final === null || this.missingScores().length || this.noneCounts() || !status || !this.dateValid() || !this.hoursValid()) {
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
      // o de sempre não vai para o armazenamento: cartolina sem marca é a ficha como era
      ...(this.paper() !== 'cartolina' ? { paper: this.paper() } : {}),
      ...(this.pattern() ? { pattern: this.pattern()!, ...this.lookFields() } : {}),
      ...(this.pattern() && this.patternSeed() ? { patternSeed: this.patternSeed()! } : {}),
      ...(this.scribble() ? { scribble: this.scribble()! } : {}),
      ...(this.scribble() && this.scribbleSeed() ? { scribbleSeed: this.scribbleSeed()! } : {}),
      ...(this.scribble() && this.scribbleInk() !== DEFAULT_SCRIBBLE_INK ? { scribbleInk: this.scribbleInk() } : {}),
      ...(this.damage() ? { damage: this.damage()! } : {}),
      ...(this.damage() && this.damageSeed() ? { damageSeed: this.damageSeed()! } : {}),
      ...(this.stain() ? { stain: this.stain()! } : {}),
      ...(this.stain() && this.stainSeed() ? { stainSeed: this.stainSeed()! } : {}),
      ...(this.decor() ? { decor: this.decor()! } : {}),
      ...(this.decor() && this.decorSeed() ? { decorSeed: this.decorSeed()! } : {}),
      ...(this.overrideOn() ? { finalOverride: final } : {}),
      text: this.text().trim(),
      completedAt: this.dateValue(),
      ...(this.revisitRoot() ? { revisitOf: this.revisitRoot()! } : {}),
      ...this.artFields(),
      // passou a ser publicada agora: para quem segue, ela é nova a partir de hoje
      ...audienceFields(this.audience(), prev, now),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    const swap = prev ? this.store.update(review) : this.store.add(review);
    const draft = this.fromDraft();
    if (draft) this.store.removeDraft(draft.id, false);
    const wish = this.fromWish();
    if (wish) this.store.removeWish(wish.id, false);
    this.snapshot = this.serialize();
    this.dialog().nativeElement.close();
    this.saved.emit({ id: review.id, isNew: !prev, swap });
  }

  /** Prega a anotação: só o título é obrigatório; sem notas, status, veredito nem dificuldade. */
  private saveNote(): void {
    const name = this.noteTitle().trim();
    if (!name || !this.dateValid()) {
      this.focusFirstMissing();
      return;
    }
    const now = new Date().toISOString();
    const prev = this.editing();
    const look = this.preview();
    const note: Review = {
      ...look,
      game: { name, coverUrl: this.game()?.coverUrl ?? null, source: 'manual' },
      scores: { final: 0 },
      status: 'finalizado',
      difficulty: 'nenhuma',
      verdict: null,
      weights: {},
      // a categoria e as tags vêm da prévia; os adesivos das anotações de antes viraram elas
      bonuses: [],
      hoursPlayed: null,
      // o de sempre não vai para o armazenamento, como na resenha
      paper: this.paper() !== 'cartolina' ? this.paper() : undefined,
      scribbleInk: this.scribble() && this.scribbleInk() !== DEFAULT_SCRIBBLE_INK ? this.scribbleInk() : undefined,
      text: this.text().trim(),
      completedAt: this.dateValue(),
      ...audienceFields(this.audience(), prev, now),
      // editar não desfaz o check: a finalizada continua finalizada, no mesmo dia
      ...(prev?.doneAt ? { doneAt: prev.doneAt } : {}),
      // continua fixada: desafixada, ainda volta a ser sub-nota
      ...(prev?.pinnedSub && this.noteRank() === 'fixada' ? { pinnedSub: true as const } : {}),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    // tira os campos vazios (undefined) que a prévia leva
    const clean = Object.fromEntries(Object.entries(note).filter(([, v]) => v !== undefined)) as unknown as Review;
    // a prévia leva a marca de quem vê; fica só a que vale
    const seen = audienceFields(this.audience(), prev, now);
    if (!seen.private) delete (clean as Partial<Review>).private;
    if (!seen.quiet) delete (clean as Partial<Review>).quiet;
    // mudou o título: os links das outras anotações que abriam esta passam para o título novo
    const notes = notesOf(this.store.reviews());
    // nova, criada por um link e com outro título: o link de onde veio passa para o título novo
    // (se nenhuma outra anotação já atende por aquele título)
    const born = !prev && this.linkTitle && linkKey(this.linkTitle) !== linkKey(name) ? { ...clean, game: { ...clean.game, name: this.linkTitle } } : null;
    const relinked = prev
      ? relinkAfterRename(notes, prev, name, now)
      : born
        ? relinkAfterRename([...notes, born], born, name, now)
        : [];
    if (prev) this.store.update(clean);
    else this.store.add(clean);
    for (const n of relinked) this.store.update(n);
    this.snapshot = this.serialize();
    this.dialog().nativeElement.close();
    this.saved.emit({ id: clean.id, isNew: !prev, ...(relinked.length ? { relinked: relinked.length } : {}) });
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

  /** Reparte uma data guardada nos três campos. */
  private setDateParts(date: string | null): void {
    const [y = '', m = '', d = ''] = (date ?? '').split('-');
    this.dateYear.set(y);
    this.dateMonth.set(m);
    this.dateDay.set(d ? String(Number(d)) : '');
  }

  protected setToday(): void {
    this.setDateParts(this.today());
  }

  protected clearDate(): void {
    this.setDateParts(null);
    document.getElementById('editor-data')?.focus();
  }

  /** Só algarismos nos campos de dia e ano; o dia completo passa a vez para o mês. */
  protected typeDate(el: HTMLInputElement, part: 'day' | 'year'): void {
    const v = el.value.replace(/\D/g, '').slice(0, part === 'day' ? 2 : 4);
    if (el.value !== v) el.value = v;
    (part === 'day' ? this.dateDay : this.dateYear).set(v);
    if (part === 'day' && (v.length === 2 || Number(v) > 3)) document.getElementById('editor-data-mes')?.focus();
  }

  protected stepYear(delta: number): void {
    const top = Number(this.today().slice(0, 4));
    const y = Number(this.dateYear()) || top;
    this.dateYear.set(String(Math.min(top, Math.max(MIN_YEAR, y + delta))));
  }

  protected cancelDraft(): void {
    this.confirmingDraft.set(false);
  }

  protected async removeWish(): Promise<void> {
    const wish = this.fromWish();
    if (!wish) return;
    const sure = await this.confirm.ask({ text: this.removeText(wish.game.name, 'da wishlist'), confirm: 'Tirar da wishlist' });
    // o editor pode ter fechado ou trocado de ficha enquanto a pergunta estava aberta
    if (!sure || this.fromWish() !== wish) return;
    this.snapshot = this.serialize();
    this.dialog().nativeElement.close();
    this.wishRemoved.emit(wish.id);
  }

  protected async removeDraft(): Promise<void> {
    const draft = this.fromDraft();
    if (!draft) return;
    const sure = await this.confirm.ask({ text: this.removeText(draft.game.name, 'da fila'), confirm: 'Tirar da fila' });
    if (!sure || this.fromDraft() !== draft) return;
    this.snapshot = this.serialize();
    this.dialog().nativeElement.close();
    this.draftRemoved.emit(draft.id);
  }

  /** O "Tem certeza?" de tirar da fila ou da wishlist: com notas e texto já escritos, avisa que eles se perdem (o Desfazer não traz a resenha). */
  private removeText(name: string, from: 'da fila' | 'da wishlist'): string {
    return this.hasReviewContent()
      ? `“${name}” sai ${from}, e as notas e o texto que você escreveu se perdem.`
      : `“${name}” sai ${from}.`;
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
  private downOnBackdrop = false;

  // sem devolver nada: um handler que devolve false ganha preventDefault do Angular, e o campo clicado não recebe o foco
  protected onPointerDown(e: PointerEvent): void {
    this.downOnBackdrop = e.target === e.currentTarget;
  }

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
      this.paper(),
      this.pattern(),
      this.patternLook(),
      this.patternSeed(),
      this.scribble(),
      this.scribbleSeed(),
      this.scribbleInk(),
      this.damage(),
      this.damageSeed(),
      this.stain(),
      this.stainSeed(),
      this.decor(),
      this.decorSeed(),
      this.overrideOn() ? this.overrideText().trim() : null,
      this.categories().map((k) => this.scores()[k] ?? null),
      this.status(),
      this.verdict(),
      this.dateValue(),
      this.weights(),
      this.bonuses().map((b) => b.id),
      this.noteCategory(),
      this.noteTags(),
      this.hours().trim(),
      this.game()?.coverUrl,
      this.difficulty(),
      this.text().trim(),
      this.audience(),
      this.noteSize(),
      this.noteRank(),
    ]);
  }

  private focusFirstMissing(): void {
    const root = this.dialog().nativeElement;
    if (this.notes()) {
      setTimeout(() => {
        if (!this.noteTitle().trim()) root.querySelector<HTMLInputElement>('#editor-titulo-nota')?.focus();
        else root.querySelector<HTMLInputElement>('#editor-data')?.focus();
      });
      return;
    }
    setTimeout(() => {
      // na ordem da ficha: o status e a data vêm antes das notas
      if (!this.game()) this.search()?.focus();
      else if (!this.status()) root.querySelector<HTMLInputElement>('app-status-picker input')?.focus();
      else if (!this.dateValid()) root.querySelector<HTMLInputElement>('#editor-data')?.focus();
      else if (!this.hoursValid()) root.querySelector<HTMLInputElement>('#editor-horas')?.focus();
      else if (this.missingScores().length)
        root.querySelector<HTMLInputElement>(`[data-nota="${this.missingScores()[0]}"] input`)?.focus();
      else if (this.noneCounts()) root.querySelector<HTMLSelectElement>('.subs select')?.focus();
      else root.querySelector<HTMLInputElement>('#editor-nota-final')?.focus();
    });
  }

  /** Os ajustes da estampa como vão para a ficha: o de sempre não vai. */
  private lookFields(): Pick<Review, 'patternSpacing' | 'patternSize' | 'patternJitter' | 'patternInk'> {
    const l = this.patternLook();
    return {
      ...(l.spacing !== DEFAULT_LOOK.spacing ? { patternSpacing: l.spacing } : {}),
      ...(l.size !== DEFAULT_LOOK.size ? { patternSize: l.size } : {}),
      ...(l.jitter !== DEFAULT_LOOK.jitter ? { patternJitter: l.jitter } : {}),
      ...(l.ink !== undefined && l.ink !== DEFAULT_PATTERN_INK ? { patternInk: l.ink } : {}),
    };
  }

  /** Abre a nota na mão já com a média escrita, para a pessoa só ajustar; fechar volta à média. */
  protected setOverride(on: boolean): void {
    this.overrideOn.set(on);
    if (on && !this.overrideText().trim() && this.final() !== null) this.overrideText.set(formatRawScore(this.final()!));
    if (on) setTimeout(() => this.dialog().nativeElement.querySelector<HTMLInputElement>('#editor-nota-final')?.select());
  }

  protected scoreOf(k: RatedKey): number | null {
    return this.scores()[k] ?? null;
  }

  protected setScore(k: RatedKey, v: number | null): void {
    this.scores.update((cur) => ({ ...cur, [k]: v }));
  }
}
