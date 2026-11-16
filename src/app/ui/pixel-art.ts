import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { PixelLook, hasInk, inkOf, lookBox, readPixelArt } from '../core/pixel-art';
import { inlineField } from '../core/widgets';
import { ICON, IconModule } from './icons';
import { snapToLines } from './line-snap';
import { pieceLift } from './piece-lift';
import { PixelLookArt } from './pixel-look-art';
import { ZoomKnob } from './zoom-knob';

/** Os jeitos que são um objeto pousado na cartolina (o pano, as contas, as pecinhas): a sombra de quem está pousado. */
const OBJECTS: ReadonlySet<PixelLook> = new Set<PixelLook>(['ponto-cruz', 'micanga', 'voxel', 'blocos', 'lego']);

/**
 * O widget PIXEL ART (ver core/pixel-art.ts): o desenho de quadradinhos escrito com algarismos, num SVG
 * de até nove caminhos, da altura do tamanho do widget (`--widget-alto`, ver note-widget.ts) e da
 * largura da proporção da grade; mais largo que a linha, encolhe. O transparente mostra a cartolina.
 *
 * Os jeitos (Pixel, Figurinha, Ponto-cruz, Miçanga, Voxel, Blocos e Lego) são desenhados por
 * ui/pixel-look-art.ts, a mesma peça das miniaturas da folha; os que são objeto pousam com sombra e
 * um giro pequeno (o pixel é impresso, reto; o voxel já vem girado no espaço, de pé e reto na cartolina).
 *
 * A legenda vai embaixo, a caneta; no modo Visual, com a peça selecionada, vira o campo dela. O broche
 * de ampliar sobe o desenho para o meio da tela (ui/piece-lift.ts), nítido em qualquer zoom.
 */
@Component({
  selector: 'app-pixel-art',
  imports: [IconModule, PixelLookArt, ZoomKnob],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = art();
    <!-- o lugar fica o mesmo com e sem pontos: é ele que a pauta mede (ver o construtor) -->
    <div class="lugar">
    @if (inked()) {
      <figure #quadro class="pixel" [class]="'pixel jeito-' + a.look" [class.objeto]="object()" [style.--prop]="ratio()" [style.--giro.deg]="tilt()" [attr.data-papel-proprio]="a.look === 'ponto-cruz' ? '' : null" data-ergue-justo>
        <span class="desenho amplia" data-colado data-ergue-giro data-ergue-largura data-ergue-canto>
          <svg class="arte" [attr.viewBox]="viewBox()" role="img" [attr.aria-label]="spoken()">
            <svg:g appPixelLookArt [rows]="a.rows" [look]="a.look" [inks]="inks()" [w]="a.w" [h]="a.h" />
          </svg>
          <app-zoom-knob class="ampliar" [label]="'Ampliar o desenho' + (a.caption ? ': ' + a.caption : '')" (pressed)="lift.toggle(quadro)" />
        </span>
        @if (a.caption || editavel()) {
          <figcaption class="legenda">
            @if (editavel()) {
              <input class="campo-peca" type="text" data-campo="caption" enterkeyhint="done" autocomplete="off" [value]="a.caption" [attr.maxlength]="inline?.max ?? null" [placeholder]="inline?.inline ?? ''" aria-label="Legenda do desenho" />
            } @else {
              {{ a.caption }}
            }
          </figcaption>
        }
      </figure>
    } @else {
      <!-- sem ponto nenhum: o lugar dele, tracejado, dizendo como escrever -->
      <div class="pixel vazio" role="note">
        <lucide-icon class="vazio-icone" [img]="EmptyIcon" [size]="22" aria-hidden="true" />
        <span class="vazio-lado">
          <span class="vazio-nome">Pixel art sem pontos</span>
          <span class="vazio-dica">Escreva assim: <code>8x8 | 0110/1111</code></span>
        </span>
      </div>
    }
    </div>
  `,
  styles: `
    :host {
      display: block;
      padding: 0.35em 0 0.45em;
      box-sizing: border-box;
      white-space: normal;
      container-type: inline-size;
    }
    /* a altura do desenho: a do tamanho, menos o respiro e a legenda (--reserva) */
    .pixel {
      --reserva: 0.8em;
      --alto-arte: max(1.5em, calc(var(--widget-alto, 12em) - var(--reserva)));
      display: grid;
      justify-items: start;
      width: fit-content;
      max-width: 100%;
      margin: 0;
    }
    .pixel:has(> .legenda) {
      --reserva: calc(0.8em + 1.5em * var(--letra-tam, 1));
    }
    .desenho {
      position: relative;
      display: grid;
      max-width: 100%;
      rotate: var(--giro, 0deg);
      transform-origin: 50% 45%;
    }
    .arte {
      grid-area: 1 / 1;
      display: block;
      width: min(100cqi, calc(var(--alto-arte) * var(--prop, 1)));
      height: auto;
      aspect-ratio: var(--prop, 1);
      overflow: visible;
    }
    /* os objetos na cartolina (o pano, as contas, os cubinhos, os blocos, as pecinhas): a sombra de quem está pousado */
    .objeto .arte {
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.22)) drop-shadow(0 3px 5px rgb(0 0 0 / 0.14));
    }
    /* no papel (o PDF), a sombra do SVG vira pontinhos soltos embaixo do objeto: ele fica sem ela */
    @media print {
      .objeto .arte {
        filter: none;
      }
    }
    /* o broche de ampliar, no canto de cima do desenho, metade para fora */
    .ampliar {
      grid-area: 1 / 1;
      place-self: start end;
      position: relative;
      z-index: 2;
      margin: -11px -11px 0 0;
    }
    .legenda {
      max-width: max(100%, 12em);
      margin-top: 0.3em;
      color: currentColor;
      font-family: var(--f-hand);
      font-size: calc(0.92em * var(--letra-tam, 1));
      line-height: 1.25;
      overflow-wrap: anywhere;
    }
    .campo-peca {
      width: max(100%, 12em);
      padding: 0;
      border: 0;
      border-bottom: 1.5px dashed color-mix(in srgb, currentColor 45%, transparent);
      background: transparent;
      color: inherit;
      font: inherit;
    }
    .campo-peca:focus {
      outline: none;
      border-bottom-style: solid;
    }
    /* sem pontos: o lugar dele, tracejado */
    .vazio {
      display: flex;
      align-items: center;
      gap: 0.6em;
      width: fit-content;
      max-width: 100%;
      padding: 0.45em 0.8em;
      border: 2px dashed color-mix(in srgb, currentColor 40%, transparent);
      border-radius: 3px;
      box-sizing: border-box;
    }
    .vazio-icone {
      opacity: 0.7;
    }
    .vazio-lado {
      display: grid;
    }
    .vazio-nome {
      font-weight: 600;
    }
    .vazio-dica {
      font-size: 0.85em;
      opacity: 0.8;
    }
    .vazio-dica code {
      font-family: var(--f-mono);
    }
    /* no alto (ampliado), o desenho fica reto */
    :host-context(.erguida) .desenho {
      rotate: 0deg;
    }
  `,
})
export class PixelArt {
  readonly args = input.required<readonly string[]>();
  /** No modo Visual, a peça selecionada: a legenda se escreve direto nela (ver `WidgetField.inline`). */
  readonly editavel = input(false);

  protected readonly EmptyIcon = ICON.pixelArt;
  protected readonly inline = inlineField('pixel');
  protected readonly lift = pieceLift();

  protected readonly art = computed(() => readPixelArt(this.args()));
  protected readonly inked = computed(() => hasInk(this.art().rows));
  protected readonly inks = computed(() => inkOf(this.art().palette, this.art().colors));
  protected readonly object = computed(() => OBJECTS.has(this.art().look));
  /** O quadro do desenho: a grade com a sobra do jeito (a borda, o pano), ou o bloco girado do voxel. */
  protected readonly box = computed(() => lookBox(this.art().look, this.art().w, this.art().h));
  protected readonly viewBox = computed(() => {
    const b = this.box();
    return `${b.x} ${b.y} ${b.w} ${b.h}`;
  });
  protected readonly ratio = computed(() => this.box().w / this.box().h);
  /** O giro dos objetos (a figurinha, o pano, as contas, as pecinhas), do próprio desenho: entre 0,5 e 1,6 grau; o pixel e o voxel são retos. */
  protected readonly tilt = computed(() => {
    const art = this.art();
    if (art.look === 'pixel' || art.look === 'voxel') return 0;
    let h = 0;
    for (const ch of art.rows.join('')) h = (h * 31 + ch.charCodeAt(0)) | 0;
    const mag = 0.5 + (Math.abs(h) % 110) / 100;
    return h & 1 ? mag : -mag;
  });
  protected readonly spoken = computed(() => {
    const { w, h, caption } = this.art();
    return caption ? `Pixel art: ${caption}` : `Pixel art ${w} × ${h}`;
  });

  constructor() {
    // a altura inteira, em linhas da pauta: o texto de baixo continua em cima das linhas azuis
    snapToLines('.lugar');
  }
}
