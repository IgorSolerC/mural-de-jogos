import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';

/** Amarradas à mão: cada etiqueta sai um pouco torta, sempre do mesmo jeito. */
const TILTS = [1.2, -0.8, 0.5, -1.3, 0.9, -0.4];

/**
 * A tag de uma anotação: uma etiqueta de papel kraft, com a ponta cortada em bico e o furinho do
 * barbante, a letra de carimbo pequena. Diferente do adesivo da categoria (impresso, com desenho):
 * a categoria diz o que a anotação é; a tag só informa.
 * `ghost` é a etiqueta ainda não amarrada (no editor): só o contorno.
 */
@Component({
  selector: 'app-note-tag',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[class.mini]': 'size() === "mini"',
    '[class.ghost]': 'ghost()',
    '[style.--tag-tilt]': 'tilt() + "deg"',
  },
  template: `<span class="papel" aria-hidden="true"></span><span class="furo" aria-hidden="true"></span><span class="txt">{{ label() }}</span>`,
  styles: `
    :host {
      --kraft: #d8bd8c;
      --kraft-ink: #3a2a14;
      position: relative;
      display: inline-flex;
      align-items: center;
      gap: 6px;
      max-width: 100%;
      min-height: 22px;
      padding: 3px 9px 2px 15px;
      color: var(--kraft-ink);
      font-family: var(--f-label);
      font-weight: 800;
      font-size: 0.78rem;
      letter-spacing: 0.04em;
      line-height: 1;
      white-space: nowrap;
      /* a sombra do papel solto na cartolina, no formato da etiqueta (fica no anfitrião: o recorte em
         bico, no papel, cortaria a sombra junto) */
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.3)) drop-shadow(0 3px 4px rgb(0 0 0 / 0.22));
      rotate: var(--tag-tilt, 0deg);
      isolation: isolate;
    }
    /* o papel pardo, com a ponta cortada em bico onde fica o furo do barbante */
    .papel {
      position: absolute;
      inset: 0;
      z-index: -1;
      background:
        /* as fibras do papel pardo */
        repeating-linear-gradient(97deg, rgb(255 255 255 / 0.07) 0 2px, transparent 2px 5px),
        var(--kraft);
      clip-path: polygon(9px 0, 100% 0, 100% 100%, 9px 100%, 0 50%);
    }
    /* o furinho com o ilhós */
    .furo {
      flex: none;
      position: absolute;
      left: 6px;
      top: calc(50% - 2.5px);
      width: 5px;
      height: 5px;
      border-radius: 50%;
      background: rgb(0 0 0 / 0.55);
      box-shadow: 0 0 0 1.4px rgb(255 255 255 / 0.55);
    }
    .txt {
      overflow: hidden;
      text-overflow: ellipsis;
      padding-bottom: 1px;
    }
    :host(.mini) {
      min-height: 19px;
      padding: 2px 7px 1px 13px;
      font-size: 0.7rem;
    }
    :host(.mini) .furo {
      left: 5px;
    }
    /* ainda não amarrada: o contorno tracejado de uma etiqueta em branco */
    :host(.ghost) {
      color: rgb(21 21 21 / 0.74);
      filter: none;
      rotate: 0deg;
      outline: 1.5px dashed rgb(21 21 21 / 0.42);
      outline-offset: -1.5px;
      padding-left: 9px;
    }
    :host(.ghost) .papel,
    :host(.ghost) .furo {
      display: none;
    }
  `,
})
export class NoteTag {
  readonly label = input.required<string>();
  readonly size = input<'card' | 'mini'>('card');
  readonly ghost = input(false);
  /** A posição na fileira, para a tortura de cada uma; null amarra reto. */
  readonly index = input<number | null>(null);

  protected readonly tilt = computed(() => {
    const i = this.index();
    return i === null ? 0 : TILTS[i % TILTS.length];
  });
}
