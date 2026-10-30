import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { TextSelection } from 'prosemirror-state';
import { EditorView } from 'prosemirror-view';
import { parseRich } from '../../core/rich-text';
import { VisualEditor } from './visual-editor';
import { EstadoVisual } from './visual-api';

/**
 * As listas e as tarefas no modo Visual (PLANO-EDITOR-VISUAL.md, rodada 4): o item é um nó; o número, o
 * corpo e a feita vêm do próprio leitor; Enter, Shift+Enter, Backspace e Tab fazem o que o Markdown faz;
 * a caixinha marca com um toque; os atalhos de digitação e a régua. As teclas vão direto para a vista
 * (o `handleKeyDown` dos plugins), e a seleção é despachada na vista (o R9 do plano).
 */
describe('as listas no modo Visual', () => {
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
  /** O cursor no fim (ou no começo) da linha `i` do documento. */
  const fimDaLinha = (i: number) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, posDe(i) + view.state.doc.child(i).nodeSize - 1)));
  const comecoDaLinha = (i: number) => view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, posDe(i) + 1)));
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
  const texto = () => valor;
  const itens = () => Array.from(fixture.nativeElement.querySelectorAll('.vis-item') as NodeListOf<HTMLElement>);
  const run = (a: Parameters<VisualEditor['run']>[0]) => fixture.componentInstance.run(a);

  describe('ler e desenhar', () => {
    for (const t of ['- a\n* b\n+ c\n\n1) um\n1. um\n1. um', '- [ ] a\n  descrição\n\n  com linha em branco\n- [X] b\n1.1. sub\n  1.2. sub', '3. três\n   - de dentro\n     mais\n4. quatro\n\t- tab'])
      it(`abrir e sair não muda um byte: ${JSON.stringify(t.slice(0, 20))}`, async () => {
        await make(t);
        expect(valor).toBeNull();
        expect(tipos().filter((n) => n === 'cru')).toEqual([]);
      });

    it('os números são os da leitura: a lista que começa no 3, a "1. 1. 1.", o "1.1." e a separada por linha em branco (L1)', async () => {
      await make('3. a\n9. b\n\n1. c\n1. d\n1.1. e\n- x\n  1. de dentro\n  1. outro');
      const ns = itens().filter((i) => i.dataset['tipo'] === 'ol').map((i) => i.getAttribute('data-n'));
      expect(ns).toEqual(['3.', '4.', '1.', '2.', '1.1.', '1.', '2.']);
      // o mesmo que o leitor dá
      const ol = parseRich('3. a\n9. b').find((b) => b.kind === 'ol')!;
      expect(ol.kind === 'ol' && ol.start).toBe(3);
      // o número do pai na frente pede mais lugar
      expect(itens()[4].style.getPropertyValue('--pre-n').trim()).toBe('2');
    });

    it('a descrição fica no alinhamento do texto do item; a da tarefa feita é riscada junto, e há o respiro antes do próximo', async () => {
      await make('- [x] feita\n      descrição\n- [ ] outra\n  - de dentro\n    corpo de dentro\nfora');
      const nos = Array.from(view.dom.children) as HTMLElement[];
      expect(nos[1].classList).toContain('vis-feita');
      expect(nos[1].style.getPropertyValue('--vis-corpo').trim()).toBe('1.35');
      expect(nos[1].style.getPropertyValue('--vis-tira').trim()).toBe('6');
      expect(nos[1].classList).toContain('vis-respiro');
      expect(nos[0].hasAttribute('data-feita')).toBeTrue();
      expect(getComputedStyle(nos[0].querySelector('.vis-item-texto')!).textDecorationLine).toBe('line-through');
      // o item de dentro: o lugar da tarefa; o corpo dele, os dois lugares
      expect(nos[3].style.getPropertyValue('--vis-corpo').trim()).toBe('1.35');
      expect(nos[4].style.getPropertyValue('--vis-corpo').trim()).toBe('2.7');
      expect(nos[3].classList).not.toContain('vis-feita');
      expect(nos[5].getAttribute('style') ?? '').not.toContain('--vis-corpo');
    });

    it('o desenho só refaz quando a estrutura muda; escrever uma letra só acompanha', async () => {
      await make('1. a\n2. b');
      fimDaLinha(0);
      digita('bc');
      expect(itens().map((i) => i.getAttribute('data-n'))).toEqual(['1.', '2.']);
      tecla('Enter');
      expect(itens().map((i) => i.getAttribute('data-n'))).toEqual(['1.', '2.', '3.']);
    });
  });

  describe('o Enter', () => {
    it('no item com texto, o item novo do mesmo tipo; na numerada, o número seguinte e os de baixo descem', async () => {
      await make('1. a\n2. b\n   2.1. sub\n3. c');
      fimDaLinha(0);
      tecla('Enter');
      digita('x');
      expect(texto()).toBe('1. a\n2. x\n3. b\n   3.1. sub\n4. c');
      expect(estado?.lista).toBe('ol');
    });

    it('no meio do item, parte o texto; a tarefa nova vem por fazer', async () => {
      await make('- [x] umdois');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 3)));
      tecla('Enter');
      expect(texto()).toBe('- [x] um\n- [ ] dois');
      expect(tipos()).toEqual(['item', 'item']);
    });

    it('no item vazio, a lista acaba (a linha vira texto)', async () => {
      await make('- a');
      fimDaLinha(0);
      tecla('Enter');
      expect(texto()).toBe('- a\n- ');
      tecla('Enter');
      expect(texto()).toBe('- a\n');
      expect(tipos()).toEqual(['item', 'linha']);
    });

    it('no começo de um item com texto, um item vazio entra em cima (o numerado desce com o número seguinte)', async () => {
      await make('1. a\n2. b');
      comecoDaLinha(0);
      tecla('Enter');
      expect(texto()).toBe('1. \n2. a\n3. b');
      expect(view.state.selection.$from.index(0)).toBe(1);
    });

    it('no fim de um item com descrição, o novo vem depois dela; na descrição, o próximo item', async () => {
      await make('- [ ] a\n      desc\n- [ ] b');
      fimDaLinha(0);
      tecla('Enter');
      digita('novo');
      expect(texto()).toBe('- [ ] a\n      desc\n- [ ] novo\n- [ ] b');
      fimDaLinha(1);
      tecla('Enter');
      digita('outro');
      expect(texto()).toBe('- [ ] a\n      desc\n- [ ] outro\n- [ ] novo\n- [ ] b');
    });

    it('o Enter do teclado do celular (o beforeinput) faz o mesmo no item', async () => {
      await make('- [ ] a');
      fimDaLinha(0);
      const e = new InputEvent('beforeinput', { inputType: 'insertParagraph', bubbles: true, cancelable: true });
      view.dom.dispatchEvent(e);
      expect(e.defaultPrevented).toBeTrue();
      expect(texto()).toBe('- [ ] a\n- [ ] ');
      const quebra = new InputEvent('beforeinput', { inputType: 'insertLineBreak', bubbles: true, cancelable: true });
      fimDaLinha(0);
      view.dom.dispatchEvent(quebra);
      expect(texto()).toBe('- [ ] a\n      \n- [ ] ');
    });
  });

  describe('Shift+Enter, Backspace e Tab', () => {
    it('Shift+Enter abre a linha dentro do item, no recuo do texto dele (a régua também)', async () => {
      await make('- [ ] a\n1.1. b');
      fimDaLinha(0);
      tecla('Enter', { shiftKey: true });
      digita('d');
      expect(texto()).toBe('- [ ] a\n      d\n1.1. b');
      fimDaLinha(2);
      run('inside');
      digita('e');
      expect(texto()).toBe('- [ ] a\n      d\n1.1. b\n     e');
    });

    it('Backspace no começo do item tira o marcador; de novo, sai um nível; sem recuo, junta com a de cima (L3)', async () => {
      await make('- a\n  - b');
      comecoDaLinha(1);
      tecla('Backspace');
      expect(texto()).toBe('- a\n  b');
      expect(tipos()).toEqual(['item', 'linha']);
      tecla('Backspace');
      expect(texto()).toBe('- a\nb');
      tecla('Backspace');
      expect(texto()).toBe('- ab');
    });

    it('Backspace no começo da descrição a tira do item (num passo só, que se vê)', async () => {
      await make('- [ ] a\n      desc');
      comecoDaLinha(1);
      tecla('Backspace');
      expect(texto()).toBe('- [ ] a\ndesc');
    });

    it('Tab num item muda o nível com a descrição junto; Shift+Tab volta', async () => {
      await make('- a\n- b\n  desc');
      fimDaLinha(1);
      expect(tecla('Tab').defaultPrevented).toBeTrue();
      expect(texto()).toBe('- a\n  - b\n    desc');
      expect((view.dom.children[1] as HTMLElement).style.getPropertyValue('--vis-corpo').trim()).toBe('1.35');
      tecla('Tab', { shiftKey: true });
      expect(texto()).toBe('- a\n- b\n  desc');
      // sem recuo, o Shift+Tab passa (o foco sai da folha)
      expect(tecla('Tab', { shiftKey: true }).defaultPrevented).toBeFalse();
    });

    it('o numerado que muda de nível ganha o número do lugar novo (1 na lista nova, o seguinte na de fora)', async () => {
      await make('1. a\n2. b\n3. c');
      fimDaLinha(1);
      tecla('Tab');
      expect(texto()).toBe('1. a\n  1. b\n3. c');
      expect(itens().map((i) => i.getAttribute('data-n'))).toEqual(['1.', '1.', '2.']);
      tecla('Tab', { shiftKey: true });
      expect(texto()).toBe('1. a\n2. b\n3. c');
    });

    it('Shift+Tab na descrição a tira do item; Tab num texto embaixo de um item o faz descrição (L2)', async () => {
      await make('- [ ] a\n      d\nsolto');
      fimDaLinha(1);
      tecla('Tab', { shiftKey: true });
      expect(texto()).toBe('- [ ] a\nd\nsolto');
      fimDaLinha(2);
      tecla('Tab');
      expect(texto()).toBe('- [ ] a\nd\n  solto');
      expect((view.dom.children[2] as HTMLElement).style.getPropertyValue('--vis-corpo').trim()).toBe('');
      fimDaLinha(1);
      tecla('Tab');
      expect((view.dom.children[1] as HTMLElement).style.getPropertyValue('--vis-corpo').trim()).toBe('1.35');
    });
  });

  describe('a caixinha da tarefa', () => {
    it('marca e desmarca com um toque, sem pôr o cursor (L6); o leitor de tela sabe se está feita', async () => {
      await make('- [ ] tarefa\n      descrição');
      const caixa = fixture.nativeElement.querySelector('.vis-caixa') as HTMLElement;
      expect(caixa.getAttribute('role')).toBe('checkbox');
      expect(caixa.getAttribute('aria-checked')).toBe('false');
      const segura = new PointerEvent('pointerdown', { bubbles: true, cancelable: true });
      caixa.dispatchEvent(segura);
      expect(segura.defaultPrevented).toBeTrue();
      const antes = view.state.selection.from;
      caixa.click();
      expect(texto()).toBe('- [x] tarefa\n      descrição');
      expect(caixa.getAttribute('aria-checked')).toBe('true');
      expect(view.state.selection.from).toBe(antes);
      expect((view.dom.children[1] as HTMLElement).classList).toContain('vis-feita');
      caixa.click();
      expect(texto()).toBe('- [ ] tarefa\n      descrição');
      expect((view.dom.children[1] as HTMLElement).classList).not.toContain('vis-feita');
    });

    it('Ctrl+Alt+Enter marca a tarefa do cursor (e a de quem a linha é a descrição)', async () => {
      await make('- [ ] tarefa\n      descrição');
      fimDaLinha(1);
      expect(tecla('Enter', { ctrlKey: true, altKey: true }).defaultPrevented).toBeTrue();
      expect(texto()).toBe('- [x] tarefa\n      descrição');
      fimDaLinha(0);
      tecla('Enter', { ctrlKey: true, altKey: true });
      expect(texto()).toBe('- [ ] tarefa\n      descrição');
    });
  });

  describe('os atalhos de digitação e a régua', () => {
    it('"- ", "* ", "+ ", "1. ", "1.1. ", "[] ", "[ ] " e "- [ ] " no começo da linha', async () => {
      await make('');
      const casos: [string, string][] = [
        ['- ', '- x'],
        ['* ', '- x'],
        ['+ ', '- x'],
        ['7. ', '7. x'],
        ['1.1. ', '1.1. x'],
        ['[] ', '- [ ] x'],
        ['[ ] ', '- [ ] x'],
        ['- [ ] ', '- [ ] x'],
      ];
      for (const [atalho, escrito] of casos) {
        digita(atalho + 'x');
        expect(texto()).withContext(atalho).toBe(escrito);
        expect(tipos()).withContext(atalho).toEqual(['item']);
        tecla('Enter');
        tecla('Enter');
        tecla('Backspace');
        view.dispatch(view.state.tr.delete(0, view.state.doc.content.size));
      }
    });

    it('o Backspace logo depois do atalho volta o que foi escrito (que fica como texto)', async () => {
      await make('');
      digita('- ');
      expect(tipos()).toEqual(['item']);
      tecla('Backspace');
      expect(tipos()).toEqual(['linha']);
      digita('a');
      expect(texto()).toBe('\\- a');
    });

    it('a régua nas linhas selecionadas: viram do tipo (a numerada de 1 em diante); todas já do tipo voltam a texto; as descrições ficam (L5)', async () => {
      await make('um\n\ndois\n  desc');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, posDe(3) - 1)));
      run('ol');
      expect(texto()).toBe('1. um\n\n2. dois\n  desc');
      expect(estado?.lista).toBe('ol');
      run('check');
      expect(texto()).toBe('- [ ] um\n\n- [ ] dois\n  desc');
      view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, 1, posDe(3) - 1)));
      run('check');
      expect(texto()).toBe('um\n\ndois\n  desc');
      expect(estado?.lista).toBeNull();
    });

    it('o "Texto normal" do Formatar deixa o item como está (como no Markdown)', async () => {
      await make('- a');
      fimDaLinha(0);
      expect(estado?.estilo).toBe('texto');
      run({ estilo: 'texto' });
      expect(valor).toBeNull();
      run({ estilo: 't1' });
      expect(texto()).toBe('# a');
    });
  });
});
