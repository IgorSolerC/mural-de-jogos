import { Component, provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { provideRouter } from '@angular/router';
import { RouterTestingHarness } from '@angular/router/testing';
import { canvasPath } from '../core/areas';
import { CANVAS_DEFAULT_TITLE, CanvasLink } from '../core/canvas-link';
import { Desk } from '../core/desk';
import { deleteDatabase } from '../core/erase-save';
import { FbNode, addPieces, newBoardId, newFreeBoard } from '../core/free-board';
import { BOARDS_DB, FreeBoardStore } from '../core/free-board-store';
import { ReviewStore } from '../core/review-store';
import { thawStorage } from '../core/storage';
import { CanvasPage } from './canvas-page';
import { canvasNoteId } from '../core/canvas-id';
import { FreeBoardSync } from '../core/free-board-sync';
import { sanitizeReview } from '../core/review';
import { SharedEntry, SharedStore } from '../core/shared-store';

@Component({ template: '<p class="mural">o mural</p>' })
class WallStub {}

const text = (i: string): FbNode => ({ i, t: 'x', x: 0, y: 0, w: 120, h: 52, txt: i });

/** O canvas aberto (PLANO-CANVAS.md, 3.2 e 3.3): a tela cheia, o nome no topo, os Detalhes e o canvas vazio que some. */
describe('o canvas aberto (CanvasPage)', () => {
  let harness: RouterTestingHarness;
  let link: CanvasLink;
  let store: ReviewStore;
  let boards: FreeBoardStore;

  const settle = async (n = 6) => {
    for (let i = 0; i < n; i++) {
      harness.detectChanges();
      await new Promise((r) => setTimeout(r, 20));
    }
  };
  const $ = <T extends Element = HTMLElement>(sel: string) => document.querySelector<T>(sel);

  beforeEach(async () => {
    localStorage.clear();
    await deleteDatabase(BOARDS_DB);
    TestBed.configureTestingModule({
      providers: [
        provideZonelessChangeDetection(),
        provideRouter([
          { path: 'anotacoes/canvas/:id', component: CanvasPage },
          { path: 'anotacoes', component: WallStub },
        ]),
      ],
    });
    store = TestBed.inject(ReviewStore);
    boards = TestBed.inject(FreeBoardStore);
    link = TestBed.inject(CanvasLink);
    await boards.ready;
    harness = await RouterTestingHarness.create();
  });

  afterEach(async () => {
    thawStorage();
    document.documentElement.style.overflow = '';
    TestBed.resetTestingModule();
    await new Promise((r) => setTimeout(r, 0));
    await deleteDatabase(BOARDS_DB);
    localStorage.clear();
  });

  it('abre o quadro em tela cheia, com o nome da anotação no topo e os Detalhes, que abrem o editor dela', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    await harness.navigateByUrl(canvasPath(note.id));
    await settle();
    expect($('.tela-cheia app-free-board')).not.toBeNull();
    expect($<HTMLInputElement>('.nome-campo')!.value).toBe(CANVAS_DEFAULT_TITLE);
    expect($('.tela-cheia')!.getAttribute('aria-label')).toBe(`Canvas ${CANVAS_DEFAULT_TITLE}`);
    // ver primeiro: o Editar, e não o Pronto
    expect($('.etiqueta-topo.editar')).not.toBeNull();
    const edit = spyOn(TestBed.inject(Desk), 'editReview');
    $<HTMLButtonElement>('.etiqueta-topo.detalhes')!.click();
    expect(edit).toHaveBeenCalledWith(note.id);
  });

  it('o canvas novo (?novo=1) abre já no Editar, com o nome selecionado; renomear muda a anotação e o quadro', async () => {
    const note = await link.create({ category: 'Jogos', audience: 'privada' });
    await harness.navigateByUrl(`${canvasPath(note.id)}?novo=1`);
    await settle();
    expect($('.etiqueta-topo.pronto')).not.toBeNull();
    const field = $<HTMLInputElement>('.nome-campo')!;
    expect(document.activeElement).toBe(field);
    expect(field.selectionStart).toBe(0);
    expect(field.selectionEnd).toBe(CANVAS_DEFAULT_TITLE.length);
    field.value = '  Mapa   da viagem ';
    field.dispatchEvent(new Event('blur'));
    await settle();
    expect(store.get(note.id)!.game.name).toBe('Mapa da viagem');
    expect(boards.get(note.canvas!)!.nome).toBe('Mapa da viagem');
    // o "?novo" sai do endereço (recarregar não seleciona o nome de novo)
    expect(location.search).not.toContain('novo');
  });

  it('o canvas novo em que nada foi feito some ao sair, sem perguntar; com uma peça, fica', async () => {
    const empty = await link.create({ category: 'Jogos', audience: 'privada' });
    await harness.navigateByUrl(`${canvasPath(empty.id)}?novo=1`);
    await settle();
    $<HTMLElement>('app-free-board-top .voltar')!.click();
    await settle();
    expect(store.get(empty.id)).toBeUndefined();
    expect(boards.get(empty.canvas!)).toBeNull();
    expect($('.mural')).not.toBeNull();

    const used = await link.create({ category: 'Jogos', audience: 'privada' });
    await boards.update(used.canvas!, (b) => addPieces(b, [text('n1')], [], new Date().toISOString()).board);
    await harness.navigateByUrl(`${canvasPath(used.id)}?novo=1`);
    await settle();
    $<HTMLElement>('app-free-board-top .voltar')!.click();
    await settle();
    expect(store.get(used.id)).toBeTruthy();
  });

  it('saindo por outro caminho (o voltar do navegador, outro link), o canvas novo vazio também sai', async () => {
    const empty = await link.create({ category: 'Jogos', audience: 'privada' });
    await harness.navigateByUrl(`${canvasPath(empty.id)}?novo=1`);
    await settle();
    await harness.navigateByUrl('/anotacoes');
    await settle();
    expect(store.get(empty.id)).toBeUndefined();
  });

  it('o canvas que não está aqui (apagado): o aviso, e voltar para o mural', async () => {
    await harness.navigateByUrl(canvasPath('cv-Mapa0viagem0Portugal01'));
    await settle();
    expect($('.tela-cheia .aviso')!.textContent).toContain('Este canvas não está aqui');
    $<HTMLButtonElement>('.tela-cheia .aviso button')!.click();
    await settle();
    expect($('.mural')).not.toBeNull();
  });

  it('o canvas compartilhado com quem só lê (PLANO-CANVAS.md, 6): o nome sem campo, sem os Detalhes e sem o Editar', async () => {
    const id = newBoardId();
    await boards.save(newFreeBoard('Planta', 'Trabalho', '2026-11-20T10:00:00.000Z', id)!);
    TestBed.inject(FreeBoardSync).shared.set(new Map([[id, { papel: 'leitor', dono: { codigo: 'ABCD-1234', nome: 'Ana' }, grupo: null }]]));
    const note = sanitizeReview({
      id: canvasNoteId(id),
      kind: 'anotacoes',
      game: { name: 'Planta', source: 'manual' },
      text: '',
      completedAt: '2026-11-20',
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
    })!;
    store.setShared([note]);
    TestBed.inject(SharedStore).entries.set(new Map([[note.id, { id: note.id, papel: 'leitor', grupo: null, membros: [], view: note } as unknown as SharedEntry]]));
    await harness.navigateByUrl(canvasPath(note.id));
    await settle();
    expect($('.tela-cheia app-free-board')).not.toBeNull();
    expect($('.nome-campo')).toBeNull();
    expect($('.nome-quadro')!.textContent!.trim()).toBe('Planta');
    expect($('.etiqueta-topo.detalhes')).toBeNull();
    expect($('.etiqueta-topo.editar')).toBeNull();
    // (sem a conta, não há com quem compartilhar: a etiqueta só aparece com ela)
    expect($('.etiqueta-topo.compartilhar')).toBeNull();
  });

  it('o editor da anotação compartilhada muda o nome e abre os Detalhes; o quadro é do dono, e ele edita', async () => {
    const id = newBoardId();
    await boards.save(newFreeBoard('Planta', 'Trabalho', '2026-11-20T10:00:00.000Z', id)!);
    TestBed.inject(FreeBoardSync).shared.set(new Map([[id, { papel: 'editor', dono: { codigo: 'ABCD-1234', nome: 'Ana' }, grupo: null }]]));
    const note = sanitizeReview({
      id: canvasNoteId(id),
      kind: 'anotacoes',
      game: { name: 'Planta', source: 'manual' },
      text: '',
      completedAt: '2026-11-20',
      createdAt: '2026-11-20T10:00:00.000Z',
      updatedAt: '2026-11-20T10:00:00.000Z',
    })!;
    store.setShared([note]);
    TestBed.inject(SharedStore).entries.set(new Map([[note.id, { id: note.id, papel: 'editor', grupo: null, membros: [], view: note } as unknown as SharedEntry]]));
    await harness.navigateByUrl(canvasPath(note.id));
    await settle();
    expect($<HTMLInputElement>('.nome-campo')!.value).toBe('Planta');
    expect($('.etiqueta-topo.detalhes')).not.toBeNull();
    expect($('.etiqueta-topo.editar')).not.toBeNull();
  });
});
