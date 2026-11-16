import { TestBed } from '@angular/core/testing';
import { provideZonelessChangeDetection } from '@angular/core';
import { NoteFolders } from './note-folders';
import { PIXEL_FOLDER_GROUP, PIXEL_GALLERY_MAX, PixelPiece, pixelArtsInNotes, pixelArtsInText, cleanArt, mergePixelGallery, pieceTitle, pieceWidgetLine, pixelGalleryToSync, sanitizePixelGallery, sanitizePixelPiece } from './pixel-gallery';
import { PixelGallery } from './pixel-gallery-store';
import { PixelFolders } from './pixel-folders';
import { parseWidgetLine } from './widgets';

function piece(id: string, at: string, extra: Partial<PixelPiece> = {}): PixelPiece {
  return { id, title: id, art: ['2x2', '12/21'], createdAt: at, at, ...extra };
}

describe('a galeria de pixel arts (os dados)', () => {
  it('o desenho é guardado do jeito de sempre, sem a legenda, e sem tinta não vale', () => {
    expect(cleanArt(['2x2', '12/21', 'Gato'])).toEqual(['2x2', '12/21']);
    expect(cleanArt(['4x1', '00000000'])).toBeNull();
    expect(cleanArt('2x2|12')).toBeNull();
    expect(cleanArt(['2x2', '12/21', 'pastel', 'figurinha'])).toEqual(['2x2', '12/21', 'pastel', 'figurinha']);
  });

  it('a obra é conferida campo a campo: o título curto, as tags limpas, a pasta só com id de pasta', () => {
    const p = sanitizePixelPiece({ id: 'r1', title: '  Gato   preto ', art: ['2x2', '12/21'], at: '2026-11-16T10:00:00.000Z', tags: ['bichos', 'Bichos', ''], folder: 'não é id', note: '  oi  ' });
    expect(p).toEqual({ id: 'r1', title: 'Gato preto', art: ['2x2', '12/21'], createdAt: '2026-11-16T10:00:00.000Z', at: '2026-11-16T10:00:00.000Z', tags: ['bichos'], note: 'oi' });
    expect(sanitizePixelPiece({ id: 'r1', art: ['2x2', '00'], at: '2026-11-16T10:00:00.000Z' })).toBeNull();
    expect(sanitizePixelPiece({ id: 'r1', art: ['2x2', '12'] })).toBeNull();
  });

  it('a junção fica com a mais nova de cada obra, e a apagada só volta mudada depois da lápide', () => {
    const here = sanitizePixelGallery({ pieces: [piece('a', '2026-11-16T10:00:00.000Z'), piece('b', '2026-11-16T10:00:00.000Z')], removed: {} });
    const there = sanitizePixelGallery({
      pieces: [piece('a', '2026-11-16T11:00:00.000Z', { title: 'A nova' }), piece('c', '2026-11-16T09:00:00.000Z')],
      removed: { b: '2026-11-16T10:30:00.000Z' },
    });
    const both = mergePixelGallery(here, there);
    expect(both.pieces.map((p) => `${p.id}:${p.title}`)).toEqual(['c:c', 'a:A nova']);
    expect(both.removed).toEqual({ b: '2026-11-16T10:30:00.000Z' });
    // a mesma junção dos dois lados (as impressões dos aparelhos batem)
    expect(JSON.stringify(mergePixelGallery(there, here))).toBe(JSON.stringify(both));
  });

  it('sem nenhuma obra nem apagada, nada vai para a nuvem', () => {
    expect(pixelGalleryToSync({ pieces: [], removed: {} })).toBeNull();
    expect(pixelGalleryToSync({ pieces: [], removed: { a: '2026-11-16T10:00:00.000Z' } })).not.toBeNull();
  });

  it('a obra vira o widget com o título de legenda, e sem título é "Sem título"', () => {
    const line = pieceWidgetLine(piece('a', '2026-11-16T10:00:00.000Z', { title: 'Gato' }));
    expect(parseWidgetLine(line)?.args).toEqual(['2x2', '12/21', 'Gato']);
    expect(pieceTitle({ title: '' })).toBe('Sem título');
  });
});

describe('as pixel arts que moram nas anotações', () => {
  it('acha os widgets de pixel art do texto, na ordem, fora dos blocos de código', () => {
    const text = ['Um gato:', '{{pixel: 2x2 | 12/21 | Gato}}', '```', '{{pixel: 1x1 | 3 | No código}}', '```', '  {{pixel: 1x1 | 4}}  ', '{{contador: 2026-12-25}}', '> [!nota]', '> {{pixel: 1x1 | 5 | No cartão}}'].join('\n');
    expect(pixelArtsInText(text)).toEqual([
      { art: ['2x2', '12/21'], caption: 'Gato' },
      { art: ['1x1', '4'], caption: '' },
      { art: ['1x1', '5'], caption: 'No cartão' },
    ]);
  });

  it('diz quais já estão na galeria, pelo desenho', () => {
    const notes = [{ id: 'n1', text: '{{pixel: 2x2 | 12/21 | Gato}}\n{{pixel: 1x1 | 4}}', game: { name: 'Desenhos' } }];
    const found = pixelArtsInNotes(notes, [piece('a', '2026-11-16T10:00:00.000Z')]);
    expect(found.map((f) => [f.key, f.noteTitle, f.inGallery])).toEqual([
      ['n1#0', 'Desenhos', true],
      ['n1#1', 'Desenhos', false],
    ]);
  });
});

describe('a galeria de pixel arts (o armazém)', () => {
  let gallery: PixelGallery;
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    gallery = TestBed.inject(PixelGallery);
  });
  afterEach(() => localStorage.clear());

  it('cria, muda e desfaz só o que a mudança mudou', () => {
    const p = gallery.create({ art: ['2x2', '12/21'], title: 'Gato' })!;
    const undo = gallery.update(p.id, { title: 'Gato preto', tags: ['bichos'] })!;
    gallery.update(p.id, { note: 'feito no ônibus' });
    undo();
    expect(gallery.get(p.id)).toEqual(jasmine.objectContaining({ title: 'Gato', note: 'feito no ônibus' }));
    expect(gallery.get(p.id)?.tags).toBeUndefined();
    // nada mudou: sem desfazer
    expect(gallery.update(p.id, { title: 'Gato' })).toBeNull();
  });

  it('as camadas mudadas voltam com o desenho no Desfazer', () => {
    const p = gallery.create({ art: ['2x1', '12'], title: 'Par' })!;
    const undo = gallery.update(p.id, { layers: [{ id: 'a', name: 'Fundo', rows: '1' }, { id: 'b', name: 'Cima', rows: '02' }] })!;
    expect(gallery.get(p.id)!.layers?.length).toBe(2);
    expect(gallery.get(p.id)!.art).toEqual(['2x1', '12']);
    gallery.update(p.id, { art: ['2x1', '12', 'figurinha'] });
    expect(gallery.get(p.id)!.layers?.length).toBe(2);
    undo();
    expect(gallery.get(p.id)!.layers).toBeUndefined();
    expect(gallery.get(p.id)!.art).toEqual(['2x1', '12', 'figurinha']);
  });

  it('apagar deixa a lápide, e o Desfazer traz de volta', () => {
    const p = gallery.create({ art: ['1x1', '1'], title: 'Ponto' })!;
    const gone = gallery.remove([p.id]);
    expect(gallery.get(p.id)).toBeUndefined();
    expect(gallery.state().removed[p.id]).toBeDefined();
    gallery.restore(gone);
    expect(gallery.get(p.id)?.title).toBe('Ponto');
    expect(gallery.state().removed[p.id]).toBeUndefined();
  });

  it('não passa do teto', () => {
    gallery.state.set({ pieces: Array.from({ length: PIXEL_GALLERY_MAX }, (_, i) => piece('p' + i, '2026-11-16T10:00:00.000Z')), removed: {} });
    expect(gallery.full()).toBeTrue();
    expect(gallery.create({ art: ['1x1', '1'] })).toBeNull();
  });

  it('no teto, o Desfazer de apagar não joga fora nenhuma obra (o teto só barra a nova)', () => {
    gallery.state.set({ pieces: Array.from({ length: PIXEL_GALLERY_MAX - 1 }, (_, i) => piece('p' + i, '2026-11-16T10:00:00.000Z')), removed: {} });
    const gone = gallery.remove(['p0']);
    gallery.create({ art: ['1x1', '1'], title: 'Nova' });
    gallery.create({ art: ['1x1', '1'], title: 'Outra' });
    gallery.restore(gone);
    expect(gallery.count()).toBe(PIXEL_GALLERY_MAX + 1);
    expect(gallery.get('p1')).toBeDefined();
  });

  it('o título fica com a caixa que a pessoa escreveu', () => {
    expect(gallery.create({ art: ['1x1', '1'], title: '  iPod   velho ' })?.title).toBe('iPod velho');
  });
});

describe('as pastas da galeria de pixel arts', () => {
  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
  });
  afterEach(() => localStorage.clear());

  it('guardam as obras no grupo da galeria, contam e desfazem', () => {
    const gallery = TestBed.inject(PixelGallery);
    const folders = TestBed.inject(PixelFolders);
    const a = gallery.create({ art: ['1x1', '1'], title: 'A' })!;
    const b = gallery.create({ art: ['1x1', '2'], title: 'B' })!;
    const made = folders.gather([a.id, b.id], null)!;
    expect(made.folder.group).toBe(PIXEL_FOLDER_GROUP);
    expect(folders.of(gallery.get(a.id)!)).toBe(made.folder.id);
    expect(folders.counts().get(made.folder.id)).toBe(2);
    expect(folders.contentsOf(made.folder.id)).toEqual({ notes: 2, folders: 0 });
    made.undo();
    expect(folders.of(gallery.get(a.id)!)).toBeNull();
    expect(folders.tree().live(made.folder.id)).toBeUndefined();
  });

  it('a pasta de uma anotação não guarda obra', () => {
    const gallery = TestBed.inject(PixelGallery);
    const folders = TestBed.inject(PixelFolders);
    const a = gallery.create({ art: ['1x1', '1'] })!;
    const notes = TestBed.inject(NoteFolders).create('Estudos', null, 'Kanji')!;
    expect(folders.place([a.id], notes.id).moved).toBe(0);
    expect(gallery.get(a.id)?.folder).toBeUndefined();
  });
});
