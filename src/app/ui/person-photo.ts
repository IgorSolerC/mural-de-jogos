import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { initialStock } from '../core/profile-people';
import { Stock } from '../core/review';

/** A "foto" do perfil de alguém: o emoji e a cartolina atrás dele. */
export interface PersonFace {
  emoji: string;
  cor: Stock;
}

/**
 * A foto do perfil de uma pessoa em miniatura, como uma foto revelada: o emoji na cartolina dela,
 * com a borda branca do papel fotográfico, meio torta (sempre do mesmo jeito para a mesma pessoa).
 * Sem foto, a inicial a pincel numa cartolina sorteada pelo código. É enfeite: quem usa escreve o
 * nome ao lado. O tamanho vem de `--foto` (42px).
 */
@Component({
  selector: 'app-person-photo',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    class: 'cartolina',
    'aria-hidden': 'true',
    '[attr.data-cor]': 'stock()',
    '[style.--stock]': "'var(--stock-' + stock() + ')'",
    '[style.rotate.deg]': 'tilt()',
  },
  template: `
    @if (face(); as f) {
      <span class="pf-emoji">{{ f.emoji }}</span>
    } @else {
      <span class="pf-inicial">{{ initial() }}</span>
    }
  `,
  styles: `
    :host {
      --lado: var(--foto, 42px);
      flex: none;
      display: grid;
      place-items: center;
      width: var(--lado);
      height: var(--lado);
      border: calc(var(--lado) * 0.085) solid #fbfaf5;
      border-radius: 2px;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.3),
        0 4px 7px -2px rgb(0 0 0 / 0.5);
    }

    .pf-emoji {
      font-size: calc(var(--lado) * 0.5);
      line-height: 1;
      user-select: none;
    }

    .pf-inicial {
      font-family: var(--f-marker);
      font-size: calc(var(--lado) * 0.5);
      line-height: 1;
      translate: 0 1px;
    }
  `,
})
export class PersonPhoto {
  readonly code = input.required<string>();
  readonly name = input.required<string>();
  readonly face = input<PersonFace | null | undefined>(null);

  protected readonly stock = computed(() => this.face()?.cor ?? initialStock(this.code()));
  protected readonly initial = computed(() => ([...this.name().trim()][0] ?? '?').toLocaleUpperCase('pt-BR'));
  /** De −4 a +4 graus, pelo código da pessoa (a mesma conta da folha de comentários). */
  protected readonly tilt = computed(() => {
    let h = 0;
    for (const c of this.code()) h = (h * 31 + c.charCodeAt(0)) | 0;
    return (Math.abs(h) % 9) - 4;
  });
}
