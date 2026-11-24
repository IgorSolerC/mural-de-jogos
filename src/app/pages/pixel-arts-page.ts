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
import { WallDrag, WallDragItem, WallDrop, grabOf } from './wall-drag';
import { PixelLook } from '../core/pixel-art';
import { FoundPixelArt, PIXEL_TAG_SPACE, PixelPiece, artValues, pieceTitle, pieceWidgetLine, pixelArtOf, pixelArtsInNotes, valuesArt } from '../core/pixel-gallery';
import { StoredLayer } from '../core/pixel-layers';
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
  pieceMatches,
  pixelDirectionLabel,
  pixelFiltering,
  pixelLookOptions,
  pixelNaturalDirection,
  sanitizePixelPrefs,
  sortPieces,
} from '../core/pixel-gallery-view';
import { downloadBlob, pieceToPng, pngName } from '../core/pixel-png';
import { NO_SCALE, PixelScale, Rgba, asksScale, fitSide, guessScale, imageArt, pixelSized, shrinkRgba, titleOfFile } from '../core/pixel-import';
import { DroppedBig, PixelDropSheet } from '../ui/pixel-drop-sheet';
import { ImageReadError, imageFilesOf, readImagePixels } from '../ui/image-pixels';
import { WallFileDrop } from './wall-file-drop';
import { lookKey } from '../core/category-looks';
import { TEXT_MAX, fold } from '../core/review';
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
import { FOLDER_MARK, NoteSelection, copyMarkedItem, insideWords } from '../ui/note-selection';
import { foldersRemovalAsk, joinMarked, markedTops, marksLabel, moveMarked, movedText } from '../core/folder-marks';
import { Confirm } from '../ui/confirm';

/** O que a galeria tem, no singular e no plural (as contas das marcadas). */
const PIXEL_WORDS = ['pixel art', 'pixel arts'] as const;
import { Pin } from '../ui/pin';
import { PixelBulkTags, PixelTagsChange } from '../ui/pixel-bulk-tags';
import { PixelImportSheet } from '../ui/pixel-import-sheet';
import { SelectionTray, TrayAction } from '../ui/selection-tray';
import { PixelPieceCard } from '../ui/pixel-piece';
import { PixelSheet } from '../ui/pixel-sheet';
import { PixelStudio, StudioResult } from '../ui/pixel-studio/pixel-studio';
import { PixelTile } from '../ui/pixel-tile';
import { SearchHighlight } from '../ui/search-highlight';
import { SearchStrip } from '../ui/search-strip';
import { TagChip } from '../ui/tag-chips';
import { Toasts } from '../ui/toast';

/**
 * O fim do aviso de quando o widget copiado passa do tamanho de uma anotação (`TEXT_MAX`): com obras de até
 * 256 × 256, uma bem picada não cabe, e o editor não guardaria a anotação.
 */
const TOO_BIG_FOR_NOTE = `, mas passa do tamanho de uma anotação (${TEXT_MAX.toLocaleString('pt-BR')} letras): para pôr numa anotação, baixe o PNG e cole a imagem.`;

/** Uma imagem de uma soltada, já lida: o passo com que vem (as grandes, o que a folha responder) e o palpite. */
interface ReadImage {
  key: string;
  file: File;
  title: string;
  /** A imagem lida (a grande sem palpite, já encolhida até `WAIT_SIDE`). */
  img: Rgba;
  /** O tamanho dela, como veio. */
  w: number;
  h: number;
  scale: PixelScale;
  /** Maior que 64 × 64: a folha pergunta se é ampliada. */
  ask: boolean;
  guess: PixelScale | null;
}

/** O lado maior de uma imagem grande sem palpite enquanto a folha pergunta (ver `takeFiles`). */
const WAIT_SIDE = 1024;

/** O que ficou de fora de uma soltada de imagens, por quê. */
interface DropSkips {
  /** Não eram imagens. */
  others: number;
  /** O navegador não abriu. */
  broken: number;
  /** Grandes demais para abrir (o arquivo ou o lado). */
  big: number;
  /** Todas transparentes (nenhum ponto para trazer). */
  blank?: number;
  /** A galeria encheu (de obras ou de peso). */
  full?: number;
}

/**
 * O aviso de uma soltada de imagens: quantas chegaram e onde ("“Mario” chegou em Bichos", "3 pixel arts chegaram à
 * galeria") e, entre parênteses, o que ficou de fora.
 */
export function droppedText(made: readonly Pick<PixelPiece, 'title'>[], where: string | null, s: DropSkips): string {
  const n = (k: number, one: string, many: string) => `${k} ${k === 1 ? one : many}`;
  const out = [
    s.others && n(s.others, 'não é imagem', 'não são imagens'),
    s.broken && n(s.broken, 'não abriu', 'não abriram'),
    s.big && n(s.big, 'é grande demais', 'são grandes demais'),
    s.blank && n(s.blank, 'é toda transparente', 'são todas transparentes'),
    s.full && `${n(s.full, 'não coube', 'não couberam')}: a galeria encheu`,
  ].filter(Boolean);
  const place = where ? `em ${where}` : 'à galeria';
  const head = !made.length ? 'Nenhuma imagem virou pixel art' : made.length === 1 ? `“${pieceTitle(made[0])}” chegou ${place}` : `${made.length} pixel arts chegaram ${place}`;
  return `${head}${out.length ? ` (${out.join(', ')})` : ''}.`;
}

/**
 * Pixel arts (PLANO-PIXEL-ARTS.md): a galeria de todas as pixel arts guardadas, em Extras. A Wishlist das Análises
 * é a base: a pasta de cima com a busca (no título, nas tags e na descrição), o Filtrar (a folha das Anotações,
 * com o Jeito de uma por vez e as Tags nas cores), a ordem com o inverter e a vista. Na Mostra, cada obra no
 * jeito dela, em fileiras de quadrados iguais; na Grade, mais de uma vez, menores e sem jeito. Tocar abre a
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
  imports: [ContextMenu, FilterCard, FilterTags, FolderCard, FolderMoveSheet, FolderPath, IconModule, Pin, PixelBulkTags, PixelDropSheet, PixelImportSheet, SelectionTray, PixelPieceCard, PixelSheet, PixelStudio, PixelTile, SearchHighlight, SearchStrip],
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
  private readonly confirm = inject(Confirm);
  private readonly destroyRef = inject(DestroyRef);
  private readonly injector = inject(Injector);

  protected readonly AddIcon = ICON.pixelArt;
  protected readonly ImageIcon = ICON.imagem;
  protected readonly ChevronIcon = ICON.abrir;
  protected readonly FilterIcon = ICON.filtrar;
  protected readonly MarkIcon = ICON.marcado;
  protected readonly DescIcon = ICON.ordenarDecrescente;
  protected readonly AscIcon = ICON.ordenarCrescente;
  protected readonly orders = PIXEL_ORDERS;
  protected readonly views: readonly { value: PixelView; label: string; hint: string; icon: typeof ICON.grade }[] = [
    { value: 'mostra', label: 'Mostra', hint: 'Mostra: cada uma no jeito dela', icon: ICON.imagem },
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
  /** Só a busca está ligada (nenhum filtro da folha). */
  protected readonly onlySearch = computed(() => {
    const f = this.filter();
    return !!f.query.trim() && !f.jeito && !f.on.size && !f.out.size;
  });
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
  readonly selection: NoteSelection<PixelPiece> = new NoteSelection<PixelPiece>({
    host: inject(ElementRef<HTMLElement>).nativeElement as HTMLElement,
    markable: 'app-pixel-piece[data-ficha], app-pixel-tile[data-ficha]',
    idOf: (el) => el.getAttribute('data-ficha'),
    on: () => true,
    notes: () => this.byId(),
    // as marcas ficam ao abrir e fechar pastas, como nas Anotações: dá para marcar numa, subir, marcar mais e mover
    // tudo de uma vez (PLANO-MARCAR-PASTAS.md, D4)
    reset: () => null,
    layout: () => [this.visible(), this.prefs().vista, this.folderKids()],
    drags: true,
    mode: this.marking,
    // as pastas também se marcam
    folders: {
      markable: 'app-folder-card[data-pasta]',
      idOf: (el) => el.getAttribute('data-pasta'),
      live: this.folders.live,
      open: (id) => this.enterFolder(id),
      inside: (id) => this.inside(id).map((p) => p.id),
    },
    // o Ctrl+C das marcadas: as linhas dos widgets, para colar numa anotação (com as de dentro das pastas marcadas)
    copy: (items, inside) => {
      const text = items.map(pieceWidgetLine).join('\n\n');
      const said = `${items.length === 1 ? 'Copiei a pixel art como widget' : `Copiei as ${items.length} pixel arts como widgets`}${insideWords(inside, items.length, this.selection.folders().length)}`;
      return { text, done: said + (text.length > TEXT_MAX ? TOO_BIG_FOR_NOTE : '.') };
    },
  });

  /** As obras de uma pasta e das de dentro dela, na ordem da galeria: o que vai junto com a pasta marcada. */
  private inside(id: string): PixelPiece[] {
    const below = this.folderTree().below(id);
    return sortPieces(
      this.gallery.pieces().filter((p) => below.has(this.whereIs(p.id) ?? '')),
      this.prefs(),
    );
  }

  /** As pastas marcadas, vivas, só as de cima (a de dentro de outra marcada vai com ela). */
  private readonly markedTop = computed(() => markedTops(this.folderTree(), { folders: this.selection.folders(), items: this.selection.ids() }, (id) => this.whereIs(id)));
  /** As marcadas que a busca, os filtros ou a pasta não mostram agora (as pastas também). */
  protected readonly hiddenMarked = computed(() => {
    const shown = new Set(this.visible().map((p) => p.id));
    const kids = new Set(this.folderKids().map((f) => f.id));
    return this.selection.ids().filter((id) => !shown.has(id)).length + this.selection.folders().filter((id) => !kids.has(id)).length;
  });
  /** As obras marcadas e, das pastas marcadas, as de dentro (sem repetir): o que Baixar, Tags e Apagar levam. */
  private readonly marked = computed(() => this.selection.copied().items);
  /** A folha das tags das marcadas, aberta. */
  protected readonly bulkTags = signal<readonly PixelPiece[] | null>(null);
  /** O que a tira oferece: marcar todas as à mostra, copiar, baixar, as tags, apagar e, de tinta, mover. */
  protected readonly trayActions = computed<TrayAction[]>(() => {
    const n = this.selection.count();
    // (as pastas à mostra também: "todas" é tudo o que está na parede)
    const shown = [...this.folderKids().map((f) => FOLDER_MARK + f.id), ...this.visible().map((p) => p.id)];
    const all = shown.length > 0 && shown.every((k) => this.selection.has(k));
    const pieces = this.marked().length;
    const folders = this.selection.folders().length;
    const inside = folders ? 'Também as de dentro das pastas marcadas' : undefined;
    return [
      { id: 'todas', label: 'Marcar todas', icon: ICON.marcado, disabled: all, hint: 'As à mostra agora', run: () => this.selection.add(shown) },
      { id: 'copiar', label: 'Copiar', icon: ICON.copiar, disabled: !n, hint: 'Como widgets, para colar numa anotação', run: () => void this.selection.copy() },
      { id: 'baixar', label: 'Baixar', icon: ICON.baixar, disabled: !pieces, hint: inside ?? 'Um PNG de cada', run: () => void this.downloadMany(this.marked()) },
      { id: 'tags', label: 'Tags…', icon: ICON.etiquetas, disabled: !pieces, hint: inside, run: () => this.bulkTags.set(this.marked()) },
      { id: 'apagar', label: 'Apagar', icon: ICON.apagar, disabled: !n, danger: true, run: () => void this.removeMarked() },
      { id: 'mover', label: 'Mover para pasta…', icon: ICON.guardarNaPasta, primary: true, run: () => this.moveMarked() },
    ];
  });

  /** "Mover para pasta…" da tira e do menu de uma marcada: a folha, com as pastas marcadas indo inteiras. */
  private moveMarked(): void {
    const tops = this.markedTop();
    const n = tops.folders.length + tops.items.length;
    if (!n) return;
    if (tops.folders.length) {
      const from = new Set([...tops.folders.map((id) => this.folderTree().parentOf(id)), ...tops.items.map((id) => this.whereIs(id))]);
      this.moving.set({ kind: 'varios', ids: tops.items, folders: tops.folders, name: marksLabel(tops.folders.length, tops.items.length, PIXEL_WORDS), from: from.size === 1 ? [...from][0] : null });
      return;
    }
    const one = this.gallery.get(tops.items[0]);
    this.moving.set({ kind: 'obras', ids: tops.items, name: n === 1 && one ? pieceTitle(one) : plural(n, 'pixel art', 'pixel arts'), from: this.openFolder() });
  }

  /**
   * Apagar da tira: as obras marcadas (com o Desfazer, como sempre); com pastas marcadas, a pergunta de sempre das
   * pastas (PLANO-MARCAR-PASTAS.md, D10): elas saem com tudo o que está dentro, ou só se desfazem.
   */
  private async removeMarked(): Promise<void> {
    const tops = this.markedTop();
    if (!tops.folders.length) {
      this.removeMany(tops.items);
      return;
    }
    const all = this.marked().map((p) => p.id);
    const nf = tops.folders.length;
    const choice = await this.confirm.choose(foldersRemovalAsk(nf, all.length - tops.items.length, tops.items.length, PIXEL_WORDS));
    if (!choice) return;
    this.transitions.run(() => {
      if (choice === 'secondary') {
        const undos = tops.folders.map((id) => this.folders.dissolve(id));
        const gone = this.gallery.remove(tops.items);
        this.selection.done();
        this.toasts.show(`${nf === 1 ? 'A pasta foi desfeita' : `As ${nf} pastas foram desfeitas`}${gone.length ? ` e ${plural(gone.length, 'pixel art saiu', 'pixel arts saíram')} da galeria` : ''}.`, {
          label: 'Desfazer',
          run: () =>
            this.transitions.run(() => {
              this.gallery.restore(gone);
              [...undos].reverse().forEach((u) => u());
            }),
        });
        return;
      }
      const gone = this.gallery.remove(all);
      const undoFolders = this.folders.drop(tops.folders);
      this.selection.done();
      this.toasts.show(`${marksLabel(nf, gone.length, PIXEL_WORDS)} ${nf + gone.length === 1 ? 'saiu' : 'saíram'} da galeria.`, {
        label: 'Desfazer',
        run: () =>
          this.transitions.run(() => {
            undoFolders();
            this.gallery.restore(gone);
          }),
      });
    });
  }

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

  /** Um PNG de cada marcada (grande, ou no tamanho original), com nomes que não se repetem. */
  private async downloadMany(list: readonly PixelPiece[], original = false): Promise<void> {
    const taken = new Set<string>();
    for (const p of list) {
      const blob = await pieceToPng(p, original);
      if (!blob) continue;
      const name = pngName(p, taken, original ? pixelArtOf(p) : undefined);
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
      // (com pastas marcadas, as obras de dentro delas também: Tags, Baixar e Copiar contam as obras)
      const k = this.marked().length;
      return [
        [as('mover', `Mover as ${n} para pasta…`, ICON.guardarNaPasta, true), as('tags', `Tags das ${k}…`, ICON.etiquetas, true)],
        [
          as('baixar', `Baixar as ${k}`, ICON.baixar),
          { id: 'baixar-original', label: `Baixar as ${k} no tamanho original`, hint: 'Um pixel por ponto', icon: ICON.baixar, run: () => void this.downloadMany(this.marked(), true) },
          as('copiar', `Copiar as ${k} como widgets`, ICON.copiar),
        ],
        [{ ...as('apagar', `Apagar as ${n}`, ICON.apagar), danger: true }],
      ];
    }
    return [
      [
        { id: 'editar', label: 'Editar', icon: ICON.ajustar, dialog: true, run: () => this.open(p.id) },
        { id: 'atelie', label: 'Abrir no ateliê', icon: ICON.paleta, dialog: true, run: () => this.atelie(p.id) },
      ],
      [
        { id: 'baixar', label: 'Baixar PNG', hint: 'Grande, cada ponto um quadrado nítido', icon: ICON.baixar, run: () => void this.download(p.id) },
        { id: 'baixar-original', label: `Baixar no tamanho original (${pixelArtOf(p).w} × ${pixelArtOf(p).h})`, hint: 'Um pixel por ponto, para abrir num editor de pixel art', icon: ICON.baixar, run: () => void this.download(p.id, true) },
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

  // ===== Trazer imagens do computador (PLANO-SOLTAR-IMAGENS.md): soltar na página, ou o seletor de arquivos =====

  /** Lendo as imagens de uma soltada: outra espera esta acabar. */
  protected readonly reading = signal(false);
  private readonly filePicker = viewChild<ElementRef<HTMLInputElement>>('arquivos');
  /** A pasta de quando o seletor de arquivos abriu (as escolhidas vão para ela). */
  private pickFolder: string | null = null;

  /** O seletor de arquivos do aparelho (o jeito sem arrastar: no celular, o único), para a pasta `folder`. */
  protected pickFiles(folder: string | null = this.openFolder()): void {
    this.pickFolder = folder;
    this.filePicker()?.nativeElement.click();
  }

  protected picked(e: Event): void {
    const input = e.target as HTMLInputElement;
    const files = Array.from(input.files ?? []);
    // (o mesmo arquivo escolhido de novo também avisa)
    input.value = '';
    if (files.length) void this.takeFiles(files, this.pickFolder);
  }

  /**
   * As imagens soltas (ou escolhidas) viram obras na pasta `folder`: cada uma lida pixel por pixel, a pixel art
   * ampliada de volta ao tamanho dela (a adivinhada), no teto de 256, com as cores dela e o nome do arquivo.
   */
  async takeFiles(list: FileList | readonly File[], folder: string | null): Promise<void> {
    if (this.reading()) return;
    const all = Array.from(list);
    const files = imageFilesOf(all);
    const skipped: DropSkips = { others: all.length - files.length, broken: 0, big: 0 };
    if (!files.length) {
      this.toasts.show(all.length === 1 ? 'Isso não é uma imagem: traga um PNG, GIF, JPG ou WebP.' : 'Nenhum desses arquivos é uma imagem: traga PNG, GIF, JPG ou WebP.');
      return;
    }
    this.reading.set(true);
    // ler demora (a imagem grande, ou muitas): o aviso diz que está lendo
    const slow = setTimeout(() => this.toasts.show(files.length === 1 ? 'Lendo a imagem…' : `Lendo ${files.length} imagens…`), files.length > 3 ? 0 : 400);
    const read: ReadImage[] = [];
    try {
      for (const [i, f] of files.entries()) {
        try {
          const img = await readImagePixels(f);
          // a maior que 64 pergunta se é ampliada: o palpite vai junto
          const ask = asksScale(img.w, img.h);
          const guess = ask ? guessScale(img) : null;
          // a grande que não é ampliada (uma foto) espera a resposta já encolhida: dez fotos inteiras na memória
          // derrubariam o celular, e a obra para em 256 de qualquer jeito
          const fit = !guess ? fitSide(img.w, img.h, WAIT_SIDE) : img;
          const kept = fit.w < img.w ? shrinkRgba(img, fit.w, fit.h) : img;
          read.push({ key: `${i}`, file: f, title: titleOfFile(f.name), img: kept, w: img.w, h: img.h, scale: NO_SCALE, ask, guess });
        } catch (err) {
          if (err instanceof ImageReadError && err.problem === 'grande') skipped.big++;
          else skipped.broken++;
        }
      }
    } finally {
      clearTimeout(slow);
      this.reading.set(false);
    }
    const asked = read.filter((r) => r.ask);
    if (!asked.length) {
      this.bringRead(read, folder, skipped);
      return;
    }
    // as grandes: a folha pergunta (as pequenas esperam e vêm junto, num passo só do Desfazer)
    const where = folder ? (this.folderTree().live(folder)?.name ?? 'a galeria') : 'a galeria';
    this.dropAsk.set({ read, folder, skipped, where, big: asked.map((r) => ({ key: r.key, title: r.title, url: URL.createObjectURL(r.file), img: r.img, w: r.w, h: r.h, guess: r.guess })) });
  }

  /** A soltada com imagens grandes, esperando a resposta da folha (ui/pixel-drop-sheet.ts). */
  protected readonly dropAsk = signal<{ read: ReadImage[]; folder: string | null; skipped: DropSkips; where: string; big: DroppedBig[] } | null>(null);

  /** A folha respondeu: cada grande com o passo dela (a que não veio no mapa fica de fora), e as pequenas vêm junto. */
  protected dropAnswered(scales: ReadonlyMap<string, PixelScale>): void {
    const q = this.dropAsk();
    if (!q) return;
    this.dropClosed();
    this.bringRead(
      q.read.filter((r) => !r.ask || scales.has(r.key)).map((r) => ({ ...r, scale: scales.get(r.key) ?? r.scale })),
      q.folder,
      q.skipped,
    );
  }

  /** A folha fechou (Cancelar, Esc, ou depois de responder): as miniaturas saem da memória. */
  protected dropClosed(): void {
    const q = this.dropAsk();
    if (!q) return;
    for (const b of q.big) URL.revokeObjectURL(b.url);
    this.dropAsk.set(null);
  }

  private bringRead(read: readonly ReadImage[], folder: string | null, skipped: DropSkips): void {
    // a pasta pode ter saído enquanto as imagens eram lidas (desfeita aqui, ou noutro aparelho): elas vão para a raiz
    this.bringImages(read, folder && this.folderTree().live(folder) ? folder : null, skipped);
  }

  /** As lidas viram obras de uma vez (um passo do Desfazer); o aviso diz quantas, para onde e o que ficou de fora. */
  private bringImages(list: readonly { title: string; img: Rgba; scale: PixelScale }[], folder: string | null, skipped: DropSkips): void {
    const made: PixelPiece[] = [];
    let blank = 0;
    let full = 0;
    for (const it of list) {
      const art = imageArt(pixelSized(it.img, it.scale));
      if (!art) {
        blank++;
        continue;
      }
      const p = this.gallery.create({ art, title: it.title, folder: folder ?? undefined });
      if (p) made.push(p);
      else full++;
    }
    const text = droppedText(made, folder ? this.folderName(folder) : null, { ...skipped, blank, full });
    if (!made.length) {
      this.toasts.show(text);
      return;
    }
    // os filtros que esconderiam as que chegaram saem da frente; a parede vai até a pasta delas
    if (made.some((p) => !pieceMatches(p, this.filter()))) this.filter.set(NO_PIXEL_FILTER);
    if (!this.filtering() && folder !== this.openFolder()) this.enterFolder(folder, true, false);
    this.undoToast(text, () => this.gallery.remove(made.map((p) => p.id)));
    this.land(made[0].id);
  }

  /** O desenho aberto direto no ateliê (o Ateliê da etiqueta), com o que mudou até agora. */
  /** O Ateliê aberto pela etiqueta: a obra e o desenho dela quando abriu; `went`, para onde o foco vai ao fechar (a obra, ou a cópia). */
  protected readonly studio = signal<{ id: string; title: string; values: WidgetValues; layers: StoredLayer[] | undefined; went?: string } | null>(null);

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    this.host = host;
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
    // o botão direito numa pasta da parede, ou no nada: tudo abaixo da busca que não tem menu próprio (os vãos da
    // parede, as margens, o fim da página, o cartaz de vazio)
    const folderTrigger = new ContextMenuTrigger({
      host,
      targets: 'app-folder-card[data-pasta]',
      ignore: 'app-pixel-piece, app-pixel-tile, input',
      blank: 'busca-pixel',
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
      markedFolders: () => this.selection.folders(),
      openFolder: () => this.openFolder(),
      groupName: () => 'Pixel arts',
      folderName: (id) => this.folderTree().live(id)?.name ?? null,
      folderOf: (id) => this.whereIs(id),
      below: (id) => this.folderTree().below(id),
      parentOf: (id) => this.folderTree().parentOf(id),
      drop: (item, to) => this.dropped(item, to),
      open: (id) => this.enterFolder(id),
      menu: (item, box, x, y) => {
        const grab = grabOf(item);
        if (grab.kind === 'pasta') folderTrigger.openAt(`pasta:${grab.id}`, x, y, box);
        else pieceTrigger.openAt(grab.id, x, y, box);
      },
      scope: () => host.querySelector('.mostra, .grade, .pastas'),
      gap: '.mostra, .grade, .pastas, .no-results',
      pieces: {
        selector: 'app-pixel-piece[data-ficha], app-pixel-tile[data-ficha]',
        idOf: (el) => el.getAttribute('data-ficha'),
        // só a obra (sem a legenda de baixo); o cartão da Grade inteiro
        face: (el) => (el.matches('app-pixel-tile') ? el : (el.querySelector<HTMLElement>('.obra') ?? el)),
        joinLabel: (n) => (n === 1 ? 'Nova pasta com as duas' : `Nova pasta com as ${n + 1}`),
        units: PIXEL_WORDS,
        core: 0.6,
      },
    });
    this.destroyRef.onDestroy(() => drag.off());
    // soltar imagens do computador: numa pasta, num pedaço do caminho, ou em qualquer lugar (a pasta aberta)
    const files = new WallFileDrop({
      host,
      // (as folhas da página por cima; uma modal de fora já deixa a página inerte, e nada chega aqui)
      on: () => !this.reading() && !this.studio() && !host.querySelector('dialog[open]'),
      wall: () => host.querySelector<HTMLElement>('.mostra, .grade, .vazio'),
      scope: () => host.querySelector('.mostra, .grade, .vazio'),
      openFolder: () => this.openFolder(),
      folderName: (id) => this.folderTree().live(id)?.name ?? null,
      rootName: 'a galeria',
      label: (n, where) => `${n === 1 ? 'Trazer a imagem' : `Trazer ${n} imagens`} para ${where}`,
      open: (id) => this.enterFolder(id),
      drop: (list, folder) => void this.takeFiles(list, folder),
    });
    this.destroyRef.onDestroy(() => {
      files.off();
      // a página saiu com a folha das grandes aberta: as miniaturas saem da memória
      this.dropClosed();
    });
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

  /** O Ateliê da etiqueta: o desenho direto no ateliê, por cima de tudo; sair pergunta o que fazer com o que mudou. */
  protected atelie(id: string): void {
    const p = this.gallery.get(id);
    if (p) this.studio.set({ id, title: p.title, values: artValues(p.art), layers: p.layers });
  }

  /** Salvar: o desenho vai para a obra (com o Desfazer); o jeito fica o da obra. */
  protected studioSaved(r: StudioResult): void {
    const s = this.studio();
    if (!s) return;
    const p = this.gallery.get(s.id);
    const art = valuesArt({ ...s.values, ...r.values });
    if (p && art) {
      const undo = this.gallery.update(s.id, { art, layers: r.layers });
      if (undo) this.toasts.show(`“${pieceTitle(p)}” mudou na galeria`, { label: 'Desfazer', run: () => this.transitions.run(undo) });
      else if (JSON.stringify([art, r.layers ?? null]) !== JSON.stringify([p.art, p.layers ?? null])) this.toasts.show(`Não deu para salvar “${pieceTitle(p)}”: o desenho ficou como era.`);
    } else if (p) {
      this.toasts.show('Uma pixel art precisa de pelo menos um ponto: o desenho ficou como era.');
    } else if (art) {
      // apagada noutro aparelho enquanto o ateliê estava aberto: o desenho não some, vira uma obra nova
      const made = this.gallery.create({ art, layers: r.layers, title: s.title, folder: this.openFolder() ?? undefined });
      if (!made) {
        this.toasts.show('A pixel art foi apagada noutro aparelho, e a galeria está cheia: o desenho não coube.');
        return;
      }
      this.toasts.show('A pixel art foi apagada noutro aparelho: guardei o desenho como uma obra nova.');
      this.studio.set({ ...s, went: made.id });
    }
  }

  /** Salvar como cópia: uma obra nova com o desenho ("X (cópia)", as tags, a descrição e a pasta da de antes); a de antes fica como era. */
  protected studioCopied(r: StudioResult): void {
    const s = this.studio();
    if (!s) return;
    const p = this.gallery.get(s.id);
    const art = valuesArt({ ...s.values, ...r.values });
    if (!art) {
      this.toasts.show('Uma pixel art precisa de pelo menos um ponto: a cópia não foi feita.');
      return;
    }
    const title = p?.title ?? s.title;
    const made = this.gallery.create({ art, layers: r.layers, title: title ? `${title} (cópia)` : '', tags: p?.tags ?? [], note: p?.note ?? '', folder: p ? p.folder : (this.openFolder() ?? undefined) });
    if (!made) {
      this.toasts.show('A galeria está cheia: apague uma pixel art para guardar a cópia.');
      return;
    }
    this.toasts.show(`Guardei a cópia, “${pieceTitle(made)}”; ${p ? `“${pieceTitle(p)}” ficou como era` : 'a de antes não está mais na galeria'}.`, { label: 'Desfazer', run: () => this.transitions.run(() => this.gallery.remove([made.id])) });
    this.studio.set({ ...s, went: made.id });
  }

  /** O ateliê fechou (salvando, ou não): o foco volta para o Ateliê da obra, ou vai para a obra nova. */
  protected studioClosed(): void {
    const s = this.studio();
    this.studio.set(null);
    if (!s) return;
    if (s.went) this.land(s.went);
    else this.follow(s.id, 'app-pixel-actions .atelie');
  }

  /** O Baixar: o PNG nítido da obra (grande, ou no tamanho original: um pixel por ponto). */
  protected async download(id: string, original = false): Promise<void> {
    const p = this.gallery.get(id);
    if (!p) return;
    const blob = await pieceToPng(p, original);
    if (!blob) {
      this.toasts.show('Não consegui montar a imagem agora. Tente de novo.');
      return;
    }
    downloadBlob(blob, pngName(p, new Set(), original ? pixelArtOf(p) : undefined));
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
    if (item.kind === 'varios') {
      // as marcadas com pastas no meio (PLANO-MARCAR-PASTAS.md, D6)
      this.transitions.run(() => {
        if (to.kind === 'juntar') {
          const made = joinMarked((ids) => this.folders.gather(ids, this.openFolder()), this.folders, [...item.ids, to.with], item.folders);
          if (!made) {
            this.toasts.show('Não cabe mais nenhuma pasta aqui.');
            return;
          }
          this.selection.done();
          this.naming.set(made.folder.id);
          this.undoToast(`Nova pasta com ${marksLabel(made.folders, item.ids.length + 1, PIXEL_WORDS)}.`, made.undo);
          return;
        }
        const done = moveMarked(this.folders, { folders: item.folders, items: item.ids }, to.folder);
        const said = movedText(done, PIXEL_WORDS, to.folder ? this.folderName(to.folder) : 'a galeria', to.folder !== null);
        if (!said.moved) {
          this.toasts.show(said.text);
          return;
        }
        this.selection.done();
        this.undoToast(said.text, done.undo);
      });
      return;
    }
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
    const one = pieceTitle(this.gallery.get(grabOf(item).id) ?? { title: '' });
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
      ...this.markedItems(f.id),
      [{ id: 'abrir', label: 'Abrir', icon: ICON.pastaDeNotas, run: () => this.enterFolder(f.id) }, this.markItem(f.id)],
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
        { id: 'trazer-imagens', label: 'Trazer imagens do computador…', icon: ICON.imagem, dialog: true, run: () => this.pickFiles(f.id) },
        { id: 'nova-pasta', label: 'Nova pasta dentro', icon: ICON.novaPasta, run: () => this.newFolder(f.id) },
        { id: 'renomear', label: 'Renomear', icon: ICON.editar, run: () => this.naming.set(f.id) },
        { id: 'mover', label: 'Mover para…', icon: ICON.guardarNaPasta, dialog: true, run: () => this.moving.set({ kind: 'pasta', id: f.id, name: f.name, from: this.folderTree().parentOf(f.id) }) },
      ],
      [{ id: 'desfazer', label: 'Desfazer a pasta', icon: ICON.desfazerPasta, danger: true, hint: 'O que tem dentro sobe; nenhuma pixel art é apagada', run: () => void this.dissolve(f) }],
    ];
  }

  /** Marcar ou desmarcar a pasta, no menu dela (no toque, o jeito de marcar sem o Ctrl). */
  private markItem(id: string): MenuItem {
    const on = this.selection.hasFolder(id);
    return { id: 'marcar', label: on ? 'Desmarcar' : 'Marcar', icon: on ? ICON.desmarcado : ICON.marcado, hint: on ? undefined : 'Para mover, baixar ou apagar várias juntas', run: () => this.selection.toggleFolder(id) };
  }

  /** No alto do menu de uma pasta marcada, com outras marcadas: mover e copiar todas (PLANO-MARCAR-PASTAS.md, D11). */
  private markedItems(id: string): MenuSections {
    const n = this.selection.count();
    if (!this.marking() || n < 2 || !this.selection.hasFolder(id)) return [];
    return [[{ id: 'mover-marcadas', label: `Mover as ${n} marcadas…`, icon: ICON.guardarNaPasta, dialog: true, run: () => this.moveMarked() }, copyMarkedItem(this.selection)]];
  }

  /** O menu do vão da parede: uma obra ou uma pasta ali. */
  private gapSections(): MenuSections {
    return [
      [
        { id: 'nova-obra', label: 'Nova pixel art aqui', icon: ICON.adicionar, dialog: true, keys: 'N', ariaKeys: 'N', run: () => this.add() },
        { id: 'nova-pasta', label: 'Nova pasta aqui', icon: ICON.novaPasta, run: () => this.newFolder(this.openFolder()) },
      ],
      [{ id: 'trazer-imagens', label: 'Trazer imagens do computador…', icon: ICON.imagem, dialog: true, run: () => this.pickFiles() }],
      ...(this.inNotes().length ? [[{ id: 'trazer', label: 'Trazer das anotações…', icon: ICON.anotacoes, dialog: true, count: this.newInNotes() ? { n: this.newInNotes(), say: `${this.newInNotes()} ainda fora da galeria` } : undefined, run: () => this.importing.set(true) }]] : []),
    ];
  }

  /** O que está sendo movido pela folha: obras, ou uma pasta. */
  protected readonly moving = signal<
    | { kind: 'obras'; ids: readonly string[]; name: string; from: string | null }
    | { kind: 'pasta'; id: string; name: string; from: string | null }
    | { kind: 'varios'; ids: readonly string[]; folders: readonly string[]; name: string; from: string | null }
    | null
  >(null);
  /** O que a folha precisa saber: as contas, onde está e o que não se pode escolher. */
  protected readonly moveSheet = computed(() => {
    const m = this.moving();
    if (!m) return null;
    const tree = this.folderTree();
    return {
      title: m.kind === 'pasta' ? `Mover a pasta ${m.name}` : `Mover ${m.name}`,
      sub: m.kind === 'varios' ? (m.from === null && m.ids.length + m.folders.length > 1 ? 'Estão em lugares diferentes' : `Estão em ${this.folderName(m.from)}`) : `Está em ${this.folderName(m.from)}`,
      counts: this.folders.counts(),
      // (nunca uma pasta dentro dela mesma)
      blocked: m.kind === 'pasta' ? tree.below(m.id) : m.kind === 'varios' ? new Set(m.folders.flatMap((id) => [...tree.below(id)])) : new Set<string>(),
      rootLabel: m.kind === 'obras' ? 'Sem pasta' : 'Direto em Pixel arts',
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
    else if (m.kind === 'varios') this.dropped({ kind: 'varios', grab: { kind: 'pasta', id: m.folders[0] }, ids: m.ids, folders: m.folders }, { kind: 'guardar', folder: id });
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
    const line = pieceWidgetLine(p);
    return this.toasts.copy(line, line.length > TEXT_MAX ? 'Copiei a pixel art como widget' + TOO_BIG_FOR_NOTE : 'Copiei a pixel art como widget: cole numa anotação.', 'Não deu para copiar. Tente de novo.');
  }

  /** Uma cópia da obra, com "(cópia)" no nome: entra como a mais nova, e a tela vai até ela. */
  protected duplicate(id: string): void {
    const p = this.gallery.get(id);
    if (!p) return;
    const made = this.gallery.create({ art: p.art, title: p.title ? `${p.title} (cópia)` : '', tags: p.tags ?? [], note: p.note ?? '', folder: p.folder, ...(p.layers ? { layers: p.layers } : {}) });
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
