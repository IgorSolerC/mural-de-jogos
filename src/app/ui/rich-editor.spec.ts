import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RichEditor } from './rich-editor';

describe('a régua de formatação do texto', () => {
  let fixture: ComponentFixture<RichEditor>;
  let area: HTMLTextAreaElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RichEditor);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    area = fixture.nativeElement.querySelector('textarea');
  });

  afterEach(() => fixture.nativeElement.remove());

  /** Escreve o texto com a seleção marcada por | (um para o cursor, dois para um trecho). */
  function write(marked: string): void {
    const start = marked.indexOf('|');
    const end = marked.indexOf('|', start + 1);
    const text = marked.replace(/\|/g, '');
    fixture.componentInstance.value.set(text);
    fixture.detectChanges();
    area.focus();
    area.setSelectionRange(start, end === -1 ? start : end - 1);
  }
  const button = (name: string) => fixture.nativeElement.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
  const value = () => fixture.componentInstance.value();
  const key = (k: string, extra: KeyboardEventInit = {}) => area.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

  it('negrito em volta da seleção, sem pegar os espaços das pontas; de novo, tira', () => {
    write('um |ótimo |jogo');
    button('Negrito').click();
    expect(value()).toBe('um **ótimo** jogo');
    button('Negrito').click();
    expect(value()).toBe('um ótimo jogo');
  });

  it('itálico num negrito vira os dois; Ctrl+I tira de novo', () => {
    write('**|bom|**');
    button('Itálico').click();
    expect(value()).toBe('***bom***');
    key('i', { ctrlKey: true });
    expect(value()).toBe('**bom**');
  });

  it('sem seleção, as marcas ficam com o cursor no meio', () => {
    write('a |');
    key('b', { ctrlKey: true });
    expect(value()).toBe('a ****');
    expect(area.selectionStart).toBe(4);
  });

  it('lista, numerada e tarefas nas linhas da seleção; a mesma de novo volta a ser texto', () => {
    write('|leite\novos|');
    button('Tarefas').click();
    expect(value()).toBe('- [ ] leite\n- [ ] ovos');
    button('Lista numerada').click();
    expect(value()).toBe('1. leite\n2. ovos');
    area.setSelectionRange(0, value().length);
    button('Lista numerada').click();
    expect(value()).toBe('leite\novos');
  });

  it('Enter num item continua a lista; num item vazio, termina', () => {
    write('- [x] leite|');
    key('Enter');
    expect(value()).toBe('- [x] leite\n- [ ] ');
    key('Enter');
    expect(value()).toBe('- [x] leite\n');
    write('3. três|');
    key('Enter');
    expect(value()).toBe('3. três\n4. ');
  });

  it('Enter fora de lista é um Enter comum', () => {
    write('texto|');
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    area.dispatchEvent(e);
    expect(e.defaultPrevented).toBeFalse();
  });

  it('"Ver como fica" mostra o texto formatado no lugar do campo, e as tarefas se marcam ali', async () => {
    write('- [ ] leite|');
    (fixture.nativeElement.querySelector('.ver') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(area.hidden).toBeTrue();
    expect(button('Negrito').disabled).toBeTrue();
    const box = fixture.nativeElement.querySelector('.previa input[type=checkbox]') as HTMLInputElement;
    box.click();
    expect(value()).toBe('- [x] leite');
  });
});
