import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { PickedGame } from '../core/review';

/** A capa do jogo dentro da capinha plástica de exposição da locadora. */
@Component({
  selector: 'app-cover-sleeve',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class]': 'size()' },
  template: `
    <div class="frame">
      @if (game().coverUrl && !failed()) {
        <img
          [src]="game().coverUrl"
          [alt]="decorative() ? '' : 'Capa de ' + game().name"
          loading="lazy"
          decoding="async"
          referrerpolicy="no-referrer"
          (error)="failed.set(true)"
        />
      } @else {
        <div class="blank" [attr.role]="decorative() ? null : 'img'" [attr.aria-label]="decorative() ? null : 'Sem capa para ' + game().name">
          <span class="initial" aria-hidden="true">{{ initial() }}</span>
          <span class="note" aria-hidden="true">sem capa</span>
        </div>
      }
    </div>
  `,
  styles: `
    :host {
      display: block;
      position: relative;
      padding: 5px;
      border-radius: 3px;
      /* a capinha: plástico transparente um pouco maior que a capa */
      background: rgb(255 255 255 / 0.13);
      box-shadow:
        inset 0 0 0 1px rgb(255 255 255 / 0.5),
        0 1px 2px rgb(0 0 0 / 0.22);
    }
    :host::after {
      /* reflexo da luz fluorescente no plástico */
      content: '';
      position: absolute;
      inset: 0;
      border-radius: 3px;
      pointer-events: none;
      background:
        linear-gradient(118deg, transparent 30%, rgb(255 255 255 / 0.28) 38%, transparent 47%),
        linear-gradient(118deg, transparent 52%, rgb(255 255 255 / 0.12) 56%, transparent 61%);
    }
    .frame {
      position: relative;
      aspect-ratio: 4 / 5;
      overflow: hidden;
      border-radius: 1px;
      background: #101012;
    }
    :host(.thumb) {
      padding: 2px;
    }
    :host(.thumb) .frame {
      aspect-ratio: 4 / 5;
    }
    img {
      width: 100%;
      height: 100%;
      object-fit: cover;
      object-position: 50% 20%;
    }
    /* capa da Steam (2:3) é mais alta que a capinha: corta igual em cima e embaixo, o título costuma estar numa das pontas */
    img[src*='/library_600x900.'] {
      object-position: 50% 50%;
    }
    .blank {
      position: absolute;
      inset: 0;
      display: grid;
      place-content: center;
      justify-items: center;
      gap: 4px;
      background:
        repeating-linear-gradient(-45deg, rgb(255 255 255 / 0.04) 0 8px, transparent 8px 16px),
        #17171a;
      color: var(--stock, var(--hi));
    }
    .initial {
      font-family: var(--f-marker);
      font-size: 4.2rem;
      line-height: 1;
    }
    .note {
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.8rem;
      letter-spacing: 0.14em;
      text-transform: uppercase;
      color: var(--wall-ink-2);
    }
    :host(.thumb) .initial {
      font-size: 1.4rem;
    }
    :host(.thumb) .note {
      display: none;
    }
  `,
})
export class CoverSleeve {
  readonly game = input.required<PickedGame>();
  readonly size = input<'card' | 'big' | 'thumb'>('card');
  /** A ficha já diz o nome do jogo: a capa não precisa repeti-lo para o leitor de tela. */
  readonly decorative = input(false);
  protected readonly failed = signal(false);
  protected readonly initial = computed(() => (this.game().name.trim()[0] ?? '?').toUpperCase());
}
