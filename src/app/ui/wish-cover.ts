import { ChangeDetectionStrategy, Component, computed, input, output, signal } from '@angular/core';
import { Wish, initialOf, relevanceOf } from '../core/review';
import { coverFor } from '../core/wish-cover-look';
import { RelevanceSticker } from './relevance-sticker';
import { WishActions } from './wish-actions';
import { WishNote } from './wish-note';
import { WishTags } from './wish-tags';

/**
 * Um desejo na Grade da Wishlist (PLANO-WISHLIST.md, P8 e A3): a vista para ver muitas capas de uma vez. Todas
 * do mesmo tamanho, mas ainda de revista: a capa recortada à tesoura, sem margem (o contorno em cortes retos,
 * um tico fora do esquadro), com a retícula e o brilho do couché por cima e a sombra de papel colado; um quinto
 * delas de revista velha. O contorno e a inclinação são sorteados pelo id e congelados (`coverFor`). O adesivo da vontade em
 * miniatura na quina, o nome em duas linhas e as tags embaixo. Tocar começa a resenha, como no recorte; com
 * a mão em cima, a etiqueta (Editar e Vontade, `WishActions`) acima da capa e, um instante depois, a descrição
 * na folha do caderno ao lado (`WishNote`). Sem mouse, a etiqueta fica ao lado do nome.
 */
@Component({
  selector: 'app-wish-cover',
  imports: [RelevanceSticker, WishActions, WishNote, WishTags],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[style.--cel-tilt]': 'look().tilt',
    '[class.is-landing]': 'landing()',
    '[style.view-transition-name]': '"desejo-" + wish().id',
  },
  template: `
    @if (wish().note) {
      <!-- tem descrição: a ponta da folha do caderno aparece atrás da capa (é de onde ela sai) -->
      <span class="ponta" aria-hidden="true"></span>
    }
    <span class="capa">
      <span class="foto" [class.velha]="look().old" [style.clip-path]="look().clip">
        @if (wish().game.coverUrl && failed() !== wish().game.coverUrl) {
          <img [src]="wish().game.coverUrl" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" (error)="failed.set(wish().game.coverUrl)" />
        } @else {
          <span class="sem-capa" aria-hidden="true">{{ initial() }}</span>
        }
        <span class="impressao" aria-hidden="true"></span>
      </span>
      @if (rel() !== 'comum') {
        <app-relevance-sticker class="adesivo" size="mini" [relevance]="rel()" [kind]="wish().kind" />
      }
    </span>
    <span class="linha">
      <span class="nome" dir="auto">{{ wish().game.name }}</span>
      <app-wish-actions class="etiqueta" [wish]="wish()" [editable]="editable()" (edit)="edit.emit()" (vontade)="vontade.emit($event)" />
    </span>
    @if (wish().tags?.length) {
      <app-wish-tags class="tags" [tags]="wish().tags!" [kind]="wish().kind" />
    }
    <button type="button" class="hit" (click)="opened.emit(wish().id)" [attr.aria-describedby]="wish().note ? 'descricao-' + wish().id : null">
      <span class="sr-only">Começar a resenha de {{ wish().game.name }}</span>
    </button>
    @if (wish().note; as n) {
      <app-wish-note [wishId]="wish().id" [text]="n" [query]="query()" [open]="noteOpen()" />
    }
  `,
  styles: `
    @use 'meio-tom';
    @use 'caderno';

    :host {
      position: relative;
      display: grid;
      gap: 10px;
      align-content: start;
      rotate: calc(var(--cel-tilt, 0) * 1deg);
    }
    :host(:hover),
    :host(:focus-within) {
      z-index: 30;
    }
    /* a ponta da folha da descrição, atrás da capa, do lado de onde a folha sai */
    :host {
      isolation: isolate;
    }
    .ponta {
      @include caderno.ponta;
      top: 26%;
      right: -11px;
      rotate: 7deg;
    }
    /* a folha grande abriu: a ponta some (a mesma espera da folha com a mão; na hora com o teclado e a busca) */
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

    .capa {
      position: relative;
      display: block;
      aspect-ratio: 2 / 3;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.4)) drop-shadow(0 4px 6px rgb(0 0 0 / 0.42));
      transition:
        translate var(--t-ui) var(--ease-ui),
        filter var(--t-ui) var(--ease-ui);
    }
    :host(:hover) .capa,
    :host(:focus-within) .capa {
      translate: 0 -3px;
      filter: drop-shadow(0 2px 2px rgb(0 0 0 / 0.35)) drop-shadow(0 12px 14px rgb(0 0 0 / 0.5));
    }

    /* a foto recortada à tesoura, sem margem (não .papel: essa é a classe global da cartolina), impressa em
       couché: a retícula fina e o brilho do papel por cima, sem pegar o toque */
    .foto {
      position: absolute;
      inset: 0;
      display: block;
      overflow: hidden;
      background: #2a2725;
    }
    .impressao {
      position: absolute;
      inset: 0;
      pointer-events: none;
      @include meio-tom.couche;
    }
    .foto img {
      display: block;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }
    .velha img {
      filter: sepia(0.3) saturate(0.78) contrast(0.93) brightness(1.03);
    }
    .sem-capa {
      display: grid;
      place-items: center;
      width: 100%;
      height: 100%;
      background: repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.04) 0 8px, transparent 8px 16px), #2a2725;
      color: rgb(245 242 234 / 0.72);
      font-family: var(--f-didone);
      font-size: 3rem;
      line-height: 1;
    }

    .adesivo {
      position: absolute;
      left: -8px;
      bottom: -8px;
      rotate: -8deg;
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
      overflow-wrap: anywhere;
    }
    .tags {
      margin-top: -6px;
      font-size: 0.92em;
    }

    /* a etiqueta: com o mouse, inteira acima da capa; sem mouse, ao lado do nome (por cima do toque) */
    .etiqueta {
      position: absolute;
      z-index: 6;
      top: -14px;
      right: -4px;
    }
    @media (hover: none) {
      .etiqueta {
        position: relative;
        top: -3px;
        right: 0;
        flex: none;
      }
    }

    /* a descrição: um instante depois da mão parar em cima, na hora com o teclado; some na hora */
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

    /* tocar começa a resenha: o botão cobre a capa e o nome */
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

    /* Sorteio: a sorteada sobe para perto da luz, as outras ficam na sombra (como o recorte) */
    :host {
      transition:
        scale var(--t-physical) var(--ease-physical),
        opacity var(--t-physical) var(--ease-physical);
    }
    :host(.sorteado) {
      z-index: 5;
      scale: 1.08;
    }
    :host(.sorteado) .capa {
      translate: 0 -6px;
      filter: drop-shadow(0 3px 3px rgb(0 0 0 / 0.3)) drop-shadow(0 22px 22px rgb(0 0 0 / 0.55));
    }
    :host(.na-sombra) {
      opacity: 0.32;
    }
    :host(.na-sombra:hover),
    :host(.na-sombra:focus-within) {
      opacity: 0.8;
    }

    /* chegando na parede (Ver na lista, um item novo): assenta com um tapa */
    :host(.is-landing) .capa {
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
export class WishCover {
  readonly wish = input.required<Wish>();
  /** Acabou de chegar na parede. */
  readonly landing = input(false);
  /** Com o Editar na etiqueta. */
  readonly editable = input(true);
  /** A busca da página (a descrição realça o trecho achado). */
  readonly query = input('');
  /** A busca achou o desejo só pela descrição: a folha fica aberta. */
  readonly noteOpen = input(false);
  /** Tocou: começa a resenha. */
  readonly opened = output<string>();
  /** O Editar da etiqueta. */
  readonly edit = output<void>();
  /** O Vontade da etiqueta: o menu das vontades abre embaixo do botão. */
  readonly vontade = output<{ el: HTMLElement; keyboard: boolean }>();

  protected readonly look = computed(() => coverFor(this.wish().id));
  protected readonly rel = computed(() => relevanceOf(this.wish()));
  protected readonly initial = computed(() => initialOf(this.wish().game.name));
  protected readonly failed = signal<string | null>(null);
}
