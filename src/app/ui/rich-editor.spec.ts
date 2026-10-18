import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, DeferBlockState, TestBed } from '@angular/core/testing';
import { RichEditor, styleAt } from './rich-editor';
import { sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';

describe('a régua de formatação do texto', () => {
  let fixture: ComponentFixture<RichEditor>;
  let area: HTMLTextAreaElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RichEditor);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    area = fixture.nativeElement.querySelector('textarea');
  });

  afterEach(() => fixture.nativeElement.remove());

  /** Escreve o texto com a seleção marcada por | (um para o cursor, dois para um trecho). */
  function write(marked: string): void {
    const start = marked.indexOf('|');
    const end = marked.indexOf('|', start + 1);
    const text = marked.replace(/\|/g, '');
    fixture.componentInstance.value.set(text);
    fixture.detectChanges();
    area.focus();
    area.setSelectionRange(start, end === -1 ? start : end - 1);
  }
  const button = (name: string) => fixture.nativeElement.querySelector(`button[aria-label="${name}"]`) as HTMLButtonElement;
  /** Abre um menu da régua ("formatar", "inserir", "estilo") e toca no item pelo nome. */
  function pick(menu: string, name: string): void {
    (fixture.nativeElement.querySelector(`.menu-botao[data-menu="${menu}"]`) as HTMLButtonElement).click();
    fixture.detectChanges();
    const items = Array.from(fixture.nativeElement.querySelectorAll('.menu .menu-op') as NodeListOf<HTMLButtonElement>);
    const op = items.find((b) => (b.querySelector('.menu-op-nome')?.textContent ?? '').trim() === name);
    expect(op).withContext(`"${name}" no menu ${menu}`).toBeDefined();
    op!.click();
    fixture.detectChanges();
  }
  const value = () => fixture.componentInstance.value();
  const key = (k: string, extra: KeyboardEventInit = {}) => area.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true, ...extra }));

  it('negrito em volta da seleção, sem pegar os espaços das pontas; de novo, tira', () => {
    write('um |ótimo |jogo');
    button('Negrito').click();
    expect(value()).toBe('um **ótimo** jogo');
    button('Negrito').click();
    expect(value()).toBe('um ótimo jogo');
  });

  it('itálico num negrito vira os dois; Ctrl+I tira de novo', () => {
    write('**|bom|**');
    button('Itálico').click();
    expect(value()).toBe('***bom***');
    key('i', { ctrlKey: true });
    expect(value()).toBe('**bom**');
  });

  it('sem seleção, as marcas ficam com o cursor no meio', () => {
    write('a |');
    key('b', { ctrlKey: true });
    expect(value()).toBe('a ****');
    expect(area.selectionStart).toBe(4);
  });

  it('lista, numerada e tarefas nas linhas da seleção; a mesma de novo volta a ser texto', () => {
    write('|leite\novos|');
    button('Tarefas').click();
    expect(value()).toBe('- [ ] leite\n- [ ] ovos');
    button('Lista numerada').click();
    expect(value()).toBe('1. leite\n2. ovos');
    area.setSelectionRange(0, value().length);
    button('Lista numerada').click();
    expect(value()).toBe('leite\novos');
  });

  it('Enter num item continua a lista; num item vazio, termina', () => {
    write('- [x] leite|');
    key('Enter');
    expect(value()).toBe('- [x] leite\n- [ ] ');
    key('Enter');
    expect(value()).toBe('- [x] leite\n');
    write('3. três|');
    key('Enter');
    expect(value()).toBe('3. três\n4. ');
  });

  it('Enter no começo de um item: um item vazio entra em cima, e este desce com o seu marcador (sem dobrar)', () => {
    write('- [ ] leite\n|- [x] ovos');
    key('Enter');
    expect(value()).toBe('- [ ] leite\n- [ ] \n- [x] ovos');
    expect(area.selectionStart).toBe('- [ ] leite\n- [ ] \n- [x] '.length);
    write('  * |pão');
    key('Enter');
    expect(value()).toBe('  * \n  * pão');
    // no meio do marcador também
    write('- [|x] café');
    key('Enter');
    expect(value()).toBe('- [ ] \n- [x] café');
    write('|3) três\n4) quatro');
    key('Enter');
    expect(value()).toBe('3) \n4) três\n4) quatro');
    // no meio do texto, continua partindo o item em dois
    write('- le|ite');
    key('Enter');
    expect(value()).toBe('- le\n- ite');
  });

  it('Enter fora de lista é um Enter comum', () => {
    write('texto|');
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    area.dispatchEvent(e);
    expect(e.defaultPrevented).toBeFalse();
  });

  it('a aba "Ver como fica" mostra o texto formatado no lugar do campo (sem a régua), e as tarefas se marcam ali', async () => {
    write('- [ ] leite|');
    const tabs = Array.from(fixture.nativeElement.querySelectorAll('[role=tab]') as NodeListOf<HTMLButtonElement>);
    expect(tabs.map((t) => t.textContent!.trim())).toEqual(['Escrever', 'Ver como fica']);
    expect(tabs[0].getAttribute('aria-selected')).toBe('true');
    tabs[1].click();
    await fixture.whenStable();
    expect(area.hidden).toBeTrue();
    expect(tabs[1].getAttribute('aria-selected')).toBe('true');
    expect((fixture.nativeElement.querySelector('.regua') as HTMLElement).hidden).toBeTrue();
    const box = fixture.nativeElement.querySelector('.previa input[type=checkbox]') as HTMLInputElement;
    box.click();
    expect(value()).toBe('- [x] leite');
  });

  it('com um máximo, o contador embaixo da folha e o campo que não passa dele', async () => {
    fixture.componentRef.setInput('max', 20000);
    write('abc|');
    await fixture.whenStable();
    const counter = () => fixture.nativeElement.querySelector('.contagem') as HTMLElement;
    expect(counter().textContent!.trim()).toBe('3 / 20.000 caracteres');
    expect(area.getAttribute('maxlength')).toBe('20000');
    expect(area.getAttribute('aria-describedby')).toBe(counter().id);
    fixture.componentInstance.value.set('x'.repeat(18500));
    await fixture.whenStable();
    expect(counter().classList).toContain('perto');
    expect(counter().textContent!.trim()).toBe('18.500 / 20.000 caracteres');
  });

  it('sem máximo, nem contador nem limite', () => {
    expect(fixture.nativeElement.querySelector('.contagem')).toBeNull();
    expect(area.hasAttribute('maxlength')).toBeFalse();
  });

  describe('as marcas novas', () => {
    it('a régua: "Formatar" e "Inserir" com nome, a caixa do estilo e os botões de toda hora', () => {
      const menus = Array.from(fixture.nativeElement.querySelectorAll('.regua .menu-botao') as NodeListOf<HTMLElement>).map((b) => b.textContent!.trim());
      expect(menus).toEqual(['Formatar', 'Inserir', 'Texto normal']);
      const tools = Array.from(fixture.nativeElement.querySelectorAll('.regua .ferramenta') as NodeListOf<HTMLElement>).map((b) => b.getAttribute('aria-label'));
      expect(tools).toEqual(['Negrito', 'Itálico', 'Riscado', 'Marca-texto', 'Tarefas', 'Lista', 'Lista numerada', 'Link para um endereço']);
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      const formatar = fixture.nativeElement.querySelector('.menu')!.textContent;
      for (const t of ['Negrito', 'Spoiler', 'Código', 'Ctrl+Shift+X', 'Título 1', 'Citação', 'Bloco de código', 'Lista numerada', 'Ctrl+Shift+7']) expect(formatar).toContain(t);
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelectorAll('.menu').length).withContext('um menu por vez').toBe(1);
      const inserir = fixture.nativeElement.querySelector('.menu')!.textContent;
      for (const t of ['Link para um endereço', 'Tabela', 'Divisória', 'Contador', 'Imagem', 'Vídeo', 'Áudio', 'Nota']) expect(inserir).toContain(t);
      // sem `notes` (a resenha), o link para outra anotação não aparece
      expect(inserir).not.toContain('Link para outra anotação');
    });

    it('riscado e marca-texto em volta da seleção (pelo "Formatar", pelo botão e pelos atalhos); de novo, tira', () => {
      write('um |caro| item');
      pick('formatar', 'Riscado');
      expect(value()).toBe('um ~~caro~~ item');
      expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
      button('Riscado').click();
      expect(value()).toBe('um caro item');
      key('h', { ctrlKey: true, shiftKey: true });
      expect(value()).toBe('um ==caro== item');
      pick('formatar', 'Spoiler');
      expect(value()).toBe('um ==||caro||== item');
    });

    it('o estilo do parágrafo: a caixa diz o da linha do cursor e troca o título (no mesmo ponto do texto)', () => {
      const box = () => (fixture.nativeElement.querySelector('.menu-botao.estilo') as HTMLElement).textContent!.trim();
      write('Com|pras');
      area.dispatchEvent(new Event('click'));
      fixture.detectChanges();
      expect(box()).toBe('Texto normal');
      pick('estilo', 'Título 1');
      expect(value()).toBe('# Compras');
      expect(area.selectionStart).toBe(5);
      expect(box()).toBe('Título 1');
      pick('estilo', 'Título 3');
      expect(value()).toBe('### Compras');
      expect(box()).toBe('Título 3');
      // a escolhida, marcada no menu
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="estilo"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect((fixture.nativeElement.querySelector('.menu-op[aria-checked="true"]') as HTMLElement).textContent!.trim()).toBe('Título 3');
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="estilo"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      pick('formatar', 'Texto normal');
      expect(value()).toBe('Compras');
    });

    it('citação pelo estilo nas linhas da seleção; "Texto normal" tira; numa linha vazia, só o "> "', () => {
      write('|um\ndois|');
      pick('formatar', 'Citação');
      expect(value()).toBe('> um\n> dois');
      area.setSelectionRange(0, value().length);
      pick('formatar', 'Texto normal');
      expect(value()).toBe('um\ndois');
      write('abc\n|');
      pick('formatar', 'Citação');
      expect(value()).toBe('abc\n> ');
    });

    it('o título troca a citação (e vice-versa), sem somar as marcas', () => {
      write('> frase|');
      pick('estilo', 'Título 2');
      expect(value()).toBe('## frase');
      pick('estilo', 'Citação');
      expect(value()).toBe('> frase');
    });

    it('bloco de código: cerca as linhas com "```"; "Texto normal" dentro dele tira as cercas', () => {
      write('antes\n|a = 1\nb = 2|\ndepois');
      pick('formatar', 'Bloco de código');
      expect(value()).toBe('antes\n```\na = 1\nb = 2\n```\ndepois');
      expect(value().slice(area.selectionStart, area.selectionEnd)).toBe('a = 1\nb = 2');
      area.setSelectionRange(value().indexOf('b'), value().indexOf('b'));
      area.dispatchEvent(new Event('click'));
      fixture.detectChanges();
      expect((fixture.nativeElement.querySelector('.menu-botao.estilo') as HTMLElement).textContent!.trim()).toBe('Bloco de código');
      pick('estilo', 'Texto normal');
      expect(value()).toBe('antes\na = 1\nb = 2\ndepois');
      expect(value().slice(area.selectionStart)).toBe('b = 2\ndepois');
      // numa linha vazia, o bloco vazio com o cursor dentro
      write('|');
      pick('formatar', 'Bloco de código');
      expect(value()).toBe('```\n\n```');
      expect(area.selectionStart).toBe(4);
    });

    it('um bloco sem a cerca de baixo: "Título 1" tira a de cima e põe o título', () => {
      write('```\nlinha|');
      pick('estilo', 'Título 1');
      expect(value()).toBe('# linha');
    });

    it('código na palavra: as crases (Ctrl+E e pelo "Formatar")', () => {
      write('rode |npm test| já');
      key('e', { ctrlKey: true });
      expect(value()).toBe('rode `npm test` já');
      write('rode |npm| já');
      pick('formatar', 'Código');
      expect(value()).toBe('rode `npm` já');
    });

    it('Ctrl+Shift+7, 8 e 9: as listas, como no Docs (pela tecla, não pelo que ela escreve)', () => {
      write('|leite|');
      key('&', { ctrlKey: true, shiftKey: true, code: 'Digit7' });
      expect(value()).toBe('1. leite');
      area.setSelectionRange(0, value().length);
      key('*', { ctrlKey: true, shiftKey: true, code: 'Digit8' });
      expect(value()).toBe('- leite');
      area.setSelectionRange(0, value().length);
      key('(', { ctrlKey: true, shiftKey: true, code: 'Digit9' });
      expect(value()).toBe('- [ ] leite');
    });

    it('a tabela pela grade (no "Inserir"); Tab anda nas células e cria a linha nova; Enter numa linha vazia termina', () => {
      write('|');
      pick('inserir', 'Tabela');
      const squares = fixture.nativeElement.querySelectorAll('.quadrado') as NodeListOf<HTMLButtonElement>;
      // 3 colunas, 1 linha: o terceiro quadrado da primeira fileira
      squares[2].click();
      fixture.detectChanges();
      expect(value()).toBe('| Coluna 1 | Coluna 2 | Coluna 3 |\n| --- | --- | --- |\n|   |   |   |');
      expect(value().slice(area.selectionStart, area.selectionEnd)).toBe('Coluna 1');
      key('Tab');
      expect(value().slice(area.selectionStart, area.selectionEnd)).toBe('Coluna 2');
      key('Tab');
      key('Tab');
      // pulou a linha de traços: a primeira célula da linha de baixo
      const line = value().split('\n')[2];
      expect(value().lastIndexOf('\n') < area.selectionStart).toBeTrue();
      expect(line.startsWith('|')).toBeTrue();
      key('Tab');
      key('Tab');
      key('Tab');
      // depois da última célula: uma linha nova
      expect(value().split('\n').length).toBe(4);
      area.setSelectionRange(value().length, value().length);
      key('Enter');
      // a linha nova estava vazia: Enter a apaga, e a tabela acaba ali (a linha fica para o texto)
      expect(value().split('\n').length).toBe(4);
      expect(value().endsWith('|\n')).toBeTrue();
    });

    it('o link para um endereço: o painel com o texto selecionado (Ctrl+K), "site.com" vira https; colar um endereço sobre um texto faz o link', async () => {
      write('veja |o site| hoje');
      key('k', { ctrlKey: true });
      fixture.detectChanges();
      const [texto, endereco] = Array.from(fixture.nativeElement.querySelectorAll('.url-painel input') as NodeListOf<HTMLInputElement>);
      expect(texto.value).toBe('o site');
      endereco.value = 'ex.com/a';
      endereco.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      const ok = fixture.nativeElement.querySelector('.painel-ok') as HTMLButtonElement;
      expect(ok.disabled).withContext('o botão do painel').toBeFalse();
      ok.click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.url-painel')).withContext('o painel fechou').toBeNull();
      expect(value()).toBe('veja [o site](https://ex.com/a) hoje');
      write('leia |isto| agora');
      const paste = new ClipboardEvent('paste', { bubbles: true, cancelable: true, clipboardData: new DataTransfer() });
      paste.clipboardData!.setData('text/plain', 'https://ex.com/b');
      area.dispatchEvent(paste);
      expect(value()).toBe('leia [isto](https://ex.com/b) agora');
    });

    it('a Ajuda abre pelo botão, em partes, e fecha com Esc (só ela, não o editor)', async () => {
      const help = button('Ajuda: como escrever cada marca');
      help.click();
      fixture.detectChanges();
      // a lista vem num pedaço à parte (@defer)
      for (const block of await fixture.getDeferBlocks()) await block.render(DeferBlockState.Complete);
      expect(help.getAttribute('aria-expanded')).toBe('true');
      const guide = fixture.nativeElement.querySelector('.guia') as HTMLElement;
      const parts = Array.from(guide.querySelectorAll('.guia-secao-titulo')).map((h) => h.textContent!.trim());
      expect(parts).toEqual(['Texto', 'Parágrafos e listas', 'Links, tabelas e divisória', 'Widgets, cada um numa linha só dele', 'Símbolos']);
      expect(guide.textContent).toContain('Link para um endereço');
      expect(guide.textContent).toContain('{{contador: 19/11/2026 18:00 | Nome}}');
      // sem `notes`, a Ajuda não fala do link para outra anotação
      expect(guide.textContent).not.toContain('[[Título]]');
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      guide.dispatchEvent(esc);
      fixture.detectChanges();
      expect(esc.defaultPrevented).toBeTrue();
      expect(fixture.nativeElement.querySelector('.guia')).toBeNull();
    });

    it('Ctrl+/ na folha abre e fecha a Ajuda; Esc na folha fecha só ela', () => {
      write('a|');
      key('/', { ctrlKey: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.guia')).not.toBeNull();
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      area.dispatchEvent(esc);
      fixture.detectChanges();
      expect(esc.defaultPrevented).toBeTrue();
      expect(fixture.nativeElement.querySelector('.guia')).toBeNull();
      key('/', { ctrlKey: true });
      fixture.detectChanges();
      key('/', { ctrlKey: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.guia')).toBeNull();
    });

    it('os menus pelo teclado: seta para baixo no botão abre no primeiro item, a do lado passa de coluna, Esc volta ao botão', async () => {
      const formatar = fixture.nativeElement.querySelector('.menu-botao[data-menu="formatar"]') as HTMLButtonElement;
      formatar.focus();
      formatar.dispatchEvent(new KeyboardEvent('keydown', { key: 'ArrowDown', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      await new Promise((r) => setTimeout(r));
      const name = () => (document.activeElement?.querySelector('.menu-op-nome')?.textContent ?? '').trim();
      expect(name()).toBe('Negrito');
      const menu = fixture.nativeElement.querySelector('.menu') as HTMLElement;
      const press = (k: string) => menu.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
      press('ArrowDown');
      expect(name()).toBe('Itálico');
      press('ArrowRight');
      expect(name()).toBe('Título 1');
      press('ArrowLeft');
      expect(name()).toBe('Itálico');
      press('Escape');
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
      expect(document.activeElement).toBe(formatar);
    });

    it('outra ficha (reset): os painéis da régua que ficaram abertos fecham', () => {
      write('veja |isto|');
      key('k', { ctrlKey: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.url-painel')).not.toBeNull();
      fixture.componentInstance.reset();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.url-painel')).toBeNull();
      (fixture.nativeElement.querySelector('.menu-botao[data-menu="inserir"]') as HTMLButtonElement).click();
      fixture.detectChanges();
      fixture.componentInstance.reset();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.menu')).toBeNull();
    });
  });

  describe('o link para outra anotação', () => {
    const notes = [
      sanitizeReview({ id: 'n1', kind: 'anotacoes', game: { name: 'Comprar um console' }, createdAt: '2026-01-01T00:00:00.000Z', updatedAt: '2026-01-01T00:00:00.000Z' })!,
      sanitizeReview({ id: 'n2', kind: 'anotacoes', game: { name: 'Lista do mercado' }, createdAt: '2026-02-01T00:00:00.000Z', updatedAt: '2026-02-01T00:00:00.000Z' })!,
    ];
    const options = () => Array.from(fixture.nativeElement.querySelectorAll('.elo-op') as NodeListOf<HTMLElement>).map((o) => o.textContent!.replace(/\s+/g, ' ').trim());

    function typeAt(marked: string): void {
      write(marked);
      area.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
    }

    it('sem `notes` (a resenha), nada de link na régua', () => {
      expect(button('Link para outra anotação')).toBeNull();
    });

    it('"[[" na folha abre a lista, filtra pelo que vem depois, e Enter põe o link', () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      typeAt('1. Arrumar o carro\n2. [[cons|');
      expect(options().length).toBe(2);
      expect(options()[0]).toContain('Comprar um console');
      expect(options()[1]).toContain('Link para “cons”');
      key('Enter');
      fixture.detectChanges();
      expect(value()).toBe('1. Arrumar o carro\n2. [[Comprar um console]]');
      expect(fixture.nativeElement.querySelector('.elos')).toBeNull();
    });

    it('Esc fecha só a lista (e ela não volta no mesmo "[["); um título novo vira link mesmo sem anotação', () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      typeAt('[[Vender a TV|');
      expect(options().length).toBe(1);
      expect(options()[0]).toContain('Link para “Vender a TV”');
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      area.dispatchEvent(esc);
      fixture.detectChanges();
      expect(esc.defaultPrevented).toBeTrue();
      expect(fixture.nativeElement.querySelector('.elos')).toBeNull();
      area.dispatchEvent(new Event('input', { bubbles: true }));
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.elos')).toBeNull();
      // apagou o "[[": o próximo abre a lista de novo
      typeAt('Vender a TV|');
      typeAt('[[Lista|]]');
      key('ArrowDown');
      key('ArrowUp');
      key('Tab');
      expect(value()).toBe('[[Lista do mercado]]');
    });

    it('pela régua: a busca já vem com o trecho selecionado; Enter escolhe a anotação e, de novo, põe o link', async () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      write('ver |mercado| amanhã');
      button('Link para outra anotação').click();
      fixture.detectChanges();
      const search = fixture.nativeElement.querySelector('.elos-campo') as HTMLInputElement;
      const put = () => Array.from(fixture.nativeElement.querySelectorAll('.elo-painel button') as NodeListOf<HTMLButtonElement>).find((b) => b.textContent!.includes('Pôr o link'))!;
      expect(search.value).toBe('mercado');
      expect(options()[0]).toContain('Lista do mercado');
      expect(put().disabled).toBeTrue();
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      // escolhida: o título vai para a busca, a lista fecha e o botão acende
      expect(search.value).toBe('Lista do mercado');
      expect(fixture.nativeElement.querySelector('.elo-painel .elos-lista')).toBeNull();
      expect(put().disabled).toBeFalse();
      expect(value()).toBe('ver mercado amanhã');
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      // o trecho selecionado fica como o texto do link; o link abre a anotação escolhida
      expect(value()).toBe('ver [[Lista do mercado|mercado]] amanhã');
      expect(fixture.nativeElement.querySelector('.elo-painel')).toBeNull();
    });

    it('pela régua: as letras escritas na busca entram (a tecla não é cancelada) e um título novo vira link pelo botão', () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      write('ver |');
      button('Link para outra anotação').click();
      fixture.detectChanges();
      const search = fixture.nativeElement.querySelector('.elos-campo') as HTMLInputElement;
      const letter = new KeyboardEvent('keydown', { key: 'V', bubbles: true, cancelable: true });
      search.dispatchEvent(letter);
      expect(letter.defaultPrevented).toBeFalse();
      search.value = 'Vender a TV';
      search.dispatchEvent(new Event('input'));
      fixture.detectChanges();
      expect(options()[0]).toContain('Link para “Vender a TV”');
      (fixture.nativeElement.querySelector('.elo-op.nova') as HTMLElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.elo-escolhida')?.textContent).toContain('Ainda não existe');
      Array.from(fixture.nativeElement.querySelectorAll('.elo-painel button') as NodeListOf<HTMLButtonElement>)
        .find((b) => b.textContent!.includes('Pôr o link'))!
        .click();
      fixture.detectChanges();
      expect(value()).toBe('ver [[Vender a TV]]');
    });
  });
});

/** Clicar num link ou num widget da folha abre o painel dele, mas o cursor fica onde a pessoa clicou. */
describe('o painel aberto pelo clique na folha', () => {
  let fixture: ComponentFixture<RichEditor>;
  let area: HTMLTextAreaElement;

  beforeEach(async () => {
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(RichEditor);
    document.body.appendChild(fixture.nativeElement);
    await fixture.whenStable();
    area = fixture.nativeElement.querySelector('textarea');
  });

  afterEach(() => fixture.nativeElement.remove());

  /** Põe o texto e clica (um clique só) na posição `at`. */
  async function clickAt(text: string, at: number): Promise<void> {
    fixture.componentInstance.value.set(text);
    fixture.detectChanges();
    area.focus();
    area.setSelectionRange(at, at);
    area.dispatchEvent(new MouseEvent('click', { bubbles: true, detail: 1 }));
    fixture.detectChanges();
    await new Promise((r) => setTimeout(r, 20));
    fixture.detectChanges();
  }
  const panel = (sel: string) => fixture.nativeElement.querySelector(sel) as HTMLElement | null;

  it('num link: o painel abre e o foco e o cursor continuam na folha', async () => {
    const text = 'veja [o site](https://exemplo.com) depois';
    await clickAt(text, 8);
    expect(panel('.url-painel')).not.toBeNull();
    expect(document.activeElement).toBe(area);
    expect(area.selectionStart).toBe(8);
  });

  it('num widget: o painel dele abre com o cursor na folha', async () => {
    await clickAt('{{contador: 2026-12-25 | Natal}}', 5);
    expect(panel('.widget-painel')).not.toBeNull();
    expect(document.activeElement).toBe(area);
  });

  it('escrever na folha, sair do link pelas setas ou clicar fora fecham o painel', async () => {
    const text = 'veja [o site](https://exemplo.com) depois';
    await clickAt(text, 8);
    area.dispatchEvent(new Event('input', { bubbles: true }));
    fixture.detectChanges();
    expect(panel('.url-painel')).toBeNull();

    await clickAt(text, 8);
    area.setSelectionRange(text.length, text.length);
    area.dispatchEvent(new KeyboardEvent('keyup', { key: 'End', bubbles: true }));
    fixture.detectChanges();
    expect(panel('.url-painel')).toBeNull();

    await clickAt(text, 8);
    await clickAt(text, 2);
    expect(panel('.url-painel')).toBeNull();
  });

  it('o Esc fecha só o painel, sem chegar ao editor', async () => {
    await clickAt('veja [o site](https://exemplo.com)', 8);
    const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    area.dispatchEvent(esc);
    fixture.detectChanges();
    expect(esc.defaultPrevented).toBeTrue();
    expect(panel('.url-painel')).toBeNull();
  });
});

describe('o widget Nota no editor', () => {
  let fixture: ComponentFixture<RichEditor>;
  let el: HTMLElement;
  const wait = async () => {
    for (let i = 0; i < 4; i++) {
      await new Promise((r) => setTimeout(r, 20));
      await fixture.whenStable();
    }
  };

  beforeEach(async () => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [RichEditor], providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([
      sanitizeReview({
        id: 'rjogo1',
        kind: 'jogos',
        game: { name: 'Hollow Knight', coverUrl: null, source: 'manual' },
        scores: { diversao: 9, historia: 8, jogabilidade: 9, visual: 8 },
        status: 'finalizado',
        text: '',
        createdAt: '2026-10-01T10:00:00.000Z',
        updatedAt: '2026-10-01T10:00:00.000Z',
      })!,
    ]);
    fixture = TestBed.createComponent(RichEditor);
    fixture.componentRef.setInput('notes', []);
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  });

  afterEach(() => {
    el.remove();
    localStorage.clear();
  });

  it('escolher a Nota no menu já abre a lista; a ficha escolhida vai para o painel e "Colar" escreve a marca', async () => {
    el.querySelector<HTMLButtonElement>('.menu-botao[data-menu="inserir"]')!.click();
    await fixture.whenStable();
    Array.from(el.querySelectorAll<HTMLButtonElement>('.widget-op'))
      .find((b) => b.textContent!.includes('Nota'))!
      .click();
    await wait();
    const picker = el.querySelector('app-card-picker dialog') as HTMLDialogElement;
    expect(picker?.open).toBeTrue();
    el.querySelector<HTMLButtonElement>('app-card-picker .escolha')!.click();
    await wait();
    expect(picker.open).toBeFalse();
    expect(el.querySelector('.ficha-escolher-nome')?.textContent).toBe('Hollow Knight');
    expect(document.activeElement).toBe(el.querySelector('.widget-painel .painel-ok'));
    el.querySelector<HTMLButtonElement>('.widget-painel .painel-ok')!.click();
    await fixture.whenStable();
    expect(fixture.componentInstance.value()).toBe('{{nota: #rjogo1 | Hollow Knight}}');
  });

  it('fechar a lista sem escolher deixa o foco no "Qual", que a abre de novo', async () => {
    el.querySelector<HTMLButtonElement>('.menu-botao[data-menu="inserir"]')!.click();
    await fixture.whenStable();
    Array.from(el.querySelectorAll<HTMLButtonElement>('.widget-op'))
      .find((b) => b.textContent!.includes('Nota'))!
      .click();
    await wait();
    (el.querySelector('app-card-picker dialog') as HTMLDialogElement).close();
    await wait();
    const which = el.querySelector<HTMLButtonElement>('.ficha-escolher')!;
    expect(which.classList).toContain('vazia');
    expect(document.activeElement).toBe(which);
    expect(el.querySelector<HTMLButtonElement>('.widget-painel .painel-ok')!.disabled).toBeTrue();
  });
});

describe('o estilo do parágrafo da linha (styleAt)', () => {
  it('título pelo número de "#", citação, texto; o spoiler ">!…!<" não é citação', () => {
    const at = (t: string) => styleAt(t, t.length);
    expect(at('# a')).toBe('t1');
    expect(at('### a')).toBe('t3');
    expect(at('#hashtag')).toBe('texto');
    expect(at('> dito')).toBe('citacao');
    expect(at('>!segredo!<')).toBe('texto');
    expect(at('- item')).toBe('texto');
  });

  it('dentro das cercas "```" (e nelas), o bloco de código; depois da de baixo, de novo o texto', () => {
    const text = 'a\n```\n# não é título\n```\nb';
    expect(styleAt(text, 0)).toBe('texto');
    expect(styleAt(text, text.indexOf('```'))).toBe('codigo');
    expect(styleAt(text, text.indexOf('#'))).toBe('codigo');
    expect(styleAt(text, text.lastIndexOf('```'))).toBe('codigo');
    expect(styleAt(text, text.length)).toBe('texto');
  });
});
