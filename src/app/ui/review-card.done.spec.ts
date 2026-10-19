import { provideZonelessChangeDetection } from '@angular/core';
import { ComponentFixture, TestBed } from '@angular/core/testing';
import { boardIdFor } from '../core/kanban';
import { KanbanStore } from '../core/kanban-store';
import { Review, isDone, sanitizeReview } from '../core/review';
import { ReviewStore } from '../core/review-store';
import { Confirm } from './confirm';
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

/** O check da ficha no mural: com dependência ainda aberta no quadro, pergunta antes de finalizar. */
describe('o check da ficha com dependências', () => {
  it('pergunta antes; sem o sim, continua aberta; com o sim, finaliza', async () => {
    localStorage.clear();
    const answers: boolean[] = [false, true];
    const asked: string[] = [];
    TestBed.configureTestingModule({
      imports: [ReviewCard],
      providers: [provideZonelessChangeDetection(), { provide: Confirm, useValue: { ask: async (o: { text: string }) => (asked.push(o.text), answers.shift()) } }],
    });
    const store = TestBed.inject(ReviewStore);
    const login = { ...note(''), id: 'nlogin01', category: 'Trabalho', game: { name: 'Login', coverUrl: null, source: 'manual' as const } };
    const sync = { ...note(''), id: 'nsync001', category: 'Trabalho', game: { name: 'Sincronizar', coverUrl: null, source: 'manual' as const } };
    store.reviews.set([login, sync]);
    const at = '2026-10-19T10:00:00.000Z';
    TestBed.inject(KanbanStore).state.set({
      boards: [
        {
          id: boardIdFor('trabalho'),
          category: 'trabalho',
          at,
          columns: [{ id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false }],
          cards: [
            { note: 'nlogin01', column: 'afazer', importance: null, deps: ['nsync001'] },
            { note: 'nsync001', column: 'afazer', importance: null },
          ],
        },
      ],
      removed: {},
      legacy: [],
    });
    const fixture = TestBed.createComponent(ReviewCard);
    fixture.componentRef.setInput('review', store.get('nlogin01')!);
    fixture.componentRef.setInput('checkable', true);
    const el = fixture.nativeElement as HTMLElement;
    document.body.appendChild(el);
    await fixture.whenStable();
    const check = () => el.querySelector<HTMLButtonElement>('button.feito')!;
    check().click();
    await fixture.whenStable();
    expect(asked).toEqual(['“Login” depende de “Sincronizar”, que ainda não foi finalizada. Finalizar “Login” mesmo assim?']);
    expect(isDone(store.get('nlogin01')!)).toBeFalse();
    check().click();
    await fixture.whenStable();
    expect(isDone(store.get('nlogin01')!)).toBeTrue();
    expect(asked.length).toBe(2);
    el.remove();
    fixture.destroy();
    localStorage.clear();
  });
});
