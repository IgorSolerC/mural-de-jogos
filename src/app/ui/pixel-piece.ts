import { ChangeDetectionStrategy, Component, computed, input, output } from '@angular/core';
import { PIXEL_TAG_SPACE, PixelPiece, pieceTitle, pixelArtOf } from '../core/pixel-gallery';
import { pieceLayout } from '../core/pixel-gallery-view';
import { Pin } from './pin';
import { PixelActions } from './pixel-actions';
import { PixelArt } from './pixel-art';
import { WishNote } from './wish-note';
import { WishTags } from './wish-tags';

/**
 * Uma obra na Mostra da galeria de pixel arts (PLANO-PIXEL-ARTS.md, 1): cada uma no material dela, como numa
 * mostra de trabalhos manuais pregada na parede. O desenho é o do widget (`app-pixel-art`, os sete jeitos): o
 * Pixel impresso num quadrado de papel milimetrado preso com a tachinha; a Figurinha recortada, colada direto na
 * parede; o Ponto-cruz no retalho de étamine; a Miçanga pousada na placa de plástico clara (a conta preta sumiria na
 * parede escura); o Voxel, os Blocos e o Lego direto na parede, a luz das peças marcando cada uma. Embaixo, fora da obra, a legenda de
 * museu: o título e as tags (a legenda da Wishlist). Tocar abre a ficha; com a mão em cima, a etiqueta (Ateliê e
 * Baixar) acima da obra e, um instante depois, a descrição na folha do caderno ao lado (a da Wishlist). Sem
 * mouse, a etiqueta fica no pé, ao lado do título.
 */
@Component({
  selector: 'app-pixel-piece',
  imports: [Pin, PixelActions, PixelArt, WishNote, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.is-landing]': 'landing()',
    '[style.--tilt]': 'layout().tilt',
  },
  template: `
    @let p = piece();
    <div class="obra" [class]="'obra jeito-' + look()">
      @if (p.note && !preview()) {
        <!-- tem descrição: a ponta da folha do caderno aparece atrás da obra (é de onde ela sai) -->
        <span class="ponta" aria-hidden="true"></span>
      }
      @if (look() === 'pixel') {
        <!-- o Pixel é impresso: o papel milimetrado, preso com a tachinha -->
        <span class="milimetrado">
          <app-pin class="pin" [color]="pin()" />
          <app-pixel-art class="arte" [args]="p.art" />
        </span>
      } @else if (look() === 'micanga') {
        <!-- as contas pousam na placa de plástico clara (as escuras sumiriam na parede) -->
        <span class="placa">
          <app-pixel-art class="arte" [args]="p.art" />
        </span>
      } @else {
        <app-pixel-art class="arte" [args]="p.art" />
      }
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

    /* a obra e o papel são contêineres: o teto da altura do desenho (abaixo) se mede pela largura deles */
    .obra,
    .milimetrado,
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

    /* o desenho do widget, da largura da obra (a altura é a da proporção dele, até 1,3 vez a largura: o desenho
       alto e fino estreita em vez de ocupar a tela), sem o broche de ampliar: aqui tocar já abre a ficha com o
       desenho grande. (o --widget-alto é um comprimento registrado: o cqi vale no contêiner de fora, a obra ou o
       papel, e não no próprio widget.) */
    .arte {
      --widget-alto: 130cqi;
      display: block;
      padding: 0;
      line-height: normal;
    }
    .arte ::ng-deep .ampliar {
      display: none;
    }
    /* o desenho estreito (mais alto que largo) fica no meio do papel, não encostado à esquerda */
    .arte ::ng-deep .pixel {
      margin-inline: auto;
    }

    /* o Pixel: o quadrado de papel milimetrado (as linhas finas a cada 4px, as fortes a cada 20px), torto
       pelo id, com a tachinha no alto e a sombra de papel pregado */
    .milimetrado {
      position: relative;
      display: block;
      padding: 12%;
      background:
        linear-gradient(rgb(60 140 120 / 0.28) 1px, transparent 1px) 0 0 / 20px 20px,
        linear-gradient(90deg, rgb(60 140 120 / 0.28) 1px, transparent 1px) 0 0 / 20px 20px,
        linear-gradient(rgb(60 140 120 / 0.12) 1px, transparent 1px) 0 0 / 4px 4px,
        linear-gradient(90deg, rgb(60 140 120 / 0.12) 1px, transparent 1px) 0 0 / 4px 4px,
        #f7f4ea;
      box-shadow: var(--shadow-card);
      rotate: calc(var(--tilt, 0) * 1deg);
      transition: box-shadow var(--t-ui) var(--ease-ui);
    }
    :host(:hover) .milimetrado,
    :host(:focus-within) .milimetrado {
      box-shadow: var(--shadow-lift);
    }
    .pin {
      position: absolute;
      z-index: 2;
      top: -10px;
      left: calc(50% - 13px);
    }
    /* a placa das contas: plástico claro de cantos redondos, com a sombra de quem está pousado na parede, torta
       pelo id como o papel milimetrado; as contas dentro ficam retas nela e sem a sombra do widget */
    .placa {
      display: block;
      padding: 7%;
      border-radius: 6%;
      background: #e3ded3;
      box-shadow:
        inset 0 0 0 1px rgb(0 0 0 / 0.06),
        var(--shadow-card);
      rotate: calc(var(--tilt, 0) * 1deg);
      transition: box-shadow var(--t-ui) var(--ease-ui);
    }
    .placa .arte ::ng-deep .desenho {
      rotate: none;
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

    /* a legenda de museu, fora da obra (não torta nem com a sombra dela) */
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
  protected readonly layout = computed(() => pieceLayout(this.piece()));
  protected readonly title = computed(() => pieceTitle(this.piece()));
  protected readonly size = computed(() => {
    const a = pixelArtOf(this.piece());
    return `${a.w} por ${a.h}`;
  });
  /** A tachinha, numa das cores das tachinhas do site, pelo id. */
  protected readonly pin = computed(() => PINS[[...this.piece().id].reduce((n, c) => (n * 31 + c.charCodeAt(0)) | 0, 0) & 3]);
}

/** As cores das tachinhas do papel milimetrado (as das fichas de Extras). */
const PINS = ['#e62e2d', '#2f6bff', '#1fb65a', '#ffd23f'];
