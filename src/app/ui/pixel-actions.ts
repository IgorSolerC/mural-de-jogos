import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ICON, IconModule } from './icons';

/**
 * A etiqueta de hover de uma obra da galeria de pixel arts (PLANO-PIXEL-ARTS.md, 3), no padrão do Finalizar e do
 * Fixar (`ui/_etiqueta-acoes.scss`): Ateliê (a paleta, amarela na mão: abre o desenho direto no ateliê) e Baixar
 * (a seta, azul na mão: o PNG nítido). A mesma peça na Mostra e na Grade; quem usa decide onde ela fica (acima da
 * obra com o mouse; no pé, sem mouse) e a mostra com a mão em cima (`app-pixel-piece` e `app-pixel-tile`).
 */
@Component({
  selector: 'app-pixel-actions',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="acoes">
      <button type="button" class="botao atelie" [attr.aria-label]="'Abrir ' + title() + ' no ateliê'" title="Abrir no ateliê" (click)="atelie.emit()">
        <lucide-icon [img]="BrushIcon" [size]="16" aria-hidden="true" />
      </button>
      <button type="button" class="botao baixar" [attr.aria-label]="'Baixar ' + title() + ' em PNG'" title="Baixar em PNG" (click)="download.emit()">
        <lucide-icon [img]="DownloadIcon" [size]="16" aria-hidden="true" />
      </button>
    </div>
  `,
  styles: `
    @use 'etiqueta-acoes' as et;

    :host {
      display: block;
    }
    .acoes {
      @include et.grupo;
    }
    .botao {
      @include et.botao;
    }
    .atelie {
      @include et.cor-na-mao(var(--etiqueta-amarelo));
    }
    .baixar {
      @include et.cor-na-mao(var(--etiqueta-azul));
    }
    :host-context(app-pixel-piece:hover) .botao,
    :host-context(app-pixel-tile:hover) .botao,
    .acoes:has(:focus-visible) .botao {
      @include et.mostra;
    }
  `,
})
export class PixelActions {
  /** O nome da obra, para o que o leitor de tela ouve. */
  readonly title = input.required<string>();
  /** Abrir no ateliê. */
  readonly atelie = output<void>();
  /** Baixar o PNG. */
  readonly download = output<void>();

  protected readonly BrushIcon = ICON.paleta;
  protected readonly DownloadIcon = ICON.baixar;
}
