import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { ColumnWheel } from './column-wheel';

@Component({
  imports: [ColumnWheel],
  template: `
    <section class="coluna">
      <header class="etiqueta" appColumnWheel>A fazer</header>
      <div class="rolo" style="height: 100px; overflow-y: auto">
        <div style="height: 400px"></div>
      </div>
      <div class="adicionar" appColumnWheel>Adicionar nota</div>
    </section>
  `,
})
class Host {}

describe('a roda do mouse na etiqueta e no pé da coluna', () => {
  function setup() {
    TestBed.configureTestingModule({ imports: [Host], providers: [provideZonelessChangeDetection()] });
    const fixture = TestBed.createComponent(Host);
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    TestBed.tick();
    const el = fixture.nativeElement as HTMLElement;
    const list = el.querySelector<HTMLElement>('.rolo')!;
    const spin = (target: string, init: WheelEventInit) => {
      const e = new WheelEvent('wheel', { bubbles: true, cancelable: true, ...init });
      el.querySelector(target)!.dispatchEvent(e);
      return e;
    };
    return { fixture, list, spin };
  }

  afterEach(() => document.querySelectorAll('section.coluna').forEach((s) => s.parentElement?.remove()));

  it('rola a lista da coluna, e não a página', () => {
    const { list, spin } = setup();
    const e = spin('.etiqueta', { deltaY: 30 });
    expect(e.defaultPrevented).toBeTrue();
    expect(list.scrollTop).toBe(30);
    spin('.adicionar', { deltaY: -12 });
    expect(list.scrollTop).toBe(18);
  });

  it('para no pé da lista, sem passar a rolar a página', () => {
    const { list, spin } = setup();
    // em linhas, como a roda do Firefox: 40px cada
    for (let i = 0; i < 9; i++) spin('.adicionar', { deltaY: 1, deltaMode: 1 });
    expect(list.scrollTop).toBe(300);
    expect(spin('.adicionar', { deltaY: 1, deltaMode: 1 }).defaultPrevented).toBeTrue();
    expect(list.scrollTop).toBe(300);
  });

  it('deixa passar o zoom (Ctrl), o Shift e o gesto de lado, que são do navegador e do quadro', () => {
    const { list, spin } = setup();
    expect(spin('.etiqueta', { deltaY: 30, ctrlKey: true }).defaultPrevented).toBeFalse();
    expect(spin('.etiqueta', { deltaY: 30, shiftKey: true }).defaultPrevented).toBeFalse();
    expect(spin('.etiqueta', { deltaX: 40, deltaY: 5 }).defaultPrevented).toBeFalse();
    expect(list.scrollTop).toBe(0);
  });
});
