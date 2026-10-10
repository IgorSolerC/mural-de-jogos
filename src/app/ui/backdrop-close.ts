import { Directive, output } from '@angular/core';

/**
 * O clique no fundo de um `<dialog>` (fora do cartão), para fechar a folha: `(backdropClose)="close()"`.
 * Só vale o clique que começou no fundo: selecionar um texto e soltar fora do cartão não fecha.
 */
@Directive({
  selector: '[backdropClose]',
  host: { '(pointerdown)': 'down($event)', '(click)': 'click($event)' },
})
export class BackdropClose {
  readonly backdropClose = output<void>();
  private downOnBackdrop = false;

  // sem devolver nada: um handler que devolve false ganha preventDefault do Angular, e o campo clicado não recebe o foco
  protected down(e: PointerEvent): void {
    this.downOnBackdrop = e.target === e.currentTarget;
  }

  protected click(e: MouseEvent): void {
    if (e.target === e.currentTarget && this.downOnBackdrop) this.backdropClose.emit();
  }
}
