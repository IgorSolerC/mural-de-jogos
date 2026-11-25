import { provideZonelessChangeDetection, signal } from '@angular/core';
import { CloudAccount } from './cloud-account';
import { CloudSync } from './cloud-sync';
import { SharedStore } from './shared-store';
import { TestBed } from '@angular/core/testing';
import { CANVAS_ID_PREFIX, boardIdOfNote, canvasNoteId } from './canvas-id';
import { CANVAS_DEFAULT_TITLE, CANVAS_NO_GROUP, CanvasLink } from './canvas-link';
import { deleteDatabase } from './erase-save';
import { FbNode, addPieces, boardsMovedGroup, newBoardId, newFreeBoard } from './free-board';
import { BOARDS_DB, FreeBoardStore } from './free-board-store';
import { FreeBoardSync } from './free-board-sync';
import { canvasSearchText } from './free-board-text';
import { boardIdFor, placeCard } from './kanban';
import { KanbanStore } from './kanban-store';
import { Review, isCanvas, sanitizeReview, storedNote } from './review';
import { ReviewStore } from './review-store';
import { StudyStore } from './study-store';
import { thawStorage } from './storage';
import { localDay } from './dates';
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

  it('o quadro mexido à parte (um site antigo, a API) volta ao que a anotação diz', async () => {
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

  it('o quadro apagado à parte (um site antigo, outro caminho) leva a anotação junto', async () => {
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

  it('o canvas compartilhado com o quadro seu: o quadro segue a anotação; apagada para todos, o quadro vai junto (PLANO-CANVAS.md, 6)', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    const cur = store.get(note.id)!;
    // compartilhada (aqui ou em outro aparelho): a anotação passa a vir da nuvem das compartilhadas
    store.setShared([{ ...cur, game: { ...cur.game, name: 'Planta da casa' }, updatedAt: new Date().toISOString() }]);
    await settle(link);
    expect(store.sharedIds().has(note.id)).toBeTrue();
    expect(boards.get(note.canvas!)!.nome).toBe('Planta da casa');
    // apagada para todos (a nuvem tirou daqui): o quadro sai junto
    store.setShared([]);
    await settle(link);
    expect(store.get(note.id)).toBeUndefined();
    expect(boards.get(note.canvas!)).toBeNull();
  });

  it('o canvas compartilhado com você: o quadro é de quem compartilhou, e nada aqui mexe nele (nem quando você sai)', async () => {
    const id = newBoardId();
    await boards.save(newFreeBoard('Do dono', 'Trabalho', T0, id)!);
    TestBed.inject(FreeBoardSync).shared.set(new Map([[id, { papel: 'editor', dono: { codigo: 'ABCD-1234', nome: 'Ana' }, grupo: null }]]));
    store.setShared([sanitizeReview(raw(canvasNoteId(id), { game: { name: 'Planta', source: 'manual' } }))!]);
    await settle(link);
    // o nome e o grupo do quadro são do dono (a anotação dele também chega a ele)
    expect(boards.get(id)).toEqual(jasmine.objectContaining({ nome: 'Do dono', grupo: 'Trabalho' }));
    // saiu da anotação: quem tira o quadro daqui é a lista dos quadros (a nuvem deixa de dar), não o elo
    store.setShared([]);
    await settle(link);
    expect(boards.get(id)).toBeTruthy();
  });

  it('o quadro sem anotação nenhuma (o da aba Quadro livre, que saiu) vira canvas: o nome, o grupo, o dia e o público dele (rodada 5)', async () => {
    const id = newBoardId();
    await boards.save({ ...newFreeBoard('Mansão', 'Jogos', '2026-10-03T15:20:00.000Z', id)!, publico: true });
    const solo = newBoardId();
    await boards.save(newFreeBoard('Rascunho', CANVAS_NO_GROUP, '2026-10-04T09:00:00.000Z', solo)!);
    await settle(link);
    const note = store.get(canvasNoteId(id))!;
    expect(note).toEqual(
      jasmine.objectContaining({ kind: 'anotacoes', text: '', category: 'Jogos', completedAt: localDay(new Date('2026-10-03T15:20:00.000Z')), stock: 'cinza', createdAt: '2026-10-03T15:20:00.000Z', canvas: id }),
    );
    expect(note.game.name).toBe('Mansão');
    // o público vira "visível": à mostra como estava, sem ir para o Feed de ninguém
    expect(note.private).toBeUndefined();
    expect(note.quiet).toBeTrue();
    // o sem grupo fica sem grupo, e o privado, privado
    const other = store.get(canvasNoteId(solo))!;
    expect(other.category).toBeUndefined();
    expect(other.private).toBeTrue();
    // o quadro continua o mesmo, e o canvas não se faz duas vezes
    await settle(link);
    expect(store.notes().filter(isCanvas).length).toBe(2);
    expect(boards.get(id)!.nome).toBe('Mansão');
  });

  it('o Desfazer do apagar não deixa a conversão fazer outra anotação no meio (o quadro volta antes dela)', async () => {
    const note = await link.create({ category: 'Jogos', folder: 'a1234567', audience: 'privada' });
    store.update({ ...store.get(note.id)!, tags: ['Planta'], updatedAt: new Date().toISOString() }, store.get(note.id)!);
    await settle(link);
    const removed = (await link.remove(note.id))!;
    // o elo acerta tudo entre o quadro voltar e a anotação voltar (o pior momento)
    const restore = boards.restore.bind(boards);
    spyOn(boards, 'restore').and.callFake(async (b) => {
      const back = await restore(b);
      await link.reconcile();
      return back;
    });
    await link.undoRemove(removed);
    await settle(link);
    const back = store.get(note.id)!;
    expect(back.tags).toEqual(['Planta']);
    expect(back.folder).toBe('a1234567');
    expect(store.notes().filter((n) => n.id === note.id).length).toBe(1);
  });

  it('o quadro cuja anotação saiu depois da última mexida nele não volta como canvas: sai junto', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    await new Promise((r) => setTimeout(r, 5));
    store.remove(note.id);
    await settle(link);
    expect(boards.get(note.canvas!)).toBeNull();
    expect(store.get(note.id)).toBeUndefined();
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

describe('canvas: a conversão com a conta (PLANO-CANVAS.md, rodada 5)', () => {
  let link: CanvasLink;
  let store: ReviewStore;
  let boards: FreeBoardStore;
  const active = signal(true);
  const lastSyncAt = signal<number | null>(null);

  beforeEach(async () => {
    localStorage.clear();
    await deleteDatabase(BOARDS_DB);
    active.set(true);
    lastSyncAt.set(null);
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: CloudSync, useValue: { active, lastSyncAt } }],
    });
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

  it('com a conta, o quadro espera o mural da nuvem descer nesta página (o canvas feito em outro aparelho ainda vem chegando)', async () => {
    const id = newBoardId();
    await boards.save(newFreeBoard('Mansão', 'Jogos', T0, id)!);
    await settle(link);
    expect(store.get(canvasNoteId(id))).toBeUndefined();
    // a anotação de outro aparelho chega com o mural, com o que só ela tem (as tags): ela vale, e nada se converte
    store.add(sanitizeReview(raw(canvasNoteId(id), { tags: ['Planta'] }))!);
    lastSyncAt.set(Date.now() + 1);
    await settle(link);
    expect(store.get(canvasNoteId(id))!.tags).toEqual(['Planta']);
    // (e a lista das compartilhadas também: a anotação dele pode ser uma compartilhada, a de um grupo)
    const other0 = newBoardId();
    await boards.save(newFreeBoard('Ainda não', 'Jogos', T0, other0)!);
    await settle(link);
    expect(store.get(canvasNoteId(other0))).toBeUndefined();
    TestBed.inject(SharedStore).listedAt.set(Date.now() + 1);
    await settle(link);
    expect(store.get(canvasNoteId(id))!.tags).toEqual(['Planta']);
    // um quadro sem anotação nenhuma, depois da descida: vira canvas
    const other = newBoardId();
    await boards.save(newFreeBoard('Velho', 'Jogos', T0, other)!);
    await settle(link);
    expect(store.get(canvasNoteId(other))?.canvas).toBe(other);
  });

  it('as pessoas chamadas só para o quadro passam para a anotação, com os mesmos papéis, e saem do quadro', async () => {
    lastSyncAt.set(Date.now() + 1);
    TestBed.inject(SharedStore).listedAt.set(Date.now() + 1);
    const id = newBoardId();
    await boards.save(newFreeBoard('Planta', 'Trabalho', T0, id)!);
    await settle(link);
    const shared = TestBed.inject(SharedStore);
    const share = spyOn(shared, 'share').and.resolveTo({} as never);
    const calls: string[] = [];
    spyOn(TestBed.inject(CloudAccount), 'request').and.callFake(((path: string, init?: { method?: string }) => {
      calls.push(`${init?.method ?? 'GET'} ${path}`);
      return Promise.resolve(path.endsWith('/membros') ? { membros: [{ codigo: 'BXAA-0001', papel: 'editor' }, { codigo: 'CRSS-0002', papel: 'leitor' }] } : {});
    }) as never);
    TestBed.inject(FreeBoardSync).withPeople.set(new Set([id]));
    await settle(link);
    expect(share).toHaveBeenCalledOnceWith(jasmine.objectContaining({ id: canvasNoteId(id) }), [
      { codigo: 'BXAA-0001', papel: 'editor' },
      { codigo: 'CRSS-0002', papel: 'leitor' },
    ]);
    expect(calls).toEqual([`GET /v1/eu/quadros/${id}/membros`, `DELETE /v1/eu/quadros/${id}/membros/BXAA-0001`, `DELETE /v1/eu/quadros/${id}/membros/CRSS-0002`]);
  });
});
