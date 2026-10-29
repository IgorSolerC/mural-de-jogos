import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { RichEditor, styleAt } from './rich-editor';
import { sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { closeDialog } from '../testing/dialog-close.spec';
import { WidgetDef, WidgetSize, widgetDef } from '../core/widgets';
import { deleteDatabase } from '../core/erase-save';
import { IMAGES_DB, ImageStore } from '../core/image-store';
import { samplePng } from '../core/images.spec';
import { Toasts } from './toast';

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
  /** Abre um menu da régua ("formatar", "inserir") e toca no item pelo nome. */
  function pick(menu: string, name: string): void {
    (fixture.nativeElement.querySelector(`.menu-botao[data-menu="${menu}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
    const items = Array.from(fixture.nativeElement.querySelectorAll('.menu .menu-op') as NodeListOf<HTMLButtonElement>);
    const op = items.find((b) => (b.querySelector('.menu-op-nome')?.textContent ?? '').trim() === name);
    expect(op).withContext(`"${name}" no menu ${menu}`).toBeDefined();
    op!.click();
    fixture.detectChanges();
  }
  const value = () => fixture.componentInstance.value();
  const key = (k: string, extra: KeyboardEventInit = {}) => area.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

  describe('a imagem colada ou solta na folha', () => {
    beforeEach(() => deleteDatabase(IMAGES_DB));
    afterAll(() => deleteDatabase(IMAGES_DB));

    async function until(check: () => boolean): Promise<void> {
      for (let i = 0; i < 200 && !check(); i++) await new Promise((r) => setTimeout(r, 10));
      fixture.detectChanges();
    }
    const imageLine = /^\{\{imagem: murall:\/\/imagem\/[A-Za-z0-9_-]{22}\}\}$/;

    it('colar uma imagem: ela é guardada e vira o widget numa linha só dele, depois da linha do cursor', async () => {
      write('a praia| de ontem\nfim');
      const data = new DataTransfer();
      data.items.add(new File([await samplePng(1200, 800)], 'print.png', { type: 'image/png' }));
      const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
      area.dispatchEvent(paste);
      expect(paste.defaultPrevented).toBeTrue();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.guardando')?.textContent).toContain('Guardando a imagem');
      await until(() => value().includes('{{imagem'));
      const lines = value().split('\n');
      expect(lines[0]).toBe('a praia de ontem');
      expect(lines[1]).toMatch(imageLine);
      expect(lines[2]).toBe('fim');
      expect(fixture.nativeElement.querySelector('.guardando')).toBeNull();
      const id = /imagem\/([\w-]{22})/.exec(lines[1])![1];
      expect((await TestBed.inject(ImageStore).get(id))?.largura).toBe(900);
    });

    it('colar o que traz texto junto (as células de uma planilha trazem a foto delas): vale o texto', () => {
      write('|');
      const data = new DataTransfer();
      data.setData('text/plain', 'a\tb');
      data.items.add(new File(['x'], 'celulas.png', { type: 'image/png' }));
      const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
      area.dispatchEvent(paste);
      expect(paste.defaultPrevented).toBeFalse();
    });

    it('soltar uma imagem na folha também; outro arquivo não abre por cima do Murall', async () => {
      write('|');
      const data = new DataTransfer();
      data.items.add(new File([await samplePng(300, 200)], 'foto.png', { type: 'image/png' }));
      const over = new DragEvent('dragover', { bubbles: true, cancelable: true, dataTransfer: data });
      area.dispatchEvent(over);
      expect(over.defaultPrevented).toBeTrue();
      area.dispatchEvent(new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: data }));
      await until(() => value().includes('{{imagem'));
      expect(value()).toMatch(imageLine);
      const other = new DataTransfer();
      other.items.add(new File(['x'], 'nota.pdf', { type: 'application/pdf' }));
      const drop = new DragEvent('drop', { bubbles: true, cancelable: true, dataTransfer: other });
      area.dispatchEvent(drop);
      expect(drop.defaultPrevented).toBeTrue();
    });

    it('colar um texto com a imagem de outra pessoa: ela vira uma cópia sua, e o texto colado leva o id da cópia', async () => {
      const store = TestBed.inject(ImageStore);
      const mine = await store.add(await samplePng(200, 100));
      const theirs = 'DaBiaDaCompartilhada03';
      await store.fromCloud(theirs, await samplePng(300, 200), 300, 200, true);
      const toasts = TestBed.inject(Toasts);
      write('antes |depois');
      const data = new DataTransfer();
      data.setData('text/plain', `{{imagem: murall://imagem/${theirs} | foto | Dela}}\n{{imagem: murall://imagem/${mine.id}}}\n`);
      const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
      area.dispatchEvent(paste);
      expect(paste.defaultPrevented).toBeTrue();
      await until(() => value().includes('{{imagem'));
      const copy = /imagem\/([\w-]{22}) \| foto \| Dela/.exec(value())?.[1];
      expect(copy).toBeDefined();
      expect(copy).not.toBe(theirs);
      expect((await store.get(copy!))?.alheia).toBeUndefined();
      expect(value()).withContext('a sua fica como veio').toContain(`murall://imagem/${mine.id}}}`);
      expect(value().startsWith('antes {{imagem')).toBeTrue();
      expect(value().endsWith('\ndepois')).toBeTrue();
      expect(toasts.current()?.text).toContain('guardei uma cópia sua');
    });

    it('colar um texto só com as suas imagens: entra como veio, sem bilhete', async () => {
      const mine = await TestBed.inject(ImageStore).add(await samplePng(200, 100));
      const toasts = TestBed.inject(Toasts);
      write('|');
      const data = new DataTransfer();
      data.setData('text/plain', `{{imagem: murall://imagem/${mine.id}}}`);
      area.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
      await until(() => value().includes('{{imagem'));
      expect(value()).toBe(`{{imagem: murall://imagem/${mine.id}}}`);
      expect(toasts.current()).toBeNull();
    });

    it('o que não abre avisa no bilhete, e o texto fica como estava', async () => {
      write('oi|');
      const toasts = TestBed.inject(Toasts);
      const data = new DataTransfer();
      data.items.add(new File([new Uint8Array([1, 2, 3])], 'foto.heic', { type: 'image/heic' }));
      area.dispatchEvent(new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data }));
      await until(() => !!toasts.current());
      expect(toasts.current()?.text).toContain('não abre aqui');
      expect(value()).toBe('oi');
    });
  });

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

  it('"Sutil" no Formatar põe "((" e "))" em volta da seleção; de novo, tira', () => {
    write('zerei |no fácil| ontem');
    pick('formatar', 'Sutil');
    expect(value()).toBe('zerei ((no fácil)) ontem');
    expect(value().slice(area.selectionStart, area.selectionEnd)).toBe('no fácil');
    pick('formatar', 'Sutil');
    expect(value()).toBe('zerei no fácil ontem');
    write('a |');
    pick('formatar', 'Sutil');
    expect(value()).toBe('a (())');
    expect(area.selectionStart).toBe(4);
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

  it('Enter no começo de um item: um item vazio entra em cima, e este desce com o seu marcador (sem dobrar)', () => {
    write('- [ ] leite\n|- [x] ovos');
    key('Enter');
    expect(value()).toBe('- [ ] leite\n- [ ] \n- [x] ovos');
    expect(area.selectionStart).toBe('- [ ] leite\n- [ ] \n- [x] '.length);
    write('  * |pão');
    key('Enter');
    expect(value()).toBe('  * \n  * pão');
    // no meio do marcador também
    write('- [|x] café');
    key('Enter');
    expect(value()).toBe('- [ ] \n- [x] café');
    write('|3) três\n4) quatro');
    key('Enter');
    expect(value()).toBe('3) \n4) três\n5) quatro');
    // no meio do texto, continua partindo o item em dois
    write('- le|ite');
    key('Enter');
    expect(value()).toBe('- le\n- ite');
  });

  it('o item numerado novo no meio da lista: os de baixo descem um número, e os de dentro deles vão junto', () => {
    write('1. teste1\n2. teste2|\n3. teste3\n4. teste4');
    key('Enter');
    expect(value()).toBe('1. teste1\n2. teste2\n3. \n4. teste3\n5. teste4');
    expect(area.selectionStart).toBe('1. teste1\n2. teste2\n3. '.length);
    write('1. a|\n2. b\n  2.1. c\n  2.2. d\n3. e');
    key('Enter');
    expect(value()).toBe('1. a\n2. \n3. b\n  3.1. c\n  3.2. d\n4. e');
    // no começo do item, ele desce com os dele
    write('1. a\n|2. b\n  2.1. c\n3. e');
    key('Enter');
    expect(value()).toBe('1. a\n2. \n3. b\n  3.1. c\n4. e');
    // depois do que vem embaixo de um item (Enter numa linha da descrição)
    write('1. a\n   desc|\n2. b');
    key('Enter');
    expect(value()).toBe('1. a\n   desc\n2. \n3. b');
    // fora da sequência, os de baixo ficam: a lista "1. 1." e a outra lista depois de um texto
    write('1. a|\n1. b');
    key('Enter');
    expect(value()).toBe('1. a\n2. \n1. b');
    write('1. a|\n2. b\ntexto\n2. c');
    key('Enter');
    expect(value()).toBe('1. a\n2. \n3. b\ntexto\n2. c');
  });

  it('Tab recua até o próximo número par de espaços; Shift+Tab volta ao par de antes', () => {
    const tab = (shiftKey = false) => {
      const e = new KeyboardEvent('keydown', { key: 'Tab', shiftKey, bubbles: true, cancelable: true });
      area.dispatchEvent(e);
      return e.defaultPrevented;
    };
    // num item, a linha toda anda, de onde estiver o cursor
    write('1. a\n2. b|');
    expect(tab()).toBeTrue();
    expect(value()).toBe('1. a\n  2. b');
    expect(area.selectionStart).toBe(value().length);
    // com um espaço, só mais um (nunca três)
    write(' - [ ] |x');
    tab();
    expect(value()).toBe('  - [ ] x');
    write(' | texto');
    tab();
    expect(value()).toBe('    texto');
    expect(area.selectionStart).toBe(4);
    // o tab de verdade conta até a parada de 4
    write('\t- a|');
    tab();
    expect(value()).toBe('      - a');
    // no recuo, o cursor vai para o fim dele
    write('|texto');
    tab();
    expect(value()).toBe('  texto');
    expect(area.selectionStart).toBe(2);
    // no meio do texto, os espaços entram no cursor, até a coluna par
    write('abc|def');
    tab();
    expect(value()).toBe('abc def');
    write('ab|cd');
    tab();
    expect(value()).toBe('ab  cd');
    // várias linhas: todas andam, a em branco fica
    write('|- a\n\n- b|');
    tab();
    expect(value()).toBe('  - a\n\n  - b');
    // Shift+Tab: o par de antes
    write('   - a|');
    expect(tab(true)).toBeTrue();
    expect(value()).toBe('  - a');
    tab(true);
    expect(value()).toBe('- a');
    // sem recuo, é o de sempre (o foco sai da folha)
    expect(tab(true)).toBeFalse();
    expect(value()).toBe('- a');
  });

  it('a lista de dentro com o número do pai ("1.1."): Enter continua com o seguinte, e os de baixo descem', () => {
    write('1. teste 1\n  1.1. teste 11|\n  1.2. teste 12\n2. teste 2');
    key('Enter');
    expect(value()).toBe('1. teste 1\n  1.1. teste 11\n  1.2. \n  1.3. teste 12\n2. teste 2');
    expect(area.selectionStart).toBe('1. teste 1\n  1.1. teste 11\n  1.2. '.length);
    // Enter no item vazio termina a lista, como nas outras
    key('Enter');
    expect(value()).toBe('1. teste 1\n  1.1. teste 11\n\n  1.3. teste 12\n2. teste 2');
  });

  it('Shift+Enter num item abre uma linha dentro dele, na coluna do texto; Enter nela volta para a lista', () => {
    write('- [ ] Panelas|');
    key('Enter', { shiftKey: true });
    expect(value()).toBe('- [ ] Panelas\n      ');
    area.setRangeText('fundo triplo', area.selectionStart, area.selectionStart, 'end');
    area.dispatchEvent(new Event('input', { bubbles: true }));
    // na descrição, Shift+Enter continua nela
    key('Enter', { shiftKey: true });
    expect(value()).toBe('- [ ] Panelas\n      fundo triplo\n      ');
    // Enter na linha só de espaços: ela vira a próxima tarefa
    key('Enter');
    expect(value()).toBe('- [ ] Panelas\n      fundo triplo\n- [ ] ');
    // Enter no fim da descrição: a próxima tarefa (o numerado conta)
    write('1. um\n   desc|');
    key('Enter');
    expect(value()).toBe('1. um\n   desc\n2. ');
    // fora de lista, o Shift+Enter é o de sempre
    write('texto|');
    const e = new KeyboardEvent('keydown', { key: 'Enter', shiftKey: true, bubbles: true, cancelable: true });
    area.dispatchEvent(e);
    expect(e.defaultPrevented).toBeFalse();
  });

  it('Enter no fim de um item com descrição: a tarefa nova vem depois da descrição, que continua dela', () => {
    write('- [ ] a|\n  desc\n- [ ] b');
    key('Enter');
    expect(value()).toBe('- [ ] a\n  desc\n- [ ] \n- [ ] b');
    expect(area.selectionStart).toBe('- [ ] a\n  desc\n- [ ] '.length);
  });

  it('"Linha dentro do item" no Formatar faz o mesmo que o Shift+Enter (no celular não tem Shift+Enter)', () => {
    write('- leite|');
    pick('formatar', 'Linha dentro do item');
    expect(value()).toBe('- leite\n  ');
  });

  it('o widget posto num item entra recuado, dele; na linha recuada vazia, fica com o recuo dela', () => {
    const put = (marked: string) => {
      write(marked);
      const ed = fixture.componentInstance as unknown as { writeWidget(a: HTMLTextAreaElement, w: { start: number; end: number; swap: boolean }, line: string): void };
      ed.writeWidget(area, { start: area.selectionStart, end: area.selectionEnd, swap: false }, '{{imagem: https://ex.com/a.jpg}}');
    };
    put('- [ ] Mandolin|');
    expect(value()).toBe('- [ ] Mandolin\n      {{imagem: https://ex.com/a.jpg}}');
    put('- [ ] Mandolin\n      |');
    expect(value()).toBe('- [ ] Mandolin\n      {{imagem: https://ex.com/a.jpg}}');
    put('texto|');
    expect(value()).toBe('texto\n{{imagem: https://ex.com/a.jpg}}');
  });

  it('o widget de um item, trocado pela folha, continua recuado (continua no item)', () => {
    write('- [ ] Mandolin\n      {{imagem: https://ex.com/a.jpg}}|\ndepois');
    const ed = fixture.componentInstance as unknown as {
      startWidget(a: HTMLTextAreaElement, big: boolean, def: WidgetDef, openSheet: boolean): void;
      onWidgetDone(d: { name: string; args: string[]; size: WidgetSize }): void;
      onWidgetClosed(): void;
    };
    ed.startWidget(area, false, widgetDef('imagem')!, false);
    ed.onWidgetDone({ name: 'imagem', args: ['https://ex.com/b.jpg', 'polaroid'], size: 'grande' });
    ed.onWidgetClosed();
    expect(value()).toBe('- [ ] Mandolin\n      {{imagem: https://ex.com/b.jpg | polaroid | grande}}\ndepois');
    // e o widget fora de item continua sem recuo
    write('{{imagem: https://ex.com/a.jpg}}|');
    ed.startWidget(area, false, widgetDef('imagem')!, false);
    ed.onWidgetDone({ name: 'imagem', args: ['https://ex.com/c.jpg'], size: 'medio' });
    ed.onWidgetClosed();
    expect(value()).toBe('{{imagem: https://ex.com/c.jpg}}');
  });

  it('Enter fora de lista é um Enter comum', () => {
    write('texto|');
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    area.dispatchEvent(e);
    expect(e.defaultPrevented).toBeFalse();
  });

  it('a aba "Ver como fica" mostra o texto formatado no lugar do campo (sem a régua), e as tarefas se marcam ali', async () => {
    write('- [ ] leite|');
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('[role=tab]') as NodeListOf<HTMLButtonElement>);
    expect(tabs.map((t) => t.textContent!.trim())).toEqual(['Escrever', 'Ver como fica']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    tabs[1].click();
    await fixture.whenStable();
    expect(area.hidden).toBeTrue();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect((fixture.nativeElement.querySelector('.regua') as HTMLElement).hidden).toBeTrue();
    const box = fixture.nativeElement.querySelector('.previa input[type=checkbox]') as HTMLInputElement;
    box.click();
    expect(value()).toBe('- [x] leite');
  });

  it('com um máximo, o contador embaixo da folha e o campo que não passa dele', async () => {
    fixture.componentRef.setInput('max', 20000);
    write('abc|');
    await fixture.whenStable();
    const counter = () => fixture.nativeElement.querySelector('.contagem') as HTMLElement;
    expect(counter().textContent!.trim()).toBe('3 / 20.000 caracteres');
    expect(area.getAttribute('maxlength')).toBe('20000');
    expect(area.getAttribute('aria-describedby')).toBe(counter().id);
    fixture.componentInstance.value.set('x'.repeat(18500));
    await fixture.whenStable();
    expect(counter().classList).toContain('perto');
    expect(counter().textContent!.trim()).toBe('18.500 / 20.000 caracteres');
  });

  it('sem máximo, nem contador nem limite', () => {
    expect(fixture.nativeElement.querySelector('.contagem')).toBeNull();
    expect(area.hasAttribute('maxlength')).toBeFalse();
  });

  describe('as marcas novas', () => {
    it('a régua: "Formatar" e "Inserir" com nome (sem a caixa do estilo, que repetia o Formatar) e os botões de toda hora', () => {
      const menus = Array.from(fixture.nativeElement.querySelectorAll('.regua .menu-botao') as NodeListOf<HTMLElement>).map((b) => b.textContent!.trim());
      expect(menus).toEqual(['Formatar', 'Inserir']);
      const tools = Array.from(fixture.nativeElement.querySelectorAll('.regua .ferramenta') as NodeListOf<HTMLElement>).map((b) => b.getAttribute('aria-label'));
      expect(tools).toEqual(['Desfazer', 'Refazer', 'Negrito', 'Itálico', 'Riscado', 'Marca-texto', 'Tarefas', 'Lista', 'Lista numerada', 'Link para um endereço']);
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const formatar = fixture.nativeElement.querySelector('.menu')!.textContent;
      for (const t of ['Negrito', 'Spoiler', 'Código', 'Ctrl+Shift+X', 'Título 1', 'Citação', 'Bloco de código', 'Lista numerada', 'Ctrl+Shift+7']) expect(formatar).toContain(t);
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.menu').length).withContext('um menu por vez').toBe(1);
      const inserir = fixture.nativeElement.querySelector('.menu')!.textContent;
      for (const t of ['Link para um endereço', 'Tabela', 'Divisória', 'Contador', 'Imagem', 'Vídeo', 'Áudio', 'Nota']) expect(inserir).toContain(t);
      // sem `notes` (a resenha), o link para outra anotação não aparece
      expect(inserir).not.toContain('Link para outra anotação');
    });

    it('a régua nunca passa da folha: de 580px para cima, o que não cabe sai dela (e continua nos menus); abaixo, os botões rolam', async () => {
      fixture.componentRef.setInput('notes', []);
      fixture.detectChanges();
      const ruler = fixture.nativeElement.querySelector('.regua') as HTMLElement;
      const tools = ruler.querySelector('.ferramentas') as HTMLElement;
      for (const w of [360, 420, 480, 520, 580, 600, 615, 630, 640, 680, 700, 740, 760, 800, 960]) {
        (fixture.nativeElement as HTMLElement).style.width = w + 'px';
        await new Promise((r) => requestAnimationFrame(() => requestAnimationFrame(r)));
        expect(ruler.scrollWidth).withContext(`régua em ${w}px`).toBeLessThanOrEqual(ruler.clientWidth);
        if (w >= 580) expect(tools.scrollWidth).withContext(`botões em ${w}px`).toBeLessThanOrEqual(tools.clientWidth);
      }
    });

    it('riscado e marca-texto em volta da seleção (pelo "Formatar", pelo botão e pelos atalhos); de novo, tira', () => {
      write('um |caro| item');
      pick('formatar', 'Riscado');
      expect(value()).toBe('um ~~caro~~ item');
      expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
      button('Riscado').click();
      expect(value()).toBe('um caro item');
      key('h', { ctrlKey: true, shiftKey: true });
      expect(value()).toBe('um ==caro== item');
      pick('formatar', 'Spoiler');
      expect(value()).toBe('um ==||caro||== item');
    });

    it('Desfazer e Refazer na régua: voltam e refazem a marca posta (como o Ctrl+Z e o Ctrl+Y)', () => {
      write('um |caro| item');
      button('Negrito').click();
      expect(value()).toBe('um **caro** item');
      button('Desfazer').click();
      expect(value()).toBe('um caro item');
      button('Refazer').click();
      expect(value()).toBe('um **caro** item');
      expect(document.activeElement).withContext('o foco fica no texto').toBe(area);
    });

    it('o estilo do parágrafo: o Formatar marca o da linha do cursor e troca o título (no mesmo ponto do texto)', () => {
      /** O estilo marcado no Formatar (abre e fecha o menu). */
      const marked = () => {
        const b = fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement;
        b.click();
        fixture.detectChanges();
        const t = (fixture.nativeElement.querySelector('.menu-op[aria-checked="true"]') as HTMLElement).textContent!.trim();
        b.click();
        fixture.detectChanges();
        return t;
      };
      write('Com|pras');
      area.dispatchEvent(new Event('click'));
      fixture.detectChanges();
      expect(marked()).toBe('Texto normal');
      pick('formatar', 'Título 1');
      expect(value()).toBe('# Compras');
      expect(area.selectionStart).toBe(5);
      expect(marked()).toBe('Título 1');
      pick('formatar', 'Título 3');
      expect(value()).toBe('### Compras');
      expect(marked()).toBe('Título 3');
      pick('formatar', 'Texto normal');
      expect(value()).toBe('Compras');
    });

    it('citação pelo estilo nas linhas da seleção; "Texto normal" tira; numa linha vazia, só o "> "', () => {
      write('|um\ndois|');
      pick('formatar', 'Citação');
      expect(value()).toBe('> um\n> dois');
      area.setSelectionRange(0, value().length);
      pick('formatar', 'Texto normal');
      expect(value()).toBe('um\ndois');
      write('abc\n|');
      pick('formatar', 'Citação');
      expect(value()).toBe('abc\n> ');
    });

    it('texto sutil pelo estilo: "-# " na frente, marcado no Formatar; troca a citação e "Texto normal" tira', () => {
      write('> detalhe|');
      pick('formatar', 'Texto sutil');
      expect(value()).toBe('-# detalhe');
      // o Formatar marca o da linha do cursor
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect((fixture.nativeElement.querySelector('.menu-op[aria-checked="true"]') as HTMLElement).textContent!.trim()).toBe('Texto sutil');
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      pick('formatar', 'Título 2');
      expect(value()).toBe('## detalhe');
      pick('formatar', 'Texto sutil');
      pick('formatar', 'Texto normal');
      expect(value()).toBe('detalhe');
    });

    it('o título troca a citação (e vice-versa), sem somar as marcas', () => {
      write('> frase|');
      pick('formatar', 'Título 2');
      expect(value()).toBe('## frase');
      pick('formatar', 'Citação');
      expect(value()).toBe('> frase');
    });

    it('bloco de código: cerca as linhas com "```"; "Texto normal" dentro dele tira as cercas', () => {
      write('antes\n|a = 1\nb = 2|\ndepois');
      pick('formatar', 'Bloco de código');
      expect(value()).toBe('antes\n```\na = 1\nb = 2\n```\ndepois');
      expect(value().slice(area.selectionStart, area.selectionEnd)).toBe('a = 1\nb = 2');
      area.setSelectionRange(value().indexOf('b'), value().indexOf('b'));
      area.dispatchEvent(new Event('click'));
      fixture.detectChanges();
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect((fixture.nativeElement.querySelector('.menu-op[aria-checked="true"]') as HTMLElement).textContent!.trim()).toBe('Bloco de código');
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      pick('formatar', 'Texto normal');
      expect(value()).toBe('antes\na = 1\nb = 2\ndepois');
      expect(value().slice(area.selectionStart)).toBe('b = 2\ndepois');
      // numa linha vazia, o bloco vazio com o cursor dentro
      write('|');
      pick('formatar', 'Bloco de código');
      expect(value()).toBe('```\n\n```');
      expect(area.selectionStart).toBe(4);
    });

    it('um bloco sem a cerca de baixo: "Título 1" tira a de cima e põe o título', () => {
      write('```\nlinha|');
      pick('formatar', 'Título 1');
      expect(value()).toBe('# linha');
    });

    it('código na palavra: as crases (Ctrl+E e pelo "Formatar")', () => {
      write('rode |npm test| já');
      key('e', { ctrlKey: true });
      expect(value()).toBe('rode `npm test` já');
      write('rode |npm| já');
      pick('formatar', 'Código');
      expect(value()).toBe('rode `npm` já');
    });

    it('Ctrl+Shift+7, 8 e 9: as listas, como no Docs (pela tecla, não pelo que ela escreve)', () => {
      write('|leite|');
      key('&', { ctrlKey: true, shiftKey: true, code: 'Digit7' });
      expect(value()).toBe('1. leite');
      area.setSelectionRange(0, value().length);
      key('*', { ctrlKey: true, shiftKey: true, code: 'Digit8' });
      expect(value()).toBe('- leite');
      area.setSelectionRange(0, value().length);
      key('(', { ctrlKey: true, shiftKey: true, code: 'Digit9' });
      expect(value()).toBe('- [ ] leite');
    });

    it('a tabela escrita à mão: Tab anda nas células e cria a linha nova; Enter numa linha vazia termina', () => {
      // (sem o `write`, que lê o "|" como o cursor)
      fixture.componentInstance.value.set('| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n|   |   |   |');
      fixture.detectChanges();
      area.focus();
      area.setSelectionRange(2, 10);
      key('Tab');
      expect(value().slice(area.selectionStart, area.selectionEnd)).toBe('Coluna 2');
      key('Tab');
      key('Tab');
      // pulou a linha de traços: a primeira célula da linha de baixo
      expect(value().lastIndexOf('\n') < area.selectionStart).toBeTrue();
      key('Tab');
      key('Tab');
      key('Tab');
      // depois da última célula: uma linha nova
      expect(value().split('\n').length).toBe(4);
      area.setSelectionRange(value().length, value().length);
      key('Enter');
      // a linha nova estava vazia: Enter a apaga, e a tabela acaba ali (a linha fica para o texto)
      expect(value().split('\n').length).toBe(4);
      expect(value().endsWith('|\n')).toBeTrue();
    });

    it('o link para um endereço: o painel com o texto selecionado (Ctrl+K), "site.com" vira https; colar um endereço sobre um texto faz o link', async () => {
      write('veja |o site| hoje');
      key('k', { ctrlKey: true });
      fixture.detectChanges();
      const [texto, endereco] = Array.from(fixture.nativeElement.querySelectorAll('.url-painel input') as NodeListOf<HTMLInputElement>);
      expect(texto.value).toBe('o site');
      endereco.value = 'ex.com/a';
      endereco.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const ok = fixture.nativeElement.querySelector('.painel-ok') as HTMLButtonElement;
      expect(ok.disabled).withContext('o botão do painel').toBeFalse();
      ok.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.url-painel')).withContext('o painel fechou').toBeNull();
      expect(value()).toBe('veja [o site](https://ex.com/a) hoje');
      write('leia |isto| agora');
      const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
      paste.clipboardData!.setData('text/plain', 'https://ex.com/b');
      area.dispatchEvent(paste);
      expect(value()).toBe('leia [isto](https://ex.com/b) agora');
    });

    it('a Ajuda abre pelo botão, em partes, e fecha com Esc (só ela, não o editor)', async () => {
      const help = button('Ajuda: como escrever cada marca');
      help.click();
      fixture.detectChanges();
      // a lista vem num pedaço à parte (@defer)
      for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
      expect(help.getAttribute('aria-expanded')).toBe('true');
      const guide = fixture.nativeElement.querySelector('.guia') as HTMLElement;
      const parts = Array.from(guide.querySelectorAll('.guia-secao-titulo')).map((h) => h.textContent!.trim());
      expect(parts).toEqual(['Texto', 'Parágrafos e listas', 'Links, tabelas e divisória', 'Widgets, cada um numa linha só dele', 'Símbolos']);
      expect(guide.textContent).toContain('Link para um endereço');
      expect(guide.textContent).toContain('{{contador: 19/11/2026 18:00 | Nome}}');
      // sem `notes`, a Ajuda não fala do link para outra anotação
      expect(guide.textContent).not.toContain('[[Título]]');
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      guide.dispatchEvent(esc);
      fixture.detectChanges();
      expect(esc.defaultPrevented).toBeTrue();
      expect(fixture.nativeElement.querySelector('.guia')).toBeNull();
    });

    it('Ctrl+/ na folha abre e fecha a Ajuda; Esc na folha fecha só ela', () => {
      write('a|');
      key('/', { ctrlKey: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.guia')).not.toBeNull();
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      area.dispatchEvent(esc);
      fixture.detectChanges();
      expect(esc.defaultPrevented).toBeTrue();
      expect(fixture.nativeElement.querySelector('.guia')).toBeNull();
      key('/', { ctrlKey: true });
      fixture.detectChanges();
      key('/', { ctrlKey: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.guia')).toBeNull();
    });

    it('os menus pelo teclado: seta para baixo no botão abre no primeiro item, a do lado passa de coluna, Esc volta ao botão', async () => {
      const formatar = fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement;
      formatar.focus();
      formatar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r));
      const name = () => (document.activeElement?.querySelector('.menu-op-nome')?.textContent ?? '').trim();
      expect(name()).toBe('Negrito');
      const menu = fixture.nativeElement.querySelector('.menu') as HTMLElement;
      const press = (k: string) => menu.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      press('ArrowDown');
      expect(name()).toBe('Itálico');
      press('ArrowRight');
      expect(name()).toBe('Título 1');
      press('ArrowLeft');
      expect(name()).toBe('Itálico');
      press('Escape');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
      expect(document.activeElement).toBe(formatar);
    });

    it('outra ficha (reset): os painéis da régua que ficaram abertos fecham', () => {
      write('veja |isto|');
      key('k', { ctrlKey: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.url-painel')).not.toBeNull();
      fixture.componentInstance.reset();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.url-painel')).toBeNull();
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      fixture.componentInstance.reset();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
    });
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

    it('pela régua: a busca já vem com o trecho selecionado; Enter escolhe a anotação e, de novo, põe o link', async () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      write('ver |mercado| amanhã');
      button('Link para outra anotação').click();
      fixture.detectChanges();
      const search = fixture.nativeElement.querySelector('.elos-campo') as HTMLInputElement;
      const put = () => Array.from(fixture.nativeElement.querySelectorAll('.elo-painel button') as NodeListOf<HTMLButtonElement>).find((b) => b.textContent!.includes('Pôr o link'))!;
      expect(search.value).toBe('mercado');
      expect(options()[0]).toContain('Lista do mercado');
      expect(put().disabled).toBeTrue();
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      // escolhida: o título vai para a busca, a lista fecha e o botão acende
      expect(search.value).toBe('Lista do mercado');
      expect(fixture.nativeElement.querySelector('.elo-painel .elos-lista')).toBeNull();
      expect(put().disabled).toBeFalse();
      expect(value()).toBe('ver mercado amanhã');
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      // o trecho selecionado fica como o texto do link; o link abre a anotação escolhida
      expect(value()).toBe('ver [[Lista do mercado|mercado]] amanhã');
      expect(fixture.nativeElement.querySelector('.elo-painel')).toBeNull();
    });

    it('pela régua: as letras escritas na busca entram (a tecla não é cancelada) e um título novo vira link pelo botão', () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      write('ver |');
      button('Link para outra anotação').click();
      fixture.detectChanges();
      const search = fixture.nativeElement.querySelector('.elos-campo') as HTMLInputElement;
      const letter = new KeyboardEvent('keydown', { key: 'V', bubbles: true, cancelable: true });
      search.dispatchEvent(letter);
      expect(letter.defaultPrevented).toBeFalse();
      search.value = 'Vender a TV';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(options()[0]).toContain('Link para “Vender a TV”');
      (fixture.nativeElement.querySelector('.elo-op.nova') as HTMLElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.elo-escolhida')?.textContent).toContain('Ainda não existe');
      Array.from(fixture.nativeElement.querySelectorAll('.elo-painel button') as NodeListOf<HTMLButtonElement>)
        .find((b) => b.textContent!.includes('Pôr o link'))!
        .click();
      fixture.detectChanges();
      expect(value()).toBe('ver [[Vender a TV]]');
    });
  });
});

/** Clicar num link ou num widget da folha abre o painel dele, mas o cursor fica onde a pessoa clicou. */
describe('o painel aberto pelo clique na folha', () => {
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

  /** Põe o texto e clica (um clique só) na posição `at`. */
  async function clickAt(text: string, at: number): Promise<void> {
    fixture.componentInstance.value.set(text);
    fixture.detectChanges();
    area.focus();
    area.setSelectionRange(at, at);
    area.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 20));
    fixture.detectChanges();
  }
  const panel = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  it('num link: o painel abre e o foco e o cursor continuam na folha', async () => {
    const text = 'veja [o site](https://exemplo.com) depois';
    await clickAt(text, 8);
    expect(panel('.url-painel')).not.toBeNull();
    expect(document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(8);
  });

  it('num widget: a tirinha dele (o nome, o que mostra, Tirar e Editar) abre com o cursor na folha', async () => {
    await clickAt('{{contador: 2026-12-25 | Natal}}', 5);
    const tira = panel('.widget-tira');
    expect(tira).not.toBeNull();
    expect(tira!.querySelector('.widget-tira-nome')?.textContent).toBe('Contador');
    expect(tira!.querySelector('.widget-tira-resumo')?.textContent).toBe('Natal');
    expect(document.activeElement).toBe(area);
    // a folha do widget só abre pelo Editar
    expect(fixture.nativeElement.querySelector('app-widget-sheet')).toBeNull();
  });

  it('numa tabela (em qualquer linha dela, ou na marca do jeito): a tirinha da tabela, com as colunas, as linhas e o jeito', async () => {
    const text = 'antes\n{{tabela: recibo}}\n| A | B |\n| --- | --- |\n| 1 | 2 |\ndepois';
    await clickAt(text, text.indexOf('| 1'));
    const tira = panel('.widget-tira');
    expect(tira?.querySelector('.widget-tira-nome')?.textContent).toBe('Tabela');
    expect(tira?.querySelector('.widget-tira-resumo')?.textContent).toBe('2 colunas, 2 linhas · Recibo');
    expect(document.activeElement).toBe(area);
    // o Tirar leva a tabela inteira, com a marca
    panel('.widget-tira-tirar')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('antes\ndepois');
  });

  it('o Tirar da tirinha tira a linha do widget, com a quebra dela', async () => {
    await clickAt('antes\n{{contador: 2026-12-25 | Natal}}\ndepois', 9);
    panel('.widget-tira-tirar')!.click();
    fixture.detectChanges();
    expect(fixture.componentInstance.value()).toBe('antes\ndepois');
    expect(panel('.widget-tira')).toBeNull();
  });

  it('escrever na folha fecha a tirinha', async () => {
    await clickAt('{{contador: 2026-12-25 | Natal}}', 5);
    area.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(panel('.widget-tira')).toBeNull();
  });

  it('escrever na folha, sair do link pelas setas ou clicar fora fecham o painel', async () => {
    const text = 'veja [o site](https://exemplo.com) depois';
    await clickAt(text, 8);
    area.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(panel('.url-painel')).toBeNull();

    await clickAt(text, 8);
    area.setSelectionRange(text.length, text.length);
    area.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(panel('.url-painel')).toBeNull();

    await clickAt(text, 8);
    await clickAt(text, 2);
    expect(panel('.url-painel')).toBeNull();
  });

  it('o Esc fecha só o painel, sem chegar ao editor', async () => {
    await clickAt('veja [o site](https://exemplo.com)', 8);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    area.dispatchEvent(esc);
    fixture.detectChanges();
    expect(esc.defaultPrevented).toBeTrue();
    expect(panel('.url-painel')).toBeNull();
  });
});

describe('a folha do widget no editor', () => {
  let fixture: ComponentFixture<RichEditor>;
  let el: HTMLElement;
  const wait = async () => {
    for (let i = 0; i < 5; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await fixture.whenStable();
    }
  };
  const sheet = () => el.querySelector('dialog.wfolha') as HTMLDialogElement | null;

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([
      sanitizeReview({
        id: 'rjogo1',
        kind: 'jogos',
        game: { name: 'Hollow Knight', coverUrl: null, source: 'manual' },
        scores: { diversao: 9, historia: 8, jogabilidade: 9, visual: 8 },
        status: 'finalizado',
        text: '',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      })!,
    ]);
    fixture = TestBed.createComponent(RichEditor);
    fixture.componentRef.setInput('notes', []);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  });

  afterEach(() => {
    sheet()?.close();
    el.remove();
    localStorage.clear();
  });

  /** Espera o que é guardado aos poucos (encolher a imagem leva um tempo). */
  async function until(check: () => boolean): Promise<void> {
    for (let i = 0; i < 400 && !check(); i++) {
      await new Promise((r) => setTimeout(r, 20));
      await fixture.whenStable();
    }
  }

  async function choose(label: string): Promise<void> {
    el.querySelector<HTMLButtonElement>('.menu-botao[data-menu="inserir"]')!.click();
    await fixture.whenStable();
    Array.from(el.querySelectorAll<HTMLButtonElement>('.widget-op'))
      .find((b) => b.textContent!.includes(label))!
      .click();
    await wait();
  }

  it('escolher um widget no Inserir abre a folha dele, com o nome dele na faixa', async () => {
    await choose('Imagem');
    expect(sheet()?.open).toBeTrue();
    expect(el.querySelector('.wfolha h2')?.textContent?.trim()).toBe('Imagem');
    expect(el.querySelector('.wfolha .sub')?.textContent?.trim()).toBe('Widget novo, numa linha só dele');
    // o primeiro campo (o link) leva o foco
    expect(document.activeElement).toBe(el.querySelector('.wfolha [data-campo="url"]'));
  });

  it('a imagem: o link confirmado embaixo dele, a moldura nas miniaturas e "Colar" escreve a marca quando a folha fecha', async () => {
    await choose('Imagem');
    const link = el.querySelector<HTMLInputElement>('.wfolha [data-campo="url"]')!;
    link.value = 'https://ex.com/praia.jpg';
    link.dispatchEvent(new Event('input', { bubbles: true }));
    await wait();
    expect(el.querySelector('.wfolha .link-diz')?.textContent).toContain('Imagem de ex.com');
    const jeitos = el.querySelectorAll<HTMLInputElement>('.wfolha .jeito input');
    expect(jeitos.length).toBe(3);
    jeitos[1].click();
    await wait();
    expect(el.querySelector('.wfolha .jeito.on .jeito-nome')?.textContent).toBe('Polaroide');
    expect(el.querySelector('.wfolha .jeito.on app-pin')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(sheet()).toBeNull();
    expect(fixture.componentInstance.value()).toBe('{{imagem: https://ex.com/praia.jpg | polaroid}}');
  });

  it('a imagem do aparelho: Escolher do aparelho guarda, mostra a fotinho e o tamanho, e Usar um link volta ao campo', async () => {
    await deleteDatabase(IMAGES_DB);
    await choose('Imagem');
    const pick = el.querySelector<HTMLInputElement>('.wfolha .escolher-arquivo')!;
    const clicked = spyOn(pick, 'click');
    el.querySelector<HTMLButtonElement>('.wfolha .botao-aparelho')!.click();
    expect(clicked).toHaveBeenCalled();
    const data = new DataTransfer();
    data.items.add(new File([await samplePng(1600, 1200)], 'praia.png', { type: 'image/png' }));
    pick.files = data.files;
    pick.dispatchEvent(new Event('change'));
    await until(() => !!el.querySelector('.wfolha .guardada-mini img'));
    expect(el.querySelector('.wfolha .guardada-nome')?.textContent).toBe('Imagem do aparelho');
    expect(el.querySelector('.wfolha .guardada-meta')?.textContent).toMatch(/^900 × 675 px · \d+ KB$/);
    // fora da conta, ela fica só aqui (com a conta, sobe: ver core/image-sync.spec.ts)
    expect(el.querySelector('.wfolha .guardada-onde')?.textContent).toBe('Só neste aparelho (fora da conta)');
    expect(el.querySelector('.wfolha input[data-campo="url"]')).withContext('o campo do link sai').toBeNull();
    // o palco mostra a foto de verdade
    expect(el.querySelector('.wfolha app-glued-media img')?.getAttribute('src')).toMatch(/^blob:/);
    Array.from(el.querySelectorAll<HTMLButtonElement>('.wfolha .guardada-acoes button')).find((b) => b.textContent!.trim() === 'Usar um link')!.click();
    await wait();
    expect(el.querySelector('.wfolha .guardada')).toBeNull();
    expect(document.activeElement).toBe(el.querySelector('.wfolha input[data-campo="url"]'));
    // de novo, e Colar escreve a marca com o endereço do Murall
    // a escolha de antes esvaziou a lista de arquivos (o mesmo arquivo de novo também avisa): uma nova
    const second = new DataTransfer();
    second.items.add(new File([await samplePng(1600, 1200)], 'praia.png', { type: 'image/png' }));
    const again = el.querySelector<HTMLInputElement>('.wfolha .escolher-arquivo')!;
    again.files = second.files;
    again.dispatchEvent(new Event('change'));
    await until(() => !!el.querySelector('.wfolha .guardada'));
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(fixture.componentInstance.value()).toMatch(/^\{\{imagem: murall:\/\/imagem\/[\w-]{22}\}\}$/);
  }, 20_000);

  it('a imagem que não abre avisa na folha (o bilhete ficaria por baixo dela)', async () => {
    await choose('Imagem');
    const pick = el.querySelector<HTMLInputElement>('.wfolha .escolher-arquivo')!;
    const data = new DataTransfer();
    data.items.add(new File([new Uint8Array([1, 2, 3])], 'foto.heic', { type: 'image/heic' }));
    pick.files = data.files;
    pick.dispatchEvent(new Event('change'));
    await until(() => !!el.querySelector('.wfolha .dica.ruim'));
    expect(el.querySelector('.wfolha .dica.ruim')?.textContent).toContain('não abre aqui');
  });

  /** Escreve numa célula da grade da tabela. */
  async function typeCell(r: number, c: number, text: string): Promise<void> {
    const input = el.querySelector<HTMLInputElement>(`.wfolha input[data-r="${r}"][data-c="${c}"]`)!;
    input.value = text;
    input.dispatchEvent(new Event('input'));
    await wait();
  }

  it('a tabela no Inserir abre a folha com a grade: vazia, ela diz o que falta; escrita, o palco mostra e "Pôr" escreve o markdown', async () => {
    fixture.componentInstance.value.set('Um texto');
    await fixture.whenStable();
    const area = el.querySelector('textarea')!;
    area.focus();
    area.setSelectionRange(8, 8);
    await choose('Tabela');
    expect(el.querySelector('.wfolha h2')?.textContent?.trim()).toBe('Tabela');
    expect(el.querySelector('.wfolha .sub')?.textContent?.trim()).toBe('Widget novo, com as linhas que quiser');
    // a primeira célula do cabeçalho leva o foco; a tabela não tem tamanho
    expect(document.activeElement).toBe(el.querySelector('.wfolha [data-campo="table"]'));
    expect(el.querySelector('.wfolha .tamanhos')).toBeNull();
    expect(el.querySelector('.wfolha .tamanho-fixo')).toBeNull();
    expect(el.querySelectorAll('.wfolha .jeito').length).toBe(5);
    expect(el.querySelector('.wfolha .falta')?.textContent?.trim()).toBe('Falta escrever na tabela');
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(sheet()?.open).toBeTrue();
    expect(el.querySelector('.wfolha app-table-grid .tg.falta')).not.toBeNull();
    await typeCell(-1, 0, 'Dia');
    await typeCell(0, 0, 'Seg');
    // o palco desenha a tabela de verdade, no jeito escolhido
    expect(el.querySelector('.wfolha .palco app-rich-text .tabela-rolo.jeito-branca')).not.toBeNull();
    el.querySelector<HTMLInputElement>('.wfolha .jeito input[value="listrada"]')!.click();
    await wait();
    expect(el.querySelector('.wfolha .palco .tabela-rolo.jeito-listrada')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(sheet()).toBeNull();
    expect(fixture.componentInstance.value()).toBe('Um texto\n{{tabela: listrada}}\n| Dia |  |  |\n| --- | --- | --- |\n| Seg |  |  |\n|  |  |  |');
  });

  it('o Editar da tabela abre a folha com ela; salvar troca só ela, com o recuo do item, e a branca não escreve a marca', async () => {
    const text = '- Roteiro\n  {{tabela: caneta}}\n  | A | B |\n  | --- | ---: |\n  | 1 | 2 |\nfim';
    fixture.componentInstance.value.set(text);
    await fixture.whenStable();
    const area = el.querySelector('textarea')!;
    area.focus();
    area.setSelectionRange(text.indexOf('| A'), text.indexOf('| A'));
    area.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await wait();
    el.querySelector<HTMLButtonElement>('.widget-tira-editar')!.click();
    await wait();
    expect(el.querySelector('.wfolha .sub')?.textContent?.trim()).toBe('Mexendo no widget do texto');
    expect(el.querySelector<HTMLInputElement>('.wfolha input[data-r="0"][data-c="1"]')?.value).toBe('2');
    expect(el.querySelector('.wfolha .jeito.on .jeito-nome')?.textContent).toBe('Caneta');
    await typeCell(0, 1, '3');
    el.querySelector<HTMLInputElement>('.wfolha .jeito input[value="branca"]')!.click();
    await wait();
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(fixture.componentInstance.value()).toBe('- Roteiro\n  | A | B |\n  | --- | ---: |\n  | 1 | 3 |\nfim');
  });

  it('sem o que ele precisa, o botão diz o que falta e leva o foco ao campo', async () => {
    await choose('Contador');
    expect(el.querySelector('.wfolha .falta')?.textContent?.trim()).toBe('Falta o dia');
    const ok = el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!;
    // sem o dia, o palco mostra um contador de exemplo, esmaecido
    expect(el.querySelector('.wfolha .exemplo app-note-widget')).not.toBeNull();
    (document.activeElement as HTMLElement | null)?.blur();
    ok.click();
    await wait();
    expect(document.activeElement).toBe(el.querySelector('.wfolha [data-campo="date"]'));
    expect(el.querySelector('.wfolha [data-campo="date"]')?.getAttribute('aria-invalid')).toBe('true');
    expect(fixture.componentInstance.value()).toBe('');
  });

  it('o contador de toda semana: o repete numa lista, os dias em bolinhas e a hora', async () => {
    await choose('Contador');
    const repete = el.querySelector<HTMLSelectElement>('.wfolha select[data-campo="repeat"]')!;
    repete.value = 'semana';
    repete.dispatchEvent(new Event('change', { bubbles: true }));
    await wait();
    const dias = Array.from(el.querySelectorAll<HTMLButtonElement>('.wfolha .dia'));
    expect(dias.map((d) => d.textContent!.trim())).toEqual(['Seg', 'Ter', 'Qua', 'Qui', 'Sex', 'Sáb', 'Dom']);
    expect(el.querySelector('.wfolha [data-campo="date"]')).toBeNull();
    dias[4].click();
    await wait();
    expect(el.querySelector('.wfolha .dia[aria-checked="true"]')?.textContent?.trim()).toBe('Sex');
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(fixture.componentInstance.value()).toBe('{{contador: toda sexta}}');
  });

  it('o vídeo: o link que serve é confirmado embaixo dele; o que não serve diz o porquê', async () => {
    await choose('Vídeo');
    const link = el.querySelector<HTMLInputElement>('.wfolha [data-campo="url"]')!;
    link.value = 'https://youtu.be/dQw4w9WgXcQ';
    link.dispatchEvent(new Event('input', { bubbles: true }));
    await wait();
    expect(el.querySelector('.wfolha .link-diz')?.textContent).toContain('Vídeo do YouTube');
    link.value = 'https://site.com/pagina';
    link.dispatchEvent(new Event('input', { bubbles: true }));
    await wait();
    expect(el.querySelector('.wfolha .link-diz.ruim')?.textContent).toContain('YouTube');
    expect(link.getAttribute('aria-invalid')).toBe('true');
  });

  it('a Nota: escolher no menu já abre a lista; a ficha escolhida vai para a folha e "Colar" escreve a marca', async () => {
    await choose('Nota');
    const picker = el.querySelector('app-card-picker dialog') as HTMLDialogElement;
    expect(picker?.open).toBeTrue();
    el.querySelector<HTMLButtonElement>('app-card-picker .escolha')!.click();
    await wait();
    expect(picker.open).toBeFalse();
    expect(el.querySelector('.wfolha .ficha-escolher-nome')?.textContent).toBe('Hollow Knight');
    expect(document.activeElement).toBe(el.querySelector('.wfolha .pe .ok'));
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(fixture.componentInstance.value()).toBe('{{nota: #rjogo1 | Hollow Knight}}');
  });

  it('a Nota: o jeito vem em miniaturas; a tira e o texto inteiro não têm tamanho (e não escrevem um)', async () => {
    await choose('Nota');
    el.querySelector<HTMLButtonElement>('app-card-picker .escolha')!.click();
    await wait();
    const jeitos = Array.from(el.querySelectorAll('.wfolha .jeito'));
    expect(jeitos.map((j) => j.querySelector('.jeito-nome')!.textContent!.trim())).toEqual(['Ficha', 'Capa e título', 'Só o título', 'Texto inteiro']);
    // escolher o grande na ficha, depois o texto inteiro: o tamanho some, e a frase diz por quê
    const sizes = () => Array.from(el.querySelectorAll<HTMLInputElement>('.wfolha .tamanho input'));
    sizes()[3].click();
    await wait();
    jeitos[3].querySelector('input')!.click();
    await wait();
    expect(sizes().length).toBe(0);
    expect(el.querySelector('.wfolha .tamanho-fixo')?.textContent).toContain('altura do texto');
    expect(el.querySelector('.wfolha app-note-widget app-linked-card, .wfolha app-note-widget')).not.toBeNull();
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(fixture.componentInstance.value()).toBe('{{nota: #rjogo1 | Hollow Knight | inteira}}');
    // o texto inteiro escolhe como começa, em recortes: fechado se escreve
    el.querySelector<HTMLTextAreaElement>('textarea')!.focus();
    const area = el.querySelector<HTMLTextAreaElement>('textarea')!;
    area.setSelectionRange(3, 3);
    area.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    await wait();
    el.querySelector<HTMLButtonElement>('.widget-tira-editar')!.click();
    await wait();
    const comeca = Array.from(el.querySelectorAll<HTMLLabelElement>('.wfolha .tamanhos.dois .segmento'));
    expect(comeca.map((l) => l.textContent!.trim())).toEqual(['Aberta', 'Fechada']);
    comeca[1].querySelector('input')!.click();
    await wait();
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(fixture.componentInstance.value()).toBe('{{nota: #rjogo1 | Hollow Knight | inteira | fechada}}');
  });

  it('fechar a lista da Nota sem escolher deixa o foco na ficha a escolher, que a abre de novo', async () => {
    await choose('Nota');
    await closeDialog(el.querySelector('app-card-picker dialog') as HTMLDialogElement);
    await wait();
    const which = el.querySelector<HTMLButtonElement>('.wfolha .ficha-escolher')!;
    expect(which.classList).toContain('vazia');
    expect(document.activeElement).toBe(which);
    expect(el.querySelector('.wfolha .falta')?.textContent?.trim()).toBe('Falta escolher a ficha');
  });

  it('o Editar da tirinha abre a folha com o widget; salvar troca a linha, e o Tirar da folha a tira', async () => {
    const area = el.querySelector('textarea')!;
    const open = async (text: string, at: number) => {
      fixture.componentInstance.value.set(text);
      fixture.detectChanges();
      area.focus();
      area.setSelectionRange(at, at);
      area.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
      await wait();
      el.querySelector<HTMLButtonElement>('.widget-tira-editar')!.click();
      await wait();
    };
    await open('oi\n{{audio: https://ex.com/a.mp3 | Faixa}}', 6);
    expect(sheet()?.open).toBeTrue();
    expect(el.querySelector('.wfolha h2')?.textContent?.trim()).toBe('Áudio');
    expect(el.querySelector('.wfolha .sub')?.textContent?.trim()).toBe('Mexendo no widget do texto');
    expect(el.querySelector<HTMLInputElement>('.wfolha [data-campo="title"]')!.value).toBe('Faixa');
    el.querySelectorAll<HTMLInputElement>('.wfolha .jeito input')[2].click();
    await wait();
    el.querySelector<HTMLButtonElement>('.wfolha .pe .ok')!.click();
    await wait();
    expect(fixture.componentInstance.value()).toBe('oi\n{{audio: https://ex.com/a.mp3 | Faixa | vinil}}');

    await open('oi\n{{audio: https://ex.com/a.mp3 | Faixa}}\nfim', 6);
    el.querySelector<HTMLButtonElement>('.wfolha .tirar')!.click();
    await wait();
    expect(fixture.componentInstance.value()).toBe('oi\nfim');
  });

  it('Cancelar fecha a folha sem mexer no texto', async () => {
    await choose('Imagem');
    const link = el.querySelector<HTMLInputElement>('.wfolha [data-campo="url"]')!;
    link.value = 'https://ex.com/a.jpg';
    link.dispatchEvent(new Event('input', { bubbles: true }));
    await wait();
    Array.from(el.querySelectorAll<HTMLButtonElement>('.wfolha .pe .btn-quiet'))
      .find((b) => b.textContent!.includes('Cancelar'))!
      .click();
    await wait();
    expect(sheet()).toBeNull();
    expect(fixture.componentInstance.value()).toBe('');
  });
});

describe('o estilo do parágrafo da linha (styleAt)', () => {
  it('título pelo número de "#", citação, texto; o spoiler ">!…!<" não é citação', () => {
    const at = (t: string) => styleAt(t, t.length);
    expect(at('# a')).toBe('t1');
    expect(at('### a')).toBe('t3');
    expect(at('#hashtag')).toBe('texto');
    expect(at('> dito')).toBe('citacao');
    expect(at('>!segredo!<')).toBe('texto');
    expect(at('-# pequeno')).toBe('sutil');
    expect(at('-#junto')).toBe('texto');
    expect(at('- item')).toBe('texto');
  });

  it('dentro das cercas "```" (e nelas), o bloco de código; depois da de baixo, de novo o texto', () => {
    const text = 'a\n```\n# não é título\n```\nb';
    expect(styleAt(text, 0)).toBe('texto');
    expect(styleAt(text, text.indexOf('```'))).toBe('codigo');
    expect(styleAt(text, text.indexOf('#'))).toBe('codigo');
    expect(styleAt(text, text.lastIndexOf('```'))).toBe('codigo');
    expect(styleAt(text, text.length)).toBe('texto');
  });
});
