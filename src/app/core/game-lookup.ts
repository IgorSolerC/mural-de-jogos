import { Injectable, inject } from '@angular/core';
import { Kind, PickedGame, fold, musicFormOf } from './review';
import { CoverSource, Settings } from './settings';
import { SiteCatalog, SiteKeys } from './site-keys';

export class LookupError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'rawg-key' | 'tmdb-key' | 'site-key' | 'server',
  ) {
    super(message);
  }
}

const WIKI = 'https://en.wikipedia.org/w/api.php';

/**
 * Como chegar à RAWG ou ao TMDB: com a chave da pessoa (colada em Ajustes), direto ao catálogo; sem
 * ela, pela busca do site (a chave fica na nuvem, ver core/site-keys.ts).
 */
type Via = { own: string } | { site: string };

/** Quanto a primeira busca de uma visita espera a nuvem dizer se tem as chaves do site. */
const SITE_KEYS_WAIT_MS = 1_500;

/** Grupos de ISBN do Brasil (CBL): 85 e 65, nas versões de 13 e de 10 dígitos. */
const BRAZILIAN_BOOK_FILTER = 'language:por isbn:(97885* OR 97865* OR 85* OR 65*)';
const BOOK_SEARCH_FIELDS = 'key,title,author_name,first_publish_year,cover_i,editions,editions.key,editions.title,editions.language,editions.cover_i,editions.isbn';

function brazilianBookEdition(e: any): boolean {
  return [e?.isbn, e?.isbn_13, e?.isbn_10]
    .flatMap((list) => Array.isArray(list) ? list : [])
    .some((isbn) => typeof isbn === 'string' && /^(?:978(?:85|65)\d{8}|(?:85|65)\d{7}[\dX])$/.test(isbn.replace(/[\s-]/g, '').toUpperCase()));
}

/** A busca usa `language`; a lista de edições usa `languages` com chaves do catálogo. */
function bookEditionRank(e: any): number {
  const languages: any[] = Array.isArray(e?.language) ? e.language : Array.isArray(e?.languages) ? e.languages : [];
  if (!languages.some((l) => l === 'por' || l?.key === '/languages/por')) return 2;
  return brazilianBookEdition(e) ? 0 : 1;
}

/** Onde cada mural procura na Wikipedia (sem chave): páginas com a caixa de informações daquele tipo. */
const WIKI_TEMPLATE: Record<Exclude<Kind, 'livros' | 'musicas' | 'anotacoes'>, string> = {
  jogos: 'Infobox video game',
  filmes: 'Infobox film',
  series: 'Infobox television',
  // a caixa do animanga: a de vídeo deixaria de fora páginas como a de Frieren, que junta mangá e anime
  animes: 'Infobox animanga/Header',
};

/** Capa vertical oficial da Steam: a arte da biblioteca, 600x900, com o título do jogo. */
function steamCoverUrl(appId: string): string {
  return `https://shared.steamstatic.com/store_item_assets/steam/apps/${appId}/library_600x900.jpg`;
}

export function isSteamCover(url: string | null | undefined): boolean {
  return !!url && /steamstatic\.com\/.+\/library_600x900\.jpg$/.test(url);
}

/** Uma capa para escolher, com o nome de onde ela veio (a etiqueta embaixo da foto). */
export interface CoverChoice extends PickedGame {
  from: string;
}

const SOURCE_LABEL: Record<PickedGame['source'], string> = {
  wikipedia: 'Wikipedia',
  rawg: 'RAWG',
  openlibrary: 'Open Library',
  kitsu: 'Kitsu',
  anilist: 'AniList',
  tmdb: 'TMDB',
  itunes: 'iTunes',
  manual: 'Link',
};

/** De onde veio a capa de um item: a da Steam é a da Steam, mesmo quando o jogo foi achado na RAWG. */
export function coverFrom(g: PickedGame): string {
  return isSteamCover(g.coverUrl) ? 'Steam' : SOURCE_LABEL[g.source];
}

/** As imagens da RAWG vêm enormes: a versão de 640px de largura basta para a capa. */
function rawgResize(url: string): string {
  return url.replace('/media/games/', '/media/resize/640/-/games/').replace('/media/screenshots/', '/media/resize/640/-/screenshots/');
}

/** Quanto um catálogo tem para responder antes da busca desistir dele. */
const LOOKUP_DEADLINE_MS = 9000;

/**
 * O cancelamento de quem pediu, mais um prazo: um catálogo pendurado (Wi-Fi de hotel, sinal fraco,
 * com `navigator.onLine` dizendo que está tudo bem) não prende a busca para sempre.
 */
function withDeadline(signal: AbortSignal, ms = LOOKUP_DEADLINE_MS): AbortSignal {
  const ctrl = new AbortController();
  const stop = () => ctrl.abort(signal.reason);
  if (signal.aborted) stop();
  else signal.addEventListener('abort', stop, { once: true });
  const timer = setTimeout(() => ctrl.abort(new DOMException('O catálogo demorou demais.', 'TimeoutError')), ms);
  ctrl.signal.addEventListener('abort', () => clearTimeout(timer), { once: true });
  return ctrl.signal;
}

/** O erro de uma chamada: o cancelamento de quem pediu passa direto; o resto vira um aviso legível. */
function lookupFailure(e: unknown, signal: AbortSignal): unknown {
  if (signal.aborted) return e;
  const name = (e as Error)?.name;
  if (name === 'TimeoutError') return new LookupError('O catálogo demorou demais para responder.', 'offline');
  if (name === 'SyntaxError') return new LookupError('O catálogo não respondeu.', 'server');
  if (e instanceof LookupError) return e;
  return new LookupError('Não consegui falar com o catálogo.', 'offline');
}

/** Nem todo jogo da Steam tem a arte vertical: confere se a imagem existe antes de usar. */
export function imageLoads(url: string, signal: AbortSignal, timeoutMs = 8000): Promise<boolean> {
  return new Promise((resolve) => {
    const img = new Image();
    const done = (ok: boolean) => {
      clearTimeout(timer);
      signal.removeEventListener('abort', onAbort);
      img.onload = img.onerror = null;
      resolve(ok);
    };
    const onAbort = () => done(false);
    const timer = setTimeout(() => done(false), timeoutMs);
    signal.addEventListener('abort', onAbort);
    img.onload = () => done(img.naturalWidth > 0);
    img.onerror = () => done(false);
    img.referrerPolicy = 'no-referrer';
    img.src = url;
  });
}

/**
 * O ano que a RAWG põe no nome para separar jogos de mesmo nome: "God of War (2018)" é "God of War",
 * de 2018. Só um ano sozinho entre parênteses, no fim: "Blade Runner 2049" fica como está.
 */
export function splitYear(name: string): { base: string; year?: string } {
  const m = name.match(/^(.*\S)\s*\(((?:19|20)\d{2})\)\s*$/);
  return m ? { base: m[1], year: m[2] } : { base: name };
}

/**
 * O mesmo título, sem ligar para acento, maiúscula nem pontuação ("Hades II" = "hades ii"), nem
 * para o ano que a RAWG põe no fim ("God of War (2018)" = "God of War"; quem precisa, compara o ano).
 */
export function sameTitle(a: string, b: string): boolean {
  const k = (s: string) => fold(splitYear(s).base).replace(/[^\p{L}\p{N}]+/gu, '');
  const ka = k(a);
  const kb = k(b);
  // sem letra nem número (só emoji ou pontuação), compara o nome como foi escrito
  if (!ka || !kb) return a.trim() === b.trim() && !!a.trim();
  return ka === kb;
}

/**
 * A mesma obra: o mesmo título e, se os dois têm ano, o mesmo ano. Nas músicas, também o mesmo tipo
 * (o álbum "Thriller" não é a música "Thriller") e, se os dois dizem, o mesmo artista ("Greatest
 * Hits" tem um de cada banda).
 */
export function sameGame(a: PickedGame, b: PickedGame): boolean {
  if (!sameTitle(a.name, b.name) || (!!a.year && !!b.year && a.year !== b.year)) return false;
  if (!a.form && !b.form) return true;
  return musicFormOf(a) === musicFormOf(b) && (!a.by || !b.by || fold(a.by) === fold(b.by));
}

// ===== As músicas: o catálogo do iTunes (sem chave), com a capa e um trecho de cada faixa =====

const ITUNES = 'https://itunes.apple.com';
/** A loja de onde vêm os nomes e o que está à venda: a do Brasil. */
const ITUNES_STORE = { country: 'BR', lang: 'pt_br' };
const HTTPS = /^https:\/\//;

/**
 * O artista como resultado da busca: não é um item para resenhar, é a porta para os álbuns dele.
 * Devolve o número dele no catálogo (ver `GameLookup.artistAlbums`), ou null se o resultado não é um artista.
 */
export function artistHitId(g: PickedGame): string | null {
  return g.source === 'itunes' ? (g.sourceId?.match(/^artist\/(\d+)$/)?.[1] ?? null) : null;
}

/** O número do álbum no catálogo, se o item veio de lá como álbum; senão, null. */
export function catalogAlbumId(g: PickedGame): string | null {
  return g.source === 'itunes' ? (g.sourceId?.match(/^album\/(\d+)$/)?.[1] ?? null) : null;
}

/** O link é um trecho do catálogo (e não um que a pessoa colou)? */
export function isCatalogSample(url: string | null | undefined): boolean {
  return !!url && /^https:\/\/audio-ssl\.itunes\.apple\.com\//.test(url);
}

/**
 * O crédito junta mais de um nome ("Daft Punk, Pharrell Williams & Nile Rodgers", "Fulano feat.
 * Sicrano")? Aí o artista da aba é o principal (ver `GameLookup.primaryArtist`). Um nome que só
 * parece junto ("Simon & Garfunkel") também passa por aqui, e o catálogo devolve ele mesmo.
 */
export function isJointCredit(by: string): boolean {
  return /[,&+]|\s(feat|ft|featuring|com|part|x|vs)\.?\s/i.test(by);
}

/** Uma faixa de um álbum, para escolher a que toca no vinil. */
export interface AlbumTrack {
  n: number;
  name: string;
  /** O trecho de 30 segundos do catálogo. */
  sample: string;
}

/** A capa do iTunes vem em miniatura (100x100): o mesmo endereço serve a de 600. */
function itunesCover(url: unknown): string | null {
  return typeof url === 'string' && HTTPS.test(url) ? url.replace(/\/\d+x\d+(bb)?\.(jpg|png|webp)$/i, '/600x600bb.jpg') : null;
}

function itunesYear(r: any): string | undefined {
  return typeof r?.releaseDate === 'string' && /^\d{4}/.test(r.releaseDate) ? r.releaseDate.slice(0, 4) : undefined;
}

/** Um álbum do catálogo como item (null: não serve, ou é o "single" de uma faixa só, que já vem como música). */
function itunesAlbum(r: any): PickedGame | null {
  const name = String(r?.collectionName ?? '').trim();
  if (!name || !r?.collectionId) return null;
  if (r.trackCount === 1 && / - Single$/i.test(name)) return null;
  return {
    name,
    coverUrl: itunesCover(r.artworkUrl100),
    source: 'itunes',
    sourceId: `album/${r.collectionId}`,
    year: itunesYear(r),
    by: String(r.artistName ?? '').trim() || undefined,
    form: 'album',
  };
}

/** Uma música do catálogo como item, já com o trecho que o vinil toca. */
function itunesSong(r: any): PickedGame | null {
  const name = String(r?.trackName ?? '').trim();
  if (!name || !r?.trackId) return null;
  const album = String(r.collectionName ?? '').replace(/ - Single$/i, '').trim();
  return {
    name,
    coverUrl: itunesCover(r.artworkUrl100),
    source: 'itunes',
    sourceId: `song/${r.trackId}`,
    year: itunesYear(r),
    by: String(r.artistName ?? '').trim() || undefined,
    form: 'faixa',
    ...(typeof r.previewUrl === 'string' && HTTPS.test(r.previewUrl) ? { sample: r.previewUrl } : {}),
    ...(album && !sameTitle(album, name) ? { album } : {}),
  };
}

/**
 * O ano de uma página da Wikipedia: o do título ("God of War (2018 video game)", "jogo eletrônico de
 * 2018"), que é o que separa os jogos de mesmo nome, ou então o da descrição ("2016 video game").
 */
function wikiYear(p: any): string | undefined {
  const paren = String(p?.title ?? '').match(/\(([^)]*)\)\s*$/)?.[1] ?? '';
  return paren.match(/\b(19|20)\d{2}\b/)?.[0] ?? String(p?.description ?? '').match(/\b(19|20)\d{2}\b/)?.[0];
}

/** As capas de onde veio cada uma, e o que não respondeu (para dizer à pessoa, em vez de sumir calado). */
export interface CoverChoices {
  choices: CoverChoice[];
  notes: string[];
}

/** Tira "(video game)", "(2010 film)", "(TV series)", "(anime)" etc. do título da Wikipedia. */
function cleanWikiTitle(title: string): string {
  return title.replace(/\s*\([^)]*\b(game|film|series|miniseries|TV|anime|manga)\b[^)]*\)\s*$/i, '').trim();
}

/** Monta a busca do CirrusSearch: só letras/números, curinga na última palavra. */
function wikiQuery(q: string, template: string): string {
  const words = q
    .replace(/[^\p{L}\p{N}\s':-]/gu, ' ')
    .split(/\s+/)
    .filter(Boolean);
  if (!words.length) return '';
  const last = words.length - 1;
  if (words[last].length >= 2 && /[\p{L}\p{N}]$/u.test(words[last])) words[last] += '*';
  return `${words.join(' ')} hastemplate:"${template}"`;
}

@Injectable({ providedIn: 'root' })
export class GameLookup {
  private readonly settings = inject(Settings);
  private readonly siteKeys = inject(SiteKeys);
  /** O que a busca da RAWG já contou: o jogo está na Steam? (id da RAWG → sim/não) */
  private readonly onSteam = new Map<string, boolean>();
  /** O que a busca de músicas já contou: de qual artista (o principal) é cada álbum e cada música. */
  private readonly artistIds = new Map<string, string>();

  /** O nome do catálogo onde o mural procura, para o leitor de tela. */
  sourceName(kind: Kind): string {
    switch (kind) {
      case 'livros':
        return 'Open Library';
      case 'animes':
        return 'Kitsu';
      case 'musicas':
        return 'loja do iTunes';
      case 'filmes':
      case 'series':
        return this.tmdbVia() ? 'TMDB' : 'Wikipedia';
      default:
        return this.rawgVia() ? 'RAWG' : 'Wikipedia';
    }
  }

  /** De onde vêm jogos e capas de jogos agora: a RAWG (com a chave da pessoa ou a do site) ou a Wikipedia. */
  gamesSource(): { name: 'RAWG' | 'Wikipedia'; own: boolean } {
    const via = this.rawgVia();
    return via ? { name: 'RAWG', own: 'own' in via } : { name: 'Wikipedia', own: false };
  }

  /** De onde vêm filmes e séries agora: o TMDB (com a chave da pessoa ou a do site) ou a Wikipedia. */
  filmsSource(): { name: 'TMDB' | 'Wikipedia'; own: boolean } {
    const via = this.tmdbVia();
    return via ? { name: 'TMDB', own: 'own' in via } : { name: 'Wikipedia', own: false };
  }

  private rawgVia(): Via | null {
    const own = this.settings.rawgKey().trim();
    if (own) return { own };
    const site = this.siteKeys.base('rawg');
    return site ? { site } : null;
  }

  private tmdbVia(): Via | null {
    const own = this.settings.tmdbKey().trim();
    if (own) return { own };
    const site = this.siteKeys.base('tmdb');
    return site ? { site } : null;
  }

  /** Sem a chave da pessoa, espera (pouco) a nuvem dizer se tem a do site; depois da primeira vez, não espera. */
  private async siteKeysKnown(): Promise<void> {
    if (this.settings.rawgKey().trim() && this.settings.tmdbKey().trim()) return;
    await Promise.race([this.siteKeys.ready, new Promise((r) => setTimeout(r, SITE_KEYS_WAIT_MS))]);
  }

  /**
   * Procura no catálogo do mural. Livros: Open Library, preferindo a edição brasileira. Animes: Kitsu (com o
   * nome em português quando há), e o AniList se o Kitsu não responder. Filmes e séries: o TMDB, em
   * português, quando há chave (a da pessoa ou a do site); senão a Wikipedia. Jogos: a RAWG do mesmo
   * jeito, ou a Wikipedia (`source` força a Wikipedia). Se a chave do site para de servir no meio
   * (cota, recusada), a busca volta para a Wikipedia sem erro.
   */
  async search(q: string, signal: AbortSignal, kind: Kind, source: CoverSource = 'rawg'): Promise<PickedGame[]> {
    const query = q.trim();
    if (query.length < 2) return [];
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new LookupError('Sem internet agora.', 'offline');
    }
    if (kind === 'jogos' || kind === 'filmes' || kind === 'series') await this.siteKeysKnown();
    switch (kind) {
      // anotação não tem catálogo: o título é o que a pessoa escrever
      case 'anotacoes':
        return [];
      case 'livros':
        return this.searchOpenLibrary(query, signal);
      case 'musicas':
        return this.searchItunes(query, signal);
      case 'animes':
        try {
          return await this.searchKitsu(query, signal);
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e;
          return this.searchAniList(query, signal);
        }
      case 'filmes':
      case 'series': {
        const via = this.tmdbVia();
        if (via) return this.orWikipedia(this.searchTmdb(query, via, kind === 'filmes' ? 'movie' : 'tv', signal), query, signal, kind);
        return this.searchWikipedia(query, signal, WIKI_TEMPLATE[kind]);
      }
      default: {
        const via = this.rawgVia();
        if (source === 'rawg' && via) return this.orWikipedia(this.searchRawg(query, via, signal), query, signal, 'jogos');
        return this.searchWikipedia(query, signal, WIKI_TEMPLATE.jogos);
      }
    }
  }

  /** A busca pela chave do site que parou de servir vira a da Wikipedia (e a chave do site sai até recarregar). */
  private async orWikipedia(run: Promise<PickedGame[]>, query: string, signal: AbortSignal, kind: 'jogos' | 'filmes' | 'series'): Promise<PickedGame[]> {
    try {
      return await run;
    } catch (e) {
      if (!(e instanceof LookupError) || e.kind !== 'site-key') throw e;
      return this.searchWikipedia(query, signal, WIKI_TEMPLATE[kind]);
    }
  }

  /** Procura o mesmo jogo na outra fonte e devolve a capa de lá (o jogo mais parecido pelo nome). Só no mural de jogos. */
  async findCover(game: PickedGame, source: CoverSource, signal: AbortSignal): Promise<PickedGame | null> {
    const hits = await this.search(game.name, signal, 'jogos', source);
    if (!hits.length) return null;
    const name = fold(game.name);
    const best =
      hits.find((h) => fold(h.name) === name && (!game.year || h.year === game.year)) ??
      hits.find((h) => fold(h.name) === name) ??
      hits[0];
    if (!best.coverUrl) return null;
    const found: PickedGame = { ...game, coverUrl: best.coverUrl, source: best.source, sourceId: best.sourceId, year: game.year ?? best.year };
    return found.source === 'rawg' ? this.withSteamCover(found, signal) : found;
  }

  /**
   * A imagem da RAWG é uma arte de fundo, sem o título. Se o jogo está na Steam, troca pela capa
   * vertical oficial de lá; senão devolve o jogo como veio.
   */
  async withSteamCover(game: PickedGame, signal: AbortSignal): Promise<PickedGame> {
    const via = this.rawgVia();
    if (game.source !== 'rawg' || !game.sourceId || !via || isSteamCover(game.coverUrl)) return game;
    if (this.onSteam.get(game.sourceId) === false) return game;
    try {
      const data = await this.rawgJson(via, `games/${encodeURIComponent(game.sourceId)}/stores`, new URLSearchParams(), signal);
      const urls: string[] = (data?.results ?? []).map((r: any) => String(r?.url ?? ''));
      const appId = urls.map((u) => u.match(/store\.steampowered\.com\/app\/(\d+)/)?.[1]).find(Boolean);
      if (!appId) {
        this.onSteam.set(game.sourceId, false);
        return game;
      }
      const cover = steamCoverUrl(appId);
      return (await imageLoads(cover, signal)) ? { ...game, coverUrl: cover } : game;
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      // Sem a capa da Steam, a arte da RAWG serve.
      return game;
    }
  }

  /**
   * As capas que dá para escolher para um item já achado (a seleção de capa da wishlist): a dele
   * primeiro, depois as do mesmo título em outro lugar. Jogos: Wikipedia, RAWG e a arte da Steam.
   * Filmes e séries no TMDB: os outros pôsteres do título, os em português primeiro. Livros: as capas
   * das edições, as brasileiras em português primeiro. Animes: o Kitsu e o AniList. Uma fonte que falha só não
   * entra (e vira um aviso); a lista nunca vem vazia se o item tem capa. `onSome` recebe a lista a
   * cada fonte que responde (a Wikipedia rápida não espera a RAWG lenta) e quem ainda falta
   * responder, para a tela dizer onde ainda está procurando.
   */
  async coverChoices(
    game: PickedGame,
    kind: Kind,
    signal: AbortSignal,
    onSome?: (sofar: CoverChoice[], waiting: string[]) => void,
  ): Promise<CoverChoices> {
    const tasks: { from: string; run: Promise<CoverChoice[]> }[] = [];
    const add = (from: string, run: Promise<CoverChoice[]>) => tasks.push({ from, run });
    const same = (h: PickedGame) => sameGame(h, game);
    const alike = (hits: PickedGame[]) =>
      hits.filter(same).map((h) => ({ ...game, coverUrl: h.coverUrl, source: h.source, sourceId: h.sourceId, from: coverFrom(h) }));
    if (kind === 'jogos' || kind === 'filmes' || kind === 'series') await this.siteKeysKnown();
    switch (kind) {
      case 'jogos': {
        add('Wikipedia', this.wikiCovers(game, signal, 'en', WIKI_TEMPLATE.jogos));
        add('Wikipedia', this.wikiCovers(game, signal, 'pt', 'Info/Jogo eletrônico'));
        const via = this.rawgVia();
        if (via) add('RAWG', this.rawgChoices(game, via, signal));
        break;
      }
      case 'filmes':
      case 'series': {
        const via = this.tmdbVia();
        if (via && game.source === 'tmdb' && game.sourceId) add('TMDB', this.tmdbPosters(game, via, signal).then((l) => l.map((g) => ({ ...g, from: 'TMDB' }))));
        else add('Wikipedia', this.wikiCovers(game, signal, 'en', WIKI_TEMPLATE[kind]));
        add('Wikipedia', this.wikiCovers(game, signal, 'pt', null));
        break;
      }
      case 'livros':
        if (game.source === 'openlibrary' && game.sourceId)
          add('Open Library', this.editionCovers(game, signal).then((l) => l.map((g) => ({ ...g, from: 'Open Library' }))));
        break;
      case 'animes':
        add('Kitsu', this.searchKitsu(game.name, signal).then(alike));
        add(
          'AniList',
          this.searchAniList(game.name, signal).then((hits) => {
            const hit = hits.find(same) ?? hits.find((h) => !!game.year && h.year === game.year);
            return hit ? [{ ...game, coverUrl: hit.coverUrl, source: hit.source, sourceId: hit.sourceId, from: 'AniList' }] : [];
          }),
        );
        break;
      case 'musicas': {
        // as outras edições do mesmo disco (a remasterizada, a de luxo) costumam ter outra arte
        const album = musicFormOf(game) === 'album';
        add(
          'iTunes',
          this.itunesResults(`${game.name} ${game.by ?? ''}`.trim(), album ? 'album' : 'song', 12, signal).then((rows) =>
            alike(rows.map(album ? itunesAlbum : itunesSong).filter((g): g is PickedGame => g !== null)),
          ),
        );
        break;
      }
    }
    // a lista sempre na mesma ordem das fontes, por mais que elas respondam fora de ordem
    const got: CoverChoice[][] = tasks.map(() => []);
    const merged = () => {
      const seen = new Set<string>();
      const out: CoverChoice[] = [];
      for (const g of [{ ...game, from: coverFrom(game) }, ...got.flat()]) {
        if (!g.coverUrl || seen.has(g.coverUrl)) continue;
        seen.add(g.coverUrl);
        out.push(g);
      }
      return out.slice(0, 16);
    };
    const pending = new Set(tasks.map((_, i) => i));
    const waiting = () => [...new Set([...pending].map((i) => tasks[i].from))];
    if (tasks.length) onSome?.(merged(), waiting());
    const settled = await Promise.allSettled(
      tasks.map((t, i) =>
        t.run.then(
          (v) => {
            got[i] = v;
            pending.delete(i);
            if (!signal.aborted) onSome?.(merged(), waiting());
            return v;
          },
          (e) => {
            pending.delete(i);
            if (!signal.aborted) onSome?.(merged(), waiting());
            throw e;
          },
        ),
      ),
    );
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    // quem falhou não some calado: a chave recusada diz o que fazer, o resto diz quem não respondeu
    const notes = new Set<string>();
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled' || (r.reason as Error)?.name === 'AbortError') return;
      notes.add(r.reason instanceof LookupError && r.reason.kind === 'rawg-key' ? r.reason.message : `${tasks[i].from} não respondeu agora.`);
    });
    return { choices: merged(), notes: [...notes] };
  }

  /**
   * As capas das páginas de mesmo título na Wikipedia (inglês ou português), pelo título exato: a
   * busca do auto-complete, com o curinga na última palavra, põe Warhammer na frente de God of War.
   * Com `template`, só páginas daquela caixa de informações (nos jogos, "Hades" não traz o deus).
   * O ano, quando os dois lados têm, precisa bater: God of War de 2018 não é o de 2005.
   */
  private async wikiCovers(game: PickedGame, signal: AbortSignal, lang: 'en' | 'pt', template: string | null): Promise<CoverChoice[]> {
    // "God of War (2018)", da RAWG: procura "God of War", e o 2018 vale como o ano do item
    const { base, year: named } = splitYear(game.name);
    const year = game.year ?? named;
    const name = base.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
    if (!name) return [];
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      origin: '*',
      generator: 'search',
      gsrsearch: template ? `intitle:"${name}" hastemplate:"${template}"` : `intitle:"${name}"`,
      gsrlimit: '12',
      prop: 'pageimages|description',
      piprop: 'thumbnail',
      pithumbsize: '420',
      pilicense: 'any',
    });
    const data = await this.fetchJson(`https://${lang}.wikipedia.org/w/api.php?${params}`, signal);
    const pages: any[] = data?.query?.pages ?? [];
    return pages
      .filter((p) => typeof p?.thumbnail?.source === 'string')
      .filter((p) => sameTitle(String(p.title ?? '').replace(/\s*\([^)]*\)\s*$/, ''), game.name))
      .filter((p) => {
        const y = wikiYear(p);
        return !year || !y || y === year;
      })
      .sort((a, b) => (Number(a.index) || 99) - (Number(b.index) || 99))
      .map((p) => ({ ...game, coverUrl: p.thumbnail.source as string, from: 'Wikipedia' }));
  }

  /**
   * Tudo o que a RAWG tem do mesmo jogo: a capa vertical da Steam (quando está lá), a arte de fundo,
   * a arte extra e algumas telas. O jogo certo é o de mesmo nome mais perto no ano (a RAWG e a
   * Wikipedia às vezes discordam, por causa do acesso antecipado: Hades é 2018 numa e 2020 na outra).
   */
  private async rawgChoices(game: PickedGame, via: Via, signal: AbortSignal): Promise<CoverChoice[]> {
    const { base, year: named } = splitYear(game.name);
    const itemYear = game.year ?? named;
    const raw = await this.rawgResults(base, via, signal);
    const year = (g: any) => (typeof g?.released === 'string' ? g.released.slice(0, 4) : undefined);
    const own = (g: any) => game.source === 'rawg' && String(g.id) === game.sourceId;
    // quantos anos longe do item (sem ano de um lado, meio ano: nem perto nem longe)
    const dist = (g: any) => (own(g) ? -1 : !itemYear || !year(g) ? 0.5 : Math.abs(Number(year(g)) - Number(itemYear)));
    // o de mesmo nome mais perto no tempo entra sempre; um segundo só se for quase do mesmo ano (um remaster, uma edição)
    const matches = raw
      .filter((g) => g?.id && g?.name && (own(g) || sameTitle(String(g.name), game.name)))
      .sort((a, b) => dist(a) - dist(b))
      .filter((g, i) => i === 0 || dist(g) <= 1)
      .slice(0, 2);
    const out: CoverChoice[] = [];
    for (const [i, m] of matches.entries()) {
      const id = String(m.id);
      const art = typeof m.background_image === 'string' ? rawgResize(m.background_image) : null;
      const base: PickedGame = { ...game, coverUrl: art, source: 'rawg', sourceId: id };
      const steam = await this.withSteamCover(base, signal);
      if (isSteamCover(steam.coverUrl)) out.push({ ...steam, from: 'Steam' });
      if (art) out.push({ ...base, from: 'RAWG' });
      if (i > 0) continue;
      // do jogo mais parecido, também a arte extra e as telas
      const extra: string[] = [];
      try {
        const detail = await this.rawgJson(via, `games/${encodeURIComponent(id)}`, new URLSearchParams(), signal);
        if (typeof detail?.background_image_additional === 'string') extra.push(detail.background_image_additional);
      } catch (e) {
        if ((e as Error).name === 'AbortError') throw e;
      }
      const shots: any[] = Array.isArray(m.short_screenshots) ? m.short_screenshots : [];
      extra.push(...shots.map((sh) => sh?.image).filter((u): u is string => typeof u === 'string').slice(0, 5));
      for (const u of extra) out.push({ ...base, coverUrl: rawgResize(u), from: 'RAWG' });
    }
    return out;
  }

  /** Os pôsteres do título no TMDB: português, inglês e sem texto, os mais votados primeiro. */
  private async tmdbPosters(game: PickedGame, via: Via, signal: AbortSignal): Promise<PickedGame[]> {
    const params = new URLSearchParams({ include_image_language: 'pt,en,null' });
    const data = await this.tmdbJson(`${game.sourceId}/images`, params, via, signal);
    const order: Record<string, number> = { pt: 0, en: 1 };
    const posters: any[] = Array.isArray(data?.posters) ? data.posters : [];
    return posters
      .filter((p) => typeof p?.file_path === 'string')
      .sort((a, b) => (order[a.iso_639_1] ?? 2) - (order[b.iso_639_1] ?? 2) || (b.vote_average ?? 0) - (a.vote_average ?? 0))
      .slice(0, 11)
      .map((p) => ({ ...game, coverUrl: `https://image.tmdb.org/t/p/w500${p.file_path}` }));
  }

  /** As capas das edições da obra: português brasileiro, outro português, outras línguas. */
  private async editionCovers(game: PickedGame, signal: AbortSignal): Promise<PickedGame[]> {
    const data = await this.fetchJson(
      `https://openlibrary.org/works/${encodeURIComponent(game.sourceId ?? '')}/editions.json?limit=60`,
      signal,
    );
    const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];
    return entries
      .filter((e) => Array.isArray(e?.covers) && typeof e.covers[0] === 'number' && e.covers[0] > 0)
      .sort((a, b) => bookEditionRank(a) - bookEditionRank(b))
      .slice(0, 11)
      .map((e) => ({ ...game, coverUrl: `https://covers.openlibrary.org/b/id/${e.covers[0]}-L.jpg?default=false` }));
  }

  /**
   * Duas buscas juntas: a com o curinga na última palavra (para quem ainda está digitando: "hollow
   * kni") e a das palavras como estão. Só o curinga não basta: "God of War*" enche a lista de
   * Warhammer e Warframe, e o God of War não aparece. As exatas vêm primeiro na ordem da Wikipedia.
   */
  private async searchWikipedia(q: string, signal: AbortSignal, template: string): Promise<PickedGame[]> {
    const search = wikiQuery(q, template);
    if (!search) return [];
    const words = q.replace(/[^\p{L}\p{N}\s':-]/gu, ' ').replace(/\s+/g, ' ').trim();
    const [plain, wild] = await Promise.all([
      // a exata é um reforço: se só ela falhar, fica a do curinga
      this.wikiPages(`${words} hastemplate:"${template}"`, signal).catch((e) => {
        if ((e as Error).name === 'AbortError') throw e;
        return [];
      }),
      this.wikiPages(search, signal),
    ]);
    const seen = new Set<string>();
    const pages = [...plain, ...wild].filter((p) => {
      const id = String(p?.pageid ?? p?.title);
      if (seen.has(id)) return false;
      seen.add(id);
      return true;
    });
    const needle = fold(q);
    return pages
      .map((p, i) => ({
        index: i,
        game: {
          name: cleanWikiTitle(String(p.title ?? '')),
          coverUrl: typeof p.thumbnail?.source === 'string' ? p.thumbnail.source : null,
          source: 'wikipedia' as const,
          sourceId: String(p.pageid ?? ''),
          year: wikiYear(p),
        },
      }))
      .filter((x) => x.game.name)
      .sort((a, b) => {
        // Quem começa com o que foi digitado vem primeiro; depois a relevância da Wikipedia.
        const as = fold(a.game.name).startsWith(needle) ? 0 : 1;
        const bs = fold(b.game.name).startsWith(needle) ? 0 : 1;
        return as - bs || a.index - b.index;
      })
      .slice(0, 8)
      .map((x) => x.game);
  }

  /** As páginas de uma busca da Wikipedia em inglês, na ordem de relevância de lá. */
  private async wikiPages(search: string, signal: AbortSignal): Promise<any[]> {
    const params = new URLSearchParams({
      action: 'query',
      format: 'json',
      formatversion: '2',
      origin: '*',
      generator: 'search',
      gsrsearch: search,
      gsrlimit: '10',
      prop: 'pageimages|description',
      piprop: 'thumbnail',
      pithumbsize: '420',
      pilicense: 'any',
    });
    const data = await this.fetchJson(`${WIKI}?${params}`, signal);
    const pages: any[] = data?.query?.pages ?? [];
    return pages.sort((a, b) => (Number(a.index) || 99) - (Number(b.index) || 99));
  }

  /**
   * Livros: a Open Library, sem chave. `lang=pt` não distingue Brasil de Portugal: uma segunda
   * busca filtra os ISBNs brasileiros e substitui a edição genérica da mesma obra. O título e a
   * capa vêm juntos dessa edição; sem edição brasileira, a busca geral continua disponível.
   * As edições só vêm se o campo `key` também for pedido.
   * A capa vem do acervo deles pelo número; `default=false` faz a capa que não existe dar erro (e
   * virar "sem capa") em vez de um quadradinho em branco.
   */
  private async searchOpenLibrary(q: string, signal: AbortSignal): Promise<PickedGame[]> {
    // O prefixo acha "dom casmu"; a palavra inteira evita perder títulos por acento ou stemming.
    const words = q.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const last = words.length - 1;
    if (words[last].length >= 2) words[last] = `(${words[last]} OR ${words[last]}*)`;
    const query = words.join(' ');
    const search = (q: string) => {
      const params = new URLSearchParams({ q, limit: '12', lang: 'pt', fields: BOOK_SEARCH_FIELDS });
      return this.fetchJson(`https://openlibrary.org/search.json?${params}`, signal);
    };
    const [general, brazil] = await Promise.allSettled([search(query), search(`${query} ${BRAZILIAN_BOOK_FILTER}`)]);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (general.status === 'rejected' && brazil.status === 'rejected') throw general.reason;
    const docs = (result: PromiseSettledResult<any>): any[] =>
      result.status === 'fulfilled' && Array.isArray(result.value?.docs) ? result.value.docs : [];
    const found = new Map<string, { index: number; region: number; game: PickedGame }>();
    for (const [index, d] of [...docs(general), ...docs(brazil).filter((d) => bookEditionRank(d?.editions?.docs?.[0]) === 0)].entries()) {
      if (typeof d?.title !== 'string' || !d.title.trim()) continue;
      const ed = d.editions?.docs?.[0];
      const region = typeof ed?.title === 'string' && ed.title.trim() ? bookEditionRank(ed) : 2;
      const pt = region < 2;
      // Uma edição localizada sem capa não herda a imagem de outra tradução da obra.
      const cover = pt ? ed.cover_i : d.cover_i;
      const game: PickedGame = {
        name: (pt ? String(ed.title) : d.title).replace(/\s+/g, ' ').trim(),
        coverUrl: typeof cover === 'number' && cover > 0 ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg?default=false` : null,
        source: 'openlibrary',
        sourceId: String(d.key ?? '').replace(/^\/works\//, '') || undefined,
        year: typeof d.first_publish_year === 'number' ? String(d.first_publish_year) : undefined,
        by: Array.isArray(d.author_name) && typeof d.author_name[0] === 'string' ? d.author_name[0] : undefined,
      };
      const key = game.sourceId ?? `${fold(game.name)}:${fold(game.by ?? '')}`;
      const previous = found.get(key);
      if (!previous || region < previous.region || (region === previous.region && !previous.game.coverUrl && game.coverUrl)) {
        found.set(key, { index: previous?.index ?? index, region, game });
      }
    }
    const needle = fold(q);
    return [...found.values()]
      .sort((a, b) => {
        const starts = (x: { game: PickedGame }) => fold(x.game.name).startsWith(needle) ? 0 : 1;
        return starts(a) - starts(b) || a.region - b.region || Number(!a.game.coverUrl) - Number(!b.game.coverUrl) || a.index - b.index;
      })
      .slice(0, 8)
      .map((x) => x.game);
  }

  /**
   * Animes: o Kitsu, sem chave. Completa a palavra pela metade ("fri" já acha Frieren) e tem o nome
   * brasileiro de muitos animes ("Frieren e a Jornada para o Além"); sem ele, o nome em inglês.
   */
  private async searchKitsu(q: string, signal: AbortSignal): Promise<PickedGame[]> {
    const params = new URLSearchParams({
      'filter[text]': q,
      'page[limit]': '10',
      'fields[anime]': 'canonicalTitle,titles,startDate,posterImage,subtype',
    });
    const data = await this.fetchJson(`https://kitsu.io/api/edge/anime?${params}`, signal);
    const items: any[] = data?.data ?? [];
    const needle = fold(q);
    return items
      .map((a, index) => {
        const at = a?.attributes ?? {};
        const t = at.titles ?? {};
        const names = [t.pt_br, t.en, at.canonicalTitle, t.en_jp].filter((n): n is string => typeof n === 'string' && !!n.trim());
        const img = at.posterImage ?? {};
        const cover = img.large || img.medium || img.original;
        const game: PickedGame = {
          name: (names[0] ?? '').trim(),
          coverUrl: typeof cover === 'string' && /^https:\/\//.test(cover) ? cover : null,
          source: 'kitsu',
          sourceId: String(a?.id ?? '') || undefined,
          year: typeof at.startDate === 'string' ? at.startDate.slice(0, 4) || undefined : undefined,
        };
        // "fri" põe Frieren antes de One Week Friends: sobe quem começa com o que foi digitado, em qualquer nome
        const starts = names.some((n) => fold(n).startsWith(needle));
        return { index, game, rank: starts ? 0 : 1 };
      })
      .filter((x) => x.game.name)
      .sort((a, b) => a.rank - b.rank || a.index - b.index)
      .slice(0, 8)
      .map((x) => x.game);
  }

  /** A reserva dos animes: o AniList (sem chave), quando o Kitsu não responde. */
  private async searchAniList(q: string, signal: AbortSignal): Promise<PickedGame[]> {
    const query = `query ($s: String) {
      Page(perPage: 8) {
        media(search: $s, type: ANIME, isAdult: false, sort: SEARCH_MATCH) {
          id
          title { romaji english }
          startDate { year }
          coverImage { extraLarge large }
        }
      }
    }`;
    let res: Response;
    const deadline = withDeadline(signal);
    try {
      res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { s: q } }),
        signal: deadline,
      });
    } catch (e) {
      throw lookupFailure(e, signal);
    }
    if (!res.ok) throw new LookupError('O catálogo não respondeu.', 'server');
    let data: any;
    try {
      data = await res.json();
    } catch (e) {
      throw lookupFailure(e, signal);
    }
    const media: any[] = data?.data?.Page?.media ?? [];
    return media
      .map((m) => ({
        name: String(m?.title?.english || m?.title?.romaji || '').trim(),
        coverUrl: m?.coverImage?.extraLarge || m?.coverImage?.large || null,
        source: 'anilist' as const,
        sourceId: String(m?.id ?? '') || undefined,
        year: m?.startDate?.year ? String(m.startDate.year) : undefined,
      }))
      .filter((g) => g.name);
  }

  /**
   * Músicas: o iTunes, sem chave. Duas buscas juntas (misturadas numa só, os álbuns somem atrás das
   * músicas): os álbuns, e as músicas com os artistas. Quem tem o nome começando com o que foi
   * digitado vem primeiro; depois quem tem no nome; depois o que veio pelo nome do artista, os álbuns
   * antes das músicas. O artista de mesmo nome abre a lista: escolher ele mostra os álbuns dele
   * (ver `artistHitId`).
   */
  private async searchItunes(q: string, signal: AbortSignal): Promise<PickedGame[]> {
    const [albums, rest] = await Promise.allSettled([this.itunesResults(q, 'album', 8, signal), this.itunesResults(q, 'song,musicArtist', 10, signal)]);
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    if (albums.status === 'rejected' && rest.status === 'rejected') throw albums.reason;
    const rows = (r: PromiseSettledResult<any[]>) => (r.status === 'fulfilled' ? r.value : []);
    this.noteArtists([...rows(albums), ...rows(rest)]);
    const needle = fold(q);
    const rank = (name: string) => (fold(name).startsWith(needle) ? 0 : fold(name).includes(needle) ? 1 : 2);
    const artists: PickedGame[] = rows(rest)
      .filter((r) => r?.wrapperType === 'artist' && r.artistId && typeof r.artistName === 'string' && rank(r.artistName) < 2)
      .slice(0, 2)
      .map((r) => ({ name: r.artistName.trim(), coverUrl: null, source: 'itunes' as const, sourceId: `artist/${r.artistId}` }));
    const seen = new Set<string>();
    const items = [...rows(albums).map(itunesAlbum), ...rows(rest).filter((r) => r?.wrapperType === 'track').map(itunesSong)]
      .filter((g): g is PickedGame => g !== null)
      // a mesma obra em duas edições (a explícita e a limpa, a remasterizada): fica a primeira
      .filter((g) => {
        const key = `${g.form}:${fold(g.name)}:${fold(g.by ?? '')}`;
        if (seen.has(key)) return false;
        seen.add(key);
        return true;
      })
      .map((game, index) => ({ game, index, rank: rank(game.name) }))
      .sort((a, b) => a.rank - b.rank || (a.rank === 2 ? Number(a.game.form === 'faixa') - Number(b.game.form === 'faixa') : 0) || a.index - b.index)
      .slice(0, 10)
      .map((x) => x.game);
    return [...artists, ...items];
  }

  /** Os álbuns de um artista do catálogo (ver `artistHitId`), os mais novos primeiro. */
  async artistAlbums(artistId: string, signal: AbortSignal): Promise<PickedGame[]> {
    if (!/^\d+$/.test(artistId)) return [];
    const params = new URLSearchParams({ id: artistId, entity: 'album', limit: '60', ...ITUNES_STORE });
    const data = await this.fetchJson(`${ITUNES}/lookup?${params}`, signal);
    const seen = new Set<string>();
    const found: any[] = Array.isArray(data?.results) ? data.results : [];
    this.noteArtists(found);
    return found
      .filter((r) => r?.wrapperType === 'collection')
      .map(itunesAlbum)
      .filter((g): g is PickedGame => g !== null)
      .filter((g) => {
        if (seen.has(fold(g.name))) return false;
        seen.add(fold(g.name));
        return true;
      })
      .sort((a, b) => (b.year ?? '').localeCompare(a.year ?? ''));
  }

  /** As faixas de um álbum do catálogo (ver `catalogAlbumId`), na ordem do disco: só as que têm trecho para tocar. */
  async albumTracks(albumId: string, signal: AbortSignal): Promise<AlbumTrack[]> {
    if (!/^\d+$/.test(albumId)) return [];
    const params = new URLSearchParams({ id: albumId, entity: 'song', limit: '200', ...ITUNES_STORE });
    const data = await this.fetchJson(`${ITUNES}/lookup?${params}`, signal);
    return (Array.isArray(data?.results) ? (data.results as any[]) : [])
      .filter((r) => r?.wrapperType === 'track' && typeof r.trackName === 'string' && r.trackName.trim() && typeof r.previewUrl === 'string' && HTTPS.test(r.previewUrl))
      .sort((a, b) => (Number(a.discNumber) || 1) - (Number(b.discNumber) || 1) || (Number(a.trackNumber) || 0) - (Number(b.trackNumber) || 0))
      .map((r, i) => ({ n: i + 1, name: String(r.trackName).trim(), sample: r.previewUrl as string }));
  }

  /** Guarda de qual artista é cada álbum e cada música que a busca trouxe (o número do principal). */
  private noteArtists(rows: readonly any[]): void {
    for (const r of rows) {
      if (!r?.artistId) continue;
      if (r.wrapperType === 'collection' && r.collectionId) this.artistIds.set(`album/${r.collectionId}`, String(r.artistId));
      else if (r.wrapperType === 'track' && r.trackId) this.artistIds.set(`song/${r.trackId}`, String(r.artistId));
    }
  }

  /**
   * O artista principal de um item que a busca trouxe: "Daft Punk", numa música creditada a "Daft
   * Punk, Pharrell Williams & Nile Rodgers". É ele que vira a aba no mural. Null se a busca não
   * contou de quem é (um item de outra visita, um nome digitado à mão).
   */
  async primaryArtist(game: PickedGame, signal: AbortSignal): Promise<string | null> {
    const id = game.source === 'itunes' && game.sourceId ? this.artistIds.get(game.sourceId) : undefined;
    if (!id) return null;
    const data = await this.fetchJson(`${ITUNES}/lookup?${new URLSearchParams({ id, ...ITUNES_STORE })}`, signal);
    const hit = (Array.isArray(data?.results) ? (data.results as any[]) : []).find((r) => r?.wrapperType === 'artist' && typeof r.artistName === 'string');
    return hit?.artistName.trim() || null;
  }

  /**
   * Os trechos do catálogo que o vinil de um item pode tocar: as faixas do álbum, ou o trecho da
   * própria música. Vazio para o que não veio do catálogo (um nome digitado à mão).
   */
  async sampleChoices(game: PickedGame, signal: AbortSignal): Promise<AlbumTrack[]> {
    const album = catalogAlbumId(game);
    if (album) return this.albumTracks(album, signal);
    const song = game.source === 'itunes' ? game.sourceId?.match(/^song\/(\d+)$/)?.[1] : null;
    if (!song) return [];
    const params = new URLSearchParams({ id: song, ...ITUNES_STORE });
    const data = await this.fetchJson(`${ITUNES}/lookup?${params}`, signal);
    const hit = (Array.isArray(data?.results) ? (data.results as any[]) : []).find((r) => typeof r?.previewUrl === 'string' && HTTPS.test(r.previewUrl));
    return hit ? [{ n: 1, name: String(hit.trackName ?? game.name).trim(), sample: hit.previewUrl as string }] : [];
  }

  /** Uma busca no iTunes, crua: `entity` diz o que procurar (album, song, musicArtist). */
  private async itunesResults(q: string, entity: string, limit: number, signal: AbortSignal): Promise<any[]> {
    const params = new URLSearchParams({ term: q, media: 'music', entity, limit: String(limit), ...ITUNES_STORE });
    const data = await this.fetchJson(`${ITUNES}/search?${params}`, signal);
    return Array.isArray(data?.results) ? data.results : [];
  }

  /**
   * Filmes e séries: o TMDB, com a chave da pessoa ou a do site. Nome e pôster em português (`pt-BR`),
   * na ordem de relevância de lá.
   */
  private async searchTmdb(q: string, via: Via, type: 'movie' | 'tv', signal: AbortSignal): Promise<PickedGame[]> {
    const params = new URLSearchParams({ query: q, language: 'pt-BR', include_adult: 'false', page: '1' });
    const data = await this.tmdbJson(`search/${type}`, params, via, signal);
    const results: any[] = data?.results ?? [];
    return results
      .map((r) => {
        const name = String((type === 'movie' ? r?.title || r?.original_title : r?.name || r?.original_name) ?? '').trim();
        const date = String((type === 'movie' ? r?.release_date : r?.first_air_date) ?? '');
        return {
          name,
          coverUrl: typeof r?.poster_path === 'string' ? `https://image.tmdb.org/t/p/w500${r.poster_path}` : null,
          source: 'tmdb' as const,
          sourceId: r?.id ? `${type}/${r.id}` : undefined,
          year: /^\d{4}/.test(date) ? date.slice(0, 4) : undefined,
        };
      })
      .filter((g) => g.name)
      .slice(0, 8);
  }

  /**
   * Uma chamada ao TMDB. Com a chave da pessoa, direto: a "API key" vai na URL, o "token de leitura"
   * no cabeçalho. Com a do site, pela nuvem, que põe a chave.
   */
  private async tmdbJson(path: string, params: URLSearchParams, via: Via, signal: AbortSignal): Promise<any> {
    if ('site' in via) return this.fetchJson(`${via.site}/${path}?${params}`, signal, 'tmdb');
    const key = via.own;
    const token = key.startsWith('eyJ');
    if (!token) params.set('api_key', key);
    let res: Response;
    const deadline = withDeadline(signal);
    try {
      res = await fetch(`https://api.themoviedb.org/3/${path}?${params}`, {
        headers: token ? { Authorization: `Bearer ${key}`, Accept: 'application/json' } : { Accept: 'application/json' },
        signal: deadline,
      });
    } catch (e) {
      throw lookupFailure(e, signal);
    }
    if (res.status === 401) throw new LookupError('A chave do TMDB foi recusada. Confira em Ajustes.', 'tmdb-key');
    if (!res.ok) throw new LookupError('O catálogo não respondeu.', 'server');
    try {
      return await res.json();
    } catch (e) {
      throw lookupFailure(e, signal);
    }
  }

  /** Uma chamada à RAWG: com a chave da pessoa, direto; com a do site, pela nuvem. */
  private rawgJson(via: Via, path: string, params: URLSearchParams, signal: AbortSignal): Promise<any> {
    if ('site' in via) return this.fetchJson(`${via.site}/${path}?${params}`, signal, 'rawg');
    params.set('key', via.own);
    return this.fetchJson(`https://api.rawg.io/api/${path}?${params}`, signal, 'rawg-own');
  }

  /** A busca da RAWG como ela vem (com as telas e as lojas), e o que ela diz de quem está na Steam. */
  private async rawgResults(q: string, via: Via, signal: AbortSignal): Promise<any[]> {
    const params = new URLSearchParams({ search: q, page_size: '8', search_precise: 'true' });
    const data = await this.rawgJson(via, 'games', params, signal);
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    for (const g of results) {
      if (g?.id && Array.isArray(g.stores)) this.onSteam.set(String(g.id), g.stores.some((s: any) => s?.store?.slug === 'steam'));
    }
    return results;
  }

  private async searchRawg(q: string, via: Via, signal: AbortSignal): Promise<PickedGame[]> {
    const results = await this.rawgResults(q, via, signal);
    return results
      .filter((g) => g?.name)
      .map((g) => ({
        name: String(g.name),
        coverUrl:
          typeof g.background_image === 'string' ? rawgResize(g.background_image) : null,
        source: 'rawg' as const,
        sourceId: String(g.id ?? ''),
        year: typeof g.released === 'string' ? g.released.slice(0, 4) : undefined,
      }));
  }

  /**
   * Um GET que devolve JSON. `catalog`: a RAWG com a chave da pessoa ('rawg-own': chave recusada vira
   * aviso para conferir em Ajustes), ou a busca do site ('rawg', 'tmdb': a chave do site que parou de
   * servir sai até recarregar, e quem chamou volta para a Wikipedia).
   */
  private async fetchJson(url: string, signal: AbortSignal, catalog?: 'rawg-own' | SiteCatalog): Promise<any> {
    let res: Response;
    const deadline = withDeadline(signal);
    try {
      res = await fetch(url, { signal: deadline });
    } catch (e) {
      throw lookupFailure(e, signal);
    }
    if (catalog === 'rawg-own' && (res.status === 401 || res.status === 403)) {
      throw new LookupError('A chave da RAWG foi recusada. Confira em Ajustes.', 'rawg-key');
    }
    if ((catalog === 'rawg' || catalog === 'tmdb') && (res.status === 503 || res.status === 403)) {
      this.siteKeys.drop(catalog);
      throw new LookupError('A busca do site não está respondendo agora.', 'site-key');
    }
    if (!res.ok) throw new LookupError('O catálogo não respondeu.', 'server');
    try {
      return await res.json();
    } catch (e) {
      throw lookupFailure(e, signal);
    }
  }
}
