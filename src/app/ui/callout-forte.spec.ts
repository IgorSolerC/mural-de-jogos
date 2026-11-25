import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { RichText } from './rich-text';
import { CALLOUT_CARTOLINA, CALLOUT_PAPERS } from '../core/callouts';

/**
 * Na anotação aberta (a folha creme da leitura), a parte de fora do card (a faixa do título e a moldura) tem a cor
 * forte, perto da cartolina da mesma cor; o miolo claro fica o mesmo. Nas cartolinas (a ficha do mural, a colada
 * no texto), nada muda. O pedido do dono em 25/nov/2026 (src/styles.scss, `--c-fundo`).
 */
describe('o card mais forte na anotação aberta', () => {
  /** As palavras de cor de todos os papéis, com a da cartolina. */
  const CORES = [...CALLOUT_PAPERS, CALLOUT_CARTOLINA].map((c) => c.word);

  /** O texto formatado em `onde`, dentro de `fora` (montado no documento), com um card de cada cor dada. */
  async function render(fora: HTMLElement, onde: HTMLElement, cores: string[]): Promise<HTMLElement[]> {
    const fixture = TestBed.createComponent(RichText);
    fixture.componentRef.setInput('text', cores.map((c) => `> [!nota|${c}] ${c}\n> dentro`).join('\n\n'));
    onde.append(fixture.nativeElement);
    document.body.append(fora);
    await fixture.whenStable();
    return Array.from((fixture.nativeElement as HTMLElement).querySelectorAll<HTMLElement>('.cartao'));
  }

  /** A ficha aberta: o leitor, a folha da cartolina (com a cor dela) e o texto. */
  function leitor(cor = 'laranja'): { fora: HTMLElement; texto: HTMLElement } {
    const fora = document.createElement('app-review-reader');
    const ficha = document.createElement('article');
    ficha.className = 'ficha cartolina';
    ficha.dataset['cor'] = cor;
    const texto = document.createElement('div');
    texto.className = 'text';
    ficha.append(texto);
    fora.append(ficha);
    return { fora, texto };
  }

  const fundo = (c: HTMLElement) => getComputedStyle(c).backgroundColor;
  const miolo = (c: HTMLElement) => getComputedStyle(c.querySelector('.cartao-corpo')!).backgroundColor;
  const tinta = (c: HTMLElement) => getComputedStyle(c.querySelector('.cartao-topo')!).color;

  function rgb(cor: string): number[] {
    return cor.match(/\d+/g)!.slice(0, 3).map(Number);
  }
  function luz([r, g, b]: number[]): number {
    const l = (v: number) => ((v /= 255) <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4);
    return 0.2126 * l(r) + 0.7152 * l(g) + 0.0722 * l(b);
  }
  function contraste(a: string, b: string): number {
    const [x, y] = [luz(rgb(a)), luz(rgb(b))].sort((m, n) => n - m);
    return (x + 0.05) / (y + 0.05);
  }
  function saturacao([r, g, b]: number[]): number {
    const max = Math.max(r, g, b);
    return max ? (max - Math.min(r, g, b)) / max : 0;
  }

  beforeEach(() => TestBed.configureTestingModule({ imports: [RichText], providers: [provideZonelessChangeDetection()] }));
  afterEach(() => document.querySelectorAll('app-review-reader, .fora-do-leitor').forEach((e) => e.remove()));

  /** Um lugar fora da anotação aberta (como a ficha do mural), na cartolina dada. */
  function mural(cor = 'laranja'): HTMLElement {
    const el = document.createElement('div');
    el.className = 'fora-do-leitor';
    el.dataset['cor'] = cor;
    document.body.append(el);
    return el;
  }

  /** As cores de cada card, lidas agora (o mesmo texto vai depois para outro lugar). */
  const ler = (cards: HTMLElement[]) => cards.map((c) => ({ fundo: fundo(c), miolo: miolo(c), tinta: tinta(c) }));

  it('aberta, a faixa e a moldura ficam mais fortes que no mural, o miolo fica o mesmo e o título se lê', async () => {
    const { fora, texto } = leitor();
    const cards = await render(fora, texto, CORES);
    expect(cards.length).toBe(CORES.length);
    const abertos = ler(cards);
    // o mesmo texto, na ficha do mural
    mural().append(texto.firstElementChild!);
    const comuns = ler(cards);
    abertos.forEach((aberto, i) => {
      const cor = CORES[i];
      const comum = comuns[i];
      expect(aberto.fundo).withContext(cor).not.toBe(comum.fundo);
      expect(saturacao(rgb(aberto.fundo))).withContext(cor).toBeGreaterThan(saturacao(rgb(comum.fundo)));
      // mais contraste com a folha creme do que antes
      expect(contraste(aberto.fundo, 'rgb(255, 253, 248)')).withContext(cor).toBeGreaterThan(contraste(comum.fundo, 'rgb(255, 253, 248)'));
      expect(aberto.miolo).withContext(cor).toBe(comum.miolo);
      expect(contraste(aberto.tinta, aberto.fundo)).withContext(cor).toBeGreaterThanOrEqual(4.5);
    });
  });

  it('a cor da cartolina pega a forte da cartolina da ficha aberta', async () => {
    const { fora, texto } = leitor('azul');
    const [card] = await render(fora, texto, ['cartolina']);
    expect(fundo(card)).toBe('rgb(182, 223, 250)');
    // escura, a mesma cor (o papel do card é claro também numa cartolina escura)
    texto.closest('article')!.setAttribute('data-cor', 'azul-escuro');
    expect(fundo(card)).toBe('rgb(182, 223, 250)');
  });

  it('nas cartolinas nada muda: no mural, e na ficha colada no texto da anotação aberta', async () => {
    const fora = mural();
    const [card] = await render(fora, fora, ['laranja']);
    expect(fundo(card)).toBe('rgb(251, 223, 194)');
    expect(tinta(card)).toBe('rgb(147, 68, 7)');

    const { fora: aberta, texto } = leitor();
    document.body.append(aberta);
    const colada = document.createElement('app-review-card');
    texto.append(colada);
    colada.append(fora.firstElementChild!);
    expect(fundo(card)).toBe('rgb(251, 223, 194)');
    expect(tinta(card)).toBe('rgb(147, 68, 7)');
  });
});
