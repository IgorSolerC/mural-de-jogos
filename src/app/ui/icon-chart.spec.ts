import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { CARTELA_DE_ICONES, GAVETAS_DE_ICONES, PALAVRAS_DOS_ICONES, gavetaDoIcone, procurarIcones } from '../../../shared/cartela-de-icones';
import type { IconChoice } from '../core/icon-choices';
import { fold } from '../core/text';
import { IconChart } from './icon-chart';

describe('as gavetas da cartela de ícones', () => {
  it('cada desenho está numa gaveta só, e todos têm as outras palavras da busca', () => {
    const all = GAVETAS_DE_ICONES.flatMap((g) => g.icones as readonly string[]);
    expect(all.length).toBe(CARTELA_DE_ICONES.length);
    expect(new Set(all).size).toBe(CARTELA_DE_ICONES.length);
    for (const i of CARTELA_DE_ICONES) {
      expect(all).withContext(i.id).toContain(i.id);
      expect(PALAVRAS_DOS_ICONES[i.id]).withContext(i.id).toBeTruthy();
    }
    expect(gavetaDoIcone('cofrinho')).toBe('dinheiro');
    expect(gavetaDoIcone('circulo')).toBe('andamento');
  });

  it('a busca acha pelo nome, pelas outras palavras e pela gaveta, sem acento, nesta ordem', () => {
    expect(procurarIcones('', fold)).toEqual([]);
    expect(procurarIcones('  ', fold)).toEqual([]);
    // "dinheiro": primeiro os que dizem dinheiro, depois o resto da gaveta Dinheiro
    const dinheiro = procurarIcones('dinheiro', fold);
    expect(dinheiro.slice(0, 3)).toEqual(['moedas', 'carteira', 'cofrinho']);
    expect(dinheiro).toContain('predio');
    // o nome ganha das outras palavras: "café" é o Café antes da caneca de outro desenho
    expect(procurarIcones('CAFÉ', fold)[0]).toBe('cafe');
    expect(procurarIcones('aniver', fold)).toEqual(['bolo', 'presente']);
    // várias palavras: todas têm de bater
    expect(procurarIcones('conta nota', fold)).toEqual(['recibo']);
    expect(procurarIcones('xyzw', fold)).toEqual([]);
  });
});

describe('a escolha do ícone', () => {
  let fixture: ComponentFixture<IconChart>;
  let el: HTMLElement;
  let picked: (IconChoice | null)[];

  async function make(value: IconChoice | null, none: string | null = null): Promise<void> {
    fixture = TestBed.createComponent(IconChart);
    fixture.componentRef.setInput('value', value);
    fixture.componentRef.setInput('none', none);
    fixture.componentRef.setInput('heading', 'Ícone da coluna Fazendo');
    fixture.componentRef.setInput('hint', 'No título da coluna.');
    picked = [];
    fixture.componentInstance.pick.subscribe((i) => picked.push(i));
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  }

  const dialog = () => el.querySelector<HTMLDialogElement>('dialog.cartela-de-icones');
  const trigger = () => el.querySelector<HTMLButtonElement>('.linha .papel')!;
  async function open(): Promise<HTMLDialogElement> {
    trigger().click();
    await fixture.whenStable();
    await new Promise((r) => requestAnimationFrame(r));
    return dialog()!;
  }
  async function type(text: string): Promise<void> {
    const input = dialog()!.querySelector<HTMLInputElement>('input')!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await fixture.whenStable();
  }

  beforeEach(() => {
    TestBed.configureTestingModule({ imports: [IconChart], providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => {
    dialog()?.close();
    el?.remove();
  });

  it('na folha, só a linha: o escolhido, o nome dele, onde aparece e o Trocar', async () => {
    await make('cofrinho');
    expect(el.querySelector('.linha-nome')!.textContent!.trim()).toBe('Cofrinho');
    expect(el.querySelector('.linha-desc')!.textContent!.trim()).toBe('No título da coluna.');
    expect(el.querySelector('.previa svg')).not.toBeNull();
    expect(trigger().textContent!.trim()).toBe('Trocar');
    expect(trigger().getAttribute('aria-haspopup')).toBe('dialog');
    expect(el.querySelectorAll('.op').length).toBe(0);
    expect(dialog()).toBeNull();
  });

  it('o Trocar abre a cartela inteira numa ficha por cima, separada pelas gavetas, com o foco no escolhido', async () => {
    await make('cofrinho');
    const d = await open();
    expect(d.open).toBeTrue();
    expect(d.querySelector('h2')!.textContent!.trim()).toBe('Ícone da coluna Fazendo');
    expect(d.querySelectorAll('.op').length).toBe(CARTELA_DE_ICONES.length);
    expect(Array.from(d.querySelectorAll('.gaveta-nome')).map((h) => h.textContent!.trim())).toEqual(GAVETAS_DE_ICONES.map((g) => g.label));
    const chosen = d.querySelector<HTMLElement>('.op[aria-checked="true"]')!;
    expect(chosen.getAttribute('aria-label')).toBe('Cofrinho');
    expect(document.activeElement).toBe(chosen);
    // sem o "none", o pé não oferece tirar
    expect(d.querySelector('.sem')).toBeNull();
  });

  it('tocar num desenho escolhe, fecha a ficha e devolve o foco ao Trocar', async () => {
    await make('cofrinho');
    const d = await open();
    d.querySelector<HTMLButtonElement>('.op[aria-label="Foguete"]')!.click();
    await fixture.whenStable();
    expect(picked).toEqual(['foguete']);
    expect(dialog()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('a busca deixa só o que bate, em cada gaveta; sem nada, diz; Esc limpa sem fechar, e Enter escolhe o primeiro', async () => {
    await make(null, 'Sem ícone');
    const d = await open();
    await type('dinheiro');
    expect(Array.from(d.querySelectorAll('.gaveta-nome')).map((h) => h.textContent!.trim())).toEqual(['Dinheiro']);
    await type('xyzw');
    expect(d.querySelectorAll('.op').length).toBe(0);
    expect(d.querySelector('.nada')!.textContent).toContain('xyzw');
    const input = d.querySelector<HTMLInputElement>('input')!;
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(d.open).toBeTrue();
    expect(d.querySelectorAll('.op').length).toBe(CARTELA_DE_ICONES.length);
    await type('pizza garfo');
    expect(d.querySelectorAll('.op').length).toBe(0);
    await type('garfo');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    await fixture.whenStable();
    expect(picked).toEqual(['comida']);
    expect(dialog()).toBeNull();
  });

  it('com o "none", o pé tira o ícone', async () => {
    await make('bolo', 'Sem ícone');
    const d = await open();
    const sem = d.querySelector<HTMLButtonElement>('.sem')!;
    expect(sem.getAttribute('aria-pressed')).toBe('false');
    sem.click();
    await fixture.whenStable();
    expect(picked).toEqual([null]);
    expect(dialog()).toBeNull();
  });

  it('o X e o Esc fecham sem escolher, e a busca volta vazia', async () => {
    await make('bolo');
    let d = await open();
    await type('casa');
    d.querySelector<HTMLButtonElement>('.fecha')!.click();
    await fixture.whenStable();
    expect(dialog()).toBeNull();
    d = await open();
    expect(d.querySelector<HTMLInputElement>('input')!.value).toBe('');
    expect(picked).toEqual([]);
  });
});
