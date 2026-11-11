import { NgTemplateOutlet } from '@angular/common';
import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { LOOK_PAD, hasInk, n3, inkOf, inkPaths, readPixelArt } from '../core/pixel-art';
import { inlineField } from '../core/widgets';
import { ICON, IconModule } from './icons';
import { snapToLines } from './line-snap';
import { pieceLift } from './piece-lift';
import { ZoomKnob } from './zoom-knob';

/** Os furos da placa de pinos da miçanga: um pino no meio de cada ponto (as contas cobrem os delas). */
function pegsOf(w: number, h: number): string {
  const out: string[] = [];
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) out.push(`M${x + 0.4} ${y + 0.5}a.1 .1 0 1 0 .2 0a.1 .1 0 1 0 -.2 0`);
  return out.join('');
}

/** O brilho de cada conta: um arquinho claro no alto, à esquerda. */
function glintsOf(rows: readonly string[]): string {
  const out: string[] = [];
  rows.forEach((row, y) => {
    for (let x = 0; x < row.length; x++) if (row[x] !== '0') out.push(`M${n3(x + 0.27)} ${n3(y + 0.42)}a.24 .24 0 0 1 .16 -.16`);
  });
  return out.join('');
}

let uid = 0;

/**
 * O widget PIXEL ART (ver core/pixel-art.ts): o desenho de quadradinhos escrito com algarismos, num SVG
 * de até nove caminhos, da altura do tamanho do widget (`--widget-alto`, ver note-widget.ts) e da
 * largura da proporção da grade; mais largo que a linha, encolhe. O transparente mostra a cartolina.
 *
 * - Pixel: os quadrados rentes, nítidos, como impressos na cartolina.
 * - Figurinha: o desenho recortado com a borda branca que segue o contorno e a sombra de colado.
 * - Ponto-cruz: um retalho de étamine, com os furinhos da trama, e cada ponto um X de linha.
 * - Miçanga: a placa de pinos clara e cada ponto uma conta, com o furo e o brilho.
 *
 * A legenda vai embaixo, a caneta; no modo Visual, com a peça selecionada, vira o campo dela. O broche
 * de ampliar sobe o desenho para o meio da tela (ui/piece-lift.ts), nítido em qualquer zoom.
 */
@Component({
  selector: 'app-pixel-art',
  imports: [IconModule, NgTemplateOutlet, ZoomKnob],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    @let a = art();
    <!-- o lugar fica o mesmo com e sem pontos: é ele que a pauta mede (ver o construtor) -->
    <div class="lugar">
    @if (inked()) {
      <figure #quadro class="pixel" [class]="'pixel jeito-' + a.look" [style.--prop]="ratio()" [style.--giro.deg]="tilt()" [attr.data-papel-proprio]="a.look === 'ponto-cruz' || a.look === 'micanga' ? '' : null" data-ergue-justo>
        <span class="desenho amplia" data-colado data-ergue-giro data-ergue-largura data-ergue-canto>
          <svg class="arte" [attr.viewBox]="viewBox()" role="img" [attr.aria-label]="spoken()" [attr.shape-rendering]="a.look === 'pixel' || a.look === 'figurinha' ? 'crispEdges' : null">
            @switch (a.look) {
              @case ('figurinha') {
                <defs>
                  <!-- a borda branca do recorte: o contorno dos pontos, engordado; embaixo, a sombra rente -->
                  <filter [attr.id]="ids + '-corte'" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
                    <feMorphology in="SourceAlpha" operator="dilate" radius="0.6" result="borda" />
                    <feFlood flood-color="#fffdf7" />
                    <feComposite in2="borda" operator="in" result="branco" />
                    <feGaussianBlur in="borda" stdDeviation="0.18" />
                    <feOffset dy="0.22" />
                    <feComponentTransfer><feFuncA type="linear" slope="0.4" /></feComponentTransfer>
                    <feMerge>
                      <feMergeNode />
                      <feMergeNode in="branco" />
                      <feMergeNode in="SourceGraphic" />
                    </feMerge>
                  </filter>
                </defs>
                <g [attr.filter]="'url(#' + ids + '-corte)'">
                  <ng-container *ngTemplateOutlet="tinta" />
                </g>
              }
              @case ('ponto-cruz') {
                <defs>
                  <!-- a trama do étamine: um furinho em cada canto de ponto -->
                  <pattern [attr.id]="ids + '-trama'" width="1" height="1" patternUnits="userSpaceOnUse">
                    <circle cx="0" cy="0" r="0.085" fill="#5b4a2e" fill-opacity="0.22" />
                    <circle cx="1" cy="0" r="0.085" fill="#5b4a2e" fill-opacity="0.22" />
                    <circle cx="0" cy="1" r="0.085" fill="#5b4a2e" fill-opacity="0.22" />
                    <circle cx="1" cy="1" r="0.085" fill="#5b4a2e" fill-opacity="0.22" />
                  </pattern>
                </defs>
                <rect class="pano" [attr.x]="-pad()" [attr.y]="-pad()" [attr.width]="a.w + pad() * 2" [attr.height]="a.h + pad() * 2" rx="0.15" />
                <rect [attr.x]="-pad()" [attr.y]="-pad()" [attr.width]="a.w + pad() * 2" [attr.height]="a.h + pad() * 2" [attr.fill]="'url(#' + ids + '-trama)'" />
                <!-- a sombra da linha, um tico abaixo, e a linha por cima -->
                <g class="linha-sombra" transform="translate(0.03 0.06)">
                  @for (p of paths(); track p.ink) {
                    <path [attr.d]="p.d" />
                  }
                </g>
                <g class="linha" fill="none">
                  @for (p of paths(); track p.ink) {
                    <path [attr.d]="p.d" [attr.stroke]="inks()[p.ink]" />
                  }
                </g>
              }
              @case ('micanga') {
                <rect class="placa" [attr.x]="-pad()" [attr.y]="-pad()" [attr.width]="a.w + pad() * 2" [attr.height]="a.h + pad() * 2" rx="0.6" />
                <path class="pinos" [attr.d]="pegs()" />
                <g class="contas" fill="none">
                  @for (p of paths(); track p.ink) {
                    <path [attr.d]="p.d" [attr.stroke]="inks()[p.ink]" />
                  }
                </g>
                <path class="brilho" [attr.d]="glints()" fill="none" />
              }
              @default {
                <ng-container *ngTemplateOutlet="tinta" />
              }
            }
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
    <!-- (fora do <svg> no molde: os caminhos dizem que são de SVG) -->
    <ng-template #tinta>
      @for (p of paths(); track p.ink) {
        <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
      }
    </ng-template>
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
    /* o ponto-cruz e a miçanga são objetos na cartolina: a sombra de quem está pousado */
    .jeito-ponto-cruz .arte,
    .jeito-micanga .arte {
      filter: drop-shadow(0 1px 1px rgb(0 0 0 / 0.22)) drop-shadow(0 3px 5px rgb(0 0 0 / 0.14));
    }
    /* no papel (o PDF), a sombra do SVG vira pontinhos soltos embaixo da placa: o objeto fica sem ela */
    @media print {
      .jeito-ponto-cruz .arte,
      .jeito-micanga .arte {
        filter: none;
      }
    }
    .pano {
      fill: #f4efe1;
    }
    .linha path,
    .linha-sombra path {
      stroke-width: 0.26;
      stroke-linecap: round;
    }
    .linha-sombra path {
      fill: none;
      stroke: #3a2e1c;
      stroke-opacity: 0.28;
    }
    .placa {
      fill: rgb(255 255 255 / 0.62);
      stroke: rgb(0 0 0 / 0.1);
      stroke-width: 0.06;
    }
    .pinos {
      fill: rgb(0 0 0 / 0.14);
    }
    .contas path {
      stroke-width: 0.34;
    }
    .brilho {
      stroke: #fff;
      stroke-opacity: 0.55;
      stroke-width: 0.07;
      stroke-linecap: round;
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
  protected readonly ids = 'px-' + ++uid;
  protected readonly lift = pieceLift();

  protected readonly art = computed(() => readPixelArt(this.args()));
  protected readonly inked = computed(() => hasInk(this.art().rows));
  protected readonly inks = computed(() => inkOf(this.art().palette, this.art().colors));
  protected readonly paths = computed(() => inkPaths(this.art().rows, this.art().look));
  protected readonly pad = computed(() => LOOK_PAD[this.art().look]);
  protected readonly viewBox = computed(() => {
    const { w, h } = this.art();
    const p = this.pad();
    return `${-p} ${-p} ${w + p * 2} ${h + p * 2}`;
  });
  protected readonly ratio = computed(() => {
    const { w, h } = this.art();
    const p = this.pad() * 2;
    return (w + p) / (h + p);
  });
  protected readonly pegs = computed(() => (this.art().look === 'micanga' ? pegsOf(this.art().w, this.art().h) : ''));
  protected readonly glints = computed(() => (this.art().look === 'micanga' ? glintsOf(this.art().rows) : ''));
  /** O giro dos objetos (a figurinha, o pano, a placa), do próprio desenho: entre 0,5 e 1,6 grau; o pixel é reto. */
  protected readonly tilt = computed(() => {
    const art = this.art();
    if (art.look === 'pixel') return 0;
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
