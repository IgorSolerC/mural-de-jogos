import { provideZonelessChangeDetection } from '@angular/core';
import { TestBed } from '@angular/core/testing';
import { parseBackupSnapshot } from './backup-file';
import { artistHitId, catalogAlbumId, isCatalogSample, isJointCredit, sameGame } from './game-lookup';
import { KIND_PROFILES, SCORED_KINDS, hasTabs, isMusic, profileOf } from './kinds';
import { Mural } from './mural';
import { ALL_TAB, NO_CATEGORY_TAB, noteTabsOf } from './note-tabs';
import { PickedGame, Review, cleanArtist, computeFinal, isCatalogBonus, musicFormOf, musicGame, relevanceLabel, sanitizeReview, sanitizeWish, shelfOf } from './review';
import { ReviewStore } from './review-store';
import { NO_FILTER, facetKeysOf, facetsOf, matchesFilter, matchesQuery } from './wall-filter';
import { WallView, directionLabelOf, groupWall, sortFor, sortWall } from './wall-view';

const PREVIEW = 'https://audio-ssl.itunes.apple.com/itunes-assets/AudioPreview1/v4/aa/bb/cc/trecho.plus.aac.p.m4a';

let seq = 0;
/** Uma ficha de música como vem do armazenamento, com o que o teste quiser por cima. */
function music(name: string, artist: string | null, extra: Record<string, unknown> = {}, game: Record<string, unknown> = {}): Review {
  return sanitizeReview({
    id: `rmus${String(++seq).padStart(4, '0')}`,
    kind: 'musicas',
    game: { name, coverUrl: null, source: 'itunes', sourceId: `album/${seq}`, form: 'album', ...(artist ? { by: artist } : {}), ...game },
    scores: { envolvimento: 9, letra: 8, vocal: 7, instrumental: 6 },
    status: 'finalizado',
    completedAt: '2026-10-01',
    createdAt: '2026-10-01T10:00:00.000Z',
    updatedAt: '2026-10-01T10:00:00.000Z',
    ...(artist ? { category: artist } : {}),
    ...extra,
  })!;
}

describe('o mural de músicas', () => {
  describe('o perfil do mural', () => {
    it('é um mural de resenhas, com abas, quatro notas e o Envolvimento em dobro', () => {
      const p = profileOf('musicas');
      expect(isMusic('musicas')).toBeTrue();
      expect(SCORED_KINDS).toContain('musicas');
      expect(hasTabs('musicas')).toBeTrue();
      expect(hasTabs('jogos')).toBeFalse();
      expect(p.categories).toEqual([
        { key: 'envolvimento', base: 2 },
        { key: 'letra', base: 1 },
        { key: 'vocal', base: 1 },
        { key: 'instrumental', base: 1 },
      ]);
      expect(p.status).toEqual({ incompleto: 'Pulei', finalizado: 'Ouvi', platinado: 'No repeat' });
      expect(p.amount).toBeNull();
      expect(p.difficulty).toBeNull();
    });

    it('a cartela de bônus tem os dois lados, sem id nem nome repetido', () => {
      const { bonuses } = KIND_PROFILES.musicas;
      expect(new Set(bonuses.map((b) => b.id)).size).toBe(bonuses.length);
      expect(new Set(bonuses.map((b) => `${b.kind}:${b.label}`)).size).toBe(bonuses.length);
      expect(bonuses.filter((b) => b.kind === 'favor').length).toBeGreaterThan(15);
      expect(bonuses.filter((b) => b.kind === 'contra').length).toBeGreaterThan(15);
      expect(isCatalogBonus('musicas', 'refrao')).toBeTrue();
      expect(isCatalogBonus('jogos', 'refrao')).toBeFalse();
    });

    it('a música instrumental tira a Letra e o Vocal da conta', () => {
      // (10×2 + 6) / 3
      expect(computeFinal('musicas', { envolvimento: 10, instrumental: 6 }, { letra: 'nao-tem', vocal: 'nao-tem' })).toBe(8.7);
      // com as quatro: (9×2 + 8 + 7 + 6) / 5
      expect(computeFinal('musicas', { envolvimento: 9, letra: 8, vocal: 7, instrumental: 6 })).toBe(7.8);
    });

    it('na wishlist, o que se quer muito é MUST HEAR', () => {
      expect(relevanceLabel('musicas', 'must')).toBe('MUST HEAR');
      expect(relevanceLabel('filmes', 'must')).toBe('MUST WATCH');
    });
  });

  describe('a ficha', () => {
    it('guarda o tipo, o artista, a amostra e a faixa de destaque', () => {
      const r = music('OK Computer', 'Radiohead', {}, { sample: PREVIEW, sampleTitle: '  Let   Down ', year: '1997' });
      expect(r.kind).toBe('musicas');
      expect(r.category).toBe('Radiohead');
      expect(r.game).toEqual(jasmine.objectContaining({ form: 'album', sample: PREVIEW, sampleTitle: 'Let Down', by: 'Radiohead', year: '1997' }));
      expect(r.scores.final).toBe(7.8);
      expect(shelfOf(r)).toBe('musicas');
    });

    it('sem dizer o tipo, é um álbum', () => {
      const r = sanitizeReview({ kind: 'musicas', game: { name: 'Fita demo' }, scores: { envolvimento: 6 } })!;
      expect(musicFormOf(r.game)).toBe('album');
      expect(r.game.form).toBe('album');
      expect(r.category).toBeUndefined();
    });

    it('a faixa de destaque é do álbum com amostra; o álbum de origem, da música solta', () => {
      expect(music('Disco', 'A', {}, { sampleTitle: 'Faixa 1' }).game.sampleTitle).toBeUndefined();
      expect(music('Disco', 'A', {}, { album: 'Outro' }).game.album).toBeUndefined();
      const song = music('Karma Police', 'Radiohead', {}, { form: 'faixa', sample: PREVIEW, sampleTitle: 'x', album: 'OK Computer' });
      expect(song.game).toEqual(jasmine.objectContaining({ form: 'faixa', album: 'OK Computer', sample: PREVIEW }));
      expect(song.game.sampleTitle).toBeUndefined();
      expect(musicGame({ name: 'X', coverUrl: null, source: 'manual' }).form).toBe('album');
    });

    it('o link da amostra precisa ser https; o resto é jogado fora', () => {
      expect(music('A', 'B', {}, { sample: 'http://exemplo.com/a.mp3' }).game.sample).toBeUndefined();
      expect(music('A', 'B', {}, { sample: 'javascript:alert(1)' }).game.sample).toBeUndefined();
      expect(music('A', 'B', {}, { sample: 'https://exemplo.com/a b.mp3' }).game.sample).toBeUndefined();
      expect(music('A', 'B', {}, { sample: 'https://youtu.be/dQw4w9WgXcQ' }).game.sample).toBe('https://youtu.be/dQw4w9WgXcQ');
      expect(music('A', 'B', {}, { form: 'disco' }).game.form).toBe('album');
    });

    it('o artista fica como foi escrito, sem espaços a mais', () => {
      expect(cleanArtist('  blink-182  ')).toBe('blink-182');
      expect(cleanArtist(' Os   Mutantes ')).toBe('Os Mutantes');
      expect(music('Enema', '  blink-182 ').category).toBe('blink-182');
      expect(cleanArtist('x'.repeat(200)).length).toBe(60);
    });

    it('os outros murais não ganham artista nem tipo', () => {
      const game = sanitizeReview({ kind: 'jogos', game: { name: 'Hades' }, category: 'Supergiant', scores: { diversao: 9 } })!;
      expect(game.category).toBeUndefined();
      expect(game.game.form).toBeUndefined();
      expect(shelfOf(game)).toBe('reviews');
      expect(shelfOf({ kind: 'anotacoes' })).toBe('notas');
    });

    it('o desejo e o pendente guardam o tipo e a amostra do item', () => {
      const w = sanitizeWish({ kind: 'musicas', game: { name: 'Karma Police', source: 'itunes', sourceId: 'song/1', form: 'faixa', sample: PREVIEW, by: 'Radiohead' } })!;
      expect(w.game).toEqual(jasmine.objectContaining({ form: 'faixa', sample: PREVIEW, by: 'Radiohead' }));
    });
  });

  describe('a mesma obra', () => {
    const g = (name: string, extra: Partial<PickedGame> = {}): PickedGame => ({ name, coverUrl: null, source: 'itunes', ...extra });

    it('o álbum e a música de mesmo nome são obras diferentes', () => {
      expect(sameGame(g('Thriller', { form: 'album' }), g('Thriller', { form: 'faixa' }))).toBeFalse();
      expect(sameGame(g('Thriller', { form: 'album' }), g('thriller', { form: 'album' }))).toBeTrue();
    });

    it('dois "Greatest Hits" de artistas diferentes também', () => {
      expect(sameGame(g('Greatest Hits', { form: 'album', by: 'Queen' }), g('Greatest Hits', { form: 'album', by: '2Pac' }))).toBeFalse();
      expect(sameGame(g('Greatest Hits', { form: 'album', by: 'Queen' }), g('Greatest Hits', { form: 'album' }))).toBeTrue();
    });

    it('nos outros murais continua valendo o título e o ano', () => {
      expect(sameGame(g('Duna', { source: 'openlibrary', by: 'Frank Herbert' }), g('Duna', { source: 'openlibrary', by: 'F. Herbert' }))).toBeTrue();
      expect(sameGame(g('God of War', { year: '2018' }), g('God of War', { year: '2005' }))).toBeFalse();
    });
  });

  describe('o que o catálogo diz de um item', () => {
    it('o artista da busca não é um item: é a porta para os álbuns dele', () => {
      expect(artistHitId({ name: 'Radiohead', coverUrl: null, source: 'itunes', sourceId: 'artist/657515' })).toBe('657515');
      expect(artistHitId({ name: 'OK Computer', coverUrl: null, source: 'itunes', sourceId: 'album/1' })).toBeNull();
      expect(artistHitId({ name: 'Radiohead', coverUrl: null, source: 'manual', sourceId: 'artist/1' })).toBeNull();
      expect(catalogAlbumId({ name: 'OK Computer', coverUrl: null, source: 'itunes', sourceId: 'album/1097861387' })).toBe('1097861387');
      expect(catalogAlbumId({ name: 'Karma Police', coverUrl: null, source: 'itunes', sourceId: 'song/1' })).toBeNull();
    });

    it('distingue o trecho do catálogo do link que a pessoa colou', () => {
      expect(isCatalogSample(PREVIEW)).toBeTrue();
      expect(isCatalogSample('https://youtu.be/dQw4w9WgXcQ')).toBeFalse();
      expect(isCatalogSample(undefined)).toBeFalse();
    });

    it('reconhece o crédito de mais de um nome', () => {
      for (const by of ['Daft Punk, Pharrell Williams & Nile Rodgers', 'Milton Nascimento & Lô Borges', 'Anitta feat. Cardi B', 'Emicida com Gilberto Gil']) {
        expect(isJointCredit(by)).withContext(by).toBeTrue();
      }
      for (const by of ['Radiohead', 'Legião Urbana', 'Os Paralamas do Sucesso']) expect(isJointCredit(by)).withContext(by).toBeFalse();
    });
  });

  describe('as abas dos artistas', () => {
    const wall = () => [
      music('OK Computer', 'Radiohead'),
      music('Kid A', 'radiohead'),
      music('Karma Police', 'Radiohead', {}, { form: 'faixa' }),
      music('Dois', 'Legião Urbana'),
      music('Fita demo', null, {}, { source: 'manual' }),
    ];

    it('uma por artista, sem ligar para a caixa, e "Sem artista" para o resto', () => {
      const tabs = noteTabsOf(wall(), undefined, 'Sem artista');
      expect(tabs.tabs.map((t) => [t.label, t.n])).toEqual([
        ['Radiohead', 3],
        ['Legião Urbana', 1],
        ['Sem artista', 1],
      ]);
      expect(tabs.tabs.at(-1)!.key).toBe(NO_CATEGORY_TAB);
    });

    describe('na vista do mural', () => {
      let view: WallView;
      let mural: Mural;

      beforeEach(() => {
        localStorage.clear();
        TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
        const store = TestBed.inject(ReviewStore);
        mural = TestBed.inject(Mural);
        view = TestBed.inject(WallView);
        store.reviews.set([...wall(), sanitizeReview({ id: 'rjogo001', kind: 'jogos', game: { name: 'Hades' }, scores: { diversao: 9 } })!]);
        mural.kind.set('musicas');
      });

      afterEach(() => localStorage.clear());

      it('a aba aberta mostra só as fichas do artista, e a busca avisa do que ficou nas outras', () => {
        expect(view.music()).toBeTrue();
        expect(view.noteTabs()!.tabs.map((t) => t.label)).toEqual(['Radiohead', 'Legião Urbana', 'Sem artista']);
        view.setNoteTab('c:radiohead');
        expect(view.activeTabLabel()).toBe('Radiohead');
        expect(view.visible().map((r) => r.game.name).sort()).toEqual(['Karma Police', 'Kid A', 'OK Computer']);
        view.query.set('dois');
        expect(view.visible()).toEqual([]);
        expect(view.elsewhere()).toBe(1);
      });

      it('a aba das músicas é guardada à parte da das anotações', () => {
        view.setNoteTab('c:radiohead');
        mural.kind.set('anotacoes');
        expect(view.activeTab()).toBe(ALL_TAB);
        expect(view.noteTab()).toBe(ALL_TAB);
        mural.kind.set('musicas');
        expect(view.activeTab()).toBe('c:radiohead');
        // os outros murais de resenhas continuam sem abas
        mural.kind.set('jogos');
        expect(view.noteTabs()).toBeNull();
        expect(view.activeTab()).toBe(ALL_TAB);
      });

      it('ordena pelo artista em "Tudo"; dentro de uma aba, volta para a data', () => {
        view.setSort('categoria');
        expect(view.shownSort()).toBe('categoria');
        expect(view.groups().map((g) => g.label)).toEqual(['Legião Urbana', 'Radiohead', 'Sem artista']);
        view.setNoteTab('c:radiohead');
        expect(view.shownSort()).toBe('data');
      });

      it('uma ficha nova de outro artista abre a aba dela', () => {
        view.setNoteTab('c:radiohead');
        view.reveal(view.wall().find((r) => r.game.name === 'Dois')!);
        expect(view.activeTabLabel()).toBe('Legião Urbana');
      });

      it('a cartela tem o Tipo (álbum ou música) e não tem Categoria nem Dificuldade', () => {
        const keys = view.facets().map((f) => f.key);
        expect(keys).toContain('form');
        expect(keys).not.toContain('category');
        expect(keys).not.toContain('difficulty');
        view.toggle('form', 'faixa');
        expect(view.visible().map((r) => r.game.name)).toEqual(['Karma Police']);
        expect(view.tags().map((t) => t.label)).toEqual(['Música']);
      });
    });
  });

  describe('a ordem, as seções e os filtros', () => {
    const p = profileOf('musicas');

    it('só as músicas se ordenam pelo artista; a tag e a prioridade continuam das anotações', () => {
      expect(sortFor('categoria', p)).toBe('categoria');
      expect(sortFor('categoria', profileOf('jogos'))).toBe('data');
      expect(sortFor('tag', p)).toBe('data');
      expect(sortFor('prioridade', p)).toBe('data');
      expect(directionLabelOf('categoria', 'asc', p)).toBe('Artistas de A a Z');
    });

    it('a seção diz quantos álbuns e quantas músicas tem', () => {
      const order = { sort: 'data' as const, key: 'final' as const, direction: 'desc' as const, profile: p };
      const list = sortWall([music('A', 'X'), music('B', 'X'), music('C', 'X', {}, { form: 'faixa' })], order);
      expect(groupWall(list, order)[0].summary).toBe('2 álbuns · 1 música · média 7,8');
      expect(groupWall([music('C', 'X', {}, { form: 'faixa' })], order)[0].summary).toBe('1 música');
    });

    it('o grupo Tipo só existe no mural de músicas', () => {
      expect(facetKeysOf(p)).toContain('form');
      expect(facetKeysOf(profileOf('jogos'))).not.toContain('form');
      const list = [music('A', 'X'), music('B', 'X', {}, { form: 'faixa' })];
      const form = facetsOf(list, NO_FILTER, p).find((f) => f.key === 'form')!;
      expect(form.options.map((o) => [o.label, o.n])).toEqual([
        ['Álbum', 1],
        ['Música', 1],
      ]);
      expect(matchesFilter(list[0], { ...NO_FILTER, form: ['faixa'] })).toBeFalse();
      expect(matchesFilter(list[1], { ...NO_FILTER, form: ['faixa'] })).toBeTrue();
    });

    it('a busca acha pelo artista, pelo álbum de onde a música é e pela faixa de destaque', () => {
      const song = music('Let Down', 'Radiohead', {}, { form: 'faixa', album: 'OK Computer' });
      const album = music('Clube da Esquina', 'Milton Nascimento', {}, { by: 'Milton Nascimento & Lô Borges', sample: PREVIEW, sampleTitle: 'Nuvem Cigana' });
      expect(matchesQuery(song, 'radiohead')).toBeTrue();
      expect(matchesQuery(song, 'ok computer')).toBeTrue();
      expect(matchesQuery(album, 'lo borges')).toBeTrue();
      expect(matchesQuery(album, 'nuvem cigana')).toBeTrue();
      expect(matchesQuery(album, 'beatles')).toBeFalse();
    });
  });

  describe('guardar e levar', () => {
    let store: ReviewStore;
    const MUSIC_KEY = 'mural-de-jogos:musicas:v1';
    const REVIEWS_KEY = 'mural-de-jogos:resenhas:v1';

    beforeEach(() => {
      localStorage.clear();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      store = TestBed.inject(ReviewStore);
    });

    afterEach(() => localStorage.clear());

    it('as músicas moram numa lista à parte: um site antigo nunca as lê como jogos', () => {
      store.add(music('OK Computer', 'Radiohead'));
      store.add(sanitizeReview({ id: 'rjogo001', kind: 'jogos', game: { name: 'Hades' }, scores: { diversao: 9 } })!);
      TestBed.tick();
      expect(JSON.parse(localStorage.getItem(MUSIC_KEY)!).map((r: Review) => r.game.name)).toEqual(['OK Computer']);
      expect(JSON.parse(localStorage.getItem(REVIEWS_KEY)!).map((r: Review) => r.game.name)).toEqual(['Hades']);
      // e voltam de lá ao abrir de novo
      TestBed.resetTestingModule();
      TestBed.configureTestingModule({ providers: [provideZonelessChangeDetection()] });
      const again = TestBed.inject(ReviewStore);
      expect(again.reviews().map((r) => [r.kind, r.game.name]).sort()).toEqual([
        ['jogos', 'Hades'],
        ['musicas', 'OK Computer'],
      ]);
    });

    it('pregar um jogo não regrava a lista das músicas', () => {
      store.add(music('OK Computer', 'Radiohead'));
      TestBed.tick();
      localStorage.setItem(MUSIC_KEY, localStorage.getItem(MUSIC_KEY)! + ' ');
      const marked = localStorage.getItem(MUSIC_KEY);
      store.add(sanitizeReview({ id: 'rjogo002', kind: 'jogos', game: { name: 'Celeste' }, scores: { diversao: 9 } })!);
      TestBed.tick();
      expect(localStorage.getItem(MUSIC_KEY)).toBe(marked);
    });

    it('o backup leva as músicas em `musicas`, e as traz de volta', () => {
      store.add(music('OK Computer', 'Radiohead', {}, { sample: PREVIEW, sampleTitle: 'Airbag' }));
      const snap = store.snapshot();
      expect(snap.reviews).toEqual([]);
      expect(snap.musicas!.map((r) => r.game.name)).toEqual(['OK Computer']);
      store.importJson(JSON.stringify({ reviews: [], musicas: [] }), 'replace');
      expect(store.count()).toBe(0);
      const res = store.importJson(JSON.stringify(snap), 'merge');
      expect(res.added).toBe(1);
      expect(store.reviews()[0]).toEqual(jasmine.objectContaining({ kind: 'musicas', category: 'Radiohead' }));
      expect(store.reviews()[0].game.sampleTitle).toBe('Airbag');
    });

    it('um backup de antes das músicas, restaurado, não apaga as daqui', () => {
      store.add(music('OK Computer', 'Radiohead'));
      store.importJson(JSON.stringify({ reviews: [{ id: 'rjogo003', game: { name: 'Hades' }, scores: { diversao: 9 } }] }), 'replace');
      expect(store.reviews().map((r) => r.game.name).sort()).toEqual(['Hades', 'OK Computer']);
    });

    it('trocar o artista da original leva as reescutas para a mesma aba', () => {
      const original = music('OK Computer', 'Radiohed');
      store.add(original);
      store.add({ ...music('OK Computer', 'Radiohed', { completedAt: '2026-10-05' }), revisitOf: original.id });
      store.update({ ...original, category: 'Radiohead', updatedAt: '2026-10-06T10:00:00.000Z' });
      expect(store.reviews().map((r) => r.category)).toEqual(['Radiohead', 'Radiohead']);
    });

    it('o mural de alguém aberto aqui mostra as músicas dela, menos as privadas', () => {
      const doc = {
        app: 'meu-mural',
        version: 2,
        reviews: [],
        musicas: [music('OK Computer', 'Radiohead'), music('Segredo', 'X', { private: true })],
      };
      expect(parseBackupSnapshot(JSON.stringify(doc)).reviews.map((r) => [r.kind, r.game.name])).toEqual([['musicas', 'OK Computer']]);
    });
  });
});
