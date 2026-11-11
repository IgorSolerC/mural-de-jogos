import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { ICON } from './icons';
import { KIND_PROFILES } from '../core/kinds';
import { Bonus } from '../core/review';
import { BonusPicker, bonusIcon } from './bonus';

describe('adesivos de bônus', () => {
  it('todo bônus da cartela pronta tem desenho próprio (o mais e o menos são dos escritos à mão)', () => {
    for (const p of Object.values(KIND_PROFILES)) {
      for (const b of p.bonuses) {
        const icon = bonusIcon(b);
        expect(icon === ICON.adicionar || icon === ICON.tirar).withContext(`${p.kind}: ${b.label}`).toBeFalse();
      }
    }
  });
});

describe('os bônus da ficha', () => {
  let fixture: ComponentFixture<BonusPicker>;
  let el: HTMLElement;
  const catalog = KIND_PROFILES.jogos.bonuses;

  async function make(value: Bonus[] = [], use = new Map<string, number>()): Promise<void> {
    TestBed.configureTestingModule({ imports: [BonusPicker], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(BonusPicker);
    fixture.componentRef.setInput('catalog', catalog);
    fixture.componentRef.setInput('use', use);
    fixture.componentRef.setInput('heading', 'Hollow Knight');
    fixture.componentRef.setInput('final', 8.1);
    fixture.componentRef.setInput('shift', '+0,5');
    fixture.componentRef.setInput('value', value);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  }
  const sheet = () => el.querySelector<HTMLDialogElement>('dialog.folha-bonus');
  async function open(): Promise<HTMLDialogElement> {
    el.querySelector<HTMLButtonElement>('.toggle')!.click();
    await fixture.whenStable();
    await new Promise((r) => requestAnimationFrame(r));
    return sheet()!;
  }
  const col = (k: 'favor' | 'contra') => sheet()!.querySelector(`.coluna.${k}`) as HTMLElement;
  const rows = (k: 'favor' | 'contra') =>
    Array.from(col(k).querySelectorAll('.linha:not(.escrever)')).map((b) => b.querySelector('app-bonus-sticker')!.textContent!.trim());
  async function type(text: string): Promise<void> {
    const input = sheet()!.querySelector<HTMLInputElement>('.busca input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }
  const value = () => fixture.componentInstance.value();
  afterEach(() => {
    sheet()?.close();
    el?.remove();
  });

  it('na ficha, só os colados e o botão; a escolha abre por cima, com a média ao vivo', async () => {
    const b = catalog.find((x) => x.kind === 'favor')!;
    await make([b]);
    expect(el.querySelectorAll('.colados app-bonus-sticker').length).toBe(1);
    expect(el.querySelector('.toggle')!.textContent!.trim()).toBe('Mexer nos bônus');
    expect(sheet()).toBeNull();
    const d = await open();
    expect(d.open).toBeTrue();
    expect(d.querySelector('h2')!.textContent!.trim()).toBe('Bônus de Hollow Knight');
    expect(d.querySelector('.sub')!.textContent).toContain('8,1');
    expect(d.querySelector('.sub')!.textContent).toContain('1 a favor colado');
  });

  it('prós e contras: cada lado inteiro numa coluna, em ordem alfabética, com em quantas fichas cada um está', async () => {
    const contra = catalog.filter((x) => x.kind === 'contra');
    await make([], new Map([[contra[0].id, 3]]));
    await open();
    const favor = catalog.filter((x) => x.kind === 'favor').map((x) => x.label);
    expect(rows('favor')).toEqual([...favor].sort((a, b) => a.localeCompare(b, 'pt-BR')));
    expect(rows('contra').length).toBe(contra.length);
    const usado = Array.from(col('contra').querySelectorAll('.linha')).find((b) => b.textContent!.includes(contra[0].label))!;
    expect(usado.querySelector('.uso')!.textContent!.trim()).toBe('3 fichas');
  });

  it('um toque cola e descola na hora, e a caixinha marca', async () => {
    await make();
    await open();
    const linha = col('contra').querySelector<HTMLButtonElement>('.linha')!;
    linha.click();
    await fixture.whenStable();
    expect(value().length).toBe(1);
    expect(linha.getAttribute('aria-pressed')).toBe('true');
    expect(linha.querySelector('.caixa svg')).not.toBeNull();
    linha.click();
    await fixture.whenStable();
    expect(value()).toEqual([]);
  });

  it('a busca filtra as duas colunas; o escrito que não é nenhum oferece colar em cada lado; Esc limpa sem fechar', async () => {
    await make();
    const d = await open();
    await type('bug');
    expect(rows('favor')).toEqual([]);
    expect(rows('contra')).toEqual(['Muitos bugs']);
    // o nome de um bônus que já existe (contra) não vira um a favor
    await type('muitos bugs');
    expect(sheet()!.querySelectorAll('.escrever').length).toBe(0);
    expect(col('favor').querySelector('.nada')!.textContent).toContain('Nenhum a favor com “muitos bugs”');
    await type('chato no começo');
    const colar = col('contra').querySelector<HTMLButtonElement>('.escrever')!;
    expect(colar.textContent).toContain('Colar “Chato no começo” contra');
    expect(col('favor').querySelector('.escrever')!.textContent).toContain('a favor');
    colar.click();
    await fixture.whenStable();
    expect(value().map((b) => [b.label, b.kind])).toEqual([['Chato no começo', 'contra']]);
    expect(d.querySelector<HTMLInputElement>('.busca input')!.value).toBe('');
    // o escrito fica na coluna, mesmo descolado
    expect(rows('contra')).toContain('Chato no começo');
    await type('xyz');
    const input = d.querySelector<HTMLInputElement>('.busca input')!;
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    input.dispatchEvent(esc);
    await fixture.whenStable();
    expect(esc.defaultPrevented).toBeTrue();
    expect(d.open).toBeTrue();
    expect(input.value).toBe('');
  });

  it('"Escrever outro" no fim de cada coluna: Enter cola e deixa outro em branco', async () => {
    await make();
    await open();
    col('favor').querySelector<HTMLButtonElement>('[data-write="favor"]')!.click();
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r));
    const input = col('favor').querySelector<HTMLInputElement>('input.write')!;
    input.value = 'Chefes marcantes';
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(value().map((b) => [b.label, b.kind])).toEqual([['Chefes marcantes', 'favor']]);
    expect(input.value).toBe('');
  });

  it('Enter na busca cola o primeiro que bate e não envia o formulário em volta (o do editor)', async () => {
    await make();
    const form = document.createElement('form');
    let sent = 0;
    form.addEventListener('submit', (e) => {
      e.preventDefault();
      sent++;
    });
    form.appendChild(document.createElement('button'));
    document.body.appendChild(form);
    form.appendChild(el);
    const d = await open();
    await type('bugs');
    const input = d.querySelector<HTMLInputElement>('.busca input')!;
    const enter = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    input.dispatchEvent(enter);
    await fixture.whenStable();
    expect(enter.defaultPrevented).toBeTrue();
    expect(sent).toBe(0);
    expect(value().map((b) => b.label)).toEqual(['Muitos bugs']);
    expect(input.value).toBe('');
    form.remove();
  });

  it('o Pronto fecha e o foco volta ao botão da ficha', async () => {
    await make();
    const d = await open();
    d.querySelector<HTMLButtonElement>('.btn-ink')!.click();
    await fixture.whenStable();
    expect(sheet()).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('.toggle'));
  });

  it('aberta de dentro de uma ficha escura, a folha branca escreve em tinta escura (a faixa clara é só da ficha)', async () => {
    await make();
    // o editor de uma ficha de cartolina preta, com a faixa dele e os bônus no corpo
    const ficha = document.createElement('form');
    ficha.className = 'ficha cartolina';
    ficha.dataset['cor'] = 'preto';
    ficha.style.setProperty('--stock', 'var(--stock-preto)');
    const faixa = document.createElement('header');
    faixa.className = 'head';
    faixa.textContent = 'Clair Obscur';
    ficha.append(faixa, el);
    document.body.appendChild(ficha);
    const d = await open();
    const luz = (c: string) => {
      const [r, g, b] = c.match(/\d+(\.\d+)?/g)!.map(Number);
      return (r + g + b) / 3;
    };
    expect(luz(getComputedStyle(faixa).color)).withContext('a faixa da ficha escura').toBeGreaterThan(180);
    expect(luz(getComputedStyle(d.querySelector('h2')!).color)).withContext('o título da folha').toBeLessThan(60);
    expect(luz(getComputedStyle(d.querySelector('.coluna-titulo')!).color)).withContext('a coluna').toBeLessThan(60);
    ficha.remove();
  });
});
