import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoteFolder, folderTree, withFoldersToGroup, withGoneFolders } from './folders';
import { NoteBulk } from './note-bulk';
import { NoteFolders } from './note-folders';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { Confirm } from '../ui/confirm';
import { Toasts } from '../ui/toast';

const T0 = '2026-10-01T10:00:00.000Z';
const AT = '2026-11-17T10:00:00.000Z';
const note = (id: string, category: string, folder?: string): Review => ({
  ...sanitizeReview({
    kind: 'anotacoes',
    game: { name: id, coverUrl: null, source: 'manual' },
    text: '',
    category,
    completedAt: '2026-10-01',
    createdAt: T0,
    updatedAt: T0,
    ...(folder ? { folder } : {}),
  })!,
  id,
});
const f = (id: string, name: string, group = 'estudos', parent: string | null = null): NoteFolder => ({ id, group, name, parent });

/** Editar e apagar com pastas marcadas (PLANO-MARCAR-PASTAS.md, rodada 3). */
describe('levar e apagar pastas (core/folders.ts)', () => {
  const base = [f('parte000001', 'Arte'), f('pbach000001', 'Bach', 'estudos', 'parte000001'), f('pcine000001', 'Cinema'), f('ptrab000001', 'Arte', 'trabalho'), f('pxadr000001', 'Xadrez', 'trabalho')];

  it('levar algumas pastas para outro grupo leva a árvore inteira; a de mesmo nome junta; as outras ficam', () => {
    const out = folderTree(withFoldersToGroup(base, ['parte000001'], 'Trabalho', AT));
    // Arte entrou na Arte de lá (a que chega vira lápide), e a Bach foi junto, agora dentro da de lá
    expect(out.live('parte000001')).toBeUndefined();
    expect(out.resolve('parte000001', 'trabalho')).toBe('ptrab000001');
    expect(out.live('pbach000001')?.group).toBe('trabalho');
    expect(out.parentOf('pbach000001')).toBe('ptrab000001');
    expect(out.live('pcine000001')?.group).toBe('estudos');
  });

  it('dentro de uma pasta do grupo novo; nunca dentro dela mesma', () => {
    const into = folderTree(withFoldersToGroup(base, ['pcine000001'], 'Trabalho', AT, 'pxadr000001'));
    expect(into.parentOf('pcine000001')).toBe('pxadr000001');
    expect(into.live('pcine000001')?.group).toBe('trabalho');
    const self = withFoldersToGroup(base, ['parte000001'], 'Estudos', AT, 'pbach000001');
    expect(self).toEqual(base);
  });

  it('apagar pastas com tudo: elas e as de dentro viram lápide, as outras ficam', () => {
    const out = folderTree(withGoneFolders(base, ['parte000001'], AT));
    expect(out.live('parte000001')).toBeUndefined();
    expect(out.live('pbach000001')).toBeUndefined();
    expect(out.live('pcine000001')).toBeDefined();
  });
});

describe('editar e apagar com pastas marcadas (NoteBulk)', () => {
  let store: ReviewStore;
  let folders: NoteFolders;
  let bulk: NoteBulk;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    folders = TestBed.inject(NoteFolders);
    bulk = TestBed.inject(NoteBulk);
    TestBed.inject(Settings).setNotesConfig({ folders: [f('parte000001', 'Arte'), f('pbach000001', 'Bach', 'estudos', 'parte000001'), f('pcine000001', 'Cinema'), f('pxadr000001', 'Xadrez', 'trabalho')] });
    store.reviews.set([note('n1', 'Estudos'), note('n2', 'Estudos', 'parte000001'), note('n3', 'Estudos', 'pbach000001'), note('n4', 'Estudos', 'pcine000001')]);
  });
  afterEach(() => localStorage.clear());

  const marks = { folders: ['parte000001'], tops: ['n1'] };
  const all = ['n1', 'n2', 'n3'];

  it('o Grupo leva a pasta com tudo dentro, as de dentro ficam nela; a solta muda de grupo e sai da pasta', () => {
    bulk.run(all, { category: 'Trabalho' }, undefined, marks);
    const tree = folders.tree();
    expect(tree.live('parte000001')?.group).toBe('trabalho');
    expect(tree.live('pbach000001')?.group).toBe('trabalho');
    expect(store.get('n2')!.category).toBe('Trabalho');
    expect(tree.of(store.get('n2')!)).toBe('parte000001');
    expect(tree.of(store.get('n3')!)).toBe('pbach000001');
    expect(store.get('n1')!.category).toBe('Trabalho');
    expect(store.get('n4')!.category).toBe('Estudos');
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('1 pasta e 3 anotações mudaram.');
    toast.action!.run();
    expect(folders.tree().live('parte000001')?.group).toBe('estudos');
    expect(store.get('n2')!.category).toBe('Estudos');
    expect(folders.tree().of(store.get('n3')!)).toBe('pbach000001');
  });

  it('o Grupo e a Pasta: as pastas entram na pasta escolhida do grupo novo', () => {
    bulk.run(all, { category: 'Trabalho', folder: 'pxadr000001' }, undefined, marks);
    const tree = folders.tree();
    expect(tree.parentOf('parte000001')).toBe('pxadr000001');
    expect(tree.of(store.get('n1')!)).toBe('pxadr000001');
    expect(tree.of(store.get('n2')!)).toBe('parte000001');
  });

  it('só a Pasta: leva a pasta marcada e a solta; as de dentro ficam onde estão', () => {
    bulk.run(all, { folder: 'pcine000001' }, undefined, marks);
    const tree = folders.tree();
    expect(tree.parentOf('parte000001')).toBe('pcine000001');
    expect(tree.of(store.get('n1')!)).toBe('pcine000001');
    expect(tree.of(store.get('n2')!)).toBe('parte000001');
    expect(tree.of(store.get('n3')!)).toBe('pbach000001');
  });

  it('o resto (as tags) vale para todas, também as de dentro', () => {
    bulk.run(all, { tags: { all: ['Lida'], drop: [] } }, undefined, marks);
    expect(all.map((id) => store.get(id)!.tags)).toEqual([['Lida'], ['Lida'], ['Lida']]);
    expect(store.get('n4')!.tags).toBeUndefined();
  });

  it('Apagar tudo: as anotações e as pastas saem, e o Desfazer volta tudo', async () => {
    const choose = spyOn(TestBed.inject(Confirm), 'choose').and.resolveTo('confirm');
    await bulk.act(all, 'apagar', marks);
    expect(choose.calls.mostRecent().args[0].text).toContain('A pasta marcada sai com tudo o que está dentro (2 anotações), e a anotação marcada também.');
    // o título conta o que foi marcado (as de dentro estão no texto) e a ficha é a vermelha
    expect(choose.calls.mostRecent().args[0].title).toBe('Apagar 1 pasta com o que está dentro e 1 anotação?');
    expect(choose.calls.mostRecent().args[0].tone).toBe('perigo');
    expect(store.get('n1')).toBeUndefined();
    expect(store.get('n3')).toBeUndefined();
    expect(store.get('n4')).toBeDefined();
    expect(folders.tree().live('parte000001')).toBeUndefined();
    expect(folders.tree().live('pbach000001')).toBeUndefined();
    const toast = TestBed.inject(Toasts).current()!;
    expect(toast.text).toBe('1 pasta e 3 anotações apagadas.');
    toast.action!.run();
    expect(store.get('n3')).toBeDefined();
    expect(folders.tree().of(store.get('n3')!)).toBe('pbach000001');
  });

  it('Só desfazer as pastas: o de dentro sobe, e só a marcada solta sai', async () => {
    spyOn(TestBed.inject(Confirm), 'choose').and.resolveTo('secondary');
    await bulk.act(all, 'apagar', marks);
    expect(store.get('n1')).toBeUndefined();
    expect(store.get('n2')).toBeDefined();
    expect(folders.tree().live('parte000001')).toBeUndefined();
    expect(folders.tree().of(store.get('n2')!)).toBeNull();
    // a Bach subiu para a raiz, com a dela dentro
    expect(folders.tree().parentOf('pbach000001')).toBeNull();
    expect(TestBed.inject(Toasts).current()!.text).toBe('A pasta foi desfeita e 1 anotação apagada.');
  });

  it('desistir não muda nada', async () => {
    spyOn(TestBed.inject(Confirm), 'choose').and.resolveTo(null);
    await bulk.act(all, 'apagar', marks);
    expect(store.get('n1')).toBeDefined();
    expect(folders.tree().live('parte000001')).toBeDefined();
  });
});
