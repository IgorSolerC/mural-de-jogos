import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { VisualEditor } from './visual-editor';
import { EstadoVisual } from './visual-api';

/**
 * O card no modo Visual (ver cartoes.ts): abre como linhas (a de cima e as de dentro com o papel), sai
 * igual, e as teclas e o menu "Card" escrevem o "> " do jeito do Obsidian. As teclas vão direto para a
 * vista, como nos outros specs do Visual.
 */
describe('o card no modo Visual', () => {
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

  /** As linhas: o tipo e o card (a coluna do ">", ou "-" fora dele). */
  const linhas = () => {
    const out: string[] = [];
    view.state.doc.forEach((n) => out.push(`${n.type.name}${n.attrs['cartao'] != null ? '>' : ''}:${n.textContent}`));
    return out;
  };
  /** O cursor no fim (ou no começo, com `col` 0) do nó `i`. */
  function cursor(i: number, col?: number): void {
    let pos = 0;
    for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
    const n = view.state.doc.child(i);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, pos + 1 + (col ?? n.content.size))));
  }
  function digita(t: string): void {
    for (const ch of t) {
      const { from, to } = view.state.selection;
      if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  }
  function tecla(key: string): void {
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true }));
  }
  const run = (a: Parameters<VisualEditor['run']>[0]) => fixture.componentInstance.run(a);

  const T = '> [!aviso] Antes\n> uma linha\n> - item\n\nfora';

  it('abre como linhas, com o papel nas de dentro, e sai igual', async () => {
    await make(T);
    expect(linhas()).toEqual(['cartaoTopo:Antes', 'linha>:uma linha', 'item>:item', 'linha:', 'linha:fora']);
    const dom = [...view.dom.children] as HTMLElement[];
    expect(dom[0].classList).toContain('vis-cartao-topo');
    expect(dom[0].dataset['jeito']).toBe('aviso');
    expect(dom[1].classList).toContain('vis-no-cartao');
    expect(dom[2].classList).toContain('vis-cartao-fim');
    expect(dom[3].classList).not.toContain('vis-no-cartao');
    // o papel é pintado do lado de fora também (o border-image), sem fita na de cima
    expect(getComputedStyle(dom[1]).borderImageSource).toContain('gradient');
    expect(getComputedStyle(dom[0], '::before').content).toBe('none');
    cursor(4);
    digita('!');
    expect(valor).toBe(T + '!');
  });

  it('Enter: da de cima desce para dentro; dentro, a linha nova fica no card; na última vazia, sai dele', async () => {
    await make('> [!nota] Título\n> a');
    cursor(0);
    tecla('Enter');
    digita('b');
    expect(valor).toBe('> [!nota] Título\n> b\n> a');
    cursor(2);
    tecla('Enter');
    digita('c');
    expect(valor).toBe('> [!nota] Título\n> b\n> a\n> c');
    tecla('Enter');
    expect(valor).toBe('> [!nota] Título\n> b\n> a\n> c\n>');
    tecla('Enter');
    digita('fora');
    expect(valor).toBe('> [!nota] Título\n> b\n> a\n> c\nfora');
    expect(linhas().at(-1)).toBe('linha:fora');
  });

  it('a lista de dentro continua no card (o Enter do item), e o título que vira estilo também', async () => {
    await make('> [!info] L\n> - um');
    cursor(1);
    tecla('Enter');
    digita('dois');
    expect(valor).toBe('> [!info] L\n> - um\n> - dois');
    run({ estilo: 't2' });
    expect(valor).toBe('> [!info] L\n> - um\n> ## dois');
  });

  it('o menu Card: o jeito, o fechar na leitura e desfazer (o que tinha dentro fica)', async () => {
    await make('> [!nota] T\n> a\n> b');
    cursor(1);
    expect(estado?.cartao).toEqual({ tipo: 'nota', jeito: 'nota', dobra: '' });
    run({ cartao: { jeito: 'perigo' } });
    expect(valor).toBe('> [!perigo] T\n> a\n> b');
    run({ cartao: { dobra: '-' } });
    expect(valor).toBe('> [!perigo]- T\n> a\n> b');
    expect(estado?.cartao?.dobra).toBe('-');
    run({ cartao: 'desfazer' });
    expect(valor).toBe('T\na\nb');
    expect(estado?.cartao).toBeNull();
  });

  it('Inserir › Card: na linha vazia, no lugar dela; com linhas selecionadas, elas vão para dentro', async () => {
    await make('x\n');
    cursor(1);
    run({ cartao: 'novo' });
    digita('Novo');
    expect(valor).toBe('x\n> [!nota] Novo\n>');
    fixture.destroy();
    fixture.nativeElement.remove();
    TestBed.resetTestingModule();
    await make('a\nb\nc');
    let fim = 0;
    view.state.doc.forEach((n, pos, i) => {
      if (i === 1) fim = pos + n.nodeSize - 1;
    });
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, fim)));
    run({ cartao: 'novo' });
    expect(valor).toBe('> [!nota]\n> a\n> b\nc');
    expect(estado?.cartao?.jeito).toBe('nota');
  });

  it('Backspace no começo do título desfaz o card; "> " e "[!aviso] " escritos viram um card', async () => {
    await make('> [!dica] T\n> a');
    cursor(0, 0);
    tecla('Backspace');
    expect(valor).toBe('T\na');
    fixture.destroy();
    fixture.nativeElement.remove();
    TestBed.resetTestingModule();
    await make('');
    digita('> [!aviso] Cuidado');
    expect(valor).toBe('> [!aviso] Cuidado');
    expect(linhas()).toEqual(['cartaoTopo:Cuidado']);
  });

  it('o estilo do parágrafo não troca a linha de cima do card; a seleção que só toca o começo da linha de baixo não a leva', async () => {
    await make('> [!nota] T\n> a');
    cursor(0);
    run({ estilo: 't1' });
    expect(linhas()[0]).toBe('cartaoTopo:T');
    fixture.destroy();
    fixture.nativeElement.remove();
    TestBed.resetTestingModule();
    await make('a\nb\nc');
    // de "a" até o começo de "b"
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, 4)));
    run({ cartao: 'novo' });
    expect(valor).toBe('> [!nota]\n> a\nb\nc');
  });

  it('a linha de dentro que perde a de cima (apagada junto com a de antes) sai do card', async () => {
    await make('antes\n> [!nota] T\n> a');
    // apaga do começo do texto até o fim do título: a linha de cima some
    let fimTitulo = 0;
    view.state.doc.forEach((n, pos, i) => {
      if (i === 1) fimTitulo = pos + n.nodeSize;
    });
    view.dispatch(view.state.tr.delete(0, fimTitulo));
    expect(linhas()).toEqual(['linha:a']);
    expect(valor).toBe('a');
  });
});
