import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PIXEL_TAG_SPACE, PixelPiece, pieceTitle, pixelArtOf } from '../core/pixel-gallery';
import { PixelActions } from './pixel-actions';
import { PixelThumb } from './pixel-thumb';
import { WishNote } from './wish-note';
import { WishTags } from './wish-tags';

/**
 * Uma obra na Grade da galeria de pixel arts (PLANO-PIXEL-ARTS.md, 1): a vista para ver muitas de uma vez, como a
 * Grade da Wishlist. Todas do mesmo tamanho e retas: o desenho nítido, sem jeito, num quadrado, sem cartão nem o
 * xadrez do transparente (o xadrez é só do ateliê); o título em duas linhas e as tags embaixo. Tocar abre a ficha; com a mão em
 * cima, a etiqueta (Ateliê e Baixar) acima do desenho e, um instante depois, a descrição ao lado. Sem mouse, a
 * etiqueta fica ao lado do título.
 */
@Component({
  selector: 'app-pixel-tile',
  imports: [PixelActions, PixelThumb, WishNote, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-landing]': 'landing()',
  },
  template: `
    @let p = piece();
    @if (p.note) {
      <span class="ponta" aria-hidden="true"></span>
    }
    <!-- o desenho sozinho, sem cartão nem xadrez: o transparente mostra a parede -->
    <span class="quadro">
      <app-pixel-thumb [art]="art()" />
    </span>
    <button type="button" class="hit" (click)="opened.emit(p.id)" [attr.aria-describedby]="p.note ? 'descricao-' + p.id : null">
      <span class="sr-only">Abrir {{ title() }}, {{ art().w }} por {{ art().h }}</span>
    </button>
    <span class="linha">
      <span class="nome" [class.sem-titulo]="!p.title" dir="auto">{{ title() }}</span>
      <app-pixel-actions class="etiqueta" [title]="title()" (atelie)="atelie.emit(p.id)" (download)="download.emit(p.id)" />
    </span>
    @if (p.tags?.length) {
      <app-wish-tags class="tags" [tags]="p.tags!" [kind]="tagSpace" />
    }
    @if (p.note; as n) {
      <app-wish-note [wishId]="p.id" [text]="n" [query]="query()" [open]="noteOpen()" />
    }
  `,
  styles: `
    @use 'obra-galeria' as obra;

    :host {
      position: relative;
      display: grid;
      gap: 10px;
      align-content: start;
      isolation: isolate;
    }
    :host(:hover),
    :host(:focus-within) {
      z-index: 30;
    }

    /* o quadrado do desenho, do mesmo tamanho em todas: o desenho inteiro no meio, sem margem; com a mão em cima ele
       sobe e ganha a sombra no próprio contorno (o transparente não vira retângulo) */
    .quadro {
      display: block;
      aspect-ratio: 1;
      transition:
        translate var(--t-ui) var(--ease-ui),
        filter var(--t-ui) var(--ease-ui);
    }
    :host(:hover) .quadro,
    :host(:focus-within) .quadro {
      translate: 0 -3px;
      filter: drop-shadow(0 8px 8px rgb(0 0 0 / 0.45));
    }

    /* a ponta, o toque, o título, a etiqueta, a descrição e o tapa: os mesmos da Mostra (ui/_obra-galeria.scss) */
    @include obra.na-parede('.quadro');

    .tags {
      margin-top: -6px;
      font-size: 0.92em;
    }
  `,
})
export class PixelTile {
  readonly piece = input.required<PixelPiece>();
  readonly landing = input(false);
  readonly query = input('');
  readonly noteOpen = input(false);
  readonly opened = output<string>();
  readonly atelie = output<string>();
  readonly download = output<string>();

  protected readonly tagSpace = PIXEL_TAG_SPACE;
  protected readonly art = computed(() => pixelArtOf(this.piece()));
  protected readonly title = computed(() => pieceTitle(this.piece()));
}
