import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KIND_PROFILES } from './kinds';
import { Review, rankOrder, sanitizeReview, withRank } from './review';
import { ReviewStore } from './review-store';
import { Mural } from './mural';
import { NotePin } from './note-pin';
import { Toasts } from '../ui/toast';
import { WallView, groupWall, sortWall } from './wall-view';

/** Fixadas no topo, comuns, sub-notas no fim: o lugar de cada anotação no mural. */

const note = (id: string, title: string, day: string, extra: Record<string, unknown> = {}): Review => ({
  ...sanitizeReview({ kind: 'anotacoes', game: { name: title }, completedAt: day, createdAt: `${day}T10:00:00.000Z`, ...extra })!,
  id,
});

const list = [
  note('nsub00001', 'Detalhes do console', '2026-10-06', { noteRank: 'sub' }),
  note('ncomum001', 'Ideias', '2026-10-05'),
  note('nfixa0001', 'A fazeres', '2026-10-01', { noteRank: 'fixada' }),
  note('ncomum002', 'Viagem', '2026-10-07'),
  note('nfixa0002', 'Compras', '2026-09-20', { noteRank: 'fixada' }),
];
const profile = KIND_PROFILES.anotacoes;
const names = (rs: readonly Review[]) => rs.map((r) => r.game.name);

describe('o lugar da anotação no mural', () => {
  it('guarda fixada e sub; o resto é comum, sem o campo', () => {
    expect(list.map((r) => r.noteRank ?? null)).toEqual(['sub', null, 'fixada', null, 'fixada']);
    expect('noteRank' in note('nx000001', 'X', '2026-10-01', { noteRank: 'topo' })).toBeFalse();
    expect(list.map(rankOrder)).toEqual([2, 1, 0, 1, 0]);
    const unpinned = withRank(list[2], null, '2026-10-08T00:00:00.000Z');
    expect('noteRank' in unpinned).toBeFalse();
    expect(unpinned.updatedAt).toBe('2026-10-08T00:00:00.000Z');
  });

  it('Prioridade: fixadas, comuns e sub-notas, cada seção das mais recentes para as mais antigas', () => {
    const order = { sort: 'prioridade' as const, key: 'final' as const, direction: 'desc' as const, profile };
    const sorted = sortWall(list, order);
    expect(names(sorted)).toEqual(['A fazeres', 'Compras', 'Viagem', 'Ideias', 'Detalhes do console']);
    expect(groupWall(sorted, order).map((g) => [g.label, g.reviews.length])).toEqual([
      ['Fixadas', 2],
      ['Anotações', 2],
      ['Sub-notas', 1],
    ]);
  });

  it('em qualquer outra ordem, as fixadas continuam numa seção no topo', () => {
    const order = { sort: 'alfabetica' as const, key: 'final' as const, direction: 'asc' as const, profile };
    const groups = groupWall(sortWall(list, order), order);
    expect(groups[0].label).toBe('Fixadas');
    expect(names(groups[0].reviews)).toEqual(['A fazeres', 'Compras']);
    expect(groups.slice(1).map((g) => g.label)).toEqual(['D', 'I', 'V']);
  });

  describe('no seu mural', () => {
    let store: ReviewStore;
    let view: WallView;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
      view = TestBed.inject(WallView);
      store.reviews.set(list);
    });

    afterEach(() => localStorage.clear());

    it('a ordem de sempre das anotações é Prioridade, à parte da ordem dos outros murais', () => {
      const mural = TestBed.inject(Mural);
      mural.kind.set('anotacoes');
      expect(view.shownSort()).toBe('prioridade');
      view.setSort('alfabetica');
      expect(view.direction()).toBe('asc');
      mural.kind.set('jogos');
      expect(view.shownSort()).toBe('data');
      // a direção também é de cada um: A a Z nas anotações não vira "mais antigas primeiro" nos jogos
      expect(view.direction()).toBe('desc');
      mural.kind.set('anotacoes');
      expect(view.shownSort()).toBe('alfabetica');
    });

    it('o alfinete fixa e desafixa, com Desfazer', () => {
      TestBed.inject(Mural).kind.set('anotacoes');
      const pin = TestBed.inject(NotePin);
      pin.set('ncomum001', true);
      expect(store.get('ncomum001')!.noteRank).toBe('fixada');
      expect(view.groups()[0].reviews.map((r) => r.id)).toContain('ncomum001');
      pin.set('nsub00001', true);
      pin.set('nsub00001', false);
      // desafixada, vira comum
      expect(store.get('nsub00001')!.noteRank).toBeUndefined();
      TestBed.inject(Toasts).current()!.action!.run();
      expect(store.get('nsub00001')!.noteRank).toBe('fixada');
    });
  });
});
