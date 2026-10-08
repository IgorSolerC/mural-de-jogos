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

  it('nas outras ordens, as fixadas seguem a ordem, no meio das outras', () => {
    const order = { sort: 'alfabetica' as const, key: 'final' as const, direction: 'asc' as const, profile };
    const groups = groupWall(sortWall(list, order), order);
    expect(groups.map((g) => g.label)).toEqual(['A', 'C', 'D', 'I', 'V']);
    expect(names(sortWall(list, { ...order, sort: 'data', direction: 'desc' }))).toEqual([
      'Viagem',
      'Detalhes do console',
      'Ideias',
      'A fazeres',
      'Compras',
    ]);
  });

  it('com "Fixadas no topo", as fixadas ficam numa seção no topo em qualquer ordem', () => {
    const order = { sort: 'alfabetica' as const, key: 'final' as const, direction: 'asc' as const, profile, pinnedFirst: true };
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
      pin.set('ncomum001', false);
      // a comum desafixada volta a ser comum
      expect(store.get('ncomum001')!.noteRank).toBeUndefined();
      pin.set('nsub00001', true);
      expect(store.get('nsub00001')!.pinnedSub).toBeTrue();
      pin.set('nsub00001', false);
      // a sub-nota desafixada volta a ser sub-nota
      expect(store.get('nsub00001')!.noteRank).toBe('sub');
      expect(store.get('nsub00001')!.pinnedSub).toBeUndefined();
      TestBed.inject(Toasts).current()!.action!.run();
      expect(store.get('nsub00001')!.noteRank).toBe('fixada');
      expect(store.get('nsub00001')!.pinnedSub).toBeTrue();
    });

    it('fixada, a data vai inteira (a seção Fixadas não tem a etiqueta do mês); a contagem do mural não conta as finalizadas', () => {
      const mural = TestBed.inject(Mural);
      mural.kind.set('anotacoes');
      store.reviews.update((l) => [...l, note('nfeita001', 'Feita', '2026-10-02', { doneAt: '2026-10-03T00:00:00.000Z' })]);
      expect(mural.count()).toBe(6);
      expect(mural.openCount()).toBe(5);
      expect(mural.counts().anotacoes).toBe(5);
    });

    it('a busca acha pela categoria e pelas tags; com "#", só pelas tags', () => {
      TestBed.inject(Mural).kind.set('anotacoes');
      store.reviews.set([
        note('nbusca001', 'Ajustes do site', '2026-10-01', { category: 'Trabalho', tags: ['Bugfix'] }),
        note('nbusca002', 'Bugfix na cozinha', '2026-10-01', { category: 'Casa' }),
      ]);
      const found = (q: string) => {
        view.query.set(q);
        return view.visible().map((r) => r.game.name).sort();
      };
      expect(found('trabalho')).toEqual(['Ajustes do site']);
      expect(found('bugfix')).toEqual(['Ajustes do site', 'Bugfix na cozinha']);
      expect(found('#bugfix')).toEqual(['Ajustes do site']);
    });
  });
});
