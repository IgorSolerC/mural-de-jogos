import { Injectable, inject } from '@angular/core';
import { Kind, PickedGame, fold } from './review';
import { CoverSource, Settings } from './settings';

export class LookupError extends Error {
  constructor(
    message: string,
    readonly kind: 'offline' | 'rawg-key' | 'tmdb-key' | 'server',
  ) {
    super(message);
  }
}

const WIKI = 'https://en.wikipedia.org/w/api.php';

/** Onde cada mural procura na Wikipedia (sem chave): páginas com a caixa de informações daquele tipo. */
const WIKI_TEMPLATE: Record<Exclude<Kind, 'livros'>, string> = {
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

/** Nem todo jogo da Steam tem a arte vertical: confere se a imagem existe antes de usar. */
function imageLoads(url: string, signal: AbortSignal, timeoutMs = 8000): Promise<boolean> {
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
  /** O que a busca da RAWG já contou: o jogo está na Steam? (id da RAWG → sim/não) */
  private readonly onSteam = new Map<string, boolean>();

  /** O nome do catálogo onde o mural procura, para o leitor de tela. */
  sourceName(kind: Kind): string {
    switch (kind) {
      case 'livros':
        return 'Open Library';
      case 'animes':
        return 'Kitsu';
      case 'filmes':
      case 'series':
        return this.settings.hasTmdb() ? 'TMDB' : 'Wikipedia';
      default:
        return this.settings.effectiveSource() === 'rawg' ? 'RAWG' : 'Wikipedia';
    }
  }

  /**
   * Procura no catálogo do mural. Livros: Open Library, na edição em português. Animes: Kitsu (com o
   * nome em português quando há), e o AniList se o Kitsu não responder. Filmes e séries: o TMDB, em
   * português, quando há chave; senão a Wikipedia. Jogos: Wikipedia ou RAWG.
   */
  async search(
    q: string,
    signal: AbortSignal,
    kind: Kind,
    source: CoverSource = this.settings.effectiveSource(),
  ): Promise<PickedGame[]> {
    const query = q.trim();
    if (query.length < 2) return [];
    if (typeof navigator !== 'undefined' && navigator.onLine === false) {
      throw new LookupError('Sem internet agora.', 'offline');
    }
    switch (kind) {
      case 'livros':
        return this.searchOpenLibrary(query, signal);
      case 'animes':
        try {
          return await this.searchKitsu(query, signal);
        } catch (e) {
          if ((e as Error).name === 'AbortError') throw e;
          return this.searchAniList(query, signal);
        }
      case 'filmes':
      case 'series': {
        const tmdb = this.settings.tmdbKey().trim();
        if (tmdb) return this.searchTmdb(query, tmdb, kind === 'filmes' ? 'movie' : 'tv', signal);
        return this.searchWikipedia(query, signal, WIKI_TEMPLATE[kind]);
      }
      default: {
        const key = this.settings.rawgKey().trim();
        if (source === 'rawg' && key) return this.searchRawg(query, key, signal);
        return this.searchWikipedia(query, signal, WIKI_TEMPLATE.jogos);
      }
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
    const key = this.settings.rawgKey().trim();
    if (game.source !== 'rawg' || !game.sourceId || !key || isSteamCover(game.coverUrl)) return game;
    if (this.onSteam.get(game.sourceId) === false) return game;
    try {
      const params = new URLSearchParams({ key });
      const data = await this.fetchJson(
        `https://api.rawg.io/api/games/${encodeURIComponent(game.sourceId)}/stores?${params}`,
        signal,
        true,
      );
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

  private async searchWikipedia(q: string, signal: AbortSignal, template: string): Promise<PickedGame[]> {
    const search = wikiQuery(q, template);
    if (!search) return [];
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
    const needle = fold(q);
    return pages
      .map((p) => ({
        index: Number(p.index) || 99,
        game: {
          name: cleanWikiTitle(String(p.title ?? '')),
          coverUrl: typeof p.thumbnail?.source === 'string' ? p.thumbnail.source : null,
          source: 'wikipedia' as const,
          sourceId: String(p.pageid ?? ''),
          year: String(p.description ?? '').match(/\b(19|20)\d{2}\b/)?.[0],
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

  /**
   * Livros: a Open Library, sem chave. Com `lang=pt`, cada obra vem com a edição em português que
   * mais combina com a busca ("O Hobbit", não "The Hobbit"), com a capa dela; sem edição em
   * português, fica o título da obra. As edições só vêm se o campo `key` também for pedido.
   * A capa vem do acervo deles pelo número; `default=false` faz a capa que não existe dar erro (e
   * virar "sem capa") em vez de um quadradinho em branco.
   */
  private async searchOpenLibrary(q: string, signal: AbortSignal): Promise<PickedGame[]> {
    // a Open Library só acha palavra inteira: "dom casmu" vira "dom casmu*", como na Wikipedia
    const words = q.replace(/[^\p{L}\p{N}\s'-]/gu, ' ').split(/\s+/).filter(Boolean);
    if (!words.length) return [];
    const last = words.length - 1;
    if (words[last].length >= 2) words[last] += '*';
    const params = new URLSearchParams({
      q: words.join(' '),
      limit: '12',
      lang: 'pt',
      fields: 'key,title,author_name,first_publish_year,cover_i,editions,editions.key,editions.title,editions.language,editions.cover_i',
    });
    const data = await this.fetchJson(`https://openlibrary.org/search.json?${params}`, signal);
    const docs: any[] = data?.docs ?? [];
    const needle = fold(q);
    return docs
      .filter((d) => typeof d?.title === 'string' && d.title.trim())
      .map((d, index) => {
        const ed = d.editions?.docs?.[0];
        const pt = ed && Array.isArray(ed.language) && ed.language.includes('por') && typeof ed.title === 'string' && ed.title.trim();
        const cover = pt && typeof ed.cover_i === 'number' ? ed.cover_i : d.cover_i;
        const game: PickedGame = {
          name: (pt ? String(ed.title) : String(d.title)).replace(/\s+/g, ' ').trim(),
          coverUrl: typeof cover === 'number' ? `https://covers.openlibrary.org/b/id/${cover}-L.jpg?default=false` : null,
          source: 'openlibrary',
          sourceId: String(d.key ?? '').replace(/^\/works\//, '') || undefined,
          year: typeof d.first_publish_year === 'number' ? String(d.first_publish_year) : undefined,
          by: Array.isArray(d.author_name) && typeof d.author_name[0] === 'string' ? d.author_name[0] : undefined,
        };
        return { index, game };
      })
      .sort((a, b) => {
        // começando com o que foi digitado e com capa vem primeiro; depois a relevância de lá
        const rank = (x: { game: PickedGame }) => (fold(x.game.name).startsWith(needle) ? 0 : 2) + (x.game.coverUrl ? 0 : 1);
        return rank(a) - rank(b) || a.index - b.index;
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
    try {
      res = await fetch('https://graphql.anilist.co', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ query, variables: { s: q } }),
        signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new LookupError('Não consegui falar com o catálogo.', 'offline');
    }
    if (!res.ok) throw new LookupError('O catálogo não respondeu.', 'server');
    const data = await res.json();
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
   * Filmes e séries: o TMDB, com a chave da pessoa. Nome e pôster em português (`pt-BR`), na ordem
   * de relevância de lá. Aceita a "API key" (vai na URL) ou o "token de leitura" (vai no cabeçalho).
   */
  private async searchTmdb(q: string, key: string, type: 'movie' | 'tv', signal: AbortSignal): Promise<PickedGame[]> {
    const token = key.startsWith('eyJ');
    const params = new URLSearchParams({ query: q, language: 'pt-BR', include_adult: 'false', page: '1' });
    if (!token) params.set('api_key', key);
    let res: Response;
    try {
      res = await fetch(`https://api.themoviedb.org/3/search/${type}?${params}`, {
        headers: token ? { Authorization: `Bearer ${key}`, Accept: 'application/json' } : { Accept: 'application/json' },
        signal,
      });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new LookupError('Não consegui falar com o catálogo.', 'offline');
    }
    if (res.status === 401) throw new LookupError('A chave do TMDB foi recusada. Confira em Ajustes.', 'tmdb-key');
    if (!res.ok) throw new LookupError('O catálogo não respondeu.', 'server');
    const data = await res.json();
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

  private async searchRawg(q: string, key: string, signal: AbortSignal): Promise<PickedGame[]> {
    const params = new URLSearchParams({ key, search: q, page_size: '8', search_precise: 'true' });
    const data = await this.fetchJson(`https://api.rawg.io/api/games?${params}`, signal, true);
    const results: any[] = data?.results ?? [];
    for (const g of results) {
      if (g?.id && Array.isArray(g.stores)) this.onSteam.set(String(g.id), g.stores.some((s: any) => s?.store?.slug === 'steam'));
    }
    return results
      .filter((g) => g?.name)
      .map((g) => ({
        name: String(g.name),
        coverUrl:
          typeof g.background_image === 'string'
            ? g.background_image.replace('/media/games/', '/media/resize/640/-/games/')
            : null,
        source: 'rawg' as const,
        sourceId: String(g.id ?? ''),
        year: typeof g.released === 'string' ? g.released.slice(0, 4) : undefined,
      }));
  }

  private async fetchJson(url: string, signal: AbortSignal, rawg = false): Promise<any> {
    let res: Response;
    try {
      res = await fetch(url, { signal });
    } catch (e) {
      if ((e as Error).name === 'AbortError') throw e;
      throw new LookupError('Não consegui falar com o catálogo.', 'offline');
    }
    if (rawg && (res.status === 401 || res.status === 403)) {
      throw new LookupError('A chave da RAWG foi recusada. Confira em Ajustes.', 'rawg-key');
    }
    if (!res.ok) throw new LookupError('O catálogo não respondeu.', 'server');
    return res.json();
  }
}
