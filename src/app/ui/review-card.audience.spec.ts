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

/** Os selinhos de quem vê, no seu mural: sem o olho. Fora do Feed ou não, a pública é a pública. */
describe('o selo de quem vê na ficha', () => {
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

  it('a anotação fora do Feed leva o mesmo selo da publicada', async () => {
    await show(card('anotacoes', { quiet: true }));
    expect(el.querySelector('.publica-selo')).not.toBeNull();
    expect(el.querySelector('.visivel-selo')).toBeNull();
    expect(el.querySelector('.hit')!.getAttribute('aria-label')).toContain('pública');
  });

  it('a anotação publicada leva o selo; a privada, nenhum', async () => {
    await show(card('anotacoes'));
    expect(el.querySelector('.publica-selo')).not.toBeNull();
    fixture.componentRef.setInput('review', card('anotacoes', { private: true }));
    await fixture.whenStable();
    expect(el.querySelector('.selo')).toBeNull();
    expect(el.querySelector('.hit')!.getAttribute('aria-label')).not.toContain('pública');
  });

  it('a resenha fora do Feed fica como a publicada: sem selo', async () => {
    await show(card('jogos', { quiet: true }));
    expect(el.querySelector('.selo')).toBeNull();
  });
});
