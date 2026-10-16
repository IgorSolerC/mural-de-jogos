import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fingerprint, kanbanOf, kanbanToSync } from './cloud-sync';
import {
  KanbanBoard,
  KanbanState,
  addColumn,
  addTrait,
  cardsIn,
  doneChange,
  mergeKanban,
  moveColumn,
  newBoard,
  placeCard,
  removeColumn,
  removeTrait,
  sanitizeBoard,
  sanitizeKanban,
  setImportance,
  toggleTrait,
  updateColumn,
} from './kanban';
import { KanbanActions } from './kanban-actions';
import { KANBAN_KEY, KanbanStore } from './kanban-store';
import { Review, isDone, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Toasts } from '../ui/toast';

/** Os quadros Kanban das anotações: o formato, as mudanças, a junção entre aparelhos e o que finaliza. */

const T0 = '2026-10-16T10:00:00.000Z';
const T1 = '2026-10-16T11:00:00.000Z';
const T2 = '2026-10-16T12:00:00.000Z';

/** Um quadro com as colunas de id conhecido: afazer, fazendo, feito (a que finaliza). */
function board(id = 'qtrabalho', at = T0): KanbanBoard {
  return {
    id,
    name: 'Trabalho',
    at,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'fazendo', name: 'Fazendo', icon: 'lapis', color: 'amarelo', finishes: false },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    traits: [],
    cards: [],
  };
}

const notesIn = (b: KanbanBoard, col: string) => cardsIn(b, col).map((c) => c.note);

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

describe('Kanban', () => {
  describe('o quadro', () => {
    it('nasce com A fazer, Fazendo e Feito, e só Feito finaliza', () => {
      const b = newBoard('  Projeto   da faculdade ', T0);
      expect(b.name).toBe('Projeto da faculdade');
      expect(b.columns.map((c) => [c.name, c.finishes])).toEqual([
        ['A fazer', false],
        ['Fazendo', false],
        ['Feito', true],
      ]);
      expect(newBoard('   ', T0).name).toBe('Quadro');
    });

    it('põe a anotação na coluna, na posição pedida, e muda de lugar sem perder a importância', () => {
      let b = board();
      b = placeCard(b, 'n1', 'afazer', T1);
      b = placeCard(b, 'n2', 'afazer', T1);
      b = placeCard(b, 'n3', 'afazer', T1, 0);
      expect(notesIn(b, 'afazer')).toEqual(['n3', 'n1', 'n2']);
      b = setImportance(b, 'n1', 'critico', T1);
      b = placeCard(b, 'n1', 'fazendo', T1);
      expect(notesIn(b, 'afazer')).toEqual(['n3', 'n2']);
      expect(notesIn(b, 'fazendo')).toEqual(['n1']);
      expect(b.cards.find((c) => c.note === 'n1')!.importance).toBe('critico');
      // dentro da mesma coluna: para baixo e para o fim
      b = placeCard(b, 'n3', 'afazer', T1, 1);
      expect(notesIn(b, 'afazer')).toEqual(['n2', 'n3']);
      // uma coluna que não existe não muda nada
      expect(placeCard(b, 'n9', 'nenhuma', T2)).toBe(b);
    });

    it('não sair do lugar não muda o quadro (nem a hora dele)', () => {
      const b = placeCard(placeCard(board(), 'n1', 'afazer', T1), 'n2', 'afazer', T1);
      expect(placeCard(b, 'n1', 'afazer', T2, 0)).toBe(b);
      expect(placeCard(b, 'n2', 'afazer', T2)).toBe(b);
    });

    it('toda mudança deixa o quadro mais novo, mesmo com o relógio atrasado', () => {
      const b = board('q', T2);
      const later = placeCard(b, 'n1', 'afazer', T0);
      expect(later.at > b.at).toBeTrue();
    });

    it('a coluna nova ganha uma cor que o quadro ainda não tem; mover e tirar coluna', () => {
      let b = board();
      const r = addColumn(b, 'Revisão', T1, 'fazendo');
      b = r.board;
      expect(b.columns.map((c) => c.name)).toEqual(['A fazer', 'Fazendo', 'Revisão', 'Feito']);
      expect(['cinza', 'amarelo', 'verde']).not.toContain(b.columns[2].color);
      b = moveColumn(b, r.id, 0, T1);
      expect(b.columns[0].name).toBe('Revisão');
      b = updateColumn(b, r.id, { name: 'Em revisão', icon: 'olho', finishes: true }, T1);
      expect(b.columns[0]).toEqual(jasmine.objectContaining({ name: 'Em revisão', icon: 'olho', finishes: true }));
    });

    it('tirar a coluna leva as anotações dela para o fim da outra, na ordem; o quadro nunca fica sem coluna', () => {
      let b = board();
      for (const [n, c] of [
        ['n1', 'afazer'],
        ['n2', 'fazendo'],
        ['n3', 'fazendo'],
      ])
        b = placeCard(b, n, c, T1);
      b = removeColumn(b, 'fazendo', 'afazer', T1);
      expect(b.columns.map((c) => c.id)).toEqual(['afazer', 'feito']);
      expect(notesIn(b, 'afazer')).toEqual(['n1', 'n2', 'n3']);
      b = removeColumn(b, 'afazer', null, T1);
      expect(b.cards).toEqual([]);
      expect(removeColumn(b, 'feito', null, T2)).toBe(b);
    });

    it('as características: o mesmo nome é a mesma, ligar e desligar, e tirar limpa as anotações', () => {
      let b = placeCard(board(), 'n1', 'afazer', T1);
      const a = addTrait(b, 'Correção', T1);
      b = a.board;
      const again = addTrait(b, '  correcao ', T1);
      expect(again.id).toBe(a.id);
      expect(b.traits.length).toBe(1);
      b = toggleTrait(b, 'n1', a.id, T1);
      expect(b.cards[0].traits).toEqual([a.id]);
      b = toggleTrait(b, 'n1', a.id, T1);
      expect(b.cards[0].traits).toEqual([]);
      b = toggleTrait(b, 'n1', a.id, T1);
      b = removeTrait(b, a.id, T1);
      expect(b.traits).toEqual([]);
      expect(b.cards[0].traits).toEqual([]);
    });

    it('chegar numa coluna que finaliza finaliza; sair dela para uma que não finaliza abre de novo', () => {
      const b = board();
      expect(doneChange(b, 'afazer', 'feito')).toBe('finalizar');
      expect(doneChange(b, null, 'feito')).toBe('finalizar');
      expect(doneChange(b, 'feito', 'fazendo')).toBe('abrir');
      expect(doneChange(b, 'afazer', 'fazendo')).toBeNull();
      expect(doneChange(b, null, 'afazer')).toBeNull();
    });
  });

  describe('o que vem guardado ou da nuvem', () => {
    it('fica só com o que é conhecido: nada sem coluna, sem característica ou repetido', () => {
      const raw = {
        ...board(),
        name: 'x'.repeat(90),
        columns: [...board().columns, { id: 'afazer', name: 'De novo' }, { id: '', name: 'Sem id' }, { id: 'nova', icon: 'nave', color: 'neon', finishes: 'sim' }],
        traits: [{ id: 't1', name: 'Correção', color: 'azul' }, { id: 't2', name: '' }, { id: 't3', name: 'Cor estranha', color: 'dourada' }],
        cards: [
          { note: 'n1', column: 'afazer', importance: 'critico', traits: ['t1', 't1', 'tsumiu'] },
          { note: 'n1', column: 'feito' },
          { note: 'n2', column: 'naoexiste' },
          { note: 'n3', column: 'nova', importance: 'urgentissimo' },
        ],
      };
      const b = sanitizeBoard(raw)!;
      expect(b.name.length).toBe(40);
      expect(b.columns.map((c) => c.id)).toEqual(['afazer', 'fazendo', 'feito', 'nova']);
      expect(b.columns[3]).toEqual({ id: 'nova', name: 'Coluna', icon: 'circulo', color: 'cinza', finishes: false });
      expect(b.traits.map((t) => [t.id, t.color])).toEqual([
        ['t1', 'azul'],
        ['t3', 'azul'],
      ]);
      expect(b.cards).toEqual([
        { note: 'n1', column: 'afazer', importance: 'critico', traits: ['t1'] },
        { note: 'n3', column: 'nova', importance: null, traits: [] },
      ]);
      expect(sanitizeBoard({ id: 'q', at: 'ontem' })).toBeNull();
      expect(sanitizeBoard({ id: 'q', at: T0 })!.columns.length).toBe(3);
    });

    it('um quadro apagado depois da última mudança dele não volta', () => {
      const st = sanitizeKanban({ boards: [board('qa', T0), board('qb', T2)], removed: { qa: T1, qb: T1, '': T1, qc: 'nunca' } });
      expect(st.boards.map((b) => b.id)).toEqual(['qb']);
      expect(st.removed).toEqual({ qa: T1, qb: T1 });
      expect(sanitizeKanban('lixo')).toEqual({ boards: [], removed: {} });
    });
  });

  describe('a junção de dois aparelhos', () => {
    it('cada quadro vem de quem o mudou por último; os dos dois lados ficam', () => {
      const here: KanbanState = { boards: [board('qa', T1), board('qb', T0)], removed: {} };
      const there: KanbanState = { boards: [{ ...board('qb', T2), name: 'Mudado lá' }, { ...board('qa', T0), name: 'Velho' }, board('qc', T0)], removed: {} };
      const m = mergeKanban(here, there);
      expect(m.boards.map((b) => [b.id, b.name])).toEqual([
        ['qa', 'Trabalho'],
        ['qb', 'Mudado lá'],
        ['qc', 'Trabalho'],
      ]);
    });

    it('apagar num aparelho apaga no outro, a não ser que lá ele tenha mudado depois', () => {
      const here: KanbanState = { boards: [board('qa', T0), board('qb', T2)], removed: {} };
      const there: KanbanState = { boards: [], removed: { qa: T1, qb: T1 } };
      const m = mergeKanban(here, there);
      expect(m.boards.map((b) => b.id)).toEqual(['qb']);
      expect(m.removed).toEqual({ qa: T1, qb: T1 });
      // e a junção ao contrário dá o mesmo
      expect(mergeKanban(there, here).boards.map((b) => b.id)).toEqual(['qb']);
    });

    it('na nuvem: vai só com algum quadro (o mural sem eles mantém a impressão) e muda a impressão', async () => {
      const empty: KanbanState = { boards: [], removed: {} };
      expect(kanbanToSync(empty)).toBeNull();
      const st: KanbanState = { boards: [board()], removed: {} };
      expect(kanbanToSync(st)).toBe(st);
      expect(kanbanToSync({ boards: [], removed: { qa: T0 } })).not.toBeNull();
      const doc = { reviews: [], drafts: [], wishes: [], deleted: { reviews: {}, drafts: {}, wishes: {} } };
      expect(await fingerprint(doc, null, null, null, null, null, null)).toBe(await fingerprint(doc));
      expect(await fingerprint(doc, null, null, null, null, null, st)).not.toBe(await fingerprint(doc));
      expect(kanbanOf({ kanban: st })).toEqual(st);
      expect(kanbanOf({})).toBeNull();
    });
  });

  describe('no site', () => {
    let store: ReviewStore;
    let kanban: KanbanStore;
    let actions: KanbanActions;

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
      kanban = TestBed.inject(KanbanStore);
      actions = TestBed.inject(KanbanActions);
      store.reviews.set([note('nlogin01', 'Corrigir o login'), note('nfeita01', 'Deploy', { doneAt: '2026-10-05T10:00:00.000Z' })]);
      kanban.state.set({ boards: [board('qtrabalho')], removed: {} });
    });
    afterEach(() => localStorage.clear());

    it('guarda os quadros neste navegador e cria, apaga e devolve um quadro', () => {
      const id = kanban.create('Faculdade');
      TestBed.tick();
      expect(JSON.parse(localStorage.getItem(KANBAN_KEY)!).boards.map((b: KanbanBoard) => b.name)).toEqual(['Trabalho', 'Faculdade']);
      const b = kanban.get(id)!;
      kanban.remove(id);
      expect(kanban.get(id)).toBeUndefined();
      expect(kanban.state().removed[id]).toBeTruthy();
      kanban.restore(b, 0);
      expect(kanban.boards().map((x) => x.name)).toEqual(['Faculdade', 'Trabalho']);
      expect(kanban.state().removed[id]).toBeUndefined();
    });

    it('levar para Feito finaliza a anotação; o Desfazer devolve o lugar e abre de novo', () => {
      actions.move('qtrabalho', 'nlogin01', 'afazer');
      expect(isDone(store.get('nlogin01')!)).toBeFalse();
      actions.move('qtrabalho', 'nlogin01', 'feito');
      expect(isDone(store.get('nlogin01')!)).toBeTrue();
      const toast = TestBed.inject(Toasts).current()!;
      expect(toast.text).toContain('finalizada em Feito');
      toast.action!.run();
      expect(isDone(store.get('nlogin01')!)).toBeFalse();
      expect(notesIn(kanban.get('qtrabalho')!, 'afazer')).toEqual(['nlogin01']);
    });

    it('tirar de Feito para outra coluna abre a anotação de novo; entre colunas comuns, nada muda', () => {
      kanban.update('qtrabalho', (b, at) => placeCard(b, 'nfeita01', 'feito', at));
      actions.move('qtrabalho', 'nfeita01', 'fazendo');
      expect(isDone(store.get('nfeita01')!)).toBeFalse();
      expect(TestBed.inject(Toasts).current()!.text).toContain('aberta de novo em Fazendo');
      actions.move('qtrabalho', 'nfeita01', 'afazer');
      expect(isDone(store.get('nfeita01')!)).toBeFalse();
    });

    it('tirar do quadro deixa a anotação no mural, e o Desfazer a põe de volta com o que ela tinha', () => {
      kanban.update('qtrabalho', (b, at) => setImportance(placeCard(b, 'nlogin01', 'fazendo', at), 'nlogin01', 'importante', at));
      actions.remove(kanban.get('qtrabalho')!, 'nlogin01');
      expect(kanban.get('qtrabalho')!.cards).toEqual([]);
      expect(store.get('nlogin01')).toBeTruthy();
      TestBed.inject(Toasts).current()!.action!.run();
      expect(kanban.get('qtrabalho')!.cards).toEqual([{ note: 'nlogin01', column: 'fazendo', importance: 'importante', traits: [] }]);
    });

    it('a anotação nova pedida de uma coluna é reclamada uma vez só', () => {
      kanban.pending.set({ board: 'qtrabalho', column: 'fazendo' });
      expect(kanban.claim()).toEqual({ board: 'qtrabalho', column: 'fazendo' });
      expect(kanban.claim()).toBeNull();
      kanban.pending.set({ board: 'qtrabalho', column: 'sumiu' });
      expect(kanban.claim()).toBeNull();
    });

    it('a junção com a nuvem só troca o estado quando muda algo', () => {
      const before = kanban.state();
      kanban.merge({ boards: [board('qtrabalho', '2020-01-01T00:00:00.000Z')], removed: {} });
      expect(kanban.state()).toBe(before);
      kanban.merge({ boards: [board('qoutro', T0)], removed: {} });
      expect(kanban.boards().map((b) => b.id)).toEqual(['qtrabalho', 'qoutro']);
    });
  });
});
