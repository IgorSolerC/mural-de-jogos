import { ChangeDetectionStrategy, Component, ElementRef, computed, inject, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import type { LucideIconData } from 'lucide-angular';
import { stickerIcon } from '../core/folder-art';
import {
  DEFAULT_FOLDER_COLOR,
  FOLDER_COLORS,
  FOLDER_DECORS,
  FOLDER_STICKERS,
  FolderColor,
  FolderDecor,
  FolderLook,
  FolderSticker,
  MAX_FOLDER_STICKERS,
  lookOf,
  sameFolderLook,
  sanitizeFolderLook,
} from '../core/folder-looks';
import { NoteFolder, cleanFolderName } from '../core/folders';
import { LABEL_MAX } from '../core/note-labels';
import { BackdropClose } from './backdrop-close';
import { Confirm } from './confirm';
import { FolderCard, FolderCardInfo } from './folder-card';
import { ICON, IconModule } from './icons';
import { SaveKey } from './save-key';
import { Toasts } from './toast';

/** As etiquetas da folha. */
export type FolderSheetProp = 'cor' | 'enfeite';

/** O que a página entrega ao abrir: a pasta, o que ela mostra e como gravar. */
export interface FolderSheetOpen {
  folder: NoteFolder;
  /** O que espia na pasta e a conta (a mesma da parede). */
  info: FolderCardInfo;
  /** "nota"/"notas", "recorte"/"recortes", "pixel art"/"pixel arts". */
  units?: readonly [string, string];
  /** O nome de uma irmã com o nome escrito (o Salvar para e avisa), ou null. */
  clash: (name: string) => string | null;
  /** A pasta como ela está agora (o que outra pessoa ou outro aparelho mudou enquanto a folha estava aberta). */
  current: () => NoteFolder | undefined;
  /** Grava (o nome e o visual): devolve o Desfazer, ou null se nada mudou (ou não pode). */
  apply: (change: { name?: string; look: FolderLook | undefined }) => (() => void) | null;
  /** A linha do pé (quem vê a pasta assim). */
  note?: string;
}

/**
 * Customizar uma pasta (PLANO-PASTAS-CUSTOMIZADAS.md, 4): o Customizar… do menu da pasta nos três murais que têm
 * pastas. O leiaute da folha do recorte da Wishlist e da pixel art (o mesmo arquivo, `wish-adder.scss`), com a faixa
 * de cima no papel da pasta e, na mesa, a pasta ao vivo como ela fica na parede. Nos campos: o Nome e a fileira de
 * etiquetas do editor das anotações (Cor e Enfeite), cada uma abrindo a parte dela embaixo; o enfeite se escolhe
 * pelas próprias pastas desenhadas (como os jeitos da pixel art), e os Adesivos abrem a cartela com os doze.
 *
 * A folha só escolhe: quem abre grava (`apply`, da página do dono: a parede é a mesma da visita e não importa nada
 * que escreve). Salvar grava só o que mudou, com o Desfazer; fechar com algo mudado pergunta antes.
 */
@Component({
  selector: 'app-folder-sheet',
  imports: [BackdropClose, FolderCard, IconModule, SaveKey],
  changeDetection: ChangeDetectionStrategy.OnPush,
  templateUrl: './folder-sheet.html',
  // o leiaute da folha da Wishlist, o mesmo arquivo (não uma cópia), e o que muda nesta por cima
  styleUrls: ['./wish-adder.scss', './folder-sheet.scss'],
})
export class FolderSheet {
  private readonly confirm = inject(Confirm);
  private readonly toasts = inject(Toasts);
  private readonly sanitizer = inject(DomSanitizer);

  protected readonly CloseIcon = ICON.fechar;
  protected readonly SaveIcon = ICON.pronto;
  protected readonly DoneIcon = ICON.pronto;
  protected readonly nameMax = LABEL_MAX;
  protected readonly colors = FOLDER_COLORS;
  protected readonly maxStickers = MAX_FOLDER_STICKERS;

  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  /** O que a página deu ao abrir (null: fechada). */
  protected readonly ctx = signal<FolderSheetOpen | null>(null);
  protected readonly name = signal('');
  protected readonly color = signal<FolderColor>(DEFAULT_FOLDER_COLOR);
  /** O enfeite (null: nenhum). */
  protected readonly decor = signal<FolderDecor | null>(null);
  /** Os adesivos colados, na ordem em que foram escolhidos. */
  protected readonly stickers = signal<FolderSticker[]>([]);
  /** A etiqueta aberta (a parte dela logo embaixo da fileira), ou nenhuma. */
  protected readonly prop = signal<FolderSheetProp | null>(null);
  /** Tentou salvar com um problema (o nome de uma irmã, os adesivos sem nenhum). */
  protected readonly attempted = signal(false);
  private askingDiscard = false;

  /** O visual escolhido até aqui, como vai ser guardado. */
  protected readonly look = computed<FolderLook | undefined>(() => {
    const f = this.ctx()?.folder;
    if (!f) return undefined;
    const decor = this.decor();
    const raw: FolderLook = { color: this.color(), ...(decor ? { decor } : {}), ...(decor === 'adesivos' ? { stickers: this.stickers() } : {}), ...(f.look?.view ? { view: f.look.view } : {}) };
    return sanitizeFolderLook(raw, f.group);
  });

  /** A pasta como vai ficar na parede (a da mesa). */
  protected readonly preview = computed<NoteFolder | null>(() => {
    const f = this.ctx()?.folder;
    if (!f) return null;
    const look = this.look();
    const { look: _was, ...rest } = f;
    return { ...rest, name: cleanFolderName(this.name()) || f.name, ...(look ? { look } : {}) };
  });

  /** Cada enfeite desenhado numa pasta com o nome dele, na cor escolhida (a primeira, sem enfeite). */
  protected readonly decorOptions = computed(() => {
    const f = this.ctx()?.folder;
    if (!f) return [];
    const color = this.color();
    const base = (decor: FolderDecor | null, name: string): NoteFolder => {
      const look = sanitizeFolderLook({ color, ...(decor ? { decor } : {}), ...(decor === 'adesivos' ? { stickers: ['coracao'] } : {}) }, f.group);
      return { id: f.id, group: f.group, name, parent: null, ...(look ? { look } : {}) };
    };
    return [{ id: null as FolderDecor | null, label: 'Nenhum', folder: base(null, 'Nenhum') }, ...FOLDER_DECORS.map((d) => ({ id: d.id as FolderDecor | null, label: d.label, folder: base(d.id, d.label) }))];
  });

  /** As opções de enfeite com a conta da pasta, sem as de dentro espiando (o enfeite aparece sozinho). */
  protected readonly optionInfo = computed<FolderCardInfo>(() => {
    const info = this.ctx()?.info;
    return { notes: info?.notes ?? 0, folders: info?.folders ?? 0, peek: [] };
  });

  /** Os doze adesivos da cartela, desenhados. */
  protected readonly stickerOptions = FOLDER_STICKERS.map((s) => ({ ...s, art: this.trust(stickerIcon(s.id)) }));

  /** A irmã com o nome escrito, ou null. */
  protected readonly clash = computed(() => {
    const c = this.ctx();
    const clean = cleanFolderName(this.name());
    if (!c || !clean || clean === c.folder.name) return null;
    return c.clash(clean);
  });

  /** Os adesivos escolhidos sem nenhum adesivo: o enfeite não enfeitaria nada. */
  protected readonly noStickers = computed(() => this.decor() === 'adesivos' && !this.stickers().length);

  protected readonly props = computed(() => {
    const color = FOLDER_COLORS.find((c) => c.id === this.color())?.label ?? 'Manilha';
    const decor = this.decor();
    const decorLabel = decor ? (FOLDER_DECORS.find((d) => d.id === decor)?.label ?? 'Enfeite') : null;
    const stickers = decor === 'adesivos' ? this.stickers().length : 0;
    const out: { id: FolderSheetProp; name: string; icon: LucideIconData; value: string; spoken: string; filled: boolean }[] = [
      { id: 'cor', name: 'Cor', icon: ICON.paleta, value: `Cor: ${color}`, spoken: color, filled: true },
      {
        id: 'enfeite',
        name: 'Enfeite',
        icon: decor === 'adesivos' ? ICON.adesivo : ICON.brilho,
        value: decorLabel ? (decor === 'adesivos' ? `Adesivos: ${stickers}` : decorLabel) : 'Enfeite',
        spoken: decorLabel ? (decor === 'adesivos' ? `adesivos, ${stickers}` : decorLabel) : 'nenhum',
        filled: !!decorLabel,
      },
    ];
    return out;
  });
  protected readonly propNames: Record<FolderSheetProp, string> = { cor: 'Cor', enfeite: 'Enfeite' };

  private trust(svg: string): SafeHtml {
    return this.sanitizer.bypassSecurityTrustHtml(svg);
  }

  /** Abre a folha com a pasta (o nome e o visual dela de agora). */
  open(ctx: FolderSheetOpen): void {
    const look = ctx.folder.look;
    this.ctx.set(ctx);
    this.name.set(ctx.folder.name);
    this.color.set(look?.color ?? DEFAULT_FOLDER_COLOR);
    this.decor.set(look?.decor ?? null);
    this.stickers.set([...(look?.stickers ?? [])]);
    this.prop.set(null);
    this.attempted.set(false);
    this.dialog().nativeElement.showModal();
    if (matchMedia('(pointer: fine)').matches) setTimeout(() => this.dialog().nativeElement.querySelector<HTMLInputElement>('#pasta-nome')?.focus());
  }

  close(): void {
    this.dialog().nativeElement.close();
  }

  /** Fechou (o evento chega depois do close): esvazia, a não ser que ela já tenha aberto de novo nesse meio-tempo. */
  protected closed(): void {
    if (!this.dialog().nativeElement.open) this.ctx.set(null);
  }

  protected pickColor(c: FolderColor): void {
    this.color.set(c);
  }

  protected pickDecor(d: FolderDecor | null): void {
    this.decor.set(d);
    this.attempted.set(false);
  }

  /** Cola ou descola um adesivo (até três, na ordem em que foram colados). */
  protected toggleSticker(id: FolderSticker): void {
    this.stickers.update((list) => (list.includes(id) ? list.filter((s) => s !== id) : list.length < MAX_FOLDER_STICKERS ? [...list, id] : list));
    this.attempted.set(false);
  }

  /** A ordem do adesivo colado (1 a 3), ou 0. */
  protected order(id: FolderSticker): number {
    return this.stickers().indexOf(id) + 1;
  }

  /** Abre a parte da etiqueta (de novo: fecha). O foco desce para a escolhida; fechando, volta para a etiqueta. */
  protected toggleProp(id: FolderSheetProp): void {
    if (this.prop() === id) {
      this.closeProp();
      return;
    }
    this.prop.set(id);
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>('#pasta-parte input:checked')?.focus());
  }

  protected closeProp(e?: Event): void {
    const id = this.prop();
    if (!id) return;
    e?.preventDefault();
    e?.stopPropagation();
    this.prop.set(null);
    setTimeout(() => this.dialog().nativeElement.querySelector<HTMLElement>(`.prop[data-prop="${id}"]`)?.focus());
  }

  /** Mudou algo desde que abriu? */
  private changed(): boolean {
    const f = this.ctx()?.folder;
    if (!f) return false;
    const name = cleanFolderName(this.name());
    return (!!name && name !== f.name) || !sameFolderLook(f.look, this.look()) || this.noStickers();
  }

  /** Fechar (X, Cancelar, Esc, o fundo): com algo mudado, a pergunta de descartar antes. */
  protected requestClose(e?: Event): void {
    if (e?.type === 'cancel' && e.target !== this.dialog().nativeElement) return;
    if (this.changed()) {
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
        text: 'A pasta ainda não foi salva. Fechando agora, o que você mudou nela se perde.',
        confirm: 'Descartar',
        cancel: 'Continuar',
      });
      if (sure) this.close();
    } finally {
      this.askingDiscard = false;
    }
  }

  /** Salva só o que mudou, numa gravação só, com o Desfazer; sem nada mudado, só fecha. */
  protected save(e: Event): void {
    e.preventDefault();
    const c = this.ctx();
    if (!c) return;
    if (this.clash() || this.noStickers()) {
      this.attempted.set(true);
      if (this.noStickers()) this.prop.set('enfeite');
      this.dialog().nativeElement.querySelector<HTMLElement>(this.clash() ? '#pasta-nome' : '.adesivo-op')?.focus();
      return;
    }
    const name = cleanFolderName(this.name());
    // só o que a pessoa mexeu na folha vai por cima do visual de agora (o resto que mudou no meio fica)
    const was = lookOf(c.folder.look);
    const mine = lookOf(this.look());
    const now: FolderLook = { ...(c.current()?.look ?? c.folder.look) };
    if (mine.color !== was.color) now.color = mine.color;
    if (mine.decor !== was.decor || (mine.stickers ?? []).join() !== (was.stickers ?? []).join()) {
      delete now.decor;
      delete now.stickers;
      if (mine.decor) now.decor = mine.decor;
      if (mine.stickers) now.stickers = mine.stickers;
    }
    const undo = c.apply({ ...(name && name !== c.folder.name ? { name } : {}), look: now });
    this.close();
    if (undo) this.toasts.show(`A pasta ${name || c.folder.name} foi customizada.`, { label: 'Desfazer', run: undo });
  }
}
