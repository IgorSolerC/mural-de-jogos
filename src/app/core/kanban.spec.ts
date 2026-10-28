import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { fingerprint, kanbanOf, kanbanPrintOf, kanbanToSync, publicCategoryLooks } from './cloud-sync';
import { categoryColorHex, sanitizeCategoryLooks, tagColorHex, tagLookKey } from './category-looks';
import {
  FRESH_AT,
  KanbanBoard,
  KanbanState,
  addColumn,
  attachLegacy,
  belongs,
  boardCategories,
  boardIdFor,
  cardsIn,
  doneChange,
  freshBoard,
  liveCards,
  mergeKanban,
  moveBoardCategory,
  moveColumn,
  nextStop,
  placeCard,
  placeCards,
  removeColumn,
  resetBoard,
  sanitizeBoard,
  sanitizeKanban,
  setImportance,
  updateColumn,
} from './kanban';
import { KanbanActions } from './kanban-actions';
import { KANBAN_KEY, KanbanStore } from './kanban-store';
import { Review, isDone, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { Toasts } from '../ui/toast';

/** Os quadros Kanban das anotações: um por categoria, as mudanças, a junção, a conversão dos de antes e o que finaliza. */

const T0 = '2026-10-16T10:00:00.000Z';
const T1 = '2026-10-16T11:00:00.000Z';
const T2 = '2026-10-16T12:00:00.000Z';

/** O quadro de uma categoria, com as colunas de id conhecido: afazer, fazendo, feito (a que finaliza). */
function board(category = 'trabalho', at = T0): KanbanBoard {
  return {
    id: boardIdFor(category),
    category,
    at,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'fazendo', name: 'Fazendo', icon: 'lapis', color: 'amarelo', finishes: false },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    cards: [],
  };
}

const state = (boards: KanbanBoard[], removed: Record<string, string> = {}): KanbanState => ({ boards, removed, legacy: [] });

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

/** Um quadro de antes: nome livre, sem categoria, com características. */
function legacyBoard(id: string, name: string, cards: unknown[], traits: unknown[] = [], columns?: unknown[]) {
  return {
    id,
    name,
    at: T0,
    columns: columns ?? [
      { id: `${id}-a`, name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: `${id}-f`, name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    traits,
    cards,
  };
}

describe('Kanban', () => {
  describe('a seta de avançar', () => {
    const cols = (...skips: boolean[]) =>
      ['reworks', 'features', 'bugs', 'fazendo', 'entregue'].map((id, i) => ({ id, name: id, icon: 'circulo' as const, color: 'cinza' as const, finishes: false, ...(skips[i] ? { skip: true as const } : {}) }));

    it('sem colunas puladas, leva para a da direita; na última, para nenhuma', () => {
      const c = cols();
      expect(nextStop(c, 'reworks')?.id).toBe('features');
      expect(nextStop(c, 'fazendo')?.id).toBe('entregue');
      expect(nextStop(c, 'entregue')).toBeNull();
      expect(nextStop(c, 'naoexiste')).toBeNull();
    });

    it('passa direto pelas colunas puladas: de Reworks e de Features, direto para Fazendo', () => {
      const c = cols(true, true, true);
      expect(nextStop(c, 'reworks')?.id).toBe('fazendo');
      expect(nextStop(c, 'features')?.id).toBe('fazendo');
      expect(nextStop(c, 'bugs')?.id).toBe('fazendo');
      // a coluna pulada continua tendo a seta dela, e a primeira coluna pulada não muda nada
      expect(nextStop(cols(true), 'reworks')?.id).toBe('features');
    });

    it('sem coluna depois que a seta não pule, ela some', () => {
      const c = cols(false, false, false, false, true);
      expect(nextStop(c, 'fazendo')).toBeNull();
      expect(nextStop(c, 'bugs')?.id).toBe('fazendo');
    });
  });

  describe('o quadro de uma categoria', () => {
    it('o id sai da categoria (sem acento nem caixa), o mesmo em todo aparelho', () => {
      expect(boardIdFor('Trabalho')).toBe(boardIdFor('  trabalho '));
      expect(boardIdFor('Estudos')).toBe(boardIdFor('estudos'));
      expect(boardIdFor('Trabalho')).not.toBe(boardIdFor('Estudos'));
      expect(boardIdFor('Trabalho')).toMatch(/^kb[0-9a-f]{16}$/);
    });

    it('o quadro em que ninguém mexeu: as três colunas, ids que não mudam e a hora zero', () => {
      const a = freshBoard('Trabalho');
      const b = freshBoard('trabalho');
      expect(a).toEqual(b);
      expect(a.at).toBe(FRESH_AT);
      expect(a.category).toBe('trabalho');
      expect(a.columns.map((c) => [c.name, c.finishes])).toEqual([
        ['A fazer', false],
        ['Fazendo', false],
        ['Feito', true],
      ]);
      // qualquer quadro de verdade passa na frente dele na junção
      const real = placeCard(a, 'n1', a.columns[0].id, T0);
      expect(mergeKanban(state([a]), state([real])).boards[0]).toBe(real);
      expect(mergeKanban(state([real]), state([a])).boards[0]).toBe(real);
    });

    it('só as anotações da categoria são do quadro', () => {
      const b = board();
      expect(belongs(b, { category: 'Trabalho' })).toBeTrue();
      expect(belongs(b, { category: ' TRABALHO ' })).toBeTrue();
      expect(belongs(b, { category: 'Estudos' })).toBeFalse();
      expect(belongs(b, {})).toBeFalse();
      expect(belongs(b, undefined)).toBeFalse();
      let q = placeCard(b, 'n1', 'afazer', T1);
      q = placeCard(q, 'n2', 'afazer', T1);
      q = placeCard(q, 'n3', 'afazer', T1);
      const notes = new Map([
        ['n1', { category: 'Trabalho' }],
        ['n2', { category: 'Estudos' }],
      ]);
      // a que mudou de categoria e a que sumiu ficam guardadas, mas não aparecem
      expect(liveCards(q, notes).map((c) => c.note)).toEqual(['n1']);
    });

    it('as categorias com quadro: das maiores para as menores, de A a Z no empate, ou na ordem montada à mão', () => {
      const notes = [{ category: 'Estudos' }, { category: 'Trabalho' }, { category: 'trabalho' }, { category: 'Trabalho' }, { category: 'Casa' }, {}];
      expect(boardCategories(notes)).toEqual([
        { key: 'trabalho', label: 'Trabalho', notes: 3 },
        { key: 'casa', label: 'Casa', notes: 1 },
        { key: 'estudos', label: 'Estudos', notes: 1 },
      ]);
      expect(boardCategories(notes, ['estudos', 'trabalho']).map((c) => c.key)).toEqual(['estudos', 'trabalho', 'casa']);
      expect(boardCategories([{}, { category: '  ' }])).toEqual([]);
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
      // a hora em que ela foi posta no lugar vai junto (a junção de dois aparelhos olha para ela)
      expect(b.cards.find((c) => c.note === 'n1')).toEqual({ note: 'n1', column: 'fazendo', importance: 'critico', at: T1 });
      b = placeCard(b, 'n3', 'afazer', T1, 1);
      expect(notesIn(b, 'afazer')).toEqual(['n2', 'n3']);
      expect(placeCard(b, 'n9', 'nenhuma', T2)).toBe(b);
    });

    it('várias de uma vez: uma atrás da outra, na ordem dada, antes da que fica na coluna (ou no fim)', () => {
      let b = board();
      for (const [n, c] of [
        ['n1', 'afazer'],
        ['n2', 'afazer'],
        ['n3', 'fazendo'],
        ['n4', 'fazendo'],
        ['n5', 'feito'],
      ])
        b = placeCard(b, n, c, T1);
      const q = placeCards(b, ['n1', 'n3'], 'fazendo', T2, 'n4');
      expect(notesIn(q, 'afazer')).toEqual(['n2']);
      expect(notesIn(q, 'fazendo')).toEqual(['n1', 'n3', 'n4']);
      const end = placeCards(b, ['n4', 'n1'], 'feito', T2, null);
      expect(notesIn(end, 'feito')).toEqual(['n5', 'n4', 'n1']);
      // já estavam assim: nada muda
      expect(placeCards(b, ['n3', 'n4'], 'fazendo', T2, null)).toBe(b);
    });

    it('não sair do lugar não muda o quadro (nem a hora dele)', () => {
      const b = placeCard(placeCard(board(), 'n1', 'afazer', T1), 'n2', 'afazer', T1);
      expect(placeCard(b, 'n1', 'afazer', T2, 0)).toBe(b);
      expect(placeCard(b, 'n2', 'afazer', T2)).toBe(b);
    });

    it('toda mudança deixa o quadro mais novo, mesmo com o relógio atrasado', () => {
      const b = board('trabalho', T2);
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

    it('a mesma importância, a anotação fora do quadro ou a coluna no lugar em que já estava: nada muda (nem a hora)', () => {
      const b = setImportance(placeCard(board(), 'n1', 'afazer', T1), 'n1', 'medio', T1);
      expect(setImportance(b, 'n1', 'medio', T2)).toBe(b);
      expect(setImportance(b, 'n9', 'critico', T2)).toBe(b);
      expect(setImportance(b, 'n1', 'critico', T2).cards[0]).toEqual(jasmine.objectContaining({ importance: 'critico', at: T2 }));
      expect(moveColumn(b, 'fazendo', 1, T2)).toBe(b);
      expect(moveColumn(b, 'feito', 9, T2)).toBe(b);
      expect(moveColumn(b, 'nenhuma', 0, T2)).toBe(b);
      expect(moveColumn(b, 'feito', 9, T2).columns.map((c) => c.id)).toEqual(['afazer', 'fazendo', 'feito']);
      expect(moveColumn(b, 'afazer', 9, T2).columns.map((c) => c.id)).toEqual(['fazendo', 'feito', 'afazer']);
    });

    it('o grupo renomeado para um que já tinha quadro: as anotações vão para ele, e o quadro fica mais novo mesmo com o relógio atrasado', () => {
      const old = placeCard(board('trabalho', T1), 'n1', 'fazendo', T1);
      const target = placeCard(board('servico', T2), 'n2', 'afazer', T2);
      const out = moveBoardCategory(state([old, target]), 'trabalho', 'servico', T0);
      const moved = out.boards.find((b) => b.id === target.id)!;
      expect(out.boards.length).toBe(1);
      expect(notesIn(moved, 'fazendo')).toEqual(['n1']);
      expect(moved.at > T2).withContext(moved.at).toBeTrue();
      expect(out.removed[old.id]).toBe(T0);
    });

    it('recomeçar: as três colunas de sempre, sem anotação nenhuma, e mais novo', () => {
      let b = addColumn(placeCard(board(), 'n1', 'afazer', T1), 'Revisão', T1).board;
      b = resetBoard(b, T2);
      expect(b.cards).toEqual([]);
      expect(b.columns.map((c) => c.name)).toEqual(['A fazer', 'Fazendo', 'Feito']);
      expect(b.at).toBe(T2);
      expect(b.category).toBe('trabalho');
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
    it('fica só com o que é conhecido: nada sem coluna ou repetido, e o id é o da categoria', () => {
      const raw = {
        ...board(),
        id: 'outro-id',
        category: '  Trabalho ',
        columns: [...board().columns, { id: 'afazer', name: 'De novo' }, { id: '', name: 'Sem id' }, { id: 'nova', icon: 'nave', color: 'neon', finishes: 'sim' }],
        cards: [
          { note: 'n1', column: 'afazer', importance: 'critico', traits: ['t1'] },
          { note: 'n1', column: 'feito' },
          { note: 'n2', column: 'naoexiste' },
          { note: 'n3', column: 'nova', importance: 'urgentissimo' },
        ],
      };
      const b = sanitizeBoard(raw)!;
      expect(b.id).toBe(boardIdFor('trabalho'));
      expect(b.category).toBe('trabalho');
      expect(b.columns.map((c) => c.id)).toEqual(['afazer', 'fazendo', 'feito', 'nova']);
      expect(b.columns[3]).toEqual({ id: 'nova', name: 'Coluna', icon: 'circulo', color: 'cinza', finishes: false });
      expect(b.cards).toEqual([
        { note: 'n1', column: 'afazer', importance: 'critico' },
        { note: 'n3', column: 'nova', importance: null },
      ]);
      expect(sanitizeBoard({ category: 'x', at: 'ontem' })).toBeNull();
      expect(sanitizeBoard({ category: 'x', at: T0 })!.columns.length).toBe(3);
      // sem categoria é um quadro de antes, não um quadro
      expect(sanitizeBoard({ id: 'q', at: T0 })).toBeNull();
    });

    it('a marca da coluna que a seta pula só vale quando é true', () => {
      const raw = { ...board(), columns: [{ id: 'a', skip: true }, { id: 'b', skip: 'sim' }, { id: 'c', skip: false }] };
      const b = sanitizeBoard(raw)!;
      expect(b.columns.map((c) => c.skip)).toEqual([true, undefined, undefined]);
      expect('skip' in b.columns[1]).toBeFalse();
      // desligar tira o campo
      const off = updateColumn(b, 'a', { skip: undefined }, T1);
      expect('skip' in off.columns[0]).toBeFalse();
      expect(updateColumn(off, 'c', { skip: true }, T2).columns[2].skip).toBeTrue();
    });

    it('os quadros de antes (sem categoria) ficam à parte, esperando a conversão', () => {
      const st = sanitizeKanban({ boards: [board(), legacyBoard('qvelho', 'Trabalho', [{ note: 'n1', column: 'qvelho-a', traits: ['t1', 'tsumiu'] }], [{ id: 't1', name: '#Correção', color: 'azul' }])] });
      expect(st.boards.map((b) => b.category)).toEqual(['trabalho']);
      expect(st.legacy.length).toBe(1);
      expect(st.legacy[0].traits).toEqual([{ id: 't1', name: 'Correção', color: 'azul' }]);
      expect(st.legacy[0].cards).toEqual([{ note: 'n1', column: 'qvelho-a', importance: null, traits: ['t1'] }]);
    });

    it('um quadro apagado depois da última mudança dele não volta', () => {
      const a = board('trabalho', T0);
      const b = board('estudos', T2);
      const st = sanitizeKanban({ boards: [a, b], removed: { [a.id]: T1, [b.id]: T1, '': T1, qc: 'nunca' } });
      expect(st.boards.map((x) => x.category)).toEqual(['estudos']);
      expect(st.removed).toEqual({ [a.id]: T1, [b.id]: T1 });
      expect(sanitizeKanban('lixo')).toEqual({ boards: [], removed: {}, legacy: [] });
    });
  });

  describe('a conversão dos quadros de antes', () => {
    const notes = [
      { id: 'n1', category: 'Trabalho', tags: ['Login'] },
      { id: 'n2', category: 'Estudos' },
      { id: 'n3' },
      { id: 'n4', category: 'trabalho' },
    ];

    it('cada anotação vai para o quadro da categoria dela, na coluna de mesmo nome, com a importância', () => {
      const raw = {
        boards: [
          legacyBoard(
            'qtrab',
            'Trabalho',
            [
              { note: 'n1', column: 'qtrab-f', importance: 'critico' },
              { note: 'n2', column: 'qtrab-a' },
              { note: 'n3', column: 'qtrab-a' },
              { note: 'nsumiu', column: 'qtrab-a' },
            ],
            [],
            [
              { id: 'qtrab-a', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
              { id: 'qtrab-r', name: 'Revisão', icon: 'olho', color: 'azul', finishes: false },
              { id: 'qtrab-f', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
            ],
          ),
          legacyBoard('qoutro', 'Projeto', [
            { note: 'n4', column: 'qoutro-f' },
            { note: 'n2', column: 'qoutro-f' },
          ]),
        ],
      };
      const { state: st } = attachLegacy(sanitizeKanban(raw), notes, T1);
      expect(st.legacy).toEqual([]);
      const trab = st.boards.find((b) => b.category === 'trabalho')!;
      const est = st.boards.find((b) => b.category === 'estudos')!;
      // o Trabalho fica com as colunas do quadro de antes que tinha o nome dele (com a Revisão)
      expect(trab.id).toBe(boardIdFor('Trabalho'));
      expect(trab.columns.map((c) => c.name)).toEqual(['A fazer', 'Revisão', 'Feito']);
      expect(trab.cards).toEqual([
        { note: 'n1', column: 'qtrab-f', importance: 'critico' },
        // de outro quadro: na coluna de mesmo nome
        { note: 'n4', column: 'qtrab-f', importance: null },
      ]);
      // os Estudos não tinham quadro de mesmo nome: as colunas do que tinha mais anotações deles
      expect(est.cards.map((c) => c.note)).toEqual(['n2']);
      // a sem categoria e a que sumiu ficam de fora; os quadros de antes ficam lembrados como apagados
      expect(st.boards.length).toBe(2);
      expect(Object.keys(st.removed).sort()).toEqual(['qoutro', 'qtrab']);
      // de novo, nada muda
      expect(attachLegacy(st, notes, T2).state).toBe(st);
    });

    it('as características viram tags das anotações, com a cor da fita (a preta, sem cor)', () => {
      const raw = {
        boards: [
          legacyBoard(
            'q1',
            'Trabalho',
            [
              { note: 'n1', column: 'q1-a', traits: ['t1', 't2'] },
              { note: 'n4', column: 'q1-a', traits: ['t1'] },
            ],
            [
              { id: 't1', name: 'Correção', color: 'vermelha' },
              { id: 't2', name: 'Login', color: 'preta' },
            ],
          ),
          legacyBoard('q2', 'Outro', [{ note: 'n1', column: 'q2-a', traits: ['t9'] }], [{ id: 't9', name: 'correção', color: 'azul' }]),
        ],
      };
      const { tags, colors, colorsAt } = attachLegacy(sanitizeKanban(raw), notes, T1);
      expect(tags.get('n1')).toEqual(['Correção', 'Login']);
      expect(tags.get('n4')).toEqual(['Correção']);
      // a primeira cor de um nome vale; a preta fica sem
      expect([...colors]).toEqual([['Correção', 'vermelho']]);
      // a hora das cores é a do quadro de antes, não a da conversão
      expect(colorsAt).toBe(T0);
    });

    it('um quadro de agora da mesma categoria recebe as anotações nas colunas dele', () => {
      const now = placeCard(board('trabalho', T0), 'n4', 'afazer', T0);
      const st = sanitizeKanban({ boards: [now, legacyBoard('q1', 'Qualquer', [{ note: 'n1', column: 'q1-f' }, { note: 'n4', column: 'q1-f' }])] });
      const out = attachLegacy(st, notes, T1).state;
      expect(out.boards.length).toBe(1);
      // a coluna Feito do de antes vira a Feito do de agora; a que já estava não se repete
      expect(out.boards[0].cards).toEqual([
        { note: 'n4', column: 'afazer', importance: null, at: T0 },
        { note: 'n1', column: 'feito', importance: null },
      ]);
    });
  });

  describe('a junção de dois aparelhos', () => {
    it('cada quadro vem de quem o mudou por último; os dos dois lados ficam', () => {
      const here = state([placeCard(board('trabalho', T1), 'aqui', 'afazer', T1), board('estudos', T0)]);
      const there = state([placeCard(board('estudos', T2), 'la', 'afazer', T2), board('trabalho', T0), board('casa', T0)]);
      const m = mergeKanban(here, there);
      expect(m.boards.map((b) => [b.category, b.cards.map((c) => c.note)])).toEqual([
        ['trabalho', ['aqui']],
        ['estudos', ['la']],
        ['casa', []],
      ]);
    });

    it('apagar num aparelho apaga no outro, a não ser que lá ele tenha mudado depois', () => {
      const a = board('trabalho', T0);
      const b = board('estudos', T2);
      const here = state([a, b]);
      const there = state([], { [a.id]: T1, [b.id]: T1 });
      const m = mergeKanban(here, there);
      expect(m.boards.map((x) => x.category)).toEqual(['estudos']);
      expect(mergeKanban(there, here).boards.map((x) => x.category)).toEqual(['estudos']);
    });

    it('na nuvem: vai só com algum quadro, sem a lista dos de antes depois da conversão, e muda a impressão', async () => {
      expect(kanbanToSync(state([]))).toBeNull();
      const st = state([board()]);
      expect(kanbanToSync(st)).toEqual({ boards: st.boards, removed: {} });
      expect(kanbanToSync(state([], { qa: T0 }))).not.toBeNull();
      const doc = { reviews: [], drafts: [], wishes: [], deleted: { reviews: {}, drafts: {}, wishes: {} } };
      expect(await fingerprint(doc, null, null, null, null, null, null)).toBe(await fingerprint(doc));
      expect(await fingerprint(doc, null, null, null, null, null, kanbanToSync(st))).not.toBe(await fingerprint(doc));
      expect(kanbanOf({ kanban: kanbanToSync(st) })).toEqual(st);
      // a impressão do que veio é a mesma do que este aparelho enviaria
      expect(kanbanPrintOf({ kanban: kanbanToSync(st) })).toEqual(kanbanToSync(st));
      expect(kanbanOf({})).toBeNull();
    });
  });

  describe('a cor das tags', () => {
    it('mora com as cores das categorias, numa chave que não esbarra nelas, uma por categoria', () => {
      expect(tagLookKey('Correção')).toBe('#correcao');
      expect(tagLookKey('Correção', 'Trabalho')).toBe('##trabalho#correcao');
      expect(tagLookKey('Correção', '')).toBe('###correcao');
      // o "#" da categoria vem dobrado: "a#b" e a tag "c" não esbarram em "a" e a tag "b#c"
      expect(tagLookKey('c', 'a#b')).not.toBe(tagLookKey('b#c', 'a'));
      const looks = { '#correcao': { color: 'azul' as const }, correcao: { color: 'rosa' as const }, '##estudos#correcao': { color: 'verde' as const } };
      // a de sempre da tag vale onde a categoria não escolheu
      expect(tagColorHex(looks, 'CORREÇÃO', 'Trabalho')).toBe('#2d8bd6');
      expect(tagColorHex(looks, 'Correção', 'Estudos')).toBe(categoryColorHex('verde'));
      // "Sem cor" escolhido na categoria vale mais que a de sempre
      expect(tagColorHex({ ...looks, '##casa#correcao': { none: true } }, 'Correção', 'Casa')).toBeNull();
      expect(tagColorHex({}, 'Correção', 'Trabalho')).toBeNull();
    });

    it('trocar a cor numa categoria não muda a das outras; Sem cor por cima da de sempre fica marcado', () => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const settings = TestBed.inject(Settings);
      settings.setTagColors(new Map([['Bug', 'azul']]));
      settings.setTagColor('Bug', 'rosa', 'Trabalho');
      expect(settings.tagColor('bug', 'Trabalho')).toBe('rosa');
      expect(settings.tagColor('bug', 'Estudos')).toBe('azul');
      settings.setTagColor('Bug', undefined, 'Estudos');
      expect(settings.tagColor('bug', 'Estudos')).toBeUndefined();
      expect(settings.categoryLooks()['##estudos#bug']).toEqual({ none: true });
      // sem a de sempre, "Sem cor" é só não ter nada
      settings.setTagColor('Ideia', 'verde', 'Casa');
      settings.setTagColor('Ideia', undefined, 'Casa');
      expect(settings.categoryLooks()['##casa#ideia']).toBeUndefined();
      // e tudo sobrevive ao armazenamento (a chave comprida também)
      const long = 'Uma categoria de nome bem comprido';
      settings.setTagColor('Uma tag de nome bem comprido também', 'roxo', long);
      expect(sanitizeCategoryLooks(settings.categoryLooks())).toEqual(settings.categoryLooks());
      localStorage.clear();
    });

    it('no mural público, só as cores das tags das anotações publicadas', () => {
      const looks = {
        '#login': { color: 'azul' as const },
        '##trabalho#login': { color: 'rosa' as const },
        '##estudos#login': { color: 'verde' as const },
        '#segredo': { color: 'rosa' as const },
        trabalho: { color: 'verde' as const },
      };
      expect(publicCategoryLooks(looks, [{ category: 'Trabalho', tags: ['Login'] }])).toEqual({
        '#login': { color: 'azul' },
        '##trabalho#login': { color: 'rosa' },
        trabalho: { color: 'verde' },
      });
    });
  });

  describe('no site', () => {
    let store: ReviewStore;
    let kanban: KanbanStore;
    let actions: KanbanActions;
    const TRAB = boardIdFor('trabalho');

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
      kanban = TestBed.inject(KanbanStore);
      actions = TestBed.inject(KanbanActions);
      store.reviews.set([
        note('nlogin01', 'Corrigir o login', { category: 'Trabalho' }),
        note('nfeita01', 'Deploy', { category: 'Trabalho', doneAt: '2026-10-05T10:00:00.000Z' }),
        note('nprova01', 'Prova', { category: 'Estudos' }),
        note('nsolta01', 'Solta'),
      ]);
      kanban.state.set(state([board('trabalho')]));
    });
    afterEach(() => localStorage.clear());

    it('cada categoria tem um quadro; o de uma categoria em que ninguém mexeu só é guardado na primeira mudança', () => {
      expect(kanban.categories().map((c) => c.label)).toEqual(['Trabalho', 'Estudos']);
      const est = kanban.boardFor('Estudos');
      expect(est.at).toBe(FRESH_AT);
      expect(kanban.boards().length).toBe(1);
      actions.move(est.id, 'nprova01', est.columns[0].id);
      expect(kanban.boards().length).toBe(2);
      expect(kanban.boardFor('estudos').cards.map((c) => c.note)).toEqual(['nprova01']);
      TestBed.tick();
      expect(JSON.parse(localStorage.getItem(KANBAN_KEY)!).boards.map((b: KanbanBoard) => b.category)).toEqual(['trabalho', 'estudos']);
    });

    it('não dá para pôr no quadro uma anotação de outra categoria (nem uma sem categoria)', () => {
      actions.move(TRAB, 'nprova01', 'afazer');
      actions.move(TRAB, 'nsolta01', 'afazer');
      expect(kanban.get(TRAB)!.cards).toEqual([]);
      actions.move(TRAB, 'nlogin01', 'afazer');
      expect(kanban.get(TRAB)!.cards.map((c) => c.note)).toEqual(['nlogin01']);
      // trocada a categoria, ela some do quadro (sem perder o lugar)
      store.update({ ...store.get('nlogin01')!, category: 'Estudos' });
      expect(kanban.live(kanban.get(TRAB)!)).toEqual([]);
      expect(kanban.get(TRAB)!.cards.length).toBe(1);
    });

    it('levar para Feito finaliza a anotação; o Desfazer devolve o lugar e abre de novo', () => {
      actions.move(TRAB, 'nlogin01', 'afazer');
      expect(isDone(store.get('nlogin01')!)).toBeFalse();
      actions.move(TRAB, 'nlogin01', 'feito');
      expect(isDone(store.get('nlogin01')!)).toBeTrue();
      const toast = TestBed.inject(Toasts).current()!;
      expect(toast.text).toContain('finalizada em Feito');
      toast.action!.run();
      expect(isDone(store.get('nlogin01')!)).toBeFalse();
      expect(notesIn(kanban.get(TRAB)!, 'afazer')).toEqual(['nlogin01']);
    });

    it('quem chega sem lugar escolhido vai para cima da coluna (também em Feito); com o lugar, fica nele', () => {
      store.update({ ...store.get('nprova01')!, category: 'Trabalho' });
      kanban.update(TRAB, (b, at) => placeCard(b, 'nfeita01', 'feito', at));
      actions.move(TRAB, 'nlogin01', 'feito');
      expect(notesIn(kanban.get(TRAB)!, 'feito')).toEqual(['nlogin01', 'nfeita01']);
      expect(isDone(store.get('nlogin01')!)).toBeTrue();
      actions.move(TRAB, 'nprova01', 'feito', 2);
      expect(notesIn(kanban.get(TRAB)!, 'feito')).toEqual(['nlogin01', 'nfeita01', 'nprova01']);
    });

    it('várias juntas para Feito: todas finalizadas, um bilhete só, e o Desfazer devolve cada uma ao lugar', () => {
      store.update({ ...store.get('nprova01')!, category: 'Trabalho' });
      actions.move(TRAB, 'nlogin01', 'afazer');
      actions.move(TRAB, 'nprova01', 'afazer');
      actions.move(TRAB, 'nfeita01', 'fazendo');
      store.update({ ...store.get('nfeita01')!, doneAt: undefined });
      actions.moveMany(TRAB, ['nlogin01', 'nfeita01'], 'feito', null);
      expect(notesIn(kanban.get(TRAB)!, 'feito')).toEqual(['nlogin01', 'nfeita01']);
      expect(isDone(store.get('nlogin01')!)).toBeTrue();
      expect(isDone(store.get('nfeita01')!)).toBeTrue();
      const toast = TestBed.inject(Toasts).current()!;
      expect(toast.text).toBe('2 anotações finalizadas em Feito');
      toast.action!.run();
      // (a nprova01 chegou depois, sem lugar escolhido: ficou em cima)
      expect(notesIn(kanban.get(TRAB)!, 'afazer')).toEqual(['nprova01', 'nlogin01']);
      expect(notesIn(kanban.get(TRAB)!, 'fazendo')).toEqual(['nfeita01']);
      expect(isDone(store.get('nlogin01')!)).toBeFalse();
      expect(isDone(store.get('nfeita01')!)).toBeFalse();
      // entre colunas comuns, o bilhete diz para onde foram
      actions.moveMany(TRAB, ['nlogin01', 'nprova01'], 'fazendo', 'nfeita01');
      expect(notesIn(kanban.get(TRAB)!, 'fazendo')).toEqual(['nlogin01', 'nprova01', 'nfeita01']);
      expect(TestBed.inject(Toasts).current()!.text).toBe('2 anotações levadas para Fazendo');
    });

    it('o Desfazer de uma anotação aberta de novo (saindo de Feito) a finaliza no dia em que tinha sido, e não hoje', () => {
      const DIA = '2026-10-05T10:00:00.000Z';
      kanban.update(TRAB, (b, at) => placeCard(b, 'nfeita01', 'feito', at));
      actions.move(TRAB, 'nfeita01', 'fazendo');
      expect(isDone(store.get('nfeita01')!)).toBeFalse();
      TestBed.inject(Toasts).current()!.action!.run();
      expect(store.get('nfeita01')!.doneAt).toBe(DIA);
      expect(notesIn(kanban.get(TRAB)!, 'feito')).toEqual(['nfeita01']);
      // várias juntas: cada uma volta no dia dela
      store.update({ ...store.get('nlogin01')!, doneAt: '2026-10-06T10:00:00.000Z' });
      actions.move(TRAB, 'nlogin01', 'feito', 1);
      actions.moveMany(TRAB, ['nfeita01', 'nlogin01'], 'afazer', null);
      expect(isDone(store.get('nfeita01')!) || isDone(store.get('nlogin01')!)).toBeFalse();
      TestBed.inject(Toasts).current()!.action!.run();
      expect(store.get('nfeita01')!.doneAt).toBe(DIA);
      expect(store.get('nlogin01')!.doneAt).toBe('2026-10-06T10:00:00.000Z');
      expect(notesIn(kanban.get(TRAB)!, 'feito')).toEqual(['nfeita01', 'nlogin01']);
    });

    it('tirar de Feito para outra coluna abre a anotação de novo; entre colunas comuns, nada muda', () => {
      kanban.update(TRAB, (b, at) => placeCard(b, 'nfeita01', 'feito', at));
      actions.move(TRAB, 'nfeita01', 'fazendo');
      expect(isDone(store.get('nfeita01')!)).toBeFalse();
      expect(TestBed.inject(Toasts).current()!.text).toContain('aberta de novo em Fazendo');
      actions.move(TRAB, 'nfeita01', 'afazer');
      expect(isDone(store.get('nfeita01')!)).toBeFalse();
    });

    it('tirar do quadro deixa a anotação no mural, e o Desfazer a põe de volta com o que ela tinha', () => {
      kanban.update(TRAB, (b, at) => setImportance(placeCard(b, 'nlogin01', 'fazendo', at), 'nlogin01', 'importante', at));
      actions.remove(kanban.get(TRAB)!, 'nlogin01');
      expect(kanban.get(TRAB)!.cards).toEqual([]);
      expect(store.get('nlogin01')).toBeTruthy();
      TestBed.inject(Toasts).current()!.action!.run();
      expect(kanban.get(TRAB)!.cards).toEqual([{ note: 'nlogin01', column: 'fazendo', importance: 'importante', at: jasmine.any(String) }]);
    });

    it('o Desfazer de tirar do quadro põe a anotação de volta com a hora de agora (na junção, vale mais que o tirar)', () => {
      kanban.update(TRAB, (b) => ({ ...b, cards: [{ note: 'nlogin01', column: 'fazendo', importance: 'medio', at: T0 }] }));
      actions.remove(kanban.get(TRAB)!, 'nlogin01');
      const removedAt = kanban.get(TRAB)!.at;
      TestBed.inject(Toasts).current()!.action!.run();
      const back = kanban.get(TRAB)!.cards[0];
      expect(back).toEqual(jasmine.objectContaining({ note: 'nlogin01', column: 'fazendo', importance: 'medio' }));
      expect(back.at! > T0 && back.at! >= removedAt).withContext(back.at!).toBeTrue();
    });

    it('a anotação nova pedida de uma coluna cai no quadro da categoria dela, uma vez só', () => {
      kanban.pending.set({ board: TRAB, column: 'fazendo' });
      expect(kanban.claim('Trabalho')).toEqual({ board: TRAB, column: 'fazendo' });
      expect(kanban.claim('Trabalho')).toBeNull();
      // trocou a categoria no editor: a primeira coluna do quadro da categoria nova
      kanban.pending.set({ board: TRAB, column: 'fazendo' });
      const est = kanban.boardFor('Estudos');
      expect(kanban.claim('Estudos')).toEqual({ board: est.id, column: est.columns[0].id });
      // sem categoria, em nenhum
      kanban.pending.set({ board: TRAB, column: 'fazendo' });
      expect(kanban.claim(undefined)).toBeNull();
    });

    it('recomeçar e desfazer devolve o quadro como era', () => {
      actions.move(TRAB, 'nlogin01', 'fazendo');
      const before = kanban.get(TRAB)!;
      kanban.update(TRAB, (b, at) => resetBoard(b, at));
      expect(kanban.get(TRAB)!.cards).toEqual([]);
      kanban.restore(before);
      // as anotações voltam com a hora do Desfazer (desfazer é mexer agora, ver restoredBoard): a
      // mesma de antes só quando o relógio não virou um milésimo no meio; o lugar é o de antes
      const place = (cards: KanbanBoard['cards']) => cards.map(({ at: _, ...c }) => c);
      expect(place(kanban.get(TRAB)!.cards)).toEqual(place(before.cards));
      kanban.get(TRAB)!.cards.forEach((c, i) => expect(c.at! >= (before.cards[i].at ?? '')).withContext(c.note).toBeTrue());
      expect(kanban.get(TRAB)!.columns).toEqual(before.columns);
    });

    it('a junção com a nuvem só troca o estado quando muda algo', () => {
      const before = kanban.state();
      kanban.merge(state([board('trabalho', '2020-01-01T00:00:00.000Z')]));
      expect(kanban.state()).toBe(before);
      kanban.merge(state([board('estudos', T0)]));
      expect(kanban.boards().map((b) => b.category)).toEqual(['trabalho', 'estudos']);
    });

    it('os quadros de antes viram quadros das categorias assim que aparecem, e as características viram tags com cor', () => {
      const raw = { boards: [legacyBoard('qvelho', 'Meu quadro', [{ note: 'nlogin01', column: 'qvelho-f', importance: 'baixo', traits: ['t1'] }], [{ id: 't1', name: 'Urgente', color: 'laranja' }])] };
      kanban.merge(sanitizeKanban(raw));
      TestBed.tick();
      expect(kanban.state().legacy).toEqual([]);
      expect(kanban.get(TRAB)!.cards).toEqual([{ note: 'nlogin01', column: 'feito', importance: 'baixo' }]);
      expect(store.get('nlogin01')!.tags).toEqual(['Urgente']);
      expect(TestBed.inject(Settings).tagColor('urgente')).toBe('laranja');
      expect(kanban.state().removed['qvelho']).toBeTruthy();
    });
  });
});
