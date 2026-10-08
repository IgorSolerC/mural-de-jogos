import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { RichEditor } from './rich-editor';
import { sanitizeReview } from '../core/review';

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

  it('Enter fora de lista é um Enter comum', () => {
    write('texto|');
    const e = new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true });
    area.dispatchEvent(e);
    expect(e.defaultPrevented).toBeFalse();
  });

  it('"Ver como fica" mostra o texto formatado no lugar do campo, e as tarefas se marcam ali', async () => {
    write('- [ ] leite|');
    (fixture.nativeElement.querySelector('.ver') as HTMLButtonElement).click();
    await fixture.whenStable();
    expect(area.hidden).toBeTrue();
    expect(button('Negrito').disabled).toBeTrue();
    const box = fixture.nativeElement.querySelector('.previa input[type=checkbox]') as HTMLInputElement;
    box.click();
    expect(value()).toBe('- [x] leite');
  });

  describe('as marcas novas', () => {
    /** Abre o "Mais" e toca na marca pelo nome. */
    function more(name: string): void {
      (fixture.nativeElement.querySelector('.ferramenta.mais') as HTMLButtonElement).click();
      fixture.detectChanges();
      const op = Array.from(fixture.nativeElement.querySelectorAll('.mais-op, .mais-pe button') as NodeListOf<HTMLButtonElement>).find((b) => b.textContent!.includes(name))!;
      op.click();
      fixture.detectChanges();
    }

    it('a régua: só o de toda hora; o resto mora no "Mais", com nome e atalho', () => {
      const labels = Array.from(fixture.nativeElement.querySelectorAll('.regua .ferramenta') as NodeListOf<HTMLElement>).map((b) => b.getAttribute('aria-label') ?? b.textContent!.trim());
      expect(labels).toEqual(['Negrito', 'Itálico', 'Título', 'Tarefas', 'Lista', 'Lista numerada', 'Link para um endereço', 'Tabela', 'Mais']);
      (fixture.nativeElement.querySelector('.ferramenta.mais') as HTMLButtonElement).click();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.mais-painel')!.textContent).toContain('Ctrl+Shift+X');
    });

    it('riscado e marca-texto em volta da seleção (pelo "Mais" e pelos atalhos); de novo, tira', () => {
      write('um |caro| item');
      more('Riscado');
      expect(value()).toBe('um ~~caro~~ item');
      expect(fixture.nativeElement.querySelector('.mais-painel')).toBeNull();
      more('Riscado');
      expect(value()).toBe('um caro item');
      key('h', { ctrlKey: true, shiftKey: true });
      expect(value()).toBe('um ==caro== item');
    });

    it('título: cada toque, um nível menor, até voltar a texto; citação liga e desliga', () => {
      write('Compras|');
      button('Título').click();
      expect(value()).toBe('# Compras');
      button('Título').click();
      expect(value()).toBe('## Compras');
      button('Título').click();
      button('Título').click();
      expect(value()).toBe('Compras');
      write('|um\ndois|');
      more('Citação');
      expect(value()).toBe('> um\n> dois');
      area.setSelectionRange(0, value().length);
      more('Citação');
      expect(value()).toBe('um\ndois');
    });

    it('código: na palavra, as crases (Ctrl+E); numa linha vazia, o bloco', () => {
      write('rode |npm test| já');
      key('e', { ctrlKey: true });
      expect(value()).toBe('rode `npm test` já');
      write('|');
      more('Código');
      expect(value()).toBe('```\n\n```');
    });

    it('a tabela pela grade; Tab anda nas células e cria a linha nova; Enter numa linha vazia termina', () => {
      write('|');
      button('Tabela').click();
      fixture.detectChanges();
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

    it('o guia das marcas abre pelo "Mais" e fecha com Esc (só ele, não o editor)', () => {
      more('Guia');
      expect(fixture.nativeElement.querySelector('.guia')?.textContent).toContain('Link para um endereço');
      const esc = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
      fixture.nativeElement.querySelector('.guia').dispatchEvent(esc);
      fixture.detectChanges();
      expect(esc.defaultPrevented).toBeTrue();
      expect(fixture.nativeElement.querySelector('.guia')).toBeNull();
    });

    it('outra ficha (reset): os painéis da régua que ficaram abertos fecham', () => {
      write('veja |isto|');
      key('k', { ctrlKey: true });
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.url-painel')).not.toBeNull();
      fixture.componentInstance.reset();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.url-painel')).toBeNull();
      (fixture.nativeElement.querySelector('.ferramenta.mais') as HTMLButtonElement).click();
      fixture.detectChanges();
      fixture.componentInstance.reset();
      fixture.detectChanges();
      expect(fixture.nativeElement.querySelector('.mais-painel')).toBeNull();
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

    it('pela régua: a busca já vem com o trecho selecionado, e a escolha troca o trecho pelo link', async () => {
      fixture.componentRef.setInput('notes', notes);
      fixture.detectChanges();
      write('ver |mercado| amanhã');
      button('Link para outra anotação').click();
      fixture.detectChanges();
      const search = fixture.nativeElement.querySelector('.elos-campo') as HTMLInputElement;
      expect(search.value).toBe('mercado');
      expect(options()[0]).toContain('Lista do mercado');
      search.dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true, cancelable: true }));
      fixture.detectChanges();
      // o trecho selecionado fica como o texto do link; o link abre a anotação escolhida
      expect(value()).toBe('ver [[Lista do mercado|mercado]] amanhã');
    });
  });
});
