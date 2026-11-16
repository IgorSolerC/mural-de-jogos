import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PIXEL_TAG_SPACE, PixelPiece, pieceTitle, pixelArtOf } from '../core/pixel-gallery';
import { wobble } from '../core/wall-physics';
import { PixelActions } from './pixel-actions';
import { PixelThumb } from './pixel-thumb';
import { WishNote } from './wish-note';
import { WishTags } from './wish-tags';

/**
 * Uma obra na Grade da galeria de pixel arts (PLANO-PIXEL-ARTS.md, 1): a vista para ver muitas de uma vez, como a
 * Grade da Wishlist. Todas do mesmo tamanho: um cartão branco quadrado com o desenho nítido, sem jeito, sobre o
 * xadrez do transparente do ateliê; o título em duas linhas e as tags embaixo. Tocar abre a ficha; com a mão em
 * cima, a etiqueta (Ateliê e Baixar) acima do cartão e, um instante depois, a descrição ao lado. Sem mouse, a
 * etiqueta fica ao lado do título.
 */
@Component({
  selector: 'app-pixel-tile',
  imports: [PixelActions, PixelThumb, WishNote, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-landing]': 'landing()',
    '[style.--cel-tilt]': 'tilt()',
  },
  template: `
    @let p = piece();
    @if (p.note) {
      <span class="ponta" aria-hidden="true"></span>
    }
    <span class="cartao">
      <span class="xadrez">
        <app-pixel-thumb [art]="art()" />
      </span>
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
    @use 'caderno';
    @use 'pixel-studio/xadrez' as x;

    :host {
      position: relative;
      display: grid;
      gap: 10px;
      align-content: start;
      isolation: isolate;
      rotate: calc(var(--cel-tilt, 0) * 1deg);
    }
    :host(:hover),
    :host(:focus-within) {
      z-index: 30;
    }

    /* o cartão branco, com a margem de passe-partout e o xadrez do transparente dentro */
    .cartao {
      display: block;
      aspect-ratio: 1;
      padding: 7px;
      background: #fdfcf9;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.35),
        0 4px 7px rgb(0 0 0 / 0.38);
      transition:
        translate var(--t-ui) var(--ease-ui),
        box-shadow var(--t-ui) var(--ease-ui);
    }
    :host(:hover) .cartao,
    :host(:focus-within) .cartao {
      translate: 0 -3px;
      box-shadow:
        0 2px 2px rgb(0 0 0 / 0.3),
        0 12px 14px rgb(0 0 0 / 0.45);
    }
    .xadrez {
      display: block;
      height: 100%;
      padding: 9%;
      box-sizing: border-box;
      @include x.xadrez(8px);
      box-shadow: inset 0 0 0 1px rgb(0 0 0 / 0.06);
    }

    .ponta {
      @include caderno.ponta;
      top: 26%;
      right: -11px;
      rotate: 7deg;
    }
    @media (hover: hover) {
      :host(:hover) .ponta {
        opacity: 0;
        transition-delay: 300ms;
      }
    }
    :host(:has(.hit:focus-visible)) .ponta,
    :host(:has(app-wish-note.aberta)) .ponta {
      opacity: 0;
    }

    .hit {
      position: absolute;
      inset: 0;
      z-index: 4;
      padding: 0;
      border: 0;
      background: none;
      cursor: pointer;
    }
    .hit:focus-visible {
      outline: 3px solid var(--hi);
      outline-offset: 4px;
    }

    .linha {
      display: flex;
      align-items: flex-start;
      gap: 6px;
    }
    .nome {
      flex: 1;
      min-width: 0;
      display: -webkit-box;
      overflow: hidden;
      -webkit-line-clamp: 2;
      -webkit-box-orient: vertical;
      font-family: var(--f-label);
      font-weight: 700;
      font-size: 0.92rem;
      line-height: 1.15;
      color: var(--wall-ink);
      overflow-wrap: break-word;
    }
    .sem-titulo {
      font-weight: 600;
      font-style: italic;
      color: var(--wall-ink-2);
    }
    .tags {
      margin-top: -6px;
      font-size: 0.92em;
    }

    .etiqueta {
      position: absolute;
      z-index: 6;
      top: -14px;
      right: -4px;
    }
    @media (hover: none) {
      .linha {
        flex-wrap: wrap;
      }
      .nome {
        flex: 1 1 6em;
      }
      .etiqueta {
        position: relative;
        top: -3px;
        right: 0;
        flex: none;
        margin-left: auto;
      }
    }

    app-wish-note {
      opacity: 0;
      transition:
        opacity var(--t-ui) var(--ease-ui),
        translate var(--t-ui) var(--ease-ui);
    }
    @media (hover: hover) {
      :host(:hover) app-wish-note {
        opacity: 1;
        translate: 0 0;
        transition-delay: 300ms;
      }
    }
    :host(:has(.hit:focus-visible)) app-wish-note,
    app-wish-note.aberta {
      opacity: 1;
      translate: 0 0;
    }

    :host(.is-landing) .cartao {
      animation: assenta var(--t-physical) var(--ease-physical);
    }
    @keyframes assenta {
      0% {
        translate: 0 -14px;
        scale: 1.06;
        opacity: 0;
      }
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
  /** Um tico fora do esquadro, pelo id (±0,8 grau, como a capa da Grade da Wishlist). */
  protected readonly tilt = computed(() => Math.round((wobble(this.piece().id, 9200) * 2 - 1) * 80) / 100);
}
