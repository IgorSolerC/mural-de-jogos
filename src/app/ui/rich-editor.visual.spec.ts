import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { By } from '@angular/platform-browser';
import { TextSelection } from 'prosemirror-state';
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

  it('a régua no Visual: o negrito acende onde vale, e o que ele ainda não sabe pôr fica apagado e avisa', async () => {
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
    const lista = button('Lista');
    expect(lista.getAttribute('aria-disabled')).toBe('true');
    expect(lista.classList).toContain('apagado');
    expect(lista.title).toBe('Ainda não no Visual: use a aba Markdown');
    lista.click();
    expect(toasts.current()?.text).toBe('Ainda não no Visual: use a aba Markdown');
    expect(value()).toBe('um **dois**');
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

  it('a Ajuda abre pelo Ctrl+/ na folha do Visual', async () => {
    await make('x');
    const folha = pm().dom;
    folha.dispatchEvent(new KeyboardEvent('keydown', { key: '/', code: 'Slash', ctrlKey: true, bubbles: true, cancelable: true }));
    await settle();
    expect(fixture.nativeElement.querySelector('.guia')).not.toBeNull();
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
});
