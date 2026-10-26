import { Type, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Entry, rowsIn } from '../core/spending';
import { categoryLines, periodMonths, periodSpends, spendWays } from '../core/spending-period';
import { SpendingColumns } from './spending-columns';
import { SpendingGrid } from './spending-grid';
import { SpendingTape } from './spending-tape';
import { SpendingTop } from './spending-top';
import { SpendingWays, WayPick } from './spending-ways';

let seq = 0;
function entry(over: Partial<Entry>): Entry {
  seq++;
  const at = `2026-10-01T10:00:00.${String(seq).padStart(3, '0')}Z`;
  return { id: `c${seq}`, title: 'Coisa', amount: 1000, flow: 'saida', category: 'outros', pay: 'avista', date: '2026-10-05', createdAt: at, at, ...over };
}

const entries = [
  entry({ title: 'Aluguel', amount: 150000, category: 'aluguel', date: '2026-08-10', monthly: true, pay: 'pix' }),
  entry({ title: 'Violão', amount: 10000, category: 'luxo', date: '2026-09-03', installments: 3, pay: 'parcelado' }),
  entry({ title: 'Ifood', amount: 4000, category: 'comida', date: '2026-10-02' }),
  entry({ title: 'Mercado', amount: 30000, category: 'mercado', date: '2026-09-12', pay: 'pix' }),
  entry({ title: 'Salário', amount: 500000, flow: 'entrada', category: 'renda', date: '2026-08-05', monthly: true, pay: undefined }),
];

/** O texto com os espaços de sempre (o R$ leva um espaço que não quebra). */
const norm = (t: string | null) => (t ?? '').replace(/\s+/g, ' ').trim();

function render<T>(type: Type<T>, inputs: Record<string, unknown>): ComponentFixture<T> {
  const fixture = TestBed.createComponent(type);
  for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
  fixture.detectChanges();
  return fixture;
}

describe('Gastos: os gráficos e a vista de vários meses', () => {
  beforeEach(() => {
    localStorage.removeItem('meu-mural:gastos:v1');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('Como saiu: os três pagamentos e os três jeitos, com a parte e quantos gastos', () => {
    const f = render(SpendingWays, { ways: spendWays(rowsIn(entries, '2026-10'), entries) });
    const root = f.nativeElement as HTMLElement;
    const lines = [...root.querySelectorAll('.linha')].map((l) => l.textContent!.replace(/\s+/g, ' ').trim());
    expect(lines.length).toBe(6);
    expect(lines[0]).toContain('À vista');
    expect(lines[2]).toContain('Parcelado');
    expect(lines[5]).toContain('Todo mês');
    // aluguel 1.500 + parcela 100 de 1.640: 98% já estava marcado
    expect(root.querySelector('.conta')!.textContent).toContain('98% do que saiu já estava marcado');
  });

  it('Como saiu escolhe na fita: o parcelado é o jeito Parcelas; de novo, tira a escolha', () => {
    const f = render(SpendingWays, { ways: spendWays(rowsIn(entries, '2026-10'), entries) });
    const picks: WayPick[] = [];
    f.componentInstance.pick.subscribe((p) => picks.push(p));
    const buttons = [...(f.nativeElement as HTMLElement).querySelectorAll('button.linha')] as HTMLButtonElement[];
    buttons[2].click();
    expect(picks.at(-1)).toEqual({ group: 'kind', value: 'parcela' });
    f.componentRef.setInput('kind', 'parcela');
    f.detectChanges();
    expect(buttons[2].getAttribute('aria-pressed')).toBe('true');
    buttons[2].click();
    expect(picks.at(-1)).toEqual({ group: 'kind', value: null });
  });

  it('na vista de vários meses, Como saiu só mostra', () => {
    const f = render(SpendingWays, { ways: spendWays(rowsIn(entries, '2026-10'), entries), static: true });
    expect((f.nativeElement as HTMLElement).querySelector('button')).toBeNull();
  });

  it('as colunas: uma por mês, a do mês aberto marcada, e tocar abre o mês', () => {
    const months = periodMonths(entries, '2026-10', 3);
    const f = render(SpendingColumns, { months, month: '2026-10' });
    const cols = [...(f.nativeElement as HTMLElement).querySelectorAll('.coluna')] as HTMLButtonElement[];
    expect(cols.length).toBe(3);
    expect(cols[2].classList).toContain('aberta');
    expect(norm(cols[0].getAttribute('aria-label'))).toContain('agosto de 2026: saiu R$ 1.500,00');
    const gone: string[] = [];
    f.componentInstance.go.subscribe((m) => gone.push(m));
    cols[1].click();
    expect(gone).toEqual(['2026-09']);
  });

  it('a tabela: uma linha por categoria e o total de cada mês; tocar escolhe a categoria', () => {
    const months = periodMonths(entries, '2026-10', 3);
    const f = render(SpendingGrid, { months, lines: categoryLines(months), month: '2026-10' });
    const root = f.nativeElement as HTMLElement;
    const rows = [...root.querySelectorAll('tbody tr')];
    expect(rows.length).toBe(4);
    expect(rows[0].textContent).toContain('Aluguel');
    expect([...root.querySelectorAll('tfoot td')].slice(0, 3).map((td) => norm(td.textContent))).toEqual(['1.500', '1.900', '1.640']);
    const picked: (string | null)[] = [];
    f.componentInstance.pick.subscribe((p) => picked.push(p));
    (rows[1].querySelector('button') as HTMLButtonElement).click();
    expect(picked).toEqual(['mercado']);
  });

  it('os maiores gastos: o fixo somado nos meses, e tocar abre o último mês dele', () => {
    const months = periodMonths(entries, '2026-10', 3);
    const f = render(SpendingTop, { spends: periodSpends(months, entries) });
    const lines = [...(f.nativeElement as HTMLElement).querySelectorAll('.linha')] as HTMLButtonElement[];
    expect(lines[0].textContent).toContain('Aluguel');
    expect(norm(lines[0].textContent)).toContain('R$ 4.500,00');
    const gone: string[] = [];
    f.componentInstance.go.subscribe((m) => gone.push(m));
    lines[0].click();
    expect(gone).toEqual(['2026-10']);
  });

  it('a fita curta mostra as primeiras linhas e abre inteira a um toque', () => {
    const many = Array.from({ length: 12 }, (_, i) => entry({ title: `Gasto ${i}`, date: `2026-10-${String(i + 1).padStart(2, '0')}` }));
    const f = render(SpendingTape, { rows: rowsIn(many, '2026-10'), month: '2026-10', short: 8 });
    const root = f.nativeElement as HTMLElement;
    expect(root.querySelectorAll('.linha').length).toBe(8);
    const more = root.querySelector('.inteira') as HTMLButtonElement;
    expect(more.textContent).toContain('Ver a fita inteira (12)');
    more.click();
    f.detectChanges();
    expect(root.querySelectorAll('.linha').length).toBe(12);
    expect(more.textContent).toContain('Recolher a fita');
  });
});
