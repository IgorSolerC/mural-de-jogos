import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { NoteFolders } from './note-folders';
import { Wish } from './review';
import { ReviewStore } from './review-store';
import { Settings } from './settings';
import { WishFolders } from './wish-folders';

/** As pastas da Wishlist (PLANO-WISHLIST.md, rodada 5): as das anotações, no grupo `desejos:<mural>`. */

const at = (d: number) => new Date(Date.UTC(2026, 10, d)).toISOString();
const wish = (id: string, name: string, extra: Partial<Wish> = {}): Wish => ({ id, kind: 'jogos', game: { name, coverUrl: null, source: 'manual' }, createdAt: at(1), updatedAt: at(1), ...extra });

describe('as pastas da Wishlist', () => {
  let store: ReviewStore;
  let folders: WishFolders;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
    folders = TestBed.inject(WishFolders);
    store.saveWish(wish('w1', 'Celeste'));
    store.saveWish(wish('w2', 'Hades'));
    store.saveWish(wish('w3', 'Persona', { kind: 'animes' }));
  });

  afterEach(() => localStorage.clear());

  it('moram nas configurações das anotações, no grupo da Wishlist do mural (as telas das anotações não as veem)', () => {
    const f = folders.create('jogos', null, 'Co-op')!;
    expect(f.group).toBe('desejos:jogos');
    expect(TestBed.inject(Settings).notesConfig().folders.some((x) => x.id === f.id)).toBeTrue();
    expect(TestBed.inject(NoteFolders).topLibrary(null, []).length).toBe(0);
  });

  it('guardar muda só os do mural da pasta, um carimbo novo cada, e o Desfazer volta só os que ainda estão lá', () => {
    const f = folders.create('jogos', null, 'Co-op')!;
    const { moved, undo } = folders.place(['w1', 'w2', 'w3'], f.id);
    expect(moved).toBe(2);
    expect(folders.of(store.getWish('w1')!)).toBe(f.id);
    expect(store.getWish('w1')!.updatedAt).not.toBe(at(1));
    expect(store.getWish('w3')!.folder).toBeUndefined();
    // no meio, o w2 foi para outra pasta: o Desfazer não o tira de lá
    const g = folders.create('jogos', null, 'Curtos')!;
    folders.place(['w2'], g.id);
    undo();
    expect(store.getWish('w1')!.folder).toBeUndefined();
    expect(folders.of(store.getWish('w2')!)).toBe(g.id);
    // já estão lá: nada muda
    expect(folders.place(['w2'], g.id).moved).toBe(0);
  });

  it('recorte sobre recorte: a pasta nova com os dois; o Desfazer devolve os dois e desfaz a pasta', () => {
    const made = folders.gather(['w1', 'w2'], 'jogos', null)!;
    expect(made.folder.name).toBe('Nova pasta');
    expect(folders.contentsOf(made.folder.id)).toEqual({ notes: 2, folders: 0 });
    made.undo();
    expect(folders.tree().live(made.folder.id)).toBeUndefined();
    expect(folders.of(store.getWish('w1')!)).toBeNull();
  });

  it('desfazer a pasta: os de dentro sobem pela regra da leitura, sem regravar; as contas pegam as de dentro', () => {
    const top = folders.create('jogos', null, 'Indies')!;
    const sub = folders.create('jogos', top.id, 'Roguelikes')!;
    folders.place(['w1'], sub.id);
    folders.place(['w2'], top.id);
    expect(folders.countsIn('jogos').get(top.id)).toBe(2);
    expect(folders.countsIn('jogos').get(sub.id)).toBe(1);
    const stamp = store.getWish('w1')!.updatedAt;
    folders.dissolve(sub.id);
    expect(folders.of(store.getWish('w1')!)).toBe(top.id);
    expect(store.getWish('w1')!.updatedAt).toBe(stamp);
  });

  it('a lápide de uma pasta da Wishlist fica enquanto um desejo aponta para ela', () => {
    const f = folders.create('jogos', null, 'Co-op')!;
    folders.place(['w1'], f.id);
    folders.dissolve(f.id);
    // outra mudança nas pastas grava (e poda) as configurações
    folders.create('jogos', null, 'Outra');
    expect(TestBed.inject(Settings).notesConfig().folders.some((x) => x.id === f.id)).toBeTrue();
  });
});
