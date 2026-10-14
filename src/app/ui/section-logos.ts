import { ChangeDetectionStrategy, Component } from '@angular/core';
import { CUTOUT_STYLES } from '../core/clipping';

/**
 * O título da Wishlist, letra por letra, cada uma recortada de uma revista (índice em
 * `CUTOUT_STYLES`). Escolhido à mão, não sorteado: é o cabeçalho, tem de ficar bom sempre.
 */
const MASTHEAD: readonly { t: string; s: number; tilt: number; dy: number; size: number; clip: string }[] = [
  { t: 'W', s: 1, tilt: -6, dy: 2, size: 1.08, clip: 'polygon(2px 0, 100% 3px, calc(100% - 2px) 100%, 0 calc(100% - 2px))' },
  { t: 'i', s: 2, tilt: 4, dy: -3, size: 1.02, clip: 'polygon(0 2px, calc(100% - 3px) 0, 100% calc(100% - 1px), 3px 100%)' },
  { t: 'S', s: 3, tilt: -2, dy: 4, size: 0.92, clip: 'polygon(3px 1px, 100% 0, calc(100% - 1px) calc(100% - 3px), 0 100%)' },
  { t: 'h', s: 0, tilt: 5, dy: -1, size: 1.1, clip: 'polygon(0 0, calc(100% - 2px) 2px, 100% 100%, 2px calc(100% - 2px))' },
  { t: 'L', s: 6, tilt: -4, dy: 3, size: 0.98, clip: 'polygon(1px 3px, 100% 0, calc(100% - 3px) 100%, 0 calc(100% - 1px))' },
  { t: 'i', s: 5, tilt: 3, dy: -2, size: 1.06, clip: 'polygon(2px 0, calc(100% - 1px) 1px, 100% calc(100% - 3px), 0 100%)' },
  { t: 's', s: 8, tilt: -5, dy: 2, size: 0.95, clip: 'polygon(0 1px, 100% 3px, calc(100% - 2px) 100%, 2px calc(100% - 1px))' },
  { t: 'T', s: 4, tilt: 6, dy: -2, size: 1.04, clip: 'polygon(3px 0, 100% 2px, 100% calc(100% - 2px), 0 100%)' },
];

/**
 * O logo da Wishlist: o nome recortado como um bilhete de resgate, oito letras de oito revistas.
 * O tamanho vem do `font-size` de quem usa.
 */
@Component({
  selector: 'app-wishlist-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="letras" aria-hidden="true">
      @for (l of masthead; track $index) {
        <span
          class="letra"
          [class]="'fonte-' + styles[l.s].font"
          [class.caps]="styles[l.s].caps"
          [style.background]="styles[l.s].bg"
          [style.color]="styles[l.s].ink"
          [style.clip-path]="l.clip"
          [style.rotate.deg]="l.tilt"
          [style.translate]="'0 ' + l.dy + 'px'"
          [style.font-size.em]="l.size"
          >{{ l.t }}</span
        >
      }
    </span>
  `,
  styles: `
    :host {
      display: inline-block;
      line-height: 1;
      rotate: -1.5deg;
    }
    .letras {
      display: flex;
      align-items: center;
      gap: 3px;
    }
    .letra {
      display: inline-block;
      min-width: 0.9em;
      padding: 0.1em 0.16em 0.06em;
      text-align: center;
      line-height: 1;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.4)) drop-shadow(0 4px 5px rgb(0 0 0 / 0.3));
    }
    .letra.fonte-didone {
      font-family: var(--f-didone);
    }
    .letra.fonte-serif {
      font-family: var(--f-serif);
      font-size: 1.04em;
    }
    .letra.fonte-serif-it {
      font-family: var(--f-serif);
      font-style: italic;
      font-size: 1.06em;
    }
    .letra.fonte-label {
      font-family: var(--f-label);
      font-weight: 800;
      font-style: italic;
      padding-top: 0.14em;
    }
    .letra.caps {
      text-transform: uppercase;
    }
  `,
})
export class WishlistLogo {
  protected readonly masthead = MASTHEAD;
  protected readonly styles = CUTOUT_STYLES;
}

/**
 * O logo do Pra depois: a etiqueta escolar da capa do caderno, moldura impressa em azul, o campo
 * pautado e "Pra resenhar depois" escrito a pincel.
 */
@Component({
  selector: 'app-queue-logo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <span class="etiqueta-campo" aria-hidden="true">
      <span class="etiqueta-rotulo">Matéria</span>
      <span class="etiqueta-escrito">Pra resenhar depois</span>
    </span>
  `,
  styles: `
    :host {
      position: relative;
      display: inline-block;
      padding: 9px 12px 10px;
      rotate: -1.6deg;
      background: #fdfcf7;
      border-radius: 6px;
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.35)) drop-shadow(0 6px 8px rgb(0 0 0 / 0.4));
    }
    /* a moldura impressa: fio duplo, com os cantinhos recortados para dentro */
    :host::before {
      content: '';
      position: absolute;
      inset: 4px;
      border: 2px solid #3a67b8;
      border-radius: 4px;
      box-shadow:
        inset 0 0 0 2px #fdfcf7,
        inset 0 0 0 3px rgb(58 103 184 / 0.55);
      pointer-events: none;
    }
    .etiqueta-campo {
      position: relative;
      display: flex;
      align-items: baseline;
      gap: 10px;
      padding: 6px 14px 4px;
    }
    .etiqueta-rotulo {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.1em;
      text-transform: uppercase;
      color: #3a67b8;
    }
    /* escrito na linha pontilhada do campo */
    .etiqueta-escrito {
      padding: 0 4px 2px;
      background: radial-gradient(circle, rgb(58 103 184 / 0.6) 0.9px, transparent 1.2px) 0 100% / 5px 3px repeat-x;
      color: var(--ink);
      font-family: var(--f-marker);
      font-weight: 400;
      font-size: 1.7em;
      line-height: 1.1;
      white-space: nowrap;
    }
  `,
})
export class QueueLogo {}
