import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { brl } from '../core/spending';
import { PersonRef } from '../core/spending-quick';
import { SpendingStore } from '../core/spending-store';
import { SpendingPeoplePicker } from './spending-people-picker';

function render(refs: PersonRef[], amount: number | null = null) {
  const fixture = TestBed.createComponent(SpendingPeoplePicker);
  fixture.componentRef.setInput('refs', refs);
  fixture.componentRef.setInput('amount', amount);
  fixture.detectChanges();
  const emitted: PersonRef[][] = [];
  fixture.componentInstance.changed.subscribe((r) => emitted.push(r));
  return { fixture, emitted, boxes: () => [...fixture.nativeElement.querySelectorAll('.pessoa input')] as HTMLInputElement[] };
}

describe('Gastos: a cartela de com quem foi', () => {
  beforeEach(() => {
    localStorage.removeItem('meu-mural:gastos:v1');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('você primeiro, as do livro pelo nome e, no fim, a escrita agora; diz quanto dá para cada um', () => {
    const store = TestBed.inject(SpendingStore);
    const bruna = store.addPerson('Bruna');
    store.addPerson('Ana');
    const { fixture } = render(
      [
        { id: 'eu', name: 'Eu' },
        { id: bruna.id, name: 'Bruna' },
        { id: null, name: 'Biel' },
      ],
      60000,
    );
    const chips = [...fixture.nativeElement.querySelectorAll('.pessoa')] as HTMLElement[];
    expect(chips.map((c) => [c.textContent!.trim(), c.classList.contains('colada')])).toEqual([
      ['Eu', true],
      ['Ana', false],
      ['Bruna', true],
      ['Biel', true],
    ]);
    expect(fixture.nativeElement.querySelector('.conta').textContent).toContain(`${brl(20000)} para cada`);
  });

  it('pôr e tirar na ordem da cartela; a última que sobrou não sai', () => {
    const store = TestBed.inject(SpendingStore);
    const bruna = store.addPerson('Bruna');
    const one = render([{ id: bruna.id, name: 'Bruna' }]);
    expect(one.boxes()[1].disabled).toBeTrue();
    one.boxes()[0].click();
    expect(one.emitted.pop()).toEqual([
      { id: 'eu', name: 'Eu' },
      { id: bruna.id, name: 'Bruna' },
    ]);
    const input = one.fixture.nativeElement.querySelector('.nova input') as HTMLInputElement;
    input.value = 'Biel';
    (one.fixture.nativeElement.querySelector('.nova') as HTMLFormElement).dispatchEvent(new Event('submit'));
    expect(one.emitted.pop()!.map((r) => r.name)).toEqual(['Biel', 'Bruna']);
    expect(store.people().map((p) => p.name)).toEqual(['Eu', 'Biel', 'Bruna']);
  });
});
