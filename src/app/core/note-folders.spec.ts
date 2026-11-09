import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { NoteFolder } from './folders';
import { NoteFolders } from './note-folders';
import { Review, sanitizeReview } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';

/**
 * Organizar as pastas (PLANO-PASTAS.md, rodada 3): guardar anotações, criar a pasta com as que se juntam,
 * mover, renomear, juntar e desfazer, cada uma com o Desfazer do bilhete.
 */

const T0 = '2026-10-01T10:00:00.000Z';
const note = (id: string, category: string, folder?: string): Review => ({
  ...sanitizeReview({
    kind: 'anotacoes',
    game: { name: `Nota ${id}`, coverUrl: null, source: 'manual' },
    completedAt: '2026-10-01',
    createdAt: T0,
    updatedAt: T0,
    category,
    ...(folder ? { folder } : {}),
  })!,
  id,
});
const f = (id: string, name: string, parent: string | null = null, group = 'estudos'): NoteFolder => ({ id, group, name, parent });

describe('organizar as pastas (NoteFolders)', () => {
  let store: ReviewStore;
  let settings: Settings;
  let folders: NoteFolders;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    settings = TestBed.inject(Settings);
    folders = TestBed.inject(NoteFolders);
    settings.setNotesConfig({ folders: [f('phist000001', 'História'), f('pprog000001', 'Programação'), f('pfunc000001', 'Funcional', 'pprog000001')] });
    store.reviews.set([note('n1', 'Estudos'), note('n2', 'Estudos'), note('n3', 'Estudos', 'phist000001'), note('n4', 'Trabalho')]);
    TestBed.tick();
  });
  afterEach(() => localStorage.clear());

  const at = (id: string) => folders.of(store.get(id)!);

  it('guarda as anotações do grupo da pasta (com data nova); a de outro grupo e a que já está lá ficam', () => {
    const { moved, undo } = folders.place(['n1', 'n3', 'n4'], 'phist000001');
    expect(moved).toBe(1);
    expect([at('n1'), at('n3'), at('n4')]).toEqual(['phist000001', 'phist000001', null]);
    expect(store.get('n1')!.updatedAt).not.toBe(T0);
    expect(store.get('n3')!.updatedAt).toBe(T0);
    undo();
    expect(at('n1')).toBeNull();
  });

  it('tirar das pastas: a raiz do grupo', () => {
    folders.place(['n3'], null);
    expect(at('n3')).toBeNull();
    expect('folder' in store.get('n3')!).toBeFalse();
  });

  it('nota sobre nota: uma pasta nova "Nova pasta" com as duas; o Desfazer tira as duas e a pasta', () => {
    const made = folders.gather(['n1', 'n2'], 'estudos', 'pprog000001')!;
    expect(made.folder).toEqual(jasmine.objectContaining({ name: 'Nova pasta', parent: 'pprog000001', group: 'estudos' }));
    expect([at('n1'), at('n2')]).toEqual([made.folder.id, made.folder.id]);
    // outra, no mesmo lugar, não repete o nome
    expect(folders.gather(['n1'], 'estudos', 'pprog000001')!.folder.name).toBe('Nova pasta 2');
    made.undo();
    expect([at('n1'), at('n2')]).toEqual([null, null]);
    expect(folders.tree().live(made.folder.id)).toBeUndefined();
  });

  it('mover a pasta: nunca para dentro dela mesma (nada muda); o Desfazer volta', () => {
    expect(folders.move('pprog000001', 'pfunc000001')).toBeNull();
    const undo = folders.move('phist000001', 'pprog000001')!;
    expect(folders.tree().path('phist000001').map((x) => x.name)).toEqual(['Programação', 'História']);
    undo();
    expect(folders.tree().parentOf('phist000001')).toBeNull();
  });

  it('desfazer a pasta: o que tinha dentro sobe, sem regravar nenhuma anotação; o Desfazer devolve', () => {
    folders.place(['n1'], 'pfunc000001');
    const stamp = store.get('n1')!.updatedAt;
    expect(folders.contentsOf('pprog000001')).toEqual({ notes: 0, folders: 1 });
    expect(folders.contentsOf('pfunc000001')).toEqual({ notes: 1, folders: 0 });
    const undo = folders.dissolve('pfunc000001');
    expect(at('n1')).toBe('pprog000001');
    expect(store.get('n1')!.updatedAt).toBe(stamp);
    undo();
    expect(at('n1')).toBe('pfunc000001');
  });

  it('o Desfazer volta só a pasta mexida: o que mudou no meio (aqui ou vindo de outro aparelho) fica', () => {
    // renomear; no meio, outra pasta ganha nome e uma nova nasce
    const unrename = folders.rename('phist000001', 'Histórias');
    folders.rename('pfunc000001', 'Funções');
    const nova = folders.create('Estudos', null, 'Química')!;
    unrename();
    expect(folders.nameOf('phist000001')).toBe('História');
    expect(folders.nameOf('pfunc000001')).toBe('Funções');
    expect(folders.tree().live(nova.id)).toBeDefined();
    // mover; no meio, outra pasta muda de lugar
    const unmove = folders.move('phist000001', 'pprog000001')!;
    folders.move(nova.id, 'pprog000001');
    unmove();
    expect(folders.tree().parentOf('phist000001')).toBeNull();
    expect(folders.tree().parentOf(nova.id)).toBe('pprog000001');
    // desfazer a pasta; no meio, uma pasta chega da nuvem (outro aparelho) e outra ganha nome
    folders.place(['n1'], 'pfunc000001');
    const undissolve = folders.dissolve('pprog000001');
    expect(folders.tree().parentOf('pfunc000001')).toBeNull();
    settings.setNotesConfig({ folders: [...settings.notesConfig().folders, f('poutro00001', 'De outro aparelho')] });
    folders.rename('phist000001', 'Hist');
    undissolve();
    expect(folders.tree().live('pprog000001')).toBeDefined();
    expect(folders.tree().parentOf('pfunc000001')).toBe('pprog000001');
    expect(folders.tree().parentOf(nova.id)).toBe('pprog000001');
    expect(folders.nameOf('poutro00001')).toBe('De outro aparelho');
    expect(folders.nameOf('phist000001')).toBe('Hist');
    expect(at('n1')).toBe('pfunc000001');
    // juntar; no meio, uma pasta nova
    const unjoin = folders.join('pfunc000001', 'phist000001');
    const depois = folders.create('Estudos', null, 'Depois')!;
    unjoin();
    expect(at('n1')).toBe('pfunc000001');
    expect(folders.tree().live(depois.id)).toBeDefined();
    // a pasta movida de novo no meio não volta à força (o Desfazer não passa por cima)
    const unmove2 = folders.move('phist000001', 'pprog000001')!;
    folders.move('phist000001', null);
    folders.move('phist000001', nova.id);
    unmove2();
    expect(folders.tree().parentOf('phist000001')).toBe(nova.id);
    // nota sobre nota: o Desfazer tira as notas e a pasta, e o resto fica
    const made = folders.gather(['n2'], 'Estudos', null)!;
    const mais = folders.create('Estudos', null, 'Mais uma')!;
    made.undo();
    expect(at('n2')).toBeNull();
    expect(folders.tree().live(made.folder.id)).toBeUndefined();
    expect(folders.tree().live(mais.id)).toBeDefined();
  });

  it('as contas de todas as pastas numa passada só dão o mesmo que contar grupo a grupo', () => {
    settings.setNotesConfig({ folders: [...settings.notesConfig().folders, f('preuniao001', 'Reuniões', null, 'trabalho')] });
    folders.place(['n1'], 'pfunc000001');
    folders.place(['n4'], 'preuniao001');
    const all = folders.countsByFolder();
    expect(Object.fromEntries(all)).toEqual({ phist000001: 1, pprog000001: 1, pfunc000001: 1, preuniao001: 1 });
    for (const g of ['Estudos', 'Trabalho']) for (const [id, n] of folders.countsIn(g)) expect(all.get(id)).toBe(n);
    // a nota guardada numa pasta de outro grupo não conta nela
    store.update({ ...store.get('n2')!, folder: 'preuniao001' });
    expect(folders.countsByFolder().get('preuniao001')).toBe(1);
  });

  it('renomear e juntar devolvem como desfazer', () => {
    const back = folders.rename('phist000001', 'Histórias');
    expect(folders.nameOf('phist000001')).toBe('Histórias');
    back();
    expect(folders.nameOf('phist000001')).toBe('História');
    const unjoin = folders.join('phist000001', 'pprog000001');
    expect(at('n3')).toBe('pprog000001');
    unjoin();
    expect(at('n3')).toBe('phist000001');
  });
});
