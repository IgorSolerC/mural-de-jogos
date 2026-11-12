import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewCard } from './review-card';
import { RichText } from './rich-text';

/**
 * As letras por papel (PLANO-FONTES.md, os tokens de styles.scss): a anotação escreve o nome na Caveat e o
 * texto 6% menor; a resenha continua como era; os títulos dentro do texto (H1, H2) vão para a Caveat em
 * qualquer texto; e a ficha de dentro de um widget não herda as escalas da de fora.
 */
function card(kind: 'anotacoes' | 'jogos', name: string): Review {
  return sanitizeReview({
    id: `f${kind}01`,
    kind,
    game: { name, source: 'manual' },
    scores: kind === 'jogos' ? { historia: 8, diversao: 9, jogabilidade: 9, visual: 8 } : { final: 0 },
    status: 'finalizado',
    stock: 'amarelo',
    category: 'Viagem',
    text: '- [ ] Comprar o passe\n- [x] Reservar o hotel',
    completedAt: '2026-11-10',
    createdAt: '2026-11-10T10:00:00.000Z',
    updatedAt: '2026-11-10T10:00:00.000Z',
  })!;
}

describe('as letras por papel', () => {
  const fixtures: ComponentFixture<unknown>[] = [];

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewCard, RichText], providers: [provideZonelessChangeDetection()] });
  });

  afterEach(() => {
    for (const f of fixtures.splice(0)) f.destroy();
    localStorage.clear();
  });

  async function show(review: Review, wrapperStyle = '', inputs: Record<string, unknown> = {}): Promise<HTMLElement> {
    const fixture = TestBed.createComponent(ReviewCard);
    fixtures.push(fixture);
    const el = fixture.nativeElement as HTMLElement;
    // a ficha de dentro de um widget: uma "ficha de fora" que passa escalas grandes para baixo
    if (wrapperStyle) {
      const fora = document.createElement('div');
      fora.setAttribute('style', wrapperStyle);
      el.parentElement!.insertBefore(fora, el);
      fora.appendChild(el);
    }
    fixture.componentRef.setInput('review', review);
    fixture.componentRef.setInput('checkable', true);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    return el;
  }

  const px = (el: Element | null) => parseFloat(getComputedStyle(el!).fontSize);

  it('a anotação escreve o nome na Caveat 700, 16% maior que o da resenha', async () => {
    // (cada ficha é medida antes da próxima: o TestBed tira a anterior da página)
    const nota = getComputedStyle((await show(card('anotacoes', 'Viagem para Kyoto'))).querySelector('.title')!);
    const [fNota, wNota, sNota] = [nota.fontFamily, nota.fontWeight, parseFloat(nota.fontSize)];
    const jogo = getComputedStyle((await show(card('jogos', 'Hollow Knight'))).querySelector('.title')!);
    expect(fNota).toContain('Caveat');
    expect(wNota).toBe('700');
    expect(jogo.fontFamily).toContain('Permanent Marker');
    expect(jogo.fontWeight).toBe('400');
    expect(sNota / parseFloat(jogo.fontSize)).toBeCloseTo(1.16, 2);
  });

  it('a ficha pequena da anotação (o card do Kanban) cresce 36%, e o nome tem folga para a caneta não cortar', async () => {
    const nota = (await show(card('anotacoes', 'Daily 11/Nov/26'), '', { compact: true })).querySelector('.title')!;
    const sNota = parseFloat(getComputedStyle(nota).fontSize);
    const folga = parseFloat(getComputedStyle(nota).paddingRight);
    const jogo = (await show(card('jogos', 'Hades'), '', { compact: true })).querySelector('.title')!;
    expect(sNota / parseFloat(getComputedStyle(jogo).fontSize)).toBeCloseTo(1.36, 2);
    expect(folga).toBeCloseTo(sNota * 0.14, 1);
  });

  it('o texto da anotação fica 6% menor, na mesma Kalam', async () => {
    const nota = await show(card('anotacoes', 'Lista de compras'));
    const texto = nota.querySelector('.nota-texto')!;
    expect(getComputedStyle(texto).fontFamily).toContain('Kalam');
    const rem = parseFloat(getComputedStyle(document.documentElement).fontSize);
    expect(px(texto)).toBeCloseTo(1.04 * rem * 0.94, 1);
  });

  it('a resenha dentro de uma anotação não herda as escalas dela', async () => {
    const solta = px((await show(card('jogos', 'Hades'))).querySelector('.title'));
    const dentro = await show(card('jogos', 'Hades'), '--titulo-escala: 2; --e-texto: 2');
    expect(px(dentro.querySelector('.title'))).toBeCloseTo(solta, 1);
  });

  it('os títulos dentro do texto (H1, H2) vão para a Caveat 700, e o H3 continua carimbo', async () => {
    const fixture = TestBed.createComponent(RichText);
    fixtures.push(fixture);
    fixture.componentRef.setInput('text', '# Roteiro\n## Dia 1\n### Orçamento\nTexto');
    await fixture.whenStable();
    const el = fixture.nativeElement as HTMLElement;
    for (const sel of ['.t1', '.t2']) {
      const s = getComputedStyle(el.querySelector(sel)!);
      expect(s.fontFamily).withContext(sel).toContain('Caveat');
      expect(s.fontWeight).withContext(sel).toBe('700');
    }
    expect(getComputedStyle(el.querySelector('.t3')!).fontFamily).toContain('Barlow Condensed');
    // a escala do papel sobre o tamanho de antes (1,32em e 1,12em do texto)
    const base = px(el);
    expect(px(el.querySelector('.t1')) / base).toBeCloseTo(1.32 * 1.18, 2);
    expect(px(el.querySelector('.t2')) / base).toBeCloseTo(1.12 * 1.18, 2);
  });
});
