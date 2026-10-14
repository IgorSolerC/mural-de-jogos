import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewCard } from './review-card';

function note(text: string): Review {
  return sanitizeReview({
    id: 'rfeit001',
    kind: 'anotacoes',
    game: { name: 'Compras', coverUrl: null, source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    stock: 'amarelo',
    text,
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
  })!;
}

/** A conta "N tarefas feitas" na ficha do mural: tocar nela mostra as feitas, e não abre a ficha. */
describe('a conta das feitas na ficha do mural', () => {
  let fixture: ComponentFixture<ReviewCard>;
  let el: HTMLElement;
  let opened: string[];

  async function show(review: Review, checkable: boolean): Promise<void> {
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', review);
    fixture.componentRef.setInput('checkable', checkable);
    opened = [];
    fixture.componentInstance.opened.subscribe((id) => opened.push(id));
    el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
  }

  afterEach(() => {
    el?.remove();
    fixture?.destroy();
  });

  for (const checkable of [true, false]) {
    it(checkable ? 'no seu mural' : 'no mural de outra pessoa (sem marcar tarefas)', async () => {
      await show(note('- [ ] pão\n- [x] leite\n- [x] café'), checkable);
      // o texto sobe por cima do botão da ficha, e a conta pega o toque
      expect(el.querySelector('.nota-texto')!.classList).toContain('marcavel');
      const count = el.querySelector<HTMLButtonElement>('.resumo-btn')!;
      expect(getComputedStyle(count).pointerEvents).toBe('auto');
      count.click();
      await fixture.whenStable();
      expect(el.querySelectorAll('.tarefas > li:not(.resumo)').length).toBe(3);
      expect(el.querySelector('.resumo-btn')).toBeNull();
      expect(opened).toEqual([]);
    });
  }

  it('sem tarefa feita, o texto de outra pessoa continua por baixo do botão da ficha', async () => {
    await show(note('- [ ] pão\n- [ ] leite'), false);
    expect(el.querySelector('.nota-texto')!.classList).not.toContain('marcavel');
  });
});
