import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewCard } from './review-card';

function card(kind: 'anotacoes' | 'jogos', extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: 'rselo001',
    kind,
    game: { name: 'Ideias de viagem', coverUrl: null, source: 'manual' },
    scores: kind === 'jogos' ? { diversao: 8, historia: 8, jogabilidade: 8, visual: 8 } : { final: 0 },
    status: 'finalizado',
    stock: 'amarelo',
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  })!;
}

/**
 * Quem vê, no seu mural: o desenho antes da data (o selinho só em capa e nome), em toda ficha: o
 * cadeado da privada e o olho da pública, anotação ou resenha. Fora do Feed ou não, a pública é a pública.
 */
describe('quem vê, na ficha', () => {
  let fixture: ComponentFixture<ReviewCard>;
  let el: HTMLElement;

  async function show(review: Review, mine = true): Promise<void> {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', review);
    fixture.componentRef.setInput('checkable', mine);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    fixture?.destroy();
    localStorage.clear();
  });

  /** O desenho de quem vê, na linha da data (antes dela). */
  const mark = () => el.querySelector('.meta .quem-ve');

  it('ordenando por criação, alteração ou finalização, a linha da data mostra esse dia, dito', async () => {
    const r = card('anotacoes', { createdAt: '2026-09-12T15:00:00.000Z', updatedAt: '2026-10-20T15:00:00.000Z', doneAt: '2026-10-25T15:00:00.000Z' });
    await show(r);
    const time = () => el.querySelector('.meta .quando time')!;
    expect(time().getAttribute('datetime')).toBe('2026-10-01');
    for (const [from, word, day] of [
      ['criacao', 'criada', '2026-09-12'],
      ['alteracao', 'mexida', '2026-10-20'],
      ['finalizacao', 'finalizada', '2026-10-25'],
    ] as const) {
      fixture.componentRef.setInput('dateFrom', from);
      await fixture.whenStable();
      expect(time().getAttribute('datetime')).toBe(day);
      expect(time().textContent!.trim().startsWith(word + ' ')).withContext(from).toBeTrue();
      // a seção diz o mês: o ano não vem
      expect(time().textContent).not.toContain('2026');
    }
    // a não finalizada, ordenando por finalização, fica com a data dela, inteira
    fixture.componentRef.setInput('review', { ...r, doneAt: undefined });
    await fixture.whenStable();
    expect(time().getAttribute('datetime')).toBe('2026-10-01');
    expect(time().textContent).toContain('2026');
  });

  it('a anotação fora do Feed leva o mesmo desenho da publicada', async () => {
    await show(card('anotacoes', { quiet: true }));
    expect(mark()).not.toBeNull();
    expect(el.querySelector('.visivel-selo')).toBeNull();
    expect(el.querySelector('.hit')!.getAttribute('aria-label')).toContain('pública');
  });

  it('a anotação publicada leva o olho antes da data, sem selo na ficha; a privada, o cadeado', async () => {
    await show(card('anotacoes'));
    const quando = el.querySelector('.meta .quando')!;
    expect(quando.firstElementChild!.classList).toContain('quem-ve');
    expect(quando.querySelector('time')).not.toBeNull();
    expect(mark()!.getAttribute('title')).toBe('Publicada: quem abre o seu mural vê');
    expect(mark()!.textContent).toContain('Publicada');
    expect(el.querySelector('.selo')).toBeNull();
    fixture.componentRef.setInput('review', card('anotacoes', { private: true }));
    await fixture.whenStable();
    expect(mark()!.getAttribute('title')).toBe('Privada: só você vê');
    expect(mark()!.textContent).toContain('Privada');
    expect(el.querySelector('.selo')).toBeNull();
    expect(el.querySelector('.hit')!.getAttribute('aria-label')).not.toContain('pública');
  });

  it('a anotação privada sem data também fica com o cadeado no lugar da data', async () => {
    await show(card('anotacoes', { private: true, completedAt: null }));
    expect(mark()!.getAttribute('title')).toBe('Privada: só você vê');
    expect(el.querySelector('.meta time')).toBeNull();
  });

  it('a anotação publicada sem data fica só com o desenho no lugar da data', async () => {
    await show(card('anotacoes', { completedAt: null }));
    expect(mark()).not.toBeNull();
    expect(el.querySelector('.meta time')).toBeNull();
  });

  it('o desenho de quem vê é da tinta da linha, mais ralo, e não ganha disco de selo', async () => {
    await show(card('anotacoes'));
    const style = getComputedStyle(mark() as HTMLElement);
    expect(Number(style.opacity)).toBeLessThan(1);
    expect(style.backgroundColor).toBe('rgba(0, 0, 0, 0)');
    expect(getComputedStyle(el.querySelector('.meta .quando')!).whiteSpace).toBe('nowrap');
  });

  it('a resenha privada leva o cadeado antes da data, na ficha simples também', async () => {
    await show(card('jogos', { private: true }));
    expect(mark()!.getAttribute('title')).toBe('Privada: só você vê');
    expect(el.querySelector('.selo')).toBeNull();
    fixture.componentRef.setInput('compact', true);
    await fixture.whenStable();
    expect(mark()).not.toBeNull();
    expect(el.querySelector('.selo')).toBeNull();
  });

  it('só capa e nome, sem a linha da data, continua com o selinho', async () => {
    await show(card('jogos', { private: true }));
    fixture.componentRef.setInput('capas', true);
    await fixture.whenStable();
    expect(el.querySelector('.privada-selo')).not.toBeNull();
    expect(mark()).toBeNull();
    fixture.componentRef.setInput('review', card('anotacoes'));
    await fixture.whenStable();
    expect(el.querySelector('.publica-selo')).not.toBeNull();
    expect(el.querySelector('.privada-selo')).toBeNull();
    // a resenha pública e a anotação privada também
    fixture.componentRef.setInput('review', card('jogos'));
    await fixture.whenStable();
    expect(el.querySelector('.publica-selo')).not.toBeNull();
    fixture.componentRef.setInput('review', card('anotacoes', { private: true }));
    await fixture.whenStable();
    expect(el.querySelector('.privada-selo')).not.toBeNull();
    expect(el.querySelector('.publica-selo')).toBeNull();
  });

  it('a resenha pública leva o olho, e a de fora do Feed fica como a publicada', async () => {
    for (const extra of [{}, { quiet: true }]) {
      await show(card('jogos', extra));
      expect(mark()!.getAttribute('title')).toBe('Publicada: quem abre o seu mural vê');
      expect(el.querySelector('.selo')).toBeNull();
      fixture.destroy();
      TestBed.resetTestingModule();
    }
  });

  it('no mural dos outros, tudo é público: sem o olho; marcando para o lado a lado, o olho fica', async () => {
    await show(card('jogos'), false);
    expect(mark()).toBeNull();
    fixture.componentRef.setInput('picking', true);
    await fixture.whenStable();
    expect(mark()).not.toBeNull();
  });
});
