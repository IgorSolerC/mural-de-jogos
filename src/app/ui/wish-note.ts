import { ChangeDetectionStrategy, Component, DestroyRef, ElementRef, afterNextRender, inject, input } from '@angular/core';
import { SearchHighlight } from './search-highlight';

/**
 * O lembrete de um desejo da Wishlist (PLANO-WISHLIST.md, D5): nunca na parede. Com a mão parada um instante
 * em cima do recorte (ou da capa da Grade), ou o teclado nele, aparece ao lado uma folha arrancada do caderno
 * de espiral (o papel do Pra depois, `ui/_caderno.scss`), escrita a caneta, do lado que tem espaço. Quem usa
 * põe a folha dentro do card e decide quando ela aparece (a opacidade do host, ver a página e a capa);
 * aqui fica o desenho, o lado e o realce da busca. A busca que acha o desejo só pelo lembrete deixa a folha
 * aberta (`open`), com o trecho realçado. O leitor de tela ouve o lembrete pelo `aria-describedby` do toque
 * (o id é `lembrete-<id do desejo>`); a folha é só para os olhos.
 */
@Component({
  selector: 'app-wish-note',
  imports: [SearchHighlight],
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.aberta]': 'open()', 'aria-hidden': 'true' },
  template: `
    <p class="folha" [id]="'lembrete-' + wishId()" [appRealceBusca]="query()" realceEm=".texto">
      <span class="sr-only">Lembrete: </span><span class="texto">{{ text() }}</span>
    </p>
  `,
  styles: `
    @use 'caderno';

    :host {
      --regua: 22px;
      --folha: #fbfaf4;
      --pauta: rgb(70 120 200 / 0.35);
      --margem: rgb(214 73 73 / 0.55);
      position: absolute;
      z-index: 7;
      top: 14%;
      left: calc(100% + 8px);
      width: 196px;
      pointer-events: none;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 8px 10px rgb(0 0 0 / 0.45));
      rotate: 2.5deg;
      translate: -6px 4px;
    }
    :host([data-lado='esq']) {
      left: auto;
      right: calc(100% + 8px);
      rotate: -2.5deg;
      translate: 6px 4px;
    }
    .folha {
      margin: 0;
      padding: 20px 12px 10px 30px;
      color: #1d2a4a;
      @include caderno.papel(22px, var(--regua));
      @include caderno.espiral(topo);
    }
    .texto {
      display: block;
      font-family: var(--f-hand);
      font-size: 1.02rem;
      line-height: var(--regua);
      overflow-wrap: anywhere;
      white-space: pre-line;
    }
  `,
})
export class WishNote {
  readonly wishId = input.required<string>();
  readonly text = input.required<string>();
  /** A busca da página: o trecho achado fica realçado. */
  readonly query = input('');
  /** Fica aberta (a busca achou o desejo só pelo lembrete). */
  readonly open = input(false);

  constructor() {
    const host = inject(ElementRef<HTMLElement>).nativeElement as HTMLElement;
    // a folha abre do lado que tem espaço: à direita, ou à esquerda perto da beirada da tela
    const side = () => {
      const card = host.parentElement;
      if (!card) return;
      const r = card.getBoundingClientRect();
      host.dataset['lado'] = r.right + 230 > document.documentElement.clientWidth ? 'esq' : 'dir';
    };
    let card: HTMLElement | null = null;
    afterNextRender(() => {
      card = host.parentElement;
      side();
      card?.addEventListener('pointerenter', side);
      card?.addEventListener('focusin', side);
    });
    inject(DestroyRef).onDestroy(() => {
      card?.removeEventListener('pointerenter', side);
      card?.removeEventListener('focusin', side);
    });
  }
}
