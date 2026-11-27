import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { FormId } from '../core/dictionary/conjugation';
import { dictionaryWords } from '../core/dictionary/words';
import { WordConjugations } from './word-conjugations';

/** As conjugações de um verbo (PLANO-CONJUGACOES.md, 2): a tabela consolidada, o uso e o exemplo de cada forma. */
describe('A folha de conjugações do Dicionário Japonês', () => {
  let fixture: ComponentFixture<WordConjugations>;
  let el: HTMLElement;
  let still: HTMLStyleElement;
  const word = (text: string) => dictionaryWords().words.find((w) => w.text === text)!;

  async function open(text: string, form: FormId | null = null): Promise<void> {
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(WordConjugations);
    fixture.componentRef.setInput('word', word(text));
    fixture.componentRef.setInput('form', form);
    el = fixture.nativeElement;
    document.body.appendChild(el);
    await settle();
    await new Promise((r) => requestAnimationFrame(r));
    await settle();
  }
  async function settle(): Promise<void> {
    fixture.detectChanges();
    await fixture.whenStable();
    fixture.detectChanges();
  }
  const q = <T extends Element>(s: string) => el.querySelector<T>(s);
  const cell = (id: FormId) => q<HTMLButtonElement>(`[data-forma="${id}"]`)!;

  beforeEach(() => {
    still = document.head.appendChild(document.createElement('style'));
    still.textContent = '*, *::backdrop { animation: none !important; transition: none !important; }';
  });
  afterEach(() => {
    still.remove();
    el?.querySelector<HTMLDialogElement>('dialog')?.close();
    el?.remove();
  });

  it('mostra o verbo e a tabela inteira, nos grupos da nota, com o radical e o que muda', async () => {
    await open('行く');
    expect(q('dialog')!.hasAttribute('open')).toBeTrue();
    expect(q('.verbo rt')!.textContent).toBe('いく');
    expect(q('.grupo-verbo')!.textContent).toContain('Grupo 1 · godan · 33 formas');
    expect([...el.querySelectorAll('.grupo-nome')].map((h) => h.textContent!.trim())).toEqual(['Tempos básicos', 'Forma -te', 'Desejativa', 'Formas modais e vozes', 'Condicionais']);
    expect(el.querySelectorAll('.forma').length).toBe(33);
    // o par informal/polido lado a lado
    const first = el.querySelectorAll('.linha')[0];
    expect([...first.querySelectorAll('.escrita')].map((e) => e.textContent)).toEqual(['行く', '行きます']);
    // o radical a tinta, o que muda no tom
    expect(cell('nakatta').querySelector('.escrita b')!.textContent).toBe('かなかった');
    expect(cell('nakatta').querySelector('.leitura')!.textContent).toBe('いかなかった');
    expect(cell('nakatta').getAttribute('aria-label')).toBe('行かなかった (いかなかった): Passado • Informal • Negativo');
    // a imperativa firme fica na coluna da polida, com a etiqueta dela
    expect(cell('nasai').querySelector('.etiqueta')!.textContent).toBe('firme');
    expect(cell('dic').querySelector('.etiqueta')).toBeNull();
    // nada aberto ao abrir
    expect(q('.detalhe')).toBeNull();
  });

  it('tocar numa forma abre embaixo da linha dela o uso e o exemplo; tocar de novo fecha', async () => {
    await open('食べる');
    cell('ou').click();
    await settle();
    const detail = q('.detalhe')!;
    expect(cell('ou').getAttribute('aria-expanded')).toBe('true');
    expect(cell('ou').getAttribute('aria-controls')).toBe('cj-detalhe');
    // logo depois da linha da forma
    expect(cell('ou').closest('.linha')!.nextElementSibling).toBe(detail);
    expect(detail.querySelector('.det-forma')!.textContent).toBe('食べよう');
    expect(detail.querySelector('.det-tags')!.textContent).toBe('Volitiva • Informal • Afirmativo');
    expect(detail.querySelector('.det-uso')!.textContent).toContain('convite');
    expect(detail.querySelector('.frase')!.textContent).toBe('みんな、食べよう！');
    expect(detail.querySelector('.frase b')!.textContent).toBe('食べよう');
    expect(detail.querySelector('.traducao')!.textContent).toBe('Pessoal, vamos comer!');
    // o exemplo é de 食べる mesmo: sem o aviso de outro verbo
    expect(detail.querySelector('.ex-outro')).toBeNull();
    // uma de cada vez
    cell('ta').click();
    await settle();
    expect(el.querySelectorAll('.detalhe').length).toBe(1);
    expect(q('.det-forma')!.textContent).toBe('食べた');
    expect(cell('ou').getAttribute('aria-expanded')).toBe('false');
    cell('ta').click();
    await settle();
    expect(q('.detalhe')).toBeNull();
  });

  it('o exemplo vem das frases do próprio verbete quando uma tem a forma; senão, o da forma, dito como de outro verbo', async () => {
    await open('行く');
    cell('ta').click();
    await settle();
    expect(q('.frase b')!.textContent).toBe('行った');
    expect(q('.frase')!.textContent).toBe('昨日、どこに行ったの？');
    expect(q('.ex-outro')).toBeNull();
    cell('nakereba').click();
    await settle();
    expect(q('.frase b')!.textContent).toBe('起きなければ');
    expect(q('.ex-outro')!.textContent).toContain('outro verbo');
    // a dica de que a forma se toca
    expect(q('.dica')!.textContent).toContain('Toque numa forma');
  });

  it('aberta por uma forma, ela já vem escolhida, com o foco nela', async () => {
    await open('行く', 'nakatta');
    expect(cell('nakatta').getAttribute('aria-expanded')).toBe('true');
    expect(q('.det-forma')!.textContent).toBe('行かなかった');
    expect(document.activeElement).toBe(cell('nakatta'));
  });

  it('o que não se usa aparece como um traço, dito ao leitor de tela', async () => {
    await open('ある');
    expect(q('.grupo-verbo')!.textContent).toContain('21 de 33 formas');
    expect(cell('nai').querySelector('.escrita')!.textContent).toBe('ない');
    expect(cell('eru')).toBeNull();
    const none = [...el.querySelectorAll('.nao-usa')];
    expect(none.length).toBeGreaterThan(0);
    expect(none[0].querySelector('.sr-only')!.textContent).toContain('não se usa');
  });

  it('o índice leva a cada grupo', async () => {
    await open('する');
    const corpo = q<HTMLElement>('.corpo')!;
    const before = corpo.scrollTop;
    [...el.querySelectorAll<HTMLButtonElement>('.indice .ir')].find((b) => b.textContent!.trim() === 'Condicionais')!.click();
    for (let i = 0; i < 60 && corpo.scrollTop === before; i++) await new Promise((r) => setTimeout(r, 25));
    expect(corpo.scrollTop).toBeGreaterThan(before);
  });
});
