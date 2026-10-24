import { ChangeDetectionStrategy, Component, computed, input } from '@angular/core';
import { CARTELA_DE_ICONES, type IdDoIcone } from '../../../../shared/cartela-de-icones';

type Elemento = readonly ['path', { readonly d: string }] | readonly ['circle', { readonly cx: number; readonly cy: number; readonly r: number }] | readonly ['rect', { readonly x: number; readonly y: number; readonly width: number; readonly height: number; readonly rx: number }];

/**
 * Os desenhos do cofre, copiados dos ícones Lucide (os mesmos traços do acervo do Murall), 24×24 com
 * traço de 2px. Ficam aqui, em dados, porque o cofre não importa nada de fora (nem o lucide-angular) e
 * não monta HTML a partir de texto.
 */
export const ICONES = {
  copiar: [
    ['rect', { x: 8, y: 8, width: 14, height: 14, rx: 2 }],
    ['path', { d: 'M4 16c-1.1 0-2-.9-2-2V4c0-1.1.9-2 2-2h10c1.1 0 2 .9 2 2' }],
  ],
  pessoa: [
    ['path', { d: 'M19 21v-2a4 4 0 0 0-4-4H9a4 4 0 0 0-4 4v2' }],
    ['circle', { cx: 12, cy: 7, r: 4 }],
  ],
  chave: [
    ['path', { d: 'M2.586 17.414A2 2 0 0 0 2 18.828V21a1 1 0 0 0 1 1h3a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h1a1 1 0 0 0 1-1v-1a1 1 0 0 1 1-1h.172a2 2 0 0 0 1.414-.586l.814-.814a6.5 6.5 0 1 0-4-4z' }],
    ['circle', { cx: 16.5, cy: 7.5, r: 0.5 }],
  ],
  olho: [
    ['path', { d: 'M2.062 12.348a1 1 0 0 1 0-.696 10.75 10.75 0 0 1 19.876 0 1 1 0 0 1 0 .696 10.75 10.75 0 0 1-19.876 0' }],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  'olho-fechado': [
    ['path', { d: 'M10.733 5.076a10.744 10.744 0 0 1 11.205 6.575 1 1 0 0 1 0 .696 10.747 10.747 0 0 1-1.444 2.49' }],
    ['path', { d: 'M14.084 14.158a3 3 0 0 1-4.242-4.242' }],
    ['path', { d: 'M17.479 17.499a10.75 10.75 0 0 1-15.417-5.151 1 1 0 0 1 0-.696 10.75 10.75 0 0 1 4.446-5.143' }],
    ['path', { d: 'm2 2 20 20' }],
  ],
  abrir: [
    ['path', { d: 'M15 3h6v6' }],
    ['path', { d: 'M10 14 21 3' }],
    ['path', { d: 'M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6' }],
  ],
  ajustes: [
    [
      'path',
      {
        d: 'M12.22 2h-.44a2 2 0 0 0-2 2v.18a2 2 0 0 1-1 1.73l-.43.25a2 2 0 0 1-2 0l-.15-.08a2 2 0 0 0-2.73.73l-.22.38a2 2 0 0 0 .73 2.73l.15.1a2 2 0 0 1 1 1.72v.51a2 2 0 0 1-1 1.74l-.15.09a2 2 0 0 0-.73 2.73l.22.38a2 2 0 0 0 2.73.73l.15-.08a2 2 0 0 1 2 0l.43.25a2 2 0 0 1 1 1.73V20a2 2 0 0 0 2 2h.44a2 2 0 0 0 2-2v-.18a2 2 0 0 1 1-1.73l.43-.25a2 2 0 0 1 2 0l.15.08a2 2 0 0 0 2.73-.73l.22-.39a2 2 0 0 0-.73-2.73l-.15-.08a2 2 0 0 1-1-1.74v-.5a2 2 0 0 1 1-1.74l.15-.09a2 2 0 0 0 .73-2.73l-.22-.38a2 2 0 0 0-2.73-.73l-.15.08a2 2 0 0 1-2 0l-.43-.25a2 2 0 0 1-1-1.73V4a2 2 0 0 0-2-2z',
      },
    ],
    ['circle', { cx: 12, cy: 12, r: 3 }],
  ],
  cadeado: [
    ['rect', { x: 3, y: 11, width: 18, height: 11, rx: 2 }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 10 0v4' }],
  ],
  'cadeado-aberto': [
    ['rect', { x: 3, y: 11, width: 18, height: 11, rx: 2 }],
    ['path', { d: 'M7 11V7a5 5 0 0 1 9.9-1' }],
  ],
  mais: [
    ['path', { d: 'M5 12h14' }],
    ['path', { d: 'M12 5v14' }],
  ],
  busca: [
    ['circle', { cx: 11, cy: 11, r: 8 }],
    ['path', { d: 'm21 21-4.3-4.3' }],
  ],
  voltar: [['path', { d: 'm15 18-6-6 6-6' }]],
  avancar: [['path', { d: 'm9 18 6-6-6-6' }]],
  pasta: [['path', { d: 'M20 20a2 2 0 0 0 2-2V8a2 2 0 0 0-2-2h-7.9a2 2 0 0 1-1.69-.9L9.6 3.9A2 2 0 0 0 7.93 3H4a2 2 0 0 0-2 2v13a2 2 0 0 0 2 2Z' }]],
  'pasta-aberta': [['path', { d: 'm6 14 1.5-2.9A2 2 0 0 1 9.24 10H20a2 2 0 0 1 1.94 2.5l-1.54 6a2 2 0 0 1-1.95 1.5H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h3.9a2 2 0 0 1 1.69.9l.81 1.2a2 2 0 0 0 1.67.9H18a2 2 0 0 1 2 2v2' }]],
  lixeira: [
    ['path', { d: 'M3 6h18' }],
    ['path', { d: 'M19 6v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6' }],
    ['path', { d: 'M8 6V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2' }],
  ],
  feito: [['path', { d: 'M20 6 9 17l-5-5' }]],
  celular: [
    ['rect', { x: 5, y: 2, width: 14, height: 20, rx: 2 }],
    ['path', { d: 'M12 18h.01' }],
  ],
  tela: [
    ['rect', { x: 2, y: 3, width: 20, height: 14, rx: 2 }],
    ['path', { d: 'M8 21h8' }],
    ['path', { d: 'M12 17v4' }],
  ],
  boia: [
    ['circle', { cx: 12, cy: 12, r: 10 }],
    ['path', { d: 'm4.93 4.93 4.24 4.24' }],
    ['path', { d: 'm14.83 9.17 4.24-4.24' }],
    ['path', { d: 'm14.83 14.83 4.24 4.24' }],
    ['path', { d: 'm9.17 14.83-4.24 4.24' }],
    ['circle', { cx: 12, cy: 12, r: 4 }],
  ],
  escudo: [
    ['path', { d: 'M20 13c0 5-3.5 7.5-7.66 8.95a1 1 0 0 1-.67-.01C7.5 20.5 4 18 4 13V6a1 1 0 0 1 1-1c2 0 4.5-1.2 6.24-2.72a1.17 1.17 0 0 1 1.52 0C14.51 3.81 17 5 19 5a1 1 0 0 1 1 1z' }],
    ['path', { d: 'M12 8v4' }],
    ['path', { d: 'M12 16h.01' }],
  ],
  historico: [
    ['path', { d: 'M3 12a9 9 0 1 0 9-9 9.75 9.75 0 0 0-6.74 2.74L3 8' }],
    ['path', { d: 'M3 3v5h5' }],
    ['path', { d: 'M12 7v5l4 2' }],
  ],
  perigo: [
    ['path', { d: 'm21.73 18-8-14a2 2 0 0 0-3.48 0l-8 14A2 2 0 0 0 4 21h16a2 2 0 0 0 1.73-3' }],
    ['path', { d: 'M12 9v4' }],
    ['path', { d: 'M12 17h.01' }],
  ],
  lapis: [
    ['path', { d: 'M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z' }],
    ['path', { d: 'm15 5 4 4' }],
  ],
  outra: [
    ['path', { d: 'M3 12a9 9 0 0 1 9-9 9.75 9.75 0 0 1 6.74 2.74L21 8' }],
    ['path', { d: 'M21 3v5h-5' }],
    ['path', { d: 'M21 12a9 9 0 0 1-9 9 9.75 9.75 0 0 1-6.74-2.74L3 16' }],
    ['path', { d: 'M8 16H3v5' }],
  ],
  gerar: [
    [
      'path',
      {
        d: 'M9.937 15.5A2 2 0 0 0 8.5 14.063l-6.135-1.582a.5.5 0 0 1 0-.962L8.5 9.936A2 2 0 0 0 9.937 8.5l1.582-6.135a.5.5 0 0 1 .963 0L14.063 8.5A2 2 0 0 0 15.5 9.937l6.135 1.581a.5.5 0 0 1 0 .964L15.5 14.063a2 2 0 0 0-1.437 1.437l-1.582 6.135a.5.5 0 0 1-.963 0z',
      },
    ],
  ],
  letras: [
    ['path', { d: 'M4 7V4h16v3' }],
    ['path', { d: 'M9 20h6' }],
    ['path', { d: 'M12 4v16' }],
  ],
  desfazer: [
    ['path', { d: 'M9 14 4 9l5-5' }],
    ['path', { d: 'M4 9h10.5a5.5 5.5 0 0 1 5.5 5.5a5.5 5.5 0 0 1-5.5 5.5H11' }],
  ],
  fechar: [
    ['path', { d: 'M18 6 6 18' }],
    ['path', { d: 'm6 6 12 12' }],
  ],
  imprimir: [
    ['path', { d: 'M6 18H4a2 2 0 0 1-2-2v-5a2 2 0 0 1 2-2h16a2 2 0 0 1 2 2v5a2 2 0 0 1-2 2h-2' }],
    ['path', { d: 'M6 9V3a1 1 0 0 1 1-1h10a1 1 0 0 1 1 1v6' }],
    ['rect', { x: 6, y: 14, width: 12, height: 8, rx: 1 }],
  ],
} as const satisfies Record<string, readonly Elemento[]>;

export type NomeDoIcone = keyof typeof ICONES;

/**
 * Um ícone do cofre: `<cofre-icone nome="copiar" />`, ou um da cartela do site, que a pessoa escolhe
 * para uma senha ou um grupo: `<cofre-icone [cartela]="'foguete'" />`. Sempre decorativo (o botão em
 * volta tem o nome).
 */
@Component({
  selector: 'cofre-icone',
  changeDetection: ChangeDetectionStrategy.OnPush,
  host: { 'aria-hidden': 'true' },
  template: `
    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" focusable="false">
      @for (e of desenho(); track $index) {
        @switch (e[0]) {
          @case ('path') {
            <path [attr.d]="$any(e[1]).d" />
          }
          @case ('circle') {
            <circle [attr.cx]="$any(e[1]).cx" [attr.cy]="$any(e[1]).cy" [attr.r]="$any(e[1]).r" />
          }
          @case ('rect') {
            <rect [attr.x]="$any(e[1]).x" [attr.y]="$any(e[1]).y" [attr.width]="$any(e[1]).width" [attr.height]="$any(e[1]).height" [attr.rx]="$any(e[1]).rx" [attr.ry]="$any(e[1]).ry" />
          }
          @case ('line') {
            <line [attr.x1]="$any(e[1]).x1" [attr.y1]="$any(e[1]).y1" [attr.x2]="$any(e[1]).x2" [attr.y2]="$any(e[1]).y2" />
          }
          @case ('polyline') {
            <polyline [attr.points]="$any(e[1]).points" />
          }
          @case ('polygon') {
            <polygon [attr.points]="$any(e[1]).points" />
          }
          @case ('ellipse') {
            <ellipse [attr.cx]="$any(e[1]).cx" [attr.cy]="$any(e[1]).cy" [attr.rx]="$any(e[1]).rx" [attr.ry]="$any(e[1]).ry" />
          }
        }
      }
    </svg>
  `,
  styles: `
    :host {
      display: inline-flex;
      flex: none;
      width: 20px;
      height: 20px;
    }
    svg {
      width: 100%;
      height: 100%;
    }
  `,
})
export class Icone {
  readonly nome = input<NomeDoIcone | null>(null);
  readonly cartela = input<IdDoIcone | null>(null);
  protected readonly desenho = computed<readonly (readonly [string, object])[]>(() => {
    const id = this.cartela();
    if (id) return CARTELA_DE_ICONES.find((i) => i.id === id)?.desenho ?? [];
    const nome = this.nome();
    return nome ? ICONES[nome] : [];
  });
}
