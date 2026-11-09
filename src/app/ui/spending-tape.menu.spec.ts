import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Entry, rowsIn } from '../core/spending';
import { SpendingStore } from '../core/spending-store';
import { Confirm } from './confirm';
import { SpendingTape } from './spending-tape';
import { Toasts } from './toast';

/** O menu do botão direito numa linha da fita dos Gastos (ui/spending-tape.ts). */

const NOW = '2026-11-02T10:00:00.000Z';
const MONTH = '2026-11';
const uber: Entry = { id: 'uber', title: 'Uber', amount: 2300, flow: 'saida', category: 'transporte', pay: 'avista', date: '2026-11-02', createdAt: NOW, at: NOW };
const aluguel: Entry = { id: 'aluguel', title: 'Aluguel', amount: 150000, flow: 'saida', category: 'casa', date: '2026-09-05', monthly: true, createdAt: NOW, at: NOW };

describe('menu do botão direito na fita dos Gastos', () => {
  let fixture: ComponentFixture<SpendingTape>;
  let host: HTMLElement;
  let store: SpendingStore;
  let choice: 'confirm' | 'secondary' | null;

  const line = (id: string) => host.querySelector<HTMLElement>(`.botao[data-lancamento="${id}"]`)!;
  const panel = () => host.querySelector<HTMLElement>('.menu-contexto')!;
  const labels = () => [...panel().querySelectorAll('.escolha .nome')].map((x) => x.textContent!.trim());
  const option = (label: string) => [...panel().querySelectorAll<HTMLButtonElement>('.escolha')].find((b) => b.querySelector('.nome')!.textContent!.trim() === label)!;
  async function settle(): Promise<void> {
    for (let i = 0; i < 3; i++) {
      await new Promise((r) => setTimeout(r, 0));
      TestBed.tick();
    }
  }
  async function rightClick(target: Element): Promise<MouseEvent> {
    target.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, cancelable: true, button: 2, pointerType: 'mouse', clientX: 30, clientY: 30 }));
    const e = new MouseEvent('contextmenu', { bubbles: true, cancelable: true, button: 2, clientX: 30, clientY: 30 });
    target.dispatchEvent(e);
    await settle();
    return e;
  }
  /** Espera a linha sair e o foco ir para a vizinha (ui/focus.ts: focusAfterRemoval). */
  async function frames(n = 8): Promise<void> {
    for (let i = 0; i < n; i++) {
      await new Promise((r) => requestAnimationFrame(() => r(null)));
      TestBed.tick();
    }
  }
    /** A fita do mês, com os lançamentos de agora (o que a página faria). */
  async function draw(): Promise<void> {
    fixture.componentRef.setInput('rows', rowsIn(store.entries(), MONTH));
    await settle();
  }

  beforeEach(async () => {
    localStorage.clear();
    choice = 'secondary';
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: Confirm, useValue: { choose: async () => choice, ask: async () => true } }],
    });
    store = TestBed.inject(SpendingStore);
    store.save(uber);
    store.save(aluguel);
    fixture = TestBed.createComponent(SpendingTape);
    fixture.componentRef.setInput('month', MONTH);
    host = fixture.nativeElement;
    document.body.appendChild(host);
    await draw();
  });

  afterEach(() => {
    host.remove();
    localStorage.clear();
  });

  it('abre no lugar do menu do navegador, com o nome no alto; editar abre a folhinha da linha', async () => {
    const e = await rightClick(line('uber'));
    expect(e.defaultPrevented).toBeTrue();
    expect(panel().querySelector('.legenda')!.textContent).toContain('Uber');
    expect(labels()).toEqual(['Editar', 'Só Transporte', 'Apagar o lançamento']);
    option('Editar').click();
    await settle();
    expect(line('uber').getAttribute('aria-expanded')).toBe('true');
    // aberta, o menu não oferece abrir de novo
    await rightClick(line('uber'));
    expect(labels()).not.toContain('Editar');
  });

  it('"Só" deixa a fita com a categoria; já filtrada nela, o mês inteiro de novo', async () => {
    let only = '';
    let cleared = false;
    fixture.componentInstance.onlyCategory.subscribe((c) => (only = c));
    fixture.componentInstance.clearFilter.subscribe(() => (cleared = true));
    await rightClick(line('uber'));
    option('Só Transporte').click();
    expect(only).toBe('transporte');
    fixture.componentRef.setInput('category', 'transporte');
    await rightClick(line('uber'));
    option('Ver o mês inteiro').click();
    expect(cleared).toBeTrue();
  });

  it('"Só <pessoa>" em cada pessoa do gasto (você, não); já filtrada nela, o mês inteiro de novo', async () => {
    const bia = store.addPerson('Bia');
    store.save({ ...uber, id: 'pizza', title: 'Pizza', category: 'comida', people: ['eu', bia.id] });
    await draw();
    let who = '';
    let cleared = false;
    fixture.componentInstance.onlyPerson.subscribe((p) => (who = p));
    fixture.componentInstance.clearFilter.subscribe(() => (cleared = true));
    await rightClick(line('pizza'));
    expect(labels()).toEqual(['Editar', 'Só Comida', 'Só Bia', 'Apagar o lançamento']);
    option('Só Bia').click();
    expect(who).toBe(bia.id);
    fixture.componentRef.setInput('person', bia.id);
    await rightClick(line('pizza'));
    expect(labels()).toEqual(['Editar', 'Ver o mês inteiro', 'Só Comida', 'Apagar o lançamento']);
    option('Ver o mês inteiro').click();
    expect(cleared).toBeTrue();
    // o gasto só seu não tem pessoa para escolher
    fixture.componentRef.setInput('person', null);
    await rightClick(line('uber'));
    expect(labels()).toEqual(['Editar', 'Só Transporte', 'Apagar o lançamento']);
  });

  it('apagar faz a mesma pergunta da folhinha (o fixo: só neste mês ou dali em diante), com o Desfazer', async () => {
    await rightClick(line('uber'));
    option('Apagar o lançamento').click();
    await settle();
    expect(store.entries().some((x) => x.id === 'uber')).toBeFalse();
    // a página manda a fita sem a linha
    await draw();
    await frames();
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('“Uber” apagado');
    // a linha saiu: o foco vai para a de baixo (ou a de cima)
    expect(document.activeElement?.getAttribute('data-lancamento')).toBe('aluguel');
    toast.action!.run();
    expect(store.entries().some((x) => x.id === 'uber')).toBeTrue();
    await draw();
    // o fixo pergunta; desistindo, nada muda
    choice = null;
    await rightClick(line('aluguel'));
    option('Apagar o lançamento').click();
    await settle();
    expect(store.entries().find((x) => x.id === 'aluguel')!.skip).toBeUndefined();
    choice = 'secondary';
    await rightClick(line('aluguel'));
    option('Apagar o lançamento').click();
    await settle();
    expect(store.entries().find((x) => x.id === 'aluguel')!.skip).toEqual([MONTH]);
    expect(TestBed.inject(Toasts).current()!.text).toBe('“Aluguel” saiu de novembro');
  });
});
