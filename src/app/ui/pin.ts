import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PINS } from '../core/wall-physics';

/** Tachinha de plástico vista de cima: base larga, cabeça, brilho e sombra na cartolina. */
@Component({
  selector: 'app-pin',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true', '[style.--pin]': 'color()', '[style.--pin-i]': 'index()' },
  template: `<span class="base"></span><span class="head"></span>`,
  styles: `
    :host {
      --pin: #e62e2d;
      --pin-dark: color-mix(in oklab, var(--pin), black 38%);
      position: absolute;
      width: 26px;
      height: 26px;
      pointer-events: none;
      z-index: 3;
    }
    .base,
    .head {
      position: absolute;
      border-radius: 50%;
    }
    .base {
      inset: 0;
      background:
        radial-gradient(circle at 50% 50%, transparent 52%, rgb(0 0 0 / 0.18) 53% 58%, transparent 60%),
        radial-gradient(circle at 38% 32%, color-mix(in oklab, var(--pin), white 30%), var(--pin) 45%, var(--pin-dark));
      /* sombra projetada pela luz de cima */
      box-shadow:
        2px 5px 3px -1px rgb(0 0 0 / 0.45),
        5px 10px 10px -2px rgb(0 0 0 / 0.25);
    }
    /* Foto das tachinhas (public/textures/tachinhas.png, 6 cores lado a lado) */
    :host-context(body.has-pins) {
      width: 32px;
      height: 32px;
      margin: -3px 0 0 -3px;
      background: url('textures/tachinhas.png') calc(var(--pin-i) * -32px) 0 / 192px 32px no-repeat;
      /* a luz fluorescente vem de cima à esquerda: a sombra cai para baixo e à direita, na cartolina */
      filter: drop-shadow(2px 3px 1.5px rgb(0 0 0 / 0.42)) drop-shadow(5px 7px 5px rgb(0 0 0 / 0.22));
    }
    :host-context(body.has-pins) .base,
    :host-context(body.has-pins) .head {
      display: none;
    }
    .head {
      inset: 6px;
      background:
        radial-gradient(circle at 34% 28%, rgb(255 255 255 / 0.85) 0 14%, transparent 34%),
        radial-gradient(circle at 50% 45%, color-mix(in oklab, var(--pin), white 12%), var(--pin-dark) 95%);
      box-shadow:
        inset 0 -1px 2px rgb(0 0 0 / 0.35),
        0 1px 1px rgb(0 0 0 / 0.3);
    }
  `,
})
export class Pin {
  readonly color = input('#e62e2d');
  protected readonly index = computed(() => Math.max(0, (PINS as readonly string[]).indexOf(this.color())));
}
