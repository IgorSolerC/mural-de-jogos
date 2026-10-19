import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KanbanBoard, KanbanState, MAX_DEPS, boardIdFor, cardsIn, dependsOn, depProgress, mergeBoards, sanitizeBoard, setDeps } from './kanban';
import { KanbanActions } from './kanban-actions';
import { KanbanDeps } from './kanban-deps';
import { KanbanStore } from './kanban-store';
import { Review, isDone, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Confirm } from '../ui/confirm';

/** As dependências das anotações no quadro: o que se guarda, a roda proibida, a conta, a junção e a pergunta antes de finalizar. */

const T0 = '2026-10-19T10:00:00.000Z';
const T1 = '2026-10-19T11:00:00.000Z';
const T2 = '2026-10-19T12:00:00.000Z';
const TRAB = boardIdFor('trabalho');

function board(cards: KanbanBoard['cards'] = [], at = T0): KanbanBoard {
  return {
    id: TRAB,
    category: 'trabalho',
    at,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'fazendo', name: 'Fazendo', icon: 'lapis', color: 'amarelo', finishes: false },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    cards,
  };
}

const card = (note: string, deps?: string[], column = 'afazer') => ({ note, column, importance: null, ...(deps ? { deps } : {}) });
const state = (...boards: KanbanBoard[]): KanbanState => ({ boards, removed: {}, legacy: [] });

const note = (id: string, title: string, extra: Record<string, unknown> = {}): Review =>
  ({
    ...sanitizeReview({ kind: 'anotacoes', game: { name: title }, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!,
    id,
  });

describe('dependências no Kanban', () => {
  describe('o que se guarda', () => {
    it('só ids, sem repetir, sem ela mesma; nenhuma: sem o campo', () => {
      const b = sanitizeBoard({ ...board(), cards: [{ note: 'na', column: 'afazer', deps: ['nb', 'nb', 'na', 'n c!', 7, 'nd'] }, { note: 'nb', column: 'afazer', deps: [] }] })!;
      expect(b.cards[0].deps).toEqual(['nb', 'nc', 'nd']);
      expect('deps' in b.cards[1]).toBeFalse();
    });

    it('até MAX_DEPS', () => {
      const many = Array.from({ length: MAX_DEPS + 5 }, (_, i) => `n${i}`);
      expect(sanitizeBoard({ ...board(), cards: [{ note: 'na', column: 'afazer', deps: many }] })!.cards[0].deps!.length).toBe(MAX_DEPS);
    });
  });

  describe('pôr e tirar', () => {
    it('setDeps guarda na ordem, com a hora da anotação e do quadro; igual, nada muda', () => {
      const b = board([card('na'), card('nb'), card('nc')]);
      const next = setDeps(b, 'na', ['nc', 'nb'], T1);
      expect(next.cards[0]).toEqual({ ...card('na', ['nc', 'nb']), at: T1 });
      expect(next.at).toBe(T1);
      expect(setDeps(next, 'na', ['nc', 'nb'], T2)).toBe(next);
      // vazia: o campo sai
      expect('deps' in setDeps(next, 'na', [], T2).cards[0]).toBeFalse();
    });

    it('nunca em roda: nem direto, nem por algum caminho', () => {
      // a depende de b, b depende de c
      const b = board([card('na', ['nb']), card('nb', ['nc']), card('nc')]);
      expect(dependsOn([b], 'na', 'nc')).toBeTrue();
      expect(dependsOn([b], 'nc', 'na')).toBeFalse();
      // c depender de a fecharia a roda a → b → c → a
      expect(setDeps(b, 'nc', ['na'], T1)).toBe(b);
      expect(setDeps(b, 'nb', ['nc', 'na'], T1)).toBe(b);
      // a não depender de b não faz roda
      expect(setDeps(b, 'nc', ['nd'], T1).cards[2].deps).toEqual(['nd']);
    });

    it('a roda conta pelos quadros todos (a dependência pode ser de outro grupo)', () => {
      const est: KanbanBoard = { ...board([card('nx', ['na'])]), id: boardIdFor('estudos'), category: 'estudos' };
      const trab = board([card('na')]);
      expect(dependsOn([trab, est], 'nx', 'na')).toBeTrue();
      expect(dependsOn([trab, est], 'na', 'nx')).toBeFalse();
    });
  });

  it('a conta: finalizadas de quantas, sem as apagadas', () => {
    const notes = new Map([note('na', 'A', { doneAt: T0 }), note('nb', 'B')].map((r) => [r.id, r]));
    const p = depProgress(['na', 'nb', 'nsumiu'], notes);
    expect([p.done, p.total]).toEqual([1, 2]);
    expect(p.open.map((r) => r.id)).toEqual(['nb']);
    expect(depProgress(undefined, notes).total).toBe(0);
  });

  it('na junção, as dependências postas num aparelho ficam com o que o outro mexeu em outra anotação', () => {
    const o = board([card('na'), card('nb'), card('nc')]);
    const a = setDeps(o, 'na', ['nb'], T1);
    const b = { ...o, at: T2, cards: [card('na'), { ...card('nb', undefined, 'fazendo'), at: T2 }, card('nc')] };
    const m = mergeBoards(o, a, b);
    expect(m.cards.find((c) => c.note === 'na')!.deps).toEqual(['nb']);
    expect(m.cards.find((c) => c.note === 'nb')!.column).toBe('fazendo');
  });

  describe('no site', () => {
    let store: ReviewStore;
    let kanban: KanbanStore;
    let deps: KanbanDeps;
    let actions: KanbanActions;
    let answer: boolean;
    let asked: string[];

    beforeEach(() => {
      localStorage.clear();
      answer = false;
      asked = [];
      TestBed.configureTestingModule({
        providers: [provideZonelessChangeDetection(), { provide: Confirm, useValue: { ask: async (o: { text: string }) => (asked.push(o.text), answer) } }],
      });
      store = TestBed.inject(ReviewStore);
      kanban = TestBed.inject(KanbanStore);
      deps = TestBed.inject(KanbanDeps);
      actions = TestBed.inject(KanbanActions);
      store.reviews.set([
        note('nlogin01', 'Corrigir o login', { category: 'Trabalho' }),
        note('nsync001', 'Sincronizar quadros', { category: 'Trabalho' }),
        note('nprova01', 'Prova', { category: 'Estudos' }),
      ]);
      kanban.state.set(state(board([card('nlogin01', ['nsync001', 'nprova01'], 'fazendo'), card('nsync001')])));
    });
    afterEach(() => localStorage.clear());

    const settle = () => new Promise((r) => setTimeout(r, 0));

    it('levar para Feito com dependência aberta pergunta antes; sem o sim, fica onde estava', async () => {
      actions.move(TRAB, 'nlogin01', 'feito');
      await settle();
      expect(asked).toEqual(['“Corrigir o login” depende de 2 anotações que ainda não foram finalizadas: “Sincronizar quadros” e “Prova”. Finalizar “Corrigir o login” mesmo assim?']);
      expect(cardsIn(kanban.get(TRAB)!, 'fazendo').map((c) => c.note)).toEqual(['nlogin01']);
      expect(isDone(store.get('nlogin01')!)).toBeFalse();
      answer = true;
      let after = 0;
      actions.move(TRAB, 'nlogin01', 'feito', undefined, () => after++);
      await settle();
      expect(cardsIn(kanban.get(TRAB)!, 'feito').map((c) => c.note)).toEqual(['nlogin01']);
      expect(isDone(store.get('nlogin01')!)).toBeTrue();
      expect(after).toBe(1);
    });

    it('todas finalizadas (ou sem nenhuma), anda na hora, sem perguntar', () => {
      for (const id of ['nsync001', 'nprova01']) store.update({ ...store.get(id)!, doneAt: T1 });
      let after = 0;
      actions.move(TRAB, 'nlogin01', 'feito', undefined, () => after++);
      expect(after).toBe(1);
      expect(asked).toEqual([]);
      expect(isDone(store.get('nlogin01')!)).toBeTrue();
      // andar entre colunas que não finalizam nunca pergunta
      actions.move(TRAB, 'nsync001', 'fazendo');
      expect(asked).toEqual([]);
    });

    it('arrastadas juntas para Feito, as que finalizam juntas não contam como abertas', async () => {
      store.update({ ...store.get('nprova01')!, doneAt: T1 });
      actions.moveMany(TRAB, ['nlogin01', 'nsync001'], 'feito', null);
      expect(asked).toEqual([]);
      expect(isDone(store.get('nlogin01')!) && isDone(store.get('nsync001')!)).toBeTrue();
    });

    it('pôr, tirar e o que o seletor esconde (ela, as que já são e as que fariam roda)', () => {
      expect(deps.idsOf('nlogin01')).toEqual(['nsync001', 'nprova01']);
      // sincronizar não pode depender do login: o login já depende dele
      expect(deps.canAdd('nsync001', 'nlogin01')).toBeFalse();
      expect(deps.excluded('nsync001').sort()).toEqual(['nlogin01', 'nsync001']);
      deps.add('nsync001', 'nlogin01');
      expect(deps.idsOf('nsync001')).toEqual([]);
      deps.remove('nlogin01', 'nsync001');
      expect(deps.idsOf('nlogin01')).toEqual(['nprova01']);
      deps.add('nsync001', 'nlogin01');
      expect(deps.idsOf('nsync001')).toEqual(['nlogin01']);
    });

    it('onde a dependência está: a coluna; de outro grupo, o grupo; fora do quadro, isso', () => {
      expect(deps.whereOf(store.get('nsync001')!, 'nlogin01')).toBe('A fazer');
      expect(deps.whereOf(store.get('nprova01')!, 'nlogin01')).toBe('Estudos · Fora do quadro');
    });
  });
});
