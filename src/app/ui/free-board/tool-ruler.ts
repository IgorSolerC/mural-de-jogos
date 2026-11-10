import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ICON, IconModule } from '../icons';
import { BoardEditor, Tool } from './board-editor';

/** O que a régua pede além das ferramentas: escolher uma anotação, imagens, um widget, ou ver os atalhos. */
export type RulerAsk = 'anotacao' | 'imagem' | 'widget' | 'atalhos';

/**
 * A régua das ferramentas do Quadro livre (PLANO-QUADRO-LIVRE.md, 4.4), embaixo no meio: cada ferramenta é
 * uma etiqueta de tinta, a peça dos botões do site (ui/_etiqueta-acoes.scss), em três grupos: o que a mão faz
 * (a ligada fica amarela, a regra do amarelo de estado), o que se põe no quadro, e "Selecionar vários" no
 * toque, desfazer, refazer e o "?" dos atalhos.
 */
@Component({
  selector: 'app-free-board-tools',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="regua" role="toolbar" aria-label="Ferramentas do quadro">
      <div class="grupo modos">
        @for (t of tools; track t.id) {
          <button type="button" class="ferramenta modo" [attr.aria-pressed]="editor().tool() === t.id" [title]="t.label + ' (' + t.key + ')'" (click)="editor().tool.set(t.id)">
            <lucide-icon [img]="t.icon" [size]="20" aria-hidden="true" />
            <span class="nome">{{ t.label }}</span>
          </button>
        }
      </div>
      <div class="grupo por">
        @for (a of asks; track a.id) {
          <button type="button" class="ferramenta por" aria-haspopup="dialog" [title]="a.label + ' (' + a.key + ')'" (click)="ask.emit(a.id)">
            <lucide-icon [img]="a.icon" [size]="20" aria-hidden="true" />
            <span class="nome">{{ a.label }}</span>
          </button>
        }
      </div>
      <div class="grupo historia">
        <button type="button" class="ferramenta modo so-toque" [attr.aria-pressed]="editor().multi()" title="Selecionar vários: arrastar no fundo faz a caixa" (click)="editor().multi.set(!editor().multi())">
          <lucide-icon [img]="Icons.varios" [size]="20" aria-hidden="true" />
          <span class="nome">Vários</span>
        </button>
        <button type="button" class="ferramenta icone" [disabled]="!editor().canUndo()" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" (click)="editor().undo()">
          <lucide-icon [img]="Icons.desfazer" [size]="20" aria-hidden="true" />
        </button>
        <button type="button" class="ferramenta icone" [disabled]="!editor().canRedo()" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" (click)="editor().redo()">
          <lucide-icon [img]="Icons.refazer" [size]="20" aria-hidden="true" />
        </button>
        <button type="button" class="ferramenta icone ajuda" aria-haspopup="dialog" aria-label="Atalhos" title="Atalhos (?)" (click)="ask.emit('atalhos')">
          <lucide-icon [img]="Icons.ajuda" [size]="20" aria-hidden="true" />
        </button>
      </div>
    </div>
  `,
  styleUrl: './tool-ruler.scss',
})
export class FreeBoardTools {
  readonly editor = input.required<BoardEditor>();
  readonly ask = output<RulerAsk>();

  protected readonly Icons = { varios: ICON.semDesenho, desfazer: ICON.desfazer, refazer: ICON.refazer, ajuda: ICON.ajuda };
  protected readonly tools: readonly { id: Tool; label: string; key: string; icon: (typeof ICON)[keyof typeof ICON] }[] = [
    { id: 'selecionar', label: 'Selecionar', key: 'V', icon: ICON.ponteiro },
    { id: 'moldura', label: 'Moldura', key: 'M', icon: ICON.moldura },
    { id: 'texto', label: 'Texto', key: 'T', icon: ICON.letra },
  ];
  protected readonly asks: readonly { id: RulerAsk; label: string; key: string; icon: (typeof ICON)[keyof typeof ICON] }[] = [
    { id: 'anotacao', label: 'Anotação', key: 'N', icon: ICON.anotacoes },
    { id: 'imagem', label: 'Imagem', key: 'I', icon: ICON.imagem },
    { id: 'widget', label: 'Widget', key: 'W', icon: ICON.widgets },
  ];
}
