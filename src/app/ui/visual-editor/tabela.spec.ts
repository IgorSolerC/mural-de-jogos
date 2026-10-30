import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Fragment, Node as PMNode, Slice } from 'prosemirror-model';
import { AllSelection, TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { EditorView } from 'prosemirror-view';
import { textToDoc } from '../../core/rich-doc';
import { VisualEditor } from './visual-editor';
import { EstadoVisual } from './visual-api';
import { schema } from './schema';

/**
 * A tabela escrita direto na folha do Visual (PLANO-EDITOR-VISUAL.md, rodada 6, e os defeitos T1–T8 e
 * K9): o nó, as teclas da célula, o menu "Tabela", o colar, e as lições do apagar do Android (a tabela
 * nunca se desmancha por um apagar, uma letra ou um colar por cima de uma seleção que a toca). As teclas
 * e a seleção vão direto para a vista (o R9).
 */
describe('a tabela no modo Visual', () => {
  let fixture: ComponentFixture<VisualEditor>;
  let view: EditorView;
  let valor: string | null;
  let estado: EstadoVisual | null;

  async function make(texto: string): Promise<void> {
    TestBed.configureTestingModule({ imports: [VisualEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(VisualEditor);
    fixture.componentRef.setInput('texto', texto);
    valor = null;
    estado = null;
    const ed = fixture.componentInstance;
    ed.mudou.subscribe((t) => {
      valor = t;
      fixture.componentRef.setInput('texto', t);
    });
    ed.estado.subscribe((e) => (estado = e));
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    view = (ed as unknown as { view: EditorView }).view;
  }

  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
  });

  const texto = () => valor;
  const tipos = () => {
    const out: string[] = [];
    view.state.doc.forEach((n) => out.push(n.type.name));
    return out;
  };
  const tabela = (): PMNode => {
    let t: PMNode | null = null;
    view.state.doc.forEach((n) => (t ??= n.type.name === 'tabela' ? n : null));
    return t!;
  };
  /** A grade da tabela: as letras de cada célula, fileira por fileira. */
  const grade = () => {
    const out: string[][] = [];
    tabela().forEach((f) => {
      const linha: string[] = [];
      f.forEach((c) => linha.push(c.textContent));
      out.push(linha);
    });
    return out;
  };
  /** A posição do começo (ou do fim) da célula (f, c) da primeira tabela. */
  function celula(f: number, c: number, fim = false): number {
    let base = 0;
    view.state.doc.forEach((n, pos) => {
      if (n.type.name === 'tabela' && !base) base = pos;
    });
    let at = base + 1;
    const t = tabela();
    for (let k = 0; k < f; k++) at += t.child(k).nodeSize;
    at += 1;
    for (let k = 0; k < c; k++) at += t.child(f).child(k).nodeSize;
    return at + 1 + (fim ? t.child(f).child(c).content.size : 0);
  }
  const cursor = (pos: number, ate = pos) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos, ate)));
  const naCelula = () => {
    const $p = view.state.selection.$head;
    return $p.depth >= 3 ? [$p.index(1), $p.index(2), $p.parentOffset] : null;
  };
  function digita(t: string): void {
    for (const ch of t) {
      const { from, to } = view.state.selection;
      if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  }
  function tecla(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    view.dom.dispatchEvent(e);
    return e;
  }
  function entrada(inputType: string, data: string | null = null): InputEvent {
    const e = new InputEvent('beforeinput', { inputType, data, bubbles: true, cancelable: true });
    view.dom.dispatchEvent(e);
    return e;
  }
  const run = (a: Parameters<VisualEditor['run']>[0]) => fixture.componentInstance.run(a);
  function cola(text: string, plain = false): void {
    const slice = view.someProp('clipboardTextParser', (f) => f(text, view.state.selection.$from, plain, view))!;
    const final = view.someProp('transformPasted', (f) => f(slice, view, plain)) ?? slice;
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    if (!view.someProp('handlePaste', (f) => f(view, e, final))) view.dispatch(view.state.tr.replaceSelection(final));
  }

  const T = '| Jogo | Nota |\n| --- | ---: |\n| Hades | 10 |\n| Celeste | 9 |';

  describe('abrir e sair sem mexer (I1)', () => {
    for (const t of [
      T,
      'antes\n{{tabela: listrada}}\n|Jogo|Nota|\n|:-|:-:|\n| **Hades** | ==10== |\nfim',
      '- item\n  | a | b |\n  | --- | --- |\n  | c | d \\| e |\n- outro',
      '| a | b |\n| --- | --- |\n| 1 | 2 | sobra |\n|  |  |',
      'x\r\n| a |\r\n| --- |\r\n| b |',
    ])
      it(`não muda um byte: ${JSON.stringify(t.slice(0, 30))}`, async () => {
        await make(t);
        expect(tipos()).toContain('tabela');
        expect(fixture.nativeElement.querySelector('.vis-cru')).toBeNull();
        cursor(celula(1, 0));
        expect(valor).toBeNull();
      });

    it('é uma <table> de verdade, o cabeçalho em <th scope=col>, no jeito dela e com o alinhamento da coluna', async () => {
      await make('{{tabela: quadriculada}}\n' + T);
      const rolo = fixture.nativeElement.querySelector('.ProseMirror > .tabela-rolo') as HTMLElement;
      expect(rolo.classList).toContain('jeito-quadriculada');
      const ths = rolo.querySelectorAll('table.tabela th[scope=col] > .th-texto');
      expect(ths.length).toBe(2);
      expect((rolo.querySelectorAll('td')[1] as HTMLElement).style.textAlign).toBe('right');
      expect(grade()).toEqual([
        ['Jogo', 'Nota'],
        ['Hades', '10'],
        ['Celeste', '9'],
      ]);
    });
  });

  describe('escrever na célula', () => {
    it('mexer numa célula muda só a fileira dela (I2): o resto da tabela sai como estava escrito', async () => {
      const t = '|Jogo|Nota|\n|---|--:|\n|  __Hades__  | 10 |\n| Celeste | 9 |\nfim';
      await make(t);
      cursor(celula(2, 1, true));
      digita('!');
      expect(texto()).toBe('|Jogo|Nota|\n|---|--:|\n|  __Hades__  | 10 |\n| Celeste | 9! |\nfim');
    });

    it('o "|" escrito numa célula não abre uma coluna (T4), e o spoiler sai em >!…!<', async () => {
      await make(T);
      cursor(celula(1, 0, true));
      digita(' | x');
      expect(texto()!.split('\n')[2]).toBe('| Hades \\| x | 10 |');
      run('spoiler');
      digita('s');
      expect(textToDoc(texto()!).linhas[0]).toEqual(jasmine.objectContaining({ kind: 'tabela' }));
      expect(texto()!.split('\n')[2]).toContain('>!s!<');
    });

    it('na tabela dentro de um item, a fileira mexida fica com o recuo (T8)', async () => {
      await make('- item\n  | a | b |\n  | --- | --- |\n  | c | d |\nfim');
      cursor(celula(1, 1, true));
      digita('x');
      expect(texto()).toBe('- item\n  | a | b |\n  | --- | --- |\n  | c | dx |\nfim');
    });

    it('a tabela toda vazia continua tabela (T6)', async () => {
      await make('');
      run('tabela');
      expect(texto()).toBe('|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |');
      expect(textToDoc(texto()!).linhas.map((l) => l.kind)).toEqual(['tabela']);
      expect(naCelula()).toEqual([0, 0, 0]);
    });

    it('o atalho de digitação de bloco não vale na célula ("- " fica letra)', async () => {
      await make(T);
      cursor(celula(1, 0));
      digita('- ');
      expect(tabela().child(1).child(0).type.name).toBe('celula');
      expect(grade()[1][0]).toBe('- Hades');
    });

    it('o negrito numa seleção de células vale em todas (T7)', async () => {
      await make(T);
      const $a = view.state.doc.resolve(celula(1, 0) - 1);
      const $b = view.state.doc.resolve(celula(2, 1) - 1);
      view.dispatch(view.state.tr.setSelection(new CellSelection($a, $b)));
      expect(tecla('b', { ctrlKey: true }).defaultPrevented).toBeTrue();
      expect(texto()).toBe('| Jogo | Nota |\n| --- | ---: |\n| **Hades** | **10** |\n| **Celeste** | **9** |');
      expect(estado!.marcas).toContain('bold');
    });
  });

  describe('as teclas da célula', () => {
    it('Enter desce de célula e, na última fileira, cria outra (T1); Shift+Enter sobe', async () => {
      await make(T);
      cursor(celula(1, 1));
      tecla('Enter');
      expect(naCelula()).toEqual([2, 1, 1]);
      tecla('Enter');
      expect(grade().length).toBe(4);
      expect(naCelula()).toEqual([3, 1, 0]);
      expect(texto()).toBe(T + '\n|  |  |');
      tecla('Enter', { shiftKey: true });
      tecla('Enter', { shiftKey: true });
      expect(naCelula()).toEqual([1, 1, 2]);
      tecla('Enter', { shiftKey: true });
      tecla('Enter', { shiftKey: true });
      expect(naCelula()![0]).toBe(0);
    });

    it('o Enter do teclado do celular (o beforeinput) também desce, nunca parte a célula', async () => {
      await make(T);
      cursor(celula(1, 0, true));
      const e = entrada('insertParagraph');
      expect(e.defaultPrevented).toBeTrue();
      expect(naCelula()).toEqual([2, 0, 7]);
      entrada('insertLineBreak');
      expect(naCelula()).toEqual([1, 0, 5]);
      expect(grade().length).toBe(3);
      expect(texto()).toBeNull();
    });

    it('Tab anda e seleciona o que tem na próxima; na última célula cria a fileira; Shift+Tab volta, e na primeira passa', async () => {
      await make(T);
      cursor(celula(0, 0));
      expect(tecla('Tab').defaultPrevented).toBeTrue();
      expect(view.state.selection.from).toBe(celula(0, 1));
      expect(view.state.selection.to).toBe(celula(0, 1, true));
      cursor(celula(2, 1));
      tecla('Tab');
      expect(grade().length).toBe(4);
      expect(naCelula()).toEqual([3, 0, 0]);
      tecla('Tab', { shiftKey: true });
      expect(naCelula()![0]).toBe(2);
      cursor(celula(0, 0));
      expect(tecla('Tab', { shiftKey: true }).defaultPrevented).toBeFalse();
    });

    it('Backspace no começo da célula vai para o fim da de antes (sem juntar); na primeira, para; Delete, o espelho', async () => {
      await make(T);
      cursor(celula(2, 0));
      tecla('Backspace');
      expect(naCelula()).toEqual([1, 1, 2]);
      cursor(celula(0, 0));
      expect(tecla('Backspace').defaultPrevented).toBeTrue();
      expect(naCelula()).toEqual([0, 0, 0]);
      cursor(celula(1, 1, true));
      tecla('Delete');
      expect(naCelula()).toEqual([2, 0, 0]);
      expect(texto()).toBeNull();
    });

    it('o apagar segurado do Gboard (o beforeinput) esvazia a tabela de trás para frente sem perder fileira nem coluna', async () => {
      await make(T + '\ndepois');
      cursor(celula(2, 1, true));
      for (let i = 0; i < 60; i++) entrada('deleteContentBackward');
      expect(grade()).toEqual([
        ['', ''],
        ['', ''],
        ['', ''],
      ]);
      expect(texto()).toBe('|  |  |\n| --- | ---: |\n|  |  |\n|  |  |\ndepois');
    });

    it('na linha logo depois da tabela, o Backspace leva ao fim da última célula (a linha vazia sai); o Delete antes dela, o espelho', async () => {
      await make('antes\n\n' + T + '\n\ndepois');
      let linha = 0;
      view.state.doc.forEach((n, pos, i) => {
        if (i === 3) linha = pos;
      });
      cursor(linha + 1);
      tecla('Backspace');
      expect(naCelula()).toEqual([2, 1, 1]);
      expect(texto()).toBe('antes\n\n' + T + '\ndepois');
      // a linha vazia antes da tabela: o Delete leva à primeira célula, e ela sai
      cursor(8);
      tecla('Delete');
      expect(naCelula()).toEqual([0, 0, 0]);
      expect(texto()).toBe('antes\n' + T + '\ndepois');
      // na linha com texto, o cursor entra, e a linha fica
      cursor(6);
      tecla('Delete');
      expect(naCelula()).toEqual([0, 0, 0]);
      expect(texto()).toBe('antes\n' + T + '\ndepois');
    });
  });

  describe('a seleção que toca uma tabela só tira texto', () => {
    it('apagar do meio da linha de cima até o meio de uma célula: as fileiras ficam (o quarto relatório do Android)', async () => {
      await make('uma linha\n' + T + '\nfim');
      cursor(4, celula(2, 0) + 3);
      const e = entrada('deleteContentBackward');
      expect(e.defaultPrevented).toBeTrue();
      expect(grade()).toEqual([
        ['', ''],
        ['', ''],
        ['este', '9'],
      ]);
      expect(view.state.doc.child(0).textContent).toBe('uma');
      expect(texto()).toBe('uma\n|  |  |\n| --- | ---: |\n|  |  |\n| este | 9 |\nfim');
    });

    it('a rajada do Gboard: seleções por pedaços para trás, cada uma apagada, nunca desmancham a tabela', async () => {
      await make('primeira\nsegunda\n' + T + '\nfim');
      cursor(celula(2, 1, true));
      for (let i = 0; i < 40; i++) {
        const at = view.state.selection.from;
        const de = Math.max(1, at - 3);
        // a seleção do teclado é sempre de letras (como o navegador a dá)
        view.dispatch(view.state.tr.setSelection(TextSelection.between(view.state.doc.resolve(de), view.state.doc.resolve(at))));
        entrada('deleteContentBackward');
        if (!tipos().includes('tabela')) throw new Error(`a tabela sumiu na vez ${i}, de ${de} a ${at}: ${JSON.stringify(view.state.doc.toJSON()).slice(0, 300)}`);
      }
      expect(tipos()).toEqual(['linha', 'linha', 'tabela', 'linha']);
      expect(tabela().childCount).toBe(3);
      tabela().forEach((f) => expect(f.childCount).toBe(2));
      expect(textToDoc(texto()!).linhas.map((l) => l.kind)).toEqual(['linha', 'linha', 'tabela', 'linha']);
    });

    it('a seleção que atravessa a tabela (com um widget no meio): as linhas inteiras e o widget saem, a tabela fica vazia (K9)', async () => {
      await make('a\nb\n{{contador: 25/12/2030 | Natal}}\n' + T + '\nfim de tudo');
      const fim = view.state.doc.content.size - 5;
      cursor(1, fim);
      tecla('Delete');
      expect(tipos()).toEqual(['linha', 'tabela', 'linha']);
      expect(grade().flat().join('')).toBe('');
      expect(view.state.doc.lastChild!.textContent).toBe('tudo');
    });

    it('escrever, colar e recortar por cima dela também só tiram o texto', async () => {
      await make('uma linha\n' + T);
      cursor(4, celula(1, 0) + 2);
      digita('X');
      expect(tabela().childCount).toBe(3);
      expect(view.state.doc.child(0).textContent).toBe('umaX');
      cursor(2, celula(1, 1) + 1);
      cola('colado');
      expect(tabela().childCount).toBe(3);
      expect(view.state.doc.child(0).textContent).toBe('ucolado');
      cursor(1, celula(2, 0) + 1);
      const e = new ClipboardEvent('cut', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
      view.dom.dispatchEvent(e);
      expect(e.defaultPrevented).toBeTrue();
      expect(e.clipboardData!.getData('text/plain')).toContain('colado');
      expect(tabela().childCount).toBe(3);
      expect(view.state.doc.child(0).textContent).toBe('');
    });

    it('o beforeinput de uma letra por cima dela (o teclado do celular) também', async () => {
      await make('uma linha\n' + T);
      cursor(4, celula(1, 1) + 1);
      const e = entrada('insertText', 'k');
      expect(e.defaultPrevented).toBeTrue();
      expect(tabela().childCount).toBe(3);
      expect(view.state.doc.child(0).textContent).toBe('umak');
    });

    it('Ctrl+A e apagar deixa a folha vazia (K6): selecionar tudo é de propósito', async () => {
      await make('antes\n' + T);
      tecla('a', { ctrlKey: true });
      expect(view.state.selection instanceof AllSelection).toBeTrue();
      tecla('Delete');
      expect(tipos()).toEqual(['linha']);
      expect(texto()).toBe('');
    });
  });

  describe('colar numa célula', () => {
    it('com tab (de uma planilha), as células se espalham a partir da do cursor, com as fileiras e colunas que faltarem (T2)', async () => {
      await make(T);
      cursor(celula(2, 1));
      cola('a\tb\tc\n1\t2\t3\n');
      expect(grade()).toEqual([
        ['Jogo', 'Nota', '', ''],
        ['Hades', '10', '', ''],
        ['Celeste', 'a', 'b', 'c'],
        ['', '1', '2', '3'],
      ]);
      expect(texto()!.split('\n')[1]).toBe('| --- | ---: | --- | --- |');
    });

    it('sem tab, as linhas se juntam com espaço (a célula não tem quebra), e as marcas do Murall valem', async () => {
      await make(T);
      cursor(celula(1, 0, true));
      cola(' um\ndois **três**');
      expect(grade()[1][0]).toBe('Hades um dois três');
      expect(texto()!.split('\n')[2]).toBe('| Hades um dois **três** | 10 |');
      expect(grade().length).toBe(3);
    });

    it('linhas copiadas do próprio Visual viram letras na célula', async () => {
      await make(T);
      cursor(celula(1, 0, true));
      const linhas = Fragment.from([schema.nodes['linha'].create(null, schema.text('a')), schema.nodes['titulo'].create(null, schema.text('b'))]);
      const final = view.someProp('transformPasted', (f) => f(new Slice(linhas, 1, 1), view, false))!;
      view.dispatch(view.state.tr.replaceSelection(final));
      expect(grade()[1][0]).toBe('Hadesa b');
      expect(tabela().childCount).toBe(3);
    });

    it('a célula mesclada que chega (T3) é desfeita; o cabeçalho é sempre a primeira fileira', async () => {
      await make(T);
      const N = schema.nodes;
      const torta = N['tabela'].create(null, [
        N['fileira'].create(null, [N['celula'].create({ colspan: 2 }, schema.text('junto'))]),
        N['fileira'].create(null, [N['celula'].create(null, schema.text('x')), N['celula'].create(null, schema.text('y'))]),
      ]);
      view.dispatch(view.state.tr.insert(view.state.doc.content.size, torta));
      // duas tabelas seguidas no texto seriam uma só: entre elas, uma linha vazia
      expect(tipos()).toEqual(['tabela', 'linha', 'tabela']);
      let segunda: PMNode | null = null;
      view.state.doc.forEach((n, _p, i) => (segunda = i === 2 ? n : segunda));
      expect(segunda!.child(0).childCount).toBe(2);
      expect(segunda!.child(0).child(0).type.name).toBe('cabeca');
      expect(segunda!.child(0).child(0).attrs['colspan']).toBe(1);
      expect(segunda!.child(0).child(0).textContent).toBe('junto');
      expect(texto()).toBe(T + '\n\n| junto |  |\n| --- | --- |\n| x | y |');
    });
  });

  describe('o menu "Tabela"', () => {
    it('as fileiras e as colunas: pôr, mover e tirar, com o cursor andando junto', async () => {
      await make(T);
      cursor(celula(1, 0, true));
      expect(estado!.tabela).toEqual({ fileira: 1, fileiras: 3, coluna: 0, colunas: 2, alinhar: null, jeito: 'branca' });
      run({ tabela: 'descerFileira' });
      expect(grade().map((f) => f[0])).toEqual(['Jogo', 'Celeste', 'Hades']);
      expect(naCelula()).toEqual([2, 0, 5]);
      run({ tabela: 'colunaParaFrente' });
      expect(grade()[0]).toEqual(['Nota', 'Jogo']);
      // o alinhamento anda com a coluna
      expect(texto()!.split('\n')[1]).toBe('| ---: | --- |');
      run({ tabela: 'fileiraEmCima' });
      expect(grade().length).toBe(4);
      expect(naCelula()).toEqual([2, 1, 0]);
      run({ tabela: 'tirarFileira' });
      run({ tabela: 'colunaAntes' });
      expect(grade()[0]).toEqual(['Nota', '', 'Jogo']);
      run({ tabela: 'tirarColuna' });
      expect(grade()[0]).toEqual(['Nota', 'Jogo']);
      run({ tabela: { alinhar: 'center' } });
      expect(texto()!.split('\n')[1]).toBe('| ---: | :---: |');
      run({ tabela: { jeito: 'caneta' } });
      expect(texto()!.split('\n')[0]).toBe('{{tabela: caneta}}');
      run({ tabela: { jeito: 'branca' } });
      expect(texto()!.split('\n')[0]).toBe('| Nota | Jogo |');
      run('undo');
      expect(texto()!.split('\n')[0]).toBe('{{tabela: caneta}}');
    });

    it('o cabeçalho fica no lugar e os limites da folha valem (12 colunas)', async () => {
      await make(T);
      cursor(celula(0, 0));
      const antes = view.state.doc;
      run({ tabela: 'descerFileira' });
      run({ tabela: 'tirarFileira' });
      run({ tabela: 'fileiraEmCima' });
      expect(view.state.doc.eq(antes)).toBeTrue();
      for (let i = 0; i < 15; i++) run({ tabela: 'colunaDepois' });
      expect(grade()[0].length).toBe(12);
    });

    it('Tirar a tabela: ela sai inteira (o Ctrl+Z volta); sozinha no texto, fica a linha vazia', async () => {
      await make('antes\n' + T);
      cursor(celula(1, 1));
      run({ tabela: 'tirarTabela' });
      expect(texto()).toBe('antes');
      run('undo');
      expect(texto()).toBe('antes\n' + T);
    });

    it('Tirar a tabela que está sozinha no texto: fica a linha vazia', async () => {
      await make(T);
      cursor(celula(1, 1));
      run({ tabela: 'tirarTabela' });
      expect(tipos()).toEqual(['linha']);
      expect(texto()).toBe('');
    });

    it('Inserir › Tabela com o cursor numa tabela: a nova vem depois dela, separada por uma linha vazia', async () => {
      await make(T);
      cursor(celula(1, 1));
      run('tabela');
      expect(tipos()).toEqual(['tabela', 'linha', 'tabela']);
      expect(texto()).toBe(T + '\n\n|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |');
      expect(view.state.selection.$from.parent.type.name).toBe('cabeca');
    });

    it('Inserir › Tabela dentro de um item: a tabela entra no recuo da descrição', async () => {
      await make('- item');
      cursor(view.state.doc.child(0).nodeSize - 1);
      run('tabela');
      expect(texto()).toBe('- item\n  |  |  |  |\n  | --- | --- | --- |\n  |  |  |  |\n  |  |  |  |');
    });
  });

  it('o cursor numa célula vai e volta pelas posições do texto (a troca de aba)', async () => {
    const t = 'antes\n{{tabela: recibo}}\n| A | **Bê** |\n| --- | --- |\n| c | d \\| e |';
    await make(t);
    const ed = fixture.componentInstance;
    for (const [f, c, off] of [
      [0, 0, 0],
      [0, 1, 1],
      [0, 1, 2],
      [1, 1, 3],
      [1, 0, 1],
    ]) {
      cursor(celula(f, c) + off);
      const [a] = ed.selecaoNoTexto();
      cursor(1);
      ed.poeSelecao(a, a);
      expect(naCelula()).withContext(`${f},${c},${off}`).toEqual([f, c, off]);
    }
    // a letra depois do "\|" é o "e"
    cursor(celula(1, 1) + 3);
    expect(t.slice(ed.selecaoNoTexto()[0])).toBe(' e |');
  });
});
