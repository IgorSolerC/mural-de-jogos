import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CardLook, lookFrom, withLook } from './card-look';
import { undoKanban } from './api-requests-kanban';
import { KanbanBoard, MAX_CARDS, boardIdFor, dependentsOf, dependsOn, dressBoard, restoredBoard, sortAllColumns } from './kanban';
import { KanbanActions } from './kanban-actions';
import { KanbanDeps } from './kanban-deps';
import { KanbanDresser } from './kanban-dresser';
import { KanbanStore } from './kanban-store';
import { Review, isDone, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Toasts } from '../ui/toast';

/**
 * Revisão das regras do cartão no Kanban (code-review): o card padrão depois do Desfazer, a anotação
 * que não coube no quadro, as dependências apagadas e a roda.
 */

const T0 = '2026-11-01T10:00:00.000Z';
const ID = boardIdFor('trabalho');
const VERMELHO: CardLook = { stock: 'vermelho', pattern: 'gatinhos', scribble: 'moldura', scribbleSeed: 7 };

function board(): KanbanBoard {
  return {
    id: ID,
    category: 'trabalho',
    at: T0,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'bloq', name: 'Bloqueado', icon: 'bloqueio', color: 'vermelho', finishes: false, look: VERMELHO, dresses: true },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true, look: { stock: 'verde' }, dresses: true },
    ],
    cards: [
      { note: 'n1', column: 'afazer', importance: null },
      { note: 'n2', column: 'bloq', importance: null },
    ],
  };
}

describe('Kanban: revisão das regras do cartão', () => {
  let store: ReviewStore;
  let kanban: KanbanStore;
  let show: jasmine.Spy;
  const note = (id: string, extra: Record<string, unknown> = {}): Review =>
    ({ ...sanitizeReview({ kind: 'anotacoes', game: { name: id }, category: 'Trabalho', completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!, id });
  const look = (id: string) => lookFrom(store.get(id)!);
  const undo = () => show.calls.mostRecent().args[1]!.run();

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    store.reviews.set([note('n1', { stock: 'azul' }), note('n2', { stock: 'amarelo' }), note('n3', { stock: 'rosa' })]);
    kanban = TestBed.inject(KanbanStore);
    TestBed.inject(KanbanDresser);
    show = spyOn(TestBed.inject(Toasts), 'show').and.callThrough();
    kanban.state.set({ boards: [board()], removed: {}, legacy: [] });
    TestBed.tick();
  });
  afterEach(() => localStorage.clear());

  describe('o card padrão depois do Desfazer', () => {
    it('o Desfazer do quadro inteiro (a ordem em todas as colunas) não repinta a vestida que a pessoa repintou', () => {
      expect(look('n2')).toEqual(VERMELHO);
      // a pessoa repinta no editor a anotação vestida, e ela fica como deixou
      store.update({ ...withLook(store.get('n2')!, { stock: 'azul' }), updatedAt: '2026-11-01T11:00:00.000Z' });
      TestBed.tick();
      expect(look('n2')).toEqual({ stock: 'azul' });
      const before = kanban.get(ID)!;
      kanban.update(ID, (b, at) => sortAllColumns(b, [{ by: 'titulo' }], at));
      kanban.restore(before);
      TestBed.tick();
      expect(kanban.get(ID)!.columns.every((c) => !c.sort)).toBeTrue();
      expect(look('n2')).toEqual({ stock: 'azul' });
      expect(kanban.get(ID)!.cards.find((c) => c.note === 'n2')!.dress).toEqual({ col: 'bloq', v: jasmine.any(String), own: { stock: 'amarelo' } });
    });

    it('restoredBoard: só a vestida que mudou ganha a marca por refazer; a de vestido igual fica como estava', () => {
      const vestido = dressBoard(board(), new Map([['n2', { id: 'n2', category: 'Trabalho', stock: 'amarelo' as const }]]), T0).board;
      const agora = { ...vestido, cards: [...vestido.cards, { note: 'n3', column: 'bloq', importance: null }] };
      const volta = restoredBoard(vestido, agora);
      expect(volta.cards.find((c) => c.note === 'n2')).toEqual(vestido.cards.find((c) => c.note === 'n2')!);
      // a mesma marca, mas em outra coluna agora (o vestidor ainda não passou): por refazer
      const andou = { ...vestido, cards: vestido.cards.map((c) => (c.note === 'n2' ? { ...c, column: 'afazer' } : c)) };
      expect(restoredBoard(vestido, andou).cards.find((c) => c.note === 'n2')!.dress).toEqual({ col: '', v: '', own: { stock: 'amarelo' } });
    });

    it('o Desfazer da que veio de fora para a coluna que finaliza e veste: sai do quadro com o visual de antes', () => {
      TestBed.inject(KanbanActions).move(ID, 'n3', 'feito');
      TestBed.tick();
      expect(look('n3')).toEqual({ stock: 'verde' });
      expect(isDone(store.get('n3')!)).toBeTrue();
      undo();
      TestBed.tick();
      expect(kanban.get(ID)!.cards.some((c) => c.note === 'n3')).toBeFalse();
      expect(isDone(store.get('n3')!)).toBeFalse();
      expect(look('n3')).toEqual({ stock: 'rosa' });
    });

    it('o mesmo pelo Desfazer de um pedido da API (cartao.mover de fora do quadro)', () => {
      kanban.update(ID, (b, at) => ({ ...b, at, cards: [...b.cards, { note: 'n3', column: 'bloq', importance: null }] }));
      TestBed.tick();
      expect(look('n3')).toEqual(VERMELHO);
      undoKanban(kanban, store, { op: 'cartao.mover', alvo: 'n3', antes: { quadro: ID, card: null, index: -1, done: false } }, '2026-11-01T12:00:00.000Z');
      TestBed.tick();
      expect(kanban.get(ID)!.cards.some((c) => c.note === 'n3')).toBeFalse();
      expect(look('n3')).toEqual({ stock: 'rosa' });
    });
  });

  describe('o quadro cheio', () => {
    const full = (): KanbanBoard => {
      const b = board();
      const filler = Array.from({ length: MAX_CARDS - b.cards.length }, (_, i) => ({ note: `cheio${i}`, column: 'afazer', importance: null }));
      return { ...b, cards: [...b.cards, ...filler] };
    };

    it('a anotação que não coube não é finalizada, nem ganha bilhete', () => {
      kanban.state.set({ boards: [full()], removed: {}, legacy: [] });
      TestBed.tick();
      show.calls.reset();
      TestBed.inject(KanbanActions).move(ID, 'n3', 'feito');
      TestBed.tick();
      expect(kanban.get(ID)!.cards.some((c) => c.note === 'n3')).toBeFalse();
      expect(isDone(store.get('n3')!)).toBeFalse();
      expect(show).not.toHaveBeenCalled();
    });

    it('arrastadas juntas: só as que entraram são finalizadas', () => {
      const b = full();
      kanban.state.set({ boards: [{ ...b, cards: b.cards.slice(0, MAX_CARDS - 1) }], removed: {}, legacy: [] });
      store.update(note('n4', { stock: 'lilas' }));
      TestBed.tick();
      TestBed.inject(KanbanActions).moveMany(ID, ['n3', 'n4'], 'feito', null);
      TestBed.tick();
      expect(kanban.get(ID)!.cards.length).toBe(MAX_CARDS);
      expect(isDone(store.get('n3')!)).toBeTrue();
      expect(isDone(store.get('n4')!)).toBeFalse();
      expect(show.calls.mostRecent().args[0]).toBe('1 anotação finalizada em Feito');
    });

    it('o bilhete de uma só levada diz no singular', () => {
      store.update(note('n4', { category: 'Estudos' }));
      TestBed.inject(KanbanActions).moveMany(ID, ['n1', 'n4'], 'bloq', null);
      expect(show.calls.mostRecent().args[0]).toBe('1 anotação levada para Bloqueado');
    });
  });

  describe('as dependências', () => {
    it('pôr as dependências tira as apagadas: uma nova cabe no limite', () => {
      const deps = TestBed.inject(KanbanDeps);
      kanban.update(ID, (b, at) => ({ ...b, at, cards: b.cards.map((c) => (c.note === 'n1' ? { ...c, deps: ['sumiu01', 'n2'] } : c)) }));
      deps.add('n1', 'n3');
      expect(deps.idsOf('n1')).toEqual(['n2', 'n3']);
    });

    it('as que fazem roda: dependentsOf diz o mesmo que dependsOn, também com uma roda vinda da nuvem', () => {
      const b: KanbanBoard = {
        ...board(),
        cards: [
          { note: 'a', column: 'afazer', importance: null, deps: ['b'] },
          { note: 'b', column: 'afazer', importance: null, deps: ['c'] },
          { note: 'c', column: 'afazer', importance: null, deps: ['a'] },
          { note: 'd', column: 'afazer', importance: null, deps: ['c'] },
          { note: 'e', column: 'afazer', importance: null },
        ],
      };
      for (const n of ['a', 'b', 'c', 'd', 'e']) {
        const set = dependentsOf([b], n);
        for (const x of ['a', 'b', 'c', 'd', 'e']) expect(set.has(x)).withContext(`${x} depende de ${n}`).toBe(dependsOn([b], x, n));
      }
    });

    it('o seletor esconde ela, as que já são (também as escolhidas no editor, ainda sem salvar) e as da roda', () => {
      const deps = TestBed.inject(KanbanDeps);
      kanban.update(ID, (b, at) => ({ ...b, at, cards: b.cards.map((c) => (c.note === 'n2' ? { ...c, deps: ['n1'] } : c)) }));
      expect(deps.excluded('n1').sort()).toEqual(['n1', 'n2']);
      expect(deps.excluded('n1', ['n3']).sort()).toEqual(['n1', 'n2', 'n3']);
    });
  });
});
