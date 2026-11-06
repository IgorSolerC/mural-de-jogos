import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { RichEditor, codeBlockAt } from './rich-editor';
import { Toasts } from './toast';
import { comMarkdown } from '../testing/writing-mode.spec';

/**
 * O bloco de código na aba Markdown ("```js", ver core/code-langs.ts): o menu "Código" da régua (que
 * aparece com o cursor num bloco, como o do card), a linguagem escrita depois das crases, copiar, desfazer
 * o bloco, e o Inserir › Bloco de código, que já abre o menu perguntando a linguagem.
 */
describe('o bloco de código no Markdown', () => {
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

  /** Escreve o texto com o cursor no "^". */
  function write(marked: string): void {
    fixture.componentInstance.value.set(marked.replace('^', ''));
    fixture.detectChanges();
    area.focus();
    area.setSelectionRange(marked.indexOf('^'), marked.indexOf('^'));
    area.dispatchEvent(new Event('select'));
    fixture.detectChanges();
  }
  const value = () => fixture.componentInstance.value();
  const codeButton = () => fixture.nativeElement.querySelector('.menu-botao[data-menu="codigo"]') as HTMLButtonElement | null;
  /** Abre o menu "Código" (ele chega num pedaço à parte). */
  async function openCode(): Promise<HTMLElement> {
    if (codeButton()!.getAttribute('aria-expanded') !== 'true') codeButton()!.click();
    fixture.detectChanges();
    for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
    fixture.detectChanges();
    await fixture.whenStable();
    return fixture.nativeElement.querySelector('app-code-langs') as HTMLElement;
  }
  const options = (menu: HTMLElement, where = '') => Array.from(menu.querySelectorAll<HTMLButtonElement>(where + ' .menu-op'));
  const option = (menu: HTMLElement, name: string) => options(menu).find((b) => b.querySelector('.nome')?.textContent?.trim().startsWith(name));

  it('codeBlockAt: as cercas em volta da linha, o de dentro e a linguagem (também dentro de um card)', () => {
    const t = 'a\n```js\nx\ny\n```\nb';
    expect(codeBlockAt(t, t.indexOf('y'))).toEqual({ open: 1, close: 4, body: 'x\ny', info: 'js' });
    expect(codeBlockAt(t, 0)).toBeNull();
    expect(codeBlockAt(t, t.length)).toBeNull();
    const card = '> [!nota] T\n> ``` python\n> z = 1\n> ```';
    expect(codeBlockAt(card, card.indexOf('z'))).toEqual({ open: 1, close: 3, body: 'z = 1', info: 'python' });
    // sem a cerca que fecha: até o fim
    expect(codeBlockAt('```\nsolto', 6)).toEqual({ open: 0, close: null, body: 'solto', info: '' });
  });

  describe('as teclas de dentro do bloco (as mesmas do Visual)', () => {
    /** O texto com a seleção de "^" a "^" (ou o cursor no "^"). */
    function mark(marked: string): void {
      const from = marked.indexOf('^');
      const second = marked.indexOf('^', from + 1);
      const text = marked.replace(/\^/g, '');
      fixture.componentInstance.value.set(text);
      fixture.detectChanges();
      area.focus();
      area.setSelectionRange(from, second < 0 ? from : second - 1);
      area.dispatchEvent(new Event('select'));
      fixture.detectChanges();
    }
    function key(k: string, init: KeyboardEventInit = {}): KeyboardEvent {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
      area.dispatchEvent(e);
      fixture.detectChanges();
      return e;
    }
    const shown = () => {
      const t = value();
      const [s, e] = [area.selectionStart, area.selectionEnd];
      return s === e ? t.slice(0, s) + '^' + t.slice(s) : t.slice(0, s) + '^' + t.slice(s, e) + '^' + t.slice(e);
    };

    it('o Enter mantém o recuo, sem virar item nem na lista nem em "- x"', () => {
      mark('- item\n  ```\n  a^\n  ```\n- outro');
      expect(key('Enter').defaultPrevented).toBeTrue();
      expect(shown()).toBe('- item\n  ```\n  a\n  ^\n  ```\n- outro');
      mark('```\n- x^\n```');
      key('Enter');
      expect(shown()).toBe('```\n- x\n^\n```');
      mark('```js\n  if (a) {^}\n```');
      key('Enter');
      expect(shown()).toBe('```js\n  if (a) {\n    ^\n  }\n```');
    });

    it('o Shift+Enter e o Enter nas letras sem recuo não abrem item nem tiram a margem de quem tem', () => {
      mark('   1.2. item\n        ```\nINSERT^\n        ```');
      key('Enter');
      expect(shown()).toBe('   1.2. item\n        ```\nINSERT\n^\n        ```');
      mark('- item\n  ```\n  a^\n  ```');
      key('Enter', { shiftKey: true });
      expect(shown()).toBe('- item\n  ```\n  a\n  ^\n  ```');
    });

    it('Tab e Shift+Tab: o recuo depois da margem, sem sair do bloco', () => {
      mark('- item\n  ```\n  a^\n  ```');
      expect(key('Tab').defaultPrevented).toBeTrue();
      expect(shown()).toBe('- item\n  ```\n  a ^\n  ```');
      mark('- item\n  ```\n  ^a^\n  b\n  ```');
      key('Tab');
      expect(shown()).toBe('- item\n  ```\n  ^  a^\n  b\n  ```');
      expect(key('Tab', { shiftKey: true }).defaultPrevented).toBeTrue();
      expect(shown()).toBe('- item\n  ```\n  ^a^\n  b\n  ```');
      // sem nada para tirar: a tecla fica no bloco, e a margem também
      expect(key('Tab', { shiftKey: true }).defaultPrevented).toBeTrue();
      expect(value()).toBe('- item\n  ```\n  a\n  b\n  ```');
    });

    it('no card, o "> " fica', () => {
      mark('> [!nota] T\n> ```\n> a^\n> ```');
      key('Enter');
      expect(shown()).toBe('> [!nota] T\n> ```\n> a\n> ^\n> ```');
      key('Tab');
      expect(shown()).toBe('> [!nota] T\n> ```\n> a\n>   ^\n> ```');
      key('Backspace');
      expect(shown()).toBe('> [!nota] T\n> ```\n> a\n> ^\n> ```');
    });

    it('o Backspace no recuo volta uma parada; nas letras, é o do navegador', () => {
      mark('```\na\n  b\n    ^c\n```');
      expect(key('Backspace').defaultPrevented).toBeTrue();
      expect(shown()).toBe('```\na\n  b\n  ^c\n```');
      mark('```\nab^\n```');
      expect(key('Backspace').defaultPrevented).toBeFalse();
    });

    it('Alt+setas, Shift+Alt+setas, Ctrl+Shift+K e Ctrl+/', () => {
      mark('```py\na^\nb\n```');
      key('ArrowDown', { altKey: true });
      expect(shown()).toBe('```py\nb\na^\n```');
      // o bloco é o limite: a cerca não entra na conta
      expect(key('ArrowDown', { altKey: true }).defaultPrevented).toBeTrue();
      expect(shown()).toBe('```py\nb\na^\n```');
      key('ArrowUp', { altKey: true, shiftKey: true });
      expect(shown()).toBe('```py\nb\na^\na\n```');
      key('k', { ctrlKey: true, shiftKey: true });
      expect(shown()).toBe('```py\nb\na^\n```');
      expect(key('/', { ctrlKey: true, code: 'Slash' }).defaultPrevented).toBeTrue();
      expect(shown()).toBe('```py\nb\n# a^\n```');
    });

    it('sem saber comentar, o Ctrl+/ continua sendo a Ajuda; e o negrito não entra no código', () => {
      mark('```\nab^\n```');
      key('/', { ctrlKey: true, code: 'Slash' });
      expect(value()).toBe('```\nab\n```');
      expect(fixture.nativeElement.querySelector('.guia')).not.toBeNull();
      mark('```\n^ab^\n```');
      expect(key('b', { ctrlKey: true }).defaultPrevented).toBeTrue();
      expect(value()).toBe('```\nab\n```');
    });

    it('fora do bloco e em cima da cerca, as teclas são as de sempre', () => {
      mark('- a^\n```\nb\n```');
      key('Enter');
      expect(value()).toBe('- a\n- \n```\nb\n```');
      mark('```^\nb\n```');
      expect(key('Tab').defaultPrevented).toBeTrue();
      // (o cursor no fim da cerca: o Tab de sempre, os espaços até a próxima coluna par)
      expect(value()).toBe('``` \nb\n```');
    });

    it('o Enter no fim da cerca sem par já traz a que fecha, no recuo dela; com par, só a linha', () => {
      mark('texto\n```js^\nresto');
      expect(key('Enter').defaultPrevented).toBeTrue();
      expect(shown()).toBe('texto\n```js\n^\n```\nresto');
      mark('- item\n  ```^');
      key('Enter');
      expect(shown()).toBe('- item\n  ```\n  ^\n  ```');
      mark('> [!nota] T\n> ```^');
      key('Enter');
      expect(shown()).toBe('> [!nota] T\n> ```\n> ^\n> ```');
      mark('```^\na\n```');
      key('Enter');
      expect(shown()).toBe('```\n^\na\n```');
      // em cima de um bloco que já tem as duas: a nova é de outro bloco, e ganha a dela
      mark('```^\n\n```\na\n```');
      key('Enter');
      expect(shown()).toBe('```\n^\n```\n\n```\na\n```');
      mark('```^\n```\na\n```\nb');
      key('Enter');
      expect(value()).toBe('```\n\n```\n```\na\n```\nb');
    });

    it('o Ctrl+E dentro do bloco desfaz o bloco, como no Visual, sem pôr crases no código', () => {
      mark('```\nab^\n```');
      key('e', { ctrlKey: true });
      expect(value()).toBe('ab');
    });

    it('o bloco sem a que fecha, num card, acaba no fim do card', () => {
      mark('> [!nota] T\n> ```\n> a^\ntexto de fora');
      key('ArrowDown', { altKey: true });
      expect(value()).toBe('> [!nota] T\n> ```\n> a\ntexto de fora');
    });

    it('a cerca recuada sem par: o item seguinte continua a lista', () => {
      mark('- a\n  ```\n  b\n- c^');
      key('Enter');
      expect(value()).toBe('- a\n  ```\n  b\n- c\n- ');
    });

    it('o Copiar leva as letras sem o recuo da cerca', () => {
      expect(codeBlockAt('- i\n    ```\n    a\n      b\n    ```', 14)?.body).toBe('a\n  b');
    });
  });

  it('o tema: troca o que vem depois das crases, e a linguagem fica', async () => {
    write('```ts\nlet^ a\n```');
    const menu = await openCode();
    const tema = (name: string) => Array.from(menu.querySelectorAll<HTMLButtonElement>('.menu-op')).find((b) => b.querySelector('.amostra') && b.querySelector('.nome')?.textContent?.trim().startsWith(name))!;
    expect(tema('Padrão').getAttribute('aria-checked')).toBe('true');
    tema('Dracula').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(value()).toBe('```ts tema=dracula\nlet a\n```');
    // o menu fica aberto, com o foco nele, para comparar um tema com o outro
    expect(fixture.nativeElement.querySelector('app-code-langs')).not.toBeNull();
    expect(menu.contains(document.activeElement)).toBeTrue();
    expect(tema('Dracula').getAttribute('aria-checked')).toBe('true');
    tema('Xcode').click();
    fixture.detectChanges();
    await fixture.whenStable();
    expect(value()).toBe('```ts tema=xcode\nlet a\n```');
    expect(area.selectionStart).toBe('```ts tema=xcode\nlet'.length);
    fixture.componentInstance.value.set('```ts tema=dracula\nlet a\n```');
    fixture.detectChanges();
    write('```ts tema=dracula\nlet^ a\n```');
    const de = await openCode();
    const t2 = (name: string) => Array.from(de.querySelectorAll<HTMLButtonElement>('.menu-op')).find((b) => b.querySelector('.amostra') && b.querySelector('.nome')?.textContent?.trim().startsWith(name))!;
    expect(t2('Dracula').getAttribute('aria-checked')).toBe('true');
    expect(option(de, 'TypeScript')!.getAttribute('aria-checked')).toBe('true');
    t2('Padrão').click();
    fixture.detectChanges();
    expect(value()).toBe('```ts\nlet a\n```');
  });

  it('o menu aparece só no bloco; abre com o foco no campo, mostra as comuns e marca a de agora', async () => {
    write('fora^\n```ts\nlet a\n```');
    expect(codeButton()).toBeNull();
    write('fora\n```ts\nlet^ a\n```');
    expect(codeButton()).not.toBeNull();
    const menu = await openCode();
    await new Promise((r) => setTimeout(r));
    expect(document.activeElement).toBe(menu.querySelector('input'));
    expect(option(menu, 'TypeScript')!.getAttribute('aria-checked')).toBe('true');
    expect(option(menu, 'Sem linguagem')!.getAttribute('aria-checked')).toBe('false');
    // a palavra que vai depois das crases, num recorte, ao lado de cada nome
    expect(option(menu, 'Python')!.querySelector('.cod-recorte')!.textContent).toBe('python');
  });

  it('escolher troca o que vem depois das crases (o cursor fica no lugar); "Sem linguagem" tira', async () => {
    write('```ts\nlet^ a\n```');
    option(await openCode(), 'Python')!.click();
    fixture.detectChanges();
    expect(value()).toBe('```python\nlet a\n```');
    expect(area.selectionStart).toBe('```python\nlet'.length);
    write('```python\nlet^ a\n```');
    option(await openCode(), 'Sem linguagem')!.click();
    fixture.detectChanges();
    expect(value()).toBe('```\nlet a\n```');
  });

  it('o campo filtra; Enter escolhe a primeira, ou o nome que o site não conhece (sem cores)', async () => {
    write('```\nx^\n```');
    let menu = await openCode();
    const input = menu.querySelector('input')!;
    input.value = 'kot';
    input.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    const names = options(menu, '.lista').map((b) => b.querySelector('.nome')!.textContent!.trim());
    // a que responde primeiro; "Usar" o que se escreveu, no fim (o Enter fica com a primeira)
    expect(names.length).toBe(2);
    expect(names[0]).toBe('Kotlin');
    expect(names[1]).toContain('Usar “kot”');
    input.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(value()).toBe('```kotlin\nx\n```');
    write('```kotlin\nx^\n```');
    menu = await openCode();
    const field = menu.querySelector('input')!;
    field.value = 'elixir';
    field.dispatchEvent(new Event('input'));
    fixture.detectChanges();
    expect(option(menu, 'Usar “elixir”')).toBeDefined();
    field.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
    fixture.detectChanges();
    expect(value()).toBe('```elixir\nx\n```');
  });

  it('dentro de um card, o "> " da linha da cerca fica', async () => {
    write('> [!nota] T\n> ```\n> a^\n> ```');
    option(await openCode(), 'SQL')!.click();
    fixture.detectChanges();
    expect(value()).toBe('> [!nota] T\n> ```sql\n> a\n> ```');
  });

  it('no card: Desfazer tira as cercas do bloco dele (não as de outro bloco), e o Inserir põe as cercas com o "> "', async () => {
    write('```\nfora\n```\n> [!nota] T\n> ```js\n> a^\n> ```\ndepois');
    option(await openCode(), 'Desfazer o bloco')!.click();
    fixture.detectChanges();
    expect(value()).toBe('```\nfora\n```\n> [!nota] T\n> a\ndepois');
    write('> [!nota] T\n> linha^');
    (fixture.nativeElement.querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    Array.from(fixture.nativeElement.querySelectorAll('.menu .menu-op') as NodeListOf<HTMLButtonElement>)
      .find((b) => b.textContent!.includes('Bloco de código'))!
      .click();
    fixture.detectChanges();
    expect(value()).toBe('> [!nota] T\n> ```\n> linha\n> ```');
  });

  it('trocar a linguagem deixa o resto do que vem depois das crases', async () => {
    write('```python title=main.py\nx^\n```');
    option(await openCode(), 'SQL')!.click();
    fixture.detectChanges();
    expect(value()).toBe('```sql title=main.py\nx\n```');
  });

  it('Copiar o código leva só as letras; Desfazer o bloco tira as cercas', async () => {
    const shown = spyOn(TestBed.inject(Toasts), 'show');
    const copied = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
    write('```js\nconst a^ = 1\n```');
    option(await openCode(), 'Copiar o código')!.click();
    await fixture.whenStable();
    await Promise.resolve();
    expect(copied).toHaveBeenCalledWith('const a = 1');
    expect(shown).toHaveBeenCalledWith('Código copiado: é só colar');
    write('```js\nconst a^ = 1\n```');
    option(await openCode(), 'Desfazer o bloco')!.click();
    fixture.detectChanges();
    expect(value()).toBe('const a = 1');
  });

  it('Inserir › Bloco de código: o bloco na linha do cursor, já com o menu aberto perguntando a linguagem', async () => {
    write('^');
    (fixture.nativeElement.querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
    fixture.detectChanges();
    const op = Array.from(fixture.nativeElement.querySelectorAll('.menu .menu-op') as NodeListOf<HTMLButtonElement>).find((b) => b.textContent!.includes('Bloco de código'));
    expect(op?.querySelector('kbd')?.textContent).toBe('```');
    op!.click();
    fixture.detectChanges();
    expect(value()).toBe('```\n\n```');
    const menu = await openCode();
    expect(menu).not.toBeNull();
    option(menu, 'JavaScript')!.click();
    fixture.detectChanges();
    expect(value()).toBe('```js\n\n```');
  });
});
