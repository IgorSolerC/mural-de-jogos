import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PIXEL_TAG_SPACE, PixelPiece, pieceTitle, pixelArtOf } from '../core/pixel-gallery';
import { PixelActions } from './pixel-actions';
import { PixelArt } from './pixel-art';
import { WishNote } from './wish-note';
import { WishTags } from './wish-tags';

/**
 * Uma obra na Mostra da galeria de pixel arts (PLANO-PIXEL-ARTS.md, 1): cada uma no jeito dela (o desenho do widget,
 * `app-pixel-art`, os sete jeitos), todas num quadrado do mesmo tamanho, em fileiras como a Grade (pedido do dono em
 * 16/nov: nada de tamanhos diferentes nem de papel milimetrado fora do ateliê). O transparente fica transparente: o
 * Pixel e os objetos vão direto na parede, sem margem; só a Miçanga pousa na placa de plástico clara (a conta preta
 * sumiria na parede escura). Embaixo, fora da obra, a legenda de museu: o título e as tags (a legenda da Wishlist).
 * Tocar abre a ficha; com a mão em cima, a etiqueta (Ateliê e Baixar) acima da obra e, um instante depois, a
 * descrição na folha do caderno ao lado (a da Wishlist). Sem mouse, a etiqueta fica no pé, ao lado do título.
 */
@Component({
  selector: 'app-pixel-piece',
  imports: [PixelActions, PixelArt, WishNote, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-landing]': 'landing()',
  },
  template: `
    @let p = piece();
    <div class="obra" [class]="'obra jeito-' + look()">
      @if (p.note && !preview()) {
        <!-- tem descrição: a ponta da folha do caderno aparece atrás da obra (é de onde ela sai) -->
        <span class="ponta" aria-hidden="true"></span>
      }
      <!-- cada obra num quadrado do mesmo tamanho, o desenho inteiro no meio, sem papel nem margem: o transparente
           mostra a parede -->
      <span class="quadro">
        @if (look() === 'micanga') {
          <!-- as contas pousam na placa de plástico clara (as escuras sumiriam na parede) -->
          <span class="placa">
            <app-pixel-art class="arte" [args]="p.art" />
          </span>
        } @else {
          <app-pixel-art class="arte" [args]="p.art" />
        }
      </span>
      @if (!preview()) {
        <!-- tocar abre a ficha da obra; vem antes da etiqueta no Tab -->
        <button type="button" class="hit" (click)="opened.emit(p.id)" [attr.aria-describedby]="p.note ? 'descricao-' + p.id : null">
          <span class="sr-only">Abrir {{ title() }}, {{ size() }}</span>
        </button>
      }
    </div>
    <div class="legenda">
      <span class="linha">
        <span class="nome" [class.sem-titulo]="!p.title" dir="auto">{{ title() }}</span>
        @if (!preview()) {
          <app-pixel-actions class="etiqueta" [title]="title()" (atelie)="atelie.emit(p.id)" (download)="download.emit(p.id)" />
        }
      </span>
      @if (p.tags?.length) {
        <app-wish-tags class="tags" [tags]="p.tags!" [kind]="tagSpace" />
      }
    </div>
    @if (!preview() && p.note; as n) {
      <app-wish-note [wishId]="p.id" [text]="n" [query]="query()" [open]="noteOpen()" />
    }
  `,
  styles: `
    @use 'obra-galeria' as obra;

    :host {
      position: relative;
      display: grid;
      gap: 8px;
      isolation: isolate;
    }
    :host(:hover),
    :host(:focus-within) {
      z-index: 30;
    }

    /* o quadrado da obra e a placa são contêineres: o desenho se mede pela largura deles */
    .quadro,
    .placa {
      container-type: inline-size;
    }
    .obra {
      position: relative;
      transition:
        translate var(--t-ui) var(--ease-ui),
        filter var(--t-ui) var(--ease-ui);
    }
    :host(:hover) .obra,
    :host(:focus-within) .obra {
      translate: 0 -3px;
    }

    /* todas do mesmo tamanho, como na Grade: o quadrado da largura da coluna, o desenho no meio dele */
    .quadro {
      display: grid;
      align-content: center;
      aspect-ratio: 1;
    }

    /* o desenho do widget no maior tamanho que cabe no quadrado (o largo ocupa a largura, o alto ocupa a altura),
       reto e sem o broche de ampliar: aqui tocar já abre a ficha com o desenho grande. (o --widget-alto é um
       comprimento registrado: o cqi vale no contêiner de fora, o quadrado ou a placa; o 0.8em é o respiro que o
       widget tira da altura.) */
    .arte {
      --widget-alto: calc(100cqi + 0.8em);
      display: block;
      width: 100%;
      padding: 0;
      line-height: normal;
    }
    .arte ::ng-deep .ampliar {
      display: none;
    }
    .arte ::ng-deep .pixel {
      margin-inline: auto;
    }
    .arte ::ng-deep .desenho {
      rotate: none;
    }

    /* a placa das contas: plástico claro de cantos redondos, com a sombra de quem está pousado na parede; as
       contas dentro ficam sem a sombra do widget */
    .placa {
      display: block;
      padding: 7%;
      border-radius: 6%;
      background: #e3ded3;
      box-shadow:
        inset 0 0 0 1px rgb(0 0 0 / 0.06),
        var(--shadow-card);
      transition: box-shadow var(--t-ui) var(--ease-ui);
    }
    .placa .arte ::ng-deep .objeto .arte {
      filter: none;
    }
    :host(:hover) .placa,
    :host(:focus-within) .placa {
      box-shadow:
        inset 0 0 0 1px rgb(0 0 0 / 0.06),
        var(--shadow-lift);
    }
    /* a figurinha colada direto na parede: a sombra rente de quem está colado */
    .jeito-figurinha .arte {
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 3px 4px rgb(0 0 0 / 0.3));
    }

    /* a legenda de museu, fora da obra (sem a sombra dela) */
    .legenda {
      display: grid;
      gap: 4px;
      min-width: 0;
    }
    /* a ponta, o toque, o título, a etiqueta, a descrição e o tapa: os mesmos da Grade (ui/_obra-galeria.scss) */
    @include obra.na-parede('.obra', $toque-folga: 5px, $nome-tam: 0.95rem, $etiqueta-topo: -16px, $etiqueta-direita: 4px);
  `,
})
export class PixelPieceCard {
  readonly piece = input.required<PixelPiece>();
  /** Acabou de chegar na parede. */
  readonly landing = input(false);
  /** A prévia da ficha: só o desenho e a legenda, sem o toque, a etiqueta e a descrição. */
  readonly preview = input(false);
  /** A busca da página (a descrição realça o trecho achado). */
  readonly query = input('');
  /** A busca achou a obra só pela descrição: a folha fica aberta. */
  readonly noteOpen = input(false);
  /** Tocou: abre a ficha. */
  readonly opened = output<string>();
  /** O Ateliê da etiqueta. */
  readonly atelie = output<string>();
  /** O Baixar da etiqueta. */
  readonly download = output<string>();

  protected readonly tagSpace = PIXEL_TAG_SPACE;
  protected readonly look = computed(() => pixelArtOf(this.piece()).look);
  protected readonly title = computed(() => pieceTitle(this.piece()));
  protected readonly size = computed(() => {
    const a = pixelArtOf(this.piece());
    return `${a.w} por ${a.h}`;
  });
}
