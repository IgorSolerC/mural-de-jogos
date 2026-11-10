import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { deleteDatabase } from './erase-save';
import { FbNode, FreeBoard, addPieces, moveNodes, patchNodes, sanitizeFreeBoard } from './free-board';
import { BOARDS_DB, FreeBoardProblem, FreeBoardStore } from './free-board-store';
import { freezeStorage, thawStorage } from './storage';
import { ReviewStore } from './review-store';
import { readBackupFile } from './backup-file';

const text = (i: string, txt = i, x = 0, y = 0): FbNode => ({ i, t: 'x', x, y, w: 120, h: 52, txt });

/** Outra aba: outra loja, com a própria memória e o próprio aviso, no mesmo banco. */
function otherTab(): FreeBoardStore {
  return TestBed.runInInjectionContext(() => new FreeBoardStore());
}

/** Espera o aviso de uma aba chegar na outra (o BroadcastChannel entrega numa volta do laço). */
function settle(ms = 60): Promise<void> {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

describe('Quadro livre: a loja do aparelho', () => {
  beforeEach(async () => {
    await deleteDatabase(BOARDS_DB);
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });

  afterEach(async () => {
    thawStorage();
    TestBed.resetTestingModule();
    await settle(0);
    await deleteDatabase(BOARDS_DB);
  });

  it('cria o quadro no grupo, guarda no banco e o lê de novo numa loja nova (outra visita)', async () => {
    const store = TestBed.inject(FreeBoardStore);
    await store.ready;
    const b = await store.create('Blue Prince', 'jogos');
    expect(b.grupo).toBe('Jogos');
    expect(store.count()).toBe(1);
    expect(store.record(b.id)).toEqual(jasmine.objectContaining({ rev: 0, sujo: true, base: null }));
    const again = otherTab();
    await again.ready;
    expect(again.get(b.id)).toEqual(b);
    expect(again.inGroup('JOGOS').map((x) => x.nome)).toEqual(['Blue Prince']);
  });

  it('o nome repetido no grupo ganha número, e a lista vem com o mexido por último primeiro', async () => {
    const store = TestBed.inject(FreeBoardStore);
    const a = await store.create('Mapa', 'Jogos');
    const b = await store.create('Mapa', 'Jogos');
    expect(b.nome).toBe('Mapa (2)');
    await store.update(a.id, (x) => ({ ...addPieces(x, [text('n1')], [], new Date().toISOString()).board, em: new Date(Date.now() + 1000).toISOString() }));
    expect(store.boards().map((x) => x.nome)).toEqual(['Mapa', 'Mapa (2)']);
  });

  it('o quadro que nunca subiu sai de vez ao apagar; o Desfazer o põe de volta', async () => {
    const store = TestBed.inject(FreeBoardStore);
    const b = await store.create('Rascunho', 'Estudos');
    const gone = await store.remove(b.id);
    expect(gone?.id).toBe(b.id);
    expect(store.count()).toBe(0);
    expect(store.record(b.id)).toBeNull();
    await store.restore(gone!);
    expect(store.get(b.id)?.nome).toBe('Rascunho');
  });

  it('duas abas mexendo no mesmo quadro: a que grava depois junta com a da outra, sem perder nada', async () => {
    const a = TestBed.inject(FreeBoardStore);
    const first = await a.create('Blue Prince', 'Jogos');
    const withPieces = await a.save(addPieces(first, [text('n1', 'Nursery'), text('n2', 'Boudoir')], [], new Date().toISOString()).board);
    const b = otherTab();
    await b.ready;
    const fromB = b.get(first.id)!;
    // a aba A anda com n1; a aba B, que partiu da mesma versão, muda o texto de n2
    await a.update(first.id, (x) => moveNodes(x, new Set(['n1']), 260, 0, new Date().toISOString()));
    await settle();
    const changed = patchNodes(fromB, new Set(['n2']), (n) => ({ ...n, txt: 'Boudoir (cofre)' }), new Date().toISOString());
    const saved = await b.save(changed, fromB);
    expect(saved.n.find((n) => n.i === 'n1')?.x).toBe(260);
    expect(saved.n.find((n) => n.i === 'n2')?.['txt']).toBe('Boudoir (cofre)');
    // e a aba A fica sabendo
    await settle();
    expect(a.get(first.id)?.n.find((n) => n.i === 'n2')?.['txt']).toBe('Boudoir (cofre)');
    expect(withPieces.n.length).toBe(2);
  });

  it('a gravação parte da versão que a tela tinha: ouvindo ou não a outra aba, junta', async () => {
    const a = TestBed.inject(FreeBoardStore);
    const board = await a.create('Rotas', 'Jogos');
    const b = otherTab();
    await b.ready;
    // sem esperar o aviso: B grava logo depois de A
    const savedA = a.save(addPieces(board, [text('da')], [], new Date().toISOString()).board, board);
    const fromB = b.get(board.id)!;
    await savedA;
    const savedB = await b.save(addPieces(fromB, [text('db')], [], new Date().toISOString()).board, fromB);
    expect(savedB.n.map((n) => n.i).sort()).toEqual(['da', 'db']);
  });

  it('apagado em outra aba e mexido nesta: o quadro volta (mexido vence apagado)', async () => {
    const a = TestBed.inject(FreeBoardStore);
    const board = await a.create('Mansão', 'Jogos');
    const b = otherTab();
    await b.ready;
    const fromB = b.get(board.id)!;
    await a.remove(board.id);
    await settle();
    expect(b.get(board.id)).toBeNull();
    const back = await b.save(addPieces(fromB, [text('n1')], [], new Date().toISOString()).board, fromB);
    expect(back.n.length).toBe(1);
    await settle();
    expect(a.get(board.id)?.n.length).toBe(1);
  });

  it('o grupo renomeado leva os quadros; o grupo apagado os leva embora', async () => {
    const store = TestBed.inject(FreeBoardStore);
    const one = await store.create('Um', 'Jogos');
    const two = await store.create('Dois', 'Estudos');
    expect(store.goingWithGroup('jogos').map((b) => b.nome)).toEqual(['Um']);
    expect(await store.moveGroup('Jogos', 'Games')).toBe(1);
    expect(store.get(one.id)?.grupo).toBe('Games');
    expect(await store.moveGroup('Estudos', null)).toBe(1);
    expect(store.get(two.id)).toBeNull();
    expect(store.boards().map((b) => b.nome)).toEqual(['Um']);
  });

  it('mover para outro grupo, renomear e duplicar', async () => {
    const store = TestBed.inject(FreeBoardStore);
    const b = await store.create('Mapa', 'Jogos');
    await store.update(b.id, (x) => addPieces(x, [text('n1')], [], new Date().toISOString()).board);
    expect((await store.moveToGroup(b.id, 'estudos'))?.grupo).toBe('Estudos');
    expect((await store.rename(b.id, '  mapa   da mansão '))?.nome).toBe('Mapa da mansão');
    expect((await store.rename(b.id, '   '))?.nome).toBe('Mapa da mansão');
    const copy = (await store.duplicate(b.id))!;
    expect(copy.id).not.toBe(b.id);
    expect(copy.nome).toBe('Mapa da mansão (2)');
    expect(copy.n.map((n) => n.i)).toEqual(['n1']);
  });

  it('as imagens dos quadros (para a nuvem não apagá-las como soltas)', async () => {
    const store = TestBed.inject(FreeBoardStore);
    const b = await store.create('Fotos', 'Jogos');
    const id = 'c'.repeat(22);
    await store.update(b.id, (x) => addPieces(x, [{ i: 'w1', t: 'w', x: 0, y: 0, w: 240, h: 180, src: `{{imagem: murall://imagem/${id} | foto}}` }], [], new Date().toISOString()).board);
    expect(await store.imageIds()).toEqual([id]);
  });

  it('o backup leva os quadros e, ao voltar, entra o que falta e o que está mais novo no arquivo', async () => {
    const store = TestBed.inject(FreeBoardStore);
    const here = await store.create('Aqui', 'Jogos');
    const backup = await store.forBackup();
    expect(backup.map((b) => b.nome)).toEqual(['Aqui']);
    const old = { ...here, nome: 'Velho', em: '2000-01-01T00:00:00.000Z' };
    const fresh = sanitizeFreeBoard({ v: 1, id: 'f'.repeat(22), nome: 'Do arquivo', grupo: 'Estudos', em: new Date().toISOString(), n: [], e: [] })!;
    expect(await store.fromBackup({ quadros: [old, fresh, { lixo: true }] })).toBe(1);
    expect(store.get(here.id)?.nome).toBe('Aqui');
    expect(store.get(fresh.id)?.nome).toBe('Do arquivo');
    expect(await store.fromBackup({})).toBe(0);
    const newer = { ...here, nome: 'Mais novo', em: new Date(Date.now() + 60_000).toISOString() };
    expect(await store.fromBackup({ quadros: [newer] })).toBe(1);
    expect(store.get(here.id)?.nome).toBe('Mais novo');
  });

  it('o arquivo de backup do mural leva os quadros ao lado dele', async () => {
    localStorage.clear();
    const store = TestBed.inject(FreeBoardStore);
    await store.create('Mapa', 'Jogos');
    const { blob } = await TestBed.inject(ReviewStore).exportBackup();
    const json = JSON.parse(await readBackupFile(blob)) as { quadros?: FreeBoard[] };
    expect(json.quadros?.map((b) => b.nome)).toEqual(['Mapa']);
    localStorage.clear();
  });

  it('a câmera de cada quadro fica só neste aparelho, no zoom permitido', async () => {
    const store = TestBed.inject(FreeBoardStore);
    expect(await store.camera('q'.repeat(22))).toBeNull();
    await store.setCamera('q'.repeat(22), { x: -120, y: 40.5, z: 9 });
    expect(await store.camera('q'.repeat(22))).toEqual({ x: -120, y: 40.5, z: 4 });
  });

  it('com a página recarregando para limpar o navegador, nada é gravado', async () => {
    const store = TestBed.inject(FreeBoardStore);
    await store.ready;
    freezeStorage();
    const b = await store.create('Congelado', 'Jogos');
    expect(store.count()).toBe(0);
    thawStorage();
    const again = otherTab();
    await again.ready;
    expect(again.get(b.id)).toBeNull();
  });

  it('quadro sem grupo ou grande demais não é guardado, com o porquê', async () => {
    const store = TestBed.inject(FreeBoardStore);
    await expectAsync(store.create('Sem grupo', '   ')).toBeRejectedWithError(FreeBoardProblem);
    const b = await store.create('Grande', 'Jogos');
    const huge = Array.from({ length: 600 }, (_, k): FbNode => text(`n${k}x`, 'x'.repeat(4000)));
    await expectAsync(store.save({ ...b, n: huge } as FreeBoard)).toBeRejectedWithError(FreeBoardProblem);
  });
});
