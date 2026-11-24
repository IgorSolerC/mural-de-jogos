import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import type { LucideIconData } from 'lucide-angular';
import type { TagEntry } from '../core/note-labels';
import { PIXEL_LOOKS, PixelLook, readPixelArt } from '../core/pixel-art';
import { PIXEL_NOTE_MAX, PIXEL_TAG_SPACE, PIXEL_TITLE_MAX, PixelPatch, PixelPiece, artValues, pieceTitle, pieceTitleOf, valuesArt } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { StoredLayer } from '../core/pixel-layers';
import { PixelFolders } from '../core/pixel-folders';
import { cleanWishNote, fold } from '../core/review';
import { ViewTransitions } from '../core/view-transitions';
import { WidgetValues } from '../core/widgets';
import { wishTagCounts } from '../core/wishlist-view';
import { BackdropClose } from './backdrop-close';
import { Confirm } from './confirm';
import { FolderPicker } from './folder-picker';
import { ICON, IconModule } from './icons';
import { PixelArt } from './pixel-art';
import { PixelPieceCard } from './pixel-piece';
import { PixelField } from './pixel-studio/pixel-field';
import type { StudioResult } from './pixel-studio/pixel-studio';
import { RichEditor } from './rich-editor';
import { TagPicker } from './tag-picker';
import { Toasts } from './toast';
import { PixelTagColors } from './pixel-tag-colors';
import { WishTags } from './wish-tags';
import { SaveKey } from './save-key';

/** As etiquetas da ficha da obra. */
export type PixelProp = 'jeito' | 'tags' | 'pasta';

/** O que a página faz no fim do editar (o foco na obra salva; apagar com o foco no vizinho). */
export interface PixelSheetHooks {
  saved?: () => void;
  remove?: () => void;
}

/**
 * A ficha de uma obra da galeria de pixel arts (PLANO-PIXEL-ARTS.md, 4): a mesma para pôr e para editar, no
 * leiaute da folha do recorte da Wishlist (as classes e o CSS de `wish-adder.scss`, com a faixa e a mesa do
 * ateliê por cima, em `pixel-sheet.scss`). Na mesa, a obra como ela fica na parede ("Vai ficar assim", ou "Na
 * parede"); nos campos, o desenho (a linha da folha do widget, `PixelField`, que abre o ateliê por cima e já
 * abre sozinha na obra nova), o nome, a fileira de etiquetas do editor das anotações (Jeito, com os quatro
 * jeitos desenhados com o próprio desenho, e Tags) e a Descrição, no editor de texto das anotações. Salvar
 * grava só o que mudou na ficha, com o Desfazer; fechar com algo mudado pergunta antes.
 */
@Component({
  selector: 'app-pixel-sheet',
  imports: [SaveKey, BackdropClose, FolderPicker, IconModule, PixelArt, PixelField, PixelPieceCard, RichEditor, TagPicker, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pixel-sheet.html',
  // o leiaute da folha da Wishlist, o mesmo arquivo (não uma cópia), e o que muda nesta por cima
  styleUrls: ['./wish-adder.scss', './pixel-sheet.scss'],
})
export class PixelSheet {
  private readonly gallery = inject(PixelGallery);
  private readonly toasts = inject(Toasts);
  private readonly transitions = inject(ViewTransitions);
  private readonly confirm = inject(Confirm);
  protected readonly folders = inject(PixelFolders);

  /** A obra nova foi para a galeria (a página a assenta na parede). */
  readonly created = output<string>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly SaveIcon = ICON.pronto;
  protected readonly TrashIcon = ICON.apagar;
  protected readonly DoneIcon = ICON.pronto;
  protected readonly AddIcon = ICON.pixelArt;
  protected readonly noteMax = PIXEL_NOTE_MAX;
  protected readonly titleMax = PIXEL_TITLE_MAX;
  protected readonly tagSpace = PIXEL_TAG_SPACE;
  protected readonly looks = PIXEL_LOOKS;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** Cada vez que a ficha abre: o desenho (e o ateliê aberto sozinho na obra nova) nasce de novo. */
  protected readonly session = signal(0);
  /** A ficha está aberta (o desenho e o ateliê só existem enquanto ela está). */
  protected readonly shown = signal(false);
  /** A obra aberta no editar (como estava ao abrir); null: pondo uma nova. */
  protected readonly editing = signal<PixelPiece | null>(null);
  private hooks: PixelSheetHooks = {};
  /** O desenho, nos valores do widget (os pontos, a grade, a paleta, as cores e o jeito). */
  protected readonly values = signal<WidgetValues>(artValues([]));
  /** As camadas do desenho (PLANO-CAMADAS.md); sem elas, uma só. */
  protected readonly layers = signal<StoredLayer[] | undefined>(undefined);
  protected readonly title = signal('');
  protected readonly tags = signal<string[]>([]);
  protected readonly note = signal('');
  /** A pasta (o id; null: solta na raiz da galeria). A obra nova nasce na pasta aberta na página. */
  protected readonly folder = signal<string | null>(null);
  /** Tentou salvar sem desenho. */
  protected readonly attempted = signal(false);
  /** A etiqueta aberta (a parte dela logo embaixo da fileira), ou nenhuma. */
  protected readonly prop = signal<PixelProp | null>(null);
  /** O que a ficha tinha ao abrir: fechar com algo diferente pergunta antes de descartar. */
  private snapshot = '';
  private askingDiscard = false;

  /** O desenho escrito (sem a legenda), ou null sem nenhum ponto. */
  protected readonly art = computed(() => valuesArt(this.values()));
  protected readonly look = computed<PixelLook>(() => readPixelArt(this.art() ?? []).look);
  /** A obra como vai ficar na parede (na mesa), montada com o que já está na ficha. */
  protected readonly preview = computed<PixelPiece | null>(() => {
    const art = this.art();
    if (!art) return null;
    const base = this.editing();
    return { id: base?.id ?? 'previa', title: this.title().trim(), art, ...(this.tags().length ? { tags: this.tags() } : {}), createdAt: '', at: '' };
  });
  /** O desenho em cada um dos quatro jeitos, para as miniaturas da parte Jeito. */
  protected readonly lookArgs = computed(() => {
    const art = this.art();
    if (!art) return new Map<PixelLook, string[]>();
    return new Map(PIXEL_LOOKS.map((l) => [l.value, valuesArt({ ...this.values(), look: l.value }) ?? art]));
  });

  protected readonly props = computed(() => {
    const tags = this.tags();
    const folder = this.folder();
    const fname = folder ? (this.folders.tree().live(folder)?.name ?? null) : null;
    const look = PIXEL_LOOKS.find((l) => l.value === (this.values()['look'] || 'pixel'))?.label ?? 'Pixel';
    const out: { id: PixelProp; name: string; icon: LucideIconData; value: string; spoken: string; filled: boolean; off?: boolean }[] = [
      { id: 'jeito', name: 'Jeito', icon: ICON.pixelArt, value: `Jeito: ${look}`, spoken: look, filled: true, off: !this.art() },
      { id: 'tags', name: 'Tags', icon: ICON.etiquetas, value: 'Tags', spoken: tags.length ? tags.join(', ') : 'nenhuma', filled: tags.length > 0 },
      { id: 'pasta', name: 'Pasta', icon: ICON.pastaDeNotas, value: fname ?? 'Pasta', spoken: fname ?? 'sem pasta', filled: !!fname },
    ];
    return out;
  });
  protected readonly propNames: Record<PixelProp, string> = { jeito: 'Jeito', tags: 'Tags', pasta: 'Pasta' };

  /** As tags à mão: as da galeria, as mais usadas primeiro. */
  protected readonly tagLib = computed<TagEntry[]>(() => wishTagCounts(this.gallery.pieces()).map((t) => ({ label: t.label, n: t.n, pinned: false })));
  /** As cores das tags da galeria; a tag nova ganha uma sorteada, guardada só ao salvar. */
  private readonly drafts = new PixelTagColors();
  protected readonly tagColors = this.drafts.colors;

  /** Uma obra nova: a ficha em branco, na pasta `folder` (a aberta na página), e o ateliê abre sozinho por cima. */
  open(folder: string | null = null): void {
    this.reset();
    this.folder.set(folder);
    this.values.set(artValues([]));
    this.layers.set(undefined);
    this.start();
  }

  /** O editar: a ficha com a obra. `atelie`: o ateliê já abre por cima (o Ateliê da etiqueta e do menu). */
  edit(piece: PixelPiece, hooks: PixelSheetHooks = {}): void {
    this.reset();
    this.editing.set(piece);
    this.hooks = hooks;
    this.values.set(artValues(piece.art));
    this.layers.set(piece.layers);
    this.title.set(piece.title);
    this.tags.set([...(piece.tags ?? [])]);
    this.note.set(piece.note ?? '');
    this.folder.set(this.folders.of(piece));
    this.start();
  }

  private start(): void {
    this.session.update((n) => n + 1);
    this.snapshot = this.serialize();
    this.shown.set(true);
    this.dialog().nativeElement.showModal();
    // a obra nova abre direto no ateliê (o PixelField); a de antes, com o foco no nome, só com mouse (no toque, o
    // teclado subiria e cobriria a folha de quem só quer olhar a obra)
    if (this.editing() && matchMedia('(pointer: fine)').matches) setTimeout(() => this.dialog().nativeElement.querySelector<HTMLInputElement>('#obra-nome')?.focus());
  }

  private reset(): void {
    this.editing.set(null);
    this.hooks = {};
    this.drafts.reset();
    this.attempted.set(false);
    this.title.set('');
    this.tags.set([]);
    this.note.set('');
    this.folder.set(null);
    this.prop.set(null);
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** O ateliê mudou o desenho (na hora, a cada traço). */
  protected drawn(v: WidgetValues): void {
    // o ateliê manda o desenho (os pontos, a grade, a paleta, as cores): o jeito fica o da ficha
    this.values.update((old) => ({ ...old, ...v }));
    if (this.art()) this.attempted.set(false);
  }

  /**
   * O "Salvar como cópia" do ateliê, editando uma obra: o desenho vai para uma obra nova ("X (cópia)", com o que a
   * ficha tem agora de tags, descrição, jeito e pasta), e esta ficha fica com o desenho de antes.
   */
  protected copyDrawing(r: StudioResult): void {
    const art = valuesArt({ ...this.values(), ...r.values });
    if (!art) {
      this.toasts.show('Uma pixel art precisa de pelo menos um ponto: a cópia não foi feita.');
      return;
    }
    const title = pieceTitleOf(this.title()) || (this.editing()?.title ?? '');
    const made = this.gallery.create({ art, layers: r.layers, title: title ? `${title} (cópia)` : '', tags: this.tags(), note: this.note(), folder: this.folder() ?? undefined });
    if (!made) {
      this.toasts.show('A galeria está cheia: apague uma pixel art para guardar a cópia.');
      return;
    }
    this.keepNewColors();
    this.toasts.show(`Guardei a cópia, “${pieceTitle(made)}”, na galeria; esta ficha ficou com o desenho de antes.`, { label: 'Desfazer', run: () => this.transitions.run(() => this.gallery.remove([made.id])) });
  }

  protected pickLook(l: PixelLook): void {
    this.values.update((v) => ({ ...v, look: l }));
  }

  /** Abre a parte da etiqueta (de novo: fecha). O foco desce para a parte; fechando, volta para a etiqueta. */
  protected toggleProp(id: PixelProp): void {
    if (this.prop() === id) {
      this.closeProp();
      return;
    }
    this.prop.set(id);
    setTimeout(() => {
      const part = this.dialog().nativeElement.querySelector<HTMLElement>('#obra-parte');
      const first = id === 'jeito' ? part?.querySelector<HTMLElement>('input:checked') : (part?.querySelector<HTMLElement>('input[type="text"]') ?? part?.querySelector<HTMLElement>('button'));
      first?.focus();
    });
  }

  protected closeProp(e?: Event): void {
    const id = this.prop();
    if (!id) return;
    // o Esc fecha só a parte, não a ficha
    e?.preventDefault();
    e?.stopPropagation();
    this.prop.set(null);
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>(`.prop[data-prop="${id}"]`)?.focus());
  }

  /** O que a pessoa pode ter mudado na ficha (o desenho, o nome, as tags, a descrição). */
  private serialize(): string {
    return JSON.stringify([this.art(), this.layers() ?? null, pieceTitleOf(this.title()), this.tags(), cleanWishNote(this.note()), this.folder()]);
  }

  /** Fechar (X, Cancelar, Esc, o fundo): com algo mudado, a pergunta de descartar antes. */
  protected requestClose(e?: Event): void {
    // com o ateliê aberto por cima, o Esc é dele
    if (e?.type === 'cancel' && e.target !== this.dialog().nativeElement) return;
    if (this.serialize() !== this.snapshot) {
      e?.preventDefault();
      void this.askDiscard();
      return;
    }
    if (e?.type !== 'cancel') this.close();
  }

  private async askDiscard(): Promise<void> {
    if (this.askingDiscard) return;
    this.askingDiscard = true;
    try {
      const sure = await this.confirm.ask({
        title: 'Descartar o que você mudou?',
        text: this.editing()
          ? 'A pixel art ainda não foi salva. Fechando agora, o que você mudou nela se perde.'
          : 'A pixel art ainda não foi para a galeria. Fechando agora, o desenho e o que você escreveu se perdem.',
        confirm: 'Descartar',
        cancel: 'Continuar',
      });
      if (sure) this.close();
    } finally {
      this.askingDiscard = false;
    }
  }

  /** Editando: só o que a pessoa mudou desde que abriu a ficha (o que chegou de outro aparelho fica). */
  private changes(from: PixelPiece, art: string[]): PixelPatch {
    const out: PixelPatch = {};
    if (JSON.stringify(from.art) !== JSON.stringify(art)) out.art = art;
    // (as camadas vão junto quando mudaram: com elas, o desenho do art sai delas)
    if (JSON.stringify(from.layers ?? null) !== JSON.stringify(this.layers() ?? null)) out.layers = this.layers();
    if (from.title !== pieceTitleOf(this.title())) out.title = this.title();
    if ((from.tags ?? []).map(fold).join('\n') !== this.tags().map(fold).join('\n')) out.tags = this.tags();
    if ((from.note ?? '') !== cleanWishNote(this.note())) out.note = this.note();
    if (this.folders.of(from) !== this.folder()) out.folder = this.folder() ?? undefined;
    return out;
  }

  /** As cores sorteadas das tags novas que ficaram vão para as configurações, numa mudança só. */
  private keepNewColors(): void {
    this.drafts.keep(this.tags());
  }

  protected save(e: Event): void {
    e.preventDefault();
    const art = this.art();
    if (!art) {
      this.attempted.set(true);
      this.dialog().nativeElement.querySelector<HTMLElement>('[data-campo="pixels"]')?.focus();
      return;
    }
    const editing = this.editing();
    if (editing) {
      this.saveEdit(editing, art);
      return;
    }
    const made = this.gallery.create({ art, layers: this.layers(), title: this.title(), tags: this.tags(), note: this.note(), folder: this.folder() ?? undefined });
    if (!made) {
      this.toasts.show('A galeria está cheia: apague uma pixel art para guardar outra.');
      return;
    }
    this.keepNewColors();
    this.close();
    this.created.emit(made.id);
  }

  /** Salva o editar numa gravação só, com o Desfazer; sem nada mudado, só fecha. */
  private saveEdit(editing: PixelPiece, art: string[]): void {
    const patch = this.changes(editing, art);
    const saved = this.hooks.saved;
    this.keepNewColors();
    this.close();
    // apagada noutro aparelho enquanto a ficha estava aberta: o que foi escrito não some calado
    if (!this.gallery.get(editing.id)) {
      this.toasts.show(`“${pieceTitle(editing)}” foi apagada noutro aparelho: não deu para salvar.`);
      return;
    }
    this.transitions.run(() => {
      const undo = this.gallery.update(editing.id, patch);
      if (!undo) return;
      saved?.();
      const name = pieceTitle(this.gallery.get(editing.id) ?? editing);
      // mudou de pasta: o aviso diz para onde (ela sai da parede aberta)
      const moved = 'folder' in patch ? (patch.folder ? `foi para ${this.folders.tree().live(patch.folder)?.name ?? 'outra pasta'}` : 'saiu das pastas') : null;
      this.toasts.show(`“${name}” ${moved ?? 'mudou na galeria'}`, { label: 'Desfazer', run: () => this.transitions.run(undo) });
    });
  }

  /** O "Criar" da escolha da pasta: a pasta nasce na hora (como no editor das anotações) e fica escolhida. */
  protected makeFolder(e: { parent: string | null; name: string }): void {
    const made = this.folders.create(e.parent, e.name);
    if (made) this.folder.set(made.id);
    else this.toasts.show('Não cabe mais nenhuma pasta aqui.');
  }

  /** Apagar pelo editar (com o Desfazer de quem apaga). */
  protected removeEditing(): void {
    const editing = this.editing();
    if (!editing) return;
    const run = this.hooks.remove;
    this.close();
    if (run) run();
    else {
      const gone = this.gallery.remove([editing.id]);
      this.toasts.show(`“${pieceTitle(editing)}” saiu da galeria`, { label: 'Desfazer', run: () => this.gallery.restore(gone) });
    }
  }
}
