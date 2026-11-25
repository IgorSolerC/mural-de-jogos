import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { CANVAS_ID_PREFIX, boardIdOfNote, canvasNoteId } from './canvas-id';
import { CANVAS_DEFAULT_TITLE, CANVAS_NO_GROUP, CanvasLink } from './canvas-link';
import { deleteDatabase } from './erase-save';
import { FbNode, addPieces, boardsMovedGroup, newBoardId, newFreeBoard } from './free-board';
import { BOARDS_DB, FreeBoardStore } from './free-board-store';
import { canvasSearchText } from './free-board-text';
import { boardIdFor, placeCard } from './kanban';
import { KanbanStore } from './kanban-store';
import { Review, isCanvas, sanitizeReview, storedNote } from './review';
import { ReviewStore } from './review-store';
import { StudyStore } from './study-store';
import { thawStorage } from './storage';
import { fold } from './text';
import { matchesQuery } from './wall-filter';

/** O canvas no mural (PLANO-CANVAS.md, rodada 1): os dados, o elo com o quadro e o que fica de fora dele. */

const text = (i: string, txt = i, x = 0, y = 0): FbNode => ({ i, t: 'x', x, y, w: 120, h: 52, txt });
const T0 = '2026-11-20T10:00:00.000Z';

/** Uma anotação crua (como vem do armazenamento). */
const raw = (id: string, extra: Record<string, unknown> = {}) => ({
  id,
  kind: 'anotacoes',
  game: { name: 'Mapa do jogo', source: 'manual' },
  text: '',
  completedAt: '2026-11-20',
  category: 'Jogos',
  createdAt: T0,
  updatedAt: T0,
  ...extra,
});

/** Espera o reconciliador (o effect roda no tick; a passada, depois do banco). */
async function settle(link: CanvasLink): Promise<void> {
  for (let i = 0; i < 4; i++) {
    TestBed.tick();
    await link.reconcile();
    await new Promise((r) => setTimeout(r, 10));
  }
}

describe('canvas: a anotação (PLANO-CANVAS.md, 4.1)', () => {
  const board = newBoardId();

  it('o id `cv-` e o do quadro faz o canvas: o campo sai do id', () => {
    const r = sanitizeReview(raw(canvasNoteId(board)))!;
    expect(r.id).toBe(CANVAS_ID_PREFIX + board);
    expect(r.canvas).toBe(board);
    expect(isCanvas(r)).toBeTrue();
    expect(boardIdOfNote(r.id)).toBe(board);
  });

  it('um site de antes do canvas jogou o campo fora: o id basta, e a anotação volta a ser canvas', () => {
    // o que o site velho grava: a anotação inteira, menos o campo que ele não conhece
    const { canvas: _c, ...stripped } = storedNote(sanitizeReview(raw(canvasNoteId(board)))!);
    expect('canvas' in stripped).toBeFalse();
    const back = sanitizeReview(JSON.parse(JSON.stringify(stripped)))!;
    expect(back.canvas).toBe(board);
  });

  it('a anotação comum não vira canvas, nem com o campo escrito à mão; o id que só parece não vale', () => {
    expect(sanitizeReview(raw('nota-comum1'))!.canvas).toBeUndefined();
    expect(sanitizeReview(raw('nota-comum1', { canvas: board }))!.canvas).toBeUndefined();
    expect(sanitizeReview(raw('cv-curto'))!.canvas).toBeUndefined();
    expect(isCanvas(sanitizeReview(raw('nota-comum1')))).toBeFalse();
    expect(isCanvas(null)).toBeFalse();
  });

  it('a resenha (fora das anotações) nunca é canvas', () => {
    const r = sanitizeReview({ ...raw(canvasNoteId(board)), kind: 'jogos', scores: { final: 8 }, status: 'finalizado' })!;
    expect(r.canvas).toBeUndefined();
  });

  it('vai e volta pelo armazenamento e pelo backup igual', () => {
    const r = sanitizeReview(raw(canvasNoteId(board)))!;
    expect(sanitizeReview(JSON.parse(JSON.stringify(storedNote(r))))).toEqual(r);
  });
});

describe('canvas: o elo com o quadro (PLANO-CANVAS.md, 4.2)', () => {
  let link: CanvasLink;
  let store: ReviewStore;
  let boards: FreeBoardStore;

  beforeEach(async () => {
    localStorage.clear();
    await deleteDatabase(BOARDS_DB);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    boards = TestBed.inject(FreeBoardStore);
    link = TestBed.inject(CanvasLink);
    await boards.ready;
  });

  afterEach(async () => {
    thawStorage();
    TestBed.resetTestingModule();
    await new Promise((r) => setTimeout(r, 0));
    await deleteDatabase(BOARDS_DB);
    localStorage.clear();
  });

  it('criar: o quadro vazio e a anotação que aponta para ele, num passo só, no grupo e na pasta abertos', async () => {
    const note = await link.create({ category: 'Jogos', folder: 'a1234567', audience: 'privada' });
    expect(note.id).toBe(canvasNoteId(note.canvas!));
    expect(note).toEqual(jasmine.objectContaining({ kind: 'anotacoes', text: '', category: 'Jogos', folder: 'a1234567', stock: 'cinza', private: true }));
    expect(note.game.name).toBe(CANVAS_DEFAULT_TITLE);
    const b = boards.get(note.canvas!)!;
    expect(b).toEqual(jasmine.objectContaining({ nome: CANVAS_DEFAULT_TITLE, grupo: 'Jogos', n: [], e: [] }));
    expect(b.publico).toBeUndefined();
    expect(store.get(note.id)).toEqual(note);
  });

  it('o público da anotação vai para o quadro; o sem grupo mora num grupo do quadro só dele', async () => {
    const pub = await link.create({ category: null, audience: 'publicar' });
    expect(pub.category).toBeUndefined();
    expect(boards.get(pub.canvas!)).toEqual(jasmine.objectContaining({ grupo: CANVAS_NO_GROUP, publico: true }));
    // o segundo sem nome ganha número no quadro, e a anotação tem o mesmo nome
    const again = await link.create({ category: null, audience: 'visivel' });
    expect(again.game.name).toBe(`${CANVAS_DEFAULT_TITLE} (2)`);
    expect(boards.get(again.canvas!)!.nome).toBe(again.game.name);
    expect(boards.get(again.canvas!)!.publico).toBeTrue();
  });

  it('renomear muda a anotação, e o elo leva ao quadro (nunca o contrário)', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    const next = (await link.rename(note.id, '  Mapa   do jogo '))!;
    expect(next.game.name).toBe('Mapa do jogo');
    expect(boards.get(note.canvas!)!.nome).toBe('Mapa do jogo');
    // o nome vazio não apaga o título
    expect((await link.rename(note.id, '   '))!.game.name).toBe('Mapa do jogo');
  });

  it('mudar a anotação por qualquer caminho (o editor, a API): o reconciliador leva o grupo, o nome e o público ao quadro', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    const cur = store.get(note.id)!;
    const { private: _p, ...rest } = cur;
    store.update({ ...rest, category: 'Estudos', game: { ...cur.game, name: 'Kana' }, updatedAt: new Date().toISOString() }, cur);
    await settle(link);
    expect(boards.get(note.canvas!)).toEqual(jasmine.objectContaining({ grupo: 'Estudos', nome: 'Kana', publico: true }));
  });

  it('o quadro mexido à parte (um site antigo, a aba Quadro livre) volta ao que a anotação diz', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    await boards.rename(note.canvas!, 'Outro nome');
    await boards.moveToGroup(note.canvas!, 'Trabalho');
    await boards.setPublic(note.canvas!, true);
    await settle(link);
    expect(boards.get(note.canvas!)).toEqual(jasmine.objectContaining({ nome: CANVAS_DEFAULT_TITLE, grupo: 'Jogos' }));
    expect(boards.get(note.canvas!)!.publico).toBeUndefined();
  });

  it('apagar leva a anotação (com a lápide) e o quadro; o Desfazer põe os dois de volta, com as peças', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    await boards.update(note.canvas!, (b) => addPieces(b, [text('n1', 'Chefe final')], [], new Date().toISOString()).board);
    const removed = (await link.remove(note.id))!;
    expect(store.get(note.id)).toBeUndefined();
    expect(store.deletedAt(note.id)).not.toBeNull();
    expect(boards.get(note.canvas!)).toBeNull();
    await link.undoRemove(removed);
    await settle(link);
    expect(store.get(note.id)?.canvas).toBe(note.canvas!);
    expect(boards.get(note.canvas!)!.n.map((n) => n.i)).toEqual(['n1']);
  });

  it('apagada por outro caminho (o mural, várias de uma vez, outro aparelho): o quadro sai junto, e volta com o Desfazer', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    await boards.update(note.canvas!, (b) => addPieces(b, [text('n1')], [], new Date().toISOString()).board);
    await new Promise((r) => setTimeout(r, 5));
    const gone = store.remove(note.id)!;
    await settle(link);
    expect(boards.get(note.canvas!)).toBeNull();
    store.undoRemove([gone]);
    await settle(link);
    expect(store.get(note.id)).toBeTruthy();
    expect(boards.get(note.canvas!)!.n.map((n) => n.i)).toEqual(['n1']);
  });

  it('o quadro apagado à parte (a aba Quadro livre) leva a anotação junto', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    await new Promise((r) => setTimeout(r, 5));
    await boards.remove(note.canvas!);
    await settle(link);
    expect(store.get(note.id)).toBeUndefined();
  });

  it('o quadro que esteve aqui e sumiu (apagado em outro aparelho, a nuvem tirou daqui) leva a anotação', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    await settle(link);
    await boards.dropRecord(note.canvas!);
    await settle(link);
    expect(store.get(note.id)).toBeUndefined();
  });

  it('apagado em outro aparelho mas mexido aqui (o quadro vira cópia): o canvas vai junto para a cópia, com as peças', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    await boards.update(note.canvas!, (b) => addPieces(b, [text('n1')], [], new Date().toISOString()).board);
    await settle(link);
    const copy = (await boards.keepCopy(note.canvas!))!;
    await settle(link);
    expect(store.get(note.id)).toBeUndefined();
    const moved = store.get(canvasNoteId(copy.id))!;
    expect(moved.canvas).toBe(copy.id);
    expect(moved.category).toBe('Jogos');
    expect(boards.get(copy.id)!.n.map((n) => n.i)).toEqual(['n1']);
    // a anotação manda: a cópia fica com o nome do canvas
    expect(boards.get(copy.id)!.nome).toBe(moved.game.name);
  });

  it('a anotação que chegou antes do quadro (aparelho novo, a lista dos quadros descendo) fica esperando', async () => {
    const id = newBoardId();
    store.add(sanitizeReview(raw(canvasNoteId(id)))!);
    await settle(link);
    expect(store.get(canvasNoteId(id))?.canvas).toBe(id);
    // o quadro chega, no grupo de outro jeito: o reconciliador acerta pelo da anotação
    await boards.save(newFreeBoard('Mapa do jogo', 'jogos', T0, id)!);
    await settle(link);
    expect(boards.get(id)).toEqual(jasmine.objectContaining({ nome: 'Mapa do jogo', grupo: 'Jogos' }));
  });

  it('o quadro sem anotação nenhuma (um quadro da aba Quadro livre) fica como está: a conversão é a rodada 5', async () => {
    const b = await boards.create('Velho', 'Jogos');
    await settle(link);
    expect(boards.get(b.id)).toBeTruthy();
    expect(store.notes().length).toBe(0);
  });

  it('duplicar: a cópia do quadro, com as peças, e uma anotação nova apontando para ela', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'publicar' });
    await boards.update(note.canvas!, (b) => addPieces(b, [text('n1'), text('n2')], [], new Date().toISOString()).board);
    const copy = (await link.duplicate(note.id))!;
    expect(copy.canvas).not.toBe(note.canvas!);
    expect(copy.id).toBe(canvasNoteId(copy.canvas!));
    expect(copy.game.name).toBe(`${CANVAS_DEFAULT_TITLE} (2)`);
    expect(copy.category).toBe('Jogos');
    expect(boards.get(copy.canvas!)!.n.map((n) => n.i)).toEqual(['n1', 'n2']);
    expect(boards.get(copy.canvas!)!.publico).toBeTrue();
  });

  it('apagar o grupo sem destino: o quadro do canvas fica (a anotação foi para Sem grupo); o quadro livre comum sai', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    const plain = await boards.create('Comum', 'Jogos');
    expect(boardsMovedGroup(boards.boards(), 'Jogos', null, T0, link.canvasBoards()).removed.map((b) => b.id)).toEqual([plain.id]);
    await boards.moveGroup('Jogos', null, link.canvasBoards());
    expect(boards.get(note.canvas!)).toBeTruthy();
    expect(boards.get(plain.id)).toBeNull();
  });

  it('a busca do mural acha o canvas pelo que está escrito no quadro (dobrado, sem acento nem caixa)', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    const b = (await boards.update(note.canvas!, (x) => addPieces(x, [text('n1', 'Coração da Floresta')], [], new Date().toISOString()).board))!;
    const more = (r: Review) => (r.canvas === b.id ? canvasSearchText(boards.get(b.id)!) : '');
    expect(matchesQuery(store.get(note.id)!, fold('coracao'), undefined, more)).toBeTrue();
    expect(matchesQuery(store.get(note.id)!, fold('pantano'), undefined, more)).toBeFalse();
    // sem o texto do quadro, só o título conta
    expect(matchesQuery(store.get(note.id)!, fold('coracao'))).toBeFalse();
    // o mesmo quadro (o mesmo objeto) não monta o texto de novo
    expect(canvasSearchText(b)).toBe(canvasSearchText(b));
  });
});

describe('canvas: fora do Kanban e dos Flashcards (PLANO-CANVAS.md, 4.1)', () => {
  const board = newBoardId();
  const canvas = () => sanitizeReview(raw(canvasNoteId(board)))!;
  const plain = () => sanitizeReview(raw('nota-comum1', { game: { name: 'Comum', source: 'manual' } }))!;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    TestBed.inject(ReviewStore).reviews.set([canvas(), plain()]);
  });

  afterEach(() => {
    TestBed.resetTestingModule();
    localStorage.clear();
  });

  it('o Kanban: um cartão de canvas no quadro do grupo não vale (nem conta como no quadro)', () => {
    const kanban = TestBed.inject(KanbanStore);
    const id = boardIdFor('Jogos');
    const col = kanban.boardFor('Jogos').columns[0].id;
    kanban.update(kanban.boardFor('Jogos').id, (b, at) => placeCard(placeCard(b, canvasNoteId(board), col, at), 'nota-comum1', col, at));
    expect(kanban.get(id)).toBeTruthy();
    expect(kanban.onBoard().has('nota-comum1')).toBeTrue();
    expect(kanban.onBoard().has(canvasNoteId(board))).toBeFalse();
    expect(kanban.notesById().has(canvasNoteId(board))).toBeFalse();
    // e ele continua no mural
    expect(kanban.boardOnly().has(canvasNoteId(board))).toBeFalse();
  });

  it('os Flashcards: o canvas não vira carta', () => {
    const study = TestBed.inject(StudyStore);
    const deck = study.addDeck('Jogos', 'azul', null, undefined, 'Jogos');
    study.addCard(canvasNoteId(board), [deck]);
    study.addCard('nota-comum1', [deck]);
    expect(study.cardOf().has(canvasNoteId(board))).toBeFalse();
    expect(study.cardOf().has('nota-comum1')).toBeTrue();
  });
});
