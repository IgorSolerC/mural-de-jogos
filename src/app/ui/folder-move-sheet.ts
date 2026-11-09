import { ChangeDetectionStrategy, Component, ElementRef, afterNextRender, input, output, viewChild } from '@angular/core';
import { FolderTree, NO_FOLDERS } from '../core/folders';
import { BackdropClose } from './backdrop-close';
import { FolderPicker } from './folder-picker';
import { ICON, IconModule } from './icons';
import { Pin } from './pin';

/**
 * Mover para outra pasta sem arrastar (PLANO-PASTAS.md, 4.7 e 4.8): o "Mover para pasta…" do menu de uma
 * anotação e o "Mover para…" do menu de uma pasta. A folha de papel com a árvore do grupo (a mesma escolha
 * do editor); tocar numa pasta escolhe e a folha fecha, e o escrito que não existe cria a pasta ali. Ela só
 * escolhe: quem abre move e cria.
 */
@Component({
  selector: 'app-folder-move-sheet',
  imports: [BackdropClose, FolderPicker, IconModule, Pin],
  changeDetection: ChangeDetectionStrategy.OnPush,
  template: `
    <dialog #dialog class="sheet ficha-lugar" aria-labelledby="mp-titulo" aria-describedby="mp-sub" (close)="closed.emit()" (backdropClose)="close()">
      <div class="ficha cartolina" [style.--stock]="'var(--stock-' + stock() + ')'" [attr.data-cor]="stock()">
        <app-pin class="pin" />
        <header class="head">
          <div class="titulos">
            <h2 id="mp-titulo">{{ title() }}</h2>
            <p class="sub" id="mp-sub"><lucide-icon [img]="FolderIcon" [size]="14" aria-hidden="true" />{{ sub() }}</p>
          </div>
          <button type="button" class="icon-btn fecha" aria-label="Fechar" (click)="close()">
            <lucide-icon [img]="CloseIcon" [size]="22" aria-hidden="true" />
          </button>
        </header>
        <div class="body">
          <app-folder-picker
            [value]="start()"
            (valueChange)="choose($event)"
            [tree]="tree()"
            [group]="group()"
            [groupName]="groupName()"
            [counts]="counts()"
            [blocked]="blocked()"
            [rootLabel]="rootLabel()"
            [label]="title()"
            (create)="create.emit($event)"
          />
        </div>
      </div>
    </dialog>
  `,
  styleUrl: './organize-sheet.scss',
})
export class FolderMoveSheet {
  /** "Mover Revolução Francesa" / "Mover a pasta Funcional". */
  readonly title = input.required<string>();
  /** A linha de baixo: onde está agora. */
  readonly sub = input('');
  readonly tree = input<FolderTree>(NO_FOLDERS);
  readonly group = input('');
  readonly groupName = input('Sem grupo');
  readonly counts = input<ReadonlyMap<string, number>>(new Map());
  /** Onde está agora (a escolha começa nela). */
  readonly start = input<string | null>(null);
  /** O que não se pode escolher (a pasta que se move e as de dentro). */
  readonly blocked = input<ReadonlySet<string>>(new Set());
  readonly rootLabel = input('Sem pasta');
  /** A cor do papel (a da anotação; a pasta, manilha). */
  readonly stock = input('branco');
  /** Escolheu (o id; null: a raiz do grupo). */
  readonly chosen = output<string | null>();
  readonly create = output<{ parent: string | null; name: string }>();
  readonly closed = output<void>();

  protected readonly CloseIcon = ICON.fechar;
  protected readonly FolderIcon = ICON.pastaDeNotas;
  private readonly dialog = viewChild.required<ElementRef<HTMLDialogElement>>('dialog');
  private readonly picker = viewChild(FolderPicker);

  constructor() {
    afterNextRender(() => {
      this.dialog().nativeElement.showModal();
      this.picker()?.focus();
    });
  }

  protected choose(id: string | null): void {
    this.chosen.emit(id);
    this.close();
  }

  close(): void {
    const el = this.dialog().nativeElement;
    if (el.open) el.close();
  }
}
