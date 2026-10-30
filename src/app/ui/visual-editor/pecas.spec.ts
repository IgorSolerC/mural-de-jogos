import { ApplicationRef, provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { GapCursor } from 'prosemirror-gapcursor';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { VisualEditor } from './visual-editor';
import { EstadoVisual, ImagemVisual } from './visual-api';

/**
 * Os widgets como peças no modo Visual (PLANO-EDITOR-VISUAL.md, rodada 5): o widget é o componente de
 * sempre dentro da folha, selecionado inteiro por um toque; Delete e Backspace o tiram, Enter abre uma
 * linha embaixo; a legenda e o título se escrevem direto nele; a folha do widget põe e troca no lugar
 * guardado; a imagem colada entra no marcador. As teclas e a seleção vão direto para a vista (o R9).
 */
describe('os widgets no modo Visual', () => {
  let fixture: ComponentFixture<VisualEditor>;
  let view: EditorView;
  let valor: string | null;
  let estado: EstadoVisual | null;
  let imagens: ImagemVisual[];

  async function make(texto: string): Promise<void> {
    TestBed.configureTestingModule({ imports: [VisualEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(VisualEditor);
    fixture.componentRef.setInput('texto', texto);
    valor = null;
    estado = null;
    imagens = [];
    const ed = fixture.componentInstance;
    ed.mudou.subscribe((t) => {
      valor = t;
      fixture.componentRef.setInput('texto', t);
    });
    ed.estado.subscribe((e) => (estado = e));
    ed.imagem.subscribe((i) => imagens.push(i));
    document.body.appendChild(fixture.nativeElement);
    fixture.detectChanges();
    await fixture.whenStable();
    view = (ed as unknown as { view: EditorView }).view;
  }

  afterEach(() => {
    fixture?.destroy();
    fixture?.nativeElement.remove();
  });

  const ed = () => fixture.componentInstance;
  const tipos = () => {
    const out: string[] = [];
    view.state.doc.forEach((n) => out.push(n.type.name));
    return out;
  };
  const posDe = (i: number) => {
    let pos = 0;
    for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
    return pos;
  };
  const seleciona = (i: number) => view.dispatch(view.state.tr.setSelection(NodeSelection.create(view.state.doc, posDe(i))));
  const fimDaLinha = (i: number) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, posDe(i) + view.state.doc.child(i).nodeSize - 1)));
  const comecoDaLinha = (i: number) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, posDe(i) + 1)));
  function digita(texto: string): void {
    for (const ch of texto) {
      const { from, to } = view.state.selection;
      if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  }
  function tecla(key: string, init: KeyboardEventInit = {}, alvo: Element = view.dom): KeyboardEvent {
    const e = new KeyboardEvent('keydown', { key, bubbles: true, cancelable: true, ...init });
    alvo.dispatchEvent(e);
    return e;
  }
  /** Espera a peça (que chega num @defer) desenhar o que se procura. */
  async function ate<T>(f: () => T | null | undefined, vezes = 200): Promise<T> {
    for (let i = 0; i < vezes; i++) {
      const r = f();
      if (r) return r;
      await new Promise((ok) => setTimeout(ok, 10));
      await fixture.whenStable();
    }
    throw new Error('não apareceu');
  }
  const pecas = () => Array.from(fixture.nativeElement.querySelectorAll('.vis-peca') as NodeListOf<HTMLElement>);
  const campo = () => fixture.nativeElement.querySelector('input.campo-peca') as HTMLInputElement | null;

  describe('a peça', () => {
    it('o widget vira a peça de sempre (o app-note-widget), com nome para o leitor de tela; o desconhecido é texto; abrir não muda nada', async () => {
      const t = 'antes\n{{contador: 25/12/2030 | Natal}}\n  {{imagem: https://exemplo.invalid/a.jpg | grande}}\n{{enquete: a | b}}\n{{tabela: listrada}}';
      await make(t);
      expect(tipos()).toEqual(['linha', 'widget', 'widget', 'linha', 'linha']);
      const [contador, imagem] = pecas();
      expect(contador.querySelector('app-note-widget.widget')).not.toBeNull();
      expect(contador.getAttribute('aria-label')).toBe('Widget: Contador, Natal');
      expect(imagem.getAttribute('aria-label')).toBe('Widget: Imagem, exemplo.invalid');
      expect(imagem.querySelector('app-note-widget')!.classList).toContain('tam-grande');
      await ate(() => contador.querySelector('app-countdown .contador'));
      expect(valor).toBeNull();
      // o widget de nome desconhecido: as letras dele, como a leitura mostra
      expect(view.state.doc.child(3).textContent).toBe('{{enquete: a | b}}');
    });

    it('um toque seleciona a peça inteira (W1), e o estado conta qual é; Enter abre a linha embaixo', async () => {
      await make('a\n{{contador: 25/12/2030 | Natal}}\nb');
      seleciona(1);
      expect(view.state.selection instanceof NodeSelection).toBeTrue();
      expect(pecas()[0].classList).toContain('ProseMirror-selectednode');
      expect(estado?.peca).toEqual({ de: 3, nome: 'contador', args: ['25/12/2030', 'Natal'], tamanho: 'medio' });
      tecla('Enter');
      expect(valor).toBe('a\n{{contador: 25/12/2030 | Natal}}\n\nb');
      expect(view.state.selection.$from.parentOffset).toBe(0);
      expect(estado?.peca).toBeNull();
    });

    it('Delete e Backspace com ela selecionada a tiram, e o Ctrl+Z a devolve igual', async () => {
      const t = 'a\n{{contador: 25/12/2030 | Natal}}\nb';
      await make(t);
      seleciona(1);
      tecla('Delete');
      expect(valor).toBe('a\nb');
      tecla('z', { ctrlKey: true });
      expect(valor).toBe(t);
      // o Backspace no começo da linha de baixo seleciona a peça; de novo, ela sai
      comecoDaLinha(2);
      tecla('Backspace');
      expect(view.state.selection instanceof NodeSelection).toBeTrue();
      tecla('Backspace');
      expect(valor).toBe('a\nb');
      // o apagar do teclado do celular (o beforeinput) também
      tecla('z', { ctrlKey: true });
      seleciona(1);
      view.dom.dispatchEvent(new InputEvent('beforeinput', { inputType: 'deleteContentBackward', bubbles: true, cancelable: true }));
      expect(valor).toBe('a\nb');
    });

    it('a letra escrita com a peça selecionada vai para uma linha nova embaixo (a peça não some)', async () => {
      await make('{{contador: 25/12/2030 | Natal}}');
      seleciona(0);
      digita('oi');
      expect(valor).toBe('{{contador: 25/12/2030 | Natal}}\noi');
    });

    it('o cursor de lacuna antes da peça no começo do texto e depois dela no fim (K2)', async () => {
      await make('{{contador: 25/12/2030 | A}}\n{{contador: 25/12/2030 | B}}');
      view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(0))));
      tecla('Enter');
      expect(valor).toBe('\n{{contador: 25/12/2030 | A}}\n{{contador: 25/12/2030 | B}}');
      // entre as duas e no fim, escrever abre a linha ali
      view.dispatch(view.state.tr.setSelection(new GapCursor(view.state.doc.resolve(view.state.doc.content.size))));
      digita('x');
      expect(valor).toBe('\n{{contador: 25/12/2030 | A}}\n{{contador: 25/12/2030 | B}}\nx');
    });

    it('a peça não se recria quando outra linha muda nem quando a dela muda (W2)', async () => {
      await make('texto\n{{video: https://exemplo.invalid/v.mp4 | Antes}}');
      const host = await ate(() => pecas()[0].querySelector('app-glued-media'));
      fimDaLinha(0);
      digita(' mais');
      expect(pecas()[0].querySelector('app-glued-media')).toBe(host);
      seleciona(1);
      const c = await ate(campo);
      c.focus();
      c.value = 'Depois';
      tecla('Enter', {}, c);
      expect(valor).toBe('texto mais\n{{video: https://exemplo.invalid/v.mp4 | Depois}}');
      expect(pecas()[0].querySelector('app-glued-media')).toBe(host);
    });

    it('as peças são desmontadas com a folha, e a que sai do texto também (W3)', async () => {
      await make('{{contador: 25/12/2030 | A}}\n{{contador: 25/12/2030 | B}}\nfim');
      const app = TestBed.inject(ApplicationRef);
      const com = app.viewCount;
      seleciona(0);
      tecla('Delete');
      expect(app.viewCount).toBe(com - 1);
      fixture.destroy();
      expect(app.viewCount).toBe(com - 2);
    });

    it('o contador sem data mostra o aviso dele, sem quebrar a folha (W9)', async () => {
      await make('{{contador: amanhã | Sem data}}');
      expect(tipos()).toEqual(['widget']);
      await ate(() => pecas()[0].querySelector('.contador.quebrado'));
    });
  });

  describe('escrever direto na peça', () => {
    it('selecionada, a legenda vira um campo; fora da seleção, a peça é a da leitura', async () => {
      await make('{{imagem: https://exemplo.invalid/a.jpg | Na praia}}\nfim');
      await ate(() => pecas()[0].querySelector('.etiqueta'));
      expect(campo()).toBeNull();
      seleciona(0);
      const c = await ate(campo);
      expect(c.value).toBe('Na praia');
      expect(c.getAttribute('aria-label')).toBe('Legenda da imagem');
      expect(c.maxLength).toBe(120);
      fimDaLinha(1);
      await ate(() => !campo());
      expect(pecas()[0].querySelector('.etiqueta')!.textContent).toBe('Na praia');
    });

    it('sem legenda, a peça selecionada mostra o lugar dela, com o convite', async () => {
      await make('{{imagem: https://exemplo.invalid/a.jpg | polaroid}}');
      seleciona(0);
      const c = await ate(campo);
      expect(c.value).toBe('');
      expect(c.placeholder).toBe('Escreva uma legenda');
      expect(c.closest('.legenda-polaroide')).not.toBeNull();
    });

    it('Enter grava (uma mudança no histórico), a peça continua selecionada; o "|" vai escapado', async () => {
      const t = '{{imagem: https://exemplo.invalid/a.jpg | Antes}}';
      await make(t);
      seleciona(0);
      const c = await ate(campo);
      c.focus();
      c.value = 'a | b';
      tecla('Enter', {}, c);
      expect(valor).toBe('{{imagem: https://exemplo.invalid/a.jpg | a \\| b}}');
      expect(view.state.selection instanceof NodeSelection).toBeTrue();
      tecla('z', { ctrlKey: true });
      expect(valor).toBe(t);
    });

    it('Esc volta ao que estava; sair do campo grava', async () => {
      await make('{{contador: 25/12/2030 | Natal}}\nfim');
      seleciona(0);
      const c = await ate(campo);
      expect(c.getAttribute('aria-label')).toBe('Título do contador');
      c.focus();
      c.value = 'Errado';
      const esc = tecla('Escape', {}, c);
      expect(esc.defaultPrevented).toBeTrue();
      expect(c.value).toBe('Natal');
      expect(valor).toBeNull();
      c.focus();
      c.value = 'Ceia';
      c.blur();
      expect(valor).toBe('{{contador: 25/12/2030 | Ceia}}\nfim');
    });

    it('o "}}" vira "} }", com o aviso enquanto se escreve (W5)', async () => {
      await make('{{audio: https://exemplo.invalid/a.mp3 | Faixa}}');
      seleciona(0);
      const c = await ate(campo);
      expect(c.getAttribute('aria-label')).toBe('Nome da faixa');
      c.focus();
      c.value = 'a}}b';
      c.dispatchEvent(new Event('input', { bubbles: true }));
      const aviso = pecas()[0].querySelector('.vis-peca-aviso') as HTMLElement;
      expect(aviso.hidden).toBeFalse();
      tecla('Enter', {}, c);
      expect(valor).toBe('{{audio: https://exemplo.invalid/a.mp3 | a} }b}}');
      expect(aviso.hidden).toBeTrue();
    });

    it('o título que é o nome de um jeito vai depois do jeito, como a folha escreve', async () => {
      await make('{{contador: 25/12/2030 | Natal}}');
      seleciona(0);
      const c = await ate(campo);
      c.focus();
      c.value = 'Neon';
      tecla('Enter', {}, c);
      expect(valor).toBe('{{contador: 25/12/2030 | calendario | Neon}}');
    });

    it('o Tab com a peça selecionada leva ao campo, e o Shift+Tab nele volta à folha', async () => {
      await make('{{imagem: https://exemplo.invalid/a.jpg | Oi}}');
      seleciona(0);
      const c = await ate(campo);
      view.focus();
      const tab = tecla('Tab');
      expect(tab.defaultPrevented).toBeTrue();
      expect(document.activeElement).toBe(c);
      tecla('Tab', { shiftKey: true }, c);
      expect(document.activeElement).toBe(view.dom);
      expect(view.state.selection instanceof NodeSelection).toBeTrue();
    });
  });

  describe('a folha do widget e o Inserir', () => {
    it('o widget novo entra no lugar da linha vazia do cursor, ou numa linha só dele depois da do cursor', async () => {
      await make('um\n\ndois');
      comecoDaLinha(1);
      expect(ed().lugarDaPeca('contador')).toBeNull();
      ed().poePeca('contador', ['25/12/2030', 'Natal'], 'medio');
      expect(valor).toBe('um\n{{contador: 25/12/2030 | Natal}}\ndois');
      expect(view.state.selection instanceof NodeSelection).toBeTrue();
      fimDaLinha(0);
      ed().lugarDaPeca('imagem');
      ed().poePeca('imagem', ['https://exemplo.invalid/a.jpg'], 'pequeno');
      expect(valor).toBe('um\n{{imagem: https://exemplo.invalid/a.jpg | pequeno}}\n{{contador: 25/12/2030 | Natal}}\ndois');
    });

    it('dentro de um item, com o recuo da descrição (como o writeWidget)', async () => {
      await make('- [ ] tarefa\nfora');
      fimDaLinha(0);
      ed().lugarDaPeca('contador');
      ed().poePeca('contador', ['25/12/2030'], 'medio');
      expect(valor).toBe('- [ ] tarefa\n      {{contador: 25/12/2030}}\nfora');
    });

    it('com a peça selecionada, a folha troca ela (com o recuo que ela tinha); o lugar anda com o texto', async () => {
      await make('- item\n  {{contador: 25/12/2030 | A}}');
      seleciona(1);
      expect(ed().lugarDaPeca('contador')).toEqual(jasmine.objectContaining({ nome: 'contador' }));
      // a folha está aberta: o texto muda por outro caminho (a colega, a AI) antes de ela fechar
      view.dispatch(view.state.tr.insertText('x', 1));
      ed().poePeca('contador', ['25/12/2031', 'B'], 'grande');
      expect(valor).toBe('- xitem\n  {{contador: 25/12/2031 | B | grande}}');
      // o Tirar
      seleciona(1);
      ed().lugarDaPeca();
      ed().tiraPeca();
      expect(valor).toBe('- xitem');
    });

    it('a folha fechada sem mudar nada devolve o foco com a peça selecionada', async () => {
      await make('a\n{{contador: 25/12/2030 | A}}');
      seleciona(1);
      ed().lugarDaPeca();
      fimDaLinha(0);
      ed().voltaAPeca();
      expect(view.state.selection instanceof NodeSelection).toBeTrue();
      expect(valor).toBeNull();
    });
  });

  describe('a imagem colada ou solta', () => {
    const colar = (dados: DataTransfer) => {
      const e = new ClipboardEvent('paste', { clipboardData: dados, bubbles: true, cancelable: true });
      view.dom.dispatchEvent(e);
      return e;
    };
    const foto = () => {
      const d = new DataTransfer();
      d.items.add(new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' }));
      return d;
    };
    const ID = 'AbCdEfGhIjKlMnOpQrStUv';

    it('o marcador "Guardando a imagem…" fica no lugar dela, anda com o texto, e ela entra ali (W7)', async () => {
      await make('um\ndois');
      fimDaLinha(0);
      const e = colar(foto());
      expect(e.defaultPrevented).toBeTrue();
      expect(imagens.length).toBe(1);
      expect(fixture.nativeElement.querySelector('.vis-guardando')?.textContent).toBe('Guardando a imagem…');
      // escreve em cima enquanto ela é guardada: o lugar desce junto
      view.dispatch(view.state.tr.insertText('zero\n', 1));
      ed().poeImagem(imagens[0].marca, 'murall://imagem/' + ID);
      expect(fixture.nativeElement.querySelector('.vis-guardando')).toBeNull();
      expect(valor!.split('\n')).toContain('{{imagem: murall://imagem/' + ID + '}}');
      expect(valor!.indexOf('{{imagem')).toBeGreaterThan(valor!.indexOf('um'));
      expect(valor!.indexOf('{{imagem')).toBeLessThan(valor!.indexOf('dois'));
    });

    it('apagado o trecho onde ela ia, ela entra onde o cursor estiver; sem entrar, o marcador sai', async () => {
      await make('um\ndois\ntrês');
      fimDaLinha(1);
      colar(foto());
      view.dispatch(view.state.tr.delete(posDe(1), posDe(2)));
      fimDaLinha(1);
      ed().poeImagem(imagens[0].marca, 'murall://imagem/' + ID);
      expect(valor).toBe('um\ntrês\n{{imagem: murall://imagem/' + ID + '}}');
      colar(foto());
      ed().tiraMarca(imagens[1].marca);
      expect(fixture.nativeElement.querySelector('.vis-guardando')).toBeNull();
    });

    it('colar texto não é imagem; a imagem de outra pessoa troca o id dentro do widget', async () => {
      await make('a');
      const d = new DataTransfer();
      d.setData('text/plain', 'oi');
      d.items.add(new File([new Uint8Array([1])], 'f.png', { type: 'image/png' }));
      colar(d);
      expect(imagens.length).toBe(0);
      const outro = 'ZzZzZzZzZzZzZzZzZzZzZz';
      const slice = view.someProp('clipboardTextParser', (f) => f('{{imagem: murall://imagem/' + outro + ' | dela}}', view.state.selection.$from, false, view));
      view.dispatch(view.state.tr.replaceSelection(slice!));
      expect(ed().trocaImagem('murall://imagem/' + outro, 'murall://imagem/' + ID)).toBeTrue();
      expect(valor).toContain('{{imagem: murall://imagem/' + ID + ' | dela}}');
    });
  });

  it('arrastar a peça e soltar no meio de uma linha a põe numa linha só dela, embaixo (W6)', async () => {
    await make('{{contador: 25/12/2030 | A}}\numa linha comprida\nfim');
    seleciona(0);
    const linha = view.dom.children[1] as HTMLElement;
    const r = linha.getBoundingClientRect();
    const slice = view.state.selection.content();
    const dt = new DataTransfer();
    const e = new DragEvent('drop', { clientX: r.left + 5, clientY: r.top + r.height / 2, dataTransfer: dt, bubbles: true, cancelable: true });
    const feito = view.someProp('handleDrop', (f) => f(view, e, slice, true));
    expect(feito).toBeTrue();
    expect(valor).toBe('uma linha comprida\n{{contador: 25/12/2030 | A}}\nfim');
  });
});
