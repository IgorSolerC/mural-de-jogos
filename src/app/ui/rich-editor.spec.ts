import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RichEditor } from './rich-editor';
import { sanitizeReview } from '../core/review';

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

  describe('o link para outra anotação', () => {
    const notes = [
      sanitizeReview({ id: 'n1', kind: 'anotacoes', game: { name: 'Comprar um console' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })!,
      sanitizeReview({ id: 'n2', kind: 'anotacoes', game: { name: 'Lista do mercado' }, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' })!,
    ];
    const options = () => Array.from(fixture.nativeElement.querySelectorAll('.elo-op') as NodeListOf<HTMLElement>).map((o) => o.textContent!.replace(/\s+/g, ' ').trim());

    function typeAt(marked: string): void {
      write(marked);
      area.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    it('sem `notes` (a resenha), nada de link na régua', () => {
      expect(button('Link para outra anotação')).toBeNull();
    });

    it('"[[" na folha abre a lista, filtra pelo que vem depois, e Enter põe o link', () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      typeAt('1. Arrumar o carro\n2. [[cons|');
      expect(options().length).toBe(2);
      expect(options()[0]).toContain('Comprar um console');
      expect(options()[1]).toContain('Link para “cons”');
      key('Enter');
      fixture.detectChanges();
      expect(value()).toBe('1. Arrumar o carro\n2. [[Comprar um console]]');
      expect(fixture.nativeElement.querySelector('.elos')).toBeNull();
    });

    it('Esc fecha só a lista (e ela não volta no mesmo "[["); um título novo vira link mesmo sem anotação', () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      typeAt('[[Vender a TV|');
      expect(options().length).toBe(1);
      expect(options()[0]).toContain('Link para “Vender a TV”');
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      area.dispatchEvent(esc);
      fixture.detectChanges();
      expect(esc.defaultPrevented).toBeTrue();
      expect(fixture.nativeElement.querySelector('.elos')).toBeNull();
      area.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.elos')).toBeNull();
      // apagou o "[[": o próximo abre a lista de novo
      typeAt('Vender a TV|');
      typeAt('[[Lista|]]');
      key('ArrowDown');
      key('ArrowUp');
      key('Tab');
      expect(value()).toBe('[[Lista do mercado]]');
    });

    it('pela régua: a busca já vem com o trecho selecionado, e a escolha troca o trecho pelo link', async () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      write('ver |mercado| amanhã');
      button('Link para outra anotação').click();
      fixture.detectChanges();
      const search = fixture.nativeElement.querySelector('.elos-campo') as HTMLInputElement;
      expect(search.value).toBe('mercado');
      expect(options()[0]).toContain('Lista do mercado');
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      expect(value()).toBe('ver [[Lista do mercado]] amanhã');
    });
  });
});
