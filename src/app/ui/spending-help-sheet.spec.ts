import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { DEFAULT_CATEGORIES, DEFAULT_PERSON, Entry } from '../core/spending';
import { QuickContext, readQuick } from '../core/spending-quick';
import { nextClose } from '../testing/dialog-close.spec';
import { HELP, SpendingHelpSheet, helpParts, helpText } from './spending-help-sheet';

const ctx = (over: Partial<QuickContext> = {}): QuickContext => ({ entries: [], categories: DEFAULT_CATEGORIES, today: '2026-10-26', month: '2026-10', ...over });
const read = (text: string, over: Partial<QuickContext> = {}) => readQuick(text, ctx(over));

const old = (over: Partial<Entry>): Entry => ({
  id: 'x1',
  title: 'Coisa',
  amount: 1000,
  flow: 'saida',
  category: 'outros',
  pay: 'avista',
  date: '2026-09-02',
  createdAt: '2026-09-02T10:00:00.000Z',
  at: '2026-09-02T10:00:00.000Z',
  ...over,
});

/** A ajuda só promete o que a linha de anotar faz: cada jeito é lido de verdade. */
describe('Gastos: Como anotar', () => {
  it('cada linha da ajuda vira um lançamento, e as marcas não ficam no nome', () => {
    for (const sec of HELP) {
      for (const h of sec.items) {
        const q = read(helpText(h.line));
        expect(q.amount).withContext(h.line).toBeGreaterThan(0);
        expect(q.title).withContext(h.line).not.toBe('');
        for (const p of helpParts(h.line).filter((p) => p.mark)) expect(q.title.toLowerCase()).withContext(h.line).not.toContain(p.text.toLowerCase());
      }
    }
  });

  it('gasto e valor: o último número, hoje (ou o mesmo dia no mês aberto); o + e as palavras de entrada', () => {
    const a = read('ifood 44,90');
    expect([a.title, a.amount, a.flow, a.date]).toEqual(['Ifood', 4490, 'saida', '2026-10-26']);
    expect(read('ifood R$ 44,90').amount).toBe(4490);
    expect(read('ifood 1.250').amount).toBe(125000);
    expect(read('ifood 44,90', { month: '2026-08' }).date).toBe('2026-08-26');
    expect([read('salário +4559').flow, read('salário +4559').amount]).toEqual(['entrada', 455900]);
    for (const w of ['recebi', 'ganhei', 'entrou']) expect(read(`bônus 300 ${w}`).flow).withContext(w).toBe('entrada');
    expect(read('cashback 12', { entries: [old({ title: 'Cashback', flow: 'entrada', category: 'renda' })] }).flow).toBe('entrada');
  });

  it('parcelas, o carnê que já vinha e o todo mês', () => {
    for (const t of ['violão 10x 139,90', 'violão em 10x de 139,90', 'violão x10 139,90']) {
      const q = read(t);
      expect([q.title, q.amount, q.installments, q.part, q.date]).withContext(t).toEqual(['Violão', 13990, 10, 1, '2026-10-26']);
    }
    const c = read('violão 7/10 139,90');
    expect([c.installments, c.part, c.date]).toEqual([10, 7, '2026-04-26']);
    for (const t of ['aluguel 1800 todo mês', 'aluguel 1800 fixo', 'aluguel 1800 mensal']) expect(read(t).monthly).withContext(t).toBeTrue();
  });

  it('o dia e o pagamento', () => {
    const days: [string, string][] = [
      ['hoje', '2026-10-26'],
      ['ontem', '2026-10-25'],
      ['anteontem', '2026-10-24'],
      ['dia 5', '2026-10-05'],
      ['dia 5/10', '2026-10-05'],
      ['05/10/2026', '2026-10-05'],
    ];
    for (const [w, d] of days) expect(read(`uber 23 ${w}`).date).withContext(w).toBe(d);
    const m = read('mercado 230 pix');
    expect([m.pay, m.category]).toEqual(['pix', 'mercado']);
    for (const w of ['débito', 'crédito', 'dinheiro', 'à vista']) expect(read(`mercado 230 ${w}`).pay).withContext(w).toBe('avista');
    expect(read('ifood 44,90', { entries: [old({ title: 'iFood', pay: 'pix' })] }).pay).toBe('pix');
    const e = read('pix da bia +50');
    expect([e.flow, e.title]).toEqual(['entrada', 'Pix da bia']);
  });

  it('a categoria, o Precisava? e com quem foi', () => {
    expect(read('uber 23 #transporte').category).toBe('transporte');
    expect(read('uber 23 #transp').category).toBe('transporte');
    expect(read('pão 9', { entries: [old({ title: 'Pão', category: 'comida' })] }).category).toBe('comida');
    expect(read('pomada 77').category).toBe('outros');
    const needs: [string, string][] = [
      ['#luxo', 'luxo'],
      ['#conforto', 'conforto'],
      ['#indispensável', 'indispensavel'],
      ['#supérfluo', 'luxo'],
      ['#essencial', 'indispensavel'],
    ];
    for (const [w, n] of needs) expect(read(`cinema 38 ${w}`).need).withContext(w).toBe(n as never);

    const j = read('jantar 600 @bruna @biel');
    expect(j.people!.map((p) => p.name)).toEqual(['Eu', 'Bruna', 'Biel']);
    const bruna = { id: 'p-bruna', name: 'Bruna', at: '2026-09-01T00:00:00.000Z' };
    expect(read('jantar 600 @bru', { people: [DEFAULT_PERSON, bruna] }).people![1]).toEqual({ id: 'p-bruna', name: 'Bruna' });
    expect(read('jantar 600 @ana_paula').people![1]).toEqual({ id: null, name: 'Ana paula' });

    const t = read('jantar 600 @bruna pix ontem #luxo');
    expect([t.title, t.amount, t.pay, t.date, t.need, t.people!.length]).toEqual(['Jantar', 60000, 'pix', '2026-10-25', 'luxo', 2]);
  });

  it('a folha: as partes, cada linha numa tirinha com as marcas a marca-texto, e o Pronto fecha', async () => {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const f = TestBed.createComponent(SpendingHelpSheet);
    f.detectChanges();
    await f.whenStable();
    const el: HTMLElement = f.nativeElement;
    const dialog = el.querySelector('dialog')!;
    expect(dialog.open).toBeTrue();
    expect([...el.querySelectorAll('.grupo-titulo')].map((h) => h.textContent!.trim())).toEqual(HELP.map((s) => s.title));
    const lines = [...el.querySelectorAll<HTMLElement>('.escrito')];
    expect(lines.map((l) => l.textContent)).toEqual(HELP.flatMap((s) => s.items.map((h) => helpText(h.line))));
    expect([...lines[2].querySelectorAll('mark')].map((m) => m.textContent)).toEqual(['10x']);

    let closed = 0;
    f.componentInstance.closed.subscribe(() => closed++);
    const done = nextClose(dialog);
    el.querySelector<HTMLButtonElement>('.btn-ink')!.click();
    await done;
    expect(dialog.open).toBeFalse();
    expect(closed).toBe(1);
  });
});
