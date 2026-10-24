import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import type { IdDoIcone } from '../../../../../shared/cartela-de-icones';
import { Icone } from '../icone';
import type { CorDoSelo } from '../../core/selo';
import { corDoMonograma, letraDoMonograma } from './monograma';

/**
 * O monograma de uma senha: a primeira letra do nome, a pincel, num quadradinho de cartolina colado
 * torto. Ocupa o lugar do ícone do site (o cofre não busca nada de fora, nem o ícone do site), e a cor
 * sorteada pelo nome ajuda a achar a senha na lista sem ler. Com um ícone escolhido (da cartela do
 * site), ele fica no lugar da letra, no mesmo quadradinho.
 */
@Component({
  selector: 'cofre-monograma',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[attr.data-cor]': 'corAgora()', '[class.grande]': 'grande()', '[class.pequeno]': 'pequeno()' },
  imports: [Icone],
  template: `
    @if (icone(); as i) {
      <cofre-icone [cartela]="i" />
    } @else {
      {{ letra() }}
    }
  `,
  styles: `
    :host {
      --cor: var(--amarelo);
      display: inline-grid;
      place-items: center;
      flex: none;
      width: 40px;
      height: 40px;
      border-radius: 2px;
      background-color: var(--cor);
      background-image: var(--grao);
      background-blend-mode: multiply;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.28),
        0 3px 6px -3px rgb(0 0 0 / 0.35);
      color: var(--tinta);
      font: 400 1.3rem/1 var(--f-marker);
      rotate: -3deg;
      user-select: none;
    }
    :host([data-cor='azul']) {
      --cor: var(--azul);
      rotate: 2deg;
    }
    :host([data-cor='verde']) {
      --cor: var(--verde-cartolina);
      rotate: -1.5deg;
    }
    :host([data-cor='rosa']) {
      --cor: var(--rosa);
      rotate: 2.5deg;
    }
    :host([data-cor='laranja']) {
      --cor: var(--laranja);
      rotate: -2deg;
    }
    :host([data-cor='vermelho']) {
      --cor: var(--vermelho-cartolina);
      rotate: 1deg;
    }
    :host([data-cor='cinza']) {
      --cor: var(--cinza-cartolina);
      rotate: -2.5deg;
    }
    /* no preto, a letra e o ícone em giz */
    :host([data-cor='preto']) {
      --cor: var(--preto-cartolina);
      color: var(--giz);
      background-blend-mode: soft-light;
      rotate: 2deg;
    }
    :host([data-cor='lilas']) {
      --cor: var(--lilas);
      rotate: 1.5deg;
    }
    cofre-icone {
      width: 22px;
      height: 22px;
    }
    :host(.grande) cofre-icone {
      width: 34px;
      height: 34px;
    }
    /* na etiqueta de uma linha do quadro */
    :host(.pequeno) {
      width: 26px;
      height: 26px;
      font-size: 1rem;
    }
    :host(.pequeno) cofre-icone {
      width: 16px;
      height: 16px;
    }
    :host(.grande) {
      width: 64px;
      height: 64px;
      font-size: 2.1rem;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.28),
        0 8px 14px -6px rgb(0 0 0 / 0.45);
    }
  `,
})
export class MonogramaSelo {
  readonly nome = input.required<string>();
  readonly grande = input(false);
  readonly pequeno = input(false);
  readonly icone = input<IdDoIcone | ''>('');
  /** A cor escolhida; vazia, a que sai do nome. */
  readonly cor = input<CorDoSelo | ''>('');
  protected readonly letra = computed(() => letraDoMonograma(this.nome()));
  protected readonly corAgora = computed(() => this.cor() || corDoMonograma(this.nome()));
}
