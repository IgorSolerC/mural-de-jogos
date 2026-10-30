import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { textToDoc } from '../../core/rich-doc';
import { Review } from '../../core/review';
import { parseInline, parseRich } from '../../core/rich-text';
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

    it('cada linha vira o nó dela (o bloco de código também); a lista, a tabela e o widget são trechos crus', async () => {
      await make('# t\n> c\n-# s\n---\ntexto\n- item\n```\nx\n```\n| a |\n| --- |\n\n{{contador: 25/12/2026 | Natal}}');
      expect(tipos()).toEqual(['titulo', 'citacao', 'sutil', 'divisoria', 'linha', 'cru', 'blocoCodigo', 'cru', 'linha', 'cru']);
      expect(fixture.nativeElement.querySelectorAll('.vis-cru .formatado').length).toBe(3);
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
      expect(pre.textContent).toBe('a*b -> c\n  d');
      expect(pre.querySelector('code')).not.toBeNull();
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

    it('Tab põe dois espaços; Shift+Tab tira; sem nada para tirar, passa (o foco sai)', async () => {
      await make('```\nx\ny\n```');
      noTexto(4);
      expect(tecla('Tab').defaultPrevented).toBeTrue();
      expect(texto()).toBe('```\n  x\ny\n```');
      // as duas linhas selecionadas: dois espaços em cada uma
      noTexto(6, 9);
      tecla('Tab');
      expect(texto()).toBe('```\n    x\n  y\n```');
      tecla('Tab', { shiftKey: true });
      tecla('Tab', { shiftKey: true });
      expect(texto()).toBe('```\nx\ny\n```');
      expect(tecla('Tab', { shiftKey: true }).defaultPrevented).toBeFalse();
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
      await make('antes\n- um item\ndepois');
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
      await make('- a\n- b\n- c');
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
      expect(tipos()).toEqual(['linha', 'cru']);
      fimDaLinha(0);
      tecla('Enter');
      cola('**só letras**', true);
      const linhas = texto()!.split('\n');
      expect([linhas[0], linhas[2]]).toEqual(['um **forte**', '- item']);
      expect(textToDoc(linhas[1]).linhas[0]).toEqual(jasmine.objectContaining({ kind: 'linha', spans: [{ text: '**só letras**' }] }));
    });
  });
});
