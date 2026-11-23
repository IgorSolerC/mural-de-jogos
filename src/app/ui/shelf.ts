import { ChangeDetectionStrategy, Component } from '@angular/core';

/**
 * A prateleira de Outros (PLANO-OUTROS.md, D8): uma tábua de madeira presa na parede, com as coisas de pé em cima. O
 * tampo é um trapézio (a beirada de trás mais curta, vista um pouco de cima), a frente é grossa e, embaixo, de cada
 * suporte de ferro só aparece o que se vê: a barra presa na parede e o reforço do lado de dentro (o braço fica
 * escondido sob a tábua).
 *
 * Quem usa põe as coisas dentro (`<app-shelf>…</app-shelf>`): elas ficam lado a lado com o mesmo vão entre si e nas
 * pontas, descem um pouco sobre o tampo, e o que pende delas (a fita Dymo) cai na frente da tábua.
 */
@Component({
  selector: 'app-shelf',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="coisas"><ng-content /></div>
    <div class="tabua" aria-hidden="true">
      <span class="tampo"></span>
      <span class="frente"></span>
      @for (lado of lados; track lado) {
        <svg class="suporte" [attr.data-lado]="lado" viewBox="0 0 26 56">
          <path class="reforco" d="M9 0 H1 L9 30 Z" />
          <rect class="barra" x="9" y="0" width="9" height="56" rx="1" />
          <rect class="luz" x="9" y="0" width="2" height="56" />
          <circle cx="13.5" cy="20" r="1.8" />
          <circle cx="13.5" cy="44" r="1.8" />
        </svg>
      }
    </div>
  `,
  styleUrl: './shelf.scss',
})
export class Shelf {
  protected readonly lados = ['esq', 'dir'] as const;
}

/**
 * As coisas em tábuas de até `per` (sem `per`, todas numa só), as tábuas o mais iguais possível: quatro coisas em
 * tábuas de três são duas de duas, não três e uma.
 */
export function shelfRows<T>(items: readonly T[], per = Infinity): T[][] {
  if (items.length <= per) return items.length ? [[...items]] : [];
  const rows = Math.ceil(items.length / per);
  const size = Math.ceil(items.length / rows);
  const out: T[][] = [];
  for (let i = 0; i < items.length; i += size) out.push(items.slice(i, i + size));
  return out;
}
