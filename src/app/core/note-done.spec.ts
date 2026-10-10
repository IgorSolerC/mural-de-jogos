import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Review, isDone, sanitizeReview, storedNote, withDone } from './review';
import { ReviewStore } from './review-store';
import { Mural } from './mural';
import { WallView } from './wall-view';
import { NoteDone } from './note-done';
import { Toasts } from '../ui/toast';
import { Confirm } from '../ui/confirm';

/** O check da anotação inteira: o dia fica guardado, e a finalizada sai do mural. */

const note = (id: string, title: string, extra: Record<string, unknown> = {}): Review =>
  ({
    ...sanitizeReview({
      kind: 'anotacoes',
      game: { name: title },
      completedAt: '2026-10-01',
      createdAt: '2026-10-01T10:00:00.000Z',
      updatedAt: '2026-10-01T10:00:00.000Z',
      ...extra,
    })!,
    id,
  });

describe('anotação finalizada', () => {
  it('guarda o dia do check (ISO), joga fora o que não é data, e só nas anotações', () => {
    const done = note('n1', 'Mercado', { doneAt: '2026-10-07T15:30:00.000Z' });
    expect(done.doneAt).toBe('2026-10-07T15:30:00.000Z');
    expect(isDone(done)).toBeTrue();
    expect(storedNote(done).doneAt).toBe('2026-10-07T15:30:00.000Z');
    expect('doneAt' in note('n2', 'Lixo', { doneAt: 'ontem' })).toBeFalse();
    expect('doneAt' in note('n3', 'Sem', {})).toBeFalse();
    const game = sanitizeReview({ game: { name: 'Hades' }, scores: { historia: 8, diversao: 8, jogabilidade: 8, visual: 8 }, doneAt: '2026-10-07T15:30:00.000Z' })!;
    expect('doneAt' in game).toBeFalse();
  });

  it('o check põe o dia e o tira, mudando o updatedAt', () => {
    const n = note('n1', 'Mercado');
    const now = '2026-10-07T12:00:00.000Z';
    const done = withDone(n, true, now);
    expect([done.doneAt, done.updatedAt]).toEqual([now, now]);
    const open = withDone(done, false, '2026-10-08T00:00:00.000Z');
    expect('doneAt' in open).toBeFalse();
    expect(open.updatedAt).toBe('2026-10-08T00:00:00.000Z');
  });

  describe('no mural', () => {
    let store: ReviewStore;
    let view: WallView;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
      view = TestBed.inject(WallView);
      TestBed.inject(Mural).kind.set('anotacoes');
      store.reviews.set([note('naberta1', 'A fazeres'), note('nfeita01', 'Mercado', { doneAt: '2026-10-05T10:00:00.000Z' })]);
    });

    afterEach(() => localStorage.clear());

    const shown = () => view.visible().map((r) => r.game.name);

    it('a finalizada fica fora (e fora da conta); "Mostrar finalizadas" traz de volta e fica guardado', () => {
      expect(shown()).toEqual(['A fazeres']);
      expect([view.pool().length, view.doneCount(), view.hiddenDone()]).toEqual([1, 1, 1]);
      expect(view.isFiltered()).toBeFalse();
      view.showDone.set(true);
      expect(shown()).toEqual(['A fazeres', 'Mercado']);
      expect(view.hiddenDone()).toBe(0);
      TestBed.tick();
      expect(JSON.parse(localStorage.getItem('mural-de-jogos:vista:v1')!).showDone).toBeTrue();
    });

    it('o check fica no mural o tempo do carimbo; Desfazer devolve a anotação sem o check', () => {
      const done = TestBed.inject(NoteDone);
      done.set('naberta1', true);
      const saved = store.get('naberta1')!;
      expect(isDone(saved)).toBeTrue();
      expect(Date.parse(saved.doneAt!)).toBeGreaterThan(Date.parse('2026-01-01'));
      // o carimbo está batendo: continua à mostra
      expect(shown()).toContain('A fazeres');
      view.release('naberta1');
      expect(shown()).toEqual([]);
      const toast = TestBed.inject(Toasts).current()!;
      expect(toast.text).toContain('“A fazeres” finalizada');
      toast.action!.run();
      expect(isDone(store.get('naberta1')!)).toBeFalse();
      expect(shown()).toEqual(['A fazeres']);
    });
  });
  it('finalizar as ligadas pela tarefa: o Desfazer só reabre as que esta pergunta finalizou', async () => {
    localStorage.clear();
    let done!: NoteDone;
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        // enquanto a pergunta está aberta, "Mercado" é finalizada por outro caminho
        { provide: Confirm, useValue: { ask: async () => (done.set('nmerca01', true, { quiet: true }), true) } },
      ],
    });
    const store = TestBed.inject(ReviewStore);
    done = TestBed.inject(NoteDone);
    const text = '- [x] [[A fazeres]] e [[Mercado]] e [[Estudos]]';
    store.reviews.set([note('norige01', 'Origem', { text }), note('naberta1', 'A fazeres'), note('nmerca01', 'Mercado'), note('nestud01', 'Estudos')]);
    await done.offerLinked('norige01', text, 0);
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('2 anotações finalizadas.');
    toast.action!.run();
    expect(isDone(store.get('naberta1')!)).toBeFalse();
    expect(isDone(store.get('nestud01')!)).toBeFalse();
    expect(isDone(store.get('nmerca01')!)).toBeTrue();
    localStorage.clear();
  });
});
