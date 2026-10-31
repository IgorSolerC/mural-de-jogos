import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { NodeSelection, TextSelection } from 'prosemirror-state';
import { ImageStore, StoredImage } from '../core/image-store';
import { EditorView } from 'prosemirror-view';
import { RichEditor, linkHref } from './rich-editor';
import { Settings } from '../core/settings';
import { sanitizeReview } from '../core/review';
import { Toasts } from './toast';

/**
 * As abas Visual e Markdown do editor (PLANO-EDITOR-VISUAL.md, rodada 2): o jeito dos Ajustes abre
 * primeiro, a régua fala com o Visual (os botões acesos, o que ele ainda não sabe fica apagado), e a
 * troca de aba leva o cursor para o mesmo lugar do texto.
 */
describe('o editor com o Visual', () => {
  let fixture: ComponentFixture<RichEditor>;

  async function make(text: string, mode: 'visual' | 'markdown' = 'visual'): Promise<void> {
    localStorage.setItem('mural-de-jogos:config:v1', JSON.stringify({ writingMode: mode }));
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RichEditor);
    fixture.componentRef.setInput('label', 'Anotação');
    fixture.componentInstance.value.set(text);
    document.body.appendChild(fixture.nativeElement);
    await settle();
    if (mode === 'visual') await untilVisual();
  }

  afterEach(() => {
    fixture.destroy();
    fixture.nativeElement.remove();
    localStorage.removeItem('mural-de-jogos:config:v1');
  });

  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
  }
  /** O Visual chega num pedaço à parte. */
  async function untilVisual(): Promise<void> {
    for (let i = 0; i < 300 && !fixture.nativeElement.querySelector('.visual .ProseMirror'); i++) {
      await new Promise((r) => setTimeout(r, 10));
      fixture.detectChanges();
    }
    await settle();
  }
  const pm = (): EditorView => (fixture.debugElement.query(By.css('app-visual-editor')).componentInstance as { view: EditorView }).view;
  const tab = (name: 'visual' | 'markdown') => fixture.nativeElement.querySelector(`[role=tab][id$="-aba-${name}"]`) as HTMLButtonElement;
  const button = (name: string) => fixture.nativeElement.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
  const area = () => fixture.nativeElement.querySelector('textarea') as HTMLTextAreaElement;
  const value = () => fixture.componentInstance.value();
  const wait = (ms = 30) => new Promise((r) => setTimeout(r, ms));
  /** O cursor (ou a seleção) na posição `pos` do documento do Visual. */
  function select(from: number, to = from): void {
    const v = pm();
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, from, to)));
    fixture.detectChanges();
  }

  it('com o Visual nos Ajustes, ele abre: a aba marcada, a folha do ProseMirror, a do Markdown escondida', async () => {
    await make('# Oi\num **dois**');
    expect(tab('visual').getAttribute('aria-selected')).toBe('true');
    expect(tab('markdown').getAttribute('aria-selected')).toBe('false');
    expect(area().hidden).toBeTrue();
    const folha = fixture.nativeElement.querySelector('.visual .ProseMirror') as HTMLElement;
    expect(folha.getAttribute('aria-label')).toBe('Anotação');
    expect(folha.querySelector('.titulo')?.textContent).toBe('Oi');
    expect(folha.querySelector('strong.negrito')?.textContent).toBe('dois');
    expect(value()).toBe('# Oi\num **dois**');
  });

  it('a régua no Visual: o negrito acende onde vale, e nada do Inserir fica apagado (a tabela entra direto, 3×2)', async () => {
    await make('um dois');
    select(4, 8);
    button('Negrito').click();
    await settle();
    expect(value()).toBe('um **dois**');
    expect(button('Negrito').getAttribute('aria-pressed')).toBe('true');
    expect(button('Itálico').getAttribute('aria-pressed')).toBe('false');
    select(2);
    await settle();
    expect(button('Negrito').getAttribute('aria-pressed')).toBe('false');
    const toasts = TestBed.inject(Toasts);
    (fixture.nativeElement.querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
    await settle();
    // os widgets e a tabela entram no Visual: nada fica apagado
    const ops = Array.from(fixture.nativeElement.querySelectorAll('.widget-op') as NodeListOf<HTMLButtonElement>);
    expect(ops.filter((o) => o.classList.contains('apagado')).length).toBe(0);
    ops.find((o) => o.textContent!.includes('Tabela'))!.click();
    await settle();
    // a tabela 3×2 entra direto (sem a folha), na linha seguinte, com o cursor na primeira célula
    expect(fixture.nativeElement.querySelector('dialog.wfolha[open]')).toBeNull();
    expect(value()).toBe('um **dois**\n|  |  |  |\n| --- | --- | --- |\n|  |  |  |\n|  |  |  |');
    expect(pm().state.selection.$from.parent.type.name).toBe('cabeca');
    expect(toasts.current()).toBeFalsy();
    // o menu "Tabela" aparece na régua, com o cursor nela
    expect(fixture.nativeElement.querySelector('.menu-botao[data-menu="tabela"]')).not.toBeNull();
  });

  it('o menu "Tabela": põe a coluna, alinha, troca o jeito (as cinco miniaturas), apaga o que não vale e some fora da tabela', async () => {
    await make('antes\n| A | B |\n| --- | --- |\n| 1 | 2 |');
    const v = pm();
    // o cursor na célula "1"
    let at = 0;
    v.state.doc.descendants((n, pos) => {
      if (n.isText && n.text === '1') at = pos + 1;
    });
    select(at);
    await settle();
    const abre = async () => {
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="tabela"]') as HTMLButtonElement).click();
      await settle();
      return fixture.nativeElement.querySelector('.menu[aria-label="Tabela"]') as HTMLElement;
    };
    const op = (m: HTMLElement, nome: string) => Array.from(m.querySelectorAll<HTMLButtonElement>('.menu-op')).find((b) => b.textContent!.trim() === nome)!;
    let menu = await abre();
    // a primeira fileira de baixo não sobe (o cabeçalho fica no lugar), e a única não sai
    expect(op(menu, 'Subir a fileira').getAttribute('aria-disabled')).toBe('true');
    expect(op(menu, 'Tirar a fileira').getAttribute('aria-disabled')).toBe('true');
    expect(op(menu, 'Fileira em cima').getAttribute('aria-disabled')).toBeNull();
    // as miniaturas chegam num pedaço à parte, na primeira vez que o menu abre
    for (let i = 0; i < 300 && !menu.querySelector('app-table-looks .tl-jeito'); i++) {
      await wait(10);
      fixture.detectChanges();
    }
    expect(menu.querySelectorAll('app-table-looks .tl-jeito').length).toBe(5);
    expect(menu.querySelector('app-table-looks .tl-jeito.on')?.textContent).toContain('Branca');
    op(menu, 'Coluna depois').click();
    await settle();
    expect(value()).toBe('antes\n| A |  | B |\n| --- | --- | --- |\n| 1 |  | 2 |');
    menu = await abre();
    op(menu, 'No fim (números)').click();
    await settle();
    expect(value()).toBe('antes\n| A |  | B |\n| --- | ---: | --- |\n| 1 |  | 2 |');
    menu = await abre();
    expect(op(menu, 'No fim (números)').getAttribute('aria-checked')).toBe('true');
    (Array.from(menu.querySelectorAll<HTMLButtonElement>('app-table-looks .tl-jeito')).find((b) => b.textContent!.includes('Recibo')))!.click();
    await settle();
    expect(value()).toBe('antes\n{{tabela: recibo}}\n| A |  | B |\n| --- | ---: | --- |\n| 1 |  | 2 |');
    expect(fixture.nativeElement.querySelector('.visual .tabela-rolo.jeito-recibo')).not.toBeNull();
    // fora da tabela, o menu some
    select(2);
    await settle();
    expect(fixture.nativeElement.querySelector('.menu-botao[data-menu="tabela"]')).toBeNull();
  });

  it('"Abrir na folha": a folha da tabela de sempre, com a tabela do cursor; salvar troca a tabela no Visual', async () => {
    await make('| A | B |\n| --- | --- |\n| 1 | 2 |\nfim');
    select(3);
    await settle();
    (fixture.nativeElement.querySelector('.menu-botao[data-menu="tabela"]') as HTMLButtonElement).click();
    await settle();
    const menu = fixture.nativeElement.querySelector('.menu[aria-label="Tabela"]') as HTMLElement;
    Array.from(menu.querySelectorAll<HTMLButtonElement>('.menu-op')).find((b) => b.textContent!.trim() === 'Abrir na folha')!.click();
    await settle();
    let grade: HTMLInputElement | null = null;
    for (let i = 0; i < 300 && !(grade = fixture.nativeElement.querySelector('app-table-grid input[data-r="0"][data-c="1"]')); i++) {
      await wait(10);
      fixture.detectChanges();
    }
    expect(grade!.value).toBe('2');
    grade!.value = '20';
    grade!.dispatchEvent(new Event('input', { bubbles: true }));
    await settle();
    const salvar = Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLButtonElement>('dialog.wfolha button')).find((b) => b.textContent!.trim() === 'Salvar a tabela')!;
    salvar.click();
    for (let i = 0; i < 100 && fixture.nativeElement.querySelector('dialog.wfolha[open]'); i++) await wait(10);
    await settle();
    await wait(30);
    expect(value()).toBe('| A | B |\n| --- | --- |\n| 1 | 20 |\nfim');
    expect(pm().state.selection.$from.parent.type.name).toBe('cabeca');
  });

  it('as listas na régua do Visual: o botão vira a linha em lista e fica afundado; o Ctrl+Shift+9 faz as tarefas', async () => {
    await make('um dois');
    select(2);
    const lista = button('Lista');
    expect(lista.getAttribute('aria-disabled')).toBeNull();
    expect(lista.getAttribute('aria-pressed')).toBe('false');
    lista.click();
    await settle();
    expect(value()).toBe('- um dois');
    expect(button('Lista').getAttribute('aria-pressed')).toBe('true');
    pm().dom.dispatchEvent(new KeyboardEvent('keydown', { key: '(', code: 'Digit9', ctrlKey: true, shiftKey: true, bubbles: true, cancelable: true }));
    await settle();
    expect(value()).toBe('- [ ] um dois');
    expect(button('Tarefas').getAttribute('aria-pressed')).toBe('true');
    // a linha dentro do item, pelo Formatar
    (fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement).click();
    await settle();
    const dentro = Array.from(fixture.nativeElement.querySelectorAll('.menu-op') as NodeListOf<HTMLButtonElement>).find((b) => b.textContent!.includes('Linha dentro do item'))!;
    expect(dentro.getAttribute('aria-disabled')).toBeNull();
    const v = pm();
    v.dispatch(v.state.tr.setSelection(TextSelection.create(v.state.doc, v.state.doc.content.size - 1)));
    dentro.click();
    await settle();
    expect(value()).toBe('- [ ] um dois\n      ');
  });

  it('o Formatar marca o estilo da linha do Visual e o troca; o Inserir põe a divisória', async () => {
    await make('linha');
    select(3);
    await settle();
    (fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement).click();
    await settle();
    const estilo = (name: string) => Array.from(fixture.nativeElement.querySelectorAll('.estilo-op') as NodeListOf<HTMLButtonElement>).find((b) => b.textContent!.trim() === name)!;
    expect(estilo('Texto normal').getAttribute('aria-checked')).toBe('true');
    expect(estilo('Bloco de código').getAttribute('aria-disabled')).toBeNull();
    estilo('Título 2').click();
    await settle();
    expect(value()).toBe('## linha');
    (fixture.nativeElement.querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
    await settle();
    const divisoria = Array.from(fixture.nativeElement.querySelectorAll('.menu-op') as NodeListOf<HTMLButtonElement>).find((b) => b.textContent!.includes('Divisória'))!;
    expect(divisoria.getAttribute('aria-disabled')).toBeNull();
    divisoria.click();
    await settle();
    expect(value()).toBe('## linha\n---\n');
  });

  it('trocar para o Markdown leva o cursor ao mesmo lugar do texto; o Ctrl+Z dele desfaz o Visual de uma vez', async () => {
    await make('um **dois** três');
    const v = pm();
    select(v.state.doc.child(0).nodeSize - 1);
    v.dispatch(v.state.tr.insertText(' quatro'));
    expect(value()).toBe('um **dois** três quatro');
    tab('markdown').click();
    await settle();
    await wait();
    expect(area().hidden).toBeFalse();
    expect(document.activeElement).toBe(area());
    expect(area().value).toBe('um **dois** três quatro');
    expect(area().selectionStart).toBe(area().value.length);
    expect(tab('markdown').getAttribute('aria-selected')).toBe('true');
    document.execCommand('undo');
    await settle();
    expect(value()).toBe('um **dois** três');
    document.execCommand('redo');
    await settle();
    expect(value()).toBe('um **dois** três quatro');
  });

  it('do Markdown para o Visual: o cursor vai junto, e sem mudança no texto o desfazer do Visual continua', async () => {
    await make('abc');
    const v = pm();
    select(4);
    v.dispatch(v.state.tr.insertText('d'));
    tab('markdown').click();
    await settle();
    await wait();
    area().setSelectionRange(2, 2);
    tab('visual').click();
    await settle();
    await wait();
    expect(pm()).toBe(v);
    expect(v.state.selection.from).toBe(3);
    fixture.debugElement.query(By.css('app-visual-editor')).componentInstance.run('undo');
    await settle();
    expect(value()).toBe('abc');
  });

  it('as setas nas abas trocam de jeito com o foco nelas; o editor que abre outra ficha volta ao dos Ajustes', async () => {
    await make('x');
    tab('visual').focus();
    tab('visual').dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowRight', bubbles: true, cancelable: true }));
    await settle();
    await wait();
    expect(tab('markdown').getAttribute('aria-selected')).toBe('true');
    expect(document.activeElement).toBe(tab('markdown'));
    fixture.componentInstance.reset();
    await settle();
    expect(tab('visual').getAttribute('aria-selected')).toBe('true');
  });

  it('sem escolha, abre o Markdown, e o Visual só chega quando a aba é tocada', async () => {
    await make('**a**', 'markdown');
    expect(fixture.nativeElement.querySelector('app-visual-editor')).toBeNull();
    TestBed.inject(Settings);
    area().setSelectionRange(3, 3);
    tab('visual').click();
    await untilVisual();
    await wait();
    expect(pm().state.selection.from).toBe(2);
    expect(button('Negrito').getAttribute('aria-pressed')).toBe('true');
  });

  /** A lista da Ajuda chega num pedaço à parte. */
  async function untilGuide(): Promise<HTMLElement> {
    for (let i = 0; i < 300 && !fixture.nativeElement.querySelector('.guia .guia-secao'); i++) {
      await new Promise((r) => setTimeout(r, 10));
      fixture.detectChanges();
    }
    return fixture.nativeElement.querySelector('.guia') as HTMLElement;
  }
  const titles = (g: HTMLElement) => Array.from(g.querySelectorAll('.guia-secao-titulo')).map((t) => t.textContent!.trim());

  it('a Ajuda abre pelo Ctrl+/ na folha do Visual, com os atalhos dela (sem as marcas); no Markdown, a de sempre', async () => {
    await make('x');
    const folha = pm().dom;
    folha.dispatchEvent(new KeyboardEvent('keydown', { key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true }));
    await settle();
    const guia = await untilGuide();
    expect(titles(guia)).toEqual(['Atalhos de teclado', 'Atalhos de digitação, no começo da linha', 'No meio da linha', 'Widgets', 'Tabela', 'Colar e copiar']);
    expect(guia.textContent).toContain('Ctrl+Shift+V');
    // os widgets e a tabela já se escrevem no Visual: o fim só lembra a aba Markdown
    expect(guia.querySelector('.guia-fim')?.textContent).not.toContain('tabelas');
    expect(guia.textContent).toContain('Na última célula, o Tab abre uma fileira nova');
    expect(guia.querySelector('.guia-fim')?.textContent).not.toContain('widgets');
    expect(guia.textContent).toContain('se escrevem direto nele');
    expect(guia.textContent).not.toContain('**texto**');
    expect(guia.textContent).toContain('Ctrl+K');
    expect(guia.querySelector('.guia-fim')?.textContent).toContain('No Markdown, as marcas aparecem como texto: veja a aba Markdown.');
    // as listas já se escrevem no Visual: os atalhos delas, e o aviso do fim não fala mais delas
    expect(guia.textContent).toContain('Ctrl+Alt+Enter');
    expect(guia.textContent).toContain('[ ] tarefa');
    expect(guia.querySelector('.guia-fim')?.textContent).not.toContain('listas');
    // sem as anotações, o "[[" não entra
    expect(guia.textContent).not.toContain('[[');
    tab('markdown').click();
    await settle();
    await wait();
    button('Ajuda: como escrever cada marca').click();
    await settle();
    const md = await untilGuide();
    expect(titles(md)[0]).toBe('Texto');
    expect(md.textContent).toContain('**texto**');
    expect(md.querySelector('.guia-fim')).toBeNull();
  });

  describe('os links no Visual', () => {
    const notes = [
      sanitizeReview({ id: 'n1', kind: 'anotacoes', game: { name: 'Comprar um console' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })!,
      sanitizeReview({ id: 'n2', kind: 'anotacoes', game: { name: 'Lista do mercado' }, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' })!,
    ];
    const key = (k: string, init: KeyboardEventInit = {}) => {
      const e = new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...init });
      pm().dom.dispatchEvent(e);
      return e;
    };
    /** Letras digitadas na folha do Visual, uma a uma (os atalhos de digitação valem). */
    function digita(texto: string): void {
      const v = pm();
      for (const ch of texto) {
        const { from, to } = v.state.selection;
        if (!v.someProp('handleTextInput', (f) => f(v, from, to, ch, () => v.state.tr.insertText(ch, from, to)))) v.dispatch(v.state.tr.insertText(ch, from, to));
      }
    }
    const painel = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;
    const botao = (dentro: string, nome: string) => Array.from(fixture.nativeElement.querySelectorAll(`${dentro} button, ${dentro} a`) as NodeListOf<HTMLElement>).find((b) => b.textContent!.trim() === nome)!;
    const escreve = (campo: HTMLInputElement, texto: string) => {
      campo.value = texto;
      campo.dispatchEvent(new Event('input'));
    };

    it('o endereço do link no Visual: os espaços em %20, os parênteses sem par escapados (os da Wikipédia ficam)', () => {
      expect(linkHref(' site.com/a b ')).toBe('https://site.com/a%20b');
      expect(linkHref('https://pt.wikipedia.org/wiki/Bola_(desambiguação)')).toBe('https://pt.wikipedia.org/wiki/Bola_(desambiguação)');
      expect(linkHref('https://x.com/a)b')).toBe('https://x.com/a%29b');
      expect(linkHref('javascript:alert(1)')).toBeNull();
    });

    it('Ctrl+K com a palavra selecionada abre o painel com ela; "Pôr o link" marca e devolve o foco à folha', async () => {
      await make('uma palavra');
      select(5, 12);
      expect(key('k', { ctrlKey: true }).defaultPrevented).toBeTrue();
      await settle();
      await wait();
      const p = painel('.url-painel')!;
      expect(p).not.toBeNull();
      const [texto, endereco] = Array.from(p.querySelectorAll('input')) as HTMLInputElement[];
      expect(texto.value).toBe('palavra');
      // como no Markdown: com um texto selecionado, o foco vai para o Texto
      expect(document.activeElement).toBe(texto);
      escreve(endereco, 'site.com/a b');
      await settle();
      botao('.url-painel', 'Pôr o link').click();
      await settle();
      expect(value()).toBe('uma [palavra](https://site.com/a%20b)');
      expect(painel('.url-painel')).toBeNull();
      expect(document.activeElement).toBe(pm().dom);
      // o botão da régua também abre (e Cancelar volta à folha com o trecho selecionado)
      select(2);
      button('Link para um endereço').click();
      await settle();
      expect(button('Link para um endereço').getAttribute('aria-disabled')).toBeNull();
      botao('.url-painel', 'Cancelar').click();
      await settle();
      expect(painel('.url-painel')).toBeNull();
    });

    it('um clique num link mostra o painel passivo (trocar, tirar, abrir); tirar deixa o texto; o Esc fecha só ele', async () => {
      await make('veja [o site](https://a.com) agora');
      const a = fixture.nativeElement.querySelector('.ProseMirror a.url') as HTMLElement;
      select(8);
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      await settle();
      expect(painel('.url-painel')).not.toBeNull();
      expect(botao('.url-painel', 'Trocar o link')).toBeDefined();
      expect(botao('.url-painel', 'Abrir').getAttribute('href')).toBe('https://a.com');
      // o cursor continua na folha: o Esc fecha só o painel
      const esc = key('Escape');
      await settle();
      expect(esc.defaultPrevented).toBeTrue();
      expect(painel('.url-painel')).toBeNull();
      // o cursor saiu do link: o painel passivo fecha
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      await settle();
      expect(painel('.url-painel')).not.toBeNull();
      select(2);
      await settle();
      expect(painel('.url-painel')).toBeNull();
      select(8);
      a.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      await settle();
      botao('.url-painel', 'Tirar o link').click();
      await settle();
      expect(value()).toBe('veja o site agora');
    });

    it('"[[" abre a lista das anotações, que filtra; o Enter põe o link; o Esc fecha só a lista (e ela não volta ali)', async () => {
      await make('');
      fixture.componentRef.setInput('notes', notes);
      await settle();
      digita('veja [[list');
      await settle();
      expect(painel('.elos')).not.toBeNull();
      expect(Array.from(fixture.nativeElement.querySelectorAll('.elo-op .elo-nome')).map((e) => (e as HTMLElement).textContent)).toEqual(['Lista do mercado', 'Link para “list”']);
      const enter = key('Enter');
      await settle();
      expect(enter.defaultPrevented).toBeTrue();
      expect(value()).toBe('veja [[Lista do mercado]]');
      expect(painel('.elos')).toBeNull();
      digita(' [[');
      await settle();
      expect(painel('.elos')).not.toBeNull();
      key('Escape');
      await settle();
      expect(painel('.elos')).toBeNull();
      digita('c');
      await settle();
      expect(painel('.elos')).toBeNull();
      // sem a lista, o Enter é o de sempre
      key('Enter');
      expect(pm().state.doc.childCount).toBe(2);
    });

    it('a régua abre o painel do link para outra anotação; um clique num link de anotação abre o dele, para trocar ou tirar', async () => {
      await make('um texto');
      fixture.componentRef.setInput('notes', notes);
      await settle();
      select(4, 9);
      button('Link para outra anotação').click();
      await settle();
      await wait();
      const busca = fixture.nativeElement.querySelector('.elo-painel .elos-campo') as HTMLInputElement;
      expect(document.activeElement).toBe(busca);
      escreve(busca, 'compr');
      await settle();
      (fixture.nativeElement.querySelector('.elo-painel .elo-op') as HTMLElement).click();
      await settle();
      botao('.elo-painel', 'Pôr o link').click();
      await settle();
      expect(value()).toBe('um [[Comprar um console|texto]]');
      const elo = fixture.nativeElement.querySelector('.ProseMirror span.elo') as HTMLElement;
      select(5);
      elo.dispatchEvent(new MouseEvent('click', { bubbles: true, cancelable: true, detail: 1 }));
      await settle();
      expect((fixture.nativeElement.querySelector('.elo-painel .elos-campo') as HTMLInputElement).value).toBe('Comprar um console');
      botao('.elo-painel', 'Tirar o link').click();
      await settle();
      expect(value()).toBe('um texto');
    });
  });

  describe('os widgets no Visual', () => {
    const botao = (dentro: string, nome: string) => Array.from(fixture.nativeElement.querySelectorAll(`${dentro} button`) as NodeListOf<HTMLElement>).find((b) => b.textContent!.trim() === nome)!;
    const peca = () => {
      const v = pm();
      let pos = -1;
      v.state.doc.forEach((n, p) => {
        if (pos < 0 && n.type.name === 'widget') pos = p;
      });
      v.dispatch(v.state.tr.setSelection(NodeSelection.create(v.state.doc, pos)));
      fixture.detectChanges();
    };
    const ed = () => fixture.componentInstance as unknown as { onWidgetDone(d: unknown): void; onWidgetClosed(): void; widgetSheet(): boolean; widgetPick(): unknown };

    it('a peça selecionada mostra a tirinha (o nome e o resumo); o Tirar a tira, e a seleção fora dela a fecha', async () => {
      await make('um\n{{contador: 25/12/2030 | Natal}}\ndois');
      peca();
      await settle();
      const tira = fixture.nativeElement.querySelector('.widget-tira') as HTMLElement;
      expect(tira).not.toBeNull();
      expect(tira.querySelector('.widget-tira-nome')?.textContent).toBe('Contador');
      expect(tira.querySelector('.widget-tira-resumo')?.textContent).toBe('Natal');
      select(2);
      await settle();
      expect(fixture.nativeElement.querySelector('.widget-tira')).toBeNull();
      peca();
      await settle();
      botao('.widget-tira', 'Tirar').click();
      await settle();
      expect(value()).toBe('um\ndois');
    });

    it('o Inserir abre a folha; o widget só entra quando ela fecha (W4), no lugar do cursor guardado', async () => {
      await make('um\n\ndois');
      select(5);
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
      await settle();
      const contador = Array.from(fixture.nativeElement.querySelectorAll('.widget-op') as NodeListOf<HTMLButtonElement>).find((o) => o.textContent!.includes('Contador'))!;
      contador.click();
      await settle();
      expect(ed().widgetSheet()).toBeTrue();
      ed().onWidgetDone({ name: 'contador', args: ['25/12/2030', 'Natal'], size: 'medio' });
      expect(value()).toBe('um\n\ndois');
      ed().onWidgetClosed();
      await settle();
      expect(value()).toBe('um\n{{contador: 25/12/2030 | Natal}}\ndois');
      // e o Editar da tirinha troca a mesma peça
      await settle();
      botao('.widget-tira', 'Editar').click();
      await settle();
      expect(ed().widgetSheet()).toBeTrue();
      ed().onWidgetDone({ name: 'contador', args: ['25/12/2031', 'Ceia'], size: 'grande' });
      ed().onWidgetClosed();
      await settle();
      expect(value()).toBe('um\n{{contador: 25/12/2031 | Ceia | grande}}\ndois');
    });

    it('a imagem colada é guardada e entra no lugar do marcador', async () => {
      await make('um');
      const ID = 'AbCdEfGhIjKlMnOpQrStUv';
      const add = spyOn(TestBed.inject(ImageStore), 'add').and.resolveTo({ id: ID } as StoredImage);
      const dados = new DataTransfer();
      dados.items.add(new File([new Uint8Array([1, 2, 3])], 'foto.png', { type: 'image/png' }));
      select(3);
      pm().dom.dispatchEvent(new ClipboardEvent('paste', { clipboardData: dados, bubbles: true, cancelable: true }));
      expect(add).toHaveBeenCalled();
      for (let i = 0; i < 50 && value() === 'um'; i++) await wait(10);
      expect(value()).toBe('um\n{{imagem: murall://imagem/' + ID + '}}');
    });
  });
});
