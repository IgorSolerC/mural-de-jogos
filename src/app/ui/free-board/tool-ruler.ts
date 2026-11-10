import { ChangeDetectionStrategy, Component, input, output } from '@angular/core';
import { ICON, IconModule } from '../icons';
import { BoardEditor, Tool } from './board-editor';

/** O que a régua pede além das ferramentas: escolher uma anotação, imagens, um widget, ou ver os atalhos. */
export type RulerAsk = 'anotacao' | 'imagem' | 'widget' | 'atalhos';

/**
 * A régua das ferramentas do Quadro livre (PLANO-QUADRO-LIVRE.md, 4.4): um pedaço da régua de alumínio do
 * site, embaixo no meio, com as ferramentas impressas (a ligada com o traço de marca-texto, a regra do amarelo
 * de estado), desfazer e refazer, "Selecionar vários" no toque e o "?" dos atalhos. No celular, rola de lado.
 */
@Component({
  selector: 'app-free-board-tools',
  imports: [IconModule],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <div class="regua" role="toolbar" aria-label="Ferramentas do quadro">
      @for (t of tools; track t.id) {
        <button type="button" class="ferramenta" [attr.aria-pressed]="editor().tool() === t.id" [title]="t.label + ' (' + t.key + ')'" (click)="editor().tool.set(t.id)">
          <lucide-icon [img]="t.icon" [size]="20" aria-hidden="true" />
          <span class="nome">{{ t.label }}</span>
        </button>
      }
      @for (a of asks; track a.id) {
        <button type="button" class="ferramenta" aria-haspopup="dialog" [title]="a.label + ' (' + a.key + ')'" (click)="ask.emit(a.id)">
          <lucide-icon [img]="a.icon" [size]="20" aria-hidden="true" />
          <span class="nome">{{ a.label }}</span>
        </button>
      }
      <span class="picote" aria-hidden="true"></span>
      <button type="button" class="ferramenta so-toque" [attr.aria-pressed]="editor().multi()" title="Selecionar vários: arrastar no fundo faz a caixa" (click)="editor().multi.set(!editor().multi())">
        <lucide-icon [img]="Icons.varios" [size]="20" aria-hidden="true" />
        <span class="nome">Vários</span>
      </button>
      <button type="button" class="ferramenta icone" [disabled]="!editor().canUndo()" aria-label="Desfazer" title="Desfazer (Ctrl+Z)" (click)="editor().undo()">
        <lucide-icon [img]="Icons.desfazer" [size]="20" aria-hidden="true" />
      </button>
      <button type="button" class="ferramenta icone" [disabled]="!editor().canRedo()" aria-label="Refazer" title="Refazer (Ctrl+Shift+Z)" (click)="editor().redo()">
        <lucide-icon [img]="Icons.refazer" [size]="20" aria-hidden="true" />
      </button>
      <button type="button" class="ferramenta icone" aria-haspopup="dialog" aria-label="Atalhos" title="Atalhos (?)" (click)="ask.emit('atalhos')">
        <lucide-icon [img]="Icons.ajuda" [size]="20" aria-hidden="true" />
      </button>
    </div>
  `,
  styles: `
    :host {
      display: block;
      max-width: 100%;
    }
    .regua {
      display: flex;
      align-items: stretch;
      gap: 2px;
      max-width: 100%;
      padding: 3px;
      overflow-x: auto;
      scrollbar-width: none;
      border-radius: 4px;
      background: linear-gradient(to bottom, #b9b4ab, #9c978e 55%, #8b867d);
      box-shadow:
        inset 0 1px 0 rgb(255 255 255 / 0.4),
        inset 0 -2px 0 rgb(0 0 0 / 0.22),
        0 6px 10px -3px rgb(0 0 0 / 0.6);
    }
    .ferramenta {
      position: relative;
      isolation: isolate;
      flex: none;
      min-width: 52px;
      min-height: 46px;
      padding: 4px 8px 3px;
      display: inline-flex;
      flex-direction: column;
      align-items: center;
      justify-content: center;
      gap: 2px;
      border: 0;
      border-radius: 3px;
      background: transparent;
      color: var(--ink);
      font: 800 0.68rem / 1 var(--f-label);
      letter-spacing: 0.08em;
      text-transform: uppercase;
      cursor: pointer;
      transition: background-color var(--t-ui) var(--ease-ui);
    }
    .ferramenta.icone {
      min-width: 44px;
    }
    .ferramenta:hover:not(:disabled) {
      background: rgb(255 255 255 / 0.28);
    }
    .ferramenta:disabled {
      color: rgb(21 21 21 / 0.38);
      cursor: default;
    }
    .ferramenta:focus-visible {
      outline: 3px solid var(--focus);
      outline-offset: 1px;
    }
    /* a ligada: o traço de marca-texto embaixo do nome */
    .ferramenta[aria-pressed='true']::after {
      content: '';
      position: absolute;
      z-index: -1;
      inset: auto 6px 4px;
      height: 9px;
      background: var(--hi);
      -webkit-mask: var(--marca-passada) center / 100% 100% no-repeat;
      mask: var(--marca-passada) center / 100% 100% no-repeat;
    }
    .picote {
      flex: none;
      width: 1px;
      margin: 6px 4px;
      background: rgb(0 0 0 / 0.2);
    }
    /* "Selecionar vários" só no toque: no mouse, a caixa já é arrastar no fundo */
    .so-toque {
      display: none;
    }
    @media (hover: none) {
      .so-toque {
        display: inline-flex;
      }
    }
    @media (prefers-reduced-motion: reduce) {
      .ferramenta {
        transition: none;
      }
    }
  `,
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
