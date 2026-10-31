import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { Review, sanitizeReview } from '../core/review';
import { ReviewCard } from './review-card';

function note(extra: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: 'nvisao01',
    kind: 'anotacoes',
    game: { name: 'Daily de segunda', coverUrl: 'https://exemplo.com/capa.jpg', source: 'manual' },
    scores: { final: 0 },
    status: 'finalizado',
    stock: 'amarelo',
    category: 'Trabalho',
    subject: 'Dailys',
    tags: ['urgente', 'reunião', 'time'],
    text: '- [x] Ontem: login\n- [ ] Hoje: testes',
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...extra,
  })!;
}

/**
 * A Visão geral do mural de anotações (a ficha de relance) e a orelha do assunto com um grupo aberto.
 */
describe('a ficha na Visão geral e a orelha do assunto', () => {
  let fixture: ComponentFixture<ReviewCard>;
  let el: HTMLElement;

  async function show(review: Review, inputs: Record<string, unknown> = {}): Promise<void> {
    localStorage.clear();
    TestBed.configureTestingModule({ imports: [ReviewCard], providers: [provideZonelessChangeDetection()] });
    fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', review);
    fixture.componentRef.setInput('checkable', true);
    for (const [k, v] of Object.entries(inputs)) fixture.componentRef.setInput(k, v);
    await fixture.whenStable();
    el = fixture.nativeElement as HTMLElement;
  }

  afterEach(() => {
    fixture?.destroy();
    localStorage.clear();
  });

  const ear = () => el.querySelector('.aba-cat app-cat-label .nome')?.textContent?.trim() ?? null;

  it('só a orelha, o título e as tags: sem tachinha, capa, linha da data, texto, carimbo nem reações', async () => {
    await show(note({ doneAt: '2026-10-02T10:00:00.000Z' }), { compact: true, overview: true });
    expect(el.classList).toContain('geral');
    expect(el.classList).toContain('sem-capa');
    expect(el.querySelector('app-pin')).toBeNull();
    expect(el.querySelector('.cover')).toBeNull();
    expect(el.querySelector('.meta')).toBeNull();
    expect(el.querySelector('.nota-texto')).toBeNull();
    expect(el.querySelector('.carimbo')).toBeNull();
    expect(el.querySelector('.reacoes')).toBeNull();
    expect(el.querySelector('.title')!.textContent!.trim()).toBe('Daily de segunda');
    expect(ear()).toBe('Trabalho');
    // duas tags e o resto no +N, como na ficha simples
    expect(el.querySelectorAll('.categorias app-note-tag').length).toBe(2);
    expect(el.querySelector('.categorias .mais')!.textContent!.trim()).toBe('+1');
    // a finalizada fica com o título riscado (no lugar do carimbo)
    expect(el.classList).toContain('feita');
    expect(getComputedStyle(el.querySelector('.title')!).textDecorationLine).toContain('line-through');
  });

  it('a simples de sempre (Kanban, Calendário, widget Nota) continua com a tachinha, a capa e a linha da data', async () => {
    await show(note(), { compact: true });
    expect(el.classList).not.toContain('geral');
    expect(el.querySelector('app-pin')).not.toBeNull();
    expect(el.querySelector('.cover')).not.toBeNull();
    expect(el.querySelector('.meta .assunto')!.textContent).toContain('Dailys');
  });

  it('a Visão geral fica quase reta e sem o desnível da parede', async () => {
    await show(note(), { compact: true, overview: true });
    const css = getComputedStyle(el);
    expect(css.marginTop).toBe('0px');
    const tilt = parseFloat(el.style.getPropertyValue('--tilt'));
    expect(Math.abs(parseFloat(css.rotate) || 0)).toBeLessThanOrEqual(Math.abs(tilt) * 0.31 + 0.01);
  });

  it('com um grupo aberto, a orelha diz o assunto (com o desenho dele) e a linha da data não o repete', async () => {
    await show(note(), { subjectEar: true });
    expect(ear()).toBe('Dailys');
    expect(el.querySelector('.meta .assunto')).toBeNull();
    // o leitor de tela ainda ouve o assunto e o grupo
    const spoken = Array.from(el.querySelectorAll('.categorias .sr-only')).map((n) => n.textContent!.trim());
    expect(spoken).toContain('Dailys (assunto)');
    expect(spoken).toContain('Trabalho (grupo)');
  });

  it('com um grupo aberto, a anotação sem assunto fica sem orelha', async () => {
    await show(note({ subject: null }), { subjectEar: true, compact: true, overview: true });
    expect(el.querySelector('.aba-cat')).toBeNull();
  });

  it('sem um grupo aberto, a orelha é do grupo e o assunto abre a linha da data', async () => {
    await show(note());
    expect(ear()).toBe('Trabalho');
    expect(el.querySelector('.meta .assunto')!.textContent).toContain('Dailys');
  });

  it('a música tem sempre o artista na orelha', async () => {
    const music = sanitizeReview({
      id: 'mvisao01',
      kind: 'musicas',
      game: { name: 'Disco', coverUrl: null, source: 'manual' },
      scores: { envolvimento: 8, letra: 8, vocal: 8, instrumental: 8 },
      status: 'finalizado',
      category: 'Artista',
      completedAt: '2026-10-01',
      createdAt: '2026-10-01T10:00:00.000Z',
    })!;
    await show(music, { subjectEar: true });
    expect(ear()).toBe('Artista');
  });
});
