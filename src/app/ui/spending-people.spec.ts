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

  it('quem tem menos de 5% (dois ou mais) vai para Outros, que abre e recolhe; a escolhida fica à mostra', () => {
    const f = render(
      [
        ['eu', 90000],
        ['a', 6000],
        ['b', 2000],
        ['c', 1000],
        ['d', 1000],
      ],
      'c',
    );
    const names = () => [...f.nativeElement.querySelectorAll('.linha .nome')].map((n: Element) => n.textContent!.replace(/\s+/g, ' ').trim());
    expect(names()).toEqual(['Alguém', 'Alguém', 'Alguém', 'Outros 2'].map((n, i) => (i === 0 ? 'Eu' : n)));
    const outros = f.nativeElement.querySelector('.outros') as HTMLButtonElement;
    expect(outros.querySelector('.quanto')!.textContent!.trim()).toBe(brl(3000));
    expect(outros.querySelector('.parte')!.textContent!.trim()).toBe('3%');
    outros.click();
    f.detectChanges();
    expect(names().length).toBe(5);
    expect(f.nativeElement.querySelector('.outros')).toBeNull();
    (f.nativeElement.querySelector('.recolher button') as HTMLButtonElement).click();
    f.detectChanges();
    expect(names().length).toBe(4);
  });

  it('um só pequeno não vira Outros', () => {
    const f = render([
      ['eu', 97000],
      ['a', 3000],
    ]);
    expect(f.nativeElement.querySelector('.outros')).toBeNull();
    expect(f.nativeElement.querySelectorAll('.linha').length).toBe(2);
  });
});
