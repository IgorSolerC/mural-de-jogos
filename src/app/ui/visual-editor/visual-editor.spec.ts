import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textToDoc } from '../../core/rich-doc';
import { Review } from '../../core/review';
import { Block, parseInline, parseRich } from '../../core/rich-text';
import { SETTINGS_KEY } from '../../core/settings';
import { linguaDe } from './schema';
import { VisualEditor } from './visual-editor';
import { EstadoVisual, PedidoLink } from './visual-api';

/**
 * O modo Visual (PLANO-EDITOR-VISUAL.md, rodada 2). As teclas e as letras vão direto para a vista do
 * ProseMirror (o `handleKeyDown` e o `handleTextInput` dos plugins, e a seleção despachada na vista),
 * sem depender do foco nem do `selectionchange` do navegador, que chega depois da tecla (o R9 do plano).
 */
describe('o modo Visual do texto', () => {
  let fixture: ComponentFixture<VisualEditor>;
  let view: EditorView;
  let valor: string | null;
  let estado: EstadoVisual | null;
  let avisos: string[];
  let pedidos: [number, number][];
  let links: PedidoLink[];

  async function make(texto: string, inputs: Record<string, unknown> = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [VisualEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(VisualEditor);
    fixture.componentRef.setInput('texto', texto);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    valor = null;
    estado = null;
    avisos = [];
    pedidos = [];
    links = [];
    const ed = fixture.componentInstance;
    // como o editor: o texto escrito volta como o valor de agora
    ed.mudou.subscribe((t) => {
      valor = t;
      fixture.componentRef.setInput('texto', t);
    });
    ed.estado.subscribe((e) => (estado = e));
    ed.aviso.subscribe((a) => avisos.push(a));
    ed.pedeMarkdown.subscribe((p) => pedidos.push(p));
    ed.pedeLink.subscribe((p) => links.push(p));
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    view = (ed as unknown as { view: EditorView }).view;
  }

  afterEach(() => fixture?.destroy());

  const tipos = () => {
    const out: string[] = [];
    view.state.doc.forEach((n) => out.push(n.type.name));
    return out;
  };
  /** O cursor (ou a seleção) na posição do texto guardado. */
  function noTexto(de: number, ate = de): void {
    fixture.componentInstance.poeSelecao(de, ate);
  }
  /** O cursor no fim da linha `i` do documento. */
  function fimDaLinha(i: number): void {
    let pos = 0;
    for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + view.state.doc.child(i).nodeSize - 1)));
  }
  /** Letras digitadas uma a uma, como o teclado (os atalhos de digitação valem). */
  function digita(texto: string): void {
    for (const ch of texto) {
      const { from, to } = view.state.selection;
      if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  }
  function tecla(key: string, init: KeyboardEventInit = {}): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    view.dom.dispatchEvent(e);
    return e;
  }
  const ctrl = (key: string, shift = false) => tecla(key, { ctrlKey: true, shiftKey: shift, code: key.length === 1 ? 'Key' + key.toUpperCase() : key });
  const texto = () => valor;

  describe('abrir e sair sem mexer (I1)', () => {
    const textos = [
      '# Título\nUm **negrito** e *itálico*.\n- item\n\n> citação',
      '__negrito à moda antiga__ e _itálico_\n* item\n1. um\n1. um de novo\n####### nada',
      'linha do Windows\r\ncom \\* barra\r\n\r\n```\ncódigo **cru**\n```',
      '| a | b |\n| --- | --- |\n| 1 | 2 |\n{{contador: 25/12/2026 | Natal}}\n-# sutil\n---',
      'Veja [o site](https://exemplo.com/a_(b)), <https://x.com>, www.y.com.br e https://z.com.\n[[Compras]] e [[Sumida|esta aqui]] e **[[Forte]]**',
      '',
    ];
    for (const t of textos)
      it(`não muda um byte: ${JSON.stringify(t.slice(0, 30))}`, async () => {
        await make(t);
        expect(valor).toBeNull();
        // andar pelo texto e pedir o desfazer (sem nada a desfazer) também não muda nada
        noTexto(t.length);
        noTexto(0);
        fixture.componentInstance.run('undo');
        expect(valor).toBeNull();
      });

    it('cada linha vira o nó dela (o bloco de código, o item, o widget e a tabela também); a linha que o tradutor não escreve igual é um trecho cru', async () => {
      await make('# t\n> c\n-# s\n---\ntexto\n- item\n```\nx\n```\n| a |\n| --- |\n\n{{contador: 1/1/2030}}))->{{enquete: x}}\n\n{{contador: 25/12/2026 | Natal}}');
      expect(tipos()).toEqual(['titulo', 'citacao', 'sutil', 'divisoria', 'linha', 'item', 'blocoCodigo', 'tabela', 'linha', 'cru', 'linha', 'widget']);
      expect(fixture.nativeElement.querySelectorAll('.vis-cru .formatado').length).toBe(1);
      // a folha é uma caixa de texto com nome
      expect(view.dom.getAttribute('role')).toBe('textbox');
      expect(view.dom.getAttribute('aria-multiline')).toBe('true');
    });
  });

  describe('escrever', () => {
    it('mexer numa linha muda só ela (I2): o "__x__" e o "* item" das outras ficam', async () => {
      await make('__antigo__\nmeio\n* item');
      fimDaLinha(1);
      digita(' e fim');
      expect(texto()).toBe('__antigo__\nmeio e fim\n* item');
    });

    it('Ctrl+B na palavra selecionada liga o negrito, acende o botão, e de novo desliga', async () => {
      await make('uma palavra');
      noTexto(4, 11);
      expect(ctrl('b').defaultPrevented).toBeTrue();
      expect(texto()).toBe('uma **palavra**');
      expect(estado?.marcas).toEqual(['bold']);
      ctrl('b');
      expect(texto()).toBe('uma palavra');
      expect(estado?.marcas).toEqual([]);
    });

    it('sem seleção, Ctrl+B vale para o que vem (e as marcas continuam na ponta, como no Docs)', async () => {
      await make('a');
      noTexto(1);
      ctrl('b');
      expect(estado?.marcas).toEqual(['bold']);
      digita('bc');
      expect(texto()).toBe('a**bc**');
      digita('d');
      expect(texto()).toBe('a**bcd**');
    });

    it('cada marca da régua: itálico, riscado, marca-texto, spoiler, sutil e código', async () => {
      await make('x');
      const ed = fixture.componentInstance;
      const casos: [Parameters<VisualEditor['run']>[0], string][] = [
        ['italic', '*x*'],
        ['strike', '~~x~~'],
        ['mark', '==x=='],
        ['spoiler', '||x||'],
        ['subtle', '((x))'],
        ['code', '`x`'],
      ];
      for (const [acao, escrito] of casos) {
        noTexto(0, 1);
        expect(ed.run(acao)).toBeTrue();
        expect(texto()).withContext(String(acao)).toBe(escrito);
        noTexto(0, escrito.length);
        ed.run(acao);
        expect(texto()).toBe('x');
      }
    });

    it('o que se escreve é texto: os sinais que a leitura leria como marca saem com a barra', async () => {
      await make('');
      digita('*a* e 2 **3 e # não é título');
      const lido = parseRich(texto()!);
      expect(lido.length).toBe(1);
      expect(JSON.stringify(lido[0])).not.toContain('"italic"');
      expect(textToDoc(texto()!).linhas[0].kind).toBe('linha');
    });

    it('o título sem letra é a linha vazia no texto (a tela fica com o título esperando)', async () => {
      await make('');
      fixture.componentInstance.run({ estilo: 't1' });
      expect(tipos()).toEqual(['titulo']);
      expect(valor ?? '').toBe('');
      digita('Oi');
      expect(texto()).toBe('# Oi');
    });

    it('o estilo do parágrafo e a divisória da régua', async () => {
      await make('linha');
      const ed = fixture.componentInstance;
      noTexto(2);
      ed.run({ estilo: 't2' });
      expect(texto()).toBe('## linha');
      expect(estado?.estilo).toBe('t2');
      ed.run({ estilo: 'citacao' });
      expect(texto()).toBe('> linha');
      ed.run({ estilo: 'sutil' });
      expect(texto()).toBe('-# linha');
      ed.run({ estilo: 'texto' });
      expect(texto()).toBe('linha');
      ed.run('rule');
      expect(texto()).toBe('linha\n---\n');
      expect(tipos()).toEqual(['linha', 'divisoria', 'linha']);
    });

    it('desfazer e refazer pelo histórico do Visual', async () => {
      await make('a');
      noTexto(1);
      digita('b');
      expect(estado?.desfazer).toBeTrue();
      fixture.componentInstance.run('undo');
      expect(texto()).toBe('a');
      expect(estado?.refazer).toBeTrue();
      fixture.componentInstance.run('redo');
      expect(texto()).toBe('ab');
    });
  });

  describe('o bloco de código', () => {
    it('"```" e Enter abre o bloco; Enter quebra dentro; Enter na linha vazia do fim sai (a linha vazia sai junto)', async () => {
      await make('');
      digita('```');
      tecla('Enter');
      expect(tipos()).toEqual(['blocoCodigo']);
      expect(texto()).toBe('```\n```');
      expect(estado?.estilo).toBe('codigo');
      digita('a*b -> c');
      tecla('Enter');
      digita('  d');
      expect(texto()).toBe('```\na*b -> c\n  d\n```');
      tecla('Enter');
      expect(tipos()).toEqual(['blocoCodigo']);
      tecla('Enter');
      expect(tipos()).toEqual(['blocoCodigo', 'linha']);
      digita('fim');
      expect(texto()).toBe('```\na*b -> c\n  d\n```\nfim');
      // a letra de máquina da leitura, sem marca nenhuma
      const pre = fixture.nativeElement.querySelector('pre.codigo') as HTMLElement;
      expect(pre.querySelector('code')!.textContent).toBe('a*b -> c\n  d');
    });

    describe('a linguagem do bloco ("```js")', () => {
      it('"```js" e Enter abre o bloco com a linguagem; abrir e sair sem mexer não muda um byte', async () => {
        await make('');
        digita('```js');
        tecla('Enter');
        expect(tipos()).toEqual(['blocoCodigo']);
        expect(view.state.doc.child(0).attrs['lingua']).toBe('js');
        expect(texto()).toBe('```js\n```');
        expect(estado?.codigo).toEqual({ lingua: 'js' });
        digita('const a = 1');
        expect(texto()).toBe('```js\nconst a = 1\n```');
      });

      it('o bloco com linguagem (até com espaço antes dela) abre e sai sem mudar um byte', async () => {
        await make('antes\n``` python\nx = 1\n```');
        expect(valor).toBeNull();
        expect(view.state.doc.child(1).attrs['lingua']).toBe('python');
      });

      it('a etiqueta mostra o nome; o menu "Código" troca, tira e desfaz o bloco, e copia só as letras', async () => {
        await make('```ts\nlet x: number\n```');
        const pre = fixture.nativeElement.querySelector('pre.codigo') as HTMLElement;
        expect(pre.querySelector('.codigo-lingua')!.textContent).toBe('TypeScript');
        noTexto(7);
        expect(estado?.codigo).toEqual({ lingua: 'ts' });
        fixture.componentInstance.run({ codigo: { lingua: 'py' } });
        expect(texto()).toBe('```py\nlet x: number\n```');
        expect(pre.querySelector('.codigo-lingua')!.textContent).toBe('Python');
        fixture.componentInstance.run({ codigo: { lingua: '' } });
        expect(texto()).toBe('```\nlet x: number\n```');
        expect((pre.querySelector('.codigo-lingua') as HTMLElement).hidden).toBeTrue();
        const escrito = spyOn(navigator.clipboard, 'writeText').and.resolveTo();
        fixture.componentInstance.run({ codigo: 'copiar' });
        await fixture.whenStable();
        expect(escrito).toHaveBeenCalledWith('let x: number');
        fixture.componentInstance.run({ codigo: 'desfazer' });
        expect(tipos()).toEqual(['linha']);
        expect(estado?.codigo).toBeNull();
      });

      it('o botão da linguagem no bloco do cursor pede o menu (sem tirar o foco); fora do bloco, sem os botões', async () => {
        await make('fora\n```sql\nselect 1\n```');
        let pediu = 0;
        fixture.componentInstance.pedeLingua.subscribe(() => pediu++);
        noTexto(12);
        const pre = fixture.nativeElement.querySelector('pre.codigo') as HTMLElement;
        expect(pre.classList).toContain('vis-codigo-ativo');
        (pre.querySelector('.vis-codigo-botao') as HTMLElement).click();
        expect(pediu).toBe(1);
        noTexto(1);
        expect(pre.classList).not.toContain('vis-codigo-ativo');
      });

      it('as cores chegam do colorir como decorações (o texto continua só letras)', async () => {
        const { loadCodeHighlight } = await import('../../core/code-highlight');
        await loadCodeHighlight();
        await make('```js\nconst n = 42 // fim\n```');
        await fixture.whenStable();
        const code = fixture.nativeElement.querySelector('pre.codigo code') as HTMLElement;
        expect(code.querySelector('.tk-pal')?.textContent).toBe('const');
        expect(code.querySelector('.tk-num')?.textContent).toBe('42');
        expect(code.querySelector('.tk-com')?.textContent).toBe('// fim');
        expect(code.textContent).toBe('const n = 42 // fim');
        expect(valor).toBeNull();
      });
    });

    it('o que tem crase no começo de uma linha ganha uma cerca maior; Ctrl+B e os atalhos não valem dentro', async () => {
      await make('');
      digita('```');
      tecla('Enter');
      digita('```');
      expect(texto()).toBe('````\n```\n````');
      noTexto(5, 8);
      expect(ctrl('b').defaultPrevented).toBeTrue();
      expect(texto()).toBe('````\n```\n````');
      expect(estado?.marcas).toEqual([]);
    });

    it('Tab põe o recuo; Shift+Tab tira; sem nada para tirar, a tecla continua no bloco (o foco não sai)', async () => {
      await make('```\nx\ny\n```');
      noTexto(4);
      expect(tecla('Tab').defaultPrevented).toBeTrue();
      expect(texto()).toBe('```\n  x\ny\n```');
      // as duas linhas selecionadas: uma parada em cada uma
      noTexto(6, 9);
      tecla('Tab');
      expect(texto()).toBe('```\n    x\n  y\n```');
      tecla('Tab', { shiftKey: true });
      tecla('Tab', { shiftKey: true });
      expect(texto()).toBe('```\nx\ny\n```');
      expect(tecla('Tab', { shiftKey: true }).defaultPrevented).toBeTrue();
      expect(tipos()).toEqual(['blocoCodigo']);
    });

    describe('as teclas de um editor de código', () => {
      /** O cursor no índice das letras do bloco da linha `i`. */
      function noBloco(col: number, ate = col, i = 0): void {
        let pos = 0;
        for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1 + col, pos + 1 + ate)));
      }
      const letras = (i = 0) => view.state.doc.child(i).textContent;
      const cursor = () => view.state.selection.from - 1;

      it('o Tab com tab no começo da linha é tab; o Shift+Tab tira o tab', async () => {
        await make('```\na\n\tb\n```');
        noBloco(letras().length);
        tecla('Enter');
        expect(letras()).toBe('a\n\tb\n\t');
        tecla('Tab');
        expect(letras()).toBe('a\n\tb\n\t\t');
        tecla('Tab', { shiftKey: true });
        tecla('Tab', { shiftKey: true });
        expect(letras()).toBe('a\n\tb\n');
      });

      it('o Enter mantém o recuo, sobe um nível depois da chave, e o fecho desce', async () => {
        await make('```js\n  if (x) {}\n```');
        noBloco('  if (x) {'.length);
        tecla('Enter');
        expect(letras()).toBe('  if (x) {\n    \n  }');
        expect(cursor()).toBe('  if (x) {\n    '.length);
        digita('y();');
        tecla('Enter');
        digita('z();');
        expect(letras()).toBe('  if (x) {\n    y();\n    z();\n  }');
      });

      it('o Enter na linha só de recuo no fim do bloco sai dele', async () => {
        await make('```\n  a\n```');
        noBloco(3);
        tecla('Enter');
        expect(letras()).toBe('  a\n  ');
        tecla('Enter');
        expect(tipos()).toEqual(['blocoCodigo', 'linha']);
        expect(letras()).toBe('  a');
        expect(texto()).toBe('```\n  a\n```\n');
      });

      it('a cerca escrita na última linha fecha o bloco, como no Markdown', async () => {
        await make('```\na\n```');
        noBloco(1);
        tecla('Enter');
        digita('```');
        tecla('Enter');
        expect(tipos()).toEqual(['blocoCodigo', 'linha']);
        expect(letras()).toBe('a');
      });

      it('o Shift+Enter quebra sempre, com o recuo', async () => {
        await make('```\n  a\n```');
        noBloco(3);
        tecla('Enter', { shiftKey: true });
        tecla('Enter', { shiftKey: true });
        expect(tipos()).toEqual(['blocoCodigo']);
        expect(letras()).toBe('  a\n\n  ');
      });

      it('o Backspace no recuo volta uma parada; nas letras, uma letra', async () => {
        await make('```\na\n  b\n    c\n```');
        noBloco('a\n  b\n    '.length);
        tecla('Backspace');
        expect(letras()).toBe('a\n  b\n  c');
        tecla('Backspace');
        expect(letras()).toBe('a\n  b\nc');
      });

      it('o Backspace no recuo pelo teclado do celular (a tecla 229) também volta uma parada', async () => {
        await make('```\na\n  b\n    c\n```');
        noBloco('a\n  b\n    '.length);
        const e = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true });
        view.dom.dispatchEvent(e);
        expect(e.defaultPrevented).toBeTrue();
        expect(letras()).toBe('a\n  b\n  c');
      });

      it('Alt+setas movem a linha; Shift+Alt+setas duplicam; Ctrl+Shift+K apaga', async () => {
        await make('```\na\nb\nc\n```');
        noBloco(2);
        tecla('ArrowUp', { altKey: true });
        expect(letras()).toBe('b\na\nc');
        expect(cursor()).toBe(0);
        tecla('ArrowDown', { altKey: true });
        tecla('ArrowDown', { altKey: true });
        expect(letras()).toBe('a\nc\nb');
        // na ponta, a tecla fica com o bloco e nada muda
        expect(tecla('ArrowDown', { altKey: true }).defaultPrevented).toBeTrue();
        expect(letras()).toBe('a\nc\nb');
        tecla('ArrowUp', { altKey: true, shiftKey: true });
        expect(letras()).toBe('a\nc\nb\nb');
        tecla('ArrowDown', { altKey: true, shiftKey: true });
        expect(letras()).toBe('a\nc\nb\nb\nb');
        // (com o Shift, a tecla chega maiúscula, e o Ctrl+K sozinho é o do link)
        tecla('K', { ctrlKey: true, shiftKey: true, keyCode: 75 } as KeyboardEventInit);
        expect(letras()).toBe('a\nc\nb\nb');
      });

      it('Ctrl+/ comenta na linguagem do bloco; sem linguagem, passa (é a da Ajuda)', async () => {
        await make('```py\nx = 1\n```');
        noBloco(0);
        expect(tecla('/', { ctrlKey: true, code: 'Slash' }).defaultPrevented).toBeTrue();
        expect(letras()).toBe('# x = 1');
        tecla('/', { ctrlKey: true, code: 'Slash' });
        expect(letras()).toBe('x = 1');
        fixture.destroy();
        TestBed.resetTestingModule();
        await make('```\nx\n```');
        noBloco(0);
        expect(tecla('/', { ctrlKey: true, code: 'Slash' }).defaultPrevented).toBeFalse();
      });

      it('o Ctrl+] e o Ctrl+[ recuam, só dentro do bloco', async () => {
        await make('```\nx\n```\nfora');
        noBloco(0);
        tecla(']', { ctrlKey: true });
        expect(letras()).toBe('  x');
        tecla('[', { ctrlKey: true });
        expect(letras()).toBe('x');
        fimDaLinha(1);
        expect(tecla(']', { ctrlKey: true }).defaultPrevented).toBeFalse();
      });

      it('o Home vai ao começo das letras e, de novo, ao começo da linha; com o Shift, seleciona', async () => {
        await make('```\n    abc\n```');
        noBloco(6);
        tecla('Home');
        expect(cursor()).toBe(4);
        tecla('Home');
        expect(cursor()).toBe(0);
        noBloco(6);
        tecla('Home', { shiftKey: true });
        expect(view.state.selection.anchor - 1).toBe(6);
        expect(view.state.selection.head - 1).toBe(4);
      });

      it('o Ctrl+A pega as letras do bloco; de novo, o texto todo', async () => {
        await make('antes\n```\nabc\n```\ndepois');
        noBloco(1, 1, 1);
        ctrl('a');
        expect(view.state.selection.from).toBe(view.state.doc.child(0).nodeSize + 1);
        expect(view.state.selection.to).toBe(view.state.doc.child(0).nodeSize + 4);
        ctrl('a');
        expect(view.state.selection.from).toBe(0);
        expect(view.state.selection.to).toBe(view.state.doc.content.size);
      });

      it('o que entra pela seleção de várias linhas é um passo só no Ctrl+Z', async () => {
        await make('```\na\nb\n```');
        noBloco(0, 3);
        tecla('Tab');
        expect(letras()).toBe('  a\n  b');
        ctrl('z');
        expect(letras()).toBe('a\nb');
      });

      it('a seta para baixo no último bloco do texto abre uma linha embaixo; para cima, no primeiro, em cima', async () => {
        await make('```\na\nb\n```');
        noBloco(0);
        tecla('ArrowDown');
        // ainda não está na última linha do bloco: a seta é do navegador
        expect(tipos()).toEqual(['blocoCodigo']);
        noBloco(3);
        expect(tecla('ArrowDown').defaultPrevented).toBeTrue();
        expect(tipos()).toEqual(['blocoCodigo', 'linha']);
        expect(view.state.selection.$from.parent.type.name).toBe('linha');
        noBloco(0);
        expect(tecla('ArrowUp').defaultPrevented).toBeTrue();
        expect(tipos()).toEqual(['linha', 'blocoCodigo', 'linha']);
        expect(view.state.selection.$from.parent.type.name).toBe('linha');
      });

      it('a seta com alguma coisa do outro lado não abre nada', async () => {
        await make('a\n```\nb\n```\nc');
        noBloco(1, 1, 1);
        expect(tecla('ArrowDown').defaultPrevented).toBeFalse();
        noBloco(0, 0, 1);
        expect(tecla('ArrowUp').defaultPrevented).toBeFalse();
        expect(tipos()).toEqual(['linha', 'blocoCodigo', 'linha']);
      });

      it('o Backspace embaixo do bloco não junta nele: a linha vazia sai, e da que tem texto o cursor só sobe', async () => {
        await make('```\na\n```\n\n**b**');
        const inicio = (i: number) => {
          let pos = 0;
          for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
          return pos + 1;
        };
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, inicio(1))));
        tecla('Backspace');
        expect(tipos()).toEqual(['blocoCodigo', 'linha']);
        expect(view.state.selection.$from.parent.type.name).toBe('blocoCodigo');
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, inicio(1))));
        tecla('Backspace');
        expect(tipos()).toEqual(['blocoCodigo', 'linha']);
        expect(letras()).toBe('a');
        expect(view.state.selection.$from.parent.type.name).toBe('blocoCodigo');
        expect(cursor()).toBe(1);
        // o negrito de baixo continua negrito
        expect(texto()).toContain('**b**');
      });

      it('o Delete no fim do bloco não engole o que vem embaixo; a linha vazia sai', async () => {
        await make('```\na\n```\n\nb');
        noBloco(1);
        tecla('Delete');
        expect(tipos()).toEqual(['blocoCodigo', 'linha']);
        tecla('Delete');
        expect(tipos()).toEqual(['blocoCodigo', 'linha']);
        expect(letras()).toBe('a');
        expect(letras(1)).toBe('b');
      });

      it('o Backspace no começo do bloco com uma linha vazia em cima tira só ela; sem ela, o bloco vira texto', async () => {
        await make('\n```\na\n```');
        noBloco(0, 0, 1);
        tecla('Backspace');
        expect(tipos()).toEqual(['blocoCodigo']);
        noBloco(0);
        tecla('Backspace');
        expect(tipos()).toEqual(['linha']);
        expect(letras()).toBe('a');
      });

      it('"``` js" (com espaço) e o tema também abrem o bloco', async () => {
        await make('');
        digita('``` js tema=dracula');
        tecla('Enter');
        expect(tipos()).toEqual(['blocoCodigo']);
        expect(texto()).toBe('```js tema=dracula\n```');
      });
    });

    describe('o bloco dentro de um card', () => {
      const card = '> [!nota] T\n> ```\n> a\n> ```\n> b';

      it('sair dele com o Enter fica no card, e o que vem embaixo continua no card', async () => {
        await make(card);
        const pos = view.state.doc.child(0).nodeSize;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 2)));
        tecla('Enter');
        tecla('Enter');
        expect(tipos()).toEqual(['cartaoTopo', 'blocoCodigo', 'linha', 'linha']);
        const fim = texto()!.split('\n');
        expect(fim.slice(0, 4)).toEqual(['> [!nota] T', '> ```', '> a', '> ```']);
        expect(fim.at(-1)).toBe('> b');
        expect(fim[4].trim()).toBe('>');
      });

      it('o Ctrl+E e o "```" escrito numa linha ficam no card', async () => {
        await make(card);
        const pos = view.state.doc.child(0).nodeSize;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 2)));
        ctrl('e');
        expect(tipos()).toEqual(['cartaoTopo', 'linha', 'linha']);
        expect(texto()).toBe('> [!nota] T\n> a\n> b');
        fimDaLinha(2);
        tecla('Enter');
        digita('```');
        tecla('Enter');
        expect(texto()).toBe('> [!nota] T\n> a\n> b\n> ```\n> ```');
      });
    });

    describe('o recuo do bloco', () => {
      it('escrito na descrição de um item, as letras ficam com o recuo da cerca (a leitura não as perde)', async () => {
        await make('1. item\n   ');
        fimDaLinha(1);
        digita('```');
        tecla('Enter');
        digita('INSERT');
        tecla('Enter');
        digita('  x');
        expect(texto()).toBe('1. item\n   ```\n   INSERT\n     x\n   ```');
        const blocos = parseRich(texto()!);
        expect(blocos.length).toBe(1);
        const corpo = (blocos[0] as Extract<Block, { kind: 'ol' }>).items[0].body!;
        expect(corpo).toEqual([jasmine.objectContaining({ kind: 'code', text: 'INSERT\n  x' })]);
      });

      it('o texto de antes, com as letras menos recuadas que a cerca, abre como um bloco só, e mexer nele arruma as letras', async () => {
        const antes = '   1.2. item\n        ```\nINSERT\n        ```\n\n2. outro';
        await make(antes);
        expect(tipos()).toEqual(['item', 'blocoCodigo', 'linha', 'item']);
        expect(view.state.doc.child(1).textContent).toBe('INSERT');
        const pos = view.state.doc.child(0).nodeSize;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1 + 6)));
        digita(';');
        expect(texto()).toBe('   1.2. item\n        ```\n        INSERT;\n        ```\n\n2. outro');
      });

      it('o tab de dentro do código continua um tab, no bloco recuado também', async () => {
        await make('- item\n  ```\n  a\n  \tb\n  ```');
        expect(view.state.doc.child(1).textContent).toBe('a\n\tb');
        const pos = view.state.doc.child(0).nodeSize;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 2)));
        digita('c');
        expect(texto()).toBe('- item\n  ```\n  ac\n  \tb\n  ```');
      });

      it('o bloco recuado fora de lista: as letras começam na coluna da cerca', async () => {
        await make('    ```\n    a\n      b\n    ```');
        expect(view.state.doc.child(0).textContent).toBe('a\n  b');
        expect(view.state.doc.child(0).attrs['recuo']).toBe(4);
      });
    });

    describe('o tema', () => {
      const pre = () => fixture.nativeElement.querySelector('pre.codigo') as HTMLElement;

      it('o escrito depois das crases veste o bloco; o Papel não leva marca', async () => {
        await make('```js tema=dracula\nlet a\n```');
        expect(pre().dataset['tema']).toBe('dracula');
        expect(getComputedStyle(pre()).color).toBe('rgb(248, 248, 242)');
        expect(getComputedStyle(pre(), '::before').backgroundColor).toBe('rgb(40, 42, 54)');
        // a linguagem continua a que era
        expect(pre().dataset['lingua']).toBe('js tema=dracula');
        expect(pre().querySelector('.codigo-lingua')!.textContent).toBe('JavaScript');
      });

      it('o menu troca o tema, e a linguagem fica', async () => {
        await make('```js\nlet a\n```');
        noTexto(6);
        expect(pre().dataset['tema']).toBeUndefined();
        fixture.componentInstance.run({ codigo: { tema: 'xcode' } });
        expect(pre().dataset['tema']).toBe('xcode');
        expect(texto()).toBe('```js tema=xcode\nlet a\n```');
        fixture.componentInstance.run({ codigo: { lingua: 'py' } });
        expect(texto()).toBe('```py tema=xcode\nlet a\n```');
        fixture.componentInstance.run({ codigo: { lingua: '' } });
        expect(texto()).toBe('```tema=xcode\nlet a\n```');
        fixture.componentInstance.run({ codigo: { tema: '' } });
        expect(pre().dataset['tema']).toBeUndefined();
        expect(texto()).toBe('```\nlet a\n```');
      });

      it('copiado e lido do HTML, o bloco leva a linguagem e o tema', () => {
        const pre = document.createElement('pre');
        pre.setAttribute('data-lingua', 'js tema=dracula');
        expect(linguaDe(pre)).toBe('js tema=dracula');
        pre.setAttribute('data-lingua', 'tema=xcode`');
        expect(linguaDe(pre)).toBe('tema=xcode');
      });

      it('sem tema escrito, o padrão dos Ajustes; o escrito manda nele', async () => {
        const antes = localStorage.getItem(SETTINGS_KEY);
        localStorage.setItem(SETTINGS_KEY, JSON.stringify({ notesConfig: { codeTheme: 'vscode' } }));
        try {
          await make('```\na\n```\n```tema=papel\nb\n```');
          const [um, dois] = Array.from(fixture.nativeElement.querySelectorAll('pre.codigo')) as HTMLElement[];
          expect(um.dataset['tema']).toBe('vscode');
          expect(dois.dataset['tema']).toBeUndefined();
        } finally {
          if (antes === null) localStorage.removeItem(SETTINGS_KEY);
          else localStorage.setItem(SETTINGS_KEY, antes);
        }
      });
    });

    it('Ctrl+E: numa linha vazia, o bloco; no bloco, volta a ser texto; em várias linhas, as letras delas num bloco', async () => {
      await make('');
      ctrl('e');
      expect(tipos()).toEqual(['blocoCodigo']);
      expect(texto()).toBe('```\n```');
      digita('x');
      ctrl('e');
      expect(tipos()).toEqual(['linha']);
      expect(texto()).toBe('x');
    });

    it('Ctrl+E em várias linhas: as letras delas num bloco, selecionadas', async () => {
      await make('um **dois**\n# três');
      noTexto(0, 18);
      ctrl('e');
      expect(texto()).toBe('```\num dois\ntrês\n```');
      expect(view.state.selection.from).toBe(1);
      expect(view.state.selection.to).toBe(13);
    });

    it('o Formatar troca para o bloco e de volta; Backspace no começo do bloco o volta a texto', async () => {
      await make('a\nlinha');
      const ed = fixture.componentInstance;
      noTexto(4);
      ed.run({ estilo: 'codigo' });
      expect(texto()).toBe('a\n```\nlinha\n```');
      ed.run({ estilo: 't1' });
      expect(texto()).toBe('a\n# linha');
      ed.run({ estilo: 'codigo' });
      noTexto(6);
      expect(view.state.selection.$from.parentOffset).toBe(0);
      tecla('Backspace');
      expect(texto()).toBe('a\nlinha');
    });

    it('apagar uma seleção do meio de uma linha ao meio do bloco não deixa quebra dentro da linha', async () => {
      await make('ab\n```\ncd\nef\n```');
      noTexto(1, 8);
      tecla('Backspace');
      expect(tipos()).toEqual(['linha', 'linha']);
      expect(texto()).toBe('ad\nef');
    });

    it('Delete no fim de uma linha com o bloco embaixo: a vazia sai, a com texto fica', async () => {
      await make('a\n\n```\nx\n```');
      noTexto(2);
      tecla('Delete');
      expect(texto()).toBe('a\n```\nx\n```');
      noTexto(1);
      tecla('Delete');
      expect(texto()).toBe('a\n```\nx\n```');
    });

    it('a seleção do bloco vai e volta pelas posições do texto (na troca de aba)', async () => {
      const t = 'a\n```\num\ndois\n```';
      await make(t);
      const ed = fixture.componentInstance;
      for (const [a, b] of [
        [6, 6],
        [9, 12],
        [6, 13],
      ]) {
        ed.poeSelecao(a, b);
        expect(ed.selecaoNoTexto()).withContext(`${a}-${b}`).toEqual([a, b]);
      }
    });
  });

  describe('os links', () => {
    /** O primeiro trecho com a marca dada, na linha `i`. */
    const comMarca = (nome: string, i = 0) => {
      const out: string[] = [];
      view.state.doc.child(i).forEach((n) => {
        if (n.marks.some((m) => m.type.name === nome)) out.push(n.text!);
      });
      return out.join('');
    };

    it('Ctrl+K com uma palavra selecionada pede o painel com ela; pôr o link a marca; de novo, troca; tirar deixa o texto', async () => {
      await make('uma palavra');
      noTexto(4, 11);
      expect(ctrl('k').defaultPrevented).toBeTrue();
      expect(links).toEqual([{ tipo: 'url', de: 5, texto: 'palavra', href: '', troca: false, passivo: false }]);
      const ed = fixture.componentInstance;
      ed.poeLink('palavra', 'https://a.com');
      expect(texto()).toBe('uma [palavra](https://a.com)');
      expect(estado?.link).toBe(5);
      noTexto(7);
      ctrl('k');
      expect(links[1]).toEqual({ tipo: 'url', de: 5, texto: 'palavra', href: 'https://a.com', troca: true, passivo: false });
      ed.poeLink('outra', 'https://b.com');
      expect(texto()).toBe('uma [outra](https://b.com)');
      expect(comMarca('link')).toBe('outra');
      ctrl('k');
      ed.tiraLink();
      expect(texto()).toBe('uma outra');
    });

    it('sem seleção, o link entra com o endereço como texto (escrito solto); o endereço selecionado vai no campo', async () => {
      await make('x ');
      noTexto(2);
      fixture.componentInstance.pedeLinkAqui('url');
      fixture.componentInstance.poeLink('', 'https://c.com');
      expect(texto()).toBe('x https://c.com');
      digita(' e');
      expect(texto()).toBe('x https://c.com e');
    });

    it('o endereço solto vai no campo do endereço (o texto, vazio); no bloco de código não tem link', async () => {
      await make('www.a.com\n```\nb\n```');
      noTexto(0, 9);
      ctrl('k');
      expect(links[0]).toEqual(jasmine.objectContaining({ texto: '', href: 'https://www.a.com', troca: true }));
      noTexto(15);
      ctrl('k');
      expect(links.length).toBe(1);
    });

    it('tirar o link de um endereço solto deixa o texto, escapado (a leitura não o lê como link)', async () => {
      await make('veja https://a.com/x agora');
      noTexto(8);
      ctrl('k');
      expect(links[0]).toEqual(jasmine.objectContaining({ texto: '', href: 'https://a.com/x', troca: true }));
      fixture.componentInstance.tiraLink();
      expect(parseInline(texto()!).some((p) => p.href)).toBeFalse();
      expect(parseInline(texto()!).map((p) => p.text).join('')).toBe('veja https://a.com/x agora');
    });

    it('o link não cresce: escrever no fim dele e o Enter no fim ficam fora (o K7)', async () => {
      await make('[ab](https://a.com)');
      noTexto(19);
      digita('c');
      expect(texto()).toBe('[ab](https://a.com)c');
      view.dispatch(view.state.tr.delete(view.state.selection.from - 1, view.state.selection.from));
      tecla('Enter');
      digita('d');
      expect(texto()).toBe('[ab](https://a.com)\nd');
    });

    it('o colchete digitado dentro do link sai dele; as pontas de espaço também (o F7)', async () => {
      await make('[ab](https://a.com)');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 2)));
      digita('[');
      expect(comMarca('link')).toBe('ab');
      const lido = parseInline(texto()!);
      expect(lido.filter((p) => p.href).map((p) => p.text)).toEqual(['a', 'b']);
      expect(lido.map((p) => p.text).join('')).toBe('a[b');
    });

    it('a marca numa parte do link vale no link inteiro; tirar de uma parte tira do todo', async () => {
      await make('veja [ab](https://a.com) e');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 6, 7)));
      ctrl('b');
      expect(texto()).toBe('veja **[ab](https://a.com)** e');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 7, 8)));
      ctrl('b');
      expect(texto()).toBe('veja [ab](https://a.com) e');
    });

    it('escrever no texto de um link de anotação muda só o rótulo: o título fica (o K8)', async () => {
      await make('[[Compras]] e [[Sumida|esta aqui]]');
      noTexto(5);
      digita('x');
      expect(texto()).toBe('[[Compras|Comxpras]] e [[Sumida|esta aqui]]');
      view.dispatch(view.state.tr.delete(view.state.selection.from - 1, view.state.selection.from));
      expect(texto()).toBe('[[Compras]] e [[Sumida|esta aqui]]');
    });

    it('o link de anotação que não existe aparece tracejado', async () => {
      const compras = { id: 'c' } as Review;
      await make('[[Compras]] e [[Sumida|esta aqui]]', { links: { resolve: (t: string) => (t === 'Compras' ? compras : null) } });
      const elos = Array.from(fixture.nativeElement.querySelectorAll('.ProseMirror .elo') as NodeListOf<HTMLElement>);
      expect(elos.map((e) => e.textContent + (e.classList.contains('quebrado') ? ' (tracejado)' : ''))).toEqual(['Compras', 'esta aqui (tracejado)']);
      expect(elos[1].title).toBe('A anotação “Sumida” ainda não existe');
    });

    it('o "[[" antes do cursor conta a busca; escolhida a anotação, o link entra no lugar (e no de um "]]" logo depois)', async () => {
      await make('');
      digita('veja [[Com');
      expect(estado?.colchetes).toEqual({ de: 6, busca: 'Com' });
      fixture.componentInstance.poeElo('Compras', 'Compras', true);
      expect(texto()).toBe('veja [[Compras]]');
      expect(estado?.colchetes).toBeNull();
      digita(' e [[]]');
      const at = view.state.selection.from;
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, at - 2)));
      expect(estado?.colchetes).toEqual(jasmine.objectContaining({ busca: '' }));
      fixture.componentInstance.poeElo('Mercado do mês', 'o mercado', true);
      expect(texto()).toBe('veja [[Compras]] e [[Mercado do mês|o mercado]]');
    });

    it('o endereço solto vira link no espaço e no Enter (a pontuação do fim fica fora); o Backspace logo depois desfaz', async () => {
      await make('');
      digita('ir a www.site.com. ok');
      expect(comMarca('link')).toBe('www.site.com');
      expect(texto()).toBe('ir a www.site.com. ok');
      tecla('Enter');
      digita('https://a.com/x');
      tecla('Enter');
      expect(comMarca('link', 1)).toBe('https://a.com/x');
      digita('https://b.com ');
      tecla('Backspace');
      expect(comMarca('link', 2)).toBe('');
      expect(parseInline(texto()!.split('\n')[2]).some((p) => p.href)).toBeFalse();
    });

    it('um clique num link pede o painel passivo; Ctrl+clique abre o endereço numa aba nova', async () => {
      await make('veja [o site](https://a.com) e [[Compras]]');
      const abre = spyOn(window, 'open');
      const a = fixture.nativeElement.querySelector('a.url') as HTMLElement;
      const clique = new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 });
      a.dispatchEvent(clique);
      expect(clique.defaultPrevented).toBeTrue();
      expect(links).toEqual([{ tipo: 'url', de: 6, texto: 'o site', href: 'https://a.com', troca: true, passivo: true }]);
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1, ctrlKey: true }));
      expect(abre).toHaveBeenCalledOnceWith('https://a.com', '_blank', 'noopener,noreferrer');
      (fixture.nativeElement.querySelector('.ProseMirror span.elo') as HTMLElement).dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      expect(links[1]).toEqual({ tipo: 'elo', de: 15, titulo: 'Compras', rotulo: 'Compras', troca: true, passivo: true });
    });

    it('colar um endereço com um texto selecionado faz o link do texto', async () => {
      await make('um texto');
      noTexto(3, 8);
      const dados = new DataTransfer();
      dados.setData('text/plain', 'https://a.com/b');
      const e = new ClipboardEvent('paste', { clipboardData: dados, bubbles: true, cancelable: true });
      view.someProp('handlePaste', (f) => f(view, e, view.state.selection.content()));
      expect(texto()).toBe('um [texto](https://a.com/b)');
    });
  });

  describe('os atalhos de digitação', () => {
    it('"# ", "## ", "> " e "-# " no começo da linha', async () => {
      await make('');
      digita('# Um');
      expect(texto()).toBe('# Um');
      expect(tipos()).toEqual(['titulo']);
      tecla('Enter');
      digita('## Dois');
      tecla('Enter');
      digita('> cita');
      tecla('Enter');
      tecla('Enter');
      digita('-# sutil');
      expect(texto()).toBe('# Um\n## Dois\n> cita\n-# sutil');
    });

    it('as setas e os sinais viram os símbolos da leitura; o Backspace logo depois volta os sinais', async () => {
      await make('');
      digita('a -> b <=> c != d');
      expect(texto()).toBe('a → b ⇔ c ≠ d');
      digita(' ->');
      tecla('Backspace');
      expect(texto()).toBe('a → b ⇔ c ≠ d -\\>');
      expect(parseRich(texto()!)[0]).toEqual(jasmine.objectContaining({ kind: 'p' }));
    });

    it('no código, os sinais ficam como são', async () => {
      await make('x');
      noTexto(1);
      fixture.componentInstance.run('code');
      digita('a->b');
      expect(texto()).toBe('x`a->b`');
    });
  });

  describe('as teclas', () => {
    it('Enter parte a linha; no fim do título, a nova é texto; na citação vazia, ela acaba', async () => {
      await make('# Título\n> cita');
      fimDaLinha(0);
      tecla('Enter');
      digita('texto');
      expect(texto()).toBe('# Título\ntexto\n> cita');
      fimDaLinha(2);
      tecla('Enter');
      expect(tipos().at(-1)).toBe('citacao');
      tecla('Enter');
      expect(tipos().at(-1)).toBe('linha');
    });

    it('"---" e Enter é a divisória; o Backspace embaixo dela a seleciona, e de novo a tira', async () => {
      await make('');
      digita('---');
      tecla('Enter');
      expect(tipos()).toEqual(['divisoria', 'linha']);
      expect(texto()).toBe('---\n');
      digita('x');
      noTexto(4);
      tecla('Backspace');
      expect(view.state.selection instanceof NodeSelection).toBeTrue();
      tecla('Backspace');
      expect(texto()).toBe('x');
    });

    it('Backspace no começo do título, da citação e do sutil os volta a texto', async () => {
      await make('# a\n> b\n-# c');
      for (const at of [0, 4, 8]) {
        noTexto(at);
        const $f = view.state.selection.$from;
        view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, $f.start())));
        tecla('Backspace');
      }
      expect(texto()).toBe('a\nb\nc');
    });

    it('Tab e Shift+Tab mudam o recuo do texto de 2 em 2; sem recuo, o Shift+Tab passa (o foco sai)', async () => {
      await make('x');
      noTexto(1);
      expect(tecla('Tab').defaultPrevented).toBeTrue();
      expect(texto()).toBe('  x');
      tecla('Tab', { shiftKey: true });
      expect(texto()).toBe('x');
      expect(tecla('Tab', { shiftKey: true }).defaultPrevented).toBeFalse();
    });

    it('o Esc e o Ctrl+Enter passam adiante (o editor da ficha fecha, o comentário envia)', async () => {
      await make('a');
      noTexto(1);
      let chegou = 0;
      const conta = () => chegou++;
      document.body.addEventListener('keydown', conta);
      expect(tecla('Escape').defaultPrevented).toBeFalse();
      tecla('Enter', { ctrlKey: true });
      expect(texto()).toBeNull();
      expect(chegou).toBe(2);
      document.body.removeEventListener('keydown', conta);
    });

    it('o Enter e o apagar do teclado do celular vêm pelo beforeinput: nunca ficam com o navegador', async () => {
      await make('ação');
      noTexto(4);
      const e = new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true });
      view.dom.dispatchEvent(e);
      expect(e.defaultPrevented).toBeTrue();
      expect(texto()).toBe('açã');
      const enter = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
      view.dom.dispatchEvent(enter);
      expect(enter.defaultPrevented).toBeTrue();
      expect(texto()).toBe('açã\n');
    });
  });

  describe('em volta', () => {
    it('o limite é o da string guardada: a letra que passaria não entra, e um aviso diz', async () => {
      await make('abcd', { max: 9 });
      noTexto(0, 4);
      ctrl('b');
      expect(texto()).toBe('**abcd**');
      noTexto(8);
      digita('ef');
      expect(texto()).toBe('**abcde**');
      expect(avisos).toEqual(['Chegou no limite de 9 caracteres']);
    });

    it('o texto de fora refaz o documento (sem avisar de volta), com o cursor no mesmo ponto do texto', async () => {
      await make('primeira\nsegunda');
      view.focus();
      noTexto(3);
      fixture.componentRef.setInput('texto', 'nova\nprimeira\nsegunda');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(valor).toBeNull();
      expect(tipos()).toEqual(['linha', 'linha', 'linha']);
      expect(view.state.doc.child(0).textContent).toBe('nova');
    });

    it('escondido (na aba Markdown), não acompanha o texto; à mostra de novo, refaz', async () => {
      await make('a', { ativo: false });
      fixture.componentRef.setInput('texto', 'b');
      fixture.detectChanges();
      await fixture.whenStable();
      expect(view.state.doc.textContent).toBe('a');
      fixture.componentRef.setInput('ativo', true);
      fixture.detectChanges();
      await fixture.whenStable();
      expect(view.state.doc.textContent).toBe('b');
    });

    describe('o texto que muda por fora (5.19)', () => {
      /** O texto chega de fora (a colega, outro aparelho, a AI), como o editor manda. */
      async function chega(t: string): Promise<void> {
        fixture.componentRef.setInput('texto', t);
        fixture.detectChanges();
        await fixture.whenStable();
      }
      const nos = () => Array.from({ length: view.state.doc.childCount }, (_, i) => view.state.doc.child(i));

      it('a colega muda a linha 5 com o cursor na 2: o cursor fica, as outras linhas são os mesmos nós (S1), e o Ctrl+Z não desfaz o dela (S2)', async () => {
        await make('um\ndois\ntrês\nquatro\ncinco\nseis');
        noTexto(5);
        digita('X');
        expect(texto()).toBe('um\ndoXis\ntrês\nquatro\ncinco\nseis');
        const antes = nos();
        await chega('um\ndoXis\ntrês\nquatro\nCINCO, da colega\nseis');
        // não volta como escrito aqui
        expect(texto()).toBe('um\ndoXis\ntrês\nquatro\ncinco\nseis');
        expect(fixture.componentInstance.selecaoNoTexto()).toEqual([6, 6]);
        const depois = nos();
        for (const i of [0, 1, 2, 3, 5]) expect(depois[i]).withContext(`linha ${i}`).toBe(antes[i]);
        expect(depois[4]).not.toBe(antes[4]);
        expect(depois[4].textContent).toBe('CINCO, da colega');
        // o desfazer tira o X, e a linha da colega fica
        expect(estado?.desfazer).toBeTrue();
        fixture.componentInstance.run('undo');
        expect(texto()).toBe('um\ndois\ntrês\nquatro\nCINCO, da colega\nseis');
        expect(estado?.desfazer).toBeFalse();
      });

      it('a AI acrescenta no fim (o acrescentar_na_nota) enquanto se escreve: o cursor fica, e o que se escreve depois entra junto (S4)', async () => {
        await make('Compras\n- pão');
        noTexto(13);
        digita('zinho');
        await chega('Compras\n- pãozinho\n- leite\n- café');
        expect(tipos()).toEqual(['linha', 'item', 'item', 'item']);
        expect(fixture.componentInstance.selecaoNoTexto()).toEqual([18, 18]);
        digita('!');
        expect(texto()).toBe('Compras\n- pãozinho!\n- leite\n- café');
      });

      it('a linha onde se escreve, mudada por fora: o cursor fica no mesmo ponto dela', async () => {
        await make('abc\ndef');
        noTexto(6);
        await chega('abc\nDEFG');
        expect(fixture.componentInstance.selecaoNoTexto()).toEqual([6, 6]);
        expect(view.state.doc.child(1).textContent).toBe('DEFG');
      });

      it('a linha que fica guarda a quebra nova (o \\r\\n de quem escreveu)', async () => {
        await make('a\r\nb');
        await chega('a\r\nb\r\nc');
        noTexto(4);
        digita('x');
        expect(texto()).toBe('a\r\nbx\r\nc');
      });

      it('um bloco que muda de sentido por causa da linha de cima (a linha que vira corpo de item) é trocado', async () => {
        await make('texto\n  recuado');
        await chega('- item\n  recuado');
        expect(tipos()).toEqual(['item', 'linha']);
        noTexto(16);
        digita('!');
        expect(texto()).toBe('- item\n  recuado!');
      });

      it('a tabela de outra pessoa com uma fileira nova: só a tabela é trocada, o cursor continua na linha de cima', async () => {
        await make('topo\n| a | b |\n| --- | --- |\n| 1 | 2 |\nfim');
        noTexto(2);
        const antes = nos();
        await chega('topo\n| a | b |\n| --- | --- |\n| 1 | 2 |\n| 3 | 4 |\nfim');
        expect(tipos()).toEqual(['linha', 'tabela', 'linha']);
        expect(nos()[0]).toBe(antes[0]);
        expect(nos()[2]).toBe(antes[2]);
        expect(view.state.doc.child(1).childCount).toBe(3);
        expect(fixture.componentInstance.selecaoNoTexto()).toEqual([2, 2]);
      });

      it('outra ficha (recomeca): o desfazer começa vazio, e o texto novo chega fora dele', async () => {
        await make('a');
        noTexto(1);
        digita('b');
        expect(estado?.desfazer).toBeTrue();
        fixture.componentInstance.recomeca();
        await chega('outra ficha');
        expect(estado?.desfazer).toBeFalse();
        fixture.componentInstance.run('undo');
        expect(view.state.doc.textContent).toBe('outra ficha');
      });

      it('a tela cheia: a outra folha continua do estado desta, com o desfazer, e devolve ao sair (5.21)', async () => {
        await make('um');
        noTexto(2);
        digita(' dois');
        const pequena = fixture.componentInstance;
        const g = TestBed.createComponent(VisualEditor);
        g.componentRef.setInput('texto', 'um dois');
        g.componentRef.setInput('grande', true);
        let daGrande: string | null = null;
        g.componentInstance.mudou.subscribe((t) => {
          daGrande = t;
          g.componentRef.setInput('texto', t);
        });
        document.body.appendChild(g.nativeElement);
        g.detectChanges();
        await g.whenStable();
        g.componentInstance.recebeEstado(pequena.levaEstado());
        const gv = (g.componentInstance as unknown as { view: EditorView }).view;
        expect(gv.state.doc).toBe(view.state.doc);
        expect(g.componentInstance.selecaoNoTexto()).toEqual([7, 7]);
        // o desfazer da pequena vale na grande
        g.componentInstance.run('undo');
        expect(daGrande!).toBe('um');
        g.componentInstance.run('redo');
        gv.dispatch(gv.state.tr.insertText('!', gv.state.selection.from));
        expect(daGrande!).toBe('um dois!');
        // de volta: a pequena continua da grande (e desfaz o que se escreveu nela); o valor é um só
        fixture.componentRef.setInput('texto', daGrande);
        pequena.recebeEstado(g.componentInstance.levaEstado());
        g.destroy();
        expect(view.state.doc.textContent).toBe('um dois!');
        pequena.run('undo');
        expect(texto()).toBe('um dois');
      });

      it('o cursor anda e o texto muda: a folha conta onde ele está no texto guardado (a prévia vai até ele)', async () => {
        await make('# Título\num **forte** aqui');
        const cursores: number[] = [];
        fixture.componentInstance.cursor.subscribe((c) => cursores.push(c));
        noTexto(21);
        expect(cursores.at(-1)).toBe(21);
        digita('x');
        expect(cursores.at(-1)).toBe(22);
        // escondida (na aba Markdown), ela não conta
        fixture.componentRef.setInput('ativo', false);
        fixture.detectChanges();
        noTexto(0);
        expect(cursores.at(-1)).toBe(22);
      });
    });

    it('a seleção vai e volta pelas posições do texto, com as marcas no meio', async () => {
      const t = 'um **negrito** e `x`\n# título';
      await make(t);
      const ed = fixture.componentInstance;
      for (const [a, b] of [
        [0, 0],
        [5, 12],
        [18, 19],
        [23, 29],
      ]) {
        ed.poeSelecao(a, b);
        expect(ed.selecaoNoTexto()).withContext(`${a}-${b}`).toEqual([a, b]);
      }
    });

    it('o trecho cru: tocado, a etiqueta e o "Mudar no Markdown", que leva ao começo dele no texto', async () => {
      await make('antes\n{{contador: 1/1/2030}}))->{{enquete: x}}\n\ndepois');
      view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, view.state.doc.child(0).nodeSize)));
      const cru = fixture.nativeElement.querySelector('.vis-cru') as HTMLElement;
      expect(cru.classList).toContain('ProseMirror-selectednode');
      expect(getComputedStyle(cru.querySelector('.vis-cru-etiqueta')!).display).toBe('flex');
      expect(cru.textContent).toContain('Este trecho só se muda no Markdown');
      const botao = cru.querySelector('.vis-cru-botao') as HTMLButtonElement;
      const segura = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
      botao.dispatchEvent(segura);
      expect(segura.defaultPrevented).toBeTrue();
      botao.click();
      expect(pedidos).toEqual([[6, 6]]);
      expect(valor).toBeNull();
    });

    it('as peças dos trechos crus são desmontadas com a folha (nenhuma fica viva)', async () => {
      await make('{{contador: 1/1/2030}}))->{{enquete: x}}\n\n{{contador: 25/12/2026 | A}}\n\n{{contador: 25/12/2026 | B}}');
      const app = TestBed.inject(ApplicationRef);
      const com = app.viewCount;
      expect(com).toBeGreaterThanOrEqual(3);
      fixture.destroy();
      expect(app.viewCount).toBe(com - 3);
    });

    it('a folha vazia mostra o convite', async () => {
      await make('', { placeholder: 'Escreva o que quiser…' });
      const vazia = fixture.nativeElement.querySelector('.vis-vazia') as HTMLElement;
      expect(vazia.getAttribute('data-placeholder')).toBe('Escreva o que quiser…');
      digita('a');
      expect(fixture.nativeElement.querySelector('.vis-vazia')).toBeNull();
    });

    it('colar texto lê as marcas do Murall (e o Ctrl+Shift+V cola como letras)', async () => {
      await make('');
      const cola = (text: string, plain: boolean) => {
        const slice = view.someProp('clipboardTextParser', (f) => f(text, view.state.selection.$from, plain, view));
        view.dispatch(view.state.tr.replaceSelection(slice!));
      };
      cola('um **forte**\n- item', false);
      expect(texto()).toBe('um **forte**\n- item');
      expect(tipos()).toEqual(['linha', 'item']);
      fimDaLinha(0);
      tecla('Enter');
      cola('**só letras**', true);
      const linhas = texto()!.split('\n');
      expect([linhas[0], linhas[2]]).toEqual(['um **forte**', '- item']);
      expect(textToDoc(linhas[1]).linhas[0]).toEqual(jasmine.objectContaining({ kind: 'linha', spans: [{ text: '**só letras**' }] }));
    });
  });
});
