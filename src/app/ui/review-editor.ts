import {
  ChangeDetectionStrategy,
  Component,
  DestroyRef,
  ElementRef,
  computed,
  effect,
  inject,
  output,
  signal,
  untracked,
  viewChild,
} from '@angular/core';
import { BackdropClose } from './backdrop-close';
import { LucideIconData } from 'lucide-angular';
import { ICON, ICON_CHOICE, IconModule } from './icons';
import { NgTemplateOutlet } from '@angular/common';
import {
  Bonus,
  Difficulty,
  Draft,
  Kind,
  PickedGame,
  NoteRank,
  Rated,
  RatedKey,
  Review,
  SCORE_LABEL,
  Status,
  NO_DAY_LABEL,
  DIFFICULTY_LABEL,
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
  TEXT_MAX,
  isNote,
  isMusicReview,
  cleanArtist,
  musicGame,
  fold,
  MUSIC_FORM_LABEL,
} from '../core/review';
import { GameLookup, isJointCredit, isSteamCover } from '../core/game-lookup';
import { cap, g, isMusic, isNotes, profileOf } from '../core/kinds';
import { Cloud } from '../core/cloud-config';
import { Mural } from '../core/mural';
import { OriginalSwap, ReviewStore } from '../core/review-store';
import { linkKey, linkableTitle, notesOf, relinkAfterRename, resolveNote } from '../core/note-links';
import { DEFAULT_LOOK, DEFAULT_PATTERN_INK, DEFAULT_SCRIBBLE_INK, Damage, DecorMark, Paper, Pattern, PatternLook, Scribble, StainMark, isAgedPaper, lookOf } from '../core/paper';
import { paperVars } from '../core/paper-art';
import type { CardLook } from '../core/card-look';
import { pinningFor } from '../core/wall-physics';
import { BonusPicker } from './bonus';
import { GroupPicker } from './group-picker';
import { SubjectPicker } from './subject-picker';
import { TagPicker } from './tag-picker';
import { KanbanProps } from './kanban-props';
import { CategoryLabel } from './category-label';
import { NoteTag } from './note-tag';
import { categoryLibrary, subjectLibrary, tagLibrary } from '../core/note-labels';
import { Settings } from '../core/settings';
import { CardKit } from './card-kit';
import { Confirm } from './confirm';
import { categoryColorHex, lookKey, randomCategoryColor, tagColorHex } from '../core/category-looks';
import { asksTag, newNoteAudience, prefsOf, savedSubjects } from '../core/mural-config';
import { CoverPicker } from './cover-picker';
import { CoverSleeve } from './cover-sleeve';
import { DifficultyPicker, Skulls } from './difficulty';
import { GameSearch } from './game-search';
import { MusicFields } from './music-fields';
import { JudgeLabel } from './judge-label';
import { FeedMenu } from './feed-menu';
import { Pin } from './pin';
import { ReviewCard } from './review-card';
import { RichEditor } from './rich-editor';
import { ScorePicker } from './score-picker';
import { StatusPicker } from './status-picker';
import { VerdictPicker } from './verdict';
import { napWall } from '../core/wall-settle';
import { readText, writeText } from '../core/storage';
import { reducedMotion } from '../core/motion';
import { anchorFor, caretSpot, caretY, scrollToShow } from './caret-follow';
import { SharedStore } from '../core/shared-store';
import { canManage } from '../core/shared-notes';
import { ShareSheet } from './share-sheet';
import { MONTHS_LONG } from '../core/dates';
import { KanbanStore } from '../core/kanban-store';
import { KanbanActions } from '../core/kanban-actions';
import { KanbanDeps } from '../core/kanban-deps';
import { Importance, KanbanBoard, cleanStatus, setImportance, setStatus } from '../core/kanban';

/** A prévia mostra a ficha inteira (lembrado neste aparelho). */
const WHOLE_KEY = 'meu-mural:editor:ficha-inteira';

export interface SavedEvent {
  id: string;
  isNew: boolean;
  /** Salvar trocou a original da obra (uma rejogada mais antiga que ela virou a original). */
  swap?: OriginalSwap | null;
  /** A anotação mudou de título: em quantas outras os links para ela foram atualizados. */
  relinked?: number;
}

/** As duas abas da ficha no editor. */
type EditorMode = 'escrever' | 'cartolina';

/** As etiquetas da fileira de propriedades (cada uma abre a sua parte). */
type PropId = 'grupo' | 'assunto' | 'tags' | 'data' | 'horas' | 'dificuldade' | 'quadro' | 'capa' | 'quem';

interface PropView {
  id: PropId;
  name: string;
  icon: LucideIconData;
  value: string;
  /** O que o leitor de tela diz depois do nome. */
  spoken: string;
  /** Tem algo escolhido: a etiqueta colada; sem nada, o recorte. */
  filled: boolean;
  error?: boolean;
  /** A cor da coluna (no Kanban). */
  tint?: string;
}


/** O ano mais antigo aceito na data (o mesmo limite da validação dos backups). */
const MIN_YEAR = 1971;


@Component({
  selector: 'app-review-editor',
  imports: [
    BackdropClose,
    IconModule,
    NgTemplateOutlet,
    BonusPicker,
    GroupPicker,
    SubjectPicker,
    TagPicker,
    KanbanProps,
    CategoryLabel,
    NoteTag,
    Skulls,
    CardKit,
    CoverPicker,
    CoverSleeve,
    DifficultyPicker,
    GameSearch,
    MusicFields,
    JudgeLabel,
    FeedMenu,
    Pin,
    ShareSheet,
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

  protected readonly CloseIcon = ICON.fechar;
  protected readonly LaterIcon = ICON.marcador;
  protected readonly TrashIcon = ICON.apagar;
  protected readonly SwapIcon = ICON.atualizar;
  protected readonly PinIcon = ICON.fixar;
  protected readonly DoneIcon = ICON.pronto;
  protected readonly RevisitIcon = ICON.repetir;
  protected readonly KeepIcon = ICON.copiado;
  protected readonly PrivateIcon = ICON.privada;
  protected readonly EveryoneIcon = ICON.publica;
  protected readonly SharedIcon = ICON.pessoas;
  /**
   * Quem vê: Público (o mural que os outros veem) ou Privado (só a pessoa, e ninguém é avisado).
   * Se a pública vai também para o Feed de quem segue não é uma terceira opção: pregar publica, e o
   * outro caminho fica na setinha ao lado do botão (ver `feedMenu`). Ver Review.private e Review.quiet.
   */
  protected readonly visibility = signal<'publica' | 'privada'>('publica');
  protected readonly isPrivate = computed(() => this.visibility() === 'privada');
  protected readonly visibilities = [
    { value: 'publica', label: 'Público', icon: ICON.pessoas },
    { value: 'privada', label: 'Privado', icon: ICON.privada },
  ] as const;
  protected readonly labels = SCORE_LABEL;
  protected readonly WriteIcon = ICON.escrever;
  protected readonly KitIcon = ICON.paleta;
  protected readonly ClearIcon = ICON.recomecar;
  protected readonly GrowIcon = ICON.aumentar;
  protected readonly ShrinkIcon = ICON.diminuir;

  /**
   * As duas abas da ficha, recortadas na beirada da faixa: o que se escreve (o texto e os detalhes) e
   * a cartolina (o estojo). No computador a ficha fica à vista nas duas, ao lado; no celular, só na
   * da cartolina, em cima do estojo.
   */
  protected readonly mode = signal<EditorMode>('escrever');

  protected setMode(m: EditorMode): void {
    this.mode.set(m);
    // a prévia aparece (no celular) ou muda de lugar: mede de novo depois de desenhar
    requestAnimationFrame(() => this.fitPreview());
  }

  /** Setas, Home e End trocam de aba, como um tablist. */
  protected onModeKey(e: KeyboardEvent): void {
    const order: EditorMode[] = ['escrever', 'cartolina'];
    if (!['ArrowRight', 'ArrowLeft', 'Home', 'End'].includes(e.key)) return;
    const next = e.key === 'ArrowRight' || e.key === 'End' ? 1 : 0;
    e.preventDefault();
    this.setMode(order[next]);
    this.dialog().nativeElement.querySelector<HTMLElement>(`#editor-modo-${order[next]}`)?.focus();
  }

  /**
   * A parte aberta embaixo da fileira de etiquetas (uma de cada vez), ou nenhuma. Tocar na etiqueta
   * de novo, o Pronto ou o Esc fecham, e o foco volta para a etiqueta.
   */
  protected readonly prop = signal<PropId | null>(null);

  protected toggleProp(id: PropId): void {
    if (this.prop() === id) this.closeProp();
    else this.openProp(id);
  }

  /** Abre a parte, com o foco no primeiro campo dela. */
  private openProp(id: PropId, focus = true): void {
    this.mode.set('escrever');
    this.prop.set(id);
    if (!focus) return;
    setTimeout(() => {
      if (id === 'grupo') this.groupPicker()?.focus();
      else if (id === 'assunto') this.subjectPicker()?.focus();
      else if (id === 'tags') this.tagPicker()?.focus();
      else this.dialog().nativeElement.querySelector<HTMLElement>('#editor-parte :is(input:checked, input:not([type=radio]), select, button)')?.focus();
    });
  }

  protected closeProp(e?: Event): void {
    e?.preventDefault();
    e?.stopPropagation();
    const was = this.prop();
    this.prop.set(null);
    if (was) setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>(`.prop[data-prop="${was}"]`)?.focus());
  }

  protected propName(id: PropId): string {
    return this.props().find((p) => p.id === id)?.name ?? '';
  }

  /** O grupo escolhido na parte Grupo: a parte fecha, e o lugar no quadro passa a ser o do grupo novo. */
  protected pickGroup(category: string | null): void {
    this.noteCategory.set(category);
    this.syncBoard();
    this.closeProp();
  }

  /** O assunto escolhido na parte Assunto: a parte fecha. */
  protected pickSubject(subject: string | null): void {
    this.noteSubject.set(subject);
    this.closeProp();
  }

  /** O ícone e a cor do grupo da anotação, na etiqueta (os mesmos da orelha no mural). */
  protected readonly groupLook = computed(() => {
    this.categoryLooks();
    const c = this.noteCategory();
    return c ? this.settings.categoryLook(c) : {};
  });
  protected readonly groupColor = computed(() => categoryColorHex(this.groupLook().color));

  /** A cor da tag no grupo da anotação, ou null (o papel pardo de sempre). */
  protected tagColor(tag: string): string | null {
    return tagColorHex(this.categoryLooks(), tag, this.noteCategory() ?? '');
  }

  /**
   * A fileira de etiquetas: o que a ficha tem além do nome e do texto (na anotação, o grupo, as tags,
   * a data, o lugar no Kanban, a capa e quem vê; na resenha, a data, a quantidade, a dificuldade, a
   * capa e quem vê), cada uma com o que está escolhido.
   */
  protected readonly props = computed<PropView[]>(() => {
    const out: PropView[] = [];
    const note = this.notes();
    const p = this.profile();
    if (note) {
      const c = this.noteCategory();
      out.push({ id: 'grupo', name: 'Grupo', icon: ICON.pasta, value: c ?? 'Grupo', spoken: c ?? 'sem grupo', filled: !!c });
      const s = this.noteSubject();
      out.push({ id: 'assunto', name: 'Assunto', icon: ICON.assunto, value: s ?? 'Assunto', spoken: s ?? 'sem assunto', filled: !!s });
      const tags = this.noteTags();
      out.push({ id: 'tags', name: 'Tags', icon: ICON.etiquetas, value: tags.join(', '), spoken: tags.length ? tags.join(', ') : 'nenhuma', filled: tags.length > 0 });
    }
    const day = this.dateShort();
    out.push({ id: 'data', name: note ? 'Data' : this.dateLabel(), icon: ICON.calendario, value: day, spoken: day, filled: true, error: this.attempted() && !this.dateValid() });
    if (!note && p.amount) {
      const v = this.hoursValue();
      const filled = typeof v === 'number' && !Number.isNaN(v);
      const value = filled ? `${String(v).replace('.', ',')} ${p.amount.unit}` : cap(p.amount.unit);
      out.push({ id: 'horas', name: p.amount.label, icon: ICON.relogio, value, spoken: filled ? value : 'em branco', filled, error: !this.hoursValid() });
    }
    if (!note && p.difficulty) {
      const d = this.difficulty();
      out.push({ id: 'dificuldade', name: p.difficulty, icon: ICON.caveira, value: d === 'nenhuma' ? 'Dificuldade' : DIFFICULTY_LABEL[d], spoken: DIFFICULTY_LABEL[d], filled: d !== 'nenhuma' });
    }
    const board = this.kbBoard();
    if (note && board) {
      const col = board.columns.find((x) => x.id === this.kbColumn());
      out.push({ id: 'quadro', name: 'Kanban', icon: ICON.colunas, value: col?.name ?? 'Kanban', spoken: col ? `${col.name}, no quadro ${this.noteCategory()}${this.kbWall() ? '' : ', só no Kanban'}` : 'fora do quadro', filled: !!col, tint: col?.color });
    }
    if (note || this.game()) {
      const has = !!this.game()?.coverUrl;
      out.push({ id: 'capa', name: 'Capa', icon: ICON.imagem, value: 'Capa', spoken: has ? 'com capa' : 'sem capa', filled: has });
    }
    if (this.sharedRole() || this.cloud.config()) {
      const shared = !!this.sharedRole();
      const value = this.isPrivate() ? 'Privada' : 'Pública';
      out.push({ id: 'quem', name: 'Quem vê', icon: shared ? ICON.pessoas : this.isPrivate() ? ICON.privada : ICON.publica, value, spoken: value.toLowerCase() + (shared ? ', compartilhada' : ''), filled: true });
    }
    return out;
  });

  /** A data numa palavra ("Hoje"), curta ("2 set 2026") ou "Sem data". */
  protected readonly dateShort = computed(() => {
    const v = this.dateValue();
    if (v === null) return 'Sem data';
    if (!this.dateValid()) return 'Data?';
    if (this.isToday()) return 'Hoje';
    // deste ano, sem o ano ("18 de out"): a etiqueta fica curta
    return formatReviewDate(v, v.length === 10 && v.startsWith(this.today().slice(0, 4)));
  });

  // ===== O lugar no quadro do grupo (a parte Kanban) =====

  private readonly kanban = inject(KanbanStore);
  private readonly kanbanActions = inject(KanbanActions);
  private readonly kanbanDeps = inject(KanbanDeps);
  /** O quadro do grupo da anotação (cada grupo tem o seu), ou null sem grupo. */
  protected readonly kbBoard = computed<KanbanBoard | null>(() => {
    const c = this.notes() ? this.noteCategory()?.trim() : '';
    return c ? this.kanban.boardFor(c) : null;
  });
  /**
   * A etapa (a coluna), a importância, o status e as dependências escolhidos: valem ao salvar (ver
   * `applyBoard`).
   */
  protected readonly kbColumn = signal<string | null>(null);
  protected readonly kbImportance = signal<Importance | null>(null);
  protected readonly kbStatus = signal('');
  protected readonly kbDeps = signal<readonly string[]>([]);
  /** Também no mural (`true`) ou só no Kanban, escolhido aqui; null: o que já vale (o da anotação, ou o do grupo). */
  private readonly kbWallChoice = signal<boolean | null>(null);
  /** Também no mural ou só no Kanban: o escolhido, senão o da anotação no quadro, senão o do grupo de agora. */
  protected readonly kbWall = computed(() => {
    const chosen = this.kbWallChoice();
    if (chosen !== null) return chosen;
    const card = this.kbBoard()?.cards.find((c) => c.note === this.id());
    const category = this.noteCategory();
    return card ? this.kanban.isOnWall(card, category) : !this.kanban.groupKanbanOnly(category);
  });
  protected setKbWall(wall: boolean): void {
    this.kbWallChoice.set(wall);
  }

  /** O lugar como está no quadro do grupo de agora (ou o pedido pela coluna de onde a nova veio). */
  private syncBoard(): void {
    const b = this.kbBoard();
    const card = b?.cards.find((c) => c.note === this.id());
    const spot = this.editing() ? null : this.kanban.pending();
    let column = card?.column ?? null;
    // a nova pedida de uma coluna: nela; trocado o grupo, na primeira coluna do quadro do grupo novo
    if (b && spot) column = b.id === spot.board && b.columns.some((c) => c.id === spot.column) ? spot.column : (b.columns[0]?.id ?? null);
    this.kbColumn.set(column);
    this.kbImportance.set(card?.importance ?? null);
    this.kbStatus.set(card?.status ?? '');
    this.kbDeps.set(card?.deps ?? []);
    this.kbWallChoice.set(null);
  }

  /**
   * Leva o que foi escolhido na parte Kanban para o quadro. A nova cai lá pelo pedido (`pending`, ver
   * App.onSaved, que finaliza se a coluna finaliza); a que já existia anda como no quadro (com a
   * pergunta das dependências e o Desfazer), e a importância e o status mudam depois de ela chegar.
   */
  private applyBoard(id: string, isNew: boolean): void {
    const b = this.kbBoard();
    const column = this.kbColumn();
    const status = cleanStatus(this.kbStatus());
    const deps = this.kbDeps();
    const wall = this.kbWallChoice();
    if (isNew) {
      // a escolha igual à do grupo não é guardada: a anotação segue o grupo
      const own = wall !== null && wall === this.kanban.groupKanbanOnly(this.noteCategory()) ? { wall } : {};
      this.kanban.pending.set(b && column ? { board: b.id, column, importance: this.kbImportance(), status, deps: [...deps], ...own } : null);
      return;
    }
    if (!b) return;
    const card = b.cards.find((c) => c.note === id);
    if (column === null) {
      if (card) this.kanbanActions.remove(b, id);
      return;
    }
    const importance = this.kbImportance();
    const rank = () => {
      this.kanban.update(b.id, (board, at) => {
        const now = board.cards.find((c) => c.note === id);
        if (!now) return board;
        const ranked = now.importance !== importance ? setImportance(board, id, importance, at) : board;
        return setStatus(ranked, id, status, at);
      });
      // a que acabou de entrar no quadro ganha as dependências agora (antes, não tinha onde guardar)
      if (deps.join() !== this.kanbanDeps.idsOf(id).join()) this.kanbanDeps.set(id, deps);
      if (wall !== null) this.kanban.setOnWall(id, wall);
    };
    // as dependências antes de andar: levar para uma coluna que finaliza pergunta pelas de agora
    if (deps.join() !== (card?.deps ?? []).join() && card) this.kanbanDeps.set(id, deps);
    if (card?.column === column) rank();
    else this.kanbanActions.move(b.id, id, column, undefined, rank);
  }

  // ===== A cartolina: tirar de uma vez tudo o que está por cima da cor =====

  /** A ficha tem algo além da cor (papel, estampa, rabisco, estrago, manchas, decorações). */
  protected readonly decorated = computed(
    () => this.paper() !== 'cartolina' || !!this.pattern() || !!this.scribble() || !!this.damage() || this.stains().length > 0 || this.decors().length > 0,
  );

  /** "Só a cartolina": a cor fica, o resto sai. */
  protected clearLayers(): void {
    this.paper.set('cartolina');
    this.paperSeed.set(null);
    this.pattern.set(null);
    this.patternSeed.set(null);
    this.scribble.set(null);
    this.scribbleSeed.set(null);
    this.damage.set(null);
    this.damageSeed.set(null);
    this.stains.set([]);
    this.decors.set([]);
  }

  /** O nome da anotação, escrito na faixa: a tira cresce com ele (Enter vai para o texto). */
  protected fitTitle(el: HTMLTextAreaElement | null): void {
    if (!el) return;
    el.style.height = 'auto';
    el.style.height = `${el.scrollHeight}px`;
  }

  protected toText(): void {
    this.writer()?.focus();
  }

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly previewSlot = viewChild.required<ElementRef<HTMLDivElement>>('previewSlot');
  private readonly previewFrame = viewChild.required<ElementRef<HTMLDivElement>>('previewFrame');
  private readonly search = viewChild(GameSearch);
  private readonly bonusPicker = viewChild(BonusPicker);
  private readonly groupPicker = viewChild<GroupPicker>('grupo');
  private readonly subjectPicker = viewChild<SubjectPicker>('assunto');
  private readonly tagPicker = viewChild<TagPicker>('tags');
  // pela marca no template, e não pela classe: os campos chegam por @defer, e citar a classe aqui os traria junto com o editor
  private readonly musicFields = viewChild<MusicFields>('campos');
  // pela marca do template, não pela classe: citar a classe traria o estojo de volta ao bundle inicial
  private readonly kit = viewChild<CardKit>('kit');
  private readonly writer = viewChild(RichEditor);
  private readonly kanbanProps = viewChild(KanbanProps);

  protected readonly id = signal(newId());
  protected readonly editing = signal<Review | null>(null);
  private readonly shared = inject(SharedStore);
  /** O papel de quem edita uma anotação compartilhada (null: não é compartilhada). */
  protected readonly sharedRole = computed(() => (this.editing() ? this.shared.role(this.id()) : null));
  /** O editor de uma compartilhada: quem vê fica como está (o grupo, o assunto e as tags são de cada um). */
  protected readonly structureLocked = computed(() => {
    const role = this.sharedRole();
    return !!role && !canManage(role);
  });
  /**
   * A compartilhada como está no mural agora: quem vê muda em Compartilhar (aberto daqui ou da
   * leitura), não no editor, então é esta que diz se ela é privada, e não a que o editor abriu.
   */
  private readonly liveShared = computed(() => (this.sharedRole() ? (this.store.get(this.id()) ?? null) : null));
  /** A folha Compartilhar, aberta pelo "Quem vê?" da compartilhada. */
  protected readonly shareOpen = signal(false);
  /** Mudou em Compartilhar: a prévia (o cadeado) e o que o editor salva seguem a anotação. */
  private readonly followShared = effect(() => {
    const live = this.liveShared();
    if (live) untracked(() => this.visibility.set(live.private ? 'privada' : 'publica'));
  });
  /** Como a ficha editada estava: publicada, só no mural (sem Feed) ou privada; null na ficha nova. */
  private readonly wasAudience = computed(() => {
    const prev = this.liveShared() ?? this.editing();
    return prev ? audienceOf(prev) : null;
  });
  /**
   * O botão principal leva a pública para o Feed? Sim, a não ser na que já estava só no mural: salvar
   * uma correção nela não avisa ninguém de repente. O caminho contrário fica na setinha.
   */
  protected readonly announces = computed(() => {
    const was = this.wasAudience();
    return was ? was !== 'visivel' : !this.bornQuiet();
  });
  /**
   * A anotação nova nasce Disponível (pública, fora do Feed): o botão principal prega sem avisar e a
   * setinha publica no Feed. Vem das configurações do mural (ver `followDefaults`).
   */
  protected readonly bornQuiet = signal(false);
  /** A pessoa escolheu Público ou Privado nesta ficha: a categoria não muda mais a escolha. */
  private audienceTouched = false;
  /**
   * A setinha ao lado do botão: só com a nuvem, na pública, e enquanto o Feed ainda é uma escolha (a
   * ficha que já foi para o Feed não tem como voltar atrás: o aviso foi dado).
   */
  protected readonly feedMenu = computed(() => !!this.cloud.config() && !this.isPrivate() && this.wasAudience() !== 'publicar');
  /** O outro caminho, escrito no bilhete da setinha. */
  protected readonly feedAlt = computed(() => {
    const verb = this.editing() ? 'Salvar' : 'Pregar';
    return this.announces()
      ? { label: `${verb} sem publicar no Feed`, hint: 'Fica no seu mural e no seu perfil, mas não aparece no Feed de quem segue você.' }
      : { label: `${verb} e publicar no Feed`, hint: 'Continua no seu mural e aparece no Feed de quem segue você, como nova a partir de hoje.' };
  });
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
  /** Uma ficha de música: uma resenha com o tipo (álbum ou música), o artista e o que toca no vinil (ver MusicFields). */
  protected readonly music = computed(() => isMusic(this.kind()));
  protected readonly formLabel = MUSIC_FORM_LABEL;
  /** Os artistas que o mural de músicas já tem, os com mais fichas primeiro: as sugestões do campo. */
  protected readonly artistLib = computed(() => {
    const seen = new Map<string, { name: string; n: number }>();
    for (const r of this.store.reviews()) {
      if (!isMusicReview(r) || !r.category) continue;
      const hit = seen.get(fold(r.category));
      if (hit) hit.n++;
      else seen.set(fold(r.category), { name: r.category, n: 1 });
    }
    return [...seen.values()].sort((a, b) => b.n - a.n || a.name.localeCompare(b.name, 'pt-BR')).map((x) => x.name);
  });
  /** O item acabou de ser escolhido na busca (e não veio de uma ficha que já existia). */
  protected readonly freshPick = signal(false);
  /** Quantas vezes o editor abriu: os campos da música recomeçam a cada vez. */
  protected readonly openCount = signal(0);
  /** O artista como vai para a ficha de música (a categoria dela); vazio, sem artista. */
  private readonly artistValue = computed(() => (this.music() ? cleanArtist(this.noteCategory() ?? '') : ''));
  /** O título da anotação, como está sendo escrito (vai no `game.name`). */
  protected readonly noteTitle = computed(() => this.game()?.name ?? '');
  /** A anotação como "item", para a escolha da capa (só link colado ou sem capa: não há catálogo). */
  protected readonly noteGame = computed<PickedGame>(() => this.game() ?? { name: '', coverUrl: null, source: 'manual' });
  /**
   * Fixada no topo ou comum (null): não se escolhe aqui (fixar é pelo alfinete da ficha e da leitura);
   * o editor só guarda o lugar que a anotação já tinha.
   */
  protected readonly noteRank = signal<NoteRank | null>(null);
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
  protected readonly months = MONTHS_LONG;
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
    if (!isValidReviewDate(value)) return `${MONTHS_LONG[Number(this.dateMonth()) - 1]} de ${y} não tem dia ${Number(this.dateDay())}.`;
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
  /** O texto passou do limite (o campo não deixa, mas um widget ou um atalho pode passar): não salva. */
  protected readonly textMax = TEXT_MAX;
  protected readonly textMaxShown = TEXT_MAX.toLocaleString('pt-BR');
  protected readonly textTooLong = computed(() => this.text().trim().length > TEXT_MAX);
  protected readonly textExcess = computed(() => (this.text().trim().length - TEXT_MAX).toLocaleString('pt-BR'));
  /** Já tem nota ou texto e a pessoa pediu para guardar só o jogo: confirma antes de perder. */
  protected readonly confirmingDraft = signal(false);
  protected readonly draftError = signal(false);
  protected readonly searchSeed = signal('');

  /** A ficha em branco já nasce com uma cor sorteada; a pessoa troca pela que quiser. */
  protected readonly stock = signal<Stock>('amarelo');
  /** O papel da cartolina, a estampa, o rabisco e o estrago: a ficha nova nasce na cartolina de sempre, sem nada. */
  protected readonly paper = signal<Paper>('cartolina');
  /** O jeito do papel marcado pelo tempo (desbotado, carregando) que a pessoa sorteou. */
  protected readonly paperSeed = signal<number | null>(null);
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
  /** As manchas por cima do papel (até três, na ordem em que foram escolhidas), cada uma com o jeito sorteado. */
  protected readonly stains = signal<StainMark[]>([]);
  /** As decorações por cima de tudo, como as manchas. */
  protected readonly decors = signal<DecorMark[]>([]);
  protected readonly headPaper = computed(() => paperVars(this.paper(), this.pattern() ?? undefined, this.patternLook(), this.patternSeed(), isDarkStock(this.stock())));
  protected readonly pin = computed(() => pinningFor(this.id(), this.stock()));
  protected readonly library = computed(() => this.store.customBonuses()[this.kind()]);
  /** A categoria, o assunto e as tags da anotação (ver core/note-labels.ts). */
  protected readonly noteCategory = signal<string | null>(null);
  protected readonly noteSubject = signal<string | null>(null);
  protected readonly noteTags = signal<string[]>([]);
  private readonly settings = inject(Settings);
  /** O ícone e a cor das suas categorias, na orelha da prévia. */
  protected readonly categoryLooks = this.settings.categoryLooks;
  /** A cartela de categorias: a pronta e as escritas nas outras anotações. */
  protected readonly categoryLib = computed(() => categoryLibrary(this.store.notes()));
  /**
   * Toda categoria nova (nenhuma anotação nela ainda) ganha uma das cores, sorteada, assim que é
   * escolhida: a prévia e o "Ícone e cor" já mostram a cor, e dá para trocar ou tirar ali. Uma vez só
   * por categoria enquanto o editor existe: tirada a cor, ela não volta sozinha.
   */
  private readonly drawnColors = new Set<string>();
  private readonly drawColor = effect(() => {
    const category = this.notes() ? this.noteCategory()?.trim() : null;
    if (!category) return;
    untracked(() => {
      const key = lookKey(category);
      if (this.drawnColors.has(key)) return;
      this.drawnColors.add(key);
      const look = this.settings.categoryLook(category);
      if (look.color || this.store.notes().some((n) => !!n.category && lookKey(n.category) === key)) return;
      this.settings.setCategoryLook(category, { ...look, color: randomCategoryColor() });
    });
  });
  /**
   * A anotação nova acompanha a categoria: escolher "Viagens!" faz ela nascer como Viagens! nasce
   * (configurações do mural), até a pessoa escolher Público ou Privado à mão.
   */
  private readonly followDefaults = effect(() => {
    this.noteCategory();
    this.settings.notesConfig();
    if (!this.notes() || this.editing()) return;
    untracked(() => this.applyDefaultAudience());
  });

  /** Põe a anotação nova como o mural (ou a categoria) manda, se a pessoa ainda não escolheu. */
  private applyDefaultAudience(): void {
    if (!this.notes() || this.editing() || this.audienceTouched) return;
    const audience = newNoteAudience(this.settings.notesConfig(), this.noteCategory());
    this.visibility.set(audience === 'privada' ? 'privada' : 'publica');
    this.bornQuiet.set(audience === 'visivel');
  }

  /** Público ou Privado, escolhido à mão: vale até fechar, troque a categoria ou não. */
  protected pickVisibility(v: 'publica' | 'privada'): void {
    this.audienceTouched = true;
    this.visibility.set(v);
  }

  /** Os assuntos à mão: os criados nas configurações e os das outras anotações do mesmo grupo. */
  protected readonly subjectLib = computed(() => subjectLibrary(this.store.notes(), savedSubjects(this.settings.notesConfig(), this.noteCategory()), this.noteCategory()));

  /** As tags à mão: as fixas e as das outras anotações da mesma categoria. */
  protected readonly tagLib = computed(() => tagLibrary(this.store.notes(), this.settings.pinnedTags(), this.noteCategory()));

  /** No celular a prévia é a ficha simples, que cabe no alto do estojo sem empurrar o resto. */
  protected readonly phone = signal(false);
  /** Tela larga: a ficha fica à vista ao lado, nas duas abas (ver o palco). */
  protected readonly wide = signal(false);
  protected readonly previewScale = signal(1);
  /** A altura da ficha encolhida (no estreito, o palco tem a altura dela). */
  protected readonly previewHeight = signal(0);
  private previewObserver: ResizeObserver | null = null;

  /**
   * A prévia com a ficha inteira, como em Fichas inteiras no mural: o texto todo, sem corte, e a
   * coluna rola. Só no largo, onde a prévia fica ao lado do texto e serve para ver na hora o que se
   * escreve; a escolha fica neste aparelho.
   */
  protected readonly whole = signal(readText(WHOLE_KEY) === '1');
  /**
   * Inteira sozinha: enquanto o foco está no texto (o campo, a régua, as folhas dele), a ficha fica
   * inteira; o foco em qualquer outra coisa do editor a fecha. Aberta pelo botão (`whole`), ela não
   * fecha sozinha.
   */
  protected readonly autoWhole = signal(false);
  /** A ficha está inteira, pelo botão ou pelo texto (o botão mostra assim). */
  protected readonly wholeOn = computed(() => this.whole() || this.autoWhole());
  protected readonly showWhole = computed(() => this.wide() && this.wholeOn());
  /** A ficha mudou de tamanho: inteira, vai até o cursor (ou fica no alto); de volta, no alto. */
  private readonly refitWhole = effect(() => {
    const on = this.showWhole();
    untracked(() =>
      requestAnimationFrame(() => {
        this.fitPreview();
        if (!on || !this.followCaret('instant')) this.previewSlot().nativeElement.scrollTo({ top: 0, behavior: 'instant' });
      }),
    );
  });
  /** O campo do texto onde o cursor esteve por último (a régua tira o foco dele, não o cursor). */
  private caretArea: HTMLTextAreaElement | null = null;
  private followFrame = 0;
  /** O texto mudou (digitando ou pela régua): a prévia vai até o cursor depois de desenhar. */
  private readonly followText = effect(() => {
    this.text();
    untracked(() => this.followSoon());
  });

  /**
   * De onde sai o desenho do papel desta ficha (ver artIdOf): o da própria ficha, o da original numa
   * rejogada, ou o que ficou guardado depois que a original trocou.
   */
  protected readonly artId = signal('');
  /** `artFrom` só vai para a ficha quando não é o de sempre. */
  private artFields(): Pick<Review, 'artFrom'> {
    return this.artId() !== (this.revisitRoot() ?? this.id()) ? { artFrom: this.artId() } : {};
  }

  /** As outras anotações, para o aviso de título repetido (só na anotação). */
  protected readonly otherNotes = computed(() => (this.notes() ? this.linkNotes() : null));
  /**
   * As anotações que os links "[[Título]]" do texto podem abrir (ver core/note-links.ts): na anotação,
   * as outras; na resenha, todas (uma resenha também aponta para as suas anotações).
   */
  protected readonly linkNotes = computed(() => notesOf(this.store.reviews()).filter((n) => n.id !== this.id()));

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
   * Uma anotação nova escrita dentro de uma aba do mural: já vem com a categoria da aba. Fechar sem
   * mexer em nada não pergunta se quer descartar.
   */
  openInCategory(category: string, look?: CardLook, subject?: string | null): void {
    this.open(undefined, undefined, undefined, undefined, 'anotacoes');
    this.noteCategory.set(category);
    // com um assunto só ligado no filtro do mural, a nova já nasce nele
    if (subject) this.noteSubject.set(subject);
    // de uma coluna do Kanban com card padrão: a cartolina dele (o estojo continua mudando)
    if (look) this.setLook(look);
    this.applyDefaultAudience();
    this.syncBoard();
    this.snapshot = this.serialize();
  }

  /** O estojo com um visual pronto (o card padrão de uma coluna do Kanban); o que ele não tem, o de sempre. */
  private setLook(look: CardLook): void {
    if (look.stock) this.stock.set(look.stock);
    this.paper.set(look.paper ?? 'cartolina');
    this.paperSeed.set(look.paperSeed ?? null);
    this.pattern.set(look.pattern ?? null);
    this.patternLook.set(lookOf(look));
    this.patternSeed.set(look.patternSeed ?? null);
    this.scribble.set(look.scribble ?? null);
    this.scribbleSeed.set(look.scribbleSeed ?? null);
    this.scribbleInk.set(look.scribbleInk ?? DEFAULT_SCRIBBLE_INK);
    this.damage.set(look.damage ?? null);
    this.damageSeed.set(look.damageSeed ?? null);
    this.stains.set([...(look.stains ?? [])]);
    this.decors.set([...(look.decors ?? [])]);
  }

  /**
   * Uma anotação nova já com o título: o link para uma anotação que ainda não existia. Nasce comum,
   * no grupo da anotação de onde veio.
   */
  openNote(title: string, from: Review | null = null): void {
    // sempre no mural de anotações, de onde quer que venha o link
    this.open(undefined, undefined, undefined, undefined, 'anotacoes');
    this.setNoteTitle(title);
    // veio de outra anotação: tem o mesmo assunto (de uma resenha, nenhum)
    const fromNote = !!from && isNote(from);
    this.noteCategory.set(fromNote ? (from.category ?? null) : null);
    this.noteSubject.set(fromNote ? (from.subject ?? null) : null);
    this.applyDefaultAudience();
    this.syncBoard();
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
      ...(this.notes() && this.noteRank() ? { noteRank: this.noteRank()! } : {}),
      ...(this.notes() && this.noteCategory() ? { category: this.noteCategory()! } : {}),
      ...(this.artistValue() ? { category: this.artistValue() } : {}),
      ...(this.notes() && this.noteSubject() ? { subject: this.noteSubject()! } : {}),
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
      paperSeed: this.paperSeed() ?? undefined,
      pattern: this.pattern() ?? undefined,
      ...this.lookFields(),
      patternSeed: this.patternSeed() ?? undefined,
      scribble: this.scribble() ?? undefined,
      scribbleSeed: this.scribbleSeed() ?? undefined,
      scribbleInk: this.scribbleInk(),
      damage: this.damage() ?? undefined,
      damageSeed: this.damageSeed() ?? undefined,
      stains: this.stains().length ? this.stains() : undefined,
      decors: this.decors().length ? this.decors() : undefined,
      text: this.text(),
      completedAt: this.dateValid() ? this.dateValue() : this.today(),
      ...(this.revisitRoot() ? { revisitOf: this.revisitRoot()! } : {}),
      ...this.artFields(),
      ...(this.isPrivate() ? { private: true as const } : {}),
      createdAt: '',
      updatedAt: '',
    };
  });

  constructor() {
    const mq = matchMedia('(max-width: 699px)');
    const wq = matchMedia('(min-width: 1024px)');
    const sync = () => {
      this.phone.set(mq.matches);
      this.wide.set(wq.matches);
    };
    sync();
    mq.addEventListener('change', sync);
    wq.addEventListener('change', sync);
    inject(DestroyRef).onDestroy(() => {
      mq.removeEventListener('change', sync);
      wq.removeEventListener('change', sync);
      this.previewObserver?.disconnect();
      cancelAnimationFrame(this.followFrame);
    });
  }

  /**
   * A ficha cabe no palco: no largo, na altura que a coluna dá; no estreito, em até 40% da tela (o
   * palco fica com a altura da ficha encolhida, e o estojo logo embaixo).
   */
  private fitPreview(): void {
    // inteira, a ficha fica do tamanho de verdade e a coluna rola
    if (this.showWhole()) {
      this.previewScale.set(1);
      return;
    }
    const slot = this.previewSlot().nativeElement;
    const natural = this.previewFrame().nativeElement.offsetHeight;
    if (!natural) return;
    const cap = this.wide() ? slot.clientHeight : Math.round(innerHeight * 0.4);
    if (!cap) return;
    const scale = Math.min(1, cap / natural);
    this.previewScale.set(scale);
    this.previewHeight.set(Math.ceil(natural * scale));
  }

  /** O botão: inteira (por ele ou pelo texto), volta ao tamanho do mural; senão, abre e fica aberta. */
  protected toggleWhole(): void {
    const on = !this.wholeOn();
    this.whole.set(on);
    this.autoWhole.set(false);
    writeText(WHOLE_KEY, on ? '1' : '0');
  }

  /**
   * O foco andou no editor: no texto (o campo, a régua, a folha de um widget, a tela cheia), a ficha
   * fica inteira; fora dele, volta. O botão da ficha inteira não conta (quem decide é o clique nele).
   */
  protected focusMoved(e: FocusEvent): void {
    const at = e.target;
    if (!(at instanceof Element) || at.closest('.ver-inteira')) return;
    this.autoWhole.set(!!at.closest('app-rich-editor'));
  }

  /** O cursor entrou num campo do texto (o de sempre ou o grande). */
  protected caretFrom(e: Event): void {
    if (e.target instanceof HTMLTextAreaElement) this.caretArea = e.target;
    this.followSoon();
  }

  /** O cursor andou ou o texto mudou: no próximo quadro (já com a ficha desenhada), a prévia vai até ele. */
  protected followSoon(): void {
    if (!this.showWhole() || !this.caretArea) return;
    cancelAnimationFrame(this.followFrame);
    this.followFrame = requestAnimationFrame(() => this.followCaret());
  }

  /**
   * A coluna da prévia rola até a linha do cursor (ver ui/caret-follow.ts), com folga de umas linhas
   * em cima e embaixo; parada, se ela já está à vista. Diz se achou a linha na ficha.
   */
  private followCaret(behavior: ScrollBehavior = reducedMotion() ? 'instant' : 'smooth'): boolean {
    const area = this.caretArea;
    if (!area?.isConnected || area.hidden || !this.showWhole()) return false;
    const slot = this.previewSlot().nativeElement;
    const at = area.selectionDirection === 'backward' ? area.selectionStart : area.selectionEnd;
    const { line, frac } = caretSpot(area.value, at);
    const spot = anchorFor(slot, line);
    if (!spot) return false;
    const top = scrollToShow(slot.scrollTop, slot.clientHeight, caretY(slot, spot, line, frac), 96);
    // no começo do texto, o alto da ficha (o nome, a tachinha) também fica à vista
    const start = slot.querySelector<HTMLElement>('[data-l]');
    const textTop = start ? start.getBoundingClientRect().top - slot.getBoundingClientRect().top + slot.scrollTop : 0;
    if (top !== null) slot.scrollTo({ top: top < textTop ? 0 : top, behavior });
    return true;
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
      if (!this.noteTitle().trim()) m.push('o nome');
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
    if (this.soundProblem()) m.push('um link que toque no vinil (ou tirar o link)');
    return m;
  });

  /** O link da música não toca aqui (ver MusicFields.problem): a ficha não vai com um disco mudo sem avisar. */
  private readonly soundProblem = computed(() => this.music() && !!this.musicFields()?.problem());

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
    this.freshPick.set(false);
    this.openCount.update((n) => n + 1);
    this.shareOpen.set(false);
    // a resenha nasce pública; a anotação, como o mural manda (privada, a não ser que a pessoa mude
    // na engrenagem do mural; a categoria escolhida depois pode mudar, ver `followDefaults`)
    this.audienceTouched = false;
    this.bornQuiet.set(false);
    this.visibility.set(review ? (review.private ? 'privada' : 'publica') : isNotes(kind) ? 'privada' : 'publica');
    this.noteRank.set(review?.noteRank ?? null);
    // abre sempre no que se escreve, com as partes fechadas
    this.mode.set('escrever');
    this.prop.set(null);
    // O pendente (ou o desejo) vira a resenha com o mesmo id.
    this.id.set(review?.id ?? draft?.id ?? wish?.id ?? newId());
    // a rejogada nova desenha como a original desenha hoje (que pode ser com o id de antes)
    const rootReview = root ? (this.store.get(root) ?? null) : null;
    this.artId.set(review ? artIdOf(review) : root ? (rootReview ? artIdOf(rootReview) : root) : this.id());
    // a rejogada nova já nasce com a cartolina da original, igualzinha (o papel é desenhado com o id
    // dela, ver artIdOf); a pessoa muda no estojo se quiser
    const look = review ?? (root ? (rootReview ?? revisitOf) : undefined);
    this.stock.set(look?.stock ?? this.store.nextStock(kind));
    this.paper.set(look?.paper ?? 'cartolina');
    this.paperSeed.set(look?.paperSeed ?? null);
    this.pattern.set(look?.pattern ?? null);
    this.patternLook.set(lookOf(look ?? {}));
    this.patternSeed.set(look?.patternSeed ?? null);
    this.scribble.set(look?.scribble ?? null);
    this.scribbleSeed.set(look?.scribbleSeed ?? null);
    this.scribbleInk.set(look?.scribbleInk ?? DEFAULT_SCRIBBLE_INK);
    this.damage.set(look?.damage ?? null);
    this.damageSeed.set(look?.damageSeed ?? null);
    this.stains.set(look?.stains ?? []);
    this.decors.set(look?.decors ?? []);
    this.overrideOn.set(review?.finalOverride !== undefined);
    // a nota como foi dada: com "Inteiros" em Ajustes, um 8,5 escrito como 9 viraria 9 ao salvar
    this.overrideText.set(review?.finalOverride !== undefined ? formatRawScore(review.finalOverride) : '');
    this.kit()?.reset();
    this.game.set(review?.game ?? draft?.game ?? wish?.game ?? (root ? (rootReview?.game ?? revisitOf!.game) : null));
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
    // a música que vem da fila, da wishlist ou de uma reescuta já traz o artista: o da original, ou o do catálogo
    const artist = isMusic(kind) && !review ? cleanArtist(rootReview?.category ?? this.game()?.by ?? '') : '';
    this.noteCategory.set(review?.category ?? (artist || null));
    this.noteSubject.set(review?.subject ?? null);
    this.noteTags.set([...(review?.tags ?? [])]);
    this.applyDefaultAudience();
    this.tagPicker()?.reset();
    this.hours.set(review?.hoursPlayed === null || review?.hoursPlayed === undefined ? '' : String(review.hoursPlayed).replace('.', ','));
    this.coverAbort?.abort();
    this.text.set(review?.text ?? '');
    this.writer()?.reset();
    this.searchSeed.set('');
    // a busca que ficou aberta da última vez (talvez de outro mural) volta vazia
    this.search()?.reset();
    this.attempted.set(false);
    this.confirmingDraft.set(false);
    this.draftError.set(false);
    this.syncBoard();
    this.snapshot = this.serialize();
    const dialog = this.dialog().nativeElement;
    // O diálogo é sempre o mesmo: sem isso, abre rolado onde a resenha anterior ficou
    const toTop = () => {
      dialog.scrollTop = 0;
      dialog.querySelectorAll('.conteudo, .previa-slot, app-card-kit .painel').forEach((pane) => pane.scrollTo({ top: 0, behavior: 'instant' }));
    };
    toTop();
    this.previewScale.set(1);
    this.caretArea = null;
    this.autoWhole.set(false);
    // as fichas montadas fora da tela dormem enquanto o diálogo está aberto (ver core/wall-settle.ts)
    napWall();
    dialog.showModal();
    this.previewObserver?.disconnect();
    this.previewObserver = new ResizeObserver(() => this.fitPreview());
    this.previewObserver.observe(this.previewSlot().nativeElement);
    this.previewObserver.observe(this.previewFrame().nativeElement);
    this.fitPreview();
    toTop();
    // e de novo depois que o conteúdo da resenha nova desenhar (e o foco ir para a busca)
    requestAnimationFrame(toTop);
    // o nome na faixa cresce com ele (depois de desenhar: o campo pode ainda não existir)
    setTimeout(() => this.fitTitle(this.dialog().nativeElement.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')));
    if (!review && !draft && !root) {
      // depois de desenhar: trocando de mural, o campo do título ainda não existe neste instante
      setTimeout(() =>
        isNotes(kind) ? this.dialog().nativeElement.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')?.focus() : this.search()?.focus(),
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
    this.game.set(game);
    this.draftError.set(false);
    // a música já vem com o artista do catálogo (dá para mudar); o álbum sai tocando a primeira faixa
    if (this.music()) {
      const credited = game.by ? cleanArtist(game.by) : null;
      this.noteCategory.set(credited);
      this.freshPick.set(true);
      // creditada a mais de um nome: a aba é a do artista principal
      if (credited && isJointCredit(credited)) void this.mainArtist(game, credited);
    }
    // Achou na RAWG: tenta logo a capa da Steam, que tem o título.
    if (game.source === 'rawg') void this.steamCover(game);
  }

  /**
   * "Daft Punk, Pharrell Williams & Nile Rodgers" vai para a aba do Daft Punk: o catálogo diz quem é
   * o artista principal. Se a pessoa já mexeu no campo (ou trocou de item) enquanto procurava, fica o dela.
   */
  private async mainArtist(game: PickedGame, credited: string): Promise<void> {
    const ctrl = new AbortController();
    this.coverAbort = ctrl;
    try {
      const main = await this.lookup.primaryArtist(game, ctrl.signal);
      if (main && !ctrl.signal.aborted && this.game()?.sourceId === game.sourceId && this.noteCategory() === credited) this.noteCategory.set(cleanArtist(main));
    } catch {
      // sem o catálogo agora, fica o nome como veio
    }
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
    this.searchSeed.set(this.game()?.name ?? '');
    this.game.set(null);
    setTimeout(() => this.search()?.focus());
  }

  /**
   * Prega (ou salva). `other`: pelo outro caminho da setinha, que troca o Feed (ver `announces`).
   */
  protected save(e: Event | null, other = false): void {
    e?.preventDefault();
    // o status do Kanban que ainda está sendo escrito vale também
    this.kanbanProps()?.flush();
    this.attempted.set(true);
    const audience: Audience = this.isPrivate() ? 'privada' : this.announces() !== other ? 'publicar' : 'visivel';
    if (this.notes()) {
      void this.saveNote(audience);
      return;
    }
    const game = this.game();
    const final = this.shown();
    const status = this.status();
    if (!game || final === null || this.missingScores().length || this.noneCounts() || !status || !this.dateValid() || !this.hoursValid() || this.textTooLong() || this.soundProblem()) {
      this.focusFirstMissing();
      return;
    }
    const now = new Date().toISOString();
    const prev = this.editing();
    const review: Review = {
      id: this.id(),
      kind: this.kind(),
      game: this.music() ? musicGame(game) : game,
      ...(this.artistValue() ? { category: this.artistValue() } : {}),
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
      ...(isAgedPaper(this.paper()) && this.paperSeed() ? { paperSeed: this.paperSeed()! } : {}),
      ...(this.pattern() ? { pattern: this.pattern()!, ...this.lookFields() } : {}),
      ...(this.pattern() && this.patternSeed() ? { patternSeed: this.patternSeed()! } : {}),
      ...(this.scribble() ? { scribble: this.scribble()! } : {}),
      ...(this.scribble() && this.scribbleSeed() ? { scribbleSeed: this.scribbleSeed()! } : {}),
      ...(this.scribble() && this.scribbleInk() !== DEFAULT_SCRIBBLE_INK ? { scribbleInk: this.scribbleInk() } : {}),
      ...(this.damage() ? { damage: this.damage()! } : {}),
      ...(this.damage() && this.damageSeed() ? { damageSeed: this.damageSeed()! } : {}),
      ...(this.stains().length ? { stains: this.stains() } : {}),
      ...(this.decors().length ? { decors: this.decors() } : {}),
      ...(this.overrideOn() ? { finalOverride: final } : {}),
      text: this.text().trim(),
      completedAt: this.dateValue(),
      ...(this.revisitRoot() ? { revisitOf: this.revisitRoot()! } : {}),
      ...this.artFields(),
      // passou a ser publicada agora: para quem segue, ela é nova a partir de hoje
      ...audienceFields(audience, prev, now),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    // com a versão que o editor abriu: se outra chegou enquanto ele estava aberto, ela fica guardada
    const swap = prev ? this.store.update(review, prev) : this.store.add(review);
    const draft = this.fromDraft();
    if (draft) this.store.removeDraft(draft.id, false);
    const wish = this.fromWish();
    if (wish) this.store.removeWish(wish.id, false);
    this.snapshot = this.serialize();
    this.shut();
    this.saved.emit({ id: review.id, isNew: !prev, swap });
  }

  /**
   * Prega a anotação: só o título é obrigatório; sem notas, status, veredito nem dificuldade. Sem
   * categoria ou sem tag, pergunta antes (ver `okWithoutLabels`).
   */
  private async saveNote(audience: Audience): Promise<void> {
    const name = this.noteTitle().trim();
    if (!name || !this.dateValid() || this.textTooLong()) {
      this.focusFirstMissing();
      return;
    }
    if (!(await this.okWithoutLabels())) return;
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
      paperSeed: isAgedPaper(this.paper()) ? (this.paperSeed() ?? undefined) : undefined,
      scribbleInk: this.scribble() && this.scribbleInk() !== DEFAULT_SCRIBBLE_INK ? this.scribbleInk() : undefined,
      text: this.text().trim(),
      completedAt: this.dateValue(),
      ...audienceFields(audience, this.liveShared() ?? prev, now),
      // editar não desfaz o check: a finalizada continua finalizada, no mesmo dia
      ...(prev?.doneAt ? { doneAt: prev.doneAt } : {}),
      createdAt: prev?.createdAt ?? now,
      updatedAt: now,
    };
    // tira os campos vazios (undefined) que a prévia leva
    const clean = Object.fromEntries(Object.entries(note).filter(([, v]) => v !== undefined)) as unknown as Review;
    // a prévia leva a marca de quem vê; fica só a que vale
    const seen = audienceFields(audience, this.liveShared() ?? prev, now);
    if (!seen.private) delete (clean as Partial<Review>).private;
    if (!seen.quiet) delete (clean as Partial<Review>).quiet;
    // mudou o título: os links das outras anotações (e das resenhas) que abriam esta passam para o título novo
    const notes = notesOf(this.store.reviews());
    const others = this.store.reviews().filter((r) => !isNote(r));
    // nova, criada por um link e com outro título: o link de onde veio passa para o título novo
    // (se nenhuma outra anotação já atende por aquele título)
    const born = !prev && this.linkTitle && linkKey(this.linkTitle) !== linkKey(name) ? { ...clean, game: { ...clean.game, name: this.linkTitle } } : null;
    const relinked = prev
      ? relinkAfterRename(notes, prev, name, now, others)
      : born
        ? relinkAfterRename([...notes, born], born, name, now, others)
        : [];
    if (prev) this.store.update(clean, prev);
    else this.store.add(clean);
    for (const n of relinked) this.store.update(n);
    // o lugar no quadro do grupo, como ficou na parte Kanban
    this.applyBoard(clean.id, !prev);
    this.snapshot = this.serialize();
    this.shut();
    this.saved.emit({ id: clean.id, isNew: !prev, ...(relinked.length ? { relinked: relinked.length } : {}) });
  }

  /**
   * A anotação vai sem categoria ou sem nenhuma tag: "Tem certeza que deseja salvá-la sem?", com o
   * "Nunca mais me perguntar isso" (que desliga a pergunta do que faltou; os Ajustes ligam de novo).
   * Voltar leva para o que faltou. Numa anotação que já existia, só pergunta pelo que ela tinha e
   * perdeu agora: a que já estava sem categoria (ou sem tag) é salva sem pergunta nenhuma.
   */
  private async okWithoutLabels(): Promise<boolean> {
    const prev = this.editing();
    const hadCategory = !prev || !!prev.category?.trim();
    const hadTag = !prev || !!prev.tags?.length;
    const noCategory = hadCategory && !this.noteCategory() && this.settings.askNoCategory();
    // a categoria pode pedir (ou dispensar) a pergunta da tag, na engrenagem do mural
    const category = this.noteCategory();
    const config = this.settings.notesConfig();
    const noTag = hadTag && !this.noteTags().length && asksTag(config, category, this.settings.askNoTag());
    if (!noCategory && !noTag) return true;
    const { ok, checked } = await this.confirm.askChecked({
      title: noCategory && noTag ? 'Sem grupo e sem tag' : noCategory ? 'Sem grupo' : 'Sem tag',
      text: `Essa anotação não tem ${noCategory && noTag ? 'grupo nem tag' : noCategory ? 'grupo' : 'tag'}. Tem certeza que deseja salvá-la sem?`,
      confirm: this.editing() ? 'Salvar assim' : 'Pregar assim',
      cancel: 'Voltar',
      icon: null,
      tone: 'neutro',
      check: 'Nunca mais me perguntar isso',
    });
    if (checked) {
      if (noCategory) this.settings.askNoCategory.set(false);
      // a categoria que pedia a pergunta deixa de pedir; senão, o mural inteiro para de perguntar
      if (noTag) {
        if (category && prefsOf(config, category).askTag) this.settings.setCategoryPrefs(category, { askTag: false });
        else this.settings.askNoTag.set(false);
      }
    }
    // Voltar: abre a parte do que faltou, com o foco na busca dela
    if (!ok) this.openProp(noCategory ? 'grupo' : 'tags');
    return ok;
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
    this.shut();
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
    this.shut();
    this.wishRemoved.emit(wish.id);
  }

  protected async removeDraft(): Promise<void> {
    const draft = this.fromDraft();
    if (!draft) return;
    const sure = await this.confirm.ask({ text: this.removeText(draft.game.name, 'da fila'), confirm: 'Tirar da fila' });
    if (!sure || this.fromDraft() !== draft) return;
    this.snapshot = this.serialize();
    this.shut();
    this.draftRemoved.emit(draft.id);
  }

  /** O "Tem certeza?" de tirar da fila ou da wishlist: com notas e texto já escritos, avisa que eles se perdem (o Desfazer não traz a resenha). */
  private removeText(name: string, from: 'da fila' | 'da wishlist'): string {
    return this.hasReviewContent()
      ? `“${name}” sai ${from}, e as notas e o texto que você escreveu se perdem.`
      : `“${name}” sai ${from}.`;
  }

  /**
   * Esc, X, Cancelar ou o clique no fundo: se tem coisa por salvar, o cartão de confirmação pergunta
   * antes, por cima da folha. Só "Descartar" joga o texto fora; "Continuar escrevendo", o Esc e o
   * clique fora do cartão voltam para a folha como estava.
   */
  protected requestClose(e?: Event): void {
    if (this.isDirty()) {
      e?.preventDefault();
      void this.askDiscard();
      return;
    }
    if (e?.type !== 'cancel') this.shut();
  }

  /** A pergunta de descartar já está na tela: outro X (ou o fundo) não abre uma segunda. */
  private askingDiscard = false;

  private async askDiscard(): Promise<void> {
    if (this.askingDiscard) return;
    this.askingDiscard = true;
    try {
      const sure = await this.confirm.ask({
        title: 'Descartar o que você escreveu?',
        text: `${this.notes() ? 'A anotação' : 'A resenha'} ainda não foi salva. Fechando agora, o que você escreveu se perde.`,
        confirm: 'Descartar',
        cancel: 'Continuar escrevendo',
      });
      if (sure) this.discard();
    } finally {
      this.askingDiscard = false;
    }
  }

  /** Saiu da anotação compartilhada pelo Compartilhar: ela sumiu do mural, e o editor fecha sem salvar. */
  protected leftShared(): void {
    this.shareOpen.set(false);
    this.shut();
  }

  /** Fecha de propósito (salvou, descartou, apagou, mandou para a fila…). */
  private shut(): void {
    this.closing = true;
    this.dialog().nativeElement.close();
  }
  private closing = false;

  /**
   * A folha fechou. O Chrome fecha mesmo com o Esc cancelado, num segundo Esc seguido (sem clique
   * no meio): com o texto ainda por salvar, ela abre de novo, com a pergunta de descartar.
   */
  protected onClose(): void {
    if (!this.closing && this.isDirty()) {
      this.dialog().nativeElement.showModal();
      void this.askDiscard();
      return;
    }
    this.closing = false;
    this.closed.emit();
  }

  protected discard(): void {
    this.snapshot = this.serialize();
    this.shut();
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
      this.paperSeed(),
      this.pattern(),
      this.patternLook(),
      this.patternSeed(),
      this.scribble(),
      this.scribbleSeed(),
      this.scribbleInk(),
      this.damage(),
      this.damageSeed(),
      this.stains(),
      this.decors(),
      this.overrideOn() ? this.overrideText().trim() : null,
      this.categories().map((k) => this.scores()[k] ?? null),
      this.status(),
      this.verdict(),
      this.dateValue(),
      this.weights(),
      this.bonuses().map((b) => b.id),
      this.noteCategory(),
      this.noteSubject(),
      this.noteTags(),
      this.hours().trim(),
      this.game()?.coverUrl,
      this.difficulty(),
      this.text().trim(),
      // na compartilhada, quem vê muda em Compartilhar (e já vale): não é coisa por salvar
      this.liveShared() ? null : this.visibility(),
      this.noteRank(),
      this.game()?.form,
      this.game()?.sample,
      // o lugar no quadro (a parte Kanban) também é coisa por salvar
      this.kbColumn(),
      this.kbImportance(),
      cleanStatus(this.kbStatus()),
      this.kbDeps(),
      this.kbWall(),
    ]);
  }

  private focusFirstMissing(): void {
    const root = this.dialog().nativeElement;
    // o que falta está sempre na aba do que se escreve; a data e a quantidade, na parte delas
    this.mode.set('escrever');
    if (!this.dateValid()) this.openProp('data', false);
    else if (!this.hoursValid()) this.openProp('horas', false);
    if (this.notes()) {
      setTimeout(() => {
        if (!this.noteTitle().trim()) root.querySelector<HTMLTextAreaElement>('#editor-titulo-nota')?.focus();
        else if (!this.dateValid()) root.querySelector<HTMLInputElement>('#editor-data')?.focus();
        else root.querySelector<HTMLTextAreaElement>('app-rich-editor textarea:not(.grande)')?.focus();
      });
      return;
    }
    setTimeout(() => {
      // na ordem da ficha: o status e a data vêm antes das notas
      if (!this.game()) this.search()?.focus();
      else if (this.soundProblem()) root.querySelector<HTMLInputElement>('app-music-fields input.link')?.focus();
      else if (!this.status()) root.querySelector<HTMLInputElement>('app-status-picker input')?.focus();
      else if (!this.dateValid()) root.querySelector<HTMLInputElement>('#editor-data')?.focus();
      else if (!this.hoursValid()) root.querySelector<HTMLInputElement>('#editor-horas')?.focus();
      else if (this.missingScores().length)
        root.querySelector<HTMLInputElement>(`[data-nota="${this.missingScores()[0]}"] input`)?.focus();
      else if (this.noneCounts()) root.querySelector<HTMLSelectElement>('.subs select')?.focus();
      else if (this.textTooLong()) root.querySelector<HTMLTextAreaElement>('app-rich-editor textarea:not(.grande)')?.focus();
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
