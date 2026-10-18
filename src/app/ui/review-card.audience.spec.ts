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

/** Quem vê, no seu mural: o desenho antes da data (o selinho só em capa e nome). Fora do Feed ou não, a pública é a pública. */
describe('quem vê, na ficha', () => {
  let fixture: ComponentFixture<ReviewCard>;
  let el: HTMLElement;

  async function show(review: Review): Promise<void> {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', review);
    fixture.componentRef.setInput('checkable', true);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    fixture?.destroy();
    localStorage.clear();
  });

  /** O desenho de quem vê, na linha da data (antes dela). */
  const mark = () => el.querySelector('.meta .quem-ve');

  it('a anotação fora do Feed leva o mesmo desenho da publicada', async () => {
    await show(card('anotacoes', { quiet: true }));
    expect(mark()).not.toBeNull();
    expect(el.querySelector('.visivel-selo')).toBeNull();
    expect(el.querySelector('.hit')!.getAttribute('aria-label')).toContain('pública');
  });

  it('a anotação publicada leva o desenho de pessoas antes da data, sem selo na ficha; a privada, nada', async () => {
    await show(card('anotacoes'));
    const quando = el.querySelector('.meta .quando')!;
    expect(quando.firstElementChild!.classList).toContain('quem-ve');
    expect(quando.querySelector('time')).not.toBeNull();
    expect(mark()!.getAttribute('title')).toBe('Publicada: quem abre o seu mural vê');
    expect(mark()!.textContent).toContain('Publicada');
    expect(el.querySelector('.selo')).toBeNull();
    fixture.componentRef.setInput('review', card('anotacoes', { private: true }));
    await fixture.whenStable();
    expect(mark()).toBeNull();
    expect(el.querySelector('.selo')).toBeNull();
    expect(el.querySelector('.hit')!.getAttribute('aria-label')).not.toContain('pública');
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
  });

  it('a resenha fora do Feed fica como a publicada: sem desenho nem selo', async () => {
    await show(card('jogos', { quiet: true }));
    expect(mark()).toBeNull();
    expect(el.querySelector('.selo')).toBeNull();
  });
});
