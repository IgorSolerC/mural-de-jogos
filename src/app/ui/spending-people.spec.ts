import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { brl } from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { SpendingPeople } from './spending-people';

function render(sums: [string, number][], selected: string | null = null) {
  const fixture = TestBed.createComponent(SpendingPeople);
  fixture.componentRef.setInput('sums', new Map(sums));
  fixture.componentRef.setInput('selected', selected);
  fixture.detectChanges();
  return fixture;
}

describe('Gastos: a peça Por pessoa', () => {
  beforeEach(() => {
    localStorage.removeItem('meu-mural:gastos:v1');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('uma linha por pessoa com gasto, a maior primeiro, com o nome do livro', () => {
    const store = TestBed.inject(SpendingStore);
    const bruna = store.addPerson('Bruna');
    const f = render([
      ['eu', 15000],
      [bruna.id, 19000],
      ['sumiu', 0],
    ]);
    const lines = [...f.nativeElement.querySelectorAll('.linha')] as HTMLButtonElement[];
    expect(lines.map((b) => b.getAttribute('aria-label'))).toEqual([`Bruna: ${brl(19000)}, 56% do que saiu`, `Eu: ${brl(15000)}, 44% do que saiu`]);
    expect(lines.map((b) => b.querySelector('.parte')!.textContent!.trim())).toEqual(['56%', '44%']);
    const bars = [...f.nativeElement.querySelectorAll('.traco')] as HTMLElement[];
    expect(parseFloat(bars[0].style.width)).toBe(100);
    expect(parseFloat(bars[1].style.width)).toBeCloseTo((15000 / 19000) * 100, 2);
  });

  it('tocar escolhe a pessoa para a fita; tocar na escolhida tira a escolha', () => {
    const f = render(
      [
        ['eu', 100],
        ['b', 50],
      ],
      'eu',
    );
    const picked: (string | null)[] = [];
    f.componentInstance.pick.subscribe((p) => picked.push(p));
    const lines = [...f.nativeElement.querySelectorAll('.linha')] as HTMLButtonElement[];
    expect(lines[0].getAttribute('aria-pressed')).toBe('true');
    lines[0].click();
    lines[1].click();
    expect(picked).toEqual([null, 'b']);
  });
});
