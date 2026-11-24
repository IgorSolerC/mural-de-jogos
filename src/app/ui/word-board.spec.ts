import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { dictionaryWords } from '../core/dictionary/words';
import { STROKES } from '../core/dictionary/strokes';
import { WordBoard, boardChars, strokeStart } from './word-board';

/** A lousa do Dicionário Japonês (PLANO-DICIONARIO.md, 5.1): o pincel, a ordem dos traços e o treino. */
describe('A lousa do Dicionário Japonês', () => {
  let fixture: ComponentFixture<WordBoard>;
  let el: HTMLElement;
  let still: HTMLStyleElement;
  const word = (text: string) => dictionaryWords().words.find((w) => w.text === text)!;

  async function open(text: string): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(WordBoard);
    fixture.componentRef.setInput('word', word(text));
    el = fixture.nativeElement;
    document.body.appendChild(el);
    // os traços chegam sob demanda: espera o pedaço deles
    for (let i = 0; i < 30 && !el.querySelector('.passos'); i++) {
      await new Promise((r) => setTimeout(r, 20));
      fixture.detectChanges();
      await fixture.whenStable();
    }
  }
  const q = <T extends Element>(s: string) => el.querySelector<T>(s);
  const button = (label: string) => [...el.querySelectorAll<HTMLButtonElement>('button')].find((b) => (b.getAttribute('aria-label') ?? b.textContent!.trim()) === label)!;
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }

  beforeEach(() => {
    still = document.head.appendChild(document.createElement('style'));
    still.textContent = '*, *::backdrop { animation: none !important; transition: none !important; }';
  });
  afterEach(() => {
    // o estilo sai primeiro: se ele ficasse, desligaria as transições dos testes seguintes
    still.remove();
    el?.querySelector<HTMLDialogElement>('dialog')?.close();
    el?.remove();
  });

  it('acha o começo de um traço e os caracteres que se desenham', () => {
    expect(strokeStart('M25.5,28.3c1.6,0.4,4.6,0.5,6.2,0.4')).toEqual([25.5, 28.3]);
    expect(strokeStart('M 10 20 L 30 40')).toEqual([10, 20]);
    expect(strokeStart('c1,2')).toBeNull();
    expect(boardChars('〜ます')).toEqual(['ま', 'す']);
    expect(boardChars('来る')).toEqual(['来', 'る']);
  });

  it('abre com o foco no papel: o Espaço pausa a ordem em vez de apertar um botão', async () => {
    await open('食べる');
    fixture.componentRef.setInput('hasNext', true);
    await settle();
    let stepped = 0;
    fixture.componentInstance.step.subscribe(() => stepped++);
    const papel = q<HTMLElement>('.papel')!;
    expect(document.activeElement).toBe(papel);
    expect(button('Pausar')).toBeTruthy();
    papel.dispatchEvent(new KeyboardEvent('keydown', { key: ' ', bubbles: true }));
    await settle();
    expect(button('Tocar')).toBeTruthy();
    expect(stepped).toBe(0);
  });

  it('a palavra seguinte que começa pelo mesmo caractere recomeça o treino', async () => {
    await open('食べる');
    button('Treinar').click();
    await settle();
    const board = fixture.componentInstance as unknown as { drawn: { set(v: unknown[]): void }; done(): number };
    board.drawn.set([[{ x: 1, y: 1, w: 3 }]]);
    expect(board.done()).toBe(1);
    const other = dictionaryWords().words.find((w) => w.text !== '食べる' && w.text.startsWith('食'))!;
    fixture.componentRef.setInput('word', other);
    await settle();
    expect(board.done()).toBe(0);
  });

  it('com um kanji no quadrado, as outras palavras com ele; a composição e elas abrem a lousa delas', async () => {
    await open('食べる');
    const opened: string[] = [];
    fixture.componentInstance.goto.subscribe((w) => opened.push(w.text));
    expect(q('.mesmo-kanji h3')!.textContent).toContain('食');
    const others = [...el.querySelectorAll('.mesmo-kanji .outra-palavra')].map((e) => e.textContent!.trim());
    expect(others).toEqual(['食べ物']);
    q<HTMLButtonElement>('.mesmo-kanji .outra')!.click();
    q<HTMLButtonElement>('.composicao .elo')!.click();
    expect(opened).toEqual(['食べ物', '食べ物']);
    expect(q('.composicao')!.textContent!.replace(/\s+/g, ' ')).toContain('食べます (forma educada), 食べない (não comer), 食べた (comeu), 食べ物 (comida)');
    // a ruby: com um kana no quadrado, a lista some
    [...el.querySelectorAll<HTMLButtonElement>('.caractere')][1].click();
    await settle();
    expect(q('.mesmo-kanji')).toBeNull();
  });

  it('todo caractere das palavras do dicionário tem os traços do KanjiVG (menos o ？)', () => {
    const chars = new Set(dictionaryWords().words.flatMap((w) => boardChars(w.text + w.reading)));
    const missing = [...chars].filter((c) => !STROKES[c] && c.codePointAt(0)! >= 0x3040);
    expect(missing).toEqual(['？']);
    // os números de cada traço batem com os traços
    expect(Object.values(STROKES).every((s) => s.n.length === s.s.length)).toBeTrue();
  });

  it('abre com a palavra no pincel e a tabela de passos; escrita e leitura', async () => {
    await open('来る');
    expect(q<HTMLDialogElement>('dialog')!.open).toBeTrue();
    expect([...el.querySelectorAll('.caractere')].map((c) => c.textContent!.trim())).toEqual(['来', 'る']);
    expect(el.querySelectorAll('.passos-lista li').length).toBe(7);
    // a leitura troca os caracteres do quadrado
    button('Leitura くる').click();
    await settle();
    expect([...el.querySelectorAll('.caractere')].map((c) => c.textContent!.trim())).toEqual(['く', 'る']);
    expect(el.querySelectorAll('.passos-lista li').length).toBe(STROKES['く'].s.length);
  });

  it('a Ordem anda traço a traço e o Pincel mostra o caractere enorme', async () => {
    await open('来る');
    // a tabela de passos para a animação e mostra até o traço tocado; daí, passo a passo
    el.querySelectorAll<HTMLButtonElement>('.passo')[0].click();
    await new Promise((r) => setTimeout(r, 0));
    await settle();
    expect(q('.controles .contador')!.textContent!.trim()).toBe('1 / 7');
    button('Próximo traço').click();
    await settle();
    expect(q('.controles .contador')!.textContent!.trim()).toBe('2 / 7');
    button('Traço anterior').click();
    await settle();
    expect(q('.controles .contador')!.textContent!.trim()).toBe('1 / 7');
    // a tabela de passos pula até o traço
    el.querySelectorAll<HTMLButtonElement>('.passo')[6].click();
    await new Promise((r) => setTimeout(r, 0));
    await settle();
    expect(q('.controles .contador')!.textContent!.trim()).toBe('7 / 7');
    expect(el.querySelectorAll('.tracos path.feito').length).toBe(7);
    expect(el.querySelectorAll('.tracos .numero').length).toBe(7);

    [...el.querySelectorAll<HTMLButtonElement>('.jeito')].find((b) => b.textContent!.trim() === 'Pincel')!.click();
    await settle();
    expect(q('.no-pincel')!.textContent!.trim()).toBe('来');
    expect(getComputedStyle(q('.no-pincel')!).fontFamily).toContain('Yuji Syuku');
  });

  it('no Treinar, cada traço feito por cima passa a guia para o próximo; Desfazer e Limpar voltam', async () => {
    await open('来る');
    [...el.querySelectorAll<HTMLButtonElement>('.jeito')].find((b) => b.textContent!.trim() === 'Treinar')!.click();
    await settle();
    const canvas = q<HTMLCanvasElement>('canvas.tela')!;
    const r = canvas.getBoundingClientRect();
    const at = (x: number, y: number) => ({ clientX: r.left + (x * r.width) / 109, clientY: r.top + (y * r.height) / 109, pointerId: 1, pointerType: 'mouse', button: 0, buttons: 1, bubbles: true });
    const stroke = async (from: [number, number], to: [number, number]) => {
      canvas.dispatchEvent(new PointerEvent('pointerdown', at(...from)));
      for (let i = 1; i <= 10; i++) canvas.dispatchEvent(new PointerEvent('pointermove', at(from[0] + ((to[0] - from[0]) * i) / 10, from[1] + ((to[1] - from[1]) * i) / 10)));
      canvas.dispatchEvent(new PointerEvent('pointerup', at(...to)));
      await settle();
    };
    expect(q('.controles .contador')!.textContent!.trim()).toBe('Traço 1 de 7');
    expect(q('.guia-n')!.textContent!.trim()).toBe('1');
    await stroke([25, 28], [80, 25]);
    expect(q('.controles .contador')!.textContent!.trim()).toBe('Traço 2 de 7');
    expect(q('.guia-n')!.textContent!.trim()).toBe('2');
    // um toque sem arrastar é um ponto, e um traço bem curto também conta
    canvas.dispatchEvent(new PointerEvent('pointerdown', at(50, 50)));
    canvas.dispatchEvent(new PointerEvent('pointerup', at(50, 50)));
    await settle();
    expect(q('.controles .contador')!.textContent!.trim()).toBe('Traço 3 de 7');
    await stroke([60, 60], [61, 61]);
    expect(q('.controles .contador')!.textContent!.trim()).toBe('Traço 4 de 7');
    // o traço que o navegador interrompe não conta
    canvas.dispatchEvent(new PointerEvent('pointerdown', at(40, 70)));
    canvas.dispatchEvent(new PointerEvent('pointermove', at(45, 75)));
    canvas.dispatchEvent(new PointerEvent('pointercancel', at(45, 75)));
    await settle();
    expect(q('.controles .contador')!.textContent!.trim()).toBe('Traço 4 de 7');
    button('Desfazer').click();
    button('Desfazer').click();
    button('Desfazer').click();
    await settle();
    expect(q('.controles .contador')!.textContent!.trim()).toBe('Traço 1 de 7');
    await stroke([25, 28], [80, 25]);
    button('Limpar').click();
    await settle();
    expect(q('.controles .contador')!.textContent!.trim()).toBe('Traço 1 de 7');
    // do Treinar, a tabela de passos leva à Ordem mostrando até o traço tocado
    el.querySelectorAll<HTMLButtonElement>('.passo')[4].click();
    await settle();
    await new Promise((r) => setTimeout(r, 0));
    await settle();
    expect(q('.controles .contador')!.textContent!.trim()).toBe('5 / 7');
  });
});
