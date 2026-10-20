import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { Cloud } from './cloud-config';
import { GameLookup, LookupError, artistHitId } from './game-lookup';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

const ART = 'https://is1-ssl.mzstatic.com/image/thumb/Music/v4/aa/bb/cc/capa.png/100x100bb.jpg';
const PREVIEW = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview1/v4/aa/bb/cc/trecho.plus.aac.p.m4a';

const album = (id: number, name: string, artist = 'Radiohead', extra: Record<string, unknown> = {}) => ({
  wrapperType: 'collection',
  collectionType: 'Album',
  collectionId: id,
  collectionName: name,
  artistName: artist,
  artistId: 657515,
  artworkUrl100: ART,
  releaseDate: '1997-05-21T07:00:00Z',
  trackCount: 12,
  ...extra,
});
const song = (id: number, name: string, artist = 'Radiohead', extra: Record<string, unknown> = {}) => ({
  wrapperType: 'track',
  kind: 'song',
  trackId: id,
  trackName: name,
  collectionId: 1,
  collectionName: 'OK Computer',
  artistName: artist,
  artistId: 657515,
  artworkUrl100: ART,
  previewUrl: PREVIEW,
  releaseDate: '1997-05-21T07:00:00Z',
  ...extra,
});
const artist = (id: number, name: string) => ({ wrapperType: 'artist', artistType: 'Artist', artistId: id, artistName: name });

describe('a busca do mural de músicas (iTunes)', () => {
  let lookup: GameLookup;
  let fetchSpy: jasmine.Spy;
  const signal = new AbortController().signal;
  /** O que cada chamada pediu: /search?entity=album, /lookup?id=… */
  const asked = () => fetchSpy.calls.allArgs().map((a) => new URL(String(a[0])));

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({
      providers: [provideZonelessChangeDetection(), { provide: Cloud, useValue: { ready: Promise.resolve(), config: () => null } }],
    });
    lookup = TestBed.inject(GameLookup);
    fetchSpy = spyOn(window, 'fetch');
  });

  afterEach(() => localStorage.clear());

  /** Responde cada busca pelo que ela procura. */
  function answer(albums: unknown[], rest: unknown[]): void {
    fetchSpy.and.callFake((input: RequestInfo | URL) => {
      const u = new URL(String(input));
      return json({ results: u.searchParams.get('entity') === 'album' ? albums : rest });
    });
  }

  it('procura álbuns, músicas e artistas na loja do Brasil, sem chave', async () => {
    answer([album(10, 'OK Computer')], [artist(657515, 'Radiohead'), song(20, 'Karma Police')]);
    const hits = await lookup.search('radiohead', signal, 'musicas');
    const urls = asked();
    expect(urls.map((u) => `${u.origin}${u.pathname}`)).toEqual(['https://itunes.apple.com/search', 'https://itunes.apple.com/search']);
    expect(urls.map((u) => u.searchParams.get('entity')).sort()).toEqual(['album', 'song,musicArtist']);
    expect(urls[0].searchParams.get('country')).toBe('BR');
    expect(urls[0].searchParams.get('term')).toBe('radiohead');
    // sem media=music: com ele, o iTunes manda o iPhone para o app Música (musics://) e a busca falha lá
    expect(urls.every((u) => !u.searchParams.has('media'))).toBeTrue();
    // o artista abre a lista; depois os álbuns dele e as músicas
    expect(hits.map((h) => h.name)).toEqual(['Radiohead', 'OK Computer', 'Karma Police']);
    expect(artistHitId(hits[0])).toBe('657515');
    expect(hits[1]).toEqual({ name: 'OK Computer', coverUrl: ART.replace('100x100bb', '600x600bb'), source: 'itunes', sourceId: 'album/10', year: '1997', by: 'Radiohead', form: 'album' });
    expect(hits[2]).toEqual(jasmine.objectContaining({ sourceId: 'song/20', form: 'faixa', sample: PREVIEW, album: 'OK Computer', by: 'Radiohead' }));
    expect(lookup.sourceName('musicas')).toBe('loja do iTunes');
  });

  it('quem tem o nome que foi digitado vem antes do que veio pelo artista', async () => {
    answer([album(10, 'The Bends'), album(11, 'Karma Sessions', 'Outro')], [song(20, 'Let Down'), song(21, 'Karma Police')]);
    const hits = await lookup.search('karma', signal, 'musicas');
    expect(hits.map((h) => h.name)).toEqual(['Karma Sessions', 'Karma Police', 'The Bends', 'Let Down']);
  });

  it('a mesma obra em duas edições aparece uma vez, e o single de uma faixa só fica de fora', async () => {
    answer(
      [album(10, 'OK Computer'), album(11, 'OK Computer'), album(12, 'Spectre - Single', 'Radiohead', { trackCount: 1 }), album(13, 'My Iron Lung - EP', 'Radiohead', { trackCount: 8 })],
      [song(20, 'Spectre', 'Radiohead', { collectionName: 'Spectre - Single' }), song(21, 'Spectre')],
    );
    const hits = await lookup.search('radiohead', signal, 'musicas');
    expect(hits.map((h) => h.name)).toEqual(['OK Computer', 'My Iron Lung - EP', 'Spectre']);
    // a música de um single não diz "do álbum Spectre"
    expect(hits[2].album).toBeUndefined();
  });

  it('só o artista de nome parecido vira a porta; os outros que a busca trouxe, não', async () => {
    answer([], [artist(1, 'Radiohead'), artist(2, 'Thom Yorke'), artist(3, 'Radiohead Tribute'), artist(4, 'Os Radioheads')]);
    const hits = await lookup.search('radiohead', signal, 'musicas');
    expect(hits.map((h) => h.name)).toEqual(['Radiohead', 'Radiohead Tribute']);
  });

  it('se uma das duas buscas falha, fica a outra; se as duas falham, avisa', async () => {
    fetchSpy.and.callFake((input: RequestInfo | URL) =>
      new URL(String(input)).searchParams.get('entity') === 'album' ? json({}, 503) : json({ results: [song(20, 'Karma Police')] }),
    );
    expect((await lookup.search('karma', signal, 'musicas')).map((h) => h.name)).toEqual(['Karma Police']);
    fetchSpy.and.callFake(() => json({}, 503));
    await expectAsync(lookup.search('karma', signal, 'musicas')).toBeRejectedWithError(LookupError);
  });

  it('os álbuns de um artista vêm dos mais novos para os mais antigos, sem repetir', async () => {
    fetchSpy.and.callFake(() =>
      json({
        results: [
          artist(657515, 'Radiohead'),
          album(1, 'Kid A', 'Radiohead', { releaseDate: '2000-10-02T07:00:00Z' }),
          album(2, 'In Rainbows', 'Radiohead', { releaseDate: '2007-10-10T07:00:00Z' }),
          album(3, 'Kid A', 'Radiohead', { releaseDate: '2000-10-02T07:00:00Z' }),
        ],
      }),
    );
    const albums = await lookup.artistAlbums('657515', signal);
    expect(albums.map((a) => [a.name, a.year])).toEqual([
      ['In Rainbows', '2007'],
      ['Kid A', '2000'],
    ]);
    expect(asked()[0].searchParams.get('id')).toBe('657515');
    expect(asked()[0].searchParams.get('entity')).toBe('album');
    // um número que não é número nem vai ao catálogo
    expect(await lookup.artistAlbums('../x', signal)).toEqual([]);
    expect(fetchSpy).toHaveBeenCalledTimes(1);
  });

  it('as faixas do álbum vêm na ordem do disco, só as que têm trecho para tocar', async () => {
    fetchSpy.and.callFake(() =>
      json({
        results: [
          album(10, 'OK Computer'),
          song(3, 'Paranoid Android', 'Radiohead', { trackNumber: 2, previewUrl: `${PREVIEW}?2` }),
          song(4, 'Fitter Happier', 'Radiohead', { trackNumber: 7, previewUrl: undefined }),
          song(2, 'Airbag', 'Radiohead', { trackNumber: 1, previewUrl: `${PREVIEW}?1` }),
        ],
      }),
    );
    const item = { name: 'OK Computer', coverUrl: null, source: 'itunes' as const, sourceId: 'album/10', form: 'album' as const };
    expect(await lookup.sampleChoices(item, signal)).toEqual([
      { n: 1, name: 'Airbag', sample: `${PREVIEW}?1` },
      { n: 2, name: 'Paranoid Android', sample: `${PREVIEW}?2` },
    ]);
    expect(asked()[0].searchParams.get('entity')).toBe('song');
  });

  it('a música solta tem o trecho dela; o que foi escrito à mão, nada (e nem pergunta)', async () => {
    fetchSpy.and.callFake(() => json({ results: [song(20, 'Karma Police')] }));
    const item = { name: 'Karma Police', coverUrl: null, source: 'itunes' as const, sourceId: 'song/20', form: 'faixa' as const };
    expect(await lookup.sampleChoices(item, signal)).toEqual([{ n: 1, name: 'Karma Police', sample: PREVIEW }]);
    fetchSpy.calls.reset();
    expect(await lookup.sampleChoices({ name: 'Fita demo', coverUrl: null, source: 'manual' }, signal)).toEqual([]);
    expect(fetchSpy).not.toHaveBeenCalled();
  });

  it('o artista principal de um item creditado a vários é o que o catálogo diz', async () => {
    answer([], [song(20, 'Get Lucky', 'Daft Punk, Pharrell Williams & Nile Rodgers', { artistId: 5468295 })]);
    const [hit] = await lookup.search('get lucky', signal, 'musicas');
    fetchSpy.and.callFake(() => json({ results: [artist(5468295, 'Daft Punk')] }));
    expect(await lookup.primaryArtist(hit, signal)).toBe('Daft Punk');
    expect(asked().at(-1)!.searchParams.get('id')).toBe('5468295');
    // um item que a busca não trouxe nesta visita: não dá para saber
    expect(await lookup.primaryArtist({ ...hit, sourceId: 'song/999' }, signal)).toBeNull();
  });

  it('as outras capas do mesmo disco vêm das outras edições dele', async () => {
    const other = ART.replace('capa', 'deluxe');
    fetchSpy.and.callFake(() => json({ results: [album(10, 'OK Computer'), album(11, 'OK Computer', 'Radiohead', { artworkUrl100: other }), album(12, 'OK Computer', 'Outra banda')] }));
    const item = { name: 'OK Computer', coverUrl: ART.replace('100x100bb', '600x600bb'), source: 'itunes' as const, sourceId: 'album/10', by: 'Radiohead', form: 'album' as const };
    const { choices } = await lookup.coverChoices(item, 'musicas', signal);
    expect(choices.map((c) => c.coverUrl)).toEqual([item.coverUrl, other.replace('100x100bb', '600x600bb')]);
    expect(choices[1].from).toBe('iTunes');
  });
});
