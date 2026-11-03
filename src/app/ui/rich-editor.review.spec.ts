import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RichEditor, codeBlockAt, styleAt } from './rich-editor';
import { sanitizeReview } from '../core/review';
import { comMarkdown } from '../testing/writing-mode.spec';

/**
 * O que a revisão do editor e da régua (code-review de 03/nov) consertou: o atalho que tira a marca como
 * o botão, a lista e o Tab dentro do card, o Ctrl+E de várias linhas, as cercas desfeitas num Ctrl+Z só,
 * o bloco de "~~~" e o de quatro crases lidos como a leitura lê, o card sem título desfeito, o título
 * com "|" fora da lista do "[[", e o foco que volta para a folha do Visual ao fechar um menu ou a Ajuda.
 */
describe('a revisão do editor e da régua', () => {
  describe('no Markdown', () => {
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
    const key = (k: string, extra: KeyboardEventInit = {}) => area.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));
    function pick(menu: string, name: string): void {
      (fixture.nativeElement.querySelector(`.menu-botao[data-menu="${menu}"]`) as HTMLButtonElement).click();
      fixture.detectChanges();
      const items = Array.from(fixture.nativeElement.querySelectorAll('.menu .menu-op') as NodeListOf<HTMLButtonElement>);
      const op = items.find((b) => (b.querySelector('.menu-op-nome')?.textContent ?? '').trim() === name);
      expect(op).withContext(`"${name}" no menu ${menu}`).toBeDefined();
      op!.click();
      fixture.detectChanges();
    }

    it('Ctrl+B, Ctrl+I, Ctrl+Shift+X e Ctrl+Shift+H com o cursor dentro da marca a tiram, como o botão', () => {
      write('um **neg^rito** aqui');
      key('b', { ctrlKey: true });
      expect(value()).toBe('um negrito aqui');
      write('um *itá^lico* aqui');
      key('i', { ctrlKey: true });
      expect(value()).toBe('um itálico aqui');
      write('um ~~ris^cado~~ aqui');
      key('X', { ctrlKey: true, shiftKey: true });
      expect(value()).toBe('um riscado aqui');
      write('um ==mar^ca== aqui');
      key('H', { ctrlKey: true, shiftKey: true });
      expect(value()).toBe('um marca aqui');
      // fora da marca, continua pondo
      write('um ^texto^');
      key('b', { ctrlKey: true });
      expect(value()).toBe('um **texto**');
    });

    it('a lista sai das linhas selecionadas mesmo com uma linha vazia no meio', () => {
      write('^- a\n\n- b^');
      key('*', { ctrlKey: true, shiftKey: true, code: 'Digit8' });
      expect(value()).toBe('a\n\nb');
      // e volta (a vazia continua vazia)
      area.setSelectionRange(0, value().length);
      key('*', { ctrlKey: true, shiftKey: true, code: 'Digit8' });
      expect(value()).toBe('- a\n\n- b');
    });

    it('no card, a lista entra depois do "> " (o card continua) e sai de novo; a linha de cima fica', () => {
      write('> [!nota] T\n> comprar ^pão\n> leite');
      key('*', { ctrlKey: true, shiftKey: true, code: 'Digit8' });
      expect(value()).toBe('> [!nota] T\n> - comprar pão\n> leite');
      key('*', { ctrlKey: true, shiftKey: true, code: 'Digit8' });
      expect(value()).toBe('> [!nota] T\n> comprar pão\n> leite');
      // as linhas todas, com a de cima na seleção: só as de dentro viram itens, numeradas a partir do 1
      write('^> [!nota] T\n> um\n>\n> dois^');
      key('&', { ctrlKey: true, shiftKey: true, code: 'Digit7' });
      expect(value()).toBe('> [!nota] T\n> 1. um\n>\n> 2. dois');
    });

    it('no card, o Tab põe o item dentro do de cima (o recuo depois do "> ") e o Shift+Tab volta', () => {
      write('> [!nota] T\n> - a\n> - b^');
      key('Tab');
      expect(value()).toBe('> [!nota] T\n> - a\n>   - b');
      expect(area.selectionStart).toBe(value().length);
      key('Tab', { shiftKey: true });
      expect(value()).toBe('> [!nota] T\n> - a\n> - b');
      // no meio do texto de uma linha do card, os espaços até a coluna par contada depois do "> "
      write('> [!nota] T\n> abc^d');
      key('Tab');
      expect(value()).toBe('> [!nota] T\n> abc d');
      // fora de card, como sempre
      write('- a\n- b^');
      key('Tab');
      expect(value()).toBe('- a\n  - b');
    });

    it('no card, o Shift+Enter num item abre a linha de dentro dele, com o "> " (o card não acaba)', () => {
      write('> [!nota] T\n> - [ ] pão^');
      key('Enter', { shiftKey: true });
      expect(value()).toBe('> [!nota] T\n> - [ ] pão\n> ' + ' '.repeat(6));
      expect(area.selectionStart).toBe(value().length);
    });

    it('Ctrl+E em várias linhas: o bloco de linhas inteiras (no card, com o "> " nas cercas); dentro dele, sai', () => {
      // a seleção começando no meio da linha não gruda as crases no texto
      write('hel^lo\nwor^ld');
      key('e', { ctrlKey: true });
      expect(value()).toBe('```\nhello\nworld\n```');
      expect(styleAt(value(), value().indexOf('wor'))).toBe('codigo');
      // dentro do bloco, numa linha vazia ou com várias linhas, o bloco sai
      area.setSelectionRange(5, 15);
      key('e', { ctrlKey: true });
      expect(value()).toBe('hello\nworld');
      write('> [!nota] T\n> ^a\n> b^');
      key('e', { ctrlKey: true });
      expect(value()).toBe('> [!nota] T\n> ```\n> a\n> b\n> ```');
    });

    it('tirar o bloco de código (o Texto normal) é um passo só do Desfazer: um Ctrl+Z traz as duas cercas', () => {
      write('antes\n```\nx = 1^\n```\ndepois');
      pick('formatar', 'Texto normal');
      expect(value()).toBe('antes\nx = 1\ndepois');
      expect(value().slice(0, area.selectionStart)).toBe('antes\nx = 1');
      document.execCommand('undo');
      fixture.detectChanges();
      expect(value()).toBe('antes\n```\nx = 1\n```\ndepois');
    });

    it('desfazer o card só com a linha de cima, sem título: o cursor fica onde o card estava', () => {
      write('antes\n> [!nota]^\ndepois');
      pick('card', 'Desfazer o card');
      expect(value()).toBe('antes\n\ndepois');
      expect(area.selectionStart).toBe('antes\n'.length);
      expect(area.selectionEnd).toBe('antes\n'.length);
    });

    it('o bloco de "~~~" e o de quatro crases são lidos como a leitura lê', () => {
      const tis = '~~~python\nx = 1\n~~~\nfora';
      expect(styleAt(tis, tis.indexOf('x'))).toBe('codigo');
      expect(styleAt(tis, tis.length)).toBe('texto');
      expect(codeBlockAt(tis, tis.indexOf('x'))).toEqual({ open: 0, close: 2, body: 'x = 1', info: 'python' });
      // o "```js" de dentro de um bloco de quatro crases é texto dele, não a cerca que fecha
      const quatro = '````md\n```js\nx\n```\n````\nfora';
      expect(codeBlockAt(quatro, quatro.indexOf('x'))).toEqual({ open: 0, close: 4, body: '```js\nx\n```', info: 'md' });
      expect(styleAt(quatro, quatro.indexOf('x'))).toBe('codigo');
      expect(styleAt(quatro, quatro.length)).toBe('texto');
      // as crases não fecham o bloco de tis
      const mistura = '~~~\n```\ny\n~~~\nfora';
      expect(styleAt(mistura, mistura.indexOf('y'))).toBe('codigo');
      expect(styleAt(mistura, mistura.length)).toBe('texto');
    });

    it('o menu Código troca a linguagem também do bloco de "~~~"', () => {
      write('~~~py\nx^\n~~~');
      expect(fixture.nativeElement.querySelector('.menu-botao[data-menu="codigo"]')).not.toBeNull();
      const editor = fixture.componentInstance as unknown as { codeAct(a: HTMLTextAreaElement, big: boolean, what: { lingua: string }): void };
      editor.codeAct(area, false, { lingua: 'js' });
      expect(value()).toBe('~~~js\nx\n~~~');
    });

    it('a lista do "[[" não oferece o título com "|" (o link abriria outra anotação)', () => {
      const notes = [
        sanitizeReview({ id: 'n1', kind: 'anotacoes', game: { name: 'Prós|Contras' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })!,
        sanitizeReview({ id: 'n2', kind: 'anotacoes', game: { name: 'Prós e contras' }, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' })!,
      ];
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      write('[[Pró^');
      area.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      const options = Array.from(fixture.nativeElement.querySelectorAll('.elo-op') as NodeListOf<HTMLElement>).map((o) => o.textContent!.replace(/\s+/g, ' ').trim());
      expect(options.some((o) => o.includes('Prós e contras'))).toBeTrue();
      expect(options.some((o) => o.includes('Prós|Contras'))).toBeFalse();
    });
  });

  describe('no Visual', () => {
    let fixture: ComponentFixture<RichEditor>;

    beforeEach(async () => {
      localStorage.setItem('mural-de-jogos:config:v1', JSON.stringify({ escrita: 'visual' }));
      TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
      fixture = TestBed.createComponent(RichEditor);
      fixture.componentRef.setInput('label', 'Anotação');
      fixture.componentInstance.value.set('um texto');
      document.body.appendChild(fixture.nativeElement);
      fixture.detectChanges();
      await fixture.whenStable();
      // o Visual chega num pedaço à parte
      for (let i = 0; i < 300 && !fixture.nativeElement.querySelector('.visual .ProseMirror'); i++) {
        await wait(10);
        fixture.detectChanges();
      }
      await fixture.whenStable();
    });

    afterEach(() => {
      fixture.destroy();
      fixture.nativeElement.remove();
      localStorage.removeItem('mural-de-jogos:config:v1');
    });

    const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
    const sheet = () => fixture.nativeElement.querySelector('.visual .ProseMirror') as HTMLElement;
    const inSheet = () => sheet().contains(document.activeElement);

    it('fechar o menu pelo próprio botão devolve o foco para a folha do Visual (não para a do Markdown, escondida)', async () => {
      const formatar = fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement;
      formatar.click();
      fixture.detectChanges();
      await wait();
      expect(fixture.nativeElement.querySelector('.menu')).not.toBeNull();
      expect(inSheet()).toBeFalse();
      formatar.click();
      fixture.detectChanges();
      await wait();
      expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
      expect(inSheet()).withContext('o foco na folha do Visual').toBeTrue();
    });

    it('fechar a Ajuda pelo X devolve o foco para a folha do Visual', async () => {
      (fixture.nativeElement.querySelector('button[aria-label="Ajuda: como escrever cada marca"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      await wait();
      const close = fixture.nativeElement.querySelector('.guia .painel-fechar') as HTMLButtonElement;
      close.focus();
      expect(inSheet()).toBeFalse();
      close.click();
      fixture.detectChanges();
      await wait();
      expect(fixture.nativeElement.querySelector('.guia')).toBeNull();
      expect(inSheet()).withContext('o foco na folha do Visual').toBeTrue();
    });
  });
});
