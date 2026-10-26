import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { monthOfDay, rowsIn } from '../core/spending';
import { todayISO } from '../core/dates';
import { SpendingStore } from '../core/spending-store';
import { SpendingEditor } from './spending-editor';
import { SpendingQuick } from './spending-quick';

const tick = () => new Promise((r) => setTimeout(r));

async function type(fixture: ComponentFixture<unknown>, el: HTMLInputElement | HTMLSelectElement, value: string, event = 'input') {
  el.value = value;
  el.dispatchEvent(new Event(event));
  fixture.detectChanges();
  await fixture.whenStable();
}

async function renderQuick() {
  const fixture = TestBed.createComponent(SpendingQuick);
  fixture.detectChanges();
  await fixture.whenStable();
  const root = fixture.nativeElement as HTMLElement;
  const line = root.querySelector('.tira input') as HTMLInputElement;
  const q = <T extends Element>(sel: string) => root.querySelector(sel) as T | null;
  const enter = async () => {
    line.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true }));
    fixture.detectChanges();
    await fixture.whenStable();
  };
  return { fixture, root, line, q, enter, write: (v: string) => type(fixture, line, v) };
}

describe('Gastos: lançar pela folhinha', () => {
  let store: SpendingStore;

  beforeEach(() => {
    localStorage.removeItem('meu-mural:gastos:v1');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(SpendingStore);
  });

  it('sem nada escrito, só a linha; escrevendo, a folhinha do editor embaixo, com o que a linha entendeu', async () => {
    const { q, write } = await renderQuick();
    expect(q('app-spending-editor')).toBeNull();
    await write('uber 23 pix');
    const sheet = q<HTMLElement>('app-spending-editor')!;
    expect(sheet).not.toBeNull();
    expect((q<HTMLInputElement>('app-spending-editor .nome input')!).value).toBe('Uber');
    expect((q<HTMLInputElement>('app-spending-editor .valor input')!).value).toBe('23,00');
    const selects = [...sheet.querySelectorAll('select')] as HTMLSelectElement[];
    // a categoria, o pagamento (Pix) e o Precisava?
    expect(selects[1].value).toBe('pix');
    // o pé de um novo: Limpar e Lançar, sem Apagar
    expect(sheet.querySelector('.apagar')).toBeNull();
    expect(sheet.querySelector('.salvar')!.textContent).toContain('Lançar');
    expect(sheet.querySelector('.cancelar')!.textContent!.trim()).toBe('Limpar');
  });

  it('Enter na linha lança, e a linha fica vazia esperando o próximo', async () => {
    const { q, line, write, enter } = await renderQuick();
    await write('ifood 44,90');
    await enter();
    const e = store.entries();
    expect(e.length).toBe(1);
    expect(e[0]).toEqual(jasmine.objectContaining({ title: 'Ifood', amount: 4490, flow: 'saida' }));
    expect(line.value).toBe('');
    expect(q('app-spending-editor')).toBeNull();
  });

  it('só o nome: o valor vai no campo próprio; sem ele, Lançar diz o que falta', async () => {
    const { fixture, q, write } = await renderQuick();
    await write('padaria');
    (q<HTMLButtonElement>('app-spending-editor .salvar')!).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(store.entries().length).toBe(0);
    expect(q('app-spending-editor .erro-msg')!.textContent).toContain('Falta o valor');
    await type(fixture, q<HTMLInputElement>('app-spending-editor .valor input')!, '18,5');
    (q<HTMLButtonElement>('app-spending-editor .salvar')!).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(store.entries()[0]).toEqual(jasmine.objectContaining({ title: 'Padaria', amount: 1850 }));
  });

  it('o que foi mexido na folhinha fica; o resto segue a linha', async () => {
    const { fixture, q, write, enter } = await renderQuick();
    await write('cinema 38');
    const [category] = [...q<HTMLElement>('app-spending-editor')!.querySelectorAll('select')] as HTMLSelectElement[];
    await type(fixture, category, 'eventos', 'change');
    // a linha continua: o pix entra, a categoria escolhida fica
    await write('cinema 38 pix #luxo');
    const selects = [...q<HTMLElement>('app-spending-editor')!.querySelectorAll('select')] as HTMLSelectElement[];
    expect(selects[0].value).toBe('eventos');
    expect(selects[1].value).toBe('pix');
    await enter();
    expect(store.entries()[0]).toEqual(jasmine.objectContaining({ category: 'eventos', pay: 'pix', need: 'luxo' }));
  });

  it('as opções que a linha não tinha: a volta de um gasto, e a categoria nova', async () => {
    const now = new Date().toISOString();
    store.save({ id: 'jantar', title: 'Jantar', amount: 60000, flow: 'saida', category: 'comida', date: todayISO(), createdAt: now, at: now });
    const { fixture, q, write, enter } = await renderQuick();
    await write('pix da bruna +200');
    const refund = [...q<HTMLElement>('app-spending-editor')!.querySelectorAll('.largo select')][0] as HTMLSelectElement;
    expect(refund).toBeTruthy();
    await type(fixture, refund, 'jantar', 'change');
    // Nova categoria…
    const category = q<HTMLElement>('app-spending-editor')!.querySelector('select') as HTMLSelectElement;
    await type(fixture, category, '__nova', 'change');
    await tick();
    const name = q<HTMLInputElement>('app-spending-editor .nova-cat input')!;
    await type(fixture, name, 'Devolução');
    (q<HTMLElement>('app-spending-editor .nova-cat button')! as HTMLButtonElement).click();
    fixture.detectChanges();
    await fixture.whenStable();
    await enter();
    const made = store.categories().find((c) => c.name === 'Devolução')!;
    expect(made.flow).toBe('entrada');
    expect(store.entries().find((e) => e.id !== 'jantar')).toEqual(jasmine.objectContaining({ flow: 'entrada', amount: 20000, refundOf: 'jantar', category: made.id }));
  });

  it('quem foi escrito com @ e ainda não existe entra no livro ao lançar', async () => {
    const { write, enter } = await renderQuick();
    await write('jantar 600 @bruna');
    await enter();
    const bruna = store.people().find((p) => p.name === 'Bruna')!;
    expect(bruna).toBeTruthy();
    expect(store.entries()[0].people).toEqual(['eu', bruna.id]);
  });

  it('Limpar (ou Esc) apaga a linha sem lançar', async () => {
    const { fixture, q, line, write } = await renderQuick();
    await write('uber 23');
    (q<HTMLButtonElement>('app-spending-editor .cancelar')!).click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(line.value).toBe('');
    expect(store.entries().length).toBe(0);
  });
});

describe('Gastos: a folhinha de um lançamento aberto', () => {
  beforeEach(() => {
    localStorage.removeItem('meu-mural:gastos:v1');
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  it('muda o que foi aberto e salva no mesmo lançamento', async () => {
    const store = TestBed.inject(SpendingStore);
    const today = todayISO();
    const now = new Date().toISOString();
    store.save({ id: 'uber', title: 'Uber', amount: 2300, flow: 'saida', category: 'transporte', pay: 'avista', date: today, createdAt: now, at: now });
    const fixture = TestBed.createComponent(SpendingEditor);
    fixture.componentRef.setInput('row', rowsIn(store.entries(), monthOfDay(today))[0]);
    fixture.componentRef.setInput('month', monthOfDay(today));
    fixture.detectChanges();
    await fixture.whenStable();
    const root = fixture.nativeElement as HTMLElement;
    expect(root.querySelector('.apagar')).not.toBeNull();
    expect(root.querySelector('.salvar')!.textContent!.trim()).toBe('Salvar');
    await type(fixture, root.querySelector('.valor input') as HTMLInputElement, '25');
    (root.querySelector('.salvar') as HTMLButtonElement).click();
    fixture.detectChanges();
    expect(store.entries().length).toBe(1);
    expect(store.entries()[0]).toEqual(jasmine.objectContaining({ id: 'uber', amount: 2500 }));
  });
});
