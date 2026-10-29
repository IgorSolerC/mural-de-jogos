import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { KanbanBoard, boardIdFor, mergeBoards, onWall, restoredBoard, sanitizeBoard, setWall } from './kanban';
import { KanbanActions } from './kanban-actions';
import { KanbanStore } from './kanban-store';
import { Toasts } from '../ui/toast';
import { Mural } from './mural';
import { NOTES_CONFIG_DEFAULT, kanbanOnly, sanitizeNotesConfig, withPrefs } from './mural-config';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { boardLines } from './sync-conflicts';
import { WallView } from './wall-view';

/**
 * Só no Kanban: a anotação do quadro que fica fora do mural (a escolha dela, `wall`, ou a do grupo,
 * `kanbanOnly`), o que se guarda, a junção, e o mural que a esconde até a pessoa pedir para ver.
 */

const T0 = '2026-10-20T10:00:00.000Z';
const T1 = '2026-10-20T11:00:00.000Z';
const T2 = '2026-10-20T12:00:00.000Z';
const TRAB = boardIdFor('trabalho');

function board(cards: KanbanBoard['cards'] = [], at = T0): KanbanBoard {
  return {
    id: TRAB,
    category: 'trabalho',
    at,
    columns: [
      { id: 'afazer', name: 'A fazer', icon: 'circulo', color: 'cinza', finishes: false },
      { id: 'feito', name: 'Feito', icon: 'check', color: 'verde', finishes: true },
    ],
    cards,
  };
}

const card = (note: string, extra: Partial<KanbanBoard['cards'][number]> = {}) => ({ note, column: 'afazer', importance: null, ...extra });

describe('só no Kanban: o que se guarda', () => {
  it('a escolha da anotação é sim ou não; outra coisa (ou nada) segue o grupo', () => {
    const b = sanitizeBoard({ ...board(), cards: [{ ...card('na'), wall: false }, { ...card('nb'), wall: true }, { ...card('nc'), wall: 'nao' }, card('nd')] })!;
    expect(b.cards.map((c) => c.wall)).toEqual([false, true, undefined, undefined]);
    expect('wall' in b.cards[2]).toBeFalse();
  });

  it('setWall põe e tira a escolha, com a hora da anotação e do quadro; igual, nada muda', () => {
    const b = board([card('na', { at: T0 })]);
    const off = setWall(b, 'na', false, T1);
    expect(off.cards[0]).toEqual({ ...card('na'), wall: false, at: T1 });
    expect(off.at).toBe(T1);
    expect(setWall(off, 'na', false, T2)).toBe(off);
    const back = setWall(off, 'na', undefined, T2);
    expect('wall' in back.cards[0]).toBeFalse();
    expect(setWall(b, 'nenhuma', false, T1)).toBe(b);
  });

  it('a escolha da anotação vale mais que a do grupo', () => {
    expect(onWall({}, false)).toBeTrue();
    expect(onWall({}, true)).toBeFalse();
    expect(onWall({ wall: true }, true)).toBeTrue();
    expect(onWall({ wall: false }, false)).toBeFalse();
  });

  it('todo grupo deixa as do quadro só no Kanban; guarda só o grupo que as quer no mural também', () => {
    expect(kanbanOnly(NOTES_CONFIG_DEFAULT, 'Trabalho')).toBeTrue();
    const off = withPrefs(NOTES_CONFIG_DEFAULT, 'Trabalho', { kanbanOnly: false });
    expect(off.categories['trabalho']).toEqual({ kanbanOnly: false });
    expect(kanbanOnly(off, 'TRABALHO')).toBeFalse();
    expect(kanbanOnly(off, 'Estudos')).toBeTrue();
    expect(withPrefs(off, 'Trabalho', { kanbanOnly: undefined }).categories).toEqual({});
    expect(withPrefs(off, 'Trabalho', { kanbanOnly: true }).categories).toEqual({});
    // o `true` guardado antes é o padrão: não fica
    expect(sanitizeNotesConfig({ categories: { trabalho: { kanbanOnly: false }, estudos: { kanbanOnly: true }, casa: { kanbanOnly: 'nao' } } }).categories).toEqual({ trabalho: { kanbanOnly: false } });
  });

  it('na junção, tirar do mural num aparelho fica com o status posto no outro', () => {
    const o = board([card('na', { at: T0 })]);
    const a = setWall(o, 'na', false, T1);
    const b = { ...o, at: T2, cards: [{ ...o.cards[0], status: 'Em revisão', at: T2 }] };
    const merged = mergeBoards(o, a, b);
    expect(merged.cards[0].wall).toBeFalse();
    expect(merged.cards[0].status).toBe('Em revisão');
  });

  it('no Desfazer, a anotação que volta a outra escolha fica com a hora de agora', () => {
    const before = board([card('na', { at: T0 })]);
    const now = setWall(before, 'na', false, T1);
    expect(restoredBoard(before, now, T2).cards[0].at).toBe(T2);
  });

  it('o conflito do quadro diz que a anotação está só no Kanban', () => {
    const lines = boardLines(board([card('na', { wall: false })]), (id) => (id === 'na' ? 'Relatório' : null));
    expect(lines.some((l) => l.includes('“Relatório”') && l.includes('só no Kanban'))).toBeTrue();
  });
});

describe('só no Kanban: o mural', () => {
  let store: ReviewStore;
  let kanban: KanbanStore;
  let settings: Settings;
  let view: WallView;

  const note = (id: string, category: string, extra: Record<string, unknown> = {}): Review => ({
    ...sanitizeReview({ kind: 'anotacoes', game: { name: `Nota ${id}` }, category, completedAt: '2026-10-01', createdAt: T0, updatedAt: T0, ...extra })!,
    id,
  });
  const shown = () => view.visible().map((r) => r.id);

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    kanban = TestBed.inject(KanbanStore);
    settings = TestBed.inject(Settings);
    view = TestBed.inject(WallView);
    TestBed.inject(Mural).kind.set('anotacoes');
    // o mural de antes, com a aba Tudo (sem ela, abre no primeiro grupo: ver note-tabs.spec.ts)
    TestBed.inject(Settings).setNotesConfig({ showAll: true });
    store.reviews.set([note('ntarefa1', 'Trabalho'), note('ntarefa2', 'Trabalho'), note('nreuniao', 'Trabalho'), note('nprova01', 'Estudos')]);
    kanban.state.set({ boards: [board([card('ntarefa1'), card('ntarefa2')])], removed: {}, legacy: [] });
  });

  afterEach(() => localStorage.clear());

  it('sem escolha, as do quadro ficam só no Kanban (o padrão); as de fora do quadro, no mural', () => {
    expect([...kanban.boardOnly()].sort()).toEqual(['ntarefa1', 'ntarefa2']);
    expect(shown().sort()).toEqual(['nprova01', 'nreuniao']);
    expect(view.boardCount()).toBe(2);
    expect(view.hiddenBoard()).toBe(2);
  });

  it('"Mostrar" traz as do Kanban de volta só nesta visita', () => {
    view.showBoard.set(true);
    expect(shown().sort()).toEqual(['nprova01', 'nreuniao', 'ntarefa1', 'ntarefa2']);
    expect(view.boardCount()).toBe(2);
    expect(view.hiddenBoard()).toBe(0);
  });

  it('onBoard tem as do quadro, só no Kanban ou também no mural (a base das sugestões de tag e assunto)', () => {
    expect([...kanban.onBoard()].sort()).toEqual(['ntarefa1', 'ntarefa2']);
    kanban.setOnWall('ntarefa1', true);
    expect([...kanban.onBoard()].sort()).toEqual(['ntarefa1', 'ntarefa2']);
    expect([...kanban.boardOnly()]).toEqual(['ntarefa2']);
  });

  it('a anotação pode escolher o mural também; o grupo pode pôr todas no mural, e a anotação escolher o contrário', () => {
    kanban.setOnWall('ntarefa1', true);
    expect(kanban.get(TRAB)!.cards[0].wall).toBeTrue();
    expect(shown()).toContain('ntarefa1');
    expect(view.boardCount()).toBe(1);
    // o grupo com as do quadro no mural também
    settings.setCategoryPrefs('Trabalho', { kanbanOnly: false });
    expect(kanban.boardOnly().size).toBe(0);
    expect(shown().sort()).toEqual(['nprova01', 'nreuniao', 'ntarefa1', 'ntarefa2']);
    kanban.setOnWall('ntarefa2', false);
    expect(kanban.get(TRAB)!.cards[1].wall).toBeFalse();
    expect(shown()).not.toContain('ntarefa2');
    // igual à do grupo: volta a seguir o grupo (sem o campo)
    kanban.setOnWall('ntarefa1', true);
    expect('wall' in kanban.get(TRAB)!.cards[0]).toBeFalse();
    // o grupo volta ao padrão: as que seguiam saem do mural; a escolhida à mão continua fora
    settings.setCategoryPrefs('Trabalho', { kanbanOnly: undefined });
    expect([...kanban.boardOnly()].sort()).toEqual(['ntarefa1', 'ntarefa2']);
  });

  it('tirada do quadro, ou levada a outro grupo, a anotação volta para o mural', () => {
    kanban.update(TRAB, (b, at) => ({ ...b, at, cards: b.cards.filter((c) => c.note !== 'ntarefa1') }));
    expect(shown()).toContain('ntarefa1');
    store.update({ ...store.get('ntarefa2')!, category: 'Estudos', updatedAt: T1 });
    expect(shown()).toContain('ntarefa2');
    expect(kanban.boardOnly().size).toBe(0);
  });

  it('tirar do quadro diz que a anotação voltou para o mural (ou que continua lá)', () => {
    const toasts = TestBed.inject(Toasts);
    const actions = TestBed.inject(KanbanActions);
    actions.remove(kanban.get(TRAB)!, 'ntarefa1');
    expect(toasts.current()!.text).toBe('“Nota ntarefa1” saiu do quadro (voltou para o mural)');
    kanban.setOnWall('ntarefa2', true);
    actions.remove(kanban.get(TRAB)!, 'ntarefa2');
    expect(toasts.current()!.text).toBe('“Nota ntarefa2” saiu do quadro (continua no mural)');
    expect(shown()).toContain('ntarefa1');
  });

  it('a aba com tudo no Kanban: o mural vazio conta as do Kanban, e não as finalizadas', () => {
    store.update({ ...store.get('nreuniao')!, doneAt: T1, updatedAt: T1 });
    view.setNoteTab('c:trabalho');
    expect(view.pool().length).toBe(0);
    expect(view.hiddenBoard()).toBe(2);
    expect(view.hiddenDone()).toBe(1);
  });

  it('a busca diz que uma do Kanban fala disso', () => {
    view.query.set('ntarefa1');
    expect(view.visible().length).toBe(0);
    expect(view.boardMatches()).toBe(1);
    view.showBoard.set(true);
    expect(view.boardMatches()).toBe(0);
    expect(shown()).toEqual(['ntarefa1']);
  });
});
