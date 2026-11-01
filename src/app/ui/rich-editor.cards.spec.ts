import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RichEditor } from './rich-editor';
import { comMarkdown } from '../testing/writing-mode.spec';

/**
 * O card na aba Markdown (ver core/callouts.ts): o Inserir › Card, o Enter que continua no card (e sai
 * dele na última linha vazia), o menu "Card" da régua e o que entra num card (o widget, a divisória, o
 * colado) com o "> " na frente de cada linha.
 */
describe('o card no Markdown', () => {
  comMarkdown();
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

  /** Escreve o texto com o cursor no "^" (dois "^", um trecho). */
  function write(marked: string): void {
    const start = marked.indexOf('^');
    const end = marked.indexOf('^', start + 1);
    fixture.componentInstance.value.set(marked.replace(/\^/g, ''));
    fixture.detectChanges();
    area.focus();
    area.setSelectionRange(start, end === -1 ? start : end - 1);
    area.dispatchEvent(new Event('select'));
    area.dispatchEvent(new KeyboardEvent('keyup', { bubbles: true }));
    fixture.detectChanges();
  }
  const value = () => fixture.componentInstance.value();
  const enter = () => area.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
  const caret = () => area.selectionStart;
  function pick(menu: string, name: string): void {
    (fixture.nativeElement.querySelector(`.menu-botao[data-menu="${menu}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
    const items = Array.from(fixture.nativeElement.querySelectorAll('.menu .menu-op') as NodeListOf<HTMLButtonElement>);
    const op = items.find((b) => (b.querySelector('.menu-op-nome')?.textContent ?? '').trim() === name);
    expect(op).withContext(`"${name}" no menu ${menu}`).toBeDefined();
    op!.click();
    fixture.detectChanges();
  }

  it('Inserir › Card: na linha vazia, o card com o cursor no título; com linhas selecionadas, elas vão para dentro', () => {
    write('a\n^');
    pick('inserir', 'Card');
    expect(value()).toBe('a\n> [!nota] \n> ');
    expect(caret()).toBe('a\n> [!nota] '.length);
    write('^um\ndois^\nfora');
    pick('inserir', 'Card');
    expect(value()).toBe('> [!nota] \n> um\n> dois\nfora');
  });

  it('Enter: continua no card (o item com o marcador); na última vazia, sai; antes das marcas, a de sempre', () => {
    write('> [!aviso] T\n> - um^');
    enter();
    expect(value()).toBe('> [!aviso] T\n> - um\n> - ');
    write('> [!aviso] T\n> texto\n> ^');
    enter();
    expect(value()).toBe('> [!aviso] T\n> texto\n');
    // no título, o resto desce para dentro
    write('> [!aviso] Ti^tulo');
    enter();
    expect(value()).toBe('> [!aviso] Ti\n> tulo');
    // no começo da linha de cima, o Enter de sempre: o card fica inteiro
    write('^> [!aviso] T\n> a');
    enter();
    expect(value()).not.toContain('> > [!aviso]');
    // no "> " de uma de dentro: uma linha vazia do card entra em cima
    write('> [!aviso] T\n^> a');
    enter();
    expect(value()).toBe('> [!aviso] T\n>\n> a');
    expect(caret()).toBe('> [!aviso] T\n>\n> '.length);
  });

  it('o menu Card: aparece no card, troca o jeito e o fechar, e desfaz com o cursor no mesmo lugar', () => {
    write('fora');
    expect(fixture.nativeElement.querySelector('.menu-botao[data-menu="card"]')).toBeNull();
    write('> [!nota] T\n> a\n> bc^d');
    expect(fixture.nativeElement.querySelector('.menu-botao[data-menu="card"]')).not.toBeNull();
    pick('card', 'Perigo');
    expect(value()).toBe('> [!perigo] T\n> a\n> bcd');
    pick('card', 'Começa fechado');
    expect(value()).toBe('> [!perigo]- T\n> a\n> bcd');
    pick('card', 'Desfazer o card');
    expect(value()).toBe('T\na\nbcd');
    expect(caret()).toBe('T\na\nbc'.length);
  });

  it('o widget, a divisória e o colado dentro do card levam o "> " em cada linha', () => {
    write('> [!info] T\n> a^');
    const ed = fixture.componentInstance as unknown as { writeWidget(a: HTMLTextAreaElement, w: { start: number; end: number; swap: boolean }, line: string): void; pasteMarkdown(a: HTMLTextAreaElement, md: string): void };
    ed.writeWidget(area, { start: area.selectionStart, end: area.selectionEnd, swap: false }, '| x | y |\n| - | - |\n| 1 | 2 |');
    expect(value()).toBe('> [!info] T\n> a\n> | x | y |\n> | - | - |\n> | 1 | 2 |');
    write('> [!info] T\n> ^');
    ed.writeWidget(area, { start: area.selectionStart, end: area.selectionEnd, swap: false }, '{{contador: 1/1/2030}}');
    expect(value()).toBe('> [!info] T\n> {{contador: 1/1/2030}}');
    write('> [!info] T\n> a^');
    pick('inserir', 'Divisória');
    expect(value()).toBe('> [!info] T\n> a\n> ---\n> ');
    write('> [!info] T\n> ^');
    ed.pasteMarkdown(area, 'um\n\n- dois');
    expect(value()).toBe('> [!info] T\n> um\n>\n> - dois');
  });
});
