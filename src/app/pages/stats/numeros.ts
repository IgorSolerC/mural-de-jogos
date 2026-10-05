import { ChangeDetectionStrategy, Component, input } from '@angular/core';
import { Pin } from '../../ui/pin';

export interface Numero {
  label: string;
  value: string;
  sub: string;
  /** A cartolina ('rosa', 'amarelo'…). */
  stock: string;
  pin: string;
}

/** Os números grandes do Resumo: cada um numa ficha de cartolina presa com tachinha. */
@Component({
  selector: 'app-numeros',
  imports: [Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <ul role="list" aria-label="Os números grandes">
      @for (k of items(); track k.label) {
        <li class="cartolina" [attr.data-cor]="k.stock" [style.--stock]="'var(--stock-' + k.stock + ')'">
          <app-pin class="pin" [color]="k.pin" />
          <span class="rotulo">{{ k.label }}</span>
          <span class="num">{{ k.value }}</span>
          <span class="sub">{{ k.sub }}</span>
        </li>
      }
    </ul>
  `,
  styles: `
    :host {
      display: block;
    }

    ul {
      display: grid;
      grid-template-columns: repeat(6, minmax(0, 1fr));
      gap: 30px 22px;
      margin: 0;
      padding: 14px 0 0;
      list-style: none;
    }

    li {
      position: relative;
      display: grid;
      align-content: start;
      gap: 6px;
      min-height: 150px;
      padding: 24px 16px 16px;
      border-radius: 2px;
      box-shadow: var(--shadow-card);
      text-align: center;
      rotate: calc(var(--k-tilt, -1) * 1deg);

      &:nth-child(2n) {
        --k-tilt: 1.3;
      }
      &:nth-child(3n) {
        --k-tilt: -0.6;
      }
    }

    .pin {
      position: absolute;
      top: -12px;
      left: calc(50% - 13px);
    }

    .rotulo {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.86rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
    }

    .num {
      font-family: var(--f-marker);
      font-size: clamp(2.2rem, 3.4vw, 3rem);
      line-height: 1;
      font-variant-numeric: tabular-nums;
      overflow-wrap: anywhere;
    }

    .sub {
      font-family: var(--f-hand);
      font-size: 0.98rem;
      line-height: 1.2;
      text-wrap: balance;
    }

    @media (max-width: 1180px) {
      ul {
        grid-template-columns: repeat(3, minmax(0, 1fr));
      }
    }

    @media (max-width: 560px) {
      ul {
        grid-template-columns: repeat(2, minmax(0, 1fr));
        gap: 26px 16px;
      }

      li {
        min-height: 128px;
        padding: 22px 10px 12px;
      }
    }
  `,
})
export class Numeros {
  readonly items = input.required<readonly Numero[]>();
}
