import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TableGrid } from './table-grid';

describe('a grade da tabela (ui/table-grid.ts)', () => {
  let fixture: ComponentFixture<TableGrid>;
  let el: HTMLElement;
  let sent: string[];
  const T = '| Dia | Lugar |\n| --- | ---: |\n| Seg | Belém |\n| Ter | Sintra |';

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [TableGrid], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(TableGrid);
    fixture.componentRef.setInput('text', T);
    sent = [];
    fixture.componentInstance.changed.subscribe((t) => {
      sent.push(t);
      // como a folha: o texto mandado volta como a entrada
      fixture.componentRef.setInput('text', t);
    });
    el = fixture.nativeElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  });

  afterEach(() => el.remove());

  const cell = (r: number, c: number) => el.querySelector<HTMLInputElement>(`input[data-r="${r}"][data-c="${c}"]`)!;
  const tecla = (label: string) => el.querySelector<HTMLButtonElement>(`.tg-tecla[aria-label="${label}"]`)!;
  const last = () => sent.at(-1) ?? '';
  const settle = async () => {
    await fixture.whenStable();
    await new Promise((r) => setTimeout(r, 0));
    await fixture.whenStable();
  };
  async function focus(r: number, c: number): Promise<void> {
    cell(r, c).focus();
    cell(r, c).dispatchEvent(new FocusEvent('focus'));
    await settle();
  }
  async function type(r: number, c: number, value: string): Promise<void> {
    cell(r, c).value = value;
    cell(r, c).dispatchEvent(new Event('input'));
    await settle();
  }
  const key = (r: number, c: number, k: string, extra: KeyboardEventInit = {}) => {
    const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra });
    cell(r, c).dispatchEvent(e);
    return e;
  };

  it('mostra as células sem as barras do markdown, com o cabeçalho, as letras e os números', () => {
    expect(cell(-1, 0).value).toBe('Dia');
    expect(cell(1, 1).value).toBe('Sintra');
    expect(cell(1, 1).style.textAlign).toBe('right');
    expect([...el.querySelectorAll('.tg-letra')].map((x) => x.textContent?.trim())).toEqual(['A', 'B']);
    expect(cell(0, 1).getAttribute('aria-label')).toBe('Coluna B, linha 1');
    expect(cell(-1, 0).getAttribute('data-campo')).toBe('table');
  });

  it('escrever numa célula manda o markdown; o "|" escrito vira "\\|" e continua "|" na célula; o espaço do fim fica enquanto se escreve', async () => {
    await type(0, 1, 'Belém | Jerónimos ');
    expect(last()).toBe('| Dia | Lugar |\n| --- | ---: |\n| Seg | Belém \\| Jerónimos |\n| Ter | Sintra |');
    expect(cell(0, 1).value).toBe('Belém | Jerónimos ');
  });

  it('Enter desce; na última linha, cria a próxima e leva o cursor para ela; Shift+Enter sobe', async () => {
    await focus(0, 1);
    expect(key(0, 1, 'Enter').defaultPrevented).toBeTrue();
    await settle();
    expect(document.activeElement).toBe(cell(1, 1));
    key(1, 1, 'Enter');
    await settle();
    expect(last().split('\n').length).toBe(5);
    expect(document.activeElement).toBe(cell(2, 1));
    key(2, 1, 'Enter', { shiftKey: true });
    await settle();
    expect(document.activeElement).toBe(cell(1, 1));
  });

  it('a régua mexe na linha e na coluna da célula do cursor: pôr, mover, alinhar e tirar', async () => {
    await focus(1, 0);
    expect(el.querySelector('.tg-grupo-nome')?.textContent?.trim()).toBe('Linha 2');
    tecla('Subir a linha').click();
    await settle();
    expect(last().split('\n').slice(2)).toEqual(['| Ter | Sintra |', '| Seg | Belém |']);
    expect(document.activeElement).toBe(cell(0, 0));
    tecla('Pôr uma linha em cima').click();
    await settle();
    expect(last().split('\n').length).toBe(5);
    expect(last().split('\n')[2]).toBe('|  |  |');
    tecla('Tirar a linha').click();
    await settle();
    expect(last().split('\n').length).toBe(4);
    tecla('Pôr uma coluna depois').click();
    await settle();
    expect(last().split('\n')[0]).toBe('| Dia |  | Lugar |');
    expect(document.activeElement).toBe(cell(-1, 1));
    tecla('Levar a coluna para a direita').click();
    await settle();
    expect(last().split('\n')[0]).toBe('| Dia | Lugar |  |');
    // o alinhamento foi junto com a coluna
    expect(last().split('\n')[1]).toBe('| --- | ---: | --- |');
    tecla('Centralizar').click();
    await settle();
    expect(last().split('\n')[1]).toBe('| --- | ---: | :---: |');
    tecla('Tirar a coluna').click();
    await settle();
    expect(last()).toBe('| Dia | Lugar |\n| --- | ---: |\n| Ter | Sintra |\n| Seg | Belém |');
  });

  it('no cabeçalho, a linha não sobe, não desce nem sai; a última coluna e a última linha não saem', async () => {
    await focus(-1, 0);
    expect(tecla('Subir a linha').disabled).toBeTrue();
    expect(tecla('Tirar a linha').disabled).toBeTrue();
    expect(tecla('Pôr uma linha em cima').disabled).toBeTrue();
    expect(el.querySelector('.tg-grupo-nome')?.textContent?.trim()).toBe('Cabeçalho');
    fixture.componentRef.setInput('text', '| A |\n| --- |\n| 1 |');
    await settle();
    await focus(0, 0);
    expect(tecla('Tirar a coluna').disabled).toBeTrue();
    expect(tecla('Tirar a linha').disabled).toBeTrue();
  });

  it('colar células de uma planilha espalha a partir da célula, com as linhas e colunas que faltarem', async () => {
    const dt = new DataTransfer();
    dt.setData('text/plain', 'Qua\tAlfama\t9 €\nQui\tCascais\t12 €');
    const e = new ClipboardEvent('paste', { clipboardData: dt, bubbles: true, cancelable: true });
    cell(1, 0).dispatchEvent(e);
    await settle();
    expect(e.defaultPrevented).toBeTrue();
    expect(last()).toBe('| Dia | Lugar |  |\n| --- | ---: | --- |\n| Seg | Belém |  |\n| Qua | Alfama | 9 € |\n| Qui | Cascais | 12 € |');
  });

  it('os "+" põem uma coluna e uma linha no fim', async () => {
    el.querySelector<HTMLButtonElement>('.tg-mais-coluna')!.click();
    await settle();
    expect(last().split('\n')[0]).toBe('| Dia | Lugar |  |');
    el.querySelector<HTMLButtonElement>('.tg-mais-linha')!.click();
    await settle();
    expect(last().split('\n').at(-1)).toBe('|  |  |  |');
    expect(document.activeElement).toBe(cell(2, 0));
  });

  it('o texto que muda por fora reescreve a grade', async () => {
    fixture.componentRef.setInput('text', '| X |\n| --- |\n| y |');
    await settle();
    expect(cell(-1, 0).value).toBe('X');
    expect(cell(0, 0).value).toBe('y');
    expect(cell(1, 0)).toBeNull();
  });
});
