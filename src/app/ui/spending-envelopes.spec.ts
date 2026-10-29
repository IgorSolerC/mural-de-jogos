import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Entry, openPlans } from '../core/spending';
import { SpendingEnvelopes } from './spending-envelopes';
import { SpendingPlans } from './spending-plans';

describe('Gastos: os envelopes e os carnês', () => {
  beforeEach(() => {
    localStorage.removeItem('meu-mural:gastos:v1');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('"Sem categoria" escolhe as categorias que sumiram do livro, e tocar de novo tira a escolha', () => {
    const f = TestBed.createComponent(SpendingEnvelopes);
    f.componentRef.setInput('sums', [
      { id: 'comida', amount: 5000 },
      { id: 'sumiu-b', amount: 3000 },
      { id: 'sumiu-a', amount: 1000 },
    ]);
    f.detectChanges();
    const picked: (readonly string[] | null)[] = [];
    f.componentInstance.pick.subscribe((p) => picked.push(p));
    const orphan = () => ([...f.nativeElement.querySelectorAll('.envelope')] as HTMLButtonElement[]).find((b) => b.getAttribute('aria-label')!.startsWith('Sem categoria'))!;
    expect(orphan().getAttribute('aria-pressed')).toBe('false');
    orphan().click();
    expect(picked).toEqual([['sumiu-a', 'sumiu-b']]);
    f.componentRef.setInput('selected', ['sumiu-b', 'sumiu-a']);
    f.detectChanges();
    expect(orphan().getAttribute('aria-pressed')).toBe('true');
    orphan().click();
    expect(picked[1]).toBeNull();
  });

  it('o carnê que ainda vai começar não marca parcela neste mês nem entra no "/mês"', () => {
    const at = '2026-10-01T10:00:00.000Z';
    const base: Entry = { id: 'x', title: 'Violão', amount: 10000, flow: 'saida', category: 'outros', pay: 'parcelado', installments: 10, date: '2026-04-15', createdAt: at, at };
    const list: Entry[] = [base, { ...base, id: 'mic', title: 'Mic', amount: 14308, installments: 2, date: '2026-12-01' }];
    const f = TestBed.createComponent(SpendingPlans);
    f.componentRef.setInput('plans', openPlans(list, '2026-10'));
    f.componentRef.setInput('month', '2026-10');
    f.detectChanges();
    expect(f.nativeElement.querySelector('.soma').textContent).toContain('100/mês');
    const mic = ([...f.nativeElement.querySelectorAll('.carne')] as HTMLElement[]).find((li) => li.getAttribute('aria-label')!.startsWith('Mic'))!;
    expect(mic.querySelectorAll('.canhoto.agora, .canhoto.pago').length).toBe(0);
    expect(mic.textContent).toContain('começa em dez');
  });
});
