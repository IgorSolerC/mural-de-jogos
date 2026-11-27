import { ChangeDetectionStrategy, Component, ElementRef, afterRenderEffect, computed, inject, input, output, signal, viewChild } from '@angular/core';
import { DomSanitizer, SafeHtml } from '@angular/platform-browser';
import { NgTemplateOutlet } from '@angular/common';
import { LABEL_MAX } from '../core/note-labels';
import type { NoteFolder } from '../core/folders';
import { folderDecorSvg } from '../core/folder-art';
import { plural } from '../core/text';
import type { FolderInfo } from '../core/wall-view';
import type { Review } from '../core/review';
import { MiniCartolina } from './mini-cartolina';
import { NearScreen } from './near-screen';
import { PixelThumb } from './pixel-thumb';
import { PixelPiece, pixelArtOf } from '../core/pixel-gallery';
import type { PixelArt } from '../core/pixel-art';
import { MuralSrc } from './stored-image';

/**
 * O que a pasta mostra: o `FolderInfo` das Anotações e da Wishlist, e também as obras da galeria de pixel arts
 * espiando (a miniatura do desenho).
 */
export type FolderCardInfo = Omit<FolderInfo, 'peek'> & { peek: readonly (FolderInfo['peek'][number] | PixelPiece)[] };

/** Quantos avisos de nome repetido já nasceram (o id de cada um). */
let hints = 0;
/** Quantas pastas já nasceram (os ids dos gradientes de cada uma, únicos na página). */
let cards = 0;

/**
 * Uma pasta das anotações na parede (PLANO-PASTAS.md, 4.2): uma pasta manilha em pé, com até três das
 * anotações de dentro espiando pela boca em miniatura (a cartolina com o título, ou a foto da capa, de papel,
 * sem o plástico das pastas dos murais do perfil), o nome a marcador e o número na frente. Com o mouse em cima, a frente abre e as
 * miniaturas sobem uma depois da outra. Tocar abre a pasta. É a mesma pasta, do mesmo tamanho, em todas as
 * vistas; quem usa decide onde ela fica e o que abrir (a parede do seu Murall e a de quem você visita usam
 * a mesma).
 */
@Component({
  selector: 'app-folder-card',
  imports: [MiniCartolina, NearScreen, NgTemplateOutlet, PixelThumb, MuralSrc],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.data-pasta]': 'folder().id',
    // a cor e o enfeite da pasta customizada (PLANO-PASTAS-CUSTOMIZADAS.md, 3; o desenho em ui/_pasta-enfeites.scss)
    '[attr.data-cor]': 'folder().look?.color ?? null',
    '[attr.data-enfeite]': 'folder().look?.decor ?? null',
  },
  template: `
    @if (naming()) {
      <!-- dando nome: o campo na própria pasta, já escrito e selecionado (PLANO-PASTAS.md, 4.6) -->
      <div class="pasta nomeando">
        <ng-container [ngTemplateOutlet]="papel" />
        <span class="frente">
          <ng-container [ngTemplateOutlet]="enfeite" />
          <input
            #campo
            class="nome-campo"
            type="text"
            [value]="folder().name"
            [attr.maxlength]="max"
            aria-label="Nome da pasta"
            [attr.aria-describedby]="clash() ? hintId : null"
            enterkeyhint="done"
            autocomplete="off"
            (input)="draft.emit(campo.value)"
            (keydown.enter)="$event.preventDefault(); finish(campo.value)"
            (keydown.escape)="$event.preventDefault(); finish(null)"
            (blur)="finish(campo.value)"
          />
          @if (clash(); as other) {
            <span class="qtd aviso" [id]="hintId">Já existe {{ other }} aqui · Enter junta as duas</span>
          } @else {
            <span class="qtd">{{ countLine() }}</span>
          }
        </span>
      </div>
    } @else {
      <button type="button" class="pasta" [attr.aria-label]="spoken()" (click)="opened.emit(folder().id)">
        <ng-container [ngTemplateOutlet]="papel" />
        <span class="frente">
          <ng-container [ngTemplateOutlet]="enfeite" />
          <span class="nome">{{ folder().name }}</span>
          <span class="qtd">{{ countLine() }}</span>
        </span>
      </button>
    }

    <!-- o enfeite da pasta customizada, na frente (abre com ela); o que é desenho vem de core/folder-art.ts -->
    <ng-template #enfeite>
      @if (folder().look?.decor) {
        <span class="enfeite" aria-hidden="true" [innerHTML]="decorArt()"></span>
      }
    </ng-template>

    <!-- o fundo da pasta com a aba, e as anotações de dentro espiando pela boca -->
    <ng-template #papel>
      <span class="fundo" aria-hidden="true"></span>
      <!-- cada uma de papel, sem o plástico das capas do perfil: a cartolina com o título, ou a foto da capa
           (a que não carrega volta à cartolina); a cartolina tem o desenho do papel, então só monta perto da tela -->
      <span class="boca" aria-hidden="true" [style.--vistas]="info().peek.length" appPerto #perto="perto">
        @for (r of perto.near() ? info().peek : []; track r.id; let j = $index) {
          <span class="espia" [class.espia-pixel]="!!asPixel(r)" [style.--j]="j">
            @if (asPixel(r); as px) {
              <!-- a pixel art: a miniatura nítida no xadrez do transparente -->
              <app-pixel-thumb [art]="px" />
            } @else if (coverOf(r); as url) {
              <img [muralSrc]="url" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" (error)="lost(url)" />
            } @else if (asReview(r); as rv) {
              <app-mini-cartolina [review]="rv" />
            }
          </span>
        }
      </span>
    </ng-template>
  `,
  styleUrl: './folder-card.scss',
})
export class FolderCard {
  readonly folder = input.required<NoteFolder>();
  readonly info = input<FolderCardInfo>({ notes: 0, folders: 0, peek: [] });
  /** O que mora na pasta, no singular e no plural: as notas, ou os recortes da Wishlist. */
  readonly units = input<readonly [string, string]>(['nota', 'notas']);
  /** Tocou: abrir a pasta (o id). */
  readonly opened = output<string>();
  /** Dando nome à pasta (a nova, ou Renomear no menu): o campo na própria pasta. */
  readonly naming = input(false);
  /** O nome de uma irmã com o mesmo nome do que está escrito (o Enter junta as duas), ou null. */
  readonly clash = input<string | null>(null);
  /** O que está escrito no campo, a cada letra (para quem usa ver se repete uma irmã). */
  readonly draft = output<string>();
  /** Acabou de dar nome: o nome (Enter, ou o foco saiu), ou null (Esc: fica como estava). */
  readonly named = output<string | null>();

  protected readonly max = LABEL_MAX;
  protected readonly hintId = `pasta-aviso-${++hints}`;
  private readonly sanitizer = inject(DomSanitizer);
  private readonly uid = `p${++cards}`;
  /** O desenho do enfeite (as estrelas, a costura da meia-lua, os adesivos): texto montado só com o catálogo. */
  protected readonly decorArt = computed<SafeHtml>(() => {
    const f = this.folder();
    return this.sanitizer.bypassSecurityTrustHtml(folderDecorSvg(f.look, f.id, `${f.id}-${this.uid}`));
  });
  private readonly field = viewChild<ElementRef<HTMLInputElement>>('campo');
  /** O nome já foi dado (o Enter e o foco que sai logo depois não dão duas vezes). */
  private done = false;

  constructor() {
    // o campo aparece com o nome selecionado: digitar troca
    afterRenderEffect(() => {
      const el = this.field()?.nativeElement;
      if (!el || el === document.activeElement) return;
      this.done = false;
      el.focus({ preventScroll: true });
      el.select();
      el.scrollIntoView({ block: 'nearest' });
    });
  }

  /** A anotação, para a cartolina (o desejo da Wishlist sem capa não espia). */
  protected asReview(r: FolderCardInfo['peek'][number]): Review | null {
    return 'scores' in r ? (r as Review) : null;
  }

  /** A obra da galeria de pixel arts, para a miniatura do desenho. */
  protected asPixel(r: FolderCardInfo['peek'][number]): PixelArt | null {
    return 'art' in r ? pixelArtOf(r) : null;
  }

  /** A capa (da anotação ou do desejo) que ainda não falhou ao carregar. */
  protected coverOf(r: FolderCardInfo['peek'][number]): string | null {
    const url = 'game' in r ? r.game.coverUrl : null;
    return url && !this.broken().has(url) ? url : null;
  }

  /** As capas que não carregaram: a miniatura volta à cartolina. */
  protected readonly broken = signal<ReadonlySet<string>>(new Set());
  protected lost(url: string): void {
    this.broken.update((s) => new Set(s).add(url));
  }

  protected finish(value: string | null): void {
    if (this.done) return;
    this.done = true;
    this.named.emit(value);
  }

  /** "4 notas · 2 pastas", "1 nota", "Vazia". */
  protected readonly countLine = computed(() => {
    const { notes, folders } = this.info();
    const parts = [notes ? plural(notes, ...this.units()) : '', folders ? plural(folders, 'pasta', 'pastas') : ''].filter(Boolean);
    return parts.length ? parts.join(' · ') : 'Vazia';
  });
  /** O que o leitor de tela ouve: "Pasta Programação, 4 notas e 2 pastas". */
  protected readonly spoken = computed(() => {
    const { notes, folders } = this.info();
    const parts = [notes ? plural(notes, ...this.units()) : '', folders ? plural(folders, 'pasta', 'pastas') : ''].filter(Boolean);
    return `Pasta ${this.folder().name}, ${parts.length ? parts.join(' e ') : 'vazia'}`;
  });
}
