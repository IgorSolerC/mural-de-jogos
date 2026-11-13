import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { sanitizeNotesConfig, wishFolderGroup, wishTagKey } from './mural-config';
import { WISH_NOTE_MAX, WISH_TAGS_MAX, Wish, sanitizeWish, withWishPatch } from './review';
import { ReviewStore } from './review-store';
import { NoteFolders } from './note-folders';
import { Settings } from './settings';

/** Os dados da Wishlist repensada (PLANO-WISHLIST.md, rodada 1): tags, pasta e lembrete no desejo. */
const old = '2026-01-01T00:00:00.000Z';
const wish = (id: string, name: string, extra: Partial<Wish> = {}): Wish => ({
  id,
  kind: 'jogos',
  game: { name, coverUrl: null, source: 'manual' },
  createdAt: old,
  updatedAt: old,
  ...extra,
});

describe('o desejo com tags, pasta e lembrete', () => {
  it('o desejo de antes continua igual, sem chave vazia', () => {
    const w = sanitizeWish(wish('rwwww1', 'Hades'))!;
    expect(Object.keys(w).sort()).toEqual(['createdAt', 'game', 'id', 'kind', 'updatedAt']);
  });

  it('guarda as tags limpas e sem repetir, a pasta pelo id e o lembrete cortado', () => {
    const w = sanitizeWish({
      ...wish('rwwww1', 'Hades'),
      tags: ['  Co-op ', 'co-op', 'Curto', 7, ''],
      folder: 'pabcdef123',
      note: `  ${'x'.repeat(WISH_NOTE_MAX + 40)}  `,
    })!;
    expect(w.tags).toEqual(['Co-op', 'Curto']);
    expect(w.folder).toBe('pabcdef123');
    expect(w.note!.length).toBe(WISH_NOTE_MAX);
  });

  it('joga fora o que não serve: pasta com id torto, tags demais, lembrete vazio', () => {
    const many = Array.from({ length: WISH_TAGS_MAX + 5 }, (_, i) => `tag ${i}`);
    const w = sanitizeWish({ ...wish('rwwww1', 'Hades'), tags: many, folder: '../x', note: '   ' })!;
    expect(w.tags!.length).toBe(WISH_TAGS_MAX);
    expect('folder' in w).toBeFalse();
    expect('note' in w).toBeFalse();
  });

  it('o patch tira o que voltou ao padrão (Comum, sem tags, a raiz, sem lembrete)', () => {
    const w = wish('rwwww1', 'Hades', { relevance: 'must', tags: ['a'], folder: 'pabcdef123', note: 'oi' });
    const back = withWishPatch(w, { relevance: 'comum', tags: [], folder: undefined, note: '' });
    expect(Object.keys(back).sort()).toEqual(['createdAt', 'game', 'id', 'kind', 'updatedAt']);
  });
});

describe('o armazém muda o desejo sem resenhar', () => {
  let store: ReviewStore;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    store = TestBed.inject(ReviewStore);
  });

  it('updateWish grava uma vez, carimba a data e devolve o de antes; sem mudança, nada', () => {
    store.saveWish(wish('rwwww1', 'Hades'));
    const before = store.updateWish('rwwww1', { tags: ['Co-op'], note: 'Indicação do Rafa' });
    expect(before?.tags).toBeUndefined();
    const now = store.getWish('rwwww1')!;
    expect(now.tags).toEqual(['Co-op']);
    expect(now.note).toBe('Indicação do Rafa');
    expect(now.updatedAt).not.toBe(old);
    expect(store.updateWish('rwwww1', { tags: ['Co-op'] })).toBeUndefined();
  });

  it('salvar sem mudar nada não carimba, nem com as chaves guardadas em outra ordem', () => {
    const w = wish('rwwww1', 'Hades', { relevance: 'must' });
    const { id, kind, game, createdAt } = w;
    const reordered = { relevance: w.relevance, updatedAt: old, id, kind, game, createdAt };
    store.saveWish(reordered as Wish);
    expect(store.updateWish('rwwww1', { relevance: 'must' })).toBeUndefined();
    expect(store.getWish('rwwww1')!.updatedAt).toBe(old);
  });

  it('moveWishes guarda vários numa pasta e restoreWishes desfaz', () => {
    store.saveWish(wish('rwwww1', 'A'));
    store.saveWish(wish('rwwww2', 'B', { folder: 'pabcdef123' }));
    const before = store.moveWishes(['rwwww1', 'rwwww2'], 'pabcdef123');
    expect(before.map((w) => w.id)).toEqual(['rwwww1']);
    expect(store.getWish('rwwww1')!.folder).toBe('pabcdef123');
    store.restoreWishes(before);
    expect('folder' in store.getWish('rwwww1')!).toBeFalse();
    store.moveWishes(['rwwww2'], null);
    expect('folder' in store.getWish('rwwww2')!).toBeFalse();
  });
});

describe('as configurações da Wishlist dentro das do mural de anotações', () => {
  it('guarda a cor das tags por mural, só cores da cartela', () => {
    const c = sanitizeNotesConfig({ wishTagColors: { 'jogos|Co-op': 'vermelho', 'jogos|x': 'roxo-neon', semBarra: 'azul' } });
    expect(c.wishTagColors).toEqual({ [wishTagKey('jogos', 'co-op')]: 'vermelho' });
  });

  it('a tag com barra no nome guarda a cor no nome inteiro', () => {
    const c = sanitizeNotesConfig({ wishTagColors: { 'jogos|a|b': 'azul' } });
    expect(c.wishTagColors).toEqual({ [wishTagKey('jogos', 'a|b')]: 'azul' });
  });

  it('as pastas da Wishlist moram com as das notas, no grupo do mural', () => {
    const c = sanitizeNotesConfig({ folders: [{ id: 'pabcdef123', group: wishFolderGroup('livros'), name: 'Clássicos', parent: null }] });
    expect(c.folders[0].group).toBe('desejos:livros');
  });
});

describe('a lápide de uma pasta da Wishlist', () => {
  it('fica enquanto um desejo aponta para ela, mesmo quando uma pasta das notas muda', () => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    const store = TestBed.inject(ReviewStore);
    const settings = TestBed.inject(Settings);
    const gone = '2020-01-01T00:00:00.000Z';
    settings.setNotesConfig({ folders: [{ id: 'pdesejo001', group: wishFolderGroup('jogos'), name: 'Velha', parent: null, gone }] });
    store.saveWish(wish('rwwww1', 'Hades', { folder: 'pdesejo001' }));
    TestBed.inject(NoteFolders).create('Estudos', null, 'Nova');
    expect(settings.notesConfig().folders.some((f) => f.id === 'pdesejo001')).toBeTrue();
  });
});
