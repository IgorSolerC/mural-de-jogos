import { Component, ElementRef, inject, provideZonelessChangeDetection, signal } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { closeOnOutsidePress } from './outside-press';

@Component({ selector: 'app-teste-fora', template: `<button type="button" class="dentro">dentro</button>` })
class Menu {
  readonly open = signal(false);
  constructor() {
    closeOnOutsidePress(this.open, inject<ElementRef<HTMLElement>>(ElementRef), () => this.open.set(false));
  }
}

describe('closeOnOutsidePress', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('fecha ao apertar fora, não ao apertar dentro, e só ouve a página aberto', async () => {
    const add = spyOn(document, 'addEventListener').and.callThrough();
    const fixture = TestBed.createComponent(Menu);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    expect(add.calls.allArgs().some(([t]) => t === 'pointerdown')).toBeFalse();

    fixture.componentInstance.open.set(true);
    await fixture.whenStable();
    (fixture.nativeElement as HTMLElement).querySelector('.dentro')!.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(fixture.componentInstance.open()).toBeTrue();

    document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true }));
    expect(fixture.componentInstance.open()).toBeFalse();

    const remove = spyOn(document, 'removeEventListener').and.callThrough();
    await fixture.whenStable();
    expect(remove.calls.allArgs().some(([t]) => t === 'pointerdown')).toBeTrue();
    fixture.destroy();
  });
});
