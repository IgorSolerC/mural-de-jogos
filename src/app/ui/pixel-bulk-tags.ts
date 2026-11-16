import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, computed, inject, input, output, signal, viewChild } from '@angular/core';
import type { TagEntry } from '../core/note-labels';
import { PixelPiece } from '../core/pixel-gallery';
import { PixelGallery } from '../core/pixel-gallery-store';
import { plural } from '../core/text';
import { lookKey } from '../core/category-looks';
import { wishTagCounts } from '../core/wishlist-view';
import { BackdropClose } from './backdrop-close';
import { ICON, IconModule } from './icons';
import { NoteTag } from './note-tag';
import { Pin } from './pin';
import { TagPicker } from './tag-picker';
import { PixelTagColors } from './pixel-tag-colors';

let uid = 0;

/** O que a folha muda nas marcadas: as tags que vão para todas e as que saem de todas. */
export interface PixelTagsChange {
  all: string[];
  drop: string[];
}

/**
 * As tags das pixel arts marcadas (PLANO-PIXEL-ARTS.md, 5): a linha das Tags da folha de editar as marcadas das
 * Anotações (ui/bulk-edit-sheet.ts), o mesmo desenho (os arquivos `organize-sheet.scss` e `bulk-edit-sheet.scss`, não
 * uma cópia). As que todas
 * têm ficam no seletor de sempre; as de só algumas, tracejadas, com em quantas estão, dão para pôr em todas ou tirar
 * de todas. Aplicar manda só o que mudou; quem abre grava, com o Desfazer.
 */
@Component({
  selector: 'app-pixel-bulk-tags',
  imports: [BackdropClose, IconModule, NoteTag, Pin, TagPicker],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet ficha-lugar massa" [attr.aria-labelledby]="id + '-t'" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" [style.--stock]="'var(--stock-branco)'" data-cor="branco">
        <app-pin class="pin" />
        <header class="head">
          <div class="titulos">
            <h2 [id]="id + '-t'">Tags de {{ count() }}</h2>
            <p class="sub"><lucide-icon [img]="TagIcon" [size]="14" aria-hidden="true" />Pixel arts marcadas</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>

        <div class="body">
          <p class="vale">O que você mudar aqui vale para as {{ pieces().length }}. As outras tags de cada uma ficam como estão.</p>
          <div class="linha" [class.mexida]="touched()">
            <span class="nome"><lucide-icon [img]="TagIcon" [size]="16" aria-hidden="true" />Tags</span>
            <div class="valor">
              @if (partial().length) {
                <ul class="algumas" aria-label="Tags de só algumas">
                  @for (t of partial(); track t.label) {
                    <li class="alguma">
                      <button type="button" class="por" [attr.aria-label]="'Pôr ' + t.label + ' em todas (está em ' + t.n + ' de ' + pieces().length + ')'" (click)="toAll(t.label)">
                        <app-note-tag [label]="t.label" size="mini" [color]="hex(t.label)" />
                        <span class="em">em {{ t.n }} de {{ pieces().length }}</span>
                      </button>
                      <button type="button" class="tirar" [attr.aria-label]="'Tirar ' + t.label + ' de todas'" title="Tirar de todas" (click)="dropTag(t.label)">
                        <lucide-icon [img]="CloseIcon" [size]="14" aria-hidden="true" />
                      </button>
                    </li>
                  }
                </ul>
              }
              <app-tag-picker [tags]="shown()" (tagsChange)="setTags($event)" [library]="lib()" [colors]="drafts.colors()" [pinnable]="false" [units]="['pixel art', 'pixel arts']" owner="Estas pixel arts" />
            </div>
          </div>
        </div>

        <footer class="foot">
          <div class="fim">
            <button type="button" class="btn-quiet" (click)="close()">Cancelar</button>
            <button type="button" [class.btn-ink]="touched()" [class.btn-quiet]="!touched()" class="aplicar" data-acao="aplicar" [disabled]="!touched()" (click)="apply()">
              {{ touched() ? 'Aplicar em ' + count() : 'Nada mudou ainda' }}
            </button>
          </div>
        </footer>
      </div>
    </dialog>
  `,
  // a folha de editar as marcadas das Anotações: os mesmos arquivos
  styleUrls: ['./organize-sheet.scss', './bulk-edit-sheet.scss'],
})
export class PixelBulkTags {
  readonly pieces = input.required<readonly PixelPiece[]>();
  readonly applied = output<PixelTagsChange>();
  readonly closed = output<void>();

  private readonly gallery = inject(PixelGallery);
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');

  protected readonly id = `pixel-tags-${++uid}`;
  protected readonly TagIcon = ICON.etiquetas;
  protected readonly CloseIcon = ICON.fechar;
  protected readonly count = computed(() => plural(this.pieces().length, 'pixel art', 'pixel arts'));

  /** As que vão para todas (undefined: ainda as que todas têm) e as que saem de todas. */
  private readonly all = signal<string[] | undefined>(undefined);
  private readonly drop = signal<string[]>([]);

  /** Cada tag das marcadas e em quantas ela está. */
  private readonly counts = computed(() => {
    const out = new Map<string, { label: string; n: number }>();
    for (const p of this.pieces())
      for (const t of p.tags ?? []) {
        const k = lookKey(t);
        const e = out.get(k);
        if (e) e.n++;
        else out.set(k, { label: t, n: 1 });
      }
    return out;
  });
  protected readonly shown = computed(() => this.all() ?? [...this.counts().values()].filter((t) => t.n === this.pieces().length).map((t) => t.label));
  protected readonly partial = computed(() => {
    const all = new Set(this.shown().map(lookKey));
    const drop = new Set(this.drop().map(lookKey));
    return [...this.counts().values()].filter((t) => t.n < this.pieces().length && !all.has(lookKey(t.label)) && !drop.has(lookKey(t.label)));
  });
  /** As sugestões: as tags da galeria, sem as de só algumas (elas já estão acima, com em quantas estão). */
  protected readonly lib = computed<TagEntry[]>(() => {
    const partial = new Set(this.partial().map((t) => lookKey(t.label)));
    return wishTagCounts(this.gallery.pieces())
      .filter((t) => !partial.has(lookKey(t.label)))
      .map((t) => ({ label: t.label, n: t.n, pinned: false }));
  });
  protected readonly touched = computed(() => this.all() !== undefined || this.drop().length > 0);

  constructor() {
    afterNextRender(() => this.dialog().nativeElement.showModal());
  }

  /** As cores das tags (a nova ganha uma sorteada, guardada só ao aplicar, como na ficha da obra). */
  protected readonly drafts = new PixelTagColors();

  protected hex(tag: string): string | null {
    return this.drafts.colors().hex(tag);
  }

  /** O seletor mexeu nas que todas têm: a que saiu de lá sai de todas; a que voltou não sai mais. */
  protected setTags(next: string[]): void {
    const before = this.shown();
    const now = new Set(next.map(lookKey));
    const gone = before.filter((t) => !now.has(lookKey(t)));
    this.all.set(next);
    this.drop.update((d) => [...d, ...gone].filter((t) => !now.has(lookKey(t))));
  }

  protected toAll(t: string): void {
    this.all.set([...this.shown(), t]);
  }

  protected dropTag(t: string): void {
    this.drop.update((d) => [...d, t]);
  }

  protected apply(): void {
    this.drafts.keep(this.shown());
    this.applied.emit({ all: this.shown(), drop: this.drop() });
    this.close();
  }

  protected close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
    else this.closed.emit();
  }
}
