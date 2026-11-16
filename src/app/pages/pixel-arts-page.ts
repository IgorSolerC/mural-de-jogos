import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, Injector, afterNextRender, computed, effect, inject, signal, untracked, viewChild } from '@angular/core';
import { ActivatedRoute, Router } from '@angular/router';
import { takeUntilDestroyed } from '@angular/core/rxjs-interop';
import { NoteFolder, siblingNamed } from '../core/folders';
import { PixelFolders } from '../core/pixel-folders';
import { plural } from '../core/text';
import { FolderAsking, PIXEL_UNITS } from '../ui/folder-asking';
import { FolderCard, FolderCardInfo } from '../ui/folder-card';
import { FolderMoveSheet } from '../ui/folder-move-sheet';
import { FolderPath } from '../ui/folder-path';
import { WallDrag, WallDragItem, WallDrop } from './wall-drag';
import { collage, shelfColumns } from '../core/clipping';
import { PixelLook } from '../core/pixel-art';
import { FoundPixelArt, PIXEL_TAG_SPACE, PixelPiece, artValues, pieceTitle, pieceWidgetLine, pixelArtsInNotes, valuesArt } from '../core/pixel-gallery';
import { ReviewStore } from '../core/review-store';
import { plainText } from '../core/rich-text';
import { PixelGallery } from '../core/pixel-gallery-store';
import {
  NO_PIXEL_FILTER,
  PIXEL_ORDERS,
  PIXEL_PREFS_KEY,
  PixelFilter,
  PixelGalleryPrefs,
  PixelOrder,
  PixelView,
  pieceFoundByNote,
  pieceLayout,
  pieceMatches,
  pixelDirectionLabel,
  pixelFiltering,
  pixelLookOptions,
  pixelNaturalDirection,
  sanitizePixelPrefs,
  sortPieces,
} from '../core/pixel-gallery-view';
import { downloadBlob, pieceToPng, pngName } from '../core/pixel-png';
import { lookKey } from '../core/category-looks';
import { fold } from '../core/review';
import { Settings } from '../core/settings';
import { readJson, writeJson } from '../core/storage';
import { ViewTransitions } from '../core/view-transitions';
import { WidgetValues } from '../core/widgets';
import { wishTagCounts, wishTagHex } from '../core/wishlist-view';
import { reducedMotion } from '../core/motion';
import { ContextMenu, ContextMenuTrigger, MenuItem, MenuSections } from '../ui/context-menu';
import { FilterCard, SubjectOption, activeFilters, removeActive } from '../ui/filter-card';
import { FilterChip, FilterTags } from '../ui/filter-sheet';
import { focusAfterRemoval } from '../ui/focus';
import { ICON, IconModule } from '../ui/icons';
import { NoteSelection } from '../ui/note-selection';
import { Pin } from '../ui/pin';
import { PixelBulkTags, PixelTagsChange } from '../ui/pixel-bulk-tags';
import { PixelImportSheet } from '../ui/pixel-import-sheet';
import { SelectionTray, TrayAction } from '../ui/selection-tray';
import { PixelPieceCard } from '../ui/pixel-piece';
import { PixelSheet } from '../ui/pixel-sheet';
import { PixelStudio } from '../ui/pixel-studio/pixel-studio';
import { PixelTile } from '../ui/pixel-tile';
import { SearchHighlight } from '../ui/search-highlight';
import { SearchStrip } from '../ui/search-strip';
import { TagChip } from '../ui/tag-chips';
import { Toasts } from '../ui/toast';

/**
 * Pixel arts (PLANO-PIXEL-ARTS.md): a galeria de todas as pixel arts guardadas, em Extras. A Wishlist das Análises
 * é a base: a pasta de cima com a busca (no título, nas tags e na descrição), o Filtrar (a folha das Anotações,
 * com o Jeito de uma por vez e as Tags nas cores), a ordem com o inverter e a vista. Na Mostra, cada obra no
 * material dela, em colunas como os recortes; na Grade, muitas de uma vez, todas do mesmo tamanho. Tocar abre a
 * ficha (ui/pixel-sheet.ts); a etiqueta de hover abre o desenho direto no ateliê ou baixa o PNG. A vista e a
 * ordem ficam guardadas no aparelho.
 *
 * As pastas (PLANO-PIXEL-ARTS.md, rodada 4) são as das Anotações, como na Wishlist: as pastas manilha antes das
 * obras, o caminho na pasta da barra, a aberta no endereço (`?pasta=`); arrastar uma obra até uma pasta (ou um
 * pedaço do caminho) guarda nela, e soltar uma obra no miolo de outra cria uma pasta com as duas
 * (pages/wall-drag.ts). Dentro de uma pasta, a busca e os filtros pegam ela e as de dentro.
 */
@Component({
  selector: 'app-pixel-arts-page',
  imports: [ContextMenu, FilterCard, FilterTags, FolderCard, FolderMoveSheet, FolderPath, IconModule, Pin, PixelBulkTags, PixelImportSheet, SelectionTray, PixelPieceCard, PixelSheet, PixelStudio, PixelTile, SearchHighlight, SearchStrip],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.com-tira]': 'marking()' },
  templateUrl: './pixel-arts-page.html',
  styleUrl: './pixel-arts-page.scss',
})
export class PixelArtsPage {
  protected readonly gallery = inject(PixelGallery);
  private readonly settings = inject(Settings);
  private readonly transitions = inject(ViewTransitions);
  private readonly toasts = inject(Toasts);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly AddIcon = ICON.pixelArt;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly FilterIcon = ICON.filtrar;
  protected readonly MarkIcon = ICON.marcado;
  protected readonly DescIcon = ICON.ordenarDecrescente;
  protected readonly AscIcon = ICON.ordenarCrescente;
  protected readonly orders = PIXEL_ORDERS;
  protected readonly views: readonly { value: PixelView; label: string; hint: string; icon: typeof ICON.grade }[] = [
    { value: 'mostra', label: 'Mostra', hint: 'Mostra: cada uma no jeito dela', icon: ICON.parede },
    { value: 'grade', label: 'Grade', hint: 'Grade: muitas de uma vez', icon: ICON.grade },
  ];

  /** A vista e a ordem, do aparelho (lidas aqui e não no módulo: a limpeza do logout roda antes). */
  protected readonly prefs = signal<PixelGalleryPrefs>(sanitizePixelPrefs(readJson(PIXEL_PREFS_KEY)));
  /** A busca e os filtros: valem só nesta visita. */
  protected readonly filter = signal<PixelFilter>(NO_PIXEL_FILTER);
  protected readonly filterOpen = signal(false);
  protected readonly orderLabel = computed(() => PIXEL_ORDERS.find((o) => o.value === this.prefs().ordem)!.label);
  protected readonly directionLabel = computed(() => pixelDirectionLabel(this.prefs().ordem, this.prefs().direcao));

  // ===== As pastas =====
  private readonly folders = inject(PixelFolders);
  private readonly asking = inject(FolderAsking);
  private readonly route = inject(ActivatedRoute);
  private readonly router = inject(Router);
  protected readonly folderTree = this.folders.tree;
  protected readonly group = this.folders.group;
  /** A pasta pedida no endereço (`?pasta=`). */
  private readonly asked = signal<string | null>(null);
  /** A pasta aberta: a pedida, se é da galeria (a desfeita vale pela de cima); null: a raiz. */
  protected readonly openFolder = computed(() => this.folderTree().resolve(this.asked(), this.group));
  protected readonly folderPath = computed(() => this.folderTree().path(this.openFolder()));
  private whereIs(id: string): string | null {
    return this.folders.folderOf().get(id) ?? null;
  }

  /** Onde se procura: a galeria, ou a pasta aberta e as de dentro. */
  protected readonly pool = computed(() => {
    const open = this.openFolder();
    const all = this.gallery.pieces();
    if (!open) return all;
    const below = this.folderTree().below(open);
    return all.filter((p) => below.has(this.whereIs(p.id) ?? ''));
  });
  protected readonly filtering = computed(() => pixelFiltering(this.filter()));
  /** Sem procurar, só as direto na pasta aberta (as de dentro moram nas pastas); procurando, ela e as de dentro. */
  protected readonly visible = computed(() => {
    const f = this.filter();
    const open = this.openFolder();
    const base = this.filtering() ? this.pool() : this.pool().filter((p) => this.whereIs(p.id) === open);
    return sortPieces(
      base.filter((p) => pieceMatches(p, f)),
      this.prefs(),
    );
  });
  /** As pastas na parede: as de dentro da aberta, sem procurar. */
  protected readonly folderKids = computed<readonly NoteFolder[]>(() => (this.filtering() ? [] : this.folderTree().kids(this.group, this.openFolder())));
  /** O que cada pasta mostra: quantas obras tem (com as das de dentro), quantas pastas logo dentro, e até três obras espiando, na ordem da parede. */
  protected readonly folderInfo = computed<ReadonlyMap<string, FolderCardInfo>>(() => {
    const kids = this.folderKids();
    if (!kids.length) return new Map();
    const tree = this.folderTree();
    const kidIds = new Set(kids.map((f) => f.id));
    const acc = new Map(kids.map((f) => [f.id, { n: 0, direct: [] as PixelPiece[], deep: [] as PixelPiece[] }]));
    for (const p of sortPieces(this.gallery.pieces(), this.prefs())) {
      const at = this.whereIs(p.id);
      const kid = tree.path(at).find((f) => kidIds.has(f.id));
      if (!kid) continue;
      const a = acc.get(kid.id)!;
      a.n++;
      if (a.direct.length + a.deep.length < 6) (at === kid.id ? a.direct : a.deep).push(p);
    }
    const out = new Map<string, FolderCardInfo>();
    for (const f of kids) {
      const a = acc.get(f.id)!;
      out.set(f.id, { notes: a.n, folders: tree.kids(f.group, f.id).length, peek: [...a.direct, ...a.deep].slice(0, 3) });
    }
    return out;
  });
  /** A pasta aberta não tem nada: nem obra, nem pasta. */
  protected readonly folderEmpty = computed(() => this.openFolder() !== null && !this.filtering() && !this.visible().length && !this.folderKids().length);
  /** Onde a busca procura: a galeria, ou a pasta aberta (e as de dentro). */
  protected readonly searchWhere = computed(() => {
    const f = this.folderPath().at(-1);
    return f ? `Procurar em ${f.name}` : 'Procurar nas pixel arts';
  });
  /** O que o leitor de tela ouve depois de trocar de pasta: "Pasta Bichos, 4 pixel arts e 1 pasta". */
  protected readonly folderSaid = signal('');

  /** As tags, na cor de cada uma, as mais usadas primeiro (o valor é a tag sem caixa e sem acento). */
  protected readonly tagChips = computed<TagChip[]>(() => {
    const { on, out } = this.filter();
    const colors = this.settings.notesConfig().wishTagColors;
    const chips: TagChip[] = wishTagCounts(this.pool()).map((t) => ({ value: t.key, label: t.label, n: t.n, on: on.has(t.key), out: out.has(t.key), color: wishTagHex(colors, PIXEL_TAG_SPACE, t.label) }));
    // a ligada (ou escondida) que nenhuma obra tem mais continua à mão, senão filtraria sem ter como desligar
    for (const k of [...on, ...out]) if (!chips.some((c) => c.value === k)) chips.push({ value: k, label: k, n: 0, on: on.has(k), out: out.has(k), color: wishTagHex(colors, PIXEL_TAG_SPACE, k) });
    return chips;
  });
  protected readonly lookOptions = computed<SubjectOption[]>(() => pixelLookOptions(this.pool(), this.filter().jeito));
  protected readonly chips = computed(() => activeFilters(this.lookOptions(), this.tagChips()));
  protected readonly noneText = computed(() => {
    const f = this.filter();
    if (f.query.trim() && !f.jeito && !f.on.size && !f.out.size) return `Nenhuma pixel art tem “${f.query.trim()}” no nome, nas tags ou na descrição.`;
    return 'Nenhuma pixel art com esses filtros.';
  });

  /** As obras que a busca achou só pela descrição: a folha do caderno fica aberta nelas. */
  protected readonly byNote = computed(() => {
    const q = this.filter().query;
    return new Set(q.trim() ? this.visible().filter((p) => pieceFoundByNote(p, q)).map((p) => p.id) : []);
  });

  /** Quantas colunas da Mostra cabem: obras de pelo menos 172px, com 34px entre elas (duas no celular). */
  protected readonly cols = signal(6);
  protected readonly columns = computed(() => collage(this.visible(), this.cols(), (id) => this.layoutOf(id).height));
  private readonly layouts = computed(() => new Map(this.visible().map((p) => [p.id, pieceLayout(p)])));
  protected layoutOf(id: string): ReturnType<typeof pieceLayout> {
    return this.layouts().get(id) ?? { width: 100, shift: 0, gap: 40, tilt: 0, height: 1 };
  }

  /** A obra que acabou de chegar (nova, ou salva): assenta com um tapa. */
  protected readonly landing = signal<string | null>(null);

  private readonly sheet = viewChild.required(PixelSheet);
  private readonly filterBtn = viewChild<ElementRef<HTMLButtonElement>>('filterBtn');
  private readonly card = viewChild(FilterCard);
  private readonly host: HTMLElement;

  // ===== Marcar várias (PLANO-PIXEL-ARTS.md, 5): a seleção das Anotações, com a tira no pé =====

  /** Marcando: o toque marca em vez de abrir (o botão Marcar da barra, ou o Ctrl+clique). */
  protected readonly marking = signal(false);
  /** As obras que dá para marcar: todas (a marcada que a busca esconde continua marcada, "fora da vista"). */
  private readonly byId = computed(() => new Map(this.gallery.pieces().map((p) => [p.id, p])));
  readonly selection = new NoteSelection<PixelPiece>({
    host: inject(ElementRef<HTMLElement>).nativeElement as HTMLElement,
    markable: 'app-pixel-piece[data-ficha], app-pixel-tile[data-ficha]',
    idOf: (el) => el.getAttribute('data-ficha'),
    on: () => true,
    notes: () => this.byId(),
    // trocar de pasta desmarca (as marcas de antes eram de outra parede)
    reset: () => this.openFolder(),
    layout: () => [this.columns(), this.prefs().vista, this.folderKids()],
    drags: true,
    mode: this.marking,
    // o Ctrl+C das marcadas: as linhas dos widgets, para colar numa anotação
    copy: (items) => ({ text: items.map(pieceWidgetLine).join('\n\n'), done: items.length === 1 ? 'Copiei a pixel art como widget.' : `Copiei as ${items.length} pixel arts como widgets.` }),
  });
  /** As marcadas que a busca, os filtros ou a pasta não mostram agora. */
  protected readonly hiddenMarked = computed(() => {
    const shown = new Set(this.visible().map((p) => p.id));
    return this.selection.ids().filter((id) => !shown.has(id)).length;
  });
  private readonly marked = computed(() => this.selection.ids().map((id) => this.gallery.get(id)).filter((p): p is PixelPiece => !!p));
  /** A folha das tags das marcadas, aberta. */
  protected readonly bulkTags = signal<readonly PixelPiece[] | null>(null);
  /** O que a tira oferece: marcar todas as à mostra, copiar, baixar, as tags, apagar e, de tinta, mover. */
  protected readonly trayActions = computed<TrayAction[]>(() => {
    const n = this.selection.count();
    const all = this.visible().length > 0 && this.visible().every((p) => this.selection.has(p.id));
    return [
      { id: 'todas', label: 'Marcar todas', icon: ICON.marcado, disabled: all, hint: 'As à mostra agora', run: () => this.selection.add(this.visible().map((p) => p.id)) },
      { id: 'copiar', label: 'Copiar', icon: ICON.copiar, disabled: !n, hint: 'Como widgets, para colar numa anotação', run: () => void this.selection.copy() },
      { id: 'baixar', label: 'Baixar', icon: ICON.baixar, disabled: !n, hint: 'Um PNG de cada', run: () => void this.downloadMany(this.marked()) },
      { id: 'tags', label: 'Tags…', icon: ICON.etiquetas, disabled: !n, run: () => this.bulkTags.set(this.marked()) },
      { id: 'apagar', label: 'Apagar', icon: ICON.apagar, disabled: !n, run: () => this.removeMany(this.selection.ids()) },
      { id: 'mover', label: 'Mover para pasta…', icon: ICON.guardarNaPasta, primary: true, run: () => this.moving.set({ kind: 'obras', ids: [...this.selection.ids()], name: n === 1 ? pieceTitle(this.marked()[0]) : plural(n, 'pixel art', 'pixel arts'), from: this.openFolder() }) },
    ];
  });

  protected toggleMarking(): void {
    if (this.marking()) this.selection.done();
    else this.selection.start();
  }

  /** Aplicou a folha das tags: em cada marcada, as que foram para todas entram e as que saíram de todas saem. */
  protected applyTags(change: PixelTagsChange): void {
    const drop = new Set([...change.drop, ...change.all].map(lookKey));
    // as tags de agora de cada uma (o que mudou enquanto a folha estava aberta fica)
    const list = (this.bulkTags() ?? [])
      .map((p) => this.gallery.get(p.id))
      .filter((p): p is PixelPiece => !!p)
      .map((p) => ({ id: p.id, patch: { tags: [...(p.tags ?? []).filter((t) => !drop.has(lookKey(t))), ...change.all] } }));
    const undo = this.gallery.updateMany(list);
    if (undo) this.undoToast(`As tags de ${plural(list.length, 'pixel art', 'pixel arts')} mudaram.`, undo);
  }

  /** Apaga as marcadas (com o Desfazer), e sai do modo de marcar. */
  private removeMany(ids: readonly string[]): void {
    this.transitions.run(() => {
      const gone = this.gallery.remove(ids);
      if (!gone.length) return;
      this.selection.done();
      this.toasts.show(gone.length === 1 ? `“${pieceTitle(gone[0])}” saiu da galeria` : `${gone.length} pixel arts saíram da galeria`, {
        label: 'Desfazer',
        run: () => this.transitions.run(() => this.gallery.restore(gone)),
      });
    });
  }

  /** Um PNG de cada marcada, com nomes que não se repetem. */
  private async downloadMany(list: readonly PixelPiece[]): Promise<void> {
    const taken = new Set<string>();
    for (const p of list) {
      const blob = await pieceToPng(p);
      if (!blob) continue;
      const name = pngName(p, taken);
      taken.add(name);
      downloadBlob(blob, name);
    }
  }

  // ===== O menu do botão direito (e do dedo segurado, e do Shift+F10) =====

  private readonly menu = viewChild.required<ContextMenu>('menu');
  /** A obra com o menu aberto (ou nenhuma). */
  protected readonly menuOn = signal<string | null>(null);
  protected readonly menuPiece = computed(() => (this.menuOn() ? (this.gallery.get(this.menuOn()!) ?? null) : null));
  /** No alto do menu do dedo: o começo da descrição, sem as marcas do texto (como na Wishlist). */
  protected readonly menuNote = computed(() => {
    const plain = plainText(this.menuPiece()?.note ?? '').replace(/\s+/g, ' ').trim();
    return plain.length > 180 ? plain.slice(0, 179).trimEnd() + '…' : plain;
  });
  protected readonly menuCaption = computed(() => {
    const p = this.menuPiece();
    return p ? pieceTitle(p) : '';
  });
  /**
   * O da obra: o que o toque faz (a ficha, para editar) e o Ateliê; o que sai dela (o PNG, a linha do widget para
   * colar numa anotação, uma cópia); a pasta (mover, e dentro de uma, tirar); e, sozinho no fim, Apagar, com o
   * Desfazer. (O do vão e o das pastas são o outro menu, `menuDaPasta`.)
   */
  protected readonly menuSections = computed<MenuSections>(() => {
    const p = this.menuPiece();
    // a obra do menu aberto saiu (apagada noutro aparelho): o menu fecha (o efeito do construtor)
    if (!p) return [];
    // numa das marcadas (com outras): o que a tira faz, para todas elas
    const n = this.selection.count();
    if (n > 1 && this.selection.has(p.id)) {
      const tray = new Map(this.trayActions().map((a) => [a.id, a]));
      const as = (id: string, label: string, icon: MenuItem['icon'], dialog = false): MenuItem => ({ id, label, icon, dialog, run: tray.get(id)!.run });
      return [
        [as('mover', `Mover as ${n} para pasta…`, ICON.guardarNaPasta, true), as('tags', `Tags das ${n}…`, ICON.etiquetas, true)],
        [as('baixar', `Baixar as ${n}`, ICON.baixar), as('copiar', `Copiar as ${n} como widgets`, ICON.copiar)],
        [{ ...as('apagar', `Apagar as ${n}`, ICON.apagar), danger: true }],
      ];
    }
    return [
      [
        { id: 'editar', label: 'Editar', icon: ICON.ajustar, dialog: true, run: () => this.open(p.id) },
        { id: 'atelie', label: 'Abrir no ateliê', icon: ICON.editar, dialog: true, run: () => this.atelie(p.id) },
      ],
      [
        { id: 'baixar', label: 'Baixar PNG', icon: ICON.baixar, run: () => void this.download(p.id) },
        { id: 'widget', label: 'Copiar como widget', icon: ICON.copiar, hint: 'Para colar numa anotação', run: () => void this.copyWidget(p.id) },
        { id: 'duplicar', label: 'Duplicar', icon: ICON.camadas, run: () => this.duplicate(p.id) },
      ],
      this.folderItems(p),
      [{ id: 'apagar', label: 'Apagar', icon: ICON.apagar, danger: true, run: () => this.remove(p.id) }],
    ];
  });

  // ===== Trazer das anotações (PLANO-PIXEL-ARTS.md, 6) =====

  private readonly reviews = inject(ReviewStore);
  /** As pixel arts que moram como widget no texto das anotações (e das resenhas), e quais já estão aqui. */
  protected readonly inNotes = computed(() => pixelArtsInNotes(this.reviews.reviews(), this.gallery.pieces()));
  /** Quantas delas ainda não estão na galeria. */
  protected readonly newInNotes = computed(() => this.inNotes().filter((f) => !f.inGallery).length);
  /** A folha de trazer, aberta. */
  protected readonly importing = signal(false);

  /** As escolhidas viram obras, na pasta aberta, com a legenda de nome; o aviso tem o Desfazer. */
  protected bring(list: readonly FoundPixelArt[]): void {
    const folder = this.openFolder() ?? undefined;
    const made = list.map((f) => this.gallery.create({ art: f.art, title: f.caption, folder })).filter((p): p is PixelPiece => !!p);
    if (!made.length) {
      this.toasts.show('A galeria está cheia: apague uma pixel art para guardar outra.');
      return;
    }
    // os filtros que esconderiam as que chegaram saem da frente, como na obra nova
    if (made.some((p) => !pieceMatches(p, this.filter()))) this.filter.set(NO_PIXEL_FILTER);
    const left = list.length - made.length;
    const text = (made.length === 1 ? `“${pieceTitle(made[0])}” veio das anotações` : `${made.length} pixel arts vieram das anotações`) + (left ? ` (${left} não couberam: a galeria encheu)` : '');
    this.undoToast(text, () => this.gallery.remove(made.map((p) => p.id)));
    this.land(made[0].id);
  }

  /** O desenho aberto direto no ateliê (o Ateliê da etiqueta), com o que mudou até agora. */
  protected readonly studio = signal<{ id: string; values: WidgetValues } | null>(null);

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    this.host = host;
    const measure = () => this.cols.set(shelfColumns(host.clientWidth, 172, 34));
    effect(() => {
      if (this.menuOn() && !this.menuPiece()) untracked(() => this.menu().close(false));
    });
    // o botão direito numa obra: o menu dela
    const pieceTrigger = new ContextMenuTrigger({
      host,
      targets: 'app-pixel-piece[data-ficha], app-pixel-tile[data-ficha]',
      keyOf: (box) => {
        const id = box.getAttribute('data-ficha');
        return id && this.gallery.get(id) ? id : null;
      },
      // o dedo segurado e solto sem arrastar abre o menu pelo arrasto (o mesmo gesto)
      hold: () => !this.dragOn(),
      isOpenFor: (key) => this.menu().isOpenFor(key),
      open: (key, box, x, y, by) => {
        this.menuOn.set(key);
        // o foco volta para onde estava na obra (Shift+F10 no Ateliê); senão, para o toque dela
        const active = document.activeElement;
        this.menu().show({ key, x, y, by, back: active instanceof HTMLElement && box.contains(active) ? active : box.querySelector<HTMLElement>('.hit') });
      },
    });
    // o botão direito numa pasta da parede, ou no vão (a fileira das pastas e a parede das obras)
    const folderTrigger = new ContextMenuTrigger({
      host,
      targets: 'app-folder-card[data-pasta], .pastas, .mostra, .grade',
      ignore: 'app-pixel-piece, app-pixel-tile, input',
      keyOf: (box) => (box.matches('app-folder-card') ? `pasta:${box.dataset['pasta']}` : 'vao'),
      hold: (box) => !box.matches('app-folder-card') || !this.dragOn(),
      isOpenFor: (key) => !!this.folderMenuRef()?.isOpenFor(key),
      open: (key, box, x, y, by) => {
        const f = key.startsWith('pasta:') ? this.folderTree().live(key.slice(6)) : undefined;
        if (key !== 'vao' && !f) return;
        this.folderMenu.set(f ? { caption: `Pasta ${f.name}`, sections: this.folderSections(f) } : { caption: this.folderName(this.openFolder()), sections: this.gapSections() });
        this.folderMenuRef()?.show({ key, x, y, back: box.matches('app-folder-card') ? box.querySelector<HTMLElement>('button') : null, by });
      },
    });
    // arrastar organiza: obra numa pasta guarda, obra no miolo de outra cria uma pasta com as duas
    const drag = new WallDrag({
      host,
      on: () => this.dragOn(),
      marked: () => this.selection.ids(),
      openFolder: () => this.openFolder(),
      groupName: () => 'Pixel arts',
      folderName: (id) => this.folderTree().live(id)?.name ?? null,
      folderOf: (id) => this.whereIs(id),
      below: (id) => this.folderTree().below(id),
      parentOf: (id) => this.folderTree().parentOf(id),
      drop: (item, to) => this.dropped(item, to),
      open: (id) => this.enterFolder(id),
      menu: (item, box, x, y) => {
        if (item.kind === 'pasta') folderTrigger.openAt(`pasta:${item.id}`, x, y, box);
        else pieceTrigger.openAt(item.lead, x, y, box);
      },
      scope: () => host.querySelector('.mostra, .grade, .pastas'),
      gap: '.mostra, .grade, .pastas, .no-results',
      pieces: {
        selector: 'app-pixel-piece[data-ficha], app-pixel-tile[data-ficha]',
        idOf: (el) => el.getAttribute('data-ficha'),
        // só a obra (sem a legenda de baixo); o cartão da Grade inteiro
        face: (el) => (el.matches('app-pixel-tile') ? el : (el.querySelector<HTMLElement>('.obra') ?? el)),
        joinLabel: (n) => (n === 1 ? 'Nova pasta com as duas' : `Nova pasta com as ${n + 1}`),
        core: 0.6,
      },
    });
    this.destroyRef.onDestroy(() => drag.off());
    // a pasta aberta mora no endereço (o Voltar do navegador sobe)
    this.route.queryParamMap.pipe(takeUntilDestroyed()).subscribe((q) => this.asked.set(q.get('pasta')));
    // a vista e a ordem ficam no aparelho (writeJson respeita a trava da limpeza do logout)
    let saved = JSON.stringify(this.prefs());
    effect(() => {
      const now = JSON.stringify(this.prefs());
      if (now === saved) return;
      saved = now;
      writeJson(PIXEL_PREFS_KEY, this.prefs());
    });
    // o "Nova pixel art" do topo (e o N): a ficha nova; o pedido de antes de a página abrir não conta
    let asked = this.gallery.compose();
    effect(() => {
      const n = this.gallery.compose();
      if (n === asked) return;
      asked = n;
      untracked(() => this.add());
    });
    afterNextRender(() => {
      measure();
      const ro = new ResizeObserver(measure);
      ro.observe(host);
      this.destroyRef.onDestroy(() => ro.disconnect());
    });
  }

  // ===== A busca e os filtros =====

  protected setQuery(q: string): void {
    this.filter.update((f) => ({ ...f, query: q }));
  }

  protected toggleFilter(e: MouseEvent): void {
    if (this.filterOpen()) {
      this.closeFilter();
      return;
    }
    this.filterOpen.set(true);
    // aberta pelo teclado (Enter ou espaço não têm clique de verdade): o foco desce para a folha
    if (e.detail === 0) afterNextRender(() => this.card()?.focusFirst(), { injector: this.injector });
  }

  protected closeFilter(): void {
    const el = document.getElementById('cartela-pixel');
    const hadFocus = !!el && el.contains(document.activeElement);
    this.filterOpen.set(false);
    if (hadFocus) this.filterBtn()?.nativeElement.focus();
  }

  protected chooseLook(v: string | null): void {
    this.transitions.run(() => this.filter.update((f) => ({ ...f, jeito: (v as PixelLook | null) || null })));
  }

  /** Um toque na tag: a escondida volta; a ligada desliga; senão, liga. */
  protected toggleTag(key: string): void {
    const k = fold(key);
    this.transitions.run(() =>
      this.filter.update((f) => {
        const on = new Set(f.on);
        const out = new Set(f.out);
        if (out.has(k)) out.delete(k);
        else if (on.has(k)) on.delete(k);
        else on.add(k);
        return { ...f, on, out };
      }),
    );
  }

  /** O botão direito na tag: esconde as com ela (de novo: mostra). */
  protected excludeTag(key: string): void {
    const k = fold(key);
    this.transitions.run(() =>
      this.filter.update((f) => {
        const on = new Set(f.on);
        const out = new Set(f.out);
        on.delete(k);
        if (out.has(k)) out.delete(k);
        else out.add(k);
        return { ...f, on, out };
      }),
    );
  }

  protected removeChip(c: FilterChip): void {
    removeActive(c, { subjectChosen: (v) => this.chooseLook(v), tagToggled: (v) => this.toggleTag(v) });
  }

  /** O Limpar tudo da folha: o jeito e as tags (a busca fica). */
  protected clearChoices(): void {
    this.transitions.run(() => this.filter.update((f) => ({ ...NO_PIXEL_FILTER, query: f.query })));
  }

  /** O Limpar da pasta: tudo, a busca também. */
  protected clear(): void {
    this.transitions.run(() => this.filter.set(NO_PIXEL_FILTER));
  }

  // ===== A ordem e a vista =====

  protected sort(o: PixelOrder): void {
    if (o === this.prefs().ordem) return;
    this.transitions.run(() => this.prefs.update((p) => ({ ...p, ordem: o, direcao: pixelNaturalDirection(o) })));
  }

  protected flip(): void {
    this.transitions.run(() => this.prefs.update((p) => ({ ...p, direcao: p.direcao === 'desc' ? 'asc' : 'desc' })));
  }

  protected setView(v: PixelView): void {
    if (v === this.prefs().vista) return;
    this.prefs.update((p) => ({ ...p, vista: v }));
  }

  // ===== Criar, abrir, o ateliê, baixar, apagar =====

  /** Uma obra nova: a ficha, com o ateliê aberto por cima; ela nasce na pasta aberta (ou na pedida). */
  protected add(folder: string | null = this.openFolder()): void {
    this.sheet().open(folder);
  }

  /** A obra nova chegou: os filtros que a esconderiam saem da frente, e ela assenta na parede. */
  protected created(id: string): void {
    const p = this.gallery.get(id);
    if (p && !pieceMatches(p, this.filter())) this.filter.set(NO_PIXEL_FILTER);
    // a ficha pode ter escolhido outra pasta: a parede vai até ela
    const where = this.whereIs(id);
    if (p && !this.filtering() && where !== this.openFolder()) this.enterFolder(where, true, false);
    this.land(id);
  }

  /** Abre a ficha da obra; apagar por ela leva o foco ao vizinho, como o menu. */
  protected open(id: string): void {
    const p = this.gallery.get(id);
    if (!p) return;
    // salva: o foco vai junto com a obra; se ela foi para outra pasta (e saiu da parede), fica no caminho ou na busca
    this.sheet().edit(p, { remove: () => this.remove(id), saved: () => (this.filtering() || this.whereIs(id) === this.openFolder() ? this.follow(id) : this.focusWall()) });
  }

  /** O Ateliê da etiqueta: o desenho direto no ateliê, por cima de tudo; o que mudar vai para a obra ao fechar. */
  protected atelie(id: string): void {
    const p = this.gallery.get(id);
    if (p) this.studio.set({ id, values: artValues(p.art) });
  }

  protected drawn(v: WidgetValues): void {
    // o ateliê manda o desenho (os pontos, a grade, a paleta, as cores): o jeito fica o da obra
    this.studio.update((s) => (s ? { ...s, values: { ...s.values, ...v } } : s));
  }

  /** O ateliê fechou: o desenho mudado vai para a obra (com o Desfazer), e o foco volta para o Ateliê dela. */
  protected studioClosed(): void {
    const s = this.studio();
    this.studio.set(null);
    if (!s) return;
    const p = this.gallery.get(s.id);
    const art = valuesArt(s.values);
    if (p && art) {
      const undo = this.gallery.update(s.id, { art });
      if (undo) this.toasts.show(`“${pieceTitle(p)}” mudou na galeria`, { label: 'Desfazer', run: () => this.transitions.run(undo) });
    } else if (p) {
      this.toasts.show('Uma pixel art precisa de pelo menos um ponto: o desenho ficou como era.');
    }
    this.follow(s.id, 'app-pixel-actions .atelie');
  }

  /** O Baixar: o PNG nítido da obra. */
  protected async download(id: string): Promise<void> {
    const p = this.gallery.get(id);
    if (!p) return;
    const blob = await pieceToPng(p);
    if (!blob) {
      this.toasts.show('Não consegui montar a imagem agora. Tente de novo.');
      return;
    }
    downloadBlob(blob, pngName(p));
  }

  // ===== As pastas: entrar, arrastar, dar nome, os menus, mover sem arrastar =====

  /** Arrastar organiza (fora do nome sendo escrito numa pasta). */
  protected readonly dragOn = computed(() => !this.naming());
  /** A pasta sendo nomeada (a nova, ou Renomear), e a irmã com o nome que está escrito. */
  protected readonly naming = signal<string | null>(null);
  protected readonly clash = signal<string | null>(null);
  protected readonly folderMenu = signal<{ caption: string; sections: MenuSections }>({ caption: '', sections: [] });
  private readonly folderMenuRef = viewChild<ContextMenu>('menuDaPasta');

  /** O nome de uma pasta (null: Pixel arts). */
  private folderName(id: string | null): string {
    return id ? (this.folderTree().live(id)?.name ?? '') : 'Pixel arts';
  }

  /** Para onde vai: "Bichos", ou "a galeria". */
  private goesTo(id: string | null): string {
    return id ? this.folderName(id) : 'a galeria';
  }

  /** O que fica no menu de uma obra sobre a pasta dela: mover para outra e, dentro de uma, tirar dela. */
  private folderItems(p: PixelPiece): MenuItem[] {
    const items: MenuItem[] = [
      { id: 'mover-pasta', label: 'Mover para pasta…', icon: ICON.guardarNaPasta, dialog: true, run: () => this.moving.set({ kind: 'obras', ids: [p.id], name: pieceTitle(p), from: this.whereIs(p.id) }) },
    ];
    const open = this.openFolder();
    if (open !== null && this.whereIs(p.id) === open) {
      const up = this.folderTree().parentOf(open);
      items.push({ id: 'tirar-pasta', label: 'Tirar da pasta', icon: ICON.tirarDaPasta, hint: `Vai para ${this.goesTo(up)}`, run: () => this.dropped({ kind: 'notas', lead: p.id, ids: [p.id] }, { kind: 'guardar', folder: up }) });
    }
    return items;
  }

  /**
   * Abre a pasta (null: a raiz da galeria). `push`: veio de um toque (o Voltar do navegador volta para cá). O foco
   * vai para onde se está no caminho; subindo, para a pasta de onde se veio.
   */
  protected enterFolder(id: string | null, push = true, focus = push): void {
    const from = this.openFolder();
    if (id === from) return;
    this.naming.set(null);
    this.asked.set(id);
    void this.router.navigate([], { relativeTo: this.route, queryParams: { pasta: id }, queryParamsHandling: 'merge', replaceUrl: !push });
    if (!focus) return;
    const info = id ? this.folderTree().live(id) : null;
    const n = this.visible().length;
    const k = this.folderKids().length;
    const what = [n ? plural(n, 'pixel art', 'pixel arts') : '', k ? plural(k, 'pasta', 'pastas') : ''].filter(Boolean).join(' e ') || 'vazia';
    this.folderSaid.set(`${info ? `Pasta ${info.name}` : 'Pixel arts'}, ${what}`);
    afterNextRender(
      () => {
        const back = from && this.folderTree().parentOf(from) === id ? this.host.querySelector<HTMLElement>(`app-folder-card[data-pasta="${CSS.escape(from)}"] button`) : null;
        const here = back ?? this.host.querySelector<HTMLElement>('app-folder-path .aqui') ?? this.host.querySelector<HTMLElement>('#busca-pixel');
        here?.focus({ preventScroll: !!back });
      },
      { injector: this.injector },
    );
  }

  private undoToast(text: string, undo: () => void): void {
    this.toasts.show(text, { label: 'Desfazer', run: () => this.transitions.run(undo) });
  }

  /**
   * Soltou arrastando (ou escolheu no menu): guarda as obras, junta numa pasta nova ou põe uma pasta dentro de
   * outra, com o Desfazer. A parede muda com a transição, e o aviso sai de dentro dela.
   */
  private dropped(item: WallDragItem, to: WallDrop): void {
    if (to.kind === 'juntar') {
      if (item.kind !== 'notas') return;
      const ids = [...item.ids, to.with];
      this.transitions.run(() => {
        const made = this.folders.gather(ids, this.openFolder());
        if (!made) {
          this.toasts.show('Não cabe mais nenhuma pasta aqui.');
          return;
        }
        this.naming.set(made.folder.id);
        this.undoToast(`Nova pasta com ${ids.length} pixel arts.`, made.undo);
      });
      return;
    }
    const where = this.folderName(to.folder);
    if (item.kind === 'pasta') {
      const was = this.folderName(item.id);
      this.transitions.run(() => {
        const undo = this.folders.move(item.id, to.folder);
        if (undo) this.undoToast(to.folder ? `${was} guardada em ${where}.` : `${was} foi para a galeria.`, undo);
      });
      return;
    }
    const one = pieceTitle(this.gallery.get(item.lead) ?? { title: '' });
    this.transitions.run(() => {
      const done = this.folders.place(item.ids, to.folder);
      if (!done.moved) return;
      const text = to.folder
        ? done.moved === 1
          ? `“${one}” guardada em ${where}.`
          : `${done.moved} pixel arts guardadas em ${where}.`
        : done.moved === 1
          ? `“${one}” saiu das pastas.`
          : `${done.moved} pixel arts saíram das pastas.`;
      this.undoToast(text, done.undo);
    });
  }

  /** A cada letra do nome: a irmã que já tem esse nome (o Enter junta as duas). */
  protected drafted(f: NoteFolder, value: string): void {
    const tree = this.folderTree();
    this.clash.set(siblingNamed(tree, f.group, tree.parentOf(f.id), value, f.id)?.name ?? null);
  }

  /** Acabou de dar nome à pasta: renomeia, ou junta com a irmã de mesmo nome; o foco volta para ela. */
  protected named(f: NoteFolder, value: string | null): void {
    this.naming.set(null);
    this.clash.set(null);
    const clean = value?.trim() ?? '';
    let focus = f.id;
    if (clean && clean !== f.name) {
      const tree = this.folderTree();
      const twin = siblingNamed(tree, f.group, tree.parentOf(f.id), clean, f.id);
      if (twin) {
        this.undoToast(`${f.name} entrou em ${twin.name}: agora é uma pasta só.`, this.folders.join(f.id, twin.id));
        focus = twin.id;
      } else {
        this.folders.rename(f.id, clean);
      }
    }
    afterNextRender(() => this.host.querySelector<HTMLElement>(`app-folder-card[data-pasta="${CSS.escape(focus)}"] button`)?.focus(), { injector: this.injector });
  }

  /** Uma pasta nova (vazia) em `parent`, já com o campo do nome. */
  private newFolder(parent: string | null): void {
    if (parent !== this.openFolder()) this.enterFolder(parent);
    const made = this.folders.create(parent, '');
    if (made) this.naming.set(made.id);
    else this.toasts.show('Não cabe mais nenhuma pasta aqui.');
  }

  /** Desfaz a pasta: o que tinha dentro sobe (pergunta antes, se não estiver vazia), com o Desfazer. */
  private async dissolve(f: NoteFolder): Promise<void> {
    const up = this.goesTo(this.folderTree().parentOf(f.id));
    if (!(await this.asking.dissolve(f.name, this.folders.contentsOf(f.id), up, PIXEL_UNITS)) || !this.folderTree().live(f.id)) return;
    this.transitions.run(() => this.undoToast(`A pasta ${f.name} foi desfeita.`, this.folders.dissolve(f.id)));
  }

  /** As opções do menu de uma pasta da parede. */
  private folderSections(f: NoteFolder): MenuSections {
    return [
      [{ id: 'abrir', label: 'Abrir', icon: ICON.pastaDeNotas, run: () => this.enterFolder(f.id) }],
      [
        {
          id: 'nova-obra',
          label: 'Nova pixel art aqui',
          icon: ICON.adicionar,
          dialog: true,
          run: () => {
            this.enterFolder(f.id);
            this.add(f.id);
          },
        },
        { id: 'nova-pasta', label: 'Nova pasta dentro', icon: ICON.novaPasta, run: () => this.newFolder(f.id) },
        { id: 'renomear', label: 'Renomear', icon: ICON.editar, run: () => this.naming.set(f.id) },
        { id: 'mover', label: 'Mover para…', icon: ICON.guardarNaPasta, dialog: true, run: () => this.moving.set({ kind: 'pasta', id: f.id, name: f.name, from: this.folderTree().parentOf(f.id) }) },
      ],
      [{ id: 'desfazer', label: 'Desfazer a pasta', icon: ICON.desfazerPasta, danger: true, hint: 'O que tem dentro sobe; nenhuma pixel art é apagada', run: () => void this.dissolve(f) }],
    ];
  }

  /** O menu do vão da parede: uma obra ou uma pasta ali. */
  private gapSections(): MenuSections {
    return [
      [
        { id: 'nova-obra', label: 'Nova pixel art aqui', icon: ICON.adicionar, dialog: true, keys: 'N', ariaKeys: 'N', run: () => this.add() },
        { id: 'nova-pasta', label: 'Nova pasta aqui', icon: ICON.novaPasta, run: () => this.newFolder(this.openFolder()) },
      ],
      ...(this.inNotes().length ? [[{ id: 'trazer', label: 'Trazer das anotações…', icon: ICON.anotacoes, dialog: true, count: this.newInNotes() ? { n: this.newInNotes(), say: `${this.newInNotes()} ainda fora da galeria` } : undefined, run: () => this.importing.set(true) }]] : []),
    ];
  }

  /** O que está sendo movido pela folha: obras, ou uma pasta. */
  protected readonly moving = signal<{ kind: 'obras'; ids: readonly string[]; name: string; from: string | null } | { kind: 'pasta'; id: string; name: string; from: string | null } | null>(null);
  /** O que a folha precisa saber: as contas, onde está e o que não se pode escolher. */
  protected readonly moveSheet = computed(() => {
    const m = this.moving();
    if (!m) return null;
    const tree = this.folderTree();
    return {
      title: m.kind === 'pasta' ? `Mover a pasta ${m.name}` : `Mover ${m.name}`,
      sub: `Está em ${this.folderName(m.from)}`,
      counts: this.folders.counts(),
      blocked: m.kind === 'pasta' ? tree.below(m.id) : new Set<string>(),
      rootLabel: m.kind === 'pasta' ? 'Direto em Pixel arts' : 'Sem pasta',
      start: m.from,
    };
  });

  /** Escolheu na folha: move (as obras, ou a pasta), com o aviso e o Desfazer. */
  protected moveTo(id: string | null): void {
    const m = this.moving();
    this.moving.set(null);
    // (as obras marcadas podem estar em pastas de dentro da aberta: escolher a aberta ainda as move)
    if (!m || (m.kind === 'pasta' && id === m.from)) return;
    if (m.kind === 'pasta') this.dropped({ kind: 'pasta', id: m.id }, { kind: 'guardar', folder: id });
    else this.dropped({ kind: 'notas', lead: m.ids[0], ids: m.ids }, { kind: 'guardar', folder: id });
  }

  /** O nome escrito na folha que ainda não é pasta: cria ali e move para ela. */
  protected moveToNew(e: { parent: string | null; name: string }): void {
    const made = this.folders.create(e.parent, e.name);
    if (made) this.moveTo(made.id);
    else {
      this.moving.set(null);
      this.toasts.show('Não cabe mais nenhuma pasta aqui.');
    }
  }

  /** A linha do widget (`{{pixel: …}}`, com o nome de legenda) na área de transferência, para colar numa anotação. */
  protected copyWidget(id: string): Promise<void> {
    const p = this.gallery.get(id);
    if (!p) return Promise.resolve();
    return this.toasts.copy(pieceWidgetLine(p), 'Copiei a pixel art como widget: cole numa anotação.', 'Não deu para copiar. Tente de novo.');
  }

  /** Uma cópia da obra, com "(cópia)" no nome: entra como a mais nova, e a tela vai até ela. */
  protected duplicate(id: string): void {
    const p = this.gallery.get(id);
    if (!p) return;
    const made = this.gallery.create({ art: p.art, title: p.title ? `${p.title} (cópia)` : '', tags: p.tags ?? [], note: p.note ?? '', folder: p.folder });
    if (!made) {
      this.toasts.show('A galeria está cheia: apague uma pixel art para guardar outra.');
      return;
    }
    this.land(made.id);
    this.toasts.show(`Fiz uma cópia de “${pieceTitle(p)}”.`, { label: 'Desfazer', run: () => this.transitions.run(() => this.gallery.remove([made.id])) });
  }

  /** Apaga (com o Desfazer); o foco vai para a obra vizinha, ou para a busca. */
  protected remove(id: string): void {
    const p = this.gallery.get(id);
    if (!p) return;
    focusAfterRemoval(this.host, this.visible().map((x) => x.id), id, (n) => `[data-ficha="${CSS.escape(n)}"] .hit`, '.vazio .btn-ink, #busca-pixel');
    this.transitions.run(() => {
      const gone = this.gallery.remove([id]);
      this.toasts.show(`“${pieceTitle(p)}” saiu da galeria`, { label: 'Desfazer', run: () => this.transitions.run(() => this.gallery.restore(gone)) });
    });
  }

  /** A obra assenta na parede (nova, ou mudada): a tela vai até ela e o foco também. */
  private land(id: string): void {
    this.landing.set(id);
    setTimeout(() => this.landing.update((x) => (x === id ? null : x)), 900);
    this.follow(id);
  }

  /** O foco no alto da parede (o caminho, ou a busca): a obra de antes saiu daqui. */
  private focusWall(): void {
    afterNextRender(() => (this.host.querySelector<HTMLElement>('app-folder-path .aqui') ?? this.host.querySelector<HTMLElement>('#busca-pixel'))?.focus(), { injector: this.injector });
  }

  /** A galeria tem algo para mostrar: obras, ou pastas (mesmo sem obra nenhuma, elas continuam à mão). */
  protected readonly hasWall = computed(() => this.gallery.count() > 0 || this.folderTree().kids(this.group, null).length > 0);

  /** O teclado vai até a obra (no botão `at` dela, ou no toque), depois que a parede assenta. */
  private follow(id: string, at: string | null = null): void {
    afterNextRender(
      () => {
        setTimeout(() => {
          const box = this.host.querySelector(`[data-ficha="${CSS.escape(id)}"]`);
          const btn = (at ? box?.querySelector<HTMLElement>(at) : null) ?? box?.querySelector<HTMLElement>('.hit');
          btn?.focus({ preventScroll: true });
          btn?.scrollIntoView({ block: 'nearest', behavior: reducedMotion() ? 'auto' : 'smooth' });
        }, 140);
      },
      { injector: this.injector },
    );
  }
}
