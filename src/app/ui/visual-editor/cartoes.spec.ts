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
  /** Onde começa o nó `i`. */
  function posDe(i: number): number {
    let pos = 0;
    for (let k = 0; k < i; k++) pos += view.state.doc.child(k).nodeSize;
    return pos;
  }
  /** O cursor no fim (ou no começo, com `col` 0) do nó `i`. */
  function cursor(i: number, col?: number): void {
    const n = view.state.doc.child(i);
    view.dispatch(view.state.tr.setSelection(TextSelection.create(view.state.doc, posDe(i) + 1 + (col ?? n.content.size))));
  }
  function digita(t: string): void {
    for (const ch of t) {
      const { from, to } = view.state.selection;
      if (!view.someProp('handleTextInput', (f) => f(view, from, to, ch, () => view.state.tr.insertText(ch, from, to)))) view.dispatch(view.state.tr.insertText(ch, from, to));
    }
  }
  function tecla(key: string, shiftKey = false): void {
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key, shiftKey, bubbles: true, cancelable: true }));
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

  it('os botões do card do cursor: o jeito anda pelos nove (do último, volta ao primeiro; com Shift, para trás) e o fechar pelos três; o cursor fica', async () => {
    await make('> [!aviso] T\n> a\n> - b\n\nfora');
    const topo = () => view.dom.children[0] as HTMLElement;
    const botoes = () => Array.from(topo().querySelectorAll<HTMLButtonElement>('.vis-cartao-controles button'));
    cursor(4);
    expect(topo().classList).not.toContain('vis-cartao-ativo');
    // o cursor numa linha de dentro (a do item, no fim do card) também liga os do card
    cursor(2);
    expect(topo().classList).toContain('vis-cartao-ativo');
    expect(botoes().map((b) => b.getAttribute('aria-label'))).toEqual(['Jeito do card: Aviso. Trocar para Perigo', 'Cor do card: Padrão. Trocar para Cor da cartolina', 'Na leitura: Sempre aberto. Trocar para Fecha, começa aberto']);
    // fora do Tab: o teclado tem o menu "Card" da régua
    expect(botoes().every((b) => b.tabIndex === -1)).toBeTrue();
    const onde = view.state.selection.from;
    botoes()[0].click();
    expect(valor).toBe('> [!perigo] T\n> a\n> - b\n\nfora');
    expect(view.state.selection.from).toBe(onde);
    expect(botoes()[0].querySelector('.vis-ciclo-nome')!.textContent).toBe('Perigo');
    botoes()[2].click();
    expect(valor).toBe('> [!perigo]+ T\n> a\n> - b\n\nfora');
    expect(botoes()[2].querySelector('.vis-ciclo-nome')!.textContent).toBe('Abre e fecha');
    botoes()[2].click();
    botoes()[2].click();
    expect(valor!.split('\n')[0]).toBe('> [!perigo] T');
    botoes()[0].dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(valor!.split('\n')[0]).toBe('> [!aviso] T');
    // a Citação, a última, volta para a Nota
    run({ cartao: { jeito: 'citacao' } });
    botoes()[0].click();
    expect(valor!.split('\n')[0]).toBe('> [!nota] T');
    // os toques entram no histórico (os seguidos, juntos): o Ctrl+Z volta
    view.dom.dispatchEvent(new KeyboardEvent('keydown', { key: 'z', ctrlKey: true, bubbles: true, cancelable: true }));
    expect(valor!.split('\n')[0]).not.toBe('> [!nota] T');
  });

  it('os botões aparecem só com a folha no foco, presos na beirada de cima do papel', async () => {
    await make('antes\n> [!dica] T\n> a');
    cursor(2);
    const controles = view.dom.querySelector<HTMLElement>('.vis-cartao-controles')!;
    view.dom.blur();
    expect(getComputedStyle(controles).display).toBe('none');
    view.focus();
    expect(getComputedStyle(controles).display).toBe('flex');
    const papel = controles.parentElement!.getBoundingClientRect();
    const r = controles.getBoundingClientRect();
    expect(r.top).toBeLessThan(papel.top);
    expect(r.bottom).toBeGreaterThan(papel.top);
  });

  it('o menu Card: o jeito, o fechar na leitura e desfazer (o que tinha dentro fica)', async () => {
    await make('> [!nota] T\n> a\n> b');
    cursor(1);
    expect(estado?.cartao).toEqual({ tipo: 'nota', jeito: 'nota', cor: '', dobra: '' });
    run({ cartao: { jeito: 'perigo' } });
    expect(valor).toBe('> [!perigo] T\n> a\n> b');
    run({ cartao: { dobra: '-' } });
    expect(valor).toBe('> [!perigo]- T\n> a\n> b');
    expect(estado?.cartao?.dobra).toBe('-');
    run({ cartao: 'desfazer' });
    expect(valor).toBe('T\na\nb');
    expect(estado?.cartao).toBeNull();
  });

  it('o menu Card: a cor muda só o papel, em todas as linhas, e fica quando o jeito ou o fechar mudam', async () => {
    await make('> [!nota] T\n> a\n> b');
    cursor(1);
    const jeitos = () => Array.from(view.dom.querySelectorAll<HTMLElement>('.vis-cartao-topo, .vis-no-cartao')).map((e) => e.dataset['jeito']);
    expect(jeitos()).toEqual(['nota', 'nota', 'nota']);
    run({ cartao: { cor: 'azul' } });
    expect(valor).toBe('> [!nota|azul] T\n> a\n> b');
    expect(estado?.cartao).toEqual({ tipo: 'nota', jeito: 'nota', cor: 'azul', dobra: '' });
    expect(jeitos()).toEqual(['info', 'info', 'info']);
    run({ cartao: { jeito: 'perigo' } });
    expect(valor).toBe('> [!perigo|azul] T\n> a\n> b');
    expect(jeitos()).toEqual(['info', 'info', 'info']);
    run({ cartao: { dobra: '-' } });
    expect(valor).toBe('> [!perigo|azul]- T\n> a\n> b');
    run({ cartao: { cor: 'cartolina' } });
    expect(valor).toBe('> [!perigo|cartolina]- T\n> a\n> b');
    expect(jeitos()).toEqual(['cartolina', 'cartolina', 'cartolina']);
    run({ cartao: { cor: '' } });
    expect(valor).toBe('> [!perigo]- T\n> a\n> b');
    expect(jeitos()).toEqual(['perigo', 'perigo', 'perigo']);
  });

  it('o botão da cor anda pelas doze, e o desenho do jeito fica; "[!aviso|azul] " escrito vira o card com a cor', async () => {
    await make('> [!aviso] T\n> a');
    cursor(1);
    const cor = () => view.dom.querySelector<HTMLButtonElement>('[data-ciclo="Cor do card"]')!;
    expect(cor().querySelector('.vis-ciclo-nome')!.textContent).toBe('Padrão');
    expect(cor().querySelector('.vis-ciclo-conta')!.textContent).toBe('1/12');
    const icone = view.dom.querySelector('.vis-cartao-icone')!.innerHTML;
    cor().click();
    expect(valor).toBe('> [!aviso|cartolina] T\n> a');
    expect(cor().querySelector('.vis-ciclo-nome')!.textContent).toBe('Cartolina');
    cor().click();
    expect(valor).toBe('> [!aviso|pardo] T\n> a');
    expect(view.dom.querySelector('.vis-cartao-icone')!.innerHTML).toBe(icone);
    cor().dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    cor().dispatchEvent(new MouseEvent('click', { shiftKey: true, bubbles: true }));
    expect(valor).toBe('> [!aviso] T\n> a');
    fixture.destroy();
    fixture.nativeElement.remove();
    TestBed.resetTestingModule();
    await make('');
    digita('> [!aviso|azul]- Cuidado');
    expect(valor).toBe('> [!aviso|azul]- Cuidado');
    expect(linhas()).toEqual(['cartaoTopo:Cuidado']);
    expect(view.dom.querySelector<HTMLElement>('.vis-cartao-topo')!.dataset['jeito']).toBe('info');
  });

  it('a cor escrita à mão fica como está; a palavra desconhecida mostra o Padrão e não se perde sem trocar', async () => {
    await make('> [!aviso|wide-1] T\n> a');
    cursor(1);
    expect(estado?.cartao?.cor).toBe('');
    digita('b');
    expect(valor).toBe('> [!aviso|wide-1] T\n> ab');
  });

  it('Inserir › Card: na linha vazia, no lugar dela; com linhas selecionadas, elas vão para dentro', async () => {
    await make('x\n');
    cursor(1);
    run({ cartao: 'novo' });
    digita('Novo');
    expect(valor).toBe('x\n> [!nota|cartolina] Novo\n>');
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
    expect(valor).toBe('> [!nota|cartolina]\n> a\n> b\nc');
    expect(estado?.cartao?.jeito).toBe('nota');
    expect(estado?.cartao?.cor).toBe('cartolina');
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
    expect(valor).toBe('> [!nota|cartolina]\n> a\nb\nc');
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

  describe('a linha recuada dentro do card', () => {
    /** O papel de cada linha na tela: "[" a de cima, ">" a de dentro, ">_" a última (o rasgo), "." fora. */
    const papel = () =>
      ([...view.dom.children] as HTMLElement[]).map((e) => {
        const c = e.classList;
        if (c.contains('vis-cartao-topo')) return c.contains('vis-cartao-fim') ? '[_' : '[';
        return c.contains('vis-no-cartao') ? (c.contains('vis-cartao-fim') ? '>_' : '>') : '.';
      });
    /** Onde o papel da linha começa e acaba na tela: a caixa dela mais o que o border-image passa dos lados. */
    const beiradas = (e: HTMLElement): [number, number] => {
      const [, d = '0', , l = d] = getComputedStyle(e).borderImageOutset.split(' ');
      const r = e.getBoundingClientRect();
      return [Math.round(r.left - parseFloat(l)), Math.round(r.right + parseFloat(d))];
    };
    /** Cada linha de dentro no papel, de ponta a ponta como a de cima (a recuada também): ele não se parte. */
    function noPapel(): void {
      const filhos = [...view.dom.children] as HTMLElement[];
      for (const e of filhos.slice(1)) {
        expect(getComputedStyle(e).borderImageSource).withContext(e.textContent!).toContain('gradient');
        expect(beiradas(e)).withContext(e.textContent!).toEqual(beiradas(filhos[0]));
      }
    }
    async function chega(texto: string): Promise<void> {
      fixture.componentRef.setInput('texto', texto);
      fixture.detectChanges();
      await fixture.whenStable();
    }
    const DONO = '> [!citacao]+ Leituras\n> **KUN** (i / hai)\n>   sad\n>   入る(((**hai**ru))) → Entrar\n> **ON** (Nyuu)\n>   入力(((**nyuu**ryoku))) → Input';

    it('o recuo que chega do Markdown numa linha que já estava no card: ela fica no papel, que não se parte', async () => {
      await make(DONO.replace('>   sad', '> sad'));
      expect(papel()).toEqual(['[', '>', '>', '>', '>', '>_']);
      await chega(DONO);
      expect(linhas()[2]).toBe('linha>:sad');
      expect(papel()).toEqual(['[', '>', '>', '>', '>', '>_']);
      noPapel();
      // e volta sem o recuo, do mesmo jeito
      await chega(DONO.replace('>   sad', '> sad'));
      expect(papel()).toEqual(['[', '>', '>', '>', '>', '>_']);
    });

    for (const [nome, recuo] of [
      ['dois espaços', '  '],
      ['quatro espaços', '    '],
      ['um tab', '\t'],
    ] as const)
      it(`com ${nome}, também na última linha (a do rasgo); escrever no card não muda as recuadas`, async () => {
        const texto = `> [!nota] T\n> a\n> ${recuo}b\n> ${recuo}c`;
        await make(`> [!nota] T\n> a\n> b\n> c`);
        await chega(texto);
        expect(papel()).toEqual(['[', '>', '>', '>_']);
        noPapel();
        cursor(1);
        digita('!');
        expect(valor).toBe(texto.replace('> a', '> a!'));
        // na última, recuada: ela continua no papel, com o rasgo (o recuo mexido sai em espaços, como fora do card)
        cursor(3);
        digita('?');
        expect(valor).toMatch(/\n> +c\?$/);
        expect(papel()).toEqual(['[', '>', '>', '>_']);
        noPapel();
      });

    it('Tab, Shift+Tab e Backspace no começo da linha recuada: ela anda e fica no papel', async () => {
      await make('> [!nota] T\n> a\n> b\n> c');
      cursor(2, 0);
      tecla('Tab');
      expect(valor).toBe('> [!nota] T\n> a\n>   b\n> c');
      expect(papel()).toEqual(['[', '>', '>', '>_']);
      noPapel();
      cursor(3, 0);
      tecla('Tab');
      expect(valor).toBe('> [!nota] T\n> a\n>   b\n>   c');
      expect(papel()).toEqual(['[', '>', '>', '>_']);
      tecla('Tab', true);
      expect(valor).toBe('> [!nota] T\n> a\n>   b\n> c');
      expect(papel()).toEqual(['[', '>', '>', '>_']);
      cursor(2, 0);
      tecla('Backspace');
      expect(valor).toBe('> [!nota] T\n> a\n> b\n> c');
      expect(papel()).toEqual(['[', '>', '>', '>_']);
    });

    it('Enter numa linha recuada: a nova fica no card, no mesmo recuo', async () => {
      await make(DONO);
      cursor(2);
      tecla('Enter');
      digita('x');
      expect(valor).toBe(DONO.replace('>   sad', '>   sad\n>   x'));
      expect(papel()).toEqual(['[', '>', '>', '>', '>', '>', '>_']);
      noPapel();
      // Backspace no começo da linha nova (recuada): volta o recuo, no papel
      cursor(3, 0);
      tecla('Backspace');
      expect(valor).toBe(DONO.replace('>   sad', '>   sad\n> x'));
      expect(papel()).toEqual(['[', '>', '>', '>', '>', '>', '>_']);
    });

    it('a descrição de um item no card fica no alinhamento do texto dele, como na leitura, também depois de mudar no Markdown', async () => {
      const texto = '> [!nota] T\n> - item\n>   corpo\n> fim';
      await make(texto);
      const corpo = () => view.dom.children[2] as HTMLElement;
      const item = () => view.dom.children[1] as HTMLElement;
      expect(corpo().style.getPropertyValue('--vis-corpo')).toBe('1.35');
      expect(papel()).toEqual(['[', '>', '>', '>_']);
      // o texto da descrição na coluna do texto do item, e o papel por inteiro
      const letra = (e: HTMLElement) => {
        const r = document.createRange();
        r.selectNodeContents(e.querySelector('.vis-item-texto') ?? e);
        return r.getClientRects()[0].left;
      };
      expect(Math.abs(letra(corpo()) - letra(item()))).toBeLessThan(2);
      noPapel();
      await chega(texto.replace('corpo', 'outro corpo'));
      expect(corpo().style.getPropertyValue('--vis-corpo')).toBe('1.35');
      expect(papel()).toEqual(['[', '>', '>', '>_']);
    });

    it('a descrição do item acaba com o card (a linha recuada de fora não é dela); o desenho perdido na composição volta', async () => {
      await make('> [!nota] T\n> - [x] um\n>   corpo\n\n  depois\n1. dois');
      const el = (i: number) => view.dom.children[i] as HTMLElement;
      expect(el(2).style.getPropertyValue('--vis-corpo')).toBe('1.35');
      expect(el(2).classList).toContain('vis-feita');
      expect(el(4).style.getPropertyValue('--vis-corpo')).toBe('');
      expect(el(4).classList).not.toContain('vis-feita');
      expect(el(5).dataset['n']).toBe('1.');
      // a linha trocada inteira no meio de uma composição (o teclado do celular) perde o número; na próxima mudança, ele volta
      view.dispatch(view.state.tr.setNodeMarkup(posDe(5), null, { ...view.state.doc.child(5).attrs, fonte: null }).setMeta('composition', 1));
      expect(el(5).dataset['n']).toBeUndefined();
      cursor(4);
      digita('!');
      expect(el(5).dataset['n']).toBe('1.');
    });
  });
});
