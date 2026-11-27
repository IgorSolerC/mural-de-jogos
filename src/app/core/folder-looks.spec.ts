import { lookKey } from './category-looks';
import { FOLDER_DECORS, NOTE_FOLDER_VIEWS, PIXEL_FOLDER_VIEWS, WISH_FOLDER_VIEWS, sameFolderLook, sanitizeFolderLook, viewsOfGroup } from './folder-looks';
import { GROUP_VIEWS, wishFolderGroup } from './mural-config';
import { PIXEL_FOLDER_GROUP } from './pixel-gallery';
import { TEMPLATE_FOLDER_GROUP } from './note-templates';

/** O visual das pastas (PLANO-PASTAS-CUSTOMIZADAS.md, 2): o catálogo e o saneamento do que vem guardado. */
describe('o visual das pastas (core/folder-looks.ts)', () => {
  it('as cópias das vistas e do grupo da galeria batem com as de verdade (o folder-looks não as importa, por causa do ciclo)', () => {
    expect([...NOTE_FOLDER_VIEWS]).toEqual([...GROUP_VIEWS]);
    expect(viewsOfGroup(lookKey(PIXEL_FOLDER_GROUP))).toBe(PIXEL_FOLDER_VIEWS);
  });

  it('cada grupo tem as vistas dele: anotações, Wishlist, galeria; as mini-pastas dos templates, nenhuma', () => {
    expect(viewsOfGroup('estudos')).toBe(NOTE_FOLDER_VIEWS);
    expect(viewsOfGroup('')).toBe(NOTE_FOLDER_VIEWS);
    expect(viewsOfGroup(lookKey(wishFolderGroup('jogos')))).toBe(WISH_FOLDER_VIEWS);
    expect(viewsOfGroup(lookKey(TEMPLATE_FOLDER_GROUP))).toEqual([]);
  });

  it('guarda só o que este site conhece, sem a manilha (a de sempre)', () => {
    expect(sanitizeFolderLook({ color: 'azul', decor: 'costura', view: 'lista' }, 'estudos')).toEqual({ color: 'azul', decor: 'costura', view: 'lista' });
    expect(sanitizeFolderLook({ color: 'manilha' }, 'estudos')).toBeUndefined();
    expect(sanitizeFolderLook({ color: 'neon', decor: 'purpurina', view: 'mosaico', outro: 1 }, 'estudos')).toBeUndefined();
    expect(sanitizeFolderLook('azul', 'estudos')).toBeUndefined();
    expect(sanitizeFolderLook([{ color: 'azul' }], 'estudos')).toBeUndefined();
  });

  it('a vista tem de ser uma das do grupo da pasta', () => {
    expect(sanitizeFolderLook({ view: 'grade' }, lookKey(wishFolderGroup('jogos')))).toEqual({ view: 'grade' });
    expect(sanitizeFolderLook({ view: 'grade' }, 'estudos')).toBeUndefined();
    expect(sanitizeFolderLook({ view: 'lista' }, lookKey(PIXEL_FOLDER_GROUP))).toBeUndefined();
  });

  it('os adesivos: só com o enfeite deles, de 1 a 3, conhecidos e sem repetir, na ordem em que foram colados', () => {
    expect(sanitizeFolderLook({ decor: 'adesivos', stickers: ['gatinho', 'coracao', 'gatinho', 'foguete', 'dado', 'raio'] }, 'estudos')).toEqual({
      decor: 'adesivos',
      stickers: ['gatinho', 'coracao', 'dado'],
    });
    // sem nenhum adesivo, os adesivos não enfeitam nada
    expect(sanitizeFolderLook({ decor: 'adesivos', stickers: [] }, 'estudos')).toBeUndefined();
    expect(sanitizeFolderLook({ decor: 'costura', stickers: ['gatinho'] }, 'estudos')).toEqual({ decor: 'costura' });
  });

  it('são 14 enfeites e os adesivos, e o mesmo visual compara igual com ou sem a manilha escrita', () => {
    expect(FOLDER_DECORS.length).toBe(15);
    expect(sameFolderLook(undefined, { color: 'manilha' })).toBeTrue();
    expect(sameFolderLook({ decor: 'adesivos', stickers: ['raio', 'dado'] }, { decor: 'adesivos', stickers: ['dado', 'raio'] })).toBeFalse();
    expect(sameFolderLook({ color: 'azul' }, { color: 'azul', view: 'lista' })).toBeFalse();
  });
});
