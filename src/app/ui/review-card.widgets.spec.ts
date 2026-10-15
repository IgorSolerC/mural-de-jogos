import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewCard } from './review-card';

const AUDIO = '{{audio: https://www.youtube.com/watch?v=dQw4w9WgXcQ | simples}}';

function card(kind: 'anotacoes' | 'jogos', text: string, extra: Partial<Review> = {}): Review {
  return {
    ...sanitizeReview({
      id: 'rwidg001',
      kind,
      game: { name: 'Com widget', coverUrl: null, source: 'manual' },
      scores: { final: 8 },
      status: 'finalizado',
      stock: 'amarelo',
      text,
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
    })!,
    ...extra,
  };
}

/** Os widgets do texto na ficha do mural: tocam na resenha inteira como na anotação. */
describe('os widgets na ficha do mural', () => {
  let fixture: ComponentFixture<ReviewCard>;
  let el: HTMLElement;

  async function show(review: Review, inputs: Record<string, unknown> = {}): Promise<void> {
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', review);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    el = fixture.nativeElement as HTMLElement;
    el.style.width = '360px';
    document.body.appendChild(el);
    await fixture.whenStable();
  }

  afterEach(() => {
    el?.remove();
    fixture?.destroy();
  });

  it('na resenha inteira, o texto com widget sobe por cima do botão da ficha, como na anotação', async () => {
    await show(card('jogos', `Ótimo jogo.\n${AUDIO}`), { full: true, checkable: true });
    const box = el.querySelector<HTMLElement>('.texto-inteiro')!;
    expect(box.classList).toContain('marcavel');
    expect(getComputedStyle(box).zIndex).toBe('5');
    expect(getComputedStyle(box).pointerEvents).toBe('none');
  });

  it('na anotação, o mesmo (no seu mural e no dos outros)', async () => {
    await show(card('anotacoes', `Ouvir:\n${AUDIO}`), { checkable: false });
    expect(el.querySelector('.nota-texto')!.classList).toContain('marcavel');
  });
});
