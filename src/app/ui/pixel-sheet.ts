import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, output, signal, viewChild } from '@angular/core';
import type { LucideIconData } from 'lucide-angular';
import { CategoryColorId, categoryColorHex } from '../core/category-looks';
import { wishTagKey } from '../core/mural-config';
import type { TagEntry } from '../core/note-labels';
import { PIXEL_LOOKS, PixelLook, readPixelArt } from '../core/pixel-art';
import { PIXEL_NOTE_MAX, PIXEL_TAG_SPACE, PIXEL_TITLE_MAX, PixelPatch, PixelPiece, artValues, pieceTitle, pieceTitleOf, valuesArt } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { cleanWishNote, fold } from '../core/review';
import { Settings } from '../core/settings';
import { ViewTransitions } from '../core/view-transitions';
import { WidgetValues } from '../core/widgets';
import { wishTagCounts, wishTagHex } from '../core/wishlist-view';
import { BackdropClose } from './backdrop-close';
import { Confirm } from './confirm';
import { ICON, IconModule } from './icons';
import { PixelArt } from './pixel-art';
import { PixelPieceCard } from './pixel-piece';
import { PixelField } from './pixel-studio/pixel-field';
import { RichEditor } from './rich-editor';
import { TagColors, TagPicker } from './tag-picker';
import { Toasts } from './toast';
import { WishTags } from './wish-tags';

/** As etiquetas da ficha da obra. */
export type PixelProp = 'jeito' | 'tags';

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
  imports: [BackdropClose, IconModule, PixelArt, PixelField, PixelPieceCard, RichEditor, TagPicker, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './pixel-sheet.html',
  // o leiaute da folha da Wishlist, o mesmo arquivo (não uma cópia), e o que muda nesta por cima
  styleUrls: ['./wish-adder.scss', './pixel-sheet.scss'],
})
export class PixelSheet {
  private readonly gallery = inject(PixelGallery);
  private readonly settings = inject(Settings);
  private readonly toasts = inject(Toasts);
  private readonly transitions = inject(ViewTransitions);
  private readonly confirm = inject(Confirm);

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
  protected readonly title = signal('');
  protected readonly tags = signal<string[]>([]);
  protected readonly note = signal('');
  /** Tentou salvar sem desenho. */
  protected readonly attempted = signal(false);
  /** A etiqueta aberta (a parte dela logo embaixo da fileira), ou nenhuma. */
  protected readonly prop = signal<PixelProp | null>(null);
  /** O que a ficha tinha ao abrir: fechar com algo diferente pergunta antes de descartar. */
  private snapshot = '';
  private askingDiscard = false;
  /** As cores sorteadas das tags novas: só vão para as configurações ao salvar (como na Wishlist). */
  private readonly newColors = signal<ReadonlyMap<string, CategoryColorId>>(new Map());

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
    const look = PIXEL_LOOKS.find((l) => l.value === (this.values()['look'] || 'pixel'))?.label ?? 'Pixel';
    const out: { id: PixelProp; name: string; icon: LucideIconData; value: string; spoken: string; filled: boolean; off?: boolean }[] = [
      { id: 'jeito', name: 'Jeito', icon: ICON.pixelArt, value: look, spoken: look, filled: true, off: !this.art() },
      { id: 'tags', name: 'Tags', icon: ICON.etiquetas, value: 'Tags', spoken: tags.length ? tags.join(', ') : 'nenhuma', filled: tags.length > 0 },
    ];
    return out;
  });
  protected readonly propNames: Record<PixelProp, string> = { jeito: 'Jeito', tags: 'Tags' };

  /** As tags à mão: as da galeria, as mais usadas primeiro. */
  protected readonly tagLib = computed<TagEntry[]>(() => wishTagCounts(this.gallery.pieces()).map((t) => ({ label: t.label, n: t.n, pinned: false })));
  /** As cores das tags da galeria (nas da Wishlist, no espaço `pixel`); a tag nova ganha uma sorteada. */
  protected readonly tagColors = computed<TagColors>(() => {
    const colors = this.settings.notesConfig().wishTagColors;
    const fresh = this.newColors();
    return {
      hex: (tag) => wishTagHex(colors, PIXEL_TAG_SPACE, tag) ?? categoryColorHex(fresh.get(wishTagKey(PIXEL_TAG_SPACE, tag))),
      has: (tag) => !!colors[wishTagKey(PIXEL_TAG_SPACE, tag)] || fresh.has(wishTagKey(PIXEL_TAG_SPACE, tag)),
      set: (tag, color) => this.newColors.update((m) => new Map(m).set(wishTagKey(PIXEL_TAG_SPACE, tag), color)),
    };
  });

  /** Uma obra nova: a ficha em branco, e o ateliê abre sozinho por cima. */
  open(): void {
    this.reset();
    this.values.set(artValues([]));
    this.start();
  }

  /** O editar: a ficha com a obra. `atelie`: o ateliê já abre por cima (o Ateliê da etiqueta e do menu). */
  edit(piece: PixelPiece, hooks: PixelSheetHooks = {}): void {
    this.reset();
    this.editing.set(piece);
    this.hooks = hooks;
    this.values.set(artValues(piece.art));
    this.title.set(piece.title);
    this.tags.set([...(piece.tags ?? [])]);
    this.note.set(piece.note ?? '');
    this.start();
  }

  private start(): void {
    this.session.update((n) => n + 1);
    this.snapshot = this.serialize();
    this.shown.set(true);
    this.dialog().nativeElement.showModal();
    // a obra nova abre direto no ateliê (o PixelField); a de antes, com o foco no nome
    if (this.editing()) setTimeout(() => this.dialog().nativeElement.querySelector<HTMLInputElement>('#obra-nome')?.focus());
  }

  private reset(): void {
    this.editing.set(null);
    this.hooks = {};
    this.newColors.set(new Map());
    this.attempted.set(false);
    this.title.set('');
    this.tags.set([]);
    this.note.set('');
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
    return JSON.stringify([this.art(), pieceTitleOf(this.title()), this.tags(), cleanWishNote(this.note())]);
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
    if (from.title !== pieceTitleOf(this.title())) out.title = this.title();
    if ((from.tags ?? []).map(fold).join('\n') !== this.tags().map(fold).join('\n')) out.tags = this.tags();
    if ((from.note ?? '') !== cleanWishNote(this.note())) out.note = this.note();
    return out;
  }

  /** As cores sorteadas das tags novas que ficaram vão para as configurações, numa mudança só. */
  private keepNewColors(): void {
    const fresh = this.newColors();
    const keep = new Map<string, CategoryColorId>();
    for (const tag of this.tags()) {
      const c = fresh.get(wishTagKey(PIXEL_TAG_SPACE, tag));
      if (c) keep.set(tag, c);
    }
    this.settings.setWishTagColors(PIXEL_TAG_SPACE, keep);
    this.newColors.set(new Map());
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
    const made = this.gallery.create({ art, title: this.title(), tags: this.tags(), note: this.note() });
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
      this.toasts.show(`“${pieceTitle(this.gallery.get(editing.id) ?? editing)}” mudou na galeria`, { label: 'Desfazer', run: () => this.transitions.run(undo) });
    });
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
