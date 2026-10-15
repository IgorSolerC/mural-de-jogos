import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewCard } from './review-card';

const AUDIO = '{{audio: https://www.youtube.com/watch?v=dQw4w9WgXcQ | simples}}';
const COUNTDOWN = '{{contador: 25/12 | Natal}}';

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

/** Os widgets do texto na ficha do mural: tocam na resenha inteira como na anotação, e ficam na frente do estrago. */
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

  it('o widget sem nada para tocar fica na camada dos adesivos, na frente do estrago (2)', async () => {
    await show(card('anotacoes', `Falta:\n${COUNTDOWN}`), { checkable: true });
    const box = el.querySelector<HTMLElement>('.nota-texto')!;
    expect(box.classList).not.toContain('marcavel');
    expect(getComputedStyle(box).zIndex).toBe('3');
  });

  it('o texto sem widget continua onde sempre esteve', async () => {
    await show(card('anotacoes', 'Só texto.'), { checkable: true });
    expect(getComputedStyle(el.querySelector('.nota-texto')!).zIndex).toBe('auto');
  });

  it('o estrago corta o texto, mas não o widget', async () => {
    await show(card('anotacoes', `Antes do widget\n${COUNTDOWN}\nDepois do widget`, { damage: 'queimado', damageSeed: 7 }), { checkable: true });
    const masked = (n: Element) => [...n.classList].some((c) => c.startsWith('mascara-'));
    // o papel é medido e queimado depois de desenhado
    for (let i = 0; i < 40 && !el.querySelector('.nota-texto .linha[class*="mascara-"]'); i++) {
      await new Promise((r) => setTimeout(r, 25));
      await fixture.whenStable();
    }
    const widget = el.querySelector('app-note-widget')!;
    expect([...el.querySelectorAll('.nota-texto .linha')].some(masked)).toBeTrue();
    expect(masked(widget)).toBeFalse();
    expect(masked(el.querySelector('.nota-texto app-rich-text')!)).toBeFalse();
  });
});
