import { ChangeDetectionStrategy, Component, computed, input, signal } from '@angular/core';
import { Stock } from '../core/review';

/**
 * Uma polaroid pequena presa com um pedaço de fita: a foto (uma capa, um emoji ou a inicial, na
 * cartolina escolhida) e o nome escrito à mão embaixo. É a do quadro de cima do perfil em miniatura.
 * Serve às seções do perfil no tipo Polaroid (a capa, em retrato) e às pessoas no Seguindo/Seguidores
 * (o emoji, quadrada). Quem usa põe o link ou o botão em volta; `--tilt` entorta, `--ergue` levanta
 * (no hover de quem está em volta).
 */
@Component({
  selector: 'app-mini-polaroid',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { '[class.mp-retrato]': "shape() === 'retrato'" },
  template: `
    <span class="mp-fita" aria-hidden="true"></span>
    <span class="mp-foto cartolina" [attr.data-cor]="stock()" [style.--stock]="'var(--stock-' + stock() + ')'" aria-hidden="true">
      @if (photo(); as url) {
        <img [src]="url" alt="" loading="lazy" decoding="async" referrerpolicy="no-referrer" (error)="broken.set(url)" />
      } @else if (emoji()) {
        <span class="mp-emoji">{{ emoji() }}</span>
      } @else {
        <span class="mp-inicial">{{ letter() }}</span>
      }
      <span class="mp-brilho"></span>
    </span>
    <span class="mp-legenda">
      <span class="mp-nome">{{ caption() }}</span>
      @if (extra()) {
        <span class="mp-extra">{{ extra() }}</span>
      }
    </span>
  `,
  styles: `
    :host {
      --ink: #151515;
      position: relative;
      display: grid;
      width: 100%;
      padding: 8px 8px 0;
      border-radius: 2px;
      background-color: #fbfaf5;
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      color: var(--ink);
      rotate: var(--tilt, 0deg);
      translate: 0 var(--ergue, 0px);
      /* a foto e o nome se medem pela polaroid */
      container-type: inline-size;
      box-shadow:
        0 1px 1px rgb(0 0 0 / 0.3),
        0 8px 14px -6px rgb(0 0 0 / 0.6),
        0 18px 26px -16px rgb(0 0 0 / 0.5);
      transition:
        translate var(--t-physical) var(--ease-physical),
        rotate var(--t-physical) var(--ease-physical);
    }

    /* o pedaço de fita-crepe que prende a polaroid na parede */
    .mp-fita {
      position: absolute;
      z-index: 2;
      top: -9px;
      left: 28%;
      width: 44%;
      height: 17px;
      background-color: rgb(222 205 160 / 0.88);
      background-image: var(--paper-grain);
      background-blend-mode: multiply;
      clip-path: polygon(0 8%, 3px 32%, 0 58%, 2px 92%, 100% 100%, calc(100% - 3px) 70%, 100% 40%, calc(100% - 2px) 4%);
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3));
      rotate: calc(var(--tilt, 0deg) * -1.5);
    }

    .mp-foto {
      position: relative;
      display: grid;
      place-items: center;
      aspect-ratio: 1;
      overflow: hidden;
      border-radius: 1px;
      box-shadow:
        inset 0 0 0 1px rgb(0 0 0 / 0.14),
        inset 0 0 18px rgb(0 0 0 / 0.22);
    }

    /* a capa: em pé, como a foto de uma instax */
    :host(.mp-retrato) .mp-foto {
      aspect-ratio: 3 / 4;
    }

    img {
      position: absolute;
      inset: 0;
      width: 100%;
      height: 100%;
      object-fit: cover;
    }

    /* a foto revelada: um pouco escura nas beiradas, e o brilho do plástico por cima */
    .mp-brilho {
      position: absolute;
      inset: 0;
      pointer-events: none;
      box-shadow: inset 0 0 18px rgb(0 0 0 / 0.22);
      background: linear-gradient(118deg, transparent 36%, rgb(255 255 255 / 0.18) 43%, transparent 52%);
    }

    .mp-emoji {
      font-size: 50cqw;
      line-height: 1;
      rotate: -4deg;
      filter: drop-shadow(0 4px 4px rgb(0 0 0 / 0.26));
      user-select: none;
    }

    /* sem foto: a inicial a caneta na cartolina */
    .mp-inicial {
      font-family: var(--f-marker);
      font-size: 46cqw;
      line-height: 1;
      color: var(--ink);
      rotate: -4deg;
    }

    .mp-legenda {
      display: grid;
      justify-items: center;
      gap: 2px;
      margin: 8px 2px 10px;
      text-align: center;
    }

    .mp-nome {
      display: -webkit-box;
      -webkit-box-orient: vertical;
      -webkit-line-clamp: 2;
      overflow: hidden;
      /* sempre o lugar de duas linhas: as polaroids de uma fileira ficam do mesmo tamanho */
      min-height: 2.2em;
      max-width: 100%;
      font-family: var(--f-marker);
      font-size: clamp(0.92rem, 13.5cqw, 1.12rem);
      line-height: 1.1;
      text-wrap: balance;
      overflow-wrap: anywhere;
    }

    /* o que vai embaixo do nome (a nota), a caneta vermelha */
    .mp-extra {
      font-family: var(--f-marker);
      font-size: clamp(0.9rem, 12cqw, 1.05rem);
      line-height: 1;
      color: var(--red-deep);
      rotate: -3deg;
    }

    @media (prefers-reduced-motion: reduce) {
      :host {
        transition: none;
      }
    }
  `,
})
export class MiniPolaroid {
  readonly stock = input<Stock>('amarelo');
  readonly image = input<string | null | undefined>(null);
  readonly emoji = input<string | null | undefined>(null);
  readonly caption = input.required<string>();
  /** Uma linha curta embaixo do nome (a nota da ficha). */
  readonly extra = input<string>('');
  /** Quadrada (as pessoas) ou em pé (as capas). */
  readonly shape = input<'quadrada' | 'retrato'>('quadrada');

  /** A capa que não abriu: no lugar dela fica a inicial. */
  protected readonly broken = signal<string | null>(null);
  protected readonly photo = computed(() => {
    const url = this.image();
    return url && url !== this.broken() ? url : null;
  });
  protected readonly letter = computed(() => [...this.caption().trim()][0]?.toUpperCase() ?? '?');
}
