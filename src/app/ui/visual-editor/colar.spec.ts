import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextSelection } from 'prosemirror-state';
import { CellSelection } from 'prosemirror-tables';
import { EditorView } from 'prosemirror-view';
import { LinhaDoc, docToText } from '../../core/rich-doc';
import { ATRIBUTO_MURALL, TIPO_MURALL, cortarPorLinhas, markdownColado, markdownDoHtml } from '../../core/transferencia';
import { lerHtml } from './html';
import { VisualEditor } from './visual-editor';
import { ImagemVisual } from './visual-api';

/**
 * Colar e copiar no Visual (PLANO-EDITOR-VISUAL.md, rodada 7, 5.16 e os defeitos C1–C10): o HTML de fora
 * com amostras do Docs, do Word, de um site e do Excel; o texto puro lido como markdown e o Ctrl+Shift+V;
 * a planilha fora da tabela; o tipo próprio do Murall nos dois sentidos; o limite por linhas inteiras.
 * O colar e o copiar vão como eventos de verdade na vista (o ProseMirror lê a área de transferência).
 */

/** O Docs: tudo dentro do `<b>` de mentira; as marcas no estilo de cada pedaço (C1). */
const DOCS =
  '<meta charset="utf-8"><b style="font-weight:normal;" id="docs-internal-guid-1a2b3c4d-7fff-1234-abcd-0123456789ab">' +
  '<h2 dir="ltr" style="line-height:1.38;margin-top:18pt;margin-bottom:6pt;"><span style="font-size:16pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;">Zerados</span></h2>' +
  '<p dir="ltr" style="line-height:1.38;margin-top:0pt;margin-bottom:0pt;"><span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;">Texto </span>' +
  '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:700;font-style:normal;">forte</span>' +
  '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:normal;"> e </span>' +
  '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;font-style:italic;">inclinado</span>' +
  '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;"> com </span>' +
  '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:#ffff00;font-weight:400;">marca</span>' +
  '<span style="font-size:11pt;font-family:Arial,sans-serif;color:#000000;background-color:transparent;font-weight:400;"> e </span>' +
  '<a href="https://example.com/x" style="text-decoration:none;"><span style="font-size:11pt;color:#1155cc;background-color:transparent;font-weight:400;text-decoration:underline;">link</span></a></p>' +
  '<ul style="margin-top:0;margin-bottom:0;padding-inline-start:48px;"><li dir="ltr" style="list-style-type:disc;font-size:11pt;" aria-level="1"><p dir="ltr" style="line-height:1.38;" role="presentation"><span style="font-size:11pt;font-weight:400;">um</span></p></li>' +
  '<li dir="ltr" style="list-style-type:disc;" aria-level="1"><p dir="ltr" role="presentation"><span style="font-weight:400;">dois</span></p></li></ul>' +
  '<ul style="margin-top:0;margin-bottom:0;"><li dir="ltr" role="checkbox" aria-checked="true" style="list-style-type:none;" aria-level="1"><img src="data:image/png;base64,iVBORw0KGgo=" width="17.6px" height="17.6px" alt="marcado" aria-roledescription="checkbox"><p dir="ltr" role="presentation" style="display:inline-block;"><span style="text-decoration:line-through;font-weight:400;">feita</span></p></li>' +
  '<li dir="ltr" role="checkbox" aria-checked="false" style="list-style-type:none;" aria-level="1"><img src="data:image/png;base64,iVBORw0KGgo=" width="17.6px" height="17.6px" alt="desmarcado" aria-roledescription="checkbox"><p dir="ltr" role="presentation" style="display:inline-block;"><span style="font-weight:400;">por fazer</span></p></li></ul>' +
  '</b><br class="Apple-interchange-newline">';

/** O Word: a lista como parágrafos com `mso-list` e o marcador escondido (C2), o título do documento. */
const WORD =
  '<html xmlns:o="urn:schemas-microsoft-com:office:office"><head><style>p.MsoNormal{margin:0}</style></head><body lang=PT-BR>' +
  '<!--StartFragment--><p class=MsoTitle>Diário</p>' +
  '<p class=MsoListParagraphCxSpFirst style="text-indent:-18.0pt;mso-list:l0 level1 lfo1"><![if !supportLists]><span style="font-family:Symbol;mso-fareast-font-family:Symbol"><span style="mso-list:Ignore">·<span style="font:7.0pt &quot;Times New Roman&quot;">&nbsp;&nbsp;&nbsp;&nbsp;&nbsp; </span></span></span><![endif]>primeiro</p>' +
  '<p class=MsoListParagraphCxSpMiddle style="margin-left:72.0pt;text-indent:-18.0pt;mso-list:l0 level2 lfo1"><![if !supportLists]><span style="font-family:&quot;Courier New&quot;"><span style="mso-list:Ignore">o<span style="font:7.0pt &quot;Times New Roman&quot;">&nbsp;&nbsp; </span></span></span><![endif]>dentro</p>' +
  '<p class=MsoListParagraphCxSpLast style="text-indent:-18.0pt;mso-list:l0 level1 lfo1"><![if !supportLists]><span style="font-family:Symbol"><span style="mso-list:Ignore">·<span style="font:7.0pt">&nbsp; </span></span></span><![endif]><b>segundo</b></p>' +
  '<p class=MsoListParagraph style="text-indent:-18.0pt;mso-list:l1 level1 lfo2"><![if !supportLists]><span><span style="mso-list:Ignore">1.<span style="font:7.0pt">&nbsp; </span></span></span><![endif]>passo</p>' +
  '<p class=MsoListParagraph style="text-indent:-18.0pt;mso-list:l1 level1 lfo2"><![if !supportLists]><span><span style="mso-list:Ignore">2.<span style="font:7.0pt">&nbsp; </span></span></span><![endif]>outro passo</p>' +
  '<p class=MsoNormal>Fim com <span style="background:yellow;mso-highlight:yellow">realce</span> e <img width=200 height=100 src="file:///C:/Users/x/AppData/Local/Temp/msohtmlclip1/01/clip_image001.png"></p>' +
  '<!--EndFragment--></body></html>';

/** Um site: cor, fonte, caixas, um botão, um anúncio, um link `javascript:` (C3, C4). */
const SITE =
  '<div class="artigo" style="color:#333;font-family:Georgia;font-size:18px;background:#fafafa">' +
  '<h1 style="color:red">Análise</h1><script>alert(1)</script><style>.x{}</style>' +
  '<div><span style="color:blue;font-size:22px">Um jogo </span><strong>ótimo</strong>, <a href="javascript:alert(1)">clique</a> e <a href="https://ex.com/a" onclick="x()">veja</a>.</div>' +
  '<button>Comprar</button><img src="https://ads.ex.com/pixel.gif" width="1" height="1">' +
  '<p><img src="https://ex.com/capa.jpg" alt="Capa"></p>' +
  '<h5>Detalhe</h5><blockquote><p>citado</p></blockquote><pre><code>let a = 1;\n  b();</code></pre><hr><p>depois</p></div>';

/** O Excel: a tabela com os números à direita e uma célula mesclada. */
const EXCEL =
  '<html xmlns:x="urn:schemas-microsoft-com:office:excel"><body><table border=0 cellpadding=0 cellspacing=0 width=300>' +
  '<tr height=20><td height=20 width=100>Jogo</td><td width=100>Horas</td><td width=100>Nota</td></tr>' +
  '<tr height=20><td height=20>Hades</td><td align=right>40</td><td align=right>10</td></tr>' +
  '<tr height=20><td height=20 colspan=2>Celeste e mais</td><td align=right>9</td></tr>' +
  '<tr><td></td><td></td><td></td></tr></table></body></html>';

describe('ler o HTML colado (html.ts)', () => {
  const md = (html: string) => {
    const lido = lerHtml(html);
    return { lido, texto: textoDe(lido.linhas) };
  };

  it('o Docs: o <b> de mentira não é negrito (C1), as marcas vêm do estilo, listas e tarefas', () => {
    const { texto } = md(DOCS);
    const linhas = texto.split('\n');
    expect(linhas[0]).toBe('## Zerados');
    expect(linhas[1]).toBe('Texto **forte** e *inclinado* com ==marca== e [link](https://example.com/x)');
    expect(linhas.slice(2)).toEqual(['- um', '- dois', '- [x] ~~feita~~', '- [ ] por fazer']);
  });

  it('o Word: os parágrafos de lista viram itens com o nível e o número (C2), o realce é marca-texto', () => {
    const { texto, lido } = md(WORD);
    expect(texto.split('\n')).toEqual(['# Diário', '- primeiro', '  - dentro', '- **segundo**', '1. passo', '2. outro passo', 'Fim com ==realce== e']);
    // a imagem do Word (file:) não vem: o aviso conta
    expect(lido.faltaram).toBe(1);
  });

  it('um site: só o que o Murall tem (C3), sem o link javascript: (C4)', () => {
    const { texto, lido } = md(SITE);
    expect(texto).not.toContain('alert');
    expect(texto).not.toContain('Comprar');
    expect(texto).not.toContain('pixel');
    expect(texto.split('\n')).toEqual([
      '# Análise',
      'Um jogo **ótimo**, clique e [veja](https://ex.com/a).',
      '{{imagem: https://ex.com/capa.jpg}}',
      '### Detalhe',
      '> citado',
      '```',
      'let a = 1;',
      '  b();',
      '```',
      '---',
      'depois',
    ]);
    expect(lido.faltaram).toBe(0);
  });

  it('o Excel: a primeira fileira é o cabeçalho, a mesclada desfeita, o alinhamento da coluna, sem as vazias do fim', () => {
    const { lido } = md(EXCEL);
    expect(lido.linhas.length).toBe(1);
    const t = lido.linhas[0];
    if (t.kind !== 'tabela') throw new Error(t.kind);
    expect(t.cabeca.map((c) => c.map((s) => s.text).join(''))).toEqual(['Jogo', 'Horas', 'Nota']);
    expect(t.fileiras.map((f) => f.map((c) => c.map((s) => s.text).join('')))).toEqual([
      ['Hades', '40', '10'],
      ['Celeste e mais', '', '9'],
    ]);
    expect(t.alinhar).toEqual([null, 'right', 'right']);
  });

  it('a imagem data: vem para ser guardada; a pequena no meio das letras é o texto dela', () => {
    const { lido, texto } = md('<p>antes <img src="https://ex.com/e.png" width="16" height="16" alt="🙂"> depois</p><p><img src="data:image/png;base64,iVBORw0KGgo="></p>');
    expect(texto.split('\n')[0]).toBe('antes 🙂 depois');
    expect(lido.imagens.length).toBe(1);
  });

  it('a imagem grande no meio das letras parte a linha', () => {
    const { texto } = md('<p>antes <img src="https://ex.com/foto.jpg" width="400" height="300"> depois</p>');
    expect(texto.split('\n')).toEqual(['antes', '{{imagem: https://ex.com/foto.jpg}}', 'depois']);
  });
});

describe('a área de transferência do Murall (core/transferencia.ts)', () => {
  it('corta por linhas inteiras e nunca dentro de um bloco de código (C9)', () => {
    expect(cortarPorLinhas('um\ndois\ntres', 99)).toBe('um\ndois\ntres');
    expect(cortarPorLinhas('um\ndois\ntres', 8)).toBe('um\ndois');
    expect(cortarPorLinhas('um\ndois\ntres', 5)).toBe('um');
    expect(cortarPorLinhas('**negrito longo**', 5)).toBe('');
    expect(cortarPorLinhas('a\n```\ncodigo\nmais\n```\nfim', 16)).toBe('a');
  });

  it('o markdown vem do tipo próprio ou, sem ele, do atributo do HTML (C10)', () => {
    const d = new DataTransfer();
    d.setData('text/html', `<div ${ATRIBUTO_MURALL}="**x** &lt;b&gt;"><strong>x</strong></div>`);
    expect(markdownColado(d)).toBe('**x** <b>');
    expect(markdownDoHtml('<p>nada</p>')).toBeNull();
    d.setData(TIPO_MURALL, '# próprio');
    expect(markdownColado(d)).toBe('# próprio');
    const fora = new DataTransfer();
    fora.setData('text/html', '<b>de fora</b>');
    expect(markdownColado(fora)).toBeNull();
  });
});

describe('colar e copiar no modo Visual', () => {
  let fixture: ComponentFixture<VisualEditor>;
  let view: EditorView;
  let valor: string | null;
  let avisos: string[];
  let imagens: ImagemVisual[];

  async function make(texto: string, inputs: Record<string, unknown> = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [VisualEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(VisualEditor);
    fixture.componentRef.setInput('texto', texto);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    valor = null;
    avisos = [];
    imagens = [];
    const ed = fixture.componentInstance;
    ed.mudou.subscribe((t) => {
      valor = t;
      fixture.componentRef.setInput('texto', t);
    });
    ed.aviso.subscribe((a) => avisos.push(a));
    ed.imagem.subscribe((i) => imagens.push(i));
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    view = (ed as unknown as { view: EditorView }).view;
  }

  afterEach(() => {
    const input = (view as unknown as { input?: { shiftKey: boolean } })?.input;
    if (input) input.shiftKey = false;
    fixture?.destroy();
    fixture?.nativeElement.remove();
  });

  const cursor = (de: number, ate = de) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, de, ate)));
  const fim = () => cursor(view.state.doc.content.size - 1);
  /** Cola o que se der (tipo → conteúdo), como o navegador: o evento na vista. */
  function cola(dados: Record<string, string>): ClipboardEvent {
    const data = new DataTransfer();
    for (const [k, v] of Object.entries(dados)) data.setData(k, v);
    const e = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: data });
    view.dom.dispatchEvent(e);
    return e;
  }
  function copia(tipo: 'copy' | 'cut' = 'copy'): DataTransfer {
    const e = new ClipboardEvent(tipo, { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
    view.dom.dispatchEvent(e);
    expect(e.defaultPrevented).toBeTrue();
    return e.clipboardData!;
  }
  const tipos = () => {
    const out: string[] = [];
    view.state.doc.forEach((n) => out.push(n.type.name));
    return out;
  };

  describe('copiar', () => {
    it('põe o texto limpo (C6), o HTML com o markdown dentro e o tipo próprio', async () => {
      await make('# Título\nUm **forte** e [link](https://ex.com)\n- [ ] tarefa\n{{imagem: https://ex.com/a.png | Capa}}');
      cursor(0, view.state.doc.content.size);
      const d = copia();
      const md = d.getData(TIPO_MURALL);
      expect(md).toBe('# Título\nUm **forte** e [link](https://ex.com)\n- [ ] tarefa\n{{imagem: https://ex.com/a.png | Capa}}');
      const texto = d.getData('text/plain');
      expect(texto).not.toContain('**');
      expect(texto).not.toContain('{{');
      expect(texto).toContain('Um forte e link');
      const html = d.getData('text/html');
      expect(html).toContain('<h1>Título</h1>');
      expect(html).toContain('<strong>forte</strong>');
      expect(html).toContain('<a href="https://ex.com">link</a>');
      expect(html).toContain('<img src="https://ex.com/a.png" alt="Capa">');
      expect(markdownDoHtml(html)).toBe(md);
    });

    it('um pedaço de dentro de uma linha leva só as letras, sem o tipo da linha', async () => {
      await make('## Um título grande');
      cursor(4, 10);
      const d = copia();
      expect(d.getData(TIPO_MURALL)).toBe('título');
    });

    it('o pedaço de dentro de uma lista vem para a margem', async () => {
      await make('- fora\n  - dentro\n  - outro');
      const doc = view.state.doc;
      cursor(doc.child(0).nodeSize + 1, doc.content.size - 1);
      expect(copia().getData(TIPO_MURALL)).toBe('- dentro\n- outro');
    });

    it('recortar tira o trecho e põe na área de transferência', async () => {
      await make('um **dois** tres');
      cursor(4, 8);
      const d = copia('cut');
      expect(d.getData(TIPO_MURALL)).toBe('**dois**');
      expect(valor).toBe('um  tres');
    });

    it('a tabela vai com o cabeçalho no HTML e com as células separadas por tab no texto', async () => {
      await make('| Jogo | Nota |\n| --- | ---: |\n| Hades | 10 |');
      cursor(0, view.state.doc.content.size);
      const d = copia();
      expect(d.getData('text/html')).toContain('<th>Jogo</th>');
      expect(d.getData('text/html')).toContain('<td style="text-align: right;">10</td>');
      expect(d.getData(TIPO_MURALL)).toContain('| Hades | 10 |');
      expect(d.getData('text/plain')).toBe('Jogo\tNota\nHades\t10');
    });

    it('células selecionadas: só elas, e o texto como uma planilha', async () => {
      await make('| Jogo | Nota | Horas |\n| --- | --- | --- |\n| Hades | 10 | 40 |\n| Celeste | 9 | 20 |');
      const t = view.state.doc.child(0);
      // da célula (1, 0) à (2, 1)
      const pos = (f: number, c: number) => {
        let at = 1;
        for (let k = 0; k < f; k++) at += t.child(k).nodeSize;
        at += 1;
        for (let k = 0; k < c; k++) at += t.child(f).child(k).nodeSize;
        return at;
      };
      view.dispatch(view.state.tr.setSelection(CellSelection.create(view.state.doc, pos(1, 0), pos(2, 1))));
      const d = copia();
      expect(d.getData('text/plain')).toBe('Hades\t10\nCeleste\t9');
      expect(d.getData('text/html')).toContain('<td>Celeste</td>');
    });
  });

  describe('colar', () => {
    it('o tipo próprio do Murall entra com tudo, mesmo com o texto limpo junto (C5)', async () => {
      await make('');
      cola({ [TIPO_MURALL]: '# Título\n- **item**\n{{contador: 2030-01-01 | Copa}}', 'text/plain': 'Título\nitem', 'text/html': '<h1>Título</h1>' });
      expect(valor).toBe('# Título\n- **item**\n{{contador: 2030-01-01 | Copa}}');
    });

    it('sem o tipo próprio (o Safari), o markdown vem do HTML do Visual (C10)', async () => {
      await make('');
      cola({ 'text/html': `<div ${ATRIBUTO_MURALL}="1. **um**\n2. dois"><ol><li>um</li></ol></div>`, 'text/plain': 'um' });
      expect(valor).toBe('1. **um**\n2. dois');
    });

    it('o copiar do Visual cola igual noutro Visual', async () => {
      await make('Um **forte**, ==marca== e `código`\n> citado');
      cursor(0, view.state.doc.content.size);
      const d = copia();
      fixture.destroy();
      TestBed.resetTestingModule();
      await make('');
      const dados: Record<string, string> = {};
      for (const t of d.types) dados[t] = d.getData(t);
      cola(dados);
      expect(valor).toBe('Um **forte**, ==marca== e `código`\n> citado');
    });

    it('o HTML do Docs vira as linhas do Murall, sem tudo negrito (C1)', async () => {
      await make('');
      cola({ 'text/html': DOCS, 'text/plain': 'Zerados\nTexto forte' });
      expect(valor!.split('\n')[1]).toBe('Texto **forte** e *inclinado* com ==marca== e [link](https://example.com/x)');
      expect(tipos()).toContain('item');
    });

    it('a imagem do Word que não vem é avisada', async () => {
      await make('');
      cola({ 'text/html': WORD, 'text/plain': 'Diário' });
      expect(avisos).toContain('1 imagem não veio: cole ela sozinha');
    });

    it('a imagem data: do HTML é guardada no lugar dela', async () => {
      await make('');
      cola({ 'text/html': '<p>antes</p><p><img src="data:image/png;base64,iVBORw0KGgo="></p><p>depois</p>', 'text/plain': 'antes\ndepois' });
      expect(imagens.length).toBe(1);
      expect(imagens[0].arquivo.type).toBe('image/png');
    });

    it('o texto puro é lido como markdown (P5); com Ctrl+Shift+V, como letras (C8)', async () => {
      await make('');
      cola({ 'text/plain': 'a **b** _c_' });
      expect(view.state.doc.textContent).toBe('a b c');
      fixture.destroy();
      TestBed.resetTestingModule();
      await make('');
      (view as unknown as { input: { shiftKey: boolean } }).input.shiftKey = true;
      cola({ 'text/plain': 'a **b** _c_', 'text/html': '<b>a</b>' });
      expect(view.state.doc.textContent).toBe('a **b** _c_');
    });

    it('a planilha fora da tabela vira uma tabela nova', async () => {
      await make('');
      cola({ 'text/plain': 'Jogo\tNota\nHades\t10\nCeleste\t9' });
      expect(tipos()).toEqual(['tabela']);
      expect(valor).toBe('| Jogo | Nota |\n| --- | --- |\n| Hades | 10 |\n| Celeste | 9 |');
    });

    it('o código com tab no começo das linhas não é planilha', async () => {
      await make('');
      cola({ 'text/plain': 'if (a)\n\tb();\n\tc();' });
      expect(tipos()).not.toContain('tabela');
    });

    it('no bloco de código, as letras como vieram', async () => {
      await make('```\nx\n```');
      cursor(2);
      cola({ [TIPO_MURALL]: '**não**', 'text/plain': '**não**', 'text/html': '<b>não</b>' });
      expect(valor).toBe('```\nx**não**\n```');
    });

    it('perto do limite, entra só o que cabe, por linhas inteiras, com o aviso (C9)', async () => {
      await make('abc', { max: 20 });
      fim();
      cola({ [TIPO_MURALL]: '\n**um**\n**dois**\n**tres**', 'text/plain': 'um' });
      expect(valor).toBe('abc\n**um**\n**dois**');
      expect(avisos[avisos.length - 1]).toContain('Parte do que foi colado não coube');
    });

    it('nada coube: nada entra, com o aviso', async () => {
      await make('abcdefgh', { max: 10 });
      fim();
      cola({ [TIPO_MURALL]: '**muito comprido**', 'text/plain': 'x' });
      expect(valor).toBeNull();
      expect(avisos[avisos.length - 1]).toContain('O que foi colado não coube');
    });

    it('o HTML de um site com tabela, título e lista numa linha vazia entre outras', async () => {
      await make('antes\n\ndepois');
      cursor(view.state.doc.child(0).nodeSize + 1);
      cola({ 'text/html': '<h3>Lista</h3><ol start="3"><li>três</li><li>quatro</li></ol>', 'text/plain': 'Lista' });
      expect(valor).toBe('antes\n### Lista\n3. três\n4. quatro\ndepois');
    });
  });
});

/** As linhas escritas pelo tradutor, do jeito de sempre (o que o colar põe na folha). */
function textoDe(linhas: LinhaDoc[]): string {
  return docToText({ linhas, quebra: '\n' }).texto;
}
