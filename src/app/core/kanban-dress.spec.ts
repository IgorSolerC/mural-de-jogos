import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CardLook, lookFrom, sameLook, sanitizeLook, withLook } from './card-look';
import { KanbanBoard, boardIdFor, dressBoard, lookVersion, restoredBoard, sanitizeBoard, undressLooks, updateColumn } from './kanban';
import { KanbanActions } from './kanban-actions';
import { KanbanDresser } from './kanban-dresser';
import { KanbanStore } from './kanban-store';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';

/** O card padrão das colunas do Kanban: vestir quem chega, devolver o visual de quem sai. */

const T0 = '2026-10-17T10:00:00.000Z';
const T1 = '2026-10-17T11:00:00.000Z';
const ID = boardIdFor('trabalho');
const VERMELHO: CardLook = { stock: 'vermelho', pattern: 'gatinhos', scribble: 'moldura', scribbleSeed: 7 };

function board(look: CardLook | null = VERMELHO): KanbanBoard {
  return {
    id: ID,
    category: 'trabalho',
    at: T0,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'bloq', name: 'Bloqueado', icon: 'bloqueio', color: 'vermelho', finishes: false, ...(look ? { look, dresses: true as const } : {}) },
    ],
    cards: [
      { note: 'n1', column: 'afazer', importance: null },
      { note: 'n2', column: 'bloq', importance: null },
    ],
  };
}
const notes = (looks: Record<string, CardLook>) => new Map(Object.entries(looks).map(([id, l]) => [id, { id, category: 'Trabalho', ...l }]));

describe('o visual de uma ficha (card-look)', () => {
  it('pega só os campos do visual, sanea como as fichas e troca sem deixar resto', () => {
    expect(lookFrom({ stock: 'azul', paper: 'canson', id: 'x', game: { name: 'a' } } as Partial<Review> as CardLook)).toEqual({ stock: 'azul', paper: 'canson' });
    // o de sempre não fica; valores desconhecidos saem
    expect(sanitizeLook({ stock: 'azul', paper: 'cartolina', pattern: 'nada-disso', scribble: 'moldura', scribbleSeed: 3, x: 1 })).toEqual({ stock: 'azul', scribble: 'moldura', scribbleSeed: 3 });
    expect(sanitizeLook('lixo')).toEqual({});
    expect(withLook<CardLook>({ stock: 'azul', pattern: 'gatinhos', scribble: 'moldura' }, { stock: 'verde' })).toEqual({ stock: 'verde' });
    expect(sameLook({ stock: 'verde' }, { stock: 'verde' })).toBeTrue();
    expect(sameLook({ stock: 'verde' }, { stock: 'verde', pattern: 'gatinhos' })).toBeFalse();
  });
});

describe('o card padrão (dressBoard)', () => {
  it('veste quem está na coluna com o card, guardando o visual de antes; o resto fica', () => {
    const { board: b, looks } = dressBoard(board(), notes({ n1: { stock: 'azul' }, n2: { stock: 'verde', paper: 'canson' } }), T1);
    expect(looks).toEqual([{ note: 'n2', look: VERMELHO }]);
    expect(b.cards[1].dress).toEqual({ col: 'bloq', v: lookVersion(VERMELHO), own: { stock: 'verde', paper: 'canson' } });
    expect(b.cards[0].dress).toBeUndefined();
    expect(b.at).toBe(T1);
    // de novo, sem mudança: o mesmo quadro
    expect(dressBoard(b, notes({ n1: { stock: 'azul' }, n2: VERMELHO }), T1).board).toBe(b);
  });

  it('repintada à mão depois de vestir, fica como a pessoa deixou (até mudar de coluna ou o card mudar)', () => {
    const b = dressBoard(board(), notes({ n2: { stock: 'verde' } }), T1).board;
    expect(dressBoard(b, notes({ n2: { stock: 'azul' } }), T1)).toEqual({ board: b, looks: [] });
    // o card mudou: veste de novo, e o visual de antes continua o primeiro
    const mudou = updateColumn(b, 'bloq', { look: { stock: 'amarelo' } }, T1);
    const r = dressBoard(mudou, notes({ n2: { stock: 'azul' } }), T1);
    expect(r.looks).toEqual([{ note: 'n2', look: { stock: 'amarelo' } }]);
    expect(r.board.cards[1].dress!.own).toEqual({ stock: 'verde' });
  });

  it('saindo para uma coluna sem card, ou com o card desligado, volta ao visual de antes', () => {
    const b = dressBoard(board(), notes({ n2: { stock: 'verde' } }), T1).board;
    const saiu = { ...b, cards: b.cards.map((c) => (c.note === 'n2' ? { ...c, column: 'afazer' } : c)) };
    const r = dressBoard(saiu, notes({ n2: VERMELHO }), T1);
    expect(r.looks).toEqual([{ note: 'n2', look: { stock: 'verde' } }]);
    expect(r.board.cards[1].dress).toBeUndefined();
    const off = updateColumn(b, 'bloq', { dresses: undefined }, T1);
    expect(off.columns[1].look).toEqual(VERMELHO);
    expect(dressBoard(off, notes({ n2: VERMELHO }), T1).looks).toEqual([{ note: 'n2', look: { stock: 'verde' } }]);
  });

  it('não toca nas compartilhadas, nem nas de outra categoria', () => {
    expect(dressBoard(board(), notes({ n2: { stock: 'verde' } }), T1, (id) => id === 'n2').looks).toEqual([]);
    const outra = new Map([['n2', { id: 'n2', category: 'Estudos', stock: 'verde' as const }]]);
    expect(dressBoard(board(), outra, T1).looks).toEqual([]);
  });

  it('o Desfazer de um quadro inteiro deixa as marcas por refazer, com o visual de antes mais antigo', () => {
    const vestido = dressBoard(board(), notes({ n2: { stock: 'verde' } }), T1).board;
    const agora = { ...vestido, cards: vestido.cards.filter((c) => c.note !== 'n2') };
    const volta = restoredBoard(vestido, agora);
    expect(volta.cards[1].dress).toEqual({ col: '', v: '', own: { stock: 'verde' } });
    const r = dressBoard(volta, notes({ n2: { stock: 'verde' } }), T1);
    expect(r.looks).toEqual([{ note: 'n2', look: VERMELHO }]);
    expect(undressLooks(vestido.cards)).toEqual([{ note: 'n2', look: { stock: 'verde' } }]);
  });

  it('guardado e lido de novo: o card, o ligado e as marcas (as de coluna que não existe saem)', () => {
    const vestido = dressBoard(board(), notes({ n2: { stock: 'verde' } }), T1).board;
    const lido = sanitizeBoard(JSON.parse(JSON.stringify(vestido)))!;
    expect(lido.columns[1]).toEqual(vestido.columns[1]);
    expect(lido.cards[1].dress).toEqual(vestido.cards[1].dress);
    const raw = JSON.parse(JSON.stringify(vestido));
    raw.cards[1].dress.col = 'sumiu';
    raw.columns[1].dresses = 'sim';
    const torto = sanitizeBoard(raw)!;
    expect(torto.cards[1].dress).toBeUndefined();
    expect(torto.columns[1].dresses).toBeUndefined();
  });
});

describe('o card padrão no site (KanbanDresser)', () => {
  let store: ReviewStore;
  let kanban: KanbanStore;
  const note = (id: string, extra: Record<string, unknown>): Review =>
    ({ ...sanitizeReview({ kind: 'anotacoes', game: { name: id }, category: 'Trabalho', completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!, id });
  const look = (id: string) => lookFrom(store.get(id)!);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    store.reviews.set([note('n1', { stock: 'azul' }), note('n2', { stock: 'verde' })]);
    kanban = TestBed.inject(KanbanStore);
    TestBed.inject(KanbanDresser);
  });
  afterEach(() => localStorage.clear());

  it('mover para a coluna com card veste; voltar devolve; mudar o card repinta quem está lá', () => {
    kanban.state.set({ boards: [board()], removed: {}, legacy: [] });
    TestBed.tick();
    expect(look('n2')).toEqual(VERMELHO);
    expect(look('n1')).toEqual({ stock: 'azul' });
    TestBed.inject(KanbanActions).move(ID, 'n1', 'bloq');
    TestBed.tick();
    expect(look('n1')).toEqual(VERMELHO);
    TestBed.inject(KanbanActions).move(ID, 'n1', 'afazer');
    TestBed.tick();
    expect(look('n1')).toEqual({ stock: 'azul' });
    kanban.update(ID, (b, at) => updateColumn(b, 'bloq', { look: { stock: 'lilas' } }, at));
    TestBed.tick();
    expect(look('n2')).toEqual({ stock: 'lilas' });
  });

  it('tirar a anotação do quadro devolve o visual dela, e o Desfazer veste de novo', () => {
    kanban.state.set({ boards: [board()], removed: {}, legacy: [] });
    TestBed.tick();
    TestBed.inject(KanbanActions).remove(kanban.get(ID)!, 'n2');
    TestBed.tick();
    expect(look('n2')).toEqual({ stock: 'verde' });
    expect(kanban.get(ID)!.cards.some((c) => c.note === 'n2')).toBeFalse();
  });
});
