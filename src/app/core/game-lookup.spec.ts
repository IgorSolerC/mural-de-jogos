import { sameTitle } from './game-lookup';
import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { GameLookup, LookupError } from './game-lookup';
import { Settings } from './settings';

const json = (body: unknown, status = 200) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } }));

describe('GameLookup', () => {
  let lookup: GameLookup;
  let settings: Settings;
  let fetchSpy: jasmine.Spy;
  const signal = new AbortController().signal;

  beforeEach(() => {
    localStorage.clear();
    TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
    lookup = TestBed.inject(GameLookup);
    settings = TestBed.inject(Settings);
    fetchSpy = spyOn(window, 'fetch');
  });

  afterEach(() => localStorage.clear());

  const url = (i = 0) => String(fetchSpy.calls.argsFor(i)[0]);

  describe('livros (Open Library)', () => {
    const prince = (edition: Record<string, unknown>) => ({
      key: '/works/OL82565W',
      title: 'Harry Potter and the Half-Blood Prince',
      author_name: ['J. K. Rowling'],
      first_publish_year: 2005,
      cover_i: 10716273,
      editions: { docs: [{ language: ['por'], ...edition }] },
    });
    const portuguesePrince = prince({ title: 'Harry Potter e o Príncipe Misterioso', isbn: ['9789722334457'], cover_i: 15160618 });
    const brazilianPrince = prince({ title: 'Harry Potter e o Enigma do Príncipe', isbn: ['9788532523105'], cover_i: 15156798 });
    const brazilianQuery = (input: RequestInfo | URL) => new URL(String(input)).searchParams.get('q')?.includes('isbn:(');

    it('usa a edição em português, com a capa dela, e completa a última palavra', async () => {
      fetchSpy.and.callFake(
        () => json({
          docs: [
            {
              key: '/works/OL1W',
              title: 'The Hobbit',
              author_name: ['J.R.R. Tolkien'],
              first_publish_year: 1937,
              cover_i: 1,
              editions: { docs: [{ key: '/books/OL2M', title: 'O  Hobbit', language: ['por'], cover_i: 2 }] },
            },
            {
              key: '/works/OL3W',
              title: 'Don Quijote',
              cover_i: 3,
              editions: { docs: [{ title: 'Histoire de Don Quichotte', language: ['fre'], cover_i: 4 }] },
            },
          ],
        }),
      );
      const hits = await lookup.search('o hobbi', signal, 'livros');
      expect(new URL(url()).searchParams.get('q')).toBe('o (hobbi OR hobbi*)');
      expect(url()).toContain('lang=pt');
      expect(url()).toContain('editions.title');
      expect(hits[0]).toEqual(
        jasmine.objectContaining({ name: 'O Hobbit', by: 'J.R.R. Tolkien', year: '1937', source: 'openlibrary', sourceId: 'OL1W' }),
      );
      expect(hits[0].coverUrl).toContain('/b/id/2-L.jpg');
      // edição em outra língua: fica o título e a capa da obra
      const quijote = hits.find((h) => h.sourceId === 'OL3W')!;
      expect(quijote.name).toBe('Don Quijote');
      expect(quijote.coverUrl).toContain('/b/id/3-L.jpg');
    });

    it('substitui a edição portuguesa pelo título e pela capa brasileiros da mesma obra, sem duplicar', async () => {
      fetchSpy.and.callFake((input: RequestInfo | URL) => json({ docs: [brazilianQuery(input) ? brazilianPrince : portuguesePrince] }));
      const hits = await lookup.search('harry potter', signal, 'livros');
      expect(hits.length).toBe(1);
      expect(hits[0]).toEqual(jasmine.objectContaining({
        name: 'Harry Potter e o Enigma do Príncipe', sourceId: 'OL82565W', year: '2005', by: 'J. K. Rowling',
        coverUrl: 'https://covers.openlibrary.org/b/id/15156798-L.jpg?default=false',
      }));
      const queries = fetchSpy.calls.allArgs().map(([u]) => new URL(String(u)).searchParams.get('q'));
      expect(queries).toContain('harry (potter OR potter*) language:por isbn:(97885* OR 97865* OR 85* OR 65*)');
    });

    it('busca o título brasileiro completo sem acentos, preservando a última palavra inteira além do prefixo', async () => {
      fetchSpy.and.callFake(() => json({ docs: [brazilianPrince] }));
      const [hit] = await lookup.search('Harry Potter e o enigma do principe', signal, 'livros');
      expect(hit.name).toBe('Harry Potter e o Enigma do Príncipe');
      expect(new URL(url()).searchParams.get('q')).toBe('Harry Potter e o enigma do (principe OR principe*)');
    });

    it('reconhece o grupo brasileiro 65 e ISBNs com separadores, preferindo-os na busca', async () => {
      const stone = {
        key: '/works/OL82563W', title: 'Harry Potter and the Philosopher\'s Stone',
        editions: { docs: [{ title: 'Harry Potter e a Pedra Filosofal', language: ['por'], isbn: ['978-65-86733-50-1'], cover_i: 15168707 }] },
      };
      fetchSpy.and.callFake((input: RequestInfo | URL) => json({ docs: brazilianQuery(input) ? [stone] : [portuguesePrince] }));
      const hits = await lookup.search('harry potter', signal, 'livros');
      expect(hits.map((h) => h.sourceId)).toEqual(['OL82563W', 'OL82565W']);
    });

    it('uma edição brasileira sem capa não recebe a imagem portuguesa ou inglesa da obra', async () => {
      const noCover = prince({ title: 'Harry Potter e o Enigma do Príncipe', isbn: ['85-325-2310-2'] });
      fetchSpy.and.callFake((input: RequestInfo | URL) => json({ docs: [brazilianQuery(input) ? noCover : portuguesePrince] }));
      const [hit] = await lookup.search('harry potter', signal, 'livros');
      expect(hit.name).toBe('Harry Potter e o Enigma do Príncipe');
      expect(hit.coverUrl).toBeNull();
    });

    it('mantém a busca geral quando não há edição brasileira ou a consulta regional falha', async () => {
      fetchSpy.and.callFake((input: RequestInfo | URL) => brazilianQuery(input) ? json({}, 503) : json({ docs: [portuguesePrince] }));
      const [hit] = await lookup.search('harry potter', signal, 'livros');
      expect(hit.name).toBe('Harry Potter e o Príncipe Misterioso');
      expect(hit.coverUrl).toContain('/15160618-L.jpg');
    });

    it('a consulta brasileira continua funcionando se a consulta geral falhar', async () => {
      fetchSpy.and.callFake((input: RequestInfo | URL) => brazilianQuery(input) ? json({ docs: [brazilianPrince] }) : json({}, 503));
      const [hit] = await lookup.search('harry potter', signal, 'livros');
      expect(hit.name).toBe('Harry Potter e o Enigma do Príncipe');
    });

    it('não classifica como brasileira uma edição portuguesa devolvida pelo filtro regional', async () => {
      fetchSpy.and.callFake((input: RequestInfo | URL) => json({ docs: brazilianQuery(input) ? [portuguesePrince] : [] }));
      expect(await lookup.search('harry potter', signal, 'livros')).toEqual([]);
    });

    it('propaga falhas dos dois pedidos e respeita o cancelamento da busca', async () => {
      fetchSpy.and.callFake(() => json({}, 503));
      await expectAsync(lookup.search('harry potter', signal, 'livros')).toBeRejectedWith(jasmine.any(LookupError));
      fetchSpy.and.callFake(() => json({ docs: [brazilianPrince] }));
      const ctrl = new AbortController();
      ctrl.abort();
      await expectAsync(lookup.search('harry potter', ctrl.signal, 'livros')).toBeRejectedWith(jasmine.objectContaining({ name: 'AbortError' }));
    });

    it('as capas brasileiras vêm antes das portuguesas e estrangeiras, antes de limitar a lista', async () => {
      const portuguese = { title: 'Príncipe Misterioso', languages: [{ key: '/languages/por' }], isbn_13: ['9789722334457'], covers: [20] };
      const brazilian = { title: 'Enigma do Príncipe', languages: [{ key: '/languages/por' }], isbn_10: ['8532523102'], covers: [30] };
      const modernBrazilian = { languages: [{ key: '/languages/por' }], isbn_13: ['978-65-86733-50-1'], covers: [31] };
      const english = Array.from({ length: 12 }, (_, i) => ({ languages: [{ key: '/languages/eng' }], covers: [100 + i] }));
      fetchSpy.and.callFake(() => json({ entries: [...english, portuguese, brazilian, modernBrazilian] }));
      const { choices } = await lookup.coverChoices({ name: 'Harry Potter e o Enigma do Príncipe', source: 'openlibrary', sourceId: 'OL82565W', coverUrl: null }, 'livros', signal);
      expect(choices.slice(0, 3).map((c) => c.coverUrl)).toEqual([30, 31, 20].map((id) => `https://covers.openlibrary.org/b/id/${id}-L.jpg?default=false`));
      expect(choices.length).toBe(11);
      expect(choices.every((c) => c.name === 'Harry Potter e o Enigma do Príncipe')).toBeTrue();
    });
  });

  describe('animes (Kitsu, AniList de reserva)', () => {
    it('prefere o nome brasileiro, depois o inglês', async () => {
      fetchSpy.and.returnValue(
        json({
          data: [
            { id: '1', attributes: { canonicalTitle: 'Sousou no Frieren', titles: { en: 'Frieren', pt_br: 'Frieren e a Jornada para o Além' }, startDate: '2023-09-29', posterImage: { large: 'https://media.kitsu.app/a.jpg' } } },
            { id: '2', attributes: { canonicalTitle: 'Shingeki no Kyojin', titles: { en: 'Attack on Titan' }, startDate: '2013-04-07', posterImage: null } },
          ],
        }),
      );
      const hits = await lookup.search('fri', signal, 'animes');
      expect(url()).toContain('kitsu.io');
      expect(hits.map((h) => h.name)).toEqual(['Frieren e a Jornada para o Além', 'Attack on Titan']);
      expect(hits[0]).toEqual(jasmine.objectContaining({ year: '2023', source: 'kitsu', coverUrl: 'https://media.kitsu.app/a.jpg' }));
      expect(hits[1].coverUrl).toBeNull();
    });

    it('sem Kitsu, pergunta ao AniList', async () => {
      fetchSpy.and.callFake((input: RequestInfo | URL) =>
        String(input).includes('kitsu')
          ? json({ errors: [] }, 503)
          : json({ data: { Page: { media: [{ id: 9, title: { romaji: 'Sousou no Frieren', english: null }, startDate: { year: 2023 }, coverImage: { extraLarge: 'https://s4.anilist.co/x.jpg' } }] } } }),
      );
      const hits = await lookup.search('frieren', signal, 'animes');
      expect(url(1)).toContain('anilist');
      expect(hits).toEqual([jasmine.objectContaining({ name: 'Sousou no Frieren', source: 'anilist', year: '2023', coverUrl: 'https://s4.anilist.co/x.jpg' })]);
    });
  });

  describe('jogos na Wikipedia', () => {
    it('o nome inteiro também procura sem curinga: God of War vem antes de Warhammer', async () => {
      fetchSpy.and.callFake((input: RequestInfo | URL) => {
        const q = new URL(String(input)).searchParams.get('gsrsearch') ?? '';
        const page = (pageid: number, index: number, title: string, description: string) => ({ pageid, index, title, description });
        return json({
          query: {
            pages: q.includes('War*')
              ? [page(1, 1, 'Total War: Warhammer', '2016 video game'), page(2, 2, 'Warframe', '2013 video game')]
              : [page(3, 1, 'God of War (2018 video game)', 'Action-adventure game'), page(1, 2, 'Total War: Warhammer', '2016 video game')],
          },
        });
      });
      const hits = await lookup.search('God of War', signal, 'jogos', 'wikipedia');
      expect(hits.map((h) => h.name)).toEqual(['God of War', 'Total War: Warhammer', 'Warframe']);
      // o ano do jogo está no título, não na descrição
      expect(hits[0].year).toBe('2018');
    });
  });

  describe('filmes e séries (TMDB com chave, Wikipedia sem)', () => {
    it('sem chave, procura na Wikipedia pela caixa de filme', async () => {
      fetchSpy.and.callFake(() => json({ query: { pages: [] } }));
      await lookup.search('cidade de deus', signal, 'filmes');
      expect(new URL(url()).searchParams.get('gsrsearch')).toContain('hastemplate:"Infobox film"');
    });

    it('com a chave curta, vai na URL; nome e pôster em português', async () => {
      settings.tmdbKey.set('abc123');
      fetchSpy.and.returnValue(
        json({ results: [{ id: 598, title: 'Cidade de Deus', original_title: 'Cidade de Deus', release_date: '2002-08-30', poster_path: '/p.jpg' }] }),
      );
      const hits = await lookup.search('cidade de d', signal, 'filmes');
      expect(url()).toContain('/search/movie?');
      expect(url()).toContain('language=pt-BR');
      expect(url()).toContain('api_key=abc123');
      expect(hits).toEqual([
        jasmine.objectContaining({ name: 'Cidade de Deus', year: '2002', source: 'tmdb', sourceId: 'movie/598', coverUrl: 'https://image.tmdb.org/t/p/w500/p.jpg' }),
      ]);
    });

    it('com o token de leitura, vai no cabeçalho; séries usam o nome e a estreia', async () => {
      settings.tmdbKey.set('eyJhbGciOi.token');
      fetchSpy.and.returnValue(json({ results: [{ id: 1396, name: 'Breaking Bad', first_air_date: '2008-01-20', poster_path: null }] }));
      const hits = await lookup.search('breaking', signal, 'series');
      expect(url()).toContain('/search/tv?');
      expect(url()).not.toContain('api_key');
      const init = fetchSpy.calls.argsFor(0)[1] as RequestInit;
      expect((init.headers as Record<string, string>)['Authorization']).toBe('Bearer eyJhbGciOi.token');
      expect(hits[0]).toEqual(jasmine.objectContaining({ name: 'Breaking Bad', year: '2008', coverUrl: null }));
    });

    it('chave recusada vira um aviso para conferir em Ajustes', async () => {
      settings.tmdbKey.set('errada');
      fetchSpy.and.returnValue(json({ status_code: 7 }, 401));
      await expectAsync(lookup.search('duna', signal, 'filmes')).toBeRejectedWith(jasmine.any(LookupError));
      fetchSpy.and.returnValue(json({ status_code: 7 }, 401));
      await lookup.search('duna', signal, 'filmes').catch((e: LookupError) => expect(e.kind).toBe('tmdb-key'));
    });
  });

  describe('capas de um jogo (Wikipedia, RAWG, Steam)', () => {
    const hades = { name: 'Hades', year: '2018', coverUrl: 'https://upload.wikimedia.org/hades.jpg', source: 'wikipedia' as const, sourceId: '1' };

    beforeEach(() => {
      settings.rawgKey.set('k');
      fetchSpy.and.callFake((input: RequestInfo | URL) => {
        const u = String(input);
        if (u.includes('api.rawg.io/api/games?'))
          return json({
            results: [
              {
                id: 7,
                name: 'Hades',
                released: '2020-09-17',
                background_image: 'https://media.rawg.io/media/games/arte.jpg',
                short_screenshots: [{ image: 'https://media.rawg.io/media/screenshots/t1.jpg' }, { image: 'https://media.rawg.io/media/screenshots/t2.jpg' }],
                stores: [],
              },
              { id: 8, name: 'Hades', released: '1996-01-01', background_image: 'https://media.rawg.io/media/games/velho.jpg', stores: [] },
            ],
          });
        if (u.includes('api.rawg.io/api/games/7?')) return json({ background_image_additional: 'https://media.rawg.io/media/screenshots/extra.jpg' });
        return json({ query: { pages: [] } });
      });
    });

    it('traz a arte de fundo, a extra e as telas da RAWG, do jogo mais perto no ano, com a etiqueta de cada uma', async () => {
      const { choices: found } = await lookup.coverChoices(hades, 'jogos', signal);
      expect(found[0]).toEqual(jasmine.objectContaining({ coverUrl: hades.coverUrl, from: 'Wikipedia' }));
      const rawg = found.filter((c) => c.from === 'RAWG').map((c) => c.coverUrl);
      expect(rawg).toEqual([
        'https://media.rawg.io/media/resize/640/-/games/arte.jpg',
        'https://media.rawg.io/media/resize/640/-/screenshots/extra.jpg',
        'https://media.rawg.io/media/resize/640/-/screenshots/t1.jpg',
        'https://media.rawg.io/media/resize/640/-/screenshots/t2.jpg',
      ]);
      // o Hades de 1996 fica de fora: longe demais no ano
      expect(found.some((c) => c.coverUrl?.includes('velho'))).toBeFalse();
      expect(found.find((c) => c.from === 'RAWG')).toEqual(jasmine.objectContaining({ source: 'rawg', sourceId: '7' }));
    });

    it('a Wikipedia procura pelo título exato e separa os jogos de mesmo nome pelo ano do título', async () => {
      settings.rawgKey.set('');
      const gow = { name: 'God of War', year: '2018', coverUrl: null, source: 'rawg' as const, sourceId: '58175' };
      fetchSpy.and.callFake((input: RequestInfo | URL) => {
        const u = decodeURIComponent(String(input)).replace(/\+/g, ' ');
        expect(u).toContain('intitle:"God of War"');
        return json({
          query: {
            pages: [
              { index: 1, title: 'God of War (2018 video game)', description: 'Action-adventure game', thumbnail: { source: 'https://w/gow2018.jpg' } },
              { index: 2, title: 'God of War (2005 video game)', description: 'Action-adventure game', thumbnail: { source: 'https://w/gow2005.jpg' } },
              { index: 3, title: 'God of War III', description: '2010 video game', thumbnail: { source: 'https://w/gow3.jpg' } },
            ],
          },
        });
      });
      const { choices } = await lookup.coverChoices(gow, 'jogos', signal);
      expect(choices.map((c) => c.coverUrl)).toEqual(['https://w/gow2018.jpg']);
    });

    it('a RAWG que falha é dita, não escondida', async () => {
      fetchSpy.and.callFake((input: RequestInfo | URL) =>
        String(input).includes('rawg') ? json({ detail: 'Invalid key' }, 401) : json({ query: { pages: [] } }),
      );
      const { notes } = await lookup.coverChoices(hades, 'jogos', signal);
      expect(notes).toEqual(['A chave da RAWG foi recusada. Confira em Ajustes.']);
    });

    it('sem chave da RAWG, fica só a Wikipedia', async () => {
      settings.rawgKey.set('');
      const { choices: found } = await lookup.coverChoices(hades, 'jogos', signal);
      expect(found.map((c) => c.from)).toEqual(['Wikipedia']);
      expect(fetchSpy.calls.allArgs().some(([u]) => String(u).includes('rawg'))).toBeFalse();
    });
  });

  it('diz ao leitor de tela onde está buscando', () => {
    expect(lookup.sourceName('livros')).toBe('Open Library');
    expect(lookup.sourceName('animes')).toBe('Kitsu');
    expect(lookup.sourceName('filmes')).toBe('Wikipedia');
    settings.tmdbKey.set('abc');
    expect(lookup.sourceName('series')).toBe('TMDB');
  });
});

describe('sameTitle (caça a bugs)', () => {
  it('nomes só de emoji ou pontuação não são todos iguais', () => {
    expect(sameTitle('🎮', '🎲')).toBeFalse();
    expect(sameTitle('???', '!!!')).toBeFalse();
    expect(sameTitle('🎮', '🎮')).toBeTrue();
    expect(sameTitle('Hades II', 'hades ii')).toBeTrue();
  });
});
