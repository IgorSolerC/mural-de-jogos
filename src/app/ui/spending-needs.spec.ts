import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Need, brl } from '../core/spending';
import { SpendingNeeds } from './spending-needs';

function render(sums: [Need | null, number][], selected?: Need | null, counts?: [Need | null, number][]) {
  const fixture = TestBed.createComponent(SpendingNeeds);
  fixture.componentRef.setInput('sums', new Map(sums));
  if (counts) fixture.componentRef.setInput('counts', new Map(counts));
  if (selected !== undefined) fixture.componentRef.setInput('selected', selected);
  fixture.detectChanges();
  return fixture;
}

describe('Gastos: a peça Precisava?', () => {
  beforeEach(() => TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] }));

  it('uma linha por resposta, com o valor e a parte do que saiu; a dos sem resposta só quando há', () => {
    const f = render([
      ['luxo', 10000],
      ['conforto', 30000],
      ['indispensavel', 60000],
    ]);
    const lines = [...f.nativeElement.querySelectorAll('.linha')] as HTMLButtonElement[];
    expect(lines.map((b) => b.getAttribute('aria-label'))).toEqual([
      `Luxo: ${brl(10000)}, 10% do que saiu`,
      `Conforto: ${brl(30000)}, 30% do que saiu`,
      `Indispensável: ${brl(60000)}, 60% do que saiu`,
    ]);
    expect(f.nativeElement.querySelector('.nota')).toBeNull();
    expect(f.nativeElement.querySelector('.conta').textContent.trim()).toBe(`${brl(40000)} foram luxo ou conforto (40% do que saiu).`);
  });

  it('nada marcado ainda: as respostas zeradas não se tocam, e a nota diz como marcar', () => {
    const f = render([[null, 4490]]);
    const lines = [...f.nativeElement.querySelectorAll('.linha')] as HTMLButtonElement[];
    expect(lines.map((b) => b.disabled)).toEqual([true, true, true, false]);
    expect(lines[3].textContent).toContain('Sem resposta');
    expect(f.nativeElement.querySelector('.nota').textContent).toContain('#luxo');
    expect(f.nativeElement.querySelector('.conta')).toBeNull();
  });

  it('tocar escolhe a resposta para a fita; tocar na escolhida tira a escolha', () => {
    const f = render([['conforto', 30000], [null, 100]], 'conforto');
    const picked: (Need | null | undefined)[] = [];
    f.componentInstance.pick.subscribe((n) => picked.push(n));
    const lines = [...f.nativeElement.querySelectorAll('.linha')] as HTMLButtonElement[];
    expect(lines[1].getAttribute('aria-pressed')).toBe('true');
    lines[1].click();
    lines[3].click();
    expect(picked).toEqual([undefined, null]);
  });

  it('com as contas: a segunda régua, pela quantidade de gastos, e quantos em cada linha', () => {
    const f = render(
      [
        ['luxo', 10000],
        ['indispensavel', 90000],
      ],
      undefined,
      [
        ['luxo', 6],
        ['indispensavel', 2],
      ],
    );
    expect([...f.nativeElement.querySelectorAll('.regua-nome')].map((e: Element) => e.textContent!.trim())).toEqual(['Valor', 'Quantidade']);
    const reguas = [...f.nativeElement.querySelectorAll('.regua')] as HTMLElement[];
    const grow = (r: HTMLElement) => [...r.querySelectorAll<HTMLElement>('.pedaco')].map((p) => [p.dataset['need'], Number(p.style.flexGrow)]);
    expect(grow(reguas[0])).toEqual([
      ['luxo', 0.1],
      ['indispensavel', 0.9],
    ]);
    expect(grow(reguas[1])).toEqual([
      ['luxo', 0.75],
      ['indispensavel', 0.25],
    ]);
    const lines = [...f.nativeElement.querySelectorAll('.linha')] as HTMLButtonElement[];
    expect(lines[0].getAttribute('aria-label')).toBe(`Luxo: ${brl(10000)}, 10% do que saiu, 6 gastos`);
    expect(lines[0].querySelector('.vezes')!.textContent!.trim()).toBe('6 gastos');
  });
});
