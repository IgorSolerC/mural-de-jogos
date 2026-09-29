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

/** Nem todo jogo da Steam tem a arte vertical: confere se a imagem existe antes de usar. */
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

/** O mesmo título, sem ligar para acento, maiúscula nem pontuação ("Hades II" = "hades ii"). */
export function sameTitle(a: string, b: string): boolean {
  const k = (s: string) => fold(s).replace(/[^\p{L}\p{N}]+/gu, '');
  const ka = k(a);
  const kb = k(b);
  // sem letra nem número (só emoji ou pontuação), compara o nome como foi escrito
  if (!ka || !kb) return a.trim() === b.trim() && !!a.trim();
  return ka === kb;
}

/** Tira "(video game)", "(2010 film)", "(TV series)", "(anime)" etc. do título da Wikipedia. */
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

  /**
   * As capas que dá para escolher para um item já achado (a seleção de capa da wishlist): a dele
   * primeiro, depois as do mesmo título em outro lugar. Jogos: Wikipedia, RAWG e a arte da Steam.
   * Filmes e séries no TMDB: os outros pôsteres do título, os em português primeiro. Livros: as capas
   * das edições, as em português primeiro. Animes: o Kitsu e o AniList. Uma fonte que falha só não
   * entra; a lista nunca vem vazia se o item tem capa.
   */
  async coverChoices(game: PickedGame, kind: Kind, signal: AbortSignal): Promise<CoverChoices> {
    const tasks: { from: string; run: Promise<CoverChoice[]> }[] = [];
    const add = (from: string, run: Promise<CoverChoice[]>) => tasks.push({ from, run });
    const same = (h: PickedGame) => sameTitle(h.name, game.name) && (!game.year || !h.year || h.year === game.year);
    const alike = (hits: PickedGame[]) =>
      hits.filter(same).map((h) => ({ ...game, coverUrl: h.coverUrl, source: h.source, sourceId: h.sourceId, from: coverFrom(h) }));
    switch (kind) {
      case 'jogos': {
        add('Wikipedia', this.wikiCovers(game, signal, 'en', WIKI_TEMPLATE.jogos));
        add('Wikipedia', this.wikiCovers(game, signal, 'pt', 'Info/Jogo eletrônico'));
        const key = this.settings.rawgKey().trim();
        if (key) add('RAWG', this.rawgChoices(game, key, signal));
        break;
      }
      case 'filmes':
      case 'series': {
        const key = this.settings.tmdbKey().trim();
        if (key && game.source === 'tmdb' && game.sourceId) add('TMDB', this.tmdbPosters(game, key, signal).then((l) => l.map((g) => ({ ...g, from: 'TMDB' }))));
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
    }
    const settled = await Promise.allSettled(tasks.map((t) => t.run));
    if (signal.aborted) throw new DOMException('Aborted', 'AbortError');
    const seen = new Set<string>();
    const out: CoverChoice[] = [];
    for (const g of [{ ...game, from: coverFrom(game) }, ...settled.flatMap((r) => (r.status === 'fulfilled' ? r.value : []))]) {
      if (!g.coverUrl || seen.has(g.coverUrl)) continue;
      seen.add(g.coverUrl);
      out.push(g);
    }
    // quem falhou não some calado: a chave recusada diz o que fazer, o resto diz quem não respondeu
    const notes = new Set<string>();
    settled.forEach((r, i) => {
      if (r.status === 'fulfilled' || (r.reason as Error)?.name === 'AbortError') return;
      notes.add(r.reason instanceof LookupError && r.reason.kind === 'rawg-key' ? r.reason.message : `${tasks[i].from} não respondeu agora.`);
    });
    return { choices: out.slice(0, 16), notes: [...notes] };
  }

  /**
   * As capas das páginas de mesmo título na Wikipedia (inglês ou português), pelo título exato: a
   * busca do auto-complete, com o curinga na última palavra, põe Warhammer na frente de God of War.
   * Com `template`, só páginas daquela caixa de informações (nos jogos, "Hades" não traz o deus).
   * O ano, quando os dois lados têm, precisa bater: God of War de 2018 não é o de 2005.
   */
  private async wikiCovers(game: PickedGame, signal: AbortSignal, lang: 'en' | 'pt', template: string | null): Promise<CoverChoice[]> {
    const name = game.name.replace(/["\\]/g, ' ').replace(/\s+/g, ' ').trim();
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
        return !game.year || !y || y === game.year;
      })
      .sort((a, b) => (Number(a.index) || 99) - (Number(b.index) || 99))
      .map((p) => ({ ...game, coverUrl: p.thumbnail.source as string, from: 'Wikipedia' }));
  }

  /**
   * Tudo o que a RAWG tem do mesmo jogo: a capa vertical da Steam (quando está lá), a arte de fundo,
   * a arte extra e algumas telas. O jogo certo é o de mesmo nome mais perto no ano (a RAWG e a
   * Wikipedia às vezes discordam, por causa do acesso antecipado: Hades é 2018 numa e 2020 na outra).
   */
  private async rawgChoices(game: PickedGame, key: string, signal: AbortSignal): Promise<CoverChoice[]> {
    const raw = await this.rawgResults(game.name, key, signal);
    const year = (g: any) => (typeof g?.released === 'string' ? g.released.slice(0, 4) : undefined);
    const own = (g: any) => game.source === 'rawg' && String(g.id) === game.sourceId;
    // quantos anos longe do item (sem ano de um lado, meio ano: nem perto nem longe)
    const dist = (g: any) => (own(g) ? -1 : !game.year || !year(g) ? 0.5 : Math.abs(Number(year(g)) - Number(game.year)));
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
        const detail = await this.fetchJson(`https://api.rawg.io/api/games/${encodeURIComponent(id)}?${new URLSearchParams({ key })}`, signal, true);
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
  private async tmdbPosters(game: PickedGame, key: string, signal: AbortSignal): Promise<PickedGame[]> {
    const params = new URLSearchParams({ include_image_language: 'pt,en,null' });
    const data = await this.tmdbJson(`${game.sourceId}/images`, params, key, signal);
    const order: Record<string, number> = { pt: 0, en: 1 };
    const posters: any[] = Array.isArray(data?.posters) ? data.posters : [];
    return posters
      .filter((p) => typeof p?.file_path === 'string')
      .sort((a, b) => (order[a.iso_639_1] ?? 2) - (order[b.iso_639_1] ?? 2) || (b.vote_average ?? 0) - (a.vote_average ?? 0))
      .slice(0, 11)
      .map((p) => ({ ...game, coverUrl: `https://image.tmdb.org/t/p/w500${p.file_path}` }));
  }

  /** As capas das edições da obra na Open Library, as em português primeiro. */
  private async editionCovers(game: PickedGame, signal: AbortSignal): Promise<PickedGame[]> {
    const data = await this.fetchJson(
      `https://openlibrary.org/works/${encodeURIComponent(game.sourceId ?? '')}/editions.json?limit=60`,
      signal,
    );
    const entries: any[] = Array.isArray(data?.entries) ? data.entries : [];
    const pt = (e: any) => (Array.isArray(e?.languages) && e.languages.some((l: any) => l?.key === '/languages/por') ? 0 : 1);
    return entries
      .filter((e) => Array.isArray(e?.covers) && typeof e.covers[0] === 'number' && e.covers[0] > 0)
      .sort((a, b) => pt(a) - pt(b))
      .slice(0, 11)
      .map((e) => ({ ...game, coverUrl: `https://covers.openlibrary.org/b/id/${e.covers[0]}-L.jpg?default=false` }));
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
   * Filmes e séries: o TMDB, com a chave da pessoa. Nome e pôster em português (`pt-BR`), na ordem
   * de relevância de lá. Aceita a "API key" (vai na URL) ou o "token de leitura" (vai no cabeçalho).
   */
  private async searchTmdb(q: string, key: string, type: 'movie' | 'tv', signal: AbortSignal): Promise<PickedGame[]> {
    const params = new URLSearchParams({ query: q, language: 'pt-BR', include_adult: 'false', page: '1' });
    const data = await this.tmdbJson(`search/${type}`, params, key, signal);
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

  /** Uma chamada ao TMDB. Aceita a "API key" (vai na URL) ou o "token de leitura" (vai no cabeçalho). */
  private async tmdbJson(path: string, params: URLSearchParams, key: string, signal: AbortSignal): Promise<any> {
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

  /** A busca da RAWG como ela vem (com as telas e as lojas), e o que ela diz de quem está na Steam. */
  private async rawgResults(q: string, key: string, signal: AbortSignal): Promise<any[]> {
    const params = new URLSearchParams({ key, search: q, page_size: '8', search_precise: 'true' });
    const data = await this.fetchJson(`https://api.rawg.io/api/games?${params}`, signal, true);
    const results: any[] = Array.isArray(data?.results) ? data.results : [];
    for (const g of results) {
      if (g?.id && Array.isArray(g.stores)) this.onSteam.set(String(g.id), g.stores.some((s: any) => s?.store?.slug === 'steam'));
    }
    return results;
  }

  private async searchRawg(q: string, key: string, signal: AbortSignal): Promise<PickedGame[]> {
    const results = await this.rawgResults(q, key, signal);
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

  private async fetchJson(url: string, signal: AbortSignal, rawg = false): Promise<any> {
    let res: Response;
    const deadline = withDeadline(signal);
    try {
      res = await fetch(url, { signal: deadline });
    } catch (e) {
      throw lookupFailure(e, signal);
    }
    if (rawg && (res.status === 401 || res.status === 403)) {
      throw new LookupError('A chave da RAWG foi recusada. Confira em Ajustes.', 'rawg-key');
    }
    if (!res.ok) throw new LookupError('O catálogo não respondeu.', 'server');
    try {
      return await res.json();
    } catch (e) {
      throw lookupFailure(e, signal);
    }
  }
}
