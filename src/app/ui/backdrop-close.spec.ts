import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { BackdropClose } from './backdrop-close';

@Component({
  imports: [BackdropClose],
  template: `<dialog (backdropClose)="closed = closed + 1"><p>o cartão</p></dialog>`,
})
class Host {
  closed = 0;
}

describe('o clique no fundo da folha', () => {
  it('fecha só quando o clique começa e termina no fundo', () => {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    fixture.detectChanges();
    const dialog = fixture.nativeElement.querySelector('dialog') as HTMLDialogElement;
    const card = dialog.querySelector('p')!;
    const press = (down: Element, up: Element) => {
      down.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
      up.dispatchEvent(new MouseEvent('click', { bubbles: true }));
    };
    press(dialog, dialog);
    expect(fixture.componentInstance.closed).toBe(1);
    // selecionou um texto no cartão e soltou fora: não fecha
    press(card, dialog);
    expect(fixture.componentInstance.closed).toBe(1);
    // e o clique dentro do cartão também não
    press(card, card);
    expect(fixture.componentInstance.closed).toBe(1);
  });
});
