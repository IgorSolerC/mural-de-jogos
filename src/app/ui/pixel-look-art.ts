import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { BEAD_HOLE, BEAD_R, LOOK_PAD, PixelLook, beadPath, inkArea, inkPaths, stitchArms, stitchBack, stitchFront, voxelSides } from '../core/pixel-art';

let uid = 0;

/**
 * O desenho da pixel art num jeito, dentro de um <svg> (um ponto = 1 unidade, o canto de cima à esquerda no
 * 0 0; o pano e a profundidade do voxel passam para fora, `LOOK_PAD`): o mesmo no widget (ui/pixel-art.ts)
 * e nas miniaturas dos jeitos da folha (ui/widget-sheet.html).
 *
 * Cada cor é um caminho só, qualquer que seja a grade; a luz e a sombra que se repetem em todo ponto (o
 * chanfro do bloco, o pino do lego, o brilho da conta, a linha torcida do bordado) são desenhadas uma vez
 * num padrão de 1 × 1 e pintadas por cima de todos os pontos de uma vez (`inkArea`).
 *
 * - Pixel: os quadrados rentes.
 * - Figurinha: recortada com a borda branca que segue o contorno e a sombra de colada.
 * - Ponto-cruz: o pano de étamine com os furos, e cada ponto um X de linha de canto a canto, a perna de
 *   cima por cima da de baixo, com os fios aparecendo.
 * - Miçanga: as contas de passar a ferro, gordas e quase encostando, com o furo e o brilho de plástico.
 * - Voxel: cubinhos, a frente do desenho e a profundidade em cima (mais clara) e à direita (mais escura).
 * - Blocos: cada ponto um bloco chanfrado, a luz no alto e à esquerda.
 * - Lego: pecinhas 1 × 1 vistas de cima, a fresta entre elas e o pino com o brilho e a sombra.
 */
@Component({
  selector: 'g[appPixelLookArt]',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: {
    '[attr.shape-rendering]': "look() === 'pixel' || look() === 'figurinha' ? 'crispEdges' : null",
  },
  template: `
    @switch (look()) {
      @case ('figurinha') {
        <svg:defs>
          <!-- a borda branca do recorte: o contorno dos pontos, engordado; embaixo, a sombra rente -->
          <svg:filter [attr.id]="ids + '-corte'" x="-20%" y="-20%" width="140%" height="140%" color-interpolation-filters="sRGB">
            <svg:feMorphology in="SourceAlpha" operator="dilate" radius="0.6" result="borda" />
            <svg:feFlood flood-color="#fffdf7" />
            <svg:feComposite in2="borda" operator="in" result="branco" />
            <svg:feGaussianBlur in="borda" stdDeviation="0.18" />
            <svg:feOffset dy="0.22" />
            <svg:feComponentTransfer><svg:feFuncA type="linear" slope="0.4" /></svg:feComponentTransfer>
            <svg:feMerge>
              <svg:feMergeNode />
              <svg:feMergeNode in="branco" />
              <svg:feMergeNode in="SourceGraphic" />
            </svg:feMerge>
          </svg:filter>
        </svg:defs>
        <svg:g [attr.filter]="'url(#' + ids + '-corte)'">
          @for (p of paths(); track p.ink) {
            <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
          }
        </svg:g>
      }
      @case ('ponto-cruz') {
        <svg:defs>
          <!-- o étamine: o bloquinho de trama entre os furos, e um furo em cada canto de ponto -->
          <svg:pattern [attr.id]="ids + '-pano'" width="1" height="1" patternUnits="userSpaceOnUse">
            <svg:rect width="1" height="1" fill="#e9dec4" />
            <svg:rect x=".15" y=".15" width=".7" height=".7" rx=".12" fill="#f7f0df" />
            <svg:path d="M.18 .5h.64M.5 .18v.64" stroke="#b3a27d" stroke-opacity=".28" stroke-width=".03" />
            @for (c of corners; track $index) {
              <svg:circle [attr.cx]="c[0]" [attr.cy]="c[1]" r=".1" fill="#5e4c2e" fill-opacity=".38" />
            }
          </svg:pattern>
          <!-- a linha: a perna de baixo mais escura onde a de cima não a cobre, e os fios de cada uma -->
          <svg:mask [attr.id]="ids + '-sem-cima'" maskUnits="userSpaceOnUse" x="0" y="0" width="1" height="1">
            <svg:rect width="1" height="1" fill="#fff" />
            <svg:path [attr.d]="stitch.front" fill="#000" />
          </svg:mask>
          <svg:clipPath [attr.id]="ids + '-baixo'"><svg:path [attr.d]="stitch.back" /></svg:clipPath>
          <svg:clipPath [attr.id]="ids + '-cima'"><svg:path [attr.d]="stitch.front" /></svg:clipPath>
          <svg:pattern [attr.id]="ids + '-fio'" width="1" height="1" patternUnits="userSpaceOnUse">
            <svg:g [attr.mask]="'url(#' + ids + '-sem-cima)'">
              <svg:path [attr.d]="stitch.back" fill="#000" fill-opacity=".2" stroke="#000" stroke-opacity=".16" stroke-width=".025" />
              <svg:g [attr.clip-path]="'url(#' + ids + '-baixo)'" fill="none">
                <svg:path d="M.04 .16L.84 .96" stroke="#fff" stroke-opacity=".28" stroke-width=".06" />
                <svg:path d="M.1 .1L.9 .9" stroke="#000" stroke-opacity=".18" stroke-width=".03" />
              </svg:g>
            </svg:g>
            <svg:path [attr.d]="stitch.front" fill="none" stroke="#000" stroke-opacity=".16" stroke-width=".025" />
            <svg:g [attr.clip-path]="'url(#' + ids + '-cima)'" fill="none">
              <svg:path d="M.83 .03L.03 .83" stroke="#fff" stroke-opacity=".38" stroke-width=".07" />
              <svg:path d="M.9 .1L.1 .9" stroke="#000" stroke-opacity=".2" stroke-width=".03" />
              <svg:path d="M.99 .19L.19 .99" stroke="#000" stroke-opacity=".14" stroke-width=".05" />
            </svg:g>
          </svg:pattern>
        </svg:defs>
        <svg:rect class="pano" [attr.x]="-pad()" [attr.y]="-pad()" [attr.width]="w() + pad() * 2" [attr.height]="h() + pad() * 2" rx=".12" [attr.fill]="'url(#' + ids + '-pano)'" />
        <!-- a sombra da linha no pano, um tico abaixo -->
        <svg:g class="linha-sombra" transform="translate(.03 .06)" fill="#3a2e1c" fill-opacity=".26">
          @for (p of arms().back; track p.ink) {
            <svg:path [attr.d]="p.d" />
          }
          @for (p of arms().front; track p.ink) {
            <svg:path [attr.d]="p.d" />
          }
        </svg:g>
        <svg:g class="linha">
          @for (p of arms().back; track p.ink) {
            <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
          }
          @for (p of arms().front; track p.ink) {
            <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
          }
        </svg:g>
        <svg:path class="luz" [attr.d]="area()" [attr.fill]="'url(#' + ids + '-fio)'" />
      }
      @case ('micanga') {
        <svg:defs>
          <!-- o plástico da conta: escuro na boca do furo, o brilho em volta dele puxado para o alto à esquerda, a beirada redonda -->
          <svg:radialGradient [attr.id]="ids + '-plastico'" cx=".5" cy=".5" [attr.r]="beadR" fx=".38" fy=".34" gradientUnits="userSpaceOnUse">
            <svg:stop offset=".3" stop-color="#000" stop-opacity=".16" />
            <svg:stop offset=".5" stop-color="#fff" stop-opacity=".34" />
            <svg:stop offset=".7" stop-color="#fff" stop-opacity="0" />
            <svg:stop offset=".88" stop-color="#000" stop-opacity=".06" />
            <svg:stop offset="1" stop-color="#000" stop-opacity=".3" />
          </svg:radialGradient>
          <svg:pattern [attr.id]="ids + '-conta'" width="1" height="1" patternUnits="userSpaceOnUse">
            <svg:path [attr.d]="bead" fill-rule="evenodd" [attr.fill]="'url(#' + ids + '-plastico)'" />
            <svg:circle cx=".5" cy=".5" [attr.r]="beadHole" fill="none" stroke="#000" stroke-opacity=".2" stroke-width=".035" />
          </svg:pattern>
        </svg:defs>
        <svg:g class="contas" fill-rule="evenodd">
          @for (p of paths(); track p.ink) {
            <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
          }
        </svg:g>
        <svg:path class="luz" [attr.d]="area()" [attr.fill]="'url(#' + ids + '-conta)'" />
      }
      @case ('voxel') {
        <svg:defs>
          <!-- a frente de cada cubinho: a aresta fininha e a luz que vem do alto à esquerda -->
          <svg:linearGradient [attr.id]="ids + '-face'" x1="0" y1="0" x2="1" y2="1">
            <svg:stop offset="0" stop-color="#fff" stop-opacity=".14" />
            <svg:stop offset="1" stop-color="#000" stop-opacity=".07" />
          </svg:linearGradient>
          <svg:pattern [attr.id]="ids + '-cubo'" width="1" height="1" patternUnits="userSpaceOnUse">
            <svg:rect width="1" height="1" [attr.fill]="'url(#' + ids + '-face)'" stroke="#000" stroke-opacity=".17" stroke-width=".07" />
          </svg:pattern>
        </svg:defs>
        @for (p of sides().tops; track p.ink) {
          <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
        }
        @for (p of sides().rights; track p.ink) {
          <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
        }
        <svg:path class="topo" [attr.d]="topsAll()" fill="#fff" fill-opacity=".38" stroke="#000" stroke-opacity=".14" stroke-width=".03" stroke-linejoin="round" />
        <svg:path class="lado" [attr.d]="rightsAll()" fill="#000" fill-opacity=".34" stroke="#000" stroke-opacity=".14" stroke-width=".03" stroke-linejoin="round" />
        @for (p of paths(); track p.ink) {
          <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
        }
        <svg:path class="luz" [attr.d]="area()" [attr.fill]="'url(#' + ids + '-cubo)'" />
      }
      @case ('blocos') {
        <svg:defs>
          <!-- o chanfro: claro em cima e à esquerda, escuro embaixo e à direita, e a fresta entre os blocos -->
          <svg:pattern [attr.id]="ids + '-bloco'" width="1" height="1" patternUnits="userSpaceOnUse">
            <svg:path d="M0 0h1l-.15 .15h-.7z" fill="#fff" fill-opacity=".5" />
            <svg:path d="M0 0l.15 .15v.7l-.15 .15z" fill="#fff" fill-opacity=".22" />
            <svg:path d="M1 0v1l-.15 -.15v-.7z" fill="#000" fill-opacity=".2" />
            <svg:path d="M0 1h1l-.15 -.15h-.7z" fill="#000" fill-opacity=".36" />
            <svg:rect x=".015" y=".015" width=".97" height=".97" fill="none" stroke="#000" stroke-opacity=".3" stroke-width=".03" />
          </svg:pattern>
        </svg:defs>
        @for (p of paths(); track p.ink) {
          <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
        }
        <svg:path class="luz" [attr.d]="area()" [attr.fill]="'url(#' + ids + '-bloco)'" />
      }
      @case ('lego') {
        <svg:defs>
          <!-- a pecinha: a fresta escura em volta, a quina clara em cima; o pino com a sombra para baixo e à direita e o brilho -->
          <svg:mask [attr.id]="ids + '-fora-pino'" maskUnits="userSpaceOnUse" x="0" y="0" width="1" height="1">
            <svg:rect width="1" height="1" fill="#fff" />
            <svg:circle cx=".5" cy=".5" r=".3" fill="#000" />
          </svg:mask>
          <svg:linearGradient [attr.id]="ids + '-pino'" x1="0" y1="0" x2="1" y2="1">
            <svg:stop offset=".2" stop-color="#fff" stop-opacity=".35" />
            <svg:stop offset=".55" stop-color="#fff" stop-opacity="0" />
            <svg:stop offset="1" stop-color="#000" stop-opacity=".18" />
          </svg:linearGradient>
          <svg:pattern [attr.id]="ids + '-peca'" width="1" height="1" patternUnits="userSpaceOnUse">
            <svg:path d="M0 0h1v1h-1zM.045 .045v.91h.91v-.91z" fill-rule="evenodd" fill="#000" fill-opacity=".38" />
            <svg:path d="M.045 .045h.91l-.03 .03h-.85v.85l-.03 .03z" fill="#fff" fill-opacity=".28" />
            <svg:circle cx=".545" cy=".57" r=".3" fill="#000" fill-opacity=".32" [attr.mask]="'url(#' + ids + '-fora-pino)'" />
            <svg:circle cx=".5" cy=".5" r=".3" [attr.fill]="'url(#' + ids + '-pino)'" />
            <svg:circle cx=".5" cy=".5" r=".285" fill="none" stroke="#000" stroke-opacity=".14" stroke-width=".03" />
            <svg:path d="M.3 .5a.2 .2 0 0 1 .2 -.2" fill="none" stroke="#fff" stroke-opacity=".55" stroke-width=".045" stroke-linecap="round" />
          </svg:pattern>
        </svg:defs>
        @for (p of paths(); track p.ink) {
          <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
        }
        <svg:path class="luz" [attr.d]="area()" [attr.fill]="'url(#' + ids + '-peca)'" />
      }
      @default {
        @for (p of paths(); track p.ink) {
          <svg:path [attr.d]="p.d" [attr.fill]="inks()[p.ink]" />
        }
      }
    }
  `,
})
export class PixelLookArt {
  /** As fileiras de pontos (ver core/pixel-art.ts). */
  readonly rows = input.required<readonly string[]>();
  readonly look = input.required<PixelLook>();
  /** As cores, do 0 (o transparente) em diante (`inkOf`). */
  readonly inks = input.required<readonly (string | null)[]>();
  /** A grade: o pano do ponto-cruz cobre ela inteira, não só os pontos. */
  readonly w = input.required<number>();
  readonly h = input.required<number>();

  protected readonly ids = 'pl-' + ++uid;
  protected readonly corners = [
    [0, 0],
    [1, 0],
    [0, 1],
    [1, 1],
  ];
  protected readonly stitch = { back: stitchBack(0, 0), front: stitchFront(0, 0) };
  protected readonly bead = beadPath(0, 0);
  protected readonly beadR = BEAD_R;
  protected readonly beadHole = BEAD_HOLE;

  protected readonly pad = computed(() => LOOK_PAD[this.look()]);
  protected readonly paths = computed(() => (this.look() === 'ponto-cruz' ? [] : inkPaths(this.rows(), this.look())));
  protected readonly area = computed(() => (this.look() === 'pixel' || this.look() === 'figurinha' ? '' : inkArea(this.rows())));
  protected readonly arms = computed(() => (this.look() === 'ponto-cruz' ? stitchArms(this.rows()) : { back: [], front: [] }));
  protected readonly sides = computed(() => (this.look() === 'voxel' ? voxelSides(this.rows()) : { tops: [], rights: [] }));
  protected readonly topsAll = computed(() => this.sides().tops.map((p) => p.d).join(''));
  protected readonly rightsAll = computed(() => this.sides().rights.map((p) => p.d).join(''));
}
